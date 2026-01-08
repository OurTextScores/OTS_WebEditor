import React, { useState } from 'react';

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
    onFileUpload: (file: File) => void;
    scoreTitle?: string;
    scoreSubtitle?: string;
    scoreComposer?: string;
    onScoreTitleChange?: (title: string) => void;
    onScoreSubtitleChange?: (subtitle: string) => void;
    onScoreComposerChange?: (composer: string) => void;
    onSetTitleText?: () => void;
    onSetSubtitleText?: () => void;
    onSetComposerText?: () => void;
    headerTextAvailable?: boolean;
    onZoomIn: () => void;
    onZoomOut: () => void;
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
    onExportMidi?: () => void;
    onExportAudio?: () => void;
    onSoundFontUpload?: (file: File) => void;
    exportsEnabled?: boolean;
    pngAvailable?: boolean;
    audioAvailable?: boolean;
    onPlayAudio?: () => void;
    onStopAudio?: () => void;
    isPlaying?: boolean;
	audioBusy?: boolean;
	onSetTimeSignature?: (numerator: number, denominator: number) => void;
	timeSignatureOptions?: { label: string; numerator: number; denominator: number }[];
	onSetTimeSignature44?: () => void; // legacy
	onSetTimeSignature34?: () => void; // legacy
	onSetKeySignature?: (fifths: number) => void;
	keySignatureOptions?: { label: string; fifths: number }[];
	onSetClef?: (clefType: number) => void;
	clefOptions?: { label: string; value: number }[];
    onToggleDot?: () => void;
    onToggleDoubleDot?: () => void;
    onToggleLineBreak?: () => void;
    onTogglePageBreak?: () => void;
    onSetVoice?: (voiceIndex: number) => void;
    onAddDynamic?: (dynamicType: number) => void;
    onAddRehearsalMark?: () => void;
    onAddTempoText?: (bpm: number) => void;
    onAddStaffText?: () => void;
    onAddSystemText?: () => void;
    onAddExpressionText?: () => void;
    onAddLyricText?: () => void;
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
    parts?: PartSummary[];
    instrumentGroups?: InstrumentTemplateGroup[];
    onAddPart?: (instrumentId: string) => void;
    onRemovePart?: (partIndex: number) => void;
    onTogglePartVisible?: (partIndex: number, visible: boolean) => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
    onFileUpload,
    scoreTitle,
    scoreSubtitle,
    scoreComposer,
    onScoreTitleChange,
    onScoreSubtitleChange,
    onScoreComposerChange,
    onSetTitleText,
    onSetSubtitleText,
    onSetComposerText,
    headerTextAvailable = false,
    onZoomIn,
    onZoomOut,
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
    onToggleLineBreak,
    onTogglePageBreak,
    onSetVoice,
    onAddDynamic,
    onAddRehearsalMark,
    onAddTempoText,
    onAddStaffText,
    onAddSystemText,
    onAddExpressionText,
    onAddLyricText,
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
    parts = [],
    instrumentGroups = [],
    onAddPart,
    onRemovePart,
    onTogglePartVisible
}) => {
    const [selectedInstrumentId, setSelectedInstrumentId] = useState('');
    const [customTimeSigNumerator, setCustomTimeSigNumerator] = useState('4');
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
    const headerTextDisabled = mutationDisabled || !exportsEnabled || !headerTextAvailable;
	const signatureOptions = timeSignatureOptions ?? [
		{ label: '4/4', numerator: 4, denominator: 4 },
		{ label: '3/4', numerator: 3, denominator: 4 },
		{ label: '2/4', numerator: 2, denominator: 4 },
        { label: '6/8', numerator: 6, denominator: 8 },
        { label: '2/2', numerator: 2, denominator: 2 },
        { label: '5/4', numerator: 5, denominator: 4 },
		{ label: '7/8', numerator: 7, denominator: 8 },
        { label: '3/8', numerator: 3, denominator: 8 },
        { label: '9/8', numerator: 9, denominator: 8 },
        { label: '12/8', numerator: 12, denominator: 8 },
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

    const resolveTimeSigHandler = (opt: { label: string; numerator: number; denominator: number }) => {
        if (onSetTimeSignature) {
            return () => onSetTimeSignature(opt.numerator, opt.denominator);
        }
        if (opt.label === '4/4') return onSetTimeSignature44;
        if (opt.label === '3/4') return onSetTimeSignature34;
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

    const dropdownSummaryClass =
        'px-3 py-1 bg-white border border-gray-300 rounded cursor-pointer hover:bg-gray-50 list-none';
    const dropdownSummaryDisabledClass = 'opacity-50 cursor-not-allowed pointer-events-none';
    const dropdownMenuClass =
        'absolute mt-2 w-56 bg-white border border-gray-200 rounded shadow-lg p-2 flex flex-col gap-1';
    const dropdownItemClass =
        'dropdown-item px-3 py-1 text-left rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed';
    const dropdownTextClass = 'px-3 py-1 text-sm text-gray-700';
    const dropdownLabelClass = 'text-xs uppercase tracking-wide text-gray-500 px-2 py-1';
    const instrumentOptions = instrumentGroups.flatMap(group =>
        group.instruments.map(instrument => ({
            ...instrument,
            groupName: instrument.groupName ?? group.name,
            groupId: instrument.groupId ?? group.id
        }))
    );
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

    const ToolbarDropdown: React.FC<{
        label: string;
        disabled?: boolean;
        children: React.ReactNode;
        testId?: string;
    }> = ({ label, disabled = false, children, testId }) => (
        <details className="relative overflow-visible" data-testid={testId}>
            <summary
                className={`${dropdownSummaryClass} ${disabled ? dropdownSummaryDisabledClass : ''}`}
            >
                {label}
            </summary>
            {!disabled && (
                <div
                    className={dropdownMenuClass}
                    style={{ zIndex: 110 }}
                    onClick={(event) => {
                        const target = event.target as HTMLElement | null;
                        const closeTrigger = target?.closest('.dropdown-item, [data-dropdown-close="true"]');
                        if (!closeTrigger) {
                            return;
                        }
                        const details = event.currentTarget.closest('details');
                        if (details) {
                            details.removeAttribute('open');
                        }
                    }}
                >
                    {children}
                </div>
            )}
        </details>
    );

    return (
        <div
            className="relative flex flex-wrap items-center justify-between gap-4 p-4 bg-gray-100 border-b border-gray-300 overflow-visible"
            style={{ zIndex: 100 }}
        >
	            <div className="flex items-center space-x-4">
	                <label className="px-4 py-2 bg-blue-600 text-white rounded cursor-pointer hover:bg-blue-700">
	                    Open Score
	                    <input
	                        data-testid="open-score-input"
	                        type="file"
	                        accept=".mscz,.xml,.musicxml"
	                        onChange={handleFileChange}
	                        className="hidden"
	                    />
	                </label>
	                <label className="px-4 py-2 bg-indigo-600 text-white rounded cursor-pointer hover:bg-indigo-700">
	                    Load SoundFont
	                    <input
	                        data-testid="soundfont-input"
	                        type="file"
	                        accept=".sf2,.sf3"
	                        onChange={handleSoundFontChange}
	                        className="hidden"
	                    />
	                </label>

                    <div className="flex flex-wrap items-center gap-2 text-sm">
                        <input
                            data-testid="input-title"
                            type="text"
                            value={scoreTitle ?? ''}
                            onChange={(e) => onScoreTitleChange?.(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && onSetTitleText && !headerTextDisabled) {
                                    e.preventDefault();
                                    onSetTitleText();
                                }
                            }}
                            placeholder="Title"
                            disabled={headerTextDisabled || !onScoreTitleChange}
                            className="px-2 py-1 bg-white border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                        <button
                            data-testid="btn-set-title"
                            type="button"
                            onClick={onSetTitleText}
                            disabled={headerTextDisabled || !onSetTitleText}
                            className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Set Title
                        </button>
                        <input
                            data-testid="input-subtitle"
                            type="text"
                            value={scoreSubtitle ?? ''}
                            onChange={(e) => onScoreSubtitleChange?.(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && onSetSubtitleText && !headerTextDisabled) {
                                    e.preventDefault();
                                    onSetSubtitleText();
                                }
                            }}
                            placeholder="Subtitle"
                            disabled={headerTextDisabled || !onScoreSubtitleChange}
                            className="px-2 py-1 bg-white border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                        <button
                            data-testid="btn-set-subtitle"
                            type="button"
                            onClick={onSetSubtitleText}
                            disabled={headerTextDisabled || !onSetSubtitleText}
                            className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Set Subtitle
                        </button>
                        <input
                            data-testid="input-composer"
                            type="text"
                            value={scoreComposer ?? ''}
                            onChange={(e) => onScoreComposerChange?.(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && onSetComposerText && !headerTextDisabled) {
                                    e.preventDefault();
                                    onSetComposerText();
                                }
                            }}
                            placeholder="Composer"
                            disabled={headerTextDisabled || !onScoreComposerChange}
                            className="px-2 py-1 bg-white border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                        <button
                            data-testid="btn-set-composer"
                            type="button"
                            onClick={onSetComposerText}
                            disabled={headerTextDisabled || !onSetComposerText}
                            className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Set Composer
                        </button>
                    </div>
	            </div>

	            <div className="flex items-center flex-wrap gap-2 text-sm">
                <div className="flex items-center space-x-2">
                    <button
                        data-testid="btn-delete"
                        type="button"
                        onClick={onDeleteSelection}
                        disabled={mutationDisabled || !onDeleteSelection || !selectionActive}
	                        className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
	                    >
	                        Delete
	                    </button>
	                    <button
	                        data-testid="btn-undo"
	                        type="button"
	                        onClick={onUndo}
	                        disabled={mutationDisabled || !onUndo}
	                        className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
	                    >
	                        Undo
	                    </button>
	                    <button
	                        data-testid="btn-redo"
	                        type="button"
	                        onClick={onRedo}
	                        disabled={mutationDisabled || !onRedo}
	                        className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Redo
                    </button>
                </div>

                <div className="flex items-center space-x-2">
                    <span
                        className="inline-flex"
                        title={
                            mutationDisabled || !selectionActive
                                ? 'Select a note or rest to split the bar.'
                                : undefined
                        }
                    >
                        <button
                            data-testid="btn-new-line"
                            type="button"
                            onClick={onToggleLineBreak}
                            disabled={mutationDisabled || !selectionActive || !onToggleLineBreak}
                            className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            New Line
                        </button>
                    </span>
                    <span
                        className="inline-flex"
                        title={
                            mutationDisabled || !selectionActive
                                ? 'Select a note or rest to split the bar.'
                                : undefined
                        }
                    >
                        <button
                            data-testid="btn-new-page"
                            type="button"
                            onClick={onTogglePageBreak}
                            disabled={mutationDisabled || !selectionActive || !onTogglePageBreak}
                            className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            New Page
                        </button>
                    </span>
                </div>

                <div className="flex items-center space-x-2">
	                    <button
	                        data-testid="btn-add-note-top"
	                        type="button"
	                        onClick={onAddNoteFromRest}
	                        disabled={mutationDisabled || !selectionActive || !onAddNoteFromRest}
	                        className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
	                    >
	                        Add Note
	                    </button>
	                    <button
	                        data-testid="btn-pitch-down"
	                        type="button"
	                        onClick={onPitchDown}
	                        disabled={mutationDisabled || !onPitchDown || !selectionActive}
	                        className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
	                    >
	                        Pitch ↓
	                    </button>
	                    <button
	                        data-testid="btn-pitch-up"
	                        type="button"
	                        onClick={onPitchUp}
	                        disabled={mutationDisabled || !onPitchUp || !selectionActive}
	                        className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
	                    >
	                        Pitch ↑
	                    </button>
                        <button
                            data-testid="btn-transpose--12"
                            type="button"
                            onClick={() => onTranspose?.(-12)}
                            disabled={mutationDisabled || !onTranspose}
                            className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Octave ↓
                        </button>
                        <button
                            data-testid="btn-transpose-12"
                            type="button"
                            onClick={() => onTranspose?.(12)}
                            disabled={mutationDisabled || !onTranspose}
                            className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
	                        Octave ↑
	                    </button>
	                </div>

                    <ToolbarDropdown
                        label="Accidental"
                        disabled={mutationDisabled || !selectionActive || !onSetAccidental}
                        testId="dropdown-accidental"
                    >
                        {accidentalOptions.map(opt => (
                            <button
                                key={opt.label}
                                data-testid={`btn-acc-${opt.value}`}
                                type="button"
                                onClick={() => onSetAccidental?.(opt.value)}
                                disabled={mutationDisabled || !selectionActive || !onSetAccidental}
                                className={dropdownItemClass}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </ToolbarDropdown>

	                <div className="flex items-center space-x-2">
	                    <button
	                        data-testid="btn-duration-shorter"
	                        type="button"
	                        onClick={onDurationShorter}
	                        disabled={mutationDisabled || !onDurationShorter || !selectionActive}
	                        className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
	                    >
	                        Shorter
	                    </button>
	                    <button
	                        data-testid="btn-duration-longer"
	                        type="button"
	                        onClick={onDurationLonger}
	                        disabled={mutationDisabled || !onDurationLonger || !selectionActive}
	                        className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
	                    >
	                        Longer
	                    </button>
	                </div>
	            </div>

	            <ToolbarDropdown
                    label="Export"
                    disabled={!exportsEnabled}
                    testId="dropdown-export"
                >
                    <button
                        data-testid="btn-export-svg"
                        type="button"
                        onClick={onExportSvg}
                        disabled={!exportsEnabled || !onExportSvg}
                        className={dropdownItemClass}
                    >
                        SVG
                    </button>
                    <button
                        data-testid="btn-export-pdf"
                        type="button"
                        onClick={onExportPdf}
                        disabled={!exportsEnabled || !onExportPdf}
                        className={dropdownItemClass}
                    >
                        PDF
                    </button>
                    <button
                        data-testid="btn-export-png"
                        type="button"
                        onClick={onExportPng}
                        disabled={!exportsEnabled || !onExportPng || !pngAvailable}
                        className={dropdownItemClass}
                    >
                        PNG
                    </button>
                    <button
                        data-testid="btn-export-mxl"
                        type="button"
                        onClick={onExportMxl}
                        disabled={!exportsEnabled || !onExportMxl}
                        className={dropdownItemClass}
                    >
                        MXL
                    </button>
                    <button
                        data-testid="btn-export-mscz"
                        type="button"
                        onClick={onExportMscz}
                        disabled={!exportsEnabled || !onExportMscz}
                        className={dropdownItemClass}
                    >
                        MSCZ
                    </button>
                    <button
                        data-testid="btn-export-midi"
                        type="button"
                        onClick={onExportMidi}
                        disabled={!exportsEnabled || !onExportMidi}
                        className={dropdownItemClass}
                    >
                        MIDI
                    </button>
                    <button
                        data-testid="btn-export-audio"
                        type="button"
                        onClick={onExportAudio}
                        disabled={!exportsEnabled || !onExportAudio || !audioAvailable || audioBusy}
                        className={dropdownItemClass}
                    >
                        {audioBusy ? 'Exporting…' : 'WAV'}
                    </button>
                </ToolbarDropdown>

	            <div className="flex items-center space-x-2 text-sm">
	                <button
	                    data-testid="btn-zoom-out"
	                    type="button"
	                    onClick={onZoomOut}
	                    className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50"
	                >
	                    -
	                </button>
	                <span className="w-16 text-center">{(zoomLevel * 100).toFixed(0)}%</span>
	                <button
	                    data-testid="btn-zoom-in"
	                    onClick={onZoomIn}
	                    className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50"
	                >
	                    +
	                </button>
	            </div>

	            <div className="flex items-center space-x-2 text-sm">
	                <span className="text-gray-600">Playback:</span>
	                <button
	                    data-testid="btn-play"
	                    type="button"
	                    onClick={onPlayAudio}
	                    disabled={!audioAvailable || !onPlayAudio || audioBusy}
	                    className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
	                >
	                    {audioBusy ? 'Working…' : isPlaying ? 'Replay' : 'Play'}
	                </button>
	                <button
	                    data-testid="btn-stop"
	                    type="button"
	                    onClick={onStopAudio}
	                    disabled={!audioAvailable || !onStopAudio || audioBusy}
	                    className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
	                >
	                    Stop
	                </button>
	            </div>

                <ToolbarDropdown
                    label="Instruments"
                    disabled={instrumentsDisabled}
                    testId="dropdown-instruments"
                >
                    <div className={dropdownLabelClass}>Add</div>
                    {hasInstrumentTemplates ? (
                        <>
                            <select
                                value={instrumentIdToAdd}
                                onChange={(event) => setSelectedInstrumentId(event.target.value)}
                                disabled={mutationDisabled}
                                className="w-full px-2 py-1 border border-gray-300 rounded bg-white text-sm"
                            >
                                {instrumentGroups.map(group => (
                                    <optgroup key={group.id} label={group.name}>
                                        {group.instruments.map(instrument => (
                                            <option key={instrument.id} value={instrument.id}>
                                                {instrument.name}
                                            </option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>
                            <button
                                type="button"
                                onClick={() => {
                                    if (instrumentIdToAdd && onAddPart) {
                                        onAddPart(instrumentIdToAdd);
                                    }
                                }}
                                disabled={!canAddInstrument || !instrumentIdToAdd}
                                className={dropdownItemClass}
                            >
                                Add Instrument
                            </button>
                        </>
                    ) : (
                        <div className="px-2 py-1 text-xs text-gray-500">
                            Instrument list unavailable.
                        </div>
                    )}

                    <div className={dropdownLabelClass}>On Score</div>
                    {parts.length ? (
                        parts.map(part => (
                            <div key={`${part.index}-${part.instrumentId}`} className="flex items-center gap-2">
                                <span className="flex-1 text-sm truncate">
                                    {part.name || part.instrumentName || part.instrumentId}
                                </span>
                                <button
                                    data-testid={`btn-part-visible-${part.index}`}
                                    type="button"
                                    onClick={() => onTogglePartVisible?.(part.index, !part.isVisible)}
                                    disabled={!canToggleVisibility}
                                    className={dropdownItemClass}
                                >
                                    {part.isVisible ? 'Hide' : 'Show'}
                                </button>
                                <button
                                    data-testid={`btn-part-remove-${part.index}`}
                                    type="button"
                                    onClick={() => {
                                        if (!onRemovePart) return;
                                        const label = part.name || part.instrumentName || 'this part';
                                        if (typeof window === 'undefined' || window.confirm(`Remove ${label}?`)) {
                                            onRemovePart(part.index);
                                        }
                                    }}
                                    disabled={!canRemovePart}
                                    className={dropdownItemClass}
                                >
                                    Remove
                                </button>
                            </div>
                        ))
                    ) : (
                        <div className="px-2 py-1 text-xs text-gray-500">No parts loaded.</div>
                    )}
                </ToolbarDropdown>

		            <ToolbarDropdown
                        label="Time Signature"
                        disabled={mutationDisabled}
                        testId="dropdown-signature"
                    >
                        {signatureOptions.map(opt => {
                            const handler = resolveTimeSigHandler(opt);
                            return (
                                <button
                                    key={opt.label}
                                    data-testid={`btn-timesig-${opt.numerator}-${opt.denominator}`}
                                    type="button"
                                    onClick={handler}
                                    disabled={mutationDisabled || !handler}
                                    className={dropdownItemClass}
                                >
                                    {opt.label}
                                </button>
                            );
                        })}
                    </ToolbarDropdown>

                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-600">Custom Time:</span>
                        <input
                            data-testid="input-timesig-numerator"
                            type="number"
                            min={1}
                            value={customTimeSigNumerator}
                            onChange={(event) => setCustomTimeSigNumerator(event.target.value)}
                            disabled={!canSetCustomTimeSig}
                            className="w-16 px-2 py-1 border border-gray-300 rounded bg-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                        <span className="text-gray-500">/</span>
                        <input
                            data-testid="input-timesig-denominator"
                            type="number"
                            min={1}
                            value={customTimeSigDenominator}
                            onChange={(event) => setCustomTimeSigDenominator(event.target.value)}
                            disabled={!canSetCustomTimeSig}
                            className="w-16 px-2 py-1 border border-gray-300 rounded bg-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                        <button
                            data-testid="btn-timesig-custom"
                            type="button"
                            onClick={() => {
                                if (onSetTimeSignature && customTimeSigValid) {
                                    onSetTimeSignature(parsedCustomNumerator, parsedCustomDenominator);
                                }
                            }}
                            disabled={!canSetCustomTimeSig || !customTimeSigValid}
                            className="px-2 py-1 text-sm border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Apply
                        </button>
                    </div>

		            <ToolbarDropdown
                        label="Key"
                        disabled={mutationDisabled || !onSetKeySignature}
                        testId="dropdown-key"
                    >
                        <div className={dropdownLabelClass}>Major</div>
                        {keySignatureButtonOptions.map(opt => (
                            <button
                                key={opt.fifths}
                                data-testid={`btn-keysig-${opt.fifths}`}
                                type="button"
                                onClick={() => onSetKeySignature?.(opt.fifths)}
                                disabled={mutationDisabled || !onSetKeySignature}
                                className={dropdownItemClass}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </ToolbarDropdown>

		            <ToolbarDropdown
                        label="Clef"
                        disabled={mutationDisabled || !onSetClef}
                        testId="dropdown-clef"
                    >
                        <div className={dropdownLabelClass}>Common</div>
                        {clefButtonOptions.map(opt => (
                            <button
                                key={opt.value}
                                data-testid={`btn-clef-${opt.value}`}
                                type="button"
                                onClick={() => onSetClef?.(opt.value)}
                                disabled={mutationDisabled || !onSetClef}
                                className={dropdownItemClass}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </ToolbarDropdown>

            <ToolbarDropdown
                label="Repeats/Barlines"
                disabled={mutationDisabled || !selectionActive}
                testId="dropdown-repeats"
            >
                <div className={dropdownLabelClass}>Repeats</div>
                <button
                    data-testid="btn-repeat-start"
                    type="button"
                    onClick={onToggleRepeatStart}
                    disabled={mutationDisabled || !selectionActive || !onToggleRepeatStart}
                    className={dropdownItemClass}
                >
                    Start Repeat
                </button>
                <button
                    data-testid="btn-repeat-end"
                    type="button"
                    onClick={onToggleRepeatEnd}
                    disabled={mutationDisabled || !selectionActive || !onToggleRepeatEnd}
                    className={dropdownItemClass}
                >
                    End Repeat
                </button>
                <div className={dropdownLabelClass}>Repeat Count</div>
                {repeatCountOptions.map(opt => (
                    <button
                        key={opt.count}
                        data-testid={`btn-repeat-count-${opt.count}`}
                        type="button"
                        onClick={() => onSetRepeatCount?.(opt.count)}
                        disabled={mutationDisabled || !selectionActive || !onSetRepeatCount}
                        className={dropdownItemClass}
                    >
                        {opt.label}
                    </button>
                ))}
                <div className={dropdownLabelClass}>Barlines</div>
                {barlineOptions.map(opt => (
                    <button
                        key={opt.value}
                        data-testid={`btn-barline-${opt.value}`}
                        type="button"
                        onClick={() => onSetBarLineType?.(opt.value)}
                        disabled={mutationDisabled || !selectionActive || !onSetBarLineType}
                        className={dropdownItemClass}
                    >
                        {opt.label}
                    </button>
                ))}
                <div className={dropdownLabelClass}>Voltas</div>
                {voltaOptions.map(opt => (
                    <button
                        key={opt.ending}
                        data-testid={`btn-volta-${opt.ending}`}
                        type="button"
                        onClick={() => onAddVolta?.(opt.ending)}
                        disabled={mutationDisabled || !selectionActive || !onAddVolta}
                        className={dropdownItemClass}
                    >
                        {opt.label}
                    </button>
                ))}
            </ToolbarDropdown>

            <ToolbarDropdown
                label="Rhythm/Voice"
                disabled={mutationDisabled}
                testId="dropdown-rhythm-voice"
            >
                <div className={dropdownLabelClass}>Notes</div>
                <button
                    data-testid="btn-add-note-dropdown"
                    type="button"
                    onClick={onAddNoteFromRest}
                    disabled={mutationDisabled || !selectionActive || !onAddNoteFromRest}
                    className={dropdownItemClass}
                >
                    Add Note
                </button>
                <div className={dropdownLabelClass}>Grace Notes</div>
                {graceNoteOptions.map(opt => (
                    <button
                        key={opt.value}
                        data-testid={opt.testId}
                        type="button"
                        onClick={() => onAddGraceNote?.(opt.value)}
                        disabled={mutationDisabled || !selectionActive || !onAddGraceNote}
                        className={dropdownItemClass}
                    >
                        {opt.label}
                    </button>
                ))}
                <div className={dropdownLabelClass}>Rhythm</div>
                <button
                    data-testid="btn-dot"
                    type="button"
                    onClick={onToggleDot}
                    disabled={mutationDisabled || !selectionActive || !onToggleDot}
                    className={dropdownItemClass}
                >
                    Dot
                </button>
                <button
                    data-testid="btn-double-dot"
                    type="button"
                    onClick={onToggleDoubleDot}
                    disabled={mutationDisabled || !selectionActive || !onToggleDoubleDot}
                    className={dropdownItemClass}
                >
                    Double Dot
                </button>
                <div className={dropdownLabelClass}>Tuplets</div>
                {tupletOptions.map(opt => (
                    <button
                        key={opt.count}
                        data-testid={`btn-tuplet-${opt.count}`}
                        type="button"
                        onClick={() => onAddTuplet?.(opt.count)}
                        disabled={mutationDisabled || !selectionActive || !onAddTuplet}
                        className={dropdownItemClass}
                    >
                        {opt.label}
                    </button>
                ))}
                <div className={dropdownLabelClass}>Voice</div>
                {[1, 2, 3, 4].map(v => (
                    <button
                        key={v}
                        data-testid={`btn-voice-${v}`}
                        type="button"
                        onClick={() => onSetVoice?.(v - 1)}
                        disabled={mutationDisabled || !onSetVoice}
                        className={dropdownItemClass}
                    >
                        Voice {v}
                    </button>
                ))}
            </ToolbarDropdown>

            <ToolbarDropdown
                label="Slur/Tie"
                disabled={mutationDisabled || !selectionActive}
                testId="dropdown-slur-tie"
            >
                <button
                    data-testid="btn-slur"
                    type="button"
                    onClick={onAddSlur}
                    disabled={mutationDisabled || !selectionActive || !onAddSlur}
                    className={dropdownItemClass}
                >
                    Slur
                </button>
                <button
                    data-testid="btn-tie"
                    type="button"
                    onClick={onAddTie}
                    disabled={mutationDisabled || !selectionActive || !onAddTie}
                    className={dropdownItemClass}
                >
                    Tie
                </button>
            </ToolbarDropdown>

            <ToolbarDropdown
                label="Markings"
                disabled={mutationDisabled}
                testId="dropdown-markings"
            >
                <div className={dropdownLabelClass}>Dynamics</div>
                {dynamicOptions.map(opt => (
                    <button
                        key={opt.label}
                        data-testid={`btn-dynamic-${opt.value}`}
                        type="button"
                        onClick={() => onAddDynamic?.(opt.value)}
                        disabled={mutationDisabled || !selectionActive || !onAddDynamic}
                        className={dropdownItemClass}
                    >
                        {opt.label}
                    </button>
                ))}
                <div className={dropdownLabelClass}>Text</div>
                <button
                    data-testid="btn-rehearsal"
                    type="button"
                    onClick={onAddRehearsalMark}
                    disabled={mutationDisabled || !selectionActive || !onAddRehearsalMark}
                    className={dropdownItemClass}
                >
                    Rehearsal
                </button>
                <button
                    data-testid="btn-tempo-120"
                    type="button"
                    onClick={() => onAddTempoText?.(120)}
                    disabled={mutationDisabled || !onAddTempoText}
                    className={dropdownItemClass}
                >
                    Tempo 120
                </button>
            </ToolbarDropdown>

            <ToolbarDropdown
                label="Text"
                disabled={mutationDisabled || !selectionActive}
                testId="dropdown-text"
            >
                <button
                    data-testid="btn-text-staff"
                    type="button"
                    onClick={onAddStaffText}
                    disabled={mutationDisabled || !selectionActive || !onAddStaffText}
                    className={dropdownItemClass}
                >
                    Staff Text
                </button>
                <button
                    data-testid="btn-text-system"
                    type="button"
                    onClick={onAddSystemText}
                    disabled={mutationDisabled || !selectionActive || !onAddSystemText}
                    className={dropdownItemClass}
                >
                    System Text
                </button>
                <button
                    data-testid="btn-text-expression"
                    type="button"
                    onClick={onAddExpressionText}
                    disabled={mutationDisabled || !selectionActive || !onAddExpressionText}
                    className={dropdownItemClass}
                >
                    Expression Text
                </button>
                <button
                    data-testid="btn-text-lyrics"
                    type="button"
                    onClick={onAddLyricText}
                    disabled={mutationDisabled || !selectionActive || !onAddLyricText}
                    className={dropdownItemClass}
                >
                    Lyrics
                </button>
            </ToolbarDropdown>

            <ToolbarDropdown
                label="Articulations"
                disabled={mutationDisabled || !selectionActive}
                testId="dropdown-articulations"
            >
                {articulationOptions.map(opt => (
                    <button
                        key={opt.symbol}
                        data-testid={`btn-artic-${opt.symbol}`}
                        type="button"
                        onClick={() => onAddArticulation?.(opt.symbol)}
                        disabled={mutationDisabled || !selectionActive || !onAddArticulation}
                        className={dropdownItemClass}
                    >
                        {opt.label}
                    </button>
                ))}
            </ToolbarDropdown>

            <ToolbarDropdown
                label="Shortcuts"
                testId="dropdown-shortcuts"
            >
                <div className={dropdownTextClass}>Delete: Delete / Backspace</div>
                <div className={dropdownTextClass}>Undo: Ctrl/Cmd + Z</div>
                <div className={dropdownTextClass}>Redo: Ctrl + Y, Cmd + Shift + Z</div>
                <div className={dropdownTextClass}>Pitch: Arrow Up/Down</div>
                <div className={dropdownTextClass}>Octave: Ctrl/Cmd + Arrow Up/Down</div>
                <div className={dropdownTextClass}>Copy: Ctrl/Cmd + C</div>
                <div className={dropdownTextClass}>Paste: Ctrl/Cmd + V</div>
            </ToolbarDropdown>
        </div>
    );
};
