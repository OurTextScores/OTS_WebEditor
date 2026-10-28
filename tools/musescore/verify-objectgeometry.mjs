import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Exercises the actual node WASM bridge, not a mocked score. Selection is used only to find test coordinates.
export async function verifyObjectGeometry(WebMscore, renderer, Module) {
  const bytes = new Uint8Array(await readFile(new URL('./edit-fixture.musicxml', import.meta.url)));
  const score = await WebMscore.load('musicxml', bytes);
  try {
    assert.equal(typeof score.hitTestScoreObject, 'function');
    await score.selectPartMeasureByIndex(0, 0);
    assert.equal(Module.ccall('convertRangeToListSelection', 'boolean', ['number', 'number'], [score.scoreptr, score.excerptId]), true);
    const boxes = await score.getSelectionBoundingBoxes();
    assert.ok(boxes.length >= 5);
    const beforeXml = await score.saveXml();
    const beforeUndo = await score.getUndoInfo();
    const beforeBoxes = await score.getSelectionBoundingBoxes();
    const beforeSvg = await score.saveSvg(0, true, true);
    const results = [];
    for (const box of boxes) {
      const result = await score.hitTestScoreObject(box.page, box.x + box.width / 2, box.y + box.height / 2);
      results.push(result);
    }
    const notes = results.filter(result => result.status === 'ok' && result.kind === 'note');
    const rests = results.filter(result => result.status === 'ok' && result.kind === 'rest');
    assert.ok(notes.length > 0, `note hit: ${JSON.stringify(results)}`);
    assert.ok(rests.length > 0, `rest hit: ${JSON.stringify(results)}`);
    for (const hit of [...notes, ...rests]) {
      assert.equal(hit.schemaVersion, 1);
      assert.equal(hit.coordinateSpace, 'page-local-360dpi');
      assert.equal(hit.location.measureIndex, 0);
      assert.equal(hit.location.staffIndex, 0);
      assert.equal(hit.location.voiceIndex, 0);
      assert.equal(hit.geometry.page, 0);
      assert.ok(hit.geometry.width > 0 && hit.geometry.height > 0);
      assert.equal('handle' in hit, false);
    }
    assert.equal((await score.hitTestScoreObject(0, -1000, -1000)).status, 'no-hit');
    for (const args of [[-1, 0, 0], [999, 0, 0], [0, NaN, 0], [0, Infinity, 0], [0.5, 0, 0], [2147483648, 0, 0], [0, 1e308, 0]]) {
      assert.equal((await score.hitTestScoreObject(...args)).status, 'invalid-input');
    }
    await score.setExcerptId(999);
    assert.equal((await score.hitTestScoreObject(0, 0, 0)).status, 'invalid-input');
    await score.setExcerptId(-1);
    assert.deepEqual(await score.getSelectionBoundingBoxes(), beforeBoxes);
    assert.deepEqual(await score.getUndoInfo(), beforeUndo);
    assert.equal(await score.saveXml(), beforeXml);
    assert.equal(await score.saveSvg(0, true, true), beforeSvg);
    // Unsupported text hit must not be mistaken for an underlying note or a no-hit.
    await score.setTitleText('Geometry query title');
    const svg = await score.saveSvg();
    const point = await renderer.textPoint(svg, 'Geometry query title');
    assert.equal((await score.hitTestScoreObject(0, ...point)).status, 'unsupported');
    await score.undo();
    assert.equal(await score.saveXml(), beforeXml);
    // Invisible notation must not be reported as a visible hit after the native property changes.
    await score.selectElementAtPoint(boxes[3].page, boxes[3].x + boxes[3].width / 2, boxes[3].y + boxes[3].height / 2);
    assert.equal(await score.setSelectedElementProperty('visible', false), true);
    const hiddenHit = await score.hitTestScoreObject(boxes[3].page, boxes[3].x + boxes[3].width / 2, boxes[3].y + boxes[3].height / 2);
    assert.notEqual(hiddenHit.status, 'ok', 'hidden target must not be returned as a visible note');
    assert.equal(await score.undo(), true);
    await score.selectPartMeasureByIndex(0, 1);
    assert.equal(Module.ccall('convertRangeToListSelection', 'boolean', ['number', 'number'], [score.scoreptr, score.excerptId]), true);
    const chord = (await score.getSelectionBoundingBoxes())[0];
    const chordHit = await score.hitTestScoreObject(chord.page, chord.x + chord.width / 2, chord.y + chord.height / 2);
    assert.equal(chordHit.status, 'ok');
    assert.equal(chordHit.kind, 'note');
    assert.equal(chordHit.location.measureIndex, 1);
    await score.relayout();
    const afterLayout = await score.hitTestScoreObject(boxes[0].page, boxes[0].x + boxes[0].width / 2, boxes[0].y + boxes[0].height / 2);
    assert.equal(afterLayout.status, 'ok');
    const pages = await verifyMultiPage(WebMscore, Module);
    const excerpt = await verifyExcerpt(WebMscore, Module, bytes);
    const polyphony = await verifyPolyphony(WebMscore, Module, bytes);
    return { notes: notes.length, rests: rests.length, selectionUnchanged: true, noHandles: true, pages, excerpt, polyphony };
  } finally { await score.destroy(); }
}

