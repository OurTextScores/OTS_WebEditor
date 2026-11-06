/** Where a dropped range would land (engine page boxes), while Alt+click/drag is placing one; empty otherwise. */
export type DropBox = {
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

let boxes: readonly DropBox[] = [];
const listeners = new Set<() => void>();

export const getDropBoxes = (): readonly DropBox[] => boxes;

export function subscribeToDropBoxes(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setDropBoxes(next: readonly DropBox[]): void {
  boxes = next;
  for (const listener of listeners) listener();
}
