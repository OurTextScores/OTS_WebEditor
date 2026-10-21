// Confirm that the implementation inventory reached the generated JS/WASM glue.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const source = process.env.MS47_SOURCE || path.resolve(here, '../../../ms47-spike');
const inventory = JSON.parse(execFileSync(process.execPath, [path.join(here, 'inventory.mjs')], { encoding: 'utf8' }));
const glue = await readFile(path.join(source, 'build.artifacts/ms47_bridge.js'), 'utf8');
const missing = inventory.implemented.filter(name => !glue.includes(`Module["_${name}"]`) && !glue.includes(`Module['_${name}']`));
assert.deepEqual(missing, [], 'Implemented exports must exist in generated engine glue');
console.log(`Verified ${inventory.implemented.length} exports in generated glue; ${inventory.remaining.length} remain unported.`);
