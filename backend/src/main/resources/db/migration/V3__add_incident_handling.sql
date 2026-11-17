alter table incident
    add column assignee_id bigint references app_user(id),
    add constraint incident_handling_state check (
        (status = 'NEW' and assignee_id is null)
        or (status in ('IN_PROGRESS', 'RESOLVED') and assignee_id is not null)
    );

create table incident_activity (
    id bigint generated always as identity primary key,
    incident_id bigint not null references incident(id),
    actor_id bigint not null references app_user(id),
    kind varchar(16) not null check (kind in ('ASSIGNED', 'PUBLIC_REPLY', 'INTERNAL_NOTE', 'RESOLVED')),
    body varchar(4000),
    submission_key uuid,
    created_at timestamptz not null default current_timestamp,
    check (
        (kind in ('ASSIGNED', 'RESOLVED') and body is null and submission_key is null)
        or (kind in ('PUBLIC_REPLY', 'INTERNAL_NOTE') and body is not null
            and length(trim(body)) > 0 and submission_key is not null)
    ),
    unique (incident_id, actor_id, submission_key)
);

create index incident_activity_timeline_idx on incident_activity (incident_id, created_at, id);
