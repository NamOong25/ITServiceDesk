package com.itservicedesk.auth;

import java.nio.charset.StandardCharsets;
import java.sql.Types;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZonedDateTime;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;

final class PortfolioSamples {
    private final JdbcClient db;
    private final PortfolioDemo.Accounts accounts;
    private final ZonedDateTime now;

    PortfolioSamples(JdbcClient db, PortfolioDemo.Accounts accounts, ZonedDateTime now) {
        this.db = db;
        this.accounts = accounts;
        this.now = now;
    }

    void seed() {
        List.of(
                new Incident("wifi", "Wi-Fi phòng họp tầng 4 mất kết nối", "NETWORK", "TEAM", -1,
                        "Cuộc họp lúc 10 giờ bị gián đoạn. Các máy vẫn kết nối được ở khu làm việc bên ngoài.", "NEW", 0, null, null),
                new Incident("erp", "Không mở được hệ thống ERP khi chốt đơn", "SOFTWARE", "MANY_USERS", 1,
                        "Nhân viên ở hai ca đều gặp lỗi 503 khi mở trang đơn bán hàng. Hiện chưa ghi nhận đơn bị mất.", "IN_PROGRESS", 0, null, null),
                new Incident("dock", "Màn hình rời nhấp nháy khi gắn dock USB-C", "DEVICE", "PERSONAL", 1,
                        "Màn hình ngoài chớp sau khoảng 15 phút. Đã thử đổi dây HDMI và kiểm tra trên một màn hình khác.", "IN_PROGRESS", 35,
                        "IT đã đổi sang dock dự phòng. Bạn theo dõi giúp trong buổi chiều nhé.", null),
                new Incident("scanner", "Máy quét mã vạch quầy nhận hàng bị ngắt", "DEVICE", "TEAM", 2,
                        "Máy quét số 2 ngắt sau mỗi lần đọc mã. Hai nhân viên đang dùng chung máy còn lại để nhập hàng.", "IN_PROGRESS", 0, null, null),
                new Incident("proxy", "Trang đối soát không mở được từ mạng văn phòng", "NETWORK", "TEAM", 2,
                        "Trang đối soát hoạt động trên mạng di động. Khi dùng mạng văn phòng, trình duyệt báo lỗi proxy.", "RESOLVED", 145,
                        "Đã cập nhật cấu hình proxy. Bạn thử mở lại trang đối soát trên mạng văn phòng.", "CONFIRMED"),
                new Incident("excel", "Excel treo khi mở bảng tổng hợp doanh số", "SOFTWARE", "PERSONAL", 3,
                        "Excel đứng ở màn hình tính công thức khi mở tệp. Các tệp nhỏ khác vẫn mở được.", "RESOLVED", 22,
                        "Đã tắt tiện ích mở rộng bị lỗi. Bạn có thể mở lại bảng và kiểm tra hai sheet tổng hợp.", "CONFIRMED"),
                new Incident("camera", "Camera phòng họp không nhận trên Teams", "DEVICE", "TEAM", 3,
                        "Teams chỉ thấy camera tích hợp. Lỗi xuất hiện sau lần cập nhật máy phòng họp.", "RESOLVED", 48,
                        "Đã cài lại trình điều khiển. Camera phòng họp đã xuất hiện trong danh sách thiết bị.", null),
                new Incident("share", "Ổ đĩa dùng chung bị ngắt sau khi máy ngủ", "NETWORK", "PERSONAL", 4,
                        "Sau khi mở lại laptop, ổ S: không truy cập được. Khởi động lại máy khắc phục tạm thời.", "IN_PROGRESS", 70,
                        "Đã cập nhật kết nối ổ đĩa. Bạn thử cho máy ngủ rồi mở lại để kiểm tra.", "REOPENED"),
                new Incident("sso", "Cổng chấm công quay vòng ở màn đăng nhập", "SOFTWARE", "MANY_USERS", 5,
                        "Nhiều người trong ca sáng đăng nhập xong bị chuyển về màn hình ban đầu. Khung chấm công vẫn còn đến 10 giờ.", "RESOLVED", 165,
                        "Đã khôi phục kết nối với hệ thống đăng nhập. Ca sáng có thể bổ sung công đến 12 giờ.", "CONFIRMED"),
                new Incident("headset", "Cổng tai nghe laptop không nhận thiết bị", "OTHER", "PERSONAL", 6,
                        "Tai nghe hoạt động trên máy khác nhưng laptop không nhận. Cần mượn tai nghe USB trong lúc kiểm tra.", "NEW", 0, null, null),
                new Incident("printer", "Máy in nhãn xuất nhầm khổ giấy A4", "DEVICE", "TEAM", 7,
                        "Ứng dụng kho gửi đúng mã lô nhưng nhãn in bị lệch và không đọc được.", "RESOLVED", 16,
                        "Đã đặt lại khổ nhãn 100 × 150 mm và in thử một tem.", "CONFIRMED"),
                new Incident("dns", "Máy ở khu đào tạo không phân giải tên miền nội bộ", "NETWORK", "TEAM", 9,
                        "Máy ở khu đào tạo vào Internet được nhưng không mở được cổng tài liệu nội bộ.", "RESOLVED", 89,
                        "Đã cập nhật DNS trên mạng khu đào tạo. Cổng tài liệu đã mở được.", null),
                new Incident("storage", "Ổ đĩa laptop gần đầy sau đồng bộ OneDrive", "SOFTWARE", "PERSONAL", 11,
                        "Ổ C còn dưới 2 GB. OneDrive đang tải lại toàn bộ thư mục dự án cũ.", "RESOLVED", 150,
                        "Đã bật Tệp theo yêu cầu cho các thư mục lưu trữ. Ổ C đã có thêm 24 GB.", "CONFIRMED"),
                new Incident("onboarding", "Chưa có bộ sạc cho máy mượn", "OTHER", "PERSONAL", 14,
                        "Máy bàn giao có số tài sản trên biên bản nhưng thiếu bộ sạc 65 W.", "IN_PROGRESS", 24,
                        "Kho còn bộ sạc cùng chuẩn. Bạn ghé bàn hỗ trợ lúc 14 giờ để nhận nhé.", null),
                new Incident("meeting", "Không tải được bản ghi cuộc họp Teams", "SOFTWARE", "TEAM", 18,
                        "Người tham dự nhận thông báo không có quyền ở liên kết bản ghi đã chia sẻ.", "RESOLVED", 54,
                        "Đã cập nhật quyền xem bản ghi cho thành viên cuộc họp.", "CONFIRMED"),
                new Incident("battery", "Laptop tắt nguồn khi pin còn 40%", "DEVICE", "PERSONAL", 22,
                        "Máy hoạt động ổn khi cắm sạc. Khi dùng pin, máy tắt đột ngột và không hiện cảnh báo.", "RESOLVED", 33,
                        "Đã thay pin và chạy kiểm tra trong 45 phút.", "CONFIRMED"),
                new Incident("guest", "Mạng khách không cấp địa chỉ IP cho thiết bị mới", "NETWORK", "MANY_USERS", 29,
                        "Thiết bị đã kết nối từ trước vẫn dùng được. Các máy mới dừng ở bước lấy địa chỉ IP.", "RESOLVED", 135,
                        "Đã khôi phục cấp địa chỉ IP trên mạng khách. IT đang theo dõi số kết nối.", null),
                new Incident("warranty", "Thiếu thông tin bảo hành trên hồ sơ thiết bị", "OTHER", "PERSONAL", 36,
                        "Phiếu bàn giao màn hình mới chưa ghi ngày hết hạn bảo hành.", "RESOLVED", 38,
                        "Đã đối chiếu số sê-ri với nhà cung cấp và cập nhật hồ sơ tài sản.", "CONFIRMED"),
                new Incident("bi", "Báo cáo Power BI không cập nhật dữ liệu đầu ngày", "SOFTWARE", "TEAM", 53,
                        "Biểu đồ vẫn hiển thị số của hôm qua và lịch làm mới báo thất bại.", "RESOLVED", 112,
                        "Đã làm mới thông tin kết nối của nguồn dữ liệu và chạy lại báo cáo.", "CONFIRMED"),
                new Incident("switch", "Mạng khu đóng gói chập chờn vào đầu ca", "NETWORK", "MANY_USERS", 72,
                        "Máy đóng gói mất kết nối từng đợt 30 giây, ảnh hưởng việc đồng bộ phiếu xuất kho.", "RESOLVED", 160,
                        "Đã thay cổng switch bị lỗi. Kết nối ổn định qua hai lần kiểm tra.", "CONFIRMED")
        ).forEach(this::addIncident);

        List.of(
                new Access("jira", "Jira Service Management", "Tạo và chỉnh sửa yêu cầu trong dự án OPS",
                        "Cần ghi nhận lỗi trong đợt nghiệm thu quy trình vận hành.", "PENDING", 0, null),
                new Access("sharepoint", "SharePoint tài liệu nội bộ", "Xem thư mục quy trình của nhóm vận hành",
                        "Cần tra cứu bản hướng dẫn mới để đào tạo nhân viên ca chiều.", "PENDING", 1, null),
                new Access("vpn", "VPN công ty", "Truy cập mạng nội bộ từ laptop công ty",
                        "Làm việc từ xa hai ngày để hỗ trợ kiểm kê cuối tháng.", "PENDING", 2, null),
                new Access("powerbi", "Power BI", "Xem báo cáo tồn kho theo chi nhánh",
                        "Chuẩn bị số liệu cho cuộc họp kế hoạch nhập hàng.", "APPROVED", 2, "Duyệt quyền xem báo cáo kho."),
                new Access("github", "GitHub", "Quyền triage cho kho mã kiểm thử",
                        "Cần gắn nhãn và phân công lỗi được phát hiện trong vòng nghiệm thu.", "APPROVED", 3, null),
                new Access("erp-admin", "ERP sản xuất", "Quyền quản trị toàn bộ hệ thống",
                        "Muốn tự sửa cấu hình khi kiểm thử quy trình bán hàng.", "REJECTED", 4,
                        "Phạm vi quyền vượt nhu cầu. Hãy tạo yêu cầu quyền kiểm thử trên môi trường UAT."),
                new Access("uat", "ERP UAT", "Nhập và sửa đơn hàng thử nghiệm",
                        "Dùng để kiểm tra quy trình trả hàng trước khi đưa lên sản xuất.", "IN_PROGRESS", 5,
                        "Chỉ cấp trên môi trường UAT."),
                new Access("confluence", "Confluence", "Chỉnh sửa trang Hướng dẫn hỗ trợ",
                        "Cập nhật hướng dẫn xử lý các lỗi gặp trong đợt triển khai.", "FULFILLED", 7, null),
                new Access("mail", "Hộp thư hỗ trợ", "Đọc và trả lời từ hộp thư dùng chung",
                        "Thay ca trực và theo dõi email gửi đến nhóm hỗ trợ.", "FULFILLED", 10, "Duyệt theo lịch trực."),
                new Access("hr", "Hồ sơ nhân sự", "Tải toàn bộ danh sách và thông tin lương",
                        "Cần lấy số liệu để làm báo cáo phân bổ chi phí.", "REJECTED", 16,
                        "Dùng báo cáo chi phí đã tổng hợp. Hồ sơ lương do nhóm nhân sự quản lý."),
                new Access("inventory", "Cổng quản lý thiết bị", "Xem thiết bị theo phòng ban",
                        "Cần đối chiếu số máy trước khi lập danh sách bảo trì.", "FULFILLED", 25, null),
                new Access("zoom", "Zoom Workplace", "Quyền tổ chức buổi đào tạo nội bộ",
                        "Điều phối buổi hướng dẫn quy trình cho nhân viên mới.", "FULFILLED", 43, null)
        ).forEach(this::addAccess);
    }

