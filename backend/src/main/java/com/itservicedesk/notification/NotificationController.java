package com.itservicedesk.notification;

import java.sql.Types;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/notifications")
class NotificationController {
    private static final int PAGE_SIZE = 20;
    private final JdbcClient db;

    NotificationController(JdbcClient db) {
        this.db = db;
    }

    @GetMapping
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Inbox inbox(Authentication account, @RequestParam(required = false) Long before) {
        if (before != null && before <= 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        String email = account.getName();
        long unreadCount = db.sql("""
                select count(*) from app_notification n join app_user u on u.id = n.recipient_id
                where u.email = :email and n.read_at is null
                """).param("email", email).query(Long.class).single();
        List<Item> found = db.sql("""
                select n.id, n.kind, n.created_at, n.read_at is null as unread,
                    coalesce(i.id, r.id) as resource_id, coalesce(i.title, r.system_name) as title
                from app_notification n
                join app_user u on u.id = n.recipient_id
                left join incident_activity a on a.id = n.incident_activity_id
                left join incident i on i.id = a.incident_id
                left join access_request r on r.id = n.access_request_id
                where u.email = :email and n.id < coalesce(:before, 9223372036854775807)
                order by n.id desc
                limit :limit
                """).param("email", email).param("before", before, Types.BIGINT)
                .param("limit", PAGE_SIZE + 1).query(Item.class).list();
        List<Item> items = found.subList(0, Math.min(PAGE_SIZE, found.size()));
        return new Inbox(unreadCount, items, found.size() > PAGE_SIZE ? items.getLast().id() : null);
    }

    @PostMapping("/{id}/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void markRead(@PathVariable long id, Authentication account) {
        int changed = db.sql("""
                update app_notification
                set read_at = coalesce(read_at, clock_timestamp())
                where id = :id and recipient_id = (select id from app_user where email = :email)
                """).param("id", id).param("email", account.getName()).update();
        if (changed == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
    }

    record Item(long id, String kind, OffsetDateTime createdAt, boolean unread, long resourceId, String title) {}
    record Inbox(long unreadCount, List<Item> items, Long nextBefore) {}
}
