# Cloudflare API Permissions Guide

## Quyền API cần thiết cho các tính năng

### 1. **Tiered Cache Topology - Smart Tiered Caching**

**Endpoint:** `PATCH /zones/{zone_id}/cache/tiered_cache_smart_topology_enable`

**Quyền yêu cầu:**
- ✅ **Zone Settings: Write** HOẶC
- ✅ **Zone: Write**

**Lưu ý:**
- Smart Tiered Cache yêu cầu **Argo Tiered Caching** phải được bật trước
- Endpoint Argo: `PATCH /zones/{zone_id}/argo/tiered_caching` với `{"value": {"enabled": true}}`
- Có thể cần quyền **Account Settings: Edit** để bật Argo Tiered Caching

**Cách kiểm tra quyền:**
1. Vào Cloudflare Dashboard → My Profile → API Tokens
2. Xem token bạn đang dùng
3. Kiểm tra có một trong các quyền sau:
   - Zone → Zone Settings → Edit (hoặc Write)
   - Zone → Zone → Edit (hoặc Write)
   - Account → Account Settings → Edit (cho Argo Tiered Caching)

### 2. **Cache Rules**

**Endpoint:** Rulesets API - `POST/PUT /zones/{zone_id}/rulesets`

**Quyền yêu cầu:**
- ✅ **Zone → Cache Rules → Edit**
- ✅ **Account → Rulesets → Edit**
- ✅ **Account → Filter Lists → Edit** (nếu sử dụng filter lists)

**Lưu ý:**
- Cloudflare chỉ cho phép **1 zone-level ruleset** cho mỗi phase `http_request_cache_settings`
- Nếu đã có ruleset, phải **update** ruleset hiện có thay vì tạo mới

### 3. **Zone Settings (SSL Mode, Cache Level, etc.)**

**Endpoint:** `PATCH /zones/{zone_id}/settings/{setting_id}`

**Quyền yêu cầu:**
- ✅ **Zone → Zone Settings → Edit**

### 4. **DNS Management**

**Endpoint:** `POST/PUT/DELETE /zones/{zone_id}/dns_records`

**Quyền yêu cầu:**
- ✅ **Zone → DNS → Edit**

### 5. **Zone Creation**

**Endpoint:** `POST /zones`

**Quyền yêu cầu:**
- ✅ **Zone → Zone → Edit**
- ✅ **Account → Zone → Create** (có thể nằm trong Account Settings)

### 6. **Analytics theo domain (Domains → chọn domain → Analytics)**

**Endpoint:** `POST /graphql` (Cloudflare GraphQL Analytics API — `httpRequests1hGroups` / `httpRequests1dGroups`)

**Quyền yêu cầu:**
- ✅ **Zone → Analytics → Read**

**Lưu ý:**
- Nếu token thiếu quyền này, backend trả về **403** với mã lỗi `ANALYTICS_PERMISSION_MISSING` và frontend hiển thị banner "thiếu quyền".
- Không còn mục Analytics tổng trong menu hoặc biểu đồ all-zones ở Overview. Bộ chọn 24h/7d/30d, biểu đồ, status codes và countries dùng `GET /api/analytics/zone/{zoneId}` của domain đang mở.
- URL cũ `/analytics?zone={zoneId}&range=7d` chuyển vào domain tương ứng; `/analytics` không có zone chuyển về danh sách Domains. API summary cũ giữ tương thích nhưng giao diện không gọi nữa.
- Global API Key luôn có đủ quyền; chỉ API Token scoped mới cần thêm quyền này.
- Dữ liệu analytics được cache 60 giây phía backend để tránh rate limit.

### 7. **Workers & Pages (Công cụ Cloudflare → Workers & Pages)**

