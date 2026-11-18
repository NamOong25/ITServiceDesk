package com.itservicedesk.incident;

import com.itservicedesk.notification.NotificationPublisher;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/incidents")
class IncidentController {
    private static final String REQUESTER_REPLY = "REQUESTER_REPLY";
    private static final String OWN_INCIDENTS = """
            select i.id, i.title, i.category, i.impact, i.description, i.status, i.created_at, handler.email as assignee,
                   i.knowledge_article_id, article.title as knowledge_article_title,
                   i.asset_id, device.code as asset_code, device.name as asset_name
            from incident i
            join app_user u on u.id = i.requester_id
            left join app_user handler on handler.id = i.assignee_id
            left join knowledge_article article on article.id = i.knowledge_article_id
            left join asset device on device.id = i.asset_id
            where u.email = :email
            """;

    private final JdbcClient db;
    private final NotificationPublisher notifications;
    private final IncidentAttachments attachments;

    IncidentController(JdbcClient db, NotificationPublisher notifications, IncidentAttachments attachments) {
        this.db = db;
        this.notifications = notifications;
        this.attachments = attachments;
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
        return withTimeline(ownIncident(id, account.getName(), false), account.getName());
    }

    @PostMapping(value = "/{id}/messages", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Transactional
    public Incident reply(Authentication account, @PathVariable long id, @RequestBody Reply message) {
        return reply(account, id, message, List.of());
    }

    @PostMapping(value = "/{id}/messages", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Transactional
    public Incident replyWithFiles(Authentication account, @PathVariable long id, @RequestPart("data") Reply message,
                                   @RequestPart(value = "files", required = false) List<MultipartFile> files) {
        return reply(account, id, message, attachments.readUploads(files));
    }

    private Incident reply(Authentication account, long id, Reply message, List<IncidentAttachments.Upload> files) {
        if (message.submissionKey() == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        String body = requiredText(message.body(), 4000);
        String actor = account.getName();
        Incident incident = ownIncident(id, actor, true);

        var previous = IncidentActivity.replayId(db, id, actor, REQUESTER_REPLY, body, null, message.submissionKey());
        if (previous.isPresent()) {
            attachments.verifyRetry(id, previous.get(), files);
        } else {
            boolean waiting = "WAITING_CUSTOMER".equals(incident.status());
            if (!waiting && !"IN_PROGRESS".equals(incident.status())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT);
            }
            long activity = IncidentActivity.addMessage(db, id, actor, REQUESTER_REPLY, body, message.submissionKey());
            attachments.save(id, activity, files);
            if (waiting) {
                db.sql("update incident set status = 'IN_PROGRESS' where id = :id").param("id", id).update();
                incident = ownIncident(id, actor, false);
                notifications.incidentActivity(activity);
            }
        }
        return withTimeline(incident, actor);
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
            return withTimeline(incident, actor);
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
        return withTimeline(incident, actor);
    }

    private Incident ownIncident(long id, String email, boolean lock) {
        return db.sql(OWN_INCIDENTS + "and i.id = :id" + (lock ? " for update of i" : ""))
                .param("email", email)
                .param("id", id)
                .query(IncidentController::readIncident)
                .optional()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private Incident withTimeline(Incident incident, String actor) {
        return new Incident(incident.id(), incident.title(), incident.category(), incident.impact(),
                incident.description(), incident.status(), incident.createdAt(), incident.assignee(),
                incident.knowledgeArticleId(), incident.knowledgeArticleTitle(),
                incident.assetId(), incident.assetCode(), incident.assetName(),
                IncidentActivity.timeline(db, incident.id(), false),
                attachments.visible(incident.id(), actor, false));
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public Incident create(Authentication account, @RequestBody Submission submission) {
        return create(account, submission, List.of());
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public Incident createWithFiles(Authentication account, @RequestPart("data") Submission submission,
                                    @RequestPart(value = "files", required = false) List<MultipartFile> files) {
        return create(account, submission, attachments.readUploads(files));
    }

    private Incident create(Authentication account, Submission submission, List<IncidentAttachments.Upload> files) {
        if (submission.submissionKey() == null || submission.category() == null || submission.impact() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }

        String title = requiredText(submission.title(), 120);
        String description = requiredText(submission.description(), 4000);
        Long articleId = submission.knowledgeArticleId();
        if (articleId != null && !db.sql("select exists (select 1 from knowledge_article where id = :id and published_at is not null)")
                .param("id", articleId).query(Boolean.class).single()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        String email = account.getName();
        Long assetId = submission.assetId();
        if (assetId != null && db.sql("""
                select a.id from asset a join app_user u on u.id = a.assigned_to_id
                where a.id = :id and a.status = 'IN_USE' and u.email = :email
                for share of a
                """).param("id", assetId).param("email", email).query(Long.class).optional().isEmpty()) {
            // A valid retry can arrive after the device has been reassigned.
            Incident previous = previousSubmission(email, submission.submissionKey())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST));
            return verifyRetry(previous, submission, title, description, email, files);
        }
        var inserted = db.sql("""
                insert into incident (requester_id, submission_key, title, category, impact, description, knowledge_article_id, asset_id)
                select u.id, :submissionKey, :title, :category, :impact, :description, :article, :asset
                from app_user u where u.email = :email
                on conflict (requester_id, submission_key) do nothing
                returning id
                """)
                .param("email", email)
                .param("submissionKey", submission.submissionKey())
                .param("title", title)
                .param("category", submission.category().name())
                .param("impact", submission.impact().name())
                .param("article", articleId, Types.BIGINT)
                .param("asset", assetId, Types.BIGINT)
                .param("description", description)
                .query(Long.class).optional();

        if (inserted.isPresent()) {
            long id = inserted.get();
            attachments.save(id, null, files);
            return withTimeline(ownIncident(id, email, false), email);
        }
        Incident previous = previousSubmission(email, submission.submissionKey())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        return verifyRetry(previous, submission, title, description, email, files);
    }

    private Optional<Incident> previousSubmission(String email, UUID key) {
        return db.sql(OWN_INCIDENTS + "and i.submission_key = :key")
                .param("email", email).param("key", key).query(IncidentController::readIncident).optional();
    }

    private Incident verifyRetry(Incident incident, Submission submission, String title, String description,
                                 String email, List<IncidentAttachments.Upload> files) {
        if (!incident.title().equals(title) || !incident.description().equals(description)
                || !incident.category().equals(submission.category().name())
                || !incident.impact().equals(submission.impact().name())
                || !Objects.equals(incident.knowledgeArticleId(), submission.knowledgeArticleId())
                || !Objects.equals(incident.assetId(), submission.assetId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT);
        }
        attachments.verifyRetry(incident.id(), null, files);
        return withTimeline(incident, email);
    }

    private static Incident readIncident(ResultSet row, int index) throws SQLException {
        return new Incident(row.getLong("id"), row.getString("title"), row.getString("category"),
                row.getString("impact"), row.getString("description"), row.getString("status"),
                row.getObject("created_at", OffsetDateTime.class), row.getString("assignee"),
                row.getObject("knowledge_article_id", Long.class), row.getString("knowledge_article_title"),
                row.getObject("asset_id", Long.class), row.getString("asset_code"), row.getString("asset_name"), List.of(), List.of());
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

    record Submission(UUID submissionKey, String title, Category category, Impact impact, String description,
                      Long knowledgeArticleId, Long assetId) {}

    record Reply(String body, UUID submissionKey) {}
    enum ResolutionDecision { CONFIRMED, REOPENED }
    record ResolutionFeedback(long resolutionId, ResolutionDecision decision, String body, UUID submissionKey) {}
    private record StoredResolutionFeedback(ResolutionDecision kind, String body, UUID submissionKey) {}
    record IncidentSummary(long id, String title, String category, String status, OffsetDateTime createdAt) {}

    record Incident(long id, String title, String category, String impact, String description,
                    String status, OffsetDateTime createdAt, String assignee, Long knowledgeArticleId,
                    String knowledgeArticleTitle, Long assetId, String assetCode, String assetName,
                    List<IncidentActivity> activity, List<IncidentAttachments.Attachment> attachments) {}
}
