import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const part = (measures, parts = 1) => new TextEncoder().encode(`<?xml version="1.0"?><score-partwise version="4.0"><part-list>${
  Array.from({ length: parts }, (_, i) => `<score-part id="P${i + 1}"><part-name>P${i + 1}</part-name></score-part>`).join('')
}</part-list>${typeof measures === 'string' ? `<part id="P1">${measures}</part>` : measures.map((m, i) => `<part id="P${i + 1}">${m}</part>`).join('')}</score-partwise>`);
const attr = (staves = 1) => `<attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time>${
  staves === 2 ? '<staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef>' : '<clef><sign>G</sign><line>2</line></clef>'
}</attributes>`;
const note = (step, duration, type, extra = '') =>
  `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>${duration}</duration>${extra}<type>${type}</type></note>`;
const quarters = (steps = 'CDEF') => [...steps].map((s) => note(s, 2, 'quarter')).join('');
const rests = (count) => part(Array.from({ length: count }, (_, i) =>
  `<measure number="${i + 1}">${i ? '' : attr()}<note><rest measure="yes"/><duration>8</duration></note></measure>`).join(''));

/** Contract every map must meet: ordered, contiguous, finite, ending at the duration, geometry on a known page. */
function checkInvariants(map, label) {
  assert.equal(map.schemaVersion, 1, label);
  assert.equal(map.coordinateSpace, 'page-local-360dpi', label);
  assert.ok(map.intervals.length > 0, `${label}: intervals`);
  map.intervals.forEach((interval, i) => {
    assert.ok(interval.endMs > interval.startMs, `${label}: interval ${i} has positive duration`);
    if (i) assert.ok(Math.abs(interval.startMs - map.intervals[i - 1].endMs) < 0.5, `${label}: interval ${i} is contiguous`);
    const g = interval.geometry;
    if (g) {
      assert.ok([g.xStart, g.xEnd, g.y, g.height].every(Number.isFinite), `${label}: finite geometry ${i}`);
      assert.ok(g.xEnd >= g.xStart - 0.01 && g.height > 0, `${label}: forward, non-empty box ${i}`);
      assert.ok(map.pages.some((p) => p.page === g.page), `${label}: known page ${i}`);
    }
  });
  assert.equal(map.intervals[0].startMs, 0, `${label}: starts at zero`);
  assert.ok(Math.abs(map.intervals.at(-1).endMs - map.durationMs) <= 1, `${label}: ends at the duration`);
}
const measureOrder = (map) => map.intervals.reduce((order, i) => {
  const key = `${i.occurrenceIndex}:${i.measureIndex}`;
  if (order.at(-1)?.key !== key) order.push({ key, measure: i.measureIndex });
  return order;
}, []).map((o) => o.measure);
const speed = (i) => (i.geometry.xEnd - i.geometry.xStart) / (i.endMs - i.startMs);

