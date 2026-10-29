import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { extractorFromEnv } from './extractors.js';
import { buildGraph, runCompliance } from './graph.js';

// Scores the whole graph against labelled fixtures. Run it after every prompt, model or
// rule change: a change that lowers either score does not ship.
const FIXTURES = join(import.meta.dirname, '..', 'fixtures');
const MIN_DECISION_ACCURACY = Number(process.env.EVAL_MIN_DECISION_ACCURACY ?? 1);
const MIN_FIELD_ACCURACY = Number(process.env.EVAL_MIN_FIELD_ACCURACY ?? 0.95);

type Expected = Record<string, { decision: string; fields: Record<string, string | number> }>;
const expected: Expected = JSON.parse(await readFile(join(FIXTURES, 'expected.json'), 'utf8'));

const graph = buildGraph(extractorFromEnv());
let decisionsRight = 0;
let fieldsRight = 0;
let fieldsTotal = 0;
const rows = [];

for (const [file, want] of Object.entries(expected)) {
  const result = await runCompliance(graph, `eval:${file}`, await readFile(join(FIXTURES, file), 'utf8'));
  const decisionOk = result.decision === want.decision;
  decisionsRight += Number(decisionOk);

  const wrongFields = Object.entries(want.fields).filter(
    ([key, value]) => result.invoice?.[key as keyof typeof result.invoice] !== value,
  );
  fieldsTotal += Object.keys(want.fields).length;
  fieldsRight += Object.keys(want.fields).length - wrongFields.length;

  rows.push({
    file,
    expected: want.decision,
    got: result.decision,
    attempts: result.attempts,
    ok: decisionOk && wrongFields.length === 0 ? 'yes' : `NO ${wrongFields.map(([k]) => k).join(',')}`,
  });
}

console.table(rows);
const decisionAccuracy = decisionsRight / rows.length;
const fieldAccuracy = fieldsTotal ? fieldsRight / fieldsTotal : 1;
console.log(`decision accuracy ${(decisionAccuracy * 100).toFixed(1)}%  field accuracy ${(fieldAccuracy * 100).toFixed(1)}%`);

if (decisionAccuracy < MIN_DECISION_ACCURACY || fieldAccuracy < MIN_FIELD_ACCURACY) {
  console.error('below threshold');
  process.exit(1);
}
