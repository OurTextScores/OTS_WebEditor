import { readPlayerPreference, writePlayerPreference } from '../player-preferences';

export type EditorHighlightPreferences = Readonly<{ measure: boolean; noteheads: boolean }>;
const defaults: EditorHighlightPreferences = { measure: true, noteheads: false };
let current: EditorHighlightPreferences | null = null;
const listeners = new Set<() => void>();
export const getEditorHighlights = (): EditorHighlightPreferences =>
  (current ??= {
    measure: readPlayerPreference('ots-editor-highlight-measure') !== '0',
    noteheads: readPlayerPreference('ots-editor-highlight-noteheads') === '1',
  });
export const getEditorHighlightsOnServer = () => defaults;
export function subscribeEditorHighlights(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function setEditorHighlight(kind: keyof EditorHighlightPreferences, enabled: boolean) {
  if (getEditorHighlights()[kind] === enabled) return;
  current = { ...getEditorHighlights(), [kind]: enabled };
  writePlayerPreference(`ots-editor-highlight-${kind}`, enabled ? '1' : '0');
  listeners.forEach((listener) => listener());
}
export function resetEditorHighlightsForTests() {
  current = null;
}
