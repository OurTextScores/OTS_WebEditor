import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Selection filter translation, PNG decision, transpose, progressive layout, positions, metadata and load profile.

const ALL = (1 << 24) - 1;
const NOTES_AND_RESTS = 1 << 23;
const parts = xml => [...xml.matchAll(/<part id="[^"]+">([\s\S]*?)<\/part>/g)].map(m => m[1]);
const bars = part => [...part.matchAll(/<measure\b[^>]*>([\s\S]*?)<\/measure>/g)].map(m => m[1]);
const pitches = text => [...text.matchAll(/<step>([A-G])<\/step>\s*(?:<alter>(-?\d+)<\/alter>\s*)?<octave>(\d)<\/octave>/g)].map(m => `${m[1]}${m[2] ?? ''}${m[3]}`);

export async function verifyMisc(WebMscore, renderer) {
  const fixture = new Uint8Array(await readFile(new URL('./spanner-fixture.musicxml', import.meta.url)));
  const bach = new Uint8Array(await readFile(new URL('../../public/test_scores/bach_orig.mscz', import.meta.url)));
  if (process.env.MS47_ENGINE_LOG) await WebMscore.setLogLevel(Number(process.env.MS47_ENGINE_LOG));
  const report = {};

  // Selection filter: "Notes and rests" off keeps notes out of a range delete; the full mask removes them
  {
    const deleteBarOne = async mask => {
      const score = await WebMscore.load('musicxml', fixture);
      try {
        assert.equal(await score.setSelectionFilter(mask), true);
        assert.equal(await score.selectPartMeasureByIndex(0, 0), true);
        await score.deleteSelection();
        return pitches(bars(parts(await score.saveXml())[0])[0]).length;
      } finally { score.destroy(); }
    };
    assert.equal(await deleteBarOne(ALL), 0, 'full mask: deleting a bar removes its notes');
    assert.equal(await deleteBarOne(ALL & ~NOTES_AND_RESTS), 4, '"Notes and rests" off: notes are not selected, so they survive');
    const score = await WebMscore.load('musicxml', fixture);
    try {
      assert.equal(await score.setSelectionFilter(-1), false);
      assert.equal(await score.setSelectionFilter(1 << 24), false, 'bits beyond the legacy 24 are rejected');
    } finally { score.destroy(); }
    report.selectionFilter = ['notesAndRests', 'invalidMask'];
    console.log('verified setSelectionFilter legacy mask translation');
  }

  // PNG is refused explicitly (DECISIONS.md item 6)
  {
    const score = await WebMscore.load('musicxml', fixture);
    try {
      await assert.rejects(score.savePng(0), /not supported/);
    } finally { score.destroy(); }
    console.log('verified savePng is refused explicitly');
  }

  // Transpose a whole score up a major second by interval: every pitch changes, one undo entry, exact undo/redo
  {
    const score = await WebMscore.load('musicxml', fixture);
    try {
      const before = await score.saveXml(), index = (await score.getUndoInfo()).index;
      const image = (await renderer.render(await score.saveSvg())).png;
      // mode BY_INTERVAL (1), direction UP (0), key ignored, interval index 4 (major second), transpose keys and chord names
      assert.equal(await score.transpose(1, 0, 0, 4, true, true, false), true);
      const after = await score.saveXml();
      assert.equal(pitches(after)[0], 'D4', 'C4 becomes D4');
      assert.equal(pitches(after).length, pitches(before).length);
      assert.equal((await score.getUndoInfo()).index, index + 1, 'transpose is one undo command');
      assert.equal(await score.undo(), true);
      assert.equal(await score.saveXml(), before);
      assert.ok((await renderer.render(await score.saveSvg())).png.equals(image), 'undo restores pixels');
      assert.equal(await score.redo(), true);
      assert.equal(await score.saveXml(), after);
      report.transpose = true;
      console.log('verified transpose by interval with undo/redo');
    } finally { score.destroy(); }
  }

  // Progressive layout from an unlaid-out load
  {
    const score = await WebMscore.load('mscz', bach, [], false);
    try {
      assert.equal(await score.layoutUntilPage(0), true);
      const state = await score.layoutUntilPageState(0);
      assert.equal(state.targetSatisfied, true);
      assert.ok(state.availablePages >= 1 && state.totalMeasures > 0 && state.laidOutMeasures > 0);
      const complete = await score.layoutUntilPageState(999);
      assert.equal(complete.targetSatisfied, false, 'a page beyond the score is never satisfied');
      assert.equal(complete.isComplete, true, 'but the whole score is laid out');
      assert.equal(complete.laidOutMeasures, complete.totalMeasures);
      report.progressiveLayout = { pages: complete.availablePages, measures: complete.totalMeasures };
      console.log(`verified layoutUntilPage/State (${complete.totalMeasures} measures, ${complete.availablePages} pages)`);
    } finally { score.destroy(); }
  }

  // Positions, metadata, load profile
  {
    const score = await WebMscore.load('mscz', bach);
    try {
      for (const ofSegments of [false, true]) {
        const positions = JSON.parse(await score.savePositions(ofSegments));
        assert.ok(positions.elements.length > 0 && positions.events.length >= positions.elements.length);
        assert.ok(positions.pageSize.width > 0 && positions.pageSize.height > 0);
        assert.ok(positions.elements.every(e => e.sx >= 0 && e.sy > 0 && e.page >= 0));
        assert.ok(positions.events.every((e, i) => !i || e.position >= positions.events[i - 1].position), 'events in playback order');
        const ids = new Set(positions.elements.map(e => e.id));
        assert.ok(positions.events.every(e => ids.has(e.elid)), 'every event refers to an element');
        report[ofSegments ? 'segmentPositions' : 'measurePositions'] = { elements: positions.elements.length, events: positions.events.length };
      }
      const meta = JSON.parse(await score.saveMetadata());
      assert.equal(meta.parts.length, 1);
      assert.ok(meta.measures > 0 && meta.pages > 0 && meta.duration > 0);
      assert.equal(typeof meta.title, 'string');
      assert.ok(meta.pageFormat.width > 0);
      const profile = await score.loadProfile();
      assert.equal(profile.available, true);
      assert.equal(profile.format, 'mscz');
      assert.ok(profile.totalLoadMs >= profile.parseMs && profile.pagesAfterLoad >= 1);
      report.metadata = { title: meta.title, measures: meta.measures, duration: meta.duration };
      console.log(`verified savePositions (measures and segments), saveMetadata and loadProfile`);
    } finally { score.destroy(); }
  }
  return report;
}
