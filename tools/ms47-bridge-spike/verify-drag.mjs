import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Direct manipulation through the existing wrappers: note drag (commit and cancel), palette drops, grip editing.

const parts = xml => [...xml.matchAll(/<part id="[^"]+">([\s\S]*?)<\/part>/g)].map(m => m[1]);
const bars = part => [...part.matchAll(/<measure\b[^>]*>([\s\S]*?)<\/measure>/g)].map(m => m[1]);
const pitches = text => [...text.matchAll(/<step>([A-G])<\/step>\s*(?:<alter>(-?\d+)<\/alter>\s*)?<octave>(\d)<\/octave>/g)].map(m => `${m[1]}${m[2] ?? ''}${m[3]}`);

// The first note of bar 2 (C4) as a single selection, and its centre on the page
async function firstNoteOfBarTwo(score) {
  assert.equal(await score.selectPartMeasureByIndex(0, 0), true);
  assert.equal(await score.selectNextChord(), true);
  const box = await score.getSelectionBoundingBox();
  assert.ok(box && box.width > 0, 'note has a bounding box');
  return { page: box.page, x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export async function verifyDrag(WebMscore, renderer) {
  const fixture = new Uint8Array(await readFile(new URL('./spanner-fixture.musicxml', import.meta.url)));
  if (process.env.MS47_ENGINE_LOG) await WebMscore.setLogLevel(Number(process.env.MS47_ENGINE_LOG));
  const report = {};

  // Drag a note up one staff space (two diatonic steps): C4 -> E4, one undo entry; cancel leaves no trace
  for (const commit of [true, false]) {
    const score = await WebMscore.load('musicxml', fixture);
    try {
      const at = await firstNoteOfBarTwo(score);
      const spatium = await score.getSpatium();
      const before = await score.saveXml(), index = (await score.getUndoInfo()).index;
      const image = (await renderer.render(await score.saveSvg())).png;
      assert.equal(await score.beginElementDrag(at.page, at.x, at.y), true, 'drag starts on the note');
      assert.equal(await score.updateElementDrag(at.page, at.x, at.y - spatium, 0, 2), true);
      assert.equal(await score.endElementDrag(commit), true);
      const after = await score.saveXml();
      if (commit) {
        assert.equal(pitches(bars(parts(after)[0])[1])[0], 'E4', 'dragged up two steps');
        assert.equal((await score.getUndoInfo()).index, index + 1, 'a drag is one undo command');
        assert.equal(await score.undo(), true);
        assert.equal(await score.saveXml(), before, 'undo restores the note');
        assert.ok((await renderer.render(await score.saveSvg())).png.equals(image), 'undo restores pixels');
      } else {
        assert.equal(after, before, 'a cancelled drag leaves the score unchanged');
        assert.equal((await score.getUndoInfo()).index, index, 'and adds no undo entry');
      }
    } finally { score.destroy(); }
  }
  {
    const score = await WebMscore.load('musicxml', fixture);
    try {
      assert.equal(await score.beginElementDrag(9, 0, 0), false, 'invalid page');
      assert.equal(await score.updateElementDrag(0, 0, 0, 0, 0), false, 'no gesture in progress');
      assert.equal(await score.endElementDrag(true), false);
    } finally { score.destroy(); }
  }
  report.elementDrag = ['commit', 'cancel', 'rejections'];
  console.log('verified element drag: repitch, cancel, rejections');

  // Palette drops at a note: clef (kind 0), dynamic (kind 1, legacy index), articulation (kind 2)
  const drops = [
    [0, 20, xml => assert.match(bars(parts(xml)[0])[1], /<sign>F<\/sign>/), 'bass clef'],
    [1, 6, xml => assert.match(xml, /<p\s*\/>/), 'p (legacy dynamic index 6)'],
    [2, 0, xml => assert.match(xml, /<staccato/), 'staccato'],
  ];
  for (const [kind, subtype, check, what] of drops) {
    const score = await WebMscore.load('musicxml', fixture);
    try {
      const at = await firstNoteOfBarTwo(score);
      await score.clearSelection();
      const before = await score.saveXml(), index = (await score.getUndoInfo()).index;
      assert.equal(await score.applyDropAtPoint(at.page, at.x, at.y, kind, subtype), true, `drop ${what}`);
      const dropped = await score.saveXml();
      if (process.env.MS47_DEBUG_DRAG) console.log(what, 'F-clef bars:', bars(parts(dropped)[0]).map((b, i) => /<sign>F<\/sign>/.test(b) ? i : -1).filter(i => i >= 0), 'P2:', bars(parts(dropped)[1]).map((b, i) => /<sign>F<\/sign>/.test(b) ? i : -1).filter(i => i >= 0));
      check(dropped);
      assert.equal((await score.getUndoInfo()).index, index + 1, `drop ${what} is one undo command`);
      assert.equal(await score.undo(), true);
      assert.equal(await score.saveXml(), before);
    } finally { score.destroy(); }
  }
  {
    const score = await WebMscore.load('musicxml', fixture);
    try {
      const at = await firstNoteOfBarTwo(score);
      assert.equal(await score.applyDropAtPoint(at.page, at.x, at.y, 1, 999), false, 'unknown dynamic index');
      assert.equal(await score.applyDropAtPoint(at.page, at.x, at.y, 9, 0), false, 'unknown palette kind');
    } finally { score.destroy(); }
  }
  report.drops = drops.map(d => d[3]);
  console.log('verified applyDropAtPoint: clef, dynamic, articulation, rejections');

  // Grip editing on a hairpin: begin returns grips, dragging one changes the score; cancel restores it
  for (const commit of [true, false]) {
    const score = await WebMscore.load('musicxml', fixture);
    try {
      assert.equal(await score.selectPartMeasureByIndex(0, 0), true);
      assert.equal(await score.addHairpin(0), true);
      const before = await score.saveMsc('mscx');
      const xmlBefore = await score.saveXml(), image = (await renderer.render(await score.saveSvg())).png;
      const index = (await score.getUndoInfo()).index;
      // Search the bar below the staff for the hairpin, as a pointer would
      const at = await firstNoteOfBarTwo(score);
      const spatium = await score.getSpatium();
      let grips = null;
      for (let dy = 2; dy <= 14 && !grips; dy += 1) {
        for (const x of [at.x - 6 * spatium, at.x - 3 * spatium, at.x - 10 * spatium]) {
          grips = await score.beginGripEdit(at.page, x, at.y + dy * spatium);
          if (grips) break;
        }
      }
      assert.ok(grips && grips.grips.length >= 2, 'beginGripEdit finds the hairpin and returns its grips');
      const draggable = grips.grips.find(g => g.draggable && g.index > 0) ?? grips.grips.find(g => g.draggable);
      assert.ok(draggable, 'a grip is draggable');
      const moved = await score.dragGrip(draggable.index, 2 * spatium, 0);
      assert.ok(moved && moved.grips.length === grips.grips.length);
      assert.equal(await score.endGripEdit(commit), true);
      const after = await score.saveMsc('mscx');
      if (commit) {
        assert.ok(!Buffer.from(after).equals(Buffer.from(before)), 'a committed grip drag changes the score');
        assert.equal((await score.getUndoInfo()).index, index + 1, 'a grip drag is one undo command');
        assert.equal(await score.undo(), true);
        // After undo the segment is serialized with its autoplace offset and engraving id (geometry restored),
        // so compare the rendered and exported result rather than native bytes
        assert.equal(await score.saveXml(), xmlBefore, 'undo restores the hairpin (MusicXML)');
        assert.ok((await renderer.render(await score.saveSvg())).png.equals(image), 'undo restores the hairpin (pixels)');
      } else {
        assert.ok(Buffer.from(after).equals(Buffer.from(before)), 'a cancelled grip drag leaves the score unchanged');
        assert.equal((await score.getUndoInfo()).index, index);
      }
    } finally { score.destroy(); }
  }
  report.gripEdit = ['commit', 'cancel'];
  console.log('verified grip editing: hairpin grip drag, commit and cancel');
  return report;
}
