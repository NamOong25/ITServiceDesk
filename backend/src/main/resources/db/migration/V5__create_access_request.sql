alter table app_user
    add column manager_id bigint references app_user(id),
    add constraint app_user_not_own_manager check (manager_id <> id);

create table access_request (
    id bigint generated always as identity (start with 1001) primary key,
    requester_id bigint not null references app_user(id),
    manager_id bigint not null references app_user(id),
    assignee_id bigint references app_user(id),
    submission_key uuid not null,
    system_name varchar(120) not null,
    requested_permission varchar(200) not null,
    reason varchar(4000) not null,
    status varchar(16) not null default 'PENDING'
        check (status in ('PENDING', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'FULFILLED')),
    decision_note varchar(2000),
    decided_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz not null default current_timestamp,
    unique (requester_id, submission_key),
    check ((status = 'PENDING') = (decided_at is null)),
    check (status <> 'REJECTED' or (decision_note is not null and length(trim(decision_note)) > 0)),
    check ((status in ('IN_PROGRESS', 'FULFILLED')) = (assignee_id is not null)),
    check ((status = 'FULFILLED') = (completed_at is not null))
);

create index access_request_requester_idx on access_request (requester_id, created_at desc, id desc);
create index access_request_manager_idx on access_request (manager_id, created_at desc, id desc);
