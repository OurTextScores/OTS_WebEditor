/*
 * Keeping marks on their bars when the score changes (performer mode, Phase 7b). A mark remembers what its bar looked
 * like (the engine's measure signatures: time and key signature, barline, every staff's notes) as two short hashes:
 * the bar alone, and the bar with its neighbours. When bars are inserted or removed, the mark finds its bar again.
 */

/** A short, stable hash of a string (FNV-1a, 32 bits, base 36). */
export function shortHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/** One signature per bar for the whole score or part: every instrument's signature for that bar, hashed together. */
export function combineSignatures(perPart: readonly (readonly string[])[]): string[] {
  const bars = Math.max(0, ...perPart.map((list) => list.length));
  return Array.from({ length: bars }, (_, bar) =>
    shortHash(perPart.map((list) => list[bar] ?? '').join('\u0001')),
  );
}

/** What a mark remembers of its bar. */
export interface BarSignature {
  /** The bar's content. */
  readonly bar: string;
  /** The bar with the bars either side: tells repeated bars apart. */
  readonly context: string;
}

const contextAt = (signatures: readonly string[], bar: number) =>
  shortHash(`${signatures[bar - 1] ?? '^'}|${signatures[bar] ?? ''}|${signatures[bar + 1] ?? '$'}`);

export function signatureAt(signatures: readonly string[], bar: number): BarSignature | undefined {
  if (bar < 0 || bar >= signatures.length) return undefined;
  return { bar: signatures[bar], context: contextAt(signatures, bar) };
}

/**
 * Where a mark's bar is now. 'same': still at its index; 'moved': found elsewhere (bars inserted or removed), the
 * nearest bar with the same neighbours, or else the same content; 'changed': the bar at its index is different and
 * nothing matches (the bar itself was edited), so it stays; 'unknown': no signature to go by.
 */
export function remapBar(
  signature: BarSignature | undefined,
  bar: number,
  signatures: readonly string[],
): { bar: number; status: 'same' | 'moved' | 'changed' | 'unknown' } {
  if (!signature || !signatures.length) return { bar, status: 'unknown' };
  if (signatures[bar] === signature.bar && contextAt(signatures, bar) === signature.context)
    return { bar, status: 'same' };
  const nearest = (matches: (index: number) => boolean) => {
    let best = -1;
    signatures.forEach((_, index) => {
      if (matches(index) && (best < 0 || Math.abs(index - bar) < Math.abs(best - bar)))
        best = index;
    });
    return best;
  };
  const byContext = nearest((index) => contextAt(signatures, index) === signature.context);
  if (byContext >= 0) return { bar: byContext, status: byContext === bar ? 'same' : 'moved' };
  if (signatures[bar] === signature.bar) return { bar, status: 'same' }; // its neighbours changed, it did not
  const byContent = nearest((index) => signatures[index] === signature.bar);
  if (byContent >= 0) return { bar: byContent, status: 'moved' };
  return { bar, status: 'changed' };
}

/**
 * The bar signatures of the score or part shown: every instrument's (the engine numbers them from 0; an empty list
 * ends them), combined bar by bar.
 */
export async function readBarSignatures(
  read: (partIndex: number) => Promise<string[]>,
): Promise<string[]> {
  const perPart: string[][] = [];
  for (let partIndex = 0; partIndex < 64; partIndex += 1) {
    const list = await read(partIndex).catch(() => [] as string[]);
    if (!Array.isArray(list) || !list.length) break;
    perPart.push(list);
  }
  return combineSignatures(perPart);
}

/** In Play-through (bar i of the view is written bar playedBars[i]): the written score's signatures, each bar's first. */
export function writtenSignatures(
  viewSignatures: readonly string[],
  playedBars: readonly number[],
): string[] {
  const written: string[] = [];
  playedBars.forEach((bar, index) => {
    if (written[bar] === undefined && viewSignatures[index] !== undefined)
      written[bar] = viewSignatures[index];
  });
  return Array.from(written, (signature) => signature ?? '');
}

/** A mark's anchor where its bar is now (its beat is kept from the bar's start, so it moves with the bar). */
export function remapAnchor<A extends { bar: number; signature?: BarSignature }>(
  anchor: A,
  signatures: readonly string[],
): { anchor: A; status: 'same' | 'moved' | 'changed' | 'unknown' } {
  const { bar, status } = remapBar(anchor.signature, anchor.bar, signatures);
  return { anchor: status === 'moved' ? { ...anchor, bar } : anchor, status };
}

/** Marks with their anchors where their bars are now; a mark whose bar did not move is returned as it was. */
export function placedMarks<M extends { anchor: { bar: number; signature?: BarSignature } }>(
  marks: readonly M[],
  signatures: readonly string[],
): readonly M[] {
  if (!signatures.length) return marks;
  return marks.map((mark) => {
    const { anchor, status } = remapAnchor(mark.anchor, signatures);
    return status === 'moved' ? { ...mark, anchor } : mark;
  });
}
