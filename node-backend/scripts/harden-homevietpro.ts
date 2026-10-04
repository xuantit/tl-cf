/** Operator-only hardening for the explicitly approved WordPress landing site.
 * Run from node-backend: node --import tsx scripts/harden-homevietpro.ts inspect|apply|verify|cache|cache-update|verify-cache|purge-public|purge-site
 * Required env: DEPLOY_USER_ID, DEPLOY_CREDENTIAL_ID. No credentials in output/backups.
 * Adds individually identified rules, never replaces unrelated rulesets or DNS.
 */
import fs from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { homevietproCacheRules, publicPaths } from './homevietpro-cache-policy.js';
import { and, eq } from 'drizzle-orm';
import { db, pool } from '../src/services/db.js';
import { cloudflareAccounts } from '../src/db/schema.js';
import { decrypt } from '../src/utils/encryption.js';

const domain = 'homevietpro.com';
const zoneId = 'b08604a917e34f3ea97d8bd560f48731';
const accountId = '459ceb3207d328ef862aff603f79ed91';
const operation = process.argv[2] || 'inspect';
const host = `(http.host eq "${domain}")`;
const p = 'lower(http.request.uri.path)';
const prefix = `/zones/${zoneId}`;
const phases = ['http_request_firewall_custom', 'http_ratelimit', 'http_request_cache_settings'] as const;
type Phase = typeof phases[number];
type Rule = { ref: string; description: string; expression: string; action: string; enabled: boolean;
  action_parameters?: Record<string, unknown>; ratelimit?: Record<string, unknown> };
type Ruleset = { id: string; rules: Array<Rule & { id: string }> };
const planned: Array<{ phase: Phase; rule: Rule }> = [
  { phase: 'http_request_firewall_custom', rule: {
    ref: 'homevietpro_wp_sensitive', description: 'HomeVietPro WordPress: block sensitive files and uploaded PHP', enabled: true, action: 'block',
    expression: `${host} and (${p} eq "/.env" or starts_with(${p}, "/.env.") or ${p} eq "/.git" or starts_with(${p}, "/.git/") or ${p} eq "/wp-config.php" or starts_with(${p}, "/wp-config.php.") or ${p} eq "/wp-config-sample.php" or ${p} eq "/wp-content/debug.log" or (starts_with(${p}, "/wp-content/uploads/") and (${p} contains ".php" or ${p} contains ".phtml" or ${p} contains ".phar")))`,
  } },
  { phase: 'http_request_firewall_custom', rule: {
    ref: 'homevietpro_wp_xmlrpc', description: 'HomeVietPro landing page: block unused XML-RPC', enabled: true, action: 'block',
    expression: `${host} and (${p} eq "/xmlrpc.php" or starts_with(${p}, "/xmlrpc.php/"))`,
  } },
  { phase: 'http_request_firewall_custom', rule: {
    ref: 'homevietpro_wp_login', description: 'HomeVietPro WordPress: challenge login only', enabled: true, action: 'managed_challenge',
    expression: `${host} and (${p} eq "/wp-login.php" or starts_with(${p}, "/wp-login.php/"))`,
  } },
  { phase: 'http_ratelimit', rule: {
    ref: 'homevietpro_wp_login_burst', description: 'HomeVietPro WordPress: login burst 10 requests per 10 seconds', enabled: true, action: 'block',
    // Free rate rules cannot filter hostname/method. Preflight refuses unexpected
    // web hostnames. This rule will cover new hostnames with the same login path.
    expression: `(${p} eq "/wp-login.php" or starts_with(${p}, "/wp-login.php/"))`,
    ratelimit: { characteristics: ['cf.colo.id', 'ip.src'], period: 10, requests_per_period: 10, mitigation_timeout: 10 },
  } },
  { phase: 'http_request_cache_settings', rule: {
    ref: 'homevietpro_wp_private_bypass', description: 'HomeVietPro WordPress: bypass admin API sessions and previews', enabled: true, action: 'set_cache_settings',
    expression: `${host} and (${p} eq "/wp-admin" or starts_with(${p}, "/wp-admin/") or starts_with(${p}, "/wp-login.php") or ${p} eq "/wp-json" or starts_with(${p}, "/wp-json/") or ${p} eq "/wp-cron.php" or ${p} eq "/wp-comments-post.php" or ${p} eq "/xmlrpc.php" or http.request.uri.query contains "rest_route=" or http.request.uri.query contains "preview=" or http.request.uri.query contains "preview_id=" or http.request.uri.query contains "wc-ajax=" or http.cookie contains "wordpress_logged_in_" or http.cookie contains "wordpress_sec_" or http.cookie contains "wp-postpass_" or http.cookie contains "comment_author_" or http.cookie contains "wp_woocommerce_session_" or http.cookie contains "woocommerce_items_in_cart" or http.cookie contains "PHPSESSID")`,
    action_parameters: { cache: false },
  } },
];
const settings = { ssl: 'strict', always_use_https: 'on', min_tls_version: '1.2' } as const;

