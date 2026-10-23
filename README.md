# CF Tool · Cloudflare Automation

Không gian quản trị Cloudflare cho nhiều tài khoản: domain, DNS, cache, rules,
Workers/Pages, Tunnels và Turnstile. Giao diện tiếng Việt/English, sáng/tối,
tìm nhanh bằng **Ctrl/Cmd + K** và hỗ trợ thiết bị di động.

**[Demo online](https://cf.mmthui.xyz/)** · [Cài đặt](#chạy-local) · [Ảnh giao diện](#ảnh-giao-diện) · [Tài liệu](#tài-liệu)

> Demo cần đăng nhập; không công bố tài khoản dùng chung. Thao tác quản trị trên
> ứng dụng kết nối thật có thể thay đổi tài nguyên Cloudflare ngay lập tức.

## Ảnh giao diện

Ảnh chụp từ frontend thực tế với **dữ liệu minh hoạ**, không chứa credential,
domain khách hàng hoặc số liệu production. Ngôn ngữ hiển thị: tiếng Việt.

### Workspace · Dark mode

![Workspace tối với tìm kiếm, dropdown công cụ và danh sách domain](docs/screenshots/workspace-dark.png)

<details>
<summary><strong>Workspace · Light mode</strong></summary>

![Workspace sáng với cùng bố cục quản trị domain](docs/screenshots/workspace-light.png)

</details>

<details>
<summary><strong>Tổng quan tài khoản và hoạt động gần đây</strong></summary>

![Tổng quan với thống kê zone, phân bố gói và lịch sử thao tác minh hoạ](docs/screenshots/overview.png)

</details>

### DNS · Chỉnh sửa trong panel

![Module DNS với bảng bản ghi và panel chỉnh sửa, TTL, proxy, xem trước zone file](docs/screenshots/dns-editor.png)

<details>
<summary><strong>Giao diện mobile</strong></summary>

<img src="docs/screenshots/mobile.png" width="320" alt="Workspace trên mobile với chuyển theme, tìm kiếm và thanh điều hướng dưới cùng" />

</details>

Xem [cách chụp lại screenshots](docs/screenshots/README.md). Các ảnh dùng fixture API
trong browser cách ly; không gọi backend hay Cloudflare thật.

## Tính năng

| Nhóm | Chức năng |
| --- | --- |
| Tài khoản | Nhiều credential Cloudflare, API Token hoặc Global API Key; chuyển tài khoản trên header |
| Domains | Tìm kiếm, lọc trạng thái/tag, thêm hàng loạt, copy cấu hình và clone domain |
| DNS | Tạo/sửa/xoá, TTL/proxy, xem trước bản ghi, tìm và thay thế DNS hàng loạt |
| Cache & Rules | Purge cache, Cache Rules, Redirect Rules, Configuration Rules và Page Rules legacy |
| Bảo mật zone | SSL/TLS, HTTPS, development mode, WAF custom rules và IP Access Rules |
| Analytics | Thống kê **trong từng domain**, khoảng 24h/7d/30d; không gộp traffic toàn bộ zone vào dashboard |
| Công cụ Cloudflare | Workers & Pages, Tunnels, quản lý widget Turnstile qua dropdown công cụ |
| Tự động hoá | Templates DNS/cấu hình, tags và quy tắc gán tag, theo dõi tiến độ job |
| Quản trị | Người dùng/quyền, phiên đăng nhập, audit log, lịch sử thay đổi và rollback các thao tác được hỗ trợ |
| Trải nghiệm | Light/dark lưu theo trình duyệt, tìm nhanh, panel chỉnh sửa, bố cục desktop/mobile |

Tính năng phụ thuộc quyền API Token và gói Cloudflare. Nên dùng token giới hạn quyền,
chỉ cấp tài nguyên cần quản lý: [hướng dẫn quyền Cloudflare](CLOUDFLARE_API_PERMISSIONS.md).
Copy/clone không phải transaction: lỗi một phần có thể để lại tài nguyên đã tạo;
chạy lại có thể thêm trùng rules. Kiểm tra kết quả job trước khi thực hiện lại.

## Công nghệ

- **Frontend:** React 19, TypeScript, Vite 7, Ant Design 6, Tailwind CSS 4,
	TanStack Query, Zustand, React Router và i18next.
- **Backend:** Node.js, Express 5, TypeScript, Drizzle ORM và PostgreSQL.
- **Xác thực:** JWT/session, mật khẩu bcrypt, đăng ký xác minh email qua Resend;
	Turnstile bảo vệ đăng ký/gửi lại/xác minh email.
- **Credential:** mã hoá AES-256-GCM phía backend; secret không đưa vào bundle frontend.
- **Kiểm thử:** Vitest, React Testing Library, Supertest; PGlite cho backend cách ly.

Repository hiện dùng **Node.js**, không cần Python, Celery hoặc Redis để chạy luồng hiện tại.
Các hướng dẫn Python/MySQL/port 5173 trong tài liệu cũ không áp dụng cho cấu hình này.

## Chạy local

### 1. Điều kiện

- Node.js **22.12+** (hoặc một bản LTS mới hơn tương thích Vite 7), npm.
- PostgreSQL: local, Docker hoặc dịch vụ như Supabase. **Dùng database dev riêng**,
	không chạy seed/migration/test tuỳ tiện trên database production.
- Cloudflare API Token nếu muốn thao tác tài nguyên thật. Resend chỉ cần khi mở đăng ký email.

Tuỳ chọn khởi động **chỉ PostgreSQL** từ thư mục gốc:

```sh
docker compose -f docker-compose.node.yml up -d postgres
```

PostgreSQL của cấu hình này dùng cổng **5433**, database **cftool**. Credential mẫu
trong compose chỉ dành cho môi trường dev, không dùng cho dịch vụ public.

### 2. Backend

1. Cài dependencies bằng `npm --prefix node-backend install`.
2. Sao chép [mẫu môi trường backend](node-backend/.env.example) thành file .env trong
	 thư mục node-backend, thay các giá trị mẫu trước khi chạy.

| Biến | Cấu hình dev |
| --- | --- |
| `DATABASE_URL` | PostgreSQL dev của bạn; compose local: `postgresql://postgres:postgres@localhost:5433/cftool` |
| `JWT_SECRET` | Chuỗi ngẫu nhiên riêng, tối thiểu 32 ký tự; không giữ secret mẫu |
| `ENCRYPTION_KEY` | 64 ký tự hex ngẫu nhiên, tương ứng 32 bytes |
| `CORS_ORIGINS` | `http://localhost:5199` |
| `APP_URL` | `http://localhost:5199` |
| `TRUST_PROXY_HOPS` | `0` khi truy cập trực tiếp local, điều chỉnh theo số proxy thực tế |
| `AUTO_SEED_DEFAULT_ADMIN` | `false`; chủ động tạo tài khoản ban đầu thay vì tự seed mật khẩu mẫu |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Cấu hình key và email gửi thuộc domain đã xác minh nếu bật đăng ký |

Tạo hai secret **khác nhau** bằng `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
Lưu kín `ENCRYPTION_KEY`; đổi key trực tiếp có thể khiến credential cũ không giải mã được.

Tạo file .env.turnstile.development trong node-backend và đặt các biến sau bằng
[test keys chính thức của Cloudflare](https://developers.cloudflare.com/turnstile/troubleshooting/testing/):
`TURNSTILE_ENABLED`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`,
`TURNSTILE_ALLOWED_HOSTNAMES=localhost`. **Không dùng test keys ở production.**

Sau khi kiểm tra đúng database đích:

```sh
npm --prefix node-backend run db:migrate
npm --prefix node-backend run dev
```

Dev API chạy tại **http://localhost:9001/api**, health tại **http://localhost:9001/health**.
Script `dev` đặt `PORT=9001`; không nhầm với cổng production mặc định 9000.

**Tài khoản ban đầu:** với database dev trống, đặt `DEFAULT_ADMIN_EMAIL`,
`DEFAULT_ADMIN_PASSWORD`, `SEED_USER_EMAIL`, `SEED_USER_PASSWORD` riêng rồi chạy
`npm --prefix node-backend run db:seed`. Script tạo cả admin, demo user và dữ liệu mẫu,
**in thông tin đăng nhập ra terminal**; không chạy với mật khẩu mặc định trên hệ thống public
hoặc trong CI có log công khai. HTTP bootstrap mặc định đóng; xem [luồng xác thực](EMAIL_REGISTRATION.md).

### 3. Frontend

Tạo file .env.local trong frontend với `VITE_API_URL=http://localhost:9001/api`, sau đó:

```sh
npm --prefix frontend install
npm --prefix frontend run dev
```

Mở **http://localhost:5199**. Cũng có thể dùng VS Code tasks **Dev: backend** và
**Dev: frontend** nếu đang mở workspace này.

1. Đăng nhập bằng tài khoản đã tạo, hoặc đăng ký qua email khi Resend/Turnstile được cấu hình.
2. Mở **Tài khoản / Accounts**, thêm Cloudflare API Token (khuyến nghị) hoặc Global API Key.
3. Chọn tài khoản trên header; vào **Domains** để quản lý tài nguyên.
4. Mở một domain, chọn DNS, Cache, Rules, Bảo mật, Tags hoặc Analytics.

### Đăng ký email

`Email + CAPTCHA → liên kết xác minh → đặt mật khẩu + CAPTCHA → đăng nhập`.
Không cần mã mời; chưa xác minh thì chưa tạo user. Thiếu cấu hình Resend sẽ chặn
đăng ký mới, nhưng tài khoản cũ vẫn đăng nhập được. Đăng nhập hiện dùng mật khẩu và
rate limit, không phải CAPTCHA. Chi tiết: [EMAIL_REGISTRATION.md](EMAIL_REGISTRATION.md).

## Kiểm thử và build

Frontend, từ thư mục gốc:

```sh
npm --prefix frontend run lint
npm --prefix frontend test -- --maxWorkers=2
npm --prefix frontend run build
```

> **Máy đang phục vụ demo:** lệnh build ghi trực tiếp vào frontend/dist. Hãy build
> trong staging riêng nếu PM2 đang serve thư mục đó, tránh phát hành dở dang.

Backend: ưu tiên `npm --prefix node-backend run test:security` để dùng PGlite,
credential giả và mock provider. Muốn chạy **toàn bộ** suite cách ly trong PowerShell:

```powershell
$env:SECURITY_FULL_SUITE='true'
try { npm --prefix node-backend run test:security }
finally { Remove-Item Env:SECURITY_FULL_SUITE -ErrorAction SilentlyContinue }
```

Build backend bằng `npm --prefix node-backend run build`. Không chạy test backend
mặc định với database đang dùng thật: một số test dùng DB cấu hình và có thể sửa dữ liệu.
Test mock không thay thế kiểm tra giao email/CAPTCHA hoặc quyền Cloudflare thực tế.

## Triển khai

- Build frontend với `VITE_API_URL=/api`, phục vụ file tĩnh và SPA fallback.
- Reverse proxy `/api/*` về backend. Cấu hình hiện tại dùng PM2 + Cloudflare Tunnel:
	frontend **8080**, backend **127.0.0.1:9000**; xem [ecosystem.config.cjs](ecosystem.config.cjs).
- Đặt `NODE_ENV=production`, `APP_URL` là origin HTTPS, CORS đúng origin,
	`AUTO_SEED_DEFAULT_ADMIN=false`, không tắt rate limit. Chỉ tin các proxy thực sự đứng trước API.
- Dùng widget Turnstile/key production và hostname thật; frontend nhận site key từ API,
	không cần nhúng secret hoặc key riêng vào build.
- Backup trước migration/phát hành. Chạy test, build staging, kiểm tra health rồi mới chuyển bản;
	purge **chỉ HTML của CF Tool**, giữ các asset hash cũ cho tab đang mở khi cần.
- Mẫu PM2 chứa tiến trình `cf-deploy` tự theo dõi Git. Không bật toàn bộ mẫu mà chưa xem
	cấu hình watcher; chỉ khởi động các dịch vụ thực sự cần dùng.

File compose cũ ở gốc không phải hướng dẫn triển khai đầy đủ cho backend hiện tại.
Express không cung cấp Swagger `/docs` mặc định; xem [mã API routes](node-backend/src/routes)
và các tài liệu tính năng bên dưới.

## Cấu trúc chính

| Đường dẫn | Nội dung |
| --- | --- |
| [frontend/src](frontend/src) | Pages, UI components, state, i18n, API client và test frontend |
| [node-backend/src](node-backend/src) | Express routes, middleware, Cloudflare services, Drizzle schema |
| [node-backend/drizzle](node-backend/drizzle) | SQL migrations |
| [node-backend/test](node-backend/test) | API, security và regression tests |
| [scripts](scripts) | Script vận hành và chụp ảnh tài liệu |
| [docs/screenshots](docs/screenshots) | Ảnh giao diện và hướng dẫn tái tạo |

## Tài liệu

- [Quyền API Cloudflare](CLOUDFLARE_API_PERMISSIONS.md)
- [Đăng ký/xác minh email với Resend](EMAIL_REGISTRATION.md)
- [Turnstile và triển khai CAPTCHA](TURNSTILE_DEPLOYMENT.md)
- [Kiểm thử bảo mật đăng ký](REGISTRATION_SECURITY_BACKTEST.md)
- [Giao diện và light/dark](CF_TOOL_UI_REFRESH.md)
- [Quy trình phát triển/kiểm tra](PROCESS.md)

Không commit file môi trường, API key, JWT, password hoặc ảnh có dữ liệu thật.
Các tính năng phụ thuộc Cloudflare và quota tương ứng; đây không phải bảo đảm mọi
thao tác đều khả dụng trên mọi token/gói dịch vụ.

