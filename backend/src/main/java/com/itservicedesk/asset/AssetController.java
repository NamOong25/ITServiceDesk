package com.itservicedesk.asset;

import java.sql.Types;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
class AssetController {
    private static final String FIELDS = """
            select a.id, a.code, a.name, a.kind, a.status, a.assigned_to_id, a.revision, employee.email as assignee,
                (select count(*) from incident i where i.asset_id = a.id) as incident_count
            from asset a left join app_user employee on employee.id = a.assigned_to_id
            """;

    private final JdbcClient db;
    private final boolean demoEnabled;

    AssetController(JdbcClient db, @Value("${itsd.demo.enabled:false}") boolean demoEnabled) {
        this.db = db;
        this.demoEnabled = demoEnabled;
    }

    @GetMapping("/api/assets/mine")
    List<AssetChoice> mine(Authentication account) {
        return db.sql("""
                select a.id, a.code, a.name
                from asset a join app_user employee on employee.id = a.assigned_to_id
                where a.status = 'IN_USE' and employee.email = :email
                order by a.code
                """).param("email", account.getName()).query(AssetChoice.class).list();
    }

    @GetMapping("/api/it/assets")
    List<Asset> list() {
        return db.sql(FIELDS + "order by a.code").query(Asset.class).list();
    }

    @GetMapping("/api/it/assets/assignees")
    List<Assignee> assignees() {
        return db.sql("""
                select id, email from app_user
                where role = 'EMPLOYEE' and (not demo_account or :demoEnabled)
                order by email
                """).param("demoEnabled", demoEnabled).query(Assignee.class).list();
    }

    @GetMapping("/api/it/assets/{id}")
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Detail detail(@PathVariable long id) {
        Asset asset = find(id);
        List<History> history = db.sql("""
                select id, title, status, created_at from incident
                where asset_id = :id order by created_at desc, id desc
                """).param("id", id).query(History.class).list();
        return new Detail(asset, history);
    }

    @PostMapping("/api/it/assets")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public Asset create(@RequestBody AssetDraft draft) {
        String code = draft.code() == null ? "" : draft.code().strip().toUpperCase(Locale.ROOT);
        if (!code.matches("[A-Z0-9][A-Z0-9-]{0,29}")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        String name = validate(draft);
        long id = db.sql("""
                insert into asset (code, name, kind, status, assigned_to_id)
                values (:code, :name, :kind, :status, :employee)
                on conflict (code) do nothing returning id
                """).param("code", code).param("name", name).param("kind", draft.kind().name())
                .param("status", draft.status().name()).param("employee", draft.assignedToId(), Types.BIGINT)
                .query(Long.class).optional().orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT));
        return find(id);
    }

    @PostMapping("/api/it/assets/{id}/edit")
    @Transactional
    public Asset edit(@PathVariable long id, @RequestBody AssetDraft draft) {
        if (draft.revision() == null || draft.revision() <= 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        String name = validate(draft);
        int updated = db.sql("""
                update asset set name = :name, kind = :kind, status = :status, assigned_to_id = :employee, revision = revision + 1
                where id = :id and revision = :revision
                """).param("id", id).param("revision", draft.revision()).param("name", name)
                .param("kind", draft.kind().name()).param("status", draft.status().name())
                .param("employee", draft.assignedToId(), Types.BIGINT).update();
        Asset asset = find(id);
        if (updated == 0) throw new ResponseStatusException(HttpStatus.CONFLICT);
        return asset;
    }

    private Asset find(long id) {
        return db.sql(FIELDS + "where a.id = :id").param("id", id).query(Asset.class).optional()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private String validate(AssetDraft draft) {
        String name = draft.name() == null ? "" : draft.name().strip();
        if (name.isEmpty() || name.length() > 120 || name.indexOf('\0') >= 0 || draft.kind() == null
                || draft.status() == null || (draft.status() == Status.IN_USE) != (draft.assignedToId() != null)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        if (draft.assignedToId() != null && !db.sql("""
                select exists (select 1 from app_user
                    where id = :id and role = 'EMPLOYEE' and (not demo_account or :demoEnabled))
                """).param("id", draft.assignedToId()).param("demoEnabled", demoEnabled).query(Boolean.class).single()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        return name;
    }

    enum Kind { LAPTOP, DESKTOP, MONITOR, PRINTER, OTHER }
    enum Status { IN_USE, AVAILABLE, MAINTENANCE, RETIRED }
    record AssetDraft(String code, String name, Kind kind, Status status, Long assignedToId, Integer revision) {}
    record AssetChoice(long id, String code, String name) {}
    record Assignee(long id, String email) {}
    record Asset(long id, String code, String name, Kind kind, Status status, Long assignedToId, int revision,
                 String assignee, long incidentCount) {}
    record History(long id, String title, String status, OffsetDateTime createdAt) {}
    record Detail(Asset asset, List<History> history) {}
}
