# Hướng Dẫn Chạy Project Cloudflare Automation Tool

## 📋 Phân Tích Project

### Mục đích
Công cụ tự động hóa quản lý Cloudflare với các tính năng:
- ✅ Quản lý domains (thêm, xóa, cấu hình)
- ✅ Quản lý DNS records
- ✅ Quản lý Cache (purge cache)
- ✅ Quản lý Rules (Page Rules, Firewall Rules)
- ✅ Templates (tạo và áp dụng templates)
- ✅ Monitoring (theo dõi metrics)
- ✅ Bulk operations (thao tác hàng loạt)
- ✅ Background jobs (Celery)

### Tech Stack
- **Backend:** FastAPI, SQLAlchemy, Alembic, Celery, Redis
- **Frontend:** React + TypeScript + Vite + Ant Design
- **Database:** PostgreSQL
- **Cache/Queue:** Redis

---

## 🚀 Cách 1: Chạy với Docker (Khuyến nghị - Dễ nhất)

### Bước 1: Kiểm tra Docker
Đảm bảo bạn đã cài Docker và Docker Compose:
```bash
docker --version
docker-compose --version
```

### Bước 2: Tạo file `.env` (nếu cần)
Tạo file `backend/.env` nếu muốn override cấu hình mặc định:
```env
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/cftool
REDIS_URL=redis://redis:6379/0
SECRET_KEY=your-secret-key-change-in-production
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

### Bước 3: Chạy toàn bộ stack
```bash
# Chạy tất cả services (PostgreSQL, Redis, Backend, Celery)
docker-compose up -d

# Xem logs
docker-compose logs -f
```

### Bước 4: Chạy migrations (tạo database tables)
```bash
docker-compose exec backend alembic upgrade head
```

### Bước 5: Tạo tài khoản admin (chạy 1 lần)
```bash
docker-compose exec backend python seed_admin.py
```

**Tài khoản admin mặc định:**
- **Email:** `admin@example.com`
- **Password:** `Admin@123`

### Bước 6: Chạy Frontend (riêng biệt)
Mở terminal mới:
```bash
cd frontend
npm install
npm run dev
```

### Truy cập ứng dụng:
- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:8000
- **API Docs:** http://localhost:8000/docs
- **PostgreSQL:** localhost:5433
- **Redis:** localhost:6380

---

## 🛠️ Cách 2: Chạy Manual (Không dùng Docker)

### Bước 1: Cài đặt PostgreSQL và Redis

#### PostgreSQL:
- Tải và cài PostgreSQL từ https://www.postgresql.org/download/
- Tạo database: `cftool`
- Hoặc dùng Docker chỉ cho PostgreSQL:
  ```bash
  docker run -d --name postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=cftool -p 5432:5432 postgres:15-alpine
  ```

#### Redis:
- Tải và cài Redis từ https://redis.io/download
- Hoặc dùng Docker chỉ cho Redis:
  ```bash
  docker run -d --name redis -p 6379:6379 redis:7-alpine
  ```

### Bước 2: Setup Backend

```bash
# Di chuyển vào thư mục backend
cd backend

# Tạo virtual environment
python -m venv venv

# Kích hoạt virtual environment
# Windows PowerShell:
.\venv\Scripts\Activate.ps1
# Windows CMD:
venv\Scripts\activate.bat
# Linux/Mac:
source venv/bin/activate

# Cài đặt dependencies
pip install -r requirements.txt
```

### Bước 3: Cấu hình Backend

Tạo file `backend/.env`:
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/cftool
REDIS_URL=redis://localhost:6379/0
SECRET_KEY=your-secret-key-change-in-production-please-use-random-string
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

### Bước 4: Chạy Migrations

```bash
# Đảm bảo đang ở trong thư mục backend và đã activate venv
alembic upgrade head
```

### Bước 5: Tạo Admin Account

```bash
python seed_admin.py
```

**Tài khoản admin:**
- **Email:** `admin@example.com`
- **Password:** `Admin@123`

### Bước 6: Chạy Backend Server

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend sẽ chạy tại: http://localhost:8000

### Bước 7: Chạy Celery Worker (cho background jobs)

Mở terminal mới:
```bash
cd backend
# Activate venv nếu chưa
.\venv\Scripts\Activate.ps1  # Windows PowerShell
# hoặc
venv\Scripts\activate.bat     # Windows CMD

celery -A app.tasks.celery_app worker --loglevel=info
```

### Bước 8: Setup Frontend

Mở terminal mới:
```bash
cd frontend

# Cài đặt dependencies
npm install

# Chạy development server
npm run dev
```

Frontend sẽ chạy tại: http://localhost:5173

---

## 📝 Tóm Tắt Các Ports

| Service | Port | URL |
|---------|------|-----|
| Frontend | 5173 | http://localhost:5173 |
| Backend API | 8000 | http://localhost:8000 |
| API Docs | 8000 | http://localhost:8000/docs |
| PostgreSQL (Docker) | 5433 | localhost:5433 |
| Redis (Docker) | 6380 | localhost:6380 |

---

## 🔧 Troubleshooting

### Lỗi kết nối database
- Kiểm tra PostgreSQL đã chạy chưa
- Kiểm tra `DATABASE_URL` trong `.env` đúng chưa
- Kiểm tra database `cftool` đã được tạo chưa

### Lỗi kết nối Redis
- Kiểm tra Redis đã chạy chưa
- Kiểm tra `REDIS_URL` trong `.env` đúng chưa

### Lỗi migration
```bash
# Xem trạng thái migration hiện tại
alembic current

# Xem lịch sử migration
alembic history

# Rollback nếu cần
alembic downgrade -1
```

### Lỗi frontend không kết nối được backend
- Kiểm tra backend đã chạy tại port 8000 chưa
- Kiểm tra CORS settings trong `backend/app/core/config.py`
- Kiểm tra proxy config trong `frontend/vite.config.ts`

### Xóa và chạy lại từ đầu (Docker)
```bash
# Dừng và xóa containers
docker-compose down

# Xóa volumes (xóa database)
docker-compose down -v

# Chạy lại
docker-compose up -d
docker-compose exec backend alembic upgrade head
docker-compose exec backend python seed_admin.py
```

---

## 📚 Tài Liệu Tham Khảo

- **API Documentation:** http://localhost:8000/docs (khi backend đang chạy)
- **FastAPI Docs:** https://fastapi.tiangolo.com/
- **React Docs:** https://react.dev/
- **Cloudflare API:** https://developers.cloudflare.com/api/

---

## ✅ Checklist Chạy Project

- [ ] Đã cài Docker (hoặc PostgreSQL + Redis)
- [ ] Đã clone project
- [ ] Đã tạo file `backend/.env` (nếu cần)
- [ ] Đã chạy `docker-compose up -d` (hoặc setup manual)
- [ ] Đã chạy migrations: `alembic upgrade head`
- [ ] Đã tạo admin: `python seed_admin.py`
- [ ] Backend đang chạy tại port 8000
- [ ] Celery worker đang chạy (nếu cần background jobs)
- [ ] Frontend đang chạy tại port 5173
- [ ] Đã đăng nhập với `admin@example.com` / `Admin@123`

---

Chúc bạn chạy project thành công! 🎉
