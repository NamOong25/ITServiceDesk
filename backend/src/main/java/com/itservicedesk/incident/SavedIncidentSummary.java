package com.itservicedesk.incident;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;

record SavedIncidentSummary(GeminiIncidentSummary.Summary summary, boolean limitedHistory,
                            long coveredReplyId, OffsetDateTime generatedAt) {
    static Optional<SavedIncidentSummary> find(JdbcClient db, long incidentId) {
        return db.sql("""
                select issue, attempted, outstanding, limited_history, covered_reply_id, generated_at
                from incident_summary where incident_id = :id
                """)
                .param("id", incidentId)
                .query(SavedIncidentSummary::read)
                .optional();
    }

    static SavedIncidentSummary save(JdbcClient db, long incidentId, GeminiIncidentSummary.Summary summary,
                                     boolean limitedHistory, long coveredReplyId) {
        // A slower generation must not replace a saved summary that already covers newer replies.
        return db.sql("""
                insert into incident_summary (incident_id, issue, attempted, outstanding, limited_history, covered_reply_id)
                values (:id, :issue, :attempted, :outstanding, :limited, :covered)
                on conflict (incident_id) do update set
                    issue = excluded.issue,
                    attempted = excluded.attempted,
                    outstanding = excluded.outstanding,
                    limited_history = excluded.limited_history,
                    covered_reply_id = excluded.covered_reply_id,
                    generated_at = clock_timestamp()
                where incident_summary.covered_reply_id <= excluded.covered_reply_id
                returning issue, attempted, outstanding, limited_history, covered_reply_id, generated_at
                """)
                .param("id", incidentId)
                .param("issue", summary.issue())
                .param("attempted", summary.attempted())
                .param("outstanding", summary.outstanding())
                .param("limited", limitedHistory)
                .param("covered", coveredReplyId)
                .query(SavedIncidentSummary::read)
                .optional()
                .orElseGet(() -> find(db, incidentId).orElseThrow());
    }

    private static SavedIncidentSummary read(ResultSet row, int index) throws SQLException {
        var summary = new GeminiIncidentSummary.Summary(row.getString("issue"), row.getString("attempted"),
                row.getString("outstanding"));
        return new SavedIncidentSummary(summary, row.getBoolean("limited_history"),
                row.getLong("covered_reply_id"), row.getObject("generated_at", OffsetDateTime.class));
    }
}
