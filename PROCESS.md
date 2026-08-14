# Quy trình phát triển & vận hành (khép kín)

> Áp dụng cho mọi tính năng mới của tool quản lý Cloudflare. Mỗi giai đoạn là một **gate** — không đạt điều kiện thì không đi tiếp. Vòng lặp: Maintenance đổ ngược về Ý tưởng.

## Sơ đồ

```
Ý tưởng → BA → Kiến trúc → Dữ liệu → Phân quyền → Security Design → UX/UI
   ↑                                                                  ↓
Maintenance ← Backup ← Monitoring ← Deploy ← Security Audit ← Testing ← FE ← BE
```

## Giai đoạn 1–6: Định hình (trước khi viết code)

| # | Gate | Điều kiện qua cửa |
|---|------|-------------------|
| 1 | Ý tưởng | Có user thật cần; đo được thành công; không trùng backlog |
| 2 | Phân tích nghiệp vụ | Mọi story map được vào endpoint CF **có thật** (đối chiếu docs); ghi rõ giới hạn API |
| 3 | Kiến trúc | BE là proxy duy nhất giữ credentials; thao tác >30s = job + polling |
| 4 | Dữ liệu | Migration drizzle thuận; cột nhạy cảm chỉ định mã hóa; không cache thứ CF là nguồn chân lý |
| 5 | Phân quyền | Route mới khai báo middleware; cập nhật `CLOUDFLARE_API_PERMISSIONS.md` |
| 6 | Security Design | Secret write-only; token reveal chủ động + audit; zod validate tại boundary; xác định rate limiter + `SENSITIVE_KEYS` |

Đầu ra gộp: **1 contract ngắn** (mẫu: `PM_EXECUTION_CONTRACT_R1_R2.md`).

## Giai đoạn 7–11: Thực thi (mỗi module = 1 vòng nhỏ, review code sau mỗi module)

| # | Gate | Điều kiện qua cửa |
|---|------|-------------------|
| 7 | UX/UI | Theo design system (push DetailPanel, ConfirmDestructive 2 tier, EmptyState/Skeleton, i18n vi); **text modal nhất quán logic**; destructive cao = type-to-confirm; mobile OK |
| 8 | Backend | Test viết cùng code; `vitest` + `tsc build` xanh; error envelope thống nhất; route có rate limiter |
| 9 | Frontend | `vitest` + `eslint` + `build` xanh; đủ 3 trạng thái loading/empty/error |
| 10 | Testing | Full suite 2 phía xanh (CI tự chạy); **smoke test tay với data CF thật** (unit test không bắt được lỗi kiểu `content/v2` 405); bug tìm thấy → thêm test chống tái phát |
| 11 | Security Audit | Không lỗ hổng high/critical; mở rộng `security.test.ts` cho route mới; `npm audit` sạch |

## Giai đoạn 12–15: Vận hành

| # | Gate | Điều kiện qua cửa |
|---|------|-------------------|
| 12 | Deploy | **Commit trước khi deploy** (không deploy từ working tree); checklist: env vars mới? migration? quyền token CF mới? → build 2 phía → `pm2 restart cf-backend cf-frontend` → smoke test prod (login + 1 đọc + 1 ghi) |
| 13 | Monitoring | Lỗi prod truy vết được trong 5 phút (winston logs + audit log); theo dõi 24h đầu sau deploy |
| 14 | Backup | Backup chưa **diễn tập restore** = chưa có backup; `ENCRYPTION_KEY`/`JWT_SECRET` phải có bản sao ngoài server |
| 15 | Maintenance | Vá bảo mật ≤48h; backlog gắn nhãn → quay về gate 1 |

## Lịch định kỳ

| Nhịp | Việc |
|------|------|
| Mỗi lần deploy | Smoke test prod + theo dõi logs 24h |
| Hằng tuần | Xem audit log + pm2 logs |
| Hằng tháng | `npm audit` (cả 2 workspace) + đối chiếu CF API changelog |
| 6 tháng | Xoay `JWT_SECRET` + `ENCRYPTION_KEY` (`npm run db:rotate-key`) + diễn tập restore DB |

## Hiện trạng gate (audit 2026-08-15)

- ✅ Đạt: 1, 2, 3, 4, 6, 7, 8, 9, 11
- ⚠️ Một phần: 5 (permissions doc — đã cập nhật), 10 (CI — đã thêm `.github/workflows/ci.yml`), 12 (chưa staging/rollback build), 15 (chưa lịch định kỳ)
- ❌ Chưa đạt: 13 (chưa uptime check/alert), 14 (chưa backup key ngoài server, chưa diễn tập restore)

### Việc còn lại (user thực hiện)
1. Commit toàn bộ thay đổi rồi mới deploy.
2. Sao lưu `ENCRYPTION_KEY` + `JWT_SECRET` ra nơi an toàn ngoài server (password manager).
3. Đặt uptime check miễn phí (UptimeRobot / CF Health Checks) trỏ `cf.mmthui.xyz`.
4. Bật pm2 log rotation: `pm2 install pm2-logrotate`.
5. Diễn tập restore DB Supabase 1 lần (tạo project test → restore backup → chạy `db:check`).