class CfError extends Error {
  constructor(public status: number, public codes: number[]) { super('Cloudflare rejected request'); }
}

async function checkOrigin(ip: string) {
  return new Promise<void>((resolve, reject) => {
    const req = https.request({
      host: ip, port: 443, servername: domain, path: '/', method: 'HEAD',
      headers: { Host: domain, 'User-Agent': 'HomeVietPro-Security-Preflight/1.0' },
      rejectUnauthorized: true, timeout: 15000,
    }, (res) => {
      res.resume();
      if (!res.statusCode || res.statusCode >= 400) reject(new Error('Origin HTTPS health check failed'));
      else { console.log(JSON.stringify({ originCertificateVerified: true, originStatus: res.statusCode })); resolve(); }
    });
    req.on('timeout', () => req.destroy(new Error('Origin TLS timeout')));
    req.on('error', () => reject(new Error('Origin TLS verification failed; SSL setting unchanged')));
    req.end();
  });
}

async function main() {
  if (!['inspect', 'apply', 'verify', 'cache', 'cache-update', 'verify-cache', 'purge-public', 'purge-site'].includes(operation)) throw new Error('Unsupported mode');
  const userId = process.env.DEPLOY_USER_ID;
  const credentialId = process.env.DEPLOY_CREDENTIAL_ID;
  if (!userId || !credentialId) throw new Error('Missing operator credential scope');
  const row = await db.query.cloudflareAccounts.findFirst({ where: and(eq(cloudflareAccounts.id, credentialId), eq(cloudflareAccounts.userId, userId)) });
  if (!row?.isActive) throw new Error('Credential missing or inactive');
  const secret = decrypt(row.credentialEncrypted);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (row.authType === 'apiToken') headers.Authorization = `Bearer ${secret}`;
  else { headers['X-Auth-Email'] = row.email!; headers['X-Auth-Key'] = secret; }
  async function cf<T = any>(url: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await fetch(`https://api.cloudflare.com/client/v4${url}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(25000),
    });
    const result = await response.json() as { success: boolean; result: T; errors?: Array<{ code: number }> };
    if (!response.ok || result.success !== true) throw new CfError(response.status, result.errors?.map((item) => item.code) ?? []);
    return result.result;
  }
  const zone = await cf(prefix);
  if (zone.id !== zoneId || zone.name !== domain || zone.account?.id !== accountId || zone.status !== 'active') throw new Error('Zone identity/status mismatch');
  async function getPhase(phase: Phase): Promise<Ruleset | null> {
    try { return await cf(`${prefix}/rulesets/phases/${phase}/entrypoint`); }
    catch (e) { if (e instanceof CfError && e.status === 404) return null; throw e; }
  }
  const before: Record<string, Ruleset | null> = {};
  for (const phase of phases) before[phase] = await getPhase(phase);
  const oldSettings = await cf<Array<{ id: string; value: unknown }>>(`${prefix}/settings`);
  console.log(JSON.stringify({ domain, zoneId, plan: zone.plan?.name, mode: operation,
    settings: oldSettings.filter((s) => Object.hasOwn(settings, s.id)),
    rulesets: Object.fromEntries(phases.map((phase) => [phase, { id: before[phase]?.id, rules: before[phase]?.rules.map((r) => ({ id: r.id, ref: r.ref, action: r.action, enabled: r.enabled, expression: r.expression })) ?? [] }])) }));
  if (operation === 'inspect') return;
  if (operation === 'purge-public' || operation === 'purge-site') {
    // Whole-site purge is for shared header/theme changes and is strictly
    // scoped to the verified HomeVietPro zone, never account-wide.
    await cf(`${prefix}/purge_cache`, 'POST', operation === 'purge-site'
      ? { purge_everything: true }
      : { files: publicPaths.map((pathname) => `https://${domain}${pathname}`) });
    console.log(operation === 'purge-site' ? `Purged only zone ${domain}` : 'Purged only the public landing-page URLs'); return;
  }
  if (operation === 'cache' || operation === 'cache-update' || operation === 'verify-cache') {
    const cachePhase = 'http_request_cache_settings';
    const current = before[cachePhase];
    const privateRule = current?.rules.find((r) => r.ref === 'homevietpro_wp_private_bypass');
    if (!current || !privateRule || privateRule.action_parameters?.cache !== false || !privateRule.enabled) throw new Error('Private-content bypass must be active before guest caching');
    if (privateRule.expression !== planned.find((p) => p.rule.ref === privateRule.ref)?.rule.expression) throw new Error('Private-content bypass has drifted');
    function verifyCache(ruleset: Ruleset) {
      const privateIndex = ruleset.rules.findIndex((r) => r.id === privateRule!.id);
      for (const intended of homevietproCacheRules) {
        const index = ruleset.rules.findIndex((r) => r.ref === intended.ref);
        const actual = ruleset.rules[index];
        if (index < 0 || index >= privateIndex || actual.expression !== intended.expression || actual.action !== intended.action ||
            !actual.enabled || !isDeepStrictEqual(actual.action_parameters, intended.action_parameters)) throw new Error(`Cache policy/order mismatch: ${intended.ref}`);
      }
    }
    if (operation === 'verify-cache') { verifyCache(current); console.log('Guest cache rules and protective ordering verified'); return; }
    for (const intended of homevietproCacheRules) {
      const existing = current.rules.find((r) => r.ref === intended.ref);
      if (operation !== 'cache-update' && existing && (existing.expression !== intended.expression || existing.action !== intended.action || !isDeepStrictEqual(existing.action_parameters, intended.action_parameters) || !existing.enabled)) throw new Error(`Existing cache rule differs: ${intended.ref}`);
    }
    const additions = homevietproCacheRules.filter((r) => !current.rules.some((e) => e.ref === r.ref));
    if (zone.plan?.legacy_id === 'free' && current.rules.length + additions.length > 10) throw new Error('Cache rule quota insufficient');
    const directory = path.resolve('.deployment-backups', domain);
    await fs.mkdir(directory, { recursive: true });
    const stamp = Date.now();
    await fs.writeFile(path.join(directory, `cache-before-${stamp}.json`), JSON.stringify({ domain, zoneId, ruleset: current }, null, 2), { flag: 'wx', mode: 0o600 });
    if (operation === 'cache-update') {
      if (additions.length) throw new Error('cache-update requires all managed cache rules to exist');
      // Establish the stricter bypass first; enable guest HTML last. Never edit
      // unrelated rules. Each request includes a complete rule payload.
      const updates = [...homevietproCacheRules].sort((a, b) => Number(b.action_parameters.cache === false) - Number(a.action_parameters.cache === false));
      const updatedIds: string[] = [];
      for (const intended of updates) {
        const existing = current.rules.find((r) => r.ref === intended.ref)!;
        await cf(`${prefix}/rulesets/${current.id}/rules/${existing.id}`, 'PATCH', intended);
        updatedIds.push(existing.id);
        await fs.writeFile(path.join(directory, `cache-updated-${stamp}.json`), JSON.stringify({ domain, zoneId, rulesetId: current.id, updatedIds }, null, 2), { mode: 0o600 });
      }
      const updated = await getPhase(cachePhase);
      if (!updated) throw new Error('Cache ruleset missing after update');
      verifyCache(updated);
      console.log(JSON.stringify({ cacheUpdated: true, snapshot: `cache-before-${stamp}.json` }));
      return;
    }
    const created: Array<{ ref: string; id: string }> = [];
    for (const rule of additions) {
      const result = await cf<Ruleset>(`${prefix}/rulesets/${current.id}/rules`, 'POST', { ...rule, position: { before: privateRule.id } });
      const added = result.rules.find((r) => r.ref === rule.ref);
      if (!added) throw new Error('New cache rule missing from response');
      created.push({ ref: rule.ref, id: added.id });
      await fs.writeFile(path.join(directory, `cache-applied-${stamp}.json`), JSON.stringify({ domain, zoneId, rulesetId: current.id, created }, null, 2), { mode: 0o600 });
      console.log(JSON.stringify({ addedCacheRule: rule.ref, id: added.id }));
    }
    const updated = await getPhase(cachePhase);
    if (!updated) throw new Error('Cache ruleset missing after apply');
    verifyCache(updated);
    console.log(JSON.stringify({ cacheConfigured: true, existingPrivateBypassPreserved: true, snapshot: `cache-before-${stamp}.json` }));
    return;
  }
  if (operation === 'verify') {
    for (const { phase, rule } of planned) {
      const actual = before[phase]?.rules.find((r) => r.ref === rule.ref);
      if (!actual || actual.expression !== rule.expression || actual.action !== rule.action || actual.enabled !== true) throw new Error(`Rule verification failed: ${rule.ref}`);
      if (rule.ratelimit && ['period', 'requests_per_period', 'mitigation_timeout'].some((key) => actual.ratelimit?.[key] !== rule.ratelimit?.[key])) throw new Error('Rate policy mismatch');
      if (rule.action_parameters && actual.action_parameters?.cache !== false) throw new Error('Cache policy mismatch');
    }
    for (const [name, value] of Object.entries(settings)) if (oldSettings.find((s) => s.id === name)?.value !== value) throw new Error(`Setting verification failed: ${name}`);
    console.log('All intended WordPress rules and settings verified'); return;
  }

  // Before any mutation, inspect all DNS records for unintended rate-rule scope.
  const dns = await cf<Array<{ name: string; type: string; content: string; proxied: boolean }>>(`${prefix}/dns_records?per_page=5000`);
  const web = dns.filter((r) => ['A', 'AAAA', 'CNAME'].includes(r.type));
  if (web.some((r) => r.name !== domain)) throw new Error('Other web hostnames exist: review Free rate-limiting scope before applying');
  const roots = web.filter((r) => r.name === domain && ['A', 'AAAA'].includes(r.type));
  if (!roots.length || roots.some((r) => !r.proxied)) throw new Error('Root hostname must already be proxied');
  for (const root of roots) await checkOrigin(root.content);
  // Preserve unknown rules and refuse edits to rules that changed since our plan.
  for (const { phase, rule } of planned) {
    const same = before[phase]?.rules.find((r) => r.ref === rule.ref);
    if (same && (same.expression !== rule.expression || same.action !== rule.action || same.enabled !== true)) throw new Error(`Existing rule differs: ${rule.ref}`);
  }
  if (zone.plan?.legacy_id === 'free') {
    for (const [phase, limit] of [['http_request_firewall_custom', 5], ['http_ratelimit', 1], ['http_request_cache_settings', 10]] as const) {
      const additions = planned.filter((p) => p.phase === phase && !before[phase]?.rules.some((r) => r.ref === p.rule.ref)).length;
      if ((before[phase]?.rules.length ?? 0) + additions > limit) throw new Error(`Insufficient rule quota: ${phase}`);
    }
  }
  const directory = path.resolve('.deployment-backups', domain);
  await fs.mkdir(directory, { recursive: true });
  const stamp = Date.now();
  const backup = path.join(directory, `before-${stamp}.json`);
  await fs.writeFile(backup, JSON.stringify({ domain, zoneId, accountId, settings: oldSettings, rulesets: before, planned }, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(`Backup saved: ${path.relative(process.cwd(), backup)}`);
  const changes: Array<{ type: string; [key: string]: unknown }> = [];
  const journal = path.join(directory, `applied-${stamp}.json`);
  async function record(change: typeof changes[number]) {
    changes.push(change); await fs.writeFile(journal, JSON.stringify({ domain, zoneId, backup, changes }, null, 2), { mode: 0o600 });
  }
  for (const { phase, rule } of planned) {
    const current = await getPhase(phase);
    if (current?.rules.some((r) => r.ref === rule.ref)) { console.log(JSON.stringify({ alreadyApplied: rule.ref })); continue; }
    const result = current
      ? await cf<Ruleset>(`${prefix}/rulesets/${current.id}/rules`, 'POST', rule)
      : await cf<Ruleset>(`${prefix}/rulesets`, 'POST', { name: 'HomeVietPro WordPress protection', kind: 'zone', phase, rules: [rule] });
    const added = result.rules.find((r) => r.ref === rule.ref);
    if (!added) throw new Error(`Cloudflare response missing new rule: ${rule.ref}`);
    await record({ type: 'rule', phase, rulesetId: result.id, ruleId: added.id, ref: rule.ref, newRuleset: !current });
    console.log(JSON.stringify({ added: rule.ref, action: rule.action, id: added.id }));
  }
  for (const [name, value] of Object.entries(settings)) {
    const old = oldSettings.find((s) => s.id === name)?.value;
    if (old === value) continue;
    await cf(`${prefix}/settings/${name}`, 'PATCH', { value });
    await record({ type: 'setting', name, old, value });
    console.log(JSON.stringify({ setting: name, value }));
    // Origin was verified first. Revert this setting if the public site stops working.
    let healthy = false;
    try {
      const probe = await fetch(`https://${domain}/`, { headers: { 'User-Agent': 'Mozilla/5.0 HomeVietPro-Security-Check/1.0' }, signal: AbortSignal.timeout(20000) });
      healthy = probe.ok; await probe.body?.cancel();
    } catch { /* safe rollback below */ }
    if (!healthy) {
      await cf(`${prefix}/settings/${name}`, 'PATCH', { value: old });
      await record({ type: 'setting-restored', name, value: old });
      throw new Error(`Public health failed; restored setting ${name}. Review rule journal before retrying.`);
    }
  }
  console.log(JSON.stringify({ applied: true, domain, journal: path.relative(process.cwd(), journal) }));
}

try { await main(); }
catch (e) {
  let cause: unknown = e;
  const errorCodes: string[] = [];
  for (let i = 0; i < 5 && cause && typeof cause === 'object'; i++) {
    if ('code' in cause && typeof cause.code === 'string' && /^[A-Z0-9_]{3,40}$/.test(cause.code)) errorCodes.push(cause.code);
    cause = 'cause' in cause ? cause.cause : undefined;
  }
  console.error(e instanceof CfError ? JSON.stringify({ cfStatus: e.status, codes: e.codes }) :
    e instanceof Error && !('query' in e) && !('cause' in e) ? e.message : JSON.stringify({ failed: true, errorCodes }));
  process.exitCode = 1;
} finally { await pool.end(); }