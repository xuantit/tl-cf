# Hướng Dẫn Chạy Tool Cloudflare Automation

## Bước 1: Kiểm tra MySQL đang chạy

```bash
# Kiểm tra MySQL container
docker ps | findstr mysql

# Nếu chưa chạy, start MySQL:
docker-compose -f docker-compose.node.yml up -d mysql

# Kiểm tra MySQL đã sẵn sàng:
docker-compose -f docker-compose.node.yml ps mysql
```

## Bước 2: Setup Backend (Node.js)

```bash
cd node-backend

# 1. Cài đặt dependencies
npm install

# 2. Tạo file .env (nếu chưa có)
# Copy từ .env.example hoặc tạo mới với nội dung:

# PORT=9000
# DATABASE_URL=mysql://root:rootpassword@localhost:3307/cftool
# JWT_SECRET=your-super-secret-jwt-key-change-in-production-min-16-chars
# ENCRYPTION_KEY=<tạo key 64 ký tự hex>
# CORS_ORIGINS=http://localhost:5173

# 3. Tạo ENCRYPTION_KEY (chạy lệnh này để tạo key ngẫu nhiên):
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Copy output và paste vào .env

# 4. Chạy backend
npm run dev
```

Backend sẽ chạy tại: **http://localhost:9000**

## Bước 3: Setup Frontend

Mở terminal mới:

```bash
cd frontend

# 1. Cài đặt dependencies
npm install

# 2. Tạo file .env.local với nội dung:
# VITE_API_URL=http://localhost:9000/api

# 3. Chạy frontend
npm run dev
```

Frontend sẽ chạy tại: **http://localhost:5173**

## Bước 4: Sử dụng Tool

1. Mở trình duyệt: http://localhost:5173
2. Đăng ký tài khoản mới hoặc đăng nhập
3. Vào **"CF Credentials"** để nhập:
   - Cloudflare Email
   - Global API Key (tìm trong Cloudflare Dashboard > My Profile > API Tokens)
4. Vào **"Domains"** để xem danh sách domains
5. Click vào domain để chỉnh sửa DNS, Cache, Rules

## Troubleshooting

### Backend không chạy được

```bash
# Kiểm tra MySQL đã chạy chưa
docker ps | findstr mysql

# Kiểm tra DATABASE_URL trong .env đúng chưa
# Format: mysql://user:password@host:port/database

# Kiểm tra port 9000 có bị chiếm không
netstat -ano | findstr :9000
```

### Frontend không kết nối được backend

```bash
# Kiểm tra backend đang chạy tại port 9000
curl http://localhost:9000/health

# Kiểm tra VITE_API_URL trong frontend/.env.local
# Phải là: http://localhost:9000/api
```

### Database connection error

```bash
# Kiểm tra MySQL container
docker-compose -f docker-compose.node.yml logs mysql

# Restart MySQL nếu cần
docker-compose -f docker-compose.node.yml restart mysql
```

## Cấu trúc Project

```
tool-cf/
├── node-backend/          # Backend Node.js + Express + MySQL
│   ├── src/
│   │   ├── db/            # Database connection & migrations
│   │   ├── models/        # Data models
│   │   ├── routes/        # API routes
│   │   ├── services/      # Business logic (Cloudflare API)
│   │   └── utils/         # Utilities (encryption, env)
│   └── .env               # Environment variables
│
├── frontend/              # Frontend React + Vite
│   ├── src/
│   │   ├── pages/         # React pages
│   │   ├── components/    # React components
│   │   ├── services/      # API client
│   │   └── stores/        # State management
│   └── .env.local         # Frontend env vars
│
└── docker-compose.node.yml # Docker config cho MySQL
```

## API Endpoints

- `GET /health` - Health check
- `POST /api/auth/register` - Đăng ký
- `POST /api/auth/login` - Đăng nhập
- `POST /api/cf/credentials` - Lưu Cloudflare credentials
- `GET /api/domains` - List domains
- `GET /api/domains/:zoneId/dns` - List DNS records
- `POST /api/domains/:zoneId/dns` - Tạo DNS record
- Và nhiều endpoints khác...

## Lưu ý quan trọng

1. **ENCRYPTION_KEY**: Phải là 64 ký tự hex (32 bytes). Dùng lệnh Node.js để generate.
2. **JWT_SECRET**: Nên đổi thành secret key mạnh trong production.
3. **MySQL**: Đảm bảo MySQL container đang chạy trước khi start backend.
4. **Ports**: 
   - Backend: 9000
   - Frontend: 5173
   - MySQL: 3307 (host) -> 3306 (container)

## Production Deployment

1. Set các biến môi trường trong production environment
2. Build frontend: `cd frontend && npm run build`
3. Serve frontend build folder hoặc deploy lên Vercel/Netlify
4. Deploy backend lên server với PM2 hoặc Docker
5. Sử dụng managed MySQL service (AWS RDS, DigitalOcean, etc.)
