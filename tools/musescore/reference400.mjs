// Historical comparisons must never silently use the current shipping 4.7 bundle.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export function reference400() {
  if (!process.env.MS47_REFERENCE_400) return null;
  const file = path.resolve(process.env.MS47_REFERENCE_400);
  assert.ok(existsSync(file), `MS47_REFERENCE_400 does not exist: ${file}`);
  execFileSync(
    process.execPath,
    [
      '-e',
      `
    const assert = require('node:assert/strict');
    const W = require(process.argv[1]);
    (async () => { await W.ready; assert.equal(await W.version(), 400,
      'MS47_REFERENCE_400 must be a 4.00 bundle, not the shipping 4.7 engine'); })()
      .catch(error => { console.error(error); process.exitCode = 1; });
  `,
      file,
    ],
    { stdio: 'pipe' },
  );
  return file;
}
