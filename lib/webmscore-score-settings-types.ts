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
export type StyleValue = number | boolean | string | [number, number];

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

/** One typed element property over the selection (`getElementPropertyValues`): engine tokens, never numeric enums. */
export interface ElementPropertyState {
  /** Null when the selected elements disagree. */
  value: string | null;
  mixed: boolean;
  applicableCount: number;
  /** The style default, for reset. */
  default: string;
}

/** Beam groups by row, one digit per note: 0 beamed on, 1 new beam, 2 new 16th sub-beam, 3 new 32nd sub-beam. */
export interface BeamGroupRows {
  eighth: string;
  sixteenth: string;
  thirtySecond: string;
}

/** MuseScore's Time Signature Properties for the selected time signature (`getTimeSigProperties`). */
export interface TimeSigProperties {
  type: 'normal' | 'common' | 'cut' | 'cutBach' | 'cutTriple';
  numerator: number;
  denominator: number;
  numeratorText: string;
  denominatorText: string;
  showCourtesy: boolean;
  groups: BeamGroupRows;
  defaultGroups: BeamGroupRows;
}

/** MuseScore 4.7's Staff/System Text Properties: the text's swing settings (`getStaffTextSwing`). */
export interface StaffTextSwing {
  system: boolean;
  swing: boolean;
  unit: 'off' | 'eighth' | 'sixteenth';
  /** Percent, 25–99. */
  ratio: number;
}

/** One of MuseScore's editable text styles (`getTextStyleCatalog`): its display name and style keys by property. */
export interface TextStyleEntry {
  name: string;
  /** The MSCX token an element's "style" property uses ("title", "staff"…). */
  type: string;
  keys: Partial<Record<TextStyleProperty, string>>;
}
export type TextStyleProperty =
  | 'fontFace'
  | 'fontSize'
  | 'lineSpacing'
  | 'sizeSpatiumDependent'
  | 'fontStyle'
  | 'color'
  | 'align'
  | 'offset'
  | 'frameType'
  | 'framePadding'
  | 'frameWidth'
  | 'frameRound'
  | 'frameBorderColor'
  | 'frameFillColor'
  | 'musicalSymbolsScale'
  | 'musicalSymbolsSize'
  | 'position';

/** Score methods behind the score dialogs that live outside `Score`'s own body (line budget). */
/** Where lyric entry's text box goes (page coordinates) and the text there (`startLyricsEntry`). */
export interface LyricsEntryPosition {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  /** 0 is the first verse. */
  verse: number;
}

export interface ScoreDialogMethods {
  /** MEI export through MuseScore's MEI exporter (roadmap E25). */
  saveMei?: () => Promise<Uint8Array>;
  /** MNX (JSON) export through MuseScore's MNX exporter (roadmap E29). */
  saveMnx?: () => Promise<Uint8Array>;
  /** The score's style as a MuseScore style file (.mss), every value but spatium (roadmap E23). */
  saveStyle?: () => Promise<Uint8Array>;
  /** Puts back a style saved by saveStyle as part of loading, with no undo step (roadmap E23). */
  restoreStyle?: (data: Uint8Array) => Promise<boolean>;
  /** The selected text from MuseScore's markup, keeping per-span formatting (roadmap E17); false for chord symbols etc. */
  setSelectedTextXml?: (markup: string) => Promise<boolean> | boolean;
  /** Lyric entry (roadmap E17): start at the selection; commit a syllable and move (see LYRICS_ACTIONS); stop. */
  startLyricsEntry?: () => Promise<LyricsEntryPosition | null>;
  lyricsEntryCommit?: (text: string, action: number) => Promise<LyricsEntryPosition | null>;
  endLyricsEntry?: () => Promise<boolean> | boolean;
  /** MuseScore's defaults for the named style keys (the Style dialog's reset). */
  getStyleDefaults?: (keys: string[]) => Promise<Record<string, StyleValue>>;
  /** MuseScore's Text styles page: each editable text style and its style keys by property (fontFace, color, …). */
  getTextStyleCatalog?: () => Promise<TextStyleEntry[]>;
  getStaffTextSwing?: () => Promise<Partial<StaffTextSwing>>;
  setStaffTextSwing?: (values: Omit<StaffTextSwing, 'system'>) => Promise<boolean> | boolean;
  getTimeSigProperties?: () => Promise<Partial<TimeSigProperties>>;
  /** groups: the rows, or 'default' for MuseScore's defaults. Applies to the time signature on every staff. */
  setTimeSigProperties?: (
    values: Partial<Omit<TimeSigProperties, 'groups' | 'defaultGroups'>> & { groups?: BeamGroupRows | 'default' },
  ) => Promise<boolean> | boolean;
}
