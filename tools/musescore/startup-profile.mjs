// Phase 8 startup profile: where a playback start spends its time, per native stage, plus synthesis onset lag.
// Offline and in-process: no network, worker RPC, browser scheduling or output-device latency is included.
//   node tools/musescore/startup-profile.mjs <bundle-directory> <report.json> [cold-process-count]
// <bundle-directory> is a bundle.mjs output (it needs webmscore.nodejs.test.cjs for the native diagnostics).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { cpus, totalmem } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(import.meta.url);
const repo = path.resolve(path.dirname(here), '../..');
const bundle = path.resolve(process.argv[2] || 'webmscore-fork/web-public');
const SAMPLE_RATE = 44100;
const FRAMES = 512;

const FIXTURES = [
  { name: 'bach', format: 'mscz', file: 'public/test_scores/bach_orig.mscz' },
  {
    name: 'men-base (4 parts, 272 measures)',
    format: 'musicxml',
    file: 'public/test_scores/men-base.musicxml',
  },
];

// One instrument, quarter notes at 60 bpm: event times are exactly 0, 1000, 2000, … ms.
const onsetScore = (program, name) =>
  new TextEncoder().encode(`<?xml version="1.0"?><score-partwise version="4.0">
<part-list><score-part id="P1"><part-name>${name}</part-name><score-instrument id="I1"><instrument-name>${name}</instrument-name></score-instrument><midi-instrument id="I1"><midi-program>${program}</midi-program></midi-instrument></score-part></part-list>
<part id="P1">${Array.from({ length: 8 }, (_, index) => `<measure number="${index + 1}">${index === 0 ? `<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>60</per-minute></metronome></direction-type><sound tempo="60"/></direction>` : ''}<note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note><note><rest/><duration>3</duration><type>half</type><dot/></note></measure>`).join('')}</part></score-partwise>`);
const ONSET_INSTRUMENTS = [
  [1, 'Piano'],
  [41, 'Violin'],
  [74, 'Flute'],
  [57, 'Trumpet'],
];

const quantile = (values, q) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const at = (sorted.length - 1) * q;
  const low = Math.floor(at);
  return sorted[low] + (sorted[Math.min(low + 1, sorted.length - 1)] - sorted[low]) * (at - low);
};
const summary = (values) => ({
  n: values.length,
  p50: quantile(values, 0.5),
  p95: quantile(values, 0.95),
  max: values.length ? Math.max(...values) : null,
});

async function child() {
  const W = createRequire(import.meta.url)(path.join(bundle, 'webmscore.nodejs.test.cjs'));
  const started = performance.now();
  await W.ready;
  const bootMs = performance.now() - started;
  const Module = W.__testModule;
  Module.ccall('setPlaybackReuse', null, ['boolean'], [process.env.MS47_PROFILE_REUSE !== '0']);
  const diagnostics = () => {
    const ptr = Module.ccall('playbackDiagnostics', 'number', [], []);
    try {
      const length = new DataView(Module.HEAPU8.buffer).getUint32(ptr + 4, true);
      return JSON.parse(
        new TextDecoder().decode(Module.HEAPU8.subarray(ptr + 8, ptr + 8 + length)),
      );
    } finally {
      Module._free(ptr);
    }
  };
  const fontStarted = performance.now();
  await W.setSoundFont(
    new Uint8Array(readFileSync(path.join(repo, 'public/soundfonts/default.sf3'))),
  );
  const soundfontInstallMs = performance.now() - fontStarted;

  // One start: open the stream, pull `pulls` batches of `batchSize`, cancel. Native stages from diagnostics.
  const start = async (score, startSeconds, label, { batchSize = 2, pulls = 40 } = {}) => {
    const began = performance.now();
    const iterator = await score.synthAudioBatch(startSeconds, batchSize);
    const openedMs = performance.now() - began;
    const native = diagnostics().lastPrepare;
    const pullMs = [];
    let frames = 0;
    for (let i = 0; i < pulls; i++) {
      const t = performance.now();
      const batch = await iterator(false);
      pullMs.push(performance.now() - t);
      frames += batch.reduce((sum, r) => sum + r.chunk.byteLength / 8, 0);
      if (batch.some((r) => r.done)) break;
    }
    const c = performance.now();
    await iterator(true);
    const renderedSeconds = frames / SAMPLE_RATE;
    const pullTotal = pullMs.reduce((a, b) => a + b, 0);
    return {
      label,
      startSeconds,
      batchSize,
      openMs: openedMs,
      native,
      firstPullMs: pullMs[0],
      pullP50Ms: quantile(pullMs, 0.5),
      // Wall time per second of audio while pulling: below 1 means faster than real time.
      renderCostPerAudioSecond: renderedSeconds > 0 ? pullTotal / 1000 / renderedSeconds : null,
      cancelMs: performance.now() - c,
    };
  };

  const fixtures = [];
  for (const fixture of FIXTURES) {
    const bytes = new Uint8Array(readFileSync(path.join(repo, fixture.file)));
    const l = performance.now();
    const score = await W.load(fixture.format, bytes);
    const loadMs = performance.now() - l;
    try {
      const s = performance.now();
      await score.saveSvg(0);
      const firstPageMs = performance.now() - s;
      const t = performance.now();
      const timeline = await score.playbackTimeline();
      const timelineMs = performance.now() - t;
      const f = performance.now();
      const map = await score.playbackFollowMap();
      const followMapMs = performance.now() - f;
      const later = Math.min(30, Math.max(0, timeline.durationMs / 1000 - 10));
      const starts = [];
      starts.push(await start(score, 0, 'first'));
      starts.push(await start(score, 0, 'repeat-same'));
      starts.push(await start(score, later, 'seek'));
      await score.setPlaybackOptions({ tempoMultiplier: 0.75, playRepeats: true });
      starts.push(await start(score, 0, 'after-speed-change'));
      await score.setPlaybackOptions({ tempoMultiplier: 1, playRepeats: true });
      for (const batchSize of [2, 8, 16]) {
        starts.push(
          await start(score, later, `batch-${batchSize}`, {
            batchSize,
            pulls: Math.ceil(80 / batchSize),
          }),
        );
      }
      fixtures.push({
        name: fixture.name,
        loadMs,
        firstPageMs,
        timelineMs,
        followMapMs,
        followIntervals: map?.intervals.length ?? null,
        durationMs: timeline.durationMs,
        starts,
      });
    } finally {
      await score.destroy();
    }
  }

  // Onset lag: first sample above 2% of the note's peak, after each event time.
  const onsets = [];
  for (const [program, name] of ONSET_INSTRUMENTS) {
    const score = await W.load('musicxml', onsetScore(program, name));
    try {
      const iterator = await score.synthAudioBatch(0, 64);
      const left = [];
      for (;;) {
        const batch = await iterator(false);
        for (const r of batch) {
          const samples = new Float32Array(
            r.chunk.buffer,
            r.chunk.byteOffset,
            r.chunk.byteLength / 4,
          );
          for (let i = 0; i < Math.min(FRAMES, samples.length / 2); i++)
            left.push(Math.abs(samples[i]));
        }
        if (batch.some((r) => r.done) || left.length > SAMPLE_RATE * 35) break;
      }
      await iterator(true);
      const lags = [];
      for (let beat = 0; beat < 8; beat++) {
        const from = beat * 4 * SAMPLE_RATE;
        const to = Math.min(left.length, from + SAMPLE_RATE);
        let peak = 0;
        for (let i = from; i < to; i++) peak = Math.max(peak, left[i]);
        // Start the search after the previous note's tail has decayed below the threshold, if it overlaps.
        let i = from;
        const threshold = peak * 0.02;
        if (beat > 0) while (i < to && left[i] > threshold) i++;
        while (i < to && left[i] <= threshold) i++;
        if (peak > 1e-4 && i < to) lags.push(((i - from) / SAMPLE_RATE) * 1000);
      }
      onsets.push({ instrument: name, program, lagsMs: lags, ...summary(lags) });
    } finally {
      await score.destroy();
    }
  }
  console.log(
    'OTS_PROFILE=' +
      JSON.stringify({
        bootMs,
        soundfontInstallMs,
        version: await W.version(),
        memoryBytes: Module.HEAPU8.length,
        fixtures,
        onsets,
      }),
  );
}

