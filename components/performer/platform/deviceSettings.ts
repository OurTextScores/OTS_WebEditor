/*
 * Per-device performer settings (staff size per score and orientation, part per score). Device-only, as decided
 * for the MVP; localStorage is enough for these few small values (annotations and setlists will use IndexedDB).
 * Every access is guarded: storage can be blocked or throw (private browsing), and then defaults apply.
 */

const PREFIX = 'ots.perform.';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage unavailable: the setting lasts for this visit only
  }
}

export const readStaffScale = (scoreKey: string, orientation: string) =>
  read<number>(`staff.${orientation}.${scoreKey}`, 1);
export const writeStaffScale = (scoreKey: string, orientation: string, scale: number) =>
  write(`staff.${orientation}.${scoreKey}`, scale);
export const readPart = (scoreKey: string) => read<number>(`part.${scoreKey}`, -1);
export const writePart = (scoreKey: string, part: number) => write(`part.${scoreKey}`, part);

export const readHalfPages = (scoreKey: string, orientation: string) =>
  read<boolean>(`half.${orientation}.${scoreKey}`, false);
export const writeHalfPages = (scoreKey: string, orientation: string, on: boolean) =>
  write(`half.${orientation}.${scoreKey}`, on);
export const readPedals = <T>(fallback: T) => read<T>('pedals', fallback);
export const writePedals = (mapping: unknown) => write('pedals', mapping);
export const readPlayThrough = (scoreKey: string) =>
  read<boolean>(`playThrough.${scoreKey}`, false);
export const writePlayThrough = (scoreKey: string, on: boolean) =>
  write(`playThrough.${scoreKey}`, on);
