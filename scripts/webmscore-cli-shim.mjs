#!/usr/bin/env node
// A stand-in for MuseScore's command line (`mscore -o <output> <input>`) on the engine's Node build, for testing the
// server conversions (lib/music-conversion.ts) where MuseScore is not installed: MUSIC_MUSESCORE_BIN_CANDIDATES
// pointing here. The formats are the bridge's: input mscz, mscx, musicxml, xml, mxl, mei; output by extension.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const at = args.indexOf('-o');
const output = at >= 0 ? args[at + 1] : undefined;
const input = args.filter((_, i) => i !== at && i !== at + 1).at(-1);
if (!output || !input) {
  console.error('usage: webmscore-cli-shim.mjs -o <output> <input>');
  process.exit(2);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lib = createRequire(import.meta.url)(
  path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs'),
);
const WebMscore = lib.default ?? lib;
await WebMscore.ready;

const log = console.log;
console.log = () => {};
const extension = (file) => path.extname(file).slice(1).toLowerCase();
try {
  const score = await WebMscore.load(extension(input), fs.readFileSync(input));
  const writers = {
    mei: () => score.saveMei(),
    musicxml: () => score.saveXml(),
    xml: () => score.saveXml(),
    mxl: () => score.saveMxl(),
    mscz: () => score.saveMsc('mscz'),
    pdf: () => score.savePdf(),
    mid: () => score.saveMidi(true, true),
    midi: () => score.saveMidi(true, true),
  };
  const write = writers[extension(output)];
  if (!write) throw new Error(`Unsupported output format: ${extension(output)}`);
  const data = await write();
  fs.writeFileSync(output, typeof data === 'string' ? data : Buffer.from(data));
  console.log = log;
  process.exit(0);
} catch (error) {
  console.log = log;
  console.error(String(error?.message ?? error));
  process.exit(1);
}
