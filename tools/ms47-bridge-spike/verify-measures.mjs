import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const raw = await readFile(new URL('./edit-fixture.musicxml', import.meta.url), 'utf8');
const fixture = new TextEncoder().encode(raw.replace('</part>', Array.from({ length: 4 }, (_, i) => `<measure number="${i + 3}"><note><rest measure="yes"/><duration>8</duration></note></measure>`).join('') + '</part>'));
const bars = xml => [...xml.matchAll(/<measure\b[^>]*>([\s\S]*?)<\/measure>/g)].map(m => m[1]);
const native = async score => Buffer.from(await score.saveMsc('mscx')).toString('utf8');
const assertMarker = (mscx, subtype) => {
  const markers = mscx.match(/<Marker\b[\s\S]*?<\/Marker>/g) ?? [];
  assert.ok(markers.some(m => m.includes(`>${subtype}<`)), `expected a ${subtype} Marker, found: ${markers.join('\n') || 'none'}`);
};

export async function verifyMeasures(WebMscore, renderer, output, Module) {
  const cases = [
    ['toggleRepeatStart', [], 0, xml => assert.match(xml, /direction="forward"/)],
    ['toggleRepeatEnd', [], 1, xml => assert.match(xml, /direction="backward"/)],
    ['setRepeatCount', [3], 1, xml => assert.match(xml, /times="3"/)],
    ['setBarLineType', [2], 0, xml => assert.match(xml, /<bar-style>light-light/)],
    ['addVolta', [1], 0, xml => assert.match(xml, /<ending[^>]*number="1"/)],
    ['addMarker', [0], 0, xml => assert.match(xml, /<segno[ >\/]/)],
    ['addJump', [0], 1, xml => assert.match(xml, /dacapo="yes"/)],
    // Legacy DCODA/DDBLCODA jumps are markers in 4.x (upstream 3a42d912ae, #16294)
    ['addJump', [12], 1, async (xml, score) => assertMarker(await native(score), 'dacoda')],
    ['addJump', [13], 1, async (xml, score) => assertMarker(await native(score), 'dadblcoda')],
    ['addMeasureRepeat', [1], 2, xml => assert.match(xml, /<measure-repeat[^>]*type="start"/)],
    ['addMeasureRepeat', [2], 2, xml => assert.match(xml, /<measure-repeat[^>]*type="start"/)],
    ['addMeasureRepeat', [4], 2, xml => assert.match(xml, /<measure-repeat[^>]*type="start"/)],
    ...[0, 1, 2, 3].map(target => ['insertMeasures', [2, target], 1, xml => assert.equal(bars(xml).length, 8)]),
    ['addPickupMeasure', [1, 4], 0, async (xml, score) => {
      assert.equal(bars(xml).length, 7);
      assert.match(xml, /<measure number="0" implicit="yes"/);
      assert.deepEqual(await score.irregularMeasures(), [{ index: 0, number: '0', actual: '1/4', nominal: '4/4', irregular: true, pickup: true }]);
    }],
    ['removeTrailingEmptyMeasures', [], 0, xml => assert.equal(bars(xml).length, 2)],
    ['removeSelectedMeasures', [], 1, xml => assert.equal(bars(xml).length, 5)],
    ['setMeasureLineBreaks', [[true, false, true]], 0, async (xml, score) => assert.deepEqual(await score.measureLineBreaks(), [true, false, true, false, false, false])],
    ['setMeasureSpacer', [0, 0, 18], 0, async (xml, score) => assert.match(await native(score), /<vspacerDown>18<\/vspacerDown>/)],
  ];
  const results = [];
  for (const [name, args, selected, check] of cases) {
    if (process.env.MS47_MEASURE_CASES && !process.env.MS47_MEASURE_CASES.split(',').includes(name)) continue;
    const score = await WebMscore.load('musicxml', fixture);
    try {
      await score.selectPartMeasureByIndex(0, selected);
      const before = await score.saveXml(), beforeNative = await native(score);
      const beforeImage = (await renderer.render(await score.saveSvg())).png;
      const index = (await score.getUndoInfo()).index;
      const start = performance.now();
      assert.equal(await score[name](...args), true, name);
      const ms = performance.now() - start;
      const after = await score.saveXml(), afterNative = await native(score);
      assert.notEqual(afterNative, beforeNative, `${name} persists a native change`);
      await check(after, score);
      assert.equal((await score.getUndoInfo()).index, index + 1, `${name} is one undo entry`);
      const afterSvg = await score.saveSvg();
      await writeFile(`${output}/measure-${name}-debug.svg`, afterSvg);
      const afterImage = (await renderer.render(afterSvg)).png;
      if (name !== 'setMeasureSpacer') assert.ok(!afterImage.equals(beforeImage), `${name} must visibly change the score`);
      if (name === 'addMarker') assert.match(afterSvg, /data-font-outline="true"/, 'Bravura Text uses native glyph outlines');
      await writeFile(`${output}/measure-${name}-${args.join('-').replaceAll(',', '_')}.musicxml`, after);
      await score.undo();
      assert.equal(await score.saveXml(), before, `${name} undo restores MusicXML`);
      assert.ok((await renderer.render(await score.saveSvg())).png.equals(beforeImage), `${name} undo restores pixels`);
      await score.redo();
      assert.equal(await score.saveXml(), after, `${name} redo restores MusicXML`);
      assert.ok((await renderer.render(await score.saveSvg())).png.equals(afterImage), `${name} redo restores pixels`);
      if (name === 'addMeasureRepeat' && args[0] > 1) {
        await score.selectPartMeasureByIndex(0, selected + 1);
        assert.equal(await score.toggleRepeatStart(), false, 'A repeat start cannot split a measure-repeat group');
        await score.selectPartMeasureByIndex(0, selected);
        assert.equal(await score.toggleRepeatEnd(), false, 'A repeat end cannot split a measure-repeat group');
      }
      if (name === 'addPickupMeasure') {
        assert.equal(await score.addPickupMeasure(1, 8), false, 'Reject a second pickup');
        const pickup = await score.saveXml();
        assert.equal(await score.setMeasureLengthToTimeSignature(0), true);
        assert.deepEqual(await score.irregularMeasures(), []);
        await score.undo(); assert.equal(await score.saveXml(), pickup);
        await score.redo(); assert.deepEqual(await score.irregularMeasures(), []);
      }
      if (name === 'setMeasureSpacer') {
        assert.equal(await score.setMeasureSpacer(0, 0, 20), true);
        assert.match(await native(score), /<vspacerDown>20<\/vspacerDown>/);
        await score.undo(); assert.match(await native(score), /<vspacerDown>18<\/vspacerDown>/);
        assert.equal(await score.setMeasureSpacer(0, 0, 0), true);
        assert.doesNotMatch(await native(score), /<vspacerDown>/);
        await score.undo(); assert.match(await native(score), /<vspacerDown>18<\/vspacerDown>/);
      }
      results.push({ name, args, ms });
      console.log(`verified measure ${name} ${JSON.stringify(args)}`);
    } finally { score.destroy(); }
  }
  const metadata = await verifyMeasureData(WebMscore, Module);
  const geometry = await verifyMeasureGeometry(WebMscore, renderer);
  return { cases: results, metadata, geometry };
}

