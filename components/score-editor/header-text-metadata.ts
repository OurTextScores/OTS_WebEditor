import type { HeaderTextTarget } from './editorProps';

/** Read the current engine metadata before opening a header prompt. */
export async function headerTextForPrompt(
  target: HeaderTextTarget,
  fallback: string,
  readMetadata: () => Promise<Record<string, unknown>>,
  onError: (error: unknown) => void,
): Promise<string> {
  try {
    const metadata = await readMetadata();
    const value = target === 'lyricist' && typeof metadata.lyricist !== 'string'
      ? metadata.poet
      : metadata[target];
    return typeof value === 'string' ? value : '';
  } catch (error) {
    onError(error);
    return fallback;
  }
}
