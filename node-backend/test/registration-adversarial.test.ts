import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock('resend', () => ({ Resend: class { emails = { send: sendEmail }; } }));
// Always isolated, even when run through the default vitest config.
import './helpers/securitySetup.js';
import { app } from '../src/app.js';
import { db } from '../src/services/db.js';
import { pendingRegistrations, registrationMailQuotas, users } from '../src/db/schema.js';
import { registrationMailboxKey } from '../src/services/registration.js';
import logger from '../src/utils/logger.js';
import { env } from '../src/utils/env.js';

const password = 'OwnerOnlyPassword123';
const register = (email: string) => request(app).post('/api/auth/register').send({ email });
const verify = (token: string) => request(app).post('/api/auth/verify-email').send({ token, password });
const tokenFrom = (index = -1) => {
  const link = (sendEmail.mock.calls.at(index)![0].html as string).match(/href="([^"]+)"/)![1];
  return new URLSearchParams(new URL(link).hash.slice(1)).get('token')!;
};
const ageRequest = async (email: string) => db.update(pendingRegistrations)
  .set({ requestedAt: new Date(Date.now() - 61000) }).where(eq(pendingRegistrations.email, email));

beforeEach(async () => {
  vi.clearAllMocks();
  sendEmail.mockReset().mockResolvedValue({ data: { id: 'mock-mail' }, error: null });
  // Only in-memory PostgreSQL is reachable from this file.
  await db.execute(sql`TRUNCATE "User", "PendingRegistration", "RegistrationMailQuota", "AuditLog" CASCADE`);
});
afterEach(() => { vi.restoreAllMocks(); delete process.env.RATE_LIMIT_DISABLED; });

