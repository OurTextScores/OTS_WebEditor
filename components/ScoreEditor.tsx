'use client';

import React, { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { loadWebMscore, Score, InputFileFormat } from '../lib/webmscore-loader';
import {
    deleteCheckpoint,
    getCheckpoint,
    isIndexedDbAvailable,
    listCheckpoints,
    listScoreSummaries,
    saveCheckpoint,
    type CheckpointSummary,
    type ScoreSummary,
} from '../lib/checkpoints';
import { CodeMirrorEditor } from './CodeMirrorEditor';
import { Toolbar, type MeasureInsertTarget } from './Toolbar';

type SelectionBox = {
    index: number | null;
    page: number;
    x: number;
    y: number;
    w: number;
    h: number;
    centerX: number;
    centerY: number;
    classes: string;
};

type SelectionFallback = {
    index: number | null;
    point: { page: number; x: number; y: number };
} | null;

type MutationMethods = Pick<
    Score,
    | 'selectElementAtPoint'
    | 'selectElementAtPointWithMode'
    | 'selectNextChord'
    | 'selectPrevChord'
    | 'getSelectionBoundingBox'
    | 'clearSelection'
    | 'selectionMimeType'
    | 'selectionMimeData'
    | 'pasteSelection'
    | 'deleteSelection'
    | 'pitchUp'
    | 'pitchDown'
    | 'transpose'
    | 'setAccidental'
    | 'doubleDuration'
    | 'halfDuration'
    | 'toggleDot'
    | 'toggleDoubleDot'
    | 'setNoteEntryMode'
    | 'setNoteEntryMethod'
    | 'setInputStateFromSelection'
    | 'setInputAccidentalType'
    | 'setInputDurationType'
    | 'toggleInputDot'
    | 'addPitchByStep'
    | 'enterRest'
    | 'setDurationType'
    | 'toggleLineBreak'
    | 'togglePageBreak'
    | 'setVoice'
    | 'changeSelectedElementsVoice'
    | 'addDynamic'
    | 'addHairpin'
    | 'addPedal'
    | 'addSostenutoPedal'
    | 'addUnaCorda'
    | 'splitPedal'
    | 'addTempoText'
    | 'addArticulation'
    | 'addSlur'
    | 'addTie'
    | 'addGraceNote'
    | 'addTuplet'
    | 'addStaffText'
    | 'addSystemText'
    | 'addExpressionText'
    | 'addLyricText'
    | 'addHarmonyText'
    | 'addFingeringText'
    | 'addLeftHandGuitarFingeringText'
    | 'addRightHandGuitarFingeringText'
    | 'addStringNumberText'
    | 'addInstrumentChangeText'
    | 'addStickingText'
    | 'addFiguredBassText'
    | 'setTitleText'
    | 'setSubtitleText'
    | 'setComposerText'
    | 'setLyricistText'
    | 'setSelectedText'
    | 'appendPart'
    | 'appendPartByMusicXmlId'
    | 'removePart'
    | 'setPartVisible'
    | 'addNoteFromRest'
    | 'undo'
    | 'redo'
    | 'relayout'
    | 'setTimeSignature'
    | 'setClef'
    | 'toggleRepeatStart'
    | 'toggleRepeatEnd'
    | 'setRepeatCount'
    | 'setBarLineType'
    | 'addVolta'
    | 'insertMeasures'
    | 'removeTrailingEmptyMeasures'
>;

type HarmonyVariant = 0 | 1 | 2;

type MusicXmlPatchOp = {
    op: 'replace' | 'setText' | 'setAttr' | 'insertBefore' | 'insertAfter' | 'delete';
    path: string;
    value?: string;
    name?: string;
};

type MusicXmlPatch = {
    format: 'musicxml-patch@1';
    ops: MusicXmlPatchOp[];
};

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

const measureInsertTargetMap: Record<MeasureInsertTarget, number> = {
    beginning: 2,
    'after-selection': 0,
    end: 3,
};

const TEXT_ELEMENT_CLASS_NAMES = [
    'Text',
    'RehearsalMark',
    'StaffText',
    'SystemText',
    'ExpressionText',
    'LyricText',
    'HarmonyText',
    'FingeringText',
    'LeftHandGuitarFingeringText',
    'RightHandGuitarFingeringText',
    'StringNumberText',
    'InstrumentChangeText',
    'StickingText',
    'FiguredBassText',
    'TempoText',
];
const TEXT_ELEMENT_SELECTOR = TEXT_ELEMENT_CLASS_NAMES.map(cls => `.${cls}`).join(', ');
const ELEMENT_SELECTION_SELECTOR = ['.Note', '.Rest', '.Chord', '.LayoutBreak', '.Pedal', '.PedalSegment', TEXT_ELEMENT_SELECTOR]
    .filter(Boolean)
    .join(', ');
const ELEMENT_SELECTION_CLASSES = new Set([
    'Note',
    'Rest',
    'Chord',
    'LayoutBreak',
    'Pedal',
    'PedalSegment',
    ...TEXT_ELEMENT_CLASS_NAMES,
]);
const TEXT_ELEMENT_CLASS_SET = new Set(TEXT_ELEMENT_CLASS_NAMES);

const hasSelectableClass = (classAttr: string | null | undefined) => {
    if (!classAttr) {
        return false;
    }
    return classAttr.split(/\s+/).some(cls => ELEMENT_SELECTION_CLASSES.has(cls));
};

const hasTextElementClass = (classAttr: string | null | undefined) => {
    if (!classAttr) {
        return false;
    }
    return classAttr.split(/\s+/).some(cls => TEXT_ELEMENT_CLASS_SET.has(cls));
};

const isSvgTextElement = (element: Element | null) => {
    if (!element) {
        return false;
    }
    if (hasTextElementClass(element.getAttribute('class'))) {
        return true;
    }
    const tagName = element.tagName?.toLowerCase();
    if (tagName === 'text' || tagName === 'tspan') {
        return true;
    }
    return Boolean(element.closest?.('text'));
};

const normalizeElementClasses = (element: Element, classAttr: string) => {
    if (!isSvgTextElement(element)) {
        return classAttr;
    }
    const tokens = classAttr.split(/\s+/).filter(Boolean);
    if (tokens.includes('Text')) {
        return classAttr;
    }
    return [...tokens, 'Text'].join(' ').trim() || 'Text';
};

const resolveTextElement = (element: Element) => {
    const tagName = element.tagName?.toLowerCase();
    if (tagName === 'tspan') {
        return element.closest?.('text') ?? element;
    }
    return element;
};

const hasMutationApi = (score: Score | null): score is Score & MutationMethods => {
    if (!score) {
        return false;
    }

    const candidate = score as Record<string, unknown>;
    return Boolean(
        candidate.deleteSelection
        || candidate.undo
        || candidate.redo
        || candidate.pitchUp
        || candidate.pitchDown
        || candidate.doubleDuration
        || candidate.halfDuration
    );
};

export default function ScoreEditor() {
    const searchParams = useSearchParams();
    const [score, setScore] = useState<Score | null>(null);
    const scoreRef = useRef<Score | null>(null);
    const [zoom, setZoom] = useState(1.0);
    const containerRef = useRef<HTMLDivElement>(null);
    const scoreWrapperRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const MIN_ZOOM = 0.5;
    const MAX_ZOOM = 3.0;
    const clampZoom = (value: number) => Math.min(Math.max(value, MIN_ZOOM), MAX_ZOOM);
    const [loading, setLoading] = useState(false);
    const [selectedElement, setSelectedElement] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
    const [selectedPoint, setSelectedPoint] = useState<{ page: number, x: number, y: number } | null>(null);
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [selectionBoxes, setSelectionBoxes] = useState<SelectionBox[]>([]);
    const [overlaySuppressed, setOverlaySuppressed] = useState(false);
    const [selectedElementClasses, setSelectedElementClasses] = useState<string>('');
    const [selectedTextValue, setSelectedTextValue] = useState('');
    const [selectedLayoutBreakSubtype, setSelectedLayoutBreakSubtype] = useState<'line'|'page'|null>(null);
    const [textEditorPosition, setTextEditorPosition] = useState<{ x: number; y: number } | null>(null);
    const [dragSelectionRect, setDragSelectionRect] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
    const ignoreNextClickRef = useRef(false);
    const dragKindRef = useRef<'pointer' | 'mouse' | null>(null);
    const dragPointerIdRef = useRef<number | null>(null);
    const dragStartClientRef = useRef<{ x: number, y: number } | null>(null);
    const dragStartScoreRef = useRef<{ x: number, y: number } | null>(null);
    const dragAdditiveRef = useRef(false);
    const dragActiveRef = useRef(false);
    const sawPointerMoveRef = useRef(false);
    const blockOverlayRefreshRef = useRef(false);
    const selectionOverlayGenerationRef = useRef(0);
    const [mutationEnabled, setMutationEnabled] = useState(false);
    const [soundFontLoaded, setSoundFontLoaded] = useState(false);
    const [triedSoundFont, setTriedSoundFont] = useState(false);
    const [scoreTitle, setScoreTitle] = useState('');
    const [scoreSubtitle, setScoreSubtitle] = useState('');
    const [scoreComposer, setScoreComposer] = useState('');
    const [scoreLyricist, setScoreLyricist] = useState('');
    const [scoreParts, setScoreParts] = useState<PartSummary[]>([]);
    const [instrumentGroups, setInstrumentGroups] = useState<InstrumentTemplateGroup[]>([]);
    const [checkpoints, setCheckpoints] = useState<CheckpointSummary[]>([]);
    const [checkpointLabel, setCheckpointLabel] = useState('');
    const [checkpointBusy, setCheckpointBusy] = useState(false);
    const [checkpointLoading, setCheckpointLoading] = useState(false);
    const [checkpointError, setCheckpointError] = useState<string | null>(null);
    const [compareView, setCompareView] = useState<{ title: string; currentXml: string; checkpointXml: string } | null>(null);
    const [checkpointsCollapsed, setCheckpointsCollapsed] = useState(false);
    const [leftSidebarTab, setLeftSidebarTab] = useState<'checkpoints' | 'scores'>('checkpoints');
    const [scoreSummaries, setScoreSummaries] = useState<ScoreSummary[]>([]);
    const [scoreSummariesLoading, setScoreSummariesLoading] = useState(false);
    const [scoreSummariesError, setScoreSummariesError] = useState<string | null>(null);
    const [scoreDirtySinceCheckpoint, setScoreDirtySinceCheckpoint] = useState(false);
    const [scoreDirtySinceXml, setScoreDirtySinceXml] = useState(false);
    const [xmlSidebarMode, setXmlSidebarMode] = useState<'closed' | 'open' | 'full'>('closed');
    const [xmlSidebarTab, setXmlSidebarTab] = useState<'xml' | 'assistant'>('xml');
    const [xmlText, setXmlText] = useState('');
    const [xmlDirty, setXmlDirty] = useState(false);
    const [xmlLoading, setXmlLoading] = useState(false);
    const [xmlError, setXmlError] = useState<string | null>(null);
    const [aiModel, setAiModel] = useState('');
    const [aiApiKey, setAiApiKey] = useState('');
    const [aiPrompt, setAiPrompt] = useState('');
    const [aiIncludeXml, setAiIncludeXml] = useState(true);
    const [aiMaxTokensMode, setAiMaxTokensMode] = useState<'auto' | 'custom'>('auto');
    const [aiMaxTokens, setAiMaxTokens] = useState(4096);
    const [aiOutput, setAiOutput] = useState('');
    const [aiPatch, setAiPatch] = useState<MusicXmlPatch | null>(null);
    const [aiPatchError, setAiPatchError] = useState<string | null>(null);
    const [aiPatchedXml, setAiPatchedXml] = useState('');
    const [aiBusy, setAiBusy] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);
    const [aiModels, setAiModels] = useState<string[]>([]);
    const [aiModelsLoading, setAiModelsLoading] = useState(false);
    const [aiModelsError, setAiModelsError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(0);
    const [pageCount, setPageCount] = useState(1);
    const [scoreId, setScoreId] = useState('');
    const [newScoreDialogOpen, setNewScoreDialogOpen] = useState(false);
    const [newScoreTitle, setNewScoreTitle] = useState('');
    const [newScoreComposer, setNewScoreComposer] = useState('');
    const [newScoreInstrumentIds, setNewScoreInstrumentIds] = useState<string[]>([]);
    const [newScoreInstrumentToAdd, setNewScoreInstrumentToAdd] = useState('');
    const [newScoreMeasures, setNewScoreMeasures] = useState(4);
    const [newScoreKeyFifths, setNewScoreKeyFifths] = useState(0);
    const [newScoreTimeNumerator, setNewScoreTimeNumerator] = useState(4);
    const [newScoreTimeDenominator, setNewScoreTimeDenominator] = useState(4);
    const [instrumentClefMap, setInstrumentClefMap] = useState<Record<string, { staves: number; clefs: { staff: number; clef: string }[] }> | null>(null);
    const [instrumentClefMapError, setInstrumentClefMapError] = useState<string | null>(null);
    const [instrumentFallbackGroups, setInstrumentFallbackGroups] = useState<InstrumentTemplateGroup[]>([]);
    const [instrumentFallbackError, setInstrumentFallbackError] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [audioBusy, setAudioBusy] = useState(false);
    const audioUrlRef = useRef<string | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const audioSourcesRef = useRef<AudioBufferSourceNode[]>([]);
    const streamIteratorRef = useRef<((cancel?: boolean) => Promise<any>) | null>(null);
    const clipboardRef = useRef<{ mimeType: string; data: Uint8Array } | null>(null);
    const currentPageRef = useRef(currentPage);
    const aiKeyStorageKey = 'ots_openai_api_key';
    const autoFitPendingRef = useRef(true);

    useEffect(() => {
        scoreRef.current = score;
    }, [score]);

    useEffect(() => {
        currentPageRef.current = currentPage;
    }, [currentPage]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        const cached = window.localStorage.getItem(aiKeyStorageKey);
        if (cached) {
            setAiApiKey(cached);
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        if (aiApiKey.trim()) {
            window.localStorage.setItem(aiKeyStorageKey, aiApiKey);
        } else {
            window.localStorage.removeItem(aiKeyStorageKey);
        }
    }, [aiApiKey]);

    useEffect(() => {
        let canceled = false;
        if (!score || !selectedElementClasses.includes('LayoutBreak')) {
            setSelectedLayoutBreakSubtype(null);
            return;
        }

        const updateSubtype = async () => {
            const data = await score.selectionMimeData?.();
            if (canceled) {
                return;
            }
            if (!data) {
                setSelectedLayoutBreakSubtype(null);
                return;
            }
            let text: string;
            try {
                text = new TextDecoder().decode(data);
            } catch (decodeErr) {
                console.warn('Failed to decode selection MIME data', decodeErr);
                setSelectedLayoutBreakSubtype(null);
                return;
            }

            const match = text.match(/<subtype>([^<]+)<\/subtype>/);
            if (match && (match[1] === 'line' || match[1] === 'page')) {
                setSelectedLayoutBreakSubtype(match[1] as 'line' | 'page');
            } else {
                setSelectedLayoutBreakSubtype(null);
            }
        };

        updateSubtype();
        return () => {
            canceled = true;
        };
    }, [score, selectedElementClasses]);

    useEffect(() => {
        const shouldLoadText = hasTextElementClass(selectedElementClasses) || Boolean(textEditorPosition);
        if (!score || !shouldLoadText) {
            setSelectedTextValue('');
            return;
        }

        let canceled = false;
        const decoder = new TextDecoder();
        const parser = typeof DOMParser !== 'undefined' ? new DOMParser() : null;

        const updateText = async () => {
            if (!score.selectionMimeData || !parser) {
                setSelectedTextValue('');
                return;
            }
            const data = await score.selectionMimeData?.();
            if (canceled) {
                return;
            }
            if (!data) {
                setSelectedTextValue('');
                return;
            }
            let decoded: string;
            try {
                decoded = decoder.decode(data);
            } catch (decodeErr) {
                console.warn('Failed to decode text selection MIME data', decodeErr);
                setSelectedTextValue('');
                return;
            }
            const doc = parser.parseFromString(decoded, 'application/xml');
            const textNode = doc.querySelector('text');
            const content = textNode?.textContent ?? '';
            setSelectedTextValue(content.trim());
        };

        updateText();
        return () => {
            canceled = true;
        };
    }, [score, selectedElementClasses, textEditorPosition]);

    const formatBytes = (bytes: number) => {
        if (!Number.isFinite(bytes)) {
            return '';
        }
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex += 1;
        }
        const precision = size >= 10 || unitIndex === 0 ? 0 : 1;
        return `${size.toFixed(precision)} ${units[unitIndex]}`;
    };

    const formatTimestamp = (timestamp: number) => new Date(timestamp).toLocaleString();

    const buildCheckpointTitle = (label: string, fallbackTitle: string) => {
        const trimmed = label.trim();
        if (trimmed) {
            return trimmed;
        }
        const base = fallbackTitle.trim() || 'Untitled Score';
        return `${base} ${formatTimestamp(Date.now())}`;
    };

    const toSafeFilename = (name: string) => {
        const cleaned = name.replace(/[\\/:*?"<>|]+/g, '_').trim();
        return cleaned.length > 0 ? cleaned.slice(0, 64) : 'checkpoint';
    };

    const updateUrlScoreId = (nextScoreId: string) => {
        if (typeof window === 'undefined') {
            return;
        }
        const url = new URL(window.location.href);
        url.searchParams.set('scoreId', nextScoreId);
        url.searchParams.delete('score');
        window.history.replaceState({}, '', url.toString());
    };

    const ensureScoreId = (fallbackPrefix: string) => {
        if (scoreId) {
            return scoreId;
        }
        const generated = `${fallbackPrefix}:${crypto.randomUUID()}`;
        setScoreId(generated);
        updateUrlScoreId(generated);
        return generated;
    };

    const summarizeScoreId = (id: string) => {
        if (id.startsWith('url:')) {
            const url = id.slice(4);
            const name = url.split('/').pop() || url;
            return { title: name, detail: url, type: 'url' as const };
        }
        if (id.startsWith('file:')) {
            const parts = id.slice(5).split(':');
            const name = parts[0] || 'File import';
            return { title: name, detail: 'File import', type: 'file' as const };
        }
        if (id.startsWith('new:')) {
            return { title: 'New score', detail: id.slice(4), type: 'new' as const };
        }
        if (id === 'legacy') {
            return { title: 'Legacy checkpoints', detail: 'Unscoped checkpoints', type: 'legacy' as const };
        }
        return { title: id, detail: '', type: 'other' as const };
    };

    const escapeXml = (value: string) => value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

    const newScoreInstrumentGroups = instrumentGroups.length > 0 ? instrumentGroups : instrumentFallbackGroups;

    const newScoreInstrumentOptions = useMemo(() => {
        if (newScoreInstrumentGroups.length) {
            return newScoreInstrumentGroups.flatMap((group) => group.instruments.map((instrument) => ({
                id: instrument.id,
                name: instrument.name,
                label: group.name ? `${instrument.name} (${group.name})` : instrument.name,
            })));
        }
        return [
            { id: 'piano', name: 'Piano', label: 'Piano' },
            { id: 'violin', name: 'Violin', label: 'Violin' },
            { id: 'flute', name: 'Flute', label: 'Flute' },
            { id: 'guitar', name: 'Guitar', label: 'Guitar' },
            { id: 'voice', name: 'Voice', label: 'Voice' },
        ];
    }, [newScoreInstrumentGroups]);
    const newScoreCommonInstrumentPreferences = useMemo(() => ([
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
    const newScoreCommonInstruments = useMemo(() => {
        const results: { instrument: (typeof newScoreInstrumentOptions)[number]; label: string }[] = [];
        const used = new Set<string>();
        for (const pref of newScoreCommonInstrumentPreferences) {
            const found = pref.ids
                .map((id) => newScoreInstrumentOptions.find((instrument) => instrument.id === id))
                .find(Boolean);
            if (found && !used.has(found.id)) {
                used.add(found.id);
                results.push({ instrument: found, label: pref.label ?? found.name });
            }
        }
        return results;
    }, [newScoreCommonInstrumentPreferences, newScoreInstrumentOptions]);

    const newScoreTimeOptions = [
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

    const newScoreKeyOptions = [
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

    const clefCodeMap: Record<string, { sign: string; line: number; octave?: number }> = {
        G: { sign: 'G', line: 2 },
        G8va: { sign: 'G', line: 2, octave: 1 },
        G8vb: { sign: 'G', line: 2, octave: -1 },
        G15ma: { sign: 'G', line: 2, octave: 2 },
        F: { sign: 'F', line: 4 },
        F8va: { sign: 'F', line: 4, octave: 1 },
        F8vb: { sign: 'F', line: 4, octave: -1 },
        F15ma: { sign: 'F', line: 4, octave: 2 },
        C1: { sign: 'C', line: 1 },
        C2: { sign: 'C', line: 2 },
        C3: { sign: 'C', line: 3 },
        C4: { sign: 'C', line: 4 },
        C5: { sign: 'C', line: 5 },
        PERC: { sign: 'percussion', line: 2 },
    };

    const resolveInstrumentClefs = (instrumentId: string, instrumentName: string) => {
        const entry = instrumentClefMap?.[instrumentId];
        if (entry) {
            return entry;
        }
        const lowerName = instrumentName.toLowerCase();
        if (lowerName.includes('piano') || lowerName.includes('organ') || lowerName.includes('harp')) {
            return { staves: 2, clefs: [{ staff: 1, clef: 'G' }, { staff: 2, clef: 'F' }] };
        }
        if (lowerName.includes('viola')) {
            return { staves: 1, clefs: [{ staff: 1, clef: 'C3' }] };
        }
        if (lowerName.includes('cello') || lowerName.includes('contrabass') || lowerName.includes('double bass') || lowerName.includes('tuba') || lowerName.includes('bassoon')) {
            return { staves: 1, clefs: [{ staff: 1, clef: 'F' }] };
        }
        if (lowerName.includes('percussion') || lowerName.includes('drum')) {
            return { staves: 1, clefs: [{ staff: 1, clef: 'PERC' }] };
        }
        return { staves: 1, clefs: [{ staff: 1, clef: 'G' }] };
    };

    const buildNewScoreXml = (options: {
        title: string;
        composer: string;
        instruments: { id: string; name: string }[];
        measures: number;
        keyFifths: number;
        timeNumerator: number;
        timeDenominator: number;
    }) => {
        const title = escapeXml(options.title.trim());
        const composer = escapeXml(options.composer.trim());
        const divisions = 16;
        const measureDuration = Math.round((divisions * 4 * options.timeNumerator) / options.timeDenominator);
        const partsXml = options.instruments.map((instrument, index) => {
            const partId = `P${index + 1}`;
            const rawName = instrument.name.trim() || 'Instrument';
            const instrumentName = escapeXml(rawName);
            const clefSpec = resolveInstrumentClefs(instrument.id, rawName);
            const staves = Math.max(clefSpec.staves || 1, clefSpec.clefs.length || 1);
            const clefXml = clefSpec.clefs.map((clefEntry) => {
                const mapEntry = clefCodeMap[clefEntry.clef] ?? clefCodeMap.G;
                const staffAttr = staves > 1 ? ` number="${clefEntry.staff}"` : '';
                const octave = mapEntry.octave ? `\n        <clef-octave-change>${mapEntry.octave}</clef-octave-change>` : '';
                return `        <clef${staffAttr}>\n          <sign>${mapEntry.sign}</sign>\n          <line>${mapEntry.line}</line>${octave}\n        </clef>`;
            }).join('\n');
            const measuresXml = Array.from({ length: options.measures }, (_, measureIndex) => {
                const attributes = measureIndex === 0
                    ? `
      <attributes>
        <divisions>${divisions}</divisions>
        <key><fifths>${options.keyFifths}</fifths></key>
        <time><beats>${options.timeNumerator}</beats><beat-type>${options.timeDenominator}</beat-type></time>
        ${staves > 1 ? `<staves>${staves}</staves>` : ''}
${clefXml}
      </attributes>`
                    : '';
                const notesXml = Array.from({ length: staves }, (_, staffIndex) => {
                    const staffNumber = staffIndex + 1;
                    return `      <note>
        <rest measure="yes"/>
        <duration>${measureDuration}</duration>
        <voice>1</voice>
        ${staves > 1 ? `<staff>${staffNumber}</staff>` : ''}
      </note>`;
                }).join('\n');
                return `    <measure number="${measureIndex + 1}">
${attributes}
${notesXml}
    </measure>`;
            }).join('\n');
            return {
                partList: `    <score-part id="${partId}">
      <part-name>${instrumentName}</part-name>
      <score-instrument id="${partId}-I1">
        <instrument-name>${instrumentName}</instrument-name>
      </score-instrument>
    </score-part>`,
                part: `  <part id="${partId}">
${measuresXml}
  </part>`,
            };
        });
        const workLine = title ? `  <work><work-title>${title}</work-title></work>\n` : '';
        const identificationLine = composer
            ? `  <identification><creator type="composer">${composer}</creator></identification>\n`
            : '';
        const partListXml = partsXml.map((part) => part.partList).join('\n');
        const partsBodyXml = partsXml.map((part) => part.part).join('\n');
        return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
${workLine}${identificationLine}  <part-list>
${partListXml}
  </part-list>
${partsBodyXml}
</score-partwise>
`;
    };

    const normalizeXmlData = async (data: unknown): Promise<Uint8Array | null> => {
        if (!data) {
            return null;
        }
        if (data instanceof Uint8Array) {
            return data;
        }
        if (data instanceof ArrayBuffer) {
            return new Uint8Array(data);
        }
        if (ArrayBuffer.isView(data)) {
            return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
        }
        if (typeof data === 'string') {
            return new TextEncoder().encode(data);
        }
        if (data instanceof Blob) {
            return new Uint8Array(await data.arrayBuffer());
        }
        console.warn('Unexpected saveXml response type', data);
        return null;
    };

    const getScoreXmlData = useCallback(async () => {
        const activeScore = scoreRef.current ?? score;
        if (!activeScore?.saveXml) {
            alert('This build of webmscore does not expose "saveXml".');
            return null;
        }
        const data = await activeScore.saveXml();
        return await normalizeXmlData(data);
    }, [score]);

    const loadXmlFromScore = useCallback(async () => {
        if (!score) {
            setXmlText('');
            setXmlDirty(false);
            setScoreDirtySinceXml(false);
            return;
        }
        setXmlLoading(true);
        setXmlError(null);
        try {
            const data = await getScoreXmlData();
            if (!data) {
                return;
            }
            const text = new TextDecoder().decode(data);
            setXmlText(text);
            setXmlDirty(false);
            setScoreDirtySinceXml(false);
        } catch (err) {
            console.error('Failed to load MusicXML', err);
            setXmlError('Unable to load MusicXML from the current score.');
        } finally {
            setXmlLoading(false);
        }
    }, [score, getScoreXmlData]);

    const resolveXmlContext = useCallback(async () => {
        if (xmlText.trim()) {
            return xmlText;
        }
        const data = await getScoreXmlData();
        if (!data) {
            return '';
        }
        const text = new TextDecoder().decode(data);
        setXmlText(text);
        setXmlDirty(false);
        setScoreDirtySinceXml(false);
        return text;
    }, [xmlText, getScoreXmlData]);

    const extractJsonFromResponse = (responseText: string) => {
        const fenced = responseText.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fenced) {
            return fenced[1].trim();
        }
        return responseText.trim();
    };

    const parseMusicXmlPatch = (text: string) => {
        if (!text.trim()) {
            return { patch: null as MusicXmlPatch | null, error: 'AI response is empty.' };
        }
        let parsed: any;
        try {
            parsed = JSON.parse(text);
        } catch (err) {
            return { patch: null, error: 'AI response is not valid JSON.' };
        }
        if (!parsed || parsed.format !== 'musicxml-patch@1' || !Array.isArray(parsed.ops)) {
            return { patch: null, error: 'AI response is not a musicxml-patch@1 payload.' };
        }
        const ops: MusicXmlPatchOp[] = [];
        const allowedOps = new Set(['replace', 'setText', 'setAttr', 'insertBefore', 'insertAfter', 'delete']);
        for (let i = 0; i < parsed.ops.length; i += 1) {
            const op = parsed.ops[i];
            if (!op || typeof op !== 'object') {
                return { patch: null, error: `Patch op ${i + 1} is not an object.` };
            }
            const opName = String(op.op || '');
            if (!allowedOps.has(opName)) {
                return { patch: null, error: `Patch op ${i + 1} has unsupported op "${opName}".` };
            }
            const path = typeof op.path === 'string' ? op.path.trim() : '';
            if (!path) {
                return { patch: null, error: `Patch op ${i + 1} is missing a valid path.` };
            }
            const nextOp: MusicXmlPatchOp = { op: opName as MusicXmlPatchOp['op'], path };
            if (opName === 'setText' || opName === 'replace' || opName === 'insertBefore' || opName === 'insertAfter') {
                if (typeof op.value !== 'string') {
                    return { patch: null, error: `Patch op ${i + 1} requires a string value.` };
                }
                nextOp.value = op.value;
            }
            if (opName === 'setAttr') {
                if (typeof op.name !== 'string' || !op.name.trim()) {
                    return { patch: null, error: `Patch op ${i + 1} requires an attribute name.` };
                }
                if (typeof op.value !== 'string') {
                    return { patch: null, error: `Patch op ${i + 1} requires a string value.` };
                }
                nextOp.name = op.name;
                nextOp.value = op.value;
            }
            ops.push(nextOp);
        }
        return { patch: { format: 'musicxml-patch@1', ops }, error: '' };
    };

    const applyMusicXmlPatch = (baseXml: string, patch: MusicXmlPatch) => {
        if (!baseXml.trim()) {
            return { xml: '', error: 'Base MusicXML is empty.' };
        }
        if (typeof DOMParser === 'undefined') {
            return { xml: '', error: 'XML parsing is unavailable in this environment.' };
        }
        const parser = new DOMParser();
        const doc = parser.parseFromString(baseXml, 'application/xml');
        const parserError = doc.querySelector('parsererror');
        if (parserError) {
            return { xml: '', error: 'Base MusicXML is not valid XML.' };
        }
        const resolver = doc.createNSResolver(doc.documentElement);
        const parseFragment = (value: string) => {
            const fragmentDoc = parser.parseFromString(`<wrapper>${value}</wrapper>`, 'application/xml');
            const fragmentError = fragmentDoc.querySelector('parsererror');
            if (fragmentError) {
                return { node: null as Node | null, error: 'Patch value is not valid XML.' };
            }
            const wrapper = fragmentDoc.documentElement;
            const elementChildren = Array.from(wrapper.childNodes).filter(node => node.nodeType === Node.ELEMENT_NODE);
            const textChildren = Array.from(wrapper.childNodes).filter(
                node => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim(),
            );
            if (elementChildren.length !== 1 || textChildren.length > 0) {
                return { node: null, error: 'Patch value must contain exactly one element.' };
            }
            const imported = doc.importNode(elementChildren[0], true);
            return { node: imported, error: '' };
        };
        const resolveSingleNode = (path: string) => {
            try {
                const result = doc.evaluate(path, doc, resolver, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                if (result.snapshotLength !== 1) {
                    return { node: null as Node | null, error: `XPath "${path}" matched ${result.snapshotLength} nodes.` };
                }
                return { node: result.snapshotItem(0), error: '' };
            } catch (err) {
                return { node: null as Node | null, error: `XPath "${path}" could not be evaluated.` };
            }
        };
        for (let i = 0; i < patch.ops.length; i += 1) {
            const op = patch.ops[i];
            const { node, error } = resolveSingleNode(op.path);
            if (error || !node) {
                return { xml: '', error: `Patch op ${i + 1} failed: ${error || 'Target not found.'}` };
            }
            if (op.op === 'setText') {
                node.textContent = op.value ?? '';
                continue;
            }
            if (op.op === 'setAttr') {
                if (node.nodeType !== Node.ELEMENT_NODE) {
                    return { xml: '', error: `Patch op ${i + 1} targets a non-element node.` };
                }
                (node as Element).setAttribute(op.name ?? '', op.value ?? '');
                continue;
            }
            if (op.op === 'delete') {
                if (!node.parentNode) {
                    return { xml: '', error: `Patch op ${i + 1} target has no parent.` };
                }
                node.parentNode.removeChild(node);
                continue;
            }
            const fragment = parseFragment(op.value ?? '');
            if (fragment.error || !fragment.node) {
                return { xml: '', error: `Patch op ${i + 1} failed: ${fragment.error || 'Invalid value.'}` };
            }
            if (!node.parentNode) {
                return { xml: '', error: `Patch op ${i + 1} target has no parent.` };
            }
            if (op.op === 'replace') {
                node.parentNode.replaceChild(fragment.node, node);
                continue;
            }
            if (op.op === 'insertBefore') {
                node.parentNode.insertBefore(fragment.node, node);
                continue;
            }
            if (op.op === 'insertAfter') {
                node.parentNode.insertBefore(fragment.node, node.nextSibling);
                continue;
            }
        }
        const serializer = new XMLSerializer();
        return { xml: serializer.serializeToString(doc), error: '' };
    };

    const ensureCheckpointBeforeApply = async () => {
        if (!isIndexedDbAvailable()) {
            alert('IndexedDB is not available; cannot verify checkpoint status.');
            return { ok: false, currentXml: '' };
        }
        const currentData = await getScoreXmlData();
        if (!currentData) {
            alert('Unable to read MusicXML for checkpointing.');
            return { ok: false, currentXml: '' };
        }
        const activeScoreId = ensureScoreId('score');
        const decoder = new TextDecoder();
        const currentXml = decoder.decode(currentData);
        const latestCheckpoint = checkpoints[0];
        let needsCheckpoint = true;
        if (latestCheckpoint) {
            const record = await getCheckpoint(latestCheckpoint.id);
            if (record) {
                const checkpointXml = decoder.decode(new Uint8Array(record.data));
                needsCheckpoint = currentXml !== checkpointXml;
            }
        }
        if (needsCheckpoint) {
            const buffer = currentData.buffer.slice(currentData.byteOffset, currentData.byteOffset + currentData.byteLength);
            const title = buildCheckpointTitle('', 'Auto checkpoint');
            await saveCheckpoint({
                title,
                createdAt: Date.now(),
                format: 'musicxml',
                data: buffer,
                size: currentData.byteLength,
                scoreId: activeScoreId,
            });
            setScoreDirtySinceCheckpoint(false);
            await loadCheckpointList();
        }
        return { ok: true, currentXml };
    };

    const applyXmlToScore = async (sourceXml: string) => {
        if (!score) {
            alert('Load a score before applying XML edits.');
            return;
        }
        if (!sourceXml.trim()) {
            alert('XML content is empty.');
            return;
        }
        const checkpointState = await ensureCheckpointBeforeApply();
        if (!checkpointState.ok) {
            return;
        }
        const willChange = checkpointState.currentXml.trim() !== sourceXml.trim();
        const encoder = new TextEncoder();
        const encoded = encoder.encode(sourceXml);
        const filenameBase = scoreTitle ? toSafeFilename(scoreTitle) : 'score';
        const file = new File([encoded], `${filenameBase}.musicxml`, { type: 'application/xml' });
        setXmlDirty(false);
        await handleFileUpload(file, { preserveScoreId: true, updateUrl: false });
        setScoreDirtySinceCheckpoint(willChange);
        setScoreDirtySinceXml(false);
    };


    const loadScoreSummaryList = useCallback(async () => {
        if (!isIndexedDbAvailable()) {
            setScoreSummaries([]);
            setScoreSummariesError('IndexedDB is not available in this browser.');
            return;
        }
        setScoreSummariesLoading(true);
        try {
            const items = await listScoreSummaries();
            let summaries = items;
            if (scoreId && !items.some(item => item.scoreId === scoreId)) {
                summaries = [
                    {
                        scoreId,
                        title: scoreTitle || 'Current score',
                        lastUpdated: Date.now(),
                        count: 0,
                    },
                    ...items,
                ];
            }
            setScoreSummaries(summaries);
            setScoreSummariesError(null);
        } catch (err) {
            console.warn('Failed to load score summaries', err);
            setScoreSummaries([]);
            setScoreSummariesError('Unable to load scores from browser storage.');
        } finally {
            setScoreSummariesLoading(false);
        }
    }, [scoreId, scoreTitle]);

    const loadCheckpointList = useCallback(async () => {
        if (!isIndexedDbAvailable()) {
            setCheckpointError('IndexedDB is not available in this browser.');
            return;
        }
        if (!scoreId) {
            setCheckpoints([]);
            return;
        }
        setCheckpointLoading(true);
        try {
            const items = await listCheckpoints(scoreId);
            setCheckpoints(items);
            setCheckpointError(null);
        } catch (err) {
            console.warn('Failed to load checkpoints', err);
            setCheckpointError('Unable to load checkpoints from browser storage.');
        } finally {
            setCheckpointLoading(false);
            void loadScoreSummaryList();
        }
    }, [scoreId, loadScoreSummaryList]);

    const exposeScoreToWindow = (s: Score | null) => {
        // Handy for Playwright/debug sessions to poke at WASM bindings directly
        if (typeof window !== 'undefined') {
            (window as any).__webmscore = s;
        }
    };

    useEffect(() => {
        void loadCheckpointList();
    }, [loadCheckpointList]);

    useEffect(() => {
        void loadScoreSummaryList();
    }, [loadScoreSummaryList]);

    useEffect(() => {
        const paramScoreId = searchParams.get('scoreId');
        const urlScore = searchParams.get('score');
        const nextScoreId = paramScoreId || (urlScore ? `url:${urlScore}` : '');
        if (nextScoreId && nextScoreId !== scoreId) {
            setScoreId(nextScoreId);
        }
    }, [searchParams, scoreId]);

    useEffect(() => {
        if (!score) {
            setXmlText('');
            setXmlDirty(false);
            return;
        }
        if (xmlDirty) {
            return;
        }
        void loadXmlFromScore();
    }, [score, xmlDirty, loadXmlFromScore]);

    useEffect(() => {
        if (xmlSidebarTab === 'assistant' && aiIncludeXml && !xmlText.trim()) {
            void loadXmlFromScore();
        }
    }, [xmlSidebarTab, aiIncludeXml, xmlText, loadXmlFromScore]);

    useEffect(() => {
        const trimmedKey = aiApiKey.trim();
        if (!trimmedKey) {
            setAiModels([]);
            setAiModelsError(null);
            return;
        }
        let canceled = false;
        setAiModelsLoading(true);
        setAiModelsError(null);
        const loadModels = async () => {
            try {
                const response = await fetch('/api/llm/openai/models', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ apiKey: trimmedKey }),
                });
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(errorText || 'Failed to load models.');
                }
                const data = await response.json();
                const models = Array.isArray(data?.models)
                    ? data.models.filter((id: unknown) => typeof id === 'string')
                    : [];
                if (canceled) {
                    return;
                }
                const filtered = models.filter((id: string) => /^gpt-|^o/.test(id));
                const sorted = [...new Set(filtered.length ? filtered : models)].sort();
                setAiModels(sorted);
                if (!aiModel || !sorted.includes(aiModel)) {
                    const preferred = sorted.find((id: string) => id === 'gpt-5.2') || sorted[0] || '';
                    setAiModel(preferred);
                }
            } catch (err) {
                if (!canceled) {
                    console.error('Failed to load OpenAI models', err);
                    setAiModels([]);
                    setAiModelsError('Failed to load models. Check your API key.');
                }
            } finally {
                if (!canceled) {
                    setAiModelsLoading(false);
                }
            }
        };
        void loadModels();
        return () => {
            canceled = true;
        };
    }, [aiApiKey, aiModel]);

    useEffect(() => {
        if (!newScoreDialogOpen) {
            return;
        }
        if (newScoreInstrumentOptions.length === 0) {
            return;
        }
        const fallbackId = newScoreInstrumentOptions[0].id;
        if (!newScoreInstrumentToAdd || !newScoreInstrumentOptions.some((option) => option.id === newScoreInstrumentToAdd)) {
            setNewScoreInstrumentToAdd(fallbackId);
        }
        if (newScoreInstrumentIds.length === 0) {
            setNewScoreInstrumentIds([fallbackId]);
        }
    }, [newScoreDialogOpen, newScoreInstrumentIds.length, newScoreInstrumentOptions, newScoreInstrumentToAdd]);

    useEffect(() => {
        if (!newScoreDialogOpen || !score) {
            return;
        }
        if (instrumentGroups.length > 0) {
            return;
        }
        void refreshInstrumentTemplates(score);
    }, [newScoreDialogOpen, instrumentGroups.length, score]);

    useEffect(() => {
        if (!newScoreDialogOpen || instrumentClefMap) {
            return;
        }
        let canceled = false;
        const loadClefs = async () => {
            try {
                const response = await fetch('/api/instruments/clefs');
                if (!response.ok) {
                    throw new Error('Failed to load clef map.');
                }
                const data = await response.json();
                if (!canceled) {
                    setInstrumentClefMap(data?.map ?? null);
                    setInstrumentClefMapError(null);
                }
            } catch (err) {
                if (!canceled) {
                    console.warn('Failed to load instrument clefs', err);
                    setInstrumentClefMap(null);
                    setInstrumentClefMapError('Unable to load clef defaults. Using treble clef.');
                }
            }
        };
        void loadClefs();
        return () => {
            canceled = true;
        };
    }, [newScoreDialogOpen, instrumentClefMap]);

    useEffect(() => {
        if (!newScoreDialogOpen || instrumentGroups.length > 0 || instrumentFallbackGroups.length > 0) {
            return;
        }
        let canceled = false;
        const loadFallbackInstruments = async () => {
            try {
                const response = await fetch('/api/instruments/templates');
                if (!response.ok) {
                    throw new Error('Failed to load instrument templates.');
                }
                const data = await response.json();
                if (!canceled) {
                    const groups = Array.isArray(data?.groups) ? data.groups as InstrumentTemplateGroup[] : [];
                    setInstrumentFallbackGroups(groups);
                    setInstrumentFallbackError(groups.length > 0 ? null : 'No instruments found.');
                }
            } catch (err) {
                if (!canceled) {
                    console.warn('Failed to load fallback instruments', err);
                    setInstrumentFallbackGroups([]);
                    setInstrumentFallbackError('Unable to load instrument list.');
                }
            }
        };
        void loadFallbackInstruments();
        return () => {
            canceled = true;
        };
    }, [newScoreDialogOpen, instrumentGroups.length, instrumentFallbackGroups.length]);

    useEffect(() => {
        const abortController = new AbortController();

        const boot = async () => {
            try {
                await loadWebMscore();
                if (abortController.signal.aborted) {
                    return;
                }
                console.log('webmscore initialized');

                const scoreUrl = searchParams.get('score');
                if (scoreUrl) {
                    await handleUrlLoad(scoreUrl, abortController.signal);
                }
            } catch (err) {
                if (!abortController.signal.aborted) {
                    console.error('Failed to initialize webmscore', err);
                }
            }
        };

        boot();
        return () => abortController.abort();
    }, [searchParams]);

    const handleUrlLoad = async (url: string, signal?: AbortSignal) => {
        if (signal?.aborted) {
            return;
        }
        const urlScoreId = searchParams.get('scoreId') || `url:${url}`;
        if (urlScoreId !== scoreId) {
            setScoreId(urlScoreId);
        }
        setLoading(true);
        setSelectedElement(null);
        setSelectionBoxes([]);
        setSelectedPoint(null);
        setSelectedIndex(null);
        setSelectedElementClasses('');
        setSelectedLayoutBreakSubtype(null);
        setMutationEnabled(false);
        setSoundFontLoaded(false);
        setTriedSoundFont(false);
        setScoreDirtySinceCheckpoint(false);
        setScoreDirtySinceXml(false);
        setXmlText('');
        setXmlDirty(false);
        setXmlError(null);
        setScoreTitle('');
        setScoreSubtitle('');
        setScoreComposer('');
        setScoreLyricist('');
        setScoreParts([]);
        setInstrumentGroups([]);
        setCurrentPage(0);
        setPageCount(1);
        autoFitPendingRef.current = true;
        try {
            const response = await fetch(url, signal ? { signal } : undefined);
            if (!response.ok) throw new Error('Failed to fetch score');
            const buffer = await response.arrayBuffer();
            const data = new Uint8Array(buffer);
            const WebMscore = await loadWebMscore();

            // Guess format
            let format: InputFileFormat = 'mscz';
            if (url.endsWith('.xml') || url.endsWith('.musicxml')) {
                format = 'musicxml';
            }

            if (score) {
                score.destroy();
            }

            const loadedScore = await WebMscore.load(format, data);
            if (signal?.aborted) {
                loadedScore.destroy();
                return;
            }
            setScore(loadedScore);
            exposeScoreToWindow(loadedScore);
            const mutationsAvailable = hasMutationApi(loadedScore);
            if (!mutationsAvailable) {
                console.warn('Mutation APIs not detected on loaded score; enabling toolbar anyway.');
            }
            setMutationEnabled(true);
            const initialPage = await refreshPageCount(loadedScore, 0);
            await renderScore(loadedScore, initialPage);
            if (autoFitPendingRef.current && typeof window !== 'undefined') {
                window.requestAnimationFrame(() => {
                    window.requestAnimationFrame(() => {
                        handleFitWidth();
                        autoFitPendingRef.current = false;
                    });
                });
            } else {
                handleFitWidth();
                autoFitPendingRef.current = false;
            }
            await refreshScoreMetadata(loadedScore);
            await refreshInstrumentTemplates(loadedScore);
            if (loadedScore.saveAudio) {
                await ensureSoundFontLoaded(loadedScore);
            }

            // segmentPositions causes a crash in this version of webmscore/emscripten environment
            // We will use DOM-based hit testing on the SVG elements instead.

        } catch (err) {
            console.error('Error auto-loading file:', err);
        } finally {
            if (!signal?.aborted) {
                setLoading(false);
            }
        }
    };

    const handleFileUpload = async (
        file: File,
        options?: { preserveScoreId?: boolean; scoreIdOverride?: string; updateUrl?: boolean },
    ) => {
        setLoading(true);
        const shouldUpdateUrl = options?.updateUrl ?? true;
        let nextScoreId = scoreId;
        if (options?.scoreIdOverride) {
            nextScoreId = options.scoreIdOverride;
        } else if (!options?.preserveScoreId) {
            nextScoreId = `file:${file.name}:${file.lastModified}`;
        }
        if (nextScoreId && nextScoreId !== scoreId) {
            setScoreId(nextScoreId);
            if (shouldUpdateUrl) {
                updateUrlScoreId(nextScoreId);
            }
        }
        setSelectedElement(null);
        setSelectionBoxes([]);
        setSelectedPoint(null);
        setSelectedIndex(null);
        setSelectedElementClasses('');
        setSelectedLayoutBreakSubtype(null);
        setMutationEnabled(false);
        setSoundFontLoaded(false);
        setTriedSoundFont(false);
        setScoreDirtySinceCheckpoint(false);
        setScoreDirtySinceXml(false);
        setXmlText('');
        setXmlDirty(false);
        setXmlError(null);
        setScoreTitle('');
        setScoreSubtitle('');
        setScoreComposer('');
        setScoreLyricist('');
        setScoreParts([]);
        setInstrumentGroups([]);
        autoFitPendingRef.current = true;
        try {
            const buffer = await file.arrayBuffer();
            const data = new Uint8Array(buffer);
            const WebMscore = await loadWebMscore();

            // Determine format based on extension
            const name = file.name.toLowerCase();
            let format: InputFileFormat = 'mscz';
            if (name.endsWith('.xml') || name.endsWith('.musicxml')) {
                format = 'musicxml';
            }

            // But wait, we need to destroy previous score if exists
            if (score) {
                score.destroy();
            }

            // Re-load with default layout
            const loadedScore = await WebMscore.load(format, data);
            setScore(loadedScore);
            exposeScoreToWindow(loadedScore);
            const mutationsAvailable = hasMutationApi(loadedScore);
            if (!mutationsAvailable) {
                console.warn('Mutation APIs not detected on loaded score; enabling toolbar anyway.');
            }
            setMutationEnabled(true);
        const initialPage = await refreshPageCount(loadedScore, 0);
        await renderScore(loadedScore, initialPage);
        if (autoFitPendingRef.current && typeof window !== 'undefined') {
            window.requestAnimationFrame(() => {
                window.requestAnimationFrame(() => {
                    handleFitWidth();
                    autoFitPendingRef.current = false;
                });
            });
        } else {
            handleFitWidth();
            autoFitPendingRef.current = false;
        }
        await refreshScoreMetadata(loadedScore);
            await refreshInstrumentTemplates(loadedScore);
            if (loadedScore.saveAudio) {
                await ensureSoundFontLoaded(loadedScore);
            }

        } catch (err) {
            console.error('Error loading file:', err);
            alert('Failed to load score. See console for details.');
        } finally {
            setLoading(false);
        }
    };

    const refreshPageCount = async (targetScore: Score, preferredPage: number = currentPageRef.current) => {
        if (!targetScore?.npages) {
            setPageCount(1);
            setCurrentPage(0);
            return 0;
        }

        try {
            const pages = Math.max(1, await targetScore.npages());
            const clamped = Math.max(0, Math.min(preferredPage, pages - 1));
            setPageCount(pages);
            setCurrentPage(clamped);
            return clamped;
        } catch (err) {
            console.warn('Failed to read page count:', err);
            setPageCount(1);
            setCurrentPage(0);
            return 0;
        }
    };

    const renderScore = async (currentScore: Score, pageIndex?: number) => {
        if (!currentScore || !containerRef.current) return;

        try {
            const targetPage = typeof pageIndex === 'number' ? pageIndex : currentPage;
            const svgData = await currentScore.saveSvg(targetPage, true, true);
            if (svgData) {
                containerRef.current.innerHTML = svgData;
            }
        } catch (err) {
            console.error('Error rendering score:', err);
        }
    };

    const refreshScoreMetadata = async (currentScore: Score) => {
        try {
            const metadata = await currentScore.metadata();
            setScoreTitle(typeof metadata.title === 'string' ? metadata.title : '');
            setScoreSubtitle(typeof (metadata as any).subtitle === 'string' ? (metadata as any).subtitle : '');
            setScoreComposer(typeof metadata.composer === 'string' ? metadata.composer : '');
            const lyricistValue = typeof (metadata as any).lyricist === 'string'
                ? (metadata as any).lyricist
                : typeof (metadata as any).poet === 'string'
                    ? (metadata as any).poet
                    : '';
            setScoreLyricist(lyricistValue);
            const parts = Array.isArray((metadata as any).parts) ? (metadata as any).parts : [];
            const nextParts = parts.map((part: any, index: number) => ({
                index,
                name: typeof part?.name === 'string' ? part.name : '',
                instrumentName: typeof part?.instrumentName === 'string' ? part.instrumentName : '',
                instrumentId: typeof part?.instrumentId === 'string' ? part.instrumentId : '',
                isVisible: String(part?.isVisible ?? '').toLowerCase() === 'true',
            }));
            setScoreParts(nextParts);
        } catch (err) {
            console.warn('Failed to read score metadata', err);
            setScoreSubtitle('');
            setScoreLyricist('');
            setScoreParts([]);
        }
    };

    const refreshInstrumentTemplates = async (currentScore: Score) => {
        if (!currentScore.listInstrumentTemplates) {
            setInstrumentGroups([]);
            return;
        }
        try {
            const data = await currentScore.listInstrumentTemplates();
            setInstrumentGroups(Array.isArray(data) ? data as InstrumentTemplateGroup[] : []);
        } catch (err) {
            console.warn('Failed to read instrument templates', err);
            setInstrumentGroups([]);
        }
    };

    const ensureSoundFontLoaded = async (targetScore?: Score): Promise<boolean> => {
        if (soundFontLoaded) {
            return true;
        }
        const activeScore = targetScore ?? score;
        if (!activeScore || !activeScore.setSoundFont) {
            return false;
        }
        if (triedSoundFont) {
            return false;
        }

        setTriedSoundFont(true);
        const candidates = ['/soundfonts/default.sf3', '/soundfonts/default.sf2'];
        for (const url of candidates) {
            try {
                const res = await fetch(url);
                if (!res.ok) {
                    continue;
                }
                const buf = new Uint8Array(await res.arrayBuffer());
                await activeScore.setSoundFont(buf);
                setSoundFontLoaded(true);
                return true;
            } catch (err) {
                console.warn('Default soundfont load failed for', url, err);
            }
        }
        return false;
    };

    const handleSoundFontUpload = async (file: File) => {
        if (!score || !score.setSoundFont) {
            alert('SoundFont loading is not available in this build.');
            return;
        }
        try {
            const buffer = await file.arrayBuffer();
            const data = new Uint8Array(buffer);
            await score.setSoundFont(data);
            setSoundFontLoaded(true);
            setTriedSoundFont(true);
        } catch (err) {
            console.error('Failed to load soundfont', err);
            alert('Failed to load soundfont. See console for details.');
        }
    };

    const handleOpenNewScoreDialog = () => {
        setNewScoreTitle('');
        setNewScoreComposer('');
        setNewScoreMeasures(4);
        setNewScoreKeyFifths(0);
        setNewScoreTimeNumerator(4);
        setNewScoreTimeDenominator(4);
        if (newScoreInstrumentOptions.length > 0) {
            setNewScoreInstrumentToAdd(newScoreInstrumentOptions[0].id);
            setNewScoreInstrumentIds([newScoreInstrumentOptions[0].id]);
        }
        setNewScoreDialogOpen(true);
    };

    const handleAddNewScoreInstrument = () => {
        if (!newScoreInstrumentToAdd) {
            return;
        }
        setNewScoreInstrumentIds((prev) => [...prev, newScoreInstrumentToAdd]);
    };

    const handleRemoveNewScoreInstrument = (index: number) => {
        setNewScoreInstrumentIds((prev) => prev.filter((_, idx) => idx !== index));
    };

    const handleCreateNewScore = async () => {
        const measures = Math.max(1, Math.floor(newScoreMeasures));
        const instrumentIds = newScoreInstrumentIds.length > 0 ? newScoreInstrumentIds : newScoreInstrumentOptions.slice(0, 1).map((option) => option.id);
        if (instrumentIds.length === 0) {
            alert('Select at least one instrument.');
            return;
        }
        const instruments = instrumentIds.map((id) => {
            const option = newScoreInstrumentOptions.find((entry) => entry.id === id);
            return { id, name: option?.name || id || 'Instrument' };
        });
        const xml = buildNewScoreXml({
            title: newScoreTitle,
            composer: newScoreComposer,
            instruments,
            measures,
            keyFifths: newScoreKeyFifths,
            timeNumerator: newScoreTimeNumerator,
            timeDenominator: newScoreTimeDenominator,
        });
        const filenameBase = newScoreTitle.trim() ? toSafeFilename(newScoreTitle) : 'new_score';
        const file = new File([new TextEncoder().encode(xml)], `${filenameBase}.musicxml`, {
            type: 'application/xml',
        });
        setNewScoreDialogOpen(false);
        const nextScoreId = `new:${crypto.randomUUID()}`;
        setScoreId(nextScoreId);
        updateUrlScoreId(nextScoreId);
        await handleFileUpload(file, { scoreIdOverride: nextScoreId, updateUrl: false });
    };

    const handleSelectScoreSummary = (nextScoreId: string) => {
        if (!nextScoreId) {
            return;
        }
        setScoreId(nextScoreId);
        if (!nextScoreId.startsWith('url:')) {
            updateUrlScoreId(nextScoreId);
        }
        setLeftSidebarTab('checkpoints');
    };

    const handleOpenScoreFromSummary = (summary: ScoreSummary) => {
        if (typeof window === 'undefined') {
            return;
        }
        if (!summary.scoreId.startsWith('url:')) {
            handleSelectScoreSummary(summary.scoreId);
            return;
        }
        const urlValue = summary.scoreId.slice(4);
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set('score', urlValue);
        nextUrl.searchParams.delete('scoreId');
        window.location.assign(nextUrl.toString());
    };

    const handleSaveCheckpoint = async () => {
        if (!score) {
            alert('Load a score before saving a checkpoint.');
            return;
        }
        if (!isIndexedDbAvailable()) {
            alert('IndexedDB is not available in this browser.');
            return;
        }
        setCheckpointBusy(true);
        try {
            const data = await getScoreXmlData();
            if (!data) {
                return;
            }
            const activeScoreId = ensureScoreId('score');
            const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
            const title = buildCheckpointTitle(checkpointLabel, scoreTitle);
            await saveCheckpoint({
                title,
                createdAt: Date.now(),
                format: 'musicxml',
                data: buffer,
                size: data.byteLength,
                scoreId: activeScoreId,
            });
            setScoreDirtySinceCheckpoint(false);
            setCheckpointLabel('');
            await loadCheckpointList();
        } catch (err) {
            console.error('Failed to save checkpoint', err);
            alert('Failed to save checkpoint. See console for details.');
        } finally {
            setCheckpointBusy(false);
        }
    };

    const handleRestoreCheckpoint = async (checkpoint: CheckpointSummary) => {
        if (!isIndexedDbAvailable()) {
            alert('IndexedDB is not available in this browser.');
            return;
        }
        if (typeof window !== 'undefined') {
            const ok = window.confirm(`Restore checkpoint "${checkpoint.title}"? Unsaved changes will be lost.`);
            if (!ok) {
                return;
            }
        }
        setCheckpointBusy(true);
        try {
            const record = await getCheckpoint(checkpoint.id);
            if (!record) {
                alert('Checkpoint not found.');
                return;
            }
            const filename = `${toSafeFilename(checkpoint.title)}.musicxml`;
            const file = new File([new Uint8Array(record.data)], filename, { type: 'application/xml' });
            await handleFileUpload(file, { preserveScoreId: true, updateUrl: false });
        } catch (err) {
            console.error('Failed to restore checkpoint', err);
            alert('Failed to restore checkpoint. See console for details.');
        } finally {
            setCheckpointBusy(false);
        }
    };

    const handleCompareCheckpoint = async (checkpoint: CheckpointSummary) => {
        if (!score) {
            alert('Load a score before comparing checkpoints.');
            return;
        }
        if (!isIndexedDbAvailable()) {
            alert('IndexedDB is not available in this browser.');
            return;
        }
        setCheckpointBusy(true);
        try {
            const record = await getCheckpoint(checkpoint.id);
            if (!record) {
                alert('Checkpoint not found.');
                return;
            }
            const currentData = await getScoreXmlData();
            if (!currentData) {
                return;
            }
            const decoder = new TextDecoder();
            const currentXml = decoder.decode(currentData);
            const checkpointXml = decoder.decode(new Uint8Array(record.data));
            setCompareView({ title: checkpoint.title, currentXml, checkpointXml });
        } catch (err) {
            console.error('Failed to compare checkpoint', err);
            alert('Failed to compare checkpoint. See console for details.');
        } finally {
            setCheckpointBusy(false);
        }
    };

    const handleRefreshXml = async () => {
        if (!score) {
            alert('Load a score before refreshing MusicXML.');
            return;
        }
        if (xmlDirty && typeof window !== 'undefined') {
            const ok = window.confirm('Discard local MusicXML edits and reload from the score?');
            if (!ok) {
                return;
            }
        }
        await loadXmlFromScore();
    };

    const handleApplyXmlEdits = async () => {
        setXmlLoading(true);
        setXmlError(null);
        try {
            await applyXmlToScore(xmlText);
        } catch (err) {
            console.error('Failed to apply MusicXML edits', err);
            alert('Failed to apply MusicXML edits. See console for details.');
        } finally {
            setXmlLoading(false);
        }
    };

    const handleDeleteCheckpoint = async (checkpoint: CheckpointSummary) => {
        if (!isIndexedDbAvailable()) {
            alert('IndexedDB is not available in this browser.');
            return;
        }
        if (typeof window !== 'undefined') {
            const ok = window.confirm(`Delete checkpoint "${checkpoint.title}"?`);
            if (!ok) {
                return;
            }
        }
        setCheckpointBusy(true);
        try {
            await deleteCheckpoint(checkpoint.id);
            await loadCheckpointList();
        } catch (err) {
            console.error('Failed to delete checkpoint', err);
            alert('Failed to delete checkpoint. See console for details.');
        } finally {
            setCheckpointBusy(false);
        }
    };

    const handleAiRequest = async () => {
        if (!aiApiKey.trim()) {
            alert('Enter your OpenAI API key.');
            return;
        }
        if (!aiPrompt.trim()) {
            alert('Enter an instruction for the assistant.');
            return;
        }
        if (!aiModel.trim()) {
            alert('Select a model.');
            return;
        }
        if (aiMaxTokensMode === 'custom' && aiMaxTokens <= 0) {
            alert('Enter a max output token limit.');
            return;
        }
        setAiBusy(true);
        setAiError(null);
        setAiOutput('');
        setAiPatch(null);
        setAiPatchError(null);
        setAiPatchedXml('');
        try {
            const xmlContext = aiIncludeXml ? await resolveXmlContext() : '';
            if (aiIncludeXml && !xmlContext.trim()) {
                alert('Unable to load MusicXML for context.');
                return;
            }
            const baseXml = aiIncludeXml ? xmlContext : await resolveXmlContext();
            const payload: Record<string, unknown> = {
                apiKey: aiApiKey,
                model: aiModel,
                prompt: aiPrompt,
                xml: aiIncludeXml ? xmlContext : '',
            };
            if (aiMaxTokensMode === 'custom') {
                payload.maxTokens = aiMaxTokens;
            }
            const response = await fetch('/api/llm/openai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Request failed.');
            }
            const data = await response.json();
            const rawText = typeof data?.text === 'string' ? data.text : '';
            const extracted = extractJsonFromResponse(rawText);
            if (!extracted) {
                setAiError('No patch was returned by the model.');
                return;
            }
            setAiOutput(extracted);
            const parsed = parseMusicXmlPatch(extracted);
            if (parsed.error || !parsed.patch) {
                setAiPatchError(parsed.error || 'Invalid patch payload.');
                return;
            }
            setAiPatch(parsed.patch);
            if (!baseXml.trim()) {
                setAiPatchError('Unable to apply patch without MusicXML.');
                return;
            }
            const applied = applyMusicXmlPatch(baseXml, parsed.patch);
            if (applied.error || !applied.xml.trim()) {
                setAiPatchError(applied.error || 'Failed to apply patch to MusicXML.');
                return;
            }
            setAiPatchError(null);
            setAiPatchedXml(applied.xml);
        } catch (err) {
            console.error('AI request failed', err);
            setAiError('AI request failed. See console for details.');
        } finally {
            setAiBusy(false);
        }
    };

    const handleApplyAiOutput = async () => {
        if (!aiPatchedXml.trim()) {
            alert(aiPatchError || 'AI patch has not produced valid MusicXML.');
            return;
        }
        setXmlLoading(true);
        setXmlError(null);
        try {
            await applyXmlToScore(aiPatchedXml);
        } catch (err) {
            console.error('Failed to apply AI XML', err);
            alert('Failed to apply AI XML. See console for details.');
        } finally {
            setXmlLoading(false);
        }
    };

    const ensureSelectionInWasm = async () => {
        // If the UI is tracking multiple selected elements, avoid collapsing the WASM selection back to a single point.
        if (selectionBoxes.length > 1) {
            return;
        }
        if (!score || !selectedPoint) {
            return;
        }

        try {
            const { page, x, y } = selectedPoint;
            const preferTextSelection = hasTextElementClass(selectedElementClasses) || Boolean(textEditorPosition);
            if (preferTextSelection && score.selectTextElementAtPoint) {
                await score.selectTextElementAtPoint(page, x, y);
                return;
            }
            if (!score.selectElementAtPoint) {
                return;
            }
            await score.selectElementAtPoint(page, x, y);
        } catch (err) {
            console.warn('Re-select in WASM failed; continuing anyway', err);
        }
    };

    const refreshSelectionOverlay = (
        fallbackIndex?: number | null,
        fallbackPoint?: { page: number, x: number, y: number } | null,
        generation?: number,
    ) => {
        console.log('[refreshSelectionOverlay] Called with fallbackIndex:', fallbackIndex, 'fallbackPoint:', fallbackPoint);
        if (!containerRef.current) {
            console.log('[refreshSelectionOverlay] No containerRef, returning');
            return;
        }
        if (generation !== undefined && generation !== selectionOverlayGenerationRef.current) {
            return;
        }
        if (blockOverlayRefreshRef.current) {
            return;
        }
        const useIndex = fallbackIndex !== undefined ? fallbackIndex : selectedIndex;
        const usePoint = fallbackPoint !== undefined ? fallbackPoint : selectedPoint;
        console.log('[refreshSelectionOverlay] useIndex:', useIndex, 'usePoint:', usePoint);

        const containerRect = containerRef.current.getBoundingClientRect();
        const selectors = ['.selected', '.note-selected', '.ms-selection'];
        const candidates: Element[] = Array.from(
            new Set(selectors.flatMap(sel => Array.from(containerRef.current!.querySelectorAll(sel)))),
        );
        const allElements = Array.from(containerRef.current.querySelectorAll(ELEMENT_SELECTION_SELECTOR));

        console.log('[refreshSelectionOverlay] candidates.length:', candidates.length);

        let boxes: SelectionBox[] = [];
        if (candidates.length > 0) {
            boxes = candidates
                .map(cand => {
                    const rect = cand.getBoundingClientRect();
                    const x = (rect.left - containerRect.left) / zoom;
                    const y = (rect.top - containerRect.top) / zoom;
                    const w = rect.width / zoom;
                    const h = rect.height / zoom;
                    if (!(w > 0 && h > 0)) {
                        return null;
                    }
                    const page = extractPageIndex(cand) ?? 0;
                    const centerX = x + w / 2;
                    const centerY = y + h / 2;
                    const classAttr = normalizeElementClasses(cand, cand.getAttribute('class') ?? '');

                    let idx = allElements.indexOf(cand);
                    if (idx < 0) {
                        let current: Element | null = cand;
                        while (current && current !== containerRef.current) {
                            idx = allElements.indexOf(current);
                            if (idx >= 0) break;
                            current = current.parentElement;
                        }
                    }

                    return {
                        index: idx >= 0 ? idx : null,
                        page,
                        x,
                        y,
                        w,
                        h,
                        centerX,
                        centerY,
                        classes: classAttr,
                    } satisfies SelectionBox;
                })
                .filter((box): box is NonNullable<typeof box> => Boolean(box))
                .sort((a, b) => (
                    a.page - b.page
                    || a.y - b.y
                    || a.x - b.x
                    || (a.index ?? Number.MAX_SAFE_INTEGER) - (b.index ?? Number.MAX_SAFE_INTEGER)
                ));
        } else if (useIndex !== null) {
            // Fallback: use index if selection markers are missing in SVG
            console.log('[refreshSelectionOverlay] Using index fallback');
            console.log('[refreshSelectionOverlay] Found', allElements.length, 'Note/Rest/Chord/LayoutBreak elements');
            const el = allElements[useIndex] ?? null;
            if (el) {
                console.log('[refreshSelectionOverlay] Selected element at index', useIndex);
                const rect = el.getBoundingClientRect();
                const x = (rect.left - containerRect.left) / zoom;
                const y = (rect.top - containerRect.top) / zoom;
                const w = rect.width / zoom;
                const h = rect.height / zoom;
                if (w > 0 && h > 0) {
                    const page = extractPageIndex(el) ?? 0;
                    const centerX = x + w / 2;
                    const centerY = y + h / 2;
                const fallbackClass = el.getAttribute('class') ?? '';
                boxes = [{
                    index: useIndex,
                    page,
                    x,
                    y,
                    w,
                    h,
                    centerX,
                    centerY,
                    classes: fallbackClass,
                }];
            }
            } else {
                console.log('[refreshSelectionOverlay] No element at index', useIndex);
            }
        }

        if (boxes.length === 0) {
            console.log('[refreshSelectionOverlay] No element found, clearing selection state');
            setSelectionBoxes([]);
            setSelectedElement(null);
            setSelectedPoint(null);
            setSelectedIndex(null);
            setSelectedElementClasses('');
            setSelectedLayoutBreakSubtype(null);
            return;
        }

        setSelectionBoxes(boxes);

        let primary: SelectionBox | null = null;
        if (usePoint) {
            const targetPage = usePoint.page ?? 0;
            const samePage = boxes.filter(box => box.page === targetPage);
            const pool = samePage.length > 0 ? samePage : boxes;
            primary = pool.reduce((best, box) => {
                if (!best) return box;
                const bestDist = Math.hypot(best.centerX - usePoint.x, best.centerY - usePoint.y);
                const dist = Math.hypot(box.centerX - usePoint.x, box.centerY - usePoint.y);
                return dist < bestDist ? box : best;
            }, null as SelectionBox | null);
        } else if (useIndex !== null) {
            primary = boxes.find(box => box.index === useIndex) ?? boxes[0];
        } else {
            primary = boxes[0];
        }

        if (!primary) {
            console.log('[refreshSelectionOverlay] No primary box found, returning');
            return;
        }

        console.log('[refreshSelectionOverlay] Setting selectedElement');
        setSelectedElement({ x: primary.x, y: primary.y, w: primary.w, h: primary.h });
        setSelectedPoint({ page: primary.page, x: primary.centerX, y: primary.centerY });
        setSelectedIndex(primary.index);
        setSelectedElementClasses(primary.classes);
        console.log('[refreshSelectionOverlay] Done updating selection');
    };

    const advanceSelectionOverlay = (
        startIndex?: number | null,
        startPoint?: { page: number, x: number, y: number } | null,
        step: number = 1,
    ) => {
        if (!containerRef.current) {
            return;
        }
        const allElements = Array.from(containerRef.current.querySelectorAll(ELEMENT_SELECTION_SELECTOR));
        if (allElements.length === 0) {
            return;
        }

        let index = startIndex ?? selectedIndex;
        const fallbackPoint = startPoint
            ?? selectedPoint
            ?? (selectedElement
                ? { page: 0, x: selectedElement.x + selectedElement.w / 2, y: selectedElement.y + selectedElement.h / 2 }
                : null);
        if (fallbackPoint) {
            const containerRect = containerRef.current.getBoundingClientRect();
            index = allElements.reduce((bestIdx, el, idx) => {
                const rect = el.getBoundingClientRect();
                const centerX = (rect.left - containerRect.left + rect.width / 2) / zoom;
                const centerY = (rect.top - containerRect.top + rect.height / 2) / zoom;
                const bestRect = allElements[bestIdx]?.getBoundingClientRect();
                const bestCenterX = bestRect
                    ? (bestRect.left - containerRect.left + bestRect.width / 2) / zoom
                    : centerX;
                const bestCenterY = bestRect
                    ? (bestRect.top - containerRect.top + bestRect.height / 2) / zoom
                    : centerY;
                const bestDist = Math.hypot(bestCenterX - fallbackPoint.x, bestCenterY - fallbackPoint.y);
                const dist = Math.hypot(centerX - fallbackPoint.x, centerY - fallbackPoint.y);
                return dist < bestDist ? idx : bestIdx;
            }, 0);
        }

        const baseIndex = index ?? 0;
        const nextIndex = Math.min(allElements.length - 1, Math.max(0, baseIndex + step));
        const target = allElements[nextIndex];
        if (!target) {
            return;
        }

        const rect = target.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();
        const x = (rect.left - containerRect.left) / zoom;
        const y = (rect.top - containerRect.top) / zoom;
        const w = rect.width / zoom;
        const h = rect.height / zoom;
        if (!(w > 0 && h > 0)) {
            return;
        }
        const page = extractPageIndex(target) ?? 0;
        const centerX = x + w / 2;
        const centerY = y + h / 2;
        const box: SelectionBox = {
            index: nextIndex,
            page,
            x,
            y,
            w,
            h,
            centerX,
            centerY,
        };

        setSelectionBoxes([box]);
        setSelectedElement({ x, y, w, h });
        setSelectedPoint({ page, x: centerX, y: centerY });
        setSelectedIndex(nextIndex);
    };

    const goToPage = async (targetPage: number) => {
        if (!score || targetPage < 0 || targetPage >= pageCount) {
            return;
        }
        setCurrentPage(targetPage);
        try {
            await renderScore(score, targetPage);
            refreshSelectionOverlay(selectedIndex, selectedPoint);
        } catch (err) {
            console.error('Failed to change page:', err);
        }
    };

    const handlePrevPage = () => {
        if (currentPage <= 0) {
            return;
        }
        void goToPage(currentPage - 1);
    };

    const handleNextPage = () => {
        if (currentPage >= pageCount - 1) {
            return;
        }
        void goToPage(currentPage + 1);
    };

    const handlePageSelect = (event: ChangeEvent<HTMLSelectElement>) => {
        const value = Number(event.target.value);
        if (Number.isNaN(value)) {
            return;
        }
        void goToPage(value);
    };

    const requireMutation = (methodName: keyof MutationMethods) => {
        const activeScore = scoreRef.current ?? score;
        const fn = activeScore && (activeScore as MutationMethods)[methodName];
        if (!fn) {
            console.warn(`Mutation binding "${methodName}" is missing on Score instance.`);
            alert(`This build of webmscore does not expose "${methodName}".`);
            return null;
        }
        return (...args: any[]) => (fn as any).apply(activeScore, args);
    };

    const promptForText = (label: string, defaultValue?: string) => {
        if (typeof window === 'undefined') {
            return null;
        }
        const response = window.prompt(label, defaultValue ?? '');
        return response === null ? null : response;
    };

    const performMutation = async (
        label: string,
        action?: (() => Promise<unknown> | unknown),
        options?: {
            clearSelection?: boolean;
            skipWasmReselect?: boolean;
            skipSelectionFallback?: boolean;
            skipRelayout?: boolean;
            advanceSelection?: boolean;
            advanceSelectionStep?: number;
        },
    ) => {
        if (!score) {
            console.warn(`Mutation "${label}" requested but no score is loaded.`);
            return;
        }
        if (!action) {
            console.warn(`Mutation "${label}" requested but binding is missing on Score instance.`);
            return;
        }

        // Preserve selection state before mutation for use in fallback
        const preservedIndex = selectedIndex;
        const preservedPoint = selectedPoint;
        const preservedMultiSelection = selectionBoxes.length > 1;
        const allowSelectionFallback = !options?.skipSelectionFallback;

        try {
            console.debug(`Mutation "${label}" start`);
            const result = await action();
            console.debug(`Mutation "${label}" result:`, result);
            const mutated = result !== false;
            if (!mutated) {
                console.warn(`Mutation "${label}" returned false (no-op).`);
            }

            // Clear selection if requested (e.g., for delete operations)
            if (options?.clearSelection) {
                blockOverlayRefreshRef.current = true;
                selectionOverlayGenerationRef.current += 1;
                setOverlaySuppressed(true);
                setSelectedElement(null);
                setSelectionBoxes([]);
                setSelectedPoint(null);
                setSelectedIndex(null);
                setSelectedElementClasses('');
                setSelectedLayoutBreakSubtype(null);
            }

            if (!mutated) {
                return;
            }
            setScoreDirtySinceCheckpoint(true);
            setScoreDirtySinceXml(true);

            if (!options?.skipRelayout && score.relayout) {
                try {
                    await score.relayout();
                } catch (relayoutErr) {
                    console.warn('Relayout after mutation failed:', relayoutErr);
                }
            }
            const refreshedPage = await refreshPageCount(score, currentPageRef.current);
            await renderScore(score, refreshedPage);

            // Re-establish selection inside WASM if we had a previously known point.
            if (!options?.skipWasmReselect && !preservedMultiSelection && preservedPoint && score.selectElementAtPoint) {
                try {
                    await score.selectElementAtPoint(preservedPoint.page, preservedPoint.x, preservedPoint.y);
                } catch (reselectErr) {
                    console.warn('Re-select in WASM after mutation failed; continuing with overlay fallback', reselectErr);
                }
            }

            // If selection wasn't cleared, restore preserved state for fallback
            if (!options?.clearSelection && allowSelectionFallback) {
                if (preservedIndex !== null && selectedIndex === null) {
                    setSelectedIndex(preservedIndex);
                }
                if (preservedPoint && !selectedPoint) {
                    setSelectedPoint(preservedPoint);
                }
            }

            if (options?.clearSelection) {
                return;
            }

            // Schedule overlay refresh after the DOM has had time to update
            // Use a double-RAF to ensure the DOM is fully parsed and rendered
            // Pass preserved values to handle async state updates
            const fallbackIndex = allowSelectionFallback ? preservedIndex : null;
            const fallbackPoint = allowSelectionFallback ? preservedPoint : null;
            const advanceSelection = options?.advanceSelection;
            const advanceStep = options?.advanceSelectionStep ?? 1;
            console.log('[performMutation] Scheduling refresh with preservedIndex:', fallbackIndex, 'preservedPoint:', fallbackPoint);
            if (typeof window !== 'undefined') {
                window.requestAnimationFrame(() => {
                    console.log('[performMutation] RAF 1');
                    window.requestAnimationFrame(() => {
                        console.log('[performMutation] RAF 2, calling refreshSelectionOverlay');
                        if (advanceSelection) {
                            advanceSelectionOverlay(preservedIndex, preservedPoint, advanceStep);
                        } else {
                            refreshSelectionOverlay(fallbackIndex, fallbackPoint);
                        }
                    });
                });
            } else {
                if (advanceSelection) {
                    advanceSelectionOverlay(preservedIndex, preservedPoint, advanceStep);
                } else {
                    refreshSelectionOverlay(fallbackIndex, fallbackPoint);
                }
            }
        } catch (err) {
            console.error(`Mutation "${label}" failed:`, err);
            alert(`Unable to ${label}. Check the console for details.`);
        }
    };

    const scheduleSelectionOverlayRefresh = (
        fallbackIndex?: number | null,
        fallbackPoint?: { page: number, x: number, y: number } | null,
        generation?: number,
    ) => {
        // Use a double-RAF to ensure the new SVG is fully parsed and has layout boxes.
        if (typeof window === 'undefined') {
            refreshSelectionOverlay(fallbackIndex, fallbackPoint, generation);
            return;
        }

        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                refreshSelectionOverlay(fallbackIndex, fallbackPoint, generation);
            });
        });
    };

    const refreshSelectionFromSvg = async (fallback?: SelectionFallback) => {
        if (!score) return;
        blockOverlayRefreshRef.current = false;
        try {
            setOverlaySuppressed(false);
            await renderScore(score, currentPageRef.current);
            const generation = ++selectionOverlayGenerationRef.current;
            scheduleSelectionOverlayRefresh(fallback?.index ?? null, fallback?.point ?? null, generation);
        } catch (err) {
            console.warn('Failed to refresh selection highlight from SVG:', err);
        }
    };

    const handleDeleteSelection = () => performMutation('delete selection', async () => {
        await ensureSelectionInWasm();
        const del = requireMutation('deleteSelection');
        if (!del) {
            return false;
        }
        return await del();
    }, { clearSelection: true });
    const handleSelectedTextChange = (value: string) => {
        setSelectedTextValue(value);
    };
    const handleApplySelectedText = () => performMutation('set selected text', async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('setSelectedText');
        if (!fn) {
            return false;
        }
        return fn(selectedTextValue);
    });
    const handleUndo = () => performMutation('undo', score?.undo?.bind(score));
    const handleRedo = () => performMutation('redo', score?.redo?.bind(score));
    const handlePitchUp = () => performMutation('raise pitch', async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('pitchUp');
        if (!fn) return;
        return fn();
    });
    const handlePitchDown = () => performMutation('lower pitch', async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('pitchDown');
        if (!fn) return;
        return fn();
    });
    const handleTranspose = (semitones: number) => performMutation(`transpose ${semitones}`, async () => {
        const fn = requireMutation('transpose');
        if (!fn) return;
        return fn(semitones);
    }, { skipWasmReselect: true });
    const handleInsertMeasures = (count: number, target: MeasureInsertTarget) => performMutation('insert measures', async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('insertMeasures');
        if (!fn) return false;
        const sanitized = Math.max(1, Math.floor(count));
        const targetValue = measureInsertTargetMap[target] ?? measureInsertTargetMap['after-selection'];
        return fn(sanitized, targetValue);
    });
    const handleRemoveTrailingEmptyMeasures = () => performMutation('remove trailing empty measures', async () => {
        const fn = requireMutation('removeTrailingEmptyMeasures');
        if (!fn) return false;
        return fn();
    }, { clearSelection: true, skipWasmReselect: true });
    const handleSelectNextChord = async () => {
        if (!score) return;
        await ensureSelectionInWasm();
        const selectFn = requireMutation('selectNextChord');
        if (!selectFn) {
            return;
        }

        const result = await selectFn.call(score);
        if (!result) {
            return;
        }

        let targetPage = currentPageRef.current;
        const activeScore = scoreRef.current ?? score;
        const getBBoxFn = (activeScore as MutationMethods).getSelectionBoundingBox;
        if (typeof getBBoxFn === 'function') {
            const bbox = await getBBoxFn.call(activeScore);
            if (bbox && typeof bbox.page === 'number') {
                targetPage = bbox.page;
            }
        }

        if (targetPage !== currentPageRef.current) {
            await goToPage(targetPage);
            return;
        }

        await refreshSelectionFromSvg();
    };
    const handleSelectPrevChord = async () => {
        if (!score) return;
        await ensureSelectionInWasm();
        const selectFn = requireMutation('selectPrevChord');
        if (!selectFn) {
            return;
        }

        const result = await selectFn.call(score);
        if (!result) {
            return;
        }

        let targetPage = currentPageRef.current;
        const activeScore = scoreRef.current ?? score;
        const getBBoxFn = (activeScore as MutationMethods).getSelectionBoundingBox;
        if (typeof getBBoxFn === 'function') {
            const bbox = await getBBoxFn.call(activeScore);
            if (bbox && typeof bbox.page === 'number') {
                targetPage = bbox.page;
            }
        }

        if (targetPage !== currentPageRef.current) {
            await goToPage(targetPage);
            return;
        }

        await refreshSelectionFromSvg();
    };
    const handleExtendSelectionNextChord = async () => {
        if (!score) return;
        console.log('[NAV] handleExtendSelectionNextChord called');
        await ensureSelectionInWasm();
        const extendFn = requireMutation('extendSelectionNextChord');
        const getBBoxesFn = requireMutation('getSelectionBoundingBoxes');
        if (!extendFn || !getBBoxesFn) {
            console.log('[NAV] Missing functions for extend selection');
            return;
        }

        const result = await extendFn.call(score);
        console.log('[NAV] extendSelectionNextChord result:', result);
        if (result) {
            const bboxes = await getBBoxesFn.call(score);
            console.log('[NAV] getSelectionBoundingBoxes result:', bboxes);

            await renderScore(score, currentPageRef.current);
            if (bboxes && bboxes.length > 0) {
                // Update selection boxes for all selected elements
                const boxes = bboxes.map((bbox: { page: number; x: number; y: number; width: number; height: number }, index: number) => ({
                    index,
                    page: bbox.page,
                    x: bbox.x,
                    y: bbox.y,
                    w: bbox.width,
                    h: bbox.height,
                    centerX: bbox.x + bbox.width / 2,
                    centerY: bbox.y + bbox.height / 2,
                }));
                // Use the last element for selectedElement and selectedPoint
                const lastBbox = bboxes[bboxes.length - 1];
                setSelectedElement({ x: lastBbox.x, y: lastBbox.y, w: lastBbox.width, h: lastBbox.height });
                setSelectedPoint({ page: lastBbox.page, x: lastBbox.x + lastBbox.width / 2, y: lastBbox.y + lastBbox.height / 2 });
                setSelectionBoxes(boxes);
            }
        }
    };
    const handleExtendSelectionPrevChord = async () => {
        if (!score) return;
        console.log('[NAV] handleExtendSelectionPrevChord called');
        await ensureSelectionInWasm();
        const extendFn = requireMutation('extendSelectionPrevChord');
        const getBBoxesFn = requireMutation('getSelectionBoundingBoxes');
        if (!extendFn || !getBBoxesFn) {
            console.log('[NAV] Missing functions for extend selection');
            return;
        }

        const result = await extendFn.call(score);
        console.log('[NAV] extendSelectionPrevChord result:', result);
        if (result) {
            const bboxes = await getBBoxesFn.call(score);
            console.log('[NAV] getSelectionBoundingBoxes result:', bboxes);

            await renderScore(score, currentPageRef.current);
            if (bboxes && bboxes.length > 0) {
                // Update selection boxes for all selected elements
                const boxes = bboxes.map((bbox: { page: number; x: number; y: number; width: number; height: number }, index: number) => ({
                    index,
                    page: bbox.page,
                    x: bbox.x,
                    y: bbox.y,
                    w: bbox.width,
                    h: bbox.height,
                    centerX: bbox.x + bbox.width / 2,
                    centerY: bbox.y + bbox.height / 2,
                }));
                // Use the first element for selectedElement and selectedPoint
                const firstBbox = bboxes[0];
                setSelectedElement({ x: firstBbox.x, y: firstBbox.y, w: firstBbox.width, h: firstBbox.height });
                setSelectedPoint({ page: firstBbox.page, x: firstBbox.x + firstBbox.width / 2, y: firstBbox.y + firstBbox.height / 2 });
                setSelectionBoxes(boxes);
            }
        }
    };
    const handleSetAccidental = (accidentalType: number) => {
        return performMutation(`set accidental ${accidentalType}`, async () => {
            await ensureSelectionInWasm();
            const fn = requireMutation('setAccidental');
            if (!fn) return;
            return fn(accidentalType);
        });
    };
    const handleDurationLonger = () => performMutation('lengthen duration', async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('doubleDuration');
        if (!fn) return;
        return fn();
    });
    const handleDurationShorter = () => performMutation('shorten duration', async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('halfDuration');
        if (!fn) return;
        return fn();
    });

    const handleToggleDot = () => performMutation('toggle dot', async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('toggleDot');
        if (!fn) return;
        return fn();
    });

    const handleToggleDoubleDot = () => performMutation('toggle double dot', async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('toggleDoubleDot');
        if (!fn) return;
        return fn();
    });

    const handleSetDurationType = (durationType: number) => performMutation('set duration', async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('setDurationType');
        if (!fn) return;
        return fn(durationType);
    });

    const handleAddPitchByStep = (noteIndex: number, addToChord: boolean) => {
        const shouldAdvance = !addToChord;
        return performMutation('add pitch', async () => {
            await ensureSelectionInWasm();
            const fn = requireMutation('addPitchByStep');
            if (!fn) return;
            return fn(noteIndex, addToChord, false);
        }, {
            skipWasmReselect: true,
            skipSelectionFallback: shouldAdvance,
            advanceSelection: shouldAdvance,
        });
    };

    const handleEnterRest = () => performMutation('enter rest', async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('enterRest');
        if (!fn) return;
        return fn();
    }, { skipWasmReselect: true, skipSelectionFallback: true, advanceSelection: true });

    const handleToggleLineBreak = () => performMutation('toggle line break', async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('toggleLineBreak');
        if (!fn) return;
        return fn();
    }, { skipWasmReselect: true });

    const handleTogglePageBreak = () => performMutation('toggle page break', async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('togglePageBreak');
        if (!fn) return;
        return fn();
    }, { skipWasmReselect: true });

    const handleSetVoice = (voiceIndex: number) => {
        const hasSelection = Boolean(selectedElement) || selectionBoxes.length > 0;
        if (!hasSelection) {
            alert('Select notes or rests to move them to another voice.');
            return;
        }
        return performMutation(`change voice ${voiceIndex + 1}`, async () => {
            await ensureSelectionInWasm();
            const fn = requireMutation('changeSelectedElementsVoice');
            if (!fn) return;
            return fn(voiceIndex);
        });
    };

    const handleAddDynamic = (dynamicType: number) => performMutation('add dynamic', async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('addDynamic');
        if (!fn) return;
        return fn(dynamicType);
    });

    const handleAddHairpin = (hairpinType: number) => performMutation('add hairpin', async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('addHairpin');
        if (!fn) return;
        return fn(hairpinType);
    });

    const handleAddPedal = (pedalVariant: number) => performMutation('add pedal', async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('addPedal');
        if (!fn) return;
        return fn(pedalVariant);
    });

    const handleAddSostenutoPedal = () => performMutation('add sostenuto pedal', async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('addSostenutoPedal');
        if (!fn) return;
        return fn();
    });

    const handleAddUnaCorda = () => performMutation('add una corda', async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('addUnaCorda');
        if (!fn) return;
        return fn();
    });

    const handleSplitPedal = () => performMutation('split pedal', async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('splitPedal');
        if (!fn) return;
        return fn();
    });

    const handleAddTempoText = (bpm: number) => {
        const hadSelection = Boolean(selectedElement);
        return performMutation('add tempo text', async () => {
            const fn = requireMutation('addTempoText');
            if (!fn) return;
            return fn(bpm);
        }, hadSelection ? undefined : { clearSelection: true });
    };

    const handleAddArticulation = (articulationSymbolName: string) => performMutation(`add articulation ${articulationSymbolName}`, async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('addArticulation');
        if (!fn) return;
        return fn(articulationSymbolName);
    });

    const handleAddSlur = () => performMutation('add slur', async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('addSlur');
        if (!fn) return;
        return fn();
    });

    const handleAddTie = () => performMutation('add tie', async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('addTie');
        if (!fn) return;
        return fn();
    });

    const handleAddGraceNote = (graceType: number) => performMutation(`add grace note ${graceType}`, async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('addGraceNote');
        if (!fn) return;
        return fn(graceType);
    });

    const handleAddTuplet = (tupletCount: number) => performMutation(`add tuplet ${tupletCount}`, async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('addTuplet');
        if (!fn) return;
        return fn(tupletCount);
    });

    const handleAddStaffText = () => {
        const text = promptForText('Staff text:');
        if (text === null) {
            return;
        }
        return performMutation('add staff text', async () => {
            await ensureSelectionInWasm();
            const fn = requireMutation('addStaffText');
            if (!fn) return;
            return fn(text);
        });
    };

    const handleAddSystemText = () => {
        const text = promptForText('System text:');
        if (text === null) {
            return;
        }
        return performMutation('add system text', async () => {
            await ensureSelectionInWasm();
            const fn = requireMutation('addSystemText');
            if (!fn) return;
            return fn(text);
        });
    };

    const handleAddExpressionText = () => {
        const text = promptForText('Expression text:');
        if (text === null) {
            return;
        }
        return performMutation('add expression text', async () => {
            await ensureSelectionInWasm();
            const fn = requireMutation('addExpressionText');
            if (!fn) return;
            return fn(text);
        });
    };

    const handleAddLyricText = () => {
        const text = promptForText('Lyrics text:');
        if (text === null) {
            return;
        }
        return performMutation('add lyric text', async () => {
            await ensureSelectionInWasm();
            const fn = requireMutation('addLyricText');
            if (!fn) return;
            return fn(text);
        });
    };

    const harmonyLabels: Record<HarmonyVariant, string> = {
        0: 'Chord symbol',
        1: 'Roman numeral',
        2: 'Nashville number',
    };

    const handleAddHarmonyText = (variant: HarmonyVariant) => {
        const label = harmonyLabels[variant];
        const text = promptForText(`${label} text:`);
        if (text === null) {
            return;
        }
        return performMutation(`${label.toLowerCase()} text`, async () => {
            await ensureSelectionInWasm();
            const fn = requireMutation('addHarmonyText');
            if (!fn) return;
            return fn(variant, text);
        });
    };

    const handleAddFingeringText = () => {
        const text = promptForText('Fingering text:');
        if (text === null) {
            return;
        }
        return performMutation('add fingering text', async () => {
            await ensureSelectionInWasm();
            const fn = requireMutation('addFingeringText');
            if (!fn) return;
            return fn(text);
        });
    };

    const handleAddLeftHandGuitarFingeringText = () => {
        const text = promptForText('Left-hand guitar fingering text:');
        if (text === null) {
            return;
        }
        return performMutation('add left-hand guitar fingering text', async () => {
            await ensureSelectionInWasm();
            const fn = requireMutation('addLeftHandGuitarFingeringText');
            if (!fn) return;
            return fn(text);
        });
    };

    const handleAddRightHandGuitarFingeringText = () => {
        const text = promptForText('Right-hand guitar fingering text:');
        if (text === null) {
            return;
        }
        return performMutation('add right-hand guitar fingering text', async () => {
            await ensureSelectionInWasm();
            const fn = requireMutation('addRightHandGuitarFingeringText');
            if (!fn) return;
            return fn(text);
        });
    };

    const handleAddStringNumberText = () => {
        const text = promptForText('String number text:');
        if (text === null) {
            return;
        }
        return performMutation('add string number text', async () => {
            await ensureSelectionInWasm();
            const fn = requireMutation('addStringNumberText');
            if (!fn) return;
            return fn(text);
        });
    };

    const handleAddInstrumentChangeText = () => {
        const text = promptForText('Instrument change text:');
        if (text === null) {
            return;
        }
        return performMutation('add instrument change text', async () => {
            await ensureSelectionInWasm();
            const fn = requireMutation('addInstrumentChangeText');
            if (!fn) return;
            return fn(text);
        });
    };

    const handleAddStickingText = () => {
        const text = promptForText('Sticking text:');
        if (text === null) {
            return;
        }
        return performMutation('add sticking text', async () => {
            await ensureSelectionInWasm();
            const fn = requireMutation('addStickingText');
            if (!fn) return;
            return fn(text);
        });
    };

    const handleAddFiguredBassText = () => {
        const text = promptForText('Figured bass text:');
        if (text === null) {
            return;
        }
        return performMutation('add figured bass text', async () => {
            await ensureSelectionInWasm();
            const fn = requireMutation('addFiguredBassText');
            if (!fn) return;
            return fn(text);
        });
    };

    const handleAddNoteFromRest = () => performMutation('add note', async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('addNoteFromRest');
        if (!fn) return;
        return fn();
    });

    const handleToggleRepeatStart = () => performMutation('toggle repeat start', async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('toggleRepeatStart');
        if (!fn) return;
        return fn();
    });

    const handleToggleRepeatEnd = () => performMutation('toggle repeat end', async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('toggleRepeatEnd');
        if (!fn) return;
        return fn();
    });

    const handleSetRepeatCount = (count: number) => performMutation(`set repeat count ${count}`, async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('setRepeatCount');
        if (!fn) return;
        return fn(count);
    });

    const handleSetBarLineType = (barLineType: number) => performMutation(`set barline type ${barLineType}`, async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('setBarLineType');
        if (!fn) return;
        return fn(barLineType);
    });

    const handleAddVolta = (endingNumber: number) => performMutation(`add volta ${endingNumber}`, async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('addVolta');
        if (!fn) return;
        return fn(endingNumber);
    });

    const handleSetTitleText = async () => {
        if (!score) {
            return;
        }

        await performMutation('set title', async () => {
            const fn = requireMutation('setTitleText');
            if (!fn) return;
            return fn(scoreTitle);
        }, { skipWasmReselect: true });
        await refreshScoreMetadata(score);
    };

    const handleSetSubtitleText = async () => {
        if (!score) {
            return;
        }

        await performMutation('set subtitle', async () => {
            const fn = requireMutation('setSubtitleText');
            if (!fn) return;
            return fn(scoreSubtitle);
        }, { skipWasmReselect: true });
        await refreshScoreMetadata(score);
    };

    const handleSetComposerText = async () => {
        if (!score) {
            return;
        }

        await performMutation('set composer', async () => {
            const fn = requireMutation('setComposerText');
            if (!fn) return;
            return fn(scoreComposer);
        }, { skipWasmReselect: true });
        await refreshScoreMetadata(score);
    };

    const handleSetLyricistText = async () => {
        if (!score) {
            return;
        }

        await performMutation('set lyricist', async () => {
            const fn = requireMutation('setLyricistText');
            if (!fn) return;
            return fn(scoreLyricist);
        }, { skipWasmReselect: true });
        await refreshScoreMetadata(score);
    };

    const handleAddPart = async (instrumentId: string) => {
        if (!score || !instrumentId) {
            return;
        }

        await performMutation('add instrument', async () => {
            const fn = requireMutation('appendPart');
            if (!fn) return;
            return fn(instrumentId);
        }, { skipWasmReselect: true });
        await refreshScoreMetadata(score);
    };

    const handleRemovePart = async (partIndex: number) => {
        if (!score) {
            return;
        }

        await performMutation('remove instrument', async () => {
            const fn = requireMutation('removePart');
            if (!fn) return;
            return fn(partIndex);
        }, { clearSelection: true, skipWasmReselect: true });
        await refreshScoreMetadata(score);
    };

    const handleTogglePartVisible = async (partIndex: number, visible: boolean) => {
        if (!score) {
            return;
        }

        await performMutation('toggle part visibility', async () => {
            const fn = requireMutation('setPartVisible');
            if (!fn) return;
            return fn(partIndex, visible);
        }, { skipWasmReselect: true });
        await refreshScoreMetadata(score);
    };

    const handleCopySelection = async () => {
        if (!score) {
            return false;
        }
        await ensureSelectionInWasm();
        const getType = requireMutation('selectionMimeType');
        const getData = requireMutation('selectionMimeData');
        if (!getType || !getData) {
            return false;
        }
        const mimeType = await getType();
        if (!mimeType) {
            return false;
        }
        const data = await getData();
        if (!data || data.length === 0) {
            return false;
        }
        clipboardRef.current = { mimeType, data: data instanceof Uint8Array ? data : new Uint8Array(data) };
        return true;
    };

    const handlePasteSelection = () => performMutation('paste selection', async () => {
        const clip = clipboardRef.current;
        if (!clip) {
            alert('Nothing copied yet.');
            return false;
        }
        await ensureSelectionInWasm();
        const fn = requireMutation('pasteSelection');
        if (!fn) return;
        return fn(clip.mimeType, clip.data);
    }, { skipWasmReselect: true });

    const isEditableTarget = (target: EventTarget | null) => {
        if (!(target instanceof HTMLElement)) {
            return false;
        }
        const tagName = target.tagName.toLowerCase();
        return target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select';
    };

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || !score) {
                return;
            }
            if (isEditableTarget(event.target)) {
                return;
            }

            const rawKey = event.key;
            const key = rawKey.toLowerCase();
            const isMod = event.ctrlKey || event.metaKey;

            if (isMod) {
                if (key === 'z') {
                    event.preventDefault();
                    if (event.shiftKey) {
                        handleRedo();
                    } else {
                        handleUndo();
                    }
                    return;
                }
                if (key === 'y') {
                    event.preventDefault();
                    handleRedo();
                    return;
                }
                if (key === 'c') {
                    event.preventDefault();
                    handleCopySelection();
                    return;
                }
                if (key === 'v') {
                    event.preventDefault();
                    handlePasteSelection();
                    return;
                }
            }

            if (!isMod) {
                const noteMap: Record<string, number> = {
                    c: 0,
                    d: 1,
                    e: 2,
                    f: 3,
                    g: 4,
                    a: 5,
                    b: 6,
                };
                const durationMap: Record<string, number> = {
                    '1': 8, // DurationType::V_64TH
                    '2': 7, // DurationType::V_32ND
                    '3': 6, // DurationType::V_16TH
                    '4': 5, // DurationType::V_EIGHTH
                    '5': 4, // DurationType::V_QUARTER
                    '6': 3, // DurationType::V_HALF
                    '7': 2, // DurationType::V_WHOLE
                    '8': 1, // DurationType::V_BREVE
                };
                const hasSelection = Boolean(selectedElement) || selectionBoxes.length > 0;

                if (mutationEnabled && hasSelection) {
                    if (rawKey in durationMap) {
                        event.preventDefault();
                        handleSetDurationType(durationMap[rawKey]);
                        return;
                    }

                    if (rawKey === '0') {
                        event.preventDefault();
                        handleEnterRest();
                        return;
                    }

                    if (rawKey === '.') {
                        event.preventDefault();
                        handleToggleDot();
                        return;
                    }

                    if (rawKey === '+') {
                        event.preventDefault();
                        handleSetAccidental(3);
                        return;
                    }

                    if (rawKey === '-') {
                        event.preventDefault();
                        handleSetAccidental(1);
                        return;
                    }

                    if (rawKey === '=') {
                        event.preventDefault();
                        handleSetAccidental(2);
                        return;
                    }

                    if (rawKey === 'T') {
                        event.preventDefault();
                        handleAddTie();
                        return;
                    }

                    if (!event.altKey && key in noteMap) {
                        event.preventDefault();
                        handleAddPitchByStep(noteMap[key], event.shiftKey);
                        return;
                    }
                }

            }

            if (key === 'arrowup' || key === 'arrowdown') {
                if (!mutationEnabled) {
                    return;
                }
                const hasSelection = Boolean(selectedElement) || selectionBoxes.length > 0;
                if (!hasSelection) {
                    return;
                }
                event.preventDefault();
                if (isMod) {
                    handleTranspose(key === 'arrowup' ? 12 : -12);
                } else if (key === 'arrowup') {
                    handlePitchUp();
                } else {
                    handlePitchDown();
                }
                return;
            }

            if (key === 'arrowleft' || key === 'arrowright') {
                if (!mutationEnabled) {
                    return;
                }
                const hasSelection = Boolean(selectedElement) || selectionBoxes.length > 0;
                if (!hasSelection) {
                    return;
                }
                event.preventDefault();
                if (event.shiftKey) {
                    // Shift+Arrow extends selection (range selection)
                    if (key === 'arrowright') {
                        handleExtendSelectionNextChord();
                    } else {
                        handleExtendSelectionPrevChord();
                    }
                } else {
                    // Arrow alone moves selection
                    if (key === 'arrowright') {
                        handleSelectNextChord();
                    } else {
                        handleSelectPrevChord();
                    }
                }
                return;
            }

            if (key === 'delete' || key === 'backspace') {
                if (mutationEnabled && (selectedElement || selectionBoxes.length > 0)) {
                    event.preventDefault();
                    if (selectedLayoutBreakSubtype === 'line') {
                        handleToggleLineBreak();
                        return;
                    }
                    if (selectedLayoutBreakSubtype === 'page') {
                        handleTogglePageBreak();
                        return;
                    }
                    handleDeleteSelection();
                }
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [
        score,
        mutationEnabled,
        selectedElement,
        selectionBoxes.length,
        handleAddPitchByStep,
        handleEnterRest,
        handleSetAccidental,
        handleSetDurationType,
        handleToggleDot,
        handleAddTie,
        handleUndo,
        handleRedo,
        handlePitchUp,
        handlePitchDown,
        handleTranspose,
        handleSelectNextChord,
        handleSelectPrevChord,
        handleExtendSelectionNextChord,
        handleExtendSelectionPrevChord,
        handleDeleteSelection,
        handleCopySelection,
        handlePasteSelection,
    ]);

    const handleSetTimeSignature = async (num: number, den: number, timeSigType?: number) => {
        if (!score || !score.setTimeSignature) return;
        const preservedIndex = selectedIndex;
        const preservedPoint = selectedPoint;
        setAudioBusy(true);
        try {
            await ensureSelectionInWasm();
            if (typeof timeSigType === 'number' && score.setTimeSignatureWithType) {
                await score.setTimeSignatureWithType(num, den, timeSigType);
            } else {
                if (typeof timeSigType === 'number' && !score.setTimeSignatureWithType) {
                    console.warn('Time signature type requested but not supported by this WASM build.');
                }
                await score.setTimeSignature(num, den);
            }
            if (score.relayout) {
                await score.relayout();
            }
            await renderScore(score);
            scheduleSelectionOverlayRefresh(preservedIndex, preservedPoint, selectionOverlayGenerationRef.current);
        } catch (err) {
            console.error('Failed to set time signature', err);
            alert('Unable to set time signature. See console for details.');
        } finally {
            setAudioBusy(false);
        }
    };

    const handleSetKeySignature = async (fifths: number) => {
        if (!score || !score.setKeySignature) return;
        const preservedIndex = selectedIndex;
        const preservedPoint = selectedPoint;
        setAudioBusy(true);
        try {
            await ensureSelectionInWasm();
            await score.setKeySignature(fifths);
            if (score.relayout) {
                await score.relayout();
            }
            await renderScore(score);
            scheduleSelectionOverlayRefresh(preservedIndex, preservedPoint, selectionOverlayGenerationRef.current);
        } catch (err) {
            console.error('Failed to set key signature', err);
            alert('Unable to set key signature. See console for details.');
        } finally {
            setAudioBusy(false);
        }
    };

    const handleSetClef = async (clefType: number) => {
        if (!score || !score.setClef) return;
        const preservedIndex = selectedIndex;
        const preservedPoint = selectedPoint;
        setAudioBusy(true);
        try {
            await ensureSelectionInWasm();
            await score.setClef(clefType);
            if (score.relayout) {
                await score.relayout();
            }
            await renderScore(score);
            scheduleSelectionOverlayRefresh(preservedIndex, preservedPoint, selectionOverlayGenerationRef.current);
        } catch (err) {
            console.error('Failed to set clef', err);
            alert('Unable to set clef. See console for details.');
        } finally {
            setAudioBusy(false);
        }
    };

    const downloadBlob = (data: BlobPart, filename: string, mime: string) => {
        const blob = new Blob([data], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleExportSvg = async () => {
        if (!score) return;
        try {
            const svg = await score.saveSvg(0, true);
            downloadBlob(svg, 'score.svg', 'image/svg+xml');
        } catch (err) {
            console.error('Failed to export SVG', err);
            alert('Unable to export SVG. See console for details.');
        }
    };

    const handleExportPdf = async () => {
        if (!score) return;
        try {
            const pdf = await score.savePdf();
            downloadBlob(pdf, 'score.pdf', 'application/pdf');
        } catch (err) {
            console.error('Failed to export PDF', err);
            alert('Unable to export PDF. See console for details.');
        }
    };

    const handleExportPng = async () => {
        if (!score || !score.savePng) {
            alert('PNG export is not available in this build.');
            return;
        }
        try {
            const png = await score.savePng(0, true, true);
            downloadBlob(png, 'score.png', 'image/png');
        } catch (err) {
            console.error('Failed to export PNG', err);
            alert('Unable to export PNG. See console for details.');
        }
    };

    const handleExportMxl = async () => {
        if (!score || !score.saveMxl) {
            alert('MXL export is not available in this build.');
            return;
        }
        try {
            const mxl = await score.saveMxl();
            downloadBlob(mxl, 'score.mxl', 'application/vnd.recordare.musicxml');
        } catch (err) {
            console.error('Failed to export MXL', err);
            alert('Unable to export MXL. See console for details.');
        }
    };

    const handleExportMscz = async () => {
        if (!score || !score.saveMsc) {
            alert('MSCZ export is not available in this build.');
            return;
        }
        try {
            const mscz = await score.saveMsc('mscz');
            downloadBlob(mscz, 'score.mscz', 'application/vnd.musescore.mscz');
        } catch (err) {
            console.error('Failed to export MSCZ', err);
            alert('Unable to export MSCZ. See console for details.');
        }
    };

    const handleExportMidi = async () => {
        if (!score || !score.saveMidi) {
            alert('MIDI export is not available in this build.');
            return;
        }
        try {
            const midi = await score.saveMidi(true, true);
            downloadBlob(midi, 'score.mid', 'audio/midi');
        } catch (err) {
            console.error('Failed to export MIDI', err);
            alert('Unable to export MIDI. See console for details.');
        }
    };

    const handleExportAudio = async () => {
        if (!score || !score.saveAudio) {
            alert('Audio export is not available in this build.');
            return;
        }
        try {
            setAudioBusy(true);
            const ok = await ensureSoundFontLoaded();
            if (!ok) {
                alert('No default soundfont found. Upload a .sf2/.sf3 soundfont or place one at /public/soundfonts/default.sf3 or /public/soundfonts/default.sf2.');
                return;
            }
            const wav = await score.saveAudio('wav');
            downloadBlob(wav, 'score.wav', 'audio/wav');
        } catch (err) {
            console.error('Failed to export audio', err);
            alert('Unable to export audio. See console for details.');
        } finally {
            setAudioBusy(false);
        }
    };

    const stopAudio = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }
        audioSourcesRef.current.forEach(src => {
            try {
                src.stop();
            } catch (_) {
                // ignore
            }
        });
        audioSourcesRef.current = [];
        const iter = streamIteratorRef.current;
        if (iter) {
            iter(true).catch(() => { /* ignore */ });
            streamIteratorRef.current = null;
        }
        setIsPlaying(false);
    };

    const playFromUrl = async (url: string) => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.src = '';
        }
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => setIsPlaying(false);
        await audio.play();
        setIsPlaying(true);
    };

    const handlePlayAudio = async () => {
        if (!score || !score.saveAudio) {
            alert('Audio playback is not available in this build.');
            return;
        }
        try {
            setAudioBusy(true);
            const ok = await ensureSoundFontLoaded();
            if (!ok) {
                alert('No default soundfont found. Upload a .sf2/.sf3 soundfont or place one at /public/soundfonts/default.sf3 or /public/soundfonts/default.sf2.');
                return;
            }
            stopAudio();

            // Prefer streaming via synthAudioBatch if available
            const useStreaming = typeof (score as any).synthAudioBatch === 'function';
            let streamed = false;
            if (useStreaming) {
                try {
                    const audioCtx = audioCtxRef.current || new AudioContext({ sampleRate: 44100 });
                    audioCtxRef.current = audioCtx;
                    if (audioCtx.state === 'suspended') {
                        await audioCtx.resume();
                    }
                    const batchFn = await (score as any).synthAudioBatch(0, 16);
                    streamIteratorRef.current = batchFn;
                    const baseTime = audioCtx.currentTime + 0.05;
                    let lastSource: AudioBufferSourceNode | null = null;
                    // Stream chunks until done
                    while (true) {
                        const batch = await batchFn(false);
                        if (!Array.isArray(batch) || batch.length === 0) {
                            break;
                        }
                        let hitDone = false;
                        for (const res of batch) {
                            if (!res) continue;
                            if (res.done) {
                                hitDone = true;
                            }
                            const floats = new Float32Array(res.chunk.buffer, res.chunk.byteOffset, res.chunk.byteLength / 4);
                            const framesPerChannel = 512; // from synthAudio docs
                            let channels = Math.floor(floats.length / framesPerChannel);
                            if (!Number.isInteger(channels) || channels < 1) channels = 1;
                            if (channels > 2) channels = 2; // cap to stereo
                            const buffer = audioCtx.createBuffer(channels, framesPerChannel, audioCtx.sampleRate);
                            for (let ch = 0; ch < channels; ch++) {
                                const start = ch * framesPerChannel;
                                const slice = floats.subarray(start, start + framesPerChannel);
                                buffer.copyToChannel(slice, ch);
                            }
                            const source = audioCtx.createBufferSource();
                            source.buffer = buffer;
                            source.connect(audioCtx.destination);
                            const startTime = baseTime + res.startTime;
                            source.start(startTime);
                            audioSourcesRef.current.push(source);
                            lastSource = source;
                            if (hitDone) break;
                        }
                        if (hitDone) break;
                    }
                    if (lastSource) {
                        lastSource.onended = () => {
                            setIsPlaying(false);
                            audioSourcesRef.current = [];
                            streamIteratorRef.current = null;
                        };
                    }
                    setIsPlaying(true);
                    streamed = true;
                } catch (streamErr) {
                    console.warn('Streaming playback failed; falling back to WAV', streamErr);
                    stopAudio();
                }
            }
            if (!streamed) {
                // Fallback to full WAV generation
                if (audioUrlRef.current) {
                    await playFromUrl(audioUrlRef.current);
                } else {
                    const wav = await score.saveAudio('wav');
                    const blob = new Blob([wav], { type: 'audio/wav' });
                    const url = URL.createObjectURL(blob);
                    audioUrlRef.current = url;
                    await playFromUrl(url);
                }
            }
        } catch (err) {
            console.error('Failed to play audio', err);
            alert('Unable to play audio. See console for details.');
            stopAudio();
        } finally {
            setAudioBusy(false);
        }
    };

    const handleZoomIn = () => {
        setZoom(prev => clampZoom(prev + 0.1));
    };

    const handleZoomOut = () => {
        setZoom(prev => clampZoom(prev - 0.1));
    };

    const parsePxValue = (value: string | null) => {
        const parsed = value ? Number.parseFloat(value) : NaN;
        return Number.isFinite(parsed) ? parsed : 0;
    };

    const computeFitZoom = (axis: 'width' | 'height'): number | null => {
        if (!scrollContainerRef.current || !scoreWrapperRef.current || zoom <= 0) {
            return null;
        }

        const container = scrollContainerRef.current;
        const style = window.getComputedStyle(container);
        const paddingLeft = parsePxValue(style.paddingLeft);
        const paddingRight = parsePxValue(style.paddingRight);
        const paddingBottom = parsePxValue(style.paddingBottom);

        let availableSize = 0;
        if (axis === 'width') {
            availableSize = container.clientWidth - paddingLeft - paddingRight;
        } else {
            const wrapperOffsetTop = scoreWrapperRef.current.offsetTop;
            availableSize = container.clientHeight - wrapperOffsetTop - paddingBottom;
        }

        if (availableSize <= 0) {
            return null;
        }

        const wrapperRect = scoreWrapperRef.current.getBoundingClientRect();
        const pageSize = axis === 'width' ? wrapperRect.width : wrapperRect.height;
        if (pageSize <= 0) {
            return null;
        }

        const unscaledSize = pageSize / zoom;
        if (unscaledSize <= 0) {
            return null;
        }

        const targetZoom = availableSize / unscaledSize;
        if (!Number.isFinite(targetZoom)) {
            return null;
        }

        return clampZoom(targetZoom);
    };

    const handleFitWidth = () => {
        const fitZoom = computeFitZoom('width');
        if (fitZoom !== null) {
            setZoom(fitZoom);
        }
    };

    const handleFitHeight = () => {
        const fitZoom = computeFitZoom('height');
        if (fitZoom !== null) {
            setZoom(fitZoom);
        }
    };

    const extractPageIndex = (element: Element | null): number | null => {
        let current: Element | null = element;
        while (current && current !== containerRef.current) {
            const dataPage = (current as HTMLElement).dataset?.page;
            if (dataPage && !Number.isNaN(Number(dataPage))) {
                const parsed = Number(dataPage);
                return parsed >= 0 ? parsed : null;
            }

            const idAttr = current.getAttribute('id');
            if (idAttr) {
                const match = idAttr.match(/page-?(\d+)/i);
                if (match) {
                    const parsed = Number(match[1]);
                    return Number.isNaN(parsed) ? null : Math.max(parsed - 1, 0);
                }
            }
            current = current.parentElement;
        }
        return null;
    };

    const clientToScorePoint = (clientX: number, clientY: number) => {
        if (!containerRef.current) {
            return null;
        }

        const containerRect = containerRef.current.getBoundingClientRect();
        return {
            x: (clientX - containerRect.left) / zoom,
            y: (clientY - containerRect.top) / zoom,
        };
    };

    const boxesIntersect = (
        a: { x: number, y: number, w: number, h: number },
        b: { x: number, y: number, w: number, h: number },
    ) => a.x + a.w >= b.x && b.x + b.w >= a.x && a.y + a.h >= b.y && b.y + b.h >= a.y;

    const performDragSelection = async (rect: { x: number, y: number, w: number, h: number }, additive: boolean): Promise<SelectionFallback> => {
        if (!containerRef.current || !score) {
            return null;
        }

        const containerRect = containerRef.current.getBoundingClientRect();
        const allElements = Array.from(containerRef.current.querySelectorAll(ELEMENT_SELECTION_SELECTOR));

        const hits = allElements
            .map((el, index) => {
                const elRect = el.getBoundingClientRect();
                const box = {
                    x: (elRect.left - containerRect.left) / zoom,
                    y: (elRect.top - containerRect.top) / zoom,
                    w: elRect.width / zoom,
                    h: elRect.height / zoom,
                };
                if (!(box.w > 0 && box.h > 0)) {
                    return null;
                }
                if (!boxesIntersect(rect, box)) {
                    return null;
                }
                const pageIndex = extractPageIndex(el) ?? 0;
                const centerX = box.x + box.w / 2;
                const centerY = box.y + box.h / 2;
                return { el, index, pageIndex, box, centerX, centerY };
            })
            .filter((hit): hit is NonNullable<typeof hit> => Boolean(hit))
            .sort((a, b) => (
                a.pageIndex - b.pageIndex
                || a.box.y - b.box.y
                || a.box.x - b.box.x
                || a.index - b.index
            ));

        if (hits.length === 0) {
            if (!additive) {
                setSelectedElement(null);
                setSelectionBoxes([]);
                setSelectedPoint(null);
                setSelectedIndex(null);
                setSelectedElementClasses('');
                setSelectedLayoutBreakSubtype(null);
                if (score.clearSelection) {
                    await score.clearSelection().catch(err => {
                        console.warn('clearSelection not available or failed:', err);
                    });
                }
            }
            return null;
        }

        const first = hits[0];
        const hitBoxes: SelectionBox[] = hits.map(hit => ({
            index: hit.index,
            page: hit.pageIndex,
            x: hit.box.x,
            y: hit.box.y,
            w: hit.box.w,
            h: hit.box.h,
            centerX: hit.centerX,
            centerY: hit.centerY,
            classes: hit.el.getAttribute('class') ?? '',
        }));
        if (additive) {
            setSelectionBoxes(prev => {
                const seen = new Set<number>();
                for (const box of prev) {
                    if (box.index !== null) {
                        seen.add(box.index);
                    }
                }
                const merged = [...prev];
                for (const box of hitBoxes) {
                    if (box.index !== null && seen.has(box.index)) {
                        continue;
                    }
                    if (box.index !== null) {
                        seen.add(box.index);
                    }
                    merged.push(box);
                }
                return merged;
            });
        } else {
            setSelectionBoxes(hitBoxes);
        }
        setSelectedElement(first.box);
        setSelectedPoint({ page: first.pageIndex, x: first.centerX, y: first.centerY });
        setSelectedIndex(first.index);

        const fallback: SelectionFallback = {
            index: first.index,
            point: {
                page: first.pageIndex,
                x: first.centerX,
                y: first.centerY,
            },
        };

        if (score.selectElementAtPointWithMode) {
            // Check if any hits are notes - notes need RANGE selection for copy/paste to work
            const hasNotes = hits.some(hit => {
                const classes = hit.el.getAttribute('class') ?? '';
                return classes.includes('Note');
            });

            const firstMode = additive ? 1 : 0;

            if (hasNotes && hits.length > 1) {
                // For notes, use RANGE selection (mode 3) to enable copy/paste
                // Find leftmost and rightmost hits (by x position) for proper time-based range
                let leftmost = hits[0];
                let rightmost = hits[0];
                for (const hit of hits) {
                    if (hit.box.x < leftmost.box.x) {
                        leftmost = hit;
                    }
                    if (hit.box.x + hit.box.w > rightmost.box.x + rightmost.box.w) {
                        rightmost = hit;
                    }
                }
                // Select leftmost first, then extend range to rightmost
                await score.selectElementAtPointWithMode(leftmost.pageIndex, leftmost.centerX, leftmost.centerY, firstMode);
                await score.selectElementAtPointWithMode(rightmost.pageIndex, rightmost.centerX, rightmost.centerY, 3);
            } else {
                // For non-note elements (slurs, dynamics, etc.), use ADD mode (original behavior)
                await score.selectElementAtPointWithMode(first.pageIndex, first.centerX, first.centerY, firstMode);
                for (let i = 1; i < hits.length; i++) {
                    const hit = hits[i];
                    await score.selectElementAtPointWithMode(hit.pageIndex, hit.centerX, hit.centerY, 1);
                }
            }
            return fallback;
        }

        if (!score.selectElementAtPoint) {
            console.warn('selectElementAtPoint is not available; cannot update selection in WASM');
            return fallback;
        }

        if (!additive && score.clearSelection) {
            await score.clearSelection().catch(err => {
                console.warn('clearSelection not available or failed:', err);
            });
        }

        await score.selectElementAtPoint(first.pageIndex, first.centerX, first.centerY);
        return fallback;
    };

    const handleScorePointerDown = (e: React.PointerEvent) => {
        if (e.button !== 0) {
            return;
        }
        if (dragKindRef.current && dragKindRef.current !== 'pointer') {
            return;
        }
        if (dragPointerIdRef.current !== null) {
            return;
        }
        if (!containerRef.current || !score) {
            return;
        }

        const start = clientToScorePoint(e.clientX, e.clientY);
        if (!start) {
            return;
        }

        dragPointerIdRef.current = e.pointerId;
        dragKindRef.current = 'pointer';
        sawPointerMoveRef.current = false;
        dragStartClientRef.current = { x: e.clientX, y: e.clientY };
        dragStartScoreRef.current = start;
        dragAdditiveRef.current = e.metaKey || e.ctrlKey;
        dragActiveRef.current = false;
    };

    const handleScorePointerMove = (e: React.PointerEvent) => {
        if (dragKindRef.current !== 'pointer') {
            return;
        }
        sawPointerMoveRef.current = true;
        if (dragPointerIdRef.current !== e.pointerId) {
            return;
        }

        const startClient = dragStartClientRef.current;
        const startScore = dragStartScoreRef.current;
        if (!startClient || !startScore) {
            return;
        }

        const dxClient = e.clientX - startClient.x;
        const dyClient = e.clientY - startClient.y;
        const DRAG_THRESHOLD_PX = 4;

        if (!dragActiveRef.current) {
            if (Math.hypot(dxClient, dyClient) < DRAG_THRESHOLD_PX) {
                return;
            }
            dragActiveRef.current = true;
            try {
                e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
                // Ignore if pointer capture is not available.
            }
        }

        const currentScore = clientToScorePoint(e.clientX, e.clientY);
        if (!currentScore) {
            return;
        }

        const x1 = Math.min(startScore.x, currentScore.x);
        const y1 = Math.min(startScore.y, currentScore.y);
        const x2 = Math.max(startScore.x, currentScore.x);
        const y2 = Math.max(startScore.y, currentScore.y);

        setDragSelectionRect({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
        e.preventDefault();
    };

    const handleScorePointerUp = async (e: React.PointerEvent) => {
        if (dragKindRef.current !== 'pointer') {
            return;
        }
        if (dragPointerIdRef.current !== e.pointerId) {
            return;
        }

        const active = dragActiveRef.current;
        const additive = dragAdditiveRef.current;
        const startScore = dragStartScoreRef.current;

        dragKindRef.current = null;
        sawPointerMoveRef.current = false;
        dragPointerIdRef.current = null;
        dragStartClientRef.current = null;
        dragStartScoreRef.current = null;
        dragAdditiveRef.current = false;
        dragActiveRef.current = false;

        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
            // Ignore if pointer capture is not available.
        }

        if (!active || !startScore) {
            return;
        }

        ignoreNextClickRef.current = true;

        const endScore = clientToScorePoint(e.clientX, e.clientY);
        if (!endScore) {
            setDragSelectionRect(null);
            return;
        }

        const x1 = Math.min(startScore.x, endScore.x);
        const y1 = Math.min(startScore.y, endScore.y);
        const x2 = Math.max(startScore.x, endScore.x);
        const y2 = Math.max(startScore.y, endScore.y);
        const rect = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };

        setDragSelectionRect(rect);
        const fallback = await performDragSelection(rect, additive);
        setDragSelectionRect(null);
        await refreshSelectionFromSvg(fallback);
    };

    const handleScorePointerCancel = (e: React.PointerEvent) => {
        if (dragKindRef.current !== 'pointer') {
            return;
        }
        if (dragPointerIdRef.current !== e.pointerId) {
            return;
        }
        dragKindRef.current = null;
        sawPointerMoveRef.current = false;
        dragPointerIdRef.current = null;
        dragStartClientRef.current = null;
        dragStartScoreRef.current = null;
        dragAdditiveRef.current = false;
        dragActiveRef.current = false;
        setDragSelectionRect(null);

        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
            // Ignore if pointer capture is not available.
        }
    };

    const handleScoreMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) {
            return;
        }
        if (dragKindRef.current === 'pointer') {
            return;
        }
        if (dragPointerIdRef.current !== null) {
            return;
        }
        if (!containerRef.current || !score) {
            return;
        }

        const start = clientToScorePoint(e.clientX, e.clientY);
        if (!start) {
            return;
        }

        dragKindRef.current = 'mouse';
        dragPointerIdRef.current = -1;
        sawPointerMoveRef.current = false;
        dragStartClientRef.current = { x: e.clientX, y: e.clientY };
        dragStartScoreRef.current = start;
        dragAdditiveRef.current = e.metaKey || e.ctrlKey;
        dragActiveRef.current = false;
    };

    const handleScoreMouseMove = (e: React.MouseEvent) => {
        if (dragKindRef.current === 'pointer' && !sawPointerMoveRef.current && dragPointerIdRef.current !== null) {
            const startClient = dragStartClientRef.current;
            const startScore = dragStartScoreRef.current;
            if (!startClient || !startScore) {
                return;
            }

            const dxClient = e.clientX - startClient.x;
            const dyClient = e.clientY - startClient.y;
            const DRAG_THRESHOLD_PX = 4;

            if (!dragActiveRef.current) {
                if (Math.hypot(dxClient, dyClient) < DRAG_THRESHOLD_PX) {
                    return;
                }
                dragActiveRef.current = true;
                try {
                    e.currentTarget.setPointerCapture(dragPointerIdRef.current);
                } catch {
                    // Ignore if pointer capture is not available.
                }
            }

            const currentScore = clientToScorePoint(e.clientX, e.clientY);
            if (!currentScore) {
                return;
            }

            const x1 = Math.min(startScore.x, currentScore.x);
            const y1 = Math.min(startScore.y, currentScore.y);
            const x2 = Math.max(startScore.x, currentScore.x);
            const y2 = Math.max(startScore.y, currentScore.y);

            setDragSelectionRect({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
            e.preventDefault();
            return;
        }
        if (dragKindRef.current !== 'mouse') {
            return;
        }
        if (dragPointerIdRef.current !== -1) {
            return;
        }

        const startClient = dragStartClientRef.current;
        const startScore = dragStartScoreRef.current;
        if (!startClient || !startScore) {
            return;
        }

        const dxClient = e.clientX - startClient.x;
        const dyClient = e.clientY - startClient.y;
        const DRAG_THRESHOLD_PX = 4;

        if (!dragActiveRef.current) {
            if (Math.hypot(dxClient, dyClient) < DRAG_THRESHOLD_PX) {
                return;
            }
            dragActiveRef.current = true;
        }

        const currentScore = clientToScorePoint(e.clientX, e.clientY);
        if (!currentScore) {
            return;
        }

        const x1 = Math.min(startScore.x, currentScore.x);
        const y1 = Math.min(startScore.y, currentScore.y);
        const x2 = Math.max(startScore.x, currentScore.x);
        const y2 = Math.max(startScore.y, currentScore.y);

        setDragSelectionRect({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
        e.preventDefault();
    };

    const handleScoreMouseUp = async (e: React.MouseEvent) => {
        if (dragKindRef.current !== 'mouse') {
            return;
        }
        if (dragPointerIdRef.current !== -1) {
            return;
        }

        const active = dragActiveRef.current;
        const additive = dragAdditiveRef.current;
        const startScore = dragStartScoreRef.current;

        dragKindRef.current = null;
        dragPointerIdRef.current = null;
        dragStartClientRef.current = null;
        dragStartScoreRef.current = null;
        dragAdditiveRef.current = false;
        dragActiveRef.current = false;

        if (!active || !startScore) {
            return;
        }

        ignoreNextClickRef.current = true;

        const endScore = clientToScorePoint(e.clientX, e.clientY);
        if (!endScore) {
            setDragSelectionRect(null);
            return;
        }

        const x1 = Math.min(startScore.x, endScore.x);
        const y1 = Math.min(startScore.y, endScore.y);
        const x2 = Math.max(startScore.x, endScore.x);
        const y2 = Math.max(startScore.y, endScore.y);
        const rect = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };

        setDragSelectionRect(rect);
        const fallback = await performDragSelection(rect, additive);
        setDragSelectionRect(null);
        await refreshSelectionFromSvg(fallback);
    };

    const handleScoreClick = (e: React.MouseEvent) => {
        if (ignoreNextClickRef.current) {
            ignoreNextClickRef.current = false;
            return;
        }
        if (!containerRef.current) return;

        const additiveSelection = e.metaKey || e.ctrlKey || e.shiftKey;
        const isShiftClick = e.shiftKey && !e.metaKey && !e.ctrlKey;
        // DOM-based hit testing
        const target = e.target as Element;

        // Check if we clicked on a Note or Rest (or other interesting elements)
        // webmscore SVG classes: Note, Rest, Chord, etc.
        // Often the target is a <path> or <g> with the class.

        // Traverse up to find a relevant class if needed
        // Note: containerRef.current is a div that contains the SVG, so we need to traverse
        // up through the SVG structure to find Note/Rest/Chord/LayoutBreak elements
        let element: Element | null = target;
        let found = false;

        while (element) {
            const classAttr = element.getAttribute('class');
            if (hasSelectableClass(classAttr)) {
                found = true;
                break;
            }
            if (isSvgTextElement(element)) {
                found = true;
                element = resolveTextElement(element);
                break;
            }
            // Stop if we've reached containerRef or gone past it
            if (element === containerRef.current || element.parentElement === null) {
                break;
            }
            element = element.parentElement;
        }

        if (!found || !element) {
            setSelectedElement(null);
            setSelectionBoxes([]);
            setSelectedPoint(null);
            setSelectedIndex(null);
            setSelectedElementClasses('');
            setSelectedLayoutBreakSubtype(null);
            const refreshAfterClear = () => refreshSelectionFromSvg(null);
            blockOverlayRefreshRef.current = true;
            selectionOverlayGenerationRef.current += 1;
            setOverlaySuppressed(true);
            if (score?.clearSelection) {
                score.clearSelection()
                    .then(refreshAfterClear)
                    .catch(err => {
                        console.warn('clearSelection not available or failed:', err);
                        refreshAfterClear();
                    });
            }
            return;
        }

        const targetElement = element;
        const rect = targetElement.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();

        const x = (rect.left - containerRect.left) / zoom;
        const y = (rect.top - containerRect.top) / zoom;
        const w = rect.width / zoom;
        const h = rect.height / zoom;

        if (w > 0 && h > 0) {
            const pageIndex = extractPageIndex(targetElement) ?? 0;
            // Use center of the box for selection to reduce edge misses
            const centerX = x + w / 2;
            const centerY = y + h / 2;

            // Find the index by looking for Note/Rest/Chord/LayoutBreak elements
            // If we found a specific element, use it; otherwise search from target
            const allElements = Array.from(containerRef.current.querySelectorAll(ELEMENT_SELECTION_SELECTOR));
            let index = -1;

            if (found && element) {
                // We found a Note/Rest/Chord/LayoutBreak element, try to find its index
                index = allElements.indexOf(element);
            }

            // If still not found, try targetElement
            if (index < 0) {
                index = allElements.indexOf(targetElement);
            }

            // If still not found, try to find closest parent that's in the list
            if (index < 0 && targetElement) {
                let current: Element | null = targetElement;
                while (current && current !== containerRef.current) {
                    index = allElements.indexOf(current);
                    if (index >= 0) break;
                    current = current.parentElement;
                }
            }

        const classAttr = normalizeElementClasses(targetElement, targetElement.getAttribute('class') ?? '');
        const box: SelectionBox = {
            index: index >= 0 ? index : null,
            page: pageIndex,
            x,
            y,
            w,
            h,
            centerX,
            centerY,
            classes: classAttr,
        };
            const fallback: SelectionFallback = {
                index: box.index,
                point: { page: pageIndex, x: centerX, y: centerY },
            };

            const canModeSelect = Boolean(score?.selectElementAtPointWithMode);
            const alreadySelected = additiveSelection && box.index !== null && selectionBoxes.some(existing => existing.index === box.index);
            // Mode: 0 = replace, 1 = add, 2 = toggle, 3 = range
            // Use range selection (mode 3) for shift-click when there's already a selection
            const hasExistingSelection = selectionBoxes.length > 0;
            const mode = canModeSelect
                ? additiveSelection
                    ? alreadySelected
                        ? 2  // Toggle off if already selected
                        : isShiftClick && hasExistingSelection
                            ? 3  // Range selection for shift-click
                            : 1  // Add selection for ctrl/cmd-click
                    : 0  // Replace selection
                : null;

            const selectionPromise = canModeSelect
                ? score!.selectElementAtPointWithMode!(pageIndex, centerX, centerY, mode as number)
                : score?.selectElementAtPoint?.(pageIndex, centerX, centerY);

            selectionPromise?.then(() => {
                refreshSelectionFromSvg(fallback);
            });

            selectionPromise?.catch(err => {
                console.warn('selectElementAtPoint not available or failed:', err);
                setSelectedElement(null);
                setSelectionBoxes([]);
                setSelectedPoint(null);
                setSelectedIndex(null);
                setSelectedElementClasses('');
                setSelectedLayoutBreakSubtype(null);
            });

            if (!additiveSelection) {
                setSelectionBoxes([box]);
                setSelectedElement({ x, y, w, h });
                setSelectedIndex(box.index);
                setSelectedPoint({ page: pageIndex, x: centerX, y: centerY });
                return;
            }

            if (alreadySelected && box.index !== null) {
                const next = selectionBoxes.filter(existing => existing.index !== box.index);
                setSelectionBoxes(next);

                if (selectedIndex === box.index) {
                    const nextPrimary = next.at(-1) ?? null;
                    if (!nextPrimary) {
                        setSelectedElement(null);
                        setSelectedPoint(null);
                        setSelectedIndex(null);
                    } else {
                        setSelectedElement({ x: nextPrimary.x, y: nextPrimary.y, w: nextPrimary.w, h: nextPrimary.h });
                        setSelectedPoint({ page: nextPrimary.page, x: nextPrimary.centerX, y: nextPrimary.centerY });
                        setSelectedIndex(nextPrimary.index);
                    }
                }
                return;
            }

            // Additive selection: add clicked element as the new primary.
            setSelectionBoxes([...selectionBoxes, box]);
            setSelectedElement({ x, y, w, h });
            setSelectedIndex(box.index);
            setSelectedPoint({ page: pageIndex, x: centerX, y: centerY });
        } else {
            setSelectedElement(null);
            setSelectionBoxes([]);
            setSelectedPoint(null);
            setSelectedIndex(null);
            setSelectedElementClasses('');
            setSelectedLayoutBreakSubtype(null);
        }
    };

    const openTextEditorFromEvent = (e: React.MouseEvent) => {
        if (!containerRef.current || !score) {
            return;
        }
        let element: Element | null = e.target as Element | null;
        let found = false;
        while (element) {
            if (isSvgTextElement(element)) {
                found = true;
                element = resolveTextElement(element);
                break;
            }
            if (element === containerRef.current) {
                break;
            }
            element = element.parentElement;
        }
        if (!found || !element) {
            setTextEditorPosition(null);
            return;
        }

        e.preventDefault();
        handleScoreClick(e);
        setTextEditorPosition({ x: e.clientX, y: e.clientY });
    };

    const handleScoreContextMenu = (e: React.MouseEvent) => {
        openTextEditorFromEvent(e);
    };

    const closeTextEditor = () => {
        setTextEditorPosition(null);
    };

    const secondarySelectionBoxes = selectionBoxes.filter(box => {
        if (selectedIndex !== null && box.index === selectedIndex) {
            return false;
        }
        if (selectedElement && box.x === selectedElement.x && box.y === selectedElement.y && box.w === selectedElement.w && box.h === selectedElement.h) {
            return false;
        }
        return true;
    });
    const textSelectionActive = hasTextElementClass(selectedElementClasses) || Boolean(textEditorPosition);
    const selectedTextControlDisabled = !mutationEnabled || !score?.setSelectedText;
    const checkpointControlsDisabled = checkpointBusy || checkpointLoading;
    const checkpointSaveDisabled = checkpointControlsDisabled || !score || !score?.saveXml;
    const checkpointCompareDisabled = checkpointControlsDisabled || !score;
    const xmlControlsDisabled = xmlLoading || !score || !score?.saveXml;
    const xmlApplyEnabled = !xmlControlsDisabled && xmlDirty;
    const xmlReloadEnabled = !xmlControlsDisabled && scoreDirtySinceXml;
    const xmlApplyDisabled = !xmlApplyEnabled;
    const aiOutputValidation = aiOutput.trim()
        ? aiPatchError
            ? { valid: false, message: aiPatchError }
            : aiPatch
                ? { valid: true, message: `${aiPatch.ops.length} ops ready` }
                : { valid: false, message: 'AI output is not a valid patch.' }
        : { valid: true, message: '' };
    const aiApplyDisabled = xmlControlsDisabled || !aiPatchedXml.trim() || Boolean(aiPatchError);

    return (
        <div className="flex flex-col h-screen">
            <div className="relative" style={{ zIndex: 100 }}>
	            <Toolbar
                    onNewScore={handleOpenNewScoreDialog}
	                onFileUpload={handleFileUpload}
                    onSoundFontUpload={handleSoundFontUpload}
                    scoreTitle={scoreTitle}
                    scoreSubtitle={scoreSubtitle}
                    scoreComposer={scoreComposer}
                    scoreLyricist={scoreLyricist}
                    onScoreTitleChange={setScoreTitle}
                    onScoreSubtitleChange={setScoreSubtitle}
                    onScoreComposerChange={setScoreComposer}
                    onScoreLyricistChange={setScoreLyricist}
                    onSetTitleText={handleSetTitleText}
                    onSetSubtitleText={handleSetSubtitleText}
                    onSetComposerText={handleSetComposerText}
                    onSetLyricistText={score?.setLyricistText ? handleSetLyricistText : undefined}
                headerTextAvailable={Boolean(score?.setTitleText && score?.setComposerText)}
	                onZoomIn={handleZoomIn}
	                onZoomOut={handleZoomOut}
	                zoomLevel={zoom}
                onFitWidth={handleFitWidth}
                onFitHeight={handleFitHeight}
                onDeleteSelection={handleDeleteSelection}
                onUndo={handleUndo}
                onRedo={handleRedo}
	                onPitchUp={handlePitchUp}
                onPitchDown={handlePitchDown}
                    onTranspose={handleTranspose}
                    onSetAccidental={handleSetAccidental}
                onDurationLonger={handleDurationLonger}
	                onDurationShorter={handleDurationShorter}
	                mutationsEnabled={mutationEnabled}
                selectionActive={Boolean(selectedElement) || selectionBoxes.length > 0 || Boolean(selectedPoint)}
                onExportSvg={handleExportSvg}
                onExportPdf={handleExportPdf}
                onExportPng={handleExportPng}
                onExportMxl={handleExportMxl}
                onExportMscz={handleExportMscz}
                onExportMidi={handleExportMidi}
                onExportAudio={handleExportAudio}
                onPlayAudio={handlePlayAudio}
                onStopAudio={stopAudio}
                isPlaying={isPlaying}
                audioBusy={audioBusy}
                exportsEnabled={Boolean(score)}
                pngAvailable={Boolean(score?.savePng)}
                audioAvailable={Boolean(score?.saveAudio)}
                onSetTimeSignature={handleSetTimeSignature}
                onSetKeySignature={handleSetKeySignature}
                onSetClef={handleSetClef}
                onToggleDot={handleToggleDot}
                onToggleDoubleDot={handleToggleDoubleDot}
                onSetDurationType={handleSetDurationType}
                onToggleLineBreak={handleToggleLineBreak}
                onTogglePageBreak={handleTogglePageBreak}
                onSetVoice={handleSetVoice}
                onAddDynamic={handleAddDynamic}
                onAddHairpin={handleAddHairpin}
                onAddPedal={handleAddPedal}
                onAddSostenutoPedal={handleAddSostenutoPedal}
                onAddUnaCorda={handleAddUnaCorda}
                onSplitPedal={handleSplitPedal}
                onAddTempoText={handleAddTempoText}
                onAddStaffText={handleAddStaffText}
                onAddSystemText={handleAddSystemText}
                onAddExpressionText={handleAddExpressionText}
                onAddLyricText={handleAddLyricText}
                onAddHarmonyText={handleAddHarmonyText}
                onAddFingeringText={handleAddFingeringText}
                onAddLeftHandGuitarFingeringText={handleAddLeftHandGuitarFingeringText}
                onAddRightHandGuitarFingeringText={handleAddRightHandGuitarFingeringText}
                onAddStringNumberText={handleAddStringNumberText}
                onAddInstrumentChangeText={handleAddInstrumentChangeText}
                onAddStickingText={handleAddStickingText}
                onAddFiguredBassText={handleAddFiguredBassText}
                onAddArticulation={handleAddArticulation}
                onAddSlur={handleAddSlur}
                onAddTie={handleAddTie}
                onAddGraceNote={handleAddGraceNote}
                onAddTuplet={handleAddTuplet}
                onAddNoteFromRest={handleAddNoteFromRest}
                onToggleRepeatStart={handleToggleRepeatStart}
                onToggleRepeatEnd={handleToggleRepeatEnd}
                onSetRepeatCount={handleSetRepeatCount}
                onSetBarLineType={handleSetBarLineType}
                onAddVolta={handleAddVolta}
                onInsertMeasures={handleInsertMeasures}
                onRemoveTrailingEmptyMeasures={handleRemoveTrailingEmptyMeasures}
                insertMeasuresDisabled={!score?.insertMeasures}
                parts={scoreParts}
                instrumentGroups={instrumentGroups}
                onAddPart={handleAddPart}
                onRemovePart={handleRemovePart}
                onTogglePartVisible={handleTogglePartVisible}
                selectedTextActive={textSelectionActive}
                selectedTextValue={selectedTextValue}
                onSelectedTextChange={handleSelectedTextChange}
                onApplySelectedText={handleApplySelectedText}
                selectedTextDisabled={selectedTextControlDisabled}
            />
            </div>

            <div className="flex flex-1 min-h-0">
                <aside
                    className={`shrink-0 border-r bg-white text-sm ${checkpointsCollapsed ? 'w-12' : 'w-72'} ${
                        checkpointsCollapsed ? '' : 'overflow-y-auto'
                    }`}
                    data-testid="checkpoint-sidebar"
                >
                    <div className={checkpointsCollapsed ? 'flex items-center justify-center p-2' : 'flex items-center justify-between p-4'}>
                        {!checkpointsCollapsed && (
                            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                Checkpoints
                            </span>
                        )}
                        <div className={checkpointsCollapsed ? '' : 'flex items-center gap-2'}>
                            {!checkpointsCollapsed && (
                                <button
                                    type="button"
                                    data-testid="btn-checkpoint-refresh"
                                    onClick={loadCheckpointList}
                                    disabled={checkpointControlsDisabled}
                                    className="text-xs font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Refresh
                                </button>
                            )}
                            <button
                                type="button"
                                data-testid="btn-checkpoint-toggle"
                                aria-expanded={!checkpointsCollapsed}
                                aria-controls="checkpoint-sidebar-content"
                                aria-label={checkpointsCollapsed ? 'Show checkpoints' : 'Hide checkpoints'}
                                onClick={() => setCheckpointsCollapsed((prev) => !prev)}
                                className="text-xs font-medium text-gray-600 hover:text-gray-900"
                            >
                                {checkpointsCollapsed ? '>>' : '<<'}
                            </button>
                        </div>
                    </div>
                    {!checkpointsCollapsed && (
                        <div id="checkpoint-sidebar-content" className="px-4 pb-4">
                            <div className="mt-3 flex gap-2 text-xs font-medium text-gray-600">
                                <button
                                    type="button"
                                    data-testid="tab-checkpoints"
                                    onClick={() => setLeftSidebarTab('checkpoints')}
                                    className={`rounded border px-2 py-1 ${
                                        leftSidebarTab === 'checkpoints'
                                            ? 'border-gray-400 bg-gray-100 text-gray-900'
                                            : 'border-transparent text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    Checkpoints
                                </button>
                                <button
                                    type="button"
                                    data-testid="tab-scores"
                                    onClick={() => setLeftSidebarTab('scores')}
                                    className={`rounded border px-2 py-1 ${
                                        leftSidebarTab === 'scores'
                                            ? 'border-gray-400 bg-gray-100 text-gray-900'
                                            : 'border-transparent text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    Scores
                                </button>
                            </div>
                            {leftSidebarTab === 'checkpoints' && (
                                <>
                                    <div className="mt-3 flex flex-col gap-2">
                                        <input
                                            data-testid="input-checkpoint-label"
                                            type="text"
                                            value={checkpointLabel}
                                            onChange={(event) => setCheckpointLabel(event.target.value)}
                                            placeholder="Checkpoint label"
                                            className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                                        />
                                        <button
                                            type="button"
                                            data-testid="btn-checkpoint-save"
                                            onClick={handleSaveCheckpoint}
                                            disabled={checkpointSaveDisabled}
                                            className={`w-full rounded border px-3 py-1 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
                                                !checkpointSaveDisabled && scoreDirtySinceCheckpoint
                                                    ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
                                                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                                            }`}
                                        >
                                            Save Checkpoint
                                        </button>
                                        {!score && (
                                            <span className="text-xs text-gray-400">
                                                Load a score to enable checkpoints.
                                            </span>
                                        )}
                                    </div>
                                    {checkpointError && (
                                        <div className="mt-3 text-xs text-red-600">
                                            {checkpointError}
                                        </div>
                                    )}
                                    {checkpointLoading && (
                                        <div className="mt-3 text-xs text-gray-400">
                                            Loading checkpoints...
                                        </div>
                                    )}
                                    {!checkpointLoading && checkpoints.length === 0 && (
                                        <div className="mt-3 text-xs text-gray-400">
                                            No checkpoints yet.
                                        </div>
                                    )}
                                    <div className="mt-3 space-y-3">
                                        {checkpoints.map((checkpoint) => (
                                            <div
                                                key={checkpoint.id}
                                                className="rounded border border-gray-200 p-2"
                                            >
                                                <div className="text-sm font-medium text-gray-800">
                                                    {checkpoint.title}
                                                </div>
                                                <div className="text-xs text-gray-500">
                                                    {formatTimestamp(checkpoint.createdAt)}
                                                    {checkpoint.size ? ` · ${formatBytes(checkpoint.size)}` : ''}
                                                </div>
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    <button
                                                        type="button"
                                                        data-testid={`btn-checkpoint-restore-${checkpoint.id}`}
                                                        onClick={() => handleRestoreCheckpoint(checkpoint)}
                                                        disabled={checkpointControlsDisabled}
                                                        className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        Restore
                                                    </button>
                                                    <button
                                                        type="button"
                                                        data-testid={`btn-checkpoint-compare-${checkpoint.id}`}
                                                        onClick={() => handleCompareCheckpoint(checkpoint)}
                                                        disabled={checkpointCompareDisabled}
                                                        className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        Compare
                                                    </button>
                                                    <button
                                                        type="button"
                                                        data-testid={`btn-checkpoint-delete-${checkpoint.id}`}
                                                        onClick={() => handleDeleteCheckpoint(checkpoint)}
                                                        disabled={checkpointControlsDisabled}
                                                        className="rounded border border-gray-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                            {leftSidebarTab === 'scores' && (
                                <>
                                    {scoreSummariesError && (
                                        <div className="mt-3 text-xs text-red-600">
                                            {scoreSummariesError}
                                        </div>
                                    )}
                                    {scoreSummariesLoading && (
                                        <div className="mt-3 text-xs text-gray-400">
                                            Loading scores...
                                        </div>
                                    )}
                                    {!scoreSummariesLoading && scoreSummaries.length === 0 && (
                                        <div className="mt-3 text-xs text-gray-400">
                                            No saved scores yet.
                                        </div>
                                    )}
                                    <div className="mt-3 space-y-3">
                                        {scoreSummaries.map((summary) => {
                                            const info = summarizeScoreId(summary.scoreId);
                                            const isCurrent = summary.scoreId === scoreId;
                                            return (
                                                <div
                                                    key={summary.scoreId}
                                                    className={`rounded border p-2 ${isCurrent ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="text-sm font-medium text-gray-800">
                                                            {info.title}
                                                        </div>
                                                        {isCurrent && (
                                                            <span className="text-[10px] font-semibold uppercase text-blue-700">
                                                                Current
                                                            </span>
                                                        )}
                                                    </div>
                                                    {info.detail && (
                                                        <div className="text-xs text-gray-500 break-all">
                                                            {info.detail}
                                                        </div>
                                                    )}
                                                    <div className="mt-1 text-xs text-gray-500">
                                                        {summary.count} checkpoint{summary.count === 1 ? '' : 's'}
                                                        {summary.lastUpdated ? ` · ${formatTimestamp(summary.lastUpdated)}` : ''}
                                                    </div>
                                                    <div className="mt-2 flex flex-wrap gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOpenScoreFromSummary(summary)}
                                                            className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                                                        >
                                                            Open score
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </aside>

                <div
                    ref={scrollContainerRef}
                    className="relative z-0 flex-1 overflow-auto bg-gray-50 p-8"
                >
                {loading && (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-xl text-gray-500">Loading score...</div>
                    </div>
                )}

                {!loading && !score && (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-xl text-gray-400">No score loaded. Open a file to begin.</div>
                    </div>
                )}

                {!loading && score && (
                    <div className="mb-3 flex items-center justify-end gap-2 text-sm text-gray-600">
                        <span data-testid="page-indicator">
                            Page {currentPage + 1} of {pageCount}
                        </span>
                        <select
                            className="px-2 py-1 border border-gray-300 rounded bg-white text-sm"
                            onChange={handlePageSelect}
                            value={currentPage}
                            data-testid="page-select"
                        >
                            {Array.from({ length: pageCount }, (_, index) => (
                                <option key={index} value={index}>
                                    Page {index + 1}
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={() => handlePrevPage()}
                            disabled={currentPage <= 0}
                            className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Prev
                        </button>
                        <button
                            type="button"
                            onClick={() => handleNextPage()}
                            disabled={currentPage >= pageCount - 1}
                            className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Next
                        </button>
                    </div>
                )}

	            <div
	                ref={scoreWrapperRef}
	                className="relative origin-top-left transition-transform duration-200 ease-out bg-white shadow-lg mx-auto"
	                data-testid="score-wrapper"
	                style={{
	                    transform: `scale(${zoom})`,
	                    width: 'fit-content'
	                }}
                onClick={handleScoreClick}
                onPointerDown={handleScorePointerDown}
                    onPointerMove={handleScorePointerMove}
                    onPointerUp={handleScorePointerUp}
                    onPointerCancel={handleScorePointerCancel}
                onMouseDown={handleScoreMouseDown}
                onMouseMove={handleScoreMouseMove}
                onMouseUp={handleScoreMouseUp}
                onContextMenu={handleScoreContextMenu}
            >
	                <div ref={containerRef} data-testid="svg-container" />

                    {dragSelectionRect && (
                        <div
                            data-testid="drag-selection-rect"
                            className="absolute border border-blue-600 bg-blue-200 bg-opacity-20 pointer-events-none"
                            style={{
                                left: dragSelectionRect.x,
                                top: dragSelectionRect.y,
                                width: dragSelectionRect.w,
                                height: dragSelectionRect.h
                            }}
                        />
                    )}

                    {/* Selection highlighting is now done natively in the SVG via highlightSelection=true in saveSvg(). Keep the overlays around for testing/interaction feedback. */}
                    {secondarySelectionBoxes.map(box => (
                        <div
                            key={box.index !== null ? `sel-${box.index}` : `sel-${box.page}-${box.x}-${box.y}-${box.w}-${box.h}`}
                            className="absolute pointer-events-none"
                            style={{
                                left: box.x,
                                top: box.y,
                                width: box.w,
                                height: box.h
                            }}
                        />
                    ))}

                    {selectedElement && !overlaySuppressed && (
                        <div
                            data-testid="selection-overlay"
                            className="absolute pointer-events-none"
                            style={{
                                left: selectedElement.x,
                                top: selectedElement.y,
                                width: selectedElement.w,
                                height: selectedElement.h
                            }}
                        />
                    )}
                    {textEditorPosition && (
                        <div
                            className="fixed z-50 flex flex-col gap-2 rounded border bg-white p-3 shadow-lg"
                            style={{ left: textEditorPosition.x, top: textEditorPosition.y }}
                            onClick={event => event.stopPropagation()}
                            onMouseDown={event => event.stopPropagation()}
                            onPointerDown={event => event.stopPropagation()}
                        >
                            <label className="text-xs uppercase tracking-wide text-gray-500">
                                Text content
                            </label>
                            <input
                                data-testid="ctxmenu-text-input"
                                type="text"
                                value={selectedTextValue}
                                onChange={(event) => handleSelectedTextChange(event.target.value)}
                                onClick={(event) => event.stopPropagation()}
                                className="min-w-[200px] rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                            />
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        handleApplySelectedText();
                                        closeTextEditor();
                                    }}
                                    className="flex-1 rounded border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100"
                                >
                                    Save
                                </button>
                                <button
                                    type="button"
                                    onClick={closeTextEditor}
                                    className="flex-1 rounded border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <aside
                className={`shrink-0 border-l bg-white text-sm ${
                    xmlSidebarMode === 'closed' ? 'w-12' : xmlSidebarMode === 'full' ? 'w-full' : 'w-80'
                } ${xmlSidebarMode === 'closed' ? '' : 'overflow-y-auto'}`}
                data-testid="xml-sidebar"
            >
                <div className="sticky top-0 z-10 bg-white">
                    <div className={xmlSidebarMode === 'closed' ? 'flex items-center justify-center p-2' : 'flex items-center justify-between p-4'}>
                        {xmlSidebarMode !== 'closed' && (
                            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                MusicXML
                            </span>
                        )}
                        <button
                            type="button"
                            data-testid="btn-xml-toggle"
                            aria-expanded={xmlSidebarMode !== 'closed'}
                            aria-controls="xml-sidebar-content"
                            aria-label={
                                xmlSidebarMode === 'closed'
                                    ? 'Open MusicXML sidebar'
                                    : xmlSidebarMode === 'open'
                                        ? 'Expand MusicXML sidebar'
                                        : 'Close MusicXML sidebar'
                            }
                            onClick={() => {
                                setXmlSidebarMode((prev) => (prev === 'closed' ? 'open' : prev === 'open' ? 'full' : 'closed'));
                            }}
                            className="text-xs font-medium text-gray-600 hover:text-gray-900"
                        >
                            {xmlSidebarMode === 'closed' ? 'Open' : xmlSidebarMode === 'open' ? 'Full' : 'Close'}
                        </button>
                    </div>
                    {xmlSidebarMode !== 'closed' && (
                        <div className="px-4 pb-3">
                            <div className="flex items-center justify-between text-xs text-gray-500">
                                <span>
                                    {checkpoints.length === 0
                                        ? 'No checkpoint yet'
                                        : scoreDirtySinceCheckpoint
                                            ? 'Unsaved score changes'
                                            : ''}
                                </span>
                                {xmlLoading && <span>Loading...</span>}
                            </div>
                            <div className="mt-3 flex items-center justify-between text-xs font-medium text-gray-600">
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        data-testid="tab-xml"
                                        onClick={() => setXmlSidebarTab('xml')}
                                        className={`rounded border px-2 py-1 ${
                                            xmlSidebarTab === 'xml'
                                                ? 'border-gray-400 bg-gray-100 text-gray-900'
                                                : 'border-transparent text-gray-500 hover:text-gray-700'
                                        }`}
                                    >
                                        XML
                                    </button>
                                    <button
                                        type="button"
                                        data-testid="tab-ai"
                                        onClick={() => setXmlSidebarTab('assistant')}
                                        className={`rounded border px-2 py-1 ${
                                            xmlSidebarTab === 'assistant'
                                                ? 'border-gray-400 bg-gray-100 text-gray-900'
                                                : 'border-transparent text-gray-500 hover:text-gray-700'
                                        }`}
                                    >
                                        Assistant
                                    </button>
                                </div>
                                <div />
                            </div>
                        </div>
                    )}
                </div>
                {xmlSidebarMode !== 'closed' && (
                    <div id="xml-sidebar-content" className="px-4 pb-4">
                        {xmlSidebarTab === 'xml' && (
                            <>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        data-testid="btn-xml-apply"
                                        onClick={handleApplyXmlEdits}
                                        disabled={xmlApplyDisabled}
                                        title="Applying edits will auto-checkpoint if the score has unsaved changes."
                                        className={`flex-1 rounded border px-3 py-1 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
                                            xmlApplyEnabled
                                                ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
                                                : 'border-gray-300 bg-white text-gray-700'
                                        }`}
                                    >
                                        Apply edits
                                    </button>
                                    <button
                                        type="button"
                                        data-testid="btn-xml-reload"
                                        onClick={handleRefreshXml}
                                        disabled={!xmlReloadEnabled}
                                        title={
                                            xmlReloadEnabled
                                                ? 'The score has changed, reload to update XML. Any XML changes will be lost on update.'
                                                : undefined
                                        }
                                        className={`flex-1 rounded border px-3 py-1 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
                                            xmlReloadEnabled
                                                ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
                                                : 'border-gray-300 bg-white text-gray-700'
                                        }`}
                                    >
                                        Reload
                                    </button>
                                </div>
                                <div className="mt-2">
                                    <CodeMirrorEditor
                                        testId="xml-editor"
                                        value={xmlText}
                                        onChange={(nextValue) => {
                                            setXmlText(nextValue);
                                            setXmlDirty(true);
                                        }}
                                        readOnly={xmlControlsDisabled}
                                        placeholderText={score ? 'MusicXML will appear here.' : 'Load a score to view MusicXML.'}
                                    />
                                </div>
                            </>
                        )}
                        {xmlSidebarTab === 'assistant' && (
                            <div className="mt-3 space-y-3 text-sm text-gray-700">
                                <div>
                                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                        OpenAI Model
                                    </label>
                                    <select
                                        value={aiModel}
                                        onChange={(event) => setAiModel(event.target.value)}
                                        className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                        disabled={!aiModels.length}
                                    >
                                        {aiModelsLoading && <option>Loading models...</option>}
                                        {!aiModelsLoading && !aiModels.length && <option>No models loaded</option>}
                                        {aiModels.map((modelId) => (
                                            <option key={modelId} value={modelId}>
                                                {modelId}
                                            </option>
                                        ))}
                                    </select>
                                    {aiModelsError && (
                                        <div className="mt-1 text-xs text-red-600">
                                            {aiModelsError}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                        API Key
                                    </label>
                                    <input
                                        type="password"
                                        value={aiApiKey}
                                        onChange={(event) => setAiApiKey(event.target.value)}
                                        className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                        placeholder="Paste your key"
                                    />
                                    <div className="mt-1 text-[11px] text-gray-500">
                                        Stored locally in this browser.
                                    </div>
                                </div>
                                <div className="flex items-center justify-between gap-2 text-xs text-gray-600">
                                    <label className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={aiIncludeXml}
                                            onChange={(event) => setAiIncludeXml(event.target.checked)}
                                        />
                                        Include full MusicXML
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <span>Max output</span>
                                        <select
                                            value={aiMaxTokensMode}
                                            onChange={(event) => setAiMaxTokensMode(event.target.value as 'auto' | 'custom')}
                                            className="rounded border border-gray-300 px-2 py-1 text-xs"
                                        >
                                            <option value="auto">Auto</option>
                                            <option value="custom">Custom</option>
                                        </select>
                                        {aiMaxTokensMode === 'custom' && (
                                            <input
                                                type="number"
                                                min={256}
                                                value={aiMaxTokens}
                                                onChange={(event) => setAiMaxTokens(Number(event.target.value) || 0)}
                                                className="w-20 rounded border border-gray-300 px-2 py-1 text-xs"
                                            />
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                        Instruction
                                    </label>
                                    <textarea
                                        value={aiPrompt}
                                        onChange={(event) => setAiPrompt(event.target.value)}
                                        rows={4}
                                        className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                        placeholder="Describe the change you want in the MusicXML."
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={handleAiRequest}
                                    disabled={aiBusy}
                                    className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {aiBusy ? 'Working...' : 'Generate Patch'}
                                </button>
                                {aiError && (
                                    <div className="text-xs text-red-600">
                                        {aiError}
                                    </div>
                                )}
                                {aiOutput && (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between text-xs text-gray-500">
                                            <span>AI Patch</span>
                                            {aiOutputValidation.message && (
                                                <span className={aiOutputValidation.valid ? 'text-gray-500' : 'text-red-600'}>
                                                    {aiOutputValidation.message}
                                                </span>
                                            )}
                                        </div>
                                        <CodeMirrorEditor
                                            value={aiOutput}
                                            onChange={() => {}}
                                            readOnly={true}
                                            placeholderText="AI patch will appear here."
                                        />
                                        <button
                                            type="button"
                                            onClick={handleApplyAiOutput}
                                            disabled={aiApplyDisabled}
                                            title="Applying edits will auto-checkpoint if the score has unsaved changes."
                                            className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Apply Patch
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                        {xmlError && (
                            <div className="mt-2 text-xs text-red-600">
                                {xmlError}
                            </div>
                        )}
                    </div>
                )}
            </aside>

            {newScoreDialogOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
                    data-testid="new-score-modal"
                >
                    <div className="w-full max-w-xl rounded bg-white p-4 shadow-lg">
                        <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold text-gray-800">
                                New Score
                            </div>
                            <button
                                type="button"
                                onClick={() => setNewScoreDialogOpen(false)}
                                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                            >
                                Close
                            </button>
                        </div>
                        <div className="mt-4 grid gap-3 text-sm text-gray-700">
                            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                Creating a new score will replace the current score and switch to a new checkpoint set.
                                Export your score if you want a copy; you can return to the previous URL to access older checkpoints.
                            </div>
                            {instrumentClefMapError && (
                                <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                    {instrumentClefMapError}
                                </div>
                            )}
                            {instrumentFallbackError && (
                                <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                    {instrumentFallbackError}
                                </div>
                            )}
                            <label className="flex flex-col gap-1">
                                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    Title
                                </span>
                                <input
                                    type="text"
                                    value={newScoreTitle}
                                    onChange={(event) => setNewScoreTitle(event.target.value)}
                                    className="rounded border border-gray-300 px-2 py-1 text-sm"
                                    placeholder="Untitled score"
                                />
                            </label>
                            <label className="flex flex-col gap-1">
                                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    Composer
                                </span>
                                <input
                                    type="text"
                                    value={newScoreComposer}
                                    onChange={(event) => setNewScoreComposer(event.target.value)}
                                    className="rounded border border-gray-300 px-2 py-1 text-sm"
                                    placeholder="Composer"
                                />
                            </label>
                            <div className="flex flex-col gap-2">
                                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    Instruments
                                </span>
                                {newScoreInstrumentOptions.length > 0 ? (
                                    <>
                                        <div className="flex gap-2">
                                            <select
                                                value={newScoreInstrumentToAdd}
                                                onChange={(event) => setNewScoreInstrumentToAdd(event.target.value)}
                                                className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                                            >
                                                {newScoreCommonInstruments.length > 0 && (
                                                    <optgroup label="Common">
                                                        {newScoreCommonInstruments.map((entry, index) => (
                                                            <option key={`common-${entry.instrument.id}-${index}`} value={entry.instrument.id}>
                                                                {entry.label}
                                                            </option>
                                                        ))}
                                                    </optgroup>
                                                )}
                                                {newScoreInstrumentGroups.length > 0 ? (
                                                    newScoreInstrumentGroups.map((group) => (
                                                        <optgroup key={group.id} label={group.name}>
                                                            {group.instruments.map((instrument) => (
                                                                <option key={instrument.id} value={instrument.id}>
                                                                    {instrument.name}
                                                                </option>
                                                            ))}
                                                        </optgroup>
                                                    ))
                                                ) : (
                                                    newScoreInstrumentOptions.map((option) => (
                                                        <option key={option.id} value={option.id}>
                                                            {option.label}
                                                        </option>
                                                    ))
                                                )}
                                            </select>
                                            <button
                                                type="button"
                                                onClick={handleAddNewScoreInstrument}
                                                disabled={!newScoreInstrumentToAdd}
                                                className="rounded border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                Add
                                            </button>
                                        </div>
                                        <div className="space-y-1 rounded border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700">
                                            {newScoreInstrumentIds.length > 0 ? (
                                                newScoreInstrumentIds.map((instrumentId, index) => {
                                                    const option = newScoreInstrumentOptions.find((entry) => entry.id === instrumentId);
                                                    const label = option?.label || option?.name || instrumentId;
                                                    return (
                                                        <div key={`${instrumentId}-${index}`} className="flex items-center gap-2">
                                                            <span className="flex-1 truncate">{label}</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemoveNewScoreInstrument(index)}
                                                                className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-100"
                                                            >
                                                                Remove
                                                            </button>
                                                        </div>
                                                    );
                                                })
                                            ) : (
                                                <div className="text-gray-500">No instruments selected.</div>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <div className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-500">
                                        Instrument list unavailable.
                                    </div>
                                )}
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="flex flex-col gap-1">
                                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                        Measures
                                    </span>
                                    <input
                                        type="number"
                                        min={1}
                                        value={newScoreMeasures}
                                        onChange={(event) => setNewScoreMeasures(Number(event.target.value) || 1)}
                                        className="rounded border border-gray-300 px-2 py-1 text-sm"
                                    />
                                </label>
                                <label className="flex flex-col gap-1">
                                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                        Key Signature
                                    </span>
                                    <select
                                        value={String(newScoreKeyFifths)}
                                        onChange={(event) => setNewScoreKeyFifths(Number(event.target.value))}
                                        className="rounded border border-gray-300 px-2 py-1 text-sm"
                                    >
                                        {newScoreKeyOptions.map((option) => (
                                            <option key={option.fifths} value={option.fifths}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                            <label className="flex flex-col gap-1">
                                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    Time Signature
                                </span>
                                <select
                                    value={`${newScoreTimeNumerator}/${newScoreTimeDenominator}`}
                                    onChange={(event) => {
                                        const [numerator, denominator] = event.target.value.split('/').map((value) => Number(value));
                                        if (Number.isFinite(numerator) && Number.isFinite(denominator)) {
                                            setNewScoreTimeNumerator(numerator);
                                            setNewScoreTimeDenominator(denominator);
                                        }
                                    }}
                                    className="rounded border border-gray-300 px-2 py-1 text-sm"
                                >
                                    {newScoreTimeOptions.map((option) => (
                                        <option key={option.label} value={`${option.numerator}/${option.denominator}`}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>
                        <div className="mt-4 flex gap-2">
                            <button
                                type="button"
                                onClick={handleCreateNewScore}
                                className="flex-1 rounded border border-gray-300 bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                            >
                                Create Score
                            </button>
                            <button
                                type="button"
                                onClick={() => setNewScoreDialogOpen(false)}
                                className="flex-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {compareView && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
                    data-testid="checkpoint-compare-modal"
                >
                    <div className="flex w-full max-w-6xl flex-col gap-4 rounded bg-white p-4 shadow-lg">
                        <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold text-gray-800">
                                Compare Checkpoint
                            </div>
                            <button
                                type="button"
                                onClick={() => setCompareView(null)}
                                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                            >
                                Close
                            </button>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="flex flex-col gap-2">
                                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    Current
                                </span>
                                <textarea
                                    readOnly
                                    value={compareView.currentXml}
                                    className="h-96 w-full rounded border border-gray-200 bg-gray-50 p-2 font-mono text-xs text-gray-700"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    {compareView.title}
                                </span>
                                <textarea
                                    readOnly
                                    value={compareView.checkpointXml}
                                    className="h-96 w-full rounded border border-gray-200 bg-gray-50 p-2 font-mono text-xs text-gray-700"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
            </div>
        </div>
    );
}
