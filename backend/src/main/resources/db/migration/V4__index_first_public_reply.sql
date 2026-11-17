create index incident_activity_first_reply_idx
    on incident_activity (incident_id, created_at)
    where kind = 'PUBLIC_REPLY';
