package dev.laborda.compliance;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;

public final class Messages {

    private Messages() {
    }

    public record ComplianceRequest(String documentId, String text) {
    }

    public record Finding(String rule, String severity, String message) {
    }

    public record ComplianceResult(
        String documentId,
        String decision,
        JsonNode invoice,
        List<Finding> findings,
        int attempts,
        List<String> audit
    ) {
    }
}
