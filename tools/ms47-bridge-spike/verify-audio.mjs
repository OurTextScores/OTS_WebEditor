import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

// Playback spike: render whole scores to WAV through 4.7's audio stack (FluidSynth via MPE) and report duration,
// level and render speed. MS47_SOUNDFONT must name the soundfont (the browser path writes /MuseScore_General.sf3).

export function wavStats(buffer) {
  const b = Buffer.from(buffer);
  assert.equal(b.toString('latin1', 0, 4), 'RIFF');
  let p = 12, fmt, ch, rate, bits, data;
  while (p < b.length) {
    const id = b.toString('latin1', p, p + 4), len = b.readUInt32LE(p + 4);
    if (id === 'fmt ') { fmt = b.readUInt16LE(p + 8); ch = b.readUInt16LE(p + 10); rate = b.readUInt32LE(p + 12); bits = b.readUInt16LE(p + 22); }
    if (id === 'data') { data = b.subarray(p + 8, p + 8 + len); break; }
    p += 8 + len + (len & 1);
  }
  const n = data.length / (bits / 8);
  const sample = i => fmt === 3 ? data.readFloatLE(i * 4) : data.readInt16LE(i * 2) / 32768;
  let sum = 0, peak = 0, es = 0;
  const env = [], perSec = rate * ch;
  for (let i = 0; i < n; i++) {
    const v = sample(i);
    sum += v * v; peak = Math.max(peak, Math.abs(v)); es += v * v;
    if ((i + 1) % perSec === 0) { env.push(Math.sqrt(es / perSec)); es = 0; }
  }
  return { fmt, ch, rate, bits, seconds: n / ch / rate, rms: Math.sqrt(sum / n), peak, env };
}

export async function verifyAudio(WebMscore, output) {
  assert.ok(process.env.MS47_SOUNDFONT, 'set MS47_SOUNDFONT to a .sf2/.sf3 file');
  if (process.env.MS47_ENGINE_LOG) await WebMscore.setLogLevel(Number(process.env.MS47_ENGINE_LOG));
  try { WebMscore.hasSoundfont = true; } catch { Object.defineProperty(WebMscore, 'hasSoundfont', { get: () => true }); }
  const scores = (process.env.MS47_AUDIO_SCORES ?? '../../public/test_scores/bach_orig.mscz').split(',');
  const results = [];
  for (const file of scores) {
    const data = new Uint8Array(await readFile(new URL(file, import.meta.url)));
    const score = await WebMscore.load(file.endsWith('.mscz') ? 'mscz' : 'musicxml', data);
    try {
      const t = performance.now();
      const wav = await score.saveAudio('wav');
      const ms = performance.now() - t;
      const st = wavStats(wav);
      await writeFile(`${output}/audio-${file.split('/').pop()}.wav`, wav);
      assert.ok(st.seconds > 0 && st.rms > 0.001 && st.peak < 1, `${file}: audible, not clipping`);
      const result = { file, ms: Math.round(ms), seconds: st.seconds, rms: st.rms, peak: st.peak, env: st.env.slice(0, 12).map(v => +v.toFixed(4)) };
      results.push(result);
      console.log(`verified saveAudio ${file.split('/').pop()}: ${st.seconds.toFixed(1)} s audio in ${(ms / 1000).toFixed(1)} s, RMS ${st.rms.toFixed(4)}, peak ${st.peak.toFixed(3)}`);
      console.log(`  envelope (RMS per second): ${result.env.join(' ')}`);
    } finally { score.destroy(); }
  }
  results.push(...await verifyStreaming(WebMscore, scores[0]));
  return results;
}

// Collect a batch iterator to the end: interleaved samples plus the first chunk's start time
async function drain(next, limit = 1e6) {
  const left = [], right = [];
  let first, last, chunks = 0;
  for (let done = false; !done && chunks < limit;) {
    for (const r of await next()) {
      if (r.chunk.length) {
        const f = new Float32Array(r.chunk.buffer, r.chunk.byteOffset, r.chunk.byteLength / 4);
        left.push(f.subarray(0, f.length / 2)); right.push(f.subarray(f.length / 2));
        first ??= r.startTime; last = r.endTime; chunks++;
      }
      if (r.done) { done = true; break; }
    }
  }
  const join = parts => { const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
  return { left: join(left), right: join(right), first, last, chunks };
}

const rms = a => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / Math.max(1, a.length));

function wavChannels(buffer) {
  const b = Buffer.from(buffer);
  const at = b.indexOf('data', 12, 'latin1');
  const data = new Float32Array(b.buffer.slice(b.byteOffset + at + 8, b.byteOffset + at + 8 + b.readUInt32LE(at + 4)));
  const left = new Float32Array(data.length / 2), right = new Float32Array(data.length / 2);
  for (let i = 0; i < left.length; i++) { left[i] = data[2 * i]; right[i] = data[2 * i + 1]; }
  return { left, right };
}

