import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

describe('fidelity known-failure comparison', () => {
  it('rejects both unexpected regressions and unexpectedly fixed cases', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ots-fidelity-baseline-'));
    try {
      const failures = JSON.parse(await readFile('tools/musescore/fixtures/osmd-fidelity/known-failures.json', 'utf8'));
      const file = path.join(dir, 'failures.json');
      const run = () => spawnSync(process.execPath, ['tools/musescore/check-fidelity-baseline.mjs', file], { encoding: 'utf8' }).status;
      await writeFile(file, JSON.stringify(failures));
      expect(run()).toBe(0);
      await writeFile(file, JSON.stringify(failures.slice(1)));
      expect(run()).not.toBe(0);
      await writeFile(file, JSON.stringify([...failures, { id: 'new', stage: 'import', message: 'new regression' }]));
      expect(run()).not.toBe(0);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
