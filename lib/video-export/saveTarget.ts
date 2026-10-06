/** The part of the File System Access API the export uses (Chromium: Chrome, Edge). */
export interface SaveFileHandle {
  readonly name: string;
  createWritable(): Promise<FileSystemWritableFileStream>;
  getFile(): Promise<File>;
}

export type SaveFilePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<SaveFileHandle>;

/** Past this size an export is written straight to a file instead of being assembled in memory. */
export const WRITE_TO_DISK_BYTES = 150 * 1024 * 1024;

/** The browser's save-file picker, when it has one. */
export function getSaveFilePicker(target: object = globalThis): SaveFilePicker | null {
  const picker = (target as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  return typeof picker === 'function' ? picker.bind(target) : null;
}

/** Whether to ask for a file up front: the export is big and the browser can stream to one. */
export const shouldWriteToDisk = (estimatedBytes: number, picker: SaveFilePicker | null): boolean =>
  picker !== null && estimatedBytes > WRITE_TO_DISK_BYTES;

/** True when the user dismissed the picker (not an error). */
export const isPickerDismissed = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError';