**Endpoints:**
- Workers scripts: `GET/DELETE /accounts/{account_id}/workers/scripts`, `GET .../scripts/{name}/content/v2`, `GET/PUT .../scripts/{name}/schedules`, `GET/POST .../scripts/{name}/subdomain`, `GET/PUT/DELETE .../scripts/{name}/secrets`
- Worker routes theo zone: `GET/POST/DELETE /zones/{zone_id}/workers/routes`
- Pages: `GET/DELETE /accounts/{account_id}/pages/projects` (+ `/deployments`, `/rollback`, `/retry`, `/domains`, PATCH env vars)

**Quyền yêu cầu:**
- ✅ **Account → Workers Scripts → Edit** (list/xoá script, đọc code, cron, subdomain, secrets)
- ✅ **Zone → Workers Routes → Edit** (quản lý route theo zone)
- ✅ **Account → Cloudflare Pages → Edit** (projects, deployments, rollback/retry, xoá project, domains, env vars)
- ✅ **Account → Account Settings → Read** (resolve account_id tự động)

**Lưu ý:**
- Xoá deployment production **đang live** sẽ bị CF từ chối — muốn dọn sạch phải xoá cả project (tool có nút "Xoá tất cả" + "Xoá project").
- Worker secrets là write-only: API không bao giờ trả về giá trị secret.

### 8. **Cloudflare Tunnels (Công cụ Cloudflare → Tunnels)**

**Endpoints:** `GET/POST/DELETE /accounts/{account_id}/cfd_tunnel` (+ `/configurations`, `/token`, `/connections`)

**Quyền yêu cầu:**
- ✅ **Account → Cloudflare Tunnel → Edit**
- ✅ **Zone → DNS → Edit** (tự tạo CNAME `{tunnel_id}.cfargotunnel.com` khi thêm public hostname)
- ✅ **Account → Account Settings → Read** (resolve account_id tự động)

**Lưu ý:**
- Token tunnel là bí mật (ai có token là chạy được connector) — tool chỉ hiển thị khi bấm Reveal và ghi audit log, không bao giờ ghi token vào log.
- Tunnel tạo qua tool là remotely-managed (`config_src: cloudflare`) — cấu hình ingress quản lý từ dashboard/tool, không cần file config.yml phía connector.

### 9. **Turnstile (Công cụ Cloudflare → Turnstile)**

**Endpoints:** `GET/POST /accounts/{account_id}/challenges/widgets`, `GET/PUT/DELETE .../{sitekey}`, `POST .../{sitekey}/rotate_secret`.

**Quyền tối thiểu:**
- Xem danh sách/chi tiết/secret: **Account → Turnstile Sites → Read** (API: `Turnstile Sites Read`).
- Tạo/sửa/xóa/xoay secret: **Account → Turnstile Sites → Edit/Write** (API: `Turnstile Sites Write`).
- **Account → Account Settings → Read** cho danh sách account tự động; nếu không cấp quyền này, nhập **Cloudflare Account ID** trực tiếp trong trang Turnstile.
- Scope token đến đúng account sở hữu widget. API cũng chấp nhận Account Settings Read/Write tương ứng, nhưng nên chọn quyền Turnstile tối thiểu.

**Lưu ý:**
- Account switcher của CF Tool chọn **credential đã lưu**; dropdown/ô Account ID trong trang Turnstile chọn **account thật bên Cloudflare**. Không mặc định lấy account đầu tiên khi token truy cập nhiều account.
- Menu **Công cụ Cloudflare** xổ xuống chứa Workers & Pages, Tunnels, Turnstile (cả sidebar và menu More trên mobile), không có tab ngang cấp hub. Các route `/tools/workers`, `/tools/tunnels`, `/tools/turnstile` và redirect URL cũ giữ nguyên query. Query `tab=pages` vẫn chọn Pages bên trong Workers & Pages. Đổi tool/account sẽ unmount panel cũ và bỏ secret đã hiển thị.
- API trả secret trong chi tiết/tạo/sửa nhưng tool loại bỏ secret khỏi các response thông thường. Chỉ `POST .../secret/reveal` hoặc `.../secret/rotate` trả secret, với `Cache-Control: no-store` và audit.
- Secret không được lưu trong DB, change history hay React Query cache. Panel đóng/đổi account/widget sẽ bỏ secret khỏi giao diện.
- Xoay secret mặc định giữ khóa cũ 2 giờ; Cloudflare không cho xoay tiếp trong thời gian chuyển đổi. Chọn vô hiệu ngay chỉ khi đã chuẩn bị cập nhật mọi backend dùng widget.
- Không tự gắn widget vào form đăng ký CF Tool; vẫn cần nhúng frontend + Siteverify backend riêng.
- Editor cơ bản hỗ trợ 1–10 hostname/IP, 3 mode và pre-clearance. Giữ nguyên các cờ Enterprise khi sửa; cấu hình nâng cao/analytics dùng liên kết Cloudflare dashboard.

