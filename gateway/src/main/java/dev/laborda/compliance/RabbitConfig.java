package dev.laborda.compliance;

import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RabbitConfig {

    public static final String REQUESTS = "compliance.requests";
    public static final String RESULTS = "compliance.results";
    public static final String DEAD_LETTERS = "compliance.requests.dlq";

    // Declared identically by the TypeScript worker; RabbitMQ rejects a redeclare with
    // different arguments, so both sides must agree on the dead-letter settings.
    @Bean
    Queue requests() {
        return QueueBuilder.durable(REQUESTS)
            .deadLetterExchange("")
            .deadLetterRoutingKey(DEAD_LETTERS)
            .build();
    }

    @Bean
    Queue results() {
        return QueueBuilder.durable(RESULTS).build();
    }

    @Bean
    Queue deadLetters() {
        return QueueBuilder.durable(DEAD_LETTERS).build();
    }

    @Bean
    MessageConverter messageConverter() {
        return new Jackson2JsonMessageConverter();
    }
}
