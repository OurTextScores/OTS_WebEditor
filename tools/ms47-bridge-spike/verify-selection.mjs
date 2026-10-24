import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const center = box => [box.page, box.x + box.width / 2, box.y + box.height / 2];
const validBox = box => box && Number.isInteger(box.page) && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(box[k])) && box.width > 0 && box.height > 0;

export async function verifySelection(WebMscore, renderer, Module) {
  const bytes = new Uint8Array(await readFile(new URL('./edit-fixture.musicxml', import.meta.url)));
  const rawScore = await WebMscore.load('musicxml', bytes);
  const times = {};
  const score = new Proxy(rawScore, { get(target, name) {
    const value = target[name];
    if (typeof value !== 'function') return value;
    return async (...args) => {
      const start = performance.now();
      try { return await value.apply(target, args); }
      finally { (times[name] ||= []).push(performance.now() - start); }
    };
  } });
  try {
    const xml = await score.saveXml();
    const printed = (await renderer.render(await score.saveSvg())).png;
    const undoIndex = (await score.getUndoInfo()).index;
    assert.equal(await score.getSelectionBoundingBox(), null);
    assert.deepEqual(await score.getSelectionBoundingBoxes(), []);
    for (const method of ['selectElementAtPoint', 'selectTextElementAtPoint', 'selectMeasureAtPoint', 'extendMeasureSelectionAtPoint']) {
      assert.equal(await score[method](-1, 0, 0), false);
      assert.equal(await score[method](999, 0, 0), false);
      assert.equal(await score[method](0, -1000, -1000), false);
    }
    await score.selectPartMeasureByIndex(0, 0);
    const ranges = await score.getSelectionBoundingBoxes();
    assert.equal(ranges.length, 1);
    assert.ok(ranges.every(validBox));
    assert.equal(await score.selectMeasureAtPoint(...center(ranges[0])), true);
    assert.equal(await score.isSelectionRange(), true);
    assert.deepEqual(await score.getSelectionBoundingBoxes(), ranges);
    assert.equal(Module.ccall('convertRangeToListSelection', 'boolean', ['number', 'number'], [score.scoreptr, score.excerptId]), true);
    assert.equal(await score.isSelectionRange(), false);
    const notes = await score.getSelectionBoundingBoxes();
    assert.equal(notes.length, 5, 'Four notes and a rest become a list');
    assert.ok(notes.every(validBox));
    const point = center(notes[0]);
    assert.equal(await score.selectElementAtPoint(...point), true);
    assert.equal((await score.getSelectedElementProperties()).elementType, 'Note');
    assert.ok(validBox(await score.getSelectionBoundingBox()));
    assert.equal((await score.getSelectionBoundingBoxes()).length, 1);
    assert.equal(await score.selectElementAtPointWithMode(...center(notes[1]), 1), true);
    assert.equal((await score.getSelectionBoundingBoxes()).length, 2);
    assert.equal(await score.selectElementAtPointWithMode(...center(notes[1]), 2), true);
    assert.equal((await score.getSelectionBoundingBoxes()).length, 1);
    assert.equal(await score.selectElementAtPointWithMode(...center(notes[2]), 3), true);
    assert.equal(await score.isSelectionRange(), true);
    assert.equal(await score.selectElementAtPointWithMode(...point, 0), true);
    assert.equal(await score.isSelectionRange(), false);
    assert.equal(await score.selectElementAtPointWithMode(...point, 4), false);
    assert.equal(await score.saveXml(), xml, 'Selection must not edit the score');
    assert.equal((await score.getUndoInfo()).index, undoIndex);
    assert.ok((await renderer.render(await score.saveSvg())).png.equals(printed));

    await score.selectPartMeasureByIndex(0, 0);
    const type = await score.selectionMimeType();
    const data = await score.selectionMimeData();
    assert.match(type, /staff/i);
    assert.ok(data instanceof Uint8Array && data.byteLength > 0);
    await score.selectPartMeasureByIndex(0, 1);
    const secondRange = (await score.getSelectionBoundingBoxes())[0];
    assert.equal(await score.extendMeasureSelectionAtPoint(...center(ranges[0])), true);
    const extended = await score.getSelectionBoundingBoxes();
    assert.equal(extended.length, 1);
    assert.ok(extended[0].width > ranges[0].width && extended[0].width > secondRange.width);
    await score.selectPartMeasureByIndex(0, 1);
    assert.equal(await score.pasteSelection(type, data), true);
    const pasted = await score.saveXml();
    assert.notEqual(pasted, xml);
    assert.equal((await score.getUndoInfo()).index, undoIndex + 1);
    const measures = [...pasted.matchAll(/<measure\b[^>]*>([\s\S]*?)<\/measure>/g)].map(m => m[1]);
    const pitches = m => [...m.matchAll(/<pitch>([\s\S]*?)<\/pitch>/g)].map(m => m[1].replace(/\s/g, ''));
    assert.deepEqual(pitches(measures[1]), pitches(measures[0]), 'Native paste copies the source pitches to the destination bar');
    await score.undo();
    assert.equal(await score.saveXml(), xml);
    assert.ok((await renderer.render(await score.saveSvg())).png.equals(printed));
    await score.redo();
    assert.equal(await score.saveXml(), pasted);
    await score.undo();
    assert.equal(await score.pasteSelection('unsupported/type', data), false);
    assert.equal(await score.pasteSelection(type, new Uint8Array()), false);
    assert.equal(await score.saveXml(), xml);

    await score.setTitleText('Point selection title');
    await score.clearSelection();
    // Locate title using its emitted native text position, then verify actual hit selection.
    const svg = await score.saveSvg();
    const paintedTitle = await renderer.textBounds(svg, 'Point selection title');
    const titlePoint = [paintedTitle.x + paintedTitle.width / 2, paintedTitle.y + paintedTitle.height / 2];
    assert.equal(await score.selectTextElementAtPoint(0, ...titlePoint), true);
    assert.equal((await score.getSelectedElementProperties()).elementType, 'Text');
    const nativeTitle = (await score.getSelectionBoundingBoxes())[0];
    assert.ok(Math.abs(nativeTitle.width / paintedTitle.width - 1) < 0.03, 'Measured and painted title widths agree within 3%');
    assert.ok(titlePoint[0] >= nativeTitle.x && titlePoint[0] <= nativeTitle.x + nativeTitle.width);
    assert.ok(titlePoint[1] >= nativeTitle.y && titlePoint[1] <= nativeTitle.y + nativeTitle.height);
    assert.equal(await score.setSelectedText('Selected title'), true);
    assert.equal(await score.title(), 'Selected title');
    const spatialCorpus = await verifySpatialCorpus(WebMscore, Module, renderer);
    console.log('verified point/mode/range selection, native clipboard paste and undo, title hit test');
    return { pointModes: true, rangeExtension: true, clipboardPasteUndo: true, titleHit: true, spatialCorpus, times };
  } finally { score.destroy(); }
}

