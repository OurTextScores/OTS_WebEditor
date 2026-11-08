/*
 * Evaluates reading handwritten rehearsal marks with a real model (performer mode, Phase 7c-3), using the app's own
 * prompt and answer validation (components/score-editor/marks-review/readMarks.ts). Fixtures are the kinds of marks
 * the rule recognisers leave for the model: sloppy shapes, small symbols, digits, reminders, and words outside the
 * word list. Ink is synthesised with seeded jitter and drawn the way the app draws it (a stroke on a five-line staff).
 *
 *   OPENAI_API_KEY=… node --import ./scripts/ts-resolve-hook.mjs scripts/eval-read-marks.mts [model …] [--music] [--out dir]
 *
 * --music draws ink over the printed bars (markImage.ts, as the editor does), rendered by the engine in Node and
 * rasterised by Playwright's Chromium; without it, ink is drawn on a bare staff.
 *
 * Calls the provider directly (not the app's proxy). Costs a few cents per model.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import zlib from 'node:zlib';
import { chromium } from '@playwright/test';
import { composeMarkPicture } from '../components/score-editor/marks-review/markImage.ts';
import { pageGeometryOf, placeAnchor } from '../components/performer/annotations/pageGeometry.ts';
import {
  barsXml,
  proposalFromReading,
  readPrompt,
  READ_SYSTEM_PROMPT,
} from '../components/score-editor/marks-review/readMarks.ts';

// The engine's Node build replaces the global fetch while it loads: keep the real one for the provider
const providerFetch = globalThis.fetch;

type Point = [number, number, number];
type Expect = { kind: string; value?: string; style?: string };
type Fixture = { name: string; ink?: Point[]; text?: string; extent?: boolean; accept: Expect[] };

// ---------------------------------------------------------------------------------------------------------------
// Synthetic handwriting
let seed = 7;
const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
const jitter = (points: [number, number][], amount = 0.06): Point[] =>
  points.map(([x, y]) => [x + random() * amount, y + random() * amount, 0.6]);
const line = (corners: [number, number][], steps = 10): [number, number][] => {
  const out: [number, number][] = [corners[0]];
  for (let c = 1; c < corners.length; c += 1)
    for (let s = 1; s <= steps; s += 1)
      out.push([
        corners[c - 1][0] + ((corners[c][0] - corners[c - 1][0]) * s) / steps,
        corners[c - 1][1] + ((corners[c][1] - corners[c - 1][1]) * s) / steps,
      ]);
  return out;
};
const ellipse = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  from = 0,
  to = Math.PI * 2,
  n = 30,
) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = from + ((to - from) * i) / n;
    return [cx + Math.cos(t) * rx, cy + Math.sin(t) * ry] as [number, number];
  });

const FIXTURES: Fixture[] = [
  // Ink the rules leave alone
  {
    name: 'hairpin with a hooked start',
    ink: jitter(
      [
        ...ellipse(6.6, 5.2, 0.4, 0.3, Math.PI, Math.PI * 1.6, 6),
        ...line([
          [6.4, 5],
          [0, 6],
          [6.2, 7.1],
        ]),
      ],
      0.12,
    ),
    extent: true,
    accept: [{ kind: 'hairpin', value: 'cresc' }],
  },
  {
    name: 'diminuendo drawn in two arms with an overlap',
    ink: jitter(
      line([
        [0, 5.2],
        [6, 6.1],
        [5.6, 6.0],
        [0.2, 7.0],
      ]),
      0.1,
    ),
    extent: true,
    accept: [{ kind: 'hairpin', value: 'dim' }],
  },
  {
    name: 'slur with a tail flick',
    ink: jitter(
      [...ellipse(4, 0.2, 4, 1.6, Math.PI, Math.PI * 2, 24), [8.3, -0.4], [8.5, -0.9]],
      0.1,
    ),
    extent: true,
    accept: [{ kind: 'slur' }],
  },
  {
    name: 'eyeglasses (watch)',
    ink: jitter([
      ...ellipse(0.8, -2, 0.7, 0.6),
      [1.5, -2.1],
      [2.0, -2.1],
      ...ellipse(2.7, -2, 0.7, 0.6, Math.PI, Math.PI * 3),
    ]),
    accept: [{ kind: 'none' }],
  },
  {
    name: 'arrow pointing right',
    ink: jitter(
      line([
        [0, -2],
        [4, -2],
        [3.4, -2.5],
        [4, -2],
        [3.4, -1.5],
      ]),
    ),
    accept: [{ kind: 'none' }],
  },
  {
    name: 'circle around a note',
    ink: jitter(ellipse(0, 2, 1.2, 2.4, 0, Math.PI * 2.1, 36), 0.1),
    accept: [{ kind: 'none' }],
  },
  {
    name: 'breath tick above the staff',
    ink: jitter(
      line(
        [
          [0, -2.2],
          [0.25, -1.2],
          [0.7, -2.6],
        ],
        5,
      ),
    ),
    accept: [{ kind: 'breath' }],
  },
  {
    name: 'fermata: arc with a dot scribbled in',
    ink: jitter([
      ...ellipse(0, -1.2, 1.2, 1.0, Math.PI, Math.PI * 2, 16),
      [0.4, -1.0],
      ...ellipse(0, -1.5, 0.12, 0.12, 0, Math.PI * 4, 10),
    ]),
    accept: [{ kind: 'fermata' }],
  },
  {
    name: 'handwritten p below the staff',
    ink: jitter(
      [
        [0, 6],
        [0, 7],
        [0, 8],
        [0, 9],
        [0, 7.6],
        [0, 6.4],
        ...ellipse(0.5, 6.6, 0.5, 0.55, Math.PI, Math.PI * 3, 14),
      ],
      0.05,
    ),
    accept: [{ kind: 'dynamic', value: 'p' }],
  },
  {
    name: 'fingering 3 above a note',
    ink: jitter(
      [
        ...ellipse(0.3, -2.6, 0.35, 0.3, Math.PI * 1.1, Math.PI * 2.5, 10),
        ...ellipse(0.3, -1.95, 0.4, 0.35, Math.PI * 1.5, Math.PI * 2.9, 10),
      ],
      0.04,
    ),
    accept: [{ kind: 'fingering', value: '3' }],
  },
  {
    name: 'small accent wedge over a note',
    ink: jitter(
      line(
        [
          [0, -1.8],
          [0.9, -1.5],
          [0, -1.2],
        ],
        5,
      ),
      0.03,
    ),
    accept: [{ kind: 'articulation', value: 'accent' }],
  },
  {
    name: 'wavy line (reminder)',
    ink: jitter(
      Array.from(
        { length: 40 },
        (_, i) => [i * 0.2, -2 + Math.sin(i / 2) * 0.3] as [number, number],
      ),
    ),
    accept: [{ kind: 'none' }, { kind: 'text' }],
  },
  // Typed words outside the word list
  {
    name: 'crsc. (misspelt)',
    text: 'crsc.',
    accept: [{ kind: 'text', style: 'expression' }, { kind: 'hairpin' }],
  },
  {
    name: 'dolcissimo',
    text: 'dolcissimo',
    accept: [{ kind: 'text', value: 'dolcissimo', style: 'expression' }],
  },
  { name: 'sul G', text: 'sul G', accept: [{ kind: 'text', style: 'technique' }] },
  { name: 'rall. molto', text: 'rall. molto', accept: [{ kind: 'text', style: 'tempo' }] },
  { name: 'watch Anna', text: 'watch Anna', accept: [{ kind: 'none' }] },
  { name: 'breathe', text: 'breathe', accept: [{ kind: 'breath' }, { kind: 'none' }] },
  {
    name: 'subito p',
    text: 'subito p',
    accept: [
      { kind: 'dynamic', value: 'p' },
      { kind: 'text', style: 'expression' },
    ],
  },
  { name: 'mute on', text: 'mute on', accept: [{ kind: 'text', style: 'technique' }] },
  { name: 'slower', text: 'slower', accept: [{ kind: 'text', style: 'tempo' }] },
  {
    name: 'più f',
    text: 'più f',
    accept: [
      { kind: 'text', style: 'expression' },
      { kind: 'dynamic', value: 'f' },
    ],
  },
  { name: 'fingering 1 typed', text: '1', accept: [{ kind: 'fingering', value: '1' }] },
  { name: 'bow!', text: 'bow!', accept: [{ kind: 'none' }] },
  // Held out: added after the prompt hints were written, to check they generalise
  {
    name: 'held-out: tenuto dash',
    ink: jitter(
      line(
        [
          [-0.5, -1.5],
          [0.5, -1.45],
        ],
        6,
      ),
      0.03,
    ),
    accept: [{ kind: 'articulation', value: 'tenuto' }],
  },
  {
    name: 'held-out: staccato dot',
    ink: jitter(ellipse(0, -1.4, 0.12, 0.12, 0, Math.PI * 4, 12), 0.02),
    accept: [{ kind: 'articulation', value: 'staccato' }],
  },
  {
    name: 'held-out: slur below the notes',
    ink: jitter(ellipse(3, 5, 3, 1.3, 0, Math.PI, 22).reverse(), 0.08),
    extent: true,
    accept: [{ kind: 'slur' }],
  },
  {
    name: 'held-out: box around a bar',
    ink: jitter(
      line(
        [
          [-1, -1.5],
          [7, -1.5],
          [7, 5.5],
          [-1, 5.5],
          [-1, -1.4],
        ],
        8,
      ),
      0.1,
    ),
    accept: [{ kind: 'none' }],
  },
  {
    name: 'held-out: tranquillo',
    text: 'tranquillo',
    accept: [
      { kind: 'text', style: 'expression' },
      { kind: 'text', style: 'tempo' },
    ],
  },
  {
    name: 'held-out: on the D string',
    text: 'on the D string',
    accept: [{ kind: 'text', style: 'technique' }],
  },
  { name: 'held-out: check tuning', text: 'check tuning', accept: [{ kind: 'none' }] },
  {
    name: 'held-out: lunga',
    text: 'lunga',
    accept: [
      { kind: 'fermata' },
      { kind: 'text', style: 'tempo' },
      { kind: 'text', style: 'expression' },
    ],
  },
];

// ---------------------------------------------------------------------------------------------------------------
// The app's ink image (inkImage in readMarks.ts), rasterised without a canvas
function crc32(bytes: Buffer) {
  let c = ~0;
  for (const byte of bytes) {
    c ^= byte;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}
function png(width: number, height: number, gray: Uint8Array): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 0; // greyscale
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y += 1)
    gray.subarray(y * width, (y + 1) * width).forEach((v, x) => (raw[y * (width + 1) + 1 + x] = v));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
function inkPng(points: Point[]): Buffer {
  const scale = 24;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const left = Math.min(...xs, 0) - 3;
  const right = Math.max(...xs, 8) + 3;
  const top = Math.min(...ys, 0) - 3;
  const bottom = Math.max(...ys, 4) + 3;
  const width = Math.ceil((right - left) * scale);
  const height = Math.ceil((bottom - top) * scale);
  const gray = new Uint8Array(width * height).fill(255);
  const dot = (cx: number, cy: number, r: number, v: number) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y += 1)
      for (let x = Math.floor(cx - r); x <= cx + r; x += 1)
        if (x >= 0 && y >= 0 && x < width && y < height && (x - cx) ** 2 + (y - cy) ** 2 <= r * r)
          gray[y * width + x] = Math.min(gray[y * width + x], v);
  };
  for (let l = 0; l < 5; l += 1) {
    const y = Math.round((l - top) * scale);
    for (let x = 0; x < width; x += 1) gray[y * width + x] = 153;
  }
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = [(points[i - 1][0] - left) * scale, (points[i - 1][1] - top) * scale];
    const [x1, y1] = [(points[i][0] - left) * scale, (points[i][1] - top) * scale];
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let s = 0; s <= steps; s += 1)
      dot(x0 + ((x1 - x0) * s) / steps, y0 + ((y1 - y0) * s) / steps, 1.5, 0);
  }
  return png(width, height, gray);
}

// ---------------------------------------------------------------------------------------------------------------
/** One request to the provider the model belongs to (claude-* Anthropic, gemini-* Google, otherwise OpenAI). */
async function ask(model: string, prompt: string, image: Buffer | null): Promise<string> {
  const base64 = image?.toString('base64');
  const post = async (url: string, headers: Record<string, string>, body: unknown) => {
    const response = await providerFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!response.ok) throw new Error(data.error?.message ?? String(response.status));
    return data;
  };
  if (model.startsWith('claude-')) {
    const content: unknown[] = [];
    if (base64)
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: base64 },
      });
    content.push({ type: 'text', text: prompt });
    const data = await post(
      'https://api.anthropic.com/v1/messages',
      { 'x-api-key': process.env.ANTHROPIC_API_KEY ?? '', 'anthropic-version': '2023-06-01' },
      {
        model,
        max_tokens: 1000,
        system: READ_SYSTEM_PROMPT,
        messages: [{ role: 'user', content }],
      },
    );
    return (data.content ?? []).map((block: { text?: string }) => block.text ?? '').join('');
  }
  if (model.startsWith('gemini-')) {
    const parts: unknown[] = [{ text: prompt }];
    if (base64) parts.push({ inline_data: { mime_type: 'image/png', data: base64 } });
    const data = await post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      { 'x-goog-api-key': process.env.GEMINI_API_KEY ?? '' },
      {
        system_instruction: { parts: [{ text: READ_SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts }],
      },
    );
    return (data.candidates?.[0]?.content?.parts ?? [])
      .map((part: { text?: string }) => part.text ?? '')
      .join('');
  }
  const content: unknown[] = [{ type: 'text', text: prompt }];
  if (base64)
    content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } });
  const data = await post(
    'https://api.openai.com/v1/chat/completions',
    { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    {
      model,
      messages: [
        { role: 'system', content: READ_SYSTEM_PROMPT },
        { role: 'user', content },
      ],
      max_completion_tokens: 2000,
    },
  );
  return data.choices?.[0]?.message?.content ?? '';
}

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outDir = outIndex >= 0 ? args.splice(outIndex, 2)[1] : null;
const musicIndex = args.indexOf('--music');
const music = musicIndex >= 0 && Boolean(args.splice(musicIndex, 1));
const models = args.length ? args : ['gpt-5.4-mini'];
const recordIndex = args.indexOf('--record');
const recordFile = recordIndex >= 0 ? args.splice(recordIndex, 2)[1] : null;
const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const scoreXml = fs.readFileSync(
  path.join(root, 'public/test_scores/eight_bars_one_voice.musicxml'),
  'utf8',
);
if (outDir) fs.mkdirSync(outDir, { recursive: true });

