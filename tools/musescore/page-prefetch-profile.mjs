// Real playback prefetch observation, on the same Bach fixture as tests/page-turns.spec.ts.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';

const base = process.argv[2] || 'http://127.0.0.1:3037/';
const output = process.argv[3];
if (!output) throw new Error('Usage: node tools/musescore/page-prefetch-profile.mjs <base-url> <new-report.json>');
const count = Number(process.env.OTS_PREFETCH_CONTEXTS || 3);
if (!Number.isInteger(count) || count < 1) throw new Error('OTS_PREFETCH_CONTEXTS must be a positive integer');
const fixture = 'public/test_scores/bach_orig.mscz';
const soundfont = path.resolve('public/soundfonts/default.sf3');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const values = samples => {
  const sorted = [...samples].sort((a, b) => a - b);
  return { n: sorted.length, p50: sorted[Math.ceil(sorted.length * 0.5) - 1], p95: sorted[Math.ceil(sorted.length * 0.95) - 1] };
};
const browser = await chromium.launch({ headless: true });
const report = { schemaVersion: 1, recordedAt: new Date().toISOString(),
  scope: 'Real browser playback, seeking to a note approximately 8.5 seconds before the next page boundary; one observation per fresh context. Includes local soundfont and existing playback buffering/prefetch policy.',
  limitations: ['The target comes from the engine playback positions; audio is not assessed on physical hardware', 'Page commit timestamp is observed on the next animation frame, not a physical display paint', 'saveSvg duration is RPC time and excludes queueing before the call', 'A few runs on one fixture cannot estimate general prefetch reliability or physical-device performance'],
  environment: { base, browser: browser.version(), node: process.version, os: `${os.type()} ${os.release()} ${os.arch()}`, cpu: os.cpus()[0]?.model, loadAverage: os.loadavg(), viewport: { width: 1280, height: 900 },
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), dirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(), wasmSha256: hash(await readFile('public/webmscore.lib.wasm')),
    fixtureBytes: (await readFile(fixture)).length, fixtureSha256: hash(await readFile(fixture)), soundfontSha256: hash(await readFile(soundfont)) }, runs: [] };
try {
  for (let run = 0; run < count; run++) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    await context.route(/\.sf[23](?:\?|$)/, route => route.fulfill({ path: soundfont, contentType: 'application/octet-stream' }));
    const page = await context.newPage();
    try {
      const url = new URL(base); url.searchParams.set('score', '/test_scores/bach_orig.mscz');
      await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await page.locator('svg .Note').first().waitFor({ timeout: 120_000 });
      await page.evaluate(() => {
        const score = window.__webmscore;
        const original = score.saveSvg.bind(score);
        window.__phase7Prefetch = { calls: [], commits: [], preparingSeen: false };
        score.saveSvg = async (pageNumber = 0, ...rest) => {
          const cursor = document.querySelector('[data-testid="playback-cursor"]');
          const call = { page: pageNumber, start: performance.now(), end: null, cursorMs: cursor ? Number(cursor.getAttribute('data-start-ms')) : null };
          window.__phase7Prefetch.calls.push(call);
          try { return await original(pageNumber, ...rest); } finally { call.end = performance.now(); }
        };
        const record = () => {
          const selected = document.querySelector('[data-testid="page-select"]');
          if (selected && window.__phase7Prefetch.commits.at(-1)?.page !== Number(selected.value))
            window.__phase7Prefetch.commits.push({ page: Number(selected.value), at: performance.now() });
          if (document.querySelector('[data-testid="playback-preparing-page"]')) window.__phase7Prefetch.preparingSeen = true;
          requestAnimationFrame(record);
        };
        requestAnimationFrame(record);
      });
      await page.getByTestId('btn-play').click();
      await page.getByTestId('playback-cursor').waitFor({ state: 'visible', timeout: 90_000 });
      const point = await page.evaluate(async () => {
        const positions = await window.__webmscore.segmentPositions();
        const visible = Number(document.querySelector('[data-testid="page-select"]').value);
        const boundary = Math.min(...positions.events.filter(e => positions.elements[e.elid]?.page > visible).map(e => e.position));
        const wrapper = document.querySelector('[data-testid="score-wrapper"]');
        const notes = [...document.querySelectorAll('svg .Note')];
        const candidates = positions.events.filter(e => positions.elements[e.elid]?.page === visible && e.position <= boundary - 8500).sort((a, b) => b.position - a.position);
        for (const event of candidates) {
          const box = positions.elements[event.elid], rect = wrapper.getBoundingClientRect(), zoom = rect.width / wrapper.offsetWidth;
          const note = notes.find(element => {
            const r = element.getBoundingClientRect(), x = r.left + r.width / 2 - rect.left, y = r.top + r.height / 2 - rect.top;
            return x >= box.x * zoom && x < (box.x + box.sx) * zoom && y >= box.y * zoom && y <= (box.y + box.sy) * zoom;
          });
          if (!note) continue;
          note.scrollIntoView({ block: 'center' });
          const r = note.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2, boundaryMs: boundary };
        }
        return null;
      });
      assert.ok(point, 'a seekable note before the page boundary is available');
      await page.mouse.click(point.x, point.y);
      await page.waitForFunction(() => document.querySelector('[data-testid="page-select"]')?.value === '2', undefined, { timeout: 90_000 });
      await page.waitForFunction(() => window.__phase7Prefetch.commits.some(commit => commit.page === 2), undefined, { timeout: 15_000 });
      const result = await page.evaluate(() => window.__phase7Prefetch);
      const renders = result.calls.filter(call => call.page === 2);
      const commit = result.commits.find(event => event.page === 2);
      assert.equal(renders.length, 1, 'next page rendered once, before the prepared turn');
      assert.ok(renders[0].end !== null && renders[0].end <= commit.at, 'render completed before page commit');
      assert.ok(renders[0].cursorMs !== null && renders[0].cursorMs < point.boundaryMs, 'prefetch began before boundary');
      const diagnostics = await page.evaluate(async () => (await window.__webmscore.playbackDiagnostics?.()) ?? null);
      report.runs.push({ run, boundaryMs: point.boundaryMs, renderRpcMs: renders[0].end - renders[0].start,
        renderEndToObservedCommitMs: commit.at - renders[0].end, cursorLeadMsAtRenderStart: point.boundaryMs - renders[0].cursorMs,
        preparingSeen: result.preparingSeen, wasmHeapBytes: diagnostics?.wasmHeapBytes ?? null });
      await page.getByTestId('btn-stop').click();
      console.log(`playback prefetch: context ${run + 1}/${count}`);
    } finally { await context.close(); }
  }
  report.summary = { renderRpcMs: values(report.runs.map(r => r.renderRpcMs)), renderEndToObservedCommitMs: values(report.runs.map(r => r.renderEndToObservedCommitMs)), cursorLeadMsAtRenderStart: values(report.runs.map(r => r.cursorLeadMsAtRenderStart)), wasmHeapBytes: values(report.runs.map(r => r.wasmHeapBytes).filter(Number.isFinite)) };
  await writeFile(path.resolve(output), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(`Saved ${output}`);
} finally { await browser.close(); }
