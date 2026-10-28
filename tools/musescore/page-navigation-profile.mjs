// Local developer investigation: real editor, worker and WASM; no score mutations.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';

const base = process.argv[2] || 'http://127.0.0.1:3037/';
const output = process.argv[3];
if (!output) throw new Error('Usage: node tools/musescore/page-navigation-profile.mjs <base-url> <new-report.json>');
const contextsPerScore = Number(process.env.OTS_PAGE_PROFILE_CONTEXTS || 3);
const cycles = Number(process.env.OTS_PAGE_PROFILE_CYCLES || 10);
const collectMemory = process.env.OTS_PAGE_PROFILE_GC === '1';
if (!Number.isInteger(contextsPerScore) || contextsPerScore < 1 || !Number.isInteger(cycles) || cycles < 1) throw new Error('Context and cycle counts must be positive integers');
const fixtures = ['bach_orig.mscz', 'men-base.musicxml'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const percentile = (values, q) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)] ?? null;
};
const stats = values => ({ n: values.length, p50: percentile(values, 0.5), p95: percentile(values, 0.95) });
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const browser = await chromium.launch({ headless: true });
const report = {
  schemaVersion: 1, recordedAt: new Date().toISOString(),
  scope: 'Real editor in fresh browser contexts; warm dev server and OS caches. Paint is an animation-frame-plus-task proxy. No traversal or notation mutation.',
  limitations: ['saveSvg timing includes worker RPC and UTF-8 decode but excludes time queued before the call', 'saveSvg plus innerHTML do not isolate sanitization, queueing, native SVG writing or worker transfer', 'CDP JS heap is main-page JS only, not worker/WASM or total process memory', 'cold means a new browser context, not a cold machine or uncached server'],
  environment: { base, browser: browser.version(), node: process.version, os: `${os.type()} ${os.release()} ${os.arch()}`, cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, totalMemoryBytes: os.totalmem(), viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, loadAverage: os.loadavg(), commit: git('rev-parse', 'HEAD'), dirty: !!git('status', '--porcelain'), wasmSha256: hash(await readFile('public/webmscore.lib.wasm')) },
  parameters: { contextsPerScore, cycles, collectMemory, pageSequence: 'first visit to pages 2 and 3; then alternate between these cached pages', pageNumbers: 'one-based in display, zero-based in raw samples' },
  fixtures: [],
};
try {
  for (const fixture of fixtures) {
    const bytes = await readFile(path.join('public/test_scores', fixture));
    const item = { file: fixture, sizeBytes: bytes.length, sha256: hash(bytes), runs: [] };
    for (let run = 0; run < contextsPerScore; run++) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Performance.enable');
      const memory = async () => {
        const metrics = (await cdp.send('Performance.getMetrics')).metrics;
        const dom = await cdp.send('Memory.getDOMCounters');
        return { jsHeapUsedBytes: metrics.find(m => m.name === 'JSHeapUsedSize')?.value ?? null, domNodes: dom.nodes, documents: dom.documents };
      };
      try {
        await page.addInitScript(() => {
          window.__phase7FirstPaint = null;
          const inspect = () => {
            if (!document.querySelector('[data-testid="svg-container"] svg .Note')) return false;
            requestAnimationFrame(() => setTimeout(() => { window.__phase7FirstPaint = performance.now(); }, 0));
            return true;
          };
          const start = () => {
            if (inspect()) return;
            const observer = new MutationObserver(() => { if (inspect()) observer.disconnect(); });
            observer.observe(document.documentElement, { childList: true, subtree: true });
          };
          if (document.documentElement) start();
          else document.addEventListener('DOMContentLoaded', start, { once: true });
        });
        const url = new URL(base);
        url.searchParams.set('score', `/test_scores/${fixture}`);
        await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 120_000 });
        await page.waitForFunction(() => window.__phase7FirstPaint !== null && window.__webmscore, undefined, { timeout: 180_000 });
        await page.waitForFunction(() => document.querySelector('[data-testid="page-select"]')?.options.length >= 3, undefined, { timeout: 180_000 });
        const firstPaintMs = await page.evaluate(() => window.__phase7FirstPaint);
        const pages = await page.locator('[data-testid="page-select"] option').count();
        const before = await page.evaluate(async () => {
          const score = window.__webmscore;
          const xml = await score.saveXml();
          const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(xml));
          return { xmlSha256: Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, '0')).join(''), undo: await score.getUndoInfo(), selection: await score.getSelectionBoundingBoxes() };
        });
        const beforeMemory = await memory();
        const gcSnapshots = [];
        if (collectMemory) { await cdp.send('HeapProfiler.collectGarbage'); gcSnapshots.push({ turns: 0, ...(await memory()) }); }
        await page.evaluate(() => {
          const score = window.__webmscore;
          const original = score.saveSvg.bind(score);
          window.__phase7Calls = [];
          window.__phase7Dom = [];
          const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
          if (!descriptor?.set || !descriptor.get) throw new Error('Cannot instrument SVG DOM insertion');
          Object.defineProperty(Element.prototype, 'innerHTML', { ...descriptor, set(value) {
            if (this.getAttribute('data-testid') !== 'svg-container') return descriptor.set.call(this, value);
            const start = performance.now();
            try { return descriptor.set.call(this, value); }
            finally { window.__phase7Dom.push({ ms: performance.now() - start }); }
          } });
          score.saveSvg = async (...args) => {
            const start = performance.now();
            try { return await original(...args); }
            finally { window.__phase7Calls.push({ page: args[0], ms: performance.now() - start }); }
          };
        });
        const turn = async target => {
          const result = await page.evaluate(targetPage => new Promise((resolve, reject) => {
            const selector = document.querySelector('[data-testid="page-select"]');
            const container = document.querySelector('[data-testid="svg-container"]');
            if (!selector || !container) return reject(new Error('Missing editor page controls'));
            const begin = performance.now();
            const callsAtStart = window.__phase7Calls.length;
            const domAtStart = window.__phase7Dom.length;
            const timer = setTimeout(() => { observer.disconnect(); reject(new Error(`Page ${targetPage} did not render`)); }, 120000);
            const observer = new MutationObserver(() => {
              if (!container.querySelector('svg')) return;
              observer.disconnect(); clearTimeout(timer);
              const commit = performance.now();
              requestAnimationFrame(() => setTimeout(() => resolve({ targetPage, commitMs: commit - begin,
                paintProxyMs: performance.now() - begin, svgChars: container.innerHTML.length,
                calls: window.__phase7Calls.slice(callsAtStart), domWrites: window.__phase7Dom.slice(domAtStart) }), 0));
            });
            observer.observe(container, { childList: true });
            selector.value = String(targetPage);
            selector.dispatchEvent(new Event('change', { bubbles: true }));
          }), target);
          await page.waitForFunction(targetPage => document.querySelector('[data-testid="page-select"]')?.value === String(targetPage), target, { timeout: 120_000 });
          assert.ok(result.svgChars > 1000, `page ${target}: nonempty SVG`);
          return result;
        };
        const misses = [await turn(1), await turn(2)];
        const hits = [];
        for (let i = 0; i < cycles; i++) {
          hits.push(await turn(1)); hits.push(await turn(2));
          if (collectMemory && ([5, 10, 20].includes(i + 1) || i + 1 === cycles)) {
            await cdp.send('HeapProfiler.collectGarbage');
            gcSnapshots.push({ turns: (i + 1) * 2, ...(await memory()) });
          }
        }
        assert.ok(misses.every(sample => sample.calls.some(call => call.page === sample.targetPage)), 'cache misses must invoke saveSvg');
        assert.ok(hits.every(sample => !sample.calls.some(call => call.page === sample.targetPage)), 'prepared page returns must not invoke saveSvg');
        const afterMemory = await memory();
        const after = await page.evaluate(async () => {
          const score = window.__webmscore;
          const xml = await score.saveXml();
          const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(xml));
          return { xmlSha256: Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, '0')).join(''), undo: await score.getUndoInfo(), selection: await score.getSelectionBoundingBoxes() };
        });
        assert.deepEqual(after, before, 'page turns preserve export, undo and selection');
        item.runs.push({ run, pages, firstPaintMs, misses, hits, beforeMemory, afterMemory, gcSnapshots, invariants: true });
        console.log(`${fixture}: context ${run + 1}/${contextsPerScore}, ${pages} pages, ${hits.length} cache-hit turns`);
      } finally { await context.close(); }
    }
    const misses = item.runs.flatMap(run => run.misses);
    const hits = item.runs.flatMap(run => run.hits);
    item.summary = { firstPaintMs: stats(item.runs.map(run => run.firstPaintMs)),
      missPaintProxyMs: stats(misses.map(sample => sample.paintProxyMs)), missCommitMs: stats(misses.map(sample => sample.commitMs)),
      missSaveSvgRpcMs: stats(misses.flatMap(sample => sample.calls.filter(call => call.page === sample.targetPage).map(call => call.ms))),
      hitPaintProxyMs: stats(hits.map(sample => sample.paintProxyMs)), hitCommitMs: stats(hits.map(sample => sample.commitMs)),
      missInnerHtmlMs: stats(misses.flatMap(sample => sample.domWrites.map(write => write.ms))), hitInnerHtmlMs: stats(hits.flatMap(sample => sample.domWrites.map(write => write.ms))),
      missPostCommitFrameMs: stats(misses.map(sample => sample.paintProxyMs - sample.commitMs)), hitPostCommitFrameMs: stats(hits.map(sample => sample.paintProxyMs - sample.commitMs)),
      byTarget: Object.fromEntries([1, 2].map(target => [target, { missPaintProxyMs: stats(misses.filter(sample => sample.targetPage === target).map(sample => sample.paintProxyMs)), hitPaintProxyMs: stats(hits.filter(sample => sample.targetPage === target).map(sample => sample.paintProxyMs)), missSaveSvgRpcMs: stats(misses.filter(sample => sample.targetPage === target).flatMap(sample => sample.calls.filter(call => call.page === target).map(call => call.ms))) }])),
      mainPageJsHeapBytesBefore: stats(item.runs.map(run => run.beforeMemory.jsHeapUsedBytes).filter(Number.isFinite)),
      mainPageJsHeapBytesAfter: stats(item.runs.map(run => run.afterMemory.jsHeapUsedBytes).filter(Number.isFinite)) };
    report.fixtures.push(item);
  }
  await writeFile(path.resolve(output), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(`Saved ${output}`);
} finally { await browser.close(); }
