# Turnstile + WAF + production — 2026-09-16

## Trạng thái đã thực hiện

| Bước | Kết quả |
| --- | --- |
| Tạo widget | `CF Tool Production`, Managed, no_clearance, chỉ `cf.mmthui.xyz` |
| Site key công khai | `0x4AAAAAAE3nQBj6JqbMlyJ-` |
| Tích hợp | Register + resend + verify-email; server Siteverify kiểm tra hostname/action/5 phút/dùng một lần |
| Kiểm thử | **289 backend + 158 frontend** đạt, lint/typecheck/build đạt; Siteverify dummy smoke thật thành công |
| WAF bootstrap | Đã bật, ghép OR có giới hạn hostname vào rule scanner block hiện có |
| Cloudflare rate limit riêng | **Chưa bật được**: API trả 400/50001, vượt quota 2/1 của gói Free. Giữ nguyên rule WordPress cũ |
| Cache | Bypass cache cho `cf.mmthui.xyz` ngoài `/assets/`; purge các URL HTML của CF Tool |
| Production | Đã triển khai PM2 cf-backend/cf-frontend, `pm2 save`; không restart tunnel hoặc app khác |
| Backend origin | Chỉ lắng nghe `127.0.0.1:9000` phía sau tunnel |

Production: https://cf.mmthui.xyz/register

## Cấu hình

- [node-backend/.env.turnstile.production](node-backend/.env.turnstile.production): key thật, gitignored; Windows ACL giới hạn user hiện tại + SYSTEM.
- [node-backend/.env.turnstile.development](node-backend/.env.turnstile.development): dummy keys chính thức, localhost; **không phải CAPTCHA bảo mật trên production**.
- [env.ts](node-backend/src/utils/env.ts) chọn file theo `NODE_ENV`; không load file real key khi test. Process env có ưu tiên cao hơn file.
- Production từ chối startup nếu Turnstile tắt, thiếu key/hostname, dùng dummy key hoặc hostname localhost.
- [ecosystem.config.cjs](ecosystem.config.cjs) đặt production APP_URL/CORS thành `https://cf.mmthui.xyz`, HOST loopback, tắt seed mặc định và bắt buộc rate limit.
- `GET /api/auth/turnstile` chỉ công khai site key. Secret không nằm trong frontend bundle, query cache hay response config.

## Smoke sau triển khai

- Local production `/health`: **200 healthy**.
- Public `/register`: **200**, bundle mới, `CF-Cache-Status: DYNAMIC`.
- Public `/api/auth/turnstile`: **200**, `enabled:true`, đúng site key production, `DYNAMIC`.
- Public POST register thiếu token: **400 TURNSTILE_REJECTED**.
- Dummy token dev gửi tới production: **400 TURNSTILE_REJECTED**.
- Public POST verify-email thiếu CAPTCHA: **400 TURNSTILE_REJECTED**, không tạo user.
- Public `/api/auth/setup`: **403 tại Cloudflare WAF**.
- Browser public hiển thị widget “Verify you are human”; automation không giải CAPTCHA. Người dùng cần tự tick và thử email thật để xác nhận luồng giao thư end-to-end sau deploy. Có ghi nhận một hostname phụ của challenge bị DNS fail trong embedded browser; không có bypass bảo mật để bỏ qua lỗi này.
- `npm audit --omit=dev`: 0 advisory backend/frontend tại thời điểm deploy.

## WAF: phạm vi và giới hạn

- Account: `459ceb3207d328ef862aff603f79ed91`; zone `mmthui.xyz` / `f6886d4bf524da6bf22e51afa86270c7`.
- Zone đã dùng đủ 5 custom rules và 1 rate-limiting rule Free trước triển khai.
- Rule scanner block `feb850ef11dc47b88597e1825ccc07e0`: giữ nguyên điều kiện cũ, thêm OR `(http.host eq "cf.mmthui.xyz") and starts_with(lower(http.request.uri.path), "/api/auth/setup")`.
- Rule cache mới `efe28253b4074016b3d11c2c1fd55c15` / ref `cftool_no_cache_auth`, sau cache rule cũ, chỉ hostname CF Tool.
- Rule rate-limit WordPress `61c473a4cd5640e0b7203ce4e653f123` không đổi. Không nới expression sang toàn zone hoặc gộp ngân sách WordPress với đăng ký CF Tool.
- Muốn rate-limit edge độc lập cho CF Tool: cần slot/gói phù hợp (ví dụ Pro) rồi chạy lại bước provisioning có scope hostname. Chưa mua/nâng cấp gói tự động.
- Rate limit IP và quota email DB trong ứng dụng tiếp tục hoạt động; Turnstile không bảo đảm chống botnet/multi-account tuyệt đối.

## Artifact và hoàn tác

- Release staging/backup ngoài repo: `%LOCALAPPDATA%\CF-Tool-Deploy\20260916-102831` gồm frontend-before/backend-before và frontend-next/backend-next. `before` là artifact trên đĩa ngay trước hoán đổi, không phải snapshot bộ nhớ process cũ.
- Snapshot Cloudflare rules trước thay đổi: thư mục [node-backend/.deployment-backups](node-backend/.deployment-backups) (gitignored), file mang timestamp; chỉ config rules, không secret.
- Script operator: [node-backend/scripts/cloudflare-deploy.ts](node-backend/scripts/cloudflare-deploy.ts), các chế độ `inspect`, `widget`, `waf`, `verify-waf`, `purge`; yêu cầu `DEPLOY_USER_ID`, `DEPLOY_CREDENTIAL_ID`, xác minh account/zone trước thao tác.
- Không xóa rule/widget đang chạy để rollback mù. Nếu cần, khôi phục artifact đã biết tương thích, restart đúng hai app, điều chỉnh môi trường tương ứng và đối chiếu snapshot WAF trước khi thay từng rule.
- Mọi thay đổi còn ở working tree, **chưa commit**. Watcher tự deploy vẫn stopped để không ghi đè bản chưa commit.