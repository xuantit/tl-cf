/** Capture real frontend components using an isolated browser and synthetic API fixtures.
 * No production login, credentials, DB access or real backend requests.
 * See docs/screenshots/README.md for setup and reproduction.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(root, 'frontend/node_modules/.cache/readme-tools/node_modules/playwright'));
const base = process.env.SCREENSHOT_BASE_URL || 'http://localhost:5199';
const origin = new URL(base);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname), 'Only a local frontend may be captured');
const output = path.join(root, 'docs/screenshots');
await fs.mkdir(output, { recursive: true });

const accountId = 'screenshot-account';
const account = { id: accountId, label: 'Demo Workspace', email: 'demo@example.com', authType: 'apiToken', isActive: true, domainsCount: 6 };
const zones = [
  { id: 'demo-zone-1', name: 'example.com', status: 'active', plan: 'pro', sslMode: 'strict', tags: ['production', 'website'] },
  { id: 'demo-zone-2', name: 'example.net', status: 'active', plan: 'free', sslMode: 'full', tags: ['staging'] },
  { id: 'demo-zone-3', name: 'example.org', status: 'active', plan: 'business', sslMode: 'strict', tags: ['production', 'api'] },
  { id: 'demo-zone-4', name: 'docs.example.com', status: 'active', plan: 'free', sslMode: 'strict', tags: ['docs'] },
  { id: 'demo-zone-5', name: 'shop.example.net', status: 'pending', plan: 'pro', sslMode: 'full', tags: ['shop'] },
  { id: 'demo-zone-6', name: 'status.example.org', status: 'active', plan: 'free', sslMode: 'strict', tags: ['monitoring'] },
];
const dns = [
  { id: 'dns-1', type: 'A', name: 'example.com', content: '192.0.2.10', ttl: 1, proxied: true },
  { id: 'dns-2', type: 'CNAME', name: 'www.example.com', content: 'example.com', ttl: 1, proxied: true },
  { id: 'dns-3', type: 'CNAME', name: 'api.example.com', content: 'api.example.net', ttl: 1, proxied: true },
  { id: 'dns-4', type: 'MX', name: 'example.com', content: 'mail.example.com', ttl: 3600, proxied: false, priority: 10 },
  { id: 'dns-5', type: 'TXT', name: 'example.com', content: 'v=spf1 -all', ttl: 3600, proxied: false },
];
const summary = {
  zones: { total: 6, active: 5, pending: 1, moved: 0, other: 0, sslOff: 0 },
  attention: { pendingNs: 1, sslOff: 0, devMode: 0 },
  planDistribution: [{ plan: 'free', count: 3 }, { plan: 'pro', count: 2 }, { plan: 'business', count: 1 }],
  accounts: [{ ...account, domainCount: 6 }],
  jobs7d: { total: 24, succeeded: 23, failed: 1 },
  recentChanges: [
    { id: 'change-1', action: 'dns.update', status: 'done', createdAt: '2026-10-23T10:30:00Z', itemCount: 2, zoneId: 'demo-zone-1' },
    { id: 'change-2', action: 'config.copy', status: 'done', createdAt: '2026-10-23T09:15:00Z', itemCount: 3, zoneId: 'demo-zone-2' },
    { id: 'change-3', action: 'bulk-purge', status: 'done', createdAt: '2026-10-22T14:00:00Z', itemCount: 4, zoneId: 'demo-zone-3' },
    { id: 'change-4', action: 'domain.clone', status: 'error', createdAt: '2026-10-22T08:30:00Z', itemCount: 1, zoneId: 'demo-zone-5' },
  ],
};
const fixtures = new Map([
  ['/cf/accounts', [account]],
  ['/domains', zones],
  ['/dashboard/summary', summary],
  ['/domains/demo-zone-1', { ...zones[0], nameServers: ['ns1.example.net', 'ns2.example.net'], savedSettings: { sslMode: 'strict', tags: zones[0].tags } }],
  ['/domains/demo-zone-1/dns', dns],
  ['/domains/demo-zone-1/rules', []],
  ['/analytics/zone/demo-zone-1', { totals: { requests: 84200, bytes: 2540000000, cachedRequests: 71600, cacheHitRatio: .85, savedBytes: 2160000000 }, series: [], range: '24h' }],
]);

const browser = await chromium.launch({
  // Reuse installed Edge on Windows; elsewhere use Playwright's installed Chromium.
  ...(process.platform === 'win32' ? { channel: 'msedge' } : {}),
  headless: true,
});
const captures = [
  { name: 'workspace-dark.png', route: '/', dark: true, width: 1440, height: 1050, ready: '.ant-table-tbody tr[data-row-key="demo-zone-6"]' },
  { name: 'workspace-light.png', route: '/', dark: false, width: 1440, height: 1050, ready: '.ant-table-tbody tr[data-row-key="demo-zone-6"]' },
  { name: 'overview.png', route: '/overview', dark: true, width: 1440, height: 900, ready: '.overview-stats' },
  { name: 'dns-editor.png', route: '/domains/demo-zone-1?tab=dns&modal=dns-edit&edit=dns-1', dark: true, width: 1440, height: 900, ready: 'aside[aria-hidden="false"] input[value="192.0.2.10"]' },
  { name: 'mobile.png', route: '/', dark: false, width: 390, height: 844, ready: '.workspace-shortcuts' },
];
try {
  for (const shot of captures) {
    const context = await browser.newContext({
      viewport: { width: shot.width, height: shot.height }, deviceScaleFactor: 1,
      locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh', reducedMotion: 'reduce',
      colorScheme: shot.dark ? 'dark' : 'light', serviceWorkers: 'block',
    });
    const unexpected = [];
    const pageErrors = [];
    // Fixtures intercept BEFORE any request can leave the browser. Unknown API calls
    // are rejected and fail the capture instead of falling through to a real account.
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        const endpoint = url.pathname.slice(4) || '/';
        if (route.request().method() !== 'GET' || !fixtures.has(endpoint)) {
          unexpected.push(`${route.request().method()} ${endpoint}`);
          return route.fulfill({ status: 501, contentType: 'application/json', body: JSON.stringify({ detail: 'Screenshot fixture missing' }) });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': origin.origin }, body: JSON.stringify(fixtures.get(endpoint)) });
      }
      if (url.origin === origin.origin || ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.continue();
      return route.abort('blockedbyclient');
    });
    // No valid server token: only a client-side fixture for ProtectedRoute rendering.
    const fakeToken = `screenshot.${Buffer.from(JSON.stringify({ userId: 'screenshot-user', email: 'demo@example.com', role: 'admin' })).toString('base64url')}.not-a-valid-signature`;
    await context.addInitScript(({ token, dark, accountId }) => {
      localStorage.setItem('auth-token', JSON.stringify({ state: { token }, version: 0 }));
      localStorage.setItem('active-account', JSON.stringify({ state: { activeAccountId: accountId }, version: 0 }));
      localStorage.setItem('app-theme', JSON.stringify({ state: { dark }, version: 0 }));
      localStorage.setItem('app-language', 'vi');
    }, { token: fakeToken, dark: shot.dark, accountId });
    const page = await context.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(new URL(shot.route, base).href, { waitUntil: 'networkidle' });
    await page.locator(shot.ready).waitFor({ state: 'visible' });
    await page.evaluate(() => document.fonts.ready);
    if (shot.route === '/' && shot.width >= 1024) {
      await page.getByRole('button', { name: 'Công cụ Cloudflare', exact: true }).first().evaluate(button => button.click());
    }
    await page.locator('main').evaluate(element => element.scrollTo(0, 0));
    assert.deepEqual(unexpected, [], `Unmocked API requests: ${shot.name}`);
    assert.deepEqual(pageErrors, [], `Page errors: ${shot.name}`);
    assert.equal(await page.locator('[role="alert"]').count(), 0, `Unexpected alert: ${shot.name}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Page overflow: ${shot.name}`);
    await page.screenshot({ path: path.join(output, shot.name), type: 'png', animations: 'disabled', fullPage: false });
    console.log(`Captured ${shot.name} (${shot.width}x${shot.height}) — synthetic data, no live API`);
    await context.close();
  }
} finally {
  await browser.close();
}