describe('registration adversarial regressions', () => {
  it('keeps the original link usable after an attacker requests a resend', async () => {
    const email = 'resend-victim@example.com';
    expect((await register(email)).status).toBe(202);
    const original = tokenFrom();
    await ageRequest(email);
    expect((await register(email)).status).toBe(202);
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect((await verify(original)).status).toBe(201);
  });

  it('does not destroy a delivered link when a later resend fails', async () => {
    const email = 'resend-failure@example.com';
    await register(email);
    const original = tokenFrom();
    await ageRequest(email);
    sendEmail.mockResolvedValueOnce({ data: null, error: { message: 'provider temporarily down' } });
    expect((await register(email)).status).toBe(503);
    expect((await verify(original)).status).toBe(201);
  });

  it('caps daily mail sends per recipient independently of the IP cooldown', async () => {
    const email = 'flood-victim@example.com';
    for (let i = 0; i < 8; i++) {
      await register(email);
      await ageRequest(email);
    }
    expect(sendEmail.mock.calls.length).toBeLessThanOrEqual(5);
  });

  it('fails closed on public initial setup without an explicit bootstrap secret', async () => {
    const response = await request(app).post('/api/auth/setup').send({ email: 'setup-attacker@example.com', password });
    expect(response.status).toBe(403);
    expect(await db.query.users.findMany()).toHaveLength(0);
  });

  it('never logs raw passwords from malformed JSON', async () => {
    const marker = `password-marker-${randomUUID()}`;
    const response = await request(app).post('/api/auth/register').set('Content-Type', 'application/json')
      .send(`{"password":"${marker}",`);
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain(marker);
    expect(response.status).toBe(400);
  });

  it('returns a safe 400 for malformed login data without logging raw input', async () => {
    const marker = `secret-marker-${randomUUID()}`;
    const response = await request(app).post('/api/auth/login').send({ email: `${marker}<invalid-email>`, password: marker });
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain(marker);
    expect(response.status).toBe(400);
  });

  it('returns 413 for oversized signup payloads without logging their contents', async () => {
    const response = await request(app).post('/api/auth/register').send({ email: 'large@example.com', padding: 'x'.repeat(1_050_000) });
    expect(response.status).toBe(413);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('ignores forged Host/Origin/forwarded host/redirect fields in verification links', async () => {
    const response = await request(app).post('/api/auth/register')
      .set('Host', 'attacker.example').set('Origin', 'https://attacker.example')
      .set('X-Forwarded-Host', 'attacker.example').set('X-Forwarded-Proto', 'http')
      .send({ email: 'host-injection@example.com', appUrl: 'https://attacker.example', redirect: 'https://attacker.example', from: 'attacker@example.com' });
    expect(response.status).toBe(202);
    const payload = sendEmail.mock.calls[0][0];
    expect(payload.html).toContain('https://app.example.com/verify-email#token=');
    expect(payload.html).not.toContain('attacker.example');
    expect(response.headers['access-control-allow-origin']).not.toBe('https://attacker.example');
  });

  it('does not log tokens in query strings or Referer, including failed methods', async () => {
    const marker = `secret-query-${randomUUID()}`;
    await request(app).get(`/api/auth/verify-email?token=${marker}`).set('Referer', `https://app.example.com/?token=${marker}`);
    expect(JSON.stringify(vi.mocked(logger.info).mock.calls)).not.toContain(marker);
  });

  it('caps global sends under concurrent registrations from different recipients', async () => {
    const saved = env.REGISTRATION_GLOBAL_DAILY_LIMIT;
    env.REGISTRATION_GLOBAL_DAILY_LIMIT = 3;
    try {
      const replies = await Promise.all(Array.from({ length: 12 }, (_, i) => register(`global-${i}@example.com`)));
      expect(replies.filter((r) => r.status === 202)).toHaveLength(3);
      expect(replies.filter((r) => r.body.code === 'EMAIL_QUOTA_EXCEEDED')).toHaveLength(9);
      expect(sendEmail).toHaveBeenCalledTimes(3);
      expect((await db.query.registrationMailQuotas.findFirst({ where: eq(registrationMailQuotas.key, 'global') }))?.count).toBe(3);
    } finally { env.REGISTRATION_GLOBAL_DAILY_LIMIT = saved; }
  });

  it('does not reset recipient quota on token expiry; rolls budget over after 24 hours', async () => {
    const email = 'quota-expiry@example.com';
    await register(email);
    const first = tokenFrom();
    const expiry = (await db.query.pendingRegistrations.findFirst())!.expiresAt;
    await ageRequest(email);
    await register(email);
    expect((await db.query.pendingRegistrations.findFirst())!.expiresAt).toEqual(expiry);
    for (let i = 0; i < 6; i++) {
      await db.update(pendingRegistrations).set({ expiresAt: new Date(0), requestedAt: new Date(0) }).where(eq(pendingRegistrations.email, email));
      await register(email);
    }
    expect(sendEmail).toHaveBeenCalledTimes(5);
    expect((await verify(first)).status).toBe(400);
    await db.update(registrationMailQuotas).set({ expiresAt: new Date(0) });
    await ageRequest(email);
    await register(email);
    expect(sendEmail).toHaveBeenCalledTimes(6);
  });

  it('counts known Gmail dot/plus/googlemail aliases as one mailbox for quotas', async () => {
    const aliases = ['user@gmail.com', 'u.ser@gmail.com', 'user+one@gmail.com', 'user+two@googlemail.com', 'u.s.e.r+three@gmail.com', 'user+four@gmail.com'];
    for (const email of aliases) await register(email);
    expect(sendEmail).toHaveBeenCalledTimes(5);
    expect(new Set(aliases.map(registrationMailboxKey)).size).toBe(1);
    expect(await db.query.pendingRegistrations.findMany()).toHaveLength(5);
    expect(registrationMailboxKey('a+b@business.example')).not.toBe(registrationMailboxKey('a@business.example'));
  });

  it('keeps quotas after provider failures and suppresses immediate retry storms', async () => {
    sendEmail.mockResolvedValue({ data: null, error: { message: 'provider-down' } });
    const email = 'failed-flood@example.com';
    for (let i = 0; i < 8; i++) {
      await register(email);
      await register(email);
      await ageRequest(email);
    }
    expect(sendEmail).toHaveBeenCalledTimes(5);
    expect(await db.query.users.findMany()).toHaveLength(0);
  });

  it('sends only one email for a burst of 20 identical concurrent requests', async () => {
    const replies = await Promise.all(Array.from({ length: 20 }, () => register('burst@example.com')));
    expect(replies.every((r) => r.status === 202)).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('rejects guessing with the stored SHA256 digest and rejects JWTs as verification tokens', async () => {
    await register('hash-guess@example.com');
    const pending = (await db.query.pendingRegistrations.findFirst())!;
    expect((await verify(pending.tokenHash)).status).toBe(400);
    expect((await verify('eyJhbGciOiJIUzI1NiJ9.e30.signature')).status).toBe(400);
    expect((await verify(tokenFrom())).status).toBe(201);
  });

  it('rolls token consumption back if user insertion fails', async () => {
    await register('rollback@example.com');
    const token = tokenFrom();
    await db.execute(sql`ALTER TABLE "User" ADD CONSTRAINT test_reject_user CHECK (email <> 'rollback@example.com')`);
    try {
      expect((await verify(token)).status).toBe(500);
      expect(await db.query.pendingRegistrations.findFirst()).toBeDefined();
      expect(await db.query.users.findMany()).toHaveLength(0);
    } finally { await db.execute(sql`ALTER TABLE "User" DROP CONSTRAINT test_reject_user`); }
    expect((await verify(token)).status).toBe(201);
  });

  it('allows only one bootstrap admin even with valid secret and concurrent requests', async () => {
    const saved = env.INITIAL_SETUP_TOKEN;
    env.INITIAL_SETUP_TOKEN = 'operator-only-secret-'.repeat(3);
    try {
      expect((await request(app).post('/api/auth/setup').set('X-Setup-Token', 'wrong')
        .send({ email: 'wrong@example.com', password })).status).toBe(403);
      const replies = await Promise.all(['first', 'second'].map((name) => request(app).post('/api/auth/setup')
        .set('X-Setup-Token', env.INITIAL_SETUP_TOKEN!).send({ email: `${name}@example.com`, password })));
      expect(replies.map((r) => r.status).sort()).toEqual([200, 403]);
      expect(await db.query.users.findMany()).toHaveLength(1);
    } finally { env.INITIAL_SETUP_TOKEN = saved; }
  });

  it.each([
    { email: ['a@example.com'] }, { email: { $ne: null } }, { email: 'x@example.com\r\nBcc: victim@example.com' },
    { email: '<img src=x onerror=alert(1)>@example.com' }, { email: 'x@example.com; DROP TABLE "User";' },
  ])('rejects hostile email input without sending: %j', async (body) => {
    const response = await request(app).post('/api/auth/register').send(body);
    expect(response.status).toBe(400);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('does not accept form-encoded or GET requests as registration/verification', async () => {
    // The app's final /api auth guard rejects unmatched GETs with 401.
    expect((await request(app).get('/api/auth/register?email=x@example.com')).status).toBe(401);
    expect((await request(app).post('/api/auth/register').type('form').send({ email: 'x@example.com' })).status).toBe(400);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('enforces IP limits despite forged forwarding headers when no proxy is trusted', async () => {
    app.set('trust proxy', false);
    process.env.RATE_LIMIT_DISABLED = 'false';
    for (let i = 0; i < 5; i++) {
      expect((await request(app).post('/api/auth/register').set('X-Forwarded-For', `198.51.100.${i + 1}`)
        .send({ email: 'ip-flood@example.com' })).status).toBe(202);
    }
    expect((await request(app).post('/api/auth/register').set('X-Forwarded-For', '203.0.113.99')
      .send({ email: 'another@example.com' })).status).toBe(429);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('rate limits token guessing before bcrypt can run', async () => {
    app.set('trust proxy', 1); // Simulate a trusted proxy supplying a fresh client IP.
    process.env.RATE_LIMIT_DISABLED = 'false';
    for (let i = 0; i < 10; i++) {
      expect((await request(app).post('/api/auth/verify-email').set('X-Forwarded-For', '192.0.2.123')
        .send({ token: 'a'.repeat(64), password })).status).toBe(400);
    }
    expect((await request(app).post('/api/auth/verify-email').set('X-Forwarded-For', '192.0.2.123')
      .send({ token: 'a'.repeat(64), password })).status).toBe(429);
    app.set('trust proxy', false);
  });
});