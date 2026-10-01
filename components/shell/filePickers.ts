/**
 * The hidden file inputs the header owns, so File ▸ Open and Load SoundFont open the same
 * input a spec drives with `setInputFiles`. A command that finds none registered (the
 * legacy ribbon has its own inputs) falls back to a throwaway input.
 */
export type FilePickerKind = 'score' | 'soundfont';

const openers = new Map<FilePickerKind, () => void>();

export function registerFilePicker(kind: FilePickerKind, open: () => void): () => void {
  openers.set(kind, open);
  return () => {
    if (openers.get(kind) === open) openers.delete(kind);
  };
}

/** Opens the registered picker; returns false when there is none. */
export function openFilePicker(kind: FilePickerKind): boolean {
  const open = openers.get(kind);
  open?.();
  return Boolean(open);
}
