package com.itservicedesk.incident;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
class ManagerOverviewController {
    private final JdbcClient db;

    ManagerOverviewController(JdbcClient db) {
        this.db = db;
    }

    @GetMapping("/api/manager/overview")
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Overview overview(Authentication account, @RequestParam(defaultValue = "7") int days) {
        if (days != 7 && days != 30 && days != 90) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        Instant now = Instant.now();
        OffsetDateTime end = now.atZone(FirstReplySla.ZONE).toOffsetDateTime();
        OffsetDateTime start = end.toLocalDate().minusDays(days - 1L)
                .atStartOfDay(FirstReplySla.ZONE).toOffsetDateTime();
        String email = account.getName();
        List<IncidentRow> incidents = db.sql("""
                select i.id, i.title, i.created_at, requester.email as requester, handler.email as assignee,
                """ + IncidentActivity.FIRST_PUBLIC_REPLY + """
                 as first_reply_at
                from incident i
                join app_user requester on requester.id = i.requester_id
                join app_user manager on manager.id = requester.manager_id
                left join app_user handler on handler.id = i.assignee_id
                where manager.email = :email and i.created_at >= :start and i.created_at <= :end
                """)
                .param("email", email).param("start", start).param("end", end)
                .query(IncidentRow.class).list();

        int onTime = 0;
        int late = 0;
        int waiting = 0;
        long responseMillis = 0;
        List<OverdueIncident> overdue = new ArrayList<>();
        for (IncidentRow incident : incidents) {
            OffsetDateTime reply = incident.firstReplyAt();
            FirstReplySla sla = FirstReplySla.evaluate(incident.createdAt(), reply, now);
            switch (sla.state()) {
                case ON_TIME -> onTime++;
                case LATE -> late++;
                case OVERDUE -> overdue.add(new OverdueIncident(incident.id(), incident.title(),
                        incident.requester(), incident.assignee(), sla.dueAt()));
                case PENDING, DUE_SOON -> waiting++;
            }
            if (reply != null) {
                responseMillis += FirstReplySla.workingTime(incident.createdAt().toInstant(), reply.toInstant()).toMillis();
            }
        }
        overdue.sort(Comparator.comparing(OverdueIncident::dueAt).thenComparingLong(OverdueIncident::id));
        int responded = onTime + late;
        Long average = responded == 0 ? null : Math.round(responseMillis / (60_000.0 * responded));

        List<PendingAccess> pending = db.sql("""
                select r.id, r.system_name, requester.email as requester, count(*) over() as total
                from access_request r
                join app_user requester on requester.id = r.requester_id
                join app_user manager on manager.id = r.manager_id
                where manager.email = :email and r.status = 'PENDING'
                order by r.created_at, r.id
                limit 3
                """).param("email", email).query(PendingAccess.class).list();
        long pendingCount = pending.isEmpty() ? 0 : pending.getFirst().total();
        return new Overview(incidents.size(), onTime, late, waiting, overdue.size(), responded, average,
                overdue, pendingCount, pending);
    }

    record IncidentRow(long id, String title, OffsetDateTime createdAt, String requester,
                       String assignee, OffsetDateTime firstReplyAt) {}
    record OverdueIncident(long id, String title, String requester, String assignee, Instant dueAt) {}
    record PendingAccess(long id, String systemName, String requester, long total) {}
    record Overview(int totalIncidents, int onTime, int late, int waiting, int overdueCount, int responded,
                    Long averageReplyMinutes, List<OverdueIncident> overdue,
                    long pendingAccessCount, List<PendingAccess> pendingAccess) {}
}
