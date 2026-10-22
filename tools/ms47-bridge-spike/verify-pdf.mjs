import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Native PDF (DECISIONS.md item 2): structure checked with poppler (page count, sizes, title) against the shipping
// 4.00 engine's PDF, and each page rasterised by poppler compared with the same page's SVG rasterised by Chromium.
// The two writers share the painter, so ink should coincide up to anti-aliasing.

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const forkBuild = path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs');
const WIDTH = 850;

function pdfInfo(file) {
  const text = execFileSync('pdfinfo', ['-f', '1', '-l', '999', file], { encoding: 'utf8' });
  const pages = Number(text.match(/^Pages:\s+(\d+)/m)[1]);
  const sizes = [...text.matchAll(/^Page\s+\d+ size:\s+([\d.]+) x ([\d.]+) pts/gm)].map(m => [Number(m[1]), Number(m[2])]);
  return { pages, sizes, title: text.match(/^Title:[ \t]*(.*)$/m)?.[1] ?? '' };
}

async function gray(png, height) {
  return sharp(png).flatten({ background: '#ffffff' }).resize(WIDTH, height, { fit: 'fill' }).grayscale().raw().toBuffer();
}

// Fraction of one image's ink that has ink within `radius` pixels in the other (tolerates AA and rounding)
function covered(a, b, height, radius = 1, threshold = 160) {
  let ink = 0, hit = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (a[y * WIDTH + x] >= threshold) continue;
      ink++;
      search: for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy >= 0 && yy < height && xx >= 0 && xx < WIDTH && b[yy * WIDTH + xx] < threshold) { hit++; break search; }
        }
      }
    }
  }
  return { ink, fraction: ink ? hit / ink : 1 };
}

export async function verifyPdf(WebMscore, renderer, output) {
  const corpus = [
    ['public/test_scores/bach_orig.mscz', 'mscz'],
    ['public/test_scores/four_measures.musicxml', 'musicxml'],
    ['tools/ms47-bridge-spike/spanner-fixture.musicxml', 'musicxml'],
    ['tools/ms47-bridge-spike/image-fixture.mscz', 'mscz'],   // a raster image (PNG XObject)
  ];
  const results = [];
  const temp = await mkdtemp(path.join(tmpdir(), 'ms47-pdf-'));
  try {
    for (const [file, format] of corpus) {
      const data = new Uint8Array(await readFile(path.join(root, file)));
      const score = await WebMscore.load(format, data);
      try {
        const t = performance.now();
        const pdf = await score.savePdf();
        const ms = performance.now() - t;
        const name = path.basename(file);
        const out = path.join(output, `pdf-${name}.pdf`);
        await writeFile(out, pdf);
        const info = pdfInfo(out);
        const npages = await score.npages();
        assert.equal(info.pages, npages, `${name}: one PDF page per score page`);
        const metadata = JSON.parse(await score.saveMetadata());
        if (metadata.metaTags?.workTitle) assert.equal(info.title, metadata.metaTags.workTitle, `${name}: PDF title is the work title`);
        const result = { file: name, pages: info.pages, bytes: pdf.length, ms: Math.round(ms), coverage: [] };

        if (existsSync(forkBuild)) {
          const ref = path.join(temp, 'ref.pdf');
          execFileSync(process.execPath, ['-e', `
            const fs=require('fs');const W=require(${JSON.stringify(forkBuild)});
            (async()=>{await W.ready;console.log=()=>{};const s=await W.load(${JSON.stringify(format)},fs.readFileSync(${JSON.stringify(path.join(root, file))}));
            fs.writeFileSync(${JSON.stringify(ref)},await s.savePdf());process.exit(0)})()`], { stdio: 'ignore', timeout: 120000 });
          const refInfo = pdfInfo(ref);
          result.ref400 = { pages: refInfo.pages, bytes: (await readFile(ref)).length };
          // Page size is the score's page style: must agree with 4.00 to the point
          assert.ok(Math.abs(refInfo.sizes[0][0] - info.sizes[0][0]) < 1 && Math.abs(refInfo.sizes[0][1] - info.sizes[0][1]) < 1,
            `${name}: page size ${info.sizes[0]} matches 4.00 ${refInfo.sizes[0]}`);
        }

        for (let page = 0; page < npages; page++) {
          const height = Math.round(WIDTH * info.sizes[page][1] / info.sizes[page][0]);
          const prefix = path.join(temp, `p${page}`);
          execFileSync('pdftoppm', ['-png', '-f', String(page + 1), '-l', String(page + 1), '-scale-to-x', String(WIDTH), '-scale-to-y', String(height), '-singlefile', out, prefix]);
          const fromPdf = await gray(await readFile(`${prefix}.png`), height);
          const svgText = await score.saveSvg(page, true);
            const fromSvg = await gray((await renderer.render(svgText, { textOnly: true })).png, height);
          const pdfInSvg = covered(fromPdf, fromSvg, height), svgInPdf = covered(fromSvg, fromPdf, height);
          result.coverage.push([+pdfInSvg.fraction.toFixed(4), +svgInPdf.fraction.toFixed(4)]);
          assert.ok(pdfInSvg.ink > 0, `${name} p${page + 1}: PDF page has ink`);
          // Both writers outline text from the same shaping, so every page, text-only or not, must agree
          const floor = 0.99;
          assert.ok(pdfInSvg.fraction > floor && svgInPdf.fraction > floor,
            `${name} p${page + 1}: PDF and SVG ink coincide (${pdfInSvg.fraction.toFixed(4)} / ${svgInPdf.fraction.toFixed(4)})`);
        }
        results.push(result);
        console.log(`verified savePdf ${name}: ${info.pages} pages, ${(pdf.length / 1024).toFixed(0)} KB${result.ref400 ? ` (4.00: ${(result.ref400.bytes / 1024).toFixed(0)} KB)` : ''} in ${result.ms} ms; ink agreement with SVG ${result.coverage.map(c => Math.min(...c).toFixed(3)).join(' ')}`);
      } finally { score.destroy(); }
    }
  } finally { await rm(temp, { recursive: true, force: true }); }
  return results;
}
