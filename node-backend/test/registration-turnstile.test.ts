import './helpers/securitySetup.js';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { register, complete } = vi.hoisted(() => ({ register: vi.fn(), complete: vi.fn() }));
vi.mock('../src/services/registration.js', () => ({
  requestRegistration: register, completeRegistration: complete, REGISTRATION_RESEND_SECONDS: 60,
}));
import { app } from '../src/app.js';
import { env } from '../src/utils/env.js';
import { verifyTurnstile } from '../src/services/turnstileVerification.js';

const original = { TURNSTILE_ENABLED: env.TURNSTILE_ENABLED, TURNSTILE_SITE_KEY: env.TURNSTILE_SITE_KEY,
  TURNSTILE_SECRET_KEY: env.TURNSTILE_SECRET_KEY, TURNSTILE_ALLOWED_HOSTNAMES: env.TURNSTILE_ALLOWED_HOSTNAMES };
const cfFetch = vi.fn();
const issued = () => ({ success: true, hostname: 'app.example.com', action: 'register', challenge_ts: new Date().toISOString() });
const answer = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const validBody = { email: 'new@example.com', turnstileToken: 'valid-fresh-cf-token' };

beforeEach(() => {
  Object.assign(env, { TURNSTILE_ENABLED: true, TURNSTILE_SITE_KEY: 'public-sitekey', TURNSTILE_SECRET_KEY: 'private-cloudflare-secret', TURNSTILE_ALLOWED_HOSTNAMES: ['app.example.com'] });
  register.mockReset().mockResolvedValue(undefined);
  complete.mockReset().mockResolvedValue({ id: 'created', email: 'new@example.com', role: 'user' });
  cfFetch.mockReset().mockResolvedValue(answer(issued()));
  vi.stubGlobal('fetch', cfFetch);
});
afterEach(() => { Object.assign(env, original); vi.unstubAllGlobals(); });

describe('server-side Turnstile gate', () => {
  it('returns only the public widget config with no-store', async () => {
    const result = await request(app).get('/api/auth/turnstile');
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ enabled: true, siteKey: 'public-sitekey' });
    expect(JSON.stringify(result.body)).not.toContain(env.TURNSTILE_SECRET_KEY!);
    expect(result.headers['cache-control']).toBe('no-store');
  });
  it.each([undefined, '', {}, [], 'x'.repeat(2049)])('rejects invalid token before contacting Cloudflare: %j', async (turnstileToken) => {
    const result = await request(app).post('/api/auth/register').send({ ...validBody, turnstileToken });
    expect(result.status).toBe(400);
    expect(result.body.code).toBe('TURNSTILE_REJECTED');
    expect(cfFetch).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });
  it('validates token on server before consuming email quota or sending mail', async () => {
    const result = await request(app).post('/api/auth/register').send(validBody);
    expect(result.status).toBe(202);
    expect(register).toHaveBeenCalledWith('new@example.com');
    expect(cfFetch).toHaveBeenCalledWith('https://challenges.cloudflare.com/turnstile/v0/siteverify', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ secret: 'private-cloudflare-secret', response: validBody.turnstileToken }), signal: expect.any(AbortSignal),
    }));
  });
  it('does not trust user-supplied action/hostname/success claims', async () => {
    cfFetch.mockResolvedValue(answer({ ...issued(), hostname: 'attacker.example' }));
    const result = await request(app).post('/api/auth/register').send({ ...validBody, success: true, hostname: 'app.example.com', action: 'register' });
    expect(result.status).toBe(400);
    expect(register).not.toHaveBeenCalled();
  });
  it.each([
    { success: false, 'error-codes': ['timeout-or-duplicate'] },
    { success: 'true' }, { hostname: 'other.example.com' }, { action: 'login' },
    { challenge_ts: new Date(Date.now() - 310000).toISOString() },
    { challenge_ts: new Date(Date.now() + 60000).toISOString() }, { challenge_ts: 'invalid' },
  ])('rejects failed/mismatched/expired Siteverify response: %j', async (data) => {
    cfFetch.mockResolvedValue(answer({ ...issued(), ...data }));
    const result = await request(app).post('/api/auth/register').send(validBody);
    expect(result.status).toBe(400);
    expect(register).not.toHaveBeenCalled();
  });
  it('rechecks every submission and rejects replay without caching success', async () => {
    cfFetch.mockResolvedValueOnce(answer(issued())).mockResolvedValueOnce(answer({ success: false, 'error-codes': ['timeout-or-duplicate'] }));
    expect((await request(app).post('/api/auth/register').send(validBody)).status).toBe(202);
    expect((await request(app).post('/api/auth/register').send(validBody)).status).toBe(400);
    expect(cfFetch).toHaveBeenCalledTimes(2);
    expect(register).toHaveBeenCalledTimes(1);
  });
  it.each(['network', 'json', 'http', 'null'])('fails closed on %s outages', async (kind) => {
    if (kind === 'network') cfFetch.mockRejectedValue(new Error('do-not-leak-private-error'));
    if (kind === 'json') cfFetch.mockResolvedValue({ ok: true, json: async () => { throw new Error('private-json-error'); } });
    if (kind === 'http') cfFetch.mockResolvedValue(answer({ ...issued() }, 503));
    if (kind === 'null') cfFetch.mockResolvedValue(answer(null));
    const result = await request(app).post('/api/auth/register').send(validBody);
    expect(result.status).toBe(503);
    expect(result.body.code).toBe('TURNSTILE_UNAVAILABLE');
    expect(JSON.stringify(result.body)).not.toMatch(/private|secret/);
    expect(register).not.toHaveBeenCalled();
  });
  it.each(['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY'] as const)('fails closed if %s is missing', async (key) => {
    env[key] = undefined;
    expect((await request(app).get('/api/auth/turnstile')).status).toBe(503);
    expect((await request(app).post('/api/auth/register').send(validBody)).status).toBe(503);
    expect(register).not.toHaveBeenCalled();
  });
  it('requires an independent verify_email challenge before account creation', async () => {
    const body = { token: 'a'.repeat(64), password: 'OwnerPassword123', turnstileToken: 'verify-token' };
    expect((await request(app).post('/api/auth/verify-email').send(body)).status).toBe(400); // register action
    expect(complete).not.toHaveBeenCalled();
    cfFetch.mockResolvedValue(answer({ ...issued(), action: 'verify_email' }));
    expect((await request(app).post('/api/auth/verify-email').send(body)).status).toBe(201);
    expect(complete).toHaveBeenCalledTimes(1);
  });
  it('does not allow public API flags to disable verification', async () => {
    cfFetch.mockResolvedValue(answer({ success: false }));
    const result = await request(app).post('/api/auth/register').send({ ...validBody, turnstileEnabled: false, skipCaptcha: true });
    expect(result.status).toBe(400);
    expect(register).not.toHaveBeenCalled();
  });
  it('only allows official dummy responses in a non-production test environment', async () => {
    env.TURNSTILE_SECRET_KEY = '1x0000000000000000000000000000000AA';
    cfFetch.mockResolvedValue(answer({ success: true, hostname: 'localhost', action: 'test', challenge_ts: '2022-02-28T15:14:30.096Z' }));
    await expect(verifyTurnstile('XXXX.DUMMY.TOKEN.XXXX', 'register')).resolves.toBeUndefined();
    env.TURNSTILE_SECRET_KEY = 'real-secret';
    await expect(verifyTurnstile('XXXX.DUMMY.TOKEN.XXXX', 'register')).rejects.toMatchObject({ code: 'TURNSTILE_REJECTED' });
  });
});