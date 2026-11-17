create table app_user (
    id bigint generated always as identity primary key,
    email varchar(254) not null unique check (email = lower(email)),
    password_hash varchar(255) not null,
    role varchar(16) not null check (role in ('EMPLOYEE', 'IT', 'MANAGER')),
    demo_account boolean not null default false
);
