alter table incident
    drop constraint incident_handling_state,
    add constraint incident_handling_state check (
        (status = 'NEW' and assignee_id is null)
        or (status in ('IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED') and assignee_id is not null)
    );

alter table incident_activity
    drop constraint incident_activity_kind_check,
    drop constraint incident_activity_check,
    add constraint incident_activity_kind_check check (
        kind in ('ASSIGNED', 'PUBLIC_REPLY', 'WAIT_REQUESTED', 'REQUESTER_REPLY', 'INTERNAL_NOTE',
            'RESOLVED', 'CONFIRMED', 'REOPENED', 'TRANSFERRED')
    ),
    add constraint incident_activity_check check (
        (kind in ('ASSIGNED', 'RESOLVED') and body is null and submission_key is null and resolution_id is null)
        or (kind in ('PUBLIC_REPLY', 'WAIT_REQUESTED', 'REQUESTER_REPLY', 'INTERNAL_NOTE', 'TRANSFERRED')
            and body is not null and length(trim(body)) > 0 and submission_key is not null and resolution_id is null)
        or (kind = 'CONFIRMED' and body is null and submission_key is not null and resolution_id is not null)
        or (kind = 'REOPENED' and body is not null and length(trim(body)) > 0
            and submission_key is not null and resolution_id is not null)
    );

drop index incident_activity_first_reply_idx;

create index incident_activity_first_reply_idx
    on incident_activity (incident_id, created_at) where kind in ('PUBLIC_REPLY', 'WAIT_REQUESTED');
