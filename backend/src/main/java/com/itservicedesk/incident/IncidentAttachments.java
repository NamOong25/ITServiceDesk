package com.itservicedesk.incident;

import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Types;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Component
class IncidentAttachments {
    private static final String FROM_INCIDENT = """
            from incident_attachment f
            join incident i on i.id = f.incident_id
            join app_user requester on requester.id = i.requester_id
            left join incident_activity a on a.id = f.activity_id
            where f.incident_id = :incident
              and (:staff or (requester.email = :email and a.kind is distinct from 'INTERNAL_NOTE'))
            """;
    private static final int MAX_BYTES = 5 * 1024 * 1024;
    private static final int MAX_FILES = 3;
    private final JdbcClient db;

    IncidentAttachments(JdbcClient db) {
        this.db = db;
    }

    List<Upload> readUploads(List<MultipartFile> files) {
        if (files == null) return List.of();
        if (files.size() > MAX_FILES) throw new ResponseStatusException(HttpStatus.CONTENT_TOO_LARGE);
        List<Upload> uploads = new ArrayList<>();
        for (MultipartFile file : files) {
            if (file.getSize() > MAX_BYTES) throw new ResponseStatusException(HttpStatus.CONTENT_TOO_LARGE);
            byte[] content;
            try {
                content = file.getBytes();
            } catch (IOException failure) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot read attachment", failure);
            }
            String type = detectMediaType(content);
            String name = safeName(file.getOriginalFilename(), type);
            uploads.add(new Upload(new Fingerprint(name, type, content.length, digest(content)), content));
        }
        return uploads;
    }

    void save(long incidentId, Long activityId, List<Upload> uploads) {
        for (int index = 0; index < uploads.size(); index++) {
            Upload upload = uploads.get(index);
            Fingerprint file = upload.fingerprint();
            db.sql("""
                    insert into incident_attachment (incident_id, activity_id, position, name, media_type, size_bytes, sha256, content)
                    values (:incident, :activity, :position, :name, :type, :size, :hash, :content)
                    """).param("incident", incidentId).param("activity", activityId, Types.BIGINT)
                    .param("position", index + 1).param("name", file.name()).param("type", file.mediaType())
                    .param("size", file.sizeBytes()).param("hash", file.sha256()).param("content", upload.content()).update();
        }
    }

    void verifyRetry(long incidentId, Long activityId, List<Upload> uploads) {
        List<Fingerprint> previous = db.sql("""
                select name, media_type, size_bytes, sha256 from incident_attachment
                where incident_id = :incident and activity_id is not distinct from :activity
                order by position
                """).param("incident", incidentId).param("activity", activityId, Types.BIGINT)
                .query(Fingerprint.class).list();
        if (!previous.equals(uploads.stream().map(Upload::fingerprint).toList())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT);
        }
    }

    List<Attachment> visible(long incident, String email, boolean staff) {
        return db.sql("select f.id, f.activity_id, f.name, f.media_type, f.size_bytes " + FROM_INCIDENT
                + "order by f.id").param("incident", incident).param("email", email, Types.VARCHAR)
                .param("staff", staff).query(Attachment.class).list();
    }

    StoredFile file(long incident, long id, String email, boolean staff) {
        return db.sql("select f.name, f.media_type, f.content " + FROM_INCIDENT + "and f.id = :id")
                .param("incident", incident).param("id", id).param("email", email, Types.VARCHAR).param("staff", staff)
                .query(StoredFile.class).optional().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private static String detectMediaType(byte[] content) {
        if (content.length >= 24 && startsWith(content, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
                0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52)) return "image/png";
        if (content.length >= 5 && startsWith(content, 0xff, 0xd8, 0xff)
                && content[content.length - 2] == (byte) 0xff && content[content.length - 1] == (byte) 0xd9) {
            return "image/jpeg";
        }
        if (startsWith(content, 0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf";
        throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    }

    private static boolean startsWith(byte[] content, int... signature) {
        if (content.length < signature.length) return false;
        for (int index = 0; index < signature.length; index++) {
            if (Byte.toUnsignedInt(content[index]) != signature[index]) return false;
        }
        return true;
    }

    private static String safeName(String original, String type) {
        String name = original == null ? "" : original.replace('\\', '/');
        name = name.substring(name.lastIndexOf('/') + 1)
                .replaceAll("[\\p{C}\\p{Zl}\\p{Zp}]", "_").strip();
        int extension = name.lastIndexOf('.');
        String stem = extension > 0 ? name.substring(0, extension) : name;
        if (stem.isBlank() || stem.equals(".") || stem.equals("..")) stem = "tep-dinh-kem";
        if (stem.length() > 140) {
            stem = stem.substring(0, stem.offsetByCodePoints(0, Math.min(130, stem.codePointCount(0, stem.length()))));
        }
        return stem + switch (type) {
            case "image/png" -> ".png";
            case "image/jpeg" -> ".jpg";
            default -> ".pdf";
        };
    }

    private static String digest(byte[] content) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content));
        } catch (NoSuchAlgorithmException failure) {
            throw new IllegalStateException(failure);
        }
    }

    record Upload(Fingerprint fingerprint, byte[] content) {}
    record Fingerprint(String name, String mediaType, int sizeBytes, String sha256) {}
    record Attachment(long id, Long activityId, String name, String mediaType, int sizeBytes) {}
    record StoredFile(String name, String mediaType, byte[] content) {}
}