export async function verifyFollowMap(W) {
  const report = {};
  // Real score: segment ids, times and starting x agree with segmentPositions; whole map is laid out.
  const bach = await W.load('mscz', new Uint8Array(await readFile(new URL('../../public/test_scores/bach_orig.mscz', import.meta.url))));
  try {
    const started = performance.now();
    const map = await bach.playbackFollowMap();
    report.bachMs = Math.round(performance.now() - started);
    checkInvariants(map, 'bach');
    assert.equal(map.complete, true);
    const caps = await bach.playbackCapabilities();
    assert.equal(caps.followMapSchemaVersion, 1);
    const segments = await bach.segmentPositions();
    for (const event of segments.events) {
      const interval = map.intervals.find((i) => i.segmentId === event.elid && Math.abs(i.startMs - event.position) <= 1);
      assert.ok(interval, `segment ${event.elid} at ${event.position} starts an interval`);
      assert.ok(Math.abs(interval.geometry.xStart - segments.elements[event.elid].x) <= 1, `segment ${event.elid} x`);
    }
    report.bachIntervals = map.intervals.length;
  } finally { bach.destroy(); }

  // Written repeats and jumps: occurrence order matches the timeline; options change times and traversal.
  const voltas = await W.load('musicxml', rests(6));
  try {
    await voltas.selectPartMeasureByIndex(0, 1); await voltas.toggleRepeatStart();
    await voltas.selectPartMeasureByIndex(0, 2); await voltas.toggleRepeatEnd();
    await voltas.selectPartMeasureByIndex(0, 2); await voltas.addVolta(1);
    await voltas.selectPartMeasureByIndex(0, 3); await voltas.addVolta(2);
    await voltas.selectPartMeasureByIndex(0, 5); await voltas.addJump(0); // D.C.
    const timeline = await voltas.playbackTimeline();
    const map = await voltas.playbackFollowMap();
    checkInvariants(map, 'repeats');
    assert.deepEqual(measureOrder(map), timeline.occurrences.map((o) => o.measureIndex));
    // A jump is a discontinuity: the cursor never interpolates across measures.
    assert.ok(map.intervals.every((i) => i.geometry.xStart <= i.geometry.xEnd));
    await voltas.setPlaybackOptions({ tempoMultiplier: 0.5, playRepeats: false });
    const slow = await voltas.playbackFollowMap();
    checkInvariants(slow, 'repeats off at 50%');
    assert.equal(slow.optionsRevision, 1);
    assert.deepEqual(measureOrder(slow), [0, 1, 2, 3, 4, 5]);
    assert.equal(slow.durationMs, 24000);
    report.repeats = { on: measureOrder(map), off: measureOrder(slow) };
  } finally { voltas.destroy(); }

  // A tempo change inside a measure and a fermata: each piece moves at one constant speed, faster at 120 than 60.
  const tempo = (bpm) => `<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${bpm}</per-minute></metronome></direction-type><sound tempo="${bpm}"/></direction>`;
  const changing = await W.load('musicxml', part(`<measure number="1">${attr()}${tempo(120)}${note('C', 2, 'quarter')}${tempo(60)}${note('D', 2, 'quarter')}${note('E', 2, 'quarter', '')}${note('F', 2, 'quarter')}</measure><measure number="2">${note('G', 2, 'quarter', '')}${note('A', 2, 'quarter', '<notations><fermata/></notations>')}${quarters('BC')}</measure>`));
  try {
    const map = await changing.playbackFollowMap();
    checkInvariants(map, 'tempo change');
    const first = map.intervals.filter((i) => i.measureIndex === 0);
    assert.equal(first.length, 4);
    // Same written width per beat; the 60 bpm beats take twice as long, so the cursor moves half as fast.
    assert.ok(Math.abs(first[0].endMs - first[0].startMs - 500) < 1 && Math.abs(first[1].endMs - first[1].startMs - 1000) < 1);
    const fermata = map.intervals.filter((i) => i.measureIndex === 1)[1];
    assert.ok(fermata.endMs - fermata.startMs > 1000, 'the fermata holds its beat longer');
    report.tempoChange = { beatsMs: first.map((i) => Math.round(i.endMs - i.startMs)) };
  } finally { changing.destroy(); }

  // A gradual tempo change (accelerando spanner): stepped tempo-map entries, each piece exact; the cursor speeds up.
  const base = await W.load('musicxml', part([1, 2, 3, 4].map((n) => `<measure number="${n}">${n === 1 ? attr() : ''}${quarters()}</measure>`).join('')));
  let mscx;
  try { mscx = new TextDecoder().decode(await base.saveMsc('mscx')); } finally { base.destroy(); }
  const measures = mscx.split('<Measure>');
  measures[2] = measures[2].replace('<voice>', '<voice><Spanner type="GradualTempoChange"><GradualTempoChange><tempoChangeType>accelerando</tempoChangeType><tempoChangeFactor>2</tempoChangeFactor></GradualTempoChange><next><location><measures>2</measures></location></next></Spanner>');
  measures[4] = measures[4].replace('<voice>', '<voice><Spanner type="GradualTempoChange"><prev><location><measures>-2</measures></location></prev></Spanner>');
  const accel = await W.load('mscx', new TextEncoder().encode(measures.join('<Measure>')));
  try {
    const map = await accel.playbackFollowMap();
    checkInvariants(map, 'accelerando');
    assert.ok(map.durationMs < 8000, 'the accelerando shortens the piece');
    const ramp = map.intervals.filter((i) => i.measureIndex === 1 || i.measureIndex === 2).map(speed);
    assert.ok(ramp.every((v, i) => i === 0 || v >= ramp[i - 1] - 1e-9), 'cursor speed rises through the accelerando');
    report.accelerando = { durationMs: map.durationMs, speedRatio: +(ramp.at(-1) / ramp[0]).toFixed(2) };
  } finally { accel.destroy(); }

  // A timed pause (caesura): a hold interval of exactly the pause, at one x.
  const paused = await W.load('musicxml', part(`<measure number="1">${attr()}${quarters()}</measure><measure number="2">${quarters()}</measure>`));
  try {
    const plain = (await paused.playbackFollowMap()).durationMs;
    await paused.selectPartMeasureByIndex(0, 0);
    await paused.addBreath(4);
    const map = await paused.playbackFollowMap();
    checkInvariants(map, 'caesura');
    const holds = map.intervals.filter((i) => i.geometry.xStart === i.geometry.xEnd);
    assert.ok(holds.length > 0 && holds.every((i) => Math.abs(i.endMs - i.startMs - 2000) < 1), 'two-second holds');
    assert.ok(Math.abs(map.durationMs - plain - holds.length * 2000) < 1);
    report.pauseHolds = holds.length;
  } finally { paused.destroy(); }

  // Multi-measure rest: the played measures map to the one rest the page shows, moving across its full width.
  const mmrest = await W.load('musicxml', part([1, 2, 3, 4, 5, 6].map((n) => `<measure number="${n}">${n === 1 ? attr() : ''}${n === 1 || n === 6 ? quarters() : '<note><rest measure="yes"/><duration>8</duration></note>'}</measure>`).join('')));
  try {
    await mmrest.setMultiMeasureRests(true);
    const map = await mmrest.playbackFollowMap();
    checkInvariants(map, 'multi-measure rest');
    const rest = map.intervals.find((i) => i.endMs - i.startMs > 6000);
    assert.ok(rest, 'one interval spans the four rest measures');
    assert.ok(Math.abs(rest.endMs - rest.startMs - 8000) < 1);
    assert.ok(rest.geometry.xEnd - rest.geometry.xStart > 0);
    report.multiMeasureRest = { restMs: Math.round(rest.endMs - rest.startMs) };
  } finally { mmrest.destroy(); }

  // Polyphony and cross-staff writing: segments are the union of onsets; the band spans every visible staff.
  const piano = await W.load('musicxml', part(`<measure number="1">${attr(2)}${note('C', 4, 'half', '<voice>1</voice><staff>1</staff>')}${note('E', 4, 'half', '<voice>1</voice><staff>2</staff>')}<backup><duration>8</duration></backup>${['G', 'A', 'B', 'C'].map((s) => note(s, 2, 'quarter', '<voice>2</voice><staff>1</staff>')).join('')}</measure><measure number="2">${note('C', 8, 'whole', '<voice>1</voice><staff>1</staff>')}</measure>`));
  try {
    const map = await piano.playbackFollowMap();
    checkInvariants(map, 'polyphony');
    assert.equal(map.intervals.filter((i) => i.measureIndex === 0).length, 4, 'four onsets from two voices');
    report.polyphonyIntervals = 4;
  } finally { piano.destroy(); }

  // Hidden staves shrink the band; grace notes add no intervals and move no times.
  const two = await W.load('musicxml', part([`<measure number="1">${attr()}${quarters()}</measure>`, `<measure number="1">${attr()}${quarters('GABC')}</measure>`], 2));
  try {
    const shown = await two.playbackFollowMap();
    await two.setPartVisible(1, false);
    const hidden = await two.playbackFollowMap();
    checkInvariants(hidden, 'hidden staff');
    assert.ok(hidden.intervals[0].geometry.height < shown.intervals[0].geometry.height, 'band covers visible staves only');
    await two.setPartVisible(1, true);
    await two.selectPartMeasureByIndex(0, 0);
    await two.addGraceNote(0);
    const grace = await two.playbackFollowMap();
    assert.deepEqual(grace.intervals.map((i) => [i.startMs, i.endMs]), shown.intervals.map((i) => [i.startMs, i.endMs]));
    report.hiddenStaffHeights = [Math.round(shown.intervals[0].geometry.height), Math.round(hidden.intervals[0].geometry.height)];
  } finally { two.destroy(); }

  console.log('verified follow map: ids/times/x vs segment positions, repeats/jumps and options, in-measure tempo and fermata, accelerando, timed pauses, multi-measure rests, polyphony/cross-staff, hidden staves, grace notes');
  return { schemaVersion: 1, ...report };
}
