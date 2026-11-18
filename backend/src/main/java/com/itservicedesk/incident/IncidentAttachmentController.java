package com.itservicedesk.incident;

import java.nio.charset.StandardCharsets;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
class IncidentAttachmentController {
    private final IncidentAttachments attachments;

    IncidentAttachmentController(IncidentAttachments attachments) {
        this.attachments = attachments;
    }

    @GetMapping("/api/incidents/{id}/attachments/{fileId}")
    ResponseEntity<byte[]> employee(@PathVariable long id, @PathVariable long fileId, Authentication account) {
        return download(attachments.file(id, fileId, account.getName(), false));
    }

    @GetMapping("/api/it/incidents/{id}/attachments/{fileId}")
    ResponseEntity<byte[]> it(@PathVariable long id, @PathVariable long fileId) {
        return download(attachments.file(id, fileId, null, true));
    }

    private ResponseEntity<byte[]> download(IncidentAttachments.StoredFile file) {
        var disposition = file.mediaType().startsWith("image/") ? ContentDisposition.inline() : ContentDisposition.attachment();
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.filename(file.name(), StandardCharsets.UTF_8).build().toString())
                .header("X-Content-Type-Options", "nosniff")
                .contentType(MediaType.parseMediaType(file.mediaType()))
                .contentLength(file.content().length)
                .body(file.content());
    }
}
