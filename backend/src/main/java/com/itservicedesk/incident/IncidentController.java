package com.itservicedesk.incident;

import com.itservicedesk.notification.NotificationPublisher;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/incidents")
class IncidentController {
    private static final String REQUESTER_REPLY = "REQUESTER_REPLY";
    private static final String OWN_INCIDENTS = """
            select i.id, i.title, i.category, i.impact, i.description, i.status, i.created_at, handler.email as assignee
            from incident i
            join app_user u on u.id = i.requester_id
            left join app_user handler on handler.id = i.assignee_id
            where u.email = :email
            """;

    private final JdbcClient db;
    private final NotificationPublisher notifications;

    IncidentController(JdbcClient db, NotificationPublisher notifications) {
        this.db = db;
        this.notifications = notifications;
    }

    @GetMapping
    List<IncidentSummary> list(Authentication account) {
        return db.sql(OWN_INCIDENTS + "order by i.created_at desc, i.id desc")
                .param("email", account.getName())
                .query((row, index) -> new IncidentSummary(row.getLong("id"), row.getString("title"),
                        row.getString("category"), row.getString("status"),
                        row.getObject("created_at", OffsetDateTime.class)))
                .list();
    }

    @GetMapping("/{id}")
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Incident detail(Authentication account, @PathVariable long id) {
        return withTimeline(ownIncident(id, account.getName(), false));
    }

    @PostMapping("/{id}/messages")
    @Transactional
    public Incident reply(Authentication account, @PathVariable long id, @RequestBody Reply message) {
        if (message.submissionKey() == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        String body = requiredText(message.body(), 4000);
        String actor = account.getName();
        Incident incident = ownIncident(id, actor, true);

        if (!IncidentActivity.isMessageReplay(db, id, actor, REQUESTER_REPLY, body, message.submissionKey())) {
            boolean waiting = "WAITING_CUSTOMER".equals(incident.status());
            if (!waiting && !"IN_PROGRESS".equals(incident.status())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT);
            }
            long activity = IncidentActivity.addMessage(db, id, actor, REQUESTER_REPLY, body, message.submissionKey());
            if (waiting) {
                db.sql("update incident set status = 'IN_PROGRESS' where id = :id").param("id", id).update();
                incident = ownIncident(id, actor, false);
                notifications.incidentActivity(activity);
            }
        }
        return withTimeline(incident);
    }

    @PostMapping("/{id}/resolution-feedback")
    @Transactional
    public Incident reviewResolution(Authentication account, @PathVariable long id, @RequestBody ResolutionFeedback feedback) {
        if (feedback.decision() == null || feedback.submissionKey() == null || feedback.resolutionId() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        boolean reopening = feedback.decision() == ResolutionDecision.REOPENED;
        String body = reopening ? requiredText(feedback.body(), 4000) : null;
        if (!reopening && feedback.body() != null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);

        String actor = account.getName();
        Incident incident = ownIncident(id, actor, true);
        var previous = db.sql("""
                select kind, body, submission_key from incident_activity
                where incident_id = :id and resolution_id = :resolutionId
                """)
                .param("id", id)
                .param("resolutionId", feedback.resolutionId())
                .query(StoredResolutionFeedback.class)
                .optional();
        if (previous.isPresent()) {
            var stored = previous.get();
            if (stored.kind() != feedback.decision() || !stored.submissionKey().equals(feedback.submissionKey())
                    || !Objects.equals(stored.body(), body)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT);
            }
            return withTimeline(incident);
        }

        long latestResolution = db.sql("select id from incident_activity where incident_id = :id and kind = 'RESOLVED' order by id desc limit 1")
                .param("id", id)
                .query(Long.class)
                .optional()
                .orElse(0L);
        if (!"RESOLVED".equals(incident.status()) || latestResolution != feedback.resolutionId()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT);
        }

