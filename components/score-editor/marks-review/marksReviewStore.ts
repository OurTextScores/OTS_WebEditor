/**
 * Whether the rehearsal-marks review is open (File ▸ Review Rehearsal Marks, or its notice). No React here: the File
 * command that opens it is built outside components, and MarksReview subscribes with useSyncExternalStore.
 */
let open = false;
const listeners = new Set<() => void>();

export function setMarksReviewOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  listeners.forEach((listener) => listener());
}

export const openMarksReview = () => setMarksReviewOpen(true);

export const isMarksReviewOpen = () => open;

export function subscribeToMarksReview(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