async function verifySpatialCorpus(WebMscore, Module, renderer) {
  const results = [];
  for (const name of ['bach_orig.mscz', 'two_staves_four_bars_lower_edit.musicxml']) {
    const bytes = new Uint8Array(await readFile(new URL('../../public/test_scores/' + name, import.meta.url)));
    const score = await WebMscore.load(name.split('.').pop(), bytes);
    try {
      const xml = await score.saveXml();
      await score.selectAll();
      const rangeBoxes = await score.getSelectionBoundingBoxes();
      const bands = await score.staffSystemBands();
      assert.ok(rangeBoxes.length > 0 && rangeBoxes.every(validBox));
      assert.ok(bands.length > 0 && bands.every(b => Number.isFinite(b.y) && b.height > 0));
      assert.equal(await score.isSelectionRange(), true, 'Reading staff bands preserves selection');
      const pageCount = await score.npages();
      const musicPages = [...new Set(bands.map(b => b.page))];
      assert.deepEqual([...new Set(rangeBoxes.map(b => b.page))], musicPages, 'Ranges cover every page that contains staves');
      assert.ok(musicPages.length > 0 && musicPages.every(p => p >= 0 && p < pageCount));
      assert.equal(Module.ccall('convertRangeToListSelection', 'boolean', ['number', 'number'], [score.scoreptr, score.excerptId]), true);
      const notes = await score.getSelectionBoundingBoxes();
      for (const page of musicPages) {
        const note = notes.find(box => box.page === page && validBox(box));
        assert.ok(note, `A selectable item exists on page ${page}`);
        assert.equal(await score.selectElementAtPoint(...center(note)), true);
        assert.equal((await score.getSelectionBoundingBox()).page, page);
        assert.equal(await score.setInputStateFromSelection(), true);
        assert.equal(await score.setNoteEntryMode(true), true);
        const cursor = await score.getNoteInputCursorRect();
        assert.equal(cursor.page, page, 'Input cursor stays on the selected music page');
        assert.ok(validBox(cursor));
        await score.setNoteEntryMode(false);
      }
      // Bach includes a copyright VBox followed by an explicit page break.
      // Accurate text metrics can put that frame on a page without staves.
      const frameOnlyPages = [];
      for (let page = 0; page < pageCount; ++page) {
        if (musicPages.includes(page)) continue;
        const svg = await score.saveSvg(page);
        assert.match(svg, /copyright: cellofun.eu/);
        const point = await renderer.textPoint(svg, 'copyright: cellofun.eu');
        assert.equal(await score.selectTextElementAtPoint(page, ...point), true);
        assert.equal((await score.getSelectionBoundingBox()).page, page);
        frameOnlyPages.push(page);
      }
      assert.equal(await score.saveXml(), xml);
      results.push({ name, pageCount, rangeBoxes: rangeBoxes.length, bands: bands.length, frameOnlyPages });
    } finally { score.destroy(); }
  }
  return results;
}
