# Bảo vệ WordPress homevietpro.com trên Cloudflare

Ngày áp dụng: **2026-09-30**. Người dùng xác nhận: landing page WordPress, dùng Flatsome,
cho phép kiểm tra và áp dụng rule an toàn. Sau đó người dùng yêu cầu thêm cache Cloudflare,
sửa trang liên hệ sang Zalo và header chỉ dùng logo PNG trong suốt qua WordPress admin.
Không thay đổi tài khoản/mật khẩu WordPress, không cài/gỡ plugin.

## Phạm vi

- Zone: `homevietpro.com` / `b08604a917e34f3ea97d8bd560f48731`.
- Cloudflare account: `459ceb3207d328ef862aff603f79ed91`; gói **Free Website**.
- DNS tại thời điểm kiểm tra chỉ có một A record root, **Proxied**. Không có `www` và không tự thêm DNS.
- Custom WAF và cache rules chỉ match `http.host eq "homevietpro.com"`.
- Rate-limiting Free không hỗ trợ hostname filter; rule theo đường dẫn login áp dụng trong toàn zone. Hiện chỉ có root hostname. Nếu thêm subdomain sau này cần xem lại scope/bộ đếm.
- Không thay đổi zone `mmthui.xyz`, Cloudflare Tunnel hoặc bản deploy CF Tool.

## HTTPS

| Thiết lập | Trước | Sau |
| --- | --- | --- |
| SSL/TLS encryption | Flexible | **Full (strict)** |
| Always Use HTTPS | Off | **On** |
| Minimum TLS version | 1.0 | **1.2** |
| TLS 1.3 | On | Giữ nguyên |
| Automatic HTTPS Rewrites | On | Giữ nguyên |
| Browser Integrity Check | On | Giữ nguyên |

Trước khi đổi SSL đã kết nối trực tiếp origin qua TLS với SNI `homevietpro.com`,
bật xác minh certificate: **Let’s Encrypt hợp lệ, HEAD / trả 200**, chứng chỉ hết hạn
2026-12-09. Không suy luận origin an toàn chỉ từ chứng chỉ ở Cloudflare edge.
Chứng chỉ origin phải tiếp tục được gia hạn; Full (strict) sẽ từ chối khi chứng chỉ không hợp lệ.

Chưa bật HSTS/preload để tránh ràng buộc khó hoàn tác hoặc tác động các subdomain về sau.

## WAF đã thêm

Custom ruleset: `92ee448a75b140cea689f8bc467bb81f`.

| Rule ref | Hành động | Mục đích |
| --- | --- | --- |
| `homevietpro_wp_sensitive` | Block | Chặn đường dẫn .env/.git ở root, wp-config.php và biến thể backup, wp-config-sample.php, wp-content/debug.log và PHP/PHTML/PHAR trong uploads |
| `homevietpro_wp_xmlrpc` | Block | Chặn /xmlrpc.php và path suffix; không cần cho landing thông thường |
| `homevietpro_wp_login` | Managed Challenge | Bảo vệ /wp-login.php và path suffix, không challenge toàn bộ site/admin/API |

Rule IDs lần lượt:
- Sensitive: `8876542f759d4a5baac76eeaf61fdda4`.
- XML-RPC: `d50db9e3e5dd4c0ab391b9e7448c4a32`.
- Login: `478fa6f7bb664d80907ecdd6f39fb2bb`.

**XML-RPC:** nếu sau này dùng Jetpack, ứng dụng WordPress hoặc publish từ xa qua XML-RPC,
cần xem lại/tắt riêng rule XML-RPC; không tắt tất cả WAF.

Không chặn theo quốc gia/User-Agent rộng, không bật Under Attack toàn site,
không challenge trang chủ hoặc link Google/SEO. Đây là bộ **custom WAF**,
không phải tuyên bố đã bật bộ OWASP/managed rules trả phí.

## Rate limit đăng nhập

- Rule ref `homevietpro_wp_login_burst`, rule ID `30f6e871774440fca9c71bb21ecebdb3`.
- Ruleset: `5eb7f9f81b174a7381743a043e20a439`.
- Đường dẫn: `/wp-login.php` và path suffix, không phân biệt hoa/thường.
- **10 request / 10 giây / IP**, vượt ngưỡng Block **10 giây**.
- Đếm request theo giới hạn Free, không chỉ các lần nhập sai mật khẩu.
- Đã đối chiếu cấu hình API sau lưu. **Không flood login để kiểm tra thực tế**;
  Cloudflare counters có thể có độ trễ và không phải giới hạn tuyệt đối giữa các datacenter.
- Rule challenge có thể kết thúc request trước phase rate limit; cả hai là lớp bổ sung,
  không thay thế 2FA và giới hạn đăng nhập trong WordPress.

