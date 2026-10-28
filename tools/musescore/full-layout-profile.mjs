// Measure explicit full relayout on a loaded, unedited score; never compare timings with an edit trace as equivalent work.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';

const base = process.argv[2] || 'http://127.0.0.1:3037/';
const output = process.argv[3];
if (!output) throw new Error('Usage: node tools/musescore/full-layout-profile.mjs <base-url> <new-report.json>');
const count = Number(process.env.OTS_LAYOUT_CONTEXTS || 3);
if (!Number.isInteger(count) || count < 1) throw new Error('OTS_LAYOUT_CONTEXTS must be a positive integer');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const stat = samples => {
  const sorted = [...samples].sort((a, b) => a - b);
  return { n: sorted.length, p50: sorted[Math.ceil(sorted.length * 0.5) - 1], p95: sorted[Math.ceil(sorted.length * 0.95) - 1] };
};
const browser = await chromium.launch({ headless: true });
const report = { schemaVersion: 1, recordedAt: new Date().toISOString(),
  scope: 'A loaded, unedited browser score; a full relayout RPC timed after two page-1 SVG reads. Each sample uses a fresh context against a warm development server.',
  limitations: ['RPC includes queue/worker transfer, not native-only timing', 'Full relayout here is diagnostic and not part of a normal page turn', 'Exact SVG comparison covers page 1 of the unedited score only, not a complete edit/layout oracle'],
  environment: { base, browser: browser.version(), node: process.version, os: `${os.type()} ${os.release()} ${os.arch()}`, cpu: os.cpus()[0]?.model, loadAverage: os.loadavg(), viewport: { width: 1280, height: 900 },
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), dirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(), wasmSha256: hash(await readFile('public/webmscore.lib.wasm')) }, fixtures: [] };
try {
  for (const name of ['bach_orig.mscz', 'men-base.musicxml']) {
    const bytes = await readFile(path.join('public/test_scores', name));
    const fixture = { name, sizeBytes: bytes.length, sha256: hash(bytes), runs: [] };
    for (let run = 0; run < count; run++) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      try {
        const url = new URL(base); url.searchParams.set('score', `/test_scores/${name}`);
        await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 120_000 });
        await page.locator('svg .Note').first().waitFor({ timeout: 120_000 });
        await page.waitForFunction(() => !!window.__webmscore, undefined, { timeout: 120_000 });
        const measurement = await page.evaluate(async () => {
          const score = window.__webmscore;
          const pagesBefore = await score.npages();
          const svgBefore = await score.saveSvg(0, true, false);
          const started = performance.now();
          await score.relayout();
          const relayoutRpcMs = performance.now() - started;
          const svgAfter = await score.saveSvg(0, true, false);
          const pagesAfter = await score.npages();
          return { relayoutRpcMs, pagesBefore, pagesAfter, identicalFirstPage: svgBefore === svgAfter };
        });
        assert.ok(measurement.relayoutRpcMs >= 0);
        fixture.runs.push({ run, ...measurement });
        console.log(`${name}: full relayout context ${run + 1}/${count}, svg match=${measurement.identicalFirstPage}`);
      } finally { await context.close(); }
    }
    fixture.summary = { relayoutRpcMs: stat(fixture.runs.map(r => r.relayoutRpcMs)), identicalFirstPage: fixture.runs.filter(r => r.identicalFirstPage).length, pageCountStable: fixture.runs.filter(r => r.pagesBefore === r.pagesAfter).length };
    report.fixtures.push(fixture);
  }
  await writeFile(path.resolve(output), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(`Saved ${output}`);
} finally { await browser.close(); }
