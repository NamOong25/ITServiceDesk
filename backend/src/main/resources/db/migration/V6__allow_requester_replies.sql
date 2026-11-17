alter table incident_activity
    drop constraint incident_activity_kind_check,
    drop constraint incident_activity_check,
    alter column created_at set default clock_timestamp(),
    add constraint incident_activity_kind_check
        check (kind in ('ASSIGNED', 'PUBLIC_REPLY', 'REQUESTER_REPLY', 'INTERNAL_NOTE', 'RESOLVED')),
    add constraint incident_activity_check check (
        (kind in ('ASSIGNED', 'RESOLVED') and body is null and submission_key is null)
        or (kind in ('PUBLIC_REPLY', 'REQUESTER_REPLY', 'INTERNAL_NOTE') and body is not null
            and length(trim(body)) > 0 and submission_key is not null)
    );
