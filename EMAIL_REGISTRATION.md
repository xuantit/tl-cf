# Đăng ký bằng email qua Resend

Mã mời tạm thời không còn là điều kiện đăng ký. Dữ liệu và API quản trị mã mời
được giữ lại để có thể sử dụng lại sau; chúng **không** bỏ qua xác minh email.

## Luồng đăng ký

> Cập nhật 2026-09-16: Turnstile đã tích hợp vào register/gửi lại/verify-email và triển khai production. Xem [TURNSTILE_DEPLOYMENT.md](TURNSTILE_DEPLOYMENT.md) về cấu hình và giới hạn WAF Free.

1. Người dùng mở `/register`, nhập email. Backend trả `202` chung cho yêu cầu được tiếp nhận, email đã tồn tại hoặc đang bị giới hạn theo hộp thư. `202` không đảm bảo thư được gửi/giao.
2. Mở liên kết `/verify-email#token=...` trong email, đặt và xác nhận mật khẩu.
3. Backend xác minh token và tạo tài khoản với quyền `user`. Sau đó đăng nhập bình thường.

Chưa xác minh thì chưa có bản ghi `User` và không thể đăng nhập. Mật khẩu chỉ được
chọn ở bước 2 để người khác không thể đăng ký hộ email rồi đặt mật khẩu trước.
Tài khoản cũ không bị yêu cầu xác minh lại, không đổi mật khẩu hoặc quyền.

## Cấu hình bắt buộc

Điền trực tiếp vào [node-backend/.env](node-backend/.env), không đưa API key vào frontend hoặc Git.
Mẫu cấu hình: [node-backend/.env.example](node-backend/.env.example).

| Biến | Giá trị |
| --- | --- |
| `RESEND_API_KEY` | API key có quyền gửi mail, tạo tại https://resend.com/api-keys |
| `RESEND_FROM_EMAIL` | Địa chỉ gửi thuần, ví dụ `noreply@your-domain.com`, thuộc domain đã xác minh ở Resend |
| `APP_URL` | Origin frontend, dev `http://localhost:5199`, production `https://cf.mmthui.xyz` |

1. Thêm và xác minh domain ở https://resend.com/domains; thêm các bản ghi DNS do Resend cung cấp.
2. Tạo API key chỉ có quyền gửi mail nếu có thể; điền cả ba biến trên.
3. Cài dependencies backend và chạy migration bằng các script `npm install`, `npm run db:migrate`.
4. Khởi động lại backend sau khi đổi biến môi trường. Với production, build cả backend/frontend rồi restart PM2.
5. Đăng ký bằng hộp thư của bạn, kiểm tra cả Spam, bấm liên kết, đặt mật khẩu và đăng nhập.

Thiếu bất kỳ biến nào: đăng ký trả `503 EMAIL_NOT_CONFIGURED`; đăng nhập tài khoản
cũ vẫn hoạt động. `APP_URL` phải trỏ đúng bản frontend có trang xác minh mới; không
lấy URL từ `Host`/`Origin` của request. HTTP chỉ được chấp nhận cho localhost khi dev.
Dev và production dùng chung file môi trường trên máy này: khi kiểm thử mail dev,
có thể ghi đè `APP_URL` cho tiến trình dev; production phải dùng HTTPS của bản public.
Địa chỉ `onboarding@resend.dev` chỉ dành cho thử nghiệm với giới hạn người nhận,
không dùng để mở đăng ký cho mọi người. Resend cần xác minh domain gửi của bạn.

## API và bảo mật

