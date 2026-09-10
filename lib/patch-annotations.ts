// Shared contract for AI-authored annotations that ride alongside a musicxml-patch@1 payload.
// The model may include an optional `annotations` array (sibling of `ops`) explaining its
// changes; the editor surfaces each as an assistant comment on the matching measure thread.
// Kept in one place so the client and server prompts + parsers stay in lockstep.

export type PatchAnnotation = {
  /** 0-based part index. */
  partIndex: number;
  /** 1-based measure number, as referenced by the patch. */
  measure: number;
  comment: string;
};

// Appended to the patch prompt so the model knows the (optional) annotations shape.
export const PATCH_ANNOTATIONS_INSTRUCTION = [
  'You MAY also include an optional "annotations" array to explain your edits, e.g.:',
  '"annotations": [ { "part": 1, "measure": 3, "comment": "Raised the third to match the key." } ]',
  'Use "part" as the 1-based part number and "measure" as the measure number you edited.',
  'Keep each comment to one or two short sentences. Omit annotations entirely if there is nothing useful to say.',
  'Everything must still be inside the single JSON object — no prose outside the JSON.',
].join('\n');

function toFiniteInt(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : null;
}

/**
 * Extract annotations from a parsed model payload. Tolerant of the annotations living at the
 * root or under `.patch`, and of `part`/`partIndex` and `measure`/`measureNumber`/`bar` aliases.
 */
export function extractPatchAnnotations(payload: unknown): PatchAnnotation[] {
  const root = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
  if (!root) {
    return [];
  }
  const inner =
    root.patch && typeof root.patch === 'object' ? (root.patch as Record<string, unknown>) : null;
  const rawList = Array.isArray(root.annotations)
    ? root.annotations
    : inner && Array.isArray(inner.annotations)
      ? inner.annotations
      : [];

  const out: PatchAnnotation[] = [];
  for (const item of rawList) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const rec = item as Record<string, unknown>;
    const comment =
      typeof rec.comment === 'string'
        ? rec.comment.trim()
        : typeof rec.text === 'string'
          ? rec.text.trim()
          : '';
    if (!comment) {
      continue;
    }
    // Prefer an explicit 0-based partIndex; otherwise treat `part`/`partNumber` as 1-based.
    const explicitIndex = toFiniteInt(rec.partIndex);
    const oneBasedPart = toFiniteInt(rec.part ?? rec.partNumber);
    const partIndex =
      explicitIndex !== null
        ? Math.max(0, explicitIndex)
        : oneBasedPart !== null
          ? Math.max(0, oneBasedPart - 1)
          : 0;
    const measureInt = toFiniteInt(rec.measure ?? rec.measureNumber ?? rec.bar);
    const measure = measureInt !== null ? Math.max(1, measureInt) : 1;
    out.push({ partIndex, measure, comment });
  }
  return out;
}
