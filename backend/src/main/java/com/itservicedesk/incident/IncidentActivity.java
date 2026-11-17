package com.itservicedesk.incident;

import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;

record IncidentActivity(long id, String kind, String actor, String body, OffsetDateTime createdAt) {
    static final String FIRST_PUBLIC_REPLY = """
            (select min(a.created_at) from incident_activity a
             where a.incident_id = i.id and a.kind = 'PUBLIC_REPLY')
            """;

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