        int added = db.sql("""
                insert into incident_activity (incident_id, actor_id, kind, body, submission_key, resolution_id, created_at)
                select :id, u.id, :kind, :body, :key, :resolutionId, clock_timestamp() from app_user u where u.email = :actor
                on conflict (incident_id, actor_id, submission_key) do nothing
                """)
                .param("id", id)
                .param("kind", feedback.decision().name())
                .param("body", body, Types.VARCHAR)
                .param("key", feedback.submissionKey())
                .param("resolutionId", feedback.resolutionId())
                .param("actor", actor)
                .update();
        if (added == 0) throw new ResponseStatusException(HttpStatus.CONFLICT);

        if (reopening) {
            db.sql("update incident set status = 'IN_PROGRESS' where id = :id").param("id", id).update();
            incident = ownIncident(id, actor, false);
        }
        return withTimeline(incident);
    }

    private Incident ownIncident(long id, String email, boolean lock) {
        return db.sql(OWN_INCIDENTS + "and i.id = :id" + (lock ? " for update of i" : ""))
                .param("email", email)
                .param("id", id)
                .query(IncidentController::readIncident)
                .optional()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private Incident withTimeline(Incident incident) {
        return new Incident(incident.id(), incident.title(), incident.category(), incident.impact(),
                incident.description(), incident.status(), incident.createdAt(), incident.assignee(),
                IncidentActivity.timeline(db, incident.id(), false));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    Incident create(Authentication account, @RequestBody Submission submission) {
        if (submission.submissionKey() == null || submission.category() == null || submission.impact() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }

        String title = requiredText(submission.title(), 120);
        String description = requiredText(submission.description(), 4000);
        Incident incident = db.sql("""
                insert into incident (requester_id, submission_key, title, category, impact, description)
                select u.id, :submissionKey, :title, :category, :impact, :description
                from app_user u where u.email = :email
                on conflict (requester_id, submission_key)
                do update set submission_key = excluded.submission_key
                returning id, title, category, impact, description, status, created_at,
                    (select email from app_user where id = incident.assignee_id) as assignee
                """)
                .param("email", account.getName())
                .param("submissionKey", submission.submissionKey())
                .param("title", title)
                .param("category", submission.category().name())
                .param("impact", submission.impact().name())
                .param("description", description)
                .query(IncidentController::readIncident)
                .optional()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));

        if (!incident.title().equals(title) || !incident.description().equals(description)
                || !incident.category().equals(submission.category().name())
                || !incident.impact().equals(submission.impact().name())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT);
        }
        return incident;
    }

    private static Incident readIncident(ResultSet row, int index) throws SQLException {
        return new Incident(row.getLong("id"), row.getString("title"), row.getString("category"),
                row.getString("impact"), row.getString("description"), row.getString("status"),
                row.getObject("created_at", OffsetDateTime.class), row.getString("assignee"), List.of());
    }

    static String requiredText(String value, int maxLength) {
        String text = value == null ? "" : value.strip();
        if (text.isEmpty() || text.length() > maxLength || text.indexOf('\0') >= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        return text;
    }

    enum Category { NETWORK, DEVICE, SOFTWARE, OTHER }
    enum Impact { PERSONAL, TEAM, MANY_USERS }

    record Submission(UUID submissionKey, String title, Category category, Impact impact, String description) {}

    record Reply(String body, UUID submissionKey) {}
    enum ResolutionDecision { CONFIRMED, REOPENED }
    record ResolutionFeedback(long resolutionId, ResolutionDecision decision, String body, UUID submissionKey) {}
    private record StoredResolutionFeedback(ResolutionDecision kind, String body, UUID submissionKey) {}
    record IncidentSummary(long id, String title, String category, String status, OffsetDateTime createdAt) {}

    record Incident(long id, String title, String category, String impact, String description,
                    String status, OffsetDateTime createdAt, String assignee, List<IncidentActivity> activity) {}
}
