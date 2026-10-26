import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cpus } from 'node:os';
import { experimentScheduler } from './scheduler-experiment.mjs';
const base = process.argv[2] || 'http://127.0.0.1:3018/';
const output = process.argv[3] || '/tmp/ots-phase8-scheduler-policies.json';
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
      localStorage.setItem('ots-playback-idle-warmup', '0');
      window.__p8 = { starts: [], sources: new Set() };
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        window.__p8.starts.push({ wallMs: performance.now() });
        return start.apply(this, args);
      };
    });
    const url = new URL(base),
      prefix = url.pathname.includes('/score-editor') ? '/score-editor' : '';
    url.searchParams.set('score', `${prefix}/test_scores/${fixture}`);
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    await page.locator('svg .Note').first().waitFor({ timeout: 90000 });
    await page.getByTestId('btn-play').click();
    await page.waitForFunction(() => window.__p8.starts.length > 0, undefined, { timeout: 90000 });
    await page.waitForTimeout(500);
    await page.evaluate(() => window.__otsCommands.run('playback.stop'));
    const cdp = await context.newCDPSession(page);
    for (const cpuRate of [1, 4]) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
      runs.push({ fixture, cpuRate, policies: await experimentScheduler(page) });
    }
    await context.close();
  }
  writeFileSync(
    output,
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        cpu: cpus()[0]?.model,
        browser: browser.version(),
        scope:
          'Warm native preparation, real maintained scheduler in an otherwise idle editor. Two-second PCM window, 400 ms observation before cancellation. One run per policy/fixture/renderer rate; simulated renderer 4x. This is not application-contention or physical-device qualification.',
        runs,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await browser.close();
}
