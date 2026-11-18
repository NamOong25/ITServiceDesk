alter table incident
    add column priority_override varchar(6)
        check (priority_override in ('HIGH', 'MEDIUM', 'LOW'));
