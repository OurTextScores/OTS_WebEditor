import type React from 'react';

/** A pointer as double-click editing reads it: what is under it and where. */
export type EditPointer = Pick<React.MouseEvent, 'target' | 'clientX' | 'clientY' | 'preventDefault'>;

/**
 * Where Edit Element acts: the right-clicked point, else the centre of the selection's first
 * drawn element. Waits a frame first, so the context menu that ran the command has gone and
 * the point hits the score, not the menu. Null when nothing in the score is there.
 */
export async function editPointerFor(
  container: HTMLElement | null,
  at?: { clientX: number; clientY: number },
): Promise<EditPointer | null> {
  let point = at;
  if (!point) {
    const selected = container?.querySelector('svg .selected');
    if (!selected) return null;
    const rect = selected.getBoundingClientRect();
    point = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
  }
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const target = document.elementFromPoint(point.clientX, point.clientY);
  if (!target || !container?.contains(target)) return null;
  return { target, clientX: point.clientX, clientY: point.clientY, preventDefault: () => undefined };
}
