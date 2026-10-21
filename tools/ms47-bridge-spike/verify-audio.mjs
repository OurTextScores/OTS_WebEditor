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
      if (process.env.MS47_DEBUG_AUDIO) console.log('stats', JSON.stringify({ ...st, env: st.env.slice(0, 8) }));
      assert.ok(st.seconds > 0 && st.rms > 0.001 && st.peak < 1, `${file}: audible, not clipping`);
      const result = { file, ms: Math.round(ms), seconds: st.seconds, rms: st.rms, peak: st.peak, env: st.env.slice(0, 12).map(v => +v.toFixed(4)) };
      results.push(result);
      console.log(`verified saveAudio ${file.split('/').pop()}: ${st.seconds.toFixed(1)} s audio in ${(ms / 1000).toFixed(1)} s, RMS ${st.rms.toFixed(4)}, peak ${st.peak.toFixed(3)}`);
      console.log(`  envelope (RMS per second): ${result.env.join(' ')}`);
    } finally { score.destroy(); }
  }
  return results;
}
