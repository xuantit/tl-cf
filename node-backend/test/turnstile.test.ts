import './helpers/securitySetup.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { app } from '../src/app.js';
import { db } from '../src/services/db.js';
import { auditLogs, changeItems, cloudflareAccounts, users } from '../src/db/schema.js';
import { encrypt } from '../src/utils/encryption.js';
import { env } from '../src/utils/env.js';
import { cloudflareService, CloudflareError } from '../src/services/cloudflare.js';

const cfAccountId = 'a'.repeat(32);
const sitekey = '0x4AAAA-example-sitekey';
const secret = 'turnstile-private-secret-never-in-history';
const raw = { sitekey, name: 'Registration', domains: ['example.com'], mode: 'managed', clearance_level: 'no_clearance', secret,
  region: 'world', bot_fight_mode: true, ephemeral_id: true, offlabel: true };
const input = { name: 'Updated widget', domains: ['EXAMPLE.com', 'localhost', 'example.com'], mode: 'invisible', clearanceLevel: 'managed' };
const cfRequest = vi.fn();
let token: string;
let accountId: string;
let foreignAccountId: string;
const path = (suffix = '') => `/api/turnstile/widgets${suffix}?accountId=${accountId}&cfAccountId=${cfAccountId}`;
const authorized = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);

beforeAll(async () => {
  const [user] = await db.insert(users).values({ email: 'turnstile-owner@example.com', passwordHash: 'unused', role: 'user' }).returning();
  const [other] = await db.insert(users).values({ email: 'turnstile-other@example.com', passwordHash: 'unused' }).returning();
  const [account] = await db.insert(cloudflareAccounts).values({ userId: user.id, authType: 'apiToken', credentialEncrypted: encrypt('cf-test-token') }).returning();
  const [foreign] = await db.insert(cloudflareAccounts).values({ userId: other.id, authType: 'apiToken', credentialEncrypted: encrypt('foreign-test-token') }).returning();
  accountId = account.id; foreignAccountId = foreign.id;
  token = jwt.sign({ userId: user.id, email: user.email, role: 'user' }, env.JWT_SECRET);
});
beforeEach(() => {
  cfRequest.mockReset().mockResolvedValue({ data: { success: true, result: raw } });
  vi.spyOn(cloudflareService as any, 'createClient').mockReturnValue({ request: cfRequest, get: cfRequest });
});
afterEach(() => { vi.restoreAllMocks(); delete process.env.RATE_LIMIT_DISABLED; });

