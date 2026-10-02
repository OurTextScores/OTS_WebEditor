import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from 'playwright/test';

/**
 * How long an edit takes on a long score, from the key (or pointer) to the first paint of the
 * new page. The editor records each edit's phases in `window.__otsPerf` (lib/perf-trace.ts);
 * this spec drives the edits and reads them back.
 *
 * Numbers are from the dev server, so JS is slower than a production build; the engine phases
 * (relayout, saveSvg) are not. The budgets are starting targets (§W7.1 Acceptance).
 */

const SCORE = resolve(__dirname, '../../test_scores/faure.mscz');
const ENFORCE = process.env.PERF_ENFORCE === '1';

interface Trace {
  label: string;
  startedAt: number;
  endedAt: number;
  totalMs: number;
  phases: { name: string; ms: number }[];
}
type PerfWindow = Window & {
  __otsPerf?: { history: Trace[] };
  __inputAt?: number[];
};

const history = (page: Page) =>
  page.evaluate(() => (window as PerfWindow).__otsPerf?.history ?? []);

const summary = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    min: Math.round(sorted[0] ?? 0),
    median: Math.round(sorted[Math.floor(sorted.length / 2)] ?? 0),
    max: Math.round(sorted[sorted.length - 1] ?? 0),
  };
};

const results: Record<string, unknown> = {};

async function load(page: Page) {
  await page.goto('/');
  await page.getByTestId('open-score-input').setInputFiles(SCORE);
  await page
    .locator('svg .Note')
    .first()
    .waitFor({ timeout: 5 * 60 * 1000 });
  await page.waitForFunction(
    () =>
      (
        window as unknown as { __otsCommands?: { list(): { id: string; enabled: boolean }[] } }
      ).__otsCommands
        ?.list()
        .some((c) => c.id === 'edit.pitch.up' || c.id === 'edit.delete'),
    undefined,
    { timeout: 60_000 },
  );
  // Timestamps of the input that starts each edit, taken in the capture phase.
  await page.evaluate(() => {
    const w = window as PerfWindow;
    w.__inputAt = [];
    window.addEventListener('keydown', () => w.__inputAt!.push(performance.now()), true);
    window.addEventListener('pointermove', () => w.__inputAt!.push(performance.now()), true);
  });
  await page.locator('svg .Note').nth(3).click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 30_000 });
}

test.afterAll(() => {
  const dir = resolve(__dirname, '../../test-results/perf');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    resolve(dir, `edit-latency-${new Date().toISOString().replace(/[:.]/g, '-')}.json`),
    JSON.stringify(results, null, 2),
  );
  console.log('EDIT LATENCY', JSON.stringify(results, null, 2));
});

test('single-note pitch change, keystroke to paint', async ({ page }) => {
  await load(page);
  const latencies: number[] = [];
  const phaseTotals: Record<string, number[]> = {};
  for (let i = 0; i < 5; i += 1) {
    const before = (await history(page)).length;
    await page.evaluate(() => ((window as PerfWindow).__inputAt = []));
    await page.keyboard.press(i % 2 === 0 ? 'ArrowUp' : 'ArrowDown');
    await expect
      .poll(async () => (await history(page)).length, { timeout: 60_000 })
      .toBeGreaterThan(before);
    const [trace] = (await history(page)).slice(-1);
    const [inputAt] = await page.evaluate(() => (window as PerfWindow).__inputAt ?? []);
    latencies.push(trace.endedAt - inputAt);
    for (const phase of trace.phases) (phaseTotals[phase.name] ??= []).push(phase.ms);
  }
  results.pitchChange = {
    keystrokeToPaintMs: summary(latencies),
    phasesMs: Object.fromEntries(Object.entries(phaseTotals).map(([k, v]) => [k, summary(v)])),
  };
  if (ENFORCE) expect(summary(latencies).median).toBeLessThanOrEqual(150);
});

test('10-key burst, input to paint', async ({ page }) => {
  await load(page);
  const before = (await history(page)).length;
  await page.evaluate(() => ((window as PerfWindow).__inputAt = []));
  for (let i = 0; i < 10; i += 1) await page.keyboard.press('ArrowUp');
  await expect
    .poll(async () => (await history(page)).length, { timeout: 120_000 })
    .toBeGreaterThanOrEqual(before + 10);
  const traces = (await history(page)).slice(before);
  const [firstInput] = await page.evaluate(() => (window as PerfWindow).__inputAt ?? []);
  results.burst = {
    keys: 10,
    firstKeyToLastPaintMs: Math.round(traces[traces.length - 1].endedAt - firstInput),
    perEditTotalMs: summary(traces.map((t) => t.totalMs)),
  };
});

test('drag-repitch step, pointer move to paint', async ({ page }) => {
  await load(page);
  const note = await page.locator('svg .Note').nth(3).boundingBox();
  if (!note) throw new Error('no note box');
  const x = note.x + note.width / 2;
  const y = note.y + note.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  const before = (await history(page)).length;
  await page.evaluate(() => ((window as PerfWindow).__inputAt = []));
  for (let step = 1; step <= 12; step += 1) {
    await page.mouse.move(x, y - step * 3, { steps: 2 });
    await page.waitForTimeout(150);
  }
  await page.mouse.up();
  await page.waitForTimeout(1000);
  const traces = (await history(page)).slice(before).filter((t) => t.label === 'drag step');
  results.dragStep = {
    steps: traces.length,
    frameToPaintMs: summary(traces.map((t) => t.totalMs)),
    phasesMs: Object.fromEntries(
      ['dragBegin', 'drag', 'saveSvg', 'sanitize', 'innerHTML', 'paint'].map((name) => [
        name,
        summary(traces.map((t) => t.phases.find((p) => p.name === name)?.ms ?? 0)),
      ]),
    ),
  };
  expect(traces.length).toBeGreaterThan(0);
  if (ENFORCE) expect(summary(traces.map((t) => t.totalMs)).median).toBeLessThanOrEqual(100);
});
