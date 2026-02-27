import WebMscoreImport from 'webmscore';
import { InputFileFormat, Positions } from 'webmscore/schemas';

export type { InputFileFormat, Positions };

export interface Score {
    destroy: (soft?: boolean) => void;
    saveSvg: (pageNumber?: number, drawPageBackground?: boolean, highlightSelection?: boolean) => Promise<string>;
    savePdf: () => Promise<Uint8Array>;
    saveXml?: () => Promise<Uint8Array>;
    saveMxl?: () => Promise<Uint8Array>;
    saveMsc?: (format?: 'mscz' | 'mscx') => Promise<Uint8Array>;
    saveMidi?: (midiExpandRepeats?: boolean, exportRPNs?: boolean) => Promise<Uint8Array>;
    saveAudio?: (format: 'wav' | 'ogg' | 'flac' | 'mp3') => Promise<Uint8Array>;
    savePng?: (pageNumber?: number, drawPageBackground?: boolean, transparent?: boolean) => Promise<Uint8Array>;
    setSoundFont: (data: Uint8Array) => Promise<void>;
    synthAudioBatchFromSelection?: (batchSize: number) => Promise<(cancel?: boolean) => Promise<unknown[]>> | ((cancel?: boolean) => Promise<unknown[]>);
    synthSelectionPreviewBatch?: (batchSize: number, durationMs?: number) => Promise<(cancel?: boolean) => Promise<unknown[]>> | ((cancel?: boolean) => Promise<unknown[]>);
    metadata: () => Promise<Record<string, unknown>>;
    measurePositions: () => Promise<Positions>;
    segmentPositions: () => Promise<Positions>;
    measureSignatureCount?: (partIndex: number) => Promise<number> | number;
    measureSignatureAt?: (partIndex: number, measureIndex: number) => Promise<string> | string;
    measureSignatures?: (partIndex: number) => Promise<string[]> | string[];
    measureLineBreaks?: () => Promise<boolean[]> | boolean[];
    setMeasureLineBreaks?: (breaks: boolean[]) => Promise<boolean> | boolean;
    /**
     * Optional mutation/undo surface exposed by custom webmscore builds.
     * These methods may be undefined if the WASM bindings were not compiled with mutation support.
     */
    selectElementAtPoint?: (pageNumber: number, x: number, y: number) => Promise<unknown> | unknown;
    selectMeasureAtPoint?: (pageNumber: number, x: number, y: number) => Promise<unknown> | unknown;
    selectPartMeasureByIndex?: (partIndex: number, measureIndex: number) => Promise<unknown> | unknown;
    selectTextElementAtPoint?: (pageNumber: number, x: number, y: number) => Promise<unknown> | unknown;
    selectElementAtPointWithMode?: (
        pageNumber: number,
        x: number,
        y: number,
        mode: 0 | 1 | 2,
    ) => Promise<unknown> | unknown;
    selectNextChord?: () => Promise<unknown> | unknown;
    selectPrevChord?: () => Promise<unknown> | unknown;
    extendSelectionNextChord?: () => Promise<unknown> | unknown;
    extendSelectionPrevChord?: () => Promise<unknown> | unknown;
    getSelectionBoundingBox?: () => Promise<{page: number, x: number, y: number, width: number, height: number} | null> | {page: number, x: number, y: number, width: number, height: number} | null;
    getSelectionBoundingBoxes?: () => Promise<Array<{page: number, x: number, y: number, width: number, height: number}>> | Array<{page: number, x: number, y: number, width: number, height: number}>;
    clearSelection?: () => Promise<unknown> | unknown;
    selectionMimeType?: () => Promise<string> | string;
    selectionMimeData?: () => Promise<Uint8Array> | Uint8Array;
    pasteSelection?: (mimeType: string, data: Uint8Array) => Promise<unknown> | unknown;
    deleteSelection?: () => Promise<unknown> | unknown;
    pitchUp?: () => Promise<unknown> | unknown;
    pitchDown?: () => Promise<unknown> | unknown;
    transpose?: (semitones: number) => Promise<unknown> | unknown;
    setAccidental?: (accidentalType: number) => Promise<unknown> | unknown;
    doubleDuration?: () => Promise<unknown> | unknown;
    halfDuration?: () => Promise<unknown> | unknown;
    toggleDot?: () => Promise<unknown> | unknown;
    toggleDoubleDot?: () => Promise<unknown> | unknown;
    setNoteEntryMode?: (enabled: boolean) => Promise<unknown> | unknown;
    setNoteEntryMethod?: (method: number) => Promise<unknown> | unknown;
    setInputStateFromSelection?: () => Promise<unknown> | unknown;
    setInputAccidentalType?: (accidentalType: number) => Promise<unknown> | unknown;
    setInputDurationType?: (durationType: number) => Promise<unknown> | unknown;
    toggleInputDot?: () => Promise<unknown> | unknown;
    addPitchByStep?: (note: number, addToChord?: boolean, insert?: boolean) => Promise<unknown> | unknown;
    enterRest?: () => Promise<unknown> | unknown;
    setDurationType?: (durationType: number) => Promise<unknown> | unknown;
    toggleLineBreak?: () => Promise<unknown> | unknown;
    togglePageBreak?: () => Promise<unknown> | unknown;
    setVoice?: (voiceIndex: number) => Promise<unknown> | unknown;
    changeSelectedElementsVoice?: (voiceIndex: number) => Promise<unknown> | unknown;
    undo?: () => Promise<unknown> | unknown;
    redo?: () => Promise<unknown> | unknown;
    relayout?: () => Promise<unknown> | unknown;
    layoutUntilPage?: (pageNumber: number) => Promise<unknown> | unknown;
    layoutUntilPageState?: (pageNumber: number) => Promise<LayoutProgressState> | LayoutProgressState;
    loadProfile?: () => Promise<Record<string, unknown>> | Record<string, unknown>;
    setLayoutMode?: (layoutMode: number) => Promise<unknown> | unknown;
    getLayoutMode?: () => Promise<number> | number;
    setTimeSignature?: (numerator: number, denominator: number) => Promise<unknown> | unknown;
    setTimeSignatureWithType?: (numerator: number, denominator: number, timeSigType: number) => Promise<unknown> | unknown;
    setKeySignature?: (fifths: number) => Promise<unknown> | unknown;
    getKeySignature?: () => Promise<number> | number;
    setClef?: (clefType: number) => Promise<unknown> | unknown;
    addDynamic?: (dynamicType: number) => Promise<unknown> | unknown;
    addHairpin?: (hairpinType: number) => Promise<unknown> | unknown;
    addPedal?: (pedalVariant: number) => Promise<unknown> | unknown;
    addSostenutoPedal?: () => Promise<unknown> | unknown;
    addUnaCorda?: () => Promise<unknown> | unknown;
    splitPedal?: () => Promise<unknown> | unknown;
    addRehearsalMark?: () => Promise<unknown> | unknown;
    addTempoText?: (bpm: number) => Promise<unknown> | unknown;
    addArticulation?: (articulationSymbolName: string) => Promise<unknown> | unknown;
    addSlur?: () => Promise<unknown> | unknown;
    addTie?: () => Promise<unknown> | unknown;
    addGraceNote?: (graceType: number) => Promise<unknown> | unknown;
    addTuplet?: (tupletCount: number) => Promise<unknown> | unknown;
    addStaffText?: (text: string) => Promise<unknown> | unknown;
    addSystemText?: (text: string) => Promise<unknown> | unknown;
    addExpressionText?: (text: string) => Promise<unknown> | unknown;
    addLyricText?: (text: string) => Promise<unknown> | unknown;
    addHarmonyText?: (variant: number, text: string) => Promise<unknown> | unknown;
    addFingeringText?: (text: string) => Promise<unknown> | unknown;
    addLeftHandGuitarFingeringText?: (text: string) => Promise<unknown> | unknown;
    addRightHandGuitarFingeringText?: (text: string) => Promise<unknown> | unknown;
    addStringNumberText?: (text: string) => Promise<unknown> | unknown;
    addInstrumentChangeText?: (text: string) => Promise<unknown> | unknown;
    addStickingText?: (text: string) => Promise<unknown> | unknown;
    addFiguredBassText?: (text: string) => Promise<unknown> | unknown;
    setTitleText?: (text: string) => Promise<unknown> | unknown;
    subtitle?: () => Promise<string> | string;
    setSubtitleText?: (text: string) => Promise<unknown> | unknown;
    setComposerText?: (text: string) => Promise<unknown> | unknown;
    setLyricistText?: (text: string) => Promise<unknown> | unknown;
    setSelectedText?: (text: string) => Promise<unknown> | unknown;
    appendPart?: (instrumentId: string) => Promise<unknown> | unknown;
    appendPartByMusicXmlId?: (instrumentMusicXmlId: string) => Promise<unknown> | unknown;
    removePart?: (partIndex: number) => Promise<unknown> | unknown;
    setPartVisible?: (partIndex: number, visible: boolean) => Promise<unknown> | unknown;
    listInstrumentTemplates?: () => Promise<unknown> | unknown;
    addNoteFromRest?: () => Promise<unknown> | unknown;
    toggleRepeatStart?: () => Promise<unknown> | unknown;
    toggleRepeatEnd?: () => Promise<unknown> | unknown;
    setRepeatCount?: (count: number) => Promise<unknown> | unknown;
    setBarLineType?: (barLineType: number) => Promise<unknown> | unknown;
    addVolta?: (endingNumber: number) => Promise<unknown> | unknown;
    insertMeasures?: (count: number, target: number) => Promise<unknown> | unknown;
    removeSelectedMeasures?: () => Promise<unknown> | unknown;
    removeTrailingEmptyMeasures?: () => Promise<unknown> | unknown;
}

