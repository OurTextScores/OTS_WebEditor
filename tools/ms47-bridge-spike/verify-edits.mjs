import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

export async function verifyEdits(WebMscore, renderer, output) {
  const fixture = new Uint8Array(await readFile(new URL('./edit-fixture.musicxml', import.meta.url)));
  const cases = [
    ['addNoteFromRest', [], /<pitch>/, 'rest'],
    ['flipStem', [], /<stem>down/],
    ['setDurationType', [5], /<type>eighth/],
    ['toggleLineBreak', [], null],
    ['togglePageBreak', [], null],
    ['changeSelectedElementsVoice', [1], /<voice>2<\/voice>/],
    ['pitchUp', [], null, 'rest'],
    ['pitchDown', [], null, 'rest'],
    ['setAccidental', [1], /<accidental>flat<\/accidental>/],
    ['doubleDuration', [], /<type>half<\/type>/],
    ['halfDuration', [], /<type>eighth<\/type>/],
    ['toggleDot', [], /<dot\b[^>]*\/>/],
    ['toggleDoubleDot', [], /<dot\b[^>]*\/>/],
    ['setNoteheadGroup', [1], /<notehead[^>]*>x<\/notehead>/],
    ['setBeamMode', [1], null],
    ['setMultiMeasureRests', [true], null],
    ['addDynamic', [6], /<p\s*\/>/],
    ['addDynamic', [23], /<rfz\s*\/>/],
    ['addHairpin', [0], /<wedge[^>]*type="crescendo"/],
    ['addFermata', [0], /<fermata[ >]/],
    ['addBreath', [0], /<breath-mark/],
    ['addArpeggio', [0], /<arpeggiate/],
    ['addOttava', [0], /<octave-shift/],
    ['addTrill', [0], /<trill-mark/],
    ['addStaffText', ['Bridge <text> & "quotes"'], /<words[^>]*>Bridge &lt;text&gt; &amp;/],
    ['addSystemText', ['System'], /<words[^>]*>System/],
    ['addExpressionText', ['espressivo'], /<words[^>]*>espressivo/],
    ['addLyricText', ['hello'], /<lyric/],
    ['addHarmonyText', [0, 'C7'], /<harmony/],
    ['addFingeringText', ['2'], /<fingering[^>]*>2/],
    ['addLeftHandGuitarFingeringText', ['2'], /<fingering[^>]*>2/],
    ['addRightHandGuitarFingeringText', ['p'], /<pluck[^>]*>p/],
    ['addStringNumberText', ['3'], /<string[^>]*>3/],
    ['addStickingText', ['R'], /<words[^>]*>R/],
    ['addFiguredBassText', ['6'], /<figured-bass/],
    ['addRehearsalMark', [], /<rehearsal/],
    ['addArticulation', ['articStaccatoAbove'], /<staccato/],
    ['addTempoText', [132], /<per-minute>132/],
    ['setKeySignature', [2], /<fifths>2/],
    ['setClef', [20], /<sign>F/],
    ['setTimeSignature', [3, 4], /<beats>3/],
    ['setTimeSignatureWithType', [4, 4, 1], /symbol="common"/],
    ['setChordSymbolStylePreset', ['jazz'], null],
    ['setHarmonyVoiceLiteral', [false], null],
    ['setSelectedElementProperty', ['visible', false], /<notehead>none<\/notehead>/],
    ['setSelectedElementProperty', ['small', true], null],
    ['setSelectedElementProperty', ['offsetX', 2], null],
    ['setSelectedElementProperty', ['offsetY', -1.5], null],
    ['setSelectedElementProperty', ['color', '#ff0000'], /color="#FF0000"/i],
    ['setSelectedElementProperty', ['stemDirection', 'down'], /<stem>down/],
  ];
  const results = [];
  const selectedCases = process.env.MS47_EDIT_CASES?.split(',');
  for (const [name, args, expected, selectionMode] of cases.filter(c => !selectedCases || selectedCases.includes(c[0]))) {
    const artifact = [name, ...args.map(String), selectionMode].filter(Boolean).join('-').replace(/[^a-zA-Z0-9_-]/g, '_');
    const score = await WebMscore.load('musicxml', fixture);
    try {
      // Move out of the range and back to the three-note chord at the start of measure 2.
      assert.equal(await score.selectPartMeasureByIndex(0, name === 'setBeamMode' || selectionMode === 'rest' ? 0 : 1), true);
      if (name === 'setBeamMode' || selectionMode === 'rest') {
        assert.equal(await score.selectPrevChord(), true);
        if (selectionMode === 'rest') assert.equal(await score.selectNextChord(), true);
      } else {
        assert.equal(await score.selectNextChord(), true);
        assert.equal(await score.selectPrevChord(), true);
      }
      const xmlBefore = await score.saveXml();
      const nativeBefore = await score.saveMsc('mscx');
      const undoBefore = await score.getUndoInfo();
      const beforeImage = await renderer.render(await score.saveSvg());
      const t = performance.now();
      assert.equal(await score[name](...args), true, `${name} must succeed`);
      const ms = performance.now() - t;
      const xmlAfter = await score.saveXml();
      const nativeAfter = await score.saveMsc('mscx');
      assert.ok(!Buffer.from(nativeBefore).equals(Buffer.from(nativeAfter)), `${name} must persist a native change`);
      await writeFile(`${output}/edit-${artifact}.musicxml`, xmlAfter);
      const pitched = xml => [...xml.matchAll(/<note\b[^>]*>([\s\S]*?)<\/note>/g)].map(m => m[1]).filter(n => n.includes('<pitch>'));
      if (['doubleDuration', 'halfDuration'].includes(name)) {
        const type = name === 'doubleDuration' ? 'half' : 'eighth';
        const count = xml => pitched(xml).filter(n => n.includes(`<type>${type}</type>`)).length;
        assert.ok(count(xmlAfter) > count(xmlBefore), `${name} must change pitched note durations`);
      } else if (['toggleDot', 'toggleDoubleDot'].includes(name)) {
        const dots = name === 'toggleDot' ? 1 : 2;
        assert.ok(pitched(xmlAfter).some(n => [...n.matchAll(/<dot\b[^>]*\/>/g)].length === dots), `${name} must dot a pitched note`);
      } else if (expected) assert.ok(expected.test(xmlAfter), `${name} must export its notation`);
      assert.equal((await score.getUndoInfo()).index, undoBefore.index + 1, `${name} must be one undo command`);
      if (name === 'setSelectedElementProperty' && ['visible', 'small', 'offsetX', 'offsetY'].includes(args[0])) {
        const property = (await score.getSelectedElementProperties()).properties[args[0]];
        assert.equal(property.mixed, false);
        if (typeof args[1] === 'number') assert.ok(Math.abs(property.value - args[1]) < 1e-9);
        else assert.equal(property.value, args[1]);
      }
      const history = await score.getUndoEntries(undoBefore.index, undoBefore.index + 1);
      assert.equal(history.length, 1);
      assert.ok(history[0].commands.length > 0, `${name} must expose its undo commands`);
      assert.equal(new Set(history[0].commands).size, history[0].commands.length);
      assert.ok(history[0].elements.every(type => typeof type === 'string'));
      assert.ok(Number.isInteger(history[0].tickStart) && Number.isInteger(history[0].tickEnd));
      assert.deepEqual(await score.getUndoEntries(-5, 0), []);
      const afterImage = await renderer.render(await score.saveSvg());
      if (selectionMode === 'rest') assert.ok(!afterImage.png.equals(beforeImage.png), `${name} must visibly move the rest`);
      assert.equal(await score.undo(), true);
      assert.equal(await score.saveXml(), xmlBefore, `${name} undo must restore MusicXML`);
      assert.ok((await renderer.render(await score.saveSvg())).png.equals(beforeImage.png), `${name} undo must restore pixels`);
      assert.equal(await score.redo(), true);
      assert.equal(await score.saveXml(), xmlAfter, `${name} redo must restore MusicXML`);
      assert.ok((await renderer.render(await score.saveSvg())).png.equals(afterImage.png), `${name} redo must restore pixels`);
      if (name === 'addFiguredBassText') {
        assert.equal(await score.addFiguredBassText('7'), true);
        const seven = await score.saveXml();
        assert.ok(/<figure-number>7/.test(seven));
        assert.equal(await score.setSelectedText('8'), true);
        assert.ok(/<figure-number>8/.test(await score.saveXml()));
        assert.equal(await score.undo(), true);
        assert.equal(await score.saveXml(), seven);
        assert.equal(await score.undo(), true);
        assert.equal(await score.saveXml(), xmlAfter, 'Replacing figured bass must preserve old parsed figures for undo');
      }
      if (name === 'addTempoText') {
        const index = (await score.getUndoInfo()).index;
        assert.equal(await score.addTempoText(96), true);
        assert.ok(/<per-minute>96/.test(await score.saveXml()));
        assert.equal((await score.getUndoInfo()).index, index + 1);
        assert.equal(await score.undo(), true);
        assert.equal(await score.saveXml(), xmlAfter, 'Updating an existing tempo must undo as one command');
      }
      results.push({ name, args, selectionMode, artifact, ms });
      await writeFile(`${output}/edit-${artifact}.svg`, await score.saveSvg());
      console.log(`verified ${name} (${ms.toFixed(1)} ms)`);
    } finally { score.destroy(); }
  }
  results.push(await verifyBeamSplitLayout(WebMscore));
  return results;
}

// Starting a beam on the second chord of a beamed pair leaves the first chord unbeamed; its stem must turn in the
// incremental layout, not only after a full one (it stayed stale before setBeamMode laid the range out twice)
async function verifyBeamSplitLayout(WebMscore) {
  const file = new URL('../../public/test_scores/batch4_controls.musicxml', import.meta.url);
  const score = await WebMscore.load('musicxml', new Uint8Array(await readFile(file)));
  try {
    const notes = [...(await score.saveSvg(0, true, false)).matchAll(/<g transform="matrix\(0\.3 0 0 0\.3 ([\d.]+) ([\d.]+)\)"[^>]*><path class="Note"/g)];
    assert.ok(notes.length >= 2, 'fixture notes drawn');
    assert.equal(await score.selectElementAtPoint(0, +notes[1][1] + 5, +notes[1][2] + 4), true);
    assert.equal(await score.setBeamMode(2), true, 'beam begins on the second chord');
    const incremental = await score.saveSvg(0, true, false);
    await score.relayout();
    assert.equal(incremental, await score.saveSvg(0, true, false), 'incremental layout matches the full layout');
    return { name: 'setBeamMode split layout', ok: true };
  } finally { score.destroy(); }
}
