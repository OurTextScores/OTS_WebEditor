import { isEmbedBuild } from './performPath';
import { deviceScoreStore, isLocalScore, type ScoreStore } from './scoreStore';

/**
 * The editor's address for a score the performer has open: `/?score=…` in the server build, the embed build's
 * `/score-editor/index.html?score=…` (its host serves the .html file). A score kept on the device (`local:<id>`) is
 * passed by its key: the editor reads it from the same device store (`localScoreFile`).
 */
export function editorHref(score: string, embed = isEmbedBuild()): string {
  const query = new URLSearchParams({ score }).toString();
  return embed ? `/score-editor/index.html?${query}` : `/?${query}`;
}

const EXTENSION: Record<string, string> = { xml: 'musicxml' };

/**
 * A score kept on this device by performer mode (`local:<id>`: opened from a file or handed over), as a File for the
 * editor to open; null when it is not a local key or no longer on the device.
 */
export async function localScoreFile(
  key: string,
  store: ScoreStore = deviceScoreStore(),
): Promise<File | null> {
  if (!isLocalScore(key)) return null;
  const kept = await store.get(key).catch(() => undefined);
  if (!kept) return null;
  return new File([kept.bytes.slice()], `${kept.name}.${EXTENSION[kept.format] ?? kept.format}`);
}