/** Ink over the printed bars: the engine lays out the score, markImage composes, Chromium rasterises. */
async function musicRenderer() {
  const lib = createRequire(import.meta.url)(
    path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs'),
  );
  const engine = lib.default ?? lib;
  await engine.ready;
  const log = console.log;
  const warn = console.warn;
  console.log = console.warn = () => {};
  const score = await engine.load(
    'musicxml',
    fs.readFileSync(path.join(root, 'public/test_scores/eight_bars_one_voice.musicxml')),
  );
  const geometry = pageGeometryOf(
    JSON.parse(await score.savePositions(false)),
    JSON.parse(await score.savePositions(true)),
    (await score.staffSystemBands?.()) ?? [],
  );
  console.log = log;
  console.warn = warn;
  if (!geometry) throw new Error('no page geometry from the engine');
  const svgs = new Map<number, string>();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  return {
    async render(annotation: Parameters<typeof composeMarkPicture>[2]): Promise<Buffer | null> {
      const placement = placeAnchor(geometry, annotation.anchor);
      if (!placement) return null;
      if (!svgs.has(placement.page))
        svgs.set(placement.page, await score.saveSvg(placement.page, true));
      const picture = composeMarkPicture(
        svgs.get(placement.page)!,
        geometry,
        annotation,
        annotation.anchor.part,
      );
      if (!picture) return null;
      await page.setViewportSize({ width: picture.width, height: picture.height });
      await page.setContent(
        `<html><body style="margin:0;background:#fff">${picture.svg}</body></html>`,
      );
      return page.screenshot({
        clip: { x: 0, y: 0, width: picture.width, height: picture.height },
      });
    },
    close: () => browser.close(),
  };
}
const renderer = music ? await musicRenderer() : null;