export interface LayoutProgressState {
    targetPage: number;
    targetSatisfied: boolean;
    availablePages: number;
    totalMeasures: number;
    laidOutMeasures: number;
    loadedUntilTick: number;
    hasMorePages: boolean;
    isComplete: boolean;
}

export interface WebMscoreInstance {
    load: (format: InputFileFormat, data: Uint8Array, fonts?: Uint8Array[], doLayout?: boolean) => Promise<Score>;
    ready: Promise<void>;
}

// NOTE:
// The `webmscore` package can present different module shapes depending on
// runtime/bundler interop (CJS/ESM default wrapping). Resolve once so callers
// always receive an object with { ready, load }.
const resolveWebMscore = (mod: unknown): WebMscoreInstance => {
    const candidates = [
        mod as Record<string, unknown> | undefined,
        (mod as any)?.default as Record<string, unknown> | undefined,
        (mod as any)?.default?.default as Record<string, unknown> | undefined,
    ];

    for (const candidate of candidates) {
        if (!candidate) continue;
        const load = candidate.load;
        const ready = candidate.ready;
        if (typeof load === 'function' && ready && typeof (ready as Promise<void>).then === 'function') {
            return candidate as unknown as WebMscoreInstance;
        }
    }

    throw new Error('Unexpected webmscore module shape: missing ready/load');
};

