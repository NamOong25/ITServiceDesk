alter table incident_activity add constraint incident_activity_incident_id_unique unique (incident_id, id);

create table incident_attachment (
    id bigint generated always as identity primary key,
    incident_id bigint not null references incident(id),
    activity_id bigint,
    position smallint not null check (position between 1 and 3),
    name varchar(150) not null,
    media_type varchar(20) not null check (media_type in ('image/png', 'image/jpeg', 'application/pdf')),
    size_bytes integer not null check (size_bytes between 1 and 5242880),
    sha256 char(64) not null,
    content bytea not null check (octet_length(content) = size_bytes),
    foreign key (incident_id, activity_id) references incident_activity (incident_id, id),
    unique nulls not distinct (incident_id, activity_id, position)
);
