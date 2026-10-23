# Ảnh giao diện cho README

Ảnh PNG chụp từ **component thật của frontend**, không phải mockup vẽ lại.
Dữ liệu do [script chụp ảnh](../../scripts/capture-readme.mjs) cung cấp: domain thuộc
example.com/net/org, email demo@example.com, IPv4 thuộc dải tài liệu 192.0.2.0/24.
Số liệu tổng quan là fixture minh hoạ, **không phải dữ liệu vận hành thực tế**.

## Chụp lại

1. Cài dependencies của frontend và chạy Vite ở http://localhost:5199.
2. Từ thư mục gốc repository, cài Playwright vào cache riêng (không đổi package ứng dụng):
   `npm install --prefix frontend/node_modules/.cache/readme-tools --no-save --package-lock=false playwright`
3. Windows dùng Microsoft Edge đã cài. Hệ điều hành khác cần cài Chromium qua CLI
   Playwright trong thư mục công cụ trên: `node frontend/node_modules/.cache/readme-tools/node_modules/playwright/cli.js install chromium`.
4. Chạy `node scripts/capture-readme.mjs` từ thư mục gốc.

Biến `SCREENSHOT_BASE_URL` cho phép dùng một frontend **localhost** khác. Script tạo
browser context mới cho từng ảnh, chặn service worker, thay toàn bộ API bằng fixture,
báo lỗi nếu thiếu fixture hoặc có JS error. Không kết nối backend/DB/Cloudflare,
không đọc credential và không sử dụng profile trình duyệt đang đăng nhập.

Ảnh: workspace sáng/tối (1440×1050), tổng quan và DNS editor (1440×900), mobile (390×844).
Ngôn ngữ: tiếng Việt. Animation tắt để kết quả chụp ổn định.