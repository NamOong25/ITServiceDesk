package com.itservicedesk.incident;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.server.ResponseStatusException;

record IncidentActivity(long id, String kind, String actor, String body, OffsetDateTime createdAt, String recipient) {
    static final String FIRST_PUBLIC_REPLY = """
            (select min(a.created_at) from incident_activity a
             where a.incident_id = i.id and a.kind in ('PUBLIC_REPLY', 'WAIT_REQUESTED'))
            """;

    static OffsetDateTime firstReplyAt(List<IncidentActivity> timeline) {
        return timeline.stream()
                .filter(event -> "PUBLIC_REPLY".equals(event.kind()) || "WAIT_REQUESTED".equals(event.kind()))
                .map(IncidentActivity::createdAt)
                .findFirst().orElse(null);
    }

    // Callers hold the incident row lock so a retry and a new message cannot race.
    static boolean isReplay(JdbcClient db, long id, String actor, String kind, String body, String recipient, UUID key) {
        return replayId(db, id, actor, kind, body, recipient, key).isPresent();
    }

    static Optional<Long> replayId(JdbcClient db, long id, String actor, String kind, String body, String recipient, UUID key) {
        var previous = db.sql("""
                select a.id, a.kind, a.body, target.email as recipient
                from incident_activity a join app_user u on u.id = a.actor_id
                left join app_user target on target.id = a.recipient_id
                where a.incident_id = :id and u.email = :actor and a.submission_key = :key
                """)
                .param("id", id)
                .param("actor", actor)
                .param("key", key)
                .query(PreviousMessage.class)
                .optional();
        if (previous.isEmpty()) return Optional.empty();
        PreviousMessage message = previous.get();
        if (!message.kind().equals(kind) || !Objects.equals(message.body(), body)
                || !Objects.equals(message.recipient(), recipient)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT);
        }
        return Optional.of(message.id());
    }

    static long addMessage(JdbcClient db, long id, String actor, String kind, String body, UUID key) {
        return db.sql("""
                insert into incident_activity (incident_id, actor_id, kind, body, submission_key, created_at)
                select :id, u.id, :kind, :body, :key, clock_timestamp() from app_user u where u.email = :actor
                returning id
                """)
                .param("id", id)
                .param("actor", actor)
                .param("kind", kind)
                .param("body", body)
                .param("key", key)
                .query(Long.class).single();
    }

    private record PreviousMessage(long id, String kind, String body, String recipient) {}

    static List<IncidentActivity> timeline(JdbcClient db, long incidentId, boolean includeInternal) {
        return db.sql("""
                select a.id, a.kind, u.email as actor, a.body, a.created_at, target.email as recipient
                from incident_activity a
                join app_user u on u.id = a.actor_id
                left join app_user target on target.id = a.recipient_id
                where a.incident_id = :incidentId and (a.kind not in ('INTERNAL_NOTE', 'TRANSFERRED') or :includeInternal)
                order by a.created_at, a.id
                """)
                .param("incidentId", incidentId)
                .param("includeInternal", includeInternal)
                .query(IncidentActivity.class)
                .list();
    }
}
