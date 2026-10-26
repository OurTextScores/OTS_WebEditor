import { readPlayerPreference, writePlayerPreference } from './player-preferences';

export type PresentationKind = 'measure' | 'cursor';
export type PresentationPreferences = Readonly<{ measure: number; cursor: number }>;
const DEFAULTS: PresentationPreferences = { measure: 0, cursor: 0 };
const listeners = new Set<() => void>();
let current: PresentationPreferences | null = null;
const clampLead = (value: number) =>
  Number.isFinite(value) ? Math.max(-500, Math.min(500, Math.round(value))) : 0;
export const getPresentationPreferences = (): PresentationPreferences =>
  (current ??= {
    measure: clampLead(Number(readPlayerPreference('ots-measure-lead-ms') ?? 0)),
    cursor: clampLead(Number(readPlayerPreference('ots-cursor-lead-ms') ?? 0)),
  });
export const getPresentationPreferencesOnServer = () => DEFAULTS;
export function subscribePresentationPreferences(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function setPresentationLead(kind: PresentationKind, ms: number) {
  const value = clampLead(ms);
  if (getPresentationPreferences()[kind] === value) return;
  current = { ...getPresentationPreferences(), [kind]: value };
  writePlayerPreference(`ots-${kind}-lead-ms`, String(value));
  listeners.forEach((listener) => listener());
}
/** Leads are real milliseconds over the output-aligned clock, independent of the tempo multiplier. */
export function visualScoreTime(
  positionMs: number,
  kind: PresentationKind,
  preferences = getPresentationPreferences(),
): number {
  return Math.max(0, positionMs + preferences[kind]);
}
export function resetPresentationPreferencesForTests() {
  current = null;
}
