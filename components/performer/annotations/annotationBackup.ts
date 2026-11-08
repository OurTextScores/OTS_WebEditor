import type { Annotation } from './annotationModel';

/** The backup file's format tag and version (performer mode keeps marks on the device; this is how they move). */
export const BACKUP_FORMAT = 'ots-perform-annotations';
export const BACKUP_VERSION = 1;

export interface AnnotationBackup {
  readonly format: typeof BACKUP_FORMAT;
  readonly version: number;
  readonly exportedAt: string;
  readonly annotations: readonly Annotation[];
}

export function backupOf(annotations: readonly Annotation[], now = new Date()): AnnotationBackup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    annotations,
  };
}

export const backupFileName = (now = new Date()) =>
  `ots-perform-marks-${now.toISOString().slice(0, 10)}.json`;

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isPosition = (value: unknown) =>
  !!value &&
  typeof value === 'object' &&
  isNumber((value as Record<string, unknown>).bar) &&
  isNumber((value as Record<string, unknown>).tick);
const isExtent = (value: unknown) =>
  !!value &&
  typeof value === 'object' &&
  isPosition((value as Record<string, unknown>).start) &&
  isPosition((value as Record<string, unknown>).end);

/** Whether a value read from a backup is a usable annotation (a damaged one is skipped, not stored). */
function isAnnotation(value: unknown): value is Annotation {
  if (!value || typeof value !== 'object') return false;
  const a = value as Record<string, unknown>;
  const anchor = a.anchor as Record<string, unknown> | undefined;
  const style = a.style as Record<string, unknown> | undefined;
  return (
    typeof a.id === 'string' &&
    typeof a.scoreKey === 'string' &&
    isNumber(a.scorePart) &&
    (a.kind === 'ink' || a.kind === 'stamp' || a.kind === 'text') &&
    !!anchor &&
    isNumber(anchor.bar) &&
    isNumber(anchor.part) &&
    (anchor.tick === undefined || isNumber(anchor.tick)) &&
    (anchor.signature === undefined ||
      (typeof anchor.signature === 'object' &&
        anchor.signature !== null &&
        typeof (anchor.signature as Record<string, unknown>).bar === 'string' &&
        typeof (anchor.signature as Record<string, unknown>).context === 'string')) &&
    Array.isArray(a.points) &&
    a.points.every(
      (point) => Array.isArray(point) && point.length === 3 && point.every(isNumber),
    ) &&
    !!style &&
    typeof style.color === 'string' &&
    isNumber(style.width) &&
    isNumber(style.opacity) &&
    (a.content === undefined || typeof a.content === 'string') &&
    (a.hiddenAt === undefined || (Array.isArray(a.hiddenAt) && a.hiddenAt.every(isNumber))) &&
    (a.onlyAt === undefined || isNumber(a.onlyAt)) &&
    (a.engravedIn === undefined || typeof a.engravedIn === 'string') &&
    (a.reviewedAt === undefined || typeof a.reviewedAt === 'string') &&
    (a.extent === undefined || isExtent(a.extent)) &&
    isNumber(a.createdAt)
  );
}

/**
 * The annotations in a backup file's text, and how many were skipped as damaged; or an error message when the text
 * is not a performer backup (or is from a newer version).
 */
export function parseBackup(
  text: string,
): { annotations: Annotation[]; skipped: number } | { error: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: 'This file is not a marks backup.' };
  }
  const backup = data as Partial<AnnotationBackup> | null;
  if (!backup || backup.format !== BACKUP_FORMAT || !Array.isArray(backup.annotations)) {
    return { error: 'This file is not a marks backup.' };
  }
  if (!isNumber(backup.version) || backup.version > BACKUP_VERSION) {
    return { error: 'This backup is from a newer version of OurTextScores.' };
  }
  const annotations = backup.annotations.filter(isAnnotation);
  return { annotations, skipped: backup.annotations.length - annotations.length };
}
