// Local, offline preparation benchmark. No network, worker RPC or device-output time is included.
// node tools/musescore/playback-baseline.mjs <bundle-directory> <report.json> [cold-process-count]
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { cpus } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(import.meta.url);
const repo = path.resolve(path.dirname(here), '../..');
const bundle = path.resolve(process.argv[2] || 'webmscore-fork/web-public');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
if (process.argv.includes('--child')) {
  const started = performance.now();
  const W = createRequire(import.meta.url)(path.join(bundle, 'webmscore.nodejs.cjs'));
  await W.ready;
  const bootMs = performance.now() - started;
  const font = readFileSync(path.join(repo, 'public/soundfonts/default.sf3'));
  const install = performance.now();
  await W.setSoundFont(new Uint8Array(font));
  const soundfontInstallMs = performance.now() - install;
  const file = path.join(repo, 'public/test_scores/bach_orig.mscz');
  const load = performance.now();
  const score = await W.load('mscz', new Uint8Array(readFileSync(file)));
  const loadMs = performance.now() - load;
  const samples = [];
  try {
    const xml = await score.saveXml();
    const svgStarted = performance.now();
    const svg = await score.saveSvg(0);
    const svgMs = performance.now() - svgStarted;
    const timeline = await score.playbackTimeline();
    for (const start of [0, 30, 0, 30, 0]) {
      const began = performance.now();
      const iterator = await score.synthAudioBatch(start, 2);
      const prepared = performance.now();
      const batch = await iterator(false);
      const pulled = performance.now();
      await iterator(true);
      samples.push({
        start,
        prepareMs: prepared - began,
        firstPullMs: pulled - prepared,
        cancelMs: performance.now() - pulled,
        firstTime: batch[0].startTime,
        pcmSha256: hash(Buffer.concat(batch.map((result) => Buffer.from(result.chunk)))),
      });
    }
    console.log(
      'OTS_BASELINE=' +
        JSON.stringify({
          bootMs,
          soundfontInstallMs,
          loadMs,
          svgMs,
          version: await W.version(),
          xmlSha256: hash(xml),
          svgSha256: hash(svg),
          timeline,
          samples,
        }),
    );
  } finally {
    await score.destroy();
  }
} else {
  const output = path.resolve(process.argv[3] || '/tmp/ots-playback-baseline.json');
  const count = Number(process.argv[4] || 3);
  if (!Number.isInteger(count) || count < 1 || count > 30)
    throw new Error('cold-process-count must be 1–30');
  const runs = Array.from({ length: count }, () => {
    const out = execFileSync(process.execPath, [here, bundle, '--child'], {
      encoding: 'utf8',
      maxBuffer: 4e6,
    });
    return JSON.parse(
      out
        .split('\n')
        .find((line) => line.startsWith('OTS_BASELINE='))
        .slice(13),
    );
  });
  const report = {
    recordedAt: new Date().toISOString(),
    node: process.version,
    cpu: cpus()[0].model,
    scope:
      'Node in-process; cold process, preinstalled local soundfont; excludes network, worker, scheduling and output latency',
    bundle,
    wasmSha256: hash(readFileSync(path.join(bundle, 'webmscore.lib.wasm'))),
    runs,
  };
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(`Recorded ${count} cold processes and ${count * 5} stream starts in ${output}`);
}
