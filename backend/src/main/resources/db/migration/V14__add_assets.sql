create table asset (
    id bigint generated always as identity primary key,
    code varchar(30) not null unique check (code ~ '^[A-Z0-9][A-Z0-9-]{0,29}$'),
    name varchar(120) not null check (length(trim(name)) > 0),
    kind varchar(16) not null check (kind in ('LAPTOP', 'DESKTOP', 'MONITOR', 'PRINTER', 'OTHER')),
    status varchar(16) not null check (status in ('IN_USE', 'AVAILABLE', 'MAINTENANCE', 'RETIRED')),
    assigned_to_id bigint references app_user(id),
    revision integer not null default 1,
    check ((status = 'IN_USE') = (assigned_to_id is not null))
);

alter table incident add column asset_id bigint references asset(id);
create index incident_asset_history_idx on incident (asset_id, created_at desc, id desc) where asset_id is not null;
create index asset_assignee_idx on asset (assigned_to_id, code) where assigned_to_id is not null;
