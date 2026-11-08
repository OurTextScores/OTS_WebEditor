/*
 * Reading handwritten rehearsal marks with the editor's AI model (performer mode, Phase 7c-2): the ink or text the
 * rules could not read is sent, with the bars it sits in, to the provider and model the user chose in the AI panel
 * (their own key). The model answers in a closed vocabulary, which becomes an ordinary engraving proposal the reviewer
 * accepts or not; positions come from the mark itself (its anchor, or the notes an ink stroke spans), never from the
 * model, so a misreading can only be the wrong mark, not a mark in the wrong place.
 */
import type { Annotation } from '../../performer/annotations/annotationModel';
import type { EngravingMark, EngravingProposal } from '../../performer/engraving/stampEngraving';

/** The editor's AI, as the user configured it: who answers, and how to ask. */
export interface MarksReader {
  /** "anthropic · claude-…", shown where the user agrees to send. */
  readonly label: string;
  /** Cache key part: the same mark read by the same model is not sent again. */
  readonly cacheKey: string;
  readonly read: (request: {
    systemPrompt: string;
    promptText: string;
    image: { mediaType: 'image/png'; base64: string } | null;
  }) => Promise<string>;
}

export const READ_SYSTEM_PROMPT = `You read musicians' handwritten rehearsal marks on sheet music.
You are given one mark: either typed text, or an ink drawing as an image, and the MusicXML of the bars it is written in.
The image is either the printed bars with the performer's ink drawn over them in blue, or (when the printed music is not
available) the ink in black on five grey staff lines, where the performer drew it relative to the staff.
Say what notation the mark means, in exactly this JSON (no prose, no code fences):
{"kind": K, "value": V, "style": S, "confidence": C, "why": W}
K is one of:
- "dynamic": V one of ppp pp p mp mf f ff fff fp sf sfz
- "hairpin": V "cresc" or "dim" (a wedge opening or closing)
- "slur": V "" (an arc joining notes)
- "text": V the words to engrave, S one of "expression" (dolce, cresc., espr.), "technique" (pizz., arco, mute) or
  "tempo" (rit., a tempo, rall.)
- "fermata": V ""
- "breath": V "comma" or "caesura"
- "articulation": V one of accent staccato tenuto marcato
- "fingering": V a single digit 0-5
- "none": the mark is a personal reminder (an eye, an arrow, a circle, "watch", a name) or cannot be read; V ""
S is only for "text" (otherwise ""). C is your confidence from 0 to 1. W is at most 12 words saying why.
Reading hints:
- The gap between two staff lines is one staff space. Hairpins and slurs span several notes (you are told when the ink
  spans notes); a small wedge (under about 1.5 spaces) at one note is an accent, a short dash a tenuto, a dot staccato.
- A tick, check mark, comma or apostrophe above the staff between notes is a breath mark ("comma"); "//" is "caesura".
- A wavy or zigzag line, arrows, circles, eyeglasses, boxes and underlines are reminders ("none").
- "text" is only for words a publisher would print in the part. Notes to self ("bow!", "listen", "count", names,
  exclamations, instructions about the rehearsal) are "none".`;

