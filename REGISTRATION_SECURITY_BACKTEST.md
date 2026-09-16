# Backtest bảo mật đăng ký email — 2026-09-16

## Kết quả

- **223/223 test backend**, 22 file: chạy bằng cấu hình security với `SECURITY_FULL_SUITE=true`.
- **140/140 test frontend**, 26 file; riêng register/verify có 12 test.
- Bộ auth/security tập trung: **96 test** (21 registration, 25 adversarial, 15 cấu hình, 35 auth/profile/session/security cũ).
- Backend build, frontend TypeScript, ESLint, build Vite ra thư mục tạm và `git diff --check`: đạt.
- `npm audit --omit=dev`: **0 advisory backend + 0 frontend** tại thời điểm kiểm tra.
- Backend còn **6 advisory moderate trong dependency dev**: drizzle-kit/esbuild/@esbuild-kit và vitest/@vitest/mocker. Chưa nâng cấp breaking tooling hàng loạt trong thay đổi này.

Đây là kết quả các ca thử và code review đã thực hiện, **không phải chứng nhận an toàn tuyệt đối**.

## Phạm vi và cách ly

- Backend test chạy PostgreSQL nhúng **PGlite trong bộ nhớ**, schema khởi tạo từ migration thật.
- Test cấu hình dùng child process với credential giả; không kết nối DB.
- SDK Resend được mock, external `fetch` bị chặn; **không gửi email thật**, không brute-force public endpoint.
- Các lệnh truncate/fixture/rollback chỉ chạy trong PostgreSQL nhúng, không động vào tài khoản thật.
- Riêng migration hardening cộng thêm và kiểm tra schema đã được áp dụng vào DB cấu hình hiện tại, không sửa/xoá User hiện có.
- Test đồng thời chứng minh kết quả các request cạnh tranh trong ứng dụng + engine nhúng. PGlite tuần tự hóa truy vấn trên một connection: **chưa thay thế bài stress đa connection/đa instance PostgreSQL qua Cloudflare**.

## Phát hiện trước bản vá và xử lý

Lần chạy đầu có **7/8 ca kỳ vọng bảo mật thất bại**. Không coi tất cả là lỗ hổng nghiêm trọng ngang nhau:

| Phát hiện tái hiện được | Ảnh hưởng | Bản vá |
| --- | --- | --- |
| Sau mỗi 60 giây có thể gửi tiếp cho cùng email, không có ngân sách dài hạn | Flood hộp thư/quota khi đổi IP hoặc chờ hết cửa sổ | Quota rolling 24h theo hộp thư và toàn hệ thống trong PostgreSQL |
| Resend thay token khiến link đã gửi không còn dùng được | Người khác biết email có thể phá quá trình đăng ký | Gửi lại cùng token khi còn hạn, giữ nguyên expiry |
| Resend thất bại xoá token đang dùng | Mất liên kết đã nhận, retry không giữ cooldown | Giữ token/cooldown/quota ngay cả khi provider lỗi |
| `/auth/setup` không cần secret khi DB rỗng | Người gọi đầu tiên có thể tạo admin; chỉ áp dụng lúc bootstrap | Mặc định đóng; secret header + khóa bảng để chỉ tạo một admin |
| JSON sai/body lớn đều trả 500 | Sai phân loại lỗi, log có nguy cơ lưu đoạn input từ parser | 400/413/415 an toàn trước logger; không ghi thông báo parser thô |
| Login malformed trả 500, ghi raw trường email lỗi | Ghi dữ liệu không cần thiết từ input vào error log | `safeParse`, 400 chung, không ghi input invalid |

Ca login dùng cùng marker trong email/password để kiểm tra raw input: kết quả trước vá chứng minh **email đầu vào bị ghi log**, không chứng minh password hợp lệ đã bị lộ.

