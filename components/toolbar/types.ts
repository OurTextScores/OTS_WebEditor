import {
  HeaderTextTarget,
  HeaderEditorPoint,
  MeasureInsertTarget,
  PartSummary,
  InstrumentTemplateGroup,
} from '../Toolbar';

export type ToolbarSectionId =
  | 'file'
  | 'view'
  | 'playback'
  | 'tempo'
  | 'measures'
  | 'signatures'
  | 'score'
  | 'notes'
  | 'expression'
  | 'edit'
  | 'layout'
  | 'pitch'
  | 'duration'
  | 'help';

export interface ToolbarSectionProps {
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
  onSelectAll?: () => void;
  onSetAccidental?: (accidentalType: number) => void;
  mutationsEnabled?: boolean;
  paletteDropEnabled?: boolean;
  selectionActive?: boolean;
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
  scoreTitle?: string;
  scoreSubtitle?: string;
  scoreComposer?: string;
  scoreLyricist?: string;
  onScoreTitleChange?: (value: string) => void;
  onScoreSubtitleChange?: (value: string) => void;
  onScoreComposerChange?: (value: string) => void;
  onScoreLyricistChange?: (value: string) => void;
  onSetTitleText?: () => void;
  onSetSubtitleText?: () => void;
  onSetComposerText?: () => void;
  onSetLyricistText?: () => void;
  headerTextAvailable?: boolean;
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
  onSetNoteheadGroup?: (noteheadGroup: number) => void;
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
  selectedTextValue?: string;
  onSelectedTextChange?: (value: string) => void;
  onApplySelectedText?: () => void;
  selectedTextDisabled?: boolean;
  onOpenHeaderEditor?: (target: HeaderTextTarget, point?: HeaderEditorPoint) => void;
}
