import type { FormValues, RuleKind } from './ruleFields'

/**
 * Gợi ý cấu hình phổ biến — điền nhanh expression + settings, người dùng vẫn
 * sửa lại được trước khi lưu. KHÔNG thay thế cho form: mọi thiết lập của
 * Cloudflare vẫn có mặt đầy đủ trong form.
 *
 * Nguồn (kiểm tra 2026-08-13):
 *  - Cache Rules examples: https://developers.cloudflare.com/cache/how-to/cache-rules/examples/
 *    (Bypass Cache on Cookie, Cache Everything, Cache Everything while ignoring
 *     query strings, Query String Sort, Cache Deception Armor, Edge/Browser TTL)
 *  - Cache keys: https://developers.cloudflare.com/cache/how-to/cache-keys/
 *    ("To ignore query strings, use exclude: *")
 *  - Configuration Rules examples: https://developers.cloudflare.com/rules/configuration-rules/examples/
 *    (tắt Email Obfuscation + Browser Integrity Check cho request API)
 *  - Redirect examples: https://developers.cloudflare.com/rules/url-forwarding/examples/
 *    (WWW ↔ root, đổi domain, đổi URL trang, Remove locale from URL path dùng
 *     regex_replace(field, "regex", "/${1}"))
 *  - Công thức WordPress/WooCommerce phổ biến trên Cloudflare Community: bỏ cache
 *    /wp-admin, /wp-login.php, /wp-json, wp-cron.php, xmlrpc.php, giỏ hàng/thanh
 *    toán/tài khoản và cookie phiên (wordpress_logged_in_, wp-postpass_,
 *    woocommerce_items_in_cart, comment_author_); Under Attack cho trang đăng
 *    nhập; tắt Rocket Loader ở khu quản trị và API.
 */

export interface RulePresetResult {
  description: string
  expression: string
  values: FormValues
  /** action_parameters không có field riêng (đưa vào ô JSON nâng cao). */
  advanced?: Record<string, unknown>
}

export interface RulePreset {
  key: string
  kind: RuleKind
  label: string
  /** Giải thích ngắn: khi nào nên dùng, rủi ro cần biết. */
  hint: string
  build: (zoneName: string) => RulePresetResult
}

const STATIC_EXTENSIONS =
  '"css" "js" "mjs" "jpg" "jpeg" "png" "gif" "webp" "avif" "svg" "ico" "woff" "woff2" "ttf" "otf" "eot" "mp4" "webm" "pdf" "zip"'

/** Đường dẫn quản trị/động của WordPress + WooCommerce. */
const WP_ADMIN_PATHS = [
  'starts_with(http.request.uri.path, "/wp-admin")',
  'starts_with(http.request.uri.path, "/wp-login")',
  'starts_with(http.request.uri.path, "/wp-json")',
  'http.request.uri.path in {"/wp-cron.php" "/xmlrpc.php"}',
  'starts_with(http.request.uri.path, "/cart")',
  'starts_with(http.request.uri.path, "/checkout")',
  'starts_with(http.request.uri.path, "/my-account")',
]

const WP_SESSION_COOKIES = [
  'http.cookie contains "wordpress_logged_in_"',
  'http.cookie contains "wp-postpass_"',
  'http.cookie contains "woocommerce_items_in_cart"',
  'http.cookie contains "woocommerce_cart_hash"',
  'http.cookie contains "comment_author_"',
]

const zoneOr = (zoneName: string) => zoneName || 'example.com'
const host = (zoneName: string) => `http.host eq "${zoneOr(zoneName)}"`

