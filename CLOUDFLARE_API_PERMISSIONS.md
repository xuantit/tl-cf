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

## Checklist quyền đầy đủ

Để tool hoạt động đầy đủ, API Token cần có:

### Account Level:
- ✅ Account → Account Settings → Edit (cho Argo Tiered Caching)

### Zone Level:
- ✅ Zone → Zone → Edit (cho zone creation và general operations)
- ✅ Zone → Zone Settings → Edit (cho SSL mode, cache settings, Tiered Cache)
- ✅ Zone → Cache Rules → Edit (cho Cache Rules)
- ✅ Zone → DNS → Edit (cho DNS management)
- ✅ Zone → Analytics → Read (cho trang Analytics)

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


