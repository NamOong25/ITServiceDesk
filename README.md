# IT Service Desk

Ứng dụng hỗ trợ IT nội bộ. Các chức năng dự kiến gồm báo sự cố, theo dõi hạn phản hồi và xin cấp quyền có phê duyệt.

Dự án dùng React + TypeScript, Spring Boot và PostgreSQL chạy bằng Docker Compose. Backend xác thực tài khoản và kiểm tra quyền của nhân viên, IT và quản lý.

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
mvnw.cmd spring-boot:run -Dspring-boot.run.profiles=demo
```

Mở CMD thứ ba để chạy frontend.

```cmd
cd /d "D:\Video OBS\Portfolio\ITServiceDesk\frontend"
npm ci
npm run dev
```

Mở [trang web](http://127.0.0.1:5173) và đăng nhập bằng một trong ba tài khoản demo sau.

| Vai trò | Email |
| --- | --- |
| Nhân viên | nhanvien@itsd.example |
| IT | it@itsd.example |
| Quản lý | quanly@itsd.example |

Mật khẩu demo dùng chung là `DemoItsd-2026!`. Profile `demo` tạo và cho phép dùng các tài khoản này trên môi trường local. Flyway tạo bảng tài khoản khi backend khởi động, nên PostgreSQL cần sẵn sàng trước.

[Kiểm tra kết nối PostgreSQL](http://127.0.0.1:8081/actuator/health/database) trả về `{"status":"UP"}` khi kết nối thành công.

`npm run build` tạo bản build frontend. Trong backend, `mvnw.cmd package` tạo tệp JAR.

Dùng `Ctrl+C` để dừng frontend và backend. Chạy `docker compose down` từ thư mục gốc để dừng PostgreSQL. Dữ liệu local được giữ trong Docker volume.

Thông tin kết nối mặc định dành cho máy phát triển. Có thể ghi đè kết nối backend bằng `ITSD_DB_URL`, `ITSD_DB_USER` và `ITSD_DB_PASSWORD`.
