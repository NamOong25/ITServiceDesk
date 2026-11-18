create table app_notification (
    id bigint generated always as identity primary key,
    recipient_id bigint not null references app_user(id),
    kind varchar(24) not null,
    incident_activity_id bigint unique references incident_activity(id),
    access_request_id bigint references access_request(id),
    created_at timestamptz not null default clock_timestamp(),
    read_at timestamptz,
    unique (access_request_id, kind),
    check (
        (kind in ('WAIT_REQUESTED', 'RESOLVED', 'TRANSFERRED', 'REQUESTER_REPLY')
            and incident_activity_id is not null and access_request_id is null)
        or (kind in ('ACCESS_SUBMITTED', 'ACCESS_APPROVED', 'ACCESS_REJECTED')
            and access_request_id is not null and incident_activity_id is null)
    )
);

create index app_notification_inbox_idx on app_notification (recipient_id, id desc);
create index app_notification_unread_idx on app_notification (recipient_id) where read_at is null;
