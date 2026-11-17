create table incident (
    id bigint generated always as identity (start with 1001) primary key,
    requester_id bigint not null references app_user(id),
    submission_key uuid not null,
    title varchar(120) not null check (length(trim(title)) > 0),
    category varchar(16) not null check (category in ('NETWORK', 'DEVICE', 'SOFTWARE', 'OTHER')),
    impact varchar(16) not null check (impact in ('PERSONAL', 'TEAM', 'MANY_USERS')),
    description varchar(4000) not null check (length(trim(description)) > 0),
    status varchar(16) not null default 'NEW',
    created_at timestamptz not null default current_timestamp,
    unique (requester_id, submission_key)
);

create index incident_requester_created_idx on incident (requester_id, created_at desc, id desc);
