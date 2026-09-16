import { Router, type Request, type Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { sensitiveLimiter } from '../middleware/rateLimit.js';
import { cloudflareAccounts } from '../db/schema.js';
import { db } from '../services/db.js';
import { decrypt } from '../utils/encryption.js';
import { cloudflareService, isCloudflareError, type CloudflareCredentials } from '../services/cloudflare.js';
import { apiErrorEnvelope } from '../utils/apiError.js';
import { recordChangeSafe } from '../services/changes.js';
import { turnstileAccountId, turnstileInput, turnstileSitekey } from '../models/turnstile.js';

export const turnstileRouter = Router();
turnstileRouter.use(requireAuth);
const selector = z.object({ accountId: z.string().min(1).max(128), cfAccountId: turnstileAccountId.optional() });

// Require an explicitly selected saved credential owned by the current user.
// Cloudflare itself authorizes the target cfAccountId; never use another user's credential.
turnstileRouter.use(async (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  const parsed = selector.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ detail: 'Select a valid Cloudflare account' });
  try {
    const account = await db.query.cloudflareAccounts.findFirst({
      where: and(eq(cloudflareAccounts.id, parsed.data.accountId), eq(cloudflareAccounts.userId, req.auth!.userId)),
    });
    if (!account) return res.status(404).json({ detail: 'Cloudflare account not found' });
    if (!account.isActive) return res.status(403).json({ detail: 'Cloudflare account is inactive' });
    const secret = decrypt(account.credentialEncrypted);
    res.locals.credentials = account.authType === 'apiToken'
      ? { authType: 'apiToken', apiToken: secret }
      : { authType: 'globalApiKey', email: account.email, globalApiKey: secret };
    res.locals.accountId = account.id;
    res.locals.cfAccountId = parsed.data.cfAccountId;
    next();
  } catch { res.status(500).json({ detail: 'Unable to load Cloudflare credentials' }); }
});

function fail(res: Response, error: unknown) {
  if (error instanceof z.ZodError) return res.status(400).json({ detail: error.issues[0]?.message || 'Invalid Turnstile input' });
  const known = isCloudflareError(error);
  const envelope = apiErrorEnvelope(known ? error : new Error('Cloudflare Turnstile operation failed'), 'TURNSTILE_FAILED', 'Cloudflare Turnstile operation failed');
  if (known && (error.status === 403 || error.status === 401)) {
    envelope.requiredPermission = 'Account: Turnstile Sites Read / Write';
    // Upstream credentials failing must not log the user out of CF Tool.
    return res.status(403).json(envelope);
  }
  return res.status(known ? error.status ?? 502 : 502).json(envelope);
}
const credentials = (res: Response) => res.locals.credentials as CloudflareCredentials;

turnstileRouter.get('/accounts', async (_req, res) => {
  try { res.json({ accounts: await cloudflareService.listAccounts(credentials(res)) }); }
  catch (error) { fail(res, error); }
});

turnstileRouter.use('/widgets', (_req, res, next) => {
  if (!res.locals.cfAccountId) return res.status(400).json({ detail: 'Cloudflare account ID is required' });
  next();
});
turnstileRouter.param('sitekey', (_req, res, next, value) => {
  if (!turnstileSitekey.safeParse(value).success) return res.status(400).json({ detail: 'Invalid Turnstile site key' });
  next();
});

async function history(req: Request, res: Response, action: string, sitekey: string) {
  await recordChangeSafe({
    ownerId: req.auth!.userId, accountId: res.locals.accountId, action,
    items: [{ resourceType: 'turnstile', resourceId: sitekey, after: { cfAccountId: res.locals.cfAccountId } }],
  });
}

turnstileRouter.get('/widgets', async (req, res) => {
  try {
    const { page, perPage } = z.object({
      page: z.coerce.number().int().min(1).max(10000).default(1),
      perPage: z.coerce.number().int().min(5).max(100).default(20),
    }).parse(req.query);
    res.json(await cloudflareService.listTurnstileWidgets(credentials(res), res.locals.cfAccountId, page, perPage));
  } catch (error) { fail(res, error); }
});

turnstileRouter.post('/widgets', async (req, res) => {
  try {
    const input = turnstileInput.parse(req.body);
    const widget = await cloudflareService.createTurnstileWidget(credentials(res), res.locals.cfAccountId, input);
    await history(req, res, 'turnstile.create', widget.sitekey);
    res.status(201).json(widget);
  } catch (error) { fail(res, error); }
});

turnstileRouter.get('/widgets/:sitekey', async (req, res) => {
  try { res.json(await cloudflareService.getTurnstileWidget(credentials(res), res.locals.cfAccountId, String(req.params.sitekey))); }
  catch (error) { fail(res, error); }
});

turnstileRouter.put('/widgets/:sitekey', async (req, res) => {
  try {
    const input = turnstileInput.parse(req.body);
    const widget = await cloudflareService.updateTurnstileWidget(credentials(res), res.locals.cfAccountId, String(req.params.sitekey), input);
    await history(req, res, 'turnstile.update', widget.sitekey);
    res.json(widget);
  } catch (error) { fail(res, error); }
});

turnstileRouter.delete('/widgets/:sitekey', async (req, res) => {
  try {
    await cloudflareService.deleteTurnstileWidget(credentials(res), res.locals.cfAccountId, String(req.params.sitekey));
    await history(req, res, 'turnstile.delete', String(req.params.sitekey));
    res.status(204).send();
  } catch (error) { fail(res, error); }
});

// Secrets only returned through explicit, rate-limited POST operations (audited),
// never persisted in our DB/history or emitted in list/get/create/update responses.
turnstileRouter.post('/widgets/:sitekey/secret/reveal', sensitiveLimiter, async (req, res) => {
  try { res.json(await cloudflareService.revealTurnstileSecret(credentials(res), res.locals.cfAccountId, String(req.params.sitekey))); }
  catch (error) { fail(res, error); }
});
turnstileRouter.post('/widgets/:sitekey/secret/rotate', sensitiveLimiter, async (req, res) => {
  try {
    const { invalidateImmediately } = z.object({ invalidateImmediately: z.boolean().default(false) }).strict().parse(req.body ?? {});
    const result = await cloudflareService.rotateTurnstileSecret(credentials(res), res.locals.cfAccountId, String(req.params.sitekey), invalidateImmediately);
    await history(req, res, 'turnstile.secret.rotate', String(req.params.sitekey));
    res.json(result);
  } catch (error) { fail(res, error); }
});