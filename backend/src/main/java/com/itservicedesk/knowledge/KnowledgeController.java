package com.itservicedesk.knowledge;

import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
class KnowledgeController {
    private static final String FROM_ARTICLES = " from knowledge_article ";
    private static final String PUBLIC_COLUMNS = "id, title, category, body, published_at";
    private static final String IT_COLUMNS = PUBLIC_COLUMNS + ", source_incident_id, updated_at, revision";
    private final JdbcClient db;

    KnowledgeController(JdbcClient db) {
        this.db = db;
    }

    @GetMapping("/api/knowledge")
    List<PublishedSummary> publishedList() {
        return db.sql("select id, title, category, published_at " + FROM_ARTICLES
                + "where published_at is not null order by published_at desc, id desc")
                .query(PublishedSummary.class).list();
    }

    @GetMapping("/api/knowledge/{id}")
    PublishedArticle published(@PathVariable long id) {
        return db.sql("select " + PUBLIC_COLUMNS + FROM_ARTICLES + "where id = :id and published_at is not null")
                .param("id", id).query(PublishedArticle.class).optional()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    @GetMapping("/api/it/knowledge")
    List<StaffSummary> staffList() {
        return db.sql("select id, title, category, published_at, updated_at " + FROM_ARTICLES
                + "order by updated_at desc, id desc")
                .query(StaffSummary.class).list();
    }

    @GetMapping("/api/it/knowledge/{id}")
    StaffArticle staffArticle(@PathVariable long id) {
        return db.sql("select " + IT_COLUMNS + FROM_ARTICLES + "where id = :id")
                .param("id", id).query(StaffArticle.class).optional()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    @PostMapping("/api/it/knowledge/from-incident/{incidentId}")
    @Transactional
    public StaffArticle draftFromIncident(@PathVariable long incidentId) {
        SourceIncident source = db.sql("select title, category, status from incident where id = :id for update")
                .param("id", incidentId).query(SourceIncident.class).optional()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        var existing = db.sql("select " + IT_COLUMNS + FROM_ARTICLES + "where source_incident_id = :id")
                .param("id", incidentId).query(StaffArticle.class).optional();
        if (existing.isPresent()) return existing.get();
        if (!"RESOLVED".equals(source.status())) throw new ResponseStatusException(HttpStatus.CONFLICT);
        return db.sql("""
                insert into knowledge_article (source_incident_id, title, category)
                values (:incident, :title, :category)
                returning
                """ + IT_COLUMNS)
                .param("incident", incidentId).param("title", source.title()).param("category", source.category())
                .query(StaffArticle.class).single();
    }

    @PostMapping("/api/it/knowledge/{id}/edit")
    @Transactional
    public StaffArticle edit(@PathVariable long id, @RequestBody EditArticle change) {
        if (change.category() == null || change.revision() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        String title = change.title() == null ? "" : change.title().strip();
        String body = change.body() == null ? "" : change.body().strip();
        if (title.isEmpty() || title.length() > 120 || title.indexOf('\0') >= 0
                || body.length() > 8000 || body.indexOf('\0') >= 0 || (change.publish() && body.isEmpty())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }

        return db.sql("""
                update knowledge_article
                set title = :title, category = :category, body = :body, revision = revision + 1,
                    updated_at = clock_timestamp(),
                    published_at = case when :publish then clock_timestamp() end
                where id = :id and revision = :revision and published_at is null
                returning
                """ + IT_COLUMNS)
                .param("id", id).param("title", title).param("category", change.category().name())
                .param("body", body).param("publish", change.publish()).param("revision", change.revision())
                .query(StaffArticle.class).optional().orElseGet(() -> {
                    staffArticle(id);
                    throw new ResponseStatusException(HttpStatus.CONFLICT);
                });
    }

    enum Category { NETWORK, DEVICE, SOFTWARE, OTHER }
    record EditArticle(String title, Category category, String body, int revision, boolean publish) {}
    record SourceIncident(String title, String category, String status) {}
    record PublishedSummary(long id, String title, String category, OffsetDateTime publishedAt) {}
    record PublishedArticle(long id, String title, String category, String body, OffsetDateTime publishedAt) {}
    record StaffSummary(long id, String title, String category, OffsetDateTime publishedAt, OffsetDateTime updatedAt) {}
    record StaffArticle(long id, String title, String category, String body, OffsetDateTime publishedAt,
                        long sourceIncidentId, OffsetDateTime updatedAt, int revision) {}
}