Ngoài các ca ban đầu:
- Access log bỏ query và Referer để tránh lưu token nếu client gửi sai vị trí.
- Request 429 không tạo thêm audit DB write; log tại ingress vẫn cần giới hạn/rotate.
- Giao diện dùng khóa in-flight để Enter/click liên tiếp không gửi hai request.
- Quota Gmail nhóm dot/plus/googlemail alias, không tạo hàng pending mới khi nhóm đã hết quota.
- Morgan **1.11.0 → 1.12.1**: vá advisory [GHSA-jxfw-x594-9x9m](https://github.com/advisories/GHSA-jxfw-x594-9x9m) — log forging qua Unicode line separators.

## Ma trận kiểm thử sau bản vá

| Nhóm | Ca thử | Kết quả |
| --- | --- | --- |
| Đăng ký đúng | Email → link → mật khẩu → login | Đạt |
| Spam IP | 5 request/15 phút, request thứ 6 bị chặn | Đạt |
| Giả IP | Đổi X-Forwarded-For khi không trust proxy không vượt rate limit | Đạt |
| Spam đồng thời | 20 request cùng email, chỉ 1 lần gọi SDK mail | Đạt |
| Ngân sách toàn cục | 12 request khác email cạnh tranh ngân sách 3, chỉ 3 lần gửi | Đạt |
| Spam dài hạn | 8 lần qua cooldown, tối đa 5 lần gọi provider/hộp thư/24h | Đạt |
| Alias | Gmail dot/plus/googlemail chia sẻ quota; domain khác không bị gộp tùy tiện | Đạt |
| Provider lỗi | Provider/network/empty response bị che, không phá link cũ, vẫn tính quota | Đạt |
| Token | Ngẫu nhiên 256 bit, digest không dùng thay token, token giả/JWT/thiếu/hết hạn/replay bị chặn | Đạt |
| Resend | Link cũ còn dùng được, expiry không kéo dài | Đạt |
| Tranh chấp xác minh | Hai request cùng token chỉ tạo một user | Đạt trong engine nhúng |
| Rollback | Ép INSERT User thất bại, token không bị mất, retry thành công sau gỡ lỗi | Đạt |
| Vượt quyền | `role=admin`, email khác trong body, mã mời không bỏ qua xác minh | Đạt |
| Bootstrap | Không secret/sai secret bị chặn; hai yêu cầu đúng secret chỉ có một admin | Đạt trong engine nhúng |
| Input độc hại | Array/object email, SQL/HTML/CRLF, form-urlencoded không tạo user/gửi mail | Đạt |
| URL poisoning | Host/Origin/X-Forwarded-Host/redirect không đổi link; chỉ APP_URL được dùng | Đạt |
| Log | Token/password được redact; query/Referer không lưu vào access log | Đạt trong ca thử |
| Frontend | Không consume link lúc load; confirm password/UTF-8 length/in-flight guard; xóa hash sau thành công | Đạt |
| HTML | Chuỗi lỗi chứa HTML/script hiển thị như text, không tạo script/handler | Đạt |
| Config | Production từ chối HTTP, URL credentials/path/query/hash, wildcard CORS, tắt rate limit, bootstrap secret ngắn | Đạt |

## Hạn mức mặc định mới

- IP: **5 yêu cầu register/15 phút**; verify dùng **10 lần thất bại/15 phút**.
- Cooldown: **60 giây/email**.
- Hộp thư: **5 lần thử gửi/24 giờ**, qua `REGISTRATION_EMAIL_DAILY_LIMIT`.
- Toàn hệ thống: **100 lần thử gửi/24 giờ**, qua `REGISTRATION_GLOBAL_DAILY_LIMIT`.
- Quota PostgreSQL không mất khi restart. Đạt quota hộp thư/cooldown trả 202 chung nhưng không gửi; đạt quota chung trả 503.
- Link: hết hạn **30 phút từ lần phát hành**, dùng một lần; resend không gia hạn.

## Giới hạn còn lại / trước production

1. **Chưa có Turnstile/CAPTCHA.** Có quyền truy cập hộp thư không chứng minh là người thật; bot có nhiều email vẫn tạo nhiều tài khoản. Đây không phải cơ chế chống multi-account/fraud hoàn chỉnh.
2. **Botnet vẫn có thể làm cạn quota toàn cục** và tạm khóa đăng ký hợp lệ. Quota chặn chi phí/flood vượt ngân sách, không đảm bảo availability trước DDoS. Cần WAF/rate limit tại Cloudflare, cảnh báo và giới hạn log.
3. **Trust proxy phải đúng topology.** Hop count không xác thực proxy. Backend phải chỉ được tunnel/proxy truy cập (loopback/firewall), không mở origin cho Internet rồi tin header client.
4. **IP limiter lưu RAM**, reset khi restart và không chia sẻ giữa nhiều instance; dùng shared store nếu scale. Quota mail đã chia sẻ qua DB.
5. **Enumeration timing chưa được triệt tiêu**: email mới có thêm thời gian provider call; response code cũng khác khi provider/quota chung lỗi. Không gọi giải pháp này là constant-time/private membership. Outbox + worker với phản hồi chung là hướng xử lý tiếp theo.
6. **Không test giao thư thật/Resend domain/quota plan trong đợt này.** Cần smoke bằng email người dùng khi triển khai.
7. Token còn trong thanh địa chỉ cho đến khi xác minh thành công. Fragment không được gửi trong HTTP Referer, nhưng JavaScript/XSS trên origin hoặc người copy link vẫn có thể lấy token. JWT đăng nhập vẫn ở localStorage theo kiến trúc hiện tại.
8. Giữ `ENCRYPTION_KEY` riêng khỏi DB backup; token resend nay có ciphertext. Nếu lộ cả hai thì cần thu hồi token/rotate key có kế hoạch.

## File chính và trạng thái triển khai

- [registration.ts](node-backend/src/services/registration.ts), [registrationEmail.ts](node-backend/src/services/registrationEmail.ts), [auth.ts](node-backend/src/routes/auth.ts).
- [registration-adversarial.test.ts](node-backend/test/registration-adversarial.test.ts), [registration-env.test.ts](node-backend/test/registration-env.test.ts), [vitest.security.config.ts](node-backend/vitest.security.config.ts).
- [Migration hardening](node-backend/drizzle/0002_numerous_daimon_hellstrom.sql): áp dụng thành công, schema đủ **14 bảng**.
- Dev backend health: `healthy`; trang đăng ký dev hoạt động.
- **Chưa restart/deploy PM2 production**, chưa commit. Frontend build kiểm tra nằm trong thư mục tạm, không thay bản static production.
- Cách cấu hình: [EMAIL_REGISTRATION.md](EMAIL_REGISTRATION.md).