export const RULE_PRESETS: RulePreset[] = [
  // ─── Cache Rules ────────────────────────────────────────────────────────────
  {
    key: 'cache-static-assets',
    kind: 'cache',
    label: 'Cache static assets aggressively',
    hint: 'Ảnh/CSS/JS/font: cache edge 1 tháng, trình duyệt 1 tuần. An toàn cho mọi site.',
    build: () => ({
      description: 'Cache static assets',
      expression: `(http.request.uri.path.extension in {${STATIC_EXTENSIONS}})`,
      values: {
        cache: 'true',
        edge_ttl_mode: 'override_origin',
        edge_ttl_default: 2592000,
        browser_ttl_mode: 'override_origin',
        browser_ttl_default: 604800,
        respect_strong_etags: 'true',
      },
    }),
  },
  {
    key: 'cache-bypass-wp-admin',
    kind: 'cache',
    label: 'Bypass cache for admin & dynamic paths (WordPress/WooCommerce)',
    hint: 'Đặt TRƯỚC rule cache HTML. Không cache /wp-admin, /wp-login, /wp-json, giỏ hàng, thanh toán.',
    build: () => ({
      description: 'Bypass cache - admin & dynamic paths',
      expression: `(${WP_ADMIN_PATHS.join(' or ')})`,
      values: { cache: 'false' },
    }),
  },
  {
    key: 'cache-bypass-on-cookie',
    kind: 'cache',
    label: 'Bypass cache on session cookie',
    hint: 'Không cache khi đã đăng nhập hoặc có hàng trong giỏ — tránh lộ nội dung cá nhân.',
    build: () => ({
      description: 'Bypass cache - logged in users',
      expression: `(${WP_SESSION_COOKIES.join(' or ')})`,
      values: { cache: 'false' },
    }),
  },
  {
    key: 'cache-html-guest',
    kind: 'cache',
    label: 'Cache HTML for guests (Cache Everything)',
    hint: 'Cache trang HTML cho khách chưa đăng nhập, edge TTL 4 giờ. Dùng kèm 2 rule bypass ở trên.',
    build: (zoneName) => ({
      description: 'Cache HTML for guest visitors',
      expression: `(${host(zoneName)} and not (${WP_ADMIN_PATHS.join(' or ')}) and not (${WP_SESSION_COOKIES.join(
        ' or ',
      )}))`,
      values: {
        cache: 'true',
        edge_ttl_mode: 'override_origin',
        edge_ttl_default: 14400,
        browser_ttl_mode: 'respect_origin',
      },
    }),
  },
  {
    key: 'cache-bypass-api',
    kind: 'cache',
    label: 'Bypass cache for API endpoints',
    hint: 'Không cache /api/* và /wp-json/* — tránh trả dữ liệu cũ cho ứng dụng.',
    build: () => ({
      description: 'Bypass cache - API',
      expression:
        '(starts_with(http.request.uri.path, "/api/") or starts_with(http.request.uri.path, "/wp-json/"))',
      values: { cache: 'false' },
    }),
  },
  {
    key: 'cache-ignore-query-strings',
    kind: 'cache',
    label: 'Cache Everything while ignoring query strings',
    hint: 'Bỏ query string khỏi cache key (utm_*, fbclid…) để tăng hit rate. Không dùng nếu tham số làm đổi nội dung.',
    build: (zoneName) => ({
      description: 'Cache everything - ignore query strings',
      expression: `(${host(zoneName)})`,
      values: { cache: 'true' },
      advanced: { cache_key: { custom_key: { query_string: { exclude: '*' } } } },
    }),
  },
  {
    key: 'cache-sort-query-string',
    kind: 'cache',
    label: 'Sort query string + Cache deception armor',
    hint: 'Chuẩn hoá thứ tự tham số và chặn cache deception. Dùng được ở mọi gói.',
    build: (zoneName) => ({
      description: 'Normalize cache key',
      expression: `(${host(zoneName)})`,
      values: {
        cache: 'true',
        cache_key_ignore_query_strings_order: 'true',
        cache_key_cache_deception_armor: 'true',
      },
    }),
  },
  {
    key: 'cache-respect-origin',
    kind: 'cache',
    label: 'Respect origin cache-control headers',
    hint: 'Để origin quyết định TTL — hợp với site đã cấu hình cache-control chuẩn.',
    build: (zoneName) => ({
      description: 'Respect origin cache-control',
      expression: `(${host(zoneName)})`,
      values: { cache: 'true', edge_ttl_mode: 'respect_origin', browser_ttl_mode: 'respect_origin' },
    }),
  },

  // ─── Configuration Rules ────────────────────────────────────────────────────
  {
    key: 'config-under-attack-login',
    kind: 'configuration',
    label: 'Under Attack mode for login pages',
    hint: 'Thử thách cho /wp-login.php, /xmlrpc.php, /wp-admin — chặn brute-force mà không ảnh hưởng phần còn lại.',
    build: () => ({
      description: 'Under Attack - login pages',
      expression:
        '(http.request.uri.path in {"/wp-login.php" "/xmlrpc.php"} or starts_with(http.request.uri.path, "/wp-admin"))',
      values: { security_level: 'under_attack' },
    }),
  },
  {
    key: 'config-api-friendly',
    kind: 'configuration',
    label: 'API-friendly settings (disable Email Obfuscation & BIC)',
    hint: 'Ví dụ chính thức của Cloudflare: tắt Email Obfuscation + Browser Integrity Check cho /api/*.',
    build: () => ({
      description: 'API requests - disable obfuscation & BIC',
      expression: '(starts_with(http.request.uri.path, "/api/"))',
      values: { email_obfuscation: 'false', bic: 'false' },
    }),
  },
  {
    key: 'config-disable-rocket-loader-admin',
    kind: 'configuration',
    label: 'Disable Rocket Loader on admin & API',
    hint: 'Rocket Loader hay làm vỡ JS trong trang quản trị — tắt riêng cho khu vực đó.',
    build: () => ({
      description: 'Disable Rocket Loader - admin & API',
      expression:
        '(starts_with(http.request.uri.path, "/wp-admin") or starts_with(http.request.uri.path, "/api/") or starts_with(http.request.uri.path, "/wp-json/"))',
      values: { rocket_loader: 'false' },
    }),
  },
  {
    key: 'config-disable-analytics-admin',
    kind: 'configuration',
    label: 'Disable RUM & Zaraz on admin area',
    hint: 'Không đo đạc lượt truy cập của chính bạn trong trang quản trị.',
    build: () => ({
      description: 'Disable RUM & Zaraz - admin',
      expression: '(starts_with(http.request.uri.path, "/wp-admin"))',
      values: { disable_rum: 'true', disable_zaraz: 'true' },
    }),
  },
  {
    key: 'config-ssl-strict',
    kind: 'configuration',
    label: 'Force SSL Full (strict)',
    hint: 'Yêu cầu chứng chỉ hợp lệ ở origin. Chỉ bật khi origin đã có chứng chỉ đúng, nếu không sẽ lỗi 526.',
    build: (zoneName) => ({
      description: 'Force SSL Full (strict)',
      expression: `(${host(zoneName)})`,
      values: { ssl: 'strict', automatic_https_rewrites: 'true' },
    }),
  },
  {
    key: 'config-disable-hotlink-assets',
    kind: 'configuration',
    label: 'Allow hotlinking for a public assets folder',
    hint: 'Tắt Hotlink Protection cho /assets/* khi muốn CDN/đối tác nhúng ảnh.',
    build: () => ({
      description: 'Allow hotlink - /assets',
      expression: '(starts_with(http.request.uri.path, "/assets/"))',
      values: { hotlink_protection: 'false' },
    }),
  },

  // ─── Redirect Rules ─────────────────────────────────────────────────────────
  {
    key: 'redirect-www-to-root',
    kind: 'redirect',
    label: 'Redirect WWW to root domain',
    hint: 'Gộp www về domain gốc, giữ nguyên path và query (301).',
    build: (zoneName) => ({
      description: 'WWW to root',
      expression: `(http.host eq "www.${zoneOr(zoneName)}")`,
      values: {
        redirect_kind: 'dynamic',
        target_url_expression: `concat("https://${zoneOr(zoneName)}", http.request.uri.path)`,
        status_code: '301',
        preserve_query_string: 'true',
      },
    }),
  },
  {
    key: 'redirect-root-to-www',
    kind: 'redirect',
    label: 'Redirect root domain to WWW',
    hint: 'Gộp domain gốc về www, giữ nguyên path và query (301).',
    build: (zoneName) => ({
      description: 'Root to WWW',
      expression: `(${host(zoneName)})`,
      values: {
        redirect_kind: 'dynamic',
        target_url_expression: `concat("https://www.${zoneOr(zoneName)}", http.request.uri.path)`,
        status_code: '301',
        preserve_query_string: 'true',
      },
    }),
  },
  {
    key: 'redirect-to-new-domain',
    kind: 'redirect',
    label: 'Redirect everything to a new domain',
    hint: 'Chuyển nhà sang domain mới, giữ nguyên đường dẫn và query. Nhớ sửa new-domain.example.',
    build: (zoneName) => ({
      description: 'Move to new domain',
      expression: `(${host(zoneName)})`,
      values: {
        redirect_kind: 'dynamic',
        target_url_expression: 'concat("https://new-domain.example", http.request.uri.path)',
        status_code: '301',
        preserve_query_string: 'true',
      },
    }),
  },
  {
    key: 'redirect-old-page',
    kind: 'redirect',
    label: 'Redirect an old page to a new URL',
    hint: 'Đổi đường dẫn một trang cụ thể mà không mất SEO.',
    build: (zoneName) => ({
      description: 'Old page to new URL',
      expression: '(http.request.uri.path eq "/contact-us/")',
      values: {
        redirect_kind: 'static',
        target_url_value: `https://${zoneOr(zoneName)}/contacts/`,
        status_code: '301',
      },
    }),
  },
  {
    key: 'redirect-old-prefix',
    kind: 'redirect',
    label: 'Redirect an old path prefix',
    hint: 'Ví dụ /blog/* → /news/*, giữ phần đuôi đường dẫn (dùng regex_replace như tài liệu CF).',
    build: (zoneName) => ({
      description: 'Old prefix to new prefix',
      expression: '(starts_with(http.request.uri.path, "/blog/"))',
      values: {
        redirect_kind: 'dynamic',
        target_url_expression: `concat("https://${zoneOr(
          zoneName,
        )}", regex_replace(http.request.uri.path, "^/blog/(.*)", "/news/\${1}"))`,
        status_code: '301',
        preserve_query_string: 'true',
      },
    }),
  },

  // ─── WAF Custom Rules (security) ───────────────────────────────────────
  {
    key: 'security-block-xmlrpc',
    kind: 'security',
    label: 'Block xmlrpc.php',
    hint: 'xmlrpc.php là mục tiêu brute-force phổ biến của WordPress — chặn hẳn nếu không dùng Jetpack/app mồi.',
    build: () => ({
      description: 'Block xmlrpc.php',
      expression: '(http.request.uri.path eq "/xmlrpc.php")',
      values: { security_action: 'block' },
    }),
  },
  {
    key: 'security-challenge-wp-login',
    kind: 'security',
    label: 'Challenge WordPress login',
    hint: 'Managed Challenge cho /wp-login.php — chặn bot brute-force, người thật vẫn vào được.',
    build: () => ({
      description: 'Challenge WordPress login',
      expression: '(http.request.uri.path contains "/wp-login.php")',
      values: { security_action: 'managed_challenge' },
    }),
  },
  {
    key: 'security-block-sensitive-files',
    kind: 'security',
    label: 'Block access to sensitive files',
    hint: 'Chặn dò quét wp-config, .env, .git — các file cấu hình không bao giờ nên lộ ra ngoài.',
    build: () => ({
      description: 'Block sensitive files',
      expression:
        '(http.request.uri.path contains "wp-config") or (http.request.uri.path contains ".env") or (http.request.uri.path contains ".git")',
      values: { security_action: 'block' },
    }),
  },
  {
    key: 'security-challenge-scrapers',
    kind: 'security',
    label: 'Challenge scraper user agents',
    hint: 'Managed Challenge cho các user agent scraper phổ biến (python-requests, Scrapy).',
    build: () => ({
      description: 'Challenge scraper user agents',
      expression:
        '(http.user_agent contains "python-requests") or (http.user_agent contains "Scrapy")',
      values: { security_action: 'managed_challenge' },
    }),
  },
  {
    key: 'security-block-country',
    kind: 'security',
    label: 'Block a country',
    hint: 'Chặn toàn bộ traffic từ một quốc gia — nhớ thay XX bằng mã ISO 3166-1 alpha-2 (vd CN, RU).',
    build: () => ({
      description: 'Block a country',
      expression: '(ip.geoip.country eq "XX")',
      values: { security_action: 'block' },
    }),
  },
  {
    key: 'security-challenge-admin-non-get',
    kind: 'security',
    label: 'Managed challenge for non-GET to admin',
    hint: 'Thử thách mọi request POST/PUT… vào khu /admin — giảm bot dò form mà không khoá hẳn.',
    build: () => ({
      description: 'Managed challenge - non-GET to admin',
      expression:
        '(http.request.uri.path contains "/admin") and (http.request.method ne "GET")',
      values: { security_action: 'managed_challenge' },
    }),
  },
]

export function presetsForKind(kind: RuleKind): RulePreset[] {
  return RULE_PRESETS.filter((preset) => preset.kind === kind)
}
