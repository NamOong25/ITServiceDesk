create table incident_summary (
    incident_id bigint primary key references incident(id) on delete cascade,
    issue varchar(1000) not null,
    attempted varchar(1000) not null,
    outstanding varchar(1000) not null,
    limited_history boolean not null,
    covered_reply_id bigint not null check (covered_reply_id >= 0),
    generated_at timestamptz not null default clock_timestamp()
);
