// Compare two immutable capture directories from MS47_FIDELITY_CAPTURE.
import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const esc = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const [baselineArg, currentArg, outputArg] = process.argv.slice(2);
if (!baselineArg || !currentArg || !outputArg || process.argv.length !== 5) {
  throw new Error('Usage: node tools/musescore/visual-report.mjs <baseline-dir> <current-dir> <new-report-dir>');
}
const baseline = path.resolve(baselineArg), current = path.resolve(currentArg), output = path.resolve(outputArg);
if ([baseline, current].some(dir => output === dir || output.startsWith(dir + path.sep) || dir.startsWith(output + path.sep))) {
  throw new Error('Report directory must not overlap either capture directory');
}
await mkdir(output); // exclusive; protects prior results and baselines
const warnings = [], rows = [];
async function manifest(dir, label) {
  try {
    const data = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
    if (data.schemaVersion !== 1 || !Array.isArray(data.cases)) throw new Error('unsupported manifest');
    return data;
  } catch (error) { warnings.push(`${label} manifest: ${error.message}`); return null; }
}
const a = await manifest(baseline, 'baseline'), b = await manifest(current, 'current');
const compareKeys = ['target', 'node', 'platform', 'environment', 'playwright', 'browser', 'viewport', 'deviceScaleFactor', 'svgWidth', 'background', 'page', 'highlightSelection', 'systemFontsSha256', 'resourceTreeSha256', 'fixtureManifestSha256', 'captureCodeSha256', 'rendererCodeSha256', 'captureDriverSha256', 'directEditCodeSha256'];
if (a && b) for (const key of compareKeys) {
  if (a[key] == null || b[key] == null || JSON.stringify(a[key]) !== JSON.stringify(b[key])) warnings.push(`Capture environment differs or is missing: ${key}`);
}
const byId = (m, label) => {
  const map = new Map();
  for (const item of m?.cases || []) {
    if (!/^[a-z0-9-]+$/.test(item.id || '') || item.file !== `${item.id}.png` || !Number.isInteger(item.page) || item.page < 0 || !/^[0-9a-f]{64}$/.test(item.fixtureSha256 || '') || !/^[0-9a-f]{64}$/.test(item.imageSha256 || '') || map.has(item.id)) warnings.push(`${label}: invalid or duplicate case ${item.id}`);
    else map.set(item.id, item);
  }
  return map;
};
const left = byId(a, 'baseline'), right = byId(b, 'current');
const ids = [...new Set([...left.keys(), ...right.keys()])].sort();
if (!ids.length) warnings.push('No capture cases found');
const threshold = Number(process.env.OSMD_VISUAL_THRESHOLD ?? 0);
if (!Number.isInteger(threshold) || threshold < 0 || threshold > 255) throw new Error('OSMD_VISUAL_THRESHOLD must be an integer from 0 to 255');
for (const id of ids) {
  const old = left.get(id), now = right.get(id);
  if (!old || !now) { warnings.push(`${id}: missing from ${old ? 'current' : 'baseline'} manifest`); continue; }
  if (old.page !== now.page) { warnings.push(`${id}: page numbers differ`); continue; }
  if (old.fixtureSha256 !== now.fixtureSha256) { warnings.push(`${id}: fixture hashes differ`); continue; }
  try {
    const [oldBytes, nowBytes] = await Promise.all([readFile(path.join(baseline, old.file)), readFile(path.join(current, now.file))]);
    if (sha(oldBytes) !== old.imageSha256 || sha(nowBytes) !== now.imageSha256) throw new Error('image does not match capture manifest hash');
    const [before, after] = await Promise.all([sharp(oldBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), sharp(nowBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })]);
    const w = Math.max(before.info.width, after.info.width), h = Math.max(before.info.height, after.info.height);
    const overlay = Buffer.alloc(w * h * 4, 255), changedRows = [];
    let count = 0, minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      let rowMin = w, rowMax = -1;
      for (let x = 0; x < w; x++) {
        const ai = (y * before.info.width + x) * 4, bi = (y * after.info.width + x) * 4, oi = (y * w + x) * 4;
        const insideA = x < before.info.width && y < before.info.height, insideB = x < after.info.width && y < after.info.height;
        const different = !insideA || !insideB || [0, 1, 2, 3].some(k => Math.abs(before.data[ai+k] - after.data[bi+k]) > threshold);
        for (let k = 0; k < 3; k++) overlay[oi+k] = insideB ? Math.round(after.data[bi+k] * 0.2 + 204) : 255;
        if (different) {
          count++; rowMin = Math.min(rowMin, x); rowMax = Math.max(rowMax, x);
          overlay[oi] = 255; overlay[oi+1] = Math.round(overlay[oi+1] * 0.6); overlay[oi+2] = Math.round(overlay[oi+2] * 0.6);
        }
      }
      if (rowMax >= 0) { changedRows.push({ y, min: rowMin, max: rowMax }); minX = Math.min(minX, rowMin); maxX = Math.max(maxX, rowMax); minY = Math.min(minY, y); maxY = y; }
    }
    const row = { id, changedPixels: count, baselineSize: [before.info.width, before.info.height], currentSize: [after.info.width, after.info.height], bounds: count ? [minX, minY, maxX, maxY] : null, crops: 0, omittedRegions: 0, truncatedRegions: 0 };
    rows.push(row);
    if (!count) continue;
    const dir = path.join(output, id); await mkdir(dir);
    await copyFile(path.join(baseline, old.file), path.join(dir, 'before.png'));
    await copyFile(path.join(current, now.file), path.join(dir, 'current.png'));
    await sharp(overlay, { raw: { width: w, height: h, channels: 4 } }).png().toFile(path.join(dir, 'overlay.png'));
    // Group adjacent changed rows; keep at most six crops, but report all regions and keep full images.
    const regions = [];
    for (const r of changedRows) {
      let region = regions.at(-1);
      if (!region || r.y - region.y1 > 30) { region = { x0: r.min, x1: r.max, y0: r.y, y1: r.y }; regions.push(region); }
      else { region.y1 = r.y; region.x0 = Math.min(region.x0, r.min); region.x1 = Math.max(region.x1, r.max); }
    }
    row.omittedRegions = Math.max(0, regions.length - 6);
    for (const [index, region] of regions.slice(0, 6).entries()) {
      const x = Math.max(0, region.x0 - 30), y = Math.max(0, region.y0 - 30);
      const regionHeight = region.y1 - y + 31;
      if (regionHeight > 400) row.truncatedRegions++;
      const cw = Math.min(w - x, region.x1 - x + 31), ch = Math.min(h - y, Math.min(400, regionHeight));
      // Pad different-size pages to the common dimensions before extracting identical crops.
      const crop = async input => sharp(input).extend({ top: 0, left: 0, right: w - (await sharp(input).metadata()).width, bottom: h - (await sharp(input).metadata()).height, background: 'white' }).extract({ left: x, top: y, width: cw, height: ch }).png().toBuffer();
      const [oldCrop, newCrop] = await Promise.all([crop(oldBytes), crop(nowBytes)]);
      const label = Buffer.from(`<svg width="${cw*2+16}" height="24"><text x="0" y="17" font-family="sans-serif" font-size="14">${esc(id)}: baseline</text><text x="${cw+16}" y="17" font-family="sans-serif" font-size="14">current</text></svg>`);
      await sharp({ create: { width: cw * 2 + 16, height: ch + 24, channels: 4, background: 'white' } }).composite([{ input: label, left: 0, top: 0 }, { input: oldCrop, left: 0, top: 24 }, { input: newCrop, left: cw + 16, top: 24 }]).png().toFile(path.join(dir, `crop-${index + 1}.png`));
      row.crops++;
    }
  } catch (error) { warnings.push(`${id}: ${error.message}`); }
}
rows.sort((x, y) => y.changedPixels - x.changedPixels || x.id.localeCompare(y.id));
const report = { schemaVersion: 1, createdAt: new Date().toISOString(), threshold, baseline, current,
  baselineProvenance: a, currentProvenance: b, rows, warnings };
await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
const summary = [`# Visual comparison`, '', `Threshold: ${threshold}`, `Baseline: ${baseline}`, `Current: ${current}`, `Fidelity assertions: baseline ${a?.semanticFailures?.length ?? 'unknown'} failures; current ${b?.semanticFailures?.length ?? 'unknown'} failures (separate from this visual result).`, '', ...rows.map(r => `- ${r.id}: ${r.changedPixels} pixels; ${r.baselineSize.join('×')} → ${r.currentSize.join('×')}; ${r.crops} crops, ${r.omittedRegions} omitted, ${r.truncatedRegions} truncated${r.changedPixels ? ` — [before](${r.id}/before.png), [current](${r.id}/current.png), [overlay](${r.id}/overlay.png), ${Array.from({ length: r.crops }, (_, i) => `[crop ${i + 1}](${r.id}/crop-${i + 1}.png)`).join(', ')}` : ''}`), '', ...warnings.map(w => `- WARNING: ${w}`)].join('\n') + '\n';
await writeFile(path.join(output, 'report.md'), summary, { flag: 'wx' });
console.log(summary);
if (warnings.length || rows.some(row => row.changedPixels > 0)) process.exitCode = 1;
