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
    resolveScoreEditorApiPath,
} from '../lib/score-editor-api-client';
import { appendMusicXmlParts } from '../lib/musicxml-append-parts';
import {
    extractTraceContextFromHeaders,
    getOrCreateEditorSessionId,
    trackEditorAnalyticsEvent,
} from '../lib/editor-analytics';
import {
    MMA_ARRANGEMENT_PRESETS,
    type MmaArrangementPreset,
} from '../lib/music-mma-presets';
import {
    DEFAULT_MMA_GROOVE,
    findMmaGrooveOption,
    MMA_GROOVE_OPTION_GROUPS,
} from '../lib/music-mma-grooves';

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

const asRecord = (value: unknown): Record<string, any> | null => (
    value && typeof value === 'object' ? value as Record<string, any> : null
);

type NotaGenSpaceCombinations = Record<string, Record<string, string[]>>;

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
    | 'setHarmonyVoiceLiteral'
    | 'setChordSymbolStylePreset'
    | 'setClef'
    | 'toggleRepeatStart'
    | 'toggleRepeatEnd'
    | 'setRepeatCount'
    | 'setBarLineType'
    | 'addVolta'
    | 'insertMeasures'
    | 'addPickupMeasure'
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

type MmaStarterPreset = 'blank' | 'lead-sheet' | 'blues';
type HarmonyRhythmMode = 'auto' | 'measure' | 'beat';

type BlockReviewStatus = 'pending' | 'accepted' | 'rejected' | 'comment';

type BlockReview = {
    partIndex: number;
    blockIndex: number;
    blockKey: string;
    measureRange: string;
    status: BlockReviewStatus;
    comment: string;
    commentCommitted: boolean;
};

type AiDiffBlockRef = Pick<BlockReview, 'partIndex' | 'blockIndex' | 'blockKey' | 'measureRange'>;

type EditorTraceContext = {
    requestId?: string;
    traceId?: string;
};

