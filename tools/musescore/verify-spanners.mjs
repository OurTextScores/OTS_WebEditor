import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

// Spanner and chord tools: each command must succeed, persist a native change, be one undo command, export its
// notation, and restore exact MusicXML and pixels on undo/redo. Invalid selections must be rejected without an
// undo entry. Fixture: two parts; P1 has repeated pitches, a three-note chord, a tied pair and rehearsal marks A/D.

const native = async score => Buffer.from(await score.saveMsc('mscx')).toString('utf8');
const parts = xml => [...xml.matchAll(/<part id="[^"]+">([\s\S]*?)<\/part>/g)].map(m => m[1]);
const bars = part => [...part.matchAll(/<measure\b[^>]*>([\s\S]*?)<\/measure>/g)].map(m => m[1]);
const count = (text, re) => (text.match(new RegExp(re.source, 'g')) ?? []).length;

// Selections, all on P1 unless noted. `chord(m, k)` is the k-th chord/rest of bar m as a single selection.
// From a bar selection, selectNextChord moves past the end of the range, so step from the previous bar
// (or back from bar 2 for bar 1, which has four chords/rests in the fixture).
async function chord(score, m, k = 0) {
  assert.equal(await score.selectPartMeasureByIndex(0, m ? m - 1 : 0), true);
  assert.equal(await score.selectNextChord(), true);
  if (m) for (let i = 0; i < k; i++) assert.equal(await score.selectNextChord(), true);
  else for (let i = 0; i < 4 - k; i++) assert.equal(await score.selectPrevChord(), true);
}
async function twoChords(score, m) {
  await chord(score, m);
  assert.equal(await score.extendSelectionNextChord(), true);
}
async function bars_(score, m, extra = 0) {
  assert.equal(await score.selectPartMeasureByIndex(0, m), true);
  for (let i = 0; i < extra; i++) assert.equal(await score.extendSelectionNextMeasure(), true);
}
async function bothStaves(score, m) {
  assert.equal(await score.selectPartMeasureByIndex(0, m), true);
  assert.equal(await score.extendSelectionStaffBelow(), true);
}

export async function verifySpanners(WebMscore, renderer, output) {
  const fixture = new Uint8Array(await readFile(new URL('./spanner-fixture.musicxml', import.meta.url)));
  // MS47_ENGINE_LOG=2 shows the engine's LOGW reasons for a rejected command
  if (process.env.MS47_ENGINE_LOG) await WebMscore.setLogLevel(Number(process.env.MS47_ENGINE_LOG));
  const cases = [
    ['addSlur', [], s => bars_(s, 0), xml => assert.match(xml, /<slur[^>]*type="start"/)],
    ['addTie', [], s => chord(s, 0), xml => assert.match(bars(parts(xml)[0])[0], /<tie type="start"\/>/)],
    ['addGraceNote', [1], s => chord(s, 1), xml => assert.match(xml, /<grace slash="yes"\/>/)],
    ['addGraceNote', [2], s => chord(s, 1), xml => assert.match(xml, /<grace\/>/)],
    ['addTuplet', [3], s => chord(s, 1), xml => assert.match(xml, /<actual-notes>3<\/actual-notes>/)],
    ['addTremolo', [1], s => chord(s, 1), xml => assert.match(xml, /<tremolo type="single">2<\/tremolo>/)],
    ['addTremolo', [5], s => twoChords(s, 0), xml => assert.match(xml, /<tremolo type="start">1<\/tremolo>/)],
    ['addGlissando', [0], s => twoChords(s, 1), xml => assert.match(xml, /<slide[^>]*type="start"/)],
    ['addGlissando', [1], s => twoChords(s, 1), xml => assert.match(xml, /<glissando[^>]*type="start"/)],
    ['addPedal', [0], s => bars_(s, 0), xml => assert.match(xml, /<pedal[^>]*type="start"/)],
    ['addPedal', [1], s => bars_(s, 0), xml => assert.match(xml, /<pedal[^>]*type="start"/)],
    ['addSostenutoPedal', [], s => bars_(s, 0), xml => assert.match(xml, /<pedal\b/)],
    ['addUnaCorda', [], s => chord(s, 0), xml => assert.match(xml, />una corda</)],
    ['splitPedal', [], async s => {
      await bars_(s, 0, 1);
      assert.equal(await s.addPedal(0), true, 'splitPedal setup: pedal over bars 1-2');
      await chord(s, 0, 2);
    }, async (xml, s, before) => assert.equal(count(await native(s), /<Pedal>/), count(before, /<Pedal>/) + 1, 'one pedal becomes two')],
    ['addAmbitus', [], s => chord(s, 0), async (xml, s) => assert.match(await native(s), /<Ambitus>/)],
    ['explodeSelection', [], s => bothStaves(s, 2), xml => assert.match(bars(parts(xml)[1])[2], /<pitch>/, 'chord notes move to the second staff')],
    // Across staves, implode combines the staves into voices of the top staff (chords only within one staff)
    ['implodeSelection', [], s => bothStaves(s, 3), xml => assert.match(bars(parts(xml)[0])[3], /<step>E<\/step>[\s\S]*?<voice>2<\/voice>/, 'second staff note becomes voice 2 of the first staff')],
    ['regroupSelection', [], s => bars_(s, 4), xml => {
      const bar = bars(parts(xml)[0])[4];
      assert.doesNotMatch(bar, /<tie /, 'tied eighths regroup');
      assert.match(bar, /<pitch>[\s\S]*?<type>quarter<\/type>/);
    }],
    ['resequenceRehearsalMarks', [], s => bars_(s, 0, 4), xml => assert.match(xml, /<rehearsal[^>]*>B<\/rehearsal>/)],
    ['addFretDiagram', ['X32010'], s => chord(s, 0), async (xml, s) => {
      // MusicXML carries frames only inside <harmony>; 4.00 never exported bare diagrams either, so check native data
      assert.match(await native(s), /<FretDiagram>/);
      const diagram = await s.getSelectedFretDiagram();
      assert.equal(diagram.strings, 6);
      assert.deepEqual(diagram.markers, [{ string: 0, type: 2 }, { string: 3, type: 1 }, { string: 5, type: 1 }]); // X muted, 0 open
      assert.deepEqual(diagram.dots.map(d => [d.string, d.fret]), [[1, 3], [2, 2], [4, 1]]);
    }],
    ['setSelectedFretDiagram', [{ strings: 6, frets: 5, fretOffset: 2, showNut: false, dots: [{ string: 3, fret: 2, type: 0 }], markers: [{ string: 0, type: 2 }], barres: [] }], async s => {
      await chord(s, 0);
      assert.equal(await s.addFretDiagram('X32010'), true, 'setSelectedFretDiagram setup');
    }, async (xml, s) => {
      const diagram = await s.getSelectedFretDiagram();
      assert.deepEqual([diagram.frets, diagram.fretOffset, diagram.showNut], [5, 2, false]);
      assert.deepEqual(diagram.dots, [{ string: 3, fret: 2, type: 0 }]);
      assert.deepEqual(diagram.markers, [{ string: 0, type: 2 }]);
    }],
  ];
  const rejected = [
    ['addGlissando', [0], s => chord(s, 1), 'one note'],
    ['addTremolo', [5], s => chord(s, 1), 'two-chord tremolo on one chord'],
    ['explodeSelection', [], s => chord(s, 2), 'not a range'],
    ['splitPedal', [], s => chord(s, 0, 2), 'no pedal'],
    ['addTuplet', [1], s => chord(s, 1), 'tuplet count below 2'],
    ['addFretDiagram', ['X3Z'], s => chord(s, 0), 'malformed pattern'],
    ['setSelectedFretDiagram', [{ strings: 99, frets: 5, fretOffset: 0, showNut: true, dots: [], markers: [], barres: [] }], async s => {
      await chord(s, 0);
      assert.equal(await s.addFretDiagram('X32010'), true);
    }, 'string count out of range'],
  ];
  const results = [];
  const selected = process.env.MS47_SPANNER_CASES?.split(',');
  for (const [name, args, select, check] of cases.filter(c => !selected || selected.includes(c[0]))) {
    const artifact = [name, ...args.map(a => typeof a === 'object' ? 'json' : String(a))].join('-');
    const score = await WebMscore.load('musicxml', fixture);
    try {
      await select(score);
      const xmlBefore = await score.saveXml(), nativeBefore = await native(score);
      const undoBefore = await score.getUndoInfo();
      const beforeImage = (await renderer.render(await score.saveSvg())).png;
      const t = performance.now();
      assert.equal(await score[name](...args), true, `${artifact} must succeed`);
      const ms = performance.now() - t;
      const xmlAfter = await score.saveXml();
      assert.notEqual(await native(score), nativeBefore, `${artifact} must persist a native change`);
      await check(xmlAfter, score, nativeBefore);
      assert.equal((await score.getUndoInfo()).index, undoBefore.index + 1, `${artifact} must be one undo command`);
      const afterSvg = await score.saveSvg();
      const afterImage = (await renderer.render(afterSvg)).png;
      assert.ok(!afterImage.equals(beforeImage), `${artifact} must visibly change the score`);
      assert.equal(await score.undo(), true);
      assert.equal(await score.saveXml(), xmlBefore, `${artifact} undo must restore MusicXML`);
      assert.ok((await renderer.render(await score.saveSvg())).png.equals(beforeImage), `${artifact} undo must restore pixels`);
      assert.equal(await score.redo(), true);
      assert.equal(await score.saveXml(), xmlAfter, `${artifact} redo must restore MusicXML`);
      assert.ok((await renderer.render(await score.saveSvg())).png.equals(afterImage), `${artifact} redo must restore pixels`);
      await writeFile(`${output}/spanner-${artifact}.musicxml`, xmlAfter);
      await writeFile(`${output}/spanner-${artifact}.svg`, afterSvg);
      results.push({ name, args, ms });
      console.log(`verified spanner ${artifact} (${ms.toFixed(1)} ms)`);
    } finally { score.destroy(); }
  }
  for (const [name, args, select, why] of rejected.filter(c => !selected || selected.includes(c[0]))) {
    const score = await WebMscore.load('musicxml', fixture);
    try {
      await select(score);
      const xml = await score.saveXml(), index = (await score.getUndoInfo()).index;
      assert.equal(await score[name](...args), false, `${name} must reject: ${why}`);
      assert.equal(await score.saveXml(), xml, `${name} rejection must not change the score`);
      assert.equal((await score.getUndoInfo()).index, index, `${name} rejection must not add an undo entry`);
      console.log(`verified spanner ${name} rejects ${why}`);
    } finally { score.destroy(); }
  }
  return results;
}
