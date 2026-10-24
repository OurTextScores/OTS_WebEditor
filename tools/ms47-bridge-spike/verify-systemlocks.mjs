import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const raw = await readFile(new URL('./edit-fixture.musicxml', import.meta.url), 'utf8');
const fixture = new TextEncoder().encode(raw.replace('</part>', Array.from({ length: 6 }, (_, i) => `<measure number="${i + 3}"><note><rest measure="yes"/><duration>8</duration></note></measure>`).join('') + '</part>'));
const native = async score => new TextDecoder().decode(await score.saveMsc('mscx'));
const select = async (score, first, last = first) => {
  assert.equal(await score.selectPartMeasureByIndex(0, first), true);
  for (let i = first; i < last; i++) assert.equal(await score.extendSelectionNextMeasure(), true);
};
const locks = async score => (await score.getSystemLockState()).locks;

export async function verifySystemLocks(WebMscore, renderer, Module) {
  const score = await WebMscore.load('musicxml', fixture);
  try {
    await score.setTitleText('System lock title');
    const title = await renderer.textBounds(await score.saveSvg(), 'System lock title');
    assert.equal(await score.selectTextElementAtPoint(0, title.x + title.width / 2, title.y + title.height / 2), true);
    assert.equal((await score.getSystemLockState()).selection, null, 'title frames cannot be system-locked');
    assert.equal(await score.setSystemLock(true), false, 'title selection rejected');
    await score.clearSelection();
    assert.deepEqual(await locks(score), []);
    assert.equal((await score.getSystemLockState()).selection, null);
    const initial = (await score.getUndoInfo()).index;
    assert.equal(await score.setSystemLock(true), false, 'no selection rejected');
    assert.equal(await score.setSystemLock('true'), false, 'JS rejects non-boolean');
    assert.equal(await score.moveSelectedMeasureToSystem('sideways'), false);
    assert.equal(Module.ccall('setSystemLock', 'boolean', ['number', 'number', 'number'], [score.scoreptr, 2, -1]), false);
    assert.equal((await score.getUndoInfo()).index, initial, 'invalid operations do not create history');
    await select(score, 0, 2);
    assert.deepEqual((await score.getSystemLockState()).selection, { startMeasure: 0, endMeasure: 2 });
    const before = await native(score);
    const pixelsBefore = (await renderer.render(await score.saveSvg())).png;
    assert.equal(await score.setSystemLock(true), true);
    assert.deepEqual(await locks(score), [{ startMeasure: 0, endMeasure: 2 }]);
    assert.equal((await score.getUndoInfo()).index, initial + 1);
    assert.equal((await score.getSystemLockState()).locked.value, true);
    const lockedNative = await native(score);
    assert.match(lockedNative, /<SystemLocks>/);
    const pixelsLocked = (await renderer.render(await score.saveSvg())).png;
    assert.ok(!pixelsLocked.equals(pixelsBefore), 'system lock visibly changes layout');
    assert.equal(await score.setSystemLock(true), false, 'identical lock is a no-op');
    await score.undo(); assert.deepEqual(await locks(score), []);
    assert.ok((await renderer.render(await score.saveSvg())).png.equals(pixelsBefore));
    await score.redo(); assert.deepEqual(await locks(score), [{ startMeasure: 0, endMeasure: 2 }]);
    assert.ok((await renderer.render(await score.saveSvg())).png.equals(pixelsLocked));
    const reopened = await WebMscore.load('mscx', new TextEncoder().encode(lockedNative));
    try { assert.deepEqual(await locks(reopened), [{ startMeasure: 0, endMeasure: 2 }]); }
    finally { reopened.destroy(); }

    await select(score, 1, 3);
    assert.equal((await score.getSystemLockState()).locked.mixed, true);
    assert.equal(await score.setSystemLock(false), true, 'unlock removes intersecting locks');
    assert.deepEqual(await locks(score), []);
    await score.undo();
    assert.equal(await score.setSystemLock(true), true, 'overlapping lock splits original span');
    assert.deepEqual(await locks(score), [{ startMeasure: 0, endMeasure: 0 }, { startMeasure: 1, endMeasure: 3 }]);
    await score.undo();

    await select(score, 3);
    assert.equal((await score.getSystemLockState()).canMovePrevious, true);
    assert.equal(await score.moveSelectedMeasureToSystem('previous'), true);
    assert.deepEqual(await locks(score), [{ startMeasure: 0, endMeasure: 3 }]);
    await score.undo(); assert.deepEqual(await locks(score), [{ startMeasure: 0, endMeasure: 2 }]);
    await select(score, 2);
    assert.equal(await score.moveSelectedMeasureToSystem('next'), true);
    assert.deepEqual(await locks(score), [{ startMeasure: 0, endMeasure: 1 }]);
    await score.undo();

    await select(score, 1);
    assert.equal(await score.insertMeasures(1, 0), true);
    assert.deepEqual(await locks(score), [{ startMeasure: 0, endMeasure: 3 }], 'inserting inside lock extends span');
    await score.undo(); assert.deepEqual(await locks(score), [{ startMeasure: 0, endMeasure: 2 }]);
    await select(score, 1);
    assert.equal(await score.removeSelectedMeasures(), true);
    assert.deepEqual(await locks(score), [{ startMeasure: 0, endMeasure: 1 }], 'deleting inside lock contracts span');
    await score.undo(); assert.deepEqual(await locks(score), [{ startMeasure: 0, endMeasure: 2 }]);

    await score.generateExcerpts();
    await score.setExcerptId(0);
    assert.deepEqual(await locks(score), [], 'new part has independent system layout');
    await select(score, 2);
    assert.deepEqual((await score.getSystemLockState()).selection, { startMeasure: 2, endMeasure: 7 }, 'collapsed rests expose their complete musical span');
    assert.equal(await score.setMultiMeasureRests(false), true);
    await select(score, 2, 4);
    assert.equal(await score.setSystemLock(true), true);
    assert.deepEqual(await locks(score), [{ startMeasure: 2, endMeasure: 4 }]);
    await score.setExcerptId(-1);
    assert.deepEqual(await locks(score), [{ startMeasure: 0, endMeasure: 2 }], 'part lock does not change master layout');
    await score.undo();
    await score.setExcerptId(0); assert.deepEqual(await locks(score), [], 'shared history undoes part layout');
    await score.redo(); assert.deepEqual(await locks(score), [{ startMeasure: 2, endMeasure: 4 }]);
    await score.setExcerptId(-1);
    const archive = await score.saveMsc('mscz');
    const roundtrip = await WebMscore.load('mscz', archive);
    try {
      assert.deepEqual(await locks(roundtrip), [{ startMeasure: 0, endMeasure: 2 }]);
      await roundtrip.setExcerptId(0);
      assert.deepEqual(await locks(roundtrip), [{ startMeasure: 2, endMeasure: 4 }], 'MSCZ retains independent part layout');
    } finally { roundtrip.destroy(); }
    assert.notEqual(lockedNative, before);
    console.log('verified system locks: selection, properties, overlap, moves, structure, parts, round trips, undo/redo and pixels');
    return { verified: true, checks: ['capabilities', 'invalid-input', 'selection', 'lock', 'unlock', 'overlap', 'move-previous', 'move-next', 'insert', 'delete', 'parts', 'mscx', 'mscz', 'undo-redo', 'pixels'] };
  } finally { score.destroy(); }
}
