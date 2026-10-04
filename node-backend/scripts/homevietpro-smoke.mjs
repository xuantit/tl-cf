/** Read-only public checks: no real session, login, form submission or WAF flood. */
import assert from 'node:assert/strict';

const base = 'https://homevietpro.com';
const publicPaths = ['/', '/en/', '/gioi-thieu/', '/lien-he/'];
async function get(path, headers = {}) {
  const response = await fetch(base + path, {
    redirect: 'manual', signal: AbortSignal.timeout(20000),
    headers: { 'User-Agent': 'Mozilla/5.0 HomeVietPro-Cache-Check/1.0', ...headers },
  });
  return { response, body: await response.text() };
}
for (const path of publicPaths) {
  const states = [];
  for (let i = 0; i < 2; i++) {
    const { response, body } = await get(path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.has('set-cookie'), false, `Public page sets cookie: ${path}`);
    assert.ok(!body.includes('id="wpadminbar"'), `Admin toolbar in guest HTML: ${path}`);
    const header = body.match(/<header\b[^>]*class="hvp-header"[^>]*>[\s\S]*?<\/header>/)?.[0];
    assert.ok(header, `Missing header: ${path}`);
    assert.match(header, /src="https:\/\/homevietpro\.com\/wp-content\/uploads\/2026\/09\/logo-homevietpro\.png"/);
    assert.ok(!header.includes('One-Stop Home'), 'Old brand text remains');
    if (path === '/lien-he/') {
      assert.match(body, /<h1>Liên hệ<\/h1>/);
      assert.match(body, /href="https:\/\/zalo\.me\/0988767696"[^>]*>Liên hệ qua Zalo<\/a>/);
      assert.ok(!body.includes('vui lòng xác nhận tài khoản') && !body.includes('homevietpro_consultation'));
    }
    states.push(response.headers.get('cf-cache-status'));
  }
  assert.ok(states.includes('HIT'), `Guest page did not HIT: ${path}: ${states}`);
  console.log(JSON.stringify({ path, guestCache: states, contentVerified: true }));
}

const privateCases = [
  { path: '/', headers: { Cookie: 'wordpress_logged_in_probe=not-a-real-session' } },
  { path: '/', headers: { Cookie: 'arbitrary_preference=probe' } },
  ...['Authorization', 'authorization', 'AUTHORIZATION', 'AuThOrIzAtIoN'].map(name => ({
    path: '/', headers: { [name]: 'Bearer not-a-real-token' },
  })),
  { path: '/?preview=true', headers: {} },
  { path: '/?preview_id=123', headers: {} },
  { path: '/?utm_source=cache-check', headers: {} },
  { path: '/wp-json/', headers: {} },
  { path: '/wp-admin/admin-ajax.php', headers: {} },
];
for (const { path, headers } of privateCases) {
  const { response } = await get(path, headers);
  const cache = response.headers.get('cf-cache-status');
  assert.ok(['DYNAMIC', 'BYPASS'].includes(cache), `Unsafe/unknown cache status: ${path}: ${cache}`);
  // Check the requested preview response, not the public destination of a 301.
  assert.equal(response.status, path.includes('admin-ajax') ? 400 : path === '/?preview=true' ? 301 : 200);
  console.log(JSON.stringify({ path, kind: Object.keys(headers)[0] || 'dynamic-path', status: response.status, cache }));
}
const image = await fetch(base + '/wp-content/uploads/2026/09/logo-homevietpro.png', {
  headers: { Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' }, signal: AbortSignal.timeout(20000),
});
assert.equal(image.status, 200);
assert.match(image.headers.get('content-type') || '', /^image\/png\b/);
assert.equal(Buffer.from(await image.arrayBuffer()).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
console.log('Public content, PNG signature, guest HIT and private bypass checks passed.');