if (process.argv.includes('--child')) {
  await child();
} else {
  const output = path.resolve(process.argv[3] || '/tmp/ots-startup-profile.json');
  const count = Number(process.argv[4] || 3);
  if (!Number.isInteger(count) || count < 1 || count > 30)
    throw new Error('cold-process-count must be 1–30');
  const runs = Array.from({ length: count }, () => {
    const out = execFileSync(process.execPath, [here, bundle, '--child'], {
      encoding: 'utf8',
      maxBuffer: 16e6,
    });
    return JSON.parse(
      out
        .split('\n')
        .find((line) => line.startsWith('OTS_PROFILE='))
        .slice(12),
    );
  });
  const aggregate = {};
  for (const run of runs) {
    for (const fixture of run.fixtures) {
      for (const s of fixture.starts) {
        const key = `${fixture.name} / ${s.label}`;
        aggregate[key] ??= {
          openMs: [],
          modelLoadMs: [],
          tracksMs: [],
          seekMs: [],
          firstPullMs: [],
          renderCost: [],
        };
        aggregate[key].openMs.push(s.openMs);
        aggregate[key].modelLoadMs.push(s.native.modelLoadMs);
        aggregate[key].tracksMs.push(s.native.tracksMs);
        aggregate[key].seekMs.push(s.native.seekMs);
        aggregate[key].firstPullMs.push(s.firstPullMs);
        aggregate[key].renderCost.push(s.renderCostPerAudioSecond);
      }
    }
  }
  const report = {
    recordedAt: new Date().toISOString(),
    node: process.version,
    cpu: cpus()[0].model,
    memoryGiB: Math.round(totalmem() / 2 ** 30),
    scope:
      'Node in-process, one cold process per run; native stage times from playbackDiagnostics().lastPrepare; excludes network, worker RPC, Web Audio scheduling and device output',
    bundle,
    reuseEnabled: process.env.MS47_PROFILE_REUSE !== '0',
    onsetMethod:
      'Isolated quarter notes at 60 bpm, three beats rest between strikes; first sample above 2% of that note peak. Event times 0/4000/... ms; no MP3 encoder.',
    summary: Object.fromEntries(
      Object.entries(aggregate).map(([key, value]) => [
        key,
        Object.fromEntries(
          Object.entries(value).map(([metric, values]) => [metric, summary(values)]),
        ),
      ]),
    ),
    onsets: runs[0].onsets,
    runs,
  };
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(`Recorded ${count} cold processes in ${output}`);
}
