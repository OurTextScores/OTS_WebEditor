import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { testSoundfont } from './soundfont-fixture.mjs';

const part = measures => new TextEncoder().encode(`<?xml version="1.0"?><score-partwise version="4.0">
<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${measures}</part></score-partwise>`);
const attributes = '<attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>';
const rests = count => part(Array.from({ length: count }, (_, i) =>
  `<measure number="${i + 1}">${i ? '' : attributes}<note><rest measure="yes"/><duration>8</duration></note></measure>`).join(''));
const c4 = (duration, type, extra = '') =>
  `<note><pitch><step>C</step><octave>4</octave></pitch><duration>${duration}</duration><type>${type}</type>${extra}</note>`;
const tempo = bpm => `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${bpm}</per-minute></metronome></direction-type><sound tempo="${bpm}"/></direction>`;
// One sustained C4, then a measure with a tempo change after beat 1 and a fermata hold
const tone = part(`<measure number="1">${attributes}${tempo(120)}${c4(8, 'whole')}</measure>
<measure number="2">${c4(2, 'quarter')}${tempo(60)}${c4(2, 'quarter')}${c4(2, 'quarter', '<notations><fermata/></notations>')}${c4(2, 'quarter')}</measure>
<measure number="3">${c4(4, 'half')}${c4(4, 'half')}</measure>`);

