import { readdirSync, readFileSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { cpus, totalmem } from 'node:os';
import { basename, resolve } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from 'playwright/test';

/**
 * Load time and resource use (roadmap E05): for a small, a long and a large score, how long the editor takes to open
 * and draw the first page (with the engine starting, and again with it started), what it downloads, how much memory
 * the browser uses (all its processes, so the engine's worker and WASM heap too), and how long page turns, edits,
 * exports and starting playback take.
 *
 * It drives only the real UI, and reads the editor's `window.__otsPerf` traces or times DOM changes in the page, so it
 * runs against a production build as well as the dev server (the test hooks are dev-only; the traces are on in
 * production when `localStorage['ots.perf']` is `1`). For a production build:
 *   npm run build && npx next start -p 3300 & PLAYWRIGHT_PORT=3300 npm run test:perf -- load-resources
 * The browser is launched here (not the fixture) so its processes can be measured, from /proc (Linux only; elsewhere
 * memory is left out). Results go to test-results/perf/ and the console. No budgets are enforced: the gate's
 * thresholds are to be agreed from these numbers (roadmap E05).
 */

const FIXTURES = [
  { name: 'bach_orig.mscz', note: 'small: three pages' },
  { name: 'faure.mscz', note: 'long: 32 pages' },
  { name: 'schubert-4.mscz', note: 'large: orchestral, 14 pages' },
];
const SCORE_DIR = resolve(__dirname, '../../test_scores');
const PORT = Number.parseInt(process.env.PLAYWRIGHT_PORT || '3000', 10);
const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;
/** A new page SVG, not the one marked before the action (installed by innerHTML: a new element for each page). */
const NEW_PAGE_SVG = `(() => {
  const svg = document.querySelector('[data-testid="svg-container"] > svg');
  return !!svg && !svg.dataset.perfOld;
})()`;
/** The same, with notes in it: a score's first page drawn (some pages have none: bach_orig's second is text only). */
const NEW_PAGE_SVG_WITH_NOTES = `(() => {
  const svg = document.querySelector('[data-testid="svg-container"] > svg');
  return !!svg && !svg.dataset.perfOld && !!svg.querySelector('.Note');
})()`;

interface Trace {
  label: string;
  startedAt: number;
  endedAt: number;
  totalMs: number;
  phases: { name: string; ms: number }[];
}
type Timing = { start?: number; end?: number };
type PerfWindow = Window & {
  __otsPerf?: { history: Trace[] };
  __firstNoteAt?: number;
  __timing?: Timing;
};

const round = (value: number) => Math.round(value);
const mb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 10) / 10;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return round(sorted[Math.floor(sorted.length / 2)] ?? 0);
};

/**
 * Proportional set size of every descendant of this test worker, in bytes (Linux), or null. The browser launched here
 * is the worker's only child process tree (the web server belongs to the Playwright runner).
 */
function treePss(): number | null {
  const rootPid = process.pid;
  if (process.platform !== 'linux') return null;
  const parents = new Map<number, number>();
  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      // The command name is in parentheses and may contain spaces: the fields after it are fixed.
      const stat = readFileSync(`/proc/${entry}/stat`, 'utf8');
      const ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
      parents.set(Number(entry), ppid);
    } catch {
      // Exited meanwhile
    }
  }
  const inTree = (pid: number): boolean => {
    for (let at: number | undefined = pid; at && at > 1; at = parents.get(at))
      if (at === rootPid) return true;
    return false;
  };
  let total = 0;
  for (const pid of parents.keys()) {
    if (pid === rootPid || !inTree(pid)) continue;
    try {
      const rollup = readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8');
      total += Number(rollup.match(/^Pss:\s+(\d+) kB/m)?.[1] ?? 0) * 1024;
    } catch {
      // Exited, or not readable
    }
  }
  return total;
}

const traces = (page: Page) => page.evaluate(() => (window as PerfWindow).__otsPerf?.history ?? []);

