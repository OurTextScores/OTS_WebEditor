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

export type ReloadCarry = {
  style: Uint8Array | null;
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
  return {
    style,
    systemLocks: kept,
    droppedLocks: dropped,
    omissions: await readMusicXmlOmissions(score, run),
  };
}

/** Puts the carried style and system locks on the reloaded score, before it is first laid out for display. */
export async function restoreForReload(score: Score, carry: ReloadCarry): Promise<void> {
  if (carry.style) await restoreCarriedStyle(score, carry.style);
  if (carry.systemLocks.length && score.restoreSystemLocks) {
    try {
      await score.restoreSystemLocks(carry.systemLocks);
    } catch (error) {
      console.warn('Could not restore the carried system locks', error);
    }
  }
}

/** The notice for what the reload could not carry, or null. */
export function reloadLossNotice(carry: ReloadCarry): string | null {
  const omitted = omissionsLossNotice(carry.omissions);
  const dropped = carry.droppedLocks.length
    ? `${carry.droppedLocks.length} system lock${carry.droppedLocks.length === 1 ? ' was' : 's were'} removed with the measures the edit deleted.`
    : null;
  return [omitted, dropped].filter(Boolean).join(' ') || null;
}