- `POST /api/auth/register`: `{ email }`; không nhận mật khẩu ở bước này. Cũng dùng để gửi lại email.
- `POST /api/auth/verify-email`: `{ token, password }`; thành công `201 { id, email, role }`.
- Khi Turnstile bật (bắt buộc production), cả hai POST phải thêm `turnstileToken` mới. `register` dùng action `register`; tạo user dùng action `verify_email`. Backend gọi Siteverify trước DB quota/tạo user và kiểm tra hostname/action/expiry. Thiếu token, token giả/hết hạn/đã dùng bị chặn; provider lỗi không bỏ qua CAPTCHA.
- `GET /api/auth/turnstile` trả config công khai `{ enabled, siteKey }`, `no-store`; không trả secret. Frontend không cần build-time site key, reset challenge sau mỗi POST/gửi lại.
- Token ngẫu nhiên 256 bit, đối chiếu bằng SHA-256, hết hạn sau 30 phút, dùng một lần. Lưu thêm bản mã AES-256-GCM để gửi lại **cùng liên kết còn hạn**; không gia hạn thời gian hết hạn. Chỉ DB bị lộ thì không có token plaintext, nhưng nếu cả DB và `ENCRYPTION_KEY` bị lộ thì token có thể bị giải mã.
- Token cũ trước migration không có bản mã: giữ nguyên khả năng xác minh, không gửi lại cho tới hết hạn. Đổi encryption key khi còn token sẽ khiến gửi lại token cũ lỗi; chủ email vẫn xác minh được bằng token đã nhận (SHA-256), hoặc đợi hết hạn lấy token mới.
- Tạo user và tiêu thụ token trong cùng transaction; không tạo được hai tài khoản khi xác minh đồng thời.
- Giới hạn 5 yêu cầu gửi/15 phút/IP (kể cả thành công); cooldown theo email được lưu trong DB.
- Thêm hạn mức **5 lần gửi/24 giờ/hộp thư** và **100 lần gửi/24 giờ/toàn hệ thống**, lưu trong `RegistrationMailQuota`; tính cả lần Resend trả lỗi. Cửa sổ 24 giờ bắt đầu ở lần gửi đầu, không mất khi restart/xoá token. Chỉnh bằng `REGISTRATION_EMAIL_DAILY_LIMIT` / `REGISTRATION_GLOBAL_DAILY_LIMIT`. Đây là ngân sách an toàn của ứng dụng, không phải giới hạn gói Resend.
- Gmail/Googlemail có dấu chấm và `+tag` cùng dùng một ngân sách hộp thư; không gộp tuỳ tiện địa chỉ của nhà cung cấp khác. Chính sách này **không** giới hạn một người chỉ được có một tài khoản.
- Cùng phản hồi `202` cho email đã đăng ký/cooldown/hết quota hộp thư; không gửi lại hoặc đổi mật khẩu tài khoản cũ. **Không bảo đảm chống enumeration theo timing** vì đường gửi Resend có độ trễ khác đường bỏ qua.
- Token nằm trong URL fragment, không đi vào access log/Referer. Chỉ POST khi người dùng chủ động đặt mật khẩu, tránh email scanner tiêu thụ token.
- Provider gửi lỗi trả `503 EMAIL_SEND_FAILED`, không trả lỗi chứa secret. Token và password được che trong audit log.
- Lần gửi lỗi vẫn giữ token, cooldown và quota; thử lại sau 60 giây. Hết quota chung trả `503 EMAIL_QUOTA_EXCEEDED`. Không tự retry không giới hạn.
- `/auth/setup` mặc định đóng. Nếu cần bootstrap từ HTTP, cấu hình `INITIAL_SETUP_TOKEN` ngẫu nhiên >=32 ký tự, gửi qua header `X-Setup-Token`; khóa bảng chống tạo hai admin cùng lúc. Nên dùng seed từ CLI và xoá secret bootstrap sau sử dụng.
- Access log không giữ query/Referer. JSON lỗi trả 400, body quá lớn trả 413, không ghi đoạn JSON thô. Audit DB bỏ qua request 429 để flood không sinh vô hạn bản ghi audit.
- Các yêu cầu đã hết hạn được dọn ở lần yêu cầu đăng ký tiếp theo.

## Kiểm thử

- `npm run test:security` trong backend chạy test auth + đối kháng trên PostgreSQL nhúng PGlite, credential giả, chặn external fetch; không truy cập Supabase thật. [Cấu hình](node-backend/vitest.security.config.ts), [bài thử đối kháng](node-backend/test/registration-adversarial.test.ts), [test cấu hình](node-backend/test/registration-env.test.ts).
- Đặt `SECURITY_FULL_SUITE=true` để chạy toàn bộ test backend với cấu hình cô lập này. Test auth cũ chạy qua script test mặc định vẫn có thể dùng DB cấu hình hiện tại; ưu tiên `test:security`.
- Frontend: [frontend/src/pages/Register.test.tsx](frontend/src/pages/Register.test.tsx), [frontend/src/pages/VerifyEmail.test.tsx](frontend/src/pages/VerifyEmail.test.tsx).
- Cần kiểm tra gửi email thực tế sau khi cấu hình key và domain đã xác minh; mock test không chứng minh khả năng giao thư.

## Trước khi mở public

- Chạy migration hardening trước khi triển khai backend: [0002_numerous_daimon_hellstrom.sql](node-backend/drizzle/0002_numerous_daimon_hellstrom.sql).
- Backend origin phải chỉ cho tunnel/reverse proxy truy cập. `TRUST_PROXY_HOPS` không xác thực danh tính proxy; nếu mở thẳng cổng backend, người gọi có thể giả `X-Forwarded-For` khi cấu hình tin proxy.
- Turnstile đã triển khai; WAF đã chặn bootstrap public và bypass cache riêng hostname CF Tool. Cloudflare Free không còn slot rate-limit riêng; backend quotas vẫn bắt buộc. Turnstile không thay thế chống gian lận/multi-account hoàn chỉnh.
- Rate limit IP dùng RAM, mất khi restart và không chia sẻ giữa nhiều instance. Quota mail mới dùng PostgreSQL và chia sẻ được; Redis cần thiết nếu scale rate limit IP.
- Theo dõi quota/429/503 và giới hạn log/dung lượng tại ingress. Botnet có thể làm cạn ngân sách toàn cục gây từ chối đăng ký tạm thời dù không gửi vượt ngân sách.
- Xem [báo cáo backtest](REGISTRATION_SECURITY_BACKTEST.md) để biết phạm vi và giới hạn kết luận.