// Real engine edits of notation contained in the fidelity fixtures.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { assertFidelityRendering } from './verify-fidelity.mjs';

const fixtureDir = new URL('./fixtures/osmd-fidelity/', import.meta.url);
const doc = xml => new JSDOM(xml, { contentType: 'application/xml' }).window.document;
const pitched = document => [...document.querySelectorAll('note')].filter(note => note.querySelector('pitch'));
const pitch = note => [note.querySelector('pitch > step')?.textContent, note.querySelector('pitch > alter')?.textContent || '0', note.querySelector('pitch > octave')?.textContent];
const hidden = note => note.getAttribute('print-object') === 'no' || (note.querySelector('notehead')?.textContent === 'none' && note.querySelector('stem')?.textContent === 'none');
const hiddenHead = note => note.getAttribute('print-object') === 'no' || note.querySelector('notehead')?.textContent === 'none';

async function withScore(WebMscore, id, action) {
  const score = await WebMscore.load('musicxml', new Uint8Array(await readFile(new URL(`${id}.musicxml`, fixtureDir))));
  try { await action(score); } finally { await score.destroy(); }
}
async function reloadAndCheck(WebMscore, xml, check, renderId) {
  check(doc(xml));
  const reloaded = await WebMscore.load('musicxml', new TextEncoder().encode(xml));
  try {
    check(doc(await reloaded.saveXml()));
    if (renderId) assertFidelityRendering(renderId, await reloaded.saveSvg(0, true, false));
  } finally { await reloaded.destroy(); }
}
async function selectFirstMeasureEnd(score, previous = false) {
  assert.equal(await score.selectPartMeasureByIndex(0, 0), true);
  assert.equal(await score.selectNextChord(), true);
  if (previous) assert.equal(await score.selectPrevChord(), true);
}
async function applyAndCheckUndo(score, action) {
  const before = (await score.getUndoInfo()).index;
  assert.equal(await action(), true);
  assert.equal((await score.getUndoInfo()).index, before + 1, 'edit adds exactly one undo entry');
}

export async function verifyFidelityDirectEdits(WebMscore, renderer) {
  await withScore(WebMscore, 'tie-system-break', async score => {
    await selectFirstMeasureEnd(score);
    await applyAndCheckUndo(score, () => score.pitchUp());
    const check = document => {
      const notes = pitched(document);
      assert.deepEqual(pitch(notes[0]), ['C', '1', '4']);
      assert.deepEqual(pitch(notes[1]), ['C', '1', '4']);
      assert.ok(notes[0].querySelector('tie[type="start"]'));
      assert.ok(notes[1].querySelector('tie[type="stop"]'));
      assert.ok(document.querySelector('measure:nth-of-type(2) > print[new-system="yes"]'));
    };
    await reloadAndCheck(WebMscore, await score.saveXml(), check, 'tie-system-break');
    await score.clearSelection();
    assertFidelityRendering('tie-system-break', await score.saveSvg(0, true, false));
  });
  await withScore(WebMscore, 'slur-system-break', async score => {
    await selectFirstMeasureEnd(score); // the G at the end of the slur on system two
    await applyAndCheckUndo(score, () => score.pitchUp());
    const check = document => {
      const notes = pitched(document);
      assert.deepEqual(pitch(notes[0]), ['C', '0', '4']);
      assert.deepEqual(pitch(notes[4]), ['G', '1', '4']);
      assert.ok(notes[0].querySelector('slur[type="start"]'));
      assert.ok(notes[4].querySelector('slur[type="stop"]'));
    };
    await reloadAndCheck(WebMscore, await score.saveXml(), check, 'slur-system-break');
    await score.clearSelection();
    assertFidelityRendering('slur-system-break', await score.saveSvg(0, true, false));
  });
  await withScore(WebMscore, 'cross-staff', async score => {
    await selectFirstMeasureEnd(score, true); // F on the lower staff, in the upper staff's voice
    const box = await score.getSelectionBoundingBox();
    assert.ok(box && box.width > 0 && box.height > 0, 'cross-staff note has geometry');
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    const spatium = await score.getSpatium();
    const beforeUndo = (await score.getUndoInfo()).index;
    assert.equal(await score.beginElementDrag(box.page, x, y), true);
    assert.equal(await score.updateElementDrag(box.page, x, y - spatium, 0, 2), true);
    assert.equal(await score.endElementDrag(true), true);
    assert.equal((await score.getUndoInfo()).index, beforeUndo + 1, 'drag adds exactly one undo entry');
    const check = document => {
      const notes = pitched(document);
      assert.deepEqual(pitch(notes[3]), ['A', '0', '4']);
      assert.equal(notes[3].querySelector('staff')?.textContent, '2');
      assert.equal(notes[3].querySelector('voice')?.textContent, notes[0].querySelector('voice')?.textContent);
    };
    await reloadAndCheck(WebMscore, await score.saveXml(), check);
  });
  await withScore(WebMscore, 'hidden-note', async score => {
    await selectFirstMeasureEnd(score); // visible G in the second measure
    await applyAndCheckUndo(score, () => score.setSelectedElementProperty('visible', false));
    await reloadAndCheck(WebMscore, await score.saveXml(), document => {
      const notes = pitched(document);
      assert.equal(notes[4].querySelector('pitch > step')?.textContent, 'G');
      assert.ok(hidden(notes[0]), 'original hidden C remains hidden');
      assert.ok(hiddenHead(notes[4]), 'edited G notehead is hidden on export and reload');
    });
    await applyAndCheckUndo(score, () => score.setSelectedElementProperty('visible', true));
    await reloadAndCheck(WebMscore, await score.saveXml(), document => {
      const notes = pitched(document);
      assert.ok(hidden(notes[0]), 'original hidden C remains hidden');
      assert.equal(notes[4].querySelector('pitch > step')?.textContent, 'G');
      assert.ok(!hiddenHead(notes[4]), 'edited G notehead is visible on export and reload');
    });
  });
  await withScore(WebMscore, 'pickup-lyrics', async score => {
    const point = await renderer.textPoint(await score.saveSvg(0, true, false), 'sing');
    assert.equal(await score.selectTextElementAtPoint(0, ...point), true);
    assert.equal((await score.getSelectedElementProperties()).elementType, 'Lyrics');
    await applyAndCheckUndo(score, () => score.setSelectedText('song'));
    const check = document => {
      const notes = pitched(document);
      assert.equal(notes[0].querySelector('lyric > text')?.textContent, 'song');
      assert.ok(notes[0].querySelector('lyric > extend[type="start"]'));
      assert.ok(notes[1].querySelector('lyric > extend[type="stop"]'));
    };
    await reloadAndCheck(WebMscore, await score.saveXml(), check, 'pickup-lyrics');
    await score.clearSelection();
    assertFidelityRendering('pickup-lyrics', await score.saveSvg(0, true, false));
  });
  console.log('verified direct tie, slur, cross-staff drag, visibility and lyric edits');
}
