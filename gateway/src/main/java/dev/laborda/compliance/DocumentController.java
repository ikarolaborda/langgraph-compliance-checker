package dev.laborda.compliance;

import dev.laborda.compliance.Messages.ComplianceRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.Map;
import java.util.UUID;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/documents")
public class DocumentController {

    public record SubmitDocument(@NotBlank @Size(max = 100_000) String text) {
    }

    private final RabbitTemplate rabbit;
    private final ResultStore store;

    public DocumentController(RabbitTemplate rabbit, ResultStore store) {
        this.rabbit = rabbit;
        this.store = store;
    }

    @PostMapping
    public ResponseEntity<Map<String, String>> submit(@Valid @RequestBody SubmitDocument body) {
        String documentId = UUID.randomUUID().toString();
        // Pending first: a fast worker could otherwise publish a result before the
        // entry exists, and the later markPending would overwrite it.
        store.markPending(documentId);
        rabbit.convertAndSend(RabbitConfig.REQUESTS, new ComplianceRequest(documentId, body.text()));
        return ResponseEntity.status(HttpStatus.ACCEPTED)
            .body(Map.of("documentId", documentId, "status", ResultStore.Status.PENDING.name()));
    }

    @GetMapping("/{documentId}")
    public ResponseEntity<ResultStore.Entry> status(@PathVariable String documentId) {
        return ResponseEntity.of(store.find(documentId));
    }
}
