'use client';

import React, { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { loadWebMscore, Score, InputFileFormat, Positions, type LayoutProgressState } from '../lib/webmscore-loader';
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
import { CodeMirrorEditor, type CodeEditorThemeMode } from './CodeMirrorEditor';
import { Toolbar, type MeasureInsertTarget } from './Toolbar';
import {
    AI_PROVIDER_CAPABILITIES,
    AI_PROVIDER_CONFIGS,
    AI_PROVIDER_LABELS,
    DEFAULT_MAX_TOKENS_BY_PROVIDER,
    DEFAULT_MODEL_BY_PROVIDER,
    isOpenAiCompatibleProvider,
    loadAiModelsDirect,
    requestAiTextDirect,
    type AiProvider,
} from '../lib/ai-provider-adapters';
import {
    getLegacyLlmProxyBase,
    getScoreEditorApiBase,
    resolveLlmApiPath,
} from '../lib/score-editor-api-client';

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

type MeasureAlignmentRow = {
    leftIndex: number | null;
    rightIndex: number | null;
    match: boolean;
};

type SynthBatchChunk = {
    chunk: Uint8Array;
    startTime: number;
    endTime?: number;
    done?: boolean;
};

type SynthBatchIterator = (cancel?: boolean) => Promise<SynthBatchChunk[]>;

const TRANSPORT_SYNTH_BATCH_SIZE = 2;
const SELECTION_SYNTH_BATCH_SIZE = 1;
const PREVIEW_SYNTH_BATCH_SIZE = 1;
const PREVIEW_DURATION_MS = 350;
const SYNTH_START_PREROLL_SECONDS = 0.015;

type PartAlignment = {
    partIndex: number;
    rows: MeasureAlignmentRow[];
    strategy: 'index' | 'lcs';
    lcsRatio: number;
    leftCount: number;
    rightCount: number;
};

const LAYOUT_MODES = {
    PAGE: 0,
    FLOAT: 1,
    LINE: 2,
    SYSTEM: 3,
    HORIZONTAL_FIXED: 4,
} as const;

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

const PROXY_MISSING_STATUSES = new Set([404, 405, 501]);
const ANTHROPIC_EMBED_PROXY_ERROR = [
    'Claude requires an LLM proxy in embed mode because browser-direct Anthropic calls are blocked by CORS.',
    'Configure NEXT_PUBLIC_SCORE_EDITOR_API_BASE (recommended) or NEXT_PUBLIC_LLM_PROXY_URL, or serve /api/llm/anthropic on the same origin.',
].join(' ');

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

type AiPromptSection = {
    title: string;
    content: string;
};

type AiImageAttachment = {
    mediaType: 'image/png';
    base64: string;
};

type AiPdfAttachment = {
    mediaType: 'application/pdf';
    base64: string;
    filename: string;
};

type AiChatMessage = {
    role: 'user' | 'assistant';
    text: string;
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

const LARGE_SCORE_THRESHOLD_BYTES = 2 * 1024 * 1024;
const DEFAULT_PAGE_RENDER_TIMEOUT_MS = 45_000;
const LARGE_PROGRESSIVE_PAGE_RENDER_TIMEOUT_MS = 180_000;
const PROGRESSIVE_PAGE_LAYOUT_TIMEOUT_MS = 90_000;
const PROGRESSIVE_PAGE_LAYOUT_CONFIRM_TIMEOUT_MS = 120_000;
const PROGRESSIVE_PAGE_LAYOUT_EXPAND_TIMEOUT_MS = 300_000;
const ENGINE_OPERATION_STALL_RELEASE_MS = 600_000;
const LARGE_SCORE_BACKGROUND_TASK_DELAY_MS = 15_000;
const LARGE_SCORE_BACKGROUND_TASK_RETRY_DELAY_MS = 5_000;
const LARGE_SCORE_BACKGROUND_TASK_MAX_RETRIES = 12;
const AI_PAGE_SVG_CONTEXT_MAX_CHARS = 180_000;
const AI_SELECTION_CONTEXT_MAX_CHARS = 40_000;
const AI_SELECTION_BOX_CONTEXT_LIMIT = 24;
const AI_PDF_ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024;
const AI_CHAT_CONTEXT_MAX_CHARS = 40_000;
const AI_CHAT_CONTEXT_MAX_MESSAGES = 24;
const AI_PATCH_SYSTEM_PROMPT = 'You are a MusicXML editor. Return only a JSON patch payload (musicxml-patch@1), no markdown or commentary.';
const AI_PATCH_STRICT_RETRY_SUFFIX = [
    'IMPORTANT RETRY INSTRUCTIONS:',
    'Return ONLY the raw JSON object for a musicxml-patch@1 payload.',
    'Do not wrap in markdown fences.',
    'Do not include commentary before or after the JSON.',
].join('\n');
const AI_PATCH_REQUEST_RETRY_DELAY_MS = 600;
const AI_CHAT_SYSTEM_PROMPT = 'You are a helpful music notation assistant. Answer clearly and practically for score editing and engraving workflows.';
const CODE_EDITOR_THEME_STORAGE_KEY = 'ots_code_editor_theme';
const MUSIC_SPECIALISTS_HF_TOKEN_STORAGE_KEY = 'ots_music_specialists_hf_token';
const MUSIC_SPECIALISTS_NOTAGEN_MODEL_STORAGE_KEY = 'ots_music_specialists_notagen_model';
const MUSIC_SPECIALISTS_NOTAGEN_REVISION_STORAGE_KEY = 'ots_music_specialists_notagen_revision';
const MUSIC_SPECIALISTS_CHATMUSICIAN_MODEL_STORAGE_KEY = 'ots_music_specialists_chatmusician_model';
const MUSIC_SPECIALISTS_CHATMUSICIAN_REVISION_STORAGE_KEY = 'ots_music_specialists_chatmusician_revision';
const MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_MODEL = (process.env.NEXT_PUBLIC_MUSIC_NOTAGEN_DEFAULT_MODEL_ID || '').trim();
const MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_REVISION = (process.env.NEXT_PUBLIC_MUSIC_NOTAGEN_DEFAULT_REVISION || '').trim();
const MUSIC_SPECIALISTS_DEFAULT_CHATMUSICIAN_MODEL = (process.env.NEXT_PUBLIC_MUSIC_CHATMUSICIAN_DEFAULT_MODEL_ID || '').trim();
const MUSIC_SPECIALISTS_DEFAULT_CHATMUSICIAN_REVISION = (process.env.NEXT_PUBLIC_MUSIC_CHATMUSICIAN_DEFAULT_REVISION || '').trim();
const HUGGING_FACE_TOKENS_URL = 'https://huggingface.co/settings/tokens';
const CODE_EDITOR_THEME_OPTIONS: Array<{ value: CodeEditorThemeMode; label: string }> = [
    { value: 'light', label: 'Light' },
    { value: 'light-contrast', label: 'Light High Contrast' },
    { value: 'dark', label: 'Dark' },
    { value: 'dark-contrast', label: 'Dark High Contrast' },
];
const CODE_EDITOR_THEME_VALUES = new Set<CodeEditorThemeMode>(CODE_EDITOR_THEME_OPTIONS.map((option) => option.value));

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
const ELEMENT_SELECTION_SELECTOR = ['.Note', '.Rest', '.Chord', '.LayoutBreak', '.Pedal', '.PedalSegment', '.Measure', TEXT_ELEMENT_SELECTOR]
    .filter(Boolean)
    .join(', ');
const ELEMENT_SELECTION_CLASSES = new Set([
    'Note',
    'Rest',
    'Chord',
    'LayoutBreak',
    'Pedal',
    'PedalSegment',
    'Measure',
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

const buildPromptWithSections = (prompt: string, sections: AiPromptSection[] = []) => {
    const trimmedPrompt = prompt.trim();
    const contextSections = sections
        .map((section) => ({
            title: section.title.trim(),
            content: section.content.trim(),
        }))
        .filter((section) => Boolean(section.title) && Boolean(section.content));
    if (!contextSections.length) {
        return trimmedPrompt;
    }

    const contextText = contextSections
        .map((section, index) => `[Context ${index + 1}] ${section.title}\n${section.content}`)
        .join('\n\n');
    if (!trimmedPrompt) {
        return contextText;
    }
    return `${trimmedPrompt}\n\n${contextText}`;
};

const buildAiPrompt = (prompt: string, sections: AiPromptSection[] = []) => {
    const patchSpec = `Return ONLY valid JSON in the following format:
{
  "format": "musicxml-patch@1",
  "ops": [
    { "op": "replace", "path": "/score-partwise/part[@id='P1']/measure[@number='1']/note[1]", "value": "<note>...</note>" },
    { "op": "setText", "path": "/score-partwise/part[@id='P1']/measure[@number='1']/note[1]/duration", "value": "2" },
    { "op": "setAttr", "path": "/score-partwise/part[@id='P1']/measure[@number='1']/note[1]", "name": "default-x", "value": "123.45" },
    { "op": "insertAfter", "path": "/score-partwise/part[@id='P1']/measure[@number='1']/note[1]", "value": "<note>...</note>" },
    { "op": "delete", "path": "/score-partwise/part[@id='P1']/measure[@number='1']/note[2]" }
  ]
}
Use ONLY these ops: replace, setText, setAttr, insertBefore, insertAfter, delete.
Each XPath must match exactly one node.`;
    const promptWithContext = buildPromptWithSections(prompt, sections);
    if (!promptWithContext) {
        return patchSpec;
    }
    return `${promptWithContext}\n\n${patchSpec}`;
};

const truncateAiContext = (text: string, maxChars: number) => {
    const trimmed = text.trim();
    if (trimmed.length <= maxChars) {
        return {
            value: trimmed,
            truncated: false,
            originalLength: trimmed.length,
        };
    }
    return {
        value: trimmed.slice(0, maxChars),
        truncated: true,
        originalLength: trimmed.length,
    };
};

const encodeBase64 = (data: Uint8Array) => {
    const globalBuffer = (globalThis as { Buffer?: { from: (bytes: Uint8Array) => { toString: (encoding: string) => string } } }).Buffer;
    if (globalBuffer) {
        return globalBuffer.from(data).toString('base64');
    }
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < data.length; offset += chunkSize) {
        const chunk = data.subarray(offset, offset + chunkSize);
        binary += String.fromCharCode(...chunk);
    }
    if (typeof btoa === 'function') {
        return btoa(binary);
    }
    throw new Error('No base64 encoder available in this environment.');
};

const buildAiChatTranscript = (messages: AiChatMessage[]) => {
    const recentMessages = messages.slice(-AI_CHAT_CONTEXT_MAX_MESSAGES);
    if (!recentMessages.length) {
        return '';
    }
    const transcriptRaw = recentMessages
        .map((message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.text.trim()}`)
        .filter(Boolean)
        .join('\n\n');
    if (!transcriptRaw.trim()) {
        return '';
    }
    const transcript = truncateAiContext(transcriptRaw, AI_CHAT_CONTEXT_MAX_CHARS);
    return `${transcript.value}${transcript.truncated
        ? `\n\n[Chat transcript truncated from ${transcript.originalLength} characters.]`
        : ''}`;
};

const isMissingProxyStatus = (status: number) => PROXY_MISSING_STATUSES.has(status);

const errorMessage = (err: unknown) => (err instanceof Error ? err.message.trim() : '');

const shouldRetryAiPatchRequestError = (err: unknown) => {
    const message = errorMessage(err).toLowerCase();
    if (!message) {
        return true;
    }
    if (
        message.includes('missing api') ||
        message.includes('invalid api') ||
        message.includes('unauthorized') ||
        message.includes('forbidden') ||
        message.includes('unsupported') ||
        message.includes('does not support pdf') ||
        message.includes('select a model') ||
        message.includes('missing model')
    ) {
        return false;
    }
    return true;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export default function ScoreEditor() {
    const searchParams = useSearchParams();
    const isEmbedBuild = process.env.NEXT_PUBLIC_BUILD_MODE === 'embed';
    const scoreEditorApiBase = getScoreEditorApiBase();
    const llmProxyBase = scoreEditorApiBase || getLegacyLlmProxyBase();
    // Always try proxy first; embed mode falls back to direct calls only for providers that support browser CORS.
    const useLlmProxy = true;
    const aiEnabled = true;
    const proxyUrlFor = useCallback((path: string) => resolveLlmApiPath(path), []);

    // Embed mode: Load external XML files for comparison
    const compareLeftUrl = searchParams.get('compareLeft');
    const compareRightUrl = searchParams.get('compareRight');
    const leftLabel = searchParams.get('leftLabel') || 'Left';
    const rightLabel = searchParams.get('rightLabel') || 'Right';
    const isEmbedMode = Boolean(compareLeftUrl && compareRightUrl);

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
    const [hasBackendHighlighting, setHasBackendHighlighting] = useState(false);
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
    const soundFontLoadedRef = useRef(soundFontLoaded);
    const triedSoundFontRef = useRef(triedSoundFont);
    const soundFontLoadPromiseRef = useRef<Promise<boolean> | null>(null);
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
    const [compareSwapped, setCompareSwapped] = useState(false);
    const [compareLeftCheckpointLabel, setCompareLeftCheckpointLabel] = useState('');
    const [compareRightCheckpointLabel, setCompareRightCheckpointLabel] = useState('');
    const [compareRightScore, setCompareRightScore] = useState<Score | null>(null);
    const compareRightScoreRef = useRef<Score | null>(null);
    const compareLoadedCheckpointXmlRef = useRef<string | null>(null);
    const [compareRightParts, setCompareRightParts] = useState<PartSummary[]>([]);
    const [compareRightPageCount, setCompareRightPageCount] = useState(1);
    const [compareRightLoading, setCompareRightLoading] = useState(false);
    const [compareRightError, setCompareRightError] = useState<string | null>(null);
    const [compareZoom, setCompareZoom] = useState<number | null>(null);
    const [compareLeftSvgSize, setCompareLeftSvgSize] = useState<{ width: number; height: number } | null>(null);
    const [compareRightSvgSize, setCompareRightSvgSize] = useState<{ width: number; height: number } | null>(null);
    const [compareLeftMeasurePositions, setCompareLeftMeasurePositions] = useState<Positions | null>(null);
    const [compareRightMeasurePositions, setCompareRightMeasurePositions] = useState<Positions | null>(null);
    const [compareAlignments, setCompareAlignments] = useState<PartAlignment[]>([]);
    const [compareAlignmentLoading, setCompareAlignmentLoading] = useState(false);
    const [compareAlignmentRevision, setCompareAlignmentRevision] = useState(0);
    const [compareSwapBusy, setCompareSwapBusy] = useState(false);
    const [compareSignatures, setCompareSignatures] = useState<{ left: string[][]; right: string[][] } | null>(null);
    const [compareContinuousMode, setCompareContinuousMode] = useState(false);
    const [compareReflowMode, setCompareReflowMode] = useState(false);
    const compareLayoutRestoreRef = useRef<number | null>(null);
    const compareLineBreakRestoreRef = useRef<{ current: boolean[]; checkpoint: boolean[] } | null>(null);
    const compareLeftContainerRef = useRef<HTMLDivElement>(null);
    const compareRightContainerRef = useRef<HTMLDivElement>(null);
    const compareLeftWrapperRef = useRef<HTMLDivElement>(null);
    const compareRightWrapperRef = useRef<HTMLDivElement>(null);
    const compareLeftScrollRef = useRef<HTMLDivElement>(null);
    const compareRightScrollRef = useRef<HTMLDivElement>(null);
    const compareGutterScrollRef = useRef<HTMLDivElement>(null);
    const compareScrollSyncRef = useRef(false);
    const compareRightRenderInFlightRef = useRef(false);
    const [checkpointsCollapsed, setCheckpointsCollapsed] = useState(false);
    const [leftSidebarTab, setLeftSidebarTab] = useState<'checkpoints' | 'scores'>('checkpoints');
    const [scoreSummaries, setScoreSummaries] = useState<ScoreSummary[]>([]);
    const [scoreSummariesLoading, setScoreSummariesLoading] = useState(false);
    const [scoreSummariesError, setScoreSummariesError] = useState<string | null>(null);
    const [scoreDirtySinceCheckpoint, setScoreDirtySinceCheckpoint] = useState(false);
    const [scoreDirtySinceXml, setScoreDirtySinceXml] = useState(false);
    const [xmlSidebarMode, setXmlSidebarMode] = useState<'closed' | 'open' | 'full'>('closed');
    const [xmlSidebarWidth, setXmlSidebarWidth] = useState<number>(384); // default 'open' width (w-96)
    const [isResizingSidebar, setIsResizingSidebar] = useState(false);
    const sidebarResizeStartXRef = useRef<number>(0);
    const sidebarResizeStartWidthRef = useRef<number>(0);
    const [xmlSidebarTab, setXmlSidebarTab] = useState<'xml' | 'assistant'>('xml');
    const [codeEditorTheme, setCodeEditorTheme] = useState<CodeEditorThemeMode>('light');
    const [xmlText, setXmlText] = useState('');
    const [xmlDirty, setXmlDirty] = useState(false);
    const [xmlLoading, setXmlLoading] = useState(false);
    const [xmlError, setXmlError] = useState<string | null>(null);
    const [aiProvider, setAiProvider] = useState<AiProvider>('openai');
    const [aiModel, setAiModel] = useState('');
    const [aiApiKey, setAiApiKey] = useState('');
    const [musicHfToken, setMusicHfToken] = useState('');
    const [musicNotaGenModelId, setMusicNotaGenModelId] = useState(MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_MODEL);
    const [musicNotaGenRevision, setMusicNotaGenRevision] = useState(MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_REVISION);
    const [musicChatMusicianModelId, setMusicChatMusicianModelId] = useState(MUSIC_SPECIALISTS_DEFAULT_CHATMUSICIAN_MODEL);
    const [musicChatMusicianRevision, setMusicChatMusicianRevision] = useState(MUSIC_SPECIALISTS_DEFAULT_CHATMUSICIAN_REVISION);
    const [aiMode, setAiMode] = useState<'patch' | 'chat'>('patch');
    const [aiPrompt, setAiPrompt] = useState('');
    const [aiIncludeXml, setAiIncludeXml] = useState(true);
    const [aiIncludePdf, setAiIncludePdf] = useState(false);
    const [aiIncludePage, setAiIncludePage] = useState(false);
    const [aiIncludeSelection, setAiIncludeSelection] = useState(false);
    const [aiIncludeChat, setAiIncludeChat] = useState(false);
    const [aiIncludeRenderedImage, setAiIncludeRenderedImage] = useState(false);
    const [aiMaxTokensMode, setAiMaxTokensMode] = useState<'auto' | 'custom'>('auto');
    const [aiMaxTokens, setAiMaxTokens] = useState(4096);
    const [aiChatInput, setAiChatInput] = useState('');
    const [aiChatMessages, setAiChatMessages] = useState<AiChatMessage[]>([]);
    const [aiOutput, setAiOutput] = useState('');
    const [aiPatch, setAiPatch] = useState<MusicXmlPatch | null>(null);
    const [aiPatchError, setAiPatchError] = useState<string | null>(null);
    const [aiPatchedXml, setAiPatchedXml] = useState('');
    const [aiBaseXml, setAiBaseXml] = useState('');
    const [aiBusy, setAiBusy] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);
    const [aiModels, setAiModels] = useState<string[]>([]);
    const [aiModelsLoading, setAiModelsLoading] = useState(false);
    const [aiModelsError, setAiModelsError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(0);
    const [pageCount, setPageCount] = useState(1);
    const [progressivePagingActive, setProgressivePagingActive] = useState(false);
    const [progressiveHasMorePages, setProgressiveHasMorePages] = useState(false);
    const [progressiveLoadEnabled, setProgressiveLoadEnabled] = useState(true);
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
    const toolbarRef = useRef<HTMLDivElement>(null);
    const [toolbarHeight, setToolbarHeight] = useState(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [audioBusy, setAudioBusy] = useState(false);
    const audioUrlRef = useRef<string | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const audioSourcesRef = useRef<AudioBufferSourceNode[]>([]);
    const streamIteratorRef = useRef<((cancel?: boolean) => Promise<any>) | null>(null);
    const transportPlaybackGenerationRef = useRef(0);
    const previewAudioSourcesRef = useRef<AudioBufferSourceNode[]>([]);
    const previewStreamIteratorRef = useRef<((cancel?: boolean) => Promise<any>) | null>(null);
    const previewPlaybackGenerationRef = useRef(0);
    const clipboardRef = useRef<{ mimeType: string; data: Uint8Array } | null>(null);
    const currentPageRef = useRef(currentPage);
    const selectedPointRef = useRef<{ page: number, x: number, y: number } | null>(selectedPoint);
    const progressivePageLoadInFlightRef = useRef(false);
    const pageNavigationInFlightRef = useRef(false);
    const largeScoreSessionRef = useRef(false);
    const largeSessionXmlAutoloadDeferredLoggedRef = useRef(false);
    const backgroundInitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const scoreOperationQueueRef = useRef<Promise<void>>(Promise.resolve());

    const detectInputFormat = (source: string): InputFileFormat => {
        const normalized = source.toLowerCase().split('#')[0].split('?')[0];
        if (normalized.endsWith('.xml') || normalized.endsWith('.musicxml')) {
            return 'musicxml';
        }
        if (normalized.endsWith('.mxl')) {
            return 'mxl';
        }
        if (normalized.endsWith('.mscx')) {
            return 'mscx';
        }
        return 'mscz';
    };
    const isLargeScoreData = (data: Uint8Array) => data.byteLength >= LARGE_SCORE_THRESHOLD_BYTES;
    const shouldSkipCoverPageFirstRender = (format: InputFileFormat, data: Uint8Array) => (
        isLargeScoreData(data) && (format === 'mscz' || format === 'mscx' || format === 'mxl')
    );
    const resolveWebMscoreEngine = async () => {
        return { webMscore: await loadWebMscore(), mode: 'worker' as const };
    };
    const aiKeyStorageKey = `ots_${aiProvider}_api_key`;
    const aiModelStorageKey = `ots_${aiProvider}_model`;
    const autoFitPendingRef = useRef(true);

    const fetchMeasureSignatures = useCallback(async (targetScore: Score, partIndex: number) => {
        const parseSignatures = (value: unknown) => {
            if (Array.isArray(value)) {
                return value.filter((entry): entry is string => typeof entry === 'string');
            }
            if (typeof value === 'string') {
                try {
                    const parsed = JSON.parse(value);
                    if (Array.isArray(parsed)) {
                        return parsed.filter((entry): entry is string => typeof entry === 'string');
                    }
                } catch (err) {
                    console.warn('Failed to parse measure signatures payload:', err);
                }
            }
            return null;
        };

        if (targetScore.measureSignatures) {
            const signatures = await targetScore.measureSignatures(partIndex);
            const parsed = parseSignatures(signatures);
            if (parsed && parsed.length > 0) {
                return parsed;
            }
            if (parsed && parsed.length === 0 && targetScore.measureSignatureCount && targetScore.measureSignatureAt) {
                const count = await targetScore.measureSignatureCount(partIndex);
                if (count > 0) {
                    const fallback: string[] = [];
                    for (let i = 0; i < count; i += 1) {
                        fallback.push(await targetScore.measureSignatureAt(partIndex, i));
                    }
                    return fallback;
                }
                return parsed;
            }
            if (parsed) {
                return parsed;
            }
        }

        if (targetScore.measureSignatureCount && targetScore.measureSignatureAt) {
            const count = await targetScore.measureSignatureCount(partIndex);
            const signatures: string[] = [];
            for (let i = 0; i < count; i += 1) {
                signatures.push(await targetScore.measureSignatureAt(partIndex, i));
            }
            return signatures;
        }

        return [];
    }, []);

    const fetchMeasureLineBreaks = useCallback(async (targetScore: Score) => {
        if (!targetScore.measureLineBreaks) {
            return [];
        }
        const breaks = await targetScore.measureLineBreaks();
        return Array.isArray(breaks) ? breaks.map(Boolean) : [];
    }, []);

    const applyMeasureLineBreaks = useCallback(async (targetScore: Score, breaks: boolean[]) => {
        if (!targetScore.setMeasureLineBreaks) {
            return false;
        }
        return targetScore.setMeasureLineBreaks(breaks);
    }, []);

    const refreshMeasurePositions = useCallback(async (targetScore: Score, setter: (positions: Positions | null) => void) => {
        if (!targetScore.measurePositions) {
            return;
        }
        try {
            const positions = await targetScore.measurePositions();
            setter(positions ?? null);
        } catch (err) {
            console.warn('Failed to load measure positions for compare highlight:', err);
        }
    }, []);


    const extractMeasureSignaturesFromXml = useCallback((xml: string) => {
        if (typeof DOMParser === 'undefined') {
            return [];
        }
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'application/xml');
        if (doc.getElementsByTagName('parsererror').length > 0) {
            throw new Error('Invalid MusicXML');
        }

        const serializer = new XMLSerializer();
        const normalize = (value: string) => value.replace(/>\s+</g, '><').trim();
        const isMscx = doc.documentElement?.tagName === 'museScore';
        const shouldStripAttribute = (name: string) => {
            const lower = name.toLowerCase();
            if (lower === 'width') {
                return true;
            }
            if (lower === 'id' || lower === 'xml:id') {
                return true;
            }
            if (lower === 'x' || lower === 'y') {
                return true;
            }
            if (lower === 'default-x' || lower === 'default-y' || lower === 'relative-x' || lower === 'relative-y') {
                return true;
            }
            if (lower.startsWith('font-')) {
                return true;
            }
            return false;
        };

        const scrubElement = (element: Element) => {
            Array.from(element.attributes).forEach((attr) => {
                if (shouldStripAttribute(attr.name)) {
                    element.removeAttribute(attr.name);
                }
            });
            Array.from(element.children).forEach((child) => scrubElement(child));
        };

        const measureSignature = (measure: Element) => {
            const clone = measure.cloneNode(true) as Element;
            clone.removeAttribute('number');
            clone.removeAttribute('width');
            if (!isMscx) {
                Array.from(clone.getElementsByTagName('print')).forEach((node) => node.remove());
            }
            Array.from(clone.getElementsByTagName('LayoutBreak')).forEach((node) => node.remove());
            scrubElement(clone);
            return normalize(serializer.serializeToString(clone));
        };

        if (isMscx) {
            const score = doc.querySelector('Score');
            if (!score) {
                return [];
            }
            const staffs = Array.from(score.children).filter((node) => node.tagName === 'Staff') as Element[];
            return staffs.map((staff) => {
                const measures = Array.from(staff.getElementsByTagName('Measure'));
                return measures.map((measure) => measureSignature(measure));
            });
        }

        const parts = Array.from(doc.getElementsByTagName('part'));
        return parts.map((part) => {
            const measures = Array.from(part.getElementsByTagName('measure'));
            return measures.map((measure) => measureSignature(measure));
        });
    }, []);

    const replaceMeasuresInMusicXml = useCallback((
        sourceXml: string,
        targetXml: string,
        partIndex: number,
        replacements: Array<{ sourceIndex: number; targetIndex: number }>,
    ) => {
        if (!sourceXml.trim() || !targetXml.trim()) {
            return { xml: '', error: 'MusicXML content is empty.' };
        }
        if (typeof DOMParser === 'undefined') {
            return { xml: '', error: 'XML parsing is unavailable in this environment.' };
        }
        const parser = new DOMParser();
        const sourceDoc = parser.parseFromString(sourceXml, 'application/xml');
        const targetDoc = parser.parseFromString(targetXml, 'application/xml');
        if (sourceDoc.querySelector('parsererror') || targetDoc.querySelector('parsererror')) {
            return { xml: '', error: 'MusicXML is not valid XML.' };
        }

        const getPartMeasures = (doc: Document) => {
            const parts = Array.from(doc.getElementsByTagName('part'));
            const part = parts[partIndex] ?? null;
            if (!part) {
                return { part: null as Element | null, measures: [] as Element[] };
            }
            const measures = Array.from(part.children).filter(
                (node) => node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'measure',
            ) as Element[];
            return { part, measures };
        };

        const { measures: sourceMeasures } = getPartMeasures(sourceDoc);
        const { measures: targetMeasures } = getPartMeasures(targetDoc);
        for (const replacementPair of replacements) {
            const sourceMeasure = sourceMeasures[replacementPair.sourceIndex];
            const targetMeasure = targetMeasures[replacementPair.targetIndex];
            if (!sourceMeasure || !targetMeasure) {
                return { xml: '', error: 'Measure not found for the selected part/index.' };
            }
            const replacement = targetDoc.importNode(sourceMeasure, true) as Element;
            const targetNumber = targetMeasure.getAttribute('number');
            if (targetNumber) {
                replacement.setAttribute('number', targetNumber);
            }
            targetMeasure.parentNode?.replaceChild(replacement, targetMeasure);
        }

        const serializer = new XMLSerializer();
        return { xml: serializer.serializeToString(targetDoc), error: '' };
    }, []);

    const replaceMeasureInMusicXml = useCallback((
        sourceXml: string,
        targetXml: string,
        partIndex: number,
        sourceMeasureIndex: number,
        targetMeasureIndex: number,
    ) => replaceMeasuresInMusicXml(
        sourceXml,
        targetXml,
        partIndex,
        [{ sourceIndex: sourceMeasureIndex, targetIndex: targetMeasureIndex }],
    ), [replaceMeasuresInMusicXml]);

    const buildMismatchBlocks = useCallback((rows: MeasureAlignmentRow[]) => {
        const blocks: Array<{ start: number; end: number }> = [];
        let start = -1;
        rows.forEach((row, index) => {
            const mismatch = !row.match;
            if (mismatch && start === -1) {
                start = index;
            }
            if (!mismatch && start !== -1) {
                blocks.push({ start, end: index - 1 });
                start = -1;
            }
        });
        if (start !== -1) {
            blocks.push({ start, end: rows.length - 1 });
        }
        return blocks;
    }, []);

    const buildMismatchBreaks = useCallback(
        (rows: MeasureAlignmentRow[], side: 'left' | 'right', measureCount: number) => {
            const breaks = Array.from({ length: measureCount }, () => false);
            if (!rows.length || measureCount <= 0) {
                return breaks;
            }
            const blocks = buildMismatchBlocks(rows);
            for (const block of blocks) {
                let startIndex: number | null = null;
                let endIndex: number | null = null;
                for (let i = block.start; i <= block.end; i += 1) {
                    const index = side === 'left' ? rows[i].leftIndex : rows[i].rightIndex;
                    if (index === null) {
                        continue;
                    }
                    if (startIndex === null) {
                        startIndex = index;
                    }
                    endIndex = index;
                }
                if (startIndex === null || endIndex === null) {
                    continue;
                }
                if (startIndex > 0 && startIndex - 1 < measureCount) {
                    breaks[startIndex - 1] = true;
                }
                if (endIndex >= 0 && endIndex < measureCount) {
                    breaks[endIndex] = true;
                }
            }
            return breaks;
        },
        [buildMismatchBlocks],
    );

    const buildIndexAlignment = useCallback((left: string[], right: string[]): MeasureAlignmentRow[] => {
        const total = Math.max(left.length, right.length);
        const rows: MeasureAlignmentRow[] = [];
        for (let i = 0; i < total; i += 1) {
            const leftIndex = i < left.length ? i : null;
            const rightIndex = i < right.length ? i : null;
            const match = leftIndex !== null && rightIndex !== null && left[leftIndex] === right[rightIndex];
            rows.push({ leftIndex, rightIndex, match });
        }
        return rows;
    }, []);

    const normalizeAlignmentRows = useCallback((rows: MeasureAlignmentRow[]) => {
        const normalized: MeasureAlignmentRow[] = [];
        let pendingLeft: number[] = [];
        let pendingRight: number[] = [];

        const flush = () => {
            const pairCount = Math.min(pendingLeft.length, pendingRight.length);
            for (let i = 0; i < pairCount; i += 1) {
                normalized.push({
                    leftIndex: pendingLeft[i],
                    rightIndex: pendingRight[i],
                    match: false,
                });
            }
            for (let i = pairCount; i < pendingLeft.length; i += 1) {
                normalized.push({ leftIndex: pendingLeft[i], rightIndex: null, match: false });
            }
            for (let i = pairCount; i < pendingRight.length; i += 1) {
                normalized.push({ leftIndex: null, rightIndex: pendingRight[i], match: false });
            }
            pendingLeft = [];
            pendingRight = [];
        };

        rows.forEach((row) => {
            if (row.match || (row.leftIndex !== null && row.rightIndex !== null)) {
                flush();
                normalized.push(row);
                return;
            }
            if (row.leftIndex !== null) {
                pendingLeft.push(row.leftIndex);
            }
            if (row.rightIndex !== null) {
                pendingRight.push(row.rightIndex);
            }
        });
        flush();
        return normalized;
    }, []);

    const buildLcsAlignment = useCallback((left: string[], right: string[]) => {
        const n = left.length;
        const m = right.length;
        const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));

        for (let i = 0; i < n; i += 1) {
            for (let j = 0; j < m; j += 1) {
                if (left[i] === right[j]) {
                    dp[i + 1][j + 1] = dp[i][j] + 1;
                } else {
                    dp[i + 1][j + 1] = Math.max(dp[i][j + 1], dp[i + 1][j]);
                }
            }
        }

        const rows: MeasureAlignmentRow[] = [];
        let i = n;
        let j = m;
        while (i > 0 && j > 0) {
            if (left[i - 1] === right[j - 1]) {
                rows.push({ leftIndex: i - 1, rightIndex: j - 1, match: true });
                i -= 1;
                j -= 1;
            } else if (dp[i - 1][j] >= dp[i][j - 1]) {
                rows.push({ leftIndex: i - 1, rightIndex: null, match: false });
                i -= 1;
            } else {
                rows.push({ leftIndex: null, rightIndex: j - 1, match: false });
                j -= 1;
            }
        }
        while (i > 0) {
            rows.push({ leftIndex: i - 1, rightIndex: null, match: false });
            i -= 1;
        }
        while (j > 0) {
            rows.push({ leftIndex: null, rightIndex: j - 1, match: false });
            j -= 1;
        }

        rows.reverse();
        const lcsLength = dp[n][m];
        const maxLen = Math.max(n, m);
        const lcsRatio = maxLen > 0 ? lcsLength / maxLen : 0;
        return { rows: normalizeAlignmentRows(rows), lcsRatio };
    }, [normalizeAlignmentRows]);

    useEffect(() => {
        scoreRef.current = score;
    }, [score]);

    useEffect(() => {
        currentPageRef.current = currentPage;
    }, [currentPage]);

    useEffect(() => {
        selectedPointRef.current = selectedPoint;
    }, [selectedPoint]);

    useEffect(() => {
        return () => {
            clearScheduledBackgroundInit();
        };
    }, []);

    useEffect(() => {
        soundFontLoadedRef.current = soundFontLoaded;
    }, [soundFontLoaded]);

    useEffect(() => {
        triedSoundFontRef.current = triedSoundFont;
    }, [triedSoundFont]);

    useEffect(() => {
    }, [selectedElement, overlaySuppressed]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        if (!aiEnabled) {
            return;
        }
        const cached = window.localStorage.getItem(aiKeyStorageKey);
        setAiApiKey(cached ?? '');
    }, [aiEnabled, aiKeyStorageKey]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        if (!aiEnabled) {
            return;
        }
        if (aiApiKey.trim()) {
            window.localStorage.setItem(aiKeyStorageKey, aiApiKey);
        } else {
            window.localStorage.removeItem(aiKeyStorageKey);
        }
    }, [aiApiKey, aiEnabled, aiKeyStorageKey]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        if (!aiEnabled) {
            return;
        }
        const cached = window.localStorage.getItem(aiModelStorageKey);
        if (cached) {
            setAiModel(cached);
            return;
        }
        setAiModel(DEFAULT_MODEL_BY_PROVIDER[aiProvider] ?? '');
    }, [aiEnabled, aiModelStorageKey, aiProvider]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        if (!aiEnabled) {
            return;
        }
        if (aiModel.trim()) {
            window.localStorage.setItem(aiModelStorageKey, aiModel);
        } else {
            window.localStorage.removeItem(aiModelStorageKey);
        }
    }, [aiEnabled, aiModel, aiModelStorageKey]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        if (!aiEnabled) {
            return;
        }
        setMusicHfToken(window.localStorage.getItem(MUSIC_SPECIALISTS_HF_TOKEN_STORAGE_KEY) ?? '');
        setMusicNotaGenModelId(
            window.localStorage.getItem(MUSIC_SPECIALISTS_NOTAGEN_MODEL_STORAGE_KEY)
            ?? MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_MODEL,
        );
        setMusicNotaGenRevision(
            window.localStorage.getItem(MUSIC_SPECIALISTS_NOTAGEN_REVISION_STORAGE_KEY)
            ?? MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_REVISION,
        );
        setMusicChatMusicianModelId(
            window.localStorage.getItem(MUSIC_SPECIALISTS_CHATMUSICIAN_MODEL_STORAGE_KEY)
            ?? MUSIC_SPECIALISTS_DEFAULT_CHATMUSICIAN_MODEL,
        );
        setMusicChatMusicianRevision(
            window.localStorage.getItem(MUSIC_SPECIALISTS_CHATMUSICIAN_REVISION_STORAGE_KEY)
            ?? MUSIC_SPECIALISTS_DEFAULT_CHATMUSICIAN_REVISION,
        );
    }, [aiEnabled]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        if (!aiEnabled) {
            return;
        }
        const persistValue = (key: string, value: string) => {
            if (value.trim()) {
                window.localStorage.setItem(key, value);
            } else {
                window.localStorage.removeItem(key);
            }
        };
        persistValue(MUSIC_SPECIALISTS_HF_TOKEN_STORAGE_KEY, musicHfToken);
        persistValue(MUSIC_SPECIALISTS_NOTAGEN_MODEL_STORAGE_KEY, musicNotaGenModelId);
        persistValue(MUSIC_SPECIALISTS_NOTAGEN_REVISION_STORAGE_KEY, musicNotaGenRevision);
        persistValue(MUSIC_SPECIALISTS_CHATMUSICIAN_MODEL_STORAGE_KEY, musicChatMusicianModelId);
        persistValue(MUSIC_SPECIALISTS_CHATMUSICIAN_REVISION_STORAGE_KEY, musicChatMusicianRevision);
    }, [
        aiEnabled,
        musicHfToken,
        musicNotaGenModelId,
        musicNotaGenRevision,
        musicChatMusicianModelId,
        musicChatMusicianRevision,
    ]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        const cached = window.localStorage.getItem(CODE_EDITOR_THEME_STORAGE_KEY);
        if (!cached) {
            return;
        }
        if (CODE_EDITOR_THEME_VALUES.has(cached as CodeEditorThemeMode)) {
            setCodeEditorTheme(cached as CodeEditorThemeMode);
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        window.localStorage.setItem(CODE_EDITOR_THEME_STORAGE_KEY, codeEditorTheme);
    }, [codeEditorTheme]);

    useEffect(() => {
        if (aiEnabled) {
            return;
        }
        if (xmlSidebarTab === 'assistant') {
            setXmlSidebarTab('xml');
        }
    }, [aiEnabled, xmlSidebarTab]);

    useEffect(() => {
        if (!toolbarRef.current) {
            return;
        }
        const updateHeight = () => {
            const nextHeight = toolbarRef.current?.getBoundingClientRect().height ?? 0;
            setToolbarHeight(Math.round(nextHeight));
        };
        updateHeight();
        if (typeof ResizeObserver === 'undefined') {
            return;
        }
        const observer = new ResizeObserver(() => updateHeight());
        observer.observe(toolbarRef.current);
        return () => observer.disconnect();
    }, []);

    // Load external XML files in embed mode
    useEffect(() => {
        if (!compareLeftUrl || !compareRightUrl) return;

        const loadExternalCompare = async () => {
            setCheckpointBusy(true);
            try {
                // Load both files in parallel
                const [leftResponse, rightResponse] = await Promise.all([
                    fetch(compareLeftUrl),
                    fetch(compareRightUrl),
                ]);

                if (!leftResponse.ok || !rightResponse.ok) {
                    throw new Error('Failed to fetch files');
                }

                const leftXml = await leftResponse.text();
                const rightXml = await rightResponse.text();

                // Load right file as main score
                const rightBlob = new Blob([rightXml], { type: 'application/xml' });
                const rightFile = new File([rightBlob], 'right.xml');
                await handleFileUpload(rightFile, { preserveScoreId: false, updateUrl: false });

                // Set up compare view
                setCompareView({
                    title: leftLabel,
                    currentXml: rightXml,
                    checkpointXml: leftXml,
                });

            } catch (err) {
                console.error('Failed to load comparison:', err);
                const message = err instanceof Error ? err.message : 'Unknown error';
                alert(`Failed to load files:\n${message}`);
            } finally {
                setCheckpointBusy(false);
            }
        };

        loadExternalCompare();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [compareLeftUrl, compareRightUrl, leftLabel]);

    // Load score from sessionStorage if opened from "Open in Editor" button
    useEffect(() => {
        const openInEditorData = sessionStorage.getItem('openInEditor');
        if (!openInEditorData) return;

        const loadScoreFromSession = async () => {
            try {
                const { xml, filename } = JSON.parse(openInEditorData);

                // Clear the sessionStorage
                sessionStorage.removeItem('openInEditor');

                // Create a File object and load it
                const blob = new Blob([xml], { type: 'application/xml' });
                const file = new File([blob], filename);
                await handleFileUpload(file, { preserveScoreId: false, updateUrl: false });
            } catch (err) {
                console.error('Failed to load score from session:', err);
            }
        };

        loadScoreFromSession();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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

    const comparePartCount = Math.max(scoreParts.length, compareRightParts.length, 1);
    const compareCheckpointTitle = compareView?.title || 'Checkpoint';
    const compareLeftScore = useMemo(() => compareSwapped ? compareRightScore : score, [compareSwapped, compareRightScore, score]);
    const compareRightScoreDisplay = useMemo(() => compareSwapped ? score : compareRightScore, [compareSwapped, score, compareRightScore]);
    const compareLeftParts = useMemo(() => compareSwapped ? compareRightParts : scoreParts, [compareSwapped, compareRightParts, scoreParts]);
    const compareRightPartsDisplay = useMemo(() => compareSwapped ? scoreParts : compareRightParts, [compareSwapped, scoreParts, compareRightParts]);
    const compareLeftLabel = isEmbedMode
        ? (compareSwapped ? rightLabel : leftLabel)
        : (compareSwapped ? compareCheckpointTitle : 'Current');
    const compareRightLabel = isEmbedMode
        ? (compareSwapped ? leftLabel : rightLabel)
        : (compareSwapped ? 'Current' : compareCheckpointTitle);
    const compareLeftXml = compareView
        ? (compareSwapped ? compareView.checkpointXml : compareView.currentXml)
        : '';
    const compareRightXml = compareView
        ? (compareSwapped ? compareView.currentXml : compareView.checkpointXml)
        : '';
    const compareLeftIsCurrent = compareLeftScore === score;
    const compareRightIsCurrent = compareRightScoreDisplay === score;
    const compareSupportsReflow = Boolean(
        score?.measureLineBreaks
        && score?.setMeasureLineBreaks
        && compareRightScore?.measureLineBreaks
        && compareRightScore?.setMeasureLineBreaks
        && score?.setLayoutMode
        && compareRightScore?.setLayoutMode,
    );
    const compareAlignmentByPart = useMemo(() => {
        const map = new Map<number, PartAlignment>();
        for (const alignment of compareAlignments) {
            map.set(alignment.partIndex, alignment);
        }
        return map;
    }, [compareAlignments]);
    const compareDefaultZoom = 0.5;
    const compareEffectiveZoom = compareZoom ?? compareDefaultZoom;
    const compareGutterRowHeight = 56;
    const compareGutterRowStyle = { minHeight: `${compareGutterRowHeight}px` };
    const compareZoomStyle = {
        width: compareLeftSvgSize ? `${compareLeftSvgSize.width * compareEffectiveZoom}px` : 'auto',
        height: compareLeftSvgSize ? `${compareLeftSvgSize.height * compareEffectiveZoom}px` : 'auto',
    };
    const compareRightZoomStyle = {
        width: compareRightSvgSize ? `${compareRightSvgSize.width * compareEffectiveZoom}px` : 'auto',
        height: compareRightSvgSize ? `${compareRightSvgSize.height * compareEffectiveZoom}px` : 'auto',
    };
    const compareHeaderSpacerHeight = useMemo(() => {
        const getHeaderOffset = (positions: Positions | null) => {
            if (!positions || !positions.elements.length) {
                return 0;
            }
            const pageHeight = positions.pageSize?.height ?? 0;
            let minY = Number.POSITIVE_INFINITY;
            positions.elements.forEach((element) => {
                if (typeof element.y !== 'number') {
                    return;
                }
                const rawHeight = typeof element.sy === 'number'
                    ? element.sy
                    : typeof (element as { height?: number }).height === 'number'
                        ? (element as { height?: number }).height
                        : 0;
                const needsPageOffset = pageHeight > 0
                    && element.page > 0
                    && (element.y + rawHeight) <= (pageHeight * 1.2);
                const pageOffset = needsPageOffset ? element.page * pageHeight : 0;
                const y = element.y + pageOffset;
                if (y < minY) {
                    minY = y;
                }
            });
            return Number.isFinite(minY) ? minY : 0;
        };
        const leftOffset = getHeaderOffset(compareLeftMeasurePositions);
        const rightOffset = getHeaderOffset(compareRightMeasurePositions);
        return Math.max(leftOffset, rightOffset, 0) * compareEffectiveZoom;
    }, [compareLeftMeasurePositions, compareRightMeasurePositions, compareEffectiveZoom]);
    const buildMeasureBounds = useCallback((positions: Positions | null, zoomValue: number) => {
        if (!positions || !positions.elements.length) {
            return [];
        }
        const pageHeight = positions.pageSize?.height ?? 0;
        return positions.elements.map((element) => {
            const rawHeight = typeof element.sy === 'number'
                ? element.sy
                : typeof (element as { height?: number }).height === 'number'
                    ? (element as { height?: number }).height
                    : 0;
            const needsPageOffset = pageHeight > 0
                && element.page > 0
                && (element.y + rawHeight) <= (pageHeight * 1.2);
            const pageOffset = needsPageOffset ? element.page * pageHeight : 0;
            return {
                top: (element.y + pageOffset) * zoomValue,
                height: rawHeight * zoomValue,
            };
        });
    }, []);
    const compareLeftBounds = useMemo(
        () => buildMeasureBounds(compareLeftMeasurePositions, compareEffectiveZoom),
        [buildMeasureBounds, compareLeftMeasurePositions, compareEffectiveZoom],
    );
    const compareRightBounds = useMemo(
        () => buildMeasureBounds(compareRightMeasurePositions, compareEffectiveZoom),
        [buildMeasureBounds, compareRightMeasurePositions, compareEffectiveZoom],
    );
    const compareGutterTrackHeight = useMemo(() => {
        const leftHeight = compareLeftSvgSize ? compareLeftSvgSize.height * compareEffectiveZoom : 0;
        const rightHeight = compareRightSvgSize ? compareRightSvgSize.height * compareEffectiveZoom : 0;
        const alignmentRows = Math.max(
            0,
            ...compareAlignments.map((alignment) => alignment.rows.length),
        );
        const fallbackHeight = compareHeaderSpacerHeight + alignmentRows * compareGutterRowHeight;
        return Math.max(leftHeight, rightHeight, fallbackHeight);
    }, [
        compareLeftSvgSize,
        compareRightSvgSize,
        compareEffectiveZoom,
        compareAlignments,
        compareHeaderSpacerHeight,
        compareGutterRowHeight,
    ]);
    const compareMeasureStatuses = useMemo(() => {
        const leftCount = compareLeftMeasurePositions?.elements.length
            ?? Math.max(0, ...compareAlignments.map((alignment) => alignment.leftCount));
        const rightCount = compareRightMeasurePositions?.elements.length
            ?? Math.max(0, ...compareAlignments.map((alignment) => alignment.rightCount));
        const leftMismatch = Array.from({ length: leftCount }, () => false);
        const rightMismatch = Array.from({ length: rightCount }, () => false);

        compareAlignments.forEach((alignment) => {
            alignment.rows.forEach((row) => {
                if (!row.match) {
                    if (row.leftIndex !== null && row.leftIndex >= 0 && row.leftIndex < leftMismatch.length) {
                        leftMismatch[row.leftIndex] = true;
                    }
                    if (row.rightIndex !== null && row.rightIndex >= 0 && row.rightIndex < rightMismatch.length) {
                        rightMismatch[row.rightIndex] = true;
                    }
                }
            });
        });

        return {
            left: leftMismatch.map((value) => (value ? 'old-diff' : null)),
            right: rightMismatch.map((value) => (value ? 'new-diff' : null)),
        };
    }, [compareAlignments, compareLeftMeasurePositions, compareRightMeasurePositions]);
    const buildMeasureHighlights = useCallback((
        positions: Positions | null,
        statuses: Array<'old-diff' | 'new-diff' | null>,
        zoomValue: number,
    ) => {
        if (!positions || !positions.elements.length) {
            return [];
        }
        const pageHeight = positions.pageSize?.height ?? 0;
        return positions.elements.flatMap((element, index) => {
            const measureIndex = index;
            const status = statuses[measureIndex];
            if (!status) {
                return [];
            }
            const rawWidth = typeof element.sx === 'number'
                ? element.sx
                : typeof (element as { width?: number }).width === 'number'
                    ? (element as { width?: number }).width
                    : 0;
            const rawHeight = typeof element.sy === 'number'
                ? element.sy
                : typeof (element as { height?: number }).height === 'number'
                    ? (element as { height?: number }).height
                    : 0;
            const needsPageOffset = pageHeight > 0
                && element.page > 0
                && (element.y + rawHeight) <= (pageHeight * 1.2);
            const pageOffset = needsPageOffset ? element.page * pageHeight : 0;
            return [{
                id: element.id ?? index,
                status,
                left: (element.x) * zoomValue,
                top: (element.y + pageOffset) * zoomValue,
                width: rawWidth * zoomValue,
                height: rawHeight * zoomValue,
            }];
        });
    }, []);
    const compareLeftHighlights = useMemo(
        () => buildMeasureHighlights(compareLeftMeasurePositions, compareMeasureStatuses.left, compareEffectiveZoom),
        [buildMeasureHighlights, compareLeftMeasurePositions, compareMeasureStatuses.left, compareEffectiveZoom],
    );
    const compareRightHighlights = useMemo(
        () => buildMeasureHighlights(compareRightMeasurePositions, compareMeasureStatuses.right, compareEffectiveZoom),
        [buildMeasureHighlights, compareRightMeasurePositions, compareMeasureStatuses.right, compareEffectiveZoom],
    );
    const compareOverlayStyle = toolbarHeight > 0 ? { top: `${toolbarHeight}px` } : undefined;
    const compareModalMaxHeight = toolbarHeight > 0
        ? `calc(100dvh - ${toolbarHeight + 48}px)`
        : 'calc(100dvh - 3rem)';
    const compareModalMaxWidth = 'calc(100dvw - 3rem)';

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

    const normalizeXmlData = useCallback(async (data: unknown): Promise<Uint8Array | null> => {
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
    }, []);

    const decodeXmlData = useCallback(async (data: unknown): Promise<string | null> => {
        const normalized = await normalizeXmlData(data);
        if (!normalized) {
            return null;
        }
        return new TextDecoder().decode(normalized);
    }, [normalizeXmlData]);

    const getScoreMusicXmlText = useCallback(async (targetScore: Score | null, fallbackXml: string | null) => {
        if (!targetScore?.saveXml) {
            return fallbackXml;
        }
        try {
            const data = await runSerializedScoreOperation(
                () => targetScore.saveXml!(),
                'saveXml',
            );
            const decoded = await decodeXmlData(data);
            return decoded ?? fallbackXml;
        } catch (err) {
            console.warn('Failed to export MusicXML from score:', err);
            return fallbackXml;
        }
    }, [decodeXmlData]);

    const getScoreXmlData = useCallback(async () => {
        const activeScore = scoreRef.current ?? score;
        if (!activeScore?.saveXml) {
            alert('This build of webmscore does not expose "saveXml".');
            return null;
        }
        const data = await runSerializedScoreOperation(
            () => activeScore.saveXml!(),
            'saveXml',
        );
        return await normalizeXmlData(data);
    }, [score, normalizeXmlData]);

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

    const getScoreMscxText = useCallback(async (targetScore: Score) => {
        if (!targetScore?.saveMsc) {
            return null;
        }
        const data = await targetScore.saveMsc('mscx');
        return await decodeXmlData(data);
    }, [decodeXmlData]);

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

    const loadCheckpointList = useCallback(async (targetScoreId?: string) => {
        if (!isIndexedDbAvailable()) {
            setCheckpointError('IndexedDB is not available in this browser.');
            return;
        }
        const activeScoreId = targetScoreId ?? scoreId;
        if (!activeScoreId) {
            setCheckpoints([]);
            return;
        }
        setCheckpointLoading(true);
        try {
            const items = await listCheckpoints(activeScoreId);
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

    const createInitialLoadCheckpoint = useCallback(async (loadedScore: Score, preferredScoreId?: string) => {
        if (!isIndexedDbAvailable() || !loadedScore?.saveXml) {
            return;
        }

        try {
            const xmlRaw = await runSerializedScoreOperation(
                () => loadedScore.saveXml!(),
                'saveXml(initial-checkpoint)',
            );
            const xmlData = await normalizeXmlData(xmlRaw);
            if (!xmlData || xmlData.byteLength === 0) {
                return;
            }

            const activeScoreId = preferredScoreId || ensureScoreId('score');
            await saveCheckpoint({
                title: 'Init on Load Score',
                createdAt: Date.now(),
                format: 'musicxml',
                data: xmlData.buffer.slice(xmlData.byteOffset, xmlData.byteOffset + xmlData.byteLength),
                size: xmlData.byteLength,
                scoreId: activeScoreId,
            });

            await loadCheckpointList(activeScoreId);
            setScoreDirtySinceCheckpoint(false);
        } catch (err) {
            console.warn('Failed to create initial load checkpoint', err);
        }
    }, [ensureScoreId, loadCheckpointList, normalizeXmlData]);

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
            largeSessionXmlAutoloadDeferredLoggedRef.current = false;
            return;
        }
        if (xmlDirty) {
            return;
        }
        if (largeScoreSessionRef.current && xmlSidebarMode === 'closed') {
            if (!largeSessionXmlAutoloadDeferredLoggedRef.current) {
                console.info('[large-load] xml-autoload:deferred');
                largeSessionXmlAutoloadDeferredLoggedRef.current = true;
            }
            return;
        }
        largeSessionXmlAutoloadDeferredLoggedRef.current = false;
        void loadXmlFromScore();
    }, [score, xmlDirty, xmlSidebarMode, loadXmlFromScore]);

    useEffect(() => {
        if (xmlSidebarTab === 'assistant' && aiIncludeXml && !xmlText.trim()) {
            void loadXmlFromScore();
        }
    }, [xmlSidebarTab, aiIncludeXml, xmlText, loadXmlFromScore]);

    const aiProviderCapabilities = AI_PROVIDER_CAPABILITIES[aiProvider];

    useEffect(() => {
        if (!aiProviderCapabilities.supportsPdfContext && aiIncludePdf) {
            setAiIncludePdf(false);
        }
        if (!aiProviderCapabilities.supportsRenderedImageContext && aiIncludeRenderedImage) {
            setAiIncludeRenderedImage(false);
        }
    }, [
        aiIncludePdf,
        aiIncludeRenderedImage,
        aiProviderCapabilities.supportsPdfContext,
        aiProviderCapabilities.supportsRenderedImageContext,
    ]);

    useEffect(() => {
        if (!aiEnabled) {
            setAiModels([]);
            setAiModelsError(null);
            setAiModelsLoading(false);
            return;
        }
        const trimmedKey = aiApiKey.trim();
        if (!trimmedKey) {
            setAiModels([]);
            setAiModelsError(null);
            setAiModelsLoading(false);
            return;
        }
        let canceled = false;
        setAiModelsLoading(true);
        setAiModelsError(null);
        const loadModels = async () => {
            try {
                let models: string[] = [];
                let proxyResponse: Response | null = null;
                if (useLlmProxy) {
                    const nextProxyResponse = await fetch(proxyUrlFor(`/api/llm/${aiProvider}/models`), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ apiKey: trimmedKey }),
                    });
                    if (nextProxyResponse.ok) {
                        proxyResponse = nextProxyResponse;
                    } else if (aiProvider === 'anthropic' && isEmbedBuild && !llmProxyBase && isMissingProxyStatus(nextProxyResponse.status)) {
                        throw new Error(ANTHROPIC_EMBED_PROXY_ERROR);
                    } else if (!(isEmbedBuild && !llmProxyBase && isMissingProxyStatus(nextProxyResponse.status))) {
                        const errorText = await nextProxyResponse.text();
                        throw new Error(errorText || 'Failed to load models.');
                    }
                }

                if (proxyResponse) {
                    const data = await proxyResponse.json();
                    models = Array.isArray(data?.models)
                        ? data.models.filter((id: unknown): id is string => typeof id === 'string')
                        : [];
                } else {
                    models = await loadAiModelsDirect({
                        provider: aiProvider,
                        apiKey: trimmedKey,
                    });
                }

                if (canceled) {
                    return;
                }
                const filtered = aiProvider === 'openai'
                    ? models.filter((id: string) => /^gpt-|^o/.test(id))
                    : models;
                const sorted = [...new Set(filtered.length ? filtered : models)].sort();
                setAiModels(sorted);
                if (!aiModel || !sorted.includes(aiModel)) {
                    const preferred = sorted.find((id: string) => id === DEFAULT_MODEL_BY_PROVIDER[aiProvider])
                        || sorted[0]
                        || DEFAULT_MODEL_BY_PROVIDER[aiProvider]
                        || '';
                    setAiModel(preferred);
                }
            } catch (err) {
                if (!canceled) {
                    console.error(`Failed to load ${AI_PROVIDER_LABELS[aiProvider]} models`, err);
                    setAiModels([]);
                    const message = errorMessage(err);
                    setAiModelsError(message || 'Failed to load models. Check your API key or enter a model manually.');
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
    }, [aiApiKey, aiModel, aiEnabled, aiProvider, isEmbedBuild, llmProxyBase, useLlmProxy, proxyUrlFor]);

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

    const parseLayoutProgressState = (value: unknown): LayoutProgressState | null => {
        if (!value || typeof value !== 'object') {
            return null;
        }

        const state = value as Partial<LayoutProgressState>;
        if (
            typeof state.targetPage !== 'number'
            || typeof state.targetSatisfied !== 'boolean'
            || typeof state.availablePages !== 'number'
            || typeof state.totalMeasures !== 'number'
            || typeof state.laidOutMeasures !== 'number'
            || typeof state.loadedUntilTick !== 'number'
            || typeof state.hasMorePages !== 'boolean'
            || typeof state.isComplete !== 'boolean'
        ) {
            return null;
        }

        return state as LayoutProgressState;
    };

    const requestLayoutProgress = async (targetScore: Score, targetPage: number): Promise<LayoutProgressState> => {
        if (targetScore.layoutUntilPageState) {
            const raw = await runSerializedScoreOperation(
                () => Promise.resolve(targetScore.layoutUntilPageState!(targetPage)),
                `layoutUntilPageState(page=${targetPage + 1})`,
            );
            const parsed = parseLayoutProgressState(raw);
            if (parsed) {
                return parsed;
            }
        }

        const targetSatisfied = Boolean(await runSerializedScoreOperation(
            () => Promise.resolve(targetScore.layoutUntilPage?.(targetPage)),
            `layoutUntilPage(page=${targetPage + 1})`,
        ));
        const availablePages = targetScore.npages
            ? Math.max(
                1,
                await runSerializedScoreOperation(
                    () => Promise.resolve(targetScore.npages!()),
                    'npages',
                ),
            )
            : targetPage + (targetSatisfied ? 1 : 0);
        // Without structured state support, we do not have authoritative completion info.
        // Keep pagination optimistic to avoid disabling navigation prematurely.
        return {
            targetPage,
            targetSatisfied,
            availablePages,
            totalMeasures: -1,
            laidOutMeasures: -1,
            loadedUntilTick: -1,
            hasMorePages: true,
            isComplete: false,
        };
    };

    const shouldUseProgressiveLoad = (format: InputFileFormat, data: Uint8Array) => {
        if (!progressiveLoadEnabled) {
            return false;
        }
        if (!isLargeScoreData(data)) {
            return false;
        }
        // Progressive path is critical for large native/compressed formats, otherwise
        // eager full-layout can take minutes before first render.
        return format === 'musicxml' || format === 'mscz' || format === 'mscx' || format === 'mxl';
    };

    const progressiveLoadTimeoutMs = (format: InputFileFormat) => {
        if (format === 'musicxml') {
            return 12_000;
        }
        // Native/compressed formats can take substantially longer to parse in WASM.
        return 180_000;
    };

    const progressiveFirstPageTimeoutMs = (format: InputFileFormat) => {
        if (format === 'musicxml') {
            return 10_000;
        }
        return 90_000;
    };

    const runWithTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        try {
            return await Promise.race([
                promise,
                new Promise<T>((_, reject) => {
                    timeoutId = setTimeout(() => {
                        reject(new Error(`${label} timed out after ${timeoutMs}ms`));
                    }, timeoutMs);
                }),
            ]);
        } finally {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        }
    };

    const clearScheduledBackgroundInit = useCallback(() => {
        if (backgroundInitTimerRef.current) {
            clearTimeout(backgroundInitTimerRef.current);
            backgroundInitTimerRef.current = null;
        }
    }, []);

    const runSerializedScoreOperation = useCallback(async <T,>(operation: () => Promise<T>, label: string): Promise<T> => {
        const waitForPriorOperation = scoreOperationQueueRef.current;
        let releaseQueueSlot: (() => void) | null = null;
        scoreOperationQueueRef.current = new Promise<void>((resolve) => {
            releaseQueueSlot = resolve;
        });

        await waitForPriorOperation;

        let released = false;
        const release = () => {
            if (released) {
                return;
            }
            released = true;
            releaseQueueSlot?.();
        };

        const operationPromise = Promise.resolve().then(operation);
        const forceReleaseTimer = setTimeout(() => {
            console.warn(`[engine-queue] force release after ${ENGINE_OPERATION_STALL_RELEASE_MS}ms`, { label });
            release();
        }, ENGINE_OPERATION_STALL_RELEASE_MS);

        try {
            return await operationPromise;
        } finally {
            clearTimeout(forceReleaseTimer);
            release();
        }
    }, []);

    const resolveCurrentPageSvgContext = useCallback(async () => {
        const renderedSvg = containerRef.current?.querySelector('svg');
        if (renderedSvg instanceof SVGSVGElement) {
            return renderedSvg.outerHTML || '';
        }
        const activeScore = scoreRef.current ?? score;
        if (!activeScore?.saveSvg) {
            return '';
        }
        const pageIndex = Math.max(0, currentPageRef.current || 0);
        try {
            const svgData = await runSerializedScoreOperation(
                () => activeScore.saveSvg(pageIndex, true, true),
                `saveSvg(ai-context-page=${pageIndex + 1})`,
            );
            return typeof svgData === 'string' ? svgData : '';
        } catch (err) {
            console.warn('Failed to capture page SVG context for AI request:', err);
            return '';
        }
    }, [score, runSerializedScoreOperation]);

    const resolveSelectionContext = useCallback(async () => {
        const lines: string[] = [];
        const primaryPoint = selectedPointRef.current;
        if (primaryPoint) {
            lines.push(
                `Primary selection point: page=${primaryPoint.page + 1}, x=${primaryPoint.x.toFixed(2)}, y=${primaryPoint.y.toFixed(2)}`,
            );
        }
        const classList = selectedElementClasses.trim();
        if (classList) {
            lines.push(`Primary selection classes: ${classList}`);
        }

        const rawBoxes = selectionBoxes.length
            ? selectionBoxes
            : selectedElement
                ? [{
                    index: selectedIndex,
                    page: primaryPoint?.page ?? currentPageRef.current ?? 0,
                    x: selectedElement.x,
                    y: selectedElement.y,
                    w: selectedElement.w,
                    h: selectedElement.h,
                    classes: classList || 'unknown',
                }]
                : [];

        const boxes = rawBoxes
            .map((box: any, index: number) => {
                const x = typeof box?.x === 'number' ? box.x : NaN;
                const y = typeof box?.y === 'number' ? box.y : NaN;
                const w = typeof box?.w === 'number'
                    ? box.w
                    : (typeof box?.width === 'number' ? box.width : NaN);
                const h = typeof box?.h === 'number'
                    ? box.h
                    : (typeof box?.height === 'number' ? box.height : NaN);
                if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) {
                    return null;
                }
                return {
                    index: typeof box?.index === 'number' ? box.index : index,
                    page: typeof box?.page === 'number' ? box.page : (primaryPoint?.page ?? currentPageRef.current ?? 0),
                    x,
                    y,
                    w,
                    h,
                    classes: typeof box?.classes === 'string' && box.classes.trim()
                        ? box.classes
                        : 'n/a',
                };
            })
            .filter((box): box is {
                index: number;
                page: number;
                x: number;
                y: number;
                w: number;
                h: number;
                classes: string;
            } => Boolean(box));

        if (boxes.length) {
            const shown = boxes.slice(0, AI_SELECTION_BOX_CONTEXT_LIMIT);
            const selectionLines = shown.map((box, index) => (
                `#${index + 1}: page=${box.page + 1}, x=${box.x.toFixed(2)}, y=${box.y.toFixed(2)}, w=${box.w.toFixed(2)}, h=${box.h.toFixed(2)}, index=${box.index ?? 'n/a'}, classes=${box.classes || 'n/a'}`
            ));
            lines.push(`Selection boxes (${boxes.length} total):\n${selectionLines.join('\n')}`);
            if (boxes.length > shown.length) {
                lines.push(`Selection boxes truncated to first ${shown.length} entries.`);
            }
        } else {
            lines.push('No active selection boxes.');
        }

        const activeScore = scoreRef.current ?? score;
        if (activeScore?.selectionMimeData) {
            try {
                const mimeData = await runSerializedScoreOperation(
                    () => Promise.resolve(activeScore.selectionMimeData!()),
                    'selectionMimeData(ai-context)',
                );
                if (mimeData instanceof Uint8Array && mimeData.byteLength > 0) {
                    const decoded = new TextDecoder().decode(mimeData);
                    if (decoded.trim()) {
                        const truncated = truncateAiContext(decoded, AI_SELECTION_CONTEXT_MAX_CHARS);
                        lines.push(
                            `Selection MIME XML:\n${truncated.value}${truncated.truncated
                                ? `\n[Selection MIME XML truncated from ${truncated.originalLength} characters.]`
                                : ''}`,
                        );
                    }
                }
            } catch (err) {
                console.warn('Failed to capture selection MIME context for AI request:', err);
            }
        }

        return lines.join('\n\n').trim();
    }, [score, selectedElement, selectedElementClasses, selectedIndex, selectionBoxes, runSerializedScoreOperation]);

    const resolveCurrentPageImageAttachment = useCallback(async (): Promise<AiImageAttachment | null> => {
        const activeScore = scoreRef.current ?? score;
        if (!activeScore?.savePng) {
            return null;
        }
        const pageIndex = Math.max(0, currentPageRef.current || 0);
        try {
            const png = await runSerializedScoreOperation(
                () => Promise.resolve(activeScore.savePng!(pageIndex, true, true)),
                `savePng(ai-context-page=${pageIndex + 1})`,
            );
            const bytes = png instanceof Uint8Array
                ? png
                : png instanceof ArrayBuffer
                    ? new Uint8Array(png)
                    : null;
            if (!bytes || bytes.byteLength === 0) {
                return null;
            }
            return {
                mediaType: 'image/png',
                base64: encodeBase64(bytes),
            };
        } catch (err) {
            console.warn('Failed to capture page PNG context for AI request:', err);
            return null;
        }
    }, [score, runSerializedScoreOperation]);

    const resolveScorePdfAttachment = useCallback(async (): Promise<AiPdfAttachment | null> => {
        const activeScore = scoreRef.current ?? score;
        if (!activeScore?.savePdf) {
            return null;
        }
        try {
            const pdf = await runSerializedScoreOperation(
                () => Promise.resolve(activeScore.savePdf()),
                'savePdf(ai-context)',
            );
            const bytes = pdf instanceof Uint8Array
                ? pdf
                : pdf instanceof ArrayBuffer
                    ? new Uint8Array(pdf)
                    : null;
            if (!bytes || bytes.byteLength === 0) {
                return null;
            }
            if (bytes.byteLength > AI_PDF_ATTACHMENT_MAX_BYTES) {
                console.warn('PDF context exceeds upload limit for AI request; skipping.', {
                    bytes: bytes.byteLength,
                    limit: AI_PDF_ATTACHMENT_MAX_BYTES,
                });
                return null;
            }
            return {
                mediaType: 'application/pdf',
                base64: encodeBase64(bytes),
                filename: 'score-context.pdf',
            };
        } catch (err) {
            console.warn('Failed to capture score PDF context for AI request:', err);
            return null;
        }
    }, [score, runSerializedScoreOperation]);

    const loadScoreWithInitialLayout = async (
        WebMscore: Awaited<ReturnType<typeof loadWebMscore>>,
        format: InputFileFormat,
        data: Uint8Array,
    ): Promise<{ loadedScore: Score; progressivePaging: boolean; progressiveHasMore: boolean; initialAvailablePages: number }> => {
        const loadStart = performance.now();
        const largeScore = isLargeScoreData(data);
        const logLargeLoad = (stage: string, extra?: unknown) => {
            if (!largeScore) {
                return;
            }
            const elapsedMs = Math.round(performance.now() - loadStart);
            if (typeof extra === 'undefined') {
                console.info(`[large-load] ${format} ${stage} @ ${elapsedMs}ms`);
                return;
            }
            console.info(`[large-load] ${format} ${stage} @ ${elapsedMs}ms`, extra);
        };

        if (!shouldUseProgressiveLoad(format, data)) {
            logLargeLoad('eager-load:start');
            const loadedScore = await WebMscore.load(format, data);
            logLargeLoad('eager-load:done');
            return { loadedScore, progressivePaging: false, progressiveHasMore: false, initialAvailablePages: 1 };
        }

        try {
            logLargeLoad('progressive-load:start', { timeoutMs: progressiveLoadTimeoutMs(format) });
            const loadedScore = await runWithTimeout(
                WebMscore.load(format, data, [], false),
                progressiveLoadTimeoutMs(format),
                `Progressive load for ${format}`,
            );
            logLargeLoad('progressive-load:done');
            if (loadedScore.layoutUntilPage || loadedScore.layoutUntilPageState) {
                logLargeLoad('initial-layout:start', { timeoutMs: progressiveFirstPageTimeoutMs(format) });
                const firstPageState = await runWithTimeout(
                    requestLayoutProgress(loadedScore, 0),
                    progressiveFirstPageTimeoutMs(format),
                    'Initial incremental layout',
                );
                logLargeLoad('initial-layout:done', firstPageState);
                if (firstPageState.targetSatisfied) {
                    return {
                        loadedScore,
                        progressivePaging: true,
                        progressiveHasMore: firstPageState.hasMorePages,
                        initialAvailablePages: Math.max(1, firstPageState.availablePages || 1),
                    };
                }
            }

            if (loadedScore.relayout) {
                logLargeLoad('relayout-fallback:start');
                await runWithTimeout(
                    runSerializedScoreOperation(
                        () => Promise.resolve(loadedScore.relayout!()),
                        'relayout(progressive-fallback)',
                    ),
                    20_000,
                    'Progressive relayout fallback',
                );
                logLargeLoad('relayout-fallback:done');
                return { loadedScore, progressivePaging: false, progressiveHasMore: false, initialAvailablePages: 1 };
            }

            loadedScore.destroy();
        } catch (err) {
            console.warn('Progressive score load failed, retrying with eager layout.', err);
            logLargeLoad('progressive-load:failed', err);
        }

        logLargeLoad('eager-fallback:start');
        const fallbackScore = await WebMscore.load(format, data);
        logLargeLoad('eager-fallback:done');
        return { loadedScore: fallbackScore, progressivePaging: false, progressiveHasMore: false, initialAvailablePages: 1 };
    };

    const scheduleBackgroundInitTasks = (
        loadedScore: Score,
        options: {
            format: InputFileFormat;
            inputByteLength: number;
            isLargeInput: boolean;
            progressivePaging: boolean;
            createInitialCheckpoint?: boolean;
            checkpointScoreId?: string;
            logStage?: (stage: string, extra?: unknown) => void;
        },
    ) => {
        const {
            format,
            inputByteLength,
            isLargeInput,
            progressivePaging,
            createInitialCheckpoint,
            checkpointScoreId,
            logStage,
        } = options;

        const log = (stage: string, extra?: unknown) => {
            if (!logStage) {
                return;
            }
            logStage(stage, extra);
        };

        clearScheduledBackgroundInit();

        const runTasks = async (attempt: number) => {
            if (scoreRef.current !== loadedScore) {
                backgroundInitTimerRef.current = null;
                return;
            }
            if (
                isLargeInput
                && (pageNavigationInFlightRef.current || progressivePageLoadInFlightRef.current)
            ) {
                if (attempt >= LARGE_SCORE_BACKGROUND_TASK_MAX_RETRIES) {
                    log('background-tasks:skipped', { reason: 'busy-navigation', attempts: attempt });
                    backgroundInitTimerRef.current = null;
                    return;
                }
                backgroundInitTimerRef.current = setTimeout(() => {
                    void runTasks(attempt + 1);
                }, LARGE_SCORE_BACKGROUND_TASK_RETRY_DELAY_MS);
                return;
            }

            backgroundInitTimerRef.current = null;
            log('background-tasks:start', { attempt });

            log('refresh-metadata:start');
            try {
                await runWithTimeout(
                    refreshScoreMetadata(loadedScore),
                    20_000,
                    'Score metadata refresh',
                );
                log('refresh-metadata:done');
            } catch (err) {
                log('refresh-metadata:failed', err);
                console.warn('Background score metadata refresh timed out or failed.', err);
            }

            log('refresh-instruments:start');
            try {
                await runWithTimeout(
                    refreshInstrumentTemplates(loadedScore),
                    20_000,
                    'Instrument template refresh',
                );
                log('refresh-instruments:done');
            } catch (err) {
                log('refresh-instruments:failed', err);
                console.warn('Background instrument template refresh timed out or failed.', err);
            }

            if (loadedScore.saveAudio) {
                log('soundfont:start');
                try {
                    await runWithTimeout(
                        ensureSoundFontLoaded(loadedScore),
                        25_000,
                        'SoundFont load',
                    );
                    log('soundfont:done');
                } catch (err) {
                    log('soundfont:failed', err);
                    console.warn('Background SoundFont load timed out or failed.', err);
                }
            }

            if (createInitialCheckpoint) {
                log('checkpoint:start');
                try {
                    await runWithTimeout(
                        createInitialLoadCheckpoint(loadedScore, checkpointScoreId),
                        20_000,
                        'Initial checkpoint creation',
                    );
                    log('checkpoint:done');
                } catch (err) {
                    log('checkpoint:failed', err);
                    console.warn('Background initial checkpoint creation timed out or failed.', err);
                }
            }
        };

        if (isLargeInput) {
            log('background-tasks:deferred', {
                reason: 'large-upload',
                bytes: inputByteLength,
                format,
                progressivePaging,
                delayMs: LARGE_SCORE_BACKGROUND_TASK_DELAY_MS,
            });
            backgroundInitTimerRef.current = setTimeout(() => {
                void runTasks(0);
            }, LARGE_SCORE_BACKGROUND_TASK_DELAY_MS);
            return;
        }

        void runTasks(0);
    };

    const handleUrlLoad = async (url: string, signal?: AbortSignal) => {
        if (signal?.aborted) {
            return;
        }
        clearScheduledBackgroundInit();
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
        soundFontLoadedRef.current = false;
        triedSoundFontRef.current = false;
        soundFontLoadPromiseRef.current = null;
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
        setProgressivePagingActive(false);
        setProgressiveHasMorePages(false);
        largeScoreSessionRef.current = false;
        largeSessionXmlAutoloadDeferredLoggedRef.current = false;
        autoFitPendingRef.current = true;
        try {
            const response = await fetch(url, signal ? { signal } : undefined);
            if (!response.ok) throw new Error('Failed to fetch score');
            const buffer = await response.arrayBuffer();
            const data = new Uint8Array(buffer);
            const inputByteLength = data.byteLength;
            const inputIsLarge = isLargeScoreData(data);
            largeScoreSessionRef.current = inputIsLarge;
            const format = detectInputFormat(url);
            const { webMscore: WebMscore, mode: engineMode } = await resolveWebMscoreEngine();
            if (inputIsLarge) {
                console.info(`[large-load] ${format} engine:${engineMode}`);
            }

            if (score) {
                score.destroy();
            }

            const { loadedScore, progressivePaging, progressiveHasMore, initialAvailablePages } = await loadScoreWithInitialLayout(WebMscore, format, data);
            if (signal?.aborted) {
                loadedScore.destroy();
                return;
            }
            setScore(loadedScore);
            scoreRef.current = loadedScore;
            setProgressivePagingActive(progressivePaging);
            setProgressiveHasMorePages(progressivePaging && progressiveHasMore);
            exposeScoreToWindow(loadedScore);
            const mutationsAvailable = hasMutationApi(loadedScore);
            if (!mutationsAvailable) {
                console.warn('Mutation APIs not detected on loaded score; enabling toolbar anyway.');
            }
            setMutationEnabled(true);
            const skipCoverPage = shouldSkipCoverPageFirstRender(format, data);
            let initialPage = 0;
            if (progressivePaging) {
                const progressivePages = Math.max(1, initialAvailablePages || 1);
                const preferredInitialPage = skipCoverPage && progressivePages > 1 ? 1 : 0;
                initialPage = Math.max(0, Math.min(preferredInitialPage, progressivePages - 1));
                setPageCount(progressivePages);
                setCurrentPage(initialPage);
            } else {
                const preferredInitialPage = skipCoverPage ? 1 : 0;
                initialPage = await refreshPageCount(loadedScore, preferredInitialPage);
            }
            let rendered = await renderScore(loadedScore, initialPage, false);
            if (!rendered && progressivePaging && initialAvailablePages > 1) {
                const fallbackPage = initialPage === 0 ? 1 : 0;
                if (fallbackPage >= 0 && fallbackPage < initialAvailablePages) {
                    const fallbackRendered = await renderScore(loadedScore, fallbackPage, false);
                    if (fallbackRendered) {
                        initialPage = fallbackPage;
                        setCurrentPage(fallbackPage);
                        rendered = true;
                    }
                }
            }
            if (!rendered) {
                console.warn('Initial render did not produce SVG content.');
            }
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
            if (!signal?.aborted) {
                setLoading(false);
            }
            scheduleBackgroundInitTasks(loadedScore, {
                format,
                inputByteLength,
                isLargeInput: inputIsLarge,
                progressivePaging,
                logStage: inputIsLarge
                    ? (stage: string, extra?: unknown) => {
                        if (typeof extra === 'undefined') {
                            console.info(`[large-load] ${format} ${stage}`);
                            return;
                        }
                        console.info(`[large-load] ${format} ${stage}`, extra);
                    }
                    : undefined,
            });

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
        options?: {
            preserveScoreId?: boolean;
            scoreIdOverride?: string;
            updateUrl?: boolean;
            createInitialCheckpoint?: boolean;
        },
    ) => {
        clearScheduledBackgroundInit();
        setLoading(true);
        const uploadStart = performance.now();
        const isLargeUpload = file.size >= LARGE_SCORE_THRESHOLD_BYTES;
        const logUploadStage = (stage: string, extra?: unknown) => {
            if (!isLargeUpload) {
                return;
            }
            const elapsedMs = Math.round(performance.now() - uploadStart);
            if (typeof extra === 'undefined') {
                console.info(`[large-upload] ${file.name} ${stage} @ ${elapsedMs}ms`);
                return;
            }
            console.info(`[large-upload] ${file.name} ${stage} @ ${elapsedMs}ms`, extra);
        };
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
        soundFontLoadedRef.current = false;
        triedSoundFontRef.current = false;
        soundFontLoadPromiseRef.current = null;
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
        setProgressivePagingActive(false);
        setProgressiveHasMorePages(false);
        largeScoreSessionRef.current = false;
        largeSessionXmlAutoloadDeferredLoggedRef.current = false;
        autoFitPendingRef.current = true;
        try {
            logUploadStage('read-buffer:start');
            const buffer = await file.arrayBuffer();
            const data = new Uint8Array(buffer);
            const inputByteLength = data.byteLength;
            largeScoreSessionRef.current = isLargeUpload;
            logUploadStage('read-buffer:done', { bytes: inputByteLength });
            const format = detectInputFormat(file.name);
            const { webMscore: WebMscore, mode: engineMode } = await resolveWebMscoreEngine();
            logUploadStage('webmscore-ready', { engineMode });

            // But wait, we need to destroy previous score if exists
            if (score) {
                score.destroy();
            }

            const { loadedScore, progressivePaging, progressiveHasMore, initialAvailablePages } = await loadScoreWithInitialLayout(WebMscore, format, data);
            logUploadStage('load-score:done', { progressivePaging, progressiveHasMore, initialAvailablePages });
            setScore(loadedScore);
            scoreRef.current = loadedScore;
            setProgressivePagingActive(progressivePaging);
            setProgressiveHasMorePages(progressivePaging && progressiveHasMore);
            exposeScoreToWindow(loadedScore);
            const mutationsAvailable = hasMutationApi(loadedScore);
            if (!mutationsAvailable) {
                console.warn('Mutation APIs not detected on loaded score; enabling toolbar anyway.');
            }
            setMutationEnabled(true);
            const skipCoverPage = shouldSkipCoverPageFirstRender(format, data);
            let initialPage = 0;
            if (progressivePaging) {
                const progressivePages = Math.max(1, initialAvailablePages || 1);
                const preferredInitialPage = skipCoverPage && progressivePages > 1 ? 1 : 0;
                initialPage = Math.max(0, Math.min(preferredInitialPage, progressivePages - 1));
                setPageCount(progressivePages);
                setCurrentPage(initialPage);
                logUploadStage('refresh-page-count:done', { initialPage, progressivePages });
            } else {
                logUploadStage('refresh-page-count:start');
                const preferredInitialPage = skipCoverPage ? 1 : 0;
                initialPage = await refreshPageCount(loadedScore, preferredInitialPage);
                logUploadStage('refresh-page-count:done', { initialPage });
            }
            logUploadStage('render-score:start', { initialPage });
            let rendered = await renderScore(loadedScore, initialPage, false);
            if (!rendered && progressivePaging && initialAvailablePages > 1) {
                const fallbackPage = initialPage === 0 ? 1 : 0;
                if (fallbackPage >= 0 && fallbackPage < initialAvailablePages) {
                    logUploadStage('render-score:fallback-start', { fallbackPage });
                    const fallbackRendered = await renderScore(loadedScore, fallbackPage, false);
                    if (fallbackRendered) {
                        initialPage = fallbackPage;
                        setCurrentPage(fallbackPage);
                        rendered = true;
                        logUploadStage('render-score:fallback-done', { fallbackPage });
                    }
                }
            }
            logUploadStage('render-score:done', { rendered, initialPage });
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
            setLoading(false);
            scheduleBackgroundInitTasks(loadedScore, {
                format,
                inputByteLength,
                isLargeInput: isLargeUpload,
                progressivePaging,
                createInitialCheckpoint: options?.createInitialCheckpoint,
                checkpointScoreId: nextScoreId,
                logStage: logUploadStage,
            });

        } catch (err) {
            console.error('Error loading file:', err);
            alert('Failed to load score. See console for details.');
        } finally {
            setLoading(false);
        }
    };

    const handleLoadScoreUpload = (file: File) => handleFileUpload(file, { createInitialCheckpoint: true });

    const refreshPageCount = async (targetScore: Score, preferredPage: number = currentPageRef.current) => {
        if (!targetScore?.npages) {
            setPageCount(1);
            setCurrentPage(0);
            return 0;
        }

        try {
            const pages = Math.max(
                1,
                await runSerializedScoreOperation(
                    () => targetScore.npages!(),
                    'npages',
                ),
            );
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

    const ensurePageIsLaidOut = async (targetScore: Score, targetPage: number): Promise<boolean> => {
        if (!targetScore.layoutUntilPage && !targetScore.layoutUntilPageState) {
            return targetPage < pageCount;
        }
        if (progressivePageLoadInFlightRef.current) {
            return false;
        }

        progressivePageLoadInFlightRef.current = true;
        try {
            const isExpandingBeyondKnownPages = targetPage >= pageCount;
            if (isExpandingBeyondKnownPages && targetScore.layoutUntilPage) {
                // For expansion into unknown pages, call layoutUntilPage directly.
                // layoutUntilPageState can stall for very large scores when advancing.
                const expanded = Boolean(await runWithTimeout(
                    runSerializedScoreOperation(
                        () => Promise.resolve(targetScore.layoutUntilPage!(targetPage)),
                        `layoutUntilPage(page=${targetPage + 1})`,
                    ),
                    PROGRESSIVE_PAGE_LAYOUT_EXPAND_TIMEOUT_MS,
                    `Expand layout to page ${targetPage + 1}`,
                ));
                if (targetScore.npages) {
                    const pages = Math.max(
                        1,
                        await runSerializedScoreOperation(
                            () => Promise.resolve(targetScore.npages!()),
                            'npages',
                        ),
                    );
                    setPageCount((prev) => Math.max(prev, pages));
                    if (expanded && pages > targetPage) {
                        return true;
                    }
                } else if (expanded) {
                    setPageCount((prev) => Math.max(prev, targetPage + 1));
                    return true;
                }
            }

            const layoutState = await runWithTimeout(
                requestLayoutProgress(targetScore, targetPage),
                PROGRESSIVE_PAGE_LAYOUT_TIMEOUT_MS,
                `Layout state for page ${targetPage + 1}`,
            );
            const pages = Math.max(1, layoutState.availablePages || 1);
            setPageCount((prev) => Math.max(prev, pages));
            setProgressiveHasMorePages(layoutState.hasMorePages);

            let targetSatisfied = layoutState.targetSatisfied;
            if (targetSatisfied && targetScore.layoutUntilPage && targetPage > 0) {
                // Confirm the target page is fully materialized before rendering it.
                // layoutUntilPageState can report optimistic availability on very large scores.
                targetSatisfied = Boolean(await runWithTimeout(
                    runSerializedScoreOperation(
                        () => Promise.resolve(targetScore.layoutUntilPage!(targetPage)),
                        `layoutUntilPage(page=${targetPage + 1})`,
                    ),
                    PROGRESSIVE_PAGE_LAYOUT_CONFIRM_TIMEOUT_MS,
                    `Layout page ${targetPage + 1}`,
                ));
            }

            if (!targetSatisfied || pages <= targetPage) {
                return false;
            }

            return true;
        } catch (err) {
            console.warn('Failed incremental page layout:', err);
            if (targetPage < pageCount) {
                // If page count already claims this page exists, allow a best-effort render attempt.
                return true;
            }
            setProgressiveHasMorePages(false);
            return false;
        } finally {
            progressivePageLoadInFlightRef.current = false;
        }
    };

    const renderScore = async (currentScore: Score, pageIndex?: number, highlightSelection: boolean = true): Promise<boolean> => {
        if (!currentScore || !containerRef.current) return false;

        try {
            const targetPage = typeof pageIndex === 'number' ? pageIndex : currentPage;
            const timeoutMs = (largeScoreSessionRef.current && progressivePagingActive)
                ? LARGE_PROGRESSIVE_PAGE_RENDER_TIMEOUT_MS
                : DEFAULT_PAGE_RENDER_TIMEOUT_MS;
            const svgData = await runWithTimeout(
                runSerializedScoreOperation(
                    () => currentScore.saveSvg(targetPage, true, highlightSelection),
                    `saveSvg(page=${targetPage + 1})`,
                ),
                timeoutMs,
                `Render page ${targetPage + 1}`,
            );
            if (svgData) {
                containerRef.current.innerHTML = svgData;
                return true;
            }
            return false;
        } catch (err) {
            console.error('Error rendering score:', err);
            return false;
        }
    };

    const renderScoreToContainer = useCallback(async (
        currentScore: Score,
        container: HTMLDivElement | null,
        pageIndex?: number,
        highlightSelection: boolean = false,
    ): Promise<boolean> => {
        if (!currentScore || !container) {
            return false;
        }

        if (!currentScore.saveSvg) {
            console.error('Error rendering compare score: saveSvg method not available');
            return false;
        }

        try {
            const targetPage = typeof pageIndex === 'number' ? pageIndex : 0;
            const svgData = await runSerializedScoreOperation(
                () => currentScore.saveSvg(targetPage, true, highlightSelection),
                `saveSvg(compare-page=${targetPage + 1})`,
            );
            if (!svgData) {
                return false;
            }
            container.innerHTML = svgData;
            const svg = container.querySelector('svg');
            if (svg instanceof SVGSVGElement) {
                svg.style.width = '100%';
                svg.style.height = '100%';
            }
            return true;
        } catch (err) {
            console.error('Error rendering compare score:', err);
            return false;
        }
    }, []);

    const parseSvgNumeric = (value: string | null) => {
        if (!value) {
            return null;
        }
        if (value.includes('%')) {
            return null;
        }
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : null;
    };

    const getSvgNaturalSize = (svg: SVGSVGElement, zoomValue: number) => {
        const widthAttr = parseSvgNumeric(svg.getAttribute('width'));
        const heightAttr = parseSvgNumeric(svg.getAttribute('height'));
        let width = widthAttr ?? null;
        let height = heightAttr ?? null;
        if ((!width || !height) && svg.getAttribute('viewBox')) {
            const parts = svg
                .getAttribute('viewBox')
                ?.trim()
                .split(/[\s,]+/)
                .map((value) => Number.parseFloat(value));
            if (parts && parts.length === 4) {
                width = width ?? (Number.isFinite(parts[2]) ? parts[2] : null);
                height = height ?? (Number.isFinite(parts[3]) ? parts[3] : null);
            }
        }
        if (!width || !height) {
            const rect = svg.getBoundingClientRect();
            if (zoomValue > 0) {
                width = width ?? rect.width / zoomValue;
                height = height ?? rect.height / zoomValue;
            }
        }
        if (!width || !height) {
            return null;
        }
        return { width, height };
    };

    const syncCompareSvgSize = useCallback((
        container: HTMLDivElement | null,
        setSize: React.Dispatch<React.SetStateAction<{ width: number; height: number } | null>>,
    ) => {
        const svg = container?.querySelector('svg');
        if (!(svg instanceof SVGSVGElement)) {
            return;
        }
        const size = getSvgNaturalSize(svg, compareEffectiveZoom);
        if (!size) {
            return;
        }
        setSize(size);
    }, [compareEffectiveZoom]);

    const getCompareTargetPage = useCallback((targetScore: Score | null) => {
        if (compareContinuousMode) {
            return 0;
        }
        if (!targetScore) {
            return 0;
        }
        if (targetScore === score) {
            return currentPage;
        }
        if (targetScore === compareRightScore) {
            return Math.min(currentPage, Math.max(compareRightPageCount - 1, 0));
        }
        return currentPage;
    }, [compareContinuousMode, score, compareRightScore, currentPage, compareRightPageCount]);

    const handleCompareOverwriteBlock = useCallback(async (
        sourceScore: Score | null,
        targetScore: Score | null,
        partIndex: number,
        pairs: Array<{ leftIndex: number; rightIndex: number }>,
    ) => {
        if (compareSwapBusy) {
            return;
        }
        if (!sourceScore || !targetScore) {
            return;
        }
        if (pairs.length === 0) {
            return;
        }

        setCompareSwapBusy(true);
        try {
            const fallbackSourceXml = sourceScore === score ? compareView?.currentXml ?? null : compareView?.checkpointXml ?? null;
            const fallbackTargetXml = targetScore === score ? compareView?.currentXml ?? null : compareView?.checkpointXml ?? null;
            const [sourceXml, targetXml] = await Promise.all([
                getScoreMusicXmlText(sourceScore, fallbackSourceXml),
                getScoreMusicXmlText(targetScore, fallbackTargetXml),
            ]);
            if (!sourceXml || !targetXml) {
                console.warn('Compare overwrite: unable to load MusicXML for swap.');
                return;
            }

            const patched = replaceMeasuresInMusicXml(
                sourceXml,
                targetXml,
                partIndex,
                pairs.map((pair) => ({ sourceIndex: pair.leftIndex, targetIndex: pair.rightIndex })),
            );
            if (patched.error || !patched.xml) {
                console.warn('Compare overwrite failed:', patched.error || 'Unknown error');
                return;
            }

            if (targetScore === score) {
                await applyXmlToScore(patched.xml);
                setCompareView((prev) => (prev ? { ...prev, currentXml: patched.xml } : prev));
            } else {
                setCompareView((prev) => (prev ? { ...prev, checkpointXml: patched.xml } : prev));
            }
            setCompareAlignmentRevision((value) => value + 1);
        } catch (err) {
            console.warn('Compare overwrite failed:', err);
        } finally {
            setCompareSwapBusy(false);
        }
    }, [
        compareSwapBusy,
        score,
        compareView,
        getScoreMusicXmlText,
        replaceMeasuresInMusicXml,
        applyXmlToScore,
    ]);

    const handleCompareOverwrite = useCallback(async (
        sourceScore: Score | null,
        targetScore: Score | null,
        partIndex: number,
        sourceMeasureIndex: number | null,
        targetMeasureIndex: number | null,
    ) => {
        if (sourceMeasureIndex === null || targetMeasureIndex === null) {
            return;
        }
        await handleCompareOverwriteBlock(
            sourceScore,
            targetScore,
            partIndex,
            [{ leftIndex: sourceMeasureIndex, rightIndex: targetMeasureIndex }],
        );
    }, [handleCompareOverwriteBlock]);

    const parsePartsFromMetadata = useCallback((metadata: any): PartSummary[] => {
        const parts = Array.isArray(metadata?.parts) ? metadata.parts : [];
        return parts.map((part: any, index: number) => ({
            index,
            name: typeof part?.name === 'string' ? part.name : '',
            instrumentName: typeof part?.instrumentName === 'string' ? part.instrumentName : '',
            instrumentId: typeof part?.instrumentId === 'string' ? part.instrumentId : '',
            isVisible: String(part?.isVisible ?? '').toLowerCase() === 'true',
        }));
    }, []);

    const refreshScoreMetadata = async (currentScore: Score) => {
        try {
            const metadata = await runSerializedScoreOperation(
                () => currentScore.metadata(),
                'metadata',
            );
            setScoreTitle(typeof metadata.title === 'string' ? metadata.title : '');
            setScoreSubtitle(typeof (metadata as any).subtitle === 'string' ? (metadata as any).subtitle : '');
            setScoreComposer(typeof metadata.composer === 'string' ? metadata.composer : '');
            const lyricistValue = typeof (metadata as any).lyricist === 'string'
                ? (metadata as any).lyricist
                : typeof (metadata as any).poet === 'string'
                    ? (metadata as any).poet
                    : '';
            setScoreLyricist(lyricistValue);
            setScoreParts(parsePartsFromMetadata(metadata));
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
            const data = await runSerializedScoreOperation(
                () => Promise.resolve(currentScore.listInstrumentTemplates!()),
                'listInstrumentTemplates',
            );
            setInstrumentGroups(Array.isArray(data) ? data as InstrumentTemplateGroup[] : []);
        } catch (err) {
            console.warn('Failed to read instrument templates', err);
            setInstrumentGroups([]);
        }
    };

    const ensureSoundFontLoaded = async (
        targetScore?: Score,
        options?: { forceRetry?: boolean },
    ): Promise<boolean> => {
        if (soundFontLoadedRef.current) {
            console.debug('[AUDIO] soundfont already loaded');
            return true;
        }
        const activeScore = targetScore ?? score;
        if (!activeScore || !activeScore.setSoundFont) {
            console.warn('[AUDIO] soundfont load skipped: setSoundFont unavailable');
            return false;
        }
        const forceRetry = Boolean(options?.forceRetry);
        if (triedSoundFontRef.current && !forceRetry) {
            console.warn('[AUDIO] soundfont load skipped: previous attempt already failed');
            return false;
        }
        if (soundFontLoadPromiseRef.current) {
            return soundFontLoadPromiseRef.current;
        }
        if (forceRetry && triedSoundFontRef.current) {
            console.debug('[AUDIO] retrying soundfont load after previous failure');
        }

        const buildSoundFontCandidates = (): string[] => {
            const urls: string[] = [];
            const seen = new Set<string>();
            const add = (url: string) => {
                if (!url || seen.has(url)) {
                    return;
                }
                seen.add(url);
                urls.push(url);
            };

            const cdnRaw = (process.env.NEXT_PUBLIC_SOUNDFONT_CDN_URL || '').trim();
            if (cdnRaw) {
                const cdn = cdnRaw.replace(/\/+$/, '');
                const lower = cdn.toLowerCase();
                const pointsToFile = lower.endsWith('.sf2') || lower.endsWith('.sf3');

                if (pointsToFile) {
                    add(cdn);
                } else {
                    // Support both:
                    // 1) prefix style: .../MuseScore_General -> .../MuseScore_General.sf3
                    // 2) directory style: .../soundfonts -> .../soundfonts/default.sf3
                    add(`${cdn}.sf3`);
                    add(`${cdn}.sf2`);
                    add(`${cdn}/MuseScore_General.sf3`);
                    add(`${cdn}/MuseScore_General.sf2`);
                    add(`${cdn}/default.sf3`);
                    add(`${cdn}/default.sf2`);
                }
            }

            add('/soundfonts/MuseScore_General.sf3');
            add('/soundfonts/MuseScore_General.sf2');
            add('/soundfonts/default.sf3');
            add('/soundfonts/default.sf2');

            return urls;
        };

        const loadPromise = (async () => {
            triedSoundFontRef.current = true;
            setTriedSoundFont(true);
            const candidates = buildSoundFontCandidates();
            console.debug('[AUDIO] soundfont candidates', { candidates });
            for (const url of candidates) {
                try {
                    const res = await fetch(url);
                    if (!res.ok) {
                        console.warn('[AUDIO] soundfont candidate not found', { url, status: res.status });
                        continue;
                    }
                    const buf = new Uint8Array(await res.arrayBuffer());
                    await runSerializedScoreOperation(
                        () => activeScore.setSoundFont(buf),
                        'setSoundFont',
                    );
                    soundFontLoadedRef.current = true;
                    setSoundFontLoaded(true);
                    console.debug('[AUDIO] soundfont loaded', { url, bytes: buf.byteLength });
                    return true;
                } catch (err) {
                    console.warn('Default soundfont load failed for', url, err);
                }
            }
            return false;
        })();

        soundFontLoadPromiseRef.current = loadPromise;
        try {
            return await loadPromise;
        } finally {
            if (soundFontLoadPromiseRef.current === loadPromise) {
                soundFontLoadPromiseRef.current = null;
            }
        }
    };

    const handleSoundFontUpload = async (file: File) => {
        if (!score || !score.setSoundFont) {
            alert('SoundFont loading is not available in this build.');
            return;
        }
        try {
            const buffer = await file.arrayBuffer();
            const data = new Uint8Array(buffer);
            await runSerializedScoreOperation(
                () => score.setSoundFont(data),
                'setSoundFont(upload)',
            );
            soundFontLoadedRef.current = true;
            triedSoundFontRef.current = true;
            soundFontLoadPromiseRef.current = null;
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

    const handleSaveCompareCheckpoint = useCallback(async (side: 'left' | 'right') => {
        if (!compareView) {
            return;
        }
        if (!isIndexedDbAvailable()) {
            alert('IndexedDB is not available in this browser.');
            return;
        }

        const targetIsCurrent = side === 'left' ? compareLeftIsCurrent : compareRightIsCurrent;
        const customLabel = side === 'left' ? compareLeftCheckpointLabel : compareRightCheckpointLabel;
        const sourceLabel = side === 'left' ? compareLeftLabel : compareRightLabel;

        setCheckpointBusy(true);
        try {
            let xmlData: Uint8Array;

            if (targetIsCurrent) {
                // Saving the current score - get its XML directly
                const currentXmlData = await getScoreXmlData();
                if (!currentXmlData) {
                    alert('Unable to read current score MusicXML.');
                    return;
                }
                xmlData = currentXmlData;
            } else {
                // Saving a checkpoint - get its XML
                const xml = await getScoreMusicXmlText(compareRightScore, compareView.checkpointXml);
                if (!xml) {
                    alert('Unable to read checkpoint MusicXML.');
                    return;
                }
                xmlData = new TextEncoder().encode(xml);
            }

            const activeScoreId = ensureScoreId('score');
            const title = buildCheckpointTitle(customLabel, sourceLabel);
            await saveCheckpoint({
                title,
                createdAt: Date.now(),
                format: 'musicxml',
                data: xmlData.buffer.slice(xmlData.byteOffset, xmlData.byteOffset + xmlData.byteLength),
                size: xmlData.byteLength,
                scoreId: activeScoreId,
            });
            await loadCheckpointList();
            // Clear the label field after saving
            if (side === 'left') {
                setCompareLeftCheckpointLabel('');
            } else {
                setCompareRightCheckpointLabel('');
            }
        } catch (err) {
            console.error('Failed to save compare checkpoint', err);
            alert('Failed to save compare checkpoint. See console for details.');
        } finally {
            setCheckpointBusy(false);
        }
    }, [
        compareView,
        compareLeftIsCurrent,
        compareRightIsCurrent,
        compareLeftCheckpointLabel,
        compareRightCheckpointLabel,
        compareLeftLabel,
        compareRightLabel,
        compareRightScore,
        getScoreXmlData,
        getScoreMusicXmlText,
        ensureScoreId,
        loadCheckpointList,
    ]);

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

    const handleCompareSwapSides = useCallback(() => {
        setCompareSwapped((prev) => !prev);
    }, []);

    const handleOpenScoreInEditor = useCallback((side: 'left' | 'right') => {
        if (!compareView) return;

        // Get the XML for the selected side
        const xml = side === 'left' ? compareLeftXml : compareRightXml;
        const label = side === 'left' ? compareLeftLabel : compareRightLabel;

        // Store XML in sessionStorage for the new tab to pick up
        const filename = `${label.replace(/[^a-zA-Z0-9]/g, '_')}.xml`;
        sessionStorage.setItem('openInEditor', JSON.stringify({ xml, filename }));

        // Open a new tab with the full editor
        // Use absolute path to avoid base tag interference when embedded
        window.open('/score-editor/index.html', '_blank');
    }, [compareView, compareLeftXml, compareRightXml, compareLeftLabel, compareRightLabel]);

    useEffect(() => {
        if (!compareView) {
            if (compareRightScoreRef.current) {
                compareRightScoreRef.current.destroy();
                compareRightScoreRef.current = null;
            }
            compareLoadedCheckpointXmlRef.current = null;
            setCompareRightScore(null);
            setCompareRightParts([]);
            setCompareRightPageCount(1);
            setCompareRightLoading(false);
            setCompareRightError(null);
            setCompareZoom(null);
            setCompareLeftSvgSize(null);
            setCompareRightSvgSize(null);
            setCompareLeftMeasurePositions(null);
            setCompareRightMeasurePositions(null);
            setCompareSignatures(null);
            setCompareSwapped(false);
            setCompareLeftCheckpointLabel('');
            setCompareRightCheckpointLabel('');
            return;
        }

        // Only reload checkpoint score if the XML has actually changed
        if (compareLoadedCheckpointXmlRef.current === compareView.checkpointXml) {
            return;
        }

        let canceled = false;
        const loadCompareScore = async () => {
            setCompareRightLoading(true);
            setCompareRightError(null);
            if (compareRightScoreRef.current) {
                compareRightScoreRef.current.destroy();
                compareRightScoreRef.current = null;
            }
            try {
                const WebMscore = await loadWebMscore();
                const data = new TextEncoder().encode(compareView.checkpointXml);
                const loadedScore = await WebMscore.load('musicxml', data);
                if (canceled) {
                    loadedScore.destroy();
                    return;
                }
                compareRightScoreRef.current = loadedScore;
                compareLoadedCheckpointXmlRef.current = compareView.checkpointXml;
                setCompareRightScore(loadedScore);
                if (loadedScore.npages) {
                    const pages = await runSerializedScoreOperation(
                        () => loadedScore.npages!(),
                        'npages(compare)',
                    );
                    if (!canceled) {
                        setCompareRightPageCount(Math.max(1, pages));
                    }
                }
                const metadata = await runSerializedScoreOperation(
                    () => loadedScore.metadata(),
                    'metadata(compare)',
                );
                if (!canceled) {
                    setCompareRightParts(parsePartsFromMetadata(metadata));
                }
            } catch (err) {
                console.error('Failed to load compare checkpoint score', err);
                if (!canceled) {
                    setCompareRightError('Unable to load checkpoint score.');
                }
            } finally {
                if (!canceled) {
                    setCompareRightLoading(false);
                }
            }
        };

        loadCompareScore();
        return () => {
            canceled = true;
        };
    }, [compareView, parsePartsFromMetadata]);

    useEffect(() => {
        return () => {
            if (compareRightScoreRef.current) {
                compareRightScoreRef.current.destroy();
                compareRightScoreRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (!compareView || !compareLeftScore) {
            return;
        }
        // Only check loading state when left pane is showing the checkpoint (not swapped)
        if (!compareSwapped && compareLeftScore === compareRightScore) {
            if (compareRightLoading || compareRightError) {
                return;
            }
            if (compareRightScoreRef.current && compareRightScoreRef.current !== compareRightScore) {
                return;
            }
        }
        const targetPage = getCompareTargetPage(compareLeftScore);
        void renderScoreToContainer(compareLeftScore, compareLeftContainerRef.current, targetPage, false)
            .then(() => {
                syncCompareSvgSize(compareLeftContainerRef.current, setCompareLeftSvgSize);
                void refreshMeasurePositions(compareLeftScore, setCompareLeftMeasurePositions);
            });
    }, [
        compareView,
        compareLeftScore,
        compareRightScore,
        compareRightLoading,
        compareRightError,
        compareSwapped,
        renderScoreToContainer,
        syncCompareSvgSize,
        refreshMeasurePositions,
        getCompareTargetPage,
    ]);

    useEffect(() => {
        if (!compareView || !compareRightScoreDisplay) {
            return;
        }
        const isCheckpoint = compareRightScoreDisplay === compareRightScore;
        if (isCheckpoint) {
            if (compareRightLoading || compareRightError) {
                return;
            }
            if (compareRightScoreRef.current && compareRightScoreRef.current !== compareRightScore) {
                return;
            }
        }
        if (compareRightRenderInFlightRef.current) {
            return;
        }
        const targetPage = getCompareTargetPage(compareRightScoreDisplay);
        compareRightRenderInFlightRef.current = true;
        void renderScoreToContainer(compareRightScoreDisplay, compareRightContainerRef.current, targetPage, false)
            .then((rendered) => {
                if (!rendered && !compareRightError && isCheckpoint) {
                    setCompareRightError('No SVG output from checkpoint score.');
                    return;
                }
                syncCompareSvgSize(compareRightContainerRef.current, setCompareRightSvgSize);
                void refreshMeasurePositions(compareRightScoreDisplay, setCompareRightMeasurePositions);
            })
            .finally(() => {
                compareRightRenderInFlightRef.current = false;
            });
    }, [
        compareView,
        compareRightScoreDisplay,
        compareRightScore,
        compareRightError,
        compareRightLoading,
        renderScoreToContainer,
        syncCompareSvgSize,
        refreshMeasurePositions,
        getCompareTargetPage,
    ]);

    useEffect(() => {
        if (!compareView) {
            setCompareContinuousMode(false);
            setCompareReflowMode(false);
            const restoreMode = compareLayoutRestoreRef.current;
            compareLayoutRestoreRef.current = null;
            if (restoreMode !== null && score?.setLayoutMode) {
                void score
                    .setLayoutMode(restoreMode)
                    .then(() => renderScore(score, currentPageRef.current))
                    .catch((err) => {
                        console.warn('Failed to restore layout mode after compare:', err);
                    });
            }
            return;
        }

        if (!score || !compareRightScore) {
            setCompareContinuousMode(false);
            return;
        }
        if (!score.setLayoutMode || !compareRightScore.setLayoutMode) {
            setCompareContinuousMode(false);
            return;
        }

        let canceled = false;
        const enableContinuous = async () => {
            try {
                if (compareLayoutRestoreRef.current === null && score.getLayoutMode) {
                    compareLayoutRestoreRef.current = await score.getLayoutMode();
                }
                const targetLayout = compareReflowMode ? LAYOUT_MODES.SYSTEM : LAYOUT_MODES.LINE;
                await score.setLayoutMode(targetLayout);
                await compareRightScore.setLayoutMode(targetLayout);
                if (canceled) {
                    return;
                }
                setCompareContinuousMode(true);
                const targetPage = 0;
                // Use swapped scores to render to the correct panes
                await renderScoreToContainer(compareLeftScore, compareLeftContainerRef.current, targetPage, false);
                syncCompareSvgSize(compareLeftContainerRef.current, setCompareLeftSvgSize);
                await renderScoreToContainer(compareRightScoreDisplay, compareRightContainerRef.current, targetPage, false);
                syncCompareSvgSize(compareRightContainerRef.current, setCompareRightSvgSize);
            } catch (err) {
                console.warn('Failed to enable continuous layout for compare:', err);
                if (!canceled) {
                    setCompareContinuousMode(false);
                }
            }
        };

        enableContinuous();
        return () => {
            canceled = true;
        };
    }, [compareView, score, compareRightScore, compareReflowMode, renderScore, renderScoreToContainer, syncCompareSvgSize, compareLeftScore, compareRightScoreDisplay]);

    useEffect(() => {
        if (compareView && compareReflowMode && !compareSupportsReflow) {
            setCompareReflowMode(false);
        }
    }, [compareView, compareReflowMode, compareSupportsReflow]);

    useEffect(() => {
        if (!compareView) {
            return;
        }
        if (!compareSupportsReflow) {
            return;
        }
        setCompareReflowMode(true);
    }, [compareView, compareSupportsReflow]);

    useEffect(() => {
        if (!compareView) {
            const restore = compareLineBreakRestoreRef.current;
            compareLineBreakRestoreRef.current = null;
            if (restore && score) {
                void applyMeasureLineBreaks(score, restore.left);
            }
            return;
        }

        if (!compareReflowMode) {
            const restore = compareLineBreakRestoreRef.current;
            if (!restore) {
                return;
            }
            compareLineBreakRestoreRef.current = null;
            if (!score || !compareRightScore) {
                return;
            }
            if (!compareSupportsReflow) {
                return;
            }
            void Promise.all([
                applyMeasureLineBreaks(score, restore.left),
                applyMeasureLineBreaks(compareRightScore, restore.right),
            ]).then(() => {
                const targetPage = compareContinuousMode ? 0 : currentPageRef.current;
                void renderScoreToContainer(score, compareLeftContainerRef.current, targetPage, false)
                    .then(() => {
                        syncCompareSvgSize(compareLeftContainerRef.current, setCompareLeftSvgSize);
                        void refreshMeasurePositions(score, setCompareLeftMeasurePositions);
                    });
                void renderScoreToContainer(compareRightScore, compareRightContainerRef.current, targetPage, false)
                    .then(() => {
                        syncCompareSvgSize(compareRightContainerRef.current, setCompareRightSvgSize);
                        void refreshMeasurePositions(compareRightScore, setCompareRightMeasurePositions);
                    });
            });
            return;
        }

        if (!compareView || !score || !compareRightScore) {
            return;
        }
        if (!compareSupportsReflow) {
            return;
        }

        let canceled = false;
        const applyReflow = async () => {
            const cached = compareLineBreakRestoreRef.current;
            let leftBreaks = cached?.left ?? [];
            let rightBreaks = cached?.right ?? [];
            if (!cached) {
                [leftBreaks, rightBreaks] = await Promise.all([
                    fetchMeasureLineBreaks(score),
                    fetchMeasureLineBreaks(compareRightScore),
                ]);
            }
            if (canceled) {
                return;
            }
            if (!compareLineBreakRestoreRef.current) {
                compareLineBreakRestoreRef.current = { left: leftBreaks, right: rightBreaks };
            }
            const leftMeasureCount = leftBreaks.length
                || Math.max(0, ...compareAlignments.map((alignment) => alignment.leftCount));
            const rightMeasureCount = rightBreaks.length
                || Math.max(0, ...compareAlignments.map((alignment) => alignment.rightCount));
            const normalizedLeft = Array.from({ length: leftMeasureCount }, (_, index) => Boolean(leftBreaks[index]));
            const normalizedRight = Array.from({ length: rightMeasureCount }, (_, index) => Boolean(rightBreaks[index]));
            const leftMismatch = Array.from({ length: leftMeasureCount }, () => false);
            const rightMismatch = Array.from({ length: rightMeasureCount }, () => false);
            compareAlignments.forEach((alignment) => {
                const leftPartBreaks = buildMismatchBreaks(alignment.rows, 'left', leftMeasureCount);
                const rightPartBreaks = buildMismatchBreaks(alignment.rows, 'right', rightMeasureCount);
                leftPartBreaks.forEach((value, index) => {
                    if (value) {
                        leftMismatch[index] = true;
                    }
                });
                rightPartBreaks.forEach((value, index) => {
                    if (value) {
                        rightMismatch[index] = true;
                    }
                });
            });
            const leftReflow = normalizedLeft.map((value, index) => value || leftMismatch[index]);
            const rightReflow = normalizedRight.map((value, index) => value || rightMismatch[index]);
            await applyMeasureLineBreaks(score, leftReflow);
            await applyMeasureLineBreaks(compareRightScore, rightReflow);
            if (canceled) {
                return;
            }
            const targetPage = compareContinuousMode ? 0 : currentPageRef.current;
            await renderScoreToContainer(score, compareLeftContainerRef.current, targetPage, false);
            syncCompareSvgSize(compareLeftContainerRef.current, setCompareLeftSvgSize);
            await refreshMeasurePositions(score, setCompareLeftMeasurePositions);
            await renderScoreToContainer(compareRightScore, compareRightContainerRef.current, targetPage, false);
            syncCompareSvgSize(compareRightContainerRef.current, setCompareRightSvgSize);
            await refreshMeasurePositions(compareRightScore, setCompareRightMeasurePositions);
        };

        applyReflow();
        return () => {
            canceled = true;
        };
    }, [
        compareView,
        compareReflowMode,
        compareSupportsReflow,
        score,
        compareRightScore,
        compareContinuousMode,
        applyMeasureLineBreaks,
        fetchMeasureLineBreaks,
        compareAlignments,
        buildMismatchBreaks,
        refreshMeasurePositions,
        renderScoreToContainer,
        syncCompareSvgSize,
    ]);

    useEffect(() => {
        if (!compareView) {
            setCompareAlignments([]);
            setCompareAlignmentLoading(false);
            setCompareSignatures(null);
            return;
        }

        let canceled = false;
        const loadAlignments = async () => {
            setCompareAlignmentLoading(true);
            try {
                let leftSignatures: string[][] = [];
                let rightSignatures: string[][] = [];
                let usedXml = false;
                try {
                    if (compareView.currentXml && compareView.checkpointXml) {
                        leftSignatures = extractMeasureSignaturesFromXml(compareView.currentXml);
                        rightSignatures = extractMeasureSignaturesFromXml(compareView.checkpointXml);
                        usedXml = true;
                    } else if (score && compareRightScore) {
                        const [leftMscx, rightMscx] = await Promise.all([
                            getScoreMscxText(score),
                            getScoreMscxText(compareRightScore),
                        ]);
                        if (leftMscx && rightMscx) {
                            leftSignatures = extractMeasureSignaturesFromXml(leftMscx);
                            rightSignatures = extractMeasureSignaturesFromXml(rightMscx);
                            usedXml = true;
                        }
                    }
                } catch (err) {
                    console.warn('Failed to parse MusicXML for compare signatures; falling back to WASM.', err);
                }

                if (!usedXml) {
                    if (!score || !compareRightScore) {
                        setCompareAlignments([]);
                        setCompareSignatures(null);
                        return;
                    }
                    const partCount = Math.max(scoreParts.length, compareRightParts.length, 1);
                    leftSignatures = await Promise.all(
                        Array.from({ length: partCount }, (_, index) => fetchMeasureSignatures(score, index)),
                    );
                    rightSignatures = await Promise.all(
                        Array.from({ length: partCount }, (_, index) => fetchMeasureSignatures(compareRightScore, index)),
                    );
                }

                if (canceled) {
                    return;
                }

                const partCount = Math.max(leftSignatures.length, rightSignatures.length, 1);
                const alignments: PartAlignment[] = Array.from({ length: partCount }, (_, index) => {
                    const left = leftSignatures[index] ?? [];
                    const right = rightSignatures[index] ?? [];
                    if (left.length === 0 && right.length === 0) {
                        return {
                            partIndex: index,
                            rows: [],
                            strategy: 'index',
                            lcsRatio: 0,
                            leftCount: 0,
                            rightCount: 0,
                        };
                    }

                    const { rows, lcsRatio } = buildLcsAlignment(left, right);
                    const strategy = rows.some((row) => row.match) ? 'lcs' : 'index';
                    const alignedRows = strategy === 'lcs' ? rows : buildIndexAlignment(left, right);

                    return {
                        partIndex: index,
                        rows: alignedRows,
                        strategy,
                        lcsRatio,
                        leftCount: left.length,
                        rightCount: right.length,
                    };
                });

                setCompareAlignments(alignments);
                setCompareSignatures({ left: leftSignatures, right: rightSignatures });
            } catch (err) {
                console.error('Failed to compute compare alignment', err);
                if (!canceled) {
                    setCompareAlignments([]);
                    setCompareSignatures(null);
                }
            } finally {
                if (!canceled) {
                    setCompareAlignmentLoading(false);
                }
            }
        };

        loadAlignments();
        return () => {
            canceled = true;
        };
    }, [
        compareView,
        compareAlignmentRevision,
        scoreParts.length,
        compareRightParts.length,
        score,
        compareRightScore,
        fetchMeasureSignatures,
        buildLcsAlignment,
        buildIndexAlignment,
        extractMeasureSignaturesFromXml,
        getScoreMscxText,
    ]);

    useEffect(() => {
        if (!compareView) {
            return;
        }
        const left = compareLeftScrollRef.current;
        const right = compareRightScrollRef.current;
        const gutter = compareGutterScrollRef.current;
        if (!left || !right || !gutter) {
            return;
        }

        const syncScroll = (source: HTMLDivElement, target: HTMLDivElement, gutterTarget: HTMLDivElement) => {
            if (compareScrollSyncRef.current) {
                return;
            }
            compareScrollSyncRef.current = true;
            target.scrollTop = source.scrollTop;
            target.scrollLeft = source.scrollLeft;
            gutterTarget.scrollTop = source.scrollTop;
            compareScrollSyncRef.current = false;
        };

        const handleLeftScroll = () => syncScroll(left, right, gutter);
        const handleRightScroll = () => syncScroll(right, left, gutter);
        const handleGutterScroll = () => syncScroll(gutter, left, right);
        left.addEventListener('scroll', handleLeftScroll);
        right.addEventListener('scroll', handleRightScroll);
        gutter.addEventListener('scroll', handleGutterScroll);

        return () => {
            left.removeEventListener('scroll', handleLeftScroll);
            right.removeEventListener('scroll', handleRightScroll);
            gutter.removeEventListener('scroll', handleGutterScroll);
        };
    }, [compareView]);

    useEffect(() => {
        if (!compareView || compareRightLoading || compareRightError) {
            return;
        }
        const leftContainer = compareLeftScrollRef.current;
        const rightContainer = compareRightScrollRef.current;
        if (!leftContainer || !rightContainer || !compareLeftSvgSize || !compareRightSvgSize) {
            return;
        }
        if (typeof window === 'undefined') {
            return;
        }
        const leftWidth = leftContainer.clientWidth;
        const rightWidth = rightContainer.clientWidth;
        if (!leftWidth || !rightWidth) {
            return;
        }
        window.requestAnimationFrame(() => {
            const fitZoom = Math.min(leftWidth / compareLeftSvgSize.width, rightWidth / compareRightSvgSize.width);
            if (!Number.isFinite(fitZoom) || fitZoom <= 0) {
                return;
            }
            const clamped = Math.max(0.2, Math.min(fitZoom, 1.5));
            const maxZoom = compareZoom ?? compareDefaultZoom;
            const nextZoom = Math.min(maxZoom, clamped);
            if (compareZoom === null || Math.abs(compareZoom - nextZoom) > 0.01) {
                setCompareZoom(nextZoom);
            }
        });
    }, [
        compareView,
        compareRightLoading,
        compareRightError,
        currentPage,
        compareEffectiveZoom,
        compareZoom,
        compareLeftSvgSize,
        compareRightSvgSize,
    ]);

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

    const requestAiText = async (payload: {
        provider: AiProvider;
        apiKey: string;
        model: string;
        promptText: string;
        systemPrompt?: string;
        prompt?: string;
        xml?: string;
        image?: AiImageAttachment | null;
        pdf?: AiPdfAttachment | null;
        maxTokens: number | null;
    }) => {
        const {
            provider,
            apiKey,
            model,
            promptText,
            systemPrompt: systemPromptOverride = '',
            prompt = '',
            xml = '',
            image = null,
            pdf = null,
            maxTokens,
        } = payload;
        const systemPrompt = systemPromptOverride.trim() || AI_PATCH_SYSTEM_PROMPT;
        const userPrompt = promptText.trim() || buildPromptWithSections(prompt, xml.trim() ? [{ title: 'Current MusicXML', content: xml }] : []);

        if (useLlmProxy) {
            const response = await fetch(proxyUrlFor(`/api/llm/${provider}`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    apiKey,
                    model,
                    prompt,
                    xml,
                    systemPrompt: systemPrompt || undefined,
                    promptText: userPrompt,
                    imageBase64: image?.base64 ?? '',
                    imageMediaType: image?.mediaType ?? '',
                    pdfBase64: pdf?.base64 ?? '',
                    pdfMediaType: pdf?.mediaType ?? '',
                    pdfFilename: pdf?.filename ?? '',
                    maxTokens: maxTokens ?? undefined,
                }),
            });
            if (response.ok) {
                const data = await response.json();
                return typeof data?.text === 'string' ? data.text : '';
            }
            if (provider === 'anthropic' && isEmbedBuild && !llmProxyBase && isMissingProxyStatus(response.status)) {
                throw new Error(ANTHROPIC_EMBED_PROXY_ERROR);
            }
            const canFallbackDirect = provider !== 'anthropic' && isEmbedBuild && !llmProxyBase && isMissingProxyStatus(response.status);
            if (!canFallbackDirect) {
                const errorText = await response.text();
                throw new Error(errorText || 'Request failed.');
            }
        }

        return requestAiTextDirect({
            provider,
            apiKey,
            model,
            promptText: userPrompt,
            systemPrompt,
            maxTokens,
            image,
            pdf,
        });
    };

    const requestAiPatchTextWithRetry = async (payload: Parameters<typeof requestAiText>[0]) => {
        const requestPatchAttempt = async (attemptLabel: string) => {
            try {
                return await requestAiText(payload);
            } catch (err) {
                if (!shouldRetryAiPatchRequestError(err)) {
                    throw err;
                }
                console.warn('[AI] Patch request failed; retrying once on the same provider.', {
                    provider: payload.provider,
                    model: payload.model,
                    attempt: attemptLabel,
                    error: errorMessage(err) || String(err),
                });
                await sleep(AI_PATCH_REQUEST_RETRY_DELAY_MS);
                return requestAiText(payload);
            }
        };

        const firstRawText = await requestPatchAttempt('initial');
        const firstExtracted = extractJsonFromResponse(firstRawText);
        if (firstExtracted) {
            return {
                rawText: firstRawText,
                extracted: firstExtracted,
                retried: false,
            };
        }

        console.warn('[AI] Patch response did not contain JSON patch payload on first attempt. Retrying with stricter JSON instructions.', {
            provider: payload.provider,
            model: payload.model,
        });

        const retryPromptText = [payload.promptText.trim(), AI_PATCH_STRICT_RETRY_SUFFIX]
            .filter(Boolean)
            .join('\n\n');
        const retryPayload = {
            ...payload,
            promptText: retryPromptText,
            systemPrompt: AI_PATCH_SYSTEM_PROMPT,
        };
        const retryRawText = await (async () => {
            try {
                return await requestAiText(retryPayload);
            } catch (err) {
                if (!shouldRetryAiPatchRequestError(err)) {
                    throw err;
                }
                console.warn('[AI] Strict-JSON patch retry request failed; retrying once on the same provider.', {
                    provider: payload.provider,
                    model: payload.model,
                    error: errorMessage(err) || String(err),
                });
                await sleep(AI_PATCH_REQUEST_RETRY_DELAY_MS);
                return requestAiText(retryPayload);
            }
        })();
        const retryExtracted = extractJsonFromResponse(retryRawText);
        return {
            rawText: retryRawText,
            extracted: retryExtracted,
            retried: true,
        };
    };

    const updateAiOutput = useCallback(async (nextText: string, baseXmlOverride?: string) => {
        setAiOutput(nextText);
        setAiPatch(null);
        setAiPatchError(null);
        setAiPatchedXml('');
        if (!nextText.trim()) {
            setAiPatchError('AI output is empty.');
            return;
        }
        const parsed = parseMusicXmlPatch(nextText);
        if (parsed.error || !parsed.patch) {
            setAiPatchError(parsed.error || 'Invalid patch payload.');
            return;
        }
        setAiPatch(parsed.patch);
        const baseXml = baseXmlOverride ?? aiBaseXml ?? await resolveXmlContext();
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
    }, [aiBaseXml, resolveXmlContext]);

    const handleAiRequest = async () => {
        if (!aiEnabled) {
            alert('AI features are disabled.');
            return;
        }
        if (!aiApiKey.trim()) {
            alert(`Enter your ${AI_PROVIDER_LABELS[aiProvider]} API key.`);
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
            const promptSections: AiPromptSection[] = [];
            const xmlContext = aiIncludeXml ? await resolveXmlContext() : '';
            if (aiIncludeXml && !xmlContext.trim()) {
                alert('Unable to load MusicXML for context.');
                return;
            }
            if (aiIncludeXml && xmlContext.trim()) {
                promptSections.push({
                    title: 'Current MusicXML text',
                    content: xmlContext,
                });
            }
            const pdfAttachment = aiIncludePdf
                ? await resolveScorePdfAttachment()
                : null;
            if (aiIncludePdf) {
                promptSections.push({
                    title: 'Rendered score PDF',
                    content: pdfAttachment
                        ? `Attached as ${pdfAttachment.filename}.`
                        : `PDF attachment unavailable (or exceeds ${Math.round(AI_PDF_ATTACHMENT_MAX_BYTES / (1024 * 1024))} MB limit).`,
                });
            }
            if (aiIncludePage) {
                const pageContextRaw = await resolveCurrentPageSvgContext();
                if (pageContextRaw.trim()) {
                    const pageContext = truncateAiContext(pageContextRaw, AI_PAGE_SVG_CONTEXT_MAX_CHARS);
                    promptSections.push({
                        title: `Current rendered page SVG (page ${Math.max(0, currentPageRef.current) + 1})`,
                        content: `${pageContext.value}${pageContext.truncated
                            ? `\n[Page SVG truncated from ${pageContext.originalLength} characters.]`
                            : ''}`,
                    });
                } else {
                    promptSections.push({
                        title: `Current rendered page SVG (page ${Math.max(0, currentPageRef.current) + 1})`,
                        content: 'Page SVG context is unavailable.',
                    });
                }
            }
            if (aiIncludeSelection) {
                const selectionContext = await resolveSelectionContext();
                promptSections.push({
                    title: 'Current selection context',
                    content: selectionContext || 'No active selection.',
                });
            }
            if (aiIncludeChat) {
                const chatTranscript = buildAiChatTranscript(aiChatMessages);
                promptSections.push({
                    title: 'Assistant chat history',
                    content: chatTranscript || 'No prior chat messages.',
                });
            }
            const imageAttachment = aiIncludeRenderedImage
                ? await resolveCurrentPageImageAttachment()
                : null;
            if (aiIncludeRenderedImage && !imageAttachment) {
                console.warn('Rendered image context requested, but PNG capture is unavailable.');
            }
            const baseXml = aiIncludeXml ? xmlContext : await resolveXmlContext();
            setAiBaseXml(baseXml);
            const maxTokens = aiMaxTokensMode === 'custom' ? aiMaxTokens : null;
            const promptText = buildAiPrompt(aiPrompt, promptSections);
            const patchResponse = await requestAiPatchTextWithRetry({
                provider: aiProvider,
                apiKey: aiApiKey,
                model: aiModel,
                promptText,
                systemPrompt: AI_PATCH_SYSTEM_PROMPT,
                prompt: aiPrompt,
                xml: aiIncludeXml ? xmlContext : '',
                image: imageAttachment,
                pdf: pdfAttachment,
                maxTokens,
            });
            if (!patchResponse.extracted) {
                setAiOutput(patchResponse.rawText || '');
                setAiError(
                    patchResponse.retried
                        ? 'No patch was returned by the model after a retry with stricter JSON instructions.'
                        : 'No patch was returned by the model.',
                );
                return;
            }
            await updateAiOutput(patchResponse.extracted, baseXml);
        } catch (err) {
            console.error('AI request failed', err);
            const message = errorMessage(err);
            setAiError(message || 'AI request failed. See console for details.');
        } finally {
            setAiBusy(false);
        }
    };

    const handleAiChatSend = async () => {
        if (!aiEnabled) {
            alert('AI features are disabled.');
            return;
        }
        if (!aiApiKey.trim()) {
            alert(`Enter your ${AI_PROVIDER_LABELS[aiProvider]} API key.`);
            return;
        }
        if (!aiModel.trim()) {
            alert('Select a model.');
            return;
        }
        if (!aiChatInput.trim()) {
            alert('Enter a chat message.');
            return;
        }
        if (aiMaxTokensMode === 'custom' && aiMaxTokens <= 0) {
            alert('Enter a max output token limit.');
            return;
        }

        const userMessage: AiChatMessage = { role: 'user', text: aiChatInput.trim() };
        const nextMessages = [...aiChatMessages, userMessage];

        setAiBusy(true);
        setAiError(null);
        try {
            const promptSections: AiPromptSection[] = [];
            const xmlContext = aiIncludeXml ? await resolveXmlContext() : '';
            if (aiIncludeXml && !xmlContext.trim()) {
                alert('Unable to load MusicXML for context.');
                return;
            }
            if (aiIncludeXml && xmlContext.trim()) {
                promptSections.push({
                    title: 'Current MusicXML text',
                    content: xmlContext,
                });
            }
            const pdfAttachment = aiIncludePdf
                ? await resolveScorePdfAttachment()
                : null;
            if (aiIncludePdf) {
                promptSections.push({
                    title: 'Rendered score PDF',
                    content: pdfAttachment
                        ? `Attached as ${pdfAttachment.filename}.`
                        : `PDF attachment unavailable (or exceeds ${Math.round(AI_PDF_ATTACHMENT_MAX_BYTES / (1024 * 1024))} MB limit).`,
                });
            }
            if (aiIncludePage) {
                const pageContextRaw = await resolveCurrentPageSvgContext();
                if (pageContextRaw.trim()) {
                    const pageContext = truncateAiContext(pageContextRaw, AI_PAGE_SVG_CONTEXT_MAX_CHARS);
                    promptSections.push({
                        title: `Current rendered page SVG (page ${Math.max(0, currentPageRef.current) + 1})`,
                        content: `${pageContext.value}${pageContext.truncated
                            ? `\n[Page SVG truncated from ${pageContext.originalLength} characters.]`
                            : ''}`,
                    });
                } else {
                    promptSections.push({
                        title: `Current rendered page SVG (page ${Math.max(0, currentPageRef.current) + 1})`,
                        content: 'Page SVG context is unavailable.',
                    });
                }
            }
            if (aiIncludeSelection) {
                const selectionContext = await resolveSelectionContext();
                promptSections.push({
                    title: 'Current selection context',
                    content: selectionContext || 'No active selection.',
                });
            }
            if (aiIncludeChat) {
                const chatTranscript = buildAiChatTranscript(nextMessages);
                promptSections.push({
                    title: 'Assistant chat history',
                    content: chatTranscript || 'No prior chat messages.',
                });
            }
            const imageAttachment = aiIncludeRenderedImage
                ? await resolveCurrentPageImageAttachment()
                : null;
            if (aiIncludeRenderedImage && !imageAttachment) {
                console.warn('Rendered image context requested, but PNG capture is unavailable.');
            }

            const promptText = buildPromptWithSections(
                `Latest user message:\n${userMessage.text}\n\nRespond directly to the latest user message.`,
                promptSections,
            );
            setAiChatInput('');
            setAiChatMessages(nextMessages);
            const maxTokens = aiMaxTokensMode === 'custom' ? aiMaxTokens : null;
            const rawText = await requestAiText({
                provider: aiProvider,
                apiKey: aiApiKey,
                model: aiModel,
                promptText,
                systemPrompt: AI_CHAT_SYSTEM_PROMPT,
                prompt: userMessage.text,
                xml: aiIncludeXml ? xmlContext : '',
                image: imageAttachment,
                pdf: pdfAttachment,
                maxTokens,
            });
            const responseText = rawText.trim();
            if (!responseText) {
                setAiError('No response was returned by the model.');
                return;
            }
            setAiChatMessages((prev) => [...prev, { role: 'assistant', text: responseText }]);
        } catch (err) {
            console.error('AI chat request failed', err);
            const message = errorMessage(err);
            setAiError(message || 'AI chat request failed. See console for details.');
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
                    const page = resolvePageIndex(cand);
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
                    const page = resolvePageIndex(el);
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
            const targetPage = usePoint.page ?? currentPageRef.current;
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
        const page = resolvePageIndex(target);
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
        if (!score || targetPage < 0) {
            return;
        }
        if (pageNavigationInFlightRef.current) {
            return;
        }
        pageNavigationInFlightRef.current = true;
        const previousPage = currentPageRef.current;
        let knownPages = pageCount;
        try {
            if (largeScoreSessionRef.current) {
                console.info('[large-nav] goToPage:start', {
                    targetPage,
                    knownPages: pageCount,
                    progressivePagingActive,
                    progressiveHasMorePages,
                });
            }
            if (progressivePagingActive && targetPage >= pageCount) {
                if (largeScoreSessionRef.current) {
                    console.info('[large-nav] layout:ensure:start', { targetPage });
                }
                const ready = await ensurePageIsLaidOut(score, targetPage);
                if (!ready) {
                    if (largeScoreSessionRef.current) {
                        console.info('[large-nav] goToPage:not-ready', { targetPage });
                    }
                    return;
                }
                if (largeScoreSessionRef.current) {
                    console.info('[large-nav] layout:ensure:done', { targetPage });
                }
                if (score.npages) {
                    knownPages = Math.max(
                        1,
                        await runSerializedScoreOperation(
                            () => score.npages!(),
                            'npages',
                        ),
                    );
                    setPageCount((prev) => Math.max(prev, knownPages));
                } else {
                    knownPages = Math.max(pageCount, targetPage + 1);
                }
            } else if (targetPage >= pageCount) {
                return;
            }

            const maxKnownPage = Math.max(knownPages - 1, 0);
            const clampedTarget = Math.min(targetPage, maxKnownPage);
            setCurrentPage(clampedTarget);
            if (largeScoreSessionRef.current) {
                console.info('[large-nav] render:start', { targetPage: clampedTarget });
            }
            let rendered = await renderScore(score, clampedTarget);
            if (!rendered && progressivePagingActive) {
                if (largeScoreSessionRef.current) {
                    console.info('[large-nav] render:retry-layout:start', { targetPage: clampedTarget });
                }
                const readyAfterRetry = await ensurePageIsLaidOut(score, clampedTarget);
                if (readyAfterRetry) {
                    rendered = await renderScore(score, clampedTarget);
                }
            }
            if (!rendered) {
                setCurrentPage(previousPage);
                if (largeScoreSessionRef.current) {
                    console.info('[large-nav] render:failed', { targetPage: clampedTarget, previousPage });
                }
                return;
            }
            if (largeScoreSessionRef.current) {
                console.info('[large-nav] render:done', { targetPage: clampedTarget });
            }
            refreshSelectionOverlay(selectedIndex, selectedPoint);
        } catch (err) {
            console.error('Failed to change page:', err);
        } finally {
            pageNavigationInFlightRef.current = false;
        }
    };

    const handlePrevPage = () => {
        if (currentPage <= 0) {
            return;
        }
        void goToPage(currentPage - 1);
    };

    const handleNextPage = () => {
        const atKnownEnd = currentPage >= pageCount - 1;
        if (atKnownEnd && !(progressivePagingActive && progressiveHasMorePages)) {
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
            playSelectionPreview?: boolean;
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
        const shouldPlaySelectionPreview = Boolean(options?.playSelectionPreview);

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

            if (shouldPlaySelectionPreview) {
                void playSelectionPreview(`mutation:${label}`, preservedPoint ?? undefined, { reselect: true });
            }

            // Schedule overlay refresh after the DOM has had time to update
            // Use a double-RAF to ensure the DOM is fully parsed and rendered
            // Pass preserved values to handle async state updates
            const fallbackIndex = allowSelectionFallback ? preservedIndex : null;
            const fallbackPoint = allowSelectionFallback ? preservedPoint : null;
            const advanceSelection = options?.advanceSelection;
            const advanceStep = options?.advanceSelectionStep ?? 1;

            // Skip overlay refresh for multi-selections (measure selections with backend highlighting)
            // These don't add .selected classes to DOM, so refreshSelectionOverlay would clear them
            if (preservedMultiSelection) {
                console.log('[performMutation] Skipping overlay refresh for multi-selection (backend highlighting)');
                return;
            }

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
        // Don't call ensureSelectionInWasm - it would replace multi-selections with single element
        const fn = requireMutation('pitchUp');
        if (!fn) return;
        return fn();
    }, { playSelectionPreview: true });
    const handlePitchDown = () => performMutation('lower pitch', async () => {
        // Don't call ensureSelectionInWasm - it would replace multi-selections with single element
        const fn = requireMutation('pitchDown');
        if (!fn) return;
        return fn();
    }, { playSelectionPreview: true });
    const handleTranspose = (semitones: number) => performMutation(`transpose ${semitones}`, async () => {
        const fn = requireMutation('transpose');
        if (!fn) return;
        return fn(semitones);
    }, { skipWasmReselect: true, playSelectionPreview: true });
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
            void playSelectionPreview('select-next-chord');
            return;
        }

        await refreshSelectionFromSvg();
        void playSelectionPreview('select-next-chord');
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
            void playSelectionPreview('select-prev-chord');
            return;
        }

        await refreshSelectionFromSvg();
        void playSelectionPreview('select-prev-chord');
    };
    const handleExtendSelectionNextChord = async () => {
        if (!score) return;
        await ensureSelectionInWasm();
        const extendFn = requireMutation('extendSelectionNextChord');
        const getBBoxesFn = requireMutation('getSelectionBoundingBoxes');
        if (!extendFn || !getBBoxesFn) {
            return;
        }

        const result = await extendFn.call(score);
        if (result) {
            const bboxes = await getBBoxesFn.call(score);

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
        await ensureSelectionInWasm();
        const extendFn = requireMutation('extendSelectionPrevChord');
        const getBBoxesFn = requireMutation('getSelectionBoundingBoxes');
        if (!extendFn || !getBBoxesFn) {
            return;
        }

        const result = await extendFn.call(score);
        if (result) {
            const bboxes = await getBBoxesFn.call(score);

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
        }, { playSelectionPreview: true });
    };
    const handleDurationLonger = () => performMutation('lengthen duration', async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('doubleDuration');
        if (!fn) return;
        return fn();
    }, { playSelectionPreview: true });
    const handleDurationShorter = () => performMutation('shorten duration', async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('halfDuration');
        if (!fn) return;
        return fn();
    }, { playSelectionPreview: true });

    const handleToggleDot = () => performMutation('toggle dot', async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('toggleDot');
        if (!fn) return;
        return fn();
    }, { playSelectionPreview: true });

    const handleToggleDoubleDot = () => performMutation('toggle double dot', async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('toggleDoubleDot');
        if (!fn) return;
        return fn();
    }, { playSelectionPreview: true });

    const handleSetDurationType = (durationType: number) => performMutation('set duration', async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('setDurationType');
        if (!fn) return;
        return fn(durationType);
    }, { playSelectionPreview: true });

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
            playSelectionPreview: true,
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
    }, { playSelectionPreview: true });

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
            const svg = await runSerializedScoreOperation(
                () => score.saveSvg(0, true),
                'saveSvg(export)',
            );
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
            const ok = await ensureSoundFontLoaded(undefined, { forceRetry: true });
            if (!ok) {
                alert('No default soundfont found. Configure NEXT_PUBLIC_SOUNDFONT_CDN_URL or provide /public/soundfonts/default.sf3 (or .sf2).');
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

    const stopSynthStream = async (
        sourcesRef: React.MutableRefObject<AudioBufferSourceNode[]>,
        iteratorRef: React.MutableRefObject<((cancel?: boolean) => Promise<any>) | null>,
        options?: { awaitCancel?: boolean },
    ) => {
        sourcesRef.current.forEach(src => {
            try {
                src.stop();
            } catch (_) {
                // ignore
            }
        });
        sourcesRef.current = [];
        const iter = iteratorRef.current;
        iteratorRef.current = null;
        if (iter) {
            const cancelPromise = iter(true).catch(() => { /* ignore */ });
            if (options?.awaitCancel) {
                await cancelPromise;
            }
        }
    };

    const stopPreviewAudio = async (options?: { awaitCancel?: boolean }) => {
        previewPlaybackGenerationRef.current += 1;
        await stopSynthStream(previewAudioSourcesRef, previewStreamIteratorRef, options);
    };

    const stopAudio = async (options?: { awaitCancel?: boolean }) => {
        transportPlaybackGenerationRef.current += 1;
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }
        await stopSynthStream(audioSourcesRef, streamIteratorRef, options);
        await stopPreviewAudio(options);
        setIsPlaying(false);
    };

    const ensureAudioContextReady = async () => {
        const audioCtx = audioCtxRef.current || new AudioContext({ sampleRate: 44100 });
        audioCtxRef.current = audioCtx;
        if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }
        return audioCtx;
    };

    const playSynthBatchStream = async (
        batchFn: SynthBatchIterator,
        options: {
            sourcesRef: React.MutableRefObject<AudioBufferSourceNode[]>;
            iteratorRef: React.MutableRefObject<((cancel?: boolean) => Promise<any>) | null>;
            generationRef: React.MutableRefObject<number>;
            maxDurationSeconds?: number;
            trackTransportState: boolean;
        },
    ) => {
        const audioCtx = await ensureAudioContextReady();
        const generation = ++options.generationRef.current;
        options.iteratorRef.current = batchFn;
        const baseTime = audioCtx.currentTime + SYNTH_START_PREROLL_SECONDS;
        let streamStartTimeSeconds: number | null = null;
        let lastSource: AudioBufferSourceNode | null = null;
        let startedAny = false;

        while (options.generationRef.current === generation) {
            const batch = await batchFn(false);
            if (!Array.isArray(batch) || batch.length === 0) {
                break;
            }

            let hitDone = false;
            for (const res of batch) {
                if (!res) continue;
                const absoluteChunkStart = Number.isFinite(res.startTime) ? Number(res.startTime) : 0;
                if (streamStartTimeSeconds === null) {
                    streamStartTimeSeconds = absoluteChunkStart;
                }
                const relativeChunkStart = Math.max(0, absoluteChunkStart - streamStartTimeSeconds);

                if (res.done) {
                    hitDone = true;
                }
                const relativeChunkEnd = typeof res.endTime === 'number'
                    ? Math.max(0, res.endTime - streamStartTimeSeconds)
                    : null;
                if (options.maxDurationSeconds && typeof relativeChunkEnd === 'number' && relativeChunkEnd >= options.maxDurationSeconds) {
                    hitDone = true;
                }

                const floats = new Float32Array(res.chunk.buffer, res.chunk.byteOffset, res.chunk.byteLength / 4);
                const framesPerChannel = 512;
                let channels = Math.floor(floats.length / framesPerChannel);
                if (!Number.isInteger(channels) || channels < 1) channels = 1;
                if (channels > 2) channels = 2;
                const buffer = audioCtx.createBuffer(channels, framesPerChannel, audioCtx.sampleRate);
                for (let ch = 0; ch < channels; ch++) {
                    const start = ch * framesPerChannel;
                    const slice = floats.subarray(start, start + framesPerChannel);
                    buffer.copyToChannel(slice, ch);
                }
                const source = audioCtx.createBufferSource();
                source.buffer = buffer;
                source.connect(audioCtx.destination);
                source.start(baseTime + relativeChunkStart);
                options.sourcesRef.current.push(source);
                lastSource = source;
                startedAny = true;
                if (options.trackTransportState) {
                    setIsPlaying(true);
                }

                if (hitDone) break;
            }

            if (hitDone) {
                break;
            }
        }

        if (!startedAny || options.generationRef.current !== generation) {
            stopSynthStream(options.sourcesRef, options.iteratorRef);
            if (options.trackTransportState) {
                setIsPlaying(false);
            }
            return;
        }

        if (lastSource) {
            lastSource.onended = () => {
                if (options.generationRef.current !== generation) {
                    return;
                }
                options.sourcesRef.current = [];
                options.iteratorRef.current = null;
                if (options.trackTransportState) {
                    setIsPlaying(false);
                }
            };
        }
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

    const playTransportAudio = async (fromSelection: boolean) => {
        if (!score || !score.saveAudio) {
            alert('Audio playback is not available in this build.');
            return;
        }
        try {
            setAudioBusy(true);
            const ok = await ensureSoundFontLoaded(undefined, { forceRetry: true });
            if (!ok) {
                alert('No default soundfont found. Configure NEXT_PUBLIC_SOUNDFONT_CDN_URL or provide /public/soundfonts/default.sf3 (or .sf2).');
                return;
            }
            await stopAudio({ awaitCancel: true });

            const useSelectionStreaming = fromSelection && typeof score.synthAudioBatchFromSelection === 'function';
            const useStreaming = fromSelection
                ? useSelectionStreaming
                : typeof (score as any).synthAudioBatch === 'function';
            let streamed = false;
            let streamFailure: unknown = null;
            if (useStreaming) {
                try {
                    const batchFn = useSelectionStreaming
                        ? await score.synthAudioBatchFromSelection!(SELECTION_SYNTH_BATCH_SIZE) as SynthBatchIterator
                        : await (score as any).synthAudioBatch(0, TRANSPORT_SYNTH_BATCH_SIZE) as SynthBatchIterator;

                    await playSynthBatchStream(batchFn, {
                        sourcesRef: audioSourcesRef,
                        iteratorRef: streamIteratorRef,
                        generationRef: transportPlaybackGenerationRef,
                        trackTransportState: true,
                    });
                    streamed = true;
                } catch (streamErr) {
                    console.warn('Streaming playback failed; falling back to WAV', streamErr);
                    streamFailure = streamErr;
                    await stopAudio({ awaitCancel: true });
                }
            }
            if (!streamed) {
                if (fromSelection) {
                    const hasSelectionStreamingApi = typeof score.synthAudioBatchFromSelection === 'function';
                    if (!hasSelectionStreamingApi) {
                        alert('Play from selection is not available in this running build. Rebuild webmscore JS glue (`cd webmscore-fork/web-public && npm run bundle`) and restart `npm run dev`.');
                    } else if (streamFailure) {
                        const streamMessage = streamFailure instanceof Error
                            ? streamFailure.message
                            : String(streamFailure);
                        alert(`Play from selection failed: ${streamMessage}`);
                    } else {
                        alert('Play from selection is not available in this build.');
                    }
                    return;
                }
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
            await stopAudio({ awaitCancel: true });
        } finally {
            setAudioBusy(false);
        }
    };

    const playSelectionPreview = async (
        trigger: string = 'unknown',
        selectionPoint?: { page: number, x: number, y: number },
        options?: { reselect?: boolean },
    ) => {
        const activeScore = scoreRef.current ?? score;
        if (!activeScore || !activeScore.synthSelectionPreviewBatch || isPlaying || audioBusy) {
            console.debug('[AUDITION] skipped preview request', {
                trigger,
                hasScore: Boolean(activeScore),
                hasPreviewApi: Boolean(activeScore?.synthSelectionPreviewBatch),
                isPlaying,
                audioBusy,
            });
            return;
        }

        const shouldReselectForPreview = options?.reselect ?? trigger.startsWith('mutation:');
        const previewPoint = selectionPoint ?? selectedPointRef.current;
        if (shouldReselectForPreview && previewPoint && activeScore.selectElementAtPoint) {
            try {
                const selected = await activeScore.selectElementAtPoint(previewPoint.page, previewPoint.x, previewPoint.y);
                if (selected === false) {
                    console.warn('[AUDITION] preview reselection returned false', {
                        trigger,
                        page: previewPoint.page,
                        x: previewPoint.x,
                        y: previewPoint.y,
                    });
                }
            } catch (err) {
                console.warn('[AUDITION] preview reselection failed', { trigger, err });
            }
        }

        const ok = await ensureSoundFontLoaded(activeScore, { forceRetry: true });
        if (!ok) {
            console.warn('[AUDITION] skipped preview: soundfont unavailable', { trigger });
            return;
        }

        await stopPreviewAudio({ awaitCancel: true });
        try {
            console.debug('[AUDITION] requesting preview stream', {
                trigger,
                batchSize: PREVIEW_SYNTH_BATCH_SIZE,
                durationMs: PREVIEW_DURATION_MS,
            });
            const batchFn = await activeScore.synthSelectionPreviewBatch(PREVIEW_SYNTH_BATCH_SIZE, PREVIEW_DURATION_MS) as SynthBatchIterator;
            await playSynthBatchStream(batchFn, {
                sourcesRef: previewAudioSourcesRef,
                iteratorRef: previewStreamIteratorRef,
                generationRef: previewPlaybackGenerationRef,
                maxDurationSeconds: 0.6,
                trackTransportState: false,
            });
            console.debug('[AUDITION] preview playback started', { trigger });
        } catch (err) {
            console.warn('[AUDITION] selection preview playback failed', { trigger, err });
            await stopPreviewAudio({ awaitCancel: true });
        }
    };

    const handlePlayAudio = async () => {
        await playTransportAudio(false);
    };

    const handlePlayFromSelectionAudio = async () => {
        await playTransportAudio(true);
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

    const resolvePageIndex = (element: Element | null): number => {
        const extracted = extractPageIndex(element);
        if (extracted === null) {
            return currentPageRef.current;
        }
        if (extracted === 0 && currentPageRef.current > 0) {
            return currentPageRef.current;
        }
        return extracted;
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
                const pageIndex = resolvePageIndex(el);
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

        const clearSelectionState = () => {
            setSelectedElement(null);
            setSelectionBoxes([]);
            setSelectedPoint(null);
            setSelectedIndex(null);
            setSelectedElementClasses('');
            setSelectedLayoutBreakSubtype(null);
            setHasBackendHighlighting(false);
            const refreshAfterClear = () => renderScore(score, currentPage, false);
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
            } else {
                refreshAfterClear();
            }
        };

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
            if (score?.selectMeasureAtPoint || score?.selectElementAtPoint) {
                const scorePoint = clientToScorePoint(e.clientX, e.clientY);
                if (!scorePoint) {
                    clearSelectionState();
                    return;
                }
                const pageIndex = resolvePageIndex(target);
                const fallback: SelectionFallback = {
                    index: null,
                    point: { page: pageIndex, x: scorePoint.x, y: scorePoint.y },
                };

                // Try selectElementAtPoint first, then fall back to selectMeasureAtPoint
                const trySelect = async () => {
                    if (score.selectElementAtPoint) {
                        const elementSelected = await score.selectElementAtPoint(pageIndex, scorePoint.x, scorePoint.y);
                        if (elementSelected) {
                            return true;
                        }
                    }

                    // If no element was selected, try selecting the measure
                    if (score.selectMeasureAtPoint) {
                        const measureSelected = await score.selectMeasureAtPoint(pageIndex, scorePoint.x, scorePoint.y);
                        return measureSelected;
                    }

                    return false;
                };

                trySelect()
                    .then(async (selected) => {
                        if (selected === false) {
                            clearSelectionState();
                            return;
                        }

                        // Get selection bounding boxes for keyboard/button enablement
                        let hasMeasureSelection = false;
                        if (score.getSelectionBoundingBoxes) {
                            try {
                                const bboxes = await score.getSelectionBoundingBoxes();
                                if (bboxes && bboxes.length > 0) {
                                    hasMeasureSelection = true;
                                    // Set boxes for state tracking (keyboard shortcuts, button states)
                                    // Set backend highlighting flag to skip visual rendering (backend handles it)
                                    const boxes: SelectionBox[] = bboxes.map((bb: any, index: number) => {
                                        const x = typeof bb?.x === 'number' ? bb.x : 0;
                                        const y = typeof bb?.y === 'number' ? bb.y : 0;
                                        const w = typeof bb?.w === 'number'
                                            ? bb.w
                                            : (typeof bb?.width === 'number' ? bb.width : 0);
                                        const h = typeof bb?.h === 'number'
                                            ? bb.h
                                            : (typeof bb?.height === 'number' ? bb.height : 0);
                                        const page = typeof bb?.page === 'number' ? bb.page : pageIndex;
                                        return {
                                            index: typeof bb?.index === 'number' ? bb.index : index,
                                            page,
                                            x,
                                            y,
                                            w,
                                            h,
                                            centerX: x + (w / 2),
                                            centerY: y + (h / 2),
                                            classes: typeof bb?.classes === 'string' && bb.classes.trim()
                                                ? bb.classes
                                                : 'Measure',
                                        };
                                    });
                                    setSelectionBoxes(boxes);
                                    setHasBackendHighlighting(true);
                                }
                            } catch (err) {
                                console.warn('[ScoreEditor] Failed to get selection bounding boxes:', err);
                            }
                        }

                        // Render with backend highlighting
                        // For measure selections, skip overlay refresh to preserve selectionBoxes state
                        if (hasMeasureSelection) {
                            await renderScore(score, pageIndex);
                            void playSelectionPreview('selection-click:measure', fallback.point);
                        } else {
                            // For single element selections, use normal flow with overlay
                            setHasBackendHighlighting(false);
                            await refreshSelectionFromSvg();
                            void playSelectionPreview('selection-click:element', fallback.point, { reselect: true });
                        }
                    })
                    .catch(err => {
                        console.warn('selectMeasureAtPoint/selectElementAtPoint not available or failed:', err);
                        clearSelectionState();
                    });
                return;
            }
            clearSelectionState();
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
            const pageIndex = resolvePageIndex(targetElement);
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

            if (selectionPromise !== undefined) {
                Promise.resolve(selectionPromise)
                    .then((selected) => {
                        if (selected === false) {
                            throw new Error('selectElementAtPoint returned false');
                        }
                        return refreshSelectionFromSvg(fallback);
                    })
                    .then(() => {
                        void playSelectionPreview(
                            'selection-click:element',
                            fallback.point,
                            { reselect: !additiveSelection && !isShiftClick },
                        );
                    })
                    .catch(err => {
                        console.warn('selectElementAtPoint not available or failed:', err);
                        setSelectedElement(null);
                        setSelectionBoxes([]);
                        setSelectedPoint(null);
                        setSelectedIndex(null);
                        setSelectedElementClasses('');
                        setSelectedLayoutBreakSubtype(null);
                    });
            }

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
    const primarySelectionRect = selectedElement
        ? { x: selectedElement.x, y: selectedElement.y, w: selectedElement.w, h: selectedElement.h }
        : selectionBoxes.length === 1
            ? {
                x: selectionBoxes[0].x,
                y: selectionBoxes[0].y,
                w: selectionBoxes[0].w,
                h: selectionBoxes[0].h,
            }
            : null;
    const textSelectionActive = hasTextElementClass(selectedElementClasses) || Boolean(textEditorPosition);
    const selectedTextControlDisabled = !mutationEnabled || !score?.setSelectedText;
    const checkpointControlsDisabled = checkpointBusy || checkpointLoading;
    const checkpointSaveDisabled = checkpointControlsDisabled || !score || !score?.saveXml;
    const checkpointCompareDisabled = checkpointControlsDisabled || !score;
    const xmlControlsDisabled = xmlLoading || !score || !score?.saveXml;
    const xmlApplyEnabled = !xmlControlsDisabled && xmlDirty;
    const xmlReloadEnabled = !xmlControlsDisabled && scoreDirtySinceXml;
    const xmlApplyDisabled = !xmlApplyEnabled;
    const xmlEditorHeight = xmlSidebarMode === 'full' ? '55vh' : '45vh';
    const xmlEditorMaxHeight = xmlSidebarMode === 'full' ? '65vh' : '55vh';

    const MIN_SIDEBAR_WIDTH = 280; // minimum resizable width
    const MAX_SIDEBAR_WIDTH = 800; // maximum resizable width

    const handleSidebarResizeStart = useCallback((e: React.MouseEvent) => {
        if (xmlSidebarMode !== 'open') return;
        e.preventDefault();
        setIsResizingSidebar(true);
        sidebarResizeStartXRef.current = e.clientX;
        sidebarResizeStartWidthRef.current = xmlSidebarWidth;
    }, [xmlSidebarMode, xmlSidebarWidth]);

    useEffect(() => {
        if (!isResizingSidebar) return;

        const handleMouseMove = (e: MouseEvent) => {
            const delta = sidebarResizeStartXRef.current - e.clientX;
            const newWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, sidebarResizeStartWidthRef.current + delta));
            setXmlSidebarWidth(newWidth);
        };

        const handleMouseUp = () => {
            setIsResizingSidebar(false);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isResizingSidebar]);
    const aiOutputValidation = aiOutput.trim()
        ? aiPatchError
            ? { valid: false, message: aiPatchError }
            : aiPatch
                ? { valid: true, message: `${aiPatch.ops.length} ops ready` }
                : { valid: false, message: 'AI output is not a valid patch.' }
        : { valid: true, message: '' };
    const aiModelHint = useMemo(() => {
        const trimmed = aiModel.trim();
        if (!trimmed) {
            return null;
        }
        const providerHint = AI_PROVIDER_CONFIGS[aiProvider].modelHint;
        if (providerHint && !providerHint.pattern.test(trimmed)) {
            return providerHint.message;
        }
        return null;
    }, [aiModel, aiProvider]);
    const aiApplyDisabled = xmlControlsDisabled || !aiPatchedXml.trim() || Boolean(aiPatchError);
    const patchEditorHeight = '35vh';
    const patchEditorMaxHeight = '45vh';

    return (
        <div className="flex flex-col h-screen">
            {!isEmbedMode && (
            <div className="relative" style={{ zIndex: 100 }} ref={toolbarRef}>
	            <Toolbar
                    onNewScore={handleOpenNewScoreDialog}
	                onFileUpload={handleLoadScoreUpload}
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
                onPlayFromSelectionAudio={handlePlayFromSelectionAudio}
                onStopAudio={() => { void stopAudio({ awaitCancel: true }); }}
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
            )}

            <div className="flex flex-1 min-h-0">
                {!isEmbedMode && (
                <aside
                    className={`shrink-0 border-r bg-white text-sm ${
                        xmlSidebarMode === 'full' ? 'hidden' : checkpointsCollapsed ? 'w-12' : 'w-72'
                    } ${checkpointsCollapsed ? '' : 'overflow-y-auto'}`}
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
                )}

                <div
                    ref={scrollContainerRef}
                    className={`relative z-0 flex-1 overflow-auto bg-gray-50 p-8 ${xmlSidebarMode === 'full' ? 'hidden' : ''}`}
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
                        <button
                            type="button"
                            onClick={() => setProgressiveLoadEnabled((prev) => !prev)}
                            className="px-2 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50"
                            title="Applies to future score loads"
                        >
                            Progressive load: {progressiveLoadEnabled ? 'On' : 'Off'}
                        </button>
                        <span data-testid="page-indicator">
                            Page {currentPage + 1} of {progressivePagingActive && progressiveHasMorePages ? `${pageCount}+` : pageCount}
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
                            disabled={currentPage >= pageCount - 1 && !(progressivePagingActive && progressiveHasMorePages)}
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
                    {secondarySelectionBoxes.map((box, index) => (
                        <div
                            key={index}
                            className="absolute pointer-events-none"
                            style={{
                                left: box.x,
                                top: box.y,
                                width: box.w,
                                height: box.h
                            }}
                        />
                    ))}

                    {primarySelectionRect && !overlaySuppressed && selectionBoxes.length <= 1 && (
                        <div
                            data-testid="selection-overlay"
                            className="absolute pointer-events-none border-2 border-blue-600"
                            style={{
                                left: primarySelectionRect.x,
                                top: primarySelectionRect.y,
                                width: primarySelectionRect.w,
                                height: primarySelectionRect.h
                            }}
                        />
                    )}
                    {selectionBoxes.length > 1 && !overlaySuppressed && !hasBackendHighlighting && selectionBoxes.map((box, index) => (
                        <div
                            key={index}
                            data-testid={`selection-overlay-${index}`}
                            className={`absolute pointer-events-none ${
                                box.isMeasureBbox
                                    ? 'border border-blue-400/50'
                                    : 'bg-blue-200/40 border border-blue-400/60'
                            }`}
                            style={{
                                left: box.x,
                                top: box.y,
                                width: box.w,
                                height: box.h
                            }}
                        />
                    ))}
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
                className={`shrink-0 border-l bg-white text-sm flex ${
                    xmlSidebarMode === 'closed'
                        ? 'w-12'
                        : xmlSidebarMode === 'full'
                            ? 'flex-1 w-full max-w-full'
                            : ''
                }`}
                style={xmlSidebarMode === 'open' ? { width: `${xmlSidebarWidth}px` } : undefined}
                data-testid="xml-sidebar"
            >
                {/* Resize Handle Container */}
                {xmlSidebarMode === 'open' && (
                    <div
                        className="shrink-0 cursor-ew-resize bg-slate-300 hover:bg-blue-500 transition-colors border-r border-slate-400 hover:border-blue-700 flex items-center justify-center"
                        style={{ width: '24px' }}
                        onMouseDown={handleSidebarResizeStart}
                        title="Drag to resize sidebar"
                        data-testid="sidebar-resize-handle"
                    >
                        {/* Vertical grip icon (three vertical bars with rounded ends) */}
                        <svg width="14" height="24" viewBox="0 0 14 24" fill="none" className="pointer-events-none">
                            {/* Left bar */}
                            <rect x="2" y="2" width="3" height="20" rx="1.5" fill="#475569" />
                            {/* Middle bar */}
                            <rect x="5.5" y="2" width="3" height="20" rx="1.5" fill="#475569" />
                            {/* Right bar */}
                            <rect x="9" y="2" width="3" height="20" rx="1.5" fill="#475569" />
                        </svg>
                    </div>
                )}
                {/* Sidebar Content */}
                <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
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
                                    {aiEnabled && (
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
                                    )}
                                </div>
                                <label className="flex items-center gap-2">
                                    <span className="text-[11px] uppercase tracking-wide text-gray-500">Theme</span>
                                    <select
                                        value={codeEditorTheme}
                                        onChange={(event) => setCodeEditorTheme(event.target.value as CodeEditorThemeMode)}
                                        className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700"
                                        data-testid="select-code-editor-theme"
                                    >
                                        {CODE_EDITOR_THEME_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                        </div>
                    )}
                </div>
                {xmlSidebarMode !== 'closed' && (
                    <div id="xml-sidebar-content" className="flex-1 overflow-y-auto pb-4 px-4">
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
                                        language="xml"
                                        height={xmlEditorHeight}
                                        maxHeight={xmlEditorMaxHeight}
                                        themeMode={codeEditorTheme}
                                    />
                                </div>
                            </>
                        )}
                        {xmlSidebarTab === 'assistant' && aiEnabled && (
                            <div className="mt-3 space-y-3 text-sm text-gray-700">
                                <div>
                                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                        Provider
                                    </label>
                                    <select
                                        value={aiProvider}
                                        onChange={(event) => setAiProvider(event.target.value as AiProvider)}
                                        className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                    >
                                        {(Object.keys(AI_PROVIDER_LABELS) as AiProvider[]).map((provider) => (
                                            <option key={provider} value={provider}>
                                                {AI_PROVIDER_LABELS[provider]}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                        Model
                                    </label>
                                    <input
                                        list="ai-models"
                                        value={aiModel}
                                        onChange={(event) => setAiModel(event.target.value)}
                                        className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                        placeholder="Enter model name"
                                    />
                                    <datalist id="ai-models">
                                        {aiModels.map((modelId) => (
                                            <option key={modelId} value={modelId} />
                                        ))}
                                    </datalist>
                                    {aiModelsLoading && (
                                        <div className="mt-1 text-[11px] text-gray-500">
                                            Loading models...
                                        </div>
                                    )}
                                    {!aiModelsLoading && !aiModels.length && !aiModelsError && (
                                        <div className="mt-1 text-[11px] text-gray-500">
                                            No models loaded. Enter a model name manually.
                                        </div>
                                    )}
                                    {aiModelsError && (
                                        <div className="mt-1 text-xs text-red-600">
                                            {aiModelsError}
                                        </div>
                                    )}
                                    {aiModelHint && (
                                        <div className="mt-1 text-[11px] text-amber-600">
                                            {aiModelHint}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                        API Key ({AI_PROVIDER_LABELS[aiProvider]})
                                    </label>
                                    <input
                                        type="password"
                                        value={aiApiKey}
                                        onChange={(event) => setAiApiKey(event.target.value)}
                                        className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                        placeholder="Paste your key"
                                    />
                                    <div className="mt-1 text-[11px] text-gray-500">
                                        Stored locally in this browser. Requests are sent directly unless a proxy is configured.
                                    </div>
                                    {AI_PROVIDER_CONFIGS[aiProvider].apiKeyUrl && (
                                        <div className="mt-1 text-[11px]">
                                            <a
                                                href={AI_PROVIDER_CONFIGS[aiProvider].apiKeyUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-blue-600 hover:text-blue-700 hover:underline"
                                            >
                                                Create {AI_PROVIDER_LABELS[aiProvider]} API key
                                            </a>
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-2 rounded border border-gray-200 bg-gray-50/70 p-3">
                                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                        Music Specialists (BYO Hugging Face)
                                    </div>
                                    <div>
                                        <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            Hugging Face Token
                                        </label>
                                        <input
                                            type="password"
                                            value={musicHfToken}
                                            onChange={(event) => setMusicHfToken(event.target.value)}
                                            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                            placeholder="hf_..."
                                        />
                                        <div className="mt-1 text-[11px] text-gray-500">
                                            Stored locally in this browser. Used for `NotaGen` and `ChatMusician` via `/api/music/*`.
                                        </div>
                                        <div className="mt-1 text-[11px]">
                                            <a
                                                href={HUGGING_FACE_TOKENS_URL}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-blue-600 hover:text-blue-700 hover:underline"
                                            >
                                                Create Hugging Face token
                                            </a>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 gap-2">
                                        <div>
                                            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                                NotaGen Model
                                            </label>
                                            <input
                                                type="text"
                                                value={musicNotaGenModelId}
                                                onChange={(event) => setMusicNotaGenModelId(event.target.value)}
                                                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                                placeholder="e.g. manoskary/NotaGenX-Quantized"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                                NotaGen Revision (optional)
                                            </label>
                                            <input
                                                type="text"
                                                value={musicNotaGenRevision}
                                                onChange={(event) => setMusicNotaGenRevision(event.target.value)}
                                                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                                placeholder="main or commit sha"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                                ChatMusician Model
                                            </label>
                                            <input
                                                type="text"
                                                value={musicChatMusicianModelId}
                                                onChange={(event) => setMusicChatMusicianModelId(event.target.value)}
                                                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                                placeholder="HF model id"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                                ChatMusician Revision (optional)
                                            </label>
                                            <input
                                                type="text"
                                                value={musicChatMusicianRevision}
                                                onChange={(event) => setMusicChatMusicianRevision(event.target.value)}
                                                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                                placeholder="main or commit sha"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-xs">
                                        <button
                                            type="button"
                                            onClick={() => setAiMode('patch')}
                                            className={`rounded border px-2 py-1 ${aiMode === 'patch' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                                        >
                                            Patch
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setAiMode('chat')}
                                            className={`rounded border px-2 py-1 ${aiMode === 'chat' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                                        >
                                            Chat
                                        </button>
                                        <div className="ml-auto flex items-center gap-2 text-xs text-gray-600">
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
                                    <div className="space-y-2 text-xs text-gray-600">
                                        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                            Context
                                        </div>
                                        <div className="flex flex-col items-start gap-y-2">
                                            <label className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    checked={aiIncludeSelection}
                                                    onChange={(event) => setAiIncludeSelection(event.target.checked)}
                                                />
                                                Include selection
                                            </label>
                                            <label className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    checked={aiIncludePage}
                                                    onChange={(event) => setAiIncludePage(event.target.checked)}
                                                />
                                                Include current page
                                            </label>
                                            <label className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    checked={aiIncludeRenderedImage}
                                                    onChange={(event) => setAiIncludeRenderedImage(event.target.checked)}
                                                    disabled={!aiProviderCapabilities.supportsRenderedImageContext}
                                                />
                                                Include rendered image
                                            </label>
                                            <label className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    checked={aiIncludePdf}
                                                    onChange={(event) => setAiIncludePdf(event.target.checked)}
                                                    disabled={!aiProviderCapabilities.supportsPdfContext}
                                                />
                                                Include score PDF
                                            </label>
                                            <label className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    checked={aiIncludeChat}
                                                    onChange={(event) => setAiIncludeChat(event.target.checked)}
                                                />
                                                Include chat
                                            </label>
                                            <label className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    checked={aiIncludeXml}
                                                    onChange={(event) => setAiIncludeXml(event.target.checked)}
                                                />
                                                Include MusicXML text
                                            </label>
                                        </div>
                                        {aiIncludeRenderedImage && !score?.savePng && (
                                            <div className="text-[11px] text-amber-600">
                                                PNG capture is not available in this build. The request will continue without image context.
                                            </div>
                                        )}
                                        {!aiProviderCapabilities.supportsRenderedImageContext && (
                                            <div className="text-[11px] text-gray-500">
                                                {AI_PROVIDER_LABELS[aiProvider]} image attachments are disabled in this integration.
                                            </div>
                                        )}
                                        {!aiProviderCapabilities.supportsPdfContext && (
                                            <div className="text-[11px] text-gray-500">
                                                {AI_PROVIDER_LABELS[aiProvider]} PDF attachments are not yet enabled in this integration.
                                            </div>
                                        )}
                                        {aiIncludePdf && (
                                            <div className="text-[11px] text-gray-500">
                                                PDF context is generated from the current score and attached when available.
                                            </div>
                                        )}
                                    </div>
                                    {aiMode === 'patch' ? (
                                        <div className="space-y-2">
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
                                                    <button
                                                        type="button"
                                                        onClick={handleApplyAiOutput}
                                                        disabled={aiApplyDisabled}
                                                        title="Applying edits will auto-checkpoint if the score has unsaved changes."
                                                        className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        Apply Patch
                                                    </button>
                                                    <CodeMirrorEditor
                                                        value={aiOutput}
                                                        onChange={(nextValue) => {
                                                            void updateAiOutput(nextValue);
                                                        }}
                                                        readOnly={false}
                                                        language="json"
                                                        placeholderText="AI patch will appear here."
                                                        height={patchEditorHeight}
                                                        maxHeight={patchEditorMaxHeight}
                                                        themeMode={codeEditorTheme}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between text-xs text-gray-500">
                                                <span>Open Chat</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setAiChatMessages([])}
                                                    disabled={aiBusy || !aiChatMessages.length}
                                                    className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    Clear
                                                </button>
                                            </div>
                                            <div className="max-h-64 min-h-[140px] overflow-y-auto rounded border border-gray-200 bg-gray-50 p-2">
                                                {aiChatMessages.length ? (
                                                    <div className="space-y-2">
                                                        {aiChatMessages.map((message, index) => (
                                                            <div
                                                                key={`${message.role}-${index}-${message.text.slice(0, 12)}`}
                                                                className={`rounded px-2 py-1 text-xs ${message.role === 'assistant' ? 'bg-blue-50 text-blue-900' : 'bg-white text-gray-800'}`}
                                                            >
                                                                <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">
                                                                    {message.role === 'assistant' ? 'Assistant' : 'You'}
                                                                </span>
                                                                <div className="leading-relaxed">
                                                                    <ReactMarkdown
                                                                        remarkPlugins={[remarkGfm, remarkBreaks]}
                                                                        components={{
                                                                            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                                                                            ul: ({ children }) => <ul className="mb-2 list-disc pl-5 last:mb-0">{children}</ul>,
                                                                            ol: ({ children }) => <ol className="mb-2 list-decimal pl-5 last:mb-0">{children}</ol>,
                                                                            li: ({ children }) => <li className="mb-1 last:mb-0">{children}</li>,
                                                                            code: ({ className, children }) => {
                                                                                const languageClass = className ?? '';
                                                                                const isBlock = languageClass.includes('language-');
                                                                                if (isBlock) {
                                                                                    return (
                                                                                        <code className="block overflow-x-auto rounded bg-black/10 px-2 py-1 font-mono text-[11px]">
                                                                                            {children}
                                                                                        </code>
                                                                                    );
                                                                                }
                                                                                return (
                                                                                    <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-[11px]">
                                                                                        {children}
                                                                                    </code>
                                                                                );
                                                                            },
                                                                            pre: ({ children }) => <pre className="mb-2 overflow-x-auto rounded bg-black/5 p-2">{children}</pre>,
                                                                            hr: () => <hr className="my-2 border-gray-300/70" />,
                                                                        }}
                                                                    >
                                                                        {message.text}
                                                                    </ReactMarkdown>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="text-xs text-gray-500">
                                                        Start a conversation about this score. You can include this chat when generating patches.
                                                    </div>
                                                )}
                                            </div>
                                            <textarea
                                                value={aiChatInput}
                                                onChange={(event) => setAiChatInput(event.target.value)}
                                                rows={3}
                                                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                                placeholder="Ask a question or request guidance."
                                            />
                                            <button
                                                type="button"
                                                onClick={handleAiChatSend}
                                                disabled={aiBusy}
                                                className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {aiBusy ? 'Working...' : 'Send Message'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                                {aiError && (
                                    <div className="text-xs text-red-600">
                                        {aiError}
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
                </div>
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
                    className={isEmbedMode
                        ? "fixed inset-0 z-50 flex items-start justify-center overflow-hidden bg-gray-50"
                        : "fixed bottom-0 left-0 right-0 z-50 flex items-start justify-center overflow-hidden bg-black/40 p-6"}
                    style={isEmbedMode ? {} : compareOverlayStyle}
                    data-testid="checkpoint-compare-modal"
                >
                    <div
                        className={isEmbedMode
                            ? "flex min-h-0 w-full h-full flex-col gap-4 overflow-hidden bg-white"
                            : "flex min-h-0 w-full flex-col gap-4 overflow-hidden rounded bg-white p-4 shadow-lg"}
                        style={isEmbedMode ? {} : { maxHeight: compareModalMaxHeight, maxWidth: compareModalMaxWidth }}
                    >
                        {!isEmbedMode && (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="space-y-1">
                                <div className="text-sm font-semibold text-gray-800">
                                    Compare Checkpoint
                                </div>
                                <div className="text-xs text-gray-500">
                                    Current vs {compareView.title}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setCompareView(null)}
                                    className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                        )}
                        <div className={isEmbedMode ? "flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4" : "flex min-h-0 flex-1 flex-col gap-4 overflow-auto"}>
                            <div className="flex min-h-0 min-w-0 flex-1 overflow-x-auto">
                                <div className="flex min-h-0 min-w-[960px] flex-1 gap-4">
                                    <div className="flex min-h-0 min-w-0 flex-1 basis-0 flex-col gap-3">
                                        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            <div className="flex items-center gap-2">
                                                <span>{compareLeftLabel}</span>
                                                {!compareLeftIsCurrent && (
                                                    <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-normal text-blue-700">
                                                        Checkpoint
                                                    </span>
                                                )}
                                                {isEmbedMode && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenScoreInEditor('left')}
                                                        className="rounded border border-blue-500 bg-blue-50 px-2 py-0.5 text-[10px] font-normal text-blue-700 hover:bg-blue-100"
                                                        title="Open this score in the full editor"
                                                    >
                                                        📝 Open in Editor
                                                    </button>
                                                )}
                                            </div>
                                            {!isEmbedMode && (
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    value={compareLeftCheckpointLabel}
                                                    onChange={(e) => setCompareLeftCheckpointLabel(e.target.value)}
                                                    placeholder="Label (optional)"
                                                    className="w-32 rounded border border-gray-300 bg-white px-2 py-0.5 text-[10px] text-gray-700 placeholder-gray-400"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => handleSaveCompareCheckpoint('left')}
                                                    disabled={checkpointBusy}
                                                    className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[10px] font-normal text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                                                    title={compareLeftIsCurrent ? 'Save current score as checkpoint' : 'Save this checkpoint'}
                                                >
                                                    💾 Save checkpoint
                                                </button>
                                            </div>
                                            )}
                                        </div>
                                        <div className="flex min-h-0 flex-1 flex-col gap-3">
                                            <div
                                                ref={compareLeftScrollRef}
                                                className="relative min-h-0 min-w-0 flex-1 overflow-auto rounded border border-gray-200 bg-white"
                                                data-testid="compare-pane-left"
                                            >
                                                {!compareLeftScore && (
                                                    <div className="p-3 text-xs text-gray-500">
                                                        Load a score to compare.
                                                    </div>
                                                )}
                                            <div
                                                ref={compareLeftWrapperRef}
                                                className="relative origin-top-left"
                                                style={compareZoomStyle}
                                            >
                                                <div ref={compareLeftContainerRef} />
                                                <div className="pointer-events-none absolute inset-0 z-10">
                                                    {compareLeftHighlights.map((highlight) => (
                                                        <div
                                                            key={`compare-left-highlight-${highlight.id}`}
                                                            data-testid="compare-left-highlight"
                                                            className="absolute rounded-sm border-2"
                                                            style={{
                                                                left: `${highlight.left}px`,
                                                                top: `${highlight.top}px`,
                                                                width: `${highlight.width}px`,
                                                                height: `${highlight.height}px`,
                                                                backgroundColor: highlight.status === 'new-diff' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)',
                                                                borderColor: highlight.status === 'new-diff' ? 'rgb(16, 185, 129)' : 'rgb(244, 63, 94)',
                                                            }}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                            </div>
                                            <div className="grid gap-2 text-xs text-gray-500">
                                                {Array.from({ length: comparePartCount }).map((_, index) => {
                                                    const partName = compareLeftParts[index]?.name
                                                        || compareLeftParts[index]?.instrumentName
                                                        || `Part ${index + 1}`;
                                                    const alignment = compareAlignmentByPart.get(index);
                                                    const leftCount = alignment?.leftCount ?? 0;
                                                    const rightCount = alignment?.rightCount ?? 0;
                                                    return (
                                                    <div
                                                        key={`compare-left-part-${index}`}
                                                        className="flex items-center justify-between rounded border border-dashed border-gray-200 bg-white px-2 py-2"
                                                    >
                                                        <span>{partName}</span>
                                                        <span className="text-[10px] text-gray-400">
                                                            {leftCount}/{rightCount} measures
                                                        </span>
                                                    </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex min-h-0 w-44 flex-none flex-col items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={handleCompareSwapSides}
                                            className="rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
                                            title="Swap left and right panes"
                                        >
                                            ⇄ Swap
                                        </button>
                                        <div
                                            ref={compareGutterScrollRef}
                                            className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto rounded border border-gray-200 bg-gray-50 p-2 text-[10px] text-gray-500"
                                        >
                                            {compareAlignmentLoading && (
                                                <div className="rounded border border-dashed border-gray-200 bg-white px-2 py-2 text-center text-[10px] text-gray-400">
                                                    Aligning measures...
                                                </div>
                                            )}
                                            {!compareAlignmentLoading && Array.from({ length: comparePartCount }).map((_, index) => {
                                                const alignment = compareAlignmentByPart.get(index);
                                                const rows = alignment?.rows ?? [];
                                                const blocks = buildMismatchBlocks(rows);
                                                const partName = compareLeftParts[index]?.name
                                                    || compareLeftParts[index]?.instrumentName
                                                    || compareRightPartsDisplay[index]?.name
                                                    || compareRightPartsDisplay[index]?.instrumentName
                                                    || `Part ${index + 1}`;
                                                return (
                                                    <div
                                                        key={`compare-gutter-${index}`}
                                                        className="flex flex-col gap-2 rounded border border-dashed border-gray-200 bg-white px-2 py-2"
                                                    >
                                                        <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                                            <span>{partName}</span>
                                                        </div>
                                                        <div className="grid gap-2">
                                                            {rows.length === 0 && (
                                                                <div className="rounded border border-dashed border-gray-200 bg-gray-50 px-2 py-2 text-center text-[10px] text-gray-400">
                                                                    No measures
                                                                </div>
                                                            )}
                                                            {blocks.length === 0 && rows.length > 0 && (
                                                                <div className="text-center text-[10px] text-gray-400">
                                                                    No changes
                                                                </div>
                                                            )}
                                                            {blocks.length > 0 && (
                                                                <div
                                                                    className="relative w-full"
                                                                    style={{ height: `${compareGutterTrackHeight}px` }}
                                                                >
                                                                    {blocks.map((block, blockIndex) => {
                                                                const blockRows = rows.slice(block.start, block.end + 1);
                                                                const leftIndices = blockRows
                                                                    .map((row) => row.leftIndex)
                                                                    .filter((value): value is number => value !== null);
                                                                const rightIndices = blockRows
                                                                    .map((row) => row.rightIndex)
                                                                    .filter((value): value is number => value !== null);
                                                                const leftStart = leftIndices[0];
                                                                const leftEnd = leftIndices[leftIndices.length - 1];
                                                                const rightStart = rightIndices[0];
                                                                const rightEnd = rightIndices[rightIndices.length - 1];
                                                                const leftLabel = leftIndices.length
                                                                    ? `L${leftStart + 1}${leftEnd !== leftStart ? `–${leftEnd + 1}` : ''}`
                                                                    : 'L–';
                                                                const rightLabel = rightIndices.length
                                                                    ? `R${rightStart + 1}${rightEnd !== rightStart ? `–${rightEnd + 1}` : ''}`
                                                                    : 'R–';
                                                                const leftDiff = leftIndices.length > 0;
                                                                const rightDiff = rightIndices.length > 0;
                                                                const pairs = blockRows
                                                                    .map((row) => (row.leftIndex !== null && row.rightIndex !== null
                                                                    ? { leftIndex: row.leftIndex, rightIndex: row.rightIndex }
                                                                    : null))
                                                                    .filter((pair): pair is { leftIndex: number; rightIndex: number } => Boolean(pair));
                                                                const canOverwrite = pairs.length > 0;
                                                                const blockLayouts = blockRows.flatMap((row, rowOffset) => {
                                                                    const bounds: Array<{ top: number; height: number }> = [];
                                                                    if (row.leftIndex !== null && compareLeftBounds[row.leftIndex]) {
                                                                        bounds.push(compareLeftBounds[row.leftIndex]);
                                                                    }
                                                                    if (row.rightIndex !== null && compareRightBounds[row.rightIndex]) {
                                                                        bounds.push(compareRightBounds[row.rightIndex]);
                                                                    }
                                                                    if (bounds.length === 0) {
                                                                        const fallbackTop = compareHeaderSpacerHeight + (block.start + rowOffset) * compareGutterRowHeight;
                                                                        return [{ top: fallbackTop, height: compareGutterRowHeight }];
                                                                    }
                                                                    return bounds;
                                                                });
                                                                let blockTop = compareHeaderSpacerHeight + block.start * compareGutterRowHeight;
                                                                let blockHeight = (block.end - block.start + 1) * compareGutterRowHeight;
                                                                if (blockLayouts.length) {
                                                                    const minTop = Math.min(...blockLayouts.map((item) => item.top));
                                                                    const maxBottom = Math.max(...blockLayouts.map((item) => item.top + item.height));
                                                                    blockTop = minTop;
                                                                    blockHeight = Math.max(compareGutterRowHeight, maxBottom - minTop);
                                                                }
                                                                return (
                                                                    <div
                                                                        key={`compare-gutter-block-${index}-${blockIndex}`}
                                                                        className="absolute left-0 right-0 rounded border border-gray-200 bg-white px-2 py-2"
                                                                        style={{ top: `${blockTop}px`, height: `${blockHeight}px` }}
                                                                    >
                                                                        <div className="flex items-center justify-between text-[9px] text-gray-400">
                                                                            <span className={`rounded px-1 py-0.5 ${leftDiff ? 'bg-rose-100 text-rose-600' : ''}`}>
                                                                                {leftLabel}
                                                                            </span>
                                                                            <span className={`rounded px-1 py-0.5 ${rightDiff ? 'bg-emerald-100 text-emerald-600' : ''}`}>
                                                                                {rightLabel}
                                                                            </span>
                                                                        </div>
                                                                        {!isEmbedMode && canOverwrite && (
                                                                            <div className="mt-1 flex items-center justify-between gap-2">
                                                                                <button
                                                                                    type="button"
                                                                                    disabled={compareSwapBusy || !compareLeftScore || !compareRightScoreDisplay}
                                                                                    className="flex h-6 w-10 items-center justify-center rounded border border-gray-200 bg-gray-100 text-[10px] text-gray-500 disabled:opacity-50"
                                                                                    aria-label={`Overwrite right with ${leftLabel}`}
                                                                                    onClick={() => handleCompareOverwriteBlock(
                                                                                        compareLeftScore,
                                                                                        compareRightScoreDisplay,
                                                                                        index,
                                                                                        pairs,
                                                                                    )}
                                                                                >
                                                                                    -&gt;
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    disabled={compareSwapBusy || !compareLeftScore || !compareRightScoreDisplay}
                                                                                    className="flex h-6 w-10 items-center justify-center rounded border border-gray-200 bg-gray-100 text-[10px] text-gray-500 disabled:opacity-50"
                                                                                    aria-label={`Overwrite left with ${rightLabel}`}
                                                                                    onClick={() => handleCompareOverwriteBlock(
                                                                                        compareRightScoreDisplay,
                                                                                        compareLeftScore,
                                                                                        index,
                                                                                        pairs.map((pair) => ({
                                                                                            leftIndex: pair.rightIndex,
                                                                                            rightIndex: pair.leftIndex,
                                                                                        })),
                                                                                    )}
                                                                                >
                                                                                    &lt;-
                                                                                </button>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div className="flex min-h-0 min-w-0 flex-1 basis-0 flex-col gap-3">
                                        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            <div className="flex items-center gap-2">
                                                <span>{compareRightLabel}</span>
                                                {!compareRightIsCurrent && (
                                                    <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-normal text-blue-700">
                                                        Checkpoint
                                                    </span>
                                                )}
                                                {isEmbedMode && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenScoreInEditor('right')}
                                                        className="rounded border border-blue-500 bg-blue-50 px-2 py-0.5 text-[10px] font-normal text-blue-700 hover:bg-blue-100"
                                                        title="Open this score in the full editor"
                                                    >
                                                        📝 Open in Editor
                                                    </button>
                                                )}
                                            </div>
                                            {!isEmbedMode && (
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    value={compareRightCheckpointLabel}
                                                    onChange={(e) => setCompareRightCheckpointLabel(e.target.value)}
                                                    placeholder="Label (optional)"
                                                    className="w-32 rounded border border-gray-300 bg-white px-2 py-0.5 text-[10px] text-gray-700 placeholder-gray-400"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => handleSaveCompareCheckpoint('right')}
                                                    disabled={checkpointBusy}
                                                    className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[10px] font-normal text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                                                    title={compareRightIsCurrent ? 'Save current score as checkpoint' : 'Save this checkpoint'}
                                                >
                                                    💾 Save checkpoint
                                                </button>
                                            </div>
                                            )}
                                        </div>
                                        <div className="flex min-h-0 flex-1 flex-col gap-3">
                                            <div
                                                ref={compareRightScrollRef}
                                                className="relative min-h-0 min-w-0 flex-1 overflow-auto rounded border border-gray-200 bg-white"
                                                data-testid="compare-pane-right"
                                            >
                                                {(compareRightLoading || compareRightError || !compareRightScore) && (
                                                    <div className="absolute inset-0 flex items-center justify-center bg-white/80 p-3 text-xs text-gray-500">
                                                        {compareRightError ?? (compareRightLoading ? 'Loading checkpoint score...' : 'Score not loaded.')}
                                                    </div>
                                                )}
                                            <div
                                                ref={compareRightWrapperRef}
                                                className="relative origin-top-left"
                                                style={compareRightZoomStyle}
                                            >
                                                <div ref={compareRightContainerRef} />
                                                <div className="pointer-events-none absolute inset-0 z-10">
                                                    {compareRightHighlights.map((highlight) => (
                                                        <div
                                                            key={`compare-right-highlight-${highlight.id}`}
                                                            data-testid="compare-right-highlight"
                                                            className="absolute rounded-sm border-2"
                                                            style={{
                                                                left: `${highlight.left}px`,
                                                                top: `${highlight.top}px`,
                                                                width: `${highlight.width}px`,
                                                                height: `${highlight.height}px`,
                                                                backgroundColor: highlight.status === 'old-diff' ? 'rgba(244, 63, 94, 0.3)' : 'rgba(16, 185, 129, 0.3)',
                                                                borderColor: highlight.status === 'old-diff' ? 'rgb(244, 63, 94)' : 'rgb(16, 185, 129)',
                                                            }}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                            </div>
                                            <div className="grid gap-2 text-xs text-gray-500">
                                                {Array.from({ length: comparePartCount }).map((_, index) => {
                                                    const partName = compareRightPartsDisplay[index]?.name
                                                        || compareRightPartsDisplay[index]?.instrumentName
                                                        || `Part ${index + 1}`;
                                                    const alignment = compareAlignmentByPart.get(index);
                                                    const leftCount = alignment?.leftCount ?? 0;
                                                    const rightCount = alignment?.rightCount ?? 0;
                                                    return (
                                                    <div
                                                        key={`compare-right-part-${index}`}
                                                        className="flex items-center justify-between rounded border border-dashed border-gray-200 bg-white px-2 py-2"
                                                    >
                                                        <span>{partName}</span>
                                                        <span className="text-[10px] text-gray-400">
                                                            {leftCount}/{rightCount} measures
                                                        </span>
                                                    </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <details className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
                                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    Raw MusicXML
                                </summary>
                                <div className="mt-3 grid gap-4 md:grid-cols-2" style={{ height: 'calc(100vh - 300px)' }}>
                                    <div className="flex flex-col gap-2">
                                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            Current
                                        </span>
                                        <textarea
                                            readOnly
                                            value={compareView.currentXml}
                                            className="min-h-0 flex-1 w-full rounded border border-gray-200 bg-white p-2 font-mono text-xs text-gray-700"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            {compareView.title}
                                        </span>
                                        <textarea
                                            readOnly
                                            value={compareView.checkpointXml}
                                            className="min-h-0 flex-1 w-full rounded border border-gray-200 bg-white p-2 font-mono text-xs text-gray-700"
                                        />
                                    </div>
                                </div>
                            </details>
                        </div>
                    </div>
                </div>
            )}

            {isEmbedMode && checkpointBusy && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-white">
                    <div className="text-center">
                        <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600"></div>
                        <p className="text-sm text-gray-600">Loading comparison...</p>
                    </div>
                </div>
            )}
            </div>
        </div>
    );
}
