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

## 5. Chờ nhân viên và theo dõi hạn giải quyết

1. Nhân viên báo một sự cố ảnh hưởng **Một nhóm**. IT nhận xử lý rồi kiểm tra **Hạn giải quyết** trong **Thông tin xử lý**. Mức ưu tiên ban đầu Trung bình có 8 giờ làm việc.
2. Trong **Trả lời nhân viên**, nhập câu hỏi và bấm **Gửi và chờ phản hồi**. Câu hỏi xuất hiện ở cả hai cổng. Nếu đây là phản hồi công khai đầu tiên, hệ thống ghi nhận luôn mốc phản hồi đầu tiên. Mục **Hạn giải quyết** hiển thị **Đang tạm dừng**.
3. Nhân viên vào chi tiết và bấm **Gửi phản hồi**. Sự cố tự trở lại **Đang xử lý** với cùng người phụ trách. IT mở lại hoặc chuyển về tab chi tiết để xem hạn mới.
4. IT đánh dấu **Đã giải quyết**. Nếu nhân viên mở lại sự cố, đồng hồ giải quyết tiếp tục từ thời lượng đã dùng.

Thời lượng tính từ lúc gửi sự cố, với các mức Cao 4 giờ, Trung bình 8 giờ và Thấp 16 giờ. Hệ thống dùng mức ưu tiên ban đầu theo phạm vi ảnh hưởng, lịch làm việc 08:00–17:00 từ thứ Hai đến thứ Sáu và giờ Việt Nam.

## 6. Theo dõi sự cố của nhóm

1. Đăng nhập bằng tài khoản quản lý. Ở **Tổng quan nhóm**, chọn **30 ngày qua** rồi bấm từng thẻ **Quá hạn phản hồi đầu tiên**, **Quá hạn giải quyết** và **Chờ nhân viên phản hồi** để lọc danh sách **Sự cố của nhóm**.
2. Mở một sự cố trong danh sách. Xem người xử lý, lịch sử trao đổi công khai và hai hạn SLA. Bấm **Tổng quan nhóm** để quay về đúng khoảng ngày và bộ lọc.
3. Để thử bộ lọc chờ, thực hiện bước 2 ở phần 5 trên một sự cố của nhân viên thuộc nhóm. Nếu sự cố đã vượt hạn giải quyết trước khi tạm dừng, nó xuất hiện ở cả bộ lọc chờ và bộ lọc quá hạn.

## 7. Thông báo trong ứng dụng

Dùng hai cửa sổ riêng khi thử. Nhân viên tạo một yêu cầu cấp quyền mới. Quản lý mở chuông cạnh **Đăng xuất**, chọn thông báo để mở đúng yêu cầu và duyệt. Khi nhân viên quay lại tab của mình, chuông cập nhật số chưa đọc. Mở thông báo để kiểm tra số chưa đọc giảm đi.

Ở luồng sự cố, IT gửi câu hỏi bằng **Gửi và chờ phản hồi**. Nhân viên nhận thông báo và trả lời. Người đang xử lý sẽ nhận thông báo phản hồi. Có thể thử thêm việc bàn giao sang `it2@itsd.example` và đánh dấu đã giải quyết để xem thông báo tương ứng.

## 8. Kho hướng dẫn

1. Ở cổng IT, mở sự cố đã giải quyết **[Demo SLA] Không kết nối được VPN**. Trong **Thông tin xử lý**, bấm **Soạn bài hướng dẫn**.
2. Đặt tiêu đề dễ tìm, nhập các bước xử lý rồi **Lưu bản nháp**. Bản nháp chỉ hiển thị trong Kho hướng dẫn của đội IT. Bấm **Xuất bản** khi bài sẵn sàng cho nhân viên.
3. Đăng nhập bằng tài khoản nhân viên, mở **Kho hướng dẫn** và tìm bài theo tiêu đề hoặc nhóm sự cố. Trong bài, bấm **Báo sự cố** nếu lỗi vẫn còn.
4. Điền và gửi yêu cầu. Mở sự cố mới bằng tài khoản IT để xem liên kết **Hướng dẫn đã thử** trong phần mô tả.

## 9. Thiết bị và lịch sử sự cố

1. Đăng nhập IT, vào **Thiết bị** và tìm **DEMO-LT-01**. Trong **Lịch sử sự cố**, mở ca laptop tắt nguồn để xem phản hồi IT về việc thay pin.
2. Đăng nhập nhân viên demo, mở **Báo sự cố**, chọn **DEMO-LT-01** ở trường **Thiết bị liên quan** và gửi yêu cầu mới.
3. Dùng tài khoản IT mở yêu cầu vừa tạo. Bấm **Xem lịch sử** ở phần **Thiết bị liên quan** để xem cả yêu cầu mới và lần xử lý trước.
4. Trong trang thiết bị, thử **Chỉnh sửa** và đổi sang **Bảo trì**. Thiết bị rời danh sách có thể chọn của nhân viên, còn các sự cố trước vẫn truy cập được từ lịch sử.