/** Runs `act`, then waits for the editor to finish the traces it started, and returns them. */
async function traced(page: Page, act: () => Promise<unknown>, until: (fresh: Trace[]) => boolean) {
  const before = (await traces(page)).length;
  await act();
  let fresh: Trace[] = [];
  try {
    await expect
      .poll(async () => until((fresh = (await traces(page)).slice(before))), { timeout: 120_000 })
      .toBe(true);
  } catch (error) {
    const seen = fresh.map(
      (trace) => `${trace.label} [${trace.phases.map((phase) => phase.name).join(', ')}]`,
    );
    throw new Error(`Traces after the action: ${seen.join('; ') || 'none'} (of ${before} before)`, {
      cause: error,
    });
  }
  return fresh;
}

/**
 * Times `act`, on the page's clock: from `event` on `trigger` to the first frame after the expression `done` holds
 * (checked on every DOM change). For what the traces do not cover: page turns (the page navigator draws from its own
 * cache), opening a score, and starting playback. The page's SVG is marked first, so `NEW_PAGE_SVG` means a new one.
 */
async function timed(
  page: Page,
  trigger: string,
  event: string,
  done: string,
  act: () => Promise<unknown>,
) {
  await page.evaluate(
    ([trigger, event, done]) => {
      const w = window as PerfWindow;
      // The expression is this spec's own (`NEW_PAGE_SVG` and the like), evaluated in the page under test.
      const isDone = new Function(`return (${done})`) as () => boolean;
      const svg = document.querySelector<SVGSVGElement>('[data-testid="svg-container"] > svg');
      if (svg) svg.dataset.perfOld = '1';
      w.__timing = {};
      document.querySelector(trigger)?.addEventListener(
        event,
        () => {
          w.__timing!.start = performance.now();
        },
        { capture: true, once: true },
      );
      const observer = new MutationObserver(() => {
        if (w.__timing?.start === undefined || !isDone()) return;
        observer.disconnect();
        requestAnimationFrame(() => (w.__timing!.end = performance.now()));
      });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    },
    [trigger, event, done],
  );
  await act();
  let timing: Timing = {};
  try {
    await expect
      .poll(
        async () =>
          (timing = await page.evaluate(() => (window as PerfWindow).__timing ?? {})).end !==
          undefined,
        { timeout: 120_000 },
      )
      .toBe(true);
  } catch (error) {
    const state = await page.evaluate(() => ({
      page: document.querySelector<HTMLSelectElement>('[data-testid="page-select"]')?.value,
      oldSvgShown: !!document.querySelector<SVGSVGElement>(
        '[data-testid="svg-container"] > svg[data-perf-old]',
      ),
      shown: (() => {
        const svg = document.querySelector('[data-testid="svg-container"] > svg');
        return svg
          ? `${svg.querySelectorAll('.Note').length} notes, ${svg.childElementCount} children`
          : 'no page SVG';
      })(),
    }));
    throw new Error(
      `${trigger} ${event}: ${timing.start === undefined ? 'no event seen' : 'never done'}; ${JSON.stringify(state)}`,
      { cause: error },
    );
  }
  return round(timing.end! - timing.start!);
}

const turnPage = (page: Page, index: number) =>
  timed(page, '[data-testid="page-select"]', 'change', NEW_PAGE_SVG, () =>
    page.getByTestId('page-select').selectOption(String(index)),
  );

async function exportVia(page: Page, command: string) {
  const started = Date.now();
  const download = page.waitForEvent('download', { timeout: 300_000 });
  await page.getByTestId('menu-file').click();
  await page.getByRole('menuitem', { name: 'Export' }).click();
  await page.getByTestId(`menu-item-${command}`).click();
  const file = await download;
  const ms = Date.now() - started;
  const path = await file.path();
  return { ms, bytes: path ? statSync(path).size : null };
}

const results: Record<string, unknown> = {
  machine: {
    cpu: cpus()[0]?.model ?? null,
    cores: cpus().length,
    memoryGb: Math.round(totalmem() / 1024 ** 3),
    baseUrl: BASE_URL,
  },
};

test.describe.configure({ mode: 'serial' });

test.afterAll(() => {
  const dir = resolve(__dirname, '../../test-results/perf');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    resolve(dir, `load-resources-${new Date().toISOString().replace(/[:.]/g, '-')}.json`),
    JSON.stringify(results, null, 2),
  );
  console.log('LOAD AND RESOURCES', JSON.stringify(results, null, 2));
});

