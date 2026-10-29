import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OfflineExtractor, type Extractor } from '../src/extractors.js';
import { buildGraph, MAX_ATTEMPTS, runCompliance } from '../src/graph.js';

const fixture = (name: string) => readFile(join(import.meta.dirname, '..', 'fixtures', name), 'utf8');

// Wraps the offline extractor and corrupts the first N answers, the way a model does
// when it drops a field or invents a value.
class ScriptedExtractor implements Extractor {
  readonly feedbackSeen: string[][] = [];
  private calls = 0;

  constructor(private readonly corrupt: (answer: Record<string, unknown>, call: number) => Record<string, unknown>) {}

  async extract(text: string, feedback: string[]) {
    this.feedbackSeen.push(feedback);
    const answer = (await new OfflineExtractor().extract(text)) as Record<string, unknown>;
    return this.corrupt(answer, ++this.calls);
  }
}

describe('compliance graph', () => {
  it('approves a clean invoice in one attempt', async () => {
    const result = await runCompliance(buildGraph(new OfflineExtractor()), 'a', await fixture('approved-pt.txt'));
    expect(result).toMatchObject({ decision: 'approved', attempts: 1, findings: [] });
  });

  it('repairs a schema failure by feeding the errors back to the extractor', async () => {
    const extractor = new ScriptedExtractor((answer, call) => (call === 1 ? { ...answer, total: '196,80 EUR' } : answer));
    const result = await runCompliance(buildGraph(extractor), 'b', await fixture('approved-pt.txt'));

    expect(result).toMatchObject({ decision: 'approved', attempts: 2 });
    expect(extractor.feedbackSeen[1]).toEqual([expect.stringContaining('total')]);
  });

  it('rejects a hallucinated IBAN even when it passes the checksum', async () => {
    const extractor = new ScriptedExtractor((answer, call) =>
      call === 1 ? { ...answer, iban: 'DE89370400440532013000' } : answer,
    );
    const result = await runCompliance(buildGraph(extractor), 'c', await fixture('approved-pt.txt'));

    expect(result.attempts).toBe(2);
    expect(extractor.feedbackSeen[1]).toEqual([expect.stringContaining('iban')]);
    expect(result.audit).toContain('grounding failed: 1 identifiers not in source');
  });

  it('escalates to a human after the retry budget is spent', async () => {
    const result = await runCompliance(buildGraph(new OfflineExtractor()), 'd', await fixture('missing-iban.txt'));
    expect(result).toMatchObject({ decision: 'needs_human_review', attempts: MAX_ATTEMPTS, invoice: null });
  });

  it('escalates when the extractor itself throws', async () => {
    const failing: Extractor = { extract: async () => { throw new Error('429 rate limited'); } };
    const result = await runCompliance(buildGraph(failing), 'e', await fixture('approved-pt.txt'));
    expect(result.decision).toBe('needs_human_review');
    expect(result.findings[0].message).toContain('429');
  });

  it('returns the stored verdict for a redelivered document', async () => {
    const extractor = new ScriptedExtractor((answer) => answer);
    const graph = buildGraph(extractor);
    const text = await fixture('approved-de.txt');

    const first = await runCompliance(graph, 'same-id', text);
    const second = await runCompliance(graph, 'same-id', text);

    expect(second).toEqual(first);
    expect(extractor.feedbackSeen).toHaveLength(1);
  });
});
