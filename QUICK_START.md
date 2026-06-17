# Quick Start - Chạy Tool Cloudflare

## ✅ Checklist Trước Khi Chạy

- [x] MySQL đang chạy (port 3307)
- [ ] Backend .env đã được cấu hình
- [ ] Frontend .env.local đã được tạo
- [ ] Dependencies đã được cài đặt

## 🚀 Các Bước Chạy Tool

### 1. Start MySQL (nếu chưa chạy)

```bash
docker-compose -f docker-compose.node.yml up -d mysql
```

### 2. Setup Backend

```bash
cd node-backend

# Cài dependencies (nếu chưa cài)
npm install

# Kiểm tra .env có đầy đủ:
# - DATABASE_URL=mysql://root:rootpassword@localhost:3307/cftool
# - JWT_SECRET=<bất kỳ string dài hơn 16 ký tự>
# - ENCRYPTION_KEY=<64 ký tự hex>
# - CORS_ORIGINS=http://localhost:5173

# Tạo ENCRYPTION_KEY nếu chưa có:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Chạy backend
npm run dev
```

**Backend sẽ chạy tại:** http://localhost:9000

### 3. Setup Frontend (Terminal mới)

```bash
cd frontend

# Cài dependencies (nếu chưa cài)
npm install

# Tạo file .env.local với nội dung:
echo "VITE_API_URL=http://localhost:9000/api" > .env.local

# Chạy frontend
npm run dev
```

**Frontend sẽ chạy tại:** http://localhost:5173

### 4. Tạo Admin Account (Tùy chọn)

```bash
cd node-backend
npm run seed:admin
```

**Tài khoản admin:**
- Email: `admin@example.com`
- Password: `Admin@123`

### 5. Sử dụng Tool

1. Mở browser: http://localhost:5173
2. Đăng nhập với admin hoặc đăng ký tài khoản mới
3. Vào **"CF Credentials"** → Nhập Cloudflare Email + Global API Key
4. Vào **"Domains"** → Xem và quản lý domains

## 🔧 Troubleshooting

### Backend không start được

```bash
# Kiểm tra MySQL
docker ps | findstr mysql

# Kiểm tra .env
cd node-backend
Get-Content .env

# Test connection thủ công
node -e "const mysql = require('mysql2/promise'); mysql.createConnection('mysql://root:rootpassword@localhost:3307/cftool').then(() => console.log('OK')).catch(e => console.log('Error:', e.message))"
```

### Frontend không kết nối backend

```bash
# Kiểm tra backend đang chạy
curl http://localhost:9000/health

# Kiểm tra .env.local
cd frontend
Get-Content .env.local
```

### Database error

```bash
# Xem logs MySQL
docker-compose -f docker-compose.node.yml logs mysql

# Restart MySQL
docker-compose -f docker-compose.node.yml restart mysql
```

## 📝 Lưu Ý

1. **ENCRYPTION_KEY**: Phải đúng 64 ký tự hex (32 bytes)
2. **Ports**: 
   - Backend: 9000
   - Frontend: 5173  
   - MySQL: 3307
3. **Database**: Tự động tạo tables khi backend start lần đầu
4. **Cloudflare API Key**: Lấy từ Cloudflare Dashboard > My Profile > API Tokens

## 🎯 Test Nhanh

```bash
# Test backend
curl http://localhost:9000/health

# Test frontend (mở browser)
http://localhost:5173
```
