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

### 6. **Analytics (trang Analytics / thống kê cache)**

**Endpoint:** `POST /graphql` (Cloudflare GraphQL Analytics API — `httpRequests1hGroups` / `httpRequests1dGroups`)

**Quyền yêu cầu:**
- ✅ **Zone → Analytics → Read**

**Lưu ý:**
- Nếu token thiếu quyền này, backend trả về **403** với mã lỗi `ANALYTICS_PERMISSION_MISSING` và frontend hiển thị banner "thiếu quyền".
- Global API Key luôn có đủ quyền; chỉ API Token scoped mới cần thêm quyền này.
- Dữ liệu analytics được cache 60 giây phía backend để tránh rate limit.

### 7. **Workers & Pages (trang Workers & Pages)**

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

### 8. **Cloudflare Tunnels (trang Tunnels)**

**Endpoints:** `GET/POST/DELETE /accounts/{account_id}/cfd_tunnel` (+ `/configurations`, `/token`, `/connections`)

**Quyền yêu cầu:**
- ✅ **Account → Cloudflare Tunnel → Edit**
- ✅ **Zone → DNS → Edit** (tự tạo CNAME `{tunnel_id}.cfargotunnel.com` khi thêm public hostname)
- ✅ **Account → Account Settings → Read** (resolve account_id tự động)

**Lưu ý:**
- Token tunnel là bí mật (ai có token là chạy được connector) — tool chỉ hiển thị khi bấm Reveal và ghi audit log, không bao giờ ghi token vào log.
- Tunnel tạo qua tool là remotely-managed (`config_src: cloudflare`) — cấu hình ingress quản lý từ dashboard/tool, không cần file config.yml phía connector.

## Checklist quyền đầy đủ

Để tool hoạt động đầy đủ, API Token cần có:

### Account Level:
- ✅ Account → Account Settings → Edit (cho Argo Tiered Caching)
- ✅ Account → Account Settings → Read (resolve account_id cho Workers/Pages/Tunnels)
- ✅ Account → Workers Scripts → Edit (trang Workers)
- ✅ Account → Cloudflare Pages → Edit (trang Pages)
- ✅ Account → Cloudflare Tunnel → Edit (trang Tunnels)

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


