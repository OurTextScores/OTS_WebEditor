import { useEffect, useRef } from 'react';

/** Whether a key event is the editor's Undo (Mod+Z) or Redo (Mod+Shift+Z, Mod+Y), Mod being Cmd on Apple, else Ctrl. */
export function undoKeyOf(event: KeyboardEvent): 'undo' | 'redo' | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && !event.shiftKey) return 'redo';
  return null;
}

/**
 * The editor's undo and redo keys for the marks, anywhere in the perform view (not while typing a text mark, where
 * they undo the typing).
 */
export function useUndoKeys(undo: () => void, redo: () => void) {
  const latest = useRef({ undo, redo });
  useEffect(() => {
    latest.current = { undo, redo };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = undoKeyOf(event);
      if (!action) return;
      if (
        (event.target as HTMLElement | null)?.closest('input, textarea, [contenteditable="true"]')
      )
        return;
      event.preventDefault();
      latest.current[action]();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}
