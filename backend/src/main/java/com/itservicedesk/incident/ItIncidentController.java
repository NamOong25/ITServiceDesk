package com.itservicedesk.incident;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
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
@RequestMapping("/api/it/incidents")
class ItIncidentController {
    private static final String FROM_INCIDENTS = """
            from incident i
            join app_user requester on requester.id = i.requester_id
            left join app_user handler on handler.id = i.assignee_id
            """;
    private static final String SUMMARY_COLUMNS = """
            i.id, i.title, i.category, i.impact, i.status, i.created_at,
            requester.email as requester, handler.email as assignee
            """;

    private final JdbcClient db;

    ItIncidentController(JdbcClient db) {
        this.db = db;
    }

    @GetMapping
    List<QueueItem> queue() {
        Instant now = Instant.now();
        String firstReply = ", " + IncidentActivity.FIRST_PUBLIC_REPLY + " as first_reply_at ";
        return db.sql("select " + SUMMARY_COLUMNS + firstReply + FROM_INCIDENTS
                        + "order by i.created_at desc, i.id desc")
                .query((row, index) -> {
                    OffsetDateTime created = row.getObject("created_at", OffsetDateTime.class);
                    OffsetDateTime replied = row.getObject("first_reply_at", OffsetDateTime.class);
                    return new QueueItem(row.getLong("id"), row.getString("title"), row.getString("category"),
                            row.getString("impact"), row.getString("status"), created, row.getString("requester"),
                            row.getString("assignee"), FirstReplySla.evaluate(created, replied, now));
                })
                .list();
    }

    @GetMapping("/{id}")
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Detail detail(@PathVariable long id) {
        Ticket ticket = db.sql("select " + SUMMARY_COLUMNS + ", i.description " + FROM_INCIDENTS + "where i.id = :id")
                .param("id", id)
                .query(Ticket.class)
                .optional()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        List<IncidentActivity> activity = IncidentActivity.timeline(db, id, true);
        OffsetDateTime firstReply = activity.stream()
                .filter(event -> "PUBLIC_REPLY".equals(event.kind()))
                .map(IncidentActivity::createdAt)
                .findFirst()
                .orElse(null);
        return new Detail(ticket, activity, FirstReplySla.evaluate(ticket.createdAt(), firstReply, Instant.now()));
    }

    @PostMapping("/{id}/claim")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void claim(@PathVariable long id, Authentication account) {
        String actor = account.getName();
        Handling state = lockIncident(id);
        if ("IN_PROGRESS".equals(state.status()) && actor.equals(state.assignee())) return;
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

    @PostMapping("/{id}/resolve")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void resolve(@PathVariable long id, Authentication account) {
        String actor = account.getName();
        Handling state = lockIncident(id);
        if ("RESOLVED".equals(state.status()) && actor.equals(state.assignee())) return;
        requireHandler(state, actor);
        db.sql("update incident set status = 'RESOLVED' where id = :id").param("id", id).update();
        recordTransition(id, actor, "RESOLVED");
    }

    @PostMapping("/{id}/messages")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void message(@PathVariable long id, Authentication account, @RequestBody Message message) {
        if (message.kind() == null || message.submissionKey() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        String text = IncidentController.requiredText(message.body(), 4000);
        String actor = account.getName();
        Handling state = lockIncident(id);
        var previous = db.sql("""
                select a.kind, a.body
                from incident_activity a join app_user u on u.id = a.actor_id
                where a.incident_id = :id and u.email = :actor and a.submission_key = :key
                """)
                .param("id", id)
                .param("actor", actor)
                .param("key", message.submissionKey())
                .query(PreviousMessage.class)
                .optional();
        if (previous.isPresent()) {
            requireState(previous.get().kind().equals(message.kind().name()) && previous.get().body().equals(text));
            return;
        }
        requireHandler(state, actor);
        db.sql("""
                insert into incident_activity (incident_id, actor_id, kind, body, submission_key)
                select :id, u.id, :kind, :body, :key from app_user u where u.email = :actor
                """)
                .param("id", id)
                .param("actor", actor)
                .param("kind", message.kind().name())
                .param("body", text)
                .param("key", message.submissionKey())
                .update();
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

    private void recordTransition(long id, String actor, String kind) {
        db.sql("""
                insert into incident_activity (incident_id, actor_id, kind)
                select :id, id, :kind from app_user where email = :actor
                """)
                .param("id", id)
                .param("actor", actor)
                .param("kind", kind)
                .update();
    }

    private static void requireHandler(Handling state, String actor) {
        if (!actor.equals(state.assignee())) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        requireState("IN_PROGRESS".equals(state.status()));
    }

    private static void requireState(boolean valid) {
        if (!valid) throw new ResponseStatusException(HttpStatus.CONFLICT);
    }

    enum MessageKind { PUBLIC_REPLY, INTERNAL_NOTE }
    record Message(MessageKind kind, String body, UUID submissionKey) {}
    record PreviousMessage(String kind, String body) {}
    record Handling(String status, String assignee) {}
    record QueueItem(long id, String title, String category, String impact, String status,
                     OffsetDateTime createdAt, String requester, String assignee, FirstReplySla sla) {}
    record Ticket(long id, String title, String category, String impact, String status,
                  OffsetDateTime createdAt, String requester, String assignee, String description) {}
    record Detail(Ticket ticket, List<IncidentActivity> activity, FirstReplySla sla) {}
}
