package com.itservicedesk.incident;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.server.ResponseStatusException;

record IncidentActivity(long id, String kind, String actor, String body, OffsetDateTime createdAt) {
    static final String FIRST_PUBLIC_REPLY = """
            (select min(a.created_at) from incident_activity a
             where a.incident_id = i.id and a.kind = 'PUBLIC_REPLY')
            """;

    // Callers hold the incident row lock so a retry and a new message cannot race.
    static boolean isMessageReplay(JdbcClient db, long id, String actor, String kind, String body, UUID key) {
        var previous = db.sql("""
                select a.kind, a.body
                from incident_activity a join app_user u on u.id = a.actor_id
                where a.incident_id = :id and u.email = :actor and a.submission_key = :key
                """)
                .param("id", id)
                .param("actor", actor)
                .param("key", key)
                .query(PreviousMessage.class)
                .optional();
        if (previous.isEmpty()) return false;
        PreviousMessage message = previous.get();
        if (!message.kind().equals(kind) || !message.body().equals(body)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT);
        }
        return true;
    }

    static void addMessage(JdbcClient db, long id, String actor, String kind, String body, UUID key) {
        db.sql("""
                insert into incident_activity (incident_id, actor_id, kind, body, submission_key)
                select :id, u.id, :kind, :body, :key from app_user u where u.email = :actor
                """)
                .param("id", id)
                .param("actor", actor)
                .param("kind", kind)
                .param("body", body)
                .param("key", key)
                .update();
    }

    private record PreviousMessage(String kind, String body) {}

    static List<IncidentActivity> timeline(JdbcClient db, long incidentId, boolean includeInternal) {
        return db.sql("""
                select a.id, a.kind, u.email as actor, a.body, a.created_at
                from incident_activity a
                join app_user u on u.id = a.actor_id
                where a.incident_id = :incidentId and (a.kind <> 'INTERNAL_NOTE' or :includeInternal)
                order by a.created_at, a.id
                """)
                .param("incidentId", incidentId)
                .param("includeInternal", includeInternal)
                .query(IncidentActivity.class)
                .list();
    }
}
