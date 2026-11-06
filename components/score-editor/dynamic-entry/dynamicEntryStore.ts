/** Where the dynamic popup opens (viewport pixels, under the selected note), or null when it is closed. */
export type DynamicEntryAnchor = { readonly x: number; readonly y: number };

let anchor: DynamicEntryAnchor | null = null;
const listeners = new Set<() => void>();

export const getDynamicEntry = (): DynamicEntryAnchor | null => anchor;

export function subscribeToDynamicEntry(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setDynamicEntry(next: DynamicEntryAnchor | null): void {
  anchor = next;
  for (const listener of listeners) listener();
}