const sequence = timeline => timeline.occurrences.map(o => o.measureIndex);
const starts = timeline => timeline.occurrences.map(o => o.startMs);
const near = (actual, expected, tolerance, message) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected} (±${tolerance})`);

async function render(iterator, untilSeconds = Infinity) {
  const left = [];
  let first = null, last = null;
  for (let done = false; !done;) {
    for (const r of await iterator()) {
      if (r.chunk.byteLength) {
        const floats = new Float32Array(r.chunk.buffer, r.chunk.byteOffset, r.chunk.byteLength / 4);
        left.push(floats.subarray(0, floats.length / 2));
        first ??= r.startTime;
        last = r.endTime;
      }
      if (r.done) done = true;
    }
    if (last !== null && last >= untilSeconds) { await iterator(true); break; }
  }
  const samples = new Float32Array(left.reduce((n, c) => n + c.length, 0));
  left.reduce((offset, c) => (samples.set(c, offset), offset + c.length), 0);
  return { samples, first, last };
}
// Fundamental from rising zero crossings over a steady window; time compression would not change it.
function frequency(samples, fromSeconds, toSeconds) {
  let crossings = 0;
  const from = Math.floor(fromSeconds * 44100), to = Math.floor(toSeconds * 44100);
  for (let i = from + 1; i < to; i++) if (samples[i - 1] < 0 && samples[i] >= 0) crossings++;
  return crossings / (toSeconds - fromSeconds);
}

export async function verifyPlaybackOptions(W, Module) {
  const startTime = score => Module.ccall('selectionPlaybackStartTime', 'number', ['number', 'number'], [score.scoreptr, score.excerptId]);
  const defaultFont = process.env.MS47_SOUNDFONT ? new Uint8Array(await readFile(process.env.MS47_SOUNDFONT)) : null;
  const report = {};
  await W.setSoundFont(testSoundfont());
  try {
    // Contract, clamping and revisions
    const score = await W.load('musicxml', rests(6));
    try {
      const caps = await score.playbackCapabilities();
      assert.deepEqual(caps.playbackOptions, { schemaVersion: 1, minTempoMultiplier: 0.25, maxTempoMultiplier: 2, playRepeats: true, positionConversion: true });
      assert.deepEqual(await score.playbackOptions(), { schemaVersion: 1, tempoMultiplier: 1, playRepeats: true, revision: 0 });
      const same = await score.setPlaybackOptions({ tempoMultiplier: 1, playRepeats: true });
      assert.equal(same.changed, false); assert.equal(same.revision, 0, 'no-op keeps the revision');
      assert.equal((await score.setPlaybackOptions({ tempoMultiplier: 10, playRepeats: true })).tempoMultiplier, 2);
      assert.equal((await score.setPlaybackOptions({ tempoMultiplier: 0.01, playRepeats: true })).tempoMultiplier, 0.25);
      const kept = await score.setPlaybackOptions({ tempoMultiplier: Number.NaN, playRepeats: true });
      assert.equal(kept.tempoMultiplier, 0.25, 'non-finite keeps the accepted multiplier');
      assert.equal(kept.changed, false);
      assert.equal(kept.revision, 2);
    } finally { score.destroy(); }

    // Written repeats: voltas, then D.C. al Fine; the same traversal for timeline, positions and selection start
    const voltas = await W.load('musicxml', rests(6));
    try {
      await voltas.selectPartMeasureByIndex(0, 1); await voltas.toggleRepeatStart();
      await voltas.selectPartMeasureByIndex(0, 2); await voltas.toggleRepeatEnd();
      await voltas.selectPartMeasureByIndex(0, 2); assert.ok(await voltas.addVolta(1));
      await voltas.selectPartMeasureByIndex(0, 3); assert.ok(await voltas.addVolta(2));
      const xml = await voltas.saveXml(), midi = await voltas.saveMidi(true, true), undo = (await voltas.getUndoInfo()).index;
      const on = await voltas.playbackTimeline();
      assert.deepEqual(sequence(on), [0, 1, 2, 1, 3, 4, 5]);
      assert.equal(on.durationMs, 14000);
      assert.equal(on.optionsRevision, 0);
      const off = (await voltas.setPlaybackOptions({ tempoMultiplier: 1, playRepeats: false }), await voltas.playbackTimeline());
      assert.deepEqual(sequence(off), [0, 1, 2, 3, 4, 5], 'repeats off plays every written measure once, both endings included');
      assert.equal(off.durationMs, 12000);
      assert.equal(off.optionsRevision, 1);
      const positions = await voltas.measurePositions();
      assert.equal(positions.optionsRevision, 1);
      assert.deepEqual(positions.events.map(e => e.position), starts(off), 'positions use the same traversal');
      await voltas.selectPartMeasureByIndex(0, 3);
      near(startTime(voltas) * 1000, 6000, 1, 'selection start follows the repeat option');

      // Position conversion: the second pass of measure 1 at 100%, then 50%, then repeats off
      await voltas.setPlaybackOptions({ tempoMultiplier: 1, playRepeats: true });
      const second = await voltas.playbackPositionAt(7000);
      assert.deepEqual([second.writtenTick, second.pass, second.atEnd], [2880, 1, false], 'mid second pass of measure 1');
      assert.equal(second.occurrenceKey, '2880:1');
      await voltas.setPlaybackOptions({ tempoMultiplier: 0.5, playRepeats: true });
      const slowed = await voltas.playbackTimeForPosition(second);
      assert.deepEqual([slowed.timeMs, slowed.pass, slowed.exact, slowed.fallback], [14000, 1, true, null], 'tempo change keeps the pass');
      const slowTimeline = await voltas.playbackTimeline();
      assert.deepEqual(starts(slowTimeline), starts(on).map(t => t * 2));
      assert.deepEqual(slowTimeline.occurrences.flatMap(o => o.beatsMs), on.occurrences.flatMap(o => o.beatsMs.map(t => t * 2)), 'click beats scale');
      const fraction = await voltas.playbackPositionAt(14000 + 0.6);
      assert.ok(fraction.fractionalTick > fraction.writtenTick && fraction.fractionalTick < fraction.writtenTick + 1, 'sub-tick progress');
      const roundTrip = await voltas.playbackTimeForPosition(fraction);
      near(roundTrip.timeMs, 14000.6, 0.01, 'fractional position round trip');
      await voltas.setPlaybackOptions({ tempoMultiplier: 0.5, playRepeats: false });
      const flat = await voltas.playbackTimeForPosition(second);
      assert.deepEqual([flat.timeMs, flat.pass, flat.exact, flat.fallback], [6000, 0, false, 'pass-unavailable'], 'removed pass falls back explicitly');
      const end = await voltas.playbackTimeForPosition({ writtenTick: 99999, fractionalTick: 99999, pass: 0 });
      assert.deepEqual([end.fallback, end.timeMs], ['end', 24000]);
      const tail = await voltas.playbackPositionAt(1e9);
      assert.equal(tail.atEnd, true);
      assert.equal(tail.timeMs, 24000);

      // Transient: no notation, MIDI or undo change; a reopened score starts from the defaults
      assert.equal(await voltas.saveXml(), xml, 'options do not reach MusicXML');
      assert.deepEqual(await voltas.saveMidi(true, true), midi, 'options do not reach MIDI export (tempo map restored)');
      assert.equal((await voltas.getUndoInfo()).index, undo, 'option changes and reads push no undo command');
      const reopened = await W.load('mscz', await voltas.saveMsc('mscz'));
      try {
        assert.deepEqual(await reopened.playbackOptions(), { schemaVersion: 1, tempoMultiplier: 1, playRepeats: true, revision: 0 });
        assert.deepEqual(starts(await reopened.playbackTimeline()), starts(on), 'saved score keeps written tempo and repeats');
      } finally { reopened.destroy(); }
      await voltas.undo();
      assert.equal((await voltas.getUndoInfo()).index, undo - 1, 'undo still steps through notation commands only');
      await voltas.redo();
      report.voltas = { on: sequence(on), off: sequence(off), fallback: flat.fallback };
    } finally { voltas.destroy(); }

    const dcFine = await W.load('musicxml', rests(6));
    try {
      await dcFine.selectPartMeasureByIndex(0, 1); assert.ok(await dcFine.addMarker(5), 'Fine');
      await dcFine.selectPartMeasureByIndex(0, 5); assert.ok(await dcFine.addJump(1), 'D.C. al Fine');
      const on = await dcFine.playbackTimeline();
      assert.deepEqual(sequence(on), [0, 1, 2, 3, 4, 5, 0, 1]);
      await dcFine.setPlaybackOptions({ tempoMultiplier: 1.5, playRepeats: false });
      const off = await dcFine.playbackTimeline();
      assert.deepEqual(sequence(off), [0, 1, 2, 3, 4, 5], 'repeats off ignores the D.C.');
      near(off.durationMs, 12000 / 1.5, 1, '150% duration');
      report.dcAlFine = { on: sequence(on), off: sequence(off) };
    } finally { dcFine.destroy(); }

    // Audio: pitch preserved, duration and holds coherent with the timeline at 50/100/150%
    const audio = await W.load('musicxml', tone);
    let audioDestroyed = false;
    const other = await W.load('musicxml', tone);
    try {
      const timelines = {}, pitch = {}, ends = {};
      for (const m of [1, 0.5, 1.5]) {
        await audio.setPlaybackOptions({ tempoMultiplier: m, playRepeats: true });
        const timeline = timelines[m] = await audio.playbackTimeline();
        const { samples, first, last } = await render(await audio.synthAudioBatch(0, 128));
        assert.equal(first, 0);
        pitch[m] = frequency(samples, 0.2, 1.0);
        ends[m] = last;
        near(last, timeline.durationMs / 1000 + 3, 512 / 44100, `stream length follows the ${m * 100}% traversal`);
        const positions = await audio.segmentPositions();
        assert.equal(positions.optionsRevision, timeline.optionsRevision);
        const seek = timeline.occurrences[1].startMs / 1000;
        const seeked = await audio.synthAudioBatch(seek, 2);
        near((await seeked())[0].startTime, seek, 1e-3, 'seek starts at the option-timeline position');
        await seeked(true);
      }
      for (const m of [0.5, 1.5]) near(pitch[m], pitch[1], pitch[1] * 0.01, `${m * 100}% keeps pitch`);
      near(pitch[1], 261.63, 3, 'synthetic C4');
      // Tempo changes and fermata holds live in the tempo map, so they scale with the multiplier. (Timed pauses
      // from breaths/section breaks are added unscaled upstream; this fixture has none.)
      const d = m => timelines[m].durationMs;
      for (const m of [0.5, 1.5]) near(d(m), d(1) / m, 2, `${m * 100}% duration`);
      const m2 = m => timelines[m].occurrences[1];
      assert.ok(m2(1).endMs - m2(1).startMs > 3500, 'a quarter at 120 and three at 60 take 3.5 s; the fermata holds longer');
      near((m2(0.5).endMs - m2(0.5).startMs), 2 * (m2(1).endMs - m2(1).startMs), 2, 'in-measure tempo change scales');
      assert.deepEqual(m2(0.5).beatsMs.map(t => t - m2(0.5).startMs), m2(1).beatsMs.map(t => 2 * (t - m2(1).startMs)), 'beats inside the tempo change scale');

      // Options are per project: another score, and a stream it owns, are unaffected
      assert.deepEqual(await other.playbackOptions(), { schemaVersion: 1, tempoMultiplier: 1, playRepeats: true, revision: 0 });
      assert.deepEqual(await other.playbackTimeline(), { ...timelines[1], optionsRevision: 0 });
      const live = await other.synthAudioBatch(0, 2);
      await live();
      await audio.setPlaybackOptions({ tempoMultiplier: 1.5, playRepeats: true });
      assert.ok((await live()).every(r => r.chunk.byteLength > 0), 'unchanged options for this project leave its stream alone');
      const stale = await audio.synthAudioBatch(0, 2);
      await stale();
      const unchanged = await audio.setPlaybackOptions({ tempoMultiplier: 1.5, playRepeats: true });
      assert.equal(unchanged.changed, false);
      assert.ok((await stale()).every(r => r.chunk.byteLength > 0), 'a no-op keeps the prepared stream');
      await audio.setPlaybackOptions({ tempoMultiplier: 1, playRepeats: true });
      assert.ok((await stale()).every(r => r.done && r.chunk.byteLength === 0), 'a change retires the old-option stream');
      const wav = await audio.saveAudio('wav');
      near((wav.length - 44) / 8 / 44100, timelines[1].durationMs / 1000 + 3, 512 / 44100, 'compatibility WAV uses the options');
      audio.destroy(); audioDestroyed = true;
      const reloaded = await W.load('musicxml', tone);
      try {
        assert.equal((await reloaded.playbackOptions()).revision, 0, 'a new project starts from defaults');
      } finally { reloaded.destroy(); }
      report.audio = { pitchHz: pitch, streamEndSeconds: ends, durationsMs: { 0.5: d(0.5), 1: d(1), 1.5: d(1.5) }, measure2Ms: { 0.5: m2(0.5).endMs - m2(0.5).startMs, 1: m2(1).endMs - m2(1).startMs } };
    } finally {
      if (!audioDestroyed) audio.destroy();
      other.destroy();
    }
  } finally {
    if (defaultFont) await W.setSoundFont(defaultFont);
  }
  console.log('verified playback options: clamping/revisions, repeats on/off (voltas, D.C. al Fine), position conversion, 50/100/150% pitch and timing, transient state');
  return { schemaVersion: 1, ...report };
}
