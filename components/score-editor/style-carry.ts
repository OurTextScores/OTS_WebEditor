import type { Score } from '../../lib/webmscore-loader';

/**
 * Carrying the score's style across a MusicXML re-import (roadmap E23). An applied AI or XML edit reloads the score
 * from MusicXML, which keeps only the few style values it has (page size and margins, scaling, fonts in <defaults>):
 * every other Style dialog setting would go back to MuseScore's defaults. The live score's style is saved before the
 * reload and put back after it, as part of loading. Not when the edit changed <defaults>: then the new layout is the
 * point of the edit.
 */

/** The MusicXML <defaults> element (page layout, scaling, fonts), whitespace-normalised, or '' without one. */
export function musicXmlDefaults(xml: string): string {
  return (xml.match(/<defaults\b[\s\S]*?<\/defaults>/)?.[0] ?? '')
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The live score's style, to put back after re-importing `nextXml` in place of `currentXml`; null when not to. */
export async function captureStyleForReload(
  score: Score,
  currentXml: string,
  nextXml: string,
): Promise<Uint8Array | null> {
  if (!score.saveStyle || musicXmlDefaults(currentXml) !== musicXmlDefaults(nextXml)) return null;
  try {
    return await score.saveStyle();
  } catch (error) {
    console.warn('Could not save the style to carry across the reload', error);
    return null;
  }
}

/** Puts a captured style back on the reloaded score (no undo step), before it is first laid out for display. */
export async function restoreCarriedStyle(score: Score, style: Uint8Array): Promise<boolean> {
  if (!score.restoreStyle) return false;
  try {
    return Boolean(await score.restoreStyle(style));
  } catch (error) {
    console.warn('Could not restore the carried style', error);
    return false;
  }
}
