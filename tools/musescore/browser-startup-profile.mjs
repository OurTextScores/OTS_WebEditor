// Phase 8 browser A/B: real worker, local font, following/options on; renderer throttling is a simulation, not a device claim.
import { chromium } from 'playwright';
import { cpus, totalmem } from 'node:os';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { experimentScheduler } from './scheduler-experiment.mjs';
const font = fileURLToPath(new URL('../../public/soundfonts/default.sf3', import.meta.url));
const quantile = (values, q) => {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const at = (sorted.length - 1) * q,
    low = Math.floor(at);
  return sorted[low] + (sorted[Math.min(low + 1, sorted.length - 1)] - sorted[low]) * (at - low);
};
const summary = (values) => ({
  n: values.length,
  p50: quantile(values, 0.5),
  p95: quantile(values, 0.95),
  max: Math.max(...values),
});

export async function profileBrowserStartup(base, output) {
  const browser = await chromium.launch();
  const engineSha256 = createHash('sha256')
    .update(readFileSync(new URL('../../public/webmscore.lib.wasm', import.meta.url)))
    .digest('hex');
  const signature = `${browser.version()}/${engineSha256}`;
  const previous =
    process.env.OTS_PROFILE_RESUME && existsSync(output)
      ? JSON.parse(readFileSync(output, 'utf8'))
      : null;
  if (previous && previous.signature !== signature)
    throw new Error('Cannot resume a profile from different artifacts/browser');
  const runs = previous?.runs ?? [];
  // Early checkpoints recorded the context counter. Preserve that raw total and report each start's delta.
  for (const run of runs) {
    let previousCount = 0;
    for (const start of run.starts) {
      const total = start.underflowsCumulative ?? start.underflows;
      if (start.underflowsCumulative === undefined) start.underflows = total - previousCount;
      start.underflowsCumulative = total;
      previousCount = total;
    }
  }
  const processes = Number(process.env.OTS_PROFILE_CONTEXTS || 3);
  const fixtures = ['bach_orig.mscz', 'men-base.musicxml'];
  try {
    // Warm the dev server's compilation once, outside every measured cold browser/worker context.
    const compilerWarmup = await browser.newContext();
    await compilerWarmup.route(/\.sf[23](?:\?|$)/, (route) =>
      route.fulfill({ path: font, contentType: 'application/octet-stream' }),
    );
    const warmPage = await compilerWarmup.newPage();
    const warmUrl = new URL(base);
    const warmPrefix = warmUrl.pathname.includes('/score-editor') ? '/score-editor' : '';
    warmUrl.searchParams.set('score', `${warmPrefix}/test_scores/bach_orig.mscz`);
    await warmPage.goto(warmUrl.href, { waitUntil: 'domcontentloaded' });
    await warmPage.locator('svg .Note').first().waitFor({ timeout: 90000 });
    await compilerWarmup.close();
    for (const cpuRate of [1, 4])
      for (const reuse of [false, true])
        for (const fixture of fixtures) {
          for (let cold = 0; cold < processes; cold++) {
            if (
              runs.some(
                (run) =>
                  run.fixture === fixture &&
                  run.cpuRate === cpuRate &&
                  run.reuse === reuse &&
                  run.coldContext === cold,
              )
            )
              continue;
            const context = await browser.newContext();
            await context.route(/\.sf[23](?:\?|$)/, (route) =>
              route.fulfill({ path: font, contentType: 'application/octet-stream' }),
            );
            const page = await context.newPage();
            if (cpuRate !== 1) {
              const cdp = await context.newCDPSession(page);
              await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
            }
            await page.addInitScript(() => {
              localStorage.setItem('ots.perf', '1');
              localStorage.setItem('ots-playback-idle-warmup', '0');
              localStorage.setItem('ots-player-click', '0');
              localStorage.setItem('ots-player-countin', '0');
              localStorage.setItem('ots-editor-follow', '1');
              window.__p8 = { starts: [], rpc: [], clicked: 0, sources: new Set(), peakSources: 0 };
              document.addEventListener(
                'click',
                (event) => {
                  if (event.target.closest?.('[data-testid="btn-play"]'))
                    window.__p8.clicked = performance.now();
                },
                true,
              );
              const start = AudioBufferSourceNode.prototype.start;
              AudioBufferSourceNode.prototype.start = function (when = 0, ...rest) {
                window.__p8.context = this.context;
                window.__p8.sources.add(this);
                window.__p8.peakSources = Math.max(
                  window.__p8.peakSources,
                  window.__p8.sources.size,
                );
                this.addEventListener('ended', () => window.__p8.sources.delete(this), {
                  once: true,
                });
                window.__p8.starts.push({
                  wallMs: performance.now(),
                  when,
                  contextTime: this.context.currentTime,
                  baseLatency: this.context.baseLatency,
                  outputLatency: this.context.outputLatency,
                  outputTimestamp: this.context.getOutputTimestamp?.(),
                });
                return start.call(this, when, ...rest);
              };
            });
            const url = new URL(base);
            const prefix = url.pathname.includes('/score-editor') ? '/score-editor' : '';
            url.searchParams.set('score', `${prefix}/test_scores/${fixture}`);
            const began = performance.now();
            await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 120000 });
            await page.locator('svg .Note').first().waitFor({ timeout: 90000 });
            await page.evaluate(
              () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0))),
            );
            const firstPaintMs = performance.now() - began;
            await page.evaluate(async (enabled) => {
              const score = window.__webmscore;
              if (
                !(await score.setPlaybackReuse?.(false)) ||
                !(await score.setPlaybackReuse(enabled))
              )
                throw new Error('Phase 8 native diagnostics missing');
              const originalWarmup = score.warmupPlayback.bind(score);
              window.__p8.restoreWarmup = () => {
                score.warmupPlayback = originalWarmup;
              };
              score.warmupPlayback = async () => false; // Isolate reuse from idle warmup in the A/B.
              if (typeof score.rpc !== 'function')
                throw new Error('Expected the worker engine, not in-process fallback');
              const rpc = score.rpc.bind(score);
              score.rpc = async (method, args, ...rest) => {
                const began = performance.now();
                try {
                  return await rpc(method, args, ...rest);
                } finally {
                  window.__p8.rpc.push({
                    method,
                    ms: performance.now() - began,
                    began,
                    cancel: method === 'processSynthBatch' && !!args?.[2],
                  });
                }
              };
            }, reuse);
            const starts = [];
            const play = async (label) => {
              await page.evaluate(() => {
                window.__p8.starts = [];
                window.__p8.rpc = [];
                window.__p8.peakSources = window.__p8.sources.size;
                window.__p8.underflowsBefore =
                  window.__otsPerf?.counters?.['playback:underflow'] ?? 0;
              });
              await page.getByTestId('btn-play').click();
              await page.waitForFunction(() => window.__p8.starts.length > 0, undefined, {
                timeout: 90000,
              });
              const diagnostic = await page.evaluate(() =>
                window.__webmscore.playbackDiagnostics(),
              );
              await page.waitForTimeout(150);
              const cancelBegan = performance.now();
              await page.getByTestId('btn-stop').click();
              await page.evaluate(() => window.__webmscore.playbackDiagnostics()); // worker fence after cancellation
              const cancellationMs = performance.now() - cancelBegan;
              await page.waitForTimeout(80); // close paint traces
              return page.evaluate(
                ({ label, diagnostic, cancellationMs }) => {
                  const data = window.__p8;
                  const first = data.starts[0];
                  const open = data.rpc.find((rpc) => rpc.method === '_synthAudio');
                  const pull = data.rpc.find(
                    (rpc) => rpc.method === 'processSynthBatch' && !rpc.cancel,
                  );
                  const prepare = window.__otsPerf?.history
                    .filter((trace) => trace.label.startsWith('playback:prepare:'))
                    .at(-1);
                  return {
                    label,
                    clickToFirstScheduleMs: first.wallMs - data.clicked,
                    clickToOpenRpcMs: open ? open.began - data.clicked : null,
                    workerPrepareRpcMs: open?.ms,
                    nativePrepareMs: diagnostic.lastPrepare.totalMs,
                    workerPrepareOverheadMs: open
                      ? Math.max(0, open.ms - diagnostic.lastPrepare.totalMs)
                      : null,
                    firstPullRpcMs: pull?.ms,
                    nativeFirstBatchMs: diagnostic.lastPrepare.firstBatchMs,
                    schedulingAfterFirstPullMs: pull ? first.wallMs - pull.began - pull.ms : null,
                    soundfontReadyMs: prepare?.phases.find((phase) => phase.name === 'soundfont')
                      ?.ms,
                    native: diagnostic.lastPrepare,
                    wasmHeapBytes: diagnostic.wasmHeapBytes,
                    underflows:
                      (window.__otsPerf?.counters?.['playback:underflow'] ?? 0) -
                      data.underflowsBefore,
                    underflowsCumulative: window.__otsPerf?.counters?.['playback:underflow'] ?? 0,
                    retainedBrowserSources: data.sources.size,
                    peakBrowserSources: data.peakSources,
                    jsHeapBytes: performance.memory?.usedJSHeapSize ?? null,
                    cancellationMs,
                    cancelRpcMs: data.rpc.find((rpc) => rpc.cancel)?.ms,
                    scheduledLeadMs: (first.when - first.contextTime) * 1000,
                    baseLatency: first.baseLatency,
                    outputLatency: first.outputLatency,
                    outputTimestamp: first.outputTimestamp,
                    outputObservation: {
                      currentTime: data.context.currentTime,
                      nowMs: performance.now(),
                      stamp: data.context.getOutputTimestamp?.(),
                      baseLatency: data.context.baseLatency,
                      outputLatency: data.context.outputLatency,
                    },
                  };
                },
                { label, diagnostic, cancellationMs },
              );
            };
            for (let repeat = 0; repeat < 4; repeat++)
              starts.push(await play(repeat ? 'warm' : 'cold'));
            const rpcBatches = await page.evaluate(async () => {
              const score = window.__webmscore,
                results = [];
              for (const size of [2, 8, 16]) {
                const iterator = await score.synthAudioBatch(0, size),
                  pulls = [];
                let frames = 0;
                for (let i = 0; i < 24; i++) {
                  const began = performance.now(),
                    batch = await iterator();
                  pulls.push(performance.now() - began);
                  frames += batch.reduce((sum, chunk) => sum + chunk.chunk.byteLength / 8, 0);
                  if (batch.some((chunk) => chunk.done)) break;
                }
                await iterator(true);
                results.push({
                  size,
                  firstPullMs: pulls[0],
                  pullsMs: pulls,
                  frames,
                  wallMsPerAudioSecond: pulls.reduce((sum, ms) => sum + ms, 0) / (frames / 44100),
                });
              }
              return results;
            });
            const schedulerPolicies = reuse && cold === 0 ? await experimentScheduler(page) : null;
            let warmup = null;
            if (reuse && cpuRate === 1 && cold === 0) {
              await page.evaluate(async () => {
                window.__p8.restoreWarmup();
                window.__p8.idleWarmups = 0;
                const score = window.__webmscore;
                const warmup = score.warmupPlayback.bind(score);
                score.warmupPlayback = async () => {
                  const result = await warmup();
                  if (result) window.__p8.idleWarmups += 1;
                  return result;
                };
                localStorage.removeItem('ots-playback-idle-warmup');
                await window.__webmscore.selectAll();
                await window.__webmscore.pitchUp();
              });
              const began = performance.now();
              await page.waitForFunction(() => window.__p8.idleWarmups > 0, undefined, {
                timeout: 15000,
              });
              const diagnostic = await page.evaluate(() =>
                window.__webmscore.playbackDiagnostics(),
              );
              warmup = {
                afterEditIdleMs: performance.now() - began,
                native: diagnostic.lastPrepare,
                play: await play('after-edit-idle-warmup'),
              };
            }
            runs.push({
              fixture,
              cpuRate,
              reuse,
              coldContext: cold,
              firstPaintMs,
              starts,
              rpcBatches,
              schedulerPolicies,
              warmup,
            });
            await context.close();
            writeFileSync(
              output,
              JSON.stringify({ status: 'running', signature, engineSha256, runs }, null, 2) + '\n',
            );
            console.log(
              `profiled ${fixture}, renderer ${cpuRate}x, reuse ${reuse}, context ${cold + 1}/${processes}`,
            );
          }
        }
    const groups = {};
    for (const run of runs)
      for (const start of run.starts) {
        const key = `${run.fixture} / renderer ${run.cpuRate}x / reuse ${run.reuse} / ${start.label}`;
        const group = (groups[key] ??= {
          clickToFirstScheduleMs: [],
          nativePrepareMs: [],
          firstPullRpcMs: [],
          cancellationMs: [],
          wasmHeapBytes: [],
          underflows: [],
        });
        for (const field of Object.keys(group)) group[field].push(start[field]);
      }
    writeFileSync(
      output,
      JSON.stringify(
        {
          status: 'complete',
          signature,
          engineSha256,
          recordedAt: new Date().toISOString(),
          browser: browser.version(),
          device: { cpu: cpus()[0]?.model, logicalCpus: cpus().length, ramBytes: totalmem() },
          scope:
            'Headless Chromium, real worker/Web Audio; font served locally. Four starts per cold context; dev compilation warmed outside measurement. Renderer 4x is simulated, not physical slow-device qualification. Scheduling time is not audible attack time. Small cold n is descriptive.',
          groups: Object.fromEntries(
            Object.entries(groups).map(([key, fields]) => [
              key,
              Object.fromEntries(
                Object.entries(fields).map(([field, values]) => [field, summary(values)]),
              ),
            ]),
          ),
          runs,
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    await browser.close();
  }
}
