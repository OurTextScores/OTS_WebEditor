// Combine the existing visual report and fidelity evidence for human review.
// This tool does not change the exit status of either underlying check.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [reportArg, decisionsArg] = process.argv.slice(2);
if (!reportArg || process.argv.length > 4) {
  throw new Error('Usage: node tools/musescore/review-report.mjs <visual-report-dir> [review-decisions.json]');
}
const directory = path.resolve(reportArg);
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const report = await readJson(path.join(directory, 'report.json'));
if (report.schemaVersion !== 1 || !Array.isArray(report.rows) || !Array.isArray(report.warnings)) {
  throw new Error('Unsupported visual report');
}
const fixtureBytes = await readFile(new URL('./fixtures/osmd-fidelity/manifest.json', import.meta.url));
const fixtureManifest = JSON.parse(fixtureBytes.toString());
const known = await readJson(new URL('./fixtures/osmd-fidelity/known-failures.json', import.meta.url));
const decisions = decisionsArg ? await readJson(path.resolve(decisionsArg)) : { schemaVersion: 1, reviews: [] };
if (decisions.schemaVersion !== 1 || !Array.isArray(decisions.reviews)) throw new Error('Unsupported review record');
const fixtureIds = new Set(fixtureManifest.cases.map(f => f.id));
const statuses = new Set(['needs-review', 'expected', 'defect']);
const byDecision = new Map();
for (const item of decisions.reviews) {
  if (!fixtureIds.has(item.id) || byDecision.has(item.id) || !statuses.has(item.status) ||
      !/^[0-9a-f]{64}$/.test(item.evidenceSha256 || '') || typeof item.rationale !== 'string' ||
      (item.status !== 'needs-review' && !item.rationale.trim())) throw new Error(`Invalid review decision: ${item.id}`);
  byDecision.set(item.id, item);
}
const digest = value => createHash('sha256').update(value).digest('hex');
const key = f => JSON.stringify([f.id, f.stage, f.message]);
const validFailure = f => f && typeof f.id === 'string' && typeof f.stage === 'string' && typeof f.message === 'string';
if (!Array.isArray(known) || !known.every(validFailure)) throw new Error('Invalid known failure list');
const warnings = [...report.warnings];
const fixtureSha = digest(fixtureBytes);
for (const [label, provenance] of [['baseline', report.baselineProvenance], ['current', report.currentProvenance]]) {
  if (!provenance || provenance.fixtureManifestSha256 !== fixtureSha) warnings.push(`${label}: fixture manifest differs from this review tool's fixture manifest`);
}
const currentFailures = report.currentProvenance?.semanticFailures;
const semanticsAvailable = Array.isArray(currentFailures) && currentFailures.every(validFailure);
if (!semanticsAvailable) warnings.push('Current semantic results are missing or invalid; semantic status is unknown.');
else for (const failure of currentFailures) if (!fixtureIds.has(failure.id)) warnings.push(`Unknown semantic fixture: ${failure.id}`);
const knownKeys = new Set(known.map(key));
const observedKeys = new Set((semanticsAvailable ? currentFailures : []).map(key));
const rowsById = new Map(report.rows.map(row => [row.id, row]));
const captureMap = p => new Map((Array.isArray(p?.cases) ? p.cases : []).map(c => [c.id, c]));
const baselineCases = captureMap(report.baselineProvenance), currentCases = captureMap(report.currentProvenance);
const provenance = p => p ? Object.fromEntries(['commit', 'dirty', 'diffSha256', 'engineWasmSha256', 'engineDataSha256', 'fixtureManifestSha256', 'resourceTreeSha256', 'systemFontsSha256', 'captureCodeSha256', 'rendererCodeSha256', 'captureDriverSha256', 'directEditCodeSha256', 'staffMoveCodeSha256', 'environment', 'target', 'node', 'platform', 'browser', 'playwright', 'viewport', 'deviceScaleFactor'].map(k => [k, p[k] ?? null])) : null;
const results = fixtureManifest.cases.map(fixture => {
  const pages = (fixture.pages || [0]).map(page => {
    const id = page === 0 ? fixture.id : `${fixture.id}-page-${page + 1}`;
    const row = rowsById.get(id);
    const before = baselineCases.get(id), after = currentCases.get(id);
    return { id, page, row: row || null, baselineImageSha256: before?.imageSha256 ?? null, currentImageSha256: after?.imageSha256 ?? null };
  });
  const observed = semanticsAvailable ? currentFailures.filter(f => f.id === fixture.id).map(f => ({ ...f, classification: knownKeys.has(key(f)) ? 'known' : 'new' })) : [];
  const resolved = semanticsAvailable ? known.filter(f => f.id === fixture.id && !observedKeys.has(key(f))) : [];
  // Evidence includes warnings and provenance as well as images and failure details: any
  // changed input invalidates a prior decision, even if the displayed outcome looks similar.
  const evidenceSha256 = digest(JSON.stringify({ fixture: fixture.sha256, threshold: report.threshold,
    baseline: provenance(report.baselineProvenance), current: provenance(report.currentProvenance), warnings, pages, semanticsAvailable, observed, resolved }));
  const decision = byDecision.get(fixture.id);
  const review = !decision ? { status: 'needs-review', rationale: '', state: 'unreviewed' }
    : decision.evidenceSha256 !== evidenceSha256 ? { ...decision, state: 'stale' }
      : { ...decision, state: 'current' };
  return { id: fixture.id, expectation: fixture.expectation, pages, semanticsAvailable, observed, resolved, evidenceSha256, review };
});
const priority = item => (item.observed.some(f => f.classification === 'new') ? 8 : 0)
  + (item.pages.some(p => p.row?.changedPixels) ? 4 : 0)
  + (item.resolved.length ? 2 : 0) + (item.observed.length ? 1 : 0);
