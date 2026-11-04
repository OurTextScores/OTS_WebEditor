import { getPartsSnapshot } from './partsStore';

/** A part name as a file name: letters, digits, spaces, dots, dashes and underscores, the rest dropped. */
export function safeFileStem(name: string): string {
  return name.replace(/[^\p{L}\p{N} ._-]+/gu, '').trim() || 'part';
}

/** An export's file name: `score.ext`, or `score-<part>.ext` when a part is shown (what the export then contains). */
export function exportFileName(extension: string, stem = 'score'): string {
  const { parts, current } = getPartsSnapshot();
  const part = current >= 0 ? parts[current] : undefined;
  return `${stem}${part ? `-${safeFileStem(part.name)}` : ''}.${extension}`;
}
