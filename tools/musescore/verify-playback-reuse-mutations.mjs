// Mutation-check the real C++ cache guards. Only scratch artifacts are used; maintained input and production build are restored.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = fileURLToPath(new URL('../../', import.meta.url));
const scratch = path.resolve(process.argv[2] || '/tmp/ots-phase8-mutations');
const header = path.join(repo, 'engine/musescore/bridge/playbacktools.h');
const original = readFileSync(header, 'utf8');
mkdirSync(scratch, { recursive: true });
const results = [];
const run = (args, env, log) => {
  const result = spawnSync('npm', args, { cwd: repo, env, encoding: 'utf8', maxBuffer: 64e6 });
  const output = `${result.stdout}\n${result.stderr}`;
  writeFileSync(path.join(scratch, log), output);
  assert.equal(
    result.status,
    0,
    `${args.join(' ')} failed; see ${path.join(scratch, log)}: ${output.slice(-1500)}`,
  );
};
try {
  for (const mutation of [
    {
      name: 'ignore-change-watcher',
      from: 'cached.watcher && !cached.watcher->changed &&',
      to: 'cached.watcher &&',
      expected: 'an edit invalidates',
    },
    {
      name: 'skip-explicit-flush',
      from: 'if (track && track->inputHandler) track->inputHandler->flush();',
      to: '(void)track;',
      expected: /sounds like a fresh|matches fresh|identical/,
      // Equivalent for this bridge lifecycle: mixer deactivation/reactivation also calls
      // EventAudioSource::setIsActive(), which unconditionally flushes on the transition.
      equivalent: true,
    },
  ]) {
    assert.ok(original.includes(mutation.from), `mutation anchor exists: ${mutation.name}`);
    writeFileSync(header, original.replace(mutation.from, mutation.to));
    const env = { ...process.env, MS47_FAST_LINK: 'OFF', MS47_JOBS: '1' };
    run(['run', 'build:engine'], env, `${mutation.name}-build.log`);
    const bundle = path.join(scratch, mutation.name);
    run(['run', 'bundle:engine', '--', bundle], env, `${mutation.name}-bundle.log`);
    const result = spawnSync(process.execPath, ['tools/musescore/verify.mjs'], {
      cwd: repo,
      encoding: 'utf8',
      maxBuffer: 64e6,
      env: {
        ...env,
        MS47_BUNDLE: bundle,
        MS47_ONLY_EDITS: '1',
        MS47_VERIFY_PLAYBACK_REUSE: '1',
        MS47_SOUNDFONT: path.join(repo, 'public/soundfonts/default.sf3'),
        MS47_OUTPUT: path.join(scratch, `${mutation.name}-result`),
      },
    });
    const output = `${result.stdout}\n${result.stderr}`;
    writeFileSync(path.join(scratch, `${mutation.name}-verification.log`), output);
    if (mutation.equivalent) {
      assert.equal(result.status, 0, `${mutation.name}: activation still flushes sounding voices`);
      results.push({ name: mutation.name, equivalent: true, exitCode: result.status });
      console.log(`equivalent ${mutation.name}: mixer activation also flushes`);
      continue;
    }
    assert.notEqual(result.status, 0, `${mutation.name} must be caught`);
    assert.match(
      output,
      typeof mutation.expected === 'string' ? new RegExp(mutation.expected) : mutation.expected,
      `${mutation.name} fails the intended assertion`,
    );
    results.push({ name: mutation.name, caught: true, exitCode: result.status });
    console.log(`caught ${mutation.name}`);
  }
} finally {
  writeFileSync(header, original);
  run(
    ['run', 'build:engine'],
    { ...process.env, MS47_FAST_LINK: 'OFF' },
    'restored-production-build.log',
  );
}
writeFileSync(path.join(scratch, 'results.json'), JSON.stringify(results, null, 2) + '\n');
