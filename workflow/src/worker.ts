import amqp from 'amqplib';
import { extractorFromEnv } from './extractors.js';
import { buildGraph, runCompliance } from './graph.js';
import type { ComplianceRequest } from './schema.js';

const AMQP_URL = process.env.AMQP_URL ?? 'amqp://guest:guest@localhost:5672';
const REQUESTS = 'compliance.requests';
const RESULTS = 'compliance.results';
const DEAD_LETTERS = 'compliance.requests.dlq';

const connection = await amqp.connect(AMQP_URL);
const channel = await connection.createChannel();

await channel.assertQueue(DEAD_LETTERS, { durable: true });
await channel.assertQueue(REQUESTS, {
  durable: true,
  arguments: { 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': DEAD_LETTERS },
});
await channel.assertQueue(RESULTS, { durable: true });
// One document at a time per worker: model calls are slow, so prefetching more only
// hides work from other workers.
await channel.prefetch(1);

const graph = buildGraph(extractorFromEnv());

await channel.consume(REQUESTS, async (message) => {
  if (!message) {
    return;
  }
  try {
    const request = JSON.parse(message.content.toString()) as ComplianceRequest;
    const result = await runCompliance(graph, request.documentId, request.text);
    channel.sendToQueue(RESULTS, Buffer.from(JSON.stringify(result)), {
      persistent: true,
      contentType: 'application/json',
    });
    channel.ack(message);
    console.log(`${request.documentId}: ${result.decision} after ${result.attempts} attempt(s)`);
  } catch (error) {
    // Infrastructure failures (bad JSON, broker issues) go to the DLQ for inspection.
    // Model failures never reach here: the graph turns them into needs_human_review.
    console.error('dead-lettering message:', error);
    channel.nack(message, false, false);
  }
});

console.log(`worker listening on ${REQUESTS}`);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await channel.close();
    await connection.close();
    process.exit(0);
  });
}