const DYNAMICS = new Set(['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'fp', 'sf', 'sfz']);
const ARTICULATIONS: Record<string, string> = {
  accent: 'articAccentAbove',
  staccato: 'articStaccatoAbove',
  tenuto: 'articTenutoAbove',
  marcato: 'articMarcatoAbove',
};
const BREATHS: Record<string, string> = { comma: 'breathMarkComma', caesura: 'caesura' };

/** The bars around a mark, from the score's MusicXML: each part's bar at `index` (0-based) and its neighbours. */
export function barsXml(xml: string, index: number, through = index): string {
  const out: string[] = [];
  const partRegex = /<part\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/part>/gi;
  let part: RegExpExecArray | null;
  while ((part = partRegex.exec(xml)) !== null) {
    const measures = part[2].match(/<measure\b[\s\S]*?<\/measure>/gi) ?? [];
    const picked = measures.slice(Math.max(0, index), Math.max(index, through) + 1);
    if (picked.length) out.push(`<part id="${part[1]}">\n${picked.join('\n')}\n</part>`);
  }
  const text = out.join('\n');
  return text.length > 40_000 ? `${text.slice(0, 40_000)}\n<!-- truncated -->` : text;
}

/** The question for one mark. */
export function readPrompt(annotation: Annotation, bars: string): string {
  const where =
    `Written in bar ${annotation.anchor.bar + 1}` +
    (annotation.anchor.tick !== undefined
      ? `, ${annotation.anchor.tick} ticks (480 per quarter) into the bar`
      : '') +
    `, staff ${annotation.anchor.part + 1}.`;
  const extent = annotation.extent;
  const span = extent
    ? extent.start.bar === extent.end.bar && extent.start.tick === extent.end.tick
      ? 'The ink is at a single note.'
      : `The ink spans from bar ${extent.start.bar + 1} (${extent.start.tick} ticks in) to bar ${extent.end.bar + 1} (${extent.end.tick} ticks in).`
    : 'The ink is at a single note.';
  const what =
    annotation.kind === 'text'
      ? `The performer typed: "${annotation.content ?? ''}"`
      : `The performer drew the ink in the image. ${span}`;
  return `${what}\n${where}\n\nMusicXML of those bars:\n${bars}`;
}

/** The model's answer as an engraving proposal for the mark, or why not. Positions come from the mark. */
export function proposalFromReading(annotation: Annotation, answer: string): EngravingProposal {
  const keep = (label: string): EngravingProposal => ({
    engrave: null,
    label,
    reason: 'needs-interpretation',
  });
  const json = answer.slice(answer.indexOf('{'), answer.lastIndexOf('}') + 1);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return keep('AI: could not read the answer (kept as a mark)');
  }
  const kind = String(parsed.kind ?? '');
  const value = String(parsed.value ?? '').trim();
  const why = String(parsed.why ?? '').slice(0, 120);
  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
  const note = `${Math.round(confidence * 100)}%${why ? ` · ${why}` : ''}`;
  if (kind === 'none')
    return { engrave: null, label: `AI: a reminder, stays a mark (${note})`, reason: 'reminder' };

  const { anchor } = annotation;
  const extent = annotation.extent;
  const y =
    annotation.points.reduce((sum, p) => sum + p[1], 0) / Math.max(1, annotation.points.length);
  const at = extent
    ? { bar: extent.start.bar, tick: extent.start.tick }
    : anchor.tick !== undefined
      ? { bar: anchor.bar, tick: anchor.tick }
      : null;
  if (!at) return keep(`AI: ${kind} ${value}, but the mark has no beat (kept as a mark)`);
  const base = { staff: anchor.part, bar: at.bar, tick: at.tick, y };
  const spanning = extent ? { endBar: extent.end.bar, endTick: extent.end.tick } : null;
  const proposal = (engrave: EngravingMark, label: string): EngravingProposal => ({
    engrave,
    label: `AI: ${label} (${note})`,
  });

  switch (kind) {
    case 'dynamic':
      if (DYNAMICS.has(value))
        return proposal({ ...base, kind: 'dynamic', subtype: value }, `Dynamic ${value}`);
      break;
    case 'hairpin':
      if ((value === 'cresc' || value === 'dim') && spanning)
        return proposal(
          { ...base, ...spanning, kind: 'hairpin', subtype: value },
          value === 'cresc' ? 'Crescendo hairpin' : 'Diminuendo hairpin',
        );
      break;
    case 'slur':
      if (spanning) return proposal({ ...base, ...spanning, kind: 'slur', subtype: '' }, 'Slur');
      break;
    case 'text': {
      const style = parsed.style;
      if (
        value &&
        value.length <= 40 &&
        (style === 'expression' || style === 'technique' || style === 'tempo')
      ) {
        const kindLabel = {
          expression: 'Expression text',
          technique: 'Technique text',
          tempo: 'Tempo text',
        }[style];
        return proposal(
          { ...base, kind: 'text', subtype: value, style },
          `${kindLabel} “${value}”`,
        );
      }
      break;
    }
    case 'fermata':
      return proposal({ ...base, kind: 'fermata', subtype: '' }, 'Fermata');
    case 'breath':
      if (BREATHS[value])
        return proposal({ ...base, kind: 'breath', subtype: BREATHS[value] }, `Breath (${value})`);
      break;
    case 'articulation':
      if (ARTICULATIONS[value])
        return proposal(
          { ...base, kind: 'articulation', subtype: ARTICULATIONS[value] },
          `Articulation ${value}`,
        );
      break;
    case 'fingering':
      if (/^[0-5]$/.test(value))
        return proposal({ ...base, kind: 'fingering', subtype: value }, `Fingering ${value}`);
      break;
  }
  return keep(`AI: “${kind} ${value}” is not something it can engrave here (kept as a mark)`);
}

/** The ink drawn on a staff, as a PNG (in the browser; null where there is no canvas). */
export function inkImage(
  annotation: Annotation,
): { mediaType: 'image/png'; base64: string } | null {
  if (annotation.kind !== 'ink' || typeof document === 'undefined') return null;
  const scale = 24; // pixels per staff space
  const xs = annotation.points.map((p) => p[0]);
  const ys = annotation.points.map((p) => p[1]);
  const left = Math.min(...xs, 0) - 3;
  const right = Math.max(...xs, 8) + 3;
  const top = Math.min(...ys, 0) - 3;
  const bottom = Math.max(...ys, 4) + 3;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((right - left) * scale);
  canvas.height = Math.ceil((bottom - top) * scale);
  const context = canvas.getContext('2d');
  if (!context) return null;
  const px = (x: number) => (x - left) * scale;
  const py = (y: number) => (y - top) * scale;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#999';
  context.lineWidth = 1;
  for (let line = 0; line < 5; line += 1) {
    context.beginPath();
    context.moveTo(0, py(line));
    context.lineTo(canvas.width, py(line));
    context.stroke();
  }
  context.strokeStyle = '#000';
  context.lineWidth = 3;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  annotation.points.forEach((p, index) =>
    index ? context.lineTo(px(p[0]), py(p[1])) : context.moveTo(px(p[0]), py(p[1])),
  );
  context.stroke();
  const url = canvas.toDataURL('image/png');
  const base64 = url.slice(url.indexOf(',') + 1);
  return base64 ? { mediaType: 'image/png', base64 } : null;
}

const cache = new Map<string, EngravingProposal>();

/** Reads one mark (cached per model and mark); a failed request keeps it a mark and says why. */
export async function readMark(
  reader: MarksReader,
  annotation: Annotation,
  scoreXml: string,
  /** The printed bars with the ink over them (markImage.ts); the bare-staff drawing when absent. */
  picture: { mediaType: 'image/png'; base64: string } | null = null,
): Promise<EngravingProposal> {
  const key = `${reader.cacheKey}:${annotation.id}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const end = annotation.extent?.end.bar ?? annotation.anchor.bar;
  const bars = barsXml(
    scoreXml,
    Math.min(annotation.anchor.bar, annotation.extent?.start.bar ?? Infinity),
    end,
  );
  try {
    const answer = await reader.read({
      systemPrompt: READ_SYSTEM_PROMPT,
      promptText: readPrompt(annotation, bars),
      image: picture ?? inkImage(annotation),
    });
    const proposal = proposalFromReading(annotation, answer);
    cache.set(key, proposal);
    return proposal;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      engrave: null,
      label: `AI request failed: ${message.slice(0, 100)}`,
      reason: 'needs-interpretation',
    };
  }
}

/** For tests: forget readings. */
export const clearReadingCache = () => cache.clear();

/** The editor's AI settings as a reader, or null until the user has chosen a model and entered a key. */
export function marksReaderFor(settings: {
  enabled: boolean;
  provider: string;
  apiKey: string;
  model: string;
  request: (payload: {
    provider: never;
    apiKey: string;
    model: string;
    promptText: string;
    systemPrompt: string;
    image: { mediaType: 'image/png'; base64: string } | null;
    maxTokens: number | null;
    temperature: number | null;
  }) => Promise<{ text: string }>;
}): MarksReader | null {
  const { enabled, provider, apiKey, model, request } = settings;
  if (!enabled || !apiKey.trim() || !model.trim()) return null;
  return {
    label: `${provider} · ${model}`,
    cacheKey: `${provider}:${model}`,
    read: async ({ systemPrompt, promptText, image }) =>
      (
        await request({
          provider: provider as never,
          apiKey,
          model,
          promptText,
          systemPrompt,
          image,
          maxTokens: 400,
          temperature: 0,
        })
      ).text,
  };
}