async function verifyMultiPage(WebMscore, Module) {
  const bytes = new Uint8Array(await readFile(new URL('../../public/test_scores/bach_orig.mscz', import.meta.url)));
  const score = await WebMscore.load('mscz', bytes);
  try {
    await score.selectAll();
    assert.equal(Module.ccall('convertRangeToListSelection', 'boolean', ['number', 'number'], [score.scoreptr, score.excerptId]), true);
    const boxes = await score.getSelectionBoundingBoxes();
    const pageNumbers = [...new Set(boxes.map(box => box.page))];
    assert.ok(pageNumbers.length >= 2);
    for (const pageNumber of pageNumbers) {
      let found = false;
      for (const box of boxes.filter(box => box.page === pageNumber)) {
        const hit = await score.hitTestScoreObject(pageNumber, box.x + box.width / 2, box.y + box.height / 2);
        if (hit.status === 'ok') { assert.equal(hit.geometry?.page, pageNumber); found = true; break; }
      }
      assert.ok(found, `note or rest hit on page ${pageNumber}`);
    }
    assert.deepEqual(await score.getSelectionBoundingBoxes(), boxes);
    return pageNumbers;
  } finally { await score.destroy(); }
}

async function verifyExcerpt(WebMscore, Module, bytes) {
  const score = await WebMscore.load('musicxml', bytes);
  try {
    await score.generateExcerpts();
    await score.setExcerptId(0);
    assert.equal(await score.selectPartMeasureByIndex(0, 0), true);
    assert.equal(Module.ccall('convertRangeToListSelection', 'boolean', ['number', 'number'], [score.scoreptr, score.excerptId]), true);
    const boxes = await score.getSelectionBoundingBoxes();
    const box = boxes[0];
    assert.ok(box);
    const hit = await score.hitTestScoreObject(box.page, box.x + box.width / 2, box.y + box.height / 2);
    assert.equal(hit.status, 'ok');
    assert.equal(hit.kind, 'note');
    assert.equal(hit.location.measureIndex, 0);
    assert.deepEqual(await score.getSelectionBoundingBoxes(), boxes);
    return true;
  } finally { await score.destroy(); }
}

async function verifyPolyphony(WebMscore, Module, bytes) {
  const xml = new TextDecoder().decode(bytes).replace('</measure>',
    '<backup><duration>8</duration></backup><note><pitch><step>G</step><octave>5</octave></pitch><duration>8</duration><voice>2</voice><type>whole</type></note></measure>');
  const score = await WebMscore.load('musicxml', new TextEncoder().encode(xml));
  try {
    await score.selectPartMeasureByIndex(0, 0);
    assert.equal(Module.ccall('convertRangeToListSelection', 'boolean', ['number', 'number'], [score.scoreptr, score.excerptId]), true);
    const boxes = await score.getSelectionBoundingBoxes();
    const hits = [];
    for (const box of boxes) {
      hits.push(await score.hitTestScoreObject(box.page, box.x + box.width / 2, box.y + box.height / 2));
    }
    assert.ok(hits.some(hit => hit.status === 'ok' && hit.kind === 'note' && hit.location.voiceIndex === 1),
      `second voice is identified: ${JSON.stringify(hits)}`);
    assert.deepEqual(await score.getSelectionBoundingBoxes(), boxes);
    return true;
  } finally { await score.destroy(); }
}