// The transport's streaming exports (4.00 SynthRes ABI): whole score, seek, measure range, selection, preview, cancel
async function verifyStreaming(WebMscore, file) {
  const data = new Uint8Array(await readFile(new URL(file, import.meta.url)));
  const results = [];
  const score = await WebMscore.load(file.endsWith('.mscz') ? 'mscz' : 'musicxml', data);
  try {
    // Whole score streamed == saveAudio, sample for sample (same engine, same render loop)
    const whole = wavChannels(await score.saveAudio('wav'));
    const t = performance.now();
    const streamed = await drain(await score.synthAudioBatch(0, 64));
    const ms = performance.now() - t;
    assert.equal(streamed.first, 0);
    assert.ok(Math.abs(streamed.left.length - whole.left.length) < 512, `stream length ${streamed.left.length} vs ${whole.left.length}`);
    let maxDiff = 0;
    for (let i = 0; i < Math.min(streamed.left.length, whole.left.length); i++) maxDiff = Math.max(maxDiff, Math.abs(streamed.left[i] - whole.left[i]), Math.abs(streamed.right[i] - whole.right[i]));
    assert.equal(maxDiff, 0, 'streamed samples are identical to saveAudio');
    console.log(`verified synthAudioBatch: ${streamed.chunks} chunks, identical to saveAudio, ${Math.round(ms)} ms`);
    results.push({ stream: 'whole', chunks: streamed.chunks, maxDiff, ms: Math.round(ms) });

    // Seek: synthAudio(30) starts at 30 s and is audible; cancel ends the stream
    const next = await score.synthAudio(30);
    const r0 = await next();
    assert.ok(Math.abs(r0.startTime - 30) < 0.02 && r0.chunk.byteLength === 512 * 2 * 4, `seek start ${r0.startTime}`);
    let level = 0;
    for (let i = 0; i < 40; i++) { const r = await next(); const f = new Float32Array(r.chunk.buffer, r.chunk.byteOffset, r.chunk.byteLength / 4); level = Math.max(level, rms(f)); }
    assert.ok(level > 0.001, 'seeked stream is audible');
    assert.equal((await next(true)).done, true, 'cancel ends the stream');
    const after = await next();
    assert.ok(after.done && after.chunk.byteLength === 0, 'a finished stream returns empty done records');
    console.log(`verified synthAudio seek+cancel: starts at ${r0.startTime.toFixed(3)} s, audible`);

    // Measure range 3..4 (indices 2..3): starts at bar 3's time, lasts two bars; saveAudioForMeasureRange agrees
    const positions = JSON.parse(await score.savePositions(false));
    const barStart = positions.events.find(e => e.elid === 2)?.position / 1000;
    const barEnd = positions.events.find(e => e.elid === 4)?.position / 1000;
    const range = await drain(await score.synthAudioBatchForMeasureRange(2, 3, 32));
    assert.ok(Math.abs(range.first - barStart) < 0.02, `range starts at bar 3 (${range.first} vs ${barStart})`);
    assert.ok(Math.abs(range.last - barEnd) < 0.03, `range ends after bar 4 (${range.last} vs ${barEnd})`);
    assert.ok(rms(range.left) > 0.001, 'range is audible');
    const rangeWav = wavStats(await score.saveAudioForMeasureRange('wav', 2, 3));
    assert.ok(Math.abs(rangeWav.seconds - (range.last - range.first)) < 0.02, 'saveAudioForMeasureRange matches the streamed range');
    console.log(`verified measure range: ${range.first.toFixed(2)}–${range.last.toFixed(2)} s, WAV ${rangeWav.seconds.toFixed(2)} s`);

    // From selection: bar 5 selected -> stream starts at bar 5's time
    assert.equal(await score.selectPartMeasureByIndex(0, 4), true);
    const bar5 = positions.events.find(e => e.elid === 4)?.position / 1000;
    const fromSel = await (await score.synthAudioBatchFromSelection(4))();
    assert.ok(Math.abs(fromSel[0].startTime - bar5) < 0.02, `selection stream starts at bar 5 (${fromSel[0].startTime} vs ${bar5})`);
    console.log(`verified synthAudioBatchFromSelection: starts at ${fromSel[0].startTime.toFixed(2)} s`);

    // Selection preview: a single note sounds for about the requested duration, starting at 0
    assert.equal(await score.selectPartMeasureByIndex(0, 0), true);
    assert.equal(await score.selectNextChord(), true);
    const preview = await drain(await score.synthSelectionPreviewBatch(16, 400));
    assert.equal(preview.first, 0);
    assert.ok(Math.abs(preview.last - 0.4) < 0.02, `preview lasts the requested 0.4 s (${preview.last})`);
    assert.ok(rms(preview.left) > 0.001, 'preview is audible');
    console.log(`verified synthSelectionPreviewBatch: ${preview.last.toFixed(2)} s, RMS ${rms(preview.left).toFixed(4)}`);
    results.push({ stream: 'seek/range/selection/preview', ok: true });
  } finally { score.destroy(); }
  return results;
}