Tài liệu: [Cloudflare Turnstile API](https://developers.cloudflare.com/turnstile/get-started/widget-management/api/).

## Checklist quyền đầy đủ

Để tool hoạt động đầy đủ, API Token cần có:

### Account Level:
- ✅ Account → Account Settings → Edit (cho Argo Tiered Caching)
- ✅ Account → Account Settings → Read (resolve account_id cho Workers/Pages/Tunnels)
- ✅ Account → Workers Scripts → Edit (trang Workers)
- ✅ Account → Cloudflare Pages → Edit (trang Pages)
- ✅ Account → Cloudflare Tunnel → Edit (trang Tunnels)
- ✅ Account → Turnstile Sites → Edit (trang Turnstile; Read nếu chỉ xem)

### Zone Level:
- ✅ Zone → Zone → Edit (cho zone creation và general operations)
- ✅ Zone → Zone Settings → Edit (cho SSL mode, cache settings, Tiered Cache)
- ✅ Zone → Cache Rules → Edit (cho Cache Rules)
- ✅ Zone → DNS → Edit (cho DNS management + auto-CNAME của Tunnels)
- ✅ Zone → Analytics → Read (cho trang Analytics)
- ✅ Zone → Workers Routes → Edit (cho Worker routes theo zone)

### Account Rulesets (cho Cache Rules):
- ✅ Account → Rulesets → Edit
- ✅ Account → Filter Lists → Edit (nếu cần)

## Cách kiểm tra và debug

### 1. Kiểm tra logs backend:
```bash
docker-compose logs backend --tail 100 | grep -i "tiered\|argo\|smart\|403\|400"
```

### 2. Test API trực tiếp:
```bash
# Test Smart Tiered Cache
curl -X PATCH "https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/cache/tiered_cache_smart_topology_enable" \
  -H "Authorization: Bearer {YOUR_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"value": "on"}'

# Test Argo Tiered Caching
curl -X GET "https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/argo/tiered_caching" \
  -H "Authorization: Bearer {YOUR_API_TOKEN}"
```

### 3. Kiểm tra trong Dashboard:
- Vào Cloudflare Dashboard → Chọn zone → Caching → Tiered Cache
- Xem Topology có hiển thị "Smart Tiered Caching Topology" không

## Troubleshooting

### Lỗi 403 (Permission Denied):
- Kiểm tra token có đủ quyền **Zone Settings: Write** hoặc **Zone: Write**
- Kiểm tra token có scope đúng zone không (nếu dùng scoped token)

### Lỗi 400 (Bad Request):
- Kiểm tra format JSON body có đúng không
- Kiểm tra zone_id có đúng không
- Kiểm tra xem đã bật Argo Tiered Caching chưa (cho Smart Tiered Cache)

### Smart Tiered Cache không hoạt động:
1. Kiểm tra Argo Tiered Caching đã được bật chưa
2. Kiểm tra plan của zone có hỗ trợ Smart Tiered Cache không
3. Kiểm tra logs backend để xem lỗi cụ thể


