const core = require('@magenta/music/node/core.js');
const vae = require('@magenta/music/node/music_vae.js');
const tf = require('@tensorflow/tfjs');

const Z_DIM = 256,
  SPQ = 24,
  QPM = 120;
const URL = 'https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/multitrack_chords';

(async () => {
  console.log('tf backend:', tf.getBackend && tf.getBackend());
  const t0 = Date.now();
  const model = new vae.MusicVAE(URL);
  await model.initialize();
  console.log('initialized in', ((Date.now() - t0) / 1000).toFixed(1), 's');

  const chords = ['C', 'Am'];
  const z = tf.randomNormal([1, Z_DIM]);
  const bars = [];
  for (const c of chords) {
    const decoded = await model.decode(z, undefined, [c], SPQ);
    bars.push(decoded[0]);
  }
  z.dispose();
  console.log(
    'decoded bars:',
    bars.length,
    'notes/bar:',
    bars.map((b) => (b.notes || []).length),
  );

  // concatenate quantized -> merge -> unquantize -> midi
  const merged = core.sequences.clone(bars[0]);
  let off = Number(merged.totalQuantizedSteps || SPQ * 4);
  for (let i = 1; i < bars.length; i++) {
    const b = core.sequences.clone(bars[i]);
    for (const n of b.notes || []) {
      n.quantizedStartStep += off;
      n.quantizedEndStep += off;
      merged.notes.push(n);
    }
    off += Number(b.totalQuantizedSteps || SPQ * 4);
  }
  merged.totalQuantizedSteps = off;
  const cons = core.sequences.mergeInstruments(merged);
  const unq = core.sequences.unquantizeSequence(cons, QPM);
  const midi = core.sequenceProtoToMidi(unq);
  const header = Buffer.from(midi.slice(0, 4)).toString('ascii');
  console.log('MIDI bytes:', midi.length, 'header:', header, header === 'MThd' ? 'OK' : 'BAD');
  console.log('SMOKE OK');
})().catch((e) => {
  console.error('SMOKE FAIL:', e && e.message ? e.message : e);
  process.exit(1);
});
