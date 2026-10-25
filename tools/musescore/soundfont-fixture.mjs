// Original synthetic test audio, generated here; no external sample assets.
// A minimal SF2 with one looping sine preset. Same INAM/preset/file path, different attenuation.
const u16 = value => { const b = Buffer.alloc(2); b.writeUInt16LE(value & 0xffff); return b; };
const u32 = value => { const b = Buffer.alloc(4); b.writeUInt32LE(value); return b; };
const name = value => { const b = Buffer.alloc(20); b.write(value); return b; };
const chunk = (id, data) => Buffer.concat([Buffer.from(id), u32(data.length), data, Buffer.alloc(data.length % 2)]);
const list = (id, children) => chunk('LIST', Buffer.concat([Buffer.from(id), ...children]));

export function testSoundfont(attenuation = 0) {
  const frames = 2048;
  const samples = Buffer.alloc((frames + 46) * 2);
  for (let i = 0; i < frames; i++) samples.writeInt16LE(Math.round(20000 * Math.sin(2 * Math.PI * 261.625565 * i / 44100)), i * 2);
  const preset = (label, bag) => Buffer.concat([name(label), u16(0), u16(0), u16(bag), u32(0), u32(0), u32(0)]);
  const sample = (label, start, end, loopStart, loopEnd) => Buffer.concat([
    name(label), u32(start), u32(end), u32(loopStart), u32(loopEnd), u32(44100), Buffer.from([60, 0]), u16(0), u16(1),
  ]);
  const gen = (op, amount) => Buffer.concat([u16(op), u16(amount)]);
  const body = Buffer.concat([Buffer.from('sfbk'),
    list('INFO', [chunk('ifil', Buffer.concat([u16(2), u16(1)])), chunk('INAM', Buffer.from('OTS synthetic\0'))]),
    list('sdta', [chunk('smpl', samples)]),
    list('pdta', [
      chunk('phdr', Buffer.concat([preset('Sine', 0), preset('EOP', 1)])),
      chunk('pbag', Buffer.concat([u16(0), u16(0), u16(1), u16(0)])),
      chunk('pmod', Buffer.alloc(10)), chunk('pgen', Buffer.concat([gen(41, 0), gen(0, 0)])),
      chunk('inst', Buffer.concat([name('Sine'), u16(0), name('EOI'), u16(1)])),
      chunk('ibag', Buffer.concat([u16(0), u16(0), u16(4), u16(0)])),
      chunk('imod', Buffer.alloc(10)),
      chunk('igen', Buffer.concat([gen(48, attenuation), gen(34, -12000), gen(54, 1), gen(53, 0), gen(0, 0)])),
      chunk('shdr', Buffer.concat([sample('Sine', 0, frames, 0, frames), sample('EOS', frames + 46, frames + 46, frames + 46, frames + 46)])),
    ]),
  ]);
  return new Uint8Array(chunk('RIFF', body));
}
