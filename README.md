# IT Service Desk

Ứng dụng hỗ trợ IT nội bộ. Các chức năng dự kiến gồm báo sự cố, theo dõi hạn phản hồi và xin cấp quyền có phê duyệt.

Bước khởi tạo có frontend React + TypeScript, backend Spring Boot và PostgreSQL chạy bằng Docker Compose. Trang web kiểm tra kết nối PostgreSQL thông qua backend.

## Chạy trên Windows

Cần Java 21, Node.js (20.19 trở lên trong nhánh 20 hoặc 22.12 trở lên) và Docker Desktop đang chạy. Maven Wrapper nằm sẵn trong thư mục backend.

Trong CMD, chạy từ thư mục dự án để bật PostgreSQL. Các cổng local là 5433 cho PostgreSQL, 8081 cho backend và 5173 cho frontend.

```cmd
cd /d "D:\Video OBS\Portfolio\ITServiceDesk"
docker compose up -d --wait postgres
```

Mở CMD thứ hai để chạy backend.

```cmd
cd /d "D:\Video OBS\Portfolio\ITServiceDesk\backend"
mvnw.cmd spring-boot:run
```

Mở CMD thứ ba để chạy frontend.

```cmd
cd /d "D:\Video OBS\Portfolio\ITServiceDesk\frontend"
npm ci
npm run dev
```

Mở [trang web](http://127.0.0.1:5173). Khi PostgreSQL và backend đã sẵn sàng, trang hiện **Đã kết nối PostgreSQL**. Bạn cũng có thể mở [địa chỉ kiểm tra hệ thống](http://127.0.0.1:8081/actuator/health/database) và xem kết quả `{"status":"UP"}`.

`npm run build` tạo bản build frontend. Trong backend, `mvnw.cmd package` tạo tệp JAR.

Dùng `Ctrl+C` để dừng frontend và backend. Chạy `docker compose down` từ thư mục gốc để dừng PostgreSQL. Dữ liệu local được giữ trong Docker volume.

Thông tin kết nối mặc định dành cho máy phát triển. Có thể ghi đè kết nối backend bằng `ITSD_DB_URL`, `ITSD_DB_USER` và `ITSD_DB_PASSWORD`.
