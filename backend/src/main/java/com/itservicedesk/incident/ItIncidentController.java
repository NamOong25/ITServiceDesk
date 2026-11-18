package com.itservicedesk.incident;

import com.itservicedesk.notification.NotificationPublisher;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
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
@RequestMapping("/api/it/incidents")
class ItIncidentController {
    private static final String FROM_INCIDENTS = """
            from incident i
            join app_user requester on requester.id = i.requester_id
            left join app_user handler on handler.id = i.assignee_id
            """;
    private static final String SUMMARY_COLUMNS = """
            i.id, i.title, i.category, i.impact, i.status, i.created_at,
            requester.email as requester, handler.email as assignee,
            coalesce(i.priority_override, case i.impact
                when 'MANY_USERS' then 'HIGH'
                when 'TEAM' then 'MEDIUM'
                else 'LOW'
            end) as priority
            """;

    private static final Comparator<QueueItem> QUEUE_ORDER = Comparator.comparing(QueueItem::resolved)
            .thenComparing(QueueItem::priority)
            .thenComparing(QueueItem::unansweredDueAt, Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing(QueueItem::createdAt, Comparator.reverseOrder())
            .thenComparing(QueueItem::id, Comparator.reverseOrder());

    private final JdbcClient db;
    private final NotificationPublisher notifications;
    private final IncidentAttachments attachments;
    private final boolean demoEnabled;

    ItIncidentController(JdbcClient db, NotificationPublisher notifications, IncidentAttachments attachments,
                         @Value("${itsd.demo.enabled:false}") boolean demoEnabled) {
        this.db = db;
        this.notifications = notifications;
        this.attachments = attachments;
        this.demoEnabled = demoEnabled;
    }

    @GetMapping
    List<QueueItem> queue() {
        Instant now = Instant.now();
        String firstReply = ", " + IncidentActivity.FIRST_PUBLIC_REPLY + " as first_reply_at ";
        return db.sql("select " + SUMMARY_COLUMNS + firstReply + FROM_INCIDENTS)
                .query((row, index) -> {
                    OffsetDateTime created = row.getObject("created_at", OffsetDateTime.class);
                    OffsetDateTime replied = row.getObject("first_reply_at", OffsetDateTime.class);
                    return new QueueItem(row.getLong("id"), row.getString("title"), row.getString("category"),
                            row.getString("impact"), row.getString("status"), created, row.getString("requester"),
                            row.getString("assignee"), Priority.valueOf(row.getString("priority")),
                            FirstReplySla.evaluate(created, replied, now));
                })
                .list().stream()
                .sorted(QUEUE_ORDER)
                .toList();
    }

    @GetMapping("/{id}")
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Detail detail(@PathVariable long id, Authentication account) {
        Ticket ticket = db.sql("select " + SUMMARY_COLUMNS + ", i.description, i.knowledge_article_id, "
                + "article.title as knowledge_article_title, i.asset_id, device.code as asset_code, device.name as asset_name "
                + FROM_INCIDENTS + "left join knowledge_article article on article.id = i.knowledge_article_id "
                + "left join asset device on device.id = i.asset_id where i.id = :id")
                .param("id", id)
                .query(Ticket.class)
                .optional()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        List<IncidentActivity> activity = IncidentActivity.timeline(db, id, true);
        OffsetDateTime firstReply = IncidentActivity.firstReplyAt(activity);
        List<String> transferOptions = isOpenAssignment(ticket.status()) && account.getName().equals(ticket.assignee())
                ? eligibleRecipients(id, account.getName()).stream().map(Recipient::email).toList()
                : List.of();
        Instant now = Instant.now();
        return new Detail(ticket, activity, FirstReplySla.evaluate(ticket.createdAt(), firstReply, now),
                ResolutionSla.fromTimeline(ticket.impact(), ticket.createdAt(), activity, now),
                SavedIncidentSummary.find(db, id).orElse(null), transferOptions, attachments.visible(id, null, true));
    }

    @PostMapping("/{id}/claim")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void claim(@PathVariable long id, Authentication account) {
        String actor = account.getName();
        Handling state = lockIncident(id);
        if (isOpenAssignment(state.status()) && actor.equals(state.assignee())) return;
        requireState("NEW".equals(state.status()));
        db.sql("""
                update incident set status = 'IN_PROGRESS',
                    assignee_id = (select id from app_user where email = :actor)
                where id = :id
                """)
                .param("actor", actor)
                .param("id", id)
                .update();
        recordTransition(id, actor, "ASSIGNED");
    }

    @PostMapping("/{id}/transfer")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void transfer(@PathVariable long id, Authentication account, @RequestBody Transfer transfer) {
        String actor = account.getName();
        String email = IncidentController.requiredText(transfer.recipient(), 254);
        String reason = IncidentController.requiredText(transfer.reason(), 1000);
        if (transfer.submissionKey() == null || email.equals(actor)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }

        Handling state = lockIncident(id);
        if (IncidentActivity.isReplay(db, id, actor, "TRANSFERRED", reason, email, transfer.submissionKey())) return;
        requireHandler(state, actor);
        long recipient = eligibleRecipients(id, actor).stream()
                .filter(candidate -> candidate.email().equals(email))
                .findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST))
                .id();
        db.sql("update incident set assignee_id = :recipient where id = :id")
                .param("recipient", recipient).param("id", id).update();
        long activity = db.sql("""
                insert into incident_activity (incident_id, actor_id, kind, body, submission_key, recipient_id)
                select :id, u.id, 'TRANSFERRED', :reason, :key, :recipient
                from app_user u where u.email = :actor
                returning id
                """).param("id", id).param("actor", actor).param("reason", reason)
                .param("key", transfer.submissionKey()).param("recipient", recipient).query(Long.class).single();
        notifications.incidentActivity(activity);
    }

    private List<Recipient> eligibleRecipients(long id, String actor) {
        return db.sql("""
                select candidate.id, candidate.email
                from incident i join app_user requester on requester.id = i.requester_id
                join app_user candidate on candidate.role = 'IT'
                where i.id = :id and candidate.email <> :actor
                  and (not candidate.demo_account or (:demoEnabled and requester.demo_account))
                order by candidate.email
                """).param("id", id).param("actor", actor).param("demoEnabled", demoEnabled)
                .query(Recipient.class).list();
    }

    @PostMapping("/{id}/resolve")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void resolve(@PathVariable long id, Authentication account) {
        String actor = account.getName();
        Handling state = lockIncident(id);
        if ("RESOLVED".equals(state.status()) && actor.equals(state.assignee())) return;
        requireHandler(state, actor);
        db.sql("update incident set status = 'RESOLVED' where id = :id").param("id", id).update();
        notifications.incidentActivity(recordTransition(id, actor, "RESOLVED"));
    }

    @PostMapping("/{id}/priority")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void updatePriority(@PathVariable long id, Authentication account, @RequestBody PriorityUpdate update) {
        if (update.priority() == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        requireHandler(lockIncident(id), account.getName());
        db.sql("update incident set priority_override = :priority where id = :id")
                .param("priority", update.priority().name())
                .param("id", id)
                .update();
    }

    @PostMapping(value = "/{id}/messages", consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void message(@PathVariable long id, Authentication account, @RequestBody Message message) {
        message(id, account, message, List.of());
    }

    @PostMapping(value = "/{id}/messages", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void messageWithFiles(@PathVariable long id, Authentication account, @RequestPart("data") Message message,
                                 @RequestPart(value = "files", required = false) List<MultipartFile> files) {
        message(id, account, message, attachments.readUploads(files));
    }

    private void message(long id, Authentication account, Message message, List<IncidentAttachments.Upload> files) {
        if (message.kind() == null || message.submissionKey() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        String text = IncidentController.requiredText(message.body(), 4000);
        String actor = account.getName();
        Handling state = lockIncident(id);
        String kind = message.kind().name();
        var previous = IncidentActivity.replayId(db, id, actor, kind, text, null, message.submissionKey());
        if (previous.isPresent()) {
            attachments.verifyRetry(id, previous.get(), files);
            return;
        }
        requireHandler(state, actor);
        if (message.kind() == MessageKind.WAIT_REQUESTED) {
            requireState("IN_PROGRESS".equals(state.status()));
            db.sql("update incident set status = 'WAITING_CUSTOMER' where id = :id").param("id", id).update();
        }
        long activity = IncidentActivity.addMessage(db, id, actor, kind, text, message.submissionKey());
        attachments.save(id, activity, files);
        if (message.kind() == MessageKind.WAIT_REQUESTED) notifications.incidentActivity(activity);
    }

    private Handling lockIncident(long id) {
        return db.sql("""
                select i.status, handler.email as assignee
                from incident i left join app_user handler on handler.id = i.assignee_id
                where i.id = :id for update of i
                """)
                .param("id", id)
                .query(Handling.class)
                .optional()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private long recordTransition(long id, String actor, String kind) {
        return db.sql("""
                insert into incident_activity (incident_id, actor_id, kind, created_at)
                select :id, id, :kind, clock_timestamp() from app_user where email = :actor
                returning id
                """)
                .param("id", id)
                .param("actor", actor)
                .param("kind", kind)
                .query(Long.class).single();
    }

    private static void requireHandler(Handling state, String actor) {
        if (!actor.equals(state.assignee())) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        requireState(isOpenAssignment(state.status()));
    }

    private static boolean isOpenAssignment(String status) {
        return "IN_PROGRESS".equals(status) || "WAITING_CUSTOMER".equals(status);
    }

    private static void requireState(boolean valid) {
        if (!valid) throw new ResponseStatusException(HttpStatus.CONFLICT);
    }

    enum Priority { HIGH, MEDIUM, LOW }
    enum MessageKind { PUBLIC_REPLY, WAIT_REQUESTED, INTERNAL_NOTE }
    record PriorityUpdate(Priority priority) {}
    record Transfer(String recipient, String reason, UUID submissionKey) {}
    private record Recipient(long id, String email) {}
    record Message(MessageKind kind, String body, UUID submissionKey) {}
    record Handling(String status, String assignee) {}
    record QueueItem(long id, String title, String category, String impact, String status,
                     OffsetDateTime createdAt, String requester, String assignee, Priority priority, FirstReplySla sla) {
        boolean resolved() { return "RESOLVED".equals(status); }
        Instant unansweredDueAt() { return sla.firstReplyAt() == null ? sla.dueAt() : null; }
    }
    record Ticket(long id, String title, String category, String impact, String status,
                  OffsetDateTime createdAt, String requester, String assignee, Priority priority, String description,
                  Long knowledgeArticleId, String knowledgeArticleTitle, Long assetId, String assetCode,
                  String assetName) {}
    record Detail(Ticket ticket, List<IncidentActivity> activity, FirstReplySla sla, ResolutionSla resolutionSla,
                  SavedIncidentSummary savedSummary, List<String> transferOptions, List<IncidentAttachments.Attachment> attachments) {}
}
