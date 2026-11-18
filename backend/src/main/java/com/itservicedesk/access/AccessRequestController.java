package com.itservicedesk.access;

import com.itservicedesk.notification.NotificationPublisher;
import com.itservicedesk.notification.NotificationPublisher.AccessEvent;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
class AccessRequestController {
    private static final String REQUESTS = """
            select r.id, r.system_name, r.requested_permission, r.reason, r.status, r.decision_note,
                   r.decided_at, r.completed_at, r.created_at, requester.email as requester,
                   manager.email as manager, assignee.email as assignee
            from access_request r
            join app_user requester on requester.id = r.requester_id
            join app_user manager on manager.id = r.manager_id
            left join app_user assignee on assignee.id = r.assignee_id
            """;
    private static final String FOR_EMPLOYEE = "where requester.email = :email";
    private static final String FOR_MANAGER = "where manager.email = :email";
    private static final String FOR_IT = "where r.status in ('APPROVED', 'IN_PROGRESS', 'FULFILLED')";

    private final JdbcClient db;
    private final NotificationPublisher notifications;

    AccessRequestController(JdbcClient db, NotificationPublisher notifications) {
        this.db = db;
        this.notifications = notifications;
    }

    @GetMapping("/access-requests")
    List<AccessRequest> employeeList(Authentication account) {
        return list(FOR_EMPLOYEE, account.getName());
    }

    @GetMapping("/access-requests/{id}")
    AccessRequest employeeDetail(@PathVariable long id, Authentication account) {
        return detail(FOR_EMPLOYEE, account.getName(), id);
    }

    @PostMapping("/access-requests")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public AccessRequest submit(Authentication account, @RequestBody Submission submission) {
        if (submission.submissionKey() == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        String system = requiredText(submission.systemName(), 120);
        String permission = requiredText(submission.requestedPermission(), 200);
        String reason = requiredText(submission.reason(), 4000);
        String email = account.getName();
        var prior = db.sql("""
                select r.id from access_request r join app_user u on u.id = r.requester_id
                where u.email = :email and r.submission_key = :key
                """)
                .param("email", email)
                .param("key", submission.submissionKey())
                .query(Long.class)
                .optional();
        long id = prior.orElseGet(() -> db.sql("""
                insert into access_request (requester_id, manager_id, submission_key, system_name, requested_permission, reason)
                select requester.id, manager.id, :key, :system, :permission, :reason
                from app_user requester join app_user manager on manager.id = requester.manager_id
                where requester.email = :email and manager.role = 'MANAGER'
                  and (requester.demo_account or not manager.demo_account)
                on conflict (requester_id, submission_key)
                do update set submission_key = excluded.submission_key
                returning id
                """)
                .param("email", email)
                .param("key", submission.submissionKey())
                .param("system", system)
                .param("permission", permission)
                .param("reason", reason)
                .query(Long.class)
                .optional()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNPROCESSABLE_CONTENT)));
        AccessRequest request = detail(FOR_EMPLOYEE, email, id);
        if (!request.systemName().equals(system) || !request.requestedPermission().equals(permission)
                || !request.reason().equals(reason)) conflict();
        if (prior.isEmpty()) notifications.accessRequest(id, AccessEvent.ACCESS_SUBMITTED);
        return request;
    }

    @GetMapping("/manager/access-requests")
    List<AccessRequest> managerList(Authentication account) {
        return list(FOR_MANAGER, account.getName());
    }

    @GetMapping("/manager/access-requests/{id}")
    AccessRequest managerDetail(@PathVariable long id, Authentication account) {
        return detail(FOR_MANAGER, account.getName(), id);
    }

    @PostMapping("/manager/access-requests/{id}/decision")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void decide(@PathVariable long id, Authentication account, @RequestBody Decision decision) {
        if (decision.outcome() == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        String note = decision.note() == null || decision.note().isBlank() ? null : requiredText(decision.note(), 2000);
        if (decision.outcome() == Outcome.REJECTED && note == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        String outcome = decision.outcome().name();
        String email = account.getName();
        int updated = db.sql("""
                update access_request
                set status = :outcome, decision_note = :note, decided_at = statement_timestamp()
                where id = :id and status = 'PENDING'
                  and manager_id = (select id from app_user where email = :email)
                """)
                .param("outcome", outcome)
                .param("note", note)
                .param("id", id)
                .param("email", email)
                .update();
        if (updated == 0) {
            AccessRequest request = detail(FOR_MANAGER, email, id);
            boolean matches = request.status().equals(outcome)
                    || (decision.outcome() == Outcome.APPROVED
                        && List.of("IN_PROGRESS", "FULFILLED").contains(request.status()));
            if (!matches || !Objects.equals(request.decisionNote(), note)) conflict();
        } else {
            notifications.accessRequest(id,
                    decision.outcome() == Outcome.APPROVED ? AccessEvent.ACCESS_APPROVED : AccessEvent.ACCESS_REJECTED);
        }
    }

    @GetMapping("/it/access-requests")
    List<AccessRequest> itList() {
        return list(FOR_IT, null);
    }

    @GetMapping("/it/access-requests/{id}")
    AccessRequest itDetail(@PathVariable long id) {
        return detail(FOR_IT, null, id);
    }

    @PostMapping("/it/access-requests/{id}/claim")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void claim(@PathVariable long id, Authentication account) {
        String email = account.getName();
        int updated = db.sql("""
                update access_request set status = 'IN_PROGRESS',
                    assignee_id = (select id from app_user where email = :email)
                where id = :id and status = 'APPROVED'
                """).param("email", email).param("id", id).update();
        if (updated == 0) {
            AccessRequest request = detail(FOR_IT, null, id);
            if (!request.status().equals("IN_PROGRESS") || !email.equals(request.assignee())) conflict();
        }
    }

    @PostMapping("/it/access-requests/{id}/complete")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void complete(@PathVariable long id, Authentication account) {
        String email = account.getName();
        int updated = db.sql("""
                update access_request set status = 'FULFILLED', completed_at = statement_timestamp()
                where id = :id and status = 'IN_PROGRESS'
                  and assignee_id = (select id from app_user where email = :email)
                """).param("id", id).param("email", email).update();
        if (updated == 0) {
            AccessRequest request = detail(FOR_IT, null, id);
            if (!email.equals(request.assignee())) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
            if (!request.status().equals("FULFILLED")) conflict();
        }
    }

    private List<AccessRequest> list(String scope, String email) {
        return scoped(scope + " order by r.created_at desc, r.id desc", email)
                .query(AccessRequest.class).list();
    }

    private AccessRequest detail(String scope, String email, long id) {
        return scoped(scope + " and r.id = :id", email).param("id", id)
                .query(AccessRequest.class).optional()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private JdbcClient.StatementSpec scoped(String scope, String email) {
        var statement = db.sql(REQUESTS + scope);
        return email == null ? statement : statement.param("email", email);
    }

    private static String requiredText(String value, int limit) {
        String text = value == null ? "" : value.strip();
        if (text.isEmpty() || text.length() > limit || text.indexOf('\0') >= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        return text;
    }

    private static void conflict() {
        throw new ResponseStatusException(HttpStatus.CONFLICT);
    }

    enum Outcome { APPROVED, REJECTED }

    record Submission(UUID submissionKey, String systemName, String requestedPermission, String reason) {}
    record Decision(Outcome outcome, String note) {}
    record AccessRequest(long id, String systemName, String requestedPermission, String reason,
                         String status, String decisionNote, OffsetDateTime decidedAt, OffsetDateTime completedAt,
                         OffsetDateTime createdAt, String requester, String manager, String assignee) {}
}