const WebMscore = resolveWebMscore(WebMscoreImport as unknown);

let initialized = false;
let inProcessInitialized = false;
let inProcessWebMscore: WebMscoreInstance | null = null;
let inProcessInitPromise: Promise<WebMscoreInstance> | null = null;

const ensureBrowserMscoreScriptUrl = () => {
    if (typeof window === 'undefined') {
        return;
    }
    const globalScope = globalThis as Record<string, unknown>;
    if (typeof globalScope.MSCORE_SCRIPT_URL === 'string' && globalScope.MSCORE_SCRIPT_URL.length > 0) {
        return;
    }
    const base = typeof document !== 'undefined' ? document.baseURI : window.location.href;
    globalScope.MSCORE_SCRIPT_URL = new URL('.', base).href;
};

export const loadWebMscore = async (): Promise<WebMscoreInstance> => {
    if (initialized) {
        return WebMscore as unknown as WebMscoreInstance;
    }

    await WebMscore.ready;
    initialized = true;
    return WebMscore as unknown as WebMscoreInstance;
};

export const loadWebMscoreInProcess = async (): Promise<WebMscoreInstance> => {
    if (inProcessInitialized && inProcessWebMscore) {
        return inProcessWebMscore;
    }
    if (inProcessInitPromise) {
        return inProcessInitPromise;
    }

    inProcessInitPromise = (async () => {
        ensureBrowserMscoreScriptUrl();
        const inProcessImport = await import('../webmscore-fork/web-public/src/index.js');
        const resolved = resolveWebMscore(inProcessImport as unknown);
        await resolved.ready;
        inProcessWebMscore = resolved;
        inProcessInitialized = true;
        return resolved;
    })();

    try {
        return await inProcessInitPromise;
    } finally {
        inProcessInitPromise = null;
    }
};