results.sort((a, b) => priority(b) - priority(a) || a.id.localeCompare(b.id));
const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const listFailures = (items, label) => items.length ? `<h4>${esc(label)}</h4><ul>${items.map(f => `<li><strong>${esc(f.stage)}</strong><pre>${esc(f.message)}</pre></li>`).join('')}</ul>` : '';
const cards = results.map(item => {
  const pageHtml = item.pages.map(({ id, page, row }) => {
    if (!row) return `<p>Page ${page + 1}: comparison missing; inspect warnings.</p>`;
    const base = encodeURIComponent(id);
    if (!row.changedPixels) return `<p>Page ${page + 1}: no pixel differences.${row.imagesCopied ? ` <a href="${base}/before.png">Before</a> · <a href="${base}/current.png">Current</a>` : ''}</p>`;
    return `<div><p>Page ${page + 1}: ${row.changedPixels} changed pixels; ${row.omittedRegions} regions omitted, ${row.truncatedRegions} cropped.</p><p><a href="${base}/before.png">Before</a> · <a href="${base}/current.png">Current</a> · <a href="${base}/overlay.png">Overlay</a></p>${Array.from({length: row.crops}, (_, i) => `<a href="${base}/crop-${i + 1}.png"><img loading="lazy" src="${base}/crop-${i + 1}.png" alt="Page ${page + 1}, changed region ${i + 1}"></a>`).join('')}</div>`;
  }).join('');
  const semantic = !item.semanticsAvailable ? '<p>Semantic result unavailable.</p>' :
    (item.observed.length || item.resolved.length ? listFailures(item.observed.filter(f => f.classification === 'new'), 'New failures') + listFailures(item.observed.filter(f => f.classification === 'known'), 'Known failures') + listFailures(item.resolved, 'Known failures no longer observed') : '<p>No semantic failures recorded.</p>');
  return `<section id="${esc(item.id)}"><h2>${esc(item.id)}</h2><p>${esc(item.expectation)}</p><p>Review: <strong>${esc(item.review.state === 'stale' ? 'stale — needs review' : item.review.status)}</strong>${item.review.rationale ? ` — ${esc(item.review.rationale)}` : ''}</p><p>Evidence SHA-256: <code>${item.evidenceSha256}</code></p><h3>Visual</h3>${pageHtml}<h3>Semantic</h3>${semantic}</section>`;
}).join('\n');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Engraving review</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:1100px;margin:auto;padding:1rem;color:#192333}section{border-top:1px solid #b8c1cc;padding:1rem 0}img{max-width:100%;border:1px solid #ccc}pre{white-space:pre-wrap;overflow-wrap:anywhere}code{overflow-wrap:anywhere}.warning{color:#8b2500}</style></head><body><h1>Engraving review</h1><p>Visual differences and semantic assertions are independent checks. Review decisions do not approve baselines or change either check.</p><p>${results.length} fixtures · visual threshold ${esc(report.threshold)} · ${warnings.length} ${warnings.length === 1 ? 'warning' : 'warnings'}</p>${warnings.length ? `<div class="warning"><h2>Warnings</h2><ul>${warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}<nav>${results.map(x => `<a href="#${esc(x.id)}">${esc(x.id)}</a>`).join(' · ')}</nav><details><summary>Capture provenance</summary><h3>Baseline</h3><pre>${esc(JSON.stringify(provenance(report.baselineProvenance), null, 2))}</pre><h3>Current</h3><pre>${esc(JSON.stringify(provenance(report.currentProvenance), null, 2))}</pre></details>${cards}</body></html>\n`;
const summary = { schemaVersion: 1, warnings, fixtures: results };
const template = { schemaVersion: 1, reviews: results.map(item => ({ id: item.id, evidenceSha256: item.evidenceSha256, status: 'needs-review', rationale: '' })) };
await writeFile(path.join(directory, 'review.html'), html, { flag: 'wx' });
await writeFile(path.join(directory, 'review-summary.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
await writeFile(path.join(directory, 'review-template.json'), JSON.stringify(template, null, 2) + '\n', { flag: 'wx' });
console.log(`Review report: ${path.join(directory, 'review.html')} (${results.length} fixtures, ${warnings.length} warnings)`);
