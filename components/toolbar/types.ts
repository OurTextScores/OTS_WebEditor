import { HeaderTextTarget, HeaderEditorPoint, MeasureInsertTarget, PartSummary, InstrumentTemplateGroup } from '../Toolbar';

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
    onZoomIn: () => void;
    onZoomOut: () => void;
    onFitWidth?: () => void;
    onFitHeight?: () => void;
    zoomLevel: number;
    onDeleteSelection?: () => void;
    onUndo?: () => void;
    onRedo?: () => void;
    onPitchUp?: () => void;
    onPitchDown?: () => void;
    onDurationLonger?: () => void;
    onDurationShorter?: () => void;
    onTranspose?: (semitones: number) => void;
    onSetAccidental?: (accidentalType: number) => void;
    mutationsEnabled?: boolean;
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
    onSoundFontUpload?: (file: File) => void;
    exportsEnabled?: boolean;
    pngAvailable?: boolean;
    audioAvailable?: boolean;
    onPlayAudio?: () => void;
    onPlayCurrentPageAudio?: () => void;
    onPlayFromSelectionAudio?: () => void;
    onStopAudio?: () => void;
    isPlaying?: boolean;
    audioBusy?: boolean;
    onSetTimeSignature?: (numerator: number, denominator: number, timeSigType?: number) => void;
    timeSignatureOptions?: { label: string; numerator: number; denominator: number; timeSigType?: number }[];
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
    onAddTie?: () => void;
    onAddGraceNote?: (graceType: number) => void;
    onAddTuplet?: (tupletCount: number) => void;
    onAddNoteFromRest?: () => void;
    onToggleRepeatStart?: () => void;
    onToggleRepeatEnd?: () => void;
    onSetRepeatCount?: (count: number) => void;
    onSetBarLineType?: (barLineType: number) => void;
    onAddVolta?: (endingNumber: number) => void;
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
    onOpenHeaderEditor?: (target: HeaderTextTarget, point?: HeaderEditorPoint) => void;
}
