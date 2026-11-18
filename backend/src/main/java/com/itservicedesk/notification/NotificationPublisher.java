package com.itservicedesk.notification;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

@Component
public class NotificationPublisher {
    private final JdbcClient db;

    NotificationPublisher(JdbcClient db) {
        this.db = db;
    }

    public void incidentActivity(long activityId) {
        db.sql("""
                insert into app_notification (recipient_id, kind, incident_activity_id)
                select case a.kind
                    when 'REQUESTER_REPLY' then i.assignee_id
                    when 'TRANSFERRED' then a.recipient_id
                    else i.requester_id
                end, a.kind, a.id
                from incident_activity a join incident i on i.id = a.incident_id
                where a.id = :id
                on conflict (incident_activity_id) do nothing
                """).param("id", activityId).update();
    }

    public void accessRequest(long requestId, AccessEvent event) {
        db.sql("""
                insert into app_notification (recipient_id, kind, access_request_id)
                select case when :kind = 'ACCESS_SUBMITTED' then manager_id else requester_id end, :kind, id
                from access_request
                where id = :id
                on conflict (access_request_id, kind) do nothing
                """).param("id", requestId).param("kind", event.name()).update();
    }

    public enum AccessEvent { ACCESS_SUBMITTED, ACCESS_APPROVED, ACCESS_REJECTED }
}
