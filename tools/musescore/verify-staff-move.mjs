// Real-engine validation of moving an existing cross-staff chord between staves.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const fixture = new URL('./fixtures/osmd-fidelity/cross-staff.musicxml', import.meta.url);
const noteFacts = xml => [...new JSDOM(xml, { contentType: 'application/xml' }).window.document.querySelectorAll('note')]
  .filter(note => note.querySelector('pitch'))
  .map(note => ({ step: note.querySelector('pitch > step')?.textContent, alter: note.querySelector('pitch > alter')?.textContent || '0',
    octave: note.querySelector('pitch > octave')?.textContent, staff: note.querySelector('staff')?.textContent || '1', voice: note.querySelector('voice')?.textContent }));

export async function verifyStaffMove(WebMscore) {
  const bytes = new Uint8Array(await readFile(fixture));
  const score = await WebMscore.load('musicxml', bytes);
  try {
    assert.equal(typeof score.moveSelectedChordRestToStaff, 'function', 'staff movement capability is present');
    assert.equal(await score.moveSelectedChordRestToStaff('up'), false, 'empty selection is rejected');
    assert.equal(await score.moveSelectedChordRestToStaff('invalid'), false, 'invalid direction is rejected');
    assert.equal(await score.selectPartMeasureByIndex(0, 0), true);
    assert.equal(await score.selectNextChord(), true);
    assert.equal(await score.selectPrevChord(), true); // F4 on staff 2, voice 1
    const before = await score.saveXml();
    const original = noteFacts(before);
    assert.deepEqual(original[3], { step: 'F', alter: '0', octave: '4', staff: '2', voice: original[0].voice });
    const index = (await score.getUndoInfo()).index;
    assert.equal(await score.moveSelectedChordRestToStaff('down'), false, 'bottom boundary is a no-op');
    assert.equal((await score.getUndoInfo()).index, index, 'no-op must not add undo history');
    assert.equal(await score.moveSelectedChordRestToStaff('up'), true);
    const moved = await score.saveXml();
    const movedFacts = noteFacts(moved);
    assert.deepEqual(movedFacts[3], { ...original[3], staff: '1' });
    assert.deepEqual(movedFacts.filter((_, i) => i !== 3), original.filter((_, i) => i !== 3), 'other written notes remain unchanged');
    assert.equal((await score.getUndoInfo()).index, index + 1, 'move is one undo command');
    assert.equal(await score.moveSelectedChordRestToStaff('up'), false, 'top boundary is a no-op');
    assert.equal((await score.getUndoInfo()).index, index + 1);
    assert.equal(await score.undo(), true);
    assert.deepEqual(noteFacts(await score.saveXml()), original, 'undo restores the original staff and voice');
    assert.equal(await score.redo(), true);
    assert.deepEqual(noteFacts(await score.saveXml()), movedFacts, 'redo restores the moved staff and voice');
    const reloaded = await WebMscore.load('musicxml', new TextEncoder().encode(moved));
    try { assert.deepEqual(noteFacts(await reloaded.saveXml()), movedFacts, 'MusicXML reload preserves the move'); }
    finally { await reloaded.destroy(); }
    await score.clearSelection();
    const incremental = await score.saveSvg(0, true, false);
    await score.relayout();
    assert.equal(await score.saveSvg(0, true, false), incremental, 'incremental layout matches full layout');
  } finally { await score.destroy(); }
  const rangeScore = await WebMscore.load('musicxml', bytes);
  try {
    assert.equal(await rangeScore.selectPartMeasureByIndex(0, 0), true);
    const before = noteFacts(await rangeScore.saveXml());
    const index = (await rangeScore.getUndoInfo()).index;
    assert.equal(await rangeScore.moveSelectedChordRestToStaff('up'), true, 'range can move eligible chords and rests');
    const after = noteFacts(await rangeScore.saveXml());
    assert.ok(after.some((note, i) => note.staff !== before[i].staff), 'at least one note changes staff');
    assert.deepEqual(after.map(({ staff, ...note }) => note), before.map(({ staff, ...note }) => note), 'range move preserves pitches and voices');
    assert.equal((await rangeScore.getUndoInfo()).index, index + 1, 'range move is a single undo command');
    assert.equal(await rangeScore.undo(), true);
    assert.deepEqual(noteFacts(await rangeScore.saveXml()), before, 'one undo restores the range');
  } finally { await rangeScore.destroy(); }
  const single = await WebMscore.load('musicxml', new Uint8Array(await readFile(new URL('./fixtures/osmd-fidelity/hidden-note.musicxml', import.meta.url))));
  try {
    assert.equal(await single.selectPartMeasureByIndex(0, 0), true);
    assert.equal(await single.selectNextChord(), true);
    const index = (await single.getUndoInfo()).index;
    assert.equal(await single.moveSelectedChordRestToStaff('up'), false, 'single-staff part cannot move up');
    assert.equal(await single.moveSelectedChordRestToStaff('down'), false, 'single-staff part cannot move down');
    assert.equal((await single.getUndoInfo()).index, index, 'boundary no-ops do not add undo history');
  } finally { await single.destroy(); }
  console.log('verified cross-staff move, range, boundary no-ops, undo/redo, round trip and layout');
}
