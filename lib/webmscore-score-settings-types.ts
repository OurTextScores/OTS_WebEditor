/**
 * Engine shapes behind the score's context menu and settings dialogs (engine/musescore/bridge/contexthit.h,
 * scorestyle.h, measurestructure.h): what a right-click hit reports, style values, Measure Properties and the
 * Select ▸ More… filters. Re-exported from `webmscore-loader`.
 */

/**
 * What the score's right-click menu reads about the element under the pointer and the selection, without
 * changing either (`contextHitAtPoint`, engine/musescore/bridge/contexthit.h). `type` is the engine's type
 * name; blank staff space reports its bar ("Measure"). `selected` follows the SVG's "selected" class, widened
 * to a point inside the selected range.
 */
export interface ContextHitReport {
  hit: {
    type: string;
    selected: boolean;
    editable: boolean;
    staffIdx: number | null;
    drumStaff: boolean;
    flags: {
      inFretBox?: boolean;
      harmonyHasFretDiagram?: boolean;
      fretHasHarmony?: boolean;
      snapBefore?: boolean;
      snapAfter?: boolean;
      parentIsBarline?: boolean;
    };
  } | null;
  selection: { kind: 'none' | 'single' | 'list' | 'range'; type: string | null };
}

/** A style value as the engine stores it (`getStyleValues`): page sizes in inches, spatium in 1/1200 inch. */
export type StyleValue = number | boolean | string;

/** MuseScore's Measure Properties for the measure the selection starts in (`getMeasureProperties`). */
export interface MeasureProperties {
  index: number;
  /** Actual and nominal length, as [numerator, denominator]. */
  actual: [number, number];
  nominal: [number, number];
  irregular: boolean;
  repeatCount: number;
  breakMmr: boolean;
  stretch: number;
  /** 0 auto, 1 always show, 2 always hide. */
  numberMode: number;
  numberOffset: number;
  staves: { name: string; visible: boolean; stemless: boolean }[];
}

/** Select ▸ More… filters (MuseScore's SelectDialog / SelectNoteDialog). */
export interface SelectOptions {
  sameStaff?: boolean;
  inSelection?: boolean;
  sameSubtype?: boolean;
  sameVoice?: boolean;
  sameSystem?: boolean;
  sameMeasure?: boolean;
  sameBeat?: boolean;
  sameDuration?: boolean;
  samePitch?: boolean;
  sameNotehead?: boolean;
  sameNoteType?: boolean;
  sameString?: boolean;
  fromSelection?: boolean;
  mode?: 'replace' | 'add' | 'subtract';
}

/** MuseScore's Staff/Part Properties for one staff (`getStaffProperties`). */
export interface StaffProperties {
  partName: string;
  longName: string;
  shortName: string;
  visible: boolean;
  small: boolean;
  lines: number;
  invisibleLines: boolean;
  cutaway: boolean;
  /** 0 auto, 1 always, 2 never (AutoOnOff). */
  hideWhenEmpty: number;
}