## Cache an toàn

- Ref `homevietpro_wp_private_bypass`, rule ID `3bc11301cb5d422c9d28d069517101ba`.
- Ruleset: `385b4fe4aadb47fa95886abb0759fe36`.
- Bypass cache cho wp-admin, wp-login, wp-json, wp-cron, wp-comments-post, XML-RPC,
  query rest_route/preview/wc-ajax và cookie đăng nhập/password-protected/comment/session.
- Đây chỉ là **bypass cache**, không phải Skip WAF hoặc mở quyền truy cập API.

### Cache bổ sung theo yêu cầu (đã bật)

Ba rule sau nằm **trước** private bypass ở trên; đã đối chiếu expression, enabled,
action parameters và thứ tự từ API. Tổng cộng 4/10 Cache Rules của gói Free.

| Ref | Rule ID | Phạm vi |
| --- | --- | --- |
| `homevietpro_static_assets` | `94d3539f907c40ceb6f5650773e3e2fe` | CSS/JS/ảnh/font công khai trong wp-content và wp-includes, loại đường dẫn chứa .php |
| `homevietpro_guest_pages` | `50e5834c77444c9892fefa995c8736f5` | HTML chỉ `/`, `/en/`, `/gioi-thieu/`, `/lien-he/`, không query, không cookie/Authorization |
| `homevietpro_session_bypass` | `711aac48b3ff48298c4cc81a6f9d70b8` | Bypass mọi cookie, Authorization bất kể hoa/thường, header bị cắt và method ngoài GET/HEAD |

- Edge TTL và browser TTL: **respect_origin**, không ghi đè private/no-store/Set-Cookie.
   Hiện bốn trang khách không gửi Cache-Control/Set-Cookie; Cloudflare dùng TTL mặc định
   cho phản hồi 200 (2 giờ). Không ép cache trình duyệt dài hạn cho HTML.
- Không bỏ query khỏi cache key, không gộp ngôn ngữ; không cache HTML toàn site.
- Chính sách mọi cookie bypass là cố ý thận trọng: cookie ngôn ngữ/consent/clearance
   cũng giảm cache hit ratio, nhưng không trộn nội dung theo phiên.
- Smoke đã phát hiện header HTTP/1.1 giữ nguyên chữ hoa/thường. Đã tạm tắt HTML cache,
   sửa nhận diện thành `any(lower(http.request.headers.names[*])[*] eq "authorization")`,
   rồi bật lại sau khi cập nhật bypass. Cả 4 biến thể Authorization đều **DYNAMIC**.
- Preview `?preview=true` trả 301 **DYNAMIC** về trang chủ; không nhầm HIT ở URL đích
   sau redirect thành cache của preview.
- Sau publish đã purge WordPress trước rồi Cloudflare. Purge bốn URL từng lần vẫn
   còn bản trang chủ cũ; cuối cùng purge **riêng zone homevietpro.com** và kiểm tra lại
   cả bốn trang **MISS → HIT**, với nội dung/header mới. Không purge các zone khác.

## Kết quả kiểm tra sau áp dụng

| Kiểm tra | Kết quả |
| --- | --- |
| HTTP root | 301 sang HTTPS |
| HTTPS trang chủ, giới thiệu, liên hệ | 200; nội dung HomeVietPro hiển thị |
| CSS static | 200 |
| /wp-json/ | 200, không challenge |
| /wp-admin/admin-ajax.php không action | 400 như baseline; không bị WAF block |
| /wp-login.php từ request chưa có clearance | 403 + `cf-mitigated: challenge` |
| /xmlrpc.php | 403 |
| /.env, /wp-config.php, uploads/security-check.php | HEAD 403; không đọc nội dung file nhạy cảm |
| Trang chủ với cookie kiểm thử không phải session thật | 200 DYNAMIC |
| Demo CF Tool ở zone khác | 200, Turnstile vẫn bật |

Người dùng đã hoàn tất xác minh và đăng nhập WordPress trong trình duyệt; đã lưu trang
và theme qua admin thành công. Không giải challenge tự động, không gửi tin nhắn Zalo,
không submit form hoặc flood login; chưa kiểm tra toàn bộ UX Builder.

## Liên hệ và logo (đã xuất bản)

- Page ID **42**, giữ URL **https://homevietpro.com/lien-he/** và template hiện có.
- Đổi tiêu đề/H1 thành **Liên hệ**; CTA **Liên hệ qua Zalo** trỏ đến
   **https://zalo.me/0988767696**. Giữ số điện thoại và địa chỉ có sẵn.
