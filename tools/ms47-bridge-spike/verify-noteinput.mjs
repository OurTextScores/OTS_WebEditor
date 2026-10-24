import assert from 'node:assert/strict';

const fixture = new TextEncoder().encode(`<?xml version="1.0"?><score-partwise version="4.0">
<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">
${Array.from({ length: 4 }, (_, i) => `<measure number="${i + 1}">${i === 0 ? '<attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>' : ''}<note><rest measure="yes"/><duration>16</duration></note></measure>`).join('')}
</part></score-partwise>`);
const notes = xml => [...xml.matchAll(/<note\b[^>]*>([\s\S]*?)<\/note>/g)].map(m => m[1]);
const pitches = xml => notes(xml).filter(n => n.includes('<pitch>'));
const step = n => n.match(/<step>(.)<\/step>/)?.[1];
const validCursor = c => c && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(c[k])) && c.width > 0 && c.height > 0 && c.page >= 0;

export async function verifyNoteInput(WebMscore, renderer, Module) {
  const score = await WebMscore.load('musicxml', fixture);
  const results = [];
  async function edit(label, action, check) {
    const before = await score.saveXml();
    const image = (await renderer.render(await score.saveSvg())).png;
    const index = (await score.getUndoInfo()).index;
    const start = performance.now();
    assert.equal(await action(), true, label);
    const ms = performance.now() - start;
    const after = await score.saveXml();
    assert.notEqual(after, before, `${label} changes notation`);
    await check(after, before);
    assert.equal((await score.getUndoInfo()).index, index + 1, `${label} is one undo command`);
    const editedImage = (await renderer.render(await score.saveSvg())).png;
    await score.undo();
    assert.equal(await score.saveXml(), before, `${label} undo restores MusicXML`);
    assert.ok((await renderer.render(await score.saveSvg())).png.equals(image), `${label} undo restores pixels`);
    await score.redo();
    assert.equal(await score.saveXml(), after, `${label} redo restores MusicXML`);
    assert.ok((await renderer.render(await score.saveSvg())).png.equals(editedImage), `${label} redo restores pixels`);
    results.push({ label, ms });
  }
  try {
    assert.equal(await score.getNoteInputCursorRect(), null);
    assert.equal(await score.setInputStateFromSelection(), false);
    assert.equal(await score.putNote(0, 0, 0), false);
    const before = await score.saveXml();
    const index = (await score.getUndoInfo()).index;
    for (const [method, values] of [['setNoteEntryMethod', [-1, 7]], ['setInputDurationType', [-1, 13, 14, 15]], ['setInputAccidentalType', [-1, 999]], ['setVoice', [-1, 4]]]) {
      for (const v of values) assert.equal(await score[method](v), false, `${method} rejects ${v}`);
    }
    assert.equal(await score.setNoteEntryMode(true), true, 'Entry can start with no selection');
    assert.ok(validCursor(await score.getNoteInputCursorRect()));
    assert.equal(await score.setNoteEntryMethod(1), true);
    assert.equal(await score.setInputDurationType(4), true);
    assert.equal(await score.setInputAccidentalType(3), true);
    assert.equal(await score.saveXml(), before);
    assert.equal((await score.getUndoInfo()).index, index, 'Input settings do not create notation edits');
    assert.equal(await score.addPitchByStep(-1), false);
    assert.equal(await score.addPitchByStep(7), false);
    assert.equal(await score.putNote(-1, 0, 0), false);
    assert.equal(await score.putNote(999, 0, 0), false);
    await edit('enter C sharp', () => score.addPitchByStep(0), xml => {
      assert.equal(pitches(xml).length, 1);
      assert.equal(step(pitches(xml)[0]), 'C');
      assert.match(pitches(xml)[0], /<alter>1<\/alter>/);
    });
    // Undo/redo select restored notes; reseed entry at the next rest explicitly.
    await score.selectNextChord();
    await score.setInputStateFromSelection();
    await score.setInputDurationType(4);
    const cursorD = await score.getNoteInputCursorRect();
    await edit('enter D', () => score.addPitchByStep(1), xml => {
      assert.deepEqual(pitches(xml).map(step), ['C', 'D']);
      assert.doesNotMatch(pitches(xml)[1], /<alter>1<\/alter>/, 'Carried accidental resets');
    });
    await score.selectNextChord();
    await score.setInputStateFromSelection();
    await score.setInputDurationType(4);
    const cursorE = await score.getNoteInputCursorRect();
    assert.ok(cursorE.x > cursorD.x, 'Input cursor advances left to right');
    await score.toggleInputDot();
    await edit('enter dotted E', () => score.addPitchByStep(2), xml => {
      assert.deepEqual(pitches(xml).map(step), ['C', 'D', 'E']);
      assert.match(pitches(xml)[2], /<dot\b[^>]*\/>/);
    });
    await score.selectNextChord();
    await score.setInputStateFromSelection();
    await score.selectPrevChord();
    await score.setInputStateFromSelection();
    await score.setInputDurationType(5);
    await edit('enter eighth rest', () => score.enterRest(), xml => {
      assert.ok(notes(xml).some(n => /<rest/.test(n) && /<type>eighth/.test(n)));
    });
    await score.setNoteEntryMode(false);
    assert.equal(await score.getNoteInputCursorRect(), null);
    // Existing index 2 must still mean REPITCH despite BY_DURATION being inserted in 4.7.
    await score.selectPartMeasureByIndex(0, 0);
    // Native range-to-list has no JS wrapper; select the known first pitch by its native box.
    assert.equal(Module.ccall('convertRangeToListSelection', 'boolean', ['number', 'number'], [score.scoreptr, score.excerptId]), true);
    const box = (await score.getSelectionBoundingBoxes())[0];
    assert.equal(await score.selectElementAtPoint(box.page, box.x + box.width / 2, box.y + box.height / 2), true);
    assert.equal((await score.getSelectedElementProperties()).elementType, 'Note');
    await score.setNoteEntryMode(true);
    await score.setNoteEntryMethod(2);
    const count = pitches(await score.saveXml()).length;
    await edit('legacy repitch method', () => score.addPitchByStep(6), xml => {
      assert.equal(pitches(xml).length, count);
      assert.ok(pitches(xml).some(n => step(n) === 'B'));
    });
    await score.setNoteEntryMode(false);
    await score.selectPartMeasureByIndex(0, 2);
    await score.setNoteEntryMode(true);
    await score.setNoteEntryMethod(1);
    await score.setInputDurationType(4);
    await score.setVoice(1);
    assert.equal((await score.getNoteInputCursorRect()).voice, 1);
    await edit('enter voice 2', () => score.addPitchByStep(4), xml => {
      assert.ok(pitches(xml).some(n => step(n) === 'G' && /<voice>2<\/voice>/.test(n)));
    });
    await score.setNoteEntryMode(false);
    await score.selectPartMeasureByIndex(0, 3);
    const bar = (await score.getSelectionBoundingBoxes())[0];
    await score.setNoteEntryMode(true); await score.setNoteEntryMethod(1); await score.setVoice(0); await score.setInputDurationType(4);
    await edit('click to place', () => score.putNote(bar.page, bar.x + bar.width * 0.3, bar.y + bar.height * 0.5), xml => {
      assert.ok(pitches(xml).length > count);
    });
    results.push({ sequential: await verifySequentialEntry(WebMscore, Module) });
    results.push({ specialStaves: await verifySpecialStaves(WebMscore) });
    console.log('verified note-entry cursor, settings, sequential pitches, rest, legacy repitch, voice and click entry');
    return results;
  } finally { score.destroy(); }
}

