import WebMscore from 'webmscore';
import { InputFileFormat, Positions } from 'webmscore/schemas';

export type { InputFileFormat, Positions };

export interface Score {
    destroy: () => void;
    saveSvg: (pageNumber?: number, drawPageBackground?: boolean) => Promise<string>;
    savePdf: () => Promise<Uint8Array>;
    saveMxl?: () => Promise<Uint8Array>;
    saveMsc?: (format?: 'mscz' | 'mscx') => Promise<Uint8Array>;
    saveMidi?: (midiExpandRepeats?: boolean, exportRPNs?: boolean) => Promise<Uint8Array>;
    saveAudio?: (format: 'wav' | 'ogg' | 'flac' | 'mp3') => Promise<Uint8Array>;
    savePng?: (pageNumber?: number, drawPageBackground?: boolean, transparent?: boolean) => Promise<Uint8Array>;
    setSoundFont: (data: Uint8Array) => Promise<void>;
    metadata: () => Promise<Record<string, unknown>>;
    measurePositions: () => Promise<Positions>;
    segmentPositions: () => Promise<Positions>;
    /**
     * Optional mutation/undo surface exposed by custom webmscore builds.
     * These methods may be undefined if the WASM bindings were not compiled with mutation support.
     */
    selectElementAtPoint?: (pageNumber: number, x: number, y: number) => Promise<unknown> | unknown;
    selectElementAtPointWithMode?: (
        pageNumber: number,
        x: number,
        y: number,
        mode: 0 | 1 | 2,
    ) => Promise<unknown> | unknown;
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
    toggleLineBreak?: () => Promise<unknown> | unknown;
    togglePageBreak?: () => Promise<unknown> | unknown;
    setVoice?: (voiceIndex: number) => Promise<unknown> | unknown;
    undo?: () => Promise<unknown> | unknown;
    redo?: () => Promise<unknown> | unknown;
    relayout?: () => Promise<unknown> | unknown;
    setTimeSignature?: (numerator: number, denominator: number) => Promise<unknown> | unknown;
    setKeySignature?: (fifths: number) => Promise<unknown> | unknown;
    getKeySignature?: () => Promise<number> | number;
    setClef?: (clefType: number) => Promise<unknown> | unknown;
    addDynamic?: (dynamicType: number) => Promise<unknown> | unknown;
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
}

export interface WebMscoreInstance {
    load: (format: InputFileFormat, data: Uint8Array, fonts?: Uint8Array[], doLayout?: boolean) => Promise<Score>;
    ready: Promise<void>;
}

let initialized = false;

export const loadWebMscore = async (): Promise<WebMscoreInstance> => {
    if (initialized) {
        return WebMscore as unknown as WebMscoreInstance;
    }

    await WebMscore.ready;
    initialized = true;
    return WebMscore as unknown as WebMscoreInstance;
};
