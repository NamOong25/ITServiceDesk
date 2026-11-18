package com.itservicedesk.incident;

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
class IncidentSummaryController {
    private static final int REPLY_LIMIT = 12;

    private final JdbcClient db;
    private final GeminiIncidentSummary gemini;

    IncidentSummaryController(JdbcClient db, GeminiIncidentSummary gemini) {
        this.db = db;
        this.gemini = gemini;
    }

    // The existing /api/it/incidents/** rule restricts generation to the IT role.
    @PostMapping("/api/it/incidents/{id}/summary")
    Result summarize(@PathVariable long id) {
        String description = db.sql("select description from incident where id = :id")
                .param("id", id)
                .query(String.class)
                .optional()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        List<PublicReply> latest = db.sql("""
                select case kind when 'PUBLIC_REPLY' then 'IT' else 'Nhân viên' end as speaker, body
                from incident_activity
                where incident_id = :id and kind in ('PUBLIC_REPLY', 'REQUESTER_REPLY')
                order by created_at desc, id desc
                limit :limit
                """)
                .param("id", id)
                .param("limit", REPLY_LIMIT + 1)
                .query(PublicReply.class)
                .list();

        boolean limitedHistory = latest.size() > REPLY_LIMIT;
        List<PublicReply> replies = latest.subList(0, Math.min(latest.size(), REPLY_LIMIT)).reversed();
        var summary = gemini.summarize(new Context(description, replies));
        return new Result(summary, limitedHistory);
    }

    record Context(String description, List<PublicReply> replies) {}
    record PublicReply(String speaker, String body) {}
    record Result(GeminiIncidentSummary.Summary summary, boolean limitedHistory) {}
}
