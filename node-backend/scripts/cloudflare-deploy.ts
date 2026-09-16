/** Operator-only provisioning. Run from node-backend. Never prints credentials.
 * inspect | widget | waf | verify-waf | purge
 * Required env: DEPLOY_USER_ID, DEPLOY_CREDENTIAL_ID.
 * Scoped deliberately to this project's hostname/account; never replaces rulesets.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { db, pool } from '../src/services/db.js';
import { cloudflareAccounts } from '../src/db/schema.js';
import { decrypt } from '../src/utils/encryption.js';

const host = 'cf.mmthui.xyz';
const domain = 'mmthui.xyz';
const account = '459ceb3207d328ef862aff603f79ed91';
const mode = process.argv[2] || 'inspect';
const backups = path.resolve('.deployment-backups');
await fs.mkdir(backups, { recursive: true });

class CfFailure extends Error {
  constructor(public status: number, public codes: number[], public detail: string) { super('Cloudflare operation failed'); }
}
async function main() {
  if (!process.env.DEPLOY_USER_ID || !process.env.DEPLOY_CREDENTIAL_ID) throw new Error('Missing operator scope');
  const credential = await db.query.cloudflareAccounts.findFirst({ where: and(
    eq(cloudflareAccounts.id, process.env.DEPLOY_CREDENTIAL_ID),
    eq(cloudflareAccounts.userId, process.env.DEPLOY_USER_ID),
  ) });
  if (!credential?.isActive) throw new Error('Credential missing/inactive');
  const secret = decrypt(credential.credentialEncrypted);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (credential.authType === 'apiToken') headers.Authorization = `Bearer ${secret}`;
  else { headers['X-Auth-Email'] = credential.email!; headers['X-Auth-Key'] = secret; }
  async function cf(url: string, method = 'GET', body?: unknown) {
    const response = await fetch(`https://api.cloudflare.com/client/v4${url}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(25000),
    });
    const result = await response.json() as any;
    if (!response.ok || !result.success) throw new CfFailure(response.status, (result.errors ?? []).map((e: any) => e.code),
      String(result.errors?.[0]?.message || 'Request rejected').split(secret).join('[REDACTED]'));
    return result.result;
  }
  const zones = await cf(`/zones?name=${domain}&per_page=50`);
  if (zones.length !== 1 || zones[0].account.id !== account) throw new Error('Zone/account mismatch');
  const zone = zones[0];
  async function phase(name: string) {
    try { return await cf(`/zones/${zone.id}/rulesets/phases/${name}/entrypoint`); }
    catch (error) { if (error instanceof CfFailure && error.status === 404) return null; throw error; }
  }
  if (mode === 'inspect' || mode === 'verify-waf') {
    const widgets = await cf(`/accounts/${account}/challenges/widgets?per_page=100`);
    console.log(JSON.stringify({ zone: zone.id, plan: zone.plan?.name, host, widgets: widgets.map((w: any) => ({ name: w.name, sitekey: w.sitekey, domains: w.domains, mode: w.mode })) }));
    for (const name of ['http_request_firewall_custom', 'http_ratelimit', 'http_request_cache_settings']) {
      const ruleset = await phase(name);
      console.log(JSON.stringify({ phase: name, id: ruleset?.id, rules: ruleset?.rules?.map((r: any) => ({ id: r.id, ref: r.ref, description: r.description, expression: r.expression, action: r.action, enabled: r.enabled, ratelimit: r.ratelimit })) ?? [] }));
    }
    return;
  }
  if (mode === 'widget') {
    const file = '.env.turnstile.production';
    try { await fs.access(file); throw new Error('Production Turnstile config already exists; refusing to overwrite'); }
    catch (error: any) { if (error.code !== 'ENOENT') throw error; }
    const widgets = await cf(`/accounts/${account}/challenges/widgets?per_page=100`);
    const existing = widgets.filter((w: any) => w.name === 'CF Tool Production');
    if (existing.length > 1) throw new Error('Ambiguous production widget');
    const widget = existing.length ? await cf(`/accounts/${account}/challenges/widgets/${existing[0].sitekey}`)
      : await cf(`/accounts/${account}/challenges/widgets`, 'POST', { name: 'CF Tool Production', domains: [host], mode: 'managed', clearance_level: 'no_clearance' });
    if (widget.domains.length !== 1 || widget.domains[0] !== host || widget.mode !== 'managed' || widget.clearance_level !== 'no_clearance' || !widget.secret) {
      throw new Error('Production widget settings differ; operator review required');
    }
    // A generated credential artifact, excluded from git. Never echo its contents.
    await fs.writeFile(file, `TURNSTILE_ENABLED=true\nTURNSTILE_SITE_KEY=${widget.sitekey}\nTURNSTILE_SECRET_KEY=${widget.secret}\nTURNSTILE_ALLOWED_HOSTNAMES=${host}\n`, { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ created: !existing.length, sitekey: widget.sitekey, host, secretSaved: true }));
    return;
  }
  if (mode === 'purge') {
    await cf(`/zones/${zone.id}/purge_cache`, 'POST', { files: [`https://${host}/`, `https://${host}/register`, `https://${host}/verify-email`, `https://${host}/login`, `https://${host}/index.html`] });
    console.log('CF Tool HTML cache purge requested');
    return;
  }
  if (mode !== 'waf') throw new Error('Unknown operation');
  const snapshot: Record<string, unknown> = {};
  for (const name of ['http_request_firewall_custom', 'http_ratelimit', 'http_request_cache_settings']) snapshot[name] = await phase(name);
  const backup = path.join(backups, `cloudflare-before-${Date.now()}.json`);
  await fs.writeFile(backup, JSON.stringify({ zone: zone.id, snapshot }, null, 2), { flag: 'wx' });
  console.log('Existing Cloudflare rules backed up (no secrets)');
  async function addRule(phaseName: string, rule: Record<string, unknown>) {
    const current = await phase(phaseName);
    const found = current?.rules?.find((r: any) => r.ref === rule.ref);
    if (found) {
      if (found.expression !== rule.expression || found.action !== rule.action || found.enabled === false) throw new Error(`Existing managed rule differs: ${rule.ref}`);
      console.log(JSON.stringify({ rule: rule.ref, existing: true, id: found.id })); return;
    }
    const result = current
      ? await cf(`/zones/${zone.id}/rulesets/${current.id}/rules`, 'POST', rule)
      : await cf(`/zones/${zone.id}/rulesets`, 'POST', { name: 'CF Tool security', kind: 'zone', phase: phaseName, rules: [rule] });
    const added = result.rules?.find((r: any) => r.ref === rule.ref);
    console.log(JSON.stringify({ rule: rule.ref, created: true, rulesetId: result.id, id: added?.id }));
  }
  const hostExpression = `(http.host eq "${host}")`;
  const setupRule = {
    ref: 'cftool_block_public_setup', description: 'CF Tool: block public admin bootstrap', enabled: true, action: 'block',
    expression: `${hostExpression} and starts_with(lower(http.request.uri.path), "/api/auth/setup")`,
    position: { index: 1 },
  };
  const custom = await phase('http_request_firewall_custom');
  if (zone.plan?.legacy_id === 'free' && (custom?.rules?.length ?? 0) >= 5 && !custom.rules.some((r: any) => r.ref === setupRule.ref)) {
    // Free quota already full: extend only the existing scanner BLOCK condition.
    // A OR B keeps behavior for every request matched by A unchanged, and B is
    // strictly limited to CF Tool's bootstrap URL. Backup above permits rollback.
    const scanner = custom.rules.find((r: any) => r.action === 'block' && r.enabled !== false && r.description?.startsWith('scanner'));
    if (!scanner) throw new Error('No compatible scanner block rule; will not replace unrelated WAF rules');
    if (!scanner.expression.includes(setupRule.expression)) {
      await cf(`/zones/${zone.id}/rulesets/${custom.id}/rules/${scanner.id}`, 'PATCH', {
        action: 'block', enabled: true,
        description: 'scanner + CF Tool public setup',
        expression: `(${scanner.expression}) or (${setupRule.expression})`,
        ...(scanner.action_parameters ? { action_parameters: scanner.action_parameters } : {}),
      });
    }
    console.log(JSON.stringify({ setupProtected: true, mergedIntoExistingBlock: scanner.id, otherMatchBehaviorPreserved: true }));
  } else await addRule('http_request_firewall_custom', setupRule);
  // Explicit host scope is mandatory. Never silently widen to every site in zone
  // when a Free plan rejects hostname filtering in http_ratelimit.
  try {
    await addRule('http_ratelimit', {
      ref: 'cftool_auth_burst', description: 'CF Tool: auth burst protection', enabled: true, action: 'block',
      expression: `${hostExpression} and (starts_with(lower(http.request.uri.path), "/api/auth/register") or starts_with(lower(http.request.uri.path), "/api/auth/verify-email") or starts_with(lower(http.request.uri.path), "/api/auth/login"))`,
      ratelimit: { characteristics: ['cf.colo.id', 'ip.src'], period: 10, requests_per_period: 10, mitigation_timeout: 10 },
    });
  } catch (error) {
    if (!(error instanceof CfFailure)) throw error;
    console.log(JSON.stringify({ rateLimitCreated: false, status: error.status, codes: error.codes, detail: error.detail, note: 'No zone-wide fallback; app rate limits remain enabled' }));
  }
  await addRule('http_request_cache_settings', {
    ref: 'cftool_no_cache_auth', description: 'CF Tool: do not cache authentication or SPA HTML', enabled: true,
    action: 'set_cache_settings', expression: `${hostExpression} and not starts_with(http.request.uri.path, "/assets/")`,
    action_parameters: { cache: false },
  });
}
try { await main(); }
catch (error) {
  console.error(error instanceof CfFailure ? JSON.stringify({ status: error.status, codes: error.codes, detail: error.detail })
    : error instanceof Error && !('query' in error) ? error.message : 'Provisioning failed; credentials not printed');
  process.exitCode = 1;
} finally { await pool.end(); }