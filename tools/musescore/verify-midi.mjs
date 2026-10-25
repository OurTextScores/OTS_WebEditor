import { reference400 } from './reference400.mjs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// MIDI export optionally compared with an explicitly selected 4.00 engine on the same scores: per-track notes (pitch, on/off tick,
// velocity) and the tempo map, with repeats expanded and not. The 4.00 reference runs in a child process (its Node
// build manages one load per process) and is skipped when MS47_REFERENCE_400 is unset.

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const forkBuild = reference400();

function parseMidi(bytes) {
  const b = Buffer.from(bytes);
  assert.equal(b.toString('latin1', 0, 4), 'MThd', 'MIDI header');
  const ntracks = b.readUInt16BE(10), division = b.readUInt16BE(12);
  let at = 8 + b.readUInt32BE(4);
  const tracks = [], tempos = [];
  for (let t = 0; t < ntracks; t++) {
    assert.equal(b.toString('latin1', at, at + 4), 'MTrk', 'track header');
    const end = at + 8 + b.readUInt32BE(at + 4);
    let p = at + 8, tick = 0, status = 0;
    const open = new Map(), notes = [];
    const vlq = () => { let v = 0, c; do { c = b[p++]; v = (v << 7) | (c & 0x7f); } while (c & 0x80); return v; };
    while (p < end) {
      tick += vlq();
      let s = b[p];
      if (s & 0x80) p++; else s = status;
      if (s === 0xff) { const type = b[p++], len = vlq(); if (type === 0x51) tempos.push([tick, b.readUIntBE(p, 3)]); p += len; continue; }
      if (s === 0xf0 || s === 0xf7) { p += vlq(); continue; }
      status = s;
      const kind = s & 0xf0, ch = s & 0x0f;
      const d1 = b[p++], d2 = (kind === 0xc0 || kind === 0xd0) ? 0 : b[p++];
      if (kind === 0x90 && d2 > 0) open.set(`${ch}:${d1}`, [tick, d2]);
      else if (kind === 0x80 || (kind === 0x90 && d2 === 0)) {
        const key = `${ch}:${d1}`, on = open.get(key);
        if (on) { notes.push([d1, on[0], tick, on[1]]); open.delete(key); }
      }
    }
    notes.sort((x, y) => x[1] - y[1] || x[0] - y[0]);
    if (notes.length) tracks.push(notes);
    at = end;
  }
  return { division, tracks, tempos };
}

const scale = (midi, division) => midi.division === division ? midi : {
  division, tempos: midi.tempos.map(([t, v]) => [Math.round(t * division / midi.division), v]),
  tracks: midi.tracks.map(tr => tr.map(([p, on, off, v]) => [p, Math.round(on * division / midi.division), Math.round(off * division / midi.division), v])),
};

export async function verifyMidi(WebMscore) {
  const corpus = [
    ['public/test_scores/bach_orig.mscz', 'mscz'],
    ['public/test_scores/four_measures.musicxml', 'musicxml'],
    ['tools/musescore/spanner-fixture.musicxml', 'musicxml'],
    ['tools/musescore/repeat-fixture.musicxml', 'musicxml'],
  ];
  const results = [];
  const temp = await mkdtemp(path.join(tmpdir(), 'ms47-midi-'));
  try {
    for (const [file, format] of corpus) {
      const data = new Uint8Array(await readFile(path.join(root, file)));
      for (const expand of [true, false]) {
        const score = await WebMscore.load(format, data);
        let mine;
        try {
          mine = parseMidi(await score.saveMidi(expand, true));
        } finally { score.destroy(); }
        assert.ok(mine.tracks.length > 0 && mine.tracks.some(t => t.length > 0), `${file}: MIDI has notes`);
        const result = { file, expand, tracks: mine.tracks.length, notes: mine.tracks.reduce((n, t) => n + t.length, 0) };
        if (forkBuild) {
          const out = path.join(temp, 'ref.mid');
          execFileSync(process.execPath, ['-e', `
            const fs=require('fs');const W=require(${JSON.stringify(forkBuild)});
            (async()=>{await W.ready;console.log=()=>{};const s=await W.load(${JSON.stringify(format)},fs.readFileSync(${JSON.stringify(path.join(root, file))}));
            fs.writeFileSync(${JSON.stringify(out)},await s.saveMidi(${expand},true));process.exit(0)})()`], { stdio: 'ignore', timeout: 120000 });
          const ref = scale(parseMidi(await readFile(out)), mine.division);
          const pitchesAndTimes = midi => midi.tracks.map(t => t.map(([p, on, off]) => [p, on, off]));
          const refNotes = ref.tracks.reduce((n, t) => n + t.length, 0);
          if (!expand && refNotes !== result.notes) {
            // 4.00 ignored expandRepeats=false and always expanded; 4.7 honours the flag (asserted below for the fixture)
            assert.ok(file.endsWith('repeat-fixture.musicxml'), `${file}: unexpected note count difference from 4.00`);
            result.ref400IgnoredExpandFlag = true;
            results.push(result);
            assert.equal(result.notes, 5, 'unexpanded: bar 2 is played once');
            console.log(`verified saveMidi ${path.basename(file)} expand=false: ${result.notes} notes (4.00 wrongly expanded to ${refNotes})`);
            continue;
          }
          assert.deepEqual(pitchesAndTimes(mine), pitchesAndTimes(ref), `${file} (expand ${expand}): notes match 4.00`);
          assert.deepEqual(mine.tempos.map(([t, v]) => [t, Math.round(60e6 / v)]), ref.tempos.map(([t, v]) => [t, Math.round(60e6 / v)]), `${file}: tempo map matches 4.00`);
          const velocityDiffs = mine.tracks.flatMap((t, i) => t.filter((n, j) => n[3] !== ref.tracks[i][j][3])).length;
          result.velocityDiffsVs400 = velocityDiffs;
        }
        if (file.endsWith('repeat-fixture.musicxml')) assert.equal(result.notes, expand ? 7 : 5, 'repeat expansion plays bar 2 twice');
        results.push(result);
        console.log(`verified saveMidi ${path.basename(file)} expand=${expand}: ${result.notes} notes${result.velocityDiffsVs400 !== undefined ? `, matches 4.00 (velocity differences: ${result.velocityDiffsVs400})` : ''}`);
      }
    }
  } finally { await rm(temp, { recursive: true, force: true }); }
  return results;
}