async function verifySpecialStaves(WebMscore) {
  const results = [];
  for (const kind of ['percussion', 'tablature']) {
    const tab = kind === 'tablature';
    const staffType = tab ? '<StaffType group="tablature"><name>tab6StrCommon</name><lines>6</lines><lineDistance>1.5</lineDistance><onLines>1</onLines></StaffType>' : '<StaffType group="percussion"><name>perc5Line</name></StaffType>';
    const instrument = tab
      ? '<instrumentId>pluck.guitar.nylon-string</instrumentId><StringData><frets>19</frets><string>40</string><string>45</string><string>50</string><string>55</string><string>59</string><string>64</string></StringData>'
      : '<instrumentId>drum.group.set</instrumentId><useDrumset>1</useDrumset><Drum pitch="38"><head>normal</head><line>0</line><voice>0</voice><name>Snare</name><stem>1</stem><shortcut>C</shortcut></Drum>';
    const clef = tab ? 'G8vb' : 'PERC';
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>\n<museScore version="4.70"><Score><Division>480</Division><Part><Staff id="1">${staffType}<defaultClef>${clef}</defaultClef></Staff><trackName>${kind}</trackName><Instrument>${instrument}<Channel><program value="0"/></Channel></Instrument></Part><Staff id="1"><Measure><voice><Clef><concertClefType>${clef}</concertClefType><transposingClefType>${clef}</transposingClefType></Clef><TimeSig><sigN>4</sigN><sigD>4</sigD></TimeSig><Rest><durationType>measure</durationType><duration>1/1</duration></Rest></voice></Measure></Staff></Score></museScore>`;
    const score = await WebMscore.load('mscx', new TextEncoder().encode(mscx));
    try {
      const before = await score.saveXml();
      await score.setNoteEntryMode(true);
      await score.setInputDurationType(4);
      const cursor = await score.getNoteInputCursorRect();
      assert.ok(validCursor(cursor), `${kind} input has native cursor geometry`);
      if (tab) assert.ok(cursor.height < 3 * await score.getSpatium(), 'Tab cursor covers one string');
      const index = (await score.getUndoInfo()).index;
      assert.equal(await score.addPitchByStep(0), true, `${kind} note entry`);
      const after = await score.saveXml();
      assert.notEqual(after, before);
      if (tab) {
        assert.match(after, /<technical>[\s\S]*<string>/);
        assert.match(after, /<fret>\d+<\/fret>/);
      }
      else {
        assert.match(after, /<unpitched>/);
        assert.match(Buffer.from(await score.saveMsc('mscx')).toString('utf8'), /<pitch>38<\/pitch>/);
        assert.equal(await score.addPitchByStep(1), false, 'Undefined drum shortcut is rejected');
      }
      assert.equal((await score.getUndoInfo()).index, index + 1);
      await score.undo(); assert.equal(await score.saveXml(), before);
      await score.redo(); assert.equal(await score.saveXml(), after);
      results.push({ kind, cursor });
    } finally { score.destroy(); }
  }
  return results;
}


async function verifySequentialEntry(WebMscore, Module) {
  const score = await WebMscore.load('musicxml', fixture);
  try {
    const index = (await score.getUndoInfo()).index;
    await score.setNoteEntryMode(true); await score.setInputDurationType(4);
    const cursors = [await score.getNoteInputCursorRect()];
    for (const letter of [0, 1, 2]) {
      assert.equal(await score.addPitchByStep(letter), true);
      cursors.push(await score.getNoteInputCursorRect());
    }
    assert.deepEqual(pitches(await score.saveXml()).map(step), ['C', 'D', 'E']);
    assert.ok(cursors.every(validCursor));
    assert.ok(cursors.every((c, i) => !i || c.x > cursors[i - 1].x), 'Uninterrupted input advances the native cursor');
    assert.equal((await score.getUndoInfo()).index, index + 3);
    await score.setNoteEntryMode(false);
    await score.selectPartMeasureByIndex(0, 0);
    Module.ccall('convertRangeToListSelection', 'boolean', ['number', 'number'], [score.scoreptr, score.excerptId]);
    const box = (await score.getSelectionBoundingBoxes())[0];
    await score.selectElementAtPoint(box.page, box.x + box.width / 2, box.y + box.height / 2);
    let before = await score.saveXml();
    assert.equal(await score.addPitchByStep(4, true), true);
    const chord = await score.saveXml();
    assert.equal(pitches(chord).length, pitches(before).length + 1);
    assert.ok(pitches(chord).some(n => /<chord\s*\/>/.test(n) && step(n) === 'G'));
    await score.undo(); assert.equal(await score.saveXml(), before);
    await score.redo(); assert.equal(await score.saveXml(), chord);
    // Legacy TIMEWISE index 6 inserts time even when the explicit insert flag is false.
    await score.setNoteEntryMode(true); await score.setNoteEntryMethod(6); await score.setInputDurationType(4);
    before = await score.saveXml();
    const count = pitches(before).length;
    assert.equal(await score.addPitchByStep(3), true);
    const inserted = await score.saveXml();
    assert.equal(pitches(inserted).length, count + 1);
    assert.equal(step(pitches(inserted)[0]), 'F');
    await score.undo(); assert.equal(await score.saveXml(), before);
    await score.redo(); assert.equal(await score.saveXml(), inserted);
    return { cursors, addToChordUndo: true, legacyTimewiseUndo: true };
  } finally { score.destroy(); }
}
