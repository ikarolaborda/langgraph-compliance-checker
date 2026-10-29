package dev.laborda.compliance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import dev.laborda.compliance.Messages.ComplianceRequest;
import dev.laborda.compliance.Messages.ComplianceResult;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(DocumentController.class)
@Import({ResultStore.class, ComplianceResultListener.class})
class DocumentControllerTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    ComplianceResultListener listener;

    @MockitoBean
    RabbitTemplate rabbit;

    @Test
    void publishes_the_document_and_reports_pending_until_a_result_arrives() throws Exception {
        mvc.perform(post("/documents").contentType(MediaType.APPLICATION_JSON).content("{\"text\":\"Invoice number: X\"}"))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.status").value("PENDING"));

        ArgumentCaptor<ComplianceRequest> sent = ArgumentCaptor.forClass(ComplianceRequest.class);
        verify(rabbit).convertAndSend(eq(RabbitConfig.REQUESTS), sent.capture());
        String id = sent.getValue().documentId();
        assertThat(sent.getValue().text()).isEqualTo("Invoice number: X");

        mvc.perform(get("/documents/" + id)).andExpect(jsonPath("$.status").value("PENDING"));

        listener.onResult(new ComplianceResult(id, "rejected", null, List.of(), 1, List.of()));

        mvc.perform(get("/documents/" + id))
            .andExpect(jsonPath("$.status").value("DONE"))
            .andExpect(jsonPath("$.result.decision").value("rejected"));
    }

    @Test
    void rejects_an_empty_document() throws Exception {
        mvc.perform(post("/documents").contentType(MediaType.APPLICATION_JSON).content("{\"text\":\"  \"}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void returns_404_for_an_unknown_document() throws Exception {
        mvc.perform(get("/documents/nope")).andExpect(status().isNotFound());
    }
}