const matches = (answer: Record<string, unknown>, accept: Expect[]) =>
  accept.some(
    (e) =>
      answer.kind === e.kind &&
      (e.value === undefined || String(answer.value ?? '').toLowerCase() === e.value) &&
      (e.style === undefined || answer.style === e.style),
  );

const annotationOf = (fixture: Fixture, index: number) =>
  ({
    id: `f${index}`,
    scoreKey: 'eval',
    scorePart: -1,
    kind: fixture.ink ? 'ink' : 'text',
    content: fixture.text,
    anchor: { bar: 2, part: 0, tick: 0 },
    points: fixture.ink ?? [[0, 6, 1]],
    style: { color: 'black', width: 0.2, opacity: 1 },
    createdAt: 0,
    ...(fixture.extent ? { extent: { start: { bar: 2, tick: 0 }, end: { bar: 3, tick: 0 } } } : {}),
  }) as const;

// Pictures first (one browser page), then the requests in parallel
const images: (Buffer | null)[] = [];
for (const [index, fixture] of FIXTURES.entries()) {
  if (!fixture.ink) images.push(null);
  else
    images.push(
      (renderer ? await renderer.render(annotationOf(fixture, index) as never) : null) ??
        inkPng(fixture.ink),
    );
}
await renderer?.close();

