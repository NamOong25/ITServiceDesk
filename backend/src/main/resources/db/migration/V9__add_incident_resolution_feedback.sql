alter table incident_activity
    add column resolution_id bigint unique references incident_activity(id),
    drop constraint incident_activity_kind_check,
    drop constraint incident_activity_check,
    add constraint incident_activity_kind_check check (
        kind in ('ASSIGNED', 'PUBLIC_REPLY', 'REQUESTER_REPLY', 'INTERNAL_NOTE', 'RESOLVED', 'CONFIRMED', 'REOPENED')
    ),
    add constraint incident_activity_check check (
        (kind in ('ASSIGNED', 'RESOLVED') and body is null and submission_key is null and resolution_id is null)
        or (kind in ('PUBLIC_REPLY', 'REQUESTER_REPLY', 'INTERNAL_NOTE') and body is not null
            and length(trim(body)) > 0 and submission_key is not null and resolution_id is null)
        or (kind = 'CONFIRMED' and body is null and submission_key is not null and resolution_id is not null)
        or (kind = 'REOPENED' and body is not null and length(trim(body)) > 0
            and submission_key is not null and resolution_id is not null)
    );