type EditorTelemetryCounters = {
    documentsLoaded: number;
    documentLoadFailures: number;
    aiRequests: number;
    aiFailures: number;
    patchApplies: number;
    patchApplyFailures: number;
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
const AI_DIFF_GUTTER_DEFAULT_WIDTH = 360;
const AI_DIFF_GUTTER_MIN_WIDTH = 360;
const AI_DIFF_GUTTER_MAX_WIDTH = 1280;
const AI_DIFF_COMMENT_GUTTER_PADDING = 72;
const AI_CHAT_SYSTEM_PROMPT = 'You are a helpful music notation assistant. Answer clearly and practically for score editing and engraving workflows.';
const CODE_EDITOR_THEME_STORAGE_KEY = 'ots_code_editor_theme';
const MUSIC_SPECIALISTS_NOTAGEN_BACKEND_STORAGE_KEY = 'ots_music_specialists_notagen_backend';
const MUSIC_SPECIALISTS_NOTAGEN_MODEL_STORAGE_KEY = 'ots_music_specialists_notagen_model';
const MUSIC_SPECIALISTS_NOTAGEN_REVISION_STORAGE_KEY = 'ots_music_specialists_notagen_revision';
const MUSIC_SPECIALISTS_NOTAGEN_SPACE_ID_STORAGE_KEY = 'ots_music_specialists_notagen_space_id';
const MUSIC_SPECIALISTS_NOTAGEN_SPACE_PERIOD_STORAGE_KEY = 'ots_music_specialists_notagen_space_period';
const MUSIC_SPECIALISTS_NOTAGEN_SPACE_COMPOSER_STORAGE_KEY = 'ots_music_specialists_notagen_space_composer';
const MUSIC_SPECIALISTS_NOTAGEN_SPACE_INSTRUMENTATION_STORAGE_KEY = 'ots_music_specialists_notagen_space_instrumentation';
const MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_BACKEND = 'huggingface';
const MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_MODEL = (process.env.NEXT_PUBLIC_MUSIC_NOTAGEN_DEFAULT_MODEL_ID || '').trim();
const MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_REVISION = (process.env.NEXT_PUBLIC_MUSIC_NOTAGEN_DEFAULT_REVISION || '').trim();
const MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_ID = (process.env.NEXT_PUBLIC_MUSIC_NOTAGEN_DEFAULT_SPACE_ID || 'ElectricAlexis/NotaGen').trim();
const MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_PERIOD = (process.env.NEXT_PUBLIC_MUSIC_NOTAGEN_SPACE_DEFAULT_PERIOD || 'Classical').trim();
const MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_COMPOSER = (process.env.NEXT_PUBLIC_MUSIC_NOTAGEN_SPACE_DEFAULT_COMPOSER || 'Mozart, Wolfgang Amadeus').trim();
const MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_INSTRUMENTATION = (process.env.NEXT_PUBLIC_MUSIC_NOTAGEN_SPACE_DEFAULT_INSTRUMENTATION || 'Keyboard').trim();
const MUSIC_AGENT_DEFAULT_MODEL = (process.env.NEXT_PUBLIC_MUSIC_AGENT_DEFAULT_MODEL || 'gpt-5.2').trim();
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
Each XPath must match exactly one node.
Each replace/insertBefore/insertAfter value must contain exactly one XML element.
If you need to add multiple sibling elements, use multiple ops (for example: replace one node, then insertAfter additional nodes).`;
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

const MMA_BLUES_DEMO_TEMPLATE = `Tempo 110\nTimeSig 4 4\nKeySig C\nGroove Swing\n\n1  C7\n2  F7\n3  C7\n4  C7\n5  F7\n6  F7\n7  C7\n8  C7\n9  G7\n10  F7\n11  C7\n12  G7\n`;

const decodeBase64ToBytes = (input: string) => {
    const compact = input.replace(/\s+/g, '');
    if (!compact) {
        return new Uint8Array();
    }
    const globalBuffer = (globalThis as { Buffer?: { from: (value: string, encoding: string) => Uint8Array } }).Buffer;
    if (globalBuffer) {
        return new Uint8Array(globalBuffer.from(compact, 'base64'));
    }
    if (typeof atob === 'function') {
        const binary = atob(compact);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }
    throw new Error('No base64 decoder available in this environment.');
};

const isMissingProxyStatus = (status: number) => PROXY_MISSING_STATUSES.has(status);

const errorMessage = (err: unknown) => (err instanceof Error ? err.message.trim() : '');

const MMA_TEMPLATE_MAX_MEASURES = 2500;
const HARMONY_ANALYZE_DEFAULT_TIMEOUT_MS = 60_000;
const HARMONY_ANALYZE_MEDIUM_TIMEOUT_MS = 180_000;
const HARMONY_ANALYZE_LARGE_TIMEOUT_MS = 300_000;

const estimateMusicXmlMeasureCount = (xml: string) => {
    const partMatches = [...xml.matchAll(/<part\b[^>]*\bid="[^"]+"[^>]*>([\s\S]*?)<\/part>/gi)];
    const primaryPartXml = partMatches[0]?.[1] || '';
    if (primaryPartXml) {
        return (primaryPartXml.match(/<measure\b/gi) || []).length;
    }
    const allMeasures = (xml.match(/<measure\b/gi) || []).length;
    if (!allMeasures) {
        return 0;
    }
    return allMeasures;
};

const estimateHarmonyTimeoutMs = (xml: string) => {
    const measureTagCount = (xml.match(/<measure\b/gi) || []).length;
    if (measureTagCount >= 2000) {
        return HARMONY_ANALYZE_LARGE_TIMEOUT_MS;
    }
    if (measureTagCount >= 800) {
        return HARMONY_ANALYZE_MEDIUM_TIMEOUT_MS;
    }
    return HARMONY_ANALYZE_DEFAULT_TIMEOUT_MS;
};

const formatAiDiffFeedbackError = (message: string) => {
    const trimmed = message.trim();
    if (!trimmed) {
        return 'Failed to generate a revised proposal from feedback.';
    }
    const xpathMatch = trimmed.match(/XPath\s+["']([^"']+)["']\s+matched\s+0\s+nodes/i);
    if (xpathMatch) {
        return `The AI returned a patch path that does not exist in the current score: ${xpathMatch[1]}. Update the comment with a more specific target and try again.`;
    }
    return trimmed;
};

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
    const [scoreSessionId, setScoreSessionId] = useState<string | null>(null);
    const [scoreRevision, setScoreRevision] = useState<number>(0);
    const lastSyncedXmlRef = useRef<string>('');
    const lastSyncedRevisionRef = useRef<number>(-1);
    const isSyncingRef = useRef<boolean>(false);
    const scoreRef = useRef<Score | null>(null);
    const [zoom, setZoom] = useState(1.0);
    const containerRef = useRef<HTMLDivElement>(null);
    const scoreWrapperRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const MIN_ZOOM = 0.01;
    const MAX_ZOOM = 1.0;
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
    const [aiDiffReviews, setAiDiffReviews] = useState<BlockReview[]>([]);
    const [aiDiffIteration, setAiDiffIteration] = useState(0);
    const [aiDiffGlobalComment, setAiDiffGlobalComment] = useState('');
    const [aiDiffFeedbackBusy, setAiDiffFeedbackBusy] = useState(false);
    const [aiDiffFeedbackError, setAiDiffFeedbackError] = useState<string | null>(null);
    const [aiDiffBlockErrors, setAiDiffBlockErrors] = useState<Record<string, string>>({});
    const [aiDiffGutterWidth, setAiDiffGutterWidth] = useState(AI_DIFF_GUTTER_DEFAULT_WIDTH);
    const aiDiffCommentTextareaRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());
    const aiDiffCommentResizeObserverRef = useRef<ResizeObserver | null>(null);
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
    const musicNotaGenProgressPreRef = useRef<HTMLPreElement | null>(null);
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
    const [xmlSidebarTab, setXmlSidebarTab] = useState<'xml' | 'assistant' | 'notagen' | 'harmony' | 'functional' | 'mma'>('xml');
    const [codeEditorTheme, setCodeEditorTheme] = useState<CodeEditorThemeMode>('light');
    const [xmlText, setXmlText] = useState('');
    const [xmlDirty, setXmlDirty] = useState(false);
    const [xmlLoading, setXmlLoading] = useState(false);
    const [xmlError, setXmlError] = useState<string | null>(null);
    const [mmaStarterPreset, setMmaStarterPreset] = useState<MmaStarterPreset>('lead-sheet');
    const [mmaArrangementPreset, setMmaArrangementPreset] = useState<MmaArrangementPreset>('full-groove');
    const [mmaGroove, setMmaGroove] = useState(DEFAULT_MMA_GROOVE);
    const [mmaScript, setMmaScript] = useState('');
    const [mmaBusy, setMmaBusy] = useState(false);
    const [mmaError, setMmaError] = useState<string | null>(null);
    const [mmaWarnings, setMmaWarnings] = useState<string[]>([]);
    const [mmaSanitizedStderr, setMmaSanitizedStderr] = useState('');
    const [mmaMidiBase64, setMmaMidiBase64] = useState('');
    const [mmaGeneratedXml, setMmaGeneratedXml] = useState('');
    const [mmaResultPayload, setMmaResultPayload] = useState<Record<string, unknown> | null>(null);
    const [harmonyBusy, setHarmonyBusy] = useState(false);
    const [harmonyError, setHarmonyError] = useState<string | null>(null);
    const [harmonyWarnings, setHarmonyWarnings] = useState<string[]>([]);
    const [harmonyGeneratedXml, setHarmonyGeneratedXml] = useState('');
    const [harmonyResultPayload, setHarmonyResultPayload] = useState<Record<string, unknown> | null>(null);
    const [harmonyRhythmMode, setHarmonyRhythmMode] = useState<HarmonyRhythmMode>('auto');
    const [harmonyMaxChangesPerMeasure, setHarmonyMaxChangesPerMeasure] = useState(2);
    const [functionalHarmonyBusy, setFunctionalHarmonyBusy] = useState(false);
    const [functionalHarmonyError, setFunctionalHarmonyError] = useState<string | null>(null);
    const [functionalHarmonyWarnings, setFunctionalHarmonyWarnings] = useState<string[]>([]);
    const [functionalHarmonyResult, setFunctionalHarmonyResult] = useState<Record<string, unknown> | null>(null);
    const [functionalHarmonySegments, setFunctionalHarmonySegments] = useState<Record<string, unknown>[]>([]);
    const [functionalHarmonyAnnotatedXml, setFunctionalHarmonyAnnotatedXml] = useState('');
    const [functionalHarmonyJsonExport, setFunctionalHarmonyJsonExport] = useState('');
    const [functionalHarmonyRntxtExport, setFunctionalHarmonyRntxtExport] = useState('');
    const [aiProvider, setAiProvider] = useState<AiProvider>('openai');
    const [aiModel, setAiModel] = useState('');
    const [aiApiKey, setAiApiKey] = useState('');
    const [musicNotaGenBackend, setMusicNotaGenBackend] = useState<'huggingface' | 'huggingface-space'>(
        MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_BACKEND === 'huggingface-space' ? 'huggingface-space' : 'huggingface',
    );
    const [musicNotaGenModelId, setMusicNotaGenModelId] = useState(MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_MODEL);
    const [musicNotaGenRevision, setMusicNotaGenRevision] = useState(MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_REVISION);
    const [musicNotaGenSpaceId, setMusicNotaGenSpaceId] = useState(MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_ID);
    const [musicNotaGenSpacePeriod, setMusicNotaGenSpacePeriod] = useState(MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_PERIOD);
    const [musicNotaGenSpaceComposer, setMusicNotaGenSpaceComposer] = useState(MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_COMPOSER);
    const [musicNotaGenSpaceInstrumentation, setMusicNotaGenSpaceInstrumentation] = useState(MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_INSTRUMENTATION);
    const [musicNotaGenPrompt, setMusicNotaGenPrompt] = useState('');
    const [musicNotaGenUseCurrentScoreSeed, setMusicNotaGenUseCurrentScoreSeed] = useState(false);
    const [musicNotaGenDryRun] = useState(false);
    const [musicNotaGenBusy, setMusicNotaGenBusy] = useState(false);
    const [musicNotaGenError, setMusicNotaGenError] = useState<string | null>(null);
    const [musicNotaGenResult, setMusicNotaGenResult] = useState<Record<string, unknown> | null>(null);
    const [musicNotaGenGeneratedXml, setMusicNotaGenGeneratedXml] = useState('');
    const [musicNotaGenGeneratedAbc, setMusicNotaGenGeneratedAbc] = useState('');
    const [musicNotaGenProgressLog, setMusicNotaGenProgressLog] = useState('');
    const [musicNotaGenStatusText, setMusicNotaGenStatusText] = useState('');
    const [musicNotaGenSpaceCombinations, setMusicNotaGenSpaceCombinations] = useState<NotaGenSpaceCombinations | null>(null);
    const [musicNotaGenSpaceOptionsLoading, setMusicNotaGenSpaceOptionsLoading] = useState(false);
    const [musicNotaGenSpaceOptionsError, setMusicNotaGenSpaceOptionsError] = useState<string | null>(null);
    const musicAgentPromptRef = useRef<HTMLTextAreaElement>(null);
    const [musicAgentMaxTurns, setMusicAgentMaxTurns] = useState(6);
    const [musicAgentUseFallbackOnly, setMusicAgentUseFallbackOnly] = useState(false);
    const [musicAgentIncludeCurrentXml, setMusicAgentIncludeCurrentXml] = useState(true);
    const [musicAgentFiles, setMusicAgentFiles] = useState<File[]>([]);
    const [musicAgentBusy, setMusicAgentBusy] = useState(false);
    const [musicAgentError, setMusicAgentError] = useState<string | null>(null);
    const [musicAgentResult, setMusicAgentResult] = useState<Record<string, unknown> | null>(null);
    const [musicAgentPatch, setMusicAgentPatch] = useState<MusicXmlPatch | null>(null);
    const [musicAgentPatchError, setMusicAgentPatchError] = useState<string | null>(null);
    const [musicAgentPatchedXml, setMusicAgentPatchedXml] = useState('');
    const [musicAgentThread, setMusicAgentThread] = useState<AiChatMessage[]>([]);
    const musicAgentThreadRef = useRef<HTMLDivElement | null>(null);
    const [aiMode, setAiMode] = useState<'patch' | 'chat' | 'agent'>('patch');
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
    const [newScoreWithPickup, setNewScoreWithPickup] = useState(false);
    const [newScorePickupNumerator, setNewScorePickupNumerator] = useState(1);
    const [newScorePickupDenominator, setNewScorePickupDenominator] = useState(4);
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
    const editorSessionIdRef = useRef('');
    const editorMountedAtRef = useRef(0);
    const lastApiTraceContextRef = useRef<EditorTraceContext>({});
    const telemetryCountersRef = useRef<EditorTelemetryCounters>({
        documentsLoaded: 0,
        documentLoadFailures: 0,
        aiRequests: 0,
        aiFailures: 0,
        patchApplies: 0,
        patchApplyFailures: 0,
    });

    const captureApiTraceContext = useCallback((headers: Headers | null | undefined) => {
        const trace = extractTraceContextFromHeaders(headers);
        if (trace.requestId || trace.traceId) {
            lastApiTraceContextRef.current = trace;
        }
        return trace;
    }, []);

    const emitEditorTelemetry = useCallback((
        eventName: string,
        properties?: Record<string, string | number | boolean | null | undefined>,
        options?: { beacon?: boolean },
    ) => {
        const sessionId = editorSessionIdRef.current || getOrCreateEditorSessionId();
        editorSessionIdRef.current = sessionId;
        const lastTrace = lastApiTraceContextRef.current;
        trackEditorAnalyticsEvent(eventName, {
            editor_surface: isEmbedBuild ? 'embedded' : 'standalone',
            editor_session_id: sessionId || undefined,
            api_request_id: lastTrace.requestId || undefined,
            api_trace_id: lastTrace.traceId || undefined,
            ...(properties || {}),
        }, options);
    }, [isEmbedBuild]);

    useEffect(() => {
        if (!editorSessionIdRef.current) {
            editorSessionIdRef.current = getOrCreateEditorSessionId();
        }
        editorMountedAtRef.current = Date.now();
        emitEditorTelemetry('score_editor_runtime_loaded');
        return () => {
            const durationMs = Math.max(0, Date.now() - editorMountedAtRef.current);
            const counters = telemetryCountersRef.current;
            // In React strict-mode development mounts can be immediately torn down.
            // Ignore near-zero lifecycle noise unless actual user work happened.
            const hasActivity = (
                counters.documentsLoaded > 0
                || counters.documentLoadFailures > 0
                || counters.aiRequests > 0
                || counters.patchApplies > 0
            );
            if (durationMs < 1500 && !hasActivity) {
                return;
            }
            emitEditorTelemetry('score_editor_session_summary', {
                duration_ms: durationMs,
                documents_loaded: counters.documentsLoaded,
                document_load_failures: counters.documentLoadFailures,
                ai_requests: counters.aiRequests,
                ai_failures: counters.aiFailures,
                patch_applies: counters.patchApplies,
                patch_apply_failures: counters.patchApplyFailures,
            }, { beacon: true });
        };
    }, [emitEditorTelemetry]);

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
            return false;
        }
        try {
            const positions = await targetScore.measurePositions();
            setter(positions ?? null);
            return true;
        } catch (err) {
            console.warn('Failed to load measure positions for compare highlight:', err);
            return false;
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

        const isMscx = doc.documentElement?.tagName === 'museScore';
        const stripElementNames = new Set([
            'print',
            'layoutbreak',
            'system-layout',
            'staff-layout',
            'page-layout',
            'appearance',
        ]);
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
            if (lower === 'placement' || lower === 'justify' || lower === 'halign' || lower === 'valign') {
                return true;
            }
            if (lower === 'print-object' || lower === 'print-dot' || lower === 'print-spacing') {
                return true;
            }
            if (lower === 'new-page' || lower === 'new-system') {
                return true;
            }
            if (lower === 'color') {
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
            Array.from(element.children).forEach((child) => {
                if (stripElementNames.has(child.tagName.toLowerCase())) {
                    child.remove();
                    return;
                }
                scrubElement(child);
            });
        };

        const normalizeText = (value: string) => value.replace(/\s+/g, ' ').trim();

        const canonicalizeNode = (node: Node): string => {
            if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) {
                const text = normalizeText(node.textContent ?? '');
                return text ? `#${text}` : '';
            }
            if (node.nodeType !== Node.ELEMENT_NODE) {
                return '';
            }
            const element = node as Element;
            const attributes = Array.from(element.attributes)
                .filter((attr) => !shouldStripAttribute(attr.name))
                .map((attr) => `${attr.name}=${normalizeText(attr.value)}`)
                .sort();
            const children = Array.from(element.childNodes)
                .map((child) => canonicalizeNode(child))
                .filter(Boolean);
            const attrs = attributes.length ? ` ${attributes.join('|')}` : '';
            return `<${element.tagName}${attrs}>${children.join('')}</${element.tagName}>`;
        };

        const measureSignature = (measure: Element) => {
            const clone = measure.cloneNode(true) as Element;
            clone.removeAttribute('number');
            clone.removeAttribute('width');
            Array.from(clone.getElementsByTagName('LayoutBreak')).forEach((node) => node.remove());
            scrubElement(clone);
            return canonicalizeNode(clone);
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
        setMusicNotaGenBackend(
            window.localStorage.getItem(MUSIC_SPECIALISTS_NOTAGEN_BACKEND_STORAGE_KEY) === 'huggingface-space'
                ? 'huggingface-space'
                : 'huggingface',
        );
        setMusicNotaGenModelId(
            window.localStorage.getItem(MUSIC_SPECIALISTS_NOTAGEN_MODEL_STORAGE_KEY)
            ?? MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_MODEL,
        );
        setMusicNotaGenRevision(
            window.localStorage.getItem(MUSIC_SPECIALISTS_NOTAGEN_REVISION_STORAGE_KEY)
            ?? MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_REVISION,
        );
        setMusicNotaGenSpaceId(
            window.localStorage.getItem(MUSIC_SPECIALISTS_NOTAGEN_SPACE_ID_STORAGE_KEY)
            ?? MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_ID,
        );
        setMusicNotaGenSpacePeriod(
            window.localStorage.getItem(MUSIC_SPECIALISTS_NOTAGEN_SPACE_PERIOD_STORAGE_KEY)
            ?? MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_PERIOD,
        );
        setMusicNotaGenSpaceComposer(
            window.localStorage.getItem(MUSIC_SPECIALISTS_NOTAGEN_SPACE_COMPOSER_STORAGE_KEY)
            ?? MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_COMPOSER,
        );
        setMusicNotaGenSpaceInstrumentation(
            window.localStorage.getItem(MUSIC_SPECIALISTS_NOTAGEN_SPACE_INSTRUMENTATION_STORAGE_KEY)
            ?? MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_INSTRUMENTATION,
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
        persistValue(MUSIC_SPECIALISTS_NOTAGEN_BACKEND_STORAGE_KEY, musicNotaGenBackend);
        persistValue(MUSIC_SPECIALISTS_NOTAGEN_MODEL_STORAGE_KEY, musicNotaGenModelId);
        persistValue(MUSIC_SPECIALISTS_NOTAGEN_REVISION_STORAGE_KEY, musicNotaGenRevision);
        persistValue(MUSIC_SPECIALISTS_NOTAGEN_SPACE_ID_STORAGE_KEY, musicNotaGenSpaceId);
        persistValue(MUSIC_SPECIALISTS_NOTAGEN_SPACE_PERIOD_STORAGE_KEY, musicNotaGenSpacePeriod);
        persistValue(MUSIC_SPECIALISTS_NOTAGEN_SPACE_COMPOSER_STORAGE_KEY, musicNotaGenSpaceComposer);
        persistValue(MUSIC_SPECIALISTS_NOTAGEN_SPACE_INSTRUMENTATION_STORAGE_KEY, musicNotaGenSpaceInstrumentation);
    }, [
        aiEnabled,
        musicNotaGenBackend,
        musicNotaGenModelId,
        musicNotaGenRevision,
        musicNotaGenSpaceId,
        musicNotaGenSpacePeriod,
        musicNotaGenSpaceComposer,
        musicNotaGenSpaceInstrumentation,
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

    const musicNotaGenSpacePeriods = useMemo(
        () => (musicNotaGenSpaceCombinations ? Object.keys(musicNotaGenSpaceCombinations).sort() : []),
        [musicNotaGenSpaceCombinations],
    );
    const musicNotaGenSpaceComposers = useMemo(
        () => Object.keys((musicNotaGenSpaceCombinations && musicNotaGenSpaceCombinations[musicNotaGenSpacePeriod]) || {}).sort(),
        [musicNotaGenSpaceCombinations, musicNotaGenSpacePeriod],
    );
    const musicNotaGenSpaceInstrumentations = useMemo(
        () => (
            (musicNotaGenSpaceCombinations
                && musicNotaGenSpaceCombinations[musicNotaGenSpacePeriod]
                && musicNotaGenSpaceCombinations[musicNotaGenSpacePeriod][musicNotaGenSpaceComposer])
            ? [...musicNotaGenSpaceCombinations[musicNotaGenSpacePeriod][musicNotaGenSpaceComposer]].sort()
            : []
        ),
        [musicNotaGenSpaceCombinations, musicNotaGenSpacePeriod, musicNotaGenSpaceComposer],
    );

    useEffect(() => {
        if (!aiEnabled) {
            return;
        }
        if (xmlSidebarTab !== 'notagen') {
            return;
        }
        if (musicNotaGenSpaceCombinations || musicNotaGenSpaceOptionsLoading) {
            return;
        }
        void loadNotaGenSpaceOptions();
    }, [
        aiEnabled,
        xmlSidebarTab,
        musicNotaGenSpaceCombinations,
        musicNotaGenSpaceOptionsLoading,
    ]);

    useEffect(() => {
        if (musicNotaGenSpaceComposers.length === 0) {
            return;
        }
        if (!musicNotaGenSpaceComposers.includes(musicNotaGenSpaceComposer)) {
            setMusicNotaGenSpaceComposer(musicNotaGenSpaceComposers[0] || '');
        }
    }, [musicNotaGenSpaceComposers, musicNotaGenSpaceComposer]);

    useEffect(() => {
        if (musicNotaGenSpaceInstrumentations.length === 0) {
            return;
        }
        if (!musicNotaGenSpaceInstrumentations.includes(musicNotaGenSpaceInstrumentation)) {
            setMusicNotaGenSpaceInstrumentation(musicNotaGenSpaceInstrumentations[0] || '');
        }
    }, [musicNotaGenSpaceInstrumentations, musicNotaGenSpaceInstrumentation]);

    useEffect(() => {
        const el = musicNotaGenProgressPreRef.current;
        if (!el) {
            return;
        }
        el.scrollTop = el.scrollHeight;
    }, [musicNotaGenProgressLog, musicNotaGenStatusText]);

    useEffect(() => {
        const el = musicAgentThreadRef.current;
        if (!el) {
            return;
        }
        el.scrollTop = el.scrollHeight;
    }, [musicAgentThread, musicAgentBusy]);

    useEffect(() => {
        if (aiEnabled) {
            return;
        }
        if (xmlSidebarTab !== 'xml' && xmlSidebarTab !== 'mma' && xmlSidebarTab !== 'harmony' && xmlSidebarTab !== 'functional') {
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
                await handleFileUpload(rightFile, {
                    preserveScoreId: false,
                    updateUrl: false,
                    telemetrySource: 'compare_load_right',
                });

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
                await handleFileUpload(file, {
                    preserveScoreId: false,
                    updateUrl: false,
                    telemetrySource: 'session_restore',
                });
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
    const isAiCompareMode = compareView?.title === 'Assistant Proposal';
    const aiDiffCurrentBlocks = useMemo(() => {
        if (!isAiCompareMode) {
            return [] as Array<{ partIndex: number; blockIndex: number; blockKey: string; measureRange: string }>;
        }
        const blocks: Array<{ partIndex: number; blockIndex: number; blockKey: string; measureRange: string }> = [];
        Array.from({ length: comparePartCount }).forEach((_, partIndex) => {
            const alignment = compareAlignmentByPart.get(partIndex);
            const rows = alignment?.rows ?? [];
            const mismatchBlocks = buildMismatchBlocks(rows);
            mismatchBlocks.forEach((block, blockIndex) => {
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
                const primaryStart = rightIndices.length ? rightStart : leftStart;
                const primaryEnd = rightIndices.length ? rightEnd : leftEnd;
                const measureRange = primaryStart !== undefined
                    ? `${primaryStart + 1}${primaryEnd !== primaryStart ? `-${primaryEnd + 1}` : ''}`
                    : 'unknown';
                const stableMeasureKey = measureRange !== 'unknown'
                    ? measureRange
                    : `${blockIndex}:${leftStart ?? 'x'}:${leftEnd ?? 'x'}:${rightStart ?? 'x'}:${rightEnd ?? 'x'}`;
                const blockKey = `${partIndex}:${stableMeasureKey}`;
                blocks.push({
                    partIndex,
                    blockIndex,
                    blockKey,
                    measureRange,
                });
            });
        });
        return blocks;
    }, [isAiCompareMode, comparePartCount, compareAlignmentByPart, buildMismatchBlocks]);
    const aiDiffReviewByKey = useMemo(() => {
        const map = new Map<string, BlockReview>();
        aiDiffReviews.forEach((review) => {
            map.set(review.blockKey, review);
        });
        return map;
    }, [aiDiffReviews]);
    const aiDiffReviewByRange = useMemo(() => {
        const map = new Map<string, BlockReview>();
        aiDiffReviews.forEach((review) => {
            map.set(`${review.partIndex}:${review.measureRange}`, review);
        });
        return map;
    }, [aiDiffReviews]);
    const getReviewStatusForFeedback = useCallback((review: BlockReview | undefined): BlockReviewStatus => {
        if (!review) {
            return 'pending';
        }
        if (review.status !== 'comment') {
            return review.status;
        }
        return review.comment.trim() ? 'comment' : 'pending';
    }, []);
    const aiDiffRejectedCount = useMemo(() => aiDiffCurrentBlocks.filter((block) => {
        const review = aiDiffReviewByKey.get(block.blockKey)
            ?? aiDiffReviewByRange.get(`${block.partIndex}:${block.measureRange}`);
        return getReviewStatusForFeedback(review) === 'rejected';
    }).length, [aiDiffCurrentBlocks, aiDiffReviewByKey, aiDiffReviewByRange, getReviewStatusForFeedback]);
    const aiDiffCommentCount = useMemo(() => aiDiffCurrentBlocks.filter((block) => {
        const review = aiDiffReviewByKey.get(block.blockKey)
            ?? aiDiffReviewByRange.get(`${block.partIndex}:${block.measureRange}`);
        return getReviewStatusForFeedback(review) === 'comment';
    }).length, [aiDiffCurrentBlocks, aiDiffReviewByKey, aiDiffReviewByRange, getReviewStatusForFeedback]);
    const aiDiffPendingCount = useMemo(() => aiDiffCurrentBlocks.filter((block) => {
        const review = aiDiffReviewByKey.get(block.blockKey)
            ?? aiDiffReviewByRange.get(`${block.partIndex}:${block.measureRange}`);
        return getReviewStatusForFeedback(review) === 'pending';
    }).length, [aiDiffCurrentBlocks, aiDiffReviewByKey, aiDiffReviewByRange, getReviewStatusForFeedback]);
    const aiDiffAcceptedCount = useMemo(
        () => aiDiffReviews.filter((review) => getReviewStatusForFeedback(review) === 'accepted').length,
        [aiDiffReviews, getReviewStatusForFeedback],
    );
    const canSendDiffFeedback = useMemo(
        () => !aiDiffFeedbackBusy
            && !compareSwapBusy
            && (
                (aiDiffRejectedCount + aiDiffCommentCount > 0)
                || (aiDiffPendingCount > 0 && aiDiffAcceptedCount > 0)
            ),
        [aiDiffFeedbackBusy, compareSwapBusy, aiDiffRejectedCount, aiDiffCommentCount, aiDiffPendingCount, aiDiffAcceptedCount],
    );
    const diffFeedbackButtonLabel = useMemo(() => {
        const parts: string[] = [];
        if (aiDiffCommentCount > 0) {
            parts.push(`${aiDiffCommentCount} comment${aiDiffCommentCount === 1 ? '' : 's'}`);
        }
        if (aiDiffRejectedCount > 0) {
            parts.push(`${aiDiffRejectedCount} rejection${aiDiffRejectedCount === 1 ? '' : 's'}`);
        }
        if (aiDiffPendingCount > 0 && aiDiffAcceptedCount > 0 && aiDiffRejectedCount + aiDiffCommentCount === 0) {
            parts.push(`${aiDiffPendingCount} pending`);
        }
        return parts.length
            ? `Send Feedback (${parts.join(', ')})`
            : 'Send Feedback';
    }, [aiDiffCommentCount, aiDiffRejectedCount, aiDiffPendingCount, aiDiffAcceptedCount]);
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

    const pickupDurationToRestType = (numerator: number, denominator: number): string => {
        // Map a simple pickup fraction to MusicXML <type> value.
        // For compound fractions (e.g. 3/8), use the denominator's base note type
        // with dots handled separately if needed. For the rest element, just using
        // the denominator's type with the correct duration value is sufficient —
        // MuseScore will display the correct rest(s) based on duration.
        const denomTypes: Record<number, string> = {
            1: 'whole', 2: 'half', 4: 'quarter', 8: 'eighth',
            16: '16th', 32: '32nd',
        };
        // Simple case: numerator is 1 → exact match
        if (numerator === 1) {
            return denomTypes[denominator] || 'quarter';
        }
        // Dotted: 3/8 = dotted quarter, 3/4 = dotted half, etc.
        if (numerator === 3) {
            const dottedDenom = denominator / 2;
            if (denomTypes[dottedDenom]) {
                return denomTypes[dottedDenom];
            }
        }
        // Fallback: use denominator type (MuseScore will use duration to fill correctly)
        return denomTypes[denominator] || 'quarter';
    };

    const buildNewScoreXml = (options: {
        title: string;
        composer: string;
        instruments: { id: string; name: string }[];
        measures: number;
        keyFifths: number;
        timeNumerator: number;
        timeDenominator: number;
        pickup?: { numerator: number; denominator: number };
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
            const fullAttributesXml = `
      <attributes>
        <divisions>${divisions}</divisions>
        <key><fifths>${options.keyFifths}</fifths></key>
        <time><beats>${options.timeNumerator}</beats><beat-type>${options.timeDenominator}</beat-type></time>
        ${staves > 1 ? `<staves>${staves}</staves>` : ''}
${clefXml}
      </attributes>`;
            // When there's a pickup, all attributes go on the pickup measure (measure 0).
            // Measure 1 gets no attributes block to avoid duplicate clefs/time sigs.
            const hasPickup = !!options.pickup;
            const measuresXml = Array.from({ length: options.measures }, (_, measureIndex) => {
                const attributes = (measureIndex === 0 && !hasPickup) ? fullAttributesXml : '';
                const notesXml = Array.from({ length: staves }, (_, staffIndex) => {
                    const staffNumber = staffIndex + 1;
                    const voice = staffIndex * 4 + 1;
                    const backup = staffIndex > 0
                        ? `      <backup>\n        <duration>${measureDuration}</duration>\n      </backup>\n`
                        : '';
                    return `${backup}      <note>
        <rest measure="yes"/>
        <duration>${measureDuration}</duration>
        <voice>${voice}</voice>
        ${staves > 1 ? `<staff>${staffNumber}</staff>` : ''}
      </note>`;
                }).join('\n');
                return `    <measure number="${measureIndex + 1}">
${attributes}
${notesXml}
    </measure>`;
            }).join('\n');
            let pickupXml = '';
            if (options.pickup) {
                const pickupDuration = Math.round((divisions * 4 * options.pickup.numerator) / options.pickup.denominator);
                const pickupRestType = pickupDurationToRestType(options.pickup.numerator, options.pickup.denominator);
                const pickupNotesXml = Array.from({ length: staves }, (_, staffIndex) => {
                    const staffNumber = staffIndex + 1;
                    const voice = staffIndex * 4 + 1;
                    const backup = staffIndex > 0
                        ? `      <backup>\n        <duration>${pickupDuration}</duration>\n      </backup>\n`
                        : '';
                    return `${backup}      <note>
        <rest/>
        <duration>${pickupDuration}</duration>
        <voice>${voice}</voice>
        <type>${pickupRestType}</type>
        ${staves > 1 ? `<staff>${staffNumber}</staff>` : ''}
      </note>`;
                }).join('\n');
                pickupXml = `    <measure number="0" implicit="yes">
${fullAttributesXml}
${pickupNotesXml}
    </measure>\n`;
            }
            return {
                partList: `    <score-part id="${partId}">
      <part-name>${instrumentName}</part-name>
      <score-instrument id="${partId}-I1">
        <instrument-name>${instrumentName}</instrument-name>
      </score-instrument>
    </score-part>`,
                part: `  <part id="${partId}">
${pickupXml}${measuresXml}
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

    const fileToBase64 = useCallback((file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = (error) => reject(error);
        });
    }, []);

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

    const openScoreSession = useCallback(async (xml?: string) => {
        if (isSyncingRef.current) {
            return { scoreSessionId, revision: scoreRevision };
        }

        let nextSessionId = scoreSessionId;
        let nextRevision = scoreRevision;
        try {
            const content = xml || await resolveXmlContext();
            if (!content.trim()) {
                return { scoreSessionId: nextSessionId, revision: nextRevision };
            }

            // Skip if content and revision haven't changed since last successful sync
            if (content === lastSyncedXmlRef.current && scoreRevision === lastSyncedRevisionRef.current) {
                return { scoreSessionId: nextSessionId, revision: nextRevision };
            }

            isSyncingRef.current = true;
            const isSync = Boolean(scoreSessionId);
            const endpoint = isSync ? '/api/music/scoreops/sync' : '/api/music/scoreops/session/open';
            const body: any = { content };
            if (isSync) {
                body.scoreSessionId = scoreSessionId;
                body.baseRevision = scoreRevision;
            }

            const response = await fetch(resolveScoreEditorApiPath(endpoint), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (response.ok) {
                const result = await response.json();
                if (result.scoreSessionId) {
                    setScoreSessionId(result.scoreSessionId);
                    const nextRev = result.newRevision ?? result.revision ?? 0;
                    setScoreRevision(nextRev);
                    lastSyncedXmlRef.current = content;
                    lastSyncedRevisionRef.current = nextRev;
                    nextSessionId = result.scoreSessionId;
                    nextRevision = nextRev;
                    console.info(`[session] ${isSync ? 'Synced' : 'Opened'} score session: ${result.scoreSessionId}, revision: ${nextRev}`);
                }
            }
        } catch (err) {
            console.warn('[session] Failed to open/sync score session:', err);
        } finally {
            isSyncingRef.current = false;
        }
        return { scoreSessionId: nextSessionId, revision: nextRevision };
    }, [resolveXmlContext, scoreSessionId, scoreRevision]);

    // Automatically open/sync session when score changes (debounced)
    useEffect(() => {
        if (!score) {
            setScoreSessionId(null);
            setScoreRevision(0);
            lastSyncedXmlRef.current = '';
            lastSyncedRevisionRef.current = -1;
            return;
        }

        const timer = setTimeout(() => {
            openScoreSession();
        }, 1000);

        return () => clearTimeout(timer);
    }, [score, openScoreSession]);

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
        const analyzeXmlFragmentShape = (value: string) => {
            const tokenPattern = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<![^>]*>|<\/?[^>]+?>|[^<]+/g;
            const tokens = value.match(tokenPattern) || [];
            let depth = 0;
            let topLevelElementCount = 0;
            let hasTopLevelText = false;
            let unbalancedTags = false;
            for (const token of tokens) {
                if (!token) {
                    continue;
                }
                if (token.startsWith('<!--') || token.startsWith('<?') || (token.startsWith('<!') && !token.startsWith('<![CDATA['))) {
                    continue;
                }
                if (token.startsWith('<![CDATA[')) {
                    if (depth === 0 && token.replace(/^<!\[CDATA\[|\]\]>$/g, '').trim()) {
                        hasTopLevelText = true;
                    }
                    continue;
                }
                if (token.startsWith('</')) {
                    if (depth === 0) {
                        unbalancedTags = true;
                        continue;
                    }
                    depth -= 1;
                    continue;
                }
                if (token.startsWith('<')) {
                    const isSelfClosing = /\/>\s*$/.test(token);
                    if (depth === 0) {
                        topLevelElementCount += 1;
                    }
                    if (!isSelfClosing) {
                        depth += 1;
                    }
                    continue;
                }
                if (depth === 0 && token.trim()) {
                    hasTopLevelText = true;
                }
            }
            if (depth !== 0) {
                unbalancedTags = true;
            }
            return { topLevelElementCount, hasTopLevelText, unbalancedTags };
        };
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
                if (opName === 'setText' && /[<>]/.test(op.value)) {
                    return {
                        patch: null,
                        error: `Patch op ${i + 1} setText value appears to contain XML. Use replace/insert ops for element changes.`,
                    };
                }
                if (opName === 'replace' || opName === 'insertBefore' || opName === 'insertAfter') {
                    const shape = analyzeXmlFragmentShape(op.value);
                    if (shape.unbalancedTags) {
                        return { patch: null, error: `Patch op ${i + 1} ${opName} value has unbalanced XML tags.` };
                    }
                    if (shape.hasTopLevelText) {
                        return { patch: null, error: `Patch op ${i + 1} ${opName} value has top-level text; it must contain exactly one XML element.` };
                    }
                    if (shape.topLevelElementCount !== 1) {
                        return {
                            patch: null,
                            error: `Patch op ${i + 1} ${opName} value has ${shape.topLevelElementCount} top-level elements; expected exactly one. Use multiple ops for sibling elements.`,
                        };
                    }
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
        const resolveNodes = (path: string) => {
            try {
                const result = doc.evaluate(path, doc, resolver, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                if (result.snapshotLength < 1) {
                    return { nodes: [] as Node[], error: `XPath "${path}" matched 0 nodes.` };
                }
                const nodes: Node[] = [];
                for (let i = 0; i < result.snapshotLength; i += 1) {
                    const node = result.snapshotItem(i);
                    if (node) {
                        nodes.push(node);
                    }
                }
                return { nodes, error: '' };
            } catch (err) {
                return { nodes: [] as Node[], error: `XPath "${path}" could not be evaluated.` };
            }
        };
        const tryEnsureSetTextTarget = (path: string) => {
            if (!path.includes('/attributes/')) {
                return { nodes: [] as Node[], created: false };
            }
            const segments = path.split('/').filter(Boolean);
            if (segments.length < 2) {
                return { nodes: [] as Node[], created: false };
            }
            for (let prefixLength = segments.length - 1; prefixLength >= 1; prefixLength -= 1) {
                const prefixPath = `/${segments.slice(0, prefixLength).join('/')}`;
                const prefixResult = resolveNodes(prefixPath);
                if (prefixResult.error || prefixResult.nodes.length !== 1) {
                    continue;
                }
                const rootNode = prefixResult.nodes[0];
                if (rootNode.nodeType !== Node.ELEMENT_NODE && rootNode.nodeType !== Node.DOCUMENT_NODE) {
                    continue;
                }
                const missingSegments = segments.slice(prefixLength);
                if (missingSegments.length === 0) {
                    continue;
                }
                if (!missingSegments.every((segment) => /^[A-Za-z_][\w.-]*$/.test(segment))) {
                    continue;
                }
                let current: Node = rootNode;
                for (const segment of missingSegments) {
                    const nextNode = doc.createElement(segment);
                    if (
                        current.nodeType === Node.ELEMENT_NODE
                        && (current as Element).tagName === 'measure'
                        && segment === 'attributes'
                    ) {
                        const firstElementChild = Array.from(current.childNodes).find(
                            (child) => child.nodeType === Node.ELEMENT_NODE,
                        );
                        if (firstElementChild) {
                            current.insertBefore(nextNode, firstElementChild);
                        } else {
                            current.appendChild(nextNode);
                        }
                    } else {
                        current.appendChild(nextNode);
                    }
                    current = nextNode;
                }
                return { nodes: [current], created: true };
            }
            return { nodes: [] as Node[], created: false };
        };
        for (let i = 0; i < patch.ops.length; i += 1) {
            const op = patch.ops[i];
            let { nodes, error } = resolveNodes(op.path);
            if ((error || nodes.length === 0) && op.op === 'setText') {
                const ensured = tryEnsureSetTextTarget(op.path);
                if (ensured.created) {
                    nodes = ensured.nodes;
                    error = '';
                }
            }
            if (op.op === 'delete' && nodes.length === 0 && !error) {
                continue;
            }
            if (error || nodes.length === 0) {
                return { xml: '', error: `Patch op ${i + 1} failed: ${error || 'Target not found.'}` };
            }
            if (op.op === 'setText') {
                for (const node of nodes) {
                    node.textContent = op.value ?? '';
                }
                continue;
            }
            if (op.op === 'setAttr') {
                for (const node of nodes) {
                    if (node.nodeType !== Node.ELEMENT_NODE) {
                        return { xml: '', error: `Patch op ${i + 1} targets a non-element node.` };
                    }
                    (node as Element).setAttribute(op.name ?? '', op.value ?? '');
                }
                continue;
            }
            if (op.op === 'delete') {
                for (let nodeIndex = nodes.length - 1; nodeIndex >= 0; nodeIndex -= 1) {
                    const node = nodes[nodeIndex];
                    if (!node.parentNode) {
                        continue;
                    }
                    node.parentNode.removeChild(node);
                }
                continue;
            }
            if (nodes.length !== 1) {
                return { xml: '', error: `Patch op ${i + 1} failed: XPath "${op.path}" matched ${nodes.length} nodes.` };
            }
            const node = nodes[0];
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

    const applyXmlToScore = async (
        sourceXml: string,
        options?: {
            telemetrySource?: string;
            inputFormat?: string;
            enforceJazzHarmonyStyle?: boolean;
        },
    ) => {
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
        const applyStartedAt = Date.now();
        const applied = await handleFileUpload(file, {
            preserveScoreId: true,
            updateUrl: false,
            telemetrySource: options?.telemetrySource || 'xml_apply',
        });
        if (applied) {
            if (options?.enforceJazzHarmonyStyle) {
                await applyHarmonyDisplayInterpretation(scoreRef.current ?? score, false);
            }
            telemetryCountersRef.current.patchApplies += 1;
            emitEditorTelemetry('score_editor_patch_applied', {
                source: options?.telemetrySource || 'xml_apply',
                input_format: options?.inputFormat || 'musicxml',
                outcome: 'success',
                duration_ms: Math.max(0, Date.now() - applyStartedAt),
            });
            setScoreDirtySinceCheckpoint(willChange);
            setScoreDirtySinceXml(false);
        } else {
            telemetryCountersRef.current.patchApplyFailures += 1;
            emitEditorTelemetry('score_editor_patch_applied', {
                source: options?.telemetrySource || 'xml_apply',
                input_format: options?.inputFormat || 'musicxml',
                outcome: 'failure',
                duration_ms: Math.max(0, Date.now() - applyStartedAt),
            });
        }
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
        const needsXmlForSidebarTab = (
            (xmlSidebarTab === 'assistant' && (aiIncludeXml || (aiMode === 'agent' && musicAgentIncludeCurrentXml)))
            || xmlSidebarTab === 'notagen'
            || xmlSidebarTab === 'harmony'
            || xmlSidebarTab === 'functional'
            || xmlSidebarTab === 'mma'
        );
        if (needsXmlForSidebarTab && !xmlText.trim()) {
            void loadXmlFromScore();
        }
    }, [xmlSidebarTab, aiIncludeXml, musicAgentIncludeCurrentXml, aiMode, xmlText, loadXmlFromScore]);

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

    const handleUrlLoad = async (url: string, signal?: AbortSignal): Promise<boolean> => {
        if (signal?.aborted) {
            return false;
        }
        const loadStartedAt = Date.now();
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

            telemetryCountersRef.current.documentsLoaded += 1;
            emitEditorTelemetry('score_editor_document_loaded', {
                load_source: 'url',
                input_format: format,
                input_bytes: inputByteLength,
                duration_ms: Math.max(0, Date.now() - loadStartedAt),
                progressive_paging: progressivePaging,
                has_more_pages: progressivePaging && progressiveHasMore,
                engine_mode: engineMode,
            });

            // segmentPositions causes a crash in this version of webmscore/emscripten environment
            // We will use DOM-based hit testing on the SVG elements instead.
            return true;
        } catch (err) {
            console.error('Error auto-loading file:', err);
            telemetryCountersRef.current.documentLoadFailures += 1;
            emitEditorTelemetry('score_editor_document_load_failed', {
                load_source: 'url',
                duration_ms: Math.max(0, Date.now() - loadStartedAt),
                error: errorMessage(err),
            });
            return false;
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
            telemetrySource?: string;
        },
    ): Promise<boolean> => {
        clearScheduledBackgroundInit();
        setLoading(true);
        const loadStartedAt = Date.now();
        const uploadStart = performance.now();
        const isLargeUpload = file.size >= LARGE_SCORE_THRESHOLD_BYTES;
        const telemetrySource = options?.telemetrySource || 'file_upload';
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
        let format: InputFileFormat | '' = '';
        let inputByteLength = 0;
        let engineMode: string | undefined;
        let progressivePaging = false;
        let progressiveHasMore = false;
        try {
            logUploadStage('read-buffer:start');
            const buffer = await file.arrayBuffer();
            const data = new Uint8Array(buffer);
            inputByteLength = data.byteLength;
            largeScoreSessionRef.current = isLargeUpload;
            logUploadStage('read-buffer:done', { bytes: inputByteLength });
            format = detectInputFormat(file.name);
            const resolvedEngine = await resolveWebMscoreEngine();
            const WebMscore = resolvedEngine.webMscore;
            engineMode = resolvedEngine.mode;
            logUploadStage('webmscore-ready', { engineMode });

            // But wait, we need to destroy previous score if exists
            if (score) {
                score.destroy();
            }

            const loadResult = await loadScoreWithInitialLayout(WebMscore, format, data);
            const { loadedScore, progressivePaging: nextProgressivePaging, progressiveHasMore: nextProgressiveHasMore, initialAvailablePages } = loadResult;
            progressivePaging = nextProgressivePaging;
            progressiveHasMore = nextProgressiveHasMore;
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
            telemetryCountersRef.current.documentsLoaded += 1;
            emitEditorTelemetry('score_editor_document_loaded', {
                load_source: telemetrySource,
                input_format: format,
                input_bytes: inputByteLength,
                duration_ms: Math.max(0, Date.now() - loadStartedAt),
                progressive_paging: progressivePaging,
                has_more_pages: progressivePaging && progressiveHasMore,
                engine_mode: engineMode,
            });
            return true;

        } catch (err) {
            console.error('Error loading file:', err);
            alert('Failed to load score. See console for details.');
            telemetryCountersRef.current.documentLoadFailures += 1;
            emitEditorTelemetry('score_editor_document_load_failed', {
                load_source: telemetrySource,
                input_format: format || undefined,
                input_bytes: inputByteLength || undefined,
                duration_ms: Math.max(0, Date.now() - loadStartedAt),
                engine_mode: engineMode,
                error: errorMessage(err),
            });
            return false;
        } finally {
            setLoading(false);
        }
    };

    const handleLoadScoreUpload = (file: File) => handleFileUpload(file, {
        createInitialCheckpoint: true,
        telemetrySource: 'file_upload',
    });

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

    async function applyHarmonyDisplayInterpretation(targetScore: Score | null, literal: boolean): Promise<boolean> {
        if (!targetScore?.setHarmonyVoiceLiteral && !targetScore?.setChordSymbolStylePreset) {
            console.warn('Harmony display interpretation mutation is not available in this WASM build.');
            return false;
        }
        try {
            if (targetScore.setHarmonyVoiceLiteral) {
                await targetScore.setHarmonyVoiceLiteral(literal);
            }
            if (targetScore.setChordSymbolStylePreset) {
                await targetScore.setChordSymbolStylePreset(literal ? 'std' : 'jazz');
            }
            if (targetScore.relayout) {
                await targetScore.relayout();
            }
            await renderScore(targetScore, currentPageRef.current);
            return true;
        } catch (err) {
            console.warn('Failed to update harmony display interpretation', err);
            return false;
        }
    }

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
            const message = errorMessage(err).toLowerCase();
            if (message.includes('table index is out of bounds')) {
                console.warn('Compare score render failed (WASM table bounds). The proposal may contain invalid MusicXML.', err);
            } else {
                console.error('Error rendering compare score:', err);
            }
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
    ): Promise<boolean> => {
        if (compareSwapBusy) {
            return false;
        }
        if (!sourceScore || !targetScore) {
            return false;
        }
        if (pairs.length === 0) {
            return false;
        }

        setCompareSwapBusy(true);
        try {
            const fallbackSourceXml = sourceScore === score ? compareView?.currentXml ?? null : compareView?.checkpointXml ?? null;
            const fallbackTargetXml = targetScore === score ? compareView?.currentXml ?? null : compareView?.checkpointXml ?? null;
            const sourceXml = fallbackSourceXml ?? await getScoreMusicXmlText(sourceScore, null);
            const targetXml = fallbackTargetXml ?? await getScoreMusicXmlText(targetScore, null);
            if (!sourceXml || !targetXml) {
                console.warn('Compare overwrite: unable to load MusicXML for swap.');
                return false;
            }

            const patched = replaceMeasuresInMusicXml(
                sourceXml,
                targetXml,
                partIndex,
                pairs.map((pair) => ({ sourceIndex: pair.leftIndex, targetIndex: pair.rightIndex })),
            );
            if (patched.error || !patched.xml) {
                console.warn('Compare overwrite failed:', patched.error || 'Unknown error');
                return false;
            }

            if (targetScore === score) {
                await applyXmlToScore(patched.xml, { telemetrySource: 'compare_overwrite' });
                setCompareView((prev) => (prev ? { ...prev, currentXml: patched.xml } : prev));
            } else {
                setCompareView((prev) => (prev ? { ...prev, checkpointXml: patched.xml } : prev));
            }
            setCompareAlignmentRevision((value) => value + 1);
            return true;
        } catch (err) {
            console.warn('Compare overwrite failed:', err);
            return false;
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

    const handleAcceptAllAiChanges = useCallback(async () => {
        if (!compareView || compareView.title !== 'Assistant Proposal') {
            return;
        }
        const rightScore = compareRightScoreRef.current;
        if (!score || !rightScore) {
            return;
        }
        if (compareSwapBusy) {
            return;
        }
        for (const alignment of compareAlignments) {
            const blocks = buildMismatchBlocks(alignment.rows);
            for (const block of blocks) {
                const pairs = alignment.rows
                    .slice(block.start, block.end + 1)
                    .map((row) => (
                        row.leftIndex !== null && row.rightIndex !== null
                            ? { leftIndex: row.rightIndex, rightIndex: row.leftIndex }
                            : null
                    ))
                    .filter((pair): pair is { leftIndex: number; rightIndex: number } => Boolean(pair));
                if (pairs.length === 0) {
                    continue;
                }
                await handleCompareOverwriteBlock(rightScore, score, alignment.partIndex, pairs);
            }
        }
    }, [
        compareView,
        compareSwapBusy,
        score,
        compareAlignments,
        buildMismatchBlocks,
        handleCompareOverwriteBlock,
    ]);

    const setAiDiffBlockStatus = useCallback((block: AiDiffBlockRef, status: BlockReviewStatus) => {
        setAiDiffReviews((prev) => {
            const existing = prev.find((review) => review.blockKey === block.blockKey);
            if (existing) {
                return prev.map((review) => (
                    review.blockKey === block.blockKey
                        ? {
                            ...review,
                            status,
                            comment: status === 'comment' ? review.comment : '',
                            commentCommitted: false,
                        }
                        : review
                ));
            }
            return [
                ...prev,
                {
                    partIndex: block.partIndex,
                    blockIndex: block.blockIndex,
                    blockKey: block.blockKey,
                    measureRange: block.measureRange,
                    status,
                    comment: '',
                    commentCommitted: false,
                },
            ];
        });
    }, []);

    const handleAiDiffBlockCommentInput = useCallback((block: AiDiffBlockRef) => {
        setAiDiffBlockErrors((prev) => {
            if (!prev[block.blockKey]) {
                return prev;
            }
            const next = { ...prev };
            delete next[block.blockKey];
            return next;
        });
    }, []);

    const getAiDiffBlockCommentValue = useCallback((block: AiDiffBlockRef, fallback = '') => {
        const textarea = aiDiffCommentTextareaRefs.current.get(block.blockKey);
        if (textarea) {
            return textarea.value;
        }
        return fallback;
    }, []);

    const commitAiDiffBlockComment = useCallback((block: AiDiffBlockRef) => {
        const existing = aiDiffReviewByKey.get(block.blockKey)
            ?? aiDiffReviewByRange.get(`${block.partIndex}:${block.measureRange}`);
        const nextComment = getAiDiffBlockCommentValue(block, existing?.comment ?? '');
        const trimmed = nextComment.trim();
        if (!trimmed) {
            setAiDiffBlockErrors((prev) => ({
                ...prev,
                [block.blockKey]: 'Enter a comment before clicking Enter.',
            }));
            return;
        }
        setAiDiffReviews((prev) => prev.map((review) => (
            review.blockKey === block.blockKey
                ? { ...review, status: 'comment', comment: trimmed, commentCommitted: true }
                : review
        )));
        setAiDiffBlockErrors((prev) => {
            if (!prev[block.blockKey]) {
                return prev;
            }
            const next = { ...prev };
            delete next[block.blockKey];
            return next;
        });
    }, [aiDiffReviewByKey, aiDiffReviewByRange, getAiDiffBlockCommentValue]);

    const editAiDiffBlockComment = useCallback((block: AiDiffBlockRef) => {
        setAiDiffReviews((prev) => prev.map((review) => (
            review.blockKey === block.blockKey
                ? { ...review, status: 'comment', commentCommitted: false }
                : review
        )));
    }, []);

    const handleAiDiffCommentResize = useCallback((element: HTMLTextAreaElement) => {
        if (!isAiCompareMode) {
            return;
        }
        const explicitWidth = Number.parseFloat(element.style.width || '');
        if (!Number.isFinite(explicitWidth) || explicitWidth <= 0) {
            return;
        }
        const nextWidth = Math.round(explicitWidth + AI_DIFF_COMMENT_GUTTER_PADDING);
        if (!Number.isFinite(nextWidth)) {
            return;
        }
        const clampedWidth = Math.min(AI_DIFF_GUTTER_MAX_WIDTH, Math.max(AI_DIFF_GUTTER_MIN_WIDTH, nextWidth));
        setAiDiffGutterWidth((prev) => (Math.abs(prev - clampedWidth) >= 2 ? clampedWidth : prev));
    }, [isAiCompareMode]);

    const bindAiDiffCommentTextarea = useCallback((blockKey: string, element: HTMLTextAreaElement | null) => {
        const refs = aiDiffCommentTextareaRefs.current;
        const observer = aiDiffCommentResizeObserverRef.current;
        const previous = refs.get(blockKey);
        if (previous && previous !== element) {
            observer?.unobserve(previous);
            refs.delete(blockKey);
        }
        if (!element) {
            if (previous) {
                observer?.unobserve(previous);
            }
            refs.delete(blockKey);
            return;
        }
        refs.set(blockKey, element);
        observer?.observe(element);
        handleAiDiffCommentResize(element);
    }, [handleAiDiffCommentResize]);

    useEffect(() => {
        if (typeof ResizeObserver === 'undefined') {
            return;
        }
        const observer = new ResizeObserver((entries) => {
            if (!isAiCompareMode) {
                return;
            }
            let nextWidth = aiDiffGutterWidth;
            entries.forEach((entry) => {
                const target = entry.target as HTMLTextAreaElement;
                const explicitWidth = Number.parseFloat(target.style.width || '');
                if (!Number.isFinite(explicitWidth) || explicitWidth <= 0) {
                    return;
                }
                nextWidth = Math.max(nextWidth, Math.round(explicitWidth + AI_DIFF_COMMENT_GUTTER_PADDING));
            });
            const clampedWidth = Math.min(AI_DIFF_GUTTER_MAX_WIDTH, Math.max(AI_DIFF_GUTTER_MIN_WIDTH, nextWidth));
            setAiDiffGutterWidth((prev) => (Math.abs(prev - clampedWidth) >= 2 ? clampedWidth : prev));
        });
        aiDiffCommentResizeObserverRef.current = observer;
        aiDiffCommentTextareaRefs.current.forEach((element) => observer.observe(element));
        return () => {
            observer.disconnect();
            if (aiDiffCommentResizeObserverRef.current === observer) {
                aiDiffCommentResizeObserverRef.current = null;
            }
        };
    }, [isAiCompareMode, aiDiffGutterWidth]);

    const handleAcceptAiDiffBlock = useCallback(async (
        block: AiDiffBlockRef,
        pairs: Array<{ leftIndex: number; rightIndex: number }>,
    ) => {
        if (!compareLeftScore || !compareRightScoreDisplay) {
            return;
        }
        setAiDiffBlockStatus(block, 'accepted');
        setAiDiffBlockErrors((prev) => {
            if (!prev[block.blockKey]) {
                return prev;
            }
            const next = { ...prev };
            delete next[block.blockKey];
            return next;
        });
        const applied = await handleCompareOverwriteBlock(
            compareRightScoreDisplay,
            compareLeftScore,
            block.partIndex,
            pairs.map((pair) => ({
                leftIndex: pair.rightIndex,
                rightIndex: pair.leftIndex,
            })),
        );
        if (!applied) {
            setAiDiffBlockStatus(block, 'pending');
            setAiDiffBlockErrors((prev) => ({
                ...prev,
                [block.blockKey]: 'Could not apply this block. Please retry.',
            }));
            return;
        }
        setAiDiffBlockErrors((prev) => {
            if (!prev[block.blockKey]) {
                return prev;
            }
            const next = { ...prev };
            delete next[block.blockKey];
            return next;
        });
    }, [
        compareLeftScore,
        compareRightScoreDisplay,
        handleCompareOverwriteBlock,
        setAiDiffBlockStatus,
    ]);

    const handleSendDiffFeedback = useCallback(async () => {
        if (!compareView || !isAiCompareMode || aiDiffFeedbackBusy) {
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

        const acceptedReviews = aiDiffReviews.filter((review) => getReviewStatusForFeedback(review) === 'accepted');
        const blockMap = new Map<string, {
            partIndex: number;
            measureRange: string;
            status: BlockReviewStatus;
            comment?: string;
        }>();
        acceptedReviews.forEach((review) => {
            blockMap.set(review.blockKey, {
                partIndex: review.partIndex,
                measureRange: review.measureRange,
                status: review.status,
                comment: review.comment,
            });
        });
        aiDiffCurrentBlocks.forEach((block) => {
            const review = aiDiffReviewByKey.get(block.blockKey)
                ?? aiDiffReviewByRange.get(`${block.partIndex}:${block.measureRange}`);
            const status = getReviewStatusForFeedback(review);
            blockMap.set(block.blockKey, {
                partIndex: block.partIndex,
                measureRange: block.measureRange,
                status,
                comment: review?.comment ?? '',
            });
        });
        const feedbackEntries = Array.from(blockMap.entries()).map(([blockKey, block]) => ({
            blockKey,
            ...block,
        }));
        const feedbackBlocks = feedbackEntries.map((block) => ({
            partIndex: block.partIndex,
            measureRange: block.measureRange,
            status: block.status,
            ...(block.status === 'comment' ? { comment: (block.comment || '').trim() } : {}),
        }));
        const commentBlockKeys = feedbackEntries
            .filter((block) => block.status === 'comment')
            .map((block) => block.blockKey);
        if (!feedbackBlocks.length) {
            return;
        }

        const currentXml = await getScoreMusicXmlText(scoreRef.current ?? score, compareView.currentXml);
        if (!currentXml?.trim()) {
            const message = 'Unable to export the current score for feedback.';
            setAiError(message);
            setAiDiffFeedbackError(message);
            setCompareRightError(message);
            return;
        }
        const previousCheckpointXml = compareView.checkpointXml;
        setAiDiffFeedbackBusy(true);
        setAiError(null);
        setAiPatchError(null);
        setAiDiffFeedbackError(null);
        setXmlSidebarTab('assistant');
        setXmlSidebarMode((prev) => (prev === 'closed' ? 'open' : prev));
        setCompareView(null);
        setCompareRightLoading(false);
        setCompareRightError(null);
        try {
            const response = await fetch(resolveScoreEditorApiPath('/api/music/diff/feedback'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    content: currentXml,
                    blocks: feedbackBlocks,
                    globalComment: aiDiffGlobalComment,
                    iteration: aiDiffIteration,
                    provider: aiProvider,
                    model: aiModel.trim(),
                    apiKey: aiApiKey.trim(),
                    chatHistory: aiChatMessages,
                }),
            });
            captureApiTraceContext(response.headers);
            const payload = await response.json().catch(() => ({}));
            const result = asRecord(payload) || {};
            if (!response.ok) {
                if (result.patch && typeof result.patch === 'object') {
                    setAiOutput(JSON.stringify(result.patch, null, 2));
                }
                const message = typeof result.error === 'string'
                    ? result.error
                    : `Request failed: ${response.status}`;
                throw new Error(message);
            }

            const patchPayload = asRecord(result.patch);
            const parsedPatch = parseMusicXmlPatch(JSON.stringify(patchPayload || {}));
            if (parsedPatch.error || !parsedPatch.patch) {
                throw new Error(parsedPatch.error || 'Service returned an invalid patch payload.');
            }
            const proposedXml = typeof result.proposedXml === 'string' ? result.proposedXml.trim() : '';
            if (!proposedXml) {
                throw new Error('Service returned empty proposed MusicXML.');
            }

            setAiOutput(JSON.stringify(parsedPatch.patch, null, 2));
            setAiPatch(parsedPatch.patch);
            setAiPatchError(null);
            setAiPatchedXml(proposedXml);
            setAiBaseXml(currentXml);
            setCompareSwapped(false);
            setCompareView({
                title: 'Assistant Proposal',
                currentXml,
                checkpointXml: proposedXml,
            });
            setAiDiffIteration(typeof result.iteration === 'number' ? result.iteration : aiDiffIteration + 1);
            setAiDiffReviews((prev) => prev.filter((review) => review.status === 'accepted'));
            setAiDiffGlobalComment('');
            setAiDiffFeedbackError(null);
            setAiDiffBlockErrors({});
            setCompareAlignmentRevision((value) => value + 1);
        } catch (err) {
            const rawMessage = errorMessage(err) || 'Failed to request revised proposal.';
            const surfacedMessage = formatAiDiffFeedbackError(rawMessage);
            setAiError(surfacedMessage);
            setAiDiffFeedbackError(surfacedMessage);
            setCompareRightError(surfacedMessage);
            if (commentBlockKeys.length > 0) {
                setAiDiffBlockErrors((prev) => {
                    const next = { ...prev };
                    commentBlockKeys.forEach((blockKey) => {
                        next[blockKey] = surfacedMessage;
                    });
                    return next;
                });
            }
            setCompareView({
                title: 'Assistant Proposal',
                currentXml,
                checkpointXml: previousCheckpointXml,
            });
        } finally {
            setAiDiffFeedbackBusy(false);
            setCompareRightLoading(false);
        }
    }, [
        compareView,
        isAiCompareMode,
        aiDiffFeedbackBusy,
        aiApiKey,
        aiModel,
        aiProvider,
        aiDiffReviews,
        aiDiffCurrentBlocks,
        aiDiffReviewByKey,
        aiDiffReviewByRange,
        getReviewStatusForFeedback,
        aiDiffGlobalComment,
        aiDiffIteration,
        aiChatMessages,
        captureApiTraceContext,
        parseMusicXmlPatch,
        getScoreMusicXmlText,
        score,
    ]);

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
            pickup: newScoreWithPickup ? { numerator: newScorePickupNumerator, denominator: newScorePickupDenominator } : undefined,
        });
        const filenameBase = newScoreTitle.trim() ? toSafeFilename(newScoreTitle) : 'new_score';
        const file = new File([new TextEncoder().encode(xml)], `${filenameBase}.musicxml`, {
            type: 'application/xml',
        });
        setNewScoreDialogOpen(false);
        const nextScoreId = `new:${crypto.randomUUID()}`;
        setScoreId(nextScoreId);
        updateUrlScoreId(nextScoreId);
        await handleFileUpload(file, {
            scoreIdOverride: nextScoreId,
            updateUrl: false,
            telemetrySource: 'new_score',
        });
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
            await handleFileUpload(file, {
                preserveScoreId: true,
                updateUrl: false,
                telemetrySource: 'checkpoint_restore',
            });
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
            if (!aiDiffFeedbackBusy) {
                setAiDiffReviews([]);
                setAiDiffIteration(0);
                setAiDiffGlobalComment('');
                setAiDiffFeedbackError(null);
                setAiDiffBlockErrors({});
                setAiDiffGutterWidth(AI_DIFF_GUTTER_DEFAULT_WIDTH);
            }
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
    }, [compareView, parsePartsFromMetadata, aiDiffFeedbackBusy]);

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
                    setCompareRightError('Unable to render compare score. The proposal may contain invalid MusicXML.');
                    return;
                }
                syncCompareSvgSize(compareRightContainerRef.current, setCompareRightSvgSize);
                void refreshMeasurePositions(compareRightScoreDisplay, setCompareRightMeasurePositions)
                    .then((ok) => {
                        if (!ok && isCheckpoint) {
                            setCompareRightError((prev) => prev ?? 'Unable to compute compare highlights for checkpoint score.');
                        }
                    });
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
                        void refreshMeasurePositions(compareRightScore, setCompareRightMeasurePositions)
                            .then((ok) => {
                                if (!ok) {
                                    setCompareRightError((prev) => prev ?? 'Unable to compute compare highlights for checkpoint score.');
                                }
                            });
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
            const rightPositionsOk = await refreshMeasurePositions(compareRightScore, setCompareRightMeasurePositions);
            if (!rightPositionsOk) {
                setCompareRightError((prev) => prev ?? 'Unable to compute compare highlights for checkpoint score.');
            }
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
        if (!isAiCompareMode) {
            return;
        }
        const currentKeys = new Set(aiDiffCurrentBlocks.map((block) => block.blockKey));
        const currentRangeKeys = new Set(aiDiffCurrentBlocks.map((block) => `${block.partIndex}:${block.measureRange}`));
        setAiDiffReviews((prev) => {
            const next = prev
                .filter((review) => (
                    review.status === 'accepted'
                    || currentKeys.has(review.blockKey)
                    || currentRangeKeys.has(`${review.partIndex}:${review.measureRange}`)
                ))
                .map((review) => {
                    const current = aiDiffCurrentBlocks.find((block) => (
                        block.blockKey === review.blockKey
                        || `${block.partIndex}:${block.measureRange}` === `${review.partIndex}:${review.measureRange}`
                    ));
                    if (!current) {
                        return review;
                    }
                    return {
                        ...review,
                        partIndex: current.partIndex,
                        blockIndex: current.blockIndex,
                        measureRange: current.measureRange,
                    };
                });
            aiDiffCurrentBlocks.forEach((block) => {
                if (!next.some((review) => (
                    review.blockKey === block.blockKey
                    || `${review.partIndex}:${review.measureRange}` === `${block.partIndex}:${block.measureRange}`
                ))) {
                    next.push({
                        partIndex: block.partIndex,
                        blockIndex: block.blockIndex,
                        blockKey: block.blockKey,
                        measureRange: block.measureRange,
                        status: 'pending',
                        comment: '',
                        commentCommitted: false,
                    });
                }
            });
            return next;
        });
    }, [isAiCompareMode, aiDiffCurrentBlocks]);

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
            await applyXmlToScore(xmlText, { telemetrySource: 'manual_xml' });
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
            captureApiTraceContext(response.headers);
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
        const firstParsed = firstExtracted ? parseMusicXmlPatch(firstExtracted) : { patch: null, error: 'missing' };
        if (firstExtracted && !firstParsed.error && firstParsed.patch) {
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

        const retryHint = firstParsed.error && firstParsed.error !== 'missing'
            ? [
                'PREVIOUS PATCH ERROR:',
                firstParsed.error,
                'Fix the patch structure and return valid JSON only.',
            ].join('\n')
            : '';
        const retryPromptText = [payload.promptText.trim(), retryHint, AI_PATCH_STRICT_RETRY_SUFFIX]
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

    const openAiProposalCompare = useCallback((baseXml: string, proposedXml: string) => {
        const trimmedBase = baseXml.trim();
        const trimmedProposed = proposedXml.trim();
        if (!trimmedBase || !trimmedProposed) {
            return false;
        }
        setCompareSwapped(false);
        setAiDiffIteration(0);
        setAiDiffReviews([]);
        setAiDiffGlobalComment('');
        setAiDiffFeedbackBusy(false);
        setAiDiffFeedbackError(null);
        setAiDiffBlockErrors({});
        setAiDiffGutterWidth(AI_DIFF_GUTTER_DEFAULT_WIDTH);
        setCompareView({
            title: 'Assistant Proposal',
            currentXml: trimmedBase,
            checkpointXml: trimmedProposed,
        });
        return true;
    }, []);

    const updateAiOutput = useCallback(async (
        nextText: string,
        baseXmlOverride?: string,
    ): Promise<{ ok: boolean; baseXml: string; proposedXml: string; error: string }> => {
        setAiOutput(nextText);
        setAiPatch(null);
        setAiPatchError(null);
        setAiPatchedXml('');
        if (!nextText.trim()) {
            const error = 'AI output is empty.';
            setAiPatchError(error);
            return { ok: false, baseXml: '', proposedXml: '', error };
        }
        const parsed = parseMusicXmlPatch(nextText);
        if (parsed.error || !parsed.patch) {
            const error = parsed.error || 'Invalid patch payload.';
            setAiPatchError(error);
            return { ok: false, baseXml: '', proposedXml: '', error };
        }
        setAiPatch(parsed.patch);
        const baseXml = baseXmlOverride ?? aiBaseXml ?? await resolveXmlContext();
        if (!baseXml.trim()) {
            const error = 'Unable to apply patch without MusicXML.';
            setAiPatchError(error);
            return { ok: false, baseXml: '', proposedXml: '', error };
        }
        const applied = applyMusicXmlPatch(baseXml, parsed.patch);
        if (applied.error || !applied.xml.trim()) {
            const error = applied.error || 'Failed to apply patch to MusicXML.';
            setAiPatchError(error);
            return { ok: false, baseXml: baseXml.trim(), proposedXml: '', error };
        }
        setAiPatchError(null);
        setAiPatchedXml(applied.xml);
        return { ok: true, baseXml: baseXml.trim(), proposedXml: applied.xml.trim(), error: '' };
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
        const requestStartedAt = Date.now();
        let requestIssued = false;
        let outcome: 'success' | 'failure' = 'failure';
        let failureReason = '';
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
            requestIssued = true;
            telemetryCountersRef.current.aiRequests += 1;
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
                const missingPatchMessage = patchResponse.retried
                    ? 'No patch was returned by the model after a retry with stricter JSON instructions.'
                    : 'No patch was returned by the model.';
                failureReason = missingPatchMessage;
                setAiOutput(patchResponse.rawText || '');
                setAiError(missingPatchMessage);
                return;
            }
            const updated = await updateAiOutput(patchResponse.extracted, baseXml);
            if (!updated.ok) {
                failureReason = updated.error || 'Failed to build proposed MusicXML from patch.';
                setAiError(failureReason);
                return;
            }
            if (!openAiProposalCompare(updated.baseXml, updated.proposedXml)) {
                failureReason = 'Unable to open compare view for AI proposal.';
                setAiError(failureReason);
                return;
            }
            outcome = 'success';
        } catch (err) {
            console.error('AI request failed', err);
            const message = errorMessage(err);
            failureReason = message || 'AI request failed. See console for details.';
            setAiError(message || 'AI request failed. See console for details.');
        } finally {
            setAiBusy(false);
            if (requestIssued) {
                if (outcome === 'failure') {
                    telemetryCountersRef.current.aiFailures += 1;
                }
                emitEditorTelemetry('score_editor_ai_request', {
                    channel: 'assistant_patch',
                    provider: aiProvider,
                    model: aiModel,
                    outcome,
                    duration_ms: Math.max(0, Date.now() - requestStartedAt),
                    error: outcome === 'failure' ? failureReason || undefined : undefined,
                });
            }
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
        const requestStartedAt = Date.now();
        let requestIssued = false;
        let outcome: 'success' | 'failure' = 'failure';
        let failureReason = '';
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
            requestIssued = true;
            telemetryCountersRef.current.aiRequests += 1;
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
                failureReason = 'No response was returned by the model.';
                setAiError(failureReason);
                return;
            }
            setAiChatMessages((prev) => [...prev, { role: 'assistant', text: responseText }]);
            outcome = 'success';
        } catch (err) {
            console.error('AI chat request failed', err);
            const message = errorMessage(err);
            failureReason = message || 'AI chat request failed. See console for details.';
            setAiError(failureReason);
        } finally {
            setAiBusy(false);
            if (requestIssued) {
                if (outcome === 'failure') {
                    telemetryCountersRef.current.aiFailures += 1;
                }
                emitEditorTelemetry('score_editor_ai_request', {
                    channel: 'assistant_chat',
                    provider: aiProvider,
                    model: aiModel,
                    outcome,
                    duration_ms: Math.max(0, Date.now() - requestStartedAt),
                    error: outcome === 'failure' ? failureReason || undefined : undefined,
                });
            }
        }
    };

    const postScoreEditorJson = useCallback(async (path: string, body: Record<string, unknown>) => {
        const response = await fetch(resolveScoreEditorApiPath(path), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        captureApiTraceContext(response.headers);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            const payloadRecord = asRecord(payload);
            const payloadError = asRecord(payloadRecord?.error);
            const message = typeof payloadRecord?.error === 'string'
                ? String(payloadRecord.error)
                : (typeof payloadError?.message === 'string'
                    ? payloadError.message
                    : `Request failed: ${response.status}`);
            throw new Error(message);
        }
        return asRecord(payload) || {};
    }, [captureApiTraceContext]);

    const handleMusicAgentSend = async () => {
        const prompt = (musicAgentPromptRef.current?.value ?? '').trim();
        if (!prompt) {
            alert('Enter a prompt for the Agent.');
            return;
        }

        setMusicAgentBusy(true);
        setMusicAgentError(null);
        setMusicAgentResult(null);
        setMusicAgentPatch(null);
        setMusicAgentPatchError(null);
        setMusicAgentPatchedXml('');
        const requestStartedAt = Date.now();
        let requestIssued = false;
        let outcome: 'success' | 'failure' = 'failure';
        let failureReason = '';
        let selectedTool = '';
        try {
            let xmlContext = '';
            if (musicAgentIncludeCurrentXml) {
                xmlContext = await resolveXmlContext();
                if (!xmlContext.trim()) {
                    alert('Load a score before including MusicXML context.');
                    return;
                }
            }

            const toolInput: Record<string, unknown> = {};
            if (scoreSessionId) {
                const sessionDefaults = {
                    scoreSessionId,
                    baseRevision: scoreRevision,
                };
                toolInput.context = { ...sessionDefaults, includeAbc: true };
                toolInput.convert = { ...sessionDefaults, inputFormat: 'musicxml', outputFormat: 'abc', includeContent: true };
                toolInput.patch = { ...sessionDefaults, prompt, model: aiModel.trim() || undefined, apiKey: aiApiKey.trim() || undefined };
                toolInput.scoreops = { ...sessionDefaults, prompt, options: { includeXml: true, includeMeasureDiff: true } };
                toolInput.render = { ...sessionDefaults };
            } else if (xmlContext.trim()) {
                toolInput.context = {
                    content: xmlContext,
                    includeAbc: true,
                };
                toolInput.convert = {
                    inputFormat: 'musicxml',
                    outputFormat: 'abc',
                    content: xmlContext,
                    includeContent: true,
                };
                toolInput.patch = {
                    content: xmlContext,
                    prompt,
                    model: aiModel.trim() || undefined,
                    apiKey: aiApiKey.trim() || undefined,
                };
                toolInput.scoreops = {
                    content: xmlContext,
                    prompt,
                    options: {
                        includeXml: true,
                        includeMeasureDiff: true,
                    },
                };
                toolInput.render = {
                    content: xmlContext,
                };
            }

            let finalPrompt: string | Array<Record<string, any>> = prompt;
            if (musicAgentFiles.length > 0) {
                const promptParts: Array<Record<string, any>> = [
                    { type: 'input_text', text: prompt }
                ];
                for (const file of musicAgentFiles) {
                    const base64 = await fileToBase64(file);
                    const isImage = file.type.startsWith('image/');
                    promptParts.push({
                        type: isImage ? 'input_image' : 'input_file',
                        [isImage ? 'image' : 'file']: { url: base64 },
                        filename: file.name
                    });
                }
                finalPrompt = promptParts;
            }

            const payload: Record<string, unknown> = {
                prompt: finalPrompt,
                provider: aiProvider,
                maxTurns: Math.max(1, Math.floor(musicAgentMaxTurns) || 1),
            };
            const model = aiModel.trim();
            if (model) {
                payload.model = model;
            }
            if (musicAgentUseFallbackOnly) {
                payload.useFallbackOnly = true;
            }
            // Pass API key at top level for router to use Agents SDK path
            const apiKey = aiApiKey.trim();
            if (apiKey) {
                payload.apiKey = apiKey;
            }
            if (Object.keys(toolInput).length > 0) {
                payload.toolInput = toolInput;
            }

            if (musicAgentPromptRef.current) musicAgentPromptRef.current.value = '';
            const attachedFiles = [...musicAgentFiles];
            setMusicAgentFiles([]);
            setMusicAgentThread((prev) => [
                ...prev,
                {
                    role: 'user',
                    text: prompt + (attachedFiles.length > 0 ? `\n\n[Attached: ${attachedFiles.map(f => f.name).join(', ')}]` : '')
                }
            ]);

            requestIssued = true;
            telemetryCountersRef.current.aiRequests += 1;
            const response = await fetch(resolveScoreEditorApiPath('/api/music/agent'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });
            captureApiTraceContext(response.headers);
            const parsedPayload = await response.json().catch(() => ({}));
            const parsed = asRecord(parsedPayload) || {};
            setMusicAgentResult(parsed);

            // Handle session_not_found by clearing local session state to trigger re-open on next turn
            if (parsed.error?.toString().includes('session_not_found')) {
                setScoreSessionId(null);
                setScoreRevision(0);
                console.warn('[session] Server session not found; cleared local session ID.');
            }

            selectedTool = typeof parsed?.selectedTool === 'string' ? parsed.selectedTool : '';
            // Parse result from JSON string if needed (structured output compatibility)
            let parsedResult: unknown;
            const raw = parsed?.result;
            if (typeof raw === 'string' && raw.trim()) {
                try {
                    parsedResult = JSON.parse(raw);
                } catch {
                    parsedResult = {};
                }
            } else {
                parsedResult = raw;
            }

            const shouldApplyAnalysisResult = parsed?.applyToScore === true;

            // Sync score revision if returned in tool result
            const resBody = asRecord(asRecord(parsedResult)?.body);
            if (typeof resBody?.newRevision === 'number') {
                setScoreRevision(resBody.newRevision);
            } else if (typeof resBody?.revision === 'number') {
                setScoreRevision(resBody.revision);
            }

            if (selectedTool === 'music.patch') {
                const resultPayload = asRecord(parsedResult);
                const maybePatch = asRecord(resultPayload?.patch);
                if (maybePatch) {
                    const parsedPatch = parseMusicXmlPatch(JSON.stringify(maybePatch));
                    if (parsedPatch.patch) {
                        setMusicAgentPatch(parsedPatch.patch);
                        const baseXml = xmlContext.trim() ? xmlContext : await resolveXmlContext();
                        if (!baseXml.trim()) {
                            setMusicAgentPatchError('Unable to load MusicXML for patch preview.');
                        } else {
                            const applied = applyMusicXmlPatch(baseXml, parsedPatch.patch);
                            if (applied.error) {
                                setMusicAgentPatchError(applied.error);
                            } else {
                                setMusicAgentPatchedXml(applied.xml);
                            }
                        }
                    } else {
                        setMusicAgentPatchError(parsedPatch.error || 'Agent returned an invalid patch payload.');
                    }
                } else if (resultPayload && typeof resultPayload.error === 'string') {
                    setMusicAgentPatchError(resultPayload.error);
                }
            } else if (selectedTool === 'music.diff_feedback') {
                const resultPayload = asRecord(parsedResult);
                const bodyPayload = asRecord(resultPayload?.body);
                const patchPayload = asRecord(bodyPayload?.patch);
                const proposedXml = typeof bodyPayload?.proposedXml === 'string' ? bodyPayload.proposedXml : '';
                if (patchPayload) {
                    const parsedPatch = parseMusicXmlPatch(JSON.stringify(patchPayload));
                    if (parsedPatch.patch) {
                        setMusicAgentPatch(parsedPatch.patch);
                    } else {
                        setMusicAgentPatchError(parsedPatch.error || 'Diff feedback returned an invalid patch payload.');
                    }
                }
                if (proposedXml.trim()) {
                    const baseXml = await resolveXmlContext();
                    setMusicAgentPatchedXml(proposedXml);
                    void openAiProposalCompare(baseXml, proposedXml);
                    if (typeof bodyPayload?.iteration === 'number') {
                        setAiDiffIteration(bodyPayload.iteration);
                    }
                } else if (typeof bodyPayload?.error === 'string' && bodyPayload.error.trim()) {
                    setMusicAgentPatchError(bodyPayload.error.trim());
                }
            } else if (selectedTool === 'music.scoreops') {
                const resultPayload = asRecord(parsedResult);
                // Handle both direct service response (body.output.content) and nested execution format
                const bodyPayload = asRecord(resultPayload?.body);
                const outputPayload = asRecord(bodyPayload?.output);
                const executionPayload = asRecord(resultPayload?.execution);
                const executionOutput = asRecord(executionPayload?.output);
                const nextXml = typeof outputPayload?.content === 'string'
                    ? outputPayload.content
                    : (typeof executionOutput?.content === 'string'
                        ? executionOutput.content
                        : '');
                if (nextXml.trim()) {
                    try {
                        await applyXmlToScore(nextXml, { telemetrySource: 'music_agent_scoreops' });
                        setXmlSidebarTab('xml');
                    } catch (applyErr) {
                        console.error('Failed to apply Music Agent scoreops output', applyErr);
                        setMusicAgentPatchError('ScoreOps output was generated but could not be applied to the score.');
                    }
                } else if (typeof asRecord(bodyPayload?.error)?.message === 'string') {
                    setMusicAgentPatchError(String(asRecord(bodyPayload?.error)?.message));
                } else if (typeof asRecord(resultPayload?.error)?.message === 'string') {
                    setMusicAgentPatchError(String(asRecord(resultPayload?.error)?.message));
                }
            } else if (selectedTool === 'music.harmony_analyze') {
                const resultPayload = asRecord(parsedResult);
                const bodyPayload = asRecord(resultPayload?.body);
                const contentPayload = asRecord(bodyPayload?.content);
                const nextXml = typeof contentPayload?.musicxml === 'string' ? contentPayload.musicxml : '';
                if (shouldApplyAnalysisResult && nextXml.trim()) {
                    try {
                        await applyXmlToScore(nextXml, {
                            telemetrySource: 'music_agent_harmony_analyze',
                            inputFormat: 'musicxml',
                            enforceJazzHarmonyStyle: true,
                        });
                        setXmlSidebarTab('xml');
                    } catch (applyErr) {
                        console.error('Failed to apply Music Agent harmony analysis output', applyErr);
                        setMusicAgentPatchError('Harmony analysis output was generated but could not be applied to the score.');
                    }
                } else if (typeof asRecord(bodyPayload?.error)?.message === 'string') {
                    setMusicAgentPatchError(String(asRecord(bodyPayload?.error)?.message));
                } else if (typeof asRecord(resultPayload?.error)?.message === 'string') {
                    setMusicAgentPatchError(String(asRecord(resultPayload?.error)?.message));
                }
            } else if (selectedTool === 'music.functional_harmony_analyze') {
                const resultPayload = asRecord(parsedResult);
                const bodyPayload = asRecord(resultPayload?.body);
                const nextXml = typeof bodyPayload?.annotatedXml === 'string' ? bodyPayload.annotatedXml : '';
                if (shouldApplyAnalysisResult && nextXml.trim()) {
                    try {
                        await applyXmlToScore(nextXml, {
                            telemetrySource: 'music_agent_functional_harmony_analyze',
                            inputFormat: 'musicxml',
                        });
                        setXmlSidebarTab('xml');
                    } catch (applyErr) {
                        console.error('Failed to apply Music Agent functional harmony output', applyErr);
                        setMusicAgentPatchError('Harmony analysis output was generated but Roman numeral annotations could not be applied to the score.');
                    }
                } else if (typeof asRecord(bodyPayload?.error)?.message === 'string') {
                    setMusicAgentPatchError(String(asRecord(bodyPayload?.error)?.message));
                } else if (typeof asRecord(resultPayload?.error)?.message === 'string') {
                    setMusicAgentPatchError(String(asRecord(resultPayload?.error)?.message));
                }
            }

            if (!response.ok) {
                const nonOkMessage = typeof parsed?.error === 'string' && parsed.error.trim()
                    ? parsed.error.trim()
                    : `Request failed: ${response.status}`;
                setMusicAgentError(nonOkMessage);
                failureReason = nonOkMessage;
            }

            const resultError = (() => {
                const resultPayload = asRecord(parsedResult);
                if (typeof resultPayload?.error === 'string' && resultPayload.error.trim()) {
                    return resultPayload.error.trim();
                }
                return '';
            })();
            if (resultError && !failureReason) {
                failureReason = resultError;
            }
            let responseText = typeof parsed?.response === 'string' && parsed.response.trim()
                ? parsed.response.trim()
                : (resultError
                    ? resultError
                    : (typeof parsed?.error === 'string' && parsed.error.trim()
                        ? parsed.error.trim()
                        : (response.ok ? 'No response returned by the Agent.' : `Request failed: ${response.status}`)));
            
            // Append background agent error if fallback mode was triggered by a failure
            if (typeof parsed?.agentError === 'string' && parsed.agentError.trim()) {
                const agentErrMsg = parsed.agentError.trim();
                responseText = `${responseText}\n\n[Agent SDK Error: ${agentErrMsg}]`;
            }

            setMusicAgentThread((prev) => [...prev, { role: 'assistant', text: responseText }]);
            if (response.ok && !failureReason) {
                outcome = 'success';
            }
        } catch (err) {
            console.error('Music Agent request failed', err);
            failureReason = errorMessage(err) || 'Music Agent request failed.';
            setMusicAgentError(failureReason);
        } finally {
            setMusicAgentBusy(false);
            if (requestIssued) {
                if (outcome === 'failure') {
                    telemetryCountersRef.current.aiFailures += 1;
                }
                emitEditorTelemetry('score_editor_ai_request', {
                    channel: 'music_agent',
                    provider: aiProvider,
                    model: aiModel.trim() || undefined,
                    selected_tool: selectedTool || undefined,
                    fallback_only: musicAgentUseFallbackOnly,
                    include_xml: musicAgentIncludeCurrentXml,
                    outcome,
                    duration_ms: Math.max(0, Date.now() - requestStartedAt),
                    error: outcome === 'failure' ? failureReason || undefined : undefined,
                });
            }
        }
    };

    const handleApplyMusicAgentPatch = async () => {
        if (!musicAgentPatchedXml.trim()) {
            alert(musicAgentPatchError || 'No agent-generated patch output is available yet.');
            return;
        }
        setXmlLoading(true);
        setXmlError(null);
        try {
            await applyXmlToScore(musicAgentPatchedXml, { telemetrySource: 'music_agent_patch' });
            setXmlSidebarTab('xml');
        } catch (err) {
            console.error('Failed to apply Music Agent patch output', err);
            alert('Failed to apply Music Agent output. See console for details.');
        } finally {
            setXmlLoading(false);
        }
    };

    const loadNotaGenSpaceOptions = useCallback(async (spaceIdOverride?: string) => {
        const targetSpaceId = (spaceIdOverride ?? musicNotaGenSpaceId).trim() || 'ElectricAlexis/NotaGen';
        setMusicNotaGenSpaceOptionsLoading(true);
        setMusicNotaGenSpaceOptionsError(null);
        try {
            const parsed = await postScoreEditorJson('/api/music/notagen-space/options', {
                spaceId: targetSpaceId,
            });
            const combinations = asRecord(parsed?.combinations) as NotaGenSpaceCombinations | null;
            setMusicNotaGenSpaceCombinations(combinations);

            const periods = Array.isArray(parsed?.periods)
                ? parsed?.periods.filter((value): value is string => typeof value === 'string')
                : [];
            const nextPeriod = periods.includes(musicNotaGenSpacePeriod) ? musicNotaGenSpacePeriod : (periods[0] || musicNotaGenSpacePeriod);
            if (nextPeriod !== musicNotaGenSpacePeriod) {
                setMusicNotaGenSpacePeriod(nextPeriod);
            }

            const composersForPeriod = Object.keys((combinations && combinations[nextPeriod]) || {}).sort();
            const nextComposer = composersForPeriod.includes(musicNotaGenSpaceComposer)
                ? musicNotaGenSpaceComposer
                : (composersForPeriod[0] || musicNotaGenSpaceComposer);
            if (nextComposer !== musicNotaGenSpaceComposer) {
                setMusicNotaGenSpaceComposer(nextComposer);
            }

            const instrumentsForComposer = ((combinations && combinations[nextPeriod] && combinations[nextPeriod][nextComposer]) || []).slice().sort();
            const nextInstrumentation = instrumentsForComposer.includes(musicNotaGenSpaceInstrumentation)
                ? musicNotaGenSpaceInstrumentation
                : (instrumentsForComposer[0] || musicNotaGenSpaceInstrumentation);
            if (nextInstrumentation !== musicNotaGenSpaceInstrumentation) {
                setMusicNotaGenSpaceInstrumentation(nextInstrumentation);
            }
        } catch (err) {
            console.error('Failed to load NotaGen Space options', err);
            setMusicNotaGenSpaceOptionsError(errorMessage(err) || 'Failed to load NotaGen Space options.');
        } finally {
            setMusicNotaGenSpaceOptionsLoading(false);
        }
    }, [
        musicNotaGenSpaceComposer,
        musicNotaGenSpaceId,
        musicNotaGenSpaceInstrumentation,
        musicNotaGenSpacePeriod,
        postScoreEditorJson,
    ]);

    const handleMusicNotaGenRun = async () => {
        if (!musicNotaGenSpacePeriod.trim() || !musicNotaGenSpaceComposer.trim() || !musicNotaGenSpaceInstrumentation.trim()) {
            alert('Enter a period, composer, and instrumentation for the NotaGen Space.');
            return;
        }
        setMusicNotaGenBusy(true);
        setMusicNotaGenError(null);
        setMusicNotaGenResult(null);
        setMusicNotaGenGeneratedXml('');
        setMusicNotaGenGeneratedAbc('');
        setMusicNotaGenProgressLog('');
        setMusicNotaGenStatusText('');
        const requestStartedAt = Date.now();
        let requestIssued = false;
        let outcome: 'success' | 'failure' = 'failure';
        let failureReason = '';
        try {
            if (!musicNotaGenDryRun) {
                requestIssued = true;
                telemetryCountersRef.current.aiRequests += 1;
                const response = await fetch(resolveScoreEditorApiPath('/api/music/generate/stream'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        backend: 'huggingface-space',
                        spaceId: musicNotaGenSpaceId || undefined,
                        period: musicNotaGenSpacePeriod,
                        composer: musicNotaGenSpaceComposer,
                        instrumentation: musicNotaGenSpaceInstrumentation,
                        timeoutMs: 300000,
                        includeAbc: true,
                        includeContent: true,
                    }),
                });
                captureApiTraceContext(response.headers);
                if (!response.ok || !response.body) {
                    const payload = await response.json().catch(() => ({}));
                    const message = typeof asRecord(payload)?.error === 'string'
                        ? String(asRecord(payload)?.error)
                        : `Request failed: ${response.status}`;
                    failureReason = message;
                    throw new Error(message);
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let finalResult: Record<string, unknown> | null = null;
                let streamError: string | null = null;

                const handleSseEvent = (eventName: string, payloadText: string) => {
                    let payload: any = null;
                    try {
                        payload = payloadText ? JSON.parse(payloadText) : null;
                    } catch {
                        payload = { raw: payloadText };
                    }
                    if (eventName === 'status') {
                        const stage = typeof payload?.stage === 'string' ? payload.stage : '';
                        const message = typeof payload?.message === 'string' ? payload.message : '';
                        setMusicNotaGenStatusText([stage, message].filter(Boolean).join(': ') || stage || message);
                        return;
                    }
                    if (eventName === 'log') {
                        const message = typeof payload?.message === 'string' ? payload.message : '';
                        if (message) {
                            setMusicNotaGenProgressLog((prev) => {
                                const next = prev ? `${prev}\n${message}` : message;
                                return next.slice(-20000);
                            });
                        }
                        return;
                    }
                    if (eventName === 'progress') {
                        if (typeof payload?.processOutput === 'string') {
                            setMusicNotaGenProgressLog(payload.processOutput.slice(-20000));
                        }
                        if (typeof payload?.abc === 'string') {
                            setMusicNotaGenGeneratedAbc(payload.abc);
                        }
                        return;
                    }
                    if (eventName === 'result') {
                        finalResult = asRecord(payload);
                        streamError = null;
                        return;
                    }
                    if (eventName === 'error') {
                        if (!finalResult) {
                            streamError = typeof payload?.error === 'string'
                                ? payload.error
                                : 'NotaGen Space streaming request failed.';
                        }
                    }
                };

                while (true) {
                    const { value, done } = await reader.read();
                    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

                    let sepIndex = buffer.indexOf('\n\n');
                    while (sepIndex >= 0) {
                        const block = buffer.slice(0, sepIndex);
                        buffer = buffer.slice(sepIndex + 2);

                        let eventName = 'message';
                        const dataLines: string[] = [];
                        for (const line of block.split('\n')) {
                            if (line.startsWith('event:')) {
                                eventName = line.slice(6).trim();
                            } else if (line.startsWith('data:')) {
                                dataLines.push(line.slice(5).trimStart());
                            }
                        }
                        if (dataLines.length > 0) {
                            handleSseEvent(eventName, dataLines.join('\n'));
                        }
                        if (streamError && !finalResult) {
                            failureReason = streamError;
                            throw new Error(streamError);
                        }
                        sepIndex = buffer.indexOf('\n\n');
                    }

                    if (done) {
                        break;
                    }
                }

                if (!finalResult) {
                    failureReason = streamError || 'NotaGen Space stream ended without a final result.';
                    throw new Error(failureReason);
                }

                setMusicNotaGenResult(finalResult);
                const content = asRecord(finalResult.content);
                const abc = typeof finalResult.abc === 'string'
                    ? finalResult.abc
                    : (typeof content?.abc === 'string' ? content.abc : '');
                const musicxml = typeof content?.musicxml === 'string' ? content.musicxml : '';
                setMusicNotaGenGeneratedAbc(abc);
                setMusicNotaGenGeneratedXml(musicxml);
                outcome = 'success';
                return;
            }

            requestIssued = true;
            telemetryCountersRef.current.aiRequests += 1;
            const payload = await postScoreEditorJson('/api/music/generate', {
                backend: 'huggingface-space',
                spaceId: musicNotaGenSpaceId || undefined,
                period: musicNotaGenSpacePeriod,
                composer: musicNotaGenSpaceComposer,
                instrumentation: musicNotaGenSpaceInstrumentation,
                dryRun: musicNotaGenDryRun,
                timeoutMs: 300000,
                includePrompt: true,
                includeAbc: true,
                includeContent: true,
            });
            setMusicNotaGenResult(payload);
            const content = asRecord(payload.content);
            const abc = typeof payload.abc === 'string'
                ? payload.abc
                : (typeof content?.abc === 'string' ? content.abc : '');
            const musicxml = typeof content?.musicxml === 'string' ? content.musicxml : '';
            setMusicNotaGenGeneratedAbc(abc);
            setMusicNotaGenGeneratedXml(musicxml);
            outcome = 'success';
        } catch (err) {
            console.error('NotaGen request failed', err);
            failureReason = errorMessage(err) || 'NotaGen request failed.';
            setMusicNotaGenError(failureReason);
        } finally {
            setMusicNotaGenBusy(false);
            if (requestIssued) {
                if (outcome === 'failure') {
                    telemetryCountersRef.current.aiFailures += 1;
                }
                emitEditorTelemetry('score_editor_ai_request', {
                    channel: 'notagen',
                    backend: 'huggingface-space',
                    model: musicNotaGenModelId.trim() || undefined,
                    space_id: musicNotaGenSpaceId.trim() || undefined,
                    period: musicNotaGenSpacePeriod,
                    composer: musicNotaGenSpaceComposer,
                    instrumentation: musicNotaGenSpaceInstrumentation,
                    outcome,
                    duration_ms: Math.max(0, Date.now() - requestStartedAt),
                    error: outcome === 'failure' ? failureReason || undefined : undefined,
                });
            }
        }
    };

    const handleNotaGenPeriodChange = useCallback((nextPeriod: string) => {
        setMusicNotaGenSpacePeriod(nextPeriod);
        const composerMap = (musicNotaGenSpaceCombinations && musicNotaGenSpaceCombinations[nextPeriod]) || {};
        const composers = Object.keys(composerMap).sort();
        const nextComposer = composers.includes(musicNotaGenSpaceComposer)
            ? musicNotaGenSpaceComposer
            : (composers[0] || '');
        setMusicNotaGenSpaceComposer(nextComposer);

        const instruments = nextComposer
            ? [ ...(composerMap[nextComposer] || []) ].sort()
            : [];
        const nextInstrumentation = instruments.includes(musicNotaGenSpaceInstrumentation)
            ? musicNotaGenSpaceInstrumentation
            : (instruments[0] || '');
        setMusicNotaGenSpaceInstrumentation(nextInstrumentation);
    }, [
        musicNotaGenSpaceCombinations,
        musicNotaGenSpaceComposer,
        musicNotaGenSpaceInstrumentation,
    ]);

    const handleNotaGenComposerChange = useCallback((nextComposer: string) => {
        setMusicNotaGenSpaceComposer(nextComposer);
        const instruments = (
            musicNotaGenSpaceCombinations
            && musicNotaGenSpaceCombinations[musicNotaGenSpacePeriod]
            && musicNotaGenSpaceCombinations[musicNotaGenSpacePeriod][nextComposer]
        )
            ? [ ...musicNotaGenSpaceCombinations[musicNotaGenSpacePeriod][nextComposer] ].sort()
            : [];
        const nextInstrumentation = instruments.includes(musicNotaGenSpaceInstrumentation)
            ? musicNotaGenSpaceInstrumentation
            : (instruments[0] || '');
        setMusicNotaGenSpaceInstrumentation(nextInstrumentation);
    }, [
        musicNotaGenSpaceCombinations,
        musicNotaGenSpacePeriod,
        musicNotaGenSpaceInstrumentation,
    ]);

    const handleApplyMusicNotaGenOutput = async () => {
        if (!musicNotaGenGeneratedXml.trim()) {
            alert('No generated MusicXML is available yet.');
            return;
        }
        setXmlLoading(true);
        setXmlError(null);
        try {
            if (!score) {
                const encoder = new TextEncoder();
                const encoded = encoder.encode(musicNotaGenGeneratedXml);
                const filenameBase = musicNotaGenSpaceComposer
                    ? `notagen-${toSafeFilename(musicNotaGenSpaceComposer)}`
                    : 'notagen-output';
                const file = new File([encoded], `${filenameBase}.musicxml`, { type: 'application/xml' });
                await handleFileUpload(file, {
                    preserveScoreId: false,
                    updateUrl: false,
                    telemetrySource: 'notagen_output',
                });
            } else {
                await applyXmlToScore(musicNotaGenGeneratedXml, { telemetrySource: 'notagen_output' });
            }
            setXmlSidebarTab('xml');
        } catch (err) {
            console.error('Failed to apply NotaGen output XML', err);
            alert('Failed to apply generated MusicXML. See console for details.');
        } finally {
            setXmlLoading(false);
        }
    };

    const handleMmaStarterPresetChange = useCallback((preset: MmaStarterPreset) => {
        setMmaStarterPreset(preset);
        setMmaError(null);
        if (preset === 'blank') {
            setMmaScript('');
            setMmaWarnings([]);
            setMmaSanitizedStderr('');
            setMmaResultPayload(null);
            return;
        }
        if (preset === 'blues') {
            setMmaScript(MMA_BLUES_DEMO_TEMPLATE);
            setMmaWarnings([]);
            setMmaSanitizedStderr('');
            setMmaResultPayload(null);
        }
    }, []);

    const generateMmaTemplateFromXml = useCallback(async (xml: string, options?: { switchToMmaTab?: boolean }) => {
        const estimatedMeasures = estimateMusicXmlMeasureCount(xml);
        const payload = await postScoreEditorJson('/api/music/mma/template', {
            content: xml,
            maxMeasures: Math.min(
                MMA_TEMPLATE_MAX_MEASURES,
                Math.max(1, estimatedMeasures || MMA_TEMPLATE_MAX_MEASURES),
            ),
            arrangementPreset: mmaArrangementPreset,
            defaultGroove: mmaGroove,
        });
        const template = typeof payload.template === 'string' ? payload.template : '';
        if (!template.trim()) {
            throw new Error('MMA template response did not include a script.');
        }
        setMmaScript(template);
        setMmaStarterPreset('lead-sheet');
        const warnings = Array.isArray(payload.warnings)
            ? payload.warnings.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
            : [];
        setMmaWarnings(warnings);
        setMmaSanitizedStderr('');
        setMmaResultPayload(payload);
        if (options?.switchToMmaTab) {
            setXmlSidebarTab('mma');
        }
        return payload;
    }, [mmaArrangementPreset, mmaGroove, postScoreEditorJson]);

    const handleMmaGenerateTemplate = async () => {
        setMmaBusy(true);
        setMmaError(null);
        try {
            const xml = await resolveXmlContext();
            if (!xml.trim()) {
                alert('Load a score before generating an MMA starter from MusicXML.');
                return;
            }
            await generateMmaTemplateFromXml(xml);
        } catch (err) {
            console.error('Failed to generate MMA template', err);
            setMmaError(errorMessage(err) || 'Failed to generate MMA starter template.');
        } finally {
            setMmaBusy(false);
        }
    };

    const handleMmaRender = async (includeMusicXml: boolean) => {
        const script = mmaScript.trim();
        if (!script) {
            alert('Enter an MMA script before rendering.');
            return;
        }
        setMmaBusy(true);
        setMmaError(null);
        try {
            const payload = await postScoreEditorJson('/api/music/mma/render', {
                script: mmaScript,
                includeMidi: true,
                includeMusicXml,
                persistArtifacts: true,
            });
            const midiBase64 = typeof payload.midiBase64 === 'string' ? payload.midiBase64 : '';
            const musicxml = typeof payload.musicxml === 'string' ? payload.musicxml : '';
            const warnings = Array.isArray(payload.warnings)
                ? payload.warnings.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
                : [];
            const provenance = asRecord(payload.provenance);
            const stderr = typeof provenance?.stderr === 'string' ? provenance.stderr : '';

            setMmaWarnings(warnings);
            setMmaSanitizedStderr(stderr);
            setMmaMidiBase64(midiBase64);
            if (includeMusicXml) {
                setMmaGeneratedXml(musicxml);
            }
            setMmaResultPayload(payload);
        } catch (err) {
            console.error('Failed to render MMA script', err);
            setMmaError(errorMessage(err) || 'Failed to render MMA script.');
        } finally {
            setMmaBusy(false);
        }
    };

    const handleMmaDownload = (format: 'mma' | 'midi' | 'musicxml') => {
        if (format === 'mma') {
            if (!mmaScript.trim()) {
                alert('No MMA script is available to download.');
                return;
            }
            downloadBlob(`${mmaScript.trimEnd()}\n`, 'accompaniment.mma', 'text/plain;charset=utf-8');
            return;
        }

        if (format === 'midi') {
            if (!mmaMidiBase64.trim()) {
                alert('No rendered MIDI output is available yet.');
                return;
            }
            try {
                const midiBytes = decodeBase64ToBytes(mmaMidiBase64);
                if (!midiBytes.length) {
                    throw new Error('Rendered MIDI payload was empty.');
                }
                downloadBlob(midiBytes, 'accompaniment.mid', 'audio/midi');
            } catch (err) {
                console.error('Failed to decode/render MIDI download payload', err);
                alert('Unable to decode rendered MIDI for download.');
            }
            return;
        }

        if (!mmaGeneratedXml.trim()) {
            alert('No generated MusicXML is available to download.');
            return;
        }
        downloadBlob(mmaGeneratedXml, 'accompaniment.musicxml', 'application/vnd.recordare.musicxml+xml');
    };

    const handleApplyMmaOutput = async () => {
        if (!mmaGeneratedXml.trim()) {
            alert('No generated MusicXML is available yet.');
            return;
        }
        setXmlLoading(true);
        setXmlError(null);
        try {
            if (!score) {
                const encoder = new TextEncoder();
                const encoded = encoder.encode(mmaGeneratedXml);
                const filenameBase = scoreTitle ? `mma-${toSafeFilename(scoreTitle)}` : 'mma-output';
                const file = new File([encoded], `${filenameBase}.musicxml`, { type: 'application/xml' });
                await handleFileUpload(file, {
                    preserveScoreId: false,
                    updateUrl: false,
                    telemetrySource: 'mma_output',
                });
            } else {
                const currentXml = await resolveXmlContext();
                if (!currentXml.trim()) {
                    throw new Error('Unable to load current score MusicXML for MMA part append.');
                }
                const appendResult = appendMusicXmlParts(currentXml, mmaGeneratedXml);
                if (appendResult.appendedPartCount <= 0) {
                    throw new Error('Generated MMA MusicXML did not contain appendable parts.');
                }
                setMmaWarnings((prev) => {
                    const next = [...prev];
                    next.push(`Appended ${appendResult.appendedPartCount} part(s) into the current score.`);
                    appendResult.warnings.forEach((warning) => next.push(warning));
                    return Array.from(new Set(next));
                });
                await applyXmlToScore(appendResult.xml, {
                    telemetrySource: 'mma_output_append',
                    inputFormat: 'musicxml',
                });
            }
            setXmlSidebarTab('xml');
        } catch (err) {
            console.error('Failed to apply MMA output MusicXML', err);
            alert('Failed to apply generated MMA MusicXML. See console for details.');
        } finally {
            setXmlLoading(false);
        }
    };

    const handleHarmonyAnalyze = async (options?: { applyImmediately?: boolean; persistArtifacts?: boolean; generateMmaTemplate?: boolean }) => {
        setHarmonyBusy(true);
        setHarmonyError(null);
        try {
            const xml = await resolveXmlContext();
            if (!xml.trim()) {
                alert('Load a score before running harmony analysis.');
                return;
            }
            const payload = await postScoreEditorJson('/api/music/harmony/analyze', {
                content: xml,
                insertHarmony: true,
                includeContent: true,
                persistArtifacts: options?.persistArtifacts ?? true,
                preferLocalKey: true,
                includeRomanNumerals: false,
                simplifyForMma: true,
                existingHarmonyMode: 'fill-missing',
                harmonicRhythm: harmonyRhythmMode,
                maxChangesPerMeasure: Math.min(8, Math.max(1, Math.trunc(harmonyMaxChangesPerMeasure || 1))),
                timeoutMs: estimateHarmonyTimeoutMs(xml),
            });
            const warnings = Array.isArray(payload.warnings)
                ? payload.warnings.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
                : [];
            const content = asRecord(payload.content);
            const musicxml = typeof content?.musicxml === 'string' ? content.musicxml : '';
            if (!musicxml.trim()) {
                throw new Error('Harmony analysis did not return tagged MusicXML.');
            }
            setHarmonyWarnings(warnings);
            setHarmonyGeneratedXml(musicxml);
            setHarmonyResultPayload(payload);

            if (options?.generateMmaTemplate) {
                setMmaBusy(true);
                setMmaError(null);
                try {
                    await generateMmaTemplateFromXml(musicxml, { switchToMmaTab: true });
                } finally {
                    setMmaBusy(false);
                }
            }

            if (options?.applyImmediately) {
                setXmlLoading(true);
                try {
                    await applyXmlToScore(musicxml, {
                        telemetrySource: 'harmony_analysis_apply',
                        inputFormat: 'musicxml',
                        enforceJazzHarmonyStyle: true,
                    });
                    setXmlSidebarTab('xml');
                } finally {
                    setXmlLoading(false);
                }
            }
        } catch (err) {
            console.error('Failed to analyze harmony', err);
            setHarmonyError(errorMessage(err) || 'Failed to analyze harmony.');
        } finally {
            setHarmonyBusy(false);
        }
    };

    const handleApplyHarmonyOutput = async () => {
        if (!harmonyGeneratedXml.trim()) {
            alert('No tagged MusicXML is available yet.');
            return;
        }
        setXmlLoading(true);
        setXmlError(null);
        try {
            await applyXmlToScore(harmonyGeneratedXml, {
                telemetrySource: 'harmony_analysis_apply',
                inputFormat: 'musicxml',
                enforceJazzHarmonyStyle: true,
            });
            setXmlSidebarTab('xml');
        } catch (err) {
            console.error('Failed to apply harmony-tagged MusicXML', err);
            alert('Failed to apply harmony-tagged MusicXML. See console for details.');
        } finally {
            setXmlLoading(false);
        }
    };

    const handleDownloadHarmonyXml = () => {
        if (!harmonyGeneratedXml.trim()) {
            alert('No tagged MusicXML is available to download.');
            return;
        }
        const filenameBase = scoreTitle ? `harmony-${toSafeFilename(scoreTitle)}` : 'harmony-tagged';
        downloadBlob(harmonyGeneratedXml, `${filenameBase}.musicxml`, 'application/vnd.recordare.musicxml+xml');
    };

    const handleFunctionalHarmonyAnalyze = async () => {
        setFunctionalHarmonyBusy(true);
        setFunctionalHarmonyError(null);
        try {
            const xml = await resolveXmlContext();
            if (!xml.trim()) {
                alert('Load a score before running harmony analysis.');
                return;
            }
            const payload = await postScoreEditorJson('/api/music/functional-harmony/analyze', {
                content: xml,
                backend: 'music21-roman',
                includeSegments: true,
                includeTextExport: true,
                includeAnnotatedContent: true,
                persistArtifacts: true,
            });
            setFunctionalHarmonyResult(payload);
            setFunctionalHarmonyWarnings(
                Array.isArray(payload.warnings)
                    ? payload.warnings.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
                    : [],
            );
            setFunctionalHarmonySegments(
                Array.isArray(payload.segments)
                    ? payload.segments.filter((value): value is Record<string, unknown> => Boolean(asRecord(value)))
                    : [],
            );
            const exportsRecord = asRecord(payload.exports);
            setFunctionalHarmonyAnnotatedXml(typeof payload.annotatedXml === 'string' ? payload.annotatedXml : '');
            setFunctionalHarmonyJsonExport(typeof exportsRecord?.json === 'string' ? exportsRecord.json : '');
            setFunctionalHarmonyRntxtExport(typeof exportsRecord?.rntxt === 'string' ? exportsRecord.rntxt : '');
        } catch (err) {
            console.error('Failed to analyze harmony', err);
            setFunctionalHarmonyError(errorMessage(err) || 'Failed to analyze harmony.');
        } finally {
            setFunctionalHarmonyBusy(false);
        }
    };

    const handleDownloadFunctionalHarmony = (format: 'json' | 'rntxt') => {
        if (format === 'json') {
            if (!functionalHarmonyJsonExport.trim()) {
                alert('No harmony JSON export is available yet.');
                return;
            }
            const filenameBase = scoreTitle ? `functional-harmony-${toSafeFilename(scoreTitle)}` : 'functional-harmony';
            downloadBlob(functionalHarmonyJsonExport, `${filenameBase}.json`, 'application/json');
            return;
        }
        if (!functionalHarmonyRntxtExport.trim()) {
            alert('No harmony text export is available yet.');
            return;
        }
        const filenameBase = scoreTitle ? `functional-harmony-${toSafeFilename(scoreTitle)}` : 'functional-harmony';
        downloadBlob(functionalHarmonyRntxtExport, `${filenameBase}.rntxt`, 'text/plain;charset=utf-8');
    };

    const handleDownloadFunctionalHarmonyXml = () => {
        if (!functionalHarmonyAnnotatedXml.trim()) {
            alert('No annotated harmony MusicXML is available yet.');
            return;
        }
        const filenameBase = scoreTitle ? `functional-harmony-${toSafeFilename(scoreTitle)}` : 'functional-harmony';
        downloadBlob(functionalHarmonyAnnotatedXml, `${filenameBase}.musicxml`, 'application/vnd.recordare.musicxml+xml');
    };

    const handleApplyFunctionalHarmonyOutput = async () => {
        if (!functionalHarmonyAnnotatedXml.trim()) {
            alert('No annotated harmony MusicXML is available yet.');
            return;
        }
        setXmlLoading(true);
        setXmlError(null);
        try {
            await applyXmlToScore(functionalHarmonyAnnotatedXml, {
                telemetrySource: 'functional_harmony_apply',
                inputFormat: 'musicxml',
            });
            setXmlSidebarTab('xml');
        } catch (err) {
            console.error('Failed to apply harmony-annotated MusicXML', err);
            alert('Failed to apply harmony-annotated MusicXML. See console for details.');
        } finally {
            setXmlLoading(false);
        }
    };

    const handleApplyAiOutput = async () => {
        if (!aiPatchedXml.trim()) {
            alert(aiPatchError || 'AI patch has not produced valid MusicXML.');
            return;
        }
        const baseXml = aiBaseXml.trim() || (await resolveXmlContext()).trim();
        if (!baseXml) {
            alert('Unable to load MusicXML for diff review.');
            return;
        }
        const opened = openAiProposalCompare(baseXml, aiPatchedXml);
        if (!opened) {
            alert('Unable to open compare view for AI proposal.');
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
        if (!containerRef.current) {
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
        const containerRect = containerRef.current.getBoundingClientRect();
        const selectors = ['.selected', '.note-selected', '.ms-selection'];
        const candidates: Element[] = Array.from(
            new Set(selectors.flatMap(sel => Array.from(containerRef.current!.querySelectorAll(sel)))),
        );
        const allElements = Array.from(containerRef.current.querySelectorAll(ELEMENT_SELECTION_SELECTOR));


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
            const el = allElements[useIndex] ?? null;
            if (el) {
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
            }
        }

        if (boxes.length === 0) {
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
            return;
        }

        setSelectedElement({ x: primary.x, y: primary.y, w: primary.w, h: primary.h });
        setSelectedPoint({ page: primary.page, x: primary.centerX, y: primary.centerY });
        setSelectedIndex(primary.index);
        setSelectedElementClasses(primary.classes);
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
                return;
            }

            if (typeof window !== 'undefined') {
                window.requestAnimationFrame(() => {
                    window.requestAnimationFrame(() => {
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
    const handleAddPickup = (numerator: number, denominator: number) => performMutation('add pickup measure', async () => {
        const fn = requireMutation('addPickupMeasure');
        if (!fn) return false;
        return fn(numerator, denominator);
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

    const handleExportMscx = async () => {
        if (!score || !score.saveMsc) {
            alert('MSCX export is not available in this build.');
            return;
        }
        try {
            const mscx = await score.saveMsc('mscx');
            downloadBlob(mscx, 'score.mscx', 'application/xml');
        } catch (err) {
            console.error('Failed to export MSCX', err);
            alert('Unable to export MSCX. See console for details.');
        }
    };

    const handleExportMusicXml = async () => {
        if (!score || !score.saveXml) {
            alert('MusicXML export is not available in this build.');
            return;
        }
        try {
            const xml = await runSerializedScoreOperation(
                () => score.saveXml!(),
                'saveXml(export)',
            );
            downloadBlob(xml, 'score.musicxml', 'application/vnd.recordare.musicxml+xml');
        } catch (err) {
            console.error('Failed to export MusicXML', err);
            alert('Unable to export MusicXML. See console for details.');
        }
    };

    const handleExportAbc = async () => {
        if (!score || !score.saveXml) {
            alert('ABC export is not available in this build.');
            return;
        }
        try {
            const xmlData = await runSerializedScoreOperation(
                () => score.saveXml!(),
                'saveXml(export-abc)',
            );
            const xml = await decodeXmlData(xmlData);
            if (!xml?.trim()) {
                throw new Error('MusicXML export was empty.');
            }
            const converted = await postScoreEditorJson('/api/music/convert', {
                input_format: 'musicxml',
                output_format: 'abc',
                content: xml,
                include_content: true,
                validate: true,
                deep_validate: true,
            });
            const abcRaw = typeof converted.content === 'string' ? converted.content : '';
            const abc = abcRaw.trim();
            if (!abc) {
                throw new Error('ABC conversion returned empty output.');
            }
            downloadBlob(`${abc}\n`, 'score.abc', 'text/plain;charset=utf-8');
        } catch (err) {
            console.error('Failed to export ABC', err);
            alert('Unable to export ABC. See console for details.');
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
                ? { valid: true, message: `${aiPatch.ops.length} ops ready for diff review` }
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
                onExportMscx={handleExportMscx}
                onExportMusicXml={handleExportMusicXml}
                onExportAbc={handleExportAbc}
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
                onAddPickup={handleAddPickup}
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
                                            className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
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
                                    {aiEnabled && (
                                        <button
                                            type="button"
                                            data-testid="tab-notagen"
                                            onClick={() => setXmlSidebarTab('notagen')}
                                            className={`rounded border px-2 py-1 ${
                                                xmlSidebarTab === 'notagen'
                                                    ? 'border-gray-400 bg-gray-100 text-gray-900'
                                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                                            }`}
                                        >
                                            NotaGen
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        data-testid="tab-harmony"
                                        onClick={() => setXmlSidebarTab('harmony')}
                                        className={`rounded border px-2 py-1 ${
                                            xmlSidebarTab === 'harmony'
                                                ? 'border-gray-400 bg-gray-100 text-gray-900'
                                                : 'border-transparent text-gray-500 hover:text-gray-700'
                                        }`}
                                    >
                                        Chordify
                                    </button>
                                    <button
                                        type="button"
                                        data-testid="tab-functional-harmony"
                                        onClick={() => setXmlSidebarTab('functional')}
                                        className={`rounded border px-2 py-1 ${
                                            xmlSidebarTab === 'functional'
                                                ? 'border-gray-400 bg-gray-100 text-gray-900'
                                                : 'border-transparent text-gray-500 hover:text-gray-700'
                                        }`}
                                    >
                                        Harmony
                                    </button>
                                    <button
                                        type="button"
                                        data-testid="tab-mma"
                                        onClick={() => setXmlSidebarTab('mma')}
                                        className={`rounded border px-2 py-1 ${
                                            xmlSidebarTab === 'mma'
                                                ? 'border-gray-400 bg-gray-100 text-gray-900'
                                                : 'border-transparent text-gray-500 hover:text-gray-700'
                                        }`}
                                    >
                                        MMA
                                    </button>
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
                                {aiDiffFeedbackBusy && (
                                    <div
                                        data-testid="ai-diff-feedback-working"
                                        className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-900"
                                    >
                                        Working... Generating the next AI proposal from your feedback.
                                    </div>
                                )}
                                {aiDiffFeedbackError && (
                                    <div className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                                        Diff feedback failed: {aiDiffFeedbackError}
                                    </div>
                                )}
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
                                <form onSubmit={(e) => e.preventDefault()}>
                                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                        API Key ({AI_PROVIDER_LABELS[aiProvider]})
                                    </label>
                                    <input
                                        type="password"
                                        value={aiApiKey}
                                        onChange={(event) => setAiApiKey(event.target.value)}
                                        className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                        placeholder="Paste your key"
                                        autoComplete="off"
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
                                </form>
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
                                        <button
                                            type="button"
                                            onClick={() => setAiMode('agent')}
                                            className={`rounded border px-2 py-1 ${aiMode === 'agent' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                                        >
                                            Agent
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
                                    {aiMode === 'patch' && (
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
                                                        title="Review AI changes in the diff editor before applying."
                                                        data-testid="btn-ai-review-diff"
                                                        className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        Review in Diff Editor
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
                                    )}
                                    {aiMode === 'chat' && (
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
                                    {aiMode === 'agent' && (
                                        <div className="space-y-3">
                                            <div className="rounded border border-gray-200 bg-gray-50/70 p-3 space-y-3">
                                                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                                    Music Agent Router
                                                </div>
                                                <div>
                                                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                                        Max Turns
                                                    </label>
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        max={20}
                                                        value={Number(musicAgentMaxTurns)}
                                                        onChange={(event) => setMusicAgentMaxTurns(Math.max(1, Math.min(20, Number(event.target.value) || 1)))}
                                                        autoComplete="off"
                                                        className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                                    />
                                                </div>
                                                <label className="flex items-center gap-2 text-xs text-gray-600">
                                                    <input
                                                        type="checkbox"
                                                        checked={musicAgentIncludeCurrentXml}
                                                        onChange={(event) => setMusicAgentIncludeCurrentXml(event.target.checked)}
                                                        className="h-4 w-4 rounded border-gray-300"
                                                    />
                                                    Include current score MusicXML as tool context
                                                </label>
                                                <label className="flex items-center gap-2 text-xs text-gray-600">
                                                    <input
                                                        type="checkbox"
                                                        checked={musicAgentUseFallbackOnly}
                                                        onChange={(event) => setMusicAgentUseFallbackOnly(event.target.checked)}
                                                        className="h-4 w-4 rounded border-gray-300"
                                                    />
                                                    Force fallback mode (no Agents SDK run)
                                                </label>
                                                <div className="space-y-1">
                                                    <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-500">
                                                        <span>Attachments (PDF/Images)</span>
                                                        {musicAgentFiles.length > 0 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setMusicAgentFiles([])}
                                                                className="text-blue-600 hover:underline"
                                                            >
                                                                Clear All
                                                            </button>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-wrap gap-1 mb-1">
                                                        {musicAgentFiles.map((file, idx) => (
                                                            <div key={idx} className="flex items-center gap-1 bg-gray-100 rounded px-2 py-0.5 text-[10px] text-gray-700">
                                                                <span className="truncate max-w-[100px]">{file.name}</span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setMusicAgentFiles(prev => prev.filter((_, i) => i !== idx))}
                                                                    className="text-gray-400 hover:text-red-500 font-bold"
                                                                >
                                                                    ×
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <input
                                                        type="file"
                                                        multiple
                                                        data-testid="input-agent-files"
                                                        accept="application/pdf,image/*"
                                                        onChange={(e) => {
                                                            const files = Array.from(e.target.files || []);
                                                            setMusicAgentFiles(prev => [...prev, ...files]);
                                                            e.target.value = '';
                                                        }}
                                                        className="block w-full text-xs text-gray-500
                                                            file:mr-2 file:py-1 file:px-2
                                                            file:rounded file:border-0
                                                            file:text-xs file:font-semibold
                                                            file:bg-blue-50 file:text-blue-700
                                                            hover:file:bg-blue-100"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between text-xs text-gray-500">
                                                    <span>Conversation</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setMusicAgentThread([]);
                                                            setMusicAgentError(null);
                                                            setMusicAgentResult(null);
                                                            setMusicAgentPatch(null);
                                                            setMusicAgentPatchError(null);
                                                            setMusicAgentPatchedXml('');
                                                        }}
                                                        disabled={musicAgentBusy || (!musicAgentThread.length && !musicAgentResult && !musicAgentPatch)}
                                                        className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        Clear
                                                    </button>
                                                </div>
                                                <div
                                                    ref={musicAgentThreadRef}
                                                    className="max-h-64 min-h-[140px] overflow-y-auto rounded border border-gray-200 bg-gray-50 p-2"
                                                >
                                                    {musicAgentThread.length ? (
                                                        <div className="space-y-2">
                                                            {musicAgentThread.map((message, index) => (
                                                                <div
                                                                    key={`${message.role}-${index}-${message.text.slice(0, 12)}`}
                                                                    className={`rounded px-2 py-1 text-xs ${message.role === 'assistant' ? 'bg-blue-50 text-blue-900' : 'bg-white text-gray-800'}`}
                                                                >
                                                                    <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">
                                                                        {message.role === 'assistant' ? 'Agent' : 'You'}
                                                                    </span>
                                                                    <div className="leading-relaxed whitespace-pre-wrap">
                                                                        {message.text}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="text-xs text-gray-500">
                                                            Ask the router to analyze context, convert notation, or prepare generation requests.
                                                        </div>
                                                    )}
                                                </div>
                                                <textarea
                                                    ref={musicAgentPromptRef}
                                                    rows={3}
                                                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                                    placeholder="Describe what you want the agent to do."
                                                />
                                                <button
                                                    type="button"
                                                    onClick={handleMusicAgentSend}
                                                    disabled={musicAgentBusy}
                                                    className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {musicAgentBusy ? 'Working...' : 'Send to Agent'}
                                                </button>
                                            </div>
                                            {musicAgentError && (
                                                <div className="text-xs text-red-600">
                                                    {musicAgentError}
                                                </div>
                                            )}
                                            {musicAgentPatchError && (
                                                <div className="text-xs text-red-600">
                                                    {musicAgentPatchError}
                                                </div>
                                            )}
                                            {musicAgentPatch && (
                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between text-xs text-gray-500">
                                                        <span>Generated Patch</span>
                                                        <button
                                                            type="button"
                                                            onClick={handleApplyMusicAgentPatch}
                                                            disabled={musicAgentBusy || !musicAgentPatchedXml.trim()}
                                                            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            Apply Patch
                                                        </button>
                                                    </div>
                                                    <CodeMirrorEditor
                                                        value={JSON.stringify(musicAgentPatch, null, 2)}
                                                        onChange={() => {}}
                                                        readOnly={true}
                                                        language="json"
                                                        placeholderText="Patch output will appear here."
                                                        height={180}
                                                        maxHeight={240}
                                                        themeMode={codeEditorTheme}
                                                    />
                                                </div>
                                            )}
                                            {musicAgentResult && (
                                                <div className="space-y-2">
                                                    {(() => {
                                                        const res = asRecord(musicAgentResult);
                                                        // The router.ts injects the full result object into the 'result' field as a string
                                                        const resultObj = typeof res?.result === 'string' ? JSON.parse(res.result) : res?.result;
                                                        const body = asRecord(asRecord(resultObj)?.body);
                                                        if (body?.dataUrl && typeof body.dataUrl === 'string' && String(body.mimeType).startsWith('image/')) {
                                                            return (
                                                                <div className="rounded border border-gray-200 bg-white p-1 shadow-sm">
                                                                    <img 
                                                                        src={body.dataUrl} 
                                                                        alt="Score Render" 
                                                                        className="w-full rounded" 
                                                                    />
                                                                    <div className="mt-1 text-center text-[10px] text-gray-400 italic">
                                                                        Score snapshot generated by agent
                                                                    </div>
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    })()}
                                                    <details className="rounded border border-gray-200 bg-gray-50 p-2">
                                                        <summary className="cursor-pointer text-xs font-medium text-gray-700">
                                                            Last raw response
                                                        </summary>
                                                        <pre className="mt-2 max-h-64 overflow-auto text-[11px] leading-relaxed text-gray-700 whitespace-pre-wrap">
                                                            {JSON.stringify(musicAgentResult, null, 2)}
                                                        </pre>
                                                    </details>
                                                </div>
                                            )}
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
                        {xmlSidebarTab === 'notagen' && aiEnabled && (
                            <div className="mt-3 space-y-3 text-sm text-gray-700">
                                <div className="rounded border border-gray-200 bg-gray-50/70 p-3 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                            NotaGen (Generate)
                                        </div>
                                        <a
                                            href="https://github.com/ElectricAlexis/NotaGen/"
                                            target="_blank"
                                            rel="noreferrer"
                                            title="NotaGen project on GitHub"
                                            aria-label="Open NotaGen project on GitHub"
                                            className="text-sm leading-none text-gray-500 hover:text-gray-700"
                                        >
                                            ⓘ
                                        </a>
                                    </div>
                                    <div>
                                        <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            Period
                                        </label>
                                        <select
                                            value={musicNotaGenSpacePeriod}
                                            onChange={(event) => handleNotaGenPeriodChange(event.target.value)}
                                            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                        >
                                            {(musicNotaGenSpacePeriods.length > 0 ? musicNotaGenSpacePeriods : [musicNotaGenSpacePeriod || '']).map((option) => (
                                                <option key={option} value={option}>{option || 'Select period'}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            Composer
                                        </label>
                                        <select
                                            value={musicNotaGenSpaceComposer}
                                            onChange={(event) => handleNotaGenComposerChange(event.target.value)}
                                            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                        >
                                            {(musicNotaGenSpaceComposers.length > 0 ? musicNotaGenSpaceComposers : [musicNotaGenSpaceComposer || '']).map((option) => (
                                                <option key={option} value={option}>{option || 'Select composer'}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            Instrumentation
                                        </label>
                                        <select
                                            value={musicNotaGenSpaceInstrumentation}
                                            onChange={(event) => setMusicNotaGenSpaceInstrumentation(event.target.value)}
                                            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                        >
                                            {(musicNotaGenSpaceInstrumentations.length > 0 ? musicNotaGenSpaceInstrumentations : [musicNotaGenSpaceInstrumentation || '']).map((option) => (
                                                <option key={option} value={option}>{option || 'Select instrumentation'}</option>
                                            ))}
                                        </select>
                                        {musicNotaGenSpaceOptionsError && (
                                            <div className="mt-1 text-[11px] text-red-600">
                                                {musicNotaGenSpaceOptionsError}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={handleMusicNotaGenRun}
                                            disabled={musicNotaGenBusy}
                                            className="flex-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {musicNotaGenBusy ? 'Working...' : 'Run NotaGen Space'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleApplyMusicNotaGenOutput}
                                            disabled={musicNotaGenBusy || !musicNotaGenGeneratedXml.trim()}
                                            className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Apply Output
                                        </button>
                                    </div>
                                </div>
                                {musicNotaGenError && (
                                    <div className="text-xs text-red-600">
                                        {musicNotaGenError}
                                    </div>
                                )}
                                {(musicNotaGenStatusText || musicNotaGenProgressLog) && (
                                    <div className="space-y-1">
                                        {musicNotaGenStatusText && (
                                            <div className="text-xs text-gray-500">{musicNotaGenStatusText}</div>
                                        )}
                                        <pre
                                            ref={musicNotaGenProgressPreRef}
                                            className="max-h-40 overflow-auto rounded border border-gray-200 bg-gray-50 p-2 text-[11px] leading-relaxed text-gray-700 whitespace-pre-wrap"
                                        >
                                            {musicNotaGenProgressLog || 'Waiting for generation output...'}
                                        </pre>
                                    </div>
                                )}
                                {musicNotaGenGeneratedXml && (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between text-xs text-gray-500">
                                            <span>Generated MusicXML</span>
                                            <span>Review before applying</span>
                                        </div>
                                        <CodeMirrorEditor
                                            value={musicNotaGenGeneratedXml}
                                            onChange={(nextValue) => setMusicNotaGenGeneratedXml(nextValue)}
                                            readOnly={false}
                                            language="xml"
                                            placeholderText="Generated MusicXML will appear here."
                                            height={220}
                                            maxHeight={320}
                                            themeMode={codeEditorTheme}
                                        />
                                    </div>
                                )}
                                {musicNotaGenGeneratedAbc && (
                                    <div className="space-y-1">
                                        <div className="text-xs text-gray-500">Generated ABC</div>
                                        <pre className="max-h-48 overflow-auto rounded border border-gray-200 bg-gray-50 p-2 text-[11px] leading-relaxed text-gray-700 whitespace-pre-wrap">
                                            {musicNotaGenGeneratedAbc}
                                        </pre>
                                    </div>
                                )}
                                {musicNotaGenResult && (
                                    <div className="space-y-1">
                                        <div className="text-xs text-gray-500">NotaGen Response</div>
                                        <pre className="max-h-64 overflow-auto rounded border border-gray-200 bg-gray-50 p-2 text-[11px] leading-relaxed text-gray-700 whitespace-pre-wrap">
                                            {JSON.stringify(musicNotaGenResult, null, 2)}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        )}
                        {xmlSidebarTab === 'mma' && (
                            <div className="mt-3 space-y-3 text-sm text-gray-700">
                                <div className="rounded border border-gray-200 bg-gray-50/70 p-3 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                            MMA (Accompaniment)
                                        </div>
                                        <a
                                            href="https://www.mellowood.ca/mma/"
                                            target="_blank"
                                            rel="noreferrer"
                                            title="MMA project documentation"
                                            aria-label="Open MMA project documentation"
                                            className="text-sm leading-none text-gray-500 hover:text-gray-700"
                                        >
                                            ⓘ
                                        </a>
                                    </div>
                                    <div className="grid gap-2 sm:grid-cols-3">
                                        <label className="flex flex-col gap-1">
                                            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                                Starter
                                            </span>
                                            <select
                                                value={mmaStarterPreset}
                                                onChange={(event) => handleMmaStarterPresetChange(event.target.value as MmaStarterPreset)}
                                                className="rounded border border-gray-300 px-2 py-1 text-sm"
                                                data-testid="select-mma-starter"
                                            >
                                                <option value="blank">Blank</option>
                                                <option value="lead-sheet">Lead Sheet (auto)</option>
                                                <option value="blues">12-bar Blues (demo)</option>
                                            </select>
                                        </label>
                                        <label className="flex flex-col gap-1">
                                            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                                Arrangement
                                            </span>
                                            <select
                                                value={mmaArrangementPreset}
                                                onChange={(event) => setMmaArrangementPreset(event.target.value as MmaArrangementPreset)}
                                                className="rounded border border-gray-300 px-2 py-1 text-sm"
                                                data-testid="select-mma-arrangement"
                                            >
                                                {MMA_ARRANGEMENT_PRESETS.map((preset) => (
                                                    <option key={preset.id} value={preset.id}>
                                                        {preset.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                        <label className="flex flex-col gap-1">
                                            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                                Groove
                                            </span>
                                            <select
                                                value={mmaGroove}
                                                onChange={(event) => setMmaGroove(event.target.value)}
                                                className="rounded border border-gray-300 px-2 py-1 text-sm"
                                                data-testid="select-mma-groove"
                                            >
                                                {MMA_GROOVE_OPTION_GROUPS.map((group) => (
                                                    <optgroup key={group.id} label={group.label}>
                                                        {group.options.map((option) => (
                                                            <option key={option.value} value={option.value}>
                                                                {option.label}
                                                            </option>
                                                        ))}
                                                    </optgroup>
                                                ))}
                                            </select>
                                        </label>
                                    </div>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <div className="rounded border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
                                            {MMA_ARRANGEMENT_PRESETS.find((preset) => preset.id === mmaArrangementPreset)?.description
                                                || 'Use the groove as-is with its default accompaniment layers.'}
                                        </div>
                                        <div className="rounded border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
                                            {findMmaGrooveOption(mmaGroove)?.description
                                                || 'Curated MMA groove from the local installed groove library.'}
                                        </div>
                                    </div>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <div className="flex items-end">
                                            <button
                                                type="button"
                                                onClick={handleMmaGenerateTemplate}
                                                disabled={mmaBusy}
                                                className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                                data-testid="btn-mma-generate-template"
                                            >
                                                {mmaBusy ? 'Working...' : 'Generate from Score'}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                        <div>For better MMA results, generate chord tags first with Chordify.</div>
                                        <div className="mt-2">
                                            <button
                                                type="button"
                                                onClick={() => setXmlSidebarTab('harmony')}
                                                className="rounded border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
                                            >
                                                Open Chordify
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => void handleHarmonyAnalyze({ applyImmediately: false, persistArtifacts: true, generateMmaTemplate: true })}
                                            disabled={mmaBusy || harmonyBusy}
                                            className="w-full rounded border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                            data-testid="btn-mma-analyze-harmony-template"
                                        >
                                            {(mmaBusy || harmonyBusy) ? 'Working...' : 'Chordify + Generate'}
                                        </button>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between text-xs text-gray-500">
                                            <span>MMA Script</span>
                                            <span>{mmaScript.trim() ? `${mmaScript.length} chars` : 'No script'}</span>
                                        </div>
                                        <CodeMirrorEditor
                                            testId="mma-editor"
                                            value={mmaScript}
                                            onChange={(nextValue) => setMmaScript(nextValue)}
                                            readOnly={mmaBusy}
                                            placeholderText="Paste or author an MMA script."
                                            language="none"
                                            height={200}
                                            maxHeight={320}
                                            themeMode={codeEditorTheme}
                                        />
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => void handleMmaRender(false)}
                                            disabled={mmaBusy || !mmaScript.trim()}
                                            className="flex-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                            data-testid="btn-mma-render-midi"
                                        >
                                            {mmaBusy ? 'Rendering...' : 'Render MIDI'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void handleMmaRender(true)}
                                            disabled={mmaBusy || !mmaScript.trim()}
                                            className="flex-1 rounded border border-blue-600 bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                            data-testid="btn-mma-render-xml"
                                        >
                                            {mmaBusy ? 'Rendering...' : 'Render + Convert to XML'}
                                        </button>
                                    </div>
                                </div>
                                <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                    Applying MMA output appends accompaniment instruments as new parts in the current score.
                                </div>
                                {mmaError && (
                                    <div className="text-xs text-red-600">
                                        {mmaError}
                                    </div>
                                )}
                                {mmaWarnings.length > 0 && (
                                    <div className="space-y-1">
                                        {mmaWarnings.map((warning, index) => (
                                            <div key={`mma-warning-${index}`} className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                                {warning}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {mmaSanitizedStderr && (
                                    <div className="space-y-1">
                                        <div className="text-xs text-gray-500">MMA diagnostics (sanitized)</div>
                                        <pre className="max-h-40 overflow-auto rounded border border-gray-200 bg-gray-50 p-2 text-[11px] leading-relaxed text-gray-700 whitespace-pre-wrap">
                                            {mmaSanitizedStderr}
                                        </pre>
                                    </div>
                                )}
                                {(mmaMidiBase64 || mmaGeneratedXml) && (
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => handleMmaDownload('mma')}
                                            disabled={!mmaScript.trim()}
                                            className="rounded border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                            data-testid="btn-mma-download-script"
                                        >
                                            Download .mma
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleMmaDownload('midi')}
                                            disabled={!mmaMidiBase64.trim()}
                                            className="rounded border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                            data-testid="btn-mma-download-midi"
                                        >
                                            Download .mid
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleMmaDownload('musicxml')}
                                            disabled={!mmaGeneratedXml.trim()}
                                            className="rounded border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                            data-testid="btn-mma-download-xml"
                                        >
                                            Download .musicxml
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleApplyMmaOutput}
                                            disabled={mmaBusy || !mmaGeneratedXml.trim()}
                                            className="rounded border border-blue-600 bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                            data-testid="btn-mma-apply-xml"
                                        >
                                            Append Parts to Score
                                        </button>
                                    </div>
                                )}
                                {mmaGeneratedXml && (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between text-xs text-gray-500">
                                            <span>Generated MusicXML</span>
                                            <span>Review before applying</span>
                                        </div>
                                        <CodeMirrorEditor
                                            testId="mma-generated-xml"
                                            value={mmaGeneratedXml}
                                            onChange={(nextValue) => setMmaGeneratedXml(nextValue)}
                                            readOnly={false}
                                            language="xml"
                                            placeholderText="Rendered MusicXML will appear here."
                                            height={220}
                                            maxHeight={360}
                                            themeMode={codeEditorTheme}
                                        />
                                    </div>
                                )}
                                {mmaResultPayload && (
                                    <details className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
                                        <summary className="cursor-pointer text-xs font-medium text-gray-700">
                                            MMA Response
                                        </summary>
                                        <pre className="mt-2 max-h-64 overflow-auto text-[11px] leading-relaxed text-gray-700 whitespace-pre-wrap">
                                            {JSON.stringify(mmaResultPayload, null, 2)}
                                        </pre>
                                    </details>
                                )}
                            </div>
                        )}
                        {xmlSidebarTab === 'harmony' && (
                            <div className="mt-3 space-y-3 text-sm text-gray-700">
                                <div className="rounded border border-gray-200 bg-gray-50/70 p-3 space-y-3">
                                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                        Chordify
                                    </div>
                                    <div className="text-xs text-gray-600">
                                        Generates MusicXML <code>{'<harmony>'}</code> tags using a music21-based analyzer. This improves MMA templates and can be used as a standalone chord-symbol enrichment pass.
                                    </div>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <label className="flex flex-col gap-1">
                                            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                                Harmonic Rhythm
                                            </span>
                                            <select
                                                value={harmonyRhythmMode}
                                                onChange={(event) => setHarmonyRhythmMode(event.target.value as HarmonyRhythmMode)}
                                                className="rounded border border-gray-300 px-2 py-1 text-sm"
                                                data-testid="select-harmony-rhythm"
                                            >
                                                <option value="auto">Auto (strong beats only)</option>
                                                <option value="measure">One chord per measure</option>
                                                <option value="beat">Allow beat-level changes</option>
                                            </select>
                                        </label>
                                        <label className="flex flex-col gap-1">
                                            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                                Max Changes / Measure
                                            </span>
                                            <input
                                                type="number"
                                                min={1}
                                                max={8}
                                                step={1}
                                                value={harmonyMaxChangesPerMeasure}
                                                onChange={(event) => {
                                                    const next = Number.parseInt(event.target.value, 10);
                                                    setHarmonyMaxChangesPerMeasure(Number.isFinite(next) ? Math.min(8, Math.max(1, next)) : 2);
                                                }}
                                                className="rounded border border-gray-300 px-2 py-1 text-sm"
                                                data-testid="input-harmony-max-changes"
                                            />
                                        </label>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => void handleHarmonyAnalyze({ applyImmediately: false, persistArtifacts: true })}
                                            disabled={harmonyBusy}
                                            className="flex-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                            data-testid="btn-harmony-analyze"
                                        >
                                            {harmonyBusy ? 'Analyzing...' : 'Chordify Score'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void handleHarmonyAnalyze({ applyImmediately: true, persistArtifacts: true })}
                                            disabled={harmonyBusy}
                                            className="flex-1 rounded border border-blue-600 bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                            data-testid="btn-harmony-analyze-apply"
                                        >
                                            {harmonyBusy ? 'Analyzing...' : 'Chordify + Apply Tags'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void handleHarmonyAnalyze({ applyImmediately: false, persistArtifacts: true, generateMmaTemplate: true })}
                                            disabled={harmonyBusy || mmaBusy}
                                            className="flex-1 rounded border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                            data-testid="btn-harmony-analyze-mma"
                                        >
                                            {(harmonyBusy || mmaBusy) ? 'Working...' : 'Chordify + Generate MMA'}
                                        </button>
                                    </div>
                                </div>
                                <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                    This feature generates chord-symbol tags for accompaniment and score enrichment. Use Harmony for Roman numerals, local keys, and cadence summaries.
                                </div>
                                {harmonyError && (
                                    <div className="text-xs text-red-600">
                                        {harmonyError}
                                    </div>
                                )}
                                {harmonyWarnings.length > 0 && (
                                    <div className="space-y-1">
                                        {harmonyWarnings.map((warning, index) => (
                                            <div key={`harmony-warning-${index}`} className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                                {warning}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {harmonyResultPayload && (
                                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                        {[
                                            ['Measures', String(Number(asRecord(harmonyResultPayload.analysis)?.measureCount ?? 0) || 0)],
                                            ['Tagged', String(Number(asRecord(harmonyResultPayload.analysis)?.harmonyTagCount ?? 0) || 0)],
                                            ['Coverage', String(asRecord(harmonyResultPayload.analysis)?.coverage ?? '0')],
                                            ['Local Key', String(asRecord(harmonyResultPayload.analysis)?.localKeyStrategy ?? 'n/a')],
                                            ['Rhythm', String(asRecord(harmonyResultPayload.analysis)?.harmonicRhythm ?? 'n/a')],
                                            ['Fallbacks', String(Number(asRecord(harmonyResultPayload.analysis)?.fallbackCount ?? 0) || 0)],
                                            ['Suppressed', String(Number(asRecord(harmonyResultPayload.analysis)?.suppressedChangeCount ?? 0) || 0)],
                                        ].map(([label, value]) => (
                                            <div key={label} className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
                                                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</div>
                                                <div className="mt-1 text-sm text-gray-800">{value}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {harmonyGeneratedXml && (
                                    <>
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={handleDownloadHarmonyXml}
                                                disabled={!harmonyGeneratedXml.trim()}
                                                className="rounded border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                                data-testid="btn-harmony-download-xml"
                                            >
                                                Download Tagged XML
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleApplyHarmonyOutput}
                                                disabled={harmonyBusy || !harmonyGeneratedXml.trim()}
                                                className="rounded border border-blue-600 bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                                data-testid="btn-harmony-apply-xml"
                                            >
                                                Apply Tagged XML
                                            </button>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between text-xs text-gray-500">
                                                <span>Tagged MusicXML</span>
                                                <span>Review before applying</span>
                                            </div>
                                            <CodeMirrorEditor
                                                testId="harmony-generated-xml"
                                                value={harmonyGeneratedXml}
                                                onChange={(nextValue) => setHarmonyGeneratedXml(nextValue)}
                                                readOnly={false}
                                                language="xml"
                                                placeholderText="Tagged MusicXML will appear here."
                                                height={220}
                                                maxHeight={360}
                                                themeMode={codeEditorTheme}
                                            />
                                        </div>
                                    </>
                                )}
                                {harmonyResultPayload && (
                                    <details className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
                                        <summary className="cursor-pointer text-xs font-medium text-gray-700">
                                            Chordify Response
                                        </summary>
                                        <pre className="mt-2 max-h-64 overflow-auto text-[11px] leading-relaxed text-gray-700 whitespace-pre-wrap">
                                            {JSON.stringify(harmonyResultPayload, null, 2)}
                                        </pre>
                                    </details>
                                )}
                            </div>
                        )}
                        {xmlSidebarTab === 'functional' && (
                            <div className="mt-3 space-y-3 text-sm text-gray-700">
                                <div className="rounded border border-gray-200 bg-gray-50/70 p-3 space-y-3">
                                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                        Harmony
                                    </div>
                                    <div className="text-xs text-gray-600">
                                        Roman-numeral and local-key analysis for theory-oriented review. This workflow does not modify the score in Phase 1.
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => void handleFunctionalHarmonyAnalyze()}
                                            disabled={functionalHarmonyBusy}
                                            className="flex-1 rounded border border-blue-600 bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                            data-testid="btn-functional-harmony-analyze"
                                        >
                                            {functionalHarmonyBusy ? 'Analyzing...' : 'Analyze Harmony'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDownloadFunctionalHarmony('json')}
                                            disabled={!functionalHarmonyJsonExport.trim()}
                                            className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                            data-testid="btn-functional-harmony-download-json"
                                        >
                                            Download JSON
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDownloadFunctionalHarmony('rntxt')}
                                            disabled={!functionalHarmonyRntxtExport.trim()}
                                            className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                            data-testid="btn-functional-harmony-download-rntxt"
                                        >
                                            Download RN Text
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleDownloadFunctionalHarmonyXml}
                                            disabled={!functionalHarmonyAnnotatedXml.trim()}
                                            className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                            data-testid="btn-functional-harmony-download-xml"
                                        >
                                            Download Annotated XML
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void handleApplyFunctionalHarmonyOutput()}
                                            disabled={functionalHarmonyBusy || !functionalHarmonyAnnotatedXml.trim()}
                                            className="rounded border border-blue-600 bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                            data-testid="btn-functional-harmony-apply-xml"
                                        >
                                            Apply Roman Numerals
                                        </button>
                                    </div>
                                </div>
                                <div className="rounded border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                                    Use Chordify for chord symbols and MMA preparation. Use Harmony for Roman numerals, local keys, and cadence/modulation summaries.
                                </div>
                                {functionalHarmonyError && (
                                    <div className="text-xs text-red-600">
                                        {functionalHarmonyError}
                                    </div>
                                )}
                                {functionalHarmonyWarnings.length > 0 && (
                                    <div className="space-y-1">
                                        {functionalHarmonyWarnings.map((warning, index) => (
                                            <div key={`functional-harmony-warning-${index}`} className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                                {warning}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {functionalHarmonyResult && (
                                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                        {[
                                            ['Measures', String(Number(asRecord(functionalHarmonyResult.analysis)?.measureCount ?? 0) || 0)],
                                            ['Segments', String(Number(asRecord(functionalHarmonyResult.analysis)?.segmentCount ?? 0) || 0)],
                                            ['Coverage', String(asRecord(functionalHarmonyResult.analysis)?.coverage ?? '0')],
                                            ['Local Keys', String(Number(asRecord(functionalHarmonyResult.analysis)?.localKeyCount ?? 0) || 0)],
                                            ['Modulations', String(Number(asRecord(functionalHarmonyResult.analysis)?.modulationCount ?? 0) || 0)],
                                            ['Cadences', String(Number(asRecord(functionalHarmonyResult.analysis)?.cadenceCount ?? 0) || 0)],
                                            ['Backend', String(asRecord(functionalHarmonyResult.analysis)?.engine ?? 'n/a')],
                                        ].map(([label, value]) => (
                                            <div key={label} className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
                                                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</div>
                                                <div className="mt-1 text-sm text-gray-800">{value}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {functionalHarmonySegments.length > 0 && (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between text-xs text-gray-500">
                                            <span>Segments</span>
                                            <span>{functionalHarmonySegments.length} segment(s)</span>
                                        </div>
                                        <div className="max-h-64 overflow-auto rounded border border-gray-200 bg-gray-50">
                                            <table className="min-w-full text-left text-xs">
                                                <thead className="sticky top-0 bg-gray-100 text-gray-600">
                                                    <tr>
                                                        <th className="px-3 py-2 font-semibold">Measure</th>
                                                        <th className="px-3 py-2 font-semibold">RN</th>
                                                        <th className="px-3 py-2 font-semibold">Key</th>
                                                        <th className="px-3 py-2 font-semibold">Function</th>
                                                        <th className="px-3 py-2 font-semibold">Cadence</th>
                                                        <th className="px-3 py-2 font-semibold">Conf.</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {functionalHarmonySegments.slice(0, 200).map((segment, index) => (
                                                        <tr key={`functional-harmony-segment-${index}`} className="border-t border-gray-200">
                                                            <td className="px-3 py-2 text-gray-700">{String(segment.measureNumber ?? segment.measureIndex ?? '')}</td>
                                                            <td className="px-3 py-2 font-mono text-gray-900">{String(segment.romanNumeral ?? '')}</td>
                                                            <td className="px-3 py-2 text-gray-700">{String(segment.key ?? '')}</td>
                                                            <td className="px-3 py-2 text-gray-700">{String(segment.functionLabel ?? '')}</td>
                                                            <td className="px-3 py-2 text-gray-700">{String(segment.cadenceLabel ?? '')}</td>
                                                            <td className="px-3 py-2 text-gray-700">{segment.confidence === undefined || segment.confidence === null ? '' : String(segment.confidence)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                                {functionalHarmonyRntxtExport && (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between text-xs text-gray-500">
                                            <span>RN Text Export</span>
                                            <span>Review before download</span>
                                        </div>
                                        <CodeMirrorEditor
                                            testId="functional-harmony-rntxt"
                                            value={functionalHarmonyRntxtExport}
                                            onChange={(nextValue) => setFunctionalHarmonyRntxtExport(nextValue)}
                                            readOnly={false}
                                            language="none"
                                            placeholderText="Harmony text export will appear here."
                                            height={180}
                                            maxHeight={280}
                                            themeMode={codeEditorTheme}
                                        />
                                    </div>
                                )}
                                {functionalHarmonyAnnotatedXml && (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between text-xs text-gray-500">
                                            <span>Annotated MusicXML</span>
                                            <span>Review before applying</span>
                                        </div>
                                        <CodeMirrorEditor
                                            testId="functional-harmony-annotated-xml"
                                            value={functionalHarmonyAnnotatedXml}
                                            onChange={(nextValue) => setFunctionalHarmonyAnnotatedXml(nextValue)}
                                            readOnly={false}
                                            language="xml"
                                            placeholderText="Annotated MusicXML will appear here."
                                            height={220}
                                            maxHeight={360}
                                            themeMode={codeEditorTheme}
                                        />
                                    </div>
                                )}
                                {functionalHarmonyResult && (
                                    <details className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
                                        <summary className="cursor-pointer text-xs font-medium text-gray-700">
                                            Harmony Response
                                        </summary>
                                        <pre className="mt-2 max-h-64 overflow-auto text-[11px] leading-relaxed text-gray-700 whitespace-pre-wrap">
                                            {JSON.stringify(functionalHarmonyResult, null, 2)}
                                        </pre>
                                    </details>
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
                            <label className="flex items-center gap-2 mt-2">
                                <input
                                    data-testid="new-score-pickup-checkbox"
                                    type="checkbox"
                                    checked={newScoreWithPickup}
                                    onChange={(event) => setNewScoreWithPickup(event.target.checked)}
                                    className="rounded border-gray-300"
                                />
                                <span className="text-sm text-gray-700">Include pickup measure</span>
                            </label>
                            {newScoreWithPickup && (
                                <div className="grid gap-3 sm:grid-cols-2 mt-2">
                                    <label className="flex flex-col gap-1">
                                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            Pickup Numerator
                                        </span>
                                        <input
                                            data-testid="new-score-pickup-numerator"
                                            type="number"
                                            min={1}
                                            value={newScorePickupNumerator}
                                            onChange={(event) => setNewScorePickupNumerator(Number(event.target.value) || 1)}
                                            className="rounded border border-gray-300 px-2 py-1 text-sm"
                                        />
                                    </label>
                                    <label className="flex flex-col gap-1">
                                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            Pickup Denominator
                                        </span>
                                        <select
                                            data-testid="new-score-pickup-denominator"
                                            value={String(newScorePickupDenominator)}
                                            onChange={(event) => setNewScorePickupDenominator(Number(event.target.value))}
                                            className="rounded border border-gray-300 px-2 py-1 text-sm"
                                        >
                                            <option value="1">1</option>
                                            <option value="2">2</option>
                                            <option value="4">4</option>
                                            <option value="8">8</option>
                                            <option value="16">16</option>
                                            <option value="32">32</option>
                                        </select>
                                    </label>
                                </div>
                            )}
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
                                {compareView.title === 'Assistant Proposal' && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => void handleAcceptAllAiChanges()}
                                            disabled={compareSwapBusy || aiDiffFeedbackBusy}
                                            className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                        >
                                            Accept All AI Changes
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void handleSendDiffFeedback()}
                                            disabled={!canSendDiffFeedback}
                                            className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                        >
                                            {aiDiffFeedbackBusy ? 'Sending...' : diffFeedbackButtonLabel}
                                        </button>
                                    </>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setCompareView(null)}
                                    className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                                >
                                    {isAiCompareMode ? 'Done - Close' : 'Close'}
                                </button>
                            </div>
                        </div>
                        )}
                        <div className={isEmbedMode ? "flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4" : "flex min-h-0 flex-1 flex-col gap-4 overflow-auto"}>
                            {!isEmbedMode && isAiCompareMode && (
                                <div className="rounded border border-gray-300 bg-gray-100 p-3">
                                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-900">
                                        Global Feedback for Next AI Iteration
                                    </div>
                                    <div className="mt-1 text-[11px] text-gray-700">
                                        Optional. Use this for overall guidance that applies across multiple diff blocks.
                                    </div>
                                    <textarea
                                        value={aiDiffGlobalComment}
                                        onChange={(event) => setAiDiffGlobalComment(event.target.value)}
                                        placeholder="Overall feedback for the next revision..."
                                        className="mt-2 min-h-[56px] w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 placeholder-gray-500"
                                        disabled={aiDiffFeedbackBusy}
                                    />
                                    <div className="mt-2 text-[11px] text-gray-700">
                                        Iteration {aiDiffIteration + 1} review
                                    </div>
                                    {aiDiffFeedbackError && (
                                        <div className="mt-2 rounded border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] text-rose-700">
                                            Last feedback request failed: {aiDiffFeedbackError}
                                        </div>
                                    )}
                                </div>
                            )}
                            <div className="flex min-h-0 min-w-0 flex-1 overflow-x-hidden">
                                <div className="flex min-h-0 min-w-0 flex-1 gap-4">
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
                                    <div
                                        className={`flex min-h-0 flex-none flex-col items-stretch gap-2 ${isAiCompareMode ? '' : 'w-44'}`}
                                        style={isAiCompareMode ? { width: `${aiDiffGutterWidth}px` } : undefined}
                                    >
                                        <button
                                            type="button"
                                            onClick={handleCompareSwapSides}
                                            disabled={isAiCompareMode}
                                            className="self-center rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                            title={isAiCompareMode ? 'Swap is disabled for assistant diff review.' : 'Swap left and right panes'}
                                        >
                                            ⇄ Swap
                                        </button>
                                        <div
                                            ref={compareGutterScrollRef}
                                            className="flex min-h-0 w-full flex-1 flex-col gap-3 overflow-x-visible overflow-y-auto rounded border border-gray-200 bg-gray-50 p-2 text-[10px] text-gray-500"
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
                                                                const measureStart = rightIndices.length ? rightStart : leftStart;
                                                                const measureEnd = rightIndices.length ? rightEnd : leftEnd;
                                                                const measureRange = measureStart !== undefined
                                                                    ? `${measureStart + 1}${measureEnd !== measureStart ? `-${measureEnd + 1}` : ''}`
                                                                    : 'unknown';
                                                                const stableMeasureKey = measureRange !== 'unknown'
                                                                    ? measureRange
                                                                    : `${blockIndex}:${leftStart ?? 'x'}:${leftEnd ?? 'x'}:${rightStart ?? 'x'}:${rightEnd ?? 'x'}`;
                                                                const blockKey = `${index}:${stableMeasureKey}`;
                                                                const aiBlock = {
                                                                    partIndex: index,
                                                                    blockIndex,
                                                                    blockKey,
                                                                    measureRange,
                                                                };
                                                                const review = aiDiffReviewByKey.get(blockKey)
                                                                    ?? aiDiffReviewByRange.get(`${index}:${measureRange}`);
                                                                const reviewStatus = review?.status ?? 'pending';
                                                                const reviewComment = review?.comment ?? '';
                                                                const commentCommitted = Boolean(review?.commentCommitted);
                                                                const blockError = aiDiffBlockErrors[blockKey] ?? '';
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
                                                                        className={`absolute left-0 right-0 rounded border bg-white px-2 py-2 ${
                                                                            isAiCompareMode
                                                                                ? (reviewStatus === 'accepted'
                                                                                    ? 'border-emerald-300'
                                                                                    : reviewStatus === 'rejected'
                                                                                        ? 'border-rose-300'
                                                                                        : reviewStatus === 'comment'
                                                                                            ? 'border-sky-300'
                                                                                            : 'border-gray-200')
                                                                                : 'border-gray-200'
                                                                        }`}
                                                                        style={{
                                                                            top: `${blockTop}px`,
                                                                            height: `${blockHeight}px`,
                                                                        }}
                                                                    >
                                                                        <div className="flex items-center justify-between text-[9px] text-gray-400">
                                                                            <span className={`rounded px-1 py-0.5 ${leftDiff ? 'bg-rose-100 text-rose-600' : ''}`}>
                                                                                {leftLabel}
                                                                            </span>
                                                                            <span className={`rounded px-1 py-0.5 ${rightDiff ? 'bg-emerald-100 text-emerald-600' : ''} ${
                                                                                isAiCompareMode && reviewStatus === 'accepted' ? 'line-through opacity-70' : ''
                                                                            }`}>
                                                                                {rightLabel}
                                                                            </span>
                                                                        </div>
                                                                        {!isEmbedMode && isAiCompareMode && (
                                                                            <div className="mt-1 grid gap-1">
                                                                                <div className="grid grid-cols-3 gap-1">
                                                                                    <button
                                                                                        type="button"
                                                                                        disabled={compareSwapBusy || compareAlignmentLoading || !compareLeftScore || !compareRightScoreDisplay || !canOverwrite || aiDiffFeedbackBusy || Boolean(compareRightError)}
                                                                                        className={`h-6 rounded border text-[10px] ${
                                                                                            reviewStatus === 'accepted'
                                                                                                ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                                                                                                : 'border-gray-200 bg-gray-100 text-gray-600'
                                                                                        } disabled:opacity-50`}
                                                                                        onClick={() => void handleAcceptAiDiffBlock(aiBlock, pairs)}
                                                                                    >
                                                                                        Accept
                                                                                    </button>
                                                                                    <button
                                                                                        type="button"
                                                                                        disabled={aiDiffFeedbackBusy || compareAlignmentLoading}
                                                                                        className={`h-6 rounded border text-[10px] ${
                                                                                            reviewStatus === 'rejected'
                                                                                                ? 'border-rose-400 bg-rose-50 text-rose-700'
                                                                                                : 'border-gray-200 bg-gray-100 text-gray-600'
                                                                                        } disabled:opacity-50`}
                                                                                        onClick={() => {
                                                                                            setAiDiffBlockStatus(aiBlock, 'rejected');
                                                                                            setAiDiffBlockErrors((prev) => {
                                                                                                if (!prev[blockKey]) {
                                                                                                    return prev;
                                                                                                }
                                                                                                const next = { ...prev };
                                                                                                delete next[blockKey];
                                                                                                return next;
                                                                                            });
                                                                                        }}
                                                                                    >
                                                                                        Reject
                                                                                    </button>
                                                                                    <button
                                                                                        type="button"
                                                                                        disabled={aiDiffFeedbackBusy || compareAlignmentLoading}
                                                                                        className={`h-6 rounded border text-[10px] ${
                                                                                            reviewStatus === 'comment'
                                                                                                ? 'border-sky-400 bg-sky-50 text-sky-700'
                                                                                                : 'border-gray-200 bg-gray-100 text-gray-600'
                                                                                        } disabled:opacity-50`}
                                                                                        onClick={() => {
                                                                                            setAiDiffBlockStatus(aiBlock, 'comment');
                                                                                            setAiDiffBlockErrors((prev) => {
                                                                                                if (!prev[blockKey]) {
                                                                                                    return prev;
                                                                                                }
                                                                                                const next = { ...prev };
                                                                                                delete next[blockKey];
                                                                                                return next;
                                                                                            });
                                                                                        }}
                                                                                    >
                                                                                        Comment
                                                                                    </button>
                                                                                </div>
                                                                                {reviewStatus === 'comment' && (
                                                                                    <>
                                                                                        {!commentCommitted && (
                                                                                            <>
                                                                                                <textarea
                                                                                                    ref={(element) => bindAiDiffCommentTextarea(blockKey, element)}
                                                                                                    defaultValue={reviewComment}
                                                                                                    onChange={() => handleAiDiffBlockCommentInput(aiBlock)}
                                                                                                    onPointerUp={(event) => handleAiDiffCommentResize(event.currentTarget)}
                                                                                                    onPointerMove={(event) => {
                                                                                                        if (event.buttons === 1) {
                                                                                                            handleAiDiffCommentResize(event.currentTarget);
                                                                                                        }
                                                                                                    }}
                                                                                                    onMouseUp={(event) => handleAiDiffCommentResize(event.currentTarget)}
                                                                                                    onMouseMove={(event) => {
                                                                                                        if (event.buttons === 1) {
                                                                                                            handleAiDiffCommentResize(event.currentTarget);
                                                                                                        }
                                                                                                    }}
                                                                                                    placeholder="Describe the revision needed..."
                                                                                                    className="min-h-[84px] min-w-[220px] w-full max-w-none resize rounded border border-sky-300 bg-white px-2 py-1 text-[10px] text-gray-900 placeholder-gray-400"
                                                                                                    disabled={aiDiffFeedbackBusy}
                                                                                                />
                                                                                                <div className="flex justify-end">
                                                                                                    <button
                                                                                                        type="button"
                                                                                                        disabled={aiDiffFeedbackBusy || compareAlignmentLoading}
                                                                                                        className="h-6 rounded border border-sky-300 bg-sky-50 px-2 text-[10px] text-sky-700 disabled:opacity-50"
                                                                                                        onClick={() => commitAiDiffBlockComment(aiBlock)}
                                                                                                    >
                                                                                                        Enter
                                                                                                    </button>
                                                                                                </div>
                                                                                            </>
                                                                                        )}
                                                                                        {commentCommitted && (
                                                                                            <div className="grid gap-1 rounded border border-sky-200 bg-sky-50 px-2 py-1">
                                                                                                <div className="text-[9px] font-semibold uppercase tracking-wide text-sky-700">
                                                                                                    Comment attached
                                                                                                </div>
                                                                                                <div className="whitespace-pre-wrap text-[10px] text-sky-900">
                                                                                                    {reviewComment}
                                                                                                </div>
                                                                                                <div className="flex justify-end">
                                                                                                    <button
                                                                                                        type="button"
                                                                                                        disabled={aiDiffFeedbackBusy || compareAlignmentLoading}
                                                                                                        className="h-6 rounded border border-sky-300 bg-white px-2 text-[10px] text-sky-700 disabled:opacity-50"
                                                                                                        onClick={() => editAiDiffBlockComment(aiBlock)}
                                                                                                    >
                                                                                                        Edit
                                                                                                    </button>
                                                                                                </div>
                                                                                            </div>
                                                                                        )}
                                                                                    </>
                                                                                )}
                                                                                {blockError && (
                                                                                    <div className="text-[9px] text-rose-600">
                                                                                        {blockError}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                        {!isEmbedMode && canOverwrite && !isAiCompareMode && (
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