    private void addIncident(Incident sample) {
        UUID key = key("incident", sample.code());
        OffsetDateTime created = sample.daysAgo() == -1 ? now.toOffsetDateTime() : pastWorkday(sample.daysAgo());
        Long assignee = sample.status().equals("NEW") ? null : accounts.itId();
        db.sql("""
                insert into incident
                    (requester_id, submission_key, title, category, impact, description, status, assignee_id, created_at)
                select :employee, :key, :title, :category, :impact, :description, :status, :assignee, :created
                where not exists (select 1 from incident where requester_id = :employee and submission_key = :key)
                on conflict (requester_id, submission_key) do nothing
                returning id
                """).param("employee", accounts.employeeId()).param("key", key)
                .param("title", "[Mẫu] " + sample.title()).param("category", sample.category())
                .param("impact", sample.impact()).param("description", sample.description()).param("status", sample.status())
                .param("assignee", assignee, Types.BIGINT).param("created", created)
                .query(Long.class).optional().ifPresent(id -> addTimeline(id, sample, assignee, created));
    }

    private void addTimeline(long id, Incident sample, Long assignee, OffsetDateTime created) {
        if (assignee == null) return;
        addEvent(id, assignee, "ASSIGNED", null, null, null, created.plusMinutes(5));
        if (sample.reply() == null) return;

        OffsetDateTime replyTime = created.plusMinutes(sample.replyMinutes());
        addEvent(id, assignee, "PUBLIC_REPLY", sample.reply(), key(sample.code(), "reply"), null, replyTime);
        if (sample.status().equals("RESOLVED") || sample.feedback() != null) {
            OffsetDateTime resolved = replyTime.plusMinutes(25);
            long resolutionId = addEvent(id, assignee, "RESOLVED", null, null, null, resolved);
            if (sample.feedback() != null) {
                String body = sample.feedback().equals("REOPENED") ? "Sự cố xuất hiện lại sau khi mở máy lần thứ hai." : null;
                addEvent(id, accounts.employeeId(), sample.feedback(), body, key(sample.code(), "feedback"),
                        resolutionId, resolved.plusMinutes(25));
            }
        }
    }

