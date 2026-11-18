package com.itservicedesk.incident;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
class ManagerOverviewController {
    private static final String FROM_TEAM = """
            from incident i
            join app_user requester on requester.id = i.requester_id
            join app_user manager on manager.id = requester.manager_id
            left join app_user handler on handler.id = i.assignee_id
            """;
    private static final String TEAM_PERIOD = """
            where manager.email = :email and i.created_at >= :start and i.created_at <= :end
            """;
    private static final String TICKET_COLUMNS = """
            i.id, i.title, i.impact, i.status, i.created_at, requester.email as requester, handler.email as assignee
            """;

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
        List<IncidentRow> incidents = db.sql("select " + TICKET_COLUMNS + ", "
                + IncidentActivity.FIRST_PUBLIC_REPLY + " as first_reply_at " + FROM_TEAM + TEAM_PERIOD
                + "order by i.created_at desc, i.id desc")
                .param("email", email).param("start", start).param("end", end)
                .query(IncidentRow.class).list();
        Map<Long, List<ResolutionSla.Milestone>> milestones = loadMilestones(email, start, end);

        int onTime = 0;
        int late = 0;
        int waiting = 0;
        int overdueReplies = 0;
        int overdueResolutions = 0;
        int waitingForEmployee = 0;
        long responseMillis = 0;
        List<TeamIssue> issues = new ArrayList<>();
        for (IncidentRow incident : incidents) {
            OffsetDateTime reply = incident.firstReplyAt();
            FirstReplySla sla = FirstReplySla.evaluate(incident.createdAt(), reply, now);
            ResolutionSla resolution = ResolutionSla.evaluate(incident.impact(), incident.createdAt(),
                    milestones.getOrDefault(incident.id(), List.of()), now);
            switch (sla.state()) {
                case ON_TIME -> onTime++;
                case LATE -> late++;
                case OVERDUE -> overdueReplies++;
                case PENDING, DUE_SOON -> waiting++;
            }
            boolean resolutionOverdue = !"RESOLVED".equals(incident.status()) && resolution.breached();
            if (resolutionOverdue) overdueResolutions++;
            if ("WAITING_CUSTOMER".equals(incident.status())) waitingForEmployee++;
            if (reply != null) {
                responseMillis += FirstReplySla.workingTime(incident.createdAt().toInstant(), reply.toInstant()).toMillis();
            }
            issues.add(new TeamIssue(incident.id(), incident.title(), incident.status(), incident.requester(),
                    incident.assignee(), sla.state(), sla.dueAt(), resolution, resolutionOverdue));
        }
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
        return new Overview(issues.size(), onTime, late, waiting, overdueReplies, overdueResolutions,
                waitingForEmployee, responded, average, issues, pendingCount, pending);
    }

    @GetMapping("/api/manager/incidents/{id}")
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Detail detail(Authentication account, @PathVariable long id) {
        TeamTicket ticket = db.sql("select " + TICKET_COLUMNS + ", i.category, i.description "
                + FROM_TEAM + "where manager.email = :email and i.id = :id")
                .param("email", account.getName()).param("id", id).query(TeamTicket.class)
                .optional().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        List<IncidentActivity> publicActivity = IncidentActivity.timeline(db, id, false);
        Instant now = Instant.now();
        return new Detail(ticket, publicActivity,
                FirstReplySla.evaluate(ticket.createdAt(), IncidentActivity.firstReplyAt(publicActivity), now),
                ResolutionSla.fromTimeline(ticket.impact(), ticket.createdAt(), publicActivity, now));
    }

    private Map<Long, List<ResolutionSla.Milestone>> loadMilestones(String email, OffsetDateTime start, OffsetDateTime end) {
        return db.sql("select i.id, activity.kind, activity.created_at " + FROM_TEAM + """
                join incident_activity activity on activity.incident_id = i.id
                    and activity.kind in ('WAIT_REQUESTED', 'REQUESTER_REPLY', 'RESOLVED', 'REOPENED')
                """ + TEAM_PERIOD + "order by activity.created_at, activity.id")
                .param("email", email).param("start", start).param("end", end)
                .query(rows -> {
                    Map<Long, List<ResolutionSla.Milestone>> byIssue = new HashMap<>();
                    while (rows.next()) {
                        long id = rows.getLong("id");
                        byIssue.computeIfAbsent(id, ignored -> new ArrayList<>()).add(new ResolutionSla.Milestone(
                                rows.getString("kind"), rows.getObject("created_at", OffsetDateTime.class)));
                    }
                    return byIssue;
                });
    }

    record IncidentRow(long id, String title, String impact, String status, OffsetDateTime createdAt,
                       String requester, String assignee, OffsetDateTime firstReplyAt) {}
    record TeamIssue(long id, String title, String status, String requester, String assignee,
                     FirstReplySla.State replyState, Instant replyDueAt, ResolutionSla resolutionSla,
                     boolean resolutionOverdue) {}
    record PendingAccess(long id, String systemName, String requester, long total) {}
    record Overview(int totalIncidents, int onTime, int late, int waiting, int overdueCount,
                    int overdueResolutionCount, int waitingForEmployee, int responded,
                    Long averageReplyMinutes, List<TeamIssue> issues, long pendingAccessCount,
                    List<PendingAccess> pendingAccess) {}
    record TeamTicket(long id, String title, String category, String impact, String status, OffsetDateTime createdAt,
                      String requester, String assignee, String description) {}
    record Detail(TeamTicket ticket, List<IncidentActivity> activity, FirstReplySla sla, ResolutionSla resolutionSla) {}
}
