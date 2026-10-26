// Warm, interleaved A/B at a fixed observation window. Avoid source-retention instrumentation and Playwright's
// actionability wait during Stop; report the actual observation interval and direct command-retirement latency.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
const base = process.argv[2] || 'http://127.0.0.1:3018/';
const output = process.argv[3] || '/tmp/ots-phase8-stress.json';
const font = fileURLToPath(new URL('../../public/soundfonts/default.sf3', import.meta.url));
const browser = await chromium.launch();
const runs = [];
try {
  for (const fixture of ['bach_orig.mscz', 'men-base.musicxml']) {
    const context = await browser.newContext();
    await context.route(/\.sf[23](?:\?|$)/, (route) =>
      route.fulfill({ path: font, contentType: 'application/octet-stream' }),
    );
    const page = await context.newPage();
    await page.addInitScript(() => {
      localStorage.setItem('ots.perf', '1');
      localStorage.setItem('ots-playback-idle-warmup', '0');
      localStorage.setItem('ots-player-click', '0');
      localStorage.setItem('ots-player-countin', '0');
      window.__stress = { first: null, clicked: 0, underflowsBefore: 0 };
      document.addEventListener(
        'click',
        (event) => {
          if (event.target.closest?.('[data-testid="btn-play"]'))
            window.__stress.clicked = performance.now();
        },
        true,
      );
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        window.__stress.first ??= {
          wallMs: performance.now(),
          contextTime: this.context.currentTime,
        };
        return start.apply(this, args);
      };
    });
    const url = new URL(base);
    const prefix = url.pathname.includes('/score-editor') ? '/score-editor' : '';
    url.searchParams.set('score', `${prefix}/test_scores/${fixture}`);
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    await page.locator('svg .Note').first().waitFor({ timeout: 90000 });
    await page.getByTestId('btn-play').click(); // One trusted gesture, font/context/first-map warmup excluded.
    await page.waitForFunction(() => window.__stress.first, undefined, { timeout: 90000 });
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.__otsCommands.run('playback.stop'));
    await page.evaluate(() => window.__webmscore.playbackDiagnostics());
    const cdp = await context.newCDPSession(page);
    for (const cpuRate of [1, 4]) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
      for (const reuse of [false, true, true, false, false, true]) {
        await page.evaluate(async (enabled) => {
          await window.__webmscore.setPlaybackReuse(enabled);
          window.__stress.first = null;
          window.__stress.underflowsBefore =
            window.__otsPerf?.counters?.['playback:underflow'] ?? 0;
          document.querySelector('[data-testid="btn-play"]').click();
        }, reuse);
        await page.waitForFunction(() => window.__stress.first, undefined, { timeout: 90000 });
        await page.waitForTimeout(1500);
        const result = await page.evaluate(async () => {
          const beforeStop = performance.now();
          const underflows =
            (window.__otsPerf?.counters?.['playback:underflow'] ?? 0) -
            window.__stress.underflowsBefore;
          await window.__otsCommands.run('playback.stop');
          const retired = performance.now();
          const native = await window.__webmscore.playbackDiagnostics();
          const observationMs = beforeStop - window.__stress.first.wallMs;
          return {
            clickToFirstScheduleMs: window.__stress.first.wallMs - window.__stress.clicked,
            observationMs,
            underflows,
            underflowsPerSecond: underflows / (observationMs / 1000),
            commandRetirementMs: retired - beforeStop,
            native: native.lastPrepare,
            wasmHeapBytes: native.wasmHeapBytes,
          };
        });
        runs.push({ fixture, cpuRate, reuse, ...result });
      }
    }
    await context.close();
    console.log(`profiled interleaved ${fixture}`);
  }
  writeFileSync(
    output,
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        cpu: cpus()[0]?.model,
        browser: browser.version(),
        scope:
          'Final editor with default measure shading, notehead highlighting off. Warm worker/font/maps; interleaved fresh/reuse. Renderer 4x is simulated. At least 1500 ms after first scheduling, actual interval reported. Direct stop-command retirement excludes Playwright actionability wait. Underruns are before Stop; no source-retention instrumentation.',
        runs,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await browser.close();
}
