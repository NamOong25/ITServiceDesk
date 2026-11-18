# Kịch bản demo IT Service Desk

## Khởi động

Bật PostgreSQL và chạy frontend theo [README](../README.md). Trong CMD, chạy backend với cả hai profile:

```cmd
cd /d "D:\Video OBS\Portfolio\ITServiceDesk\backend"
mvnw.cmd spring-boot:run -Dspring-boot.run.profiles=demo,portfolio
```

Mở [trang ứng dụng local](http://127.0.0.1:5173). Dùng mật khẩu `DemoItsd-2026!` cho các tài khoản demo:

| Vai trò | Tài khoản |
| --- | --- |
| Nhân viên | `nhanvien@itsd.example` |
| IT | `it@itsd.example` |
| IT (nhận bàn giao) | `it2@itsd.example` |
| Quản lý | `quanly@itsd.example` |

Profile `portfolio` thêm mẫu vào dữ liệu local đang dùng. Khởi động lại giữ nguyên các thay đổi đã thực hiện trên mẫu. Để trình diễn lại từ đầu, tạo sự cố hoặc yêu cầu mới bằng form tương ứng.

Profile này có thêm 20 sự cố đánh dấu **[Mẫu]** và 12 yêu cầu cấp quyền có hậu tố **(mẫu)**. Hàng đợi có ca chưa nhận, đang xử lý, phản hồi đúng hoặc trễ hạn, đã xác nhận và đã mở lại. Danh sách cấp quyền có đủ các trạng thái chờ duyệt, đã duyệt, từ chối, đang xử lý và đã cấp. Dữ liệu sự cố trải từ ngày chạy lần đầu đến khoảng 10 tuần trước để thử bộ lọc 7, 30 hoặc 90 ngày trong **Tổng quan**.

## 1. Từ báo sự cố đến phản hồi

1. Ở vai trò nhân viên, mở **Sự cố của tôi** và tìm **[Demo] Máy in văn phòng không in được**.
2. Đổi sang tài khoản IT. Tìm yêu cầu trong **Hàng đợi sự cố** và bấm **Nhận xử lý**.
3. Lưu một **Ghi chú nội bộ**, gửi một **Phản hồi** cho nhân viên, rồi bấm **Đánh dấu đã giải quyết**.
4. Mở lại yêu cầu bằng tài khoản nhân viên để xem phản hồi công khai và trạng thái **Đã giải quyết**.

## 2. Giải thích SLA qua cuối tuần

Dùng tài khoản IT và tìm **[Demo SLA] Không kết nối được VPN**. Trong **Hạn phản hồi đầu tiên**, đối chiếu:

| Mốc | Giờ Việt Nam |
| --- | --- |
| Nhân viên gửi sự cố | Thứ Sáu, 16:30 |
| Hạn phải phản hồi | Thứ Hai, 09:30 |
| IT gửi phản hồi đầu tiên | Thứ Hai, 09:12 |
| Kết quả | Đúng hạn, sớm 18 phút làm việc |

Mở **Cách tính hạn** để xem 30 phút của thứ Sáu và 90 phút của thứ Hai. Trong **Hoạt động**, mốc 08:45 là ghi chú nội bộ, còn 09:12 là phản hồi đầu tiên gửi cho nhân viên. Dashboard của quản lý có sự cố Outlook đã quá hạn để đối chiếu. Chọn **30 ngày qua** nếu các mẫu lịch sử nằm ngoài khoảng 7 ngày.

## 3. Xin cấp quyền có phê duyệt

1. Ở vai trò nhân viên, mở **Yêu cầu cấp quyền** và xem yêu cầu **Figma (demo)** đang chờ duyệt.
2. Ở vai trò quản lý, mở yêu cầu từ **Tổng quan** hoặc **Yêu cầu cần duyệt**, rồi bấm **Duyệt yêu cầu**.
3. Ở vai trò IT, mở **Yêu cầu cấp quyền**. Chọn **Nhận xử lý**, rồi **Xác nhận đã cấp quyền** để minh họa xác nhận hoàn tất.
4. Kiểm tra nhân viên thấy trạng thái **Đã cấp quyền**. Để trình diễn nhánh từ chối, gửi thêm một yêu cầu và nhập lý do từ chối bằng tài khoản quản lý.

## 4. Bàn giao sự cố giữa hai nhân viên IT

1. Dùng tài khoản `it@itsd.example` để mở một sự cố mình đang xử lý, hoặc nhận một sự cố mới. Gửi một phản hồi công khai để lưu mốc phản hồi đầu tiên.
2. Trong **Thông tin xử lý**, mở **Bàn giao sự cố**. Chọn `it2@itsd.example`, nhập lý do như “Bàn giao ca chiều để kiểm tra thiết bị tại kho” và xác nhận.
3. Ở cửa sổ khác, đăng nhập `it2@itsd.example` rồi mở cùng sự cố. Kiểm tra người xử lý, mốc phản hồi đầu tiên và sự kiện **Đã bàn giao sự cố**. Tài khoản mới có thể tiếp tục phản hồi và giải quyết sự cố.
4. Ở cổng nhân viên, kiểm tra thông tin người xử lý đã đổi. Lý do bàn giao chỉ hiển thị ở cổng IT.
