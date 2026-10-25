import assert from 'node:assert/strict';

const fixture = (beats = 4, beatType = 4, count = 6) => new TextEncoder().encode(`<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${Array.from({ length: count }, (_, i) => `<measure number="${i + 1}">${i ? '' : `<attributes><divisions>2</divisions><time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>`}<note><rest measure="yes"/><duration>${beats * 8 / beatType}</duration></note></measure>`).join('')}</part></score-partwise>`);
const sequence = timeline => timeline.occurrences.map(o => o.measureIndex);
function verifyTimes(timeline) {
  assert.equal(timeline.schemaVersion, 1);
  assert.equal(timeline.renderDurationMs, timeline.durationMs + 3000);
  timeline.occurrences.forEach((o, i) => {
    assert.equal(o.occurrenceIndex, i);
    assert.ok(o.endMs > o.startMs);
    assert.equal(o.startMs, i ? timeline.occurrences[i - 1].endMs : 0);
    assert.ok(o.beatsMs.every((t, j) => t >= o.startMs && t < o.endMs && (!j || t > o.beatsMs[j - 1])));
  });
  assert.equal(timeline.occurrences.at(-1).endMs, timeline.durationMs);
}
export async function verifyTimeline(WebMscore, Module) {
  const score = await WebMscore.load('musicxml', fixture());
  const startTime = () => Module.ccall('selectionPlaybackStartTime', 'number', ['number', 'number'], [score.scoreptr, score.excerptId]);
  try {
    const xml = await score.saveXml(), index = (await score.getUndoInfo()).index;
    const plain = await score.playbackTimeline(); verifyTimes(plain);
    assert.deepEqual(sequence(plain), [0, 1, 2, 3, 4, 5]);
    assert.equal(plain.durationMs, 12000);
    assert.deepEqual(plain.occurrences[0].beatsMs, [0, 500, 1000, 1500]);
    assert.equal(startTime(), 0);
    assert.equal(await score.saveXml(), xml);
    assert.equal((await score.getUndoInfo()).index, index, 'Timeline reads do not create undo commands');
    await score.selectPartMeasureByIndex(0, 0); await score.toggleRepeatStart();
    await score.selectPartMeasureByIndex(0, 1); await score.setRepeatCount(3);
    const repeated = await score.playbackTimeline(); verifyTimes(repeated);
    assert.deepEqual(sequence(repeated), [0, 1, 0, 1, 0, 1, 2, 3, 4, 5]);
    assert.equal(repeated.durationMs, 20000);
    await score.selectPartMeasureByIndex(0, 2);
    assert.equal(Math.round(startTime() * 1000), repeated.occurrences.find(o => o.measureIndex === 2).startMs);
    await score.undo();
    assert.deepEqual(sequence(await score.playbackTimeline()), [0, 1, 2, 3, 4, 5]);
    await score.redo(); assert.deepEqual(await score.playbackTimeline(), repeated);
    await score.undo(); await score.undo(); assert.deepEqual(await score.playbackTimeline(), plain);
    await score.selectPartMeasureByIndex(0, 0); await score.addPickupMeasure(1, 4);
    const pickup = await score.playbackTimeline(); verifyTimes(pickup);
    assert.equal(pickup.durationMs, 12500);
    assert.equal(pickup.occurrences[0].endMs, 500);
    assert.equal(pickup.occurrences[0].downbeat, false);
    assert.equal(pickup.occurrences[0].beatsPerMeasure, 4);
    await score.undo(); assert.deepEqual(await score.playbackTimeline(), plain);
    await score.selectPartMeasureByIndex(0, 0); await score.addTempoText(60);
    const slow = await score.playbackTimeline(); verifyTimes(slow);
    assert.equal(slow.durationMs, plain.durationMs * 2);
    assert.deepEqual(slow.occurrences[0].beatsMs, [0, 1000, 2000, 3000]);
    await score.undo(); assert.deepEqual(await score.playbackTimeline(), plain);
  } finally { score.destroy(); }
  // Legacy JumpType DCODA (12) / DDBLCODA (13) are To Coda-style markers in 4.x (upstream 3a42d912ae, #16294):
  // the second pass of a D.C. al Coda leaves there for the Coda sign.
  // 4.7's own marker text; 4.00's jump said 'Da Double Coda'
  for (const [jump, text] of [[12, 'Da Coda'], [13, 'Da Doppia Coda']]) {
    const score = await WebMscore.load('musicxml', fixture());
    try {
      await score.selectPartMeasureByIndex(0, 4); assert.ok(await score.addMarker(2), 'Coda sign');
      await score.selectPartMeasureByIndex(0, 3); assert.ok(await score.addJump(2), 'D.C. al Coda');
      const index = (await score.getUndoInfo()).index;
      await score.selectPartMeasureByIndex(0, 1); assert.ok(await score.addJump(jump), `legacy jump ${jump}`);
      assert.equal((await score.getUndoInfo()).index, index + 1, `Legacy jump ${jump} is one undo command`);
      const timeline = await score.playbackTimeline(); verifyTimes(timeline);
      assert.deepEqual(sequence(timeline), [0, 1, 2, 3, 0, 1, 4, 5], `Legacy jump ${jump} is the Da Coda point of a D.C. al Coda`);
      assert.match(await score.saveXml(), new RegExp(`>${text}<`), `Legacy jump ${jump} exports its ${text} text`);
      await score.undo(); assert.deepEqual(sequence(await score.playbackTimeline()), [0, 1, 2, 3, 0, 1, 2, 3, 4, 5]);
      await score.redo(); assert.deepEqual(await score.playbackTimeline(), timeline);
    } finally { score.destroy(); }
  }
  const compound = await WebMscore.load('musicxml', fixture(6, 8, 1));
  try {
    const timeline = await compound.playbackTimeline(); verifyTimes(timeline);
    assert.equal(timeline.durationMs, 1500);
    assert.equal(timeline.occurrences[0].beatsPerMeasure, 2);
    assert.deepEqual(timeline.occurrences[0].beatsMs, [0, 750]);
    assert.equal(timeline.occurrences[0].downbeat, true);
  } finally { compound.destroy(); }
  console.log('verified native repeat expansion, legacy Da Coda markers, tempo, pickup and compound-meter timeline');
  return { repeats: true, legacyDaCodaMarkers: true, tempo: true, pickup: true, compoundMeter: true, selectionStart: true };
}
