package dev.laborda.compliance;

import dev.laborda.compliance.Messages.ComplianceResult;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

// In-memory on purpose: this repo demonstrates the integration seam. A real product
// would persist verdicts next to the document they belong to.
@Component
public class ResultStore {

    public enum Status { PENDING, DONE }

    public record Entry(Status status, ComplianceResult result) {
    }

    private final Map<String, Entry> entries = new ConcurrentHashMap<>();

    public void markPending(String documentId) {
        entries.put(documentId, new Entry(Status.PENDING, null));
    }

    public void complete(ComplianceResult result) {
        entries.put(result.documentId(), new Entry(Status.DONE, result));
    }

    public Optional<Entry> find(String documentId) {
        return Optional.ofNullable(entries.get(documentId));
    }
}