async function verifyMeasureData(WebMscore, Module) {
  const score = await WebMscore.load('musicxml', fixture);
  try {
    assert.equal(await score.measureSignatureCount(0), 6);
    assert.equal(await score.measureSignatureCount(-1), 0);
    assert.equal(await score.measureSignatureAt(0, -1), '');
    assert.deepEqual(await score.measureSignatures(99), []);
    const signatures = await score.measureSignatures(0);
    assert.equal(signatures.length, 6);
    assert.equal(signatures[0], await score.measureSignatureAt(0, 0));
    assert.match(signatures[0], /^4\/4\|0\|1\|S0:V0=N0o4:8 N2o4:8 N4o4:8 N5o4:8 R:2,V1=,V2=,V3=$/);
    assert.deepEqual(await score.irregularMeasures(), []);
    assert.deepEqual(await score.measureLineBreaks(), Array(6).fill(false));
    assert.deepEqual(await score.measureRangeForPage(0), { startMeasureIndex: 0, endMeasureIndex: 5 });
    assert.equal(await score.measureRangeForPage(-1), null);
    assert.equal(await score.measureRangeForPage(999), null);
    assert.equal(await score.selectionMeasureRange(), null);
    for (const [name, args] of [
      ['toggleRepeatStart', []], ['toggleRepeatEnd', []], ['setRepeatCount', [3]], ['setBarLineType', [2]], ['addVolta', [1]], ['addMarker', [0]], ['addJump', [0]], ['removeSelectedMeasures', []], ['insertMeasures', [1, 0]],
    ]) assert.equal(await score[name](...args), false, `${name} rejects missing selection`);
    await score.selectPartMeasureByIndex(0, 1);
    assert.deepEqual(await score.selectionMeasureRange(), { startMeasureIndex: 1, endMeasureIndex: 1 });
    await score.selectAll();
    assert.deepEqual(await score.selectionMeasureRange(), { startMeasureIndex: 0, endMeasureIndex: 5 });
    const xml = await score.saveXml();
    const index = (await score.getUndoInfo()).index;
    for (const [name, args] of [
      ['setRepeatCount', [1]], ['setBarLineType', [-1]], ['setBarLineType', [4]], ['addVolta', [0]], ['addMarker', [8]], ['addJump', [14]], ['addMeasureRepeat', [3]], ['insertMeasures', [0, 3]], ['addPickupMeasure', [5, 4]], ['setMeasureLengthToTimeSignature', [-1]], ['setMeasureSpacer', [-1, 0, 1]], ['setMeasureSpacer', [0, 99, 1]],
    ]) assert.equal(await score[name](...args), false, `${name} rejects ${JSON.stringify(args)}`);
    // Malformed native JSON must be rejected without opening an undo command.
    for (const text of ['{', '{}', 'null']) {
      const ptr = Module._malloc(text.length + 1); Module.stringToUTF8(text, ptr, text.length + 1);
      try { assert.equal(Module.ccall('setMeasureLineBreaks', 'boolean', ['number', 'number', 'number', 'number'], [score.scoreptr, ptr, text.length, score.excerptId]), false); }
      finally { Module._free(ptr); }
    }
    assert.equal(await score.saveXml(), xml);
    assert.equal((await score.getUndoInfo()).index, index);
    await score.setMeasureLineBreaks([1, 'true', null, true]);
    assert.deepEqual(await score.measureLineBreaks(), [false, false, false, true, false, false], 'Non-boolean entries keep legacy false semantics');
    await score.undo(); assert.equal(await score.saveXml(), xml);
    await score.selectPartMeasureByIndex(0, 0); await score.pitchUp();
    const changed = await score.measureSignatures(0);
    assert.notEqual(changed[0], signatures[0]); assert.deepEqual(changed.slice(1), signatures.slice(1));
    await score.undo(); assert.deepEqual(await score.measureSignatures(0), signatures);
    await score.setMultiMeasureRests(true);
    const collapsedCount = await score.measureSignatureCount(0);
    assert.ok(collapsedCount < 6, 'Metadata uses native collapsed multimeasure-rest indices');
    assert.equal((await score.measureSignatures(0)).length, collapsedCount);
    await score.selectPartMeasureByIndex(0, collapsedCount - 1);
    assert.deepEqual(await score.selectionMeasureRange(), { startMeasureIndex: collapsedCount - 1, endMeasureIndex: collapsedCount - 1 });
    return { signatures, collapsedCount, validation: true };
  } finally { score.destroy(); }
}


