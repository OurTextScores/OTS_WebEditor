import React, { useMemo, useState } from 'react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from './ui/DropdownMenu';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from './ui/Select';
import { Button } from './ui/Button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/Collapsible';

export type MeasureInsertTarget = 'beginning' | 'after-selection' | 'end';
export type HeaderTextTarget = 'title' | 'subtitle' | 'composer' | 'lyricist';
export type HeaderEditorPoint = { clientX: number; clientY: number };

type HarmonyVariant = 0 | 1 | 2;

interface InstrumentTemplate {
    id: string;
    name: string;
    groupId?: string;
    groupName?: string;
    familyId?: string;
    familyName?: string;
    staffCount?: number;
    isExtended?: boolean;
}

interface InstrumentTemplateGroup {
    id: string;
    name: string;
    instruments: InstrumentTemplate[];
}

interface PartSummary {
    index: number;
    name: string;
    instrumentName: string;
    instrumentId: string;
    isVisible: boolean;
}

interface ToolbarProps {
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
    noteEntryEnabled?: boolean;
    noteEntryAvailable?: boolean;
    mutationsEnabled?: boolean;
    selectionActive?: boolean;
    onExportSvg?: () => void;
    onExportPdf?: () => void;
    onExportPng?: () => void;
    onExportMxl?: () => void;
    onExportMscz?: () => void;
    onExportMidi?: () => void;
    onExportAudio?: () => void;
    onSoundFontUpload?: (file: File) => void;
    exportsEnabled?: boolean;
    pngAvailable?: boolean;
    audioAvailable?: boolean;
    onPlayAudio?: () => void;
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
    onAddHarmonyText?: (variant: HarmonyVariant) => void;
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

const toolbarInputBaseClass =
    'rounded-lg border-0 bg-white px-2.5 py-1.5 text-sm font-medium leading-5 text-slate-800 shadow-sm ring-1 ring-slate-200 transition focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:cursor-not-allowed disabled:ring-slate-100 disabled:bg-slate-50 disabled:text-slate-500';
const dropdownTextClass = 'px-3 py-1.5 text-sm font-medium leading-5 text-slate-800';
const toolbarRowClass =
    'flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 text-sm font-medium leading-5 [&_button]:mx-0.5 [&_label.cursor-pointer]:mx-0.5 border-b border-slate-100 bg-white hover:bg-slate-50/30 transition-colors';
const toolbarSectionLabelClass = 'text-xs font-bold uppercase tracking-wider text-slate-600 mr-2';

const resolveMenuPoint = (event?: Event): HeaderEditorPoint => {
    if (event && 'clientX' in event && typeof event.clientX === 'number' && typeof event.clientY === 'number') {
        return { clientX: event.clientX, clientY: event.clientY };
    }
    const target = event?.currentTarget as HTMLElement | null;
    if (target?.getBoundingClientRect) {
        const rect = target.getBoundingClientRect();
        return { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
    }
    if (typeof window !== 'undefined') {
        return { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 };
    }
    return { clientX: 0, clientY: 0 };
};

const ToolbarDropdown: React.FC<{
    label: string;
    disabled?: boolean;
    children: React.ReactNode;
    testId?: string;
    triggerClassName?: string;
    triggerVariant?: React.ComponentProps<typeof Button>['variant'];
}> = ({ label, disabled = false, children, testId, triggerClassName, triggerVariant = 'outline' }) => {
    const [open, setOpen] = useState(false);
    const menuOpen = disabled ? false : open;

    return (
        <DropdownMenu
            open={menuOpen}
            onOpenChange={(nextOpen) => setOpen(disabled ? false : nextOpen)}
            modal={false}
        >
            <DropdownMenuTrigger asChild>
                <Button
                    data-testid={testId}
                    variant={triggerVariant}
                    size="sm"
                    className={`rounded-lg ${triggerClassName ?? ''}`.trim()}
                    disabled={disabled}
                    aria-expanded={menuOpen}
                >
                    {label}
                </Button>
            </DropdownMenuTrigger>
            {!disabled && (
                <DropdownMenuContent>
                    {children}
                </DropdownMenuContent>
            )}
        </DropdownMenu>
    );
};

export const Toolbar: React.FC<ToolbarProps> = ({
    onNewScore,
    onFileUpload,
    onZoomIn,
    onZoomOut,
    onFitWidth,
    onFitHeight,
    zoomLevel,
    onDeleteSelection,
    onUndo,
    onRedo,
    onPitchUp,
    onPitchDown,
    onDurationLonger,
    onDurationShorter,
    onTranspose,
    onSetAccidental,
    mutationsEnabled = false,
    selectionActive = false,
    onExportSvg,
    onExportPdf,
    onExportPng,
    onExportMxl,
    onExportMscz,
    onExportMidi,
    onExportAudio,
    onSoundFontUpload,
    exportsEnabled = false,
    pngAvailable = false,
    audioAvailable = false,
    onPlayAudio,
    onPlayFromSelectionAudio,
    onStopAudio,
    isPlaying = false,
	audioBusy = false,
	onSetTimeSignature,
	timeSignatureOptions,
	onSetTimeSignature44,
	onSetTimeSignature34,
	onSetKeySignature,
	keySignatureOptions,
	onSetClef,
	clefOptions,
    onToggleDot,
    onToggleDoubleDot,
    onSetDurationType,
    onToggleLineBreak,
    onTogglePageBreak,
    onSetVoice,
    onAddDynamic,
    onAddHairpin,
    onAddPedal,
    onAddSostenutoPedal,
    onAddUnaCorda,
    onSplitPedal,
    onAddTempoText,
    onAddStaffText,
    onAddSystemText,
    onAddExpressionText,
    onAddLyricText,
    onAddHarmonyText,
    onAddFingeringText,
    onAddLeftHandGuitarFingeringText,
    onAddRightHandGuitarFingeringText,
    onAddStringNumberText,
    onAddInstrumentChangeText,
    onAddStickingText,
    onAddFiguredBassText,
    onAddArticulation,
    onAddSlur,
    onAddTie,
    onAddGraceNote,
    onAddTuplet,
    onAddNoteFromRest,
    onToggleRepeatStart,
    onToggleRepeatEnd,
    onSetRepeatCount,
    onSetBarLineType,
    onAddVolta,
    onInsertMeasures,
    onRemoveContainingMeasures,
    onRemoveTrailingEmptyMeasures,
    insertMeasuresDisabled = false,
    parts = [],
    instrumentGroups = [],
    onAddPart,
    onRemovePart,
    onTogglePartVisible,
    onOpenHeaderEditor
}) => {
    const [selectedInstrumentId, setSelectedInstrumentId] = useState('');
    const [customTimeSigNumerator, setCustomTimeSigNumerator] = useState('4');
    const [measureCount, setMeasureCount] = useState(1);
    const [measureTarget, setMeasureTarget] = useState<MeasureInsertTarget>('after-selection');
    const [tempoBpm, setTempoBpm] = useState('120');
    const [toolbarCollapsed, setToolbarCollapsed] = useState(
        () => typeof window !== 'undefined' && window.innerWidth < 1024,
    );

    const handleApplyMeasures = () => {
        if (!onInsertMeasures) {
            return;
        }
        const sanitized = Math.max(1, Math.floor(measureCount));
        setMeasureCount(sanitized);
        onInsertMeasures(sanitized, measureTarget);
    };
    const handleApplyTempo = () => {
        if (!onAddTempoText) {
            return;
        }
        const trimmed = tempoBpm.trim();
        if (!trimmed) {
            return;
        }
        const parsed = Number(trimmed);
        const sanitized = Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : 120;
        setTempoBpm(String(sanitized));
        onAddTempoText(sanitized);
    };
    const [customTimeSigDenominator, setCustomTimeSigDenominator] = useState('4');
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            onFileUpload(file);
        }
    };
    const handleSoundFontChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file && onSoundFontUpload) {
            onSoundFontUpload(file);
        }
    };

    const mutationDisabled = !mutationsEnabled;
    const insertMeasuresBlocked = insertMeasuresDisabled || !onInsertMeasures || mutationDisabled;
    const textDropdownDisabled = mutationDisabled || (!selectionActive && !onOpenHeaderEditor);
	const signatureOptions = timeSignatureOptions ?? [
		{ label: 'Common time', numerator: 4, denominator: 4, timeSigType: 1 },
		{ label: 'Cut time', numerator: 2, denominator: 2, timeSigType: 2 },
	];

	const keySignatureButtonOptions = keySignatureOptions ?? [
		{ label: 'C', fifths: 0 },
		{ label: 'G', fifths: 1 },
		{ label: 'D', fifths: 2 },
		{ label: 'A', fifths: 3 },
		{ label: 'E', fifths: 4 },
		{ label: 'B', fifths: 5 },
		{ label: 'F#', fifths: 6 },
		{ label: 'C#', fifths: 7 },
		{ label: 'F', fifths: -1 },
		{ label: 'Bb', fifths: -2 },
		{ label: 'Eb', fifths: -3 },
		{ label: 'Ab', fifths: -4 },
		{ label: 'Db', fifths: -5 },
		{ label: 'Gb', fifths: -6 },
		{ label: 'Cb', fifths: -7 },
	];

	const clefButtonOptions = clefOptions ?? [
		{ label: 'Treble', value: 0 },          // ClefType::G
        { label: 'Bass', value: 20 },           // ClefType::F
		{ label: 'French Violin', value: 7 },   // ClefType::G_1
		{ label: 'Treble 15mb', value: 1 },     // ClefType::G15_MB
        { label: 'Treble 8vb', value: 2 },      // ClefType::G8_VB
        { label: 'Treble 8va', value: 3 },      // ClefType::G8_VA
        { label: 'Treble 15ma', value: 4 },     // ClefType::G15_MA
        { label: 'Treble 8vb (O)', value: 5 },  // ClefType::G8_VB_O
        { label: 'Treble 8vb (P)', value: 6 },  // ClefType::G8_VB_P
        { label: 'Soprano', value: 8 },         // ClefType::C1
        { label: 'Mezzo', value: 9 },           // ClefType::C2
        { label: 'Alto', value: 10 },           // ClefType::C3
        { label: 'Tenor', value: 11 },          // ClefType::C4
        { label: 'Baritone', value: 12 },       // ClefType::C5
        { label: 'C (19c)', value: 13 },        // ClefType::C_19C
        { label: 'C1 (F18c)', value: 14 },      // ClefType::C1_F18C
        { label: 'C3 (F18c)', value: 15 },      // ClefType::C3_F18C
        { label: 'C4 (F18c)', value: 16 },      // ClefType::C4_F18C
        { label: 'C1 (F20c)', value: 17 },      // ClefType::C1_F20C
        { label: 'C3 (F20c)', value: 18 },      // ClefType::C3_F20C
        { label: 'C4 (F20c)', value: 19 },      // ClefType::C4_F20C
        { label: 'Bass 15mb', value: 21 },      // ClefType::F15_MB
        { label: 'Bass 8vb', value: 22 },       // ClefType::F8_VB
        { label: 'Bass 8va', value: 23 },       // ClefType::F_8VA
        { label: 'Bass 15ma', value: 24 },      // ClefType::F_15MA
        { label: 'F (B)', value: 25 },          // ClefType::F_B
        { label: 'F (C)', value: 26 },          // ClefType::F_C
        { label: 'F (F18c)', value: 27 },       // ClefType::F_F18C
        { label: 'F (19c)', value: 28 },        // ClefType::F_19C
        { label: 'Perc', value: 29 },           // ClefType::PERC
        { label: 'Perc 2', value: 30 },         // ClefType::PERC2
        { label: 'TAB', value: 31 },            // ClefType::TAB
        { label: 'TAB4', value: 32 },           // ClefType::TAB4
        { label: 'TAB Serif', value: 33 },      // ClefType::TAB_SERIF
        { label: 'TAB4 Serif', value: 34 },     // ClefType::TAB4_SERIF
	];

    const graceNoteOptions = [
        { label: 'Acciaccatura', value: 1, testId: 'btn-grace-acciaccatura' },    // NoteType::ACCIACCATURA
        { label: 'Appoggiatura', value: 2, testId: 'btn-grace-appoggiatura' },    // NoteType::APPOGGIATURA
        { label: 'Grace 16th', value: 8, testId: 'btn-grace-16' },                // NoteType::GRACE16
        { label: 'Grace 32nd', value: 16, testId: 'btn-grace-32' },               // NoteType::GRACE32
        { label: 'Grace 8th After', value: 32, testId: 'btn-grace-8-after' },     // NoteType::GRACE8_AFTER
        { label: 'Grace 16th After', value: 64, testId: 'btn-grace-16-after' },   // NoteType::GRACE16_AFTER
        { label: 'Grace 32nd After', value: 128, testId: 'btn-grace-32-after' },  // NoteType::GRACE32_AFTER
    ];

    const durationOptions = [
        { label: '32nd', value: 7, shortcut: '2', testId: 'btn-duration-32' },   // DurationType::V_32ND
        { label: '16th', value: 6, shortcut: '3', testId: 'btn-duration-16' },   // DurationType::V_16TH
        { label: '8th', value: 5, shortcut: '4', testId: 'btn-duration-8' },     // DurationType::V_EIGHTH
        { label: 'Quarter', value: 4, shortcut: '5', testId: 'btn-duration-4' }, // DurationType::V_QUARTER
        { label: 'Half', value: 3, shortcut: '6', testId: 'btn-duration-2' },    // DurationType::V_HALF
        { label: 'Whole', value: 2, shortcut: '7', testId: 'btn-duration-1' },   // DurationType::V_WHOLE
    ];

    const dynamicOptions = [
        { label: 'p', value: 6 },      // DynamicType::P
        { label: 'mp', value: 7 },     // DynamicType::MP
        { label: 'mf', value: 8 },     // DynamicType::MF
        { label: 'f', value: 9 },      // DynamicType::F
        { label: 'pp', value: 5 },     // DynamicType::PP
        { label: 'ff', value: 10 },    // DynamicType::FF
        { label: 'ppp', value: 4 },    // DynamicType::PPP
        { label: 'fff', value: 11 },   // DynamicType::FFF
        { label: 'pppp', value: 3 },   // DynamicType::PPPP
        { label: 'ffff', value: 12 },  // DynamicType::FFFF
        { label: 'ppppp', value: 2 },  // DynamicType::PPPPP
        { label: 'fffff', value: 13 }, // DynamicType::FFFFF
        { label: 'pppppp', value: 1 }, // DynamicType::PPPPPP
        { label: 'ffffff', value: 14 }, // DynamicType::FFFFFF
        { label: 'fp', value: 15 },    // DynamicType::FP
        { label: 'pf', value: 16 },    // DynamicType::PF
        { label: 'sf', value: 17 },    // DynamicType::SF
        { label: 'sfz', value: 18 },   // DynamicType::SFZ
        { label: 'sff', value: 19 },   // DynamicType::SFF
        { label: 'sffz', value: 20 },  // DynamicType::SFFZ
        { label: 'sfp', value: 21 },   // DynamicType::SFP
        { label: 'sfpp', value: 22 },  // DynamicType::SFPP
        { label: 'rfz', value: 23 },   // DynamicType::RFZ
        { label: 'rf', value: 24 },    // DynamicType::RF
        { label: 'fz', value: 25 },    // DynamicType::FZ
        { label: 'm', value: 26 },     // DynamicType::M
        { label: 'r', value: 27 },     // DynamicType::R
        { label: 's', value: 28 },     // DynamicType::S
        { label: 'z', value: 29 },     // DynamicType::Z
        { label: 'n', value: 30 },     // DynamicType::N
    ];

    const hairpinOptions = [
        { label: 'Crescendo', value: 0, testId: 'btn-hairpin-cresc' },   // HairpinType::CRESC_HAIRPIN
        { label: 'Decrescendo', value: 1, testId: 'btn-hairpin-decresc' }, // HairpinType::DECRESC_HAIRPIN
    ];

    const pedalOptions = [
        { label: 'Pedal Line', value: 0, testId: 'btn-pedal-line' },
        { label: 'Ped. *', value: 1, testId: 'btn-pedal-text' },
    ];

    const articulationOptions = [
        { label: 'Staccato', symbol: 'articStaccatoAbove' },
        { label: 'Tenuto', symbol: 'articTenutoAbove' },
        { label: 'Marcato', symbol: 'articMarcatoAbove' },
        { label: 'Accent', symbol: 'articAccentAbove' },
    ];

    const tupletOptions = [
        { label: 'Duplet', count: 2 },
        { label: 'Triplet', count: 3 },
        { label: 'Quintuplet', count: 5 },
        { label: 'Sextuplet', count: 6 },
        { label: 'Septuplet', count: 7 },
        { label: 'Octuplet', count: 8 },
    ];

    const repeatCountOptions = [
        { label: '2x', count: 2 },
        { label: '3x', count: 3 },
        { label: '4x', count: 4 },
    ];

    const barlineOptions = [
        { label: 'Normal', value: 1 },         // BarLineType::NORMAL
        { label: 'Double', value: 2 },         // BarLineType::DOUBLE
        { label: 'Final', value: 32 },         // BarLineType::END
        { label: 'Heavy', value: 512 },        // BarLineType::HEAVY
        { label: 'Heavy-Heavy', value: 1024 }, // BarLineType::DOUBLE_HEAVY
        { label: 'Dashed', value: 16 },        // BarLineType::BROKEN
        { label: 'Dotted', value: 128 },       // BarLineType::DOTTED
        { label: 'Reverse Final', value: 256 }, // BarLineType::REVERSE_END
    ];

    const voltaOptions = [
        { label: '1st Ending', ending: 1 },
        { label: '2nd Ending', ending: 2 },
    ];

    const resolveTimeSigHandler = (opt: { label: string; numerator: number; denominator: number; timeSigType?: number }) => {
        if (onSetTimeSignature) {
            return () => onSetTimeSignature(opt.numerator, opt.denominator, opt.timeSigType);
        }
        if (opt.label === 'Common time') return onSetTimeSignature44;
        if (opt.label === 'Cut time') return onSetTimeSignature34;
        return undefined;
    };

    const accidentalOptions = [
        { label: '♯', value: 3 },  // AccidentalType::SHARP
        { label: '♭', value: 1 },  // AccidentalType::FLAT
        { label: '♮', value: 2 },  // AccidentalType::NATURAL
        { label: 'x', value: 4 },  // AccidentalType::SHARP2
        { label: '♭♭', value: 5 }, // AccidentalType::FLAT2
        { label: 'Clear', value: 0 }, // AccidentalType::NONE
    ];

    const instrumentOptions = instrumentGroups.flatMap(group =>
        group.instruments.map(instrument => ({
            ...instrument,
            groupName: instrument.groupName ?? group.name,
            groupId: instrument.groupId ?? group.id
        }))
    );
    const commonInstrumentPreferences = useMemo(() => ([
        { key: 'piano', ids: ['piano'] },
        { key: 'violin', ids: ['violin'] },
        { key: 'viola', ids: ['viola'] },
        { key: 'cello', ids: ['violoncello', 'cello'] },
        { key: 'double-bass', ids: ['double-bass', 'contrabass'], label: 'Double Bass' },
        { key: 'flute', ids: ['flute'] },
        { key: 'oboe', ids: ['oboe'] },
        { key: 'clarinet', ids: ['clarinet'], label: 'Clarinet' },
        { key: 'bassoon', ids: ['bassoon'] },
        { key: 'trumpet', ids: ['trumpet'], label: 'Trumpet' },
        { key: 'horn', ids: ['horn'] },
        { key: 'trombone', ids: ['trombone'] },
        { key: 'tuba', ids: ['tuba'] },
        { key: 'alto-saxophone', ids: ['alto-saxophone'] },
        { key: 'tenor-saxophone', ids: ['tenor-saxophone'] },
        { key: 'bass-guitar', ids: ['bass-guitar'] },
        { key: 'guitar', ids: ['guitar-nylon', 'guitar-steel'] },
        { key: 'voice', ids: ['voice'] },
        { key: 'drumset', ids: ['drumset'] },
    ]), []);
    const commonInstruments = useMemo(() => {
        const results: { instrument: InstrumentTemplate; label: string }[] = [];
        const used = new Set<string>();
        for (const pref of commonInstrumentPreferences) {
            const found = pref.ids
                .map((id) => instrumentOptions.find((instrument) => instrument.id === id))
                .find(Boolean);
            if (found && !used.has(found.id)) {
                used.add(found.id);
                results.push({ instrument: found, label: pref.label ?? found.name });
            }
        }
        return results;
    }, [commonInstrumentPreferences, instrumentOptions]);
    const hasInstrumentTemplates = instrumentOptions.length > 0;
    const instrumentIdToAdd = selectedInstrumentId || (hasInstrumentTemplates ? instrumentOptions[0].id : '');
    const instrumentsDisabled = !exportsEnabled;
    const canAddInstrument = !mutationDisabled && Boolean(onAddPart) && hasInstrumentTemplates;
    const canToggleVisibility = !mutationDisabled && Boolean(onTogglePartVisible);
    const canRemovePart = !mutationDisabled && Boolean(onRemovePart);
    const canSetCustomTimeSig = !mutationDisabled && Boolean(onSetTimeSignature);
    const parsedCustomNumerator = Number.parseInt(customTimeSigNumerator, 10);
    const parsedCustomDenominator = Number.parseInt(customTimeSigDenominator, 10);
    const customTimeSigValid = Number.isInteger(parsedCustomNumerator)
        && Number.isInteger(parsedCustomDenominator)
        && parsedCustomNumerator > 0
        && parsedCustomDenominator > 0;
    const shortcutEntries = [
        { label: 'Delete: Delete / Backspace', title: 'Shortcut: Delete / Backspace' },
        { label: 'Undo: Ctrl/Cmd + Z', title: 'Shortcut: Ctrl/Cmd + Z' },
        { label: 'Redo: Ctrl + Y, Cmd + Shift + Z', title: 'Shortcut: Ctrl + Y, Cmd + Shift + Z' },
        { label: 'Pitch: Arrow Up/Down', title: 'Shortcut: Arrow Up/Down' },
        { label: 'Octave: Ctrl/Cmd + Arrow Up/Down', title: 'Shortcut: Ctrl/Cmd + Arrow Up/Down' },
        {
            label: 'Duration numbers: 1=64th, 2=32nd, 3=16th, 4=8th, 5=Quarter, 6=Half, 7=Whole, 8=Breve',
            title: 'Shortcut: Press 1-8 to respell the selected note\'s duration',
        },
        {
            label: 'Pitch letters: A-G (Shift to add to chord)',
            title: 'Shortcut: Press A-G to respell pitch, hold Shift to add another pitch to the chord',
        },
        { label: 'Rest: 0 (insert rest)', title: 'Shortcut: Press 0 to insert a rest instead of a note' },
        { label: 'Copy: Ctrl/Cmd + C', title: 'Shortcut: Ctrl/Cmd + C' },
        { label: 'Paste: Ctrl/Cmd + V', title: 'Shortcut: Ctrl/Cmd + V' },
    ];

    return (
        <Collapsible
            open={!toolbarCollapsed}
            onOpenChange={(open) => setToolbarCollapsed(!open)}
        >
            <div
                className="relative flex flex-col gap-0 overflow-visible border-b border-slate-200 bg-white shadow-sm"
                style={{ zIndex: 100 }}
            >
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-gradient-to-r from-blue-50 via-slate-50 to-blue-50 px-4 py-2.5">
                    <div className="flex items-center gap-2">
                        <div className="h-6 w-1 rounded-full bg-blue-600"></div>
                        <span className="text-sm font-bold tracking-wide text-slate-800">
                            Score Tools
                        </span>
                    </div>
                    <CollapsibleTrigger asChild>
                        <Button
                            aria-expanded={!toolbarCollapsed}
                            aria-controls="toolbar-content"
                            variant="ghost"
                            size="sm"
                            className="text-xs font-semibold text-blue-700 hover:bg-blue-100"
                        >
                            {toolbarCollapsed ? '▼ Show Tools' : '▲ Hide Tools'}
                        </Button>
                    </CollapsibleTrigger>
                </div>
                <CollapsibleContent id="toolbar-content" className="flex flex-col gap-0 bg-gradient-to-b from-slate-50 to-white">
                    <div className={`${toolbarRowClass} sm:gap-4`}>
                        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-blue-50/40 px-3 py-2">
                            <span className={toolbarSectionLabelClass}>File</span>
                            <div className="h-4 w-px bg-slate-200"></div>
                            <Button
                                onClick={onNewScore}
                                variant="primary"
                                size="sm"
                                disabled={!onNewScore}
                                className="shadow-sm"
                            >
                                New Score
                            </Button>
                            <Button asChild variant="primary" size="sm" className="shadow-sm">
                                <label className="cursor-pointer">
                                Load Score
                                <input
                                    data-testid="open-score-input"
                                    type="file"
                                    accept=".mscz,.mscx,.mxl,.xml,.musicxml"
                                    onChange={handleFileChange}
                                    className="hidden"
                                />
                                </label>
                            </Button>
                            <ToolbarDropdown
                                label="Export"
                                disabled={!exportsEnabled}
                                testId="dropdown-export"
                                triggerVariant="primary"
                                triggerClassName="shadow-sm"
                            >
                                <DropdownMenuItem
                                    data-testid="btn-export-svg"
                                    disabled={!exportsEnabled || !onExportSvg}
                                    onSelect={() => onExportSvg?.()}
                                >
                                    SVG
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    data-testid="btn-export-pdf"
                                    disabled={!exportsEnabled || !onExportPdf}
                                    onSelect={() => onExportPdf?.()}
                                >
                                    PDF
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    data-testid="btn-export-png"
                                    disabled={!exportsEnabled || !onExportPng || !pngAvailable}
                                    onSelect={() => onExportPng?.()}
                                >
                                    PNG
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    data-testid="btn-export-mxl"
                                    disabled={!exportsEnabled || !onExportMxl}
                                    onSelect={() => onExportMxl?.()}
                                >
                                    MXL
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    data-testid="btn-export-mscz"
                                    disabled={!exportsEnabled || !onExportMscz}
                                    onSelect={() => onExportMscz?.()}
                                >
                                    MSCZ
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    data-testid="btn-export-midi"
                                    disabled={!exportsEnabled || !onExportMidi}
                                    onSelect={() => onExportMidi?.()}
                                >
                                    MIDI
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    data-testid="btn-export-audio"
                                    disabled={!exportsEnabled || !onExportAudio || !audioAvailable || audioBusy}
                                    onSelect={() => onExportAudio?.()}
                                >
                                    {audioBusy ? 'Exporting…' : 'WAV'}
                                </DropdownMenuItem>
                            </ToolbarDropdown>
                            <div className="h-4 w-px bg-slate-200"></div>
                            <Button asChild variant="outline" size="sm" className="shadow-sm">
                                <label className="cursor-pointer">
                                    Load SoundFont
                                    <input
                                        data-testid="soundfont-input"
                                        type="file"
                                        accept=".sf2,.sf3"
                                        onChange={handleSoundFontChange}
                                        className="hidden"
                                    />
                                </label>
                            </Button>
                        </div>
                        <div className="ml-auto flex items-center gap-2 rounded-lg bg-slate-50/50 px-3 py-2">
                            <span className={toolbarSectionLabelClass}>View</span>
                            <div className="h-4 w-px bg-slate-200"></div>
                            <Button
                                data-testid="btn-fit-width"
                                onClick={onFitWidth}
                                disabled={!onFitWidth}
                                variant="outline"
                                size="sm"
                                className="shadow-sm"
                            >
                                Fit Width
                            </Button>
                            <Button
                                data-testid="btn-fit-height"
                                onClick={onFitHeight}
                                disabled={!onFitHeight}
                                variant="outline"
                                size="sm"
                                className="shadow-sm"
                            >
                                Fit Height
                            </Button>
                            <div className="h-4 w-px bg-slate-200"></div>
                            <Button
                                data-testid="btn-zoom-out"
                                onClick={onZoomOut}
                                variant="outline"
                                size="sm"
                                className="shadow-sm"
                            >
                                −
                            </Button>
                            <span className="min-w-[3rem] rounded bg-white px-2 py-1 text-center text-xs font-bold text-slate-700 shadow-sm">
                                {(zoomLevel * 100).toFixed(0)}%
                            </span>
                            <Button
                                data-testid="btn-zoom-in"
                                onClick={onZoomIn}
                                variant="outline"
                                size="sm"
                                className="shadow-sm"
                            >
                                +
                            </Button>
                        </div>
                    </div>

                <div className={toolbarRowClass}>
                    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-green-50/40 px-3 py-2">
                        <span className={toolbarSectionLabelClass}>Playback</span>
                        <div className="h-4 w-px bg-slate-200"></div>
                        <Button
                            data-testid="btn-play"
                            onClick={onPlayAudio}
                            disabled={!audioAvailable || !onPlayAudio || audioBusy}
                            variant="primary"
                            size="sm"
                            className="shadow-sm bg-green-600 hover:bg-green-700 border-green-600"
                        >
                            {audioBusy ? 'Working…' : isPlaying ? '▶ Replay' : '▶ Play'}
                        </Button>
                        <Button
                            data-testid="btn-play-from-selection"
                            onClick={onPlayFromSelectionAudio}
                            disabled={!audioAvailable || !onPlayFromSelectionAudio || !selectionActive || audioBusy}
                            variant="outline"
                            size="sm"
                            className="shadow-sm"
                        >
                            ▶ From Selection
                        </Button>
                        <Button
                            data-testid="btn-stop"
                            onClick={onStopAudio}
                            disabled={!audioAvailable || !onStopAudio}
                            variant="outline"
                            size="sm"
                            className="shadow-sm"
                        >
                            ■ Stop
                        </Button>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg bg-purple-50/40 px-3 py-2">
                        <span className={toolbarSectionLabelClass}>Tempo</span>
                        <div className="h-4 w-px bg-slate-200"></div>
                        <input
                            data-testid="input-tempo-bpm"
                            type="number"
                            min={1}
                            value={tempoBpm}
                            onChange={event => setTempoBpm(event.currentTarget.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    handleApplyTempo();
                                }
                            }}
                            className={`${toolbarInputBaseClass} w-20`}
                        />
                        <Button
                            data-testid="btn-tempo-apply"
                            onClick={handleApplyTempo}
                            disabled={mutationDisabled || !onAddTempoText}
                            variant="outline"
                            size="sm"
                            className="shadow-sm"
                        >
                            Apply
                        </Button>
                    </div>
                </div>

                <div className={toolbarRowClass}>
                    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50/40 px-3 py-2">
                        <span className={toolbarSectionLabelClass}>Measures</span>
                        <div className="h-4 w-px bg-slate-200"></div>
                        <input
                            data-testid="input-measure-count"
                            type="number"
                            min={1}
                            value={measureCount}
                            onChange={event => setMeasureCount(Number(event.currentTarget.value) || 1)}
                            className={`${toolbarInputBaseClass} w-16`}
                        />
                        <Select
                            value={measureTarget}
                            onValueChange={(value) => setMeasureTarget(value as MeasureInsertTarget)}
                        >
                            <SelectTrigger data-testid="select-measure-target" className="w-40 shadow-sm">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="beginning">Beginning</SelectItem>
                                <SelectItem value="after-selection">After Selection</SelectItem>
                                <SelectItem value="end">End</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button
                            data-testid="btn-insert-measures"
                            onClick={handleApplyMeasures}
                            disabled={insertMeasuresBlocked}
                            variant="outline"
                            size="sm"
                            className="shadow-sm"
                        >
                            Add
                        </Button>
                        <div className="h-4 w-px bg-slate-200"></div>
                        <Button
                            data-testid="btn-remove-containing-measures"
                            onClick={onRemoveContainingMeasures}
                            disabled={mutationDisabled || !selectionActive || !onRemoveContainingMeasures}
                            variant="outline"
                            size="sm"
                            className="shadow-sm"
                        >
                            Remove Selected
                        </Button>
                        <Button
                            data-testid="btn-remove-trailing-empty"
                            onClick={onRemoveTrailingEmptyMeasures}
                            disabled={mutationDisabled || !onRemoveTrailingEmptyMeasures}
                            variant="outline"
                            size="sm"
                            className="shadow-sm"
                        >
                            Remove Trailing
                        </Button>
                    </div>
                </div>

                <div className={toolbarRowClass}>
                    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-indigo-50/40 px-3 py-2">
                        <span className={toolbarSectionLabelClass}>Signatures</span>
                        <div className="h-4 w-px bg-slate-200"></div>
                    <ToolbarDropdown
                        label="Time Signature"
                        disabled={mutationDisabled}
                        testId="dropdown-signature"
                        triggerClassName="shadow-sm"
                    >
                        {signatureOptions.map(opt => {
                            const handler = resolveTimeSigHandler(opt);
                            return (
                                <DropdownMenuItem
                                    key={opt.label}
                                    data-testid={`btn-timesig-${opt.numerator}-${opt.denominator}`}
                                    disabled={mutationDisabled || !handler}
                                    onSelect={() => handler?.()}
                                >
                                    {opt.label}
                                </DropdownMenuItem>
                            );
                        })}
                    </ToolbarDropdown>
                        <div className="h-4 w-px bg-slate-200"></div>
                        <span className="text-xs font-medium text-slate-600">Custom:</span>
                        <input
                            data-testid="input-timesig-numerator"
                            type="number"
                            min={1}
                            value={customTimeSigNumerator}
                            onChange={(event) => setCustomTimeSigNumerator(event.target.value)}
                            disabled={!canSetCustomTimeSig}
                            className={`${toolbarInputBaseClass} w-14`}
                        />
                        <span className="text-slate-600">/</span>
                        <input
                            data-testid="input-timesig-denominator"
                            type="number"
                            min={1}
                            value={customTimeSigDenominator}
                            onChange={(event) => setCustomTimeSigDenominator(event.target.value)}
                            disabled={!canSetCustomTimeSig}
                            className={`${toolbarInputBaseClass} w-14`}
                        />
                        <Button
                            data-testid="btn-timesig-custom"
                            onClick={() => {
                                if (onSetTimeSignature && customTimeSigValid) {
                                    onSetTimeSignature(parsedCustomNumerator, parsedCustomDenominator);
                                }
                            }}
                            disabled={!canSetCustomTimeSig || !customTimeSigValid}
                            variant="outline"
                            size="sm"
                            className="shadow-sm"
                        >
                            Apply
                        </Button>
                    </div>
                </div>

                <div className={toolbarRowClass}>
                    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-rose-50/40 px-3 py-2">
                        <span className={toolbarSectionLabelClass}>Score</span>
                        <div className="h-4 w-px bg-slate-200"></div>
                    <ToolbarDropdown
                        label="Instruments"
                        disabled={instrumentsDisabled}
                        testId="dropdown-instruments"
                        triggerClassName="shadow-sm"
                    >
                        <DropdownMenuLabel>Add</DropdownMenuLabel>
                        {hasInstrumentTemplates ? (
                            <>
                                <Select
                                    value={instrumentIdToAdd}
                                    onValueChange={(value) => setSelectedInstrumentId(value)}
                                    disabled={mutationDisabled}
                                >
                                    <SelectTrigger data-testid="select-instrument-add" className="w-full">
                                        <SelectValue placeholder="Select instrument" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {commonInstruments.length > 0 && (
                                            <SelectGroup>
                                                <SelectLabel>Common</SelectLabel>
                                                {commonInstruments.map((entry, index) => (
                                                    <SelectItem key={`common-${entry.instrument.id}-${index}`} value={entry.instrument.id}>
                                                        {entry.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectGroup>
                                        )}
                                        {instrumentGroups.map(group => (
                                            <SelectGroup key={group.id}>
                                                <SelectLabel>{group.name}</SelectLabel>
                                                {group.instruments.map(instrument => (
                                                    <SelectItem key={instrument.id} value={instrument.id}>
                                                        {instrument.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectGroup>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <DropdownMenuItem
                                    disabled={!canAddInstrument || !instrumentIdToAdd}
                                    onSelect={() => {
                                        if (instrumentIdToAdd && onAddPart) {
                                            onAddPart(instrumentIdToAdd);
                                        }
                                    }}
                                >
                                    Add Instrument
                                </DropdownMenuItem>
                            </>
                        ) : (
                            <div className="px-2 py-1 text-sm text-slate-600">
                                Instrument list unavailable.
                            </div>
                        )}

                        <DropdownMenuLabel>On Score</DropdownMenuLabel>
                        {parts.length ? (
                            parts.map(part => (
                                <div key={`${part.index}-${part.instrumentId}`} className="flex items-center gap-3">
                                    <span className="flex-1 truncate text-sm text-slate-800">
                                        {part.name || part.instrumentName || part.instrumentId}
                                    </span>
                                    <DropdownMenuItem
                                        data-testid={`btn-part-visible-${part.index}`}
                                        disabled={!canToggleVisibility}
                                        onSelect={() => onTogglePartVisible?.(part.index, !part.isVisible)}
                                    >
                                        {part.isVisible ? 'Hide' : 'Show'}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        data-testid={`btn-part-remove-${part.index}`}
                                        disabled={!canRemovePart}
                                        onSelect={() => {
                                            if (!onRemovePart) return;
                                            const label = part.name || part.instrumentName || 'this part';
                                            if (typeof window === 'undefined' || window.confirm(`Remove ${label}?`)) {
                                                onRemovePart(part.index);
                                            }
                                        }}
                                    >
                                        Remove
                                    </DropdownMenuItem>
                                </div>
                            ))
                        ) : (
                            <div className="px-2 py-1 text-sm text-slate-600">No parts loaded.</div>
                        )}
                    </ToolbarDropdown>
                        <div className="h-4 w-px bg-slate-200"></div>
		            <ToolbarDropdown
                        label="Key"
                        disabled={mutationDisabled || !onSetKeySignature}
                        testId="dropdown-key"
                        triggerClassName="shadow-sm"
                    >
                        <DropdownMenuLabel>Major</DropdownMenuLabel>
                        {keySignatureButtonOptions.map(opt => (
                            <DropdownMenuItem
                                key={opt.fifths}
                                data-testid={`btn-keysig-${opt.fifths}`}
                                disabled={mutationDisabled || !onSetKeySignature}
                                onSelect={() => onSetKeySignature?.(opt.fifths)}
                            >
                                {opt.label}
                            </DropdownMenuItem>
                        ))}
                    </ToolbarDropdown>
                        <div className="h-4 w-px bg-slate-200"></div>
		            <ToolbarDropdown
                        label="Clef"
                        disabled={mutationDisabled || !onSetClef}
                        testId="dropdown-clef"
                        triggerClassName="shadow-sm"
                    >
                        <DropdownMenuLabel>Common</DropdownMenuLabel>
                        {clefButtonOptions.map(opt => (
                            <DropdownMenuItem
                                key={opt.value}
                                data-testid={`btn-clef-${opt.value}`}
                                disabled={mutationDisabled || !onSetClef}
                                onSelect={() => onSetClef?.(opt.value)}
                            >
                                {opt.label}
                            </DropdownMenuItem>
                        ))}
                    </ToolbarDropdown>
                        <div className="h-4 w-px bg-slate-200"></div>
            <ToolbarDropdown
                label="Repeats/Barlines"
                disabled={mutationDisabled || !selectionActive}
                testId="dropdown-repeats"
                triggerClassName="shadow-sm"
            >
                <DropdownMenuLabel>Repeats</DropdownMenuLabel>
                <DropdownMenuItem
                    data-testid="btn-repeat-start"
                    disabled={mutationDisabled || !selectionActive || !onToggleRepeatStart}
                    onSelect={() => onToggleRepeatStart?.()}
                >
                    Start Repeat
                </DropdownMenuItem>
                <DropdownMenuItem
                    data-testid="btn-repeat-end"
                    disabled={mutationDisabled || !selectionActive || !onToggleRepeatEnd}
                    onSelect={() => onToggleRepeatEnd?.()}
                >
                    End Repeat
                </DropdownMenuItem>
                <DropdownMenuLabel>Repeat Count</DropdownMenuLabel>
                {repeatCountOptions.map(opt => (
                    <DropdownMenuItem
                        key={opt.count}
                        data-testid={`btn-repeat-count-${opt.count}`}
                        disabled={mutationDisabled || !selectionActive || !onSetRepeatCount}
                        onSelect={() => onSetRepeatCount?.(opt.count)}
                    >
                        {opt.label}
                    </DropdownMenuItem>
                ))}
                <DropdownMenuLabel>Barlines</DropdownMenuLabel>
                {barlineOptions.map(opt => (
                    <DropdownMenuItem
                        key={opt.value}
                        data-testid={`btn-barline-${opt.value}`}
                        disabled={mutationDisabled || !selectionActive || !onSetBarLineType}
                        onSelect={() => onSetBarLineType?.(opt.value)}
                    >
                        {opt.label}
                    </DropdownMenuItem>
                ))}
                <DropdownMenuLabel>Voltas</DropdownMenuLabel>
                {voltaOptions.map(opt => (
                    <DropdownMenuItem
                        key={opt.ending}
                        data-testid={`btn-volta-${opt.ending}`}
                        disabled={mutationDisabled || !selectionActive || !onAddVolta}
                        onSelect={() => onAddVolta?.(opt.ending)}
                    >
                        {opt.label}
                    </DropdownMenuItem>
                ))}
            </ToolbarDropdown>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-teal-50/40 px-3 py-2">
                        <span className={toolbarSectionLabelClass}>Notes</span>
                        <div className="h-4 w-px bg-slate-200"></div>
            <ToolbarDropdown
                label="Grace Notes"
                disabled={mutationDisabled}
                testId="dropdown-grace-notes"
                triggerClassName="shadow-sm"
            >
                {graceNoteOptions.map(opt => (
                    <DropdownMenuItem
                        key={opt.value}
                        data-testid={opt.testId}
                        disabled={mutationDisabled || !selectionActive || !onAddGraceNote}
                        onSelect={() => onAddGraceNote?.(opt.value)}
                    >
                        {opt.label}
                    </DropdownMenuItem>
                ))}
            </ToolbarDropdown>
                        <div className="h-4 w-px bg-slate-200"></div>
            <ToolbarDropdown
                label="Voice"
                disabled={mutationDisabled}
                testId="dropdown-voice"
                triggerClassName="shadow-sm"
            >
                {[1, 2, 3, 4].map(v => (
                    <DropdownMenuItem
                        key={v}
                        data-testid={`btn-voice-${v}`}
                        disabled={mutationDisabled || !onSetVoice}
                        onSelect={() => onSetVoice?.(v - 1)}
                    >
                        Voice {v}
                    </DropdownMenuItem>
                ))}
            </ToolbarDropdown>
                        <div className="h-4 w-px bg-slate-200"></div>
            <ToolbarDropdown
                label="Slur/Tie"
                disabled={mutationDisabled || !selectionActive}
                testId="dropdown-slur-tie"
                triggerClassName="shadow-sm"
            >
                <DropdownMenuItem
                    data-testid="btn-slur"
                    disabled={mutationDisabled || !selectionActive || !onAddSlur}
                    onSelect={() => onAddSlur?.()}
                >
                    Slur
                </DropdownMenuItem>
                <DropdownMenuItem
                    data-testid="btn-tie"
                    disabled={mutationDisabled || !selectionActive || !onAddTie}
                    onSelect={() => onAddTie?.()}
                >
                    Tie
                </DropdownMenuItem>
            </ToolbarDropdown>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-cyan-50/40 px-3 py-2">
                        <span className={toolbarSectionLabelClass}>Expression</span>
                        <div className="h-4 w-px bg-slate-200"></div>
            <ToolbarDropdown
                label="Markings"
                disabled={mutationDisabled}
                testId="dropdown-markings"
                triggerClassName="shadow-sm"
            >
                <DropdownMenuLabel>Dynamics</DropdownMenuLabel>
                {dynamicOptions.map(opt => (
                    <DropdownMenuItem
                        key={opt.label}
                        data-testid={`btn-dynamic-${opt.value}`}
                        disabled={mutationDisabled || !selectionActive || !onAddDynamic}
                        onSelect={() => onAddDynamic?.(opt.value)}
                    >
                        {opt.label}
                    </DropdownMenuItem>
                ))}
                <DropdownMenuLabel>Hairpins</DropdownMenuLabel>
                {hairpinOptions.map(opt => (
                    <DropdownMenuItem
                        key={opt.label}
                        data-testid={opt.testId}
                        disabled={mutationDisabled || !selectionActive || !onAddHairpin}
                        onSelect={() => onAddHairpin?.(opt.value)}
                    >
                        {opt.label}
                    </DropdownMenuItem>
                ))}
            </ToolbarDropdown>
                        <div className="h-4 w-px bg-slate-200"></div>
            <ToolbarDropdown
                label="Pedal"
                disabled={mutationDisabled}
                testId="dropdown-pedal"
                triggerClassName="shadow-sm"
            >
                {pedalOptions.map(opt => (
                    <DropdownMenuItem
                        key={opt.label}
                        data-testid={opt.testId}
                        disabled={mutationDisabled || !selectionActive || !onAddPedal}
                        onSelect={() => onAddPedal?.(opt.value)}
                    >
                        {opt.label}
                    </DropdownMenuItem>
                ))}
                <DropdownMenuLabel>Special</DropdownMenuLabel>
                <DropdownMenuItem
                    data-testid="btn-pedal-sostenuto"
                    disabled={mutationDisabled || !selectionActive || !onAddSostenutoPedal}
                    onSelect={() => onAddSostenutoPedal?.()}
                >
                    Sostenuto Pedal
                </DropdownMenuItem>
                <DropdownMenuItem
                    data-testid="btn-pedal-una-corda"
                    disabled={mutationDisabled || !selectionActive || !onAddUnaCorda}
                    onSelect={() => onAddUnaCorda?.()}
                >
                    Una Corda
                </DropdownMenuItem>
                <DropdownMenuLabel>Variants</DropdownMenuLabel>
                <DropdownMenuItem
                    data-testid="btn-pedal-split"
                    disabled={mutationDisabled || !selectionActive || !onSplitPedal}
                    onSelect={() => onSplitPedal?.()}
                >
                    Pedal Change
                </DropdownMenuItem>
            </ToolbarDropdown>
                        <div className="h-4 w-px bg-slate-200"></div>
            <ToolbarDropdown
                label="Text"
                disabled={textDropdownDisabled}
                testId="dropdown-text"
                triggerClassName="shadow-sm"
            >
                <DropdownMenuLabel>Score Header</DropdownMenuLabel>
                <DropdownMenuItem
                    data-testid="btn-text-title"
                    disabled={mutationDisabled || !onOpenHeaderEditor}
                    onSelect={(event) => onOpenHeaderEditor?.('title', resolveMenuPoint(event))}
                >
                    Title…
                </DropdownMenuItem>
                <DropdownMenuItem
                    data-testid="btn-text-subtitle"
                    disabled={mutationDisabled || !onOpenHeaderEditor}
                    onSelect={(event) => onOpenHeaderEditor?.('subtitle', resolveMenuPoint(event))}
                >
                    Subtitle…
                </DropdownMenuItem>
                <DropdownMenuItem
                    data-testid="btn-text-composer"
                    disabled={mutationDisabled || !onOpenHeaderEditor}
                    onSelect={(event) => onOpenHeaderEditor?.('composer', resolveMenuPoint(event))}
                >
                    Composer…
                </DropdownMenuItem>
                <DropdownMenuItem
                    data-testid="btn-text-lyricist"
                    disabled={mutationDisabled || !onOpenHeaderEditor}
                    onSelect={(event) => onOpenHeaderEditor?.('lyricist', resolveMenuPoint(event))}
                >
                    Lyricist…
                </DropdownMenuItem>
                <DropdownMenuLabel>Score Text</DropdownMenuLabel>
                <DropdownMenuItem
                    data-testid="btn-text-staff"
                    disabled={mutationDisabled || !selectionActive || !onAddStaffText}
                    onSelect={() => onAddStaffText?.()}
                >
                    Staff Text
                </DropdownMenuItem>
                <DropdownMenuItem
                    data-testid="btn-text-system"
                    disabled={mutationDisabled || !selectionActive || !onAddSystemText}
                    onSelect={() => onAddSystemText?.()}
                >
                    System Text
                </DropdownMenuItem>
                <DropdownMenuItem
                    data-testid="btn-text-expression"
                    disabled={mutationDisabled || !selectionActive || !onAddExpressionText}
                    onSelect={() => onAddExpressionText?.()}
                >
                    Expression Text
                </DropdownMenuItem>
                <DropdownMenuItem
                    data-testid="btn-text-lyrics"
                    disabled={mutationDisabled || !selectionActive || !onAddLyricText}
                    onSelect={() => onAddLyricText?.()}
                >
                    Lyrics
                </DropdownMenuItem>
                <DropdownMenuLabel>Harmony</DropdownMenuLabel>
                <DropdownMenuItem
                    data-testid="btn-text-harmony-standard"
                    disabled={mutationDisabled || !selectionActive || !onAddHarmonyText}
                    onSelect={() => onAddHarmonyText?.(0)}
                >
                    Chord Symbol
                </DropdownMenuItem>
                <DropdownMenuItem
                    data-testid="btn-text-harmony-roman"
                    disabled={mutationDisabled || !selectionActive || !onAddHarmonyText}
                    onSelect={() => onAddHarmonyText?.(1)}
                >
                    Roman Numeral
                </DropdownMenuItem>
                <DropdownMenuItem
                    data-testid="btn-text-harmony-nashville"
                    disabled={mutationDisabled || !selectionActive || !onAddHarmonyText}
                    onSelect={() => onAddHarmonyText?.(2)}
                >
                    Nashville Number
                </DropdownMenuItem>
                <DropdownMenuLabel>Figured Bass</DropdownMenuLabel>
                <DropdownMenuItem
                    data-testid="btn-text-figured-bass"
                    disabled={mutationDisabled || !selectionActive || !onAddFiguredBassText}
                    onSelect={() => onAddFiguredBassText?.()}
                >
                    Figured Bass
                </DropdownMenuItem>
                <DropdownMenuLabel>Fingering</DropdownMenuLabel>
                <DropdownMenuItem
                    data-testid="btn-text-fingering"
                    disabled={mutationDisabled || !selectionActive || !onAddFingeringText}
                    onSelect={() => onAddFingeringText?.()}
                >
                    Fingering
                </DropdownMenuItem>
                <DropdownMenuItem
                    data-testid="btn-text-fingering-lh"
                    disabled={mutationDisabled || !selectionActive || !onAddLeftHandGuitarFingeringText}
                    onSelect={() => onAddLeftHandGuitarFingeringText?.()}
                >
                    LH Guitar Fingering
                </DropdownMenuItem>
                <DropdownMenuItem
                    data-testid="btn-text-fingering-rh"
                    disabled={mutationDisabled || !selectionActive || !onAddRightHandGuitarFingeringText}
                    onSelect={() => onAddRightHandGuitarFingeringText?.()}
                >
                    RH Guitar Fingering
                </DropdownMenuItem>
                <DropdownMenuItem
                    data-testid="btn-text-string-number"
                    disabled={mutationDisabled || !selectionActive || !onAddStringNumberText}
                    onSelect={() => onAddStringNumberText?.()}
                >
                    String Number
                </DropdownMenuItem>
                <DropdownMenuLabel>Sticking</DropdownMenuLabel>
                <DropdownMenuItem
                    data-testid="btn-text-sticking"
                    disabled={mutationDisabled || !selectionActive || !onAddStickingText}
                    onSelect={() => onAddStickingText?.()}
                >
                    Sticking
                </DropdownMenuItem>
                <DropdownMenuLabel>Instrument</DropdownMenuLabel>
                <DropdownMenuItem
                    data-testid="btn-text-instrument-change"
                    disabled={mutationDisabled || !selectionActive || !onAddInstrumentChangeText}
                    onSelect={() => onAddInstrumentChangeText?.()}
                >
                    Instrument Change
                </DropdownMenuItem>
            </ToolbarDropdown>
                        <div className="h-4 w-px bg-slate-200"></div>
            <ToolbarDropdown
                label="Articulations"
                disabled={mutationDisabled || !selectionActive}
                testId="dropdown-articulations"
                triggerClassName="shadow-sm"
            >
                {articulationOptions.map(opt => (
                    <DropdownMenuItem
                        key={opt.symbol}
                        data-testid={`btn-artic-${opt.symbol}`}
                        disabled={mutationDisabled || !selectionActive || !onAddArticulation}
                        onSelect={() => onAddArticulation?.(opt.symbol)}
                    >
                        {opt.label}
                    </DropdownMenuItem>
                ))}
            </ToolbarDropdown>
                    </div>
                </div>

                <div className={toolbarRowClass}>
                    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-red-50/40 px-3 py-2">
                        <span className={toolbarSectionLabelClass}>Edit</span>
                        <div className="h-4 w-px bg-slate-200"></div>
                        <Button
                            data-testid="btn-delete"
                            title="Shortcut: Delete / Backspace"
                            onClick={onDeleteSelection}
                            disabled={mutationDisabled || !onDeleteSelection || !selectionActive}
                            variant="outline"
                            size="sm"
                            className="shadow-sm"
                        >
                            Delete
                        </Button>
                        <div className="h-4 w-px bg-slate-200"></div>
                        <Button
                            data-testid="btn-undo"
                            title="Shortcut: Ctrl/Cmd + Z"
                            onClick={onUndo}
                            disabled={mutationDisabled || !onUndo}
                            variant="outline"
                            size="sm"
                            className="shadow-sm"
                        >
                            ↶ Undo
                        </Button>
                        <Button
                            data-testid="btn-redo"
                            title="Shortcut: Ctrl + Y, Cmd + Shift + Z"
                            onClick={onRedo}
                            disabled={mutationDisabled || !onRedo}
                            variant="outline"
                            size="sm"
                            className="shadow-sm"
                        >
                            ↷ Redo
                        </Button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-lime-50/40 px-3 py-2">
                        <span className={toolbarSectionLabelClass}>Layout</span>
                        <div className="h-4 w-px bg-slate-200"></div>
                        <span
                            className="inline-flex"
                            title={
                                mutationDisabled || !selectionActive
                                    ? 'Select a note or rest to split the bar.'
                                    : undefined
                            }
                        >
                            <Button
                                data-testid="btn-new-line"
                                onClick={onToggleLineBreak}
                                disabled={mutationDisabled || !selectionActive || !onToggleLineBreak}
                                variant="outline"
                                size="sm"
                                className="shadow-sm"
                            >
                                New Line
                            </Button>
                        </span>
                        <span
                            className="inline-flex"
                            title={
                                mutationDisabled || !selectionActive
                                    ? 'Select a note or rest to split the bar.'
                                    : undefined
                            }
                        >
                            <Button
                                data-testid="btn-new-page"
                                onClick={onTogglePageBreak}
                                disabled={mutationDisabled || !selectionActive || !onTogglePageBreak}
                                variant="outline"
                                size="sm"
                                className="shadow-sm"
                            >
                                New Page
                            </Button>
                        </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-sky-50/40 px-3 py-2">
                        <span className={toolbarSectionLabelClass}>Pitch</span>
                        <div className="h-4 w-px bg-slate-200"></div>
                        <Button
                            data-testid="btn-add-note-top"
                            onClick={onAddNoteFromRest}
                            disabled={mutationDisabled || !selectionActive || !onAddNoteFromRest}
                            variant="outline"
                            size="sm"
                            className="shadow-sm"
                        >
                            Add Note
                        </Button>
                        <div className="h-4 w-px bg-slate-200"></div>
                        <Button
                            data-testid="btn-pitch-down"
                            title="Shortcut: Arrow Down (Pitch Down)"
                            onClick={onPitchDown}
                            disabled={mutationDisabled || !onPitchDown || !selectionActive}
                            variant="outline"
                            size="sm"
                            className="shadow-sm"
                        >
                            Pitch ↓
                        </Button>
                        <Button
                            data-testid="btn-pitch-up"
                            title="Shortcut: Arrow Up (Pitch Up)"
                            onClick={onPitchUp}
                            disabled={mutationDisabled || !onPitchUp || !selectionActive}
                            variant="outline"
                            size="sm"
                            className="shadow-sm"
                        >
                            Pitch ↑
                        </Button>
                        <div className="h-4 w-px bg-slate-200"></div>
                        <Button
                            data-testid="btn-transpose--12"
                            onClick={() => onTranspose?.(-12)}
                            title="Shortcut: Ctrl/Cmd + Arrow Down (Octave Down)"
                            disabled={mutationDisabled || !selectionActive || !onTranspose}
                            variant="outline"
                            size="sm"
                            className="shadow-sm"
                        >
                            Octave ↓
                        </Button>
                        <Button
                            data-testid="btn-transpose-12"
                            title="Shortcut: Ctrl/Cmd + Arrow Up (Octave Up)"
                            onClick={() => onTranspose?.(12)}
                            disabled={mutationDisabled || !selectionActive || !onTranspose}
                            variant="outline"
                            size="sm"
                            className="shadow-sm"
                        >
                            Octave ↑
                        </Button>
                        <div className="h-4 w-px bg-slate-200"></div>
                    <ToolbarDropdown
                        label="Accidental"
                        disabled={mutationDisabled || !selectionActive || !onSetAccidental}
                        testId="dropdown-accidental"
                        triggerClassName="shadow-sm"
                    >
                        {accidentalOptions.map(opt => (
                            <DropdownMenuItem
                                key={opt.label}
                                data-testid={`btn-acc-${opt.value}`}
                                disabled={mutationDisabled || !selectionActive || !onSetAccidental}
                                onSelect={() => onSetAccidental?.(opt.value)}
                            >
                                {opt.label}
                            </DropdownMenuItem>
                        ))}
                    </ToolbarDropdown>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-violet-50/40 px-3 py-2">
                        <span className={toolbarSectionLabelClass}>Duration</span>
                        <div className="h-4 w-px bg-slate-200"></div>
                        <Button
                            data-testid="btn-duration-shorter"
                            onClick={onDurationShorter}
                            disabled={mutationDisabled || !onDurationShorter || !selectionActive}
                            variant="outline"
                            size="sm"
                            className="shadow-sm"
                        >
                            ← Shorter
                        </Button>
                        <Button
                            data-testid="btn-duration-longer"
                            onClick={onDurationLonger}
                            disabled={mutationDisabled || !onDurationLonger || !selectionActive}
                            variant="outline"
                            size="sm"
                            className="shadow-sm"
                        >
                            Longer →
                        </Button>
                        <div className="h-4 w-px bg-slate-200"></div>
            <ToolbarDropdown
                label="Rhythm"
                disabled={mutationDisabled}
                testId="dropdown-rhythm"
                triggerClassName="shadow-sm"
            >
                <DropdownMenuLabel>Notes</DropdownMenuLabel>
                <DropdownMenuItem
                    data-testid="btn-add-note-dropdown"
                    disabled={mutationDisabled || !selectionActive || !onAddNoteFromRest}
                    onSelect={() => onAddNoteFromRest?.()}
                >
                    Add Note
                </DropdownMenuItem>
                <DropdownMenuLabel>Duration</DropdownMenuLabel>
                {durationOptions.map(opt => (
                    <DropdownMenuItem
                        key={opt.value}
                        data-testid={opt.testId}
                        disabled={mutationDisabled || !selectionActive || !onSetDurationType}
                        title={`Shortcut: press ${opt.shortcut} for ${opt.label}`}
                        onSelect={() => onSetDurationType?.(opt.value)}
                    >
                        {opt.label}
                    </DropdownMenuItem>
                ))}
                <DropdownMenuLabel>Dots</DropdownMenuLabel>
                <DropdownMenuItem
                    data-testid="btn-dot"
                    disabled={mutationDisabled || !selectionActive || !onToggleDot}
                    onSelect={() => onToggleDot?.()}
                >
                    Dot
                </DropdownMenuItem>
                <DropdownMenuItem
                    data-testid="btn-double-dot"
                    disabled={mutationDisabled || !selectionActive || !onToggleDoubleDot}
                    onSelect={() => onToggleDoubleDot?.()}
                >
                    Double Dot
                </DropdownMenuItem>
                <DropdownMenuLabel>Tuplets</DropdownMenuLabel>
                {tupletOptions.map(opt => (
                    <DropdownMenuItem
                        key={opt.count}
                        data-testid={`btn-tuplet-${opt.count}`}
                        disabled={mutationDisabled || !selectionActive || !onAddTuplet}
                        onSelect={() => onAddTuplet?.(opt.count)}
                    >
                        {opt.label}
                    </DropdownMenuItem>
                ))}
            </ToolbarDropdown>
                    </div>

                    <div className="ml-auto flex flex-wrap items-center gap-2 rounded-lg bg-slate-50/60 px-3 py-2">
                        <span className={toolbarSectionLabelClass}>Help</span>
                        <div className="h-4 w-px bg-slate-200"></div>
                        <ToolbarDropdown
                            label="⌨ Shortcuts"
                            testId="dropdown-shortcuts"
                            triggerClassName="shadow-sm"
                        >
                            {shortcutEntries.map(opt => (
                                <div key={opt.label} className={dropdownTextClass} title={opt.title}>
                                    {opt.label}
                                </div>
                            ))}
                        </ToolbarDropdown>
                    </div>
                </div>
                </CollapsibleContent>
            </div>
        </Collapsible>
    );
};