- Bỏ câu yêu cầu xác nhận tài khoản Zalo và shortcode form tư vấn chưa hoạt động.
- Header theme con **homevietpro** dùng ảnh gốc Media ID **271**: PNG **481×401**,
   đã kiểm tra MIME, PNG signature và alpha (137.923 pixel hoàn toàn trong suốt).
   Bỏ span chữ “HomeVietPro / One-Stop Home”; giữ link trang chủ, alt/aria-label HomeVietPro.
- Bỏ chuyển đổi responsive WebP riêng ở header; hook `litespeed_media_check_webp`
   loại đúng ảnh logo này khỏi chuyển đổi WebP của LiteSpeed. Không tắt tối ưu ảnh toàn site.
- Desktop 1440px và mobile 390px: không tràn ngang; CTA và menu mobile hoạt động.
- Kiểm tra độc lập không đăng nhập: bốn trang 200, header PNG mới, không có admin toolbar;
   contact đúng H1/link Zalo; cookie, Authorization, preview, REST/AJAX không HIT.
- Plugin **VDM Sync** đang hoạt động: cần mang thay đổi header và page 42 về nguồn
   triển khai WordPress trước lần đồng bộ local → online tiếp theo để tránh bị ghi đè.

## Backup và vận hành

- Script operator: [node-backend/scripts/harden-homevietpro.ts](node-backend/scripts/harden-homevietpro.ts).
- Modes: `inspect`, `apply`, `verify`; `cache` (thêm rule), `cache-update` (cập nhật riêng
   ba rule đã quản lý, backup trước và bypass trước), `verify-cache`; `purge-public`
   (bốn URL), `purge-site` (duy nhất zone HomeVietPro).
- Policy: [node-backend/scripts/homevietpro-cache-policy.ts](node-backend/scripts/homevietpro-cache-policy.ts).
- Smoke read-only: [node-backend/scripts/homevietpro-smoke.mjs](node-backend/scripts/homevietpro-smoke.mjs).
- Yêu cầu `DEPLOY_USER_ID`, `DEPLOY_CREDENTIAL_ID`; không lưu/in credential trong script hay output.
- Backup: [before-1790757596397.json](node-backend/.deployment-backups/homevietpro.com/before-1790757596397.json).
- Nhật ký thao tác: [applied-1790757596397.json](node-backend/.deployment-backups/homevietpro.com/applied-1790757596397.json).
- Trước thêm cache: [cache-before-1790758208174.json](node-backend/.deployment-backups/homevietpro.com/cache-before-1790758208174.json).
- Trước sửa ngoại lệ Authorization: [cache-before-1790758544939.json](node-backend/.deployment-backups/homevietpro.com/cache-before-1790758544939.json).
- Trang liên hệ gốc: [contact-42-before-20260930.html](node-backend/.deployment-backups/homevietpro.com/contact-42-before-20260930.html).
- Header gốc: [header-before-20260930.php](node-backend/.deployment-backups/homevietpro.com/header-before-20260930.php).
- Backup nằm trong thư mục bị loại khỏi Git. Snapshot chỉ chứa settings/rules, không API key hoặc IP origin.
- Nếu có false positive: tìm rule theo ID/ref trong **Security → Security rules**, tắt **riêng rule gây lỗi**,
  đối chiếu backup; không tắt proxy hay toàn WAF. Cache rule tại **Caching → Cache Rules**.
- Rollback cache: tắt riêng guest/static cache và purge zone; giữ các bypass an toàn.
   Rollback WordPress: khôi phục header backup và nội dung page 42 qua admin/revision,
   sau đó purge WordPress rồi Cloudflare và kiểm tra public lại.
- Không tự bật lại Flexible nếu chưa xác định vấn đề certificate/redirect; đó là hạ mức bảo mật.
- Chưa commit các file bổ sung; các thay đổi source khác đã có trước nhiệm vụ được giữ nguyên.

## Các lớp vẫn cần ở hosting/WordPress

1. Update WordPress, Flatsome và plugin; gỡ plugin/theme không dùng; bật 2FA cho admin.
2. Sao lưu có kiểm tra khôi phục, quyền file hợp lý và chặn PHP thực thi trong uploads ở webserver.
3. Chỉ cho Cloudflare/proxy hợp lệ truy cập origin (firewall/Authenticated Origin Pulls nếu phù hợp).
   **Chưa sửa firewall hosting**; người biết IP origin vẫn có thể bypass edge WAF nếu origin đang mở trực tiếp.
4. Chống spam form bằng Turnstile/plugin tương thích + xác minh server-side. Managed Challenge ở login
   **không tự tích hợp Turnstile vào form liên hệ WordPress**.
5. Theo dõi Security Events để điều chỉnh ngưỡng nếu nhiều người dùng chung IP hoặc tích hợp mới.