import { detectScoreInputFormat } from '../../../lib/public-score-url';
import { deviceScoreStore, newLocalKey, type ScoreStore } from './scoreStore';

/** The score files performer mode opens: the editor's own list (MuseScore, MusicXML, MEI, MNX). */
export { SCORE_FILE_ACCEPT } from '../../score-editor/file-picker';

/** A file's name without its extension, as a piece's name. */
export const pieceNameOf = (fileName: string) =>
  fileName.replace(/\.[^.]+$/, '').trim() || 'Untitled score';

/**
 * Keeps a score file the performer opened on this device (`local:<id>`, like a score handed over from the editor), so
 * it opens again offline and can go in a setlist. Returns its key and name.
 */
export async function keepScoreFile(
  file: File,
  store: ScoreStore = deviceScoreStore(),
): Promise<{ key: string; name: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const key = newLocalKey();
  const name = pieceNameOf(file.name);
  await store.put({
    key,
    name,
    format: detectScoreInputFormat(file.name, bytes),
    bytes,
    savedAt: Date.now(),
  });
  return { key, name };
}