describe('Turnstile widget management', () => {
  it('requires login before listing or revealing secrets', async () => {
    expect((await request(app).get(path())).status).toBe(401);
    expect((await request(app).post(path(`/${sitekey}/secret/reveal`))).status).toBe(401);
    expect(cfRequest).not.toHaveBeenCalled();
  });

  it('rejects another user credential and never contacts Cloudflare', async () => {
    for (const suffix of ['', `/${sitekey}/secret/reveal`]) {
      const url = path(suffix).replace(accountId, foreignAccountId);
      const response = await authorized(suffix ? request(app).post(url) : request(app).get(url));
      expect(response.status).toBe(404);
    }
    expect(cfRequest).not.toHaveBeenCalled();
  });

  it('rejects inactive credentials', async () => {
    await db.update(cloudflareAccounts).set({ isActive: false }).where(eq(cloudflareAccounts.id, accountId));
    try { expect((await authorized(request(app).get(path()))).status).toBe(403); }
    finally { await db.update(cloudflareAccounts).set({ isActive: true }).where(eq(cloudflareAccounts.id, accountId)); }
    expect(cfRequest).not.toHaveBeenCalled();
  });

  it('lists public account identities using the selected credential', async () => {
    cfRequest.mockResolvedValue({ data: { success: true, result: [{ id: cfAccountId, name: 'My account', secret: 'not-returned' }] } });
    const result = await authorized(request(app).get(`/api/turnstile/accounts?accountId=${accountId}`));
    expect(result.body).toEqual({ accounts: [{ id: cfAccountId, name: 'My account' }] });
  });

  it('lists paginated widgets without leaking provider secrets', async () => {
    cfRequest.mockResolvedValue({ data: { success: true, result: [raw], result_info: { total_count: 42 } } });
    const response = await authorized(request(app).get(`${path()}&page=2&perPage=20`));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ total: 42, page: 2, perPage: 20, widgets: [{ sitekey, name: raw.name }] });
    expect(JSON.stringify(response.body)).not.toContain(secret);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(cfRequest).toHaveBeenCalledWith(expect.objectContaining({ method: 'get', url: `/accounts/${cfAccountId}/challenges/widgets`, params: { page: 2, per_page: 20, order: 'name', direction: 'asc' } }));
  });

  it('gets widget metadata without revealing secret', async () => {
    const response = await authorized(request(app).get(path(`/${sitekey}`)));
    expect(response.status).toBe(200);
    expect(response.body.sitekey).toBe(sitekey);
    expect(response.body.secret).toBeUndefined();
  });

  it('keeps pagination reachable when Cloudflare omits result_info', async () => {
    cfRequest.mockResolvedValueOnce({ data: { success: true, result: [raw] } });
    const response = await authorized(request(app).get(`${path()}&page=2&perPage=20`));
    expect(response.body.total).toBe(21);
    cfRequest.mockResolvedValueOnce({ data: { success: true, result: Array(5).fill(raw) } });
    const fullPage = await authorized(request(app).get(`${path()}&page=2&perPage=5`));
    expect(fullPage.body.total).toBe(11);
  });

  it('creates a normalized widget but requires explicit reveal to get secret', async () => {
    const response = await authorized(request(app).post(path()).send(input));
    expect(response.status).toBe(201);
    expect(cfRequest).toHaveBeenCalledWith(expect.objectContaining({ method: 'post', data: { name: input.name, domains: ['example.com', 'localhost'], mode: 'invisible', clearance_level: 'managed' } }));
    expect(response.body.secret).toBeUndefined();
  });

  it('preserves Enterprise options on PUT and does not echo secret/server fields', async () => {
    const response = await authorized(request(app).put(path(`/${sitekey}`)).send(input));
    expect(response.status).toBe(200);
    expect(cfRequest).toHaveBeenLastCalledWith(expect.objectContaining({ method: 'put', data: {
      name: input.name, domains: ['example.com', 'localhost'], mode: 'invisible', clearance_level: 'managed',
      bot_fight_mode: true, ephemeral_id: true, offlabel: true,
    } }));
    expect(response.body.secret).toBeUndefined();
  });

  it('reveals only on explicit POST and keeps secret out of audit/change history', async () => {
    const response = await authorized(request(app).post(path(`/${sitekey}/secret/reveal`)).send({}));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ secret });
    expect(response.headers['cache-control']).toBe('no-store');
    await vi.waitFor(async () => {
      const logs = await db.select().from(auditLogs).where(eq(auditLogs.path, `/api/turnstile/widgets/${sitekey}/secret/reveal`));
      expect(logs.length).toBeGreaterThan(0);
      expect(JSON.stringify(logs)).not.toContain(secret);
    });
  });

  it.each([false, true])('rotates with invalidateImmediately=%s without persisting secret', async (invalidateImmediately) => {
    const response = await authorized(request(app).post(path(`/${sitekey}/secret/rotate`)).send({ invalidateImmediately }));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ secret });
    expect(cfRequest).toHaveBeenCalledWith(expect.objectContaining({ method: 'post', url: `/accounts/${cfAccountId}/challenges/widgets/${sitekey}/rotate_secret`, data: { invalidate_immediately: invalidateImmediately } }));
    expect(JSON.stringify(await db.select().from(changeItems))).not.toContain(secret);
  });

  it('defaults rotation to a 2-hour grace period', async () => {
    await authorized(request(app).post(path(`/${sitekey}/secret/rotate`)).send({}));
    expect(cfRequest).toHaveBeenCalledWith(expect.objectContaining({ data: { invalidate_immediately: false } }));
  });

  it('deletes the selected widget and records the change', async () => {
    const response = await authorized(request(app).delete(path(`/${sitekey}`)));
    expect(response.status).toBe(204);
    const history = await db.query.changeSets.findFirst({ where: (row, { eq }) => eq(row.action, 'turnstile.delete') });
    expect(history?.accountId).toBe(accountId);
  });

  it.each(['https://example.com', '*.example.com', 'example.com/path', 'example.com:443', '-bad.com', 'bad..com'])('rejects invalid hostname %s', async (domain) => {
    expect((await authorized(request(app).post(path()).send({ ...input, domains: [domain] }))).status).toBe(400);
    expect(cfRequest).not.toHaveBeenCalled();
  });

  it('accepts IP literals and localhost', async () => {
    expect((await authorized(request(app).post(path()).send({ ...input, domains: ['127.0.0.1', '::1', 'localhost'] }))).status).toBe(201);
  });

  it.each([{ name: '' }, { domains: [] }, { domains: Array(11).fill('example.com') }, { mode: 'invalid' }, { secret: 'injected' }, { region: 'china' }])('rejects invalid/unsupported widget settings %j', async (invalid) => {
    expect((await authorized(request(app).post(path()).send({ ...input, ...invalid }))).status).toBe(400);
    expect(cfRequest).not.toHaveBeenCalled();
  });

  it('rejects malformed selectors and pagination', async () => {
    for (const suffix of ['&page=0', '&perPage=1001', `&accountId=${accountId}`]) {
      expect((await authorized(request(app).get(path() + suffix))).status).toBe(400);
    }
    expect((await authorized(request(app).get(`/api/turnstile/widgets?accountId=${accountId}`))).status).toBe(400);
    expect((await authorized(request(app).get(path().replace(cfAccountId, '../escape')))).status).toBe(400);
    expect(cfRequest).not.toHaveBeenCalled();
  });

  it.each(['abc%2Fdef', '%2e%2e%2fescape', 'a'.repeat(33)])('rejects unsafe sitekey %s', async (key) => {
    expect((await authorized(request(app).delete(path(`/${key}`)))).status).toBe(400);
    expect(cfRequest).not.toHaveBeenCalled();
  });

  it.each([401, 403])('maps upstream %i to a permission error without expiring the app session', async (status) => {
    cfRequest.mockRejectedValue(new CloudflareError({ status, message: 'Missing permissions' }));
    const response = await authorized(request(app).get(path()));
    expect(response.status).toBe(403);
    expect(response.body.requiredPermission).toContain('Turnstile Sites');
  });

  it('handles Cloudflare success:false and missing secret without leaking raw data', async () => {
    cfRequest.mockResolvedValueOnce({ data: { success: false, errors: [{ message: 'Widget limit exceeded' }] } });
    expect((await authorized(request(app).post(path()).send(input))).status).toBe(400);
    cfRequest.mockResolvedValueOnce({ data: { success: true, result: { ...raw, secret: undefined } } });
    const response = await authorized(request(app).post(path(`/${sitekey}/secret/reveal`)).send({}));
    expect(response.status).toBe(502);
    expect(response.body.detail).toBe('Cloudflare Turnstile operation failed');
  });
});