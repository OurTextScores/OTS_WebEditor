import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { testSoundfont } from './soundfont-fixture.mjs';

const xml = body => new TextEncoder().encode(`<?xml version="1.0"?><score-partwise version="4.0">
<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">
<measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>${body}</measure></part></score-partwise>`);
const tone = xml('<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>');
const rest = xml('<note><rest/><duration>4</duration><type>whole</type></note>');
const level = batch => Math.max(0, ...batch.flatMap(r => Array.from(new Float32Array(r.chunk.buffer, r.chunk.byteOffset, r.chunk.byteLength / 4), Math.abs)));
const ended = batch => batch.every(r => r.done && r.chunk.byteLength === 0);

export async function verifyPlaybackSafety(W, Module) {
  assert.ok(W.bundled, 'Playback safety requires MS47_BUNDLE (MEMFS), matching the browser package');
  assert.equal(typeof Module._probeMissingLayout, 'undefined', 'fault injection must not ship in the browser/Node application bundle');
  const state = () => {
    const ptr = Module.ccall('playbackDiagnostics', 'number', [], []);
    try {
      const length = new DataView(Module.HEAPU8.buffer).getUint32(ptr + 4, true);
      return JSON.parse(new TextDecoder().decode(Module.HEAPU8.subarray(ptr + 8, ptr + 8 + length)));
    } finally { Module._free(ptr); }
  };
  const defaultFont = new Uint8Array(await readFile(process.env.MS47_SOUNDFONT));
  try {
    await W.setSoundFont(testSoundfont());
    const a = await W.load('musicxml', tone);
    const b = await W.load('musicxml', rest);
    const caps = await a.playbackCapabilities();
    assert.equal(caps.schemaVersion, 1);
    assert.equal(caps.streamHandlesVersion, 1);
    assert.equal(caps.partialLayoutSafe, true);
    assert.deepEqual(caps.pcm, { sampleRate: 44100, channels: 2, framesPerChunk: 512, format: 'f32-planar' });
    let aDestroyed = false, bDestroyed = false;
    try {
      const old = await a.synthAudioBatch(0, 16);
      assert.ok(level(await old()) > 0.001, 'synthetic preset sounds');
      const current = await b.synthAudioBatch(0, 16);
      assert.ok(ended(await old(true)), 'stale cancel returns empty done');
      assert.ok(ended(await old()), 'stale pull returns empty done');
      const first = await current();
      assert.equal(first[0].startTime, 0, 'stale iterator did not advance the new mixer');
      assert.ok(level(first) < 1e-6, 'previous score cannot sound under the rest score');
      a.destroy(); aDestroyed = true;
      const second = await current();
      assert.ok(second[0].chunk.byteLength > 0, 'destroying old score cannot cancel the new owner');
      assert.equal(second[0].startTime, first.at(-1).endTime);
      b.destroy(); bDestroyed = true;
      assert.ok(ended(await current()), 'destroy invalidates its active handle');
      assert.equal(state().retainedStreams, 0);
      assert.equal(state().sequences, 0);
    } finally {
      if (!aDestroyed) a.destroy();
      if (!bDestroyed) b.destroy();
    }

    const score = await W.load('musicxml', tone);
    try {
      const before = await score.synthAudioBatch(0, 16);
      const loud = level(await before());
      const generation = state().soundFontGeneration;
      await W.setSoundFont(testSoundfont(1440)); // same INAM, same file, different sample gain
      assert.ok(state().soundFontGeneration > generation);
      assert.equal(state().retainedStreams, 0, 'font replacement invalidates prepared streams');
      assert.ok(ended(await before(true)));
      const quietIterator = await score.synthAudioBatch(0, 16);
      const quiet = level(await quietIterator());
      assert.ok(loud > 0.001 && quiet < loud / 100, `same-path replacement is audible: ${loud} -> ${quiet}`);
      await quietIterator(true);
      assert.equal(state().loadedSoundFontGeneration, state().soundFontGeneration);
      await W.setSoundFont(testSoundfont());
      const retained = [];
      for (let i = 0; i < 100; i++) {
        const next = await score.synthAudioBatch(0, 2);
        await next(); await next(true); retained.push(next);
        assert.equal(state().retainedStreams, 0, 'cancel reclaims stream state');
      }
      const live = await score.synthAudioBatch(0, 2);
      for (const stale of retained) assert.ok(ended(await stale(true)));
      assert.equal((await live())[0].startTime, 0, 'retired IDs never alias a new stream');
      await live(true);
      const end = await score.synthAudioBatch(4.99, 64);
      const last = await end();
      assert.ok(last.some(r => r.done), 'natural completion is terminal');
      assert.equal(state().retainedStreams, 0, 'natural completion reclaims stream state');
      assert.ok(ended(await end()));
      const interrupted = await score.synthAudioBatch(0, 2);
      await score.saveAudio('wav');
      assert.ok(ended(await interrupted(true)), 'full-WAV render supersedes the previous stream owner');
      await W.setSoundFont(new Uint8Array([1, 2, 3]));
      await assert.rejects(score.synthAudioBatch(0, 2), /Internal Error/, 'invalid replacement cannot reuse old cached audio');
      return { schemaVersion: 1, staleOwnership: true, samePathSoundfont: { loud, quiet }, repeatedSessions: 100, retainedStreams: state().retainedStreams };
    } finally { score.destroy(); }
  } finally { await W.setSoundFont(defaultFont); }
}

