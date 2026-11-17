package com.itservicedesk.auth;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.TemporalAdjusters;
import java.util.UUID;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.support.TransactionTemplate;

@Configuration
@Profile("demo & portfolio")
class PortfolioDemo {
    private static final ZoneId VIETNAM = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final UUID WEEKEND_TICKET = UUID.fromString("f56e51e0-c68f-4417-b137-4fc6699d6821");
    private static final UUID OVERDUE_TICKET = UUID.fromString("b5732b29-a1ea-4de5-a697-2131b47f854d");
    private static final UUID OPEN_TICKET = UUID.fromString("2668f30b-5445-466b-8450-67e5d2e2b693");
    private static final UUID FIGMA_REQUEST = UUID.fromString("e3ff94c4-ec02-4637-905d-4c972cddd23d");
    private static final UUID PUBLIC_REPLY = UUID.fromString("9d1a9212-a9e4-48ce-892b-8c3cec11d9d2");
    private static final UUID INTERNAL_NOTE = UUID.fromString("2de7360b-162b-44eb-8b93-d41c5c594412");

    @Bean
    @Order(1)
    ApplicationRunner seedPortfolio(JdbcClient db, TransactionTemplate transaction) {
        return args -> transaction.executeWithoutResult(status -> seed(db));
    }

    private void seed(JdbcClient db) {
        Accounts accounts = db.sql("""
                select employee.id as employee_id, manager.id as manager_id, it.id as it_id
                from app_user employee
                join app_user manager on manager.id = employee.manager_id
                join app_user it on it.email = 'it@itsd.example'
                where employee.email = 'nhanvien@itsd.example' and employee.role = 'EMPLOYEE'
                  and manager.role = 'MANAGER' and it.role = 'IT'
                  and employee.demo_account and manager.demo_account and it.demo_account
                """).query(Accounts.class).optional()
                .orElseThrow(() -> new IllegalStateException("Portfolio demo accounts are not configured"));

        ZonedDateTime now = ZonedDateTime.now(VIETNAM);
        LocalDate monday = now.toLocalDate().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        if (now.toOffsetDateTime().isBefore(at(monday, 9, 18))) monday = monday.minusWeeks(1);
        LocalDate friday = monday.minusDays(3);

        seedWeekend(db, accounts, friday, monday);
        addOpenIncident(db, accounts.employeeId(), OVERDUE_TICKET, "[Demo] Outlook không gửi được email",
                "SOFTWARE", "Hộp thư công ty báo lỗi khi bấm gửi.", at(friday, 14, 0));
        addOpenIncident(db, accounts.employeeId(), OPEN_TICKET, "[Demo] Máy in văn phòng không in được",
                "DEVICE", "Máy in tầng 2 nhận lệnh nhưng không in ra giấy.", now.toOffsetDateTime());
        db.sql("""
                insert into access_request
                    (requester_id, manager_id, submission_key, system_name, requested_permission, reason, created_at)
                values (:employee, :manager, :key, :system, :permission, :reason, :created)
                on conflict (requester_id, submission_key) do nothing
                """)
                .param("employee", accounts.employeeId()).param("manager", accounts.managerId())
                .param("key", FIGMA_REQUEST).param("system", "Figma (demo)")
                .param("permission", "Chỉnh sửa workspace nhóm sản phẩm")
                .param("reason", "Cần chỉnh sửa thiết kế cho sprint tiếp theo.")
                .param("created", now.toOffsetDateTime())
                .update();
    }

    private void seedWeekend(JdbcClient db, Accounts accounts, LocalDate friday, LocalDate monday) {
        db.sql("""
                insert into incident
                    (requester_id, submission_key, title, category, impact, description, status, assignee_id, created_at)
                values (:employee, :key, :title, 'NETWORK', 'PERSONAL', :description, 'RESOLVED', :it, :created)
                on conflict (requester_id, submission_key) do nothing
                returning id
                """).param("employee", accounts.employeeId()).param("key", WEEKEND_TICKET)
                .param("title", "[Demo SLA] Không kết nối được VPN")
                .param("description", "VPN báo hết thời gian kết nối khi làm việc từ xa.")
                .param("it", accounts.itId()).param("created", at(friday, 16, 30))
                .query(Long.class).optional().ifPresent(id -> {
                    event(db, id, accounts.itId(), "ASSIGNED", null, null, at(monday, 8, 20));
                    event(db, id, accounts.itId(), "INTERNAL_NOTE", "Đã kiểm tra cấu hình cổng VPN.",
                            INTERNAL_NOTE, at(monday, 8, 45));
                    event(db, id, accounts.itId(), "PUBLIC_REPLY", "Kết nối VPN đã được khôi phục. Bạn thử lại nhé.",
                            PUBLIC_REPLY, at(monday, 9, 12));
                    event(db, id, accounts.itId(), "RESOLVED", null, null, at(monday, 9, 18));
                });
    }

    private void addOpenIncident(JdbcClient db, long employee, UUID key, String title, String category,
                                 String description, OffsetDateTime created) {
        db.sql("""
                insert into incident
                    (requester_id, submission_key, title, category, impact, description, created_at)
                values (:employee, :key, :title, :category, 'PERSONAL', :description, :created)
                on conflict (requester_id, submission_key) do nothing
                """).param("employee", employee).param("key", key).param("title", title)
                .param("category", category).param("description", description).param("created", created).update();
    }

    private void event(JdbcClient db, long incident, long actor, String kind, String body, UUID key, OffsetDateTime time) {
        db.sql("""
                insert into incident_activity (incident_id, actor_id, kind, body, submission_key, created_at)
                values (:incident, :actor, :kind, :body, :key, :time)
                """).param("incident", incident).param("actor", actor).param("kind", kind)
                .param("body", body).param("key", key).param("time", time).update();
    }

    private static OffsetDateTime at(LocalDate day, int hour, int minute) {
        return day.atTime(hour, minute).atZone(VIETNAM).toOffsetDateTime();
    }

    record Accounts(long employeeId, long managerId, long itId) {}
}
