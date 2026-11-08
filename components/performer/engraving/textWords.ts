/*
 * Handwritten (typed) text marks that mean one well-known thing (Phase 7c, no model): dynamics become dynamics; the
 * common expression, technique and tempo words become text of that kind. Matched whole, ignoring case, spaces and
 * full stops; anything else is left for the model.
 */

export type TextMeaning =
  | { readonly kind: 'dynamic'; readonly subtype: string }
  | {
      readonly kind: 'text';
      readonly style: 'expression' | 'technique' | 'tempo';
      readonly text: string;
    }
  | null;

const DYNAMICS = new Set(['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'fp', 'sf', 'sfz']);

const WORDS: Record<string, { style: 'expression' | 'technique' | 'tempo'; text: string }> = {
  cresc: { style: 'expression', text: 'cresc.' },
  crescendo: { style: 'expression', text: 'crescendo' },
  dim: { style: 'expression', text: 'dim.' },
  dimin: { style: 'expression', text: 'dim.' },
  diminuendo: { style: 'expression', text: 'diminuendo' },
  decresc: { style: 'expression', text: 'decresc.' },
  dolce: { style: 'expression', text: 'dolce' },
  espr: { style: 'expression', text: 'espr.' },
  espressivo: { style: 'expression', text: 'espressivo' },
  cantabile: { style: 'expression', text: 'cantabile' },
  legato: { style: 'expression', text: 'legato' },
  marcato: { style: 'expression', text: 'marcato' },
  sottovoce: { style: 'expression', text: 'sotto voce' },
  pocoapoco: { style: 'expression', text: 'poco a poco' },
  subito: { style: 'expression', text: 'subito' },
  morendo: { style: 'expression', text: 'morendo' },
  pizz: { style: 'technique', text: 'pizz.' },
  pizzicato: { style: 'technique', text: 'pizz.' },
  arco: { style: 'technique', text: 'arco' },
  consord: { style: 'technique', text: 'con sord.' },
  senzasord: { style: 'technique', text: 'senza sord.' },
  sulpont: { style: 'technique', text: 'sul pont.' },
  sultasto: { style: 'technique', text: 'sul tasto' },
  collegno: { style: 'technique', text: 'col legno' },
  div: { style: 'technique', text: 'div.' },
  unis: { style: 'technique', text: 'unis.' },
  solo: { style: 'technique', text: 'solo' },
  tutti: { style: 'technique', text: 'tutti' },
  rit: { style: 'tempo', text: 'rit.' },
  ritard: { style: 'tempo', text: 'ritard.' },
  ritardando: { style: 'tempo', text: 'ritardando' },
  rall: { style: 'tempo', text: 'rall.' },
  rallentando: { style: 'tempo', text: 'rallentando' },
  accel: { style: 'tempo', text: 'accel.' },
  accelerando: { style: 'tempo', text: 'accelerando' },
  atempo: { style: 'tempo', text: 'a tempo' },
  tempoi: { style: 'tempo', text: 'Tempo I' },
  tempoprimo: { style: 'tempo', text: 'Tempo primo' },
  rubato: { style: 'tempo', text: 'rubato' },
  allargando: { style: 'tempo', text: 'allargando' },
};

/** What a text mark means, when it is one of the words every musician writes; null otherwise. */
export function readText(content: string | undefined): TextMeaning {
  const key = (content ?? '').toLowerCase().replace(/[\s.]/g, '');
  if (!key) return null;
  if (DYNAMICS.has(key)) return { kind: 'dynamic', subtype: key };
  const word = WORDS[key];
  return word ? { kind: 'text', ...word } : null;
}
