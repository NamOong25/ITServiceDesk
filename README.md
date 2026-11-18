# IT Service Desk

Ứng dụng hỗ trợ IT nội bộ. Các chức năng dự kiến gồm báo sự cố, theo dõi hạn phản hồi và xin cấp quyền có phê duyệt.

Dự án dùng React + TypeScript, Spring Boot và PostgreSQL chạy bằng Docker Compose. Backend xác thực tài khoản và kiểm tra quyền của nhân viên, IT và quản lý.

[Kịch bản demo portfolio và cách bật dữ liệu mẫu](docs/DEMO.md).

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

## Thử luồng báo sự cố

Đăng nhập bằng tài khoản nhân viên demo. Chọn **Báo sự cố** trong **Yêu cầu của tôi**, nhập tiêu đề, nhóm sự cố, phạm vi ảnh hưởng và mô tả. Sau khi gửi, trang chi tiết hiển thị mã yêu cầu và trạng thái **Mới**. Bạn có thể tải lại trang chi tiết hoặc quay về danh sách để mở lại yêu cầu.

## Thử luồng xử lý sự cố

1. Đăng nhập với tài khoản nhân viên demo và gửi một sự cố.
2. Đăng nhập với tài khoản IT demo ở cửa sổ ẩn danh. Trong **Hàng đợi IT**, tìm mã sự cố rồi mở chi tiết và bấm **Nhận xử lý**.
3. Gửi một **Phản hồi** và lưu một **Ghi chú nội bộ**. Sau đó bấm **Đánh dấu đã giải quyết**.
4. Quay lại trang chi tiết của nhân viên và tải lại. Trang hiển thị phản hồi công khai và trạng thái **Đã giải quyết**. Ghi chú nội bộ chỉ hiển thị ở phía IT.

## Kiểm tra hạn phản hồi đầu tiên

Trong **Hàng đợi IT**, mở một sự cố và xem **Hạn phải phản hồi** cùng **Phản hồi đầu tiên** ở khung thông tin xử lý. Hạn được tính sau 2 giờ làm việc, trong khung 08:00–17:00 từ thứ Hai đến thứ Sáu theo giờ Việt Nam. Một yêu cầu gửi lúc 16:30 thứ Sáu đến hạn lúc 09:30 thứ Hai.

Nhãn **Sắp đến hạn** áp dụng khi còn tối đa 30 phút làm việc. Thời gian còn lại, sớm hoặc muộn hiển thị theo phút làm việc. Gửi ghi chú nội bộ để xác nhận dòng **Phản hồi đầu tiên** vẫn hiện **Chưa có**, rồi gửi phản hồi cho nhân viên và kiểm tra giờ phản hồi xuất hiện. Các phản hồi tiếp theo giữ nguyên mốc đầu tiên.

## Thử luồng xin cấp quyền

1. Dùng tài khoản nhân viên demo. Mở **Yêu cầu cấp quyền → Xin cấp quyền** và nhập phần mềm, quyền cần cấp và lý do.
2. Dùng tài khoản quản lý demo. Mở **Yêu cầu cần duyệt**, chọn yêu cầu rồi duyệt hoặc từ chối. Khi từ chối, nhập lý do để nhân viên xem lại.
3. Dùng tài khoản IT demo. Trong **Yêu cầu cấp quyền**, chọn yêu cầu đã duyệt và bấm **Nhận xử lý**. Sau khi cấp quyền trên phần mềm đích, bấm **Xác nhận đã cấp quyền**.
4. Quay lại tài khoản nhân viên để xem quyết định của quản lý và trạng thái cuối cùng.

## Xem tổng quan của quản lý

Đăng nhập bằng tài khoản quản lý và mở **Tổng quan**. Bộ lọc 7, 30 hoặc 90 ngày tính các sự cố được gửi trong số ngày lịch đã chọn, tính cả hôm nay theo giờ Việt Nam. Thẻ phản hồi trung bình chỉ tính những sự cố đã có phản hồi công khai đầu tiên, theo phút làm việc và làm tròn đến phút gần nhất.

Thẻ chờ duyệt đếm toàn bộ yêu cầu cấp quyền đang chờ do bạn phụ trách. Trang tổng quan hiển thị tối đa ba yêu cầu chờ lâu nhất và dẫn đến danh sách đầy đủ.


## Thử tóm tắt sự cố bằng Gemini

Tạo khóa ở [Google AI Studio](https://aistudio.google.com/api-keys). Dùng dự án Gemini API Free Tier và chỉ thử với dữ liệu mẫu hoặc nội dung đã bỏ thông tin nhạy cảm. Trong cửa sổ CMD chạy backend, đặt biến môi trường trước khi khởi động lại.

```cmd
cd /d "D:\Video OBS\Portfolio\ITServiceDesk\backend"
set "GEMINI_API_KEY=THAY_BANG_KHOA_CUA_BAN"
mvnw.cmd spring-boot:run -Dspring-boot.run.profiles=demo,portfolio
```

Đăng nhập vai trò IT, mở sự cố mẫu VPN và bấm **Tạo tóm tắt**. Phần này dùng Gemini 3.1 Flash-Lite và chỉ gửi mô tả cùng tối đa 12 phản hồi công khai gần nhất. Kết quả hiện trong trang chi tiết đang mở.
