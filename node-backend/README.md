# Node.js Backend - Cloudflare Automation Tool

Backend được viết bằng Node.js + Express + PostgreSQL (Drizzle ORM).

## Database (Postgres + Drizzle)

Quy trình chuẩn để có DB sẵn sàng test:

```bash
cp .env.example .env          # điền DATABASE_URL, ENCRYPTION_KEY (64 hex)...
npm install

npm run db:setup              # chạy migrations + seed (admin/demo/dữ liệu mẫu)
npm run db:check              # kiểm tra kết nối + đủ 12 bảng
```

Các script DB:

| Script | Mô tả |
| --- | --- |
| `npm run db:generate` | Sinh migration SQL từ `src/db/schema.ts` |
| `npm run db:migrate` | Áp dụng migrations trong `drizzle/*.sql` |
| `npm run db:push` | Đẩy schema trực tiếp (dev nhanh, không tạo file migration) |
| `npm run db:check` | Kiểm tra kết nối + liệt kê bảng còn thiếu |
| `npm run db:seed` | Seed idempotent: admin, demo user, DNS template, tag rule, (tuỳ chọn) CF account |
| `npm run db:reset -- --yes` | **Xoá toàn bộ dữ liệu** (giữ schema) rồi để seed lại |
| `npm run db:setup` | `db:migrate` + `db:seed` |

Tài khoản mặc định sau khi seed:
- Admin: `DEFAULT_ADMIN_EMAIL` / `DEFAULT_ADMIN_PASSWORD` (mặc định `admin@example.com` / `Admin@123`)
- Demo: `SEED_USER_EMAIL` / `SEED_USER_PASSWORD` (mặc định `demo@example.com` / `Demo@1234`)

Để seed sẵn một Cloudflare account, đặt `SEED_CF_API_TOKEN` (hoặc bộ
`SEED_CF_AUTH_TYPE=globalApiKey` + `SEED_CF_EMAIL` + `SEED_CF_GLOBAL_API_KEY`) trong `.env`.

> Lưu ý: `DATABASE_URL` là URL Postgres thuần — **không** chứa `https://` trong host.
> Với Supabase pooler: `postgresql://USER:PASS@aws-0-<region>.pooler.supabase.com:6543/postgres`.

## Setup

### 1. Cài đặt dependencies

```bash
npm install
```

### 2. Cấu hình môi trường

Copy `.env.example` thành `.env` và điền thông tin:

```bash
cp .env.example .env
```

Cần tạo `ENCRYPTION_KEY` 64 ký tự hex (32 bytes):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Setup MySQL

Có thể dùng Docker:
```bash
docker-compose -f docker-compose.node.yml up -d mysql
```

Hoặc MySQL local, đảm bảo database `cftool` đã được tạo.

### 4. Chạy migrations

Migrations sẽ tự động chạy khi start server lần đầu. Hoặc chạy thủ công:

```bash
npm run migrate
```

### 5. Chạy server

Development:
```bash
npm run dev
```

Production:
```bash
npm run build
npm start
```

## Database Schema

Tables được tạo tự động:
- `users` - Thông tin user
- `user_cf_credentials` - Cloudflare credentials (encrypted)
- `audit_logs` - Log các thao tác

## API Endpoints

- `POST /api/auth/register` - Đăng ký user mới
- `POST /api/auth/login` - Đăng nhập, nhận JWT token
- `POST /api/cf/credentials` - Lưu Cloudflare credentials (email + Global API Key)
- `GET /api/cf/credentials` - Lấy thông tin credentials đã lưu
- `GET /api/cf/test` - Test kết nối Cloudflare
- `GET /api/domains` - List tất cả domains (zones)
- `GET /api/domains/:zoneId` - Chi tiết 1 domain
- `GET /api/domains/:zoneId/dns` - List DNS records
- `POST /api/domains/:zoneId/dns` - Tạo DNS record mới
- `PUT /api/domains/:zoneId/dns/:recordId` - Update DNS record
- `DELETE /api/domains/:zoneId/dns/:recordId` - Xóa DNS record
- `GET /api/domains/:zoneId/cache-config` - Lấy cache settings
- `PUT /api/domains/:zoneId/cache-config` - Update cache settings
- `POST /api/domains/:zoneId/cache-config/purge` - Purge cache
- `GET /api/domains/:zoneId/rules` - List page rules
- `PUT /api/domains/:zoneId/rules/:ruleId` - Update page rule

## Tech Stack

- **Runtime:** Node.js 20+
- **Framework:** Express 5
- **Database:** MySQL 8+ (raw SQL với mysql2)
- **Authentication:** JWT
- **Encryption:** AES-256-GCM cho API keys
- **TypeScript:** Full type safety

## Ưu điểm của raw SQL

- ✅ Nhẹ, không có overhead của ORM
- ✅ Full control over queries
- ✅ Dễ debug và optimize
- ✅ Không có vấn đề ES modules compatibility
- ✅ Setup đơn giản, không cần generate client

## Security

- Global API Key được mã hóa bằng AES-256-GCM trước khi lưu vào database
- JWT token cho authentication
- SQL injection protection tự động với parameterized queries
- CORS được cấu hình trong `.env`