async function verifyMeasureGeometry(WebMscore, renderer) {
  const score = await WebMscore.load('musicxml', new Uint8Array(await readFile(new URL('../../public/test_scores/two_staves_four_bars_lower_edit.musicxml', import.meta.url))));
  try {
    const before = await score.staffSystemBands();
    assert.equal(before.length, 2);
    const printed = (await renderer.render(await score.saveSvg())).png;
    assert.equal(await score.setMeasureSpacer(0, 0, 80), true);
    const after = await score.staffSystemBands();
    assert.ok(after[1].y - after[0].y > before[1].y - before[0].y, 'Spacer changes actual staff geometry');
    assert.ok(!(await renderer.render(await score.saveSvg())).png.equals(printed));
    await score.undo();
    assert.deepEqual(await score.staffSystemBands(), before);
    assert.ok((await renderer.render(await score.saveSvg())).png.equals(printed));
  } finally { score.destroy(); }
  const bach = await WebMscore.load('mscz', new Uint8Array(await readFile(new URL('../../public/test_scores/bach_orig.mscz', import.meta.url))));
  try {
    const musicPages = new Set((await bach.staffSystemBands()).map(b => b.page));
    let next = 0;
    const ranges = [];
    for (let page = 0; page < await bach.npages(); ++page) {
      const range = await bach.measureRangeForPage(page);
      if (!musicPages.has(page)) { assert.equal(range, null); continue; }
      assert.equal(range.startMeasureIndex, next);
      assert.ok(range.endMeasureIndex >= next);
      await bach.selectPartMeasureByIndex(0, next);
      assert.deepEqual(await bach.selectionMeasureRange(), { startMeasureIndex: next, endMeasureIndex: next });
      next = range.endMeasureIndex + 1;
      ranges.push({ page, ...range });
    }
    assert.equal(next, await bach.measureSignatureCount(0));
    return { spacerUndo: true, pageRanges: ranges };
  } finally { bach.destroy(); }
}
