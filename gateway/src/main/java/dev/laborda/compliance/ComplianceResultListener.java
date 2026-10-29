package dev.laborda.compliance;

import dev.laborda.compliance.Messages.ComplianceResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

@Component
public class ComplianceResultListener {

    private static final Logger log = LoggerFactory.getLogger(ComplianceResultListener.class);

    private final ResultStore store;

    public ComplianceResultListener(ResultStore store) {
        this.store = store;
    }

    @RabbitListener(queues = RabbitConfig.RESULTS)
    public void onResult(ComplianceResult result) {
        store.complete(result);
        log.info("{} -> {} ({} attempts)", result.documentId(), result.decision(), result.attempts());
    }
}
