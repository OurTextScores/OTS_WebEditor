import type { OtsModeKind } from '../shell/workspaceMode';

/**
 * What the editor hands the command layer: every handler and flag an editor command may need.
 * `useEditorCommands` turns this into registered commands; menus, toolbars, the palette and
 * the specs' `runCommand` all reach the editor through them, never through these props.
 */

export type MeasureInsertTarget = 'beginning' | 'after-selection' | 'end';
export type HeaderTextTarget = 'title' | 'subtitle' | 'composer' | 'lyricist';
export type HeaderEditorPoint = { clientX: number; clientY: number };

export interface InstrumentTemplate {
  id: string;
  name: string;
  groupId?: string;
  groupName?: string;
  familyId?: string;
  familyName?: string;
  staffCount?: number;
  isExtended?: boolean;
}

export interface InstrumentTemplateGroup {
  id: string;
  name: string;
  instruments: InstrumentTemplate[];
}

export interface PartSummary {
  index: number;
  name: string;
  instrumentName: string;
  instrumentId: string;
  isVisible: boolean;
}

export interface EditorCommandProps {
  onNewScore?: () => void;
  onFileUpload: (file: File) => void;
  onLoadScoresToCompare?: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitWidth?: () => void;
  onFitHeight?: () => void;
  onSetZoom?: (zoom: number) => void;
  zoomLevel: number;
  onDeleteSelection?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onPitchUp?: () => void;
  onPitchDown?: () => void;
  onDurationLonger?: () => void;
  onDurationShorter?: () => void;
  onTranspose?: (semitones: number) => void;
  onTransposeEx?: (
    mode: number,
    direction: number,
    key: number,
    interval: number,
    trKeys: boolean,
    trChordNames: boolean,
    useDoubleSharpsFlats: boolean,
  ) => void;
  /**
   * Opens the transpose dialog. Supplied by `Toolbar` itself, which owns the dialog so a
   * command can open it as well as the ribbon button.
   */
  onOpenTransposeDialog?: () => void;
  onSelectAll?: () => void;
  onSetAccidental?: (accidentalType: number) => void;
  mutationsEnabled?: boolean;
  selectionActive?: boolean;
  /** The workspace mode on screen, so commands and keys can tell a compare session from the score. */
  workspaceKind?: OtsModeKind;
  /**
   * What kind of selection is active, when one is: `range` for Select All, a bar click or a
   * Shift-extended selection; `list` for several separate elements; `single` otherwise.
   */
  selectionKind?: 'single' | 'list' | 'range';
  onExportSvg?: () => void;
  onExportPdf?: () => void;
  onExportPng?: () => void;
  onExportMxl?: () => void;
  onExportMscz?: () => void;
  onExportMscx?: () => void;
  onExportMusicXml?: () => void;
  onExportAbc?: () => void;
  onExportMidi?: () => void;
  onExportAudio?: () => void;
  onExportCurrentPageAudio?: () => void;
  onExportToGoogleDrive?: () => void;
  onCreateShareableLink?: () => void;
  onSoundFontUpload?: (file: File) => void;
  exportsEnabled?: boolean;
  pngAvailable?: boolean;
  audioAvailable?: boolean;
  /** Single transport control: play, then pause, then resume. */
  onTogglePlayPause?: () => void;
  /** Tears the stream down and rewinds; pause/resume alone cannot return to the start. */
  onStopAudio?: () => void;
  onPlayFromSelectionAudio?: () => void;
  isPlaying?: boolean;
  /** Playing but suspended -- the stream is still alive and resumable. */
  isPaused?: boolean;
  audioBusy?: boolean;
  onSetTimeSignature?: (numerator: number, denominator: number, timeSigType?: number) => void;
  timeSignatureOptions?: {
    label: string;
    numerator: number;
    denominator: number;
    timeSigType?: number;
  }[];
  onSetTimeSignature44?: () => void; // legacy
  onSetTimeSignature34?: () => void; // legacy
  onSetKeySignature?: (fifths: number) => void;
  keySignatureOptions?: { label: string; fifths: number }[];
  onSetClef?: (clefType: number) => void;
  clefOptions?: { label: string; value: number }[];
  onToggleDot?: () => void;
  onToggleDoubleDot?: () => void;
  onSetDurationType?: (durationType: number) => void;
  onToggleLineBreak?: () => void;
  onTogglePageBreak?: () => void;
  onSetVoice?: (voiceIndex: number) => void;
  onAddDynamic?: (dynamicType: number) => void;
  onAddHairpin?: (hairpinType: number) => void;
  onAddFermata?: (fermataVariant: number) => void;
  onAddBreath?: (breathType: number) => void;
  onAddArpeggio?: (arpeggioType: number) => void;
  onAddTremolo?: (tremoloType: number) => void;
  onAddOttava?: (ottavaType: number) => void;
  onAddTrill?: (trillType: number) => void;
  onAddGlissando?: (glissandoType: number) => void;
  onAddPedal?: (pedalVariant: number) => void;
  onAddSostenutoPedal?: () => void;
  onAddUnaCorda?: () => void;
  onSplitPedal?: () => void;
  onAddTempoText?: (bpm: number) => void;
  onAddStaffText?: () => void;
  onAddSystemText?: () => void;
  onAddExpressionText?: () => void;
  onAddLyricText?: () => void;
  onAddHarmonyText?: (variant: 0 | 1 | 2) => void;
  onAddFingeringText?: () => void;
  onAddLeftHandGuitarFingeringText?: () => void;
  onAddRightHandGuitarFingeringText?: () => void;
  onAddStringNumberText?: () => void;
  onAddInstrumentChangeText?: () => void;
  onAddStickingText?: () => void;
  onAddFiguredBassText?: () => void;
  onAddArticulation?: (articulationSymbolName: string) => void;
  onAddSlur?: () => void;
  onFlipStem?: () => void;
  onAddTie?: () => void;
  onAddGraceNote?: (graceType: number) => void;
  onAddTuplet?: (tupletCount: number) => void;
  onToggleNoteInput?: () => void;
  /** Clears the selection (Escape, with nothing else to cancel). */
  onClearSelection?: () => void;
  /** Enters or changes a note by letter (0 = C … 6 = B); `addToChord` stacks it on the current chord. */
  onAddPitchByStep?: (step: number, addToChord: boolean) => unknown;
  onEnterRest?: () => unknown;
  onSelectNextChord?: () => unknown;
  onSelectPrevChord?: () => unknown;
  onExtendSelectionNextChord?: () => unknown;
  onExtendSelectionPrevChord?: () => unknown;
  onExtendSelectionNextMeasure?: () => unknown;
  onExtendSelectionPrevMeasure?: () => unknown;
  onExtendSelectionStaffAbove?: () => unknown;
  onExtendSelectionStaffBelow?: () => unknown;
  noteInputActive?: boolean;
  noteInputMethod?: number;
  onSetNoteInputMethod?: (method: number) => void;
  onAddNoteFromRest?: () => void;
  onToggleRepeatStart?: () => void;
  onToggleRepeatEnd?: () => void;
  onSetRepeatCount?: (count: number) => void;
  onSetBarLineType?: (barLineType: number) => void;
  onAddVolta?: (endingNumber: number) => void;
  onAddMarker?: (markerType: number) => void;
  onAddJump?: (jumpType: number) => void;
  onSetBeamMode?: (beamMode: number) => void;
  onAddFretDiagram?: (pattern: string) => void;
  onAddAmbitus?: () => void;
  onExplodeSelection?: () => void;
  onImplodeSelection?: () => void;
  onRegroupSelection?: () => void;
  onResequenceRehearsalMarks?: () => void;
  onTogglePalettes?: () => void;
  onOpenPalette?: (category: string) => void;
  palettesOpen?: boolean;
  onTogglePanels?: () => void;
  panelsVisible?: boolean;
  selectionFilterMask?: number;
  onSetSelectionFilterBit?: (filterBit: number, enabled: boolean) => void;
  onAddMeasureRepeat?: (numMeasures: number) => void;
  multiMeasureRestsEnabled?: boolean;
  onSetMultiMeasureRests?: (enabled: boolean) => void;
  onInsertMeasures?: (count: number, target: MeasureInsertTarget) => void;
  onAddPickup?: (numerator: number, denominator: number) => void;
  onRemoveContainingMeasures?: () => void;
  onRemoveTrailingEmptyMeasures?: () => void;
  insertMeasuresDisabled?: boolean;
  parts?: PartSummary[];
  instrumentGroups?: InstrumentTemplateGroup[];
  onAddPart?: (instrumentId: string) => void;
  onRemovePart?: (partIndex: number) => void;
  onTogglePartVisible?: (partIndex: number, visible: boolean) => void;
  selectedTextActive?: boolean;
  onApplySelectedText?: () => void;
  selectedTextDisabled?: boolean;
  onOpenHeaderEditor?: (target: HeaderTextTarget, point?: HeaderEditorPoint) => void;
}
