/** Narrow guest-only cache policy for the approved landing site. */
export const publicPaths = ['/', '/en/', '/gioi-thieu/', '/lien-he/'];
const host = '(http.host eq "homevietpro.com")';
// Header names retain their original case on HTTP/1.1; fail closed if truncated.
const authorized = 'any(lower(http.request.headers.names[*])[*] eq "authorization")';
const guest = `(http.cookie eq "" and not ${authorized} and not http.request.headers.truncated)`;

export const homevietproCacheRules = [
  {
    ref: 'homevietpro_static_assets', description: 'HomeVietPro: cache public CSS JS images fonts; respect origin',
    enabled: true, action: 'set_cache_settings',
    expression: `${host} and ${guest} and (starts_with(http.request.uri.path, "/wp-content/") or starts_with(http.request.uri.path, "/wp-includes/")) and not lower(http.request.uri.path) contains ".php" and (http.request.uri.path.extension in {"css" "js" "png" "jpg" "jpeg" "webp" "avif" "gif" "svg" "ico" "woff" "woff2" "ttf"})`,
    action_parameters: { cache: true, edge_ttl: { mode: 'respect_origin' }, browser_ttl: { mode: 'respect_origin' } },
  },
  {
    ref: 'homevietpro_guest_pages', description: 'HomeVietPro: cache allowlisted guest landing pages; respect origin',
    enabled: true, action: 'set_cache_settings',
    expression: `${host} and ${guest} and http.request.uri.query eq "" and (http.request.uri.path in {${publicPaths.map((p) => JSON.stringify(p)).join(' ')}})`,
    // No override TTL: preserve private/no-store and Set-Cookie protections. If
    // origin has no Cache-Control, Cloudflare default edge TTL applies (200:2h).
    action_parameters: { cache: true, edge_ttl: { mode: 'respect_origin' }, browser_ttl: { mode: 'respect_origin' } },
  },
  {
    ref: 'homevietpro_session_bypass', description: 'HomeVietPro: bypass all cookies authorization and write requests',
    enabled: true, action: 'set_cache_settings',
    expression: `${host} and (http.cookie ne "" or ${authorized} or http.request.headers.truncated or not http.request.method in {"GET" "HEAD"})`,
    action_parameters: { cache: false },
  },
];