export async function verifyPartialPositions(W, Module) {
  assert.ok(!W.bundled, 'Missing-layout fault injection belongs to the Node verification harness, not the browser package');
  const bytes = new Uint8Array(await readFile(new URL('../../public/test_scores/bach_orig.mscz', import.meta.url)));
  const score = await W.load('mscz', bytes);
  const read = ptr => {
    try {
      const length = new DataView(Module.HEAPU8.buffer).getUint32(ptr + 4, true);
      return JSON.parse(new TextDecoder().decode(Module.HEAPU8.subarray(ptr + 8, ptr + 8 + length)));
    } finally { Module._free(ptr); }
  };
  try {
    const before = await score.measurePositions();
    const beforeSegments = await score.segmentPositions();
    const partial = read(Module.ccall('probeMissingLayout', 'number', ['number'], [score.scoreptr]));
    assert.equal(partial.measures.schemaVersion, 1);
    assert.equal(partial.measures.complete, false);
    assert.ok(partial.measures.elements.some(e => !e.geometryAvailable));
    for (const [positions, full] of [[partial.measures, before], [partial.segments, beforeSegments]]) {
      assert.deepEqual(positions.elements.map(e => [e.id, e.writtenTick]), full.elements.map(e => [e.id, e.writtenTick]));
      assert.ok(positions.events.every(e => positions.elements[e.elid]));
      assert.ok(positions.elements.every(e => [e.x, e.y, e.sx, e.sy].every(Number.isFinite)));
      assert.ok(positions.elements.filter(e => !e.geometryAvailable).every(e => e.page === -1 && e.sx === 0 && e.sy === 0));
      assert.deepEqual(positions.events, full.events, 'missing geometry does not remove musical timing');
    }
    const after = await score.measurePositions();
    assert.deepEqual(after, before, 'fault injection restores the real score layout');
    const repeated = await W.load('musicxml', new Uint8Array(await readFile(new URL('../../public/test_scores/playback_timeline.musicxml', import.meta.url))));
    try {
      const events = (await repeated.segmentPositions()).events;
      assert.deepEqual(events.map(e => e.position).sort((a, b) => a - b), [0, 1000, 5000, 9000, 13000, 15000]);
      assert.deepEqual(events.map(e => e.elid), [0, 1, 2, 1, 3, 4]);
    } finally { repeated.destroy(); }
    return { measures: before.elements.length, segments: beforeSegments.elements.length, missingGeometrySafe: true, repeatEventsClipped: true };
  } finally { score.destroy(); }
}
