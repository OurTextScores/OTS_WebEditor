/**
 * The text editor's special characters (roadmap E17), generated from MuseScore's Special Characters dialog
 * (tools/musescore/gen-special-characters.mjs). Loaded on first use: the lists and the SMuFL code points together are
 * ~180 KB, and most edits never open the picker.
 */

/** A character to insert: a music symbol by its engine name, or a Unicode character by code point. */
export type SpecialCharacter = { s: string; c?: never } | { c: number; s?: never };

export interface SpecialCharacters {
  common: SpecialCharacter[];
  /** SMuFL's categories, with the symbols the engine knows. */
  smufl: { label: string; glyphs: string[] }[];
  unicode: { label: string; first: number; last: number }[];
}

let characters: Promise<SpecialCharacters> | null = null;
let codes: Promise<Readonly<Record<string, number>>> | null = null;

export const loadSpecialCharacters = (): Promise<SpecialCharacters> =>
  (characters ??= import('./special-characters.generated.json').then(
    (m) => m.default as SpecialCharacters,
  ));

/** SMuFL code points by symbol name, to draw symbols in a music font. */
export const loadSmuflCodes = (): Promise<Readonly<Record<string, number>>> =>
  (codes ??= import('./smufl-codes.generated.json').then(
    (m) => m.default.codes as Record<string, number>,
  ));

/** A symbol's readable name: "dynamicForte" → "dynamic forte". */
export const symbolLabel = (name: string) =>
  name.replace(/([a-z])([A-Z0-9])/g, '$1 $2').toLowerCase();
