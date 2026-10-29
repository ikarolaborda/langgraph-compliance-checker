import { Annotation, END, MemorySaver, START, StateGraph } from '@langchain/langgraph';
import type { Extractor } from './extractors.js';
import { checkInvoice } from './rules.js';
import { describeIssues, Invoice, type ComplianceResult, type Decision, type Finding } from './schema.js';

export const MAX_ATTEMPTS = 3;

const State = Annotation.Root({
  documentId: Annotation<string>,
  text: Annotation<string>,
  invoice: Annotation<Invoice | null>({ reducer: (_, next) => next, default: () => null }),
  // Reasons the last extraction was rejected; sent back to the extractor as repair hints.
  feedback: Annotation<string[]>({ reducer: (_, next) => next, default: () => [] }),
  attempts: Annotation<number>({ reducer: (_, next) => next, default: () => 0 }),
  findings: Annotation<Finding[]>({ reducer: (_, next) => next, default: () => [] }),
  decision: Annotation<Decision | null>({ reducer: (_, next) => next, default: () => null }),
  audit: Annotation<string[]>({ reducer: (all, next) => all.concat(next), default: () => [] }),
});

type GraphState = typeof State.State;

const compact = (value: string) => value.replace(/\s+/g, '').toUpperCase();

// Identifiers that decide where money goes must be copied from the document, not generated.
// A model that "fixes" a typo in an IBAN is worse than one that fails.
function ungroundedFields(invoice: Invoice, text: string): string[] {
  const source = compact(text);
  const identifiers = {
    invoiceNumber: invoice.invoiceNumber,
    supplierVatId: invoice.supplierVatId,
    iban: invoice.iban,
  };
  return Object.entries(identifiers)
    .filter(([, value]) => !source.includes(compact(value)))
    .map(([key]) => `${key}: "${invoice[key as keyof typeof identifiers]}" does not appear in the document`);
}

export function buildGraph(extractor: Extractor) {
  const extract = async (state: GraphState) => {
    const attempts = state.attempts + 1;
    let raw: unknown;
    try {
      raw = await extractor.extract(state.text, state.feedback);
    } catch (error) {
      const reason = `extractor failed: ${(error as Error).message}`;
      return { attempts, invoice: null, feedback: [reason], audit: [`attempt ${attempts}: ${reason}`] };
    }

    const parsed = Invoice.safeParse(raw);
    if (!parsed.success) {
      const issues = describeIssues(parsed.error);
      return { attempts, invoice: null, feedback: issues, audit: [`attempt ${attempts}: schema rejected (${issues.length} issues)`] };
    }
    return { attempts, invoice: parsed.data, feedback: [], audit: [`attempt ${attempts}: schema valid`] };
  };

  const verifyGrounding = (state: GraphState) => {
    const missing = ungroundedFields(state.invoice!, state.text);
    if (missing.length) {
      return { invoice: null, feedback: missing, audit: [`grounding failed: ${missing.length} identifiers not in source`] };
    }
    return { audit: ['grounding ok'] };
  };

  const checkRules = (state: GraphState) => {
    const findings = checkInvoice(state.invoice!);
    return { findings, audit: [`rules: ${findings.length} findings`] };
  };

  const decide = (state: GraphState) => {
    const decision: Decision = state.findings.some((f) => f.severity === 'error')
      ? 'rejected'
      : state.findings.length
        ? 'needs_human_review'
        : 'approved';
    return { decision, audit: [`decision: ${decision}`] };
  };

  const escalate = (state: GraphState) => ({
    decision: 'needs_human_review' as const,
    findings: state.feedback.map((message) => ({ rule: 'extraction', severity: 'warning' as const, message })),
    audit: [`escalated after ${state.attempts} attempts`],
  });

  const retryOrEscalate = (state: GraphState) => (state.attempts < MAX_ATTEMPTS ? 'extract' : 'escalate');

  return new StateGraph(State)
    .addNode('extract', extract)
    .addNode('verifyGrounding', verifyGrounding)
    .addNode('checkRules', checkRules)
    .addNode('decide', decide)
    .addNode('escalate', escalate)
    .addEdge(START, 'extract')
    .addConditionalEdges('extract', (s) => (s.invoice ? 'verifyGrounding' : retryOrEscalate(s)), ['verifyGrounding', 'extract', 'escalate'])
    .addConditionalEdges('verifyGrounding', (s) => (s.invoice ? 'checkRules' : retryOrEscalate(s)), ['checkRules', 'extract', 'escalate'])
    .addEdge('checkRules', 'decide')
    .addEdge('decide', END)
    .addEdge('escalate', END)
    .compile({ checkpointer: new MemorySaver() });
}

export type ComplianceGraph = ReturnType<typeof buildGraph>;

export async function runCompliance(graph: ComplianceGraph, documentId: string, text: string): Promise<ComplianceResult> {
  // thread_id = documentId: a redelivered message returns the stored verdict instead of
  // paying for a second model run that could disagree with the first.
  const config = { configurable: { thread_id: documentId } };
  const existing = await graph.getState(config);
  const state = existing.values.decision
    ? (existing.values as GraphState)
    : await graph.invoke({ documentId, text }, config);
  return {
    documentId,
    decision: state.decision!,
    invoice: state.invoice,
    findings: state.findings,
    attempts: state.attempts,
    audit: state.audit,
  };
}
