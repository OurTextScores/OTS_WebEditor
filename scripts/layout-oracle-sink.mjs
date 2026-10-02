#!/usr/bin/env node
/**
 * Collects layout-oracle diffs posted by the editor during a Playwright run and appends them,
 * one JSON object per line, to the file named by the first argument.
 *
 *   node scripts/layout-oracle-sink.mjs test-results/layout-oracle.jsonl [port=3199]
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname } from 'node:path';

const out = process.argv[2] ?? 'test-results/layout-oracle.jsonl';
const port = Number(process.argv[3] ?? 3199);
mkdirSync(dirname(out), { recursive: true });

createServer((request, response) => {
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8').trim();
    if (body) {
      // The directory can vanish between writes (Playwright clears test-results at the start of a run).
      mkdirSync(dirname(out), { recursive: true });
      appendFileSync(out, `${body}\n`);
    }
    response.writeHead(204).end();
  });
}).listen(port, '127.0.0.1', () => console.log(`layout oracle sink on :${port} -> ${out}`));
