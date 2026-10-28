// Compare a strict fidelity run against explicitly recorded failures. The strict run itself must still fail.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const file = process.argv[2];
if (!file || process.argv.length !== 3) throw new Error('Usage: node tools/musescore/check-fidelity-baseline.mjs <fidelity-failures.json>');
const reference = JSON.parse(await readFile(new URL('./fixtures/osmd-fidelity/known-failures.json', import.meta.url), 'utf8'));
const observed = JSON.parse(await readFile(path.resolve(file), 'utf8'));
const normalize = value => {
  assert.ok(Array.isArray(value) && value.length > 0, 'expected a nonempty failure list');
  for (const item of value) assert.ok(typeof item.id === 'string' && typeof item.stage === 'string' && typeof item.message === 'string');
  return value.map(({ id, stage, message }) => ({ id, stage, message })).sort((a, b) => `${a.id}:${a.stage}`.localeCompare(`${b.id}:${b.stage}`));
};
assert.deepEqual(normalize(observed), normalize(reference), 'failure set changed: investigate any new failure or fix and update the reviewed baseline');
console.log(`Known-failure baseline matches ${observed.length} failures; strict fidelity remains failing.`);
