import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const forkBuild = fileURLToPath(new URL('../../webmscore-fork/web-public/webmscore.nodejs.cjs', import.meta.url));

// Regression tests for the Qt-free stubs found by the audit (STUBS_AUDIT.md): paths where the engine dereferenced an
// unregistered service, or where a Qt-free fallback gave wrong results. MS47_STUB_CASES=a,b selects cases (a crash
// takes the whole wasm process down, so probe one at a time while investigating).

const fixture = new URL('./spanner-fixture.musicxml', import.meta.url);

const cases = {
  // ICryptographicHash / IImageProvider: a score with a picture loads, the picture is found by its MD4 name, lays out
  // with its own size and survives an MSCZ round trip
  async image(WebMscore) {
    const data = new Uint8Array(await readFile(new URL('./image-fixture.mscz', import.meta.url)));
    const score = await WebMscore.load('mscz', data);
    try {
      assert.ok(await score.npages() > 0, 'score with an image loads and lays out');
      const mscx = Buffer.from(await score.saveMsc('mscx')).toString();
      assert.match(mscx, /<Image>[\s\S]*?<path>ead6e9664b10e936f0acf3b7cfd33dc2\.png<\/path>/, 'image kept with its MD4 store name');
      const mscz = await score.saveMsc('mscz');
      const reloaded = await WebMscore.load('mscz', mscz);
      try {
        assert.match(Buffer.from(await reloaded.saveMsc('mscx')).toString(), /<path>ead6e9664b10e936f0acf3b7cfd33dc2\.png</, 'image survives MSCZ round trip');
      } finally { reloaded.destroy(); }
      return { svg: await score.saveSvg(0).then(s => (/<image\b/.test(s) ? 'embedded' : 'no image element'), e => `refused: ${e.message}`) };
    } finally { score.destroy(); }
  },

  // IInteractive: a warning the engine would show as a dialog (tuplet of a 512th) returns cleanly instead of crashing
  async warning(WebMscore) {
    const score = await WebMscore.load('musicxml', new Uint8Array(await readFile(fixture)));
    try {
      assert.equal(await score.selectPartMeasureByIndex(0, 0), true);
      assert.equal(await score.selectNextChord(), true);
      assert.equal(await score.setDurationType(11), true, '512th');
      const before = await score.saveXml();
      assert.match(before, /<type>512th<\/type>/, 'the note is a 512th');
      if (process.env.MS47_ENGINE_LOG) await WebMscore.setLogLevel(Number(process.env.MS47_ENGINE_LOG));
      assert.equal(await score.addTuplet(4), false, 'a quadruplet of a 512th is refused');
      assert.equal(await score.saveXml(), before, 'and changes nothing');
      return {};
    } finally { score.destroy(); }
  },

  // Unicode character classes: lyric alignment centres the letters and hangs a verse number to the left, so "1. éa"
  // and "1. ea" (é and e have the same advance in Edwin) must be placed identically
  async unicode(WebMscore) {
    const lyricX = async text => {
      const score = await WebMscore.load('musicxml', new Uint8Array(await readFile(fixture)));
      try {
        assert.equal(await score.selectPartMeasureByIndex(0, 0), true);
        assert.equal(await score.selectNextChord(), true);
        assert.equal(await score.addLyricText(text), true);
        const svg = await score.saveSvg(0);
        // Text is drawn at the origin of a group translated to its position: read the group's matrix
        const at = svg.indexOf(`>${text}<`);
        assert.ok(at > 0, `lyric ${text} drawn`);
        const matrices = [...svg.slice(0, at).matchAll(/transform="matrix\(([^)]*)\)"/g)];
        const [, , , , dx] = matrices.at(-1)[1].split(' ').map(Number);
        const x = Number(svg.slice(0, at).match(/<text x="([-\d.]+)"[^>]*$/)[1]);
        return dx + x;
      } finally { score.destroy(); }
    };
    const accented = await lyricX('1. éa'), plain = await lyricX('1. ea');
    assert.ok(Math.abs(accented - plain) < 1, `é is a letter: "1. éa" at x ${accented}, "1. ea" at x ${plain}`);
    return { accented, plain };
  },

  // The 4.00 SVG contract the editor hit-tests against: every primitive carries its element type as a class (and
  // "selected" when selected). Bach page 1 must use the same classes as the 4.00 engine's SVG.
  async svgclasses(WebMscore) {
    const file = new URL('../../public/test_scores/bach_orig.mscz', import.meta.url);
    const classes = svg => new Map([...svg.matchAll(/class="([^"]*)"/g)].flatMap(m => m[1].split(' '))
      .filter(c => c && !c.startsWith('selstate')).reduce((map, c) => map.set(c, (map.get(c) ?? 0) + 1), new Map()));
    const score = await WebMscore.load('mscz', new Uint8Array(await readFile(file)));
    try {
      const mine = classes(await score.saveSvg(0));
      const report = Object.fromEntries(mine);
      if (existsSync(forkBuild)) {
        // Through a file: stdout to a pipe is asynchronous and process.exit would truncate it
        const out = path.join(tmpdir(), `ms47-svgclasses-${process.pid}.svg`);
        execFileSync(process.execPath, ['-e', `
          const fs=require('fs');const W=require(${JSON.stringify(forkBuild)});
          (async()=>{await W.ready;console.log=()=>{};const s=await W.load('mscz',fs.readFileSync(${JSON.stringify(fileURLToPath(file))}));
          fs.writeFileSync(${JSON.stringify(out)},await s.saveSvg(0));process.exit(0)})()`], { stdio: 'ignore', timeout: 120000 });
        const ref = classes(await readFile(out, 'utf8'));
        await rm(out, { force: true });
        // 4.00 painted header/footer text as part of the Page; 4.7 lays them out as Text items (already classed)
        ref.delete('Page');
        assert.deepEqual([...mine.keys()].sort(), [...ref.keys()].sort(), 'same element classes as the 4.00 SVG');
      }
      assert.ok(mine.get('Note') > 0 && mine.get('StaffLines') > 0 && !mine.has('selected'), 'notes and staff lines classed; nothing selected');
      assert.equal(await score.selectPartMeasureByIndex(0, 0), true);
      assert.equal(await score.selectNextChord(), true);
      const selected = (await score.saveSvg(0)).match(/class="([^"]*selected[^"]*)"/g) ?? [];
      assert.ok(selected.length > 0 && selected.every(c => /class="(Note|Chord|Stem|Rest)[^"]*selected"/.test(c)), `selected element marked (${selected.slice(0, 3)})`);
      return report;
    } finally { score.destroy(); }
  },
};

export async function verifyStubs(WebMscore) {
  const selected = (process.env.MS47_STUB_CASES ?? Object.keys(cases).join(',')).split(',');
  const report = {};
  for (const name of selected) {
    report[name] = await cases[name](WebMscore);
    console.log(`verified stub case ${name}${Object.keys(report[name]).length ? `: ${JSON.stringify(report[name])}` : ''}`);
  }
  return report;
}
