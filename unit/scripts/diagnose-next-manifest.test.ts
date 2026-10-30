import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });

it('reports only failed Next manifest reads in CI without printing their contents', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'ots-manifest-test-')); roots.push(root);
  const dist = path.join(root, '.next-test');
  await mkdir(dist);
  const file = path.join(dist, 'routes-manifest.json');
  const secret = '{"fixture":"do-not-log-this"';
  const loader = require.resolve('next/dist/server/load-manifest.external.js');
  const preload = path.resolve('scripts/diagnose-next-manifest.cjs');
  const run = (ci: boolean, name = file, direct = false) => {
    const source = direct
      ? `const fs=require('node:fs');const text=fs.readFileSync(${JSON.stringify(name)},'utf8');try{JSON.parse(text)}catch(e){console.log(e.name)}`
      : `const loader=require(${JSON.stringify(loader)});try{loader.loadManifest(${JSON.stringify(name)},false);console.log('valid')}catch(e){console.log(e.name)}`;
    const env: NodeJS.ProcessEnv = { ...process.env, NEXT_DIST_DIR: dist };
    if (ci) env.CI = 'true'; else delete env.CI;
    return spawnSync(process.execPath, [`--require=${preload}`, '-e', source], { env, encoding: 'utf8' });
  };
  await writeFile(file, secret);
  const bad = run(true);
  expect(bad.status).toBe(0);
  expect(bad.stdout.trim()).toBe('SyntaxError');
  expect(bad.stderr).toContain('[playwright-manifest-diagnostic]');
  expect(bad.stderr).not.toContain('do-not-log-this');
  const diagnostic = JSON.parse(bad.stderr.split('[playwright-manifest-diagnostic] ')[1]);
  expect(diagnostic).toMatchObject({ event: 'next_manifest_parse_failure', path: file,
    bytesRead: Buffer.byteLength(secret), bytesNow: Buffer.byteLength(secret),
    sha256: createHash('sha256').update(secret).digest('hex') });
  expect(run(false).stderr).toBe('');
  expect(run(true, file, true).stderr).toBe(''); // JSON parsed elsewhere is not attributed to Next
  const outside = path.join(root, 'other-manifest.json');
  await writeFile(outside, secret);
  expect(run(true, outside).stderr).toBe('');
  await writeFile(file, '{"version":1}');
  const good = run(true);
  expect(good.stdout.trim()).toBe('valid');
  expect(good.stderr).toBe('');
});