const summary: Record<string, unknown> = {};
for (const model of models) {
  const rows = await Promise.all(
    FIXTURES.map(async (fixture, index) => {
      const annotation = annotationOf(fixture, index);
      const image = images[index];
      if (image && outDir)
        fs.writeFileSync(path.join(outDir, `${String(index).padStart(2, '0')}.png`), image);
      const started = Date.now();
      let answer = '';
      try {
        answer = await ask(model, readPrompt(annotation as never, barsXml(scoreXml, 2, 3)), image);
      } catch (error) {
        answer = `ERROR ${(error as Error).message}`;
      }
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(answer.slice(answer.indexOf('{'), answer.lastIndexOf('}') + 1));
      } catch {
        /* unparseable */
      }
      const proposal = proposalFromReading(annotation as never, answer);
      return {
        fixture: fixture.name,
        ok: matches(parsed, fixture.accept),
        answer: answer.startsWith('ERROR')
          ? answer.slice(0, 160)
          : `${parsed.kind ?? '?'} ${parsed.value ?? ''}${parsed.style ? ` (${parsed.style})` : ''} ${parsed.confidence ?? ''}`.trim(),
        accept: fixture.accept,
        raw: answer,
        proposal: proposal.label,
        ms: Date.now() - started,
      };
    }),
  );
  const correct = rows.filter((row) => row.ok).length;
  console.log(`\n${model}: ${correct}/${rows.length} correct`);
  for (const row of rows)
    console.log(
      `  ${row.ok ? '✓' : '✗'} ${row.fixture.padEnd(46)} → ${row.answer}  [${row.ms} ms]`,
    );
  summary[model] = { correct, total: rows.length, rows };
}
if (outDir) fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
// The answers as a regression set (unit/score-editor/read-marks-recorded.test.ts replays them without a provider)
if (recordFile) {
  const previous = fs.existsSync(recordFile)
    ? JSON.parse(fs.readFileSync(recordFile, 'utf8'))
    : { recordings: [] };
  const mode = music ? 'music' : 'staff';
  const recordings = (previous.recordings as { model: string; mode: string }[]).filter(
    (entry) => !(models.includes(entry.model) && entry.mode === mode),
  );
  for (const model of models) {
    const { rows } = summary[model] as {
      rows: { fixture: string; accept: Expect[]; raw: string; ok: boolean }[];
    };
    for (const row of rows)
      if (!row.raw.startsWith('ERROR'))
        recordings.push({
          model,
          mode,
          fixture: row.fixture,
          accept: row.accept,
          answer: row.raw,
          correct: row.ok,
        });
  }
  fs.writeFileSync(
    recordFile,
    `${JSON.stringify({ recordedAt: new Date().toISOString().slice(0, 10), recordings }, null, 1)}\n`,
  );
}
