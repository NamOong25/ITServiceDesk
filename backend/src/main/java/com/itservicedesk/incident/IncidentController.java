package com.itservicedesk.incident;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.Authentication;
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
    private static final String OWN_INCIDENTS = """
            select i.id, i.title, i.category, i.impact, i.description, i.status, i.created_at
            from incident i
            join app_user u on u.id = i.requester_id
            where u.email = :email
            """;

    private final JdbcClient db;

    IncidentController(JdbcClient db) {
        this.db = db;
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
    Incident detail(Authentication account, @PathVariable long id) {
        return db.sql(OWN_INCIDENTS + "and i.id = :id")
                .param("email", account.getName())
                .param("id", id)
                .query(IncidentController::readIncident)
                .optional()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
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
                returning id, title, category, impact, description, status, created_at
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
                row.getObject("created_at", OffsetDateTime.class));
    }

    private static String requiredText(String value, int maxLength) {
        String text = value == null ? "" : value.strip();
        if (text.isEmpty() || text.length() > maxLength || text.indexOf('\0') >= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        return text;
    }

    enum Category { NETWORK, DEVICE, SOFTWARE, OTHER }
    enum Impact { PERSONAL, TEAM, MANY_USERS }

    record Submission(UUID submissionKey, String title, Category category, Impact impact, String description) {}

    record IncidentSummary(long id, String title, String category, String status, OffsetDateTime createdAt) {}

    record Incident(long id, String title, String category, String impact, String description,
                    String status, OffsetDateTime createdAt) {}
}
