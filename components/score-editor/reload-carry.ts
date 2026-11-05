import type { Score } from '../../lib/webmscore-loader';
import { buildLcsAlignment } from './alignment';
import { type Omission, omissionsLossNotice, readMusicXmlOmissions } from './musicxml-omissions';

/**
 * Carrying what MusicXML cannot hold across a MusicXML re-import (roadmap E23). An applied AI or XML edit reloads the
 * score from MusicXML. Two things are saved before the reload and put back after it, as part of loading (no undo
 * step):
 * - the style: MusicXML keeps only page size and margins, scaling and fonts (<defaults>), so every other Style dialog
 *   setting would go back to MuseScore's defaults. Not carried when the edit changed <defaults>: then the new layout is
 *   the point of the edit.
 * - system locks, mapped onto the new score's measures (the edit may add, remove or change measures).
 * - parts (roadmap E18), mapped onto the new score's instruments by name, each with its own style. Their part-only
 *   layout breaks and unlinked changes are not kept.
 * What still cannot be carried is reported to the user (omissions, and locks whose measures the edit removed).
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

/** A system lock as measure positions (getSystemLockState's form). */
export type LockRange = { startMeasure: number; endMeasure: number };

/** A part to put back: its name, its instruments on the new score, and its own style. */
export type CarriedPart = { name: string; parts: number[]; style: Uint8Array | null };

export type ReloadCarry = {
  style: Uint8Array | null;
  parts?: CarriedPart[];
  /** Parts none of whose instruments is in the new score. */
  droppedParts?: string[];
  systemLocks: LockRange[];
  /** Locks whose measures the edit removed. */
  droppedLocks: LockRange[];
  omissions: Omission[];
};

/** Each measure's content across all parts, by measure position: what the alignment compares. */
function measureKeys(xml: string): string[] {
  const parts = [...xml.matchAll(/<part\b[^>]*>([\s\S]*?)<\/part>/g)].map((part) =>
    [...part[1].matchAll(/<measure\b[^>]*>([\s\S]*?)<\/measure>/g)].map((measure) => measure[1]),
  );
  const count = Math.max(0, ...parts.map((measures) => measures.length));
  return Array.from({ length: count }, (_, index) =>
    parts.map((measures) => measures[index] ?? '').join('\u0001'),
  );
}

/**
 * Where each measure of `currentXml` is in `nextXml`, or null when the edit removed it. The measures are aligned by
 * content (as the compare view aligns them); a changed measure still pairs with its new version.
 */
export function measurePositionMap(
  currentXml: string,
  nextXml: string,
): (position: number) => number | null {
  const map = new Map<number, number>();
  for (const row of buildLcsAlignment(measureKeys(currentXml), measureKeys(nextXml)).rows) {
    if (row.leftIndex !== null && row.rightIndex !== null) map.set(row.leftIndex, row.rightIndex);
  }
  return (position) => map.get(position) ?? null;
}

/**
 * The locks on the new score. A lock whose first or last measure was removed shrinks to the measures of it that remain;
 * one with none left is dropped.
 */
export function mapSystemLocks(locks: LockRange[], map: (position: number) => number | null) {
  const kept: LockRange[] = [];
  const dropped: LockRange[] = [];
  for (const lock of locks) {
    const remaining: number[] = [];
    for (let position = lock.startMeasure; position <= lock.endMeasure; position++) {
      const mapped = map(position);
      if (mapped !== null) remaining.push(mapped);
    }
    if (!remaining.length) dropped.push(lock);
    else kept.push({ startMeasure: Math.min(...remaining), endMeasure: Math.max(...remaining) });
  }
  return { kept, dropped };
}

type Serialized = <T>(operation: () => Promise<T>, label: string) => Promise<T>;

/** The instruments of a MusicXML document, in order (its <part-name>s). */
export function musicXmlInstrumentNames(xml: string): string[] {
  return [
    ...xml.matchAll(/<score-part\b[^>]*>[\s\S]*?<part-name\b[^>]*>([\s\S]*?)<\/part-name>/g),
  ].map((m) => m[1].trim());
}

/**
 * Where each of the live score's instruments is among the new score's, by name: the same position when the name is
 * still there, else the first unused one with that name, else nowhere (null).
 */
export function instrumentMap(current: string[], next: string[]): (index: number) => number | null {
  const used = new Set<number>();
  const map = current.map((name, index) => {
    if (next[index] === name && !used.has(index)) {
      used.add(index);
      return index;
    }
    return null;
  });
  current.forEach((name, index) => {
    if (map[index] !== null) return;
    const found = next.findIndex((candidate, at) => candidate === name && !used.has(at));
    if (found >= 0) {
      used.add(found);
      map[index] = found;
    }
  });
  return (index) => map[index] ?? null;
}