    private long addEvent(long incident, long actor, String kind, String body, UUID key, Long resolution, OffsetDateTime at) {
        return db.sql("""
                insert into incident_activity (incident_id, actor_id, kind, body, submission_key, resolution_id, created_at)
                values (:incident, :actor, :kind, :body, :key, :resolution, :at)
                returning id
                """).param("incident", incident).param("actor", actor).param("kind", kind)
                .param("body", body).param("key", key).param("resolution", resolution, Types.BIGINT)
                .param("at", at).query(Long.class).single();
    }

    private void addAccess(Access sample) {
        OffsetDateTime created = sample.daysAgo() == 0 ? now.toOffsetDateTime() : pastWorkday(sample.daysAgo());
        OffsetDateTime decided = sample.status().equals("PENDING") ? null : created.plusHours(2);
        OffsetDateTime completed = sample.status().equals("FULFILLED") ? created.plusHours(5) : null;
        Long assignee = completed != null || sample.status().equals("IN_PROGRESS") ? accounts.itId() : null;
        db.sql("""
                insert into access_request (requester_id, manager_id, submission_key, system_name, requested_permission,
                    reason, status, assignee_id, decision_note, decided_at, completed_at, created_at)
                select :employee, :manager, :key, :system, :permission, :reason, :status, :assignee, :note, :decided,
                    :completed, :created
                where not exists (select 1 from access_request where requester_id = :employee and submission_key = :key)
                on conflict (requester_id, submission_key) do nothing
                """).param("employee", accounts.employeeId()).param("manager", accounts.managerId())
                .param("key", key("access", sample.code())).param("system", sample.system() + " (mẫu)")
                .param("permission", sample.permission()).param("reason", sample.reason())
                .param("status", sample.status()).param("assignee", assignee, Types.BIGINT)
                .param("note", sample.note()).param("decided", decided, Types.TIMESTAMP_WITH_TIMEZONE)
                .param("completed", completed, Types.TIMESTAMP_WITH_TIMEZONE).param("created", created).update();
    }

    private OffsetDateTime pastWorkday(int daysAgo) {
        LocalDate date = now.toLocalDate().minusDays(daysAgo);
        if (date.getDayOfWeek() == DayOfWeek.SATURDAY || date.getDayOfWeek() == DayOfWeek.SUNDAY) {
            date = date.with(TemporalAdjusters.previous(DayOfWeek.FRIDAY));
        }
        return date.atTime(9, 0).atZone(now.getZone()).toOffsetDateTime();
    }

    private static UUID key(String group, String code) {
        String name = "itsd-portfolio-samples:" + group + ":" + code;
        return UUID.nameUUIDFromBytes(name.getBytes(StandardCharsets.UTF_8));
    }

    private record Incident(String code, String title, String category, String impact, int daysAgo,
                            String description, String status, int replyMinutes, String reply, String feedback) {}

    private record Access(String code, String system, String permission, String reason, String status,
                          int daysAgo, String note) {}
}
