import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Parts and excerpts. The fixture has two parts (Flute, Clarinet). addFont changes global font state, so it runs last.

const native = async score => Buffer.from(await score.saveMsc('mscx')).toString('utf8');
const scoreParts = xml => [...xml.matchAll(/<score-part id="[^"]+">[\s\S]*?<part-name[^>]*>([^<]*)<\/part-name>/g)].map(m => m[1]);
const CJK_FONT = '/usr/share/fonts/truetype/fonts-japanese-gothic.ttf';

export async function verifyParts(WebMscore, renderer, output) {
  const fixture = new Uint8Array(await readFile(new URL('./spanner-fixture.musicxml', import.meta.url)));
  if (process.env.MS47_ENGINE_LOG) await WebMscore.setLogLevel(Number(process.env.MS47_ENGINE_LOG));
  const report = {};

  // Excerpts: generation, scoping, linked edits, undo across scores
  {
    const score = await WebMscore.load('musicxml', fixture);
    try {
      await score.setExcerptId(0);
      await assert.rejects(score.npages(), /Invalid/, 'no excerpt before generateExcerpts');
      await score.setExcerptId(-1);
      await score.generateExcerpts();
      await score.generateExcerpts(); // idempotent: only generates when the score has no excerpts
      for (const [id, name] of [[0, 'Flute'], [1, 'Clarinet']]) {
        await score.setExcerptId(id);
        assert.ok(await score.npages() >= 1);
        const excerptXml = await score.saveXml();
        if (process.env.MS47_DEBUG_PARTS) console.log((excerptXml.match(/<part-list>[\s\S]*?<\/part-list>/) ?? ['no part-list'])[0]);
        assert.deepEqual(scoreParts(excerptXml), [name], `excerpt ${id} holds only ${name}`);
        const image = await renderer.render(await score.saveSvg(0));
        assert.ok(image.png.length > 0);
      }
      await score.setExcerptId(2);
      await assert.rejects(score.npages(), /Invalid/, 'generateExcerpts twice must not duplicate excerpts');
      await score.setExcerptId(0);
      await assert.rejects(score.saveMsc('mscz'), /not supported/, 'saving a part as MSCZ fails explicitly');

      // An edit on the Flute part is a linked edit of the master's Flute part, undoable from either score.
      await score.setExcerptId(-1);
      const masterBefore = await score.saveXml();
      await score.setExcerptId(0);
      const partBefore = await score.saveXml();
      assert.equal(await score.selectPartMeasureByIndex(0, 1), true);
      assert.equal(await score.pitchUp(), true);
      const partAfter = await score.saveXml();
      assert.notEqual(partAfter, partBefore, 'part edit changes the part');
      await score.setExcerptId(-1);
      const masterAfter = await score.saveXml();
      assert.notEqual(masterAfter, masterBefore, 'part edit reaches the master score');
      assert.equal(await score.undo(), true);
      assert.equal(await score.saveXml(), masterBefore, 'undo from the master restores it');
      await score.setExcerptId(0);
      const partUndone = await score.saveXml();
      if (process.env.MS47_DEBUG_PARTS) { await writeFile(`${output}/debug-part-before.xml`, partBefore); await writeFile(`${output}/debug-part-undone.xml`, partUndone); }
      assert.equal(partUndone, partBefore, 'and the part');
      assert.equal(await score.redo(), true);
      assert.equal(await score.saveXml(), partAfter, 'redo from the part');
      report.excerpts = ['generate', 'idempotent', 'scopedExports', 'invalidId', 'partSaveRejected', 'linkedEditUndo'];
      console.log('verified parts: excerpts, scoping, linked edit and undo across scores');
    } finally { score.destroy(); }
  }

  // Part mutations
  const cases = [
    ['appendPart', ['violin'], xml => assert.deepEqual(scoreParts(xml).slice(2), ['Violin'])],
    ['appendPartByMusicXmlId', ['strings.violin'], xml => assert.equal(scoreParts(xml).length, 3)],
    ['removePart', [1], xml => assert.deepEqual(scoreParts(xml), ['Flute'])],
    ['setPartVisible', [1, false], async (xml, s) => assert.match(await native(s), /<Part\b[\s\S]*?<show>0<\/show>|<Part\b[\s\S]*?<visible>0<\/visible>/)],
  ];
  report.mutations = [];
  for (const [name, args, check] of cases) {
    const score = await WebMscore.load('musicxml', fixture);
    try {
      const xmlBefore = await score.saveXml(), nativeBefore = await native(score);
      const index = (await score.getUndoInfo()).index;
      const beforeImage = (await renderer.render(await score.saveSvg())).png;
      const t = performance.now();
      assert.equal(await score[name](...args), true, `${name} must succeed`);
      const ms = performance.now() - t;
      const xmlAfter = await score.saveXml();
      assert.notEqual(await native(score), nativeBefore, `${name} must persist a native change`);
      await check(xmlAfter, score);
      assert.equal((await score.getUndoInfo()).index, index + 1, `${name} must be one undo command`);
      const afterImage = (await renderer.render(await score.saveSvg())).png;
      assert.ok(!afterImage.equals(beforeImage), `${name} must visibly change the score`);
      assert.equal(await score.undo(), true);
      assert.equal(await score.saveXml(), xmlBefore, `${name} undo must restore MusicXML`);
      assert.ok((await renderer.render(await score.saveSvg())).png.equals(beforeImage), `${name} undo must restore pixels`);
      assert.equal(await score.redo(), true);
      assert.equal(await score.saveXml(), xmlAfter, `${name} redo must restore MusicXML`);
      await writeFile(`${output}/part-${name}.musicxml`, xmlAfter);
      report.mutations.push({ name, args, ms });
      console.log(`verified part ${name} (${ms.toFixed(1)} ms)`);
    } finally { score.destroy(); }
  }
  for (const [name, args] of [['appendPart', ['no-such-instrument']], ['appendPartByMusicXmlId', ['no.such.id']], ['removePart', [9]], ['setPartVisible', [9, false]]]) {
    const score = await WebMscore.load('musicxml', fixture);
    try {
      const xml = await score.saveXml(), index = (await score.getUndoInfo()).index;
      assert.equal(await score[name](...args), false, `${name} must reject ${JSON.stringify(args)}`);
      assert.equal(await score.saveXml(), xml);
      assert.equal((await score.getUndoInfo()).index, index);
    } finally { score.destroy(); }
  }
  console.log('verified part mutation rejections');

  // Compressed MusicXML: a zip whose score document is the same MusicXML saveXml returns (master and part)
  {
    const score = await WebMscore.load('musicxml', fixture);
    try {
      for (const id of [-1, 0]) {
        if (id === 0) await score.generateExcerpts();
        await score.setExcerptId(id);
        const mxl = Buffer.from(await score.saveMxl());
        assert.equal(mxl.subarray(0, 2).toString('latin1'), 'PK', 'MXL is a zip archive');
        assert.ok(mxl.includes(Buffer.from('META-INF/container.xml')), 'MXL has a container');
        assert.ok(mxl.length < Buffer.byteLength(await score.saveXml()), 'MXL is compressed');
      }
      report.saveMxl = true;
      console.log('verified saveMxl for the master score and a part');
    } finally { score.destroy(); }
  }

  // Instrument templates
  {
    const score = await WebMscore.load('musicxml', fixture);
    try {
      const groups = await score.listInstrumentTemplates();
      assert.ok(Array.isArray(groups) && groups.length > 5);
      const all = groups.flatMap(g => g.instruments);
      const byId = id => all.find(i => i.id === id);
      assert.equal(byId('violin')?.staffCount, 1);
      assert.equal(byId('piano')?.staffCount, 2);
      const incomplete = all.filter(i => !(i.id && i.name && i.groupId && typeof i.isExtended === 'boolean'));
      assert.deepEqual(incomplete, [], 'every template has id, name, group and extended flag');
      report.instrumentTemplates = all.length;
      console.log(`verified listInstrumentTemplates (${groups.length} groups, ${all.length} instruments)`);
    } finally { score.destroy(); }
  }

  // Fallback fonts: CJK text is measured with the registered font (global state: last)
  if (existsSync(CJK_FONT)) {
    const dir = await mkdtemp(path.join(tmpdir(), 'ms47-font-'));
    try {
      const fontPath = path.join(dir, 'cjk.ttf');
      await copyFile(CJK_FONT, fontPath);
      const notFont = path.join(dir, 'not-a-font.ttf');
      await writeFile(notFont, 'not a font');
      // A centred title is placed at centre - width/2, so its x in the SVG shows the engine's measured width.
      // drawn() reports whether a title of CJK only is painted at all (all-missing-glyph text lays out empty).
      const title = async text => {
        const score = await WebMscore.load('musicxml', fixture);
        try {
          assert.equal(await score.setTitleText(text), true);
          const svg = await score.saveSvg(0);
          if (process.env.MS47_DEBUG_PARTS) await writeFile(`${output}/debug-title-${text.length}.svg`, svg);
          const match = svg.match(new RegExp(`<text x="([-\\d.]+)"[^>]*>${text}<`));
          return match ? Number(match[1]) : null;
        } finally { score.destroy(); }
      };
      const titleX = async () => {
        const x = await title('Title音楽音楽');
        assert.ok(x !== null, 'mixed title is drawn');
        return x;
      };
      const cjkOnlyBefore = await title('音楽音楽');
      const before = await titleX();
      // A MEMFS engine (browser package) cannot see host paths: pass the bytes, as the editor does
      const font = async file => (WebMscore.bundled ? new Uint8Array(await readFile(file)) : file);
      assert.equal(await WebMscore.addFont(await font(notFont)), false, 'a non-font file is rejected');
      assert.equal(await WebMscore.addFont(await font(fontPath)), true);
      const after = await titleX();
      const cjkOnlyAfter = await title('音楽音楽');
      assert.ok(Math.abs(after - before) > 1e-6, `registered fallback changes the centred CJK title position (x ${before} -> ${after})`);
      assert.ok(cjkOnlyAfter !== null, 'with the fallback registered, a CJK-only title is drawn');
      report.addFont = { before, after, cjkOnlyDrawnBefore: cjkOnlyBefore !== null, cjkOnlyDrawnAfter: true };
      console.log(`verified addFont fallback (centred CJK title x ${before.toFixed(2)} -> ${after.toFixed(2)})`);
    } finally { await rm(dir, { recursive: true, force: true }); }
  } else {
    console.log(`skipped addFont fallback check: ${CJK_FONT} not present`);
  }
  return report;
}
