const fs = require('fs');
const t0 = performance.now();
const W = require(process.argv[2]);
(async () => {
  await W.ready;
  const tReady = performance.now();
  const f = process.argv[3];
  const fmt = f.endsWith('.mscz') ? 'mscz' : 'musicxml';
  const s = await W.load(fmt, new Uint8Array(fs.readFileSync(f)), [], true);
  const tLoad = performance.now();
  const pages = await s.npages();
  const m = await s.saveMsc('mscz');
  const tSave = performance.now();
  const x = await s.saveXml();
  const tXml = performance.now();
  console.log(JSON.stringify({ input: f.split('/').pop(), pages, msczBytes: m.length, xmlBytes: x.length,
    ms: { boot: +(tReady - t0).toFixed(1), loadAndLayout: +(tLoad - tReady).toFixed(1), saveMscz: +(tSave - tLoad).toFixed(1), musicxml: +(tXml - tSave).toFixed(1) } }));
  process.exit(0);
})().catch(e => { console.log(JSON.stringify({ input: process.argv[3].split('/').pop(), error: String(e.message || e) })); process.exit(1); });
