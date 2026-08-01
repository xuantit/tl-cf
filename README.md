# Cloudflare Automation Tool

Tool to automate Cloudflare: manage domains, DNS records, cache settings, and rules using Cloudflare Global API Key.

## Stack (New - Node.js)

- **Backend:** Node.js, Express, Drizzle ORM, PostgreSQL
- **Frontend:** React, TypeScript, Vite, Ant Design, TanStack Query, Zustand
- **Database:** PostgreSQL
- **Authentication:** JWT
- **Encryption:** AES-256-GCM for API keys

## Stack (Legacy - Python)

- **Backend:** Python, FastAPI, Cloudflare SDK, SQLAlchemy, Celery, Redis
- **Database:** PostgreSQL

## Quick Start (Node.js Backend - Recommended)

### 1. Setup PostgreSQL

```bash
docker-compose -f docker-compose.node.yml up -d postgres
```

Hoặc dùng PostgreSQL local, tạo database `cftool`.

### 2. Setup Backend

```bash
cd node-backend
npm install

# Tạo file .env từ .env.example và điền thông tin
# DATABASE_URL=postgresql://postgres:postgres@localhost:5433/cftool
# Tạo ENCRYPTION_KEY: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Chạy migrations
npm run db:migrate

# Chạy server
npm run dev
```

Backend sẽ chạy tại: http://localhost:9000

### 3. Setup Frontend

```bash
cd frontend
npm install

# Tạo file .env.local với:
# VITE_API_URL=http://localhost:9000/api

npm run dev
```

Frontend sẽ chạy tại: http://localhost:5173

### 4. Sử dụng

1. Đăng ký/Đăng nhập tại http://localhost:5173
2. Vào "CF Credentials" để nhập Cloudflare email và Global API Key
3. Vào "Domains" để xem danh sách domains
4. Click vào domain để chỉnh sửa DNS, Cache, Rules

## Deploy to VPS (Node.js + Docker Compose)

The backend ships with a production `Dockerfile` and `docker-compose.node.yml`
(PostgreSQL + backend). The entrypoint runs Drizzle migrations automatically on
container start.

### 1. Install Docker on the VPS

```bash
curl -fsSL https://get.docker.com | sh
docker compose version
```

### 2. Clone and configure

```bash
git clone https://github.com/xuantit/tl-cf.git
cd tl-cf
```

Create a `.env` file next to `docker-compose.node.yml`:

```env
POSTGRES_PASSWORD=<strong-password>
JWT_SECRET=<openssl rand -hex 24>
ENCRYPTION_KEY=<openssl rand -hex 32>   # 64 hex chars
CORS_ORIGINS=https://yourdomain.com
```

### 3. Build and start

```bash
docker compose -f docker-compose.node.yml up -d --build
```

Migrations run automatically at startup. A default admin
(`admin@example.com` / `Admin@123`) is seeded on first run - change it after
first login.

### 4. Frontend

Build the static site with the API URL baked in, then serve `dist/` (e.g. with
Nginx):

```bash
cd frontend
npm ci
VITE_API_URL=https://yourdomain.com/api npm run build
```

### 5. Reverse proxy + HTTPS

Put Nginx in front: serve `frontend/dist` at `/`, proxy `/api` to
`http://127.0.0.1:9000`, then issue a certificate with `certbot --nginx`.

### 6. Database backup

```bash
docker compose -f docker-compose.node.yml exec postgres \
  pg_dump -U postgres cftool > backup_$(date +%F).sql
```

## Quick Start (Legacy Python Backend)

### Backend

```bash
cd backend
python -m venv venv
# Windows: venv\Scripts\activate
# Linux/Mac: source venv/bin/activate
pip install -r requirements.txt
# Set DATABASE_URL, REDIS_URL, SECRET_KEY in .env
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Database (Docker)

```bash
docker-compose up -d postgres redis
```

Sau khi chạy migration (`alembic upgrade head`), tạo admin:

```bash
cd backend
python seed_admin.py
```

**Tài khoản admin:** `admin@example.com` / `Admin@123`

## Environment

Create `backend/.env`:

- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `SECRET_KEY` - JWT/encryption secret
- `CORS_ORIGINS` - Allowed origins (optional)

## Testing

```bash
cd backend
pip install -r requirements.txt
pytest
```

## Deployment (Docker)

Run the full stack (Postgres, Redis, Backend, Celery):

```bash
docker-compose up -d
```

Run migrations (first time or after changes):

```bash
docker-compose exec backend alembic upgrade head
```

Tạo tài khoản admin (chạy 1 lần):

```bash
docker-compose exec backend python seed_admin.py
```

**Tài khoản admin mặc định:**
- **Email:** `admin@example.com`
- **Password:** `Admin@123`

- Backend API: http://localhost:8000
- API docs: http://localhost:8000/docs

For production, set `SECRET_KEY` in the environment. Run the frontend separately (`cd frontend && npm run build`) and serve the `dist/` folder, or deploy the frontend to Vercel/Netlify/Cloudflare Pages with `VITE_API_URL` or proxy `/api` to the backend.

## API Docs

When the backend is running: http://localhost:8000/docs

