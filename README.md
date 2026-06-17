# Cloudflare Automation Tool

Tool to automate Cloudflare: manage domains, DNS records, cache settings, and rules using Cloudflare Global API Key.

## Stack (New - Node.js)

- **Backend:** Node.js, Express, Prisma, MySQL
- **Frontend:** React, TypeScript, Vite, Ant Design, TanStack Query, Zustand
- **Database:** MySQL
- **Authentication:** JWT
- **Encryption:** AES-256-GCM for API keys

## Stack (Legacy - Python)

- **Backend:** Python, FastAPI, Cloudflare SDK, SQLAlchemy, Celery, Redis
- **Database:** PostgreSQL

## Quick Start (Node.js Backend - Recommended)

### 1. Setup MySQL

```bash
docker-compose -f docker-compose.node.yml up -d mysql
```

Hoặc dùng MySQL local, tạo database `cftool`.

### 2. Setup Backend

```bash
cd node-backend
npm install

# Tạo file .env từ .env.example và điền thông tin
# Tạo ENCRYPTION_KEY: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Chạy migrations
npm run prisma:migrate

# Generate Prisma client
npm run prisma:generate

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

