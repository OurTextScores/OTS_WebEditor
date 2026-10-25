// Run against an existing dev or static server. Real worker + Web Audio, local fixture/soundfont.
// node tools/musescore/browser-baseline.mjs <base-url> <report.json>
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const base = process.argv[2] || 'http://127.0.0.1:3018/';
const output = process.argv[3] || '/tmp/ots-browser-playback.json';
const font = fileURLToPath(new URL('../../public/soundfonts/default.sf3', import.meta.url));
const browser = await chromium.launch();
try {
  const runs = [];
  for (let cold = 0; cold < 3; cold++) {
    const context = await browser.newContext();
    await context.route(/\.sf[23](?:\?|$)/, (route) =>
      route.fulfill({ path: font, contentType: 'application/octet-stream' }),
    );
    const page = await context.newPage();
    await page.addInitScript(() => {
      localStorage.setItem('ots.perf', '1');
      window.__baselineSchedules = [];
      const original = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (when = 0, ...rest) {
        window.__baselineSchedules.push({
          wallMs: performance.now(),
          when,
          contextTime: this.context.currentTime,
        });
        return original.call(this, when, ...rest);
      };
    });
    const began = performance.now();
    const url = new URL(base);
    const scorePrefix = url.pathname.includes('/score-editor') ? '/score-editor' : '';
    url.searchParams.set('score', `${scorePrefix}/test_scores/bach_orig.mscz`);
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.locator('svg .Note').first().waitFor({ timeout: 90_000 });
    const readyMs = performance.now() - began;
    const starts = [];
    for (let warm = 0; warm < 2; warm++) {
      const clickedAt = await page.evaluate(() => {
        window.__baselineSchedules = [];
        return performance.now();
      });
      await page.getByTestId('btn-play').click();
      await page.waitForFunction(() => window.__baselineSchedules.length > 0, undefined, {
        timeout: 90_000,
      });
      await page.getByTestId('btn-stop').click();
      await page.waitForTimeout(100);
      starts.push(
        await page.evaluate(
          (clickedAt) => ({
            clickToFirstScheduleMs: window.__baselineSchedules[0].wallMs - clickedAt,
            scheduledLeadMs:
              (window.__baselineSchedules[0].when - window.__baselineSchedules[0].contextTime) *
              1000,
            traces:
              window.__otsPerf?.history.filter((trace) => trace.label.startsWith('playback:')) ??
              [],
          }),
          clickedAt,
        ),
      );
    }
    runs.push({ coldContext: cold, readyMs, starts });
    await context.close();
  }
  writeFileSync(
    output,
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        browser: browser.version(),
        scope:
          'Headless Chromium, real worker/Web Audio, new browser context per run, local soundfont served by route; dev compile/cache and host contention affect timing; not audible device latency',
        base,
        runs,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`Recorded browser baseline in ${output}`);
} finally {
  await browser.close();
}
