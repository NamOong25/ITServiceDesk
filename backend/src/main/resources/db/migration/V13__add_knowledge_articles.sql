create table knowledge_article (
    id bigint generated always as identity primary key,
    source_incident_id bigint unique not null references incident(id),
    title varchar(120) not null check (length(trim(title)) > 0),
    category varchar(16) not null check (category in ('NETWORK', 'DEVICE', 'SOFTWARE', 'OTHER')),
    body varchar(8000) not null default '',
    revision integer not null default 1,
    updated_at timestamptz not null default clock_timestamp(),
    published_at timestamptz,
    check (published_at is null or length(trim(body)) > 0)
);

alter table incident add column knowledge_article_id bigint references knowledge_article(id);
