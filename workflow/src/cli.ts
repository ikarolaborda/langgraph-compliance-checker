import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { extractorFromEnv } from './extractors.js';
import { buildGraph, runCompliance } from './graph.js';

const path = process.argv[2];
if (!path) {
  console.error('usage: npm run check -- <invoice.txt>');
  process.exit(1);
}

const graph = buildGraph(extractorFromEnv());
const result = await runCompliance(graph, basename(path), await readFile(path, 'utf8'));
console.log(JSON.stringify(result, null, 2));
