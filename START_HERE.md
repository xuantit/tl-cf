# 🚀 BẮT ĐẦU TẠI ĐÂY - Hướng Dẫn Chạy Tool

## ✅ Kiểm Tra Nhanh

MySQL đang chạy ✅ (port 3307)

## 📋 Các Bước Chạy Tool

### Bước 1: Kiểm tra Backend .env

```bash
cd node-backend
```

Đảm bảo file `.env` có đầy đủ:
- `DATABASE_URL=mysql://root:rootpassword@localhost:3307/cftool`
- `JWT_SECRET=<bất kỳ string dài hơn 16 ký tự>`
- `ENCRYPTION_KEY=<64 ký tự hex>` ⚠️ QUAN TRỌNG
- `CORS_ORIGINS=http://localhost:5173`

**Nếu ENCRYPTION_KEY chưa đủ 64 ký tự, chạy lệnh này để tạo:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Copy output và paste vào `.env`

### Bước 2: Chạy Backend

```bash
cd node-backend
npm install  # Nếu chưa cài
npm run dev
```

✅ Backend sẽ chạy tại: **http://localhost:9000**

### Bước 3: Chạy Frontend (Terminal mới)

```bash
cd frontend
npm install  # Nếu chưa cài
npm run dev
```

✅ Frontend sẽ chạy tại: **http://localhost:5173**

### Bước 4: Tạo Admin Account (Tùy chọn)

```bash
cd node-backend
npm run seed:admin
```

**Tài khoản admin mặc định:**
- Email: `admin@example.com`
- Password: `Admin@123`

### Bước 5: Sử dụng Tool

1. Mở browser: **http://localhost:5173**
2. Đăng nhập với tài khoản admin hoặc đăng ký tài khoản mới
3. Vào **"CF Credentials"** 
4. Nhập:
   - Cloudflare Email
   - Global API Key (lấy từ Cloudflare Dashboard)
5. Vào **"Domains"** để xem và quản lý

## 🆘 Nếu Gặp Lỗi

### Backend không chạy
```bash
# Kiểm tra MySQL
docker ps | findstr mysql

# Nếu MySQL không chạy:
docker-compose -f docker-compose.node.yml up -d mysql
```

### Frontend không kết nối được backend
```bash
# Kiểm tra backend
curl http://localhost:9000/health

# Nếu không có response, backend chưa chạy
```

### Database error
- Kiểm tra DATABASE_URL trong `.env` đúng chưa
- Kiểm tra MySQL container đang chạy

## 📞 Test Nhanh

```bash
# Test backend
curl http://localhost:9000/health
# Kết quả mong đợi: {"status":"healthy"}

# Test frontend
# Mở browser: http://localhost:5173
```

---

**Tóm tắt:** 
1. ✅ MySQL đang chạy
2. ⚠️ Kiểm tra backend/.env (đặc biệt ENCRYPTION_KEY)
3. 🚀 Chạy `npm run dev` trong cả 2 thư mục (backend và frontend)
4. 🌐 Mở http://localhost:5173 và sử dụng!
