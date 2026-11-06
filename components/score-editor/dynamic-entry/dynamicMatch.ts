import { dynamicOptions } from '../../toolbar/constants';

export type DynamicOption = (typeof dynamicOptions)[number];

/*
 * Typing a dynamic (roadmap E11, contextual dynamics entry): the letters as written in the score, as desktop
 * MuseScore's dynamic text accepts them (mf, sfz, fp…). The options keep the toolbar's order (common ones first).
 */

/** The dynamics whose name starts with the typed letters (all of them for nothing typed). */
export function dynamicCandidates(typed: string): DynamicOption[] {
  const text = typed.trim().toLowerCase();
  return dynamicOptions.filter((option) => option.label.startsWith(text));
}

/** The dynamic to add for the typed letters: the one named exactly so, else the first that starts so, else none. */
export function matchDynamic(typed: string): DynamicOption | null {
  const text = typed.trim().toLowerCase();
  if (!text) return null;
  return (
    dynamicOptions.find((option) => option.label === text) ?? dynamicCandidates(text)[0] ?? null
  );
}