for (const fixture of FIXTURES) {
  test(`open and use ${fixture.name} (${fixture.note})`, async () => {
    const file = resolve(SCORE_DIR, fixture.name);
    const browser: Browser = await chromium.launch({ headless: true });
    let peakPss = 0;
    const sampler = setInterval(() => (peakPss = Math.max(peakPss, treePss() ?? 0)), 250);
    try {
      // A new context: an empty HTTP cache, so this is a first visit.
      const context = await browser.newContext({ baseURL: BASE_URL, acceptDownloads: true });
      await context.addInitScript(() => {
        try {
          window.localStorage.setItem('ots.perf', '1');
        } catch {
          // Storage blocked: no traces
        }
        // When the first note is in the document (the first page drawn), on the page's clock.
        new MutationObserver((_, observer) => {
          if (!document.querySelector('[data-testid="svg-container"] svg .Note')) return;
          (window as PerfWindow).__firstNoteAt = performance.now();
          observer.disconnect();
        }).observe(document, { childList: true, subtree: true });
      });
      const downloaded: Record<string, number> = {};
      const files = new Map<string, number>();
      context.on('requestfinished', (request) => {
        void request
          .sizes()
          .then((sizes) => {
            const path = new URL(request.url()).pathname;
            const bytes = sizes.responseBodySize + sizes.responseHeadersSize;
            const kind = /\.wasm$/.test(path)
              ? 'wasm'
              : /\.(data|sf2|sf3)$/.test(path) || /soundfont/i.test(path)
                ? 'engineData'
                : /\.(woff2?|otf|ttf)$/.test(path)
                  ? 'fonts'
                  : /\.m?js$/.test(path)
                    ? 'js'
                    : 'other';
            downloaded[kind] = (downloaded[kind] ?? 0) + bytes;
            const name = path.split('/').pop() || path;
            files.set(name, (files.get(name) ?? 0) + bytes);
          })
          .catch(() => {});
      });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Performance.enable');
      const jsHeap = async () => {
        const { metrics } = await cdp.send('Performance.getMetrics');
        return metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value ?? 0;
      };

      // The browser on an empty page, to subtract from what the editor uses.
      await page.goto('about:blank');
      await page.waitForTimeout(1000);
      const emptyBrowserPss = treePss() ?? 0;

      // Open the editor, then the score: the first open starts the engine.
      await page.goto('/');
      await page.getByTestId('open-score-input').waitFor({ state: 'attached', timeout: 120_000 });
      const shellReadyMs = await page.evaluate(() => performance.now());
      const openedAt = await page.evaluate(() => performance.now());
      await page.getByTestId('open-score-input').setInputFiles(file);
      await page
        .locator('[data-testid="svg-container"] svg .Note')
        .first()
        .waitFor({ timeout: 5 * 60 * 1000 });
      const firstNoteAt = await page.evaluate(
        () => (window as PerfWindow).__firstNoteAt ?? performance.now(),
      );

      // Every page counted (pages are laid out lazily): when the count stops changing.
      const pageOptions = page.getByTestId('page-select').locator('option');
      let pages = await pageOptions.count();
      let pagesSettledAt = await page.evaluate(() => performance.now());
      for (let quiet = 0; quiet < 12;) {
        await page.waitForTimeout(250);
        const now = await pageOptions.count();
        if (now !== pages) {
          pages = now;
          pagesSettledAt = await page.evaluate(() => performance.now());
          quiet = 0;
        } else quiet += 1;
      }
      const afterLoad = { browserPssMb: mb(treePss() ?? 0), pageJsHeapMb: mb(await jsHeap()) };
      // The engine's own heap, where the dev-only score handle is there (not in a production build).
      const wasmHeap = await page.evaluate(async () => {
        const score = (
          window as Window & {
            __webmscore?: { memoryInfo?: () => Promise<{ wasmHeapBytes: number }> };
          }
        ).__webmscore;
        return (await score?.memoryInfo?.())?.wasmHeapBytes ?? null;
      });

      // The same score opened again, with the engine started: the score's own load and first layout.
      const reopenToFirstPageMs = await timed(
        page,
        '[data-testid="open-score-input"]',
        'change',
        NEW_PAGE_SVG_WITH_NOTES,
        () => page.getByTestId('open-score-input').setInputFiles(file),
      );
      await page.waitForTimeout(3000);

      // Page turns: the last page and the middle are first visits; the first page is back from the cache.
      const turns: number[] = [];
      if (pages > 1) {
        for (const index of [pages - 1, 0, Math.floor(pages / 2)])
          turns.push(await turnPage(page, index));
        await turnPage(page, 0);
        await page.waitForTimeout(1000);
      }

      // Edits on a note of the shown page: pitch up and down, then delete and undo.
      await page.locator('[data-testid="svg-container"] svg .Note').nth(3).click();
      await page.getByTestId('selection-overlay').waitFor({ timeout: 60_000 });
      const pitch: number[] = [];
      const pitchPhases: Record<string, number[]> = {};
      for (let i = 0; i < 6; i += 1) {
        const label = i % 2 === 0 ? 'raise pitch' : 'lower pitch';
        const fresh = await traced(
          page,
          () => page.keyboard.press(i % 2 === 0 ? 'ArrowUp' : 'ArrowDown'),
          (list) => list.some((trace) => trace.label === label),
        );
        const trace = fresh.find((item) => item.label === label)!;
        pitch.push(trace.totalMs);
        for (const phase of trace.phases) (pitchPhases[phase.name] ??= []).push(phase.ms);
      }
      // An edit's trace, not the audio preview's (`playback:*`).
      const isEdit = (trace: Trace) =>
        !trace.label.startsWith('playback:') &&
        trace.phases.some((phase) => phase.name === 'paint');
      const edit = async (key: string) => {
        const fresh = await traced(
          page,
          () => page.keyboard.press(key),
          (list) => list.some(isEdit),
        );
        const trace = fresh.find(isEdit)!;
        return { label: trace.label, ms: round(trace.totalMs) };
      };
      const del = await edit('Delete');
      const undo = await edit('ControlOrMeta+z');

      // Exports, as a user runs them (menu to download).
      const exports = {
        pdf: await exportVia(page, 'file.export.pdf'),
        musicxml: await exportVia(page, 'file.export.musicxml'),
        mscz: await exportVia(page, 'file.export.mscz'),
      };

      // Playback: Play to the playback cursor on the score.
      await page.keyboard.press('Escape');
      const playToCursorMs = await timed(
        page,
        '[data-testid="btn-play"]',
        'click',
        `!!document.querySelector('[data-testid="playback-cursor"]')`,
        () => page.getByTestId('btn-play').click(),
      );
      await page.waitForTimeout(2000);
      await page.getByTestId('btn-play').click();
      // Preparing and starting the stream (not the edit previews' streams and cancels).
      const playbackTraces = (await traces(page))
        .filter((trace) => /^playback:(prepare|stream:(?!preview))/.test(trace.label))
        .map((trace) => ({ label: trace.label, ms: round(trace.totalMs) }));

      results[fixture.name] = {
        note: fixture.note,
        fileBytes: statSync(file).size,
        pages,
        load: {
          navigationToShellMs: round(shellReadyMs),
          openToFirstPageMs: round(firstNoteAt - openedAt),
          openToAllPagesCountedMs: round(Math.max(pagesSettledAt, firstNoteAt) - openedAt),
          reopenToFirstPageMs,
          downloadedMb: Object.fromEntries(
            Object.entries(downloaded).map(([kind, bytes]) => [kind, mb(bytes)]),
          ),
          largestFilesMb: Object.fromEntries(
            [...files.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 6)
              .map(([name, bytes]) => [name, mb(bytes)]),
          ),
        },
        memory: {
          emptyBrowserPssMb: mb(emptyBrowserPss),
          wasmHeapMb: wasmHeap === null ? null : mb(wasmHeap),
          ...afterLoad,
          browserPeakPssMb: mb(peakPss),
          browserPssAtEndMb: mb(treePss() ?? 0),
          pageJsHeapAtEndMb: mb(await jsHeap()),
        },
        pageTurnMs: turns,
        pitchEditMs: {
          median: median(pitch),
          samples: pitch.map(round),
          phaseMedians: Object.fromEntries(
            Object.entries(pitchPhases).map(([name, values]) => [name, median(values)]),
          ),
        },
        deleteMs: del,
        undoMs: undo,
        exportMs: exports,
        playback: { playToCursorMs, traces: playbackTraces },
        browser: browser.version(),
        fixture: basename(file),
      };
      await context.close();
    } finally {
      clearInterval(sampler);
      await browser.close();
    }
  });
}