/** The live score's parts, for re-creating on the reloaded score (`nextXml`): mapped instruments and own style. */
async function captureParts(score: Score, currentXml: string, nextXml: string, run: Serialized) {
  if (!score.listExcerpts || !score.setExcerptId || !score.restoreExcerpts)
    return { parts: [], droppedParts: [] };
  const excerpts = await run(() => score.listExcerpts!(), 'listExcerpts');
  if (!excerpts.length) return { parts: [], droppedParts: [] };
  const map = instrumentMap(musicXmlInstrumentNames(currentXml), musicXmlInstrumentNames(nextXml));
  const styles = await run(async () => {
    const saved: (Uint8Array | null)[] = [];
    try {
      for (let index = 0; index < excerpts.length; index++) {
        await score.setExcerptId!(index);
        saved.push(score.saveStyle ? await score.saveStyle() : null);
      }
    } finally {
      await score.setExcerptId!(-1);
    }
    return saved;
  }, 'saveStyle(parts)');
  const parts: CarriedPart[] = [];
  const droppedParts: string[] = [];
  excerpts.forEach((excerpt, index) => {
    const mapped = (excerpt.partIndices ?? []).map(map).filter((at): at is number => at !== null);
    if (mapped.length)
      parts.push({ name: excerpt.name, parts: mapped, style: styles[index] ?? null });
    else droppedParts.push(excerpt.name);
  });
  return { parts, droppedParts };
}

/** Everything to carry across re-importing `nextXml` in place of the live score (whose MusicXML is `currentXml`). */
export async function captureForReload(
  score: Score,
  currentXml: string,
  nextXml: string,
  run?: Serialized,
): Promise<ReloadCarry> {
  const style = await captureStyleForReload(score, currentXml, nextXml);
  let locks: LockRange[] = [];
  try {
    locks = ((await score.getSystemLockState?.())?.locks ?? []) as LockRange[];
  } catch (error) {
    console.warn('Could not read the system locks to carry across the reload', error);
  }
  const { kept, dropped } = locks.length
    ? mapSystemLocks(locks, measurePositionMap(currentXml, nextXml))
    : { kept: [], dropped: [] };
  let carriedParts: { parts: CarriedPart[]; droppedParts: string[] } = {
    parts: [],
    droppedParts: [],
  };
  try {
    carriedParts = await captureParts(
      score,
      currentXml,
      nextXml,
      run ?? ((operation) => operation()),
    );
  } catch (error) {
    console.warn('Could not read the parts to carry across the reload', error);
  }
  return {
    style,
    systemLocks: kept,
    droppedLocks: dropped,
    ...carriedParts,
    omissions: await readMusicXmlOmissions(score, run),
  };
}

/** Puts the carried style, system locks and parts on the reloaded score, before it is first laid out for display. */
export async function restoreForReload(score: Score, carry: ReloadCarry): Promise<void> {
  if (carry.style) await restoreCarriedStyle(score, carry.style);
  if (carry.systemLocks.length && score.restoreSystemLocks) {
    try {
      await score.restoreSystemLocks(carry.systemLocks);
    } catch (error) {
      console.warn('Could not restore the carried system locks', error);
    }
  }
  if (carry.parts?.length && score.restoreExcerpts && score.setExcerptId) {
    try {
      // Only when every part came back are the indices the carried ones, for their styles.
      if (
        (await score.restoreExcerpts(carry.parts.map(({ name, parts }) => ({ name, parts })))) ===
        carry.parts.length
      ) {
        for (const [index, part] of carry.parts.entries()) {
          if (!part.style) continue;
          await score.setExcerptId(index);
          await restoreCarriedStyle(score, part.style);
        }
      }
    } catch (error) {
      console.warn('Could not restore the carried parts', error);
    } finally {
      await score.setExcerptId(-1);
    }
  }
}

/** The notice for what the reload could not carry, or null. */
export function reloadLossNotice(carry: ReloadCarry): string | null {
  const omitted = omissionsLossNotice(carry.omissions);
  const dropped = carry.droppedLocks.length
    ? `${carry.droppedLocks.length} system lock${carry.droppedLocks.length === 1 ? ' was' : 's were'} removed with the measures the edit deleted.`
    : null;
  const names = carry.droppedParts ?? [];
  const parts = names.length
    ? `The edited score has none of the instruments of the part${names.length === 1 ? '' : 's'} ${names.map((name) => `“${name}”`).join(', ')}, so ${names.length === 1 ? 'it was' : 'they were'} removed.`
    : null;
  return [omitted, dropped, parts].filter(Boolean).join(' ') || null;
}
