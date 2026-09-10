'use client';

import React, { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PanelRightOpen, PanelRightClose } from 'lucide-react';
import {
  loadWebMscore,
  Score,
  type GripEditInfo,
  InputFileFormat,
  Positions,
  type InspectorPropertyName,
  type SelectedElementProperties,
  type FretDiagramData,
  type SynthAudioBatchIterator,
} from '../lib/webmscore-loader';
import { EMPTY_STAFF_BANDS, loadStaffBands, type StaffBands } from '../lib/compare-staff-bands';
import {
  buildPartLocalizedAlignmentHighlights,
  buildPartLocalizedChangeReviewBarHighlights,
  buildPartLocalizedChangeReviewHighlights,
  buildPartLocalizedSuppliedHighlights,
  localizeMeasureToPart,
  sortChangeReviewRegionsByMeasure,
  type SuppliedCompareRegion,
} from '../lib/compare-highlights';
import {
  deleteCheckpoint,
  renameCheckpoint,
  getCheckpoint,
  isIndexedDbAvailable,
  listCheckpoints,
  listScoreSummaries,
  saveCheckpoint,
  type CheckpointSummary,
  type ScoreSummary,
} from '../lib/checkpoints';
import { type CodeEditorThemeMode } from './CodeMirrorEditor';
import { asRecord } from '../lib/as-record';
import { findAiEditProposal, type AiEditProposal } from '../lib/ai-edit-proposal';
import { fetchJsonOrThrow } from '../lib/fetch-json';
import { copySelectionToClipboard, pasteClipboardPayload } from '../lib/selection-clipboard';
import { Toolbar, type MeasureInsertTarget, type HeaderTextTarget } from './Toolbar';
import { InspectorPanel } from './InspectorPanel';
import { FloatingPalettes } from './FloatingPalettes';
import {
  SCORE_PALETTE_DRAG_MIME,
  parseScorePaletteItem,
  scorePaletteMutation,
  type PaletteCategory,
  type ScorePaletteItem,
} from './toolbar/palette';
import { articulationOptions } from './toolbar/constants';
import { LeftSidebar, type LeftSidebarTab } from './score-editor/LeftSidebar';
import {
  AI_PROVIDER_CONFIGS,
  AI_PROVIDER_LABELS,
  DEFAULT_MODEL_BY_PROVIDER,
  loadAiModelDescriptorsDirect,
  requestAiTextDirect,
  type AiProvider,
} from '../lib/ai-provider-adapters';
import {
  parseAiModelDescriptors,
  resolveAiModelDescriptor,
  detectUnsupportedAiRequestParameter,
  AI_MODEL_CAPABILITY_REGISTRY_VERSION,
  type OptionalAiRequestParameter,
  type AiModelDescriptor,
} from '../lib/ai-model-capabilities';
import {
  getLegacyLlmProxyBase,
  getScoreEditorApiBase,
  resolveLlmApiPath,
  resolveScoreEditorApiPath,
} from '../lib/score-editor-api-client';
import {
  parseEditorLaunchContextParam,
  type EditorLaunchContext,
  sanitizeEditorLaunchContext,
} from '../lib/editor-launch-context';
import {
  buildSourceCanonicalXmlUrl,
  commitSourceRevision,
  createSourceBranch,
  getSourceCanonicalXml,
  getSourceHistory,
  OurTextScoresApiError,
  type SourceHistoryResponse,
  type SourceHistoryRevision,
} from '../lib/ourtextscores-api-client';
import { appendMusicXmlMeasures, appendMusicXmlParts } from '../lib/musicxml-append-parts';
import { sanitizeEngineSvg } from '../lib/sanitize-svg';
import { DEFAULT_RENDER_WINDOW, type RenderWindow } from '../lib/playback-window';
import {
  cancelSynthStream,
  scheduleSynthBatchStream,
  stopSynthStream as stopSharedSynthStream,
} from '../lib/playback/stream-scheduler';
import { SoundFontManager } from '../lib/playback/soundfont-manager';
import {
  LARGE_SCORE_THRESHOLD_BYTES,
  isLargeScoreData,
  loadScoreWithEngineFallback as loadScoreWithSharedEngineFallback,
  requestScoreLayoutProgress,
  shouldSkipCoverPageFirstRender,
} from '../lib/score-loader';
import {
  extractPatchAnnotations,
  PATCH_ANNOTATIONS_INSTRUCTION,
  type PatchAnnotation,
} from '../lib/patch-annotations';
import {
  extractTraceContextFromHeaders,
  getOrCreateEditorSessionId,
  trackEditorAnalyticsEvent,
} from '../lib/editor-analytics';
import {
  buildScoreEditorShareUrl,
  detectScoreInputFormat,
  isGoogleDriveScoreUrl,
  resolvePublicScoreUrl,
} from '../lib/public-score-url';
import { type MmaArrangementPreset } from '../lib/music-mma-presets';
import { DEFAULT_MMA_GROOVE } from '../lib/music-mma-grooves';
import {
  advanceClientProposalSession,
  buildProposalSessionRequestPayload,
  createClientProposalSession,
  type ClientProposalSession,
} from '../lib/proposal-session-client';
import { AI_EDIT_EFFORT_PROFILES } from '../lib/ai-edit-effort';
import { readAiEditServiceResponse } from '../lib/ai-edit-progress-client';
import { useAiEditController } from './score-editor/useAiEditController';
import { useAiProposalController } from './score-editor/useAiProposalController';
import { AiAssistantPanel } from './score-editor/AiAssistantPanel';
import { MultitrackVaePanel } from './score-editor/MultitrackVaePanel';
import { AiCompareWorkspace, AiCompareWorkspaceActions } from './score-editor/AiCompareWorkspace';
import {
  CompareMeasureComments,
  type AiMeasureAnchor,
  type AiMeasureThread,
  type AiThreadComment,
} from './score-editor/compare/CompareMeasureComments';
import { CompareDiffGutter } from './score-editor/compare/CompareDiffGutter';
import {
  buildAlignmentGaps,
  buildCompareSystemGeometry,
  buildCompareReflowPlan,
  buildResyncBreaks,
  measureStructuralGapResidual,
  mergeAlignmentGaps,
  type MeasureGap,
} from './score-editor/compare/compare-reflow-plan';
import { createCompareScrollSync } from './score-editor/compare/compare-scroll-sync';
import { MmaPanel, type MmaStarterPreset } from './score-editor/ai-tools/MmaPanel';
import { TranscodaPanel } from './score-editor/ai-tools/TranscodaPanel';
import { FunctionalHarmonyPanel } from './score-editor/ai-tools/FunctionalHarmonyPanel';
import { HarmonyPanel, type HarmonyRhythmMode } from './score-editor/ai-tools/HarmonyPanel';
import { NotaGenPanel } from './score-editor/ai-tools/NotaGenPanel';
import { NewScoreDialog } from './score-editor/NewScoreDialog';
import { ChangeReviewScorePanel } from './score-editor/ChangeReviewScorePanel';
import { PngExportDialog } from './score-editor/PngExportDialog';
import { CompareScoreLoaderDialog } from './score-editor/CompareScoreLoaderDialog';
import { loadCompareScoreMusicXml } from '../lib/compare-score-file';
import { GoogleDriveExportDialog } from './score-editor/GoogleDriveExportDialog';
import { ShareLinkDialog } from './score-editor/ShareLinkDialog';
import { MusicXmlPanel, CODE_EDITOR_THEME_OPTIONS } from './score-editor/MusicXmlPanel';
import { AiToolsTabStrip, type AiToolsTab } from './score-editor/ai-tools/AiToolsTabStrip';
import { resolveComparePaneStatus } from './score-editor/compare/compare-pane-status';
import { CompareScorePane } from './score-editor/compare/CompareScorePane';
import { ScannerSystemRows, type ScannerSystem } from './score-editor/compare/ScannerSystemRows';
import type { MergedScoreState } from './score-editor/compare/useMergedScoreDocument';
import { XmlDiffView } from './score-editor/XmlDiffView';
import { useAiAssistantController } from './score-editor/useAiAssistantController';
import {
  type AiChatMessage,
  type AiImageAttachment,
  type AiPdfAttachment,
  type AiSourceRagInfo,
  type MusicXmlPatch,
  type MusicXmlPatchOp,
} from './score-editor/ai-assistant-types';
import { type AiScoreBridge } from './score-editor/ai-score-bridge';
import { useLatestCallbackFacade } from '@/lib/use-latest-callback-facade';
import type {
  AiDiffBlockRef,
  BlockReview,
  BlockReviewStatus,
  ChangeReviewDetail,
  ChangeReviewDiff,
  ChangeReviewScoreView,
  ChangeReviewThread,
  CompareBlockComment,
  CompareSide,
} from './score-editor/compare/compare-types';
import { useCompareClipboard } from './score-editor/compare/useCompareClipboard';
import { useComparePersistence } from './score-editor/compare/useComparePersistence';
import { useCompareOperationCoordinator } from './score-editor/compare/useCompareOperationCoordinator';
import { useCompareTransport } from './score-editor/compare/useCompareTransport';
import {
  routeCompareKeyboardShortcut,
  type CompareInputStateMethod,
  type CompareKeyboardMutationMethod,
} from './score-editor/compare/compare-keyboard-policy';
import {
  useCompareEditing,
  useCompareMutationController,
} from './score-editor/compare/useCompareEditing';
import {
  buildCompareUserEditDiff,
  type CompareScoreRole,
  type CompareUserEditDiff,
} from '../lib/compare-user-edit-diff';

type SelectionBox = {
  index: number | null;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  centerX: number;
  centerY: number;
  classes?: string;
  isMeasureBbox?: boolean;
};

type SelectionGeometryBox = {
  index?: number | null;
  page?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  width?: number;
  height?: number;
  classes?: string;
};

type SelectionFallback = {
  index: number | null;
  point: { page: number; x: number; y: number };
} | null;

type NoteInputCursorRect = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  voice: number;
};

type CompareViewState = {
  title: string;
  currentXml: string;
  checkpointXml: string;
  currentLabel?: string;
  checkpointLabel?: string;
};

type MeasureAlignmentRow = {
  leftIndex: number | null;
  rightIndex: number | null;
  match: boolean;
};

type SynthBatchIterator = SynthAudioBatchIterator;

type NotaGenSpaceCombinations = Record<string, Record<string, string[]>>;

const TRANSPORT_SYNTH_BATCH_SIZE = 2;
const SELECTION_SYNTH_BATCH_SIZE = 8;
const PREVIEW_SYNTH_BATCH_SIZE = 1;
const PREVIEW_DURATION_MS = 350;
const SYNTH_START_PREROLL_SECONDS = 0.015;
const SELECTION_SYNTH_START_PREROLL_SECONDS = 0.12;
const SELECTION_STREAM_STARTUP_BUFFER_SECONDS = 0.6;
const SELECTION_STREAM_MIN_STARTUP_BATCHES = 3;
const LARGE_SCORE_INTERACTION_PRIME_DELAY_MS = 0;

type PartAlignment = {
  partIndex: number;
  rows: MeasureAlignmentRow[];
  strategy: 'index' | 'lcs';
  lcsRatio: number;
  leftCount: number;
  rightCount: number;
};

type CompareAppliedSpacer = {
  score: Score;
  measureIndex: number;
  staffIndex: number;
};

const LAYOUT_MODES = {
  PAGE: 0,
  FLOAT: 1,
  LINE: 2,
  SYSTEM: 3,
  HORIZONTAL_FIXED: 4,
} as const;

const SELECTION_FILTER_STORAGE_KEY = 'ots_editor_selection_filter_v1';
const DEFAULT_SELECTION_FILTER_MASK = 0xffffff;
const NOTE_INPUT_VOICE_COLORS = ['#0065BF', '#007F00', '#C53F00', '#C31989'] as const;

type MutationMethods = Pick<
  Score,
  | 'selectElementAtPoint'
  | 'selectElementAtPointWithMode'
  | 'selectNextChord'
  | 'selectPrevChord'
  | 'extendSelectionNextChord'
  | 'extendSelectionPrevChord'
  | 'extendMeasureSelectionAtPoint'
  | 'isSelectionRange'
  | 'extendSelectionNextMeasure'
  | 'extendSelectionPrevMeasure'
  | 'extendSelectionStaffAbove'
  | 'extendSelectionStaffBelow'
  | 'beginElementDrag'
  | 'updateElementDrag'
  | 'endElementDrag'
  | 'applyDropAtPoint'
  | 'beginGripEdit'
  | 'dragGrip'
  | 'endGripEdit'
  | 'selectAll'
  | 'getSelectionBoundingBox'
  | 'getSelectionBoundingBoxes'
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
  | 'getNoteInputCursorRect'
  | 'setNoteEntryMethod'
  | 'setInputStateFromSelection'
  | 'setInputAccidentalType'
  | 'setInputDurationType'
  | 'toggleInputDot'
  | 'putNote'
  | 'addPitchByStep'
  | 'enterRest'
  | 'setDurationType'
  | 'toggleLineBreak'
  | 'togglePageBreak'
  | 'setVoice'
  | 'changeSelectedElementsVoice'
  | 'addDynamic'
  | 'addHairpin'
  | 'addFermata'
  | 'addBreath'
  | 'addArpeggio'
  | 'addTremolo'
  | 'addOttava'
  | 'addTrill'
  | 'addGlissando'
  | 'addPedal'
  | 'addSostenutoPedal'
  | 'addUnaCorda'
  | 'splitPedal'
  | 'addTempoText'
  | 'addArticulation'
  | 'addSlur'
  | 'flipStem'
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
  | 'getSelectedElementProperties'
  | 'setSelectedElementProperty'
  | 'addFretDiagram'
  | 'getSelectedFretDiagram'
  | 'setSelectedFretDiagram'
  | 'addAmbitus'
  | 'explodeSelection'
  | 'implodeSelection'
  | 'regroupSelection'
  | 'resequenceRehearsalMarks'
  | 'appendPart'
  | 'appendPartByMusicXmlId'
  | 'removePart'
  | 'setPartVisible'
  | 'addNoteFromRest'
  | 'undo'
  | 'redo'
  | 'relayout'
  | 'setTimeSignature'
  | 'setTimeSignatureWithType'
  | 'setKeySignature'
  | 'setHarmonyVoiceLiteral'
  | 'setChordSymbolStylePreset'
  | 'setClef'
  | 'toggleRepeatStart'
  | 'toggleRepeatEnd'
  | 'setRepeatCount'
  | 'setBarLineType'
  | 'addVolta'
  | 'addMarker'
  | 'addJump'
  | 'setNoteheadGroup'
  | 'setBeamMode'
  | 'setSelectionFilter'
  | 'addMeasureRepeat'
  | 'setMultiMeasureRests'
  | 'multiMeasureRestsEnabled'
  | 'insertMeasures'
  | 'addPickupMeasure'
  | 'removeSelectedMeasures'
  | 'removeTrailingEmptyMeasures'
>;

const PROXY_MISSING_STATUSES = new Set([404, 405, 501]);
const AI_CHAT_SOURCE_RAG_HINT_DISMISSED_STORAGE_KEY = 'ots_ai_chat_source_rag_hint_dismissed';
const ANTHROPIC_EMBED_PROXY_ERROR = [
  'Claude requires an LLM proxy in embed mode because browser-direct Anthropic calls are blocked by CORS.',
  'Configure NEXT_PUBLIC_SCORE_EDITOR_API_BASE (recommended) or NEXT_PUBLIC_LLM_PROXY_URL, or serve /api/llm/anthropic on the same origin.',
].join(' ');

type HarmonyVariant = 0 | 1 | 2;

type AiPromptSection = {
  title: string;
  content: string;
};

const aiDiffBlockContentSignature = (
  signatures: { left: string[][]; right: string[][] } | null,
  partIndex: number,
  leftIndices: number[],
  rightIndices: number[],
): string => {
  if (!signatures) {
    return '';
  }
  const leftSigs = leftIndices.map((index) => signatures.left[partIndex]?.[index] ?? `?${index}`);
  const rightSigs = rightIndices.map(
    (index) => signatures.right[partIndex]?.[index] ?? `?${index}`,
  );
  const text = `${leftSigs.join('\u0001')}\u0002${rightSigs.join('\u0001')}`;
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return `blocksig-v1:${(hash >>> 0).toString(16)}:${text.length}`;
};

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

type ApplyXmlToScore = (
  sourceXml: string,
  options?: {
    telemetrySource?: string;
    inputFormat?: string;
    enforceJazzHarmonyStyle?: boolean;
  },
) => Promise<boolean>;

type StopCompareSideAudio = (
  side: CompareSide,
  options?: { awaitCancel?: boolean },
) => Promise<void>;

type HandleUrlLoad = (url: string, signal?: AbortSignal) => Promise<boolean>;
type HandleFileUploadOptions = {
  preserveScoreId?: boolean;
  scoreIdOverride?: string;
  updateUrl?: boolean;
  createInitialCheckpoint?: boolean;
  telemetrySource?: string;
};
type HandleFileUpload = (file: File, options?: HandleFileUploadOptions) => Promise<boolean>;
type RefreshPageCount = (targetScore: Score, preferredPage?: number) => Promise<number>;
type RenderScore = (
  currentScore: Score,
  pageIndex?: number,
  highlightSelection?: boolean,
) => Promise<boolean>;
type EnsureSoundFontLoaded = (
  targetScore?: Score,
  options?: { forceRetry?: boolean },
) => Promise<boolean>;

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

const buildOtsScoreId = (workId: string, sourceId: string) => `ots:${workId}:${sourceId}`;

const parseSvgNumeric = (value: string | null) => {
  if (!value || value.includes('%')) {
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
const AI_PATCH_SYSTEM_PROMPT =
  'You are a MusicXML editor. Return only a single JSON object (musicxml-patch@1) — the patch and an optional "annotations" array. No markdown or prose outside the JSON.';
const AI_DIFF_GUTTER_DEFAULT_WIDTH = 360;
const AI_DIFF_GUTTER_MIN_WIDTH = 360;
const AI_DIFF_GUTTER_MAX_WIDTH = 1280;
const AI_DIFF_COMMENT_GUTTER_PADDING = 72;
const AI_CHAT_SYSTEM_PROMPT =
  'You are a helpful music notation assistant. Answer clearly and practically for score editing and engraving workflows.';
const CODE_EDITOR_THEME_STORAGE_KEY = 'ots_code_editor_theme';
const MUSIC_SPECIALISTS_NOTAGEN_BACKEND_STORAGE_KEY = 'ots_music_specialists_notagen_backend';
const MUSIC_SPECIALISTS_NOTAGEN_MODEL_STORAGE_KEY = 'ots_music_specialists_notagen_model';
const MUSIC_SPECIALISTS_NOTAGEN_REVISION_STORAGE_KEY = 'ots_music_specialists_notagen_revision';
const MUSIC_SPECIALISTS_NOTAGEN_SPACE_ID_STORAGE_KEY = 'ots_music_specialists_notagen_space_id';
const MUSIC_SPECIALISTS_NOTAGEN_SPACE_PERIOD_STORAGE_KEY =
  'ots_music_specialists_notagen_space_period';
const MUSIC_SPECIALISTS_NOTAGEN_SPACE_COMPOSER_STORAGE_KEY =
  'ots_music_specialists_notagen_space_composer';
const MUSIC_SPECIALISTS_NOTAGEN_SPACE_INSTRUMENTATION_STORAGE_KEY =
  'ots_music_specialists_notagen_space_instrumentation';
const MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_BACKEND = 'huggingface';
const MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_MODEL = (
  process.env.NEXT_PUBLIC_MUSIC_NOTAGEN_DEFAULT_MODEL_ID || ''
).trim();
const MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_REVISION = (
  process.env.NEXT_PUBLIC_MUSIC_NOTAGEN_DEFAULT_REVISION || ''
).trim();
const MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_ID = (
  process.env.NEXT_PUBLIC_MUSIC_NOTAGEN_DEFAULT_SPACE_ID || 'ElectricAlexis/NotaGen'
).trim();
const MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_PERIOD = (
  process.env.NEXT_PUBLIC_MUSIC_NOTAGEN_SPACE_DEFAULT_PERIOD || 'Classical'
).trim();
const MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_COMPOSER = (
  process.env.NEXT_PUBLIC_MUSIC_NOTAGEN_SPACE_DEFAULT_COMPOSER || 'Mozart, Wolfgang Amadeus'
).trim();
const MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_INSTRUMENTATION = (
  process.env.NEXT_PUBLIC_MUSIC_NOTAGEN_SPACE_DEFAULT_INSTRUMENTATION || 'Keyboard'
).trim();
const MUSIC_SPECIALISTS_DEFAULT_TRANSCODA_SPACE_ID = (
  process.env.NEXT_PUBLIC_MUSIC_TRANSCODA_SPACE_ID || 'jhlusko/transcoda'
).trim();
const MUSIC_SPECIALISTS_DEFAULT_TRANSCODA_MODEL = (
  process.env.NEXT_PUBLIC_MUSIC_TRANSCODA_MODEL_ID || 'btrkeks/transcoda-59M-zeroshot-v1'
).trim();
const MUSIC_SPECIALISTS_DEFAULT_TRANSCODA_REVISION = (
  process.env.NEXT_PUBLIC_MUSIC_TRANSCODA_REVISION || 'b529f8aa5d996d9224df3395b5b92d0867343c91'
).trim();
const CODE_EDITOR_THEME_VALUES = new Set<CodeEditorThemeMode>(
  CODE_EDITOR_THEME_OPTIONS.map((option) => option.value),
);

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
const TEXT_ELEMENT_SELECTOR = TEXT_ELEMENT_CLASS_NAMES.map((cls) => `.${cls}`).join(', ');
const ELEMENT_SELECTION_SELECTOR = [
  '.Note',
  '.Rest',
  '.Chord',
  '.LayoutBreak',
  '.Pedal',
  '.PedalSegment',
  '.Measure',
  TEXT_ELEMENT_SELECTOR,
]
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
  return classAttr.split(/\s+/).some((cls) => ELEMENT_SELECTION_CLASSES.has(cls));
};

const hasTextElementClass = (classAttr: string | null | undefined) => {
  if (!classAttr) {
    return false;
  }
  return classAttr.split(/\s+/).some((cls) => TEXT_ELEMENT_CLASS_SET.has(cls));
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

  const candidate = score as unknown as Record<string, unknown>;
  return Boolean(
    candidate.deleteSelection ||
    candidate.undo ||
    candidate.redo ||
    candidate.pitchUp ||
    candidate.pitchDown ||
    candidate.doubleDuration ||
    candidate.halfDuration,
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
If you need to add multiple sibling elements, use multiple ops (for example: replace one node, then insertAfter additional nodes).

${PATCH_ANNOTATIONS_INSTRUCTION}`;
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
  const globalBuffer = (
    globalThis as {
      Buffer?: { from: (bytes: Uint8Array) => { toString: (encoding: string) => string } };
    }
  ).Buffer;
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

const toOwnedBytes = (data: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(data);
const toOwnedArrayBuffer = (data: Uint8Array): ArrayBuffer => toOwnedBytes(data).buffer;

const buildAiChatTranscript = (messages: AiChatMessage[]) => {
  const recentMessages = messages.slice(-AI_CHAT_CONTEXT_MAX_MESSAGES);
  if (!recentMessages.length) {
    return '';
  }
  const transcriptRaw = recentMessages
    .map(
      (message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.text.trim()}`,
    )
    .filter(Boolean)
    .join('\n\n');
  if (!transcriptRaw.trim()) {
    return '';
  }
  const transcript = truncateAiContext(transcriptRaw, AI_CHAT_CONTEXT_MAX_CHARS);
  return `${transcript.value}${
    transcript.truncated
      ? `\n\n[Chat transcript truncated from ${transcript.originalLength} characters.]`
      : ''
  }`;
};

const shouldEnableSourceRagForPrompt = (text: string) => {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return [
    /\blook\s+up\b/,
    /\bresearch\b/,
    /\bsearch\b/,
    /\bfind\s+(?:sources|references|background|history|information|info)\b/,
    /\bsource\s+history\b/,
    /\bbackground\b/,
    /\bhistorical?\s+context\b/,
    /\breception\b/,
    /\bpublication\s+history\b/,
    /\bmanuscript\b/,
    /\bprovenance\b/,
    /\bcitation[s]?\b/,
    /\bcite\b/,
    /\bimslp\b/,
    /\bwikipedia\b/,
    /\bwikidata\b/,
    /\brism\b/,
    /\bopenalex\b/,
    /\bweb\b/,
    /\bonline\b/,
  ].some((pattern) => pattern.test(normalized));
};

const MMA_BLUES_DEMO_TEMPLATE = `Tempo 110\nTimeSig 4 4\nKeySig C\nGroove Swing\n\n1  C7\n2  F7\n3  C7\n4  C7\n5  F7\n6  F7\n7  C7\n8  C7\n9  G7\n10  F7\n11  C7\n12  G7\n`;

const decodeBase64ToBytes = (input: string) => {
  const compact = input.replace(/\s+/g, '');
  if (!compact) {
    return new Uint8Array();
  }
  const globalBuffer = (
    globalThis as { Buffer?: { from: (value: string, encoding: string) => Uint8Array } }
  ).Buffer;
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

const errorMessage = (err: unknown) => {
  if (typeof err === 'string') {
    return err.trim();
  }
  if (err instanceof Error) {
    const message = typeof err.message === 'string' ? err.message.trim() : '';
    if (message) {
      return message;
    }
    const name = typeof err.name === 'string' ? err.name.trim() : '';
    return name;
  }
  if (err && typeof err === 'object') {
    const maybeMessage = (err as { message?: unknown }).message;
    if (typeof maybeMessage === 'string') {
      return maybeMessage.trim();
    }
    const maybeName = (err as { name?: unknown }).name;
    if (typeof maybeName === 'string') {
      return maybeName.trim();
    }
  }
  return '';
};

export const scoreLoadErrorMessage = (err: unknown) => {
  const message = errorMessage(err);
  if (message.includes('newer MuseScore format')) {
    return message.replace(/^WebMscore Err(?:\[2007\]\s*)?/, '').trim();
  }
  return 'Failed to load score. See console for details.';
};

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
  const reviewScoreUrl = searchParams.get('reviewScore');
  const reviewLabel = searchParams.get('reviewLabel') || 'Review score';
  const leftLabel = searchParams.get('leftLabel') || 'Left';
  const rightLabel = searchParams.get('rightLabel') || 'Right';
  const changeReviewId = searchParams.get('changeReviewId')?.trim() || '';
  const changeReviewPatchset = searchParams.get('patchset')?.trim() || '';
  // Server-supplied differences. The client measure signature cannot tell two
  // independently generated MusicXML documents apart — it strips layout but
  // not `<divisions>`, so an engine writing a sixteenth as duration 1 and one
  // writing it as 2520 differ in every measure of an agreeing page. A caller
  // that has already computed the diff hands it over instead.
  // docs/private/SCANNER_COMPARATOR_DESIGN_2026-08-12.md
  const compareRegionsUrl = searchParams.get('compareRegions')?.trim() || '';
  /**
   * Show only the systems one difference falls in.
   *
   * A reviewer who clicked a difference is asking about that line, and the
   * agreeing lines below it are the answer to a question nobody asked — the
   * gutter is the index (§5), so the rows do not also have to be one.
   */
  const compareBlockIndex = searchParams.get('compareBlock')?.trim() || '';
  const isCompareEmbedMode = Boolean(compareLeftUrl && compareRightUrl);
  const isSuppliedRegionsMode = isCompareEmbedMode && Boolean(compareRegionsUrl);
  // Row-per-scanned-system layout. Opt-in, because it only makes sense when a
  // caller can say where the scan's systems are.
  const compareMode = searchParams.get('compareMode')?.trim() || '';
  const isSystemRowsMode = isSuppliedRegionsMode && compareMode === 'rows';

  /*
   * Report the document's height to whoever embedded it.
   *
   * The rows view does not scroll itself — a scrollable box inside a
   * fixed-height iframe gives a reader two scrollbars and the shorter of two
   * viewports. Instead the host sizes the frame to the content and its own
   * page scrolls, which is the only way this gets the window's full height.
   * Ignored by any host that is not listening, which is every other embed.
   */
  useEffect(() => {
    if (!isSystemRowsMode || typeof ResizeObserver === 'undefined') return;
    if (window.parent === window) return;

    /*
     * Nothing here may be measured against the viewport, and nothing may
     * scroll.
     *
     * The frame is sized to this document, so `100vh` inside it *is* the
     * frame — and the page wrapper's `min-h-screen` therefore grows to
     * whatever height was last reported. Report a height, the frame grows,
     * the wrapper grows to match, report a taller height: a ratchet that
     * added a few hundred pixels every second. `min-height: 0` breaks it.
     *
     * `overflow: clip` is the other half. A frame a pixel shorter than its
     * content can scroll by that pixel, and a wheel over a frame that can
     * scroll is consumed by it and never reaches the page behind — which is
     * what a broken scrollbar feels like. Clipping means no rounding error
     * can produce one.
     */
    const root = document.documentElement;
    const wrapper = document.querySelector('main');
    const restore = {
      rootOverflow: root.style.overflow,
      bodyOverflow: document.body.style.overflow,
      wrapperMinHeight: wrapper instanceof HTMLElement ? wrapper.style.minHeight : '',
    };
    if (wrapper instanceof HTMLElement) wrapper.style.minHeight = '0';

    const post = () => {
      const height = Math.ceil(document.body.scrollHeight);
      /*
       * Clip only once the frame is actually tall enough.
       *
       * A host that ignores the message — or has not resized yet — leaves
       * this document in a short frame, and clipping there would hide
       * everything below the fold with no way to reach it: a window on a
       * score, and no scrollbar in either direction. So the clip is
       * conditional on the frame having grown, and until it does this
       * scrolls itself, which is the behaviour it had before any of this.
       */
      const fits = window.innerHeight >= height;
      root.style.overflow = fits ? 'clip' : '';
      document.body.style.overflow = fits ? 'clip' : '';
      window.parent.postMessage({ type: 'ots-compare-height', height }, '*');
    };
    const observer = new ResizeObserver(post);
    observer.observe(document.body);
    // The frame's own size is what decides whether clipping is safe, and it
    // changes when the host acts on the message rather than when the
    // content does.
    window.addEventListener('resize', post);
    post();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', post);
      root.style.overflow = restore.rootOverflow;
      document.body.style.overflow = restore.bodyOverflow;
      if (wrapper instanceof HTMLElement) wrapper.style.minHeight = restore.wrapperMinHeight;
    };
  }, [isSystemRowsMode]);
  const isChangeReviewSingleScoreMode = Boolean(reviewScoreUrl && changeReviewId);
  const isEmbedMode = isCompareEmbedMode || isChangeReviewSingleScoreMode;
  const isChangeReviewCompareMode = isCompareEmbedMode && Boolean(changeReviewId);
  const isChangeReviewMode = isChangeReviewCompareMode || isChangeReviewSingleScoreMode;
  const launchContext = useMemo(
    () => parseEditorLaunchContextParam(searchParams.get('launchContext')),
    [searchParams],
  );
  const [sessionLaunchContext, setSessionLaunchContext] =
    useState<ReturnType<typeof sanitizeEditorLaunchContext>>(null);
  const [runtimeLaunchContext, setRuntimeLaunchContext] =
    useState<ReturnType<typeof sanitizeEditorLaunchContext>>(null);
  const activeLaunchContext = runtimeLaunchContext || launchContext || sessionLaunchContext;
  const otsSourceContext = useMemo(() => {
    if (
      activeLaunchContext?.source !== 'ourtextscores' ||
      !activeLaunchContext.workId ||
      !activeLaunchContext.sourceId
    ) {
      return null;
    }
    return {
      workId: activeLaunchContext.workId,
      sourceId: activeLaunchContext.sourceId,
      revisionId: activeLaunchContext.revisionId,
      branchName: activeLaunchContext.branchName || 'trunk',
      canonicalXmlUrl: activeLaunchContext.canonicalXmlUrl,
    };
  }, [activeLaunchContext]);

  const [score, setScore] = useState<Score | null>(null);
  const [scoreSessionId, setScoreSessionId] = useState<string | null>(null);
  const [scoreRevision, setScoreRevision] = useState<number>(0);
  const lastSyncedXmlRef = useRef<string>('');
  const lastSyncedRevisionRef = useRef<number>(-1);
  const isSyncingRef = useRef<boolean>(false);
  const scoreRef = useRef<Score | null>(null);
  const applyXmlToScoreRef = useRef<ApplyXmlToScore>(async () => false);
  const stopCompareSideAudioRef = useRef<StopCompareSideAudio>(async () => {});
  const [handleUrlLoad, handleUrlLoadRef] = useLatestCallbackFacade<HandleUrlLoad>(
    async () => false,
  );
  const [handleFileUpload, handleFileUploadRef] = useLatestCallbackFacade<HandleFileUpload>(
    async () => false,
  );
  const [refreshPageCount, refreshPageCountRef] = useLatestCallbackFacade<RefreshPageCount>(
    async () => 0,
  );
  const [renderScore, renderScoreRef] = useLatestCallbackFacade<RenderScore>(async () => false);
  const [ensureSoundFontLoaded, ensureSoundFontLoadedRef] =
    useLatestCallbackFacade<EnsureSoundFontLoaded>(async () => false);
  const keyboardShortcutHandlerRef = useRef<(event: KeyboardEvent) => void>(() => {});
  const [zoom, setZoom] = useState(1.0);
  const containerRef = useRef<HTMLDivElement>(null);
  const scoreWrapperRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const changeReviewGutterRef = useRef<HTMLDivElement>(null);
  const MIN_ZOOM = 0.01;
  const MAX_ZOOM = 1.0;
  const clampZoom = (value: number) => Math.min(Math.max(value, MIN_ZOOM), MAX_ZOOM);
  const [loading, setLoading] = useState(false);
  const [selectedElement, setSelectedElement] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<{ page: number; x: number; y: number } | null>(
    null,
  );
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [selectionBoxes, setSelectionBoxes] = useState<SelectionBox[]>([]);
  const [overlaySuppressed, setOverlaySuppressed] = useState(false);
  const [hasBackendHighlighting, setHasBackendHighlighting] = useState(false);
  const [selectedElementClasses, setSelectedElementClasses] = useState<string>('');
  const [selectedTextValue, setSelectedTextValue] = useState('');
  const inlineTextContentRef = useRef<HTMLDivElement>(null);
  // Tracks whether the user has typed in the inline text editor this session, so
  // async loads of the element's current text don't clobber in-progress edits.
  const inlineTextEditedRef = useRef(false);
  const [inspectorData, setInspectorData] = useState<SelectedElementProperties | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  // Master toggle to hide every side panel (History, Inspector, MusicXML),
  // including their collapsed rails, to maximise the score area.
  const [panelsVisible, setPanelsVisible] = useState(true);
  const [fretDiagramData, setFretDiagramData] = useState<FretDiagramData | null>(null);
  const [inspectorLoading, setInspectorLoading] = useState(false);
  const [selectedLayoutBreakSubtype, setSelectedLayoutBreakSubtype] = useState<
    'line' | 'page' | null
  >(null);
  const [textEditorPosition, setTextEditorPosition] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [dragSelectionRect, setDragSelectionRect] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const ignoreNextClickRef = useRef(false);
  const dragKindRef = useRef<'pointer' | 'mouse' | null>(null);
  const dragPointerIdRef = useRef<number | null>(null);
  const dragStartClientRef = useRef<{ x: number; y: number } | null>(null);
  const dragStartScoreRef = useRef<{ x: number; y: number } | null>(null);
  const dragAdditiveRef = useRef(false);
  const dragActiveRef = useRef(false);
  const sawPointerMoveRef = useRef(false);
  const lastSpannerPointerRef = useRef<{ time: number; clientX: number; clientY: number } | null>(
    null,
  );
  // Ghost-drag note repitch: candidate captured on pointer-down, gesture data once the
  // drag threshold is crossed, ghost box rendered as an overlay in score units.
  const [noteDragGhost, setNoteDragGhost] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
    steps: number;
  } | null>(null);
  const noteDragCandidateRef = useRef<{
    page: number;
    noteBox: { x: number; y: number; w: number; h: number };
  } | null>(null);
  const noteDragRef = useRef<{
    page: number;
    startX: number;
    startY: number;
    noteBox: { x: number; y: number; w: number; h: number };
    halfStep: number;
  } | null>(null);
  const noteDragEngineBeginRef = useRef<Promise<boolean> | null>(null);
  const noteDragLiveUpdateRef = useRef<{
    drag: { page: number; startX: number; startY: number; halfStep: number };
    steps: number;
    modifiers: number;
  } | null>(null);
  const noteDragLiveInFlightRef = useRef<Promise<void> | null>(null);
  const noteDragLiveFrameRef = useRef<number | null>(null);
  const noteDragRenderedStepsRef = useRef<number | null>(null);
  const noteDragFinishingRef = useRef(false);
  // Removes the window-level listeners that drive an in-flight note drag; the gesture
  // must outlive the score wrapper because the staff can sit at its very edge.
  const noteDragCleanupRef = useRef<(() => void) | null>(null);
  const [gripEdit, setGripEdit] = useState<GripEditInfo | null>(null);
  const gripDragCleanupRef = useRef<(() => void) | null>(null);
  // Engine spatium in score units, refreshed when a drag candidate is armed.
  const scoreSpatiumRef = useRef<number | null>(null);
  // Note-input ("N") mode: clicks place notes instead of selecting.
  const [noteInputActive, setNoteInputActive] = useState(false);
  const [noteInputMethod, setNoteInputMethod] = useState(1);
  const [noteInputCursorRect, setNoteInputCursorRect] = useState<NoteInputCursorRect | null>(null);
  const [noteInputShadow, setNoteInputShadow] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [paletteDropActive, setPaletteDropActive] = useState(false);
  const [palettesOpen, setPalettesOpen] = useState(false);
  const [paletteCategory, setPaletteCategory] = useState<PaletteCategory | null>(null);
  const openPaletteCategory = (category: string) => {
    setPaletteCategory(category as PaletteCategory);
    setPalettesOpen(true);
  };
  const [selectionFilterMask, setSelectionFilterMask] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_SELECTION_FILTER_MASK;
    const storedValue = window.localStorage.getItem(SELECTION_FILTER_STORAGE_KEY);
    if (storedValue === null) return DEFAULT_SELECTION_FILTER_MASK;
    const stored = Number(storedValue);
    return Number.isInteger(stored) && stored >= 0 && stored <= DEFAULT_SELECTION_FILTER_MASK
      ? stored
      : DEFAULT_SELECTION_FILTER_MASK;
  });
  const selectionFilterMaskRef = useRef(selectionFilterMask);
  const [multiMeasureRestsEnabled, setMultiMeasureRestsEnabled] = useState(false);
  const noteInputActiveRef = useRef(false);
  const noteInputDesiredRef = useRef(false);
  useEffect(() => {
    noteInputActiveRef.current = false;
    noteInputDesiredRef.current = false;
    setNoteInputActive(false);
    setNoteInputMethod(1);
    setNoteInputCursorRect(null);
    setNoteInputShadow(null);
  }, [score]);
  useEffect(() => {
    if (!score) {
      setMultiMeasureRestsEnabled(false);
      return;
    }
    void Promise.resolve(score.setSelectionFilter?.(selectionFilterMaskRef.current)).catch(
      (err: unknown) => {
        console.warn('Failed to apply selection filter:', err);
      },
    );
    if (score.multiMeasureRestsEnabled) {
      void Promise.resolve(score.multiMeasureRestsEnabled())
        .then((enabled) => {
          setMultiMeasureRestsEnabled(Boolean(enabled));
        })
        .catch((err: unknown) => {
          console.warn('Failed to read multi-measure-rest state:', err);
        });
    }
  }, [score]);
  useEffect(
    () => () => {
      noteDragCleanupRef.current?.();
      noteDragCleanupRef.current = null;
      if (noteDragLiveFrameRef.current !== null) {
        cancelAnimationFrame(noteDragLiveFrameRef.current);
        noteDragLiveFrameRef.current = null;
      }
      void Promise.resolve(scoreRef.current?.endElementDrag?.(false)).catch(() => {});
    },
    [],
  );
  useEffect(
    () => () => {
      gripDragCleanupRef.current?.();
      gripDragCleanupRef.current = null;
      void Promise.resolve(score?.endGripEdit?.(false)).catch(() => {});
    },
    [score],
  );
  const blockOverlayRefreshRef = useRef(false);
  const selectionOverlayGenerationRef = useRef(0);
  const [mutationEnabled, setMutationEnabled] = useState(false);
  const [interactionReady, setInteractionReady] = useState(false);
  const [interactionPreparing, setInteractionPreparing] = useState(false);
  const interactiveMutationEnabled = mutationEnabled && interactionReady;
  const interactionReadyRef = useRef(interactionReady);
  const interactionPreparingRef = useRef(interactionPreparing);
  const [soundFontLoaded, setSoundFontLoaded] = useState(false);
  const [triedSoundFont, setTriedSoundFont] = useState(false);
  const soundFontLoadedRef = useRef(soundFontLoaded);
  const triedSoundFontRef = useRef(triedSoundFont);
  const soundFontManagerRef = useRef<SoundFontManager<Score> | null>(null);
  if (!soundFontManagerRef.current) soundFontManagerRef.current = new SoundFontManager<Score>();
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
  const [compareView, setCompareView] = useState<CompareViewState | null>(null);
  const [compareSwapped, setCompareSwapped] = useState(false);
  const aiProposalController = useAiProposalController();
  const captureAiProposal = aiProposalController.capture;
  const verifyAiProposalCurrent = aiProposalController.verifyCurrent;
  const recordAiProposalAppliedXml = aiProposalController.recordAppliedXml;
  const invalidateAiProposalExpectedCurrent = aiProposalController.invalidateExpectedCurrent;
  const snapshotAiProposalContinuity = aiProposalController.snapshot;
  const restoreAiProposalContinuity = aiProposalController.restore;
  const getAiProposalExpectedHashes = aiProposalController.getExpectedHashes;
  const getAiProposalSession = aiProposalController.getSession;
  const setAiProposalSession = aiProposalController.setSession;
  const setAiProposalApplyError = aiProposalController.setApplyError;
  const getAiProposalApplyError = aiProposalController.getApplyError;
  const setAiProposalAudit = aiProposalController.setAudit;
  const clearAiProposal = aiProposalController.clear;
  const [compareLeftCheckpointLabel, setCompareLeftCheckpointLabel] = useState('');
  const [compareRightCheckpointLabel, setCompareRightCheckpointLabel] = useState('');
  const [compareRightScore, setCompareRightScore] = useState<Score | null>(null);
  const compareRightScoreRef = useRef<Score | null>(null);
  const compareLoadedCheckpointXmlRef = useRef<string | null>(null);
  const [compareRightParts, setCompareRightParts] = useState<PartSummary[]>([]);
  const [compareRightPageCount, setCompareRightPageCount] = useState(1);
  const [compareRightLoading, setCompareRightLoading] = useState(false);
  const [compareRightError, setCompareRightError] = useState<string | null>(null);
  const [compareFitZoom, setCompareFitZoom] = useState(0.5);
  const [compareZoom, setCompareZoom] = useState<number | null>(null);
  // Widened with `CompareSide`; this two-pane workspace never sets 'middle',
  // but the shared compare modules are keyed by the full position vocabulary.
  const [compareActiveSide, setCompareActiveSide] = useState<CompareSide | null>(null);
  const compareEditing = useCompareEditing<SelectionBox, NoteInputCursorRect>();
  const {
    busy: compareEditBusy,
    editedRoles: compareEditedRoles,
    noteInputByRole: compareNoteInputByRole,
    noteInputCursorByRole: compareNoteInputCursorByRole,
    hasSelectionByRole: compareHasSelectionByRole,
    selectionBoxesByRole: compareSelectionBoxesByRole,
  } = compareEditing.state;
  const {
    beginBusy: beginCompareEdit,
    captureEditCycle: captureCompareEditCycle,
    clearEditCycle: clearCompareEditCycle,
    commitNoteInput: commitCompareNoteInput,
    endBusy: endCompareEdit,
    getBaseline: getCompareEditBaseline,
    isBusy: isCompareEditBusy,
    isNoteInputCommitted: isCompareNoteInputCommitted,
    isNoteInputDesired: isCompareNoteInputDesired,
    recordEdit: recordCompareEdit,
    requestNoteInput: requestCompareNoteInput,
    resetAll: resetCompareEditing,
    resetRole: resetCompareEditingRole,
    restoreEditCycle: restoreCompareEditCycle,
    rollbackNoteInputRequest: rollbackCompareNoteInputRequest,
    setHasSelection: setCompareHasSelection,
    setNoteInputCursor: setCompareNoteInputCursor,
    setSelection: setCompareSelection,
  } = compareEditing;
  const [compareLeftSvgSize, setCompareLeftSvgSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [compareRightSvgSize, setCompareRightSvgSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [compareLeftMeasurePositions, setCompareLeftMeasurePositions] = useState<Positions | null>(
    null,
  );
  const [compareRightMeasurePositions, setCompareRightMeasurePositions] =
    useState<Positions | null>(null);
  // Real per-staff boxes, probed from the engine once per layout. Undefined until the
  // probe lands (or forever on an engine build without the exports), in which case the
  // highlight builders fall back to slicing the system box evenly.
  const [compareLeftStaffBands, setCompareLeftStaffBands] = useState<StaffBands>(EMPTY_STAFF_BANDS);
  const [compareRightStaffBands, setCompareRightStaffBands] =
    useState<StaffBands>(EMPTY_STAFF_BANDS);
  const [compareAlignments, setCompareAlignments] = useState<PartAlignment[]>([]);
  const [suppliedRegions, setSuppliedRegions] = useState<SuppliedCompareRegion[] | null>(null);
  const [suppliedSystems, setSuppliedSystems] = useState<ScannerSystem[]>([]);
  // The page's merged score, carried by the regions document because this
  // embed reaches the scanner only through the host's proxy.
  const [suppliedMerged, setSuppliedMerged] = useState<MergedScoreState | null>(null);
  const [scannerMergedScore, setScannerMergedScore] = useState<Score | null>(null);
  // Engine identity, which the merged score must name: a merge that does not
  // record where it started from cannot be re-examined later.
  const [suppliedCompareLeftEngineId, setSuppliedCompareLeftEngineId] = useState<string>('');
  const [suppliedCompareRightEngineId, setSuppliedCompareRightEngineId] = useState<string>('');
  const [, setSuppliedRegionsError] = useState<string | null>(null);
  const [compareAlignmentLoading, setCompareAlignmentLoading] = useState(false);
  const [compareAlignmentRevision, setCompareAlignmentRevision] = useState(0);
  const [compareSwapBusy, setCompareSwapBusy] = useState(false);
  const [compareBlockComments, setCompareBlockComments] = useState<
    Record<string, CompareBlockComment>
  >({});
  const [compareFocusedBlockKey, setCompareFocusedBlockKey] = useState<string | null>(null);
  const [changeReviewDetail, setChangeReviewDetail] = useState<ChangeReviewDetail | null>(null);
  const [changeReviewDiff, setChangeReviewDiff] = useState<ChangeReviewDiff | null>(null);
  const [changeReviewScoreView, setChangeReviewScoreView] = useState<ChangeReviewScoreView | null>(
    null,
  );
  const [changeReviewMeasurePositions, setChangeReviewMeasurePositions] =
    useState<Positions | null>(null);
  const [changeReviewLoading, setChangeReviewLoading] = useState(false);
  const [changeReviewError, setChangeReviewError] = useState<string | null>(null);
  const [changeReviewActionBusy, setChangeReviewActionBusy] = useState(false);
  const [changeReviewActionError, setChangeReviewActionError] = useState<string | null>(null);
  const [changeReviewNewThreadAnchorId, setChangeReviewNewThreadAnchorId] = useState<string | null>(
    null,
  );
  const [changeReviewNewThreadContent, setChangeReviewNewThreadContent] = useState('');
  const [changeReviewReplyThreadId, setChangeReviewReplyThreadId] = useState<string | null>(null);
  const [changeReviewReplyContent, setChangeReviewReplyContent] = useState('');
  const [changeReviewFocusedAnchorId, setChangeReviewFocusedAnchorId] = useState<string | null>(
    null,
  );
  const [compareClickedMeasures, setCompareClickedMeasures] = useState<{
    leftIndex: number | null;
    rightIndex: number | null;
    partIndex: number | null;
  } | null>(null);
  const [aiDiffReviews, setAiDiffReviews] = useState<BlockReview[]>([]);
  // Ephemeral, in-session measure-level threads on the AI proposal diff. Keyed by
  // `${partIndex}:${rightIndex}:${leftIndex}` so one thread tracks a logical measure across
  // both panes. Persists across feedback regenerations; cleared on a fresh proposal or close.
  const [aiMeasureThreads, setAiMeasureThreads] = useState<Record<string, AiMeasureThread>>({});
  const [aiFocusedMeasureAnchor, setAiFocusedMeasureAnchor] = useState<AiMeasureAnchor | null>(
    null,
  );
  const [aiMeasureThreadDraft, setAiMeasureThreadDraft] = useState('');
  // Annotations from the most recent client-side patch parse, so a later "review in compare"
  // (handleApplyAiOutput) can seed them even though it re-opens from stored XML.
  const [aiLastAnnotations, setAiLastAnnotations] = useState<PatchAnnotation[]>([]);
  const [aiDiffIteration, setAiDiffIteration] = useState(0);
  const [aiDiffGlobalComment, setAiDiffGlobalComment] = useState('');
  const [aiDiffFeedbackError, setAiDiffFeedbackError] = useState<string | null>(null);
  const [aiDiffBlockErrors, setAiDiffBlockErrors] = useState<Record<string, string>>({});
  const [aiDiffGutterWidth, setAiDiffGutterWidth] = useState(AI_DIFF_GUTTER_DEFAULT_WIDTH);
  const aiDiffCommentTextareaRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());
  const aiDiffCommentResizeObserverRef = useRef<ResizeObserver | null>(null);
  const [compareSignatures, setCompareSignatures] = useState<{
    left: string[][];
    right: string[][];
  } | null>(null);
  const [compareContinuousMode, setCompareContinuousMode] = useState(false);
  const [compareReflowMode, setCompareReflowMode] = useState(false);
  const compareLayoutRestoreRef = useRef<number | null>(null);
  // Keyed by score identity (live vs auxiliary), NOT by pane. The close path restores
  // the live score's original breaks and has no pane mapping available at that point.
  const compareLineBreakRestoreRef = useRef<{ live: boolean[]; auxiliary: boolean[] } | null>(null);
  const compareAppliedSpacersRef = useRef<CompareAppliedSpacer[]>([]);
  // Reflow runs are queued so a canceled phase cannot finish mutating the same two WASM
  // scores after its replacement has already started applying a newer plan.
  const compareReflowQueueRef = useRef<Promise<void>>(Promise.resolve());
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
  const [leftSidebarTab, setLeftSidebarTab] = useState<LeftSidebarTab>('checkpoints');
  const [versionsBranchName, setVersionsBranchName] = useState('trunk');
  const [sourceHistory, setSourceHistory] = useState<SourceHistoryResponse | null>(null);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [versionsActionBusy, setVersionsActionBusy] = useState(false);
  const [versionsActionError, setVersionsActionError] = useState<string | null>(null);
  const [versionsActionNotice, setVersionsActionNotice] = useState<string | null>(null);
  const [versionsSelectedBaseRevisionId, setVersionsSelectedBaseRevisionId] = useState<
    string | null
  >(null);
  const [versionsCommitMessage, setVersionsCommitMessage] = useState('');
  const [versionsCreateBranchName, setVersionsCreateBranchName] = useState('');
  const [versionsCreateBranchPolicy, setVersionsCreateBranchPolicy] = useState<
    'public' | 'owner_approval'
  >('public');
  const [scoreSummaries, setScoreSummaries] = useState<ScoreSummary[]>([]);
  const [scoreSummariesLoading, setScoreSummariesLoading] = useState(false);
  const [scoreSummariesError, setScoreSummariesError] = useState<string | null>(null);
  const [scoreDirtySinceCheckpoint, setScoreDirtySinceCheckpoint] = useState(false);
  const [scoreDirtySinceXml, setScoreDirtySinceXml] = useState(false);
  const [xmlSidebarMode, setXmlSidebarMode] = useState<'closed' | 'open'>('closed');
  // The MusicXML editor is its own right-side sidebar, separate from the AI tools.
  const [musicXmlOpen, setMusicXmlOpen] = useState(false);
  const [xmlSidebarWidth, setXmlSidebarWidth] = useState<number>(384); // default 'open' width (w-96)
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const sidebarResizeStartXRef = useRef<number>(0);
  const sidebarResizeStartWidthRef = useRef<number>(0);
  const [xmlSidebarTab, setXmlSidebarTab] = useState<AiToolsTab>('assistant');
  const [codeEditorTheme, setCodeEditorTheme] = useState<CodeEditorThemeMode>('light');
  const [xmlText, setXmlText] = useState('');
  const [xmlDirty, setXmlDirty] = useState(false);
  const [xmlLoading, setXmlLoading] = useState(false);
  const [xmlError, setXmlError] = useState<string | null>(null);
  const [mmaStarterPreset, setMmaStarterPreset] = useState<MmaStarterPreset>('lead-sheet');
  const [mmaArrangementPreset, setMmaArrangementPreset] =
    useState<MmaArrangementPreset>('full-groove');
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
  const [harmonyResultPayload, setHarmonyResultPayload] = useState<Record<string, unknown> | null>(
    null,
  );
  const [harmonyRhythmMode, setHarmonyRhythmMode] = useState<HarmonyRhythmMode>('auto');
  const [harmonyMaxChangesPerMeasure, setHarmonyMaxChangesPerMeasure] = useState(2);
  const [functionalHarmonyBusy, setFunctionalHarmonyBusy] = useState(false);
  const [functionalHarmonyError, setFunctionalHarmonyError] = useState<string | null>(null);
  const [functionalHarmonyWarnings, setFunctionalHarmonyWarnings] = useState<string[]>([]);
  const [functionalHarmonyResult, setFunctionalHarmonyResult] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [functionalHarmonySegments, setFunctionalHarmonySegments] = useState<
    Record<string, unknown>[]
  >([]);
  const [functionalHarmonyAnnotatedXml, setFunctionalHarmonyAnnotatedXml] = useState('');
  const [functionalHarmonyJsonExport, setFunctionalHarmonyJsonExport] = useState('');
  const [functionalHarmonyRntxtExport, setFunctionalHarmonyRntxtExport] = useState('');
  const aiAssistantController = useAiAssistantController();
  const {
    aiProvider,
    aiModel,
    setAiModel,
    aiApiKey,
    setAiApiKey,
    aiPrompt,
    aiIncludeXml,
    aiIncludePdf,
    setAiIncludePdf,
    aiIncludePage,
    aiIncludeSelection,
    aiIncludeChat,
    aiDeepEdit,
    aiEditEffort,
    aiIncludeRenderedImage,
    setAiIncludeRenderedImage,
    aiMaxTokensMode,
    setAiMaxTokensMode,
    aiMaxTokens,
    setAiMaxTokens,
    aiTemperatureMode,
    setAiTemperatureMode,
    aiTemperature,
    setAiTemperature,
    aiChatInput,
    setAiChatInput,
    aiChatMessages,
    setAiChatMessages,
    aiChatSourceRagHintDismissed,
    setAiChatSourceRagHintDismissed,
    aiOutput,
    setAiOutput,
    aiPatch,
    setAiPatch,
    aiPatchError,
    setAiPatchError,
    aiPatchedXml,
    setAiPatchedXml,
    aiBaseXml,
    setAiBaseXml,
    setAiError,
    setAiModels,
    aiModelDescriptors,
    setAiModelDescriptors,
    setAiModelsLoading,
    setAiModelsError,
  } = aiAssistantController;
  const [musicNotaGenBackend, setMusicNotaGenBackend] = useState<
    'huggingface' | 'huggingface-space'
  >(MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_BACKEND);
  const [musicNotaGenModelId, setMusicNotaGenModelId] = useState(
    MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_MODEL,
  );
  const [musicNotaGenRevision, setMusicNotaGenRevision] = useState(
    MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_REVISION,
  );
  const [musicNotaGenSpaceId, setMusicNotaGenSpaceId] = useState(
    MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_ID,
  );
  const [musicNotaGenSpacePeriod, setMusicNotaGenSpacePeriod] = useState(
    MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_PERIOD,
  );
  const [musicNotaGenSpaceComposer, setMusicNotaGenSpaceComposer] = useState(
    MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_COMPOSER,
  );
  const [musicNotaGenSpaceInstrumentation, setMusicNotaGenSpaceInstrumentation] = useState(
    MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_INSTRUMENTATION,
  );
  const [musicNotaGenDryRun] = useState(false);
  const [musicNotaGenBusy, setMusicNotaGenBusy] = useState(false);
  const [musicNotaGenError, setMusicNotaGenError] = useState<string | null>(null);
  const [musicNotaGenResult, setMusicNotaGenResult] = useState<Record<string, unknown> | null>(
    null,
  );
  const [musicNotaGenGeneratedXml, setMusicNotaGenGeneratedXml] = useState('');
  const [musicNotaGenGeneratedAbc, setMusicNotaGenGeneratedAbc] = useState('');
  const [musicNotaGenProgressLog, setMusicNotaGenProgressLog] = useState('');
  const [musicNotaGenStatusText, setMusicNotaGenStatusText] = useState('');
  const [musicNotaGenSpaceCombinations, setMusicNotaGenSpaceCombinations] =
    useState<NotaGenSpaceCombinations | null>(null);
  const [musicNotaGenSpaceOptionsLoading, setMusicNotaGenSpaceOptionsLoading] = useState(false);
  const [musicNotaGenSpaceOptionsError, setMusicNotaGenSpaceOptionsError] = useState<string | null>(
    null,
  );
  const [musicTranscodaBusy, setMusicTranscodaBusy] = useState(false);
  const [musicTranscodaError, setMusicTranscodaError] = useState<string | null>(null);
  const [musicTranscodaWarning, setMusicTranscodaWarning] = useState<string | null>(null);
  const [musicTranscodaResult, setMusicTranscodaResult] = useState<Record<string, unknown> | null>(
    null,
  );
  const [musicTranscodaGeneratedKern, setMusicTranscodaGeneratedKern] = useState('');
  const [musicTranscodaGeneratedXml, setMusicTranscodaGeneratedXml] = useState('');
  const [musicTranscodaImageFile, setMusicTranscodaImageFile] = useState<File | null>(null);
  const [musicTranscodaElapsedMs, setMusicTranscodaElapsedMs] = useState(0);
  const [musicTranscodaPhase, setMusicTranscodaPhase] = useState<
    'idle' | 'uploading' | 'transcribing'
  >('idle');
  const musicTranscodaStartedAtRef = useRef<number | null>(null);
  const [musicTranscodaDecoding, setMusicTranscodaDecoding] = useState<'greedy' | 'beam'>('greedy');
  const [musicTranscodaMaxLength, setMusicTranscodaMaxLength] = useState(2048);
  const [musicTranscodaNumBeams, setMusicTranscodaNumBeams] = useState(3);
  const [musicTranscodaRepetitionPenalty, setMusicTranscodaRepetitionPenalty] = useState(1.1);
  const [aiChatBusy, setAiChatBusy] = useState(false);
  const aiUnsupportedParametersRef = useRef<Map<string, Set<OptionalAiRequestParameter>>>(
    new Map(),
  );
  const [currentPage, setCurrentPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [progressivePagingActive, setProgressivePagingActive] = useState(false);
  const [progressiveHasMorePages, setProgressiveHasMorePages] = useState(false);
  const [pngExportDialogOpen, setPngExportDialogOpen] = useState(false);
  const [pngExportPageInput, setPngExportPageInput] = useState('1');
  const [pngExportBusy, setPngExportBusy] = useState(false);
  const [googleDriveExportDialogOpen, setGoogleDriveExportDialogOpen] = useState(false);
  const [shareLinkDialogOpen, setShareLinkDialogOpen] = useState(false);
  const [googleDriveShareUrl, setGoogleDriveShareUrl] = useState('');
  const [generatedShareUrl, setGeneratedShareUrl] = useState('');
  const [shareLinkError, setShareLinkError] = useState('');
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [compareScoreLoaderOpen, setCompareScoreLoaderOpen] = useState(false);
  const [compareScoreLoaderBusy, setCompareScoreLoaderBusy] = useState(false);
  const [compareScoreLoaderError, setCompareScoreLoaderError] = useState<string | null>(null);
  const [progressiveLoadEnabled, setProgressiveLoadEnabled] = useState(true);
  const [scoreId, setScoreId] = useState('');
  // Remember the zoom level per score (falling back to the last-used default), so
  // reopening a score restores the view the user last left it at.
  const zoomStorageKey = (id: string) => `ots_editor_zoom_v1:${id || 'default'}`;
  const zoomRestoredForRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined' || zoomRestoredForRef.current === scoreId) {
      return;
    }
    zoomRestoredForRef.current = scoreId;
    const raw =
      window.localStorage.getItem(zoomStorageKey(scoreId)) ??
      window.localStorage.getItem(zoomStorageKey(''));
    const saved = raw !== null ? Number(raw) : NaN;
    if (Number.isFinite(saved) && saved > 0) {
      setZoom(clampZoom(saved));
    }
  }, [scoreId]);
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const value = String(zoom);
    window.localStorage.setItem(zoomStorageKey(scoreId), value);
    window.localStorage.setItem(zoomStorageKey(''), value);
  }, [zoom, scoreId]);
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
  const [instrumentClefMap, setInstrumentClefMap] = useState<Record<
    string,
    { staves: number; clefs: { staff: number; clef: string }[] }
  > | null>(null);
  const [instrumentClefMapError, setInstrumentClefMapError] = useState<string | null>(null);
  const [instrumentFallbackGroups, setInstrumentFallbackGroups] = useState<
    InstrumentTemplateGroup[]
  >([]);
  const [instrumentFallbackError, setInstrumentFallbackError] = useState<string | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  // Paused is a distinct state from stopped: the stream, its scheduled sources and
  // its iterator all stay alive, so resuming continues rather than re-renders.
  const [isPaused, setIsPaused] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const audioUrlRef = useRef<string | null>(null);
  const tempPlaybackAudioUrlRef = useRef<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const streamIteratorRef = useRef<SynthBatchIterator | null>(null);
  const transportPlaybackGenerationRef = useRef(0);
  const previewAudioSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const previewStreamIteratorRef = useRef<SynthBatchIterator | null>(null);
  const previewPlaybackGenerationRef = useRef(0);
  const currentPageRef = useRef(currentPage);
  const selectedPointRef = useRef<{ page: number; x: number; y: number } | null>(selectedPoint);
  // False means libmscore already owns the authoritative selection. The only
  // normal path that moves the overlay without moving the engine is letter-key
  // pitch replacement outside note-input mode, which deliberately previews the
  // next note. Its next selection-dependent command must project that point once.
  const selectionProjectionNeededRef = useRef(false);
  const progressivePageLoadInFlightRef = useRef(false);
  const pageNavigationInFlightRef = useRef(false);
  const largeScoreSessionRef = useRef(false);
  const largeSessionXmlAutoloadDeferredLoggedRef = useRef(false);
  const backgroundInitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactionPrimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactionPrimeRunIdRef = useRef(0);
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

  const emitEditorTelemetry = useCallback(
    (
      eventName: string,
      properties?: Record<string, string | number | boolean | null | undefined>,
      options?: { beacon?: boolean },
    ) => {
      const sessionId = editorSessionIdRef.current || getOrCreateEditorSessionId();
      editorSessionIdRef.current = sessionId;
      const lastTrace = lastApiTraceContextRef.current;
      trackEditorAnalyticsEvent(
        eventName,
        {
          editor_surface: isEmbedBuild ? 'embedded' : 'standalone',
          editor_session_id: sessionId || undefined,
          api_request_id: lastTrace.requestId || undefined,
          api_trace_id: lastTrace.traceId || undefined,
          ...(properties || {}),
        },
        options,
      );
    },
    [isEmbedBuild],
  );

  const setInteractionState = useCallback((next: { ready: boolean; preparing: boolean }) => {
    interactionReadyRef.current = next.ready;
    interactionPreparingRef.current = next.preparing;
    setInteractionReady(next.ready);
    setInteractionPreparing(next.preparing);
  }, []);

  const clearInteractionPrime = useCallback(() => {
    interactionPrimeRunIdRef.current += 1;
    if (interactionPrimeTimerRef.current) {
      clearTimeout(interactionPrimeTimerRef.current);
      interactionPrimeTimerRef.current = null;
    }
  }, []);

  const clearScheduledBackgroundInit = useCallback(() => {
    if (backgroundInitTimerRef.current) {
      clearTimeout(backgroundInitTimerRef.current);
      backgroundInitTimerRef.current = null;
    }
  }, []);

  /** In-flight Ctrl+C, so a Ctrl+V arriving behind it does not read an empty clipboard. */
  const copyInFlightRef = useRef<Promise<boolean> | null>(null);
  const selectionInFlightRef = useRef<Promise<unknown> | null>(null);

  const runSerializedScoreOperation = useCallback(
    async <T,>(operation: () => Promise<T>, label: string): Promise<T> => {
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
        console.warn(`[engine-queue] force release after ${ENGINE_OPERATION_STALL_RELEASE_MS}ms`, {
          label,
        });
        release();
      }, ENGINE_OPERATION_STALL_RELEASE_MS);

      try {
        return await operationPromise;
      } finally {
        clearTimeout(forceReleaseTimer);
        release();
      }
    },
    [],
  );

  const reportClipboardUnsupported = useCallback(() => {
    alert('This build of webmscore does not expose selection copy.');
  }, []);
  const compareClipboard = useCompareClipboard({
    runSerialized: runSerializedScoreOperation,
    reportUnsupported: reportClipboardUnsupported,
  });
  // The main editor shares this slot on purpose; see useCompareClipboard.
  const { clipboardRef, copySelection: copyCompareSelection } = compareClipboard;

  const stopCompareSideAudio = useCallback<StopCompareSideAudio>(
    (side, options) => stopCompareSideAudioRef.current(side, options),
    [],
  );

  const aiEditController = useAiEditController(aiEditEffort);
  const beginAiEdit = aiEditController.begin;
  const updateAiEditProgress = aiEditController.updateProgress;
  const finishAiEdit = aiEditController.finish;
  const aiEditWork = aiEditController.work;
  const aiEditElapsedMs = aiEditController.elapsedMs;
  const activeAiEditBudgetMs = aiEditController.budgetMs;
  const cancelAiEditRequest = aiEditController.cancel;
  const aiDiffFeedbackBusy = aiEditController.activeKind === 'feedback';
  const aiPatchBusy =
    aiEditController.active &&
    (aiEditController.activeKind === 'patch' || aiEditController.activeKind === 'deep');
  const aiBusy = aiChatBusy || aiPatchBusy;

  useEffect(() => {
    if (!editorSessionIdRef.current) {
      editorSessionIdRef.current = getOrCreateEditorSessionId();
    }
    editorMountedAtRef.current = Date.now();
    const telemetryCounters = telemetryCountersRef.current;
    emitEditorTelemetry('score_editor_runtime_loaded');
    return () => {
      const durationMs = Math.max(0, Date.now() - editorMountedAtRef.current);
      const counters = telemetryCounters;
      // In React strict-mode development mounts can be immediately torn down.
      // Ignore near-zero lifecycle noise unless actual user work happened.
      const hasActivity =
        counters.documentsLoaded > 0 ||
        counters.documentLoadFailures > 0 ||
        counters.aiRequests > 0 ||
        counters.patchApplies > 0;
      if (durationMs < 1500 && !hasActivity) {
        return;
      }
      emitEditorTelemetry(
        'score_editor_session_summary',
        {
          duration_ms: durationMs,
          documents_loaded: counters.documentsLoaded,
          document_load_failures: counters.documentLoadFailures,
          ai_requests: counters.aiRequests,
          ai_failures: counters.aiFailures,
          patch_applies: counters.patchApplies,
          patch_apply_failures: counters.patchApplyFailures,
        },
        { beacon: true },
      );
      clearInteractionPrime();
    };
  }, [clearInteractionPrime, emitEditorTelemetry]);

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
      if (
        parsed &&
        parsed.length === 0 &&
        targetScore.measureSignatureCount &&
        targetScore.measureSignatureAt
      ) {
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

  const refreshMeasurePositions = useCallback(
    async (targetScore: Score, setter: (positions: Positions | null) => void) => {
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
    },
    [],
  );

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
      if (
        lower === 'default-x' ||
        lower === 'default-y' ||
        lower === 'relative-x' ||
        lower === 'relative-y'
      ) {
        return true;
      }
      if (
        lower === 'placement' ||
        lower === 'justify' ||
        lower === 'halign' ||
        lower === 'valign'
      ) {
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
      const staffs = Array.from(score.children).filter(
        (node) => node.tagName === 'Staff',
      ) as Element[];
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

  const replaceMeasuresInMusicXml = useCallback(
    (
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
    },
    [],
  );

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

  const buildIndexAlignment = useCallback(
    (left: string[], right: string[]): MeasureAlignmentRow[] => {
      const total = Math.max(left.length, right.length);
      const rows: MeasureAlignmentRow[] = [];
      for (let i = 0; i < total; i += 1) {
        const leftIndex = i < left.length ? i : null;
        const rightIndex = i < right.length ? i : null;
        const match =
          leftIndex !== null && rightIndex !== null && left[leftIndex] === right[rightIndex];
        rows.push({ leftIndex, rightIndex, match });
      }
      return rows;
    },
    [],
  );

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

  const buildLcsAlignment = useCallback(
    (left: string[], right: string[]) => {
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
    },
    [normalizeAlignmentRows],
  );

  useEffect(() => {
    scoreRef.current = score;
    selectionProjectionNeededRef.current = false;
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
  }, [clearScheduledBackgroundInit]);

  useEffect(() => {
    soundFontLoadedRef.current = soundFontLoaded;
  }, [soundFontLoaded]);

  useEffect(() => {
    triedSoundFontRef.current = triedSoundFont;
  }, [triedSoundFont]);

  useEffect(() => {}, [selectedElement, overlaySuppressed]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (!aiEnabled) {
      return;
    }
    const stored = window.sessionStorage.getItem(aiKeyStorageKey);
    // Migrate any key previously persisted in localStorage into sessionStorage,
    // and stop persisting it there — the key should not linger across sessions.
    const legacy = window.localStorage.getItem(aiKeyStorageKey);
    if (legacy) {
      window.localStorage.removeItem(aiKeyStorageKey);
    }
    setAiApiKey(stored ?? legacy ?? '');
  }, [aiEnabled, aiKeyStorageKey, setAiApiKey]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (!aiEnabled) {
      return;
    }
    if (aiApiKey.trim()) {
      window.sessionStorage.setItem(aiKeyStorageKey, aiApiKey);
    } else {
      window.sessionStorage.removeItem(aiKeyStorageKey);
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
  }, [aiEnabled, aiModelStorageKey, aiProvider, setAiModel]);

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
    setAiChatSourceRagHintDismissed(
      window.localStorage.getItem(AI_CHAT_SOURCE_RAG_HINT_DISMISSED_STORAGE_KEY) === '1',
    );
  }, [setAiChatSourceRagHintDismissed]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (aiChatSourceRagHintDismissed) {
      window.localStorage.setItem(AI_CHAT_SOURCE_RAG_HINT_DISMISSED_STORAGE_KEY, '1');
    } else {
      window.localStorage.removeItem(AI_CHAT_SOURCE_RAG_HINT_DISMISSED_STORAGE_KEY);
    }
  }, [aiChatSourceRagHintDismissed]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (!aiEnabled) {
      return;
    }
    setMusicNotaGenBackend(
      window.localStorage.getItem(MUSIC_SPECIALISTS_NOTAGEN_BACKEND_STORAGE_KEY) ===
        'huggingface-space'
        ? 'huggingface-space'
        : 'huggingface',
    );
    setMusicNotaGenModelId(
      window.localStorage.getItem(MUSIC_SPECIALISTS_NOTAGEN_MODEL_STORAGE_KEY) ??
        MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_MODEL,
    );
    setMusicNotaGenRevision(
      window.localStorage.getItem(MUSIC_SPECIALISTS_NOTAGEN_REVISION_STORAGE_KEY) ??
        MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_REVISION,
    );
    setMusicNotaGenSpaceId(
      window.localStorage.getItem(MUSIC_SPECIALISTS_NOTAGEN_SPACE_ID_STORAGE_KEY) ??
        MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_ID,
    );
    setMusicNotaGenSpacePeriod(
      window.localStorage.getItem(MUSIC_SPECIALISTS_NOTAGEN_SPACE_PERIOD_STORAGE_KEY) ??
        MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_PERIOD,
    );
    setMusicNotaGenSpaceComposer(
      window.localStorage.getItem(MUSIC_SPECIALISTS_NOTAGEN_SPACE_COMPOSER_STORAGE_KEY) ??
        MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_COMPOSER,
    );
    setMusicNotaGenSpaceInstrumentation(
      window.localStorage.getItem(MUSIC_SPECIALISTS_NOTAGEN_SPACE_INSTRUMENTATION_STORAGE_KEY) ??
        MUSIC_SPECIALISTS_DEFAULT_NOTAGEN_SPACE_INSTRUMENTATION,
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
    persistValue(
      MUSIC_SPECIALISTS_NOTAGEN_SPACE_INSTRUMENTATION_STORAGE_KEY,
      musicNotaGenSpaceInstrumentation,
    );
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
    () =>
      Object.keys(
        (musicNotaGenSpaceCombinations && musicNotaGenSpaceCombinations[musicNotaGenSpacePeriod]) ||
          {},
      ).sort(),
    [musicNotaGenSpaceCombinations, musicNotaGenSpacePeriod],
  );
  const musicNotaGenSpaceInstrumentations = useMemo(
    () =>
      musicNotaGenSpaceCombinations &&
      musicNotaGenSpaceCombinations[musicNotaGenSpacePeriod] &&
      musicNotaGenSpaceCombinations[musicNotaGenSpacePeriod][musicNotaGenSpaceComposer]
        ? [
            ...musicNotaGenSpaceCombinations[musicNotaGenSpacePeriod][musicNotaGenSpaceComposer],
          ].sort()
        : [],
    [musicNotaGenSpaceCombinations, musicNotaGenSpacePeriod, musicNotaGenSpaceComposer],
  );

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
    if (aiEnabled) {
      return;
    }
    if (
      xmlSidebarTab !== 'xml' &&
      xmlSidebarTab !== 'transcoda' &&
      xmlSidebarTab !== 'multitrack' &&
      xmlSidebarTab !== 'mma' &&
      xmlSidebarTab !== 'harmony' &&
      xmlSidebarTab !== 'functional'
    ) {
      setXmlSidebarTab('xml');
    }
  }, [aiEnabled, xmlSidebarTab]);

  // Differences computed by whoever launched this embed.
  useEffect(() => {
    if (!compareRegionsUrl) {
      setSuppliedRegions(null);
      setSuppliedRegionsError(null);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setSuppliedRegions(null);
    setSuppliedRegionsError(null);
    fetch(compareRegionsUrl, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Comparison regions unavailable (${response.status})`);
        return response.json();
      })
      .then((body) => {
        if (cancelled) return;
        // Highlighting depends on the measure analysis alone. A page can
        // be refused page-wide because one block's location on the source
        // image is unproven, and withholding every highlight for that
        // would hide differences that were computed correctly.
        if (body?.analysisStatus && body.analysisStatus !== 'succeeded') {
          setSuppliedRegions([]);
          setSuppliedSystems([]);
          setSuppliedMerged(null);
          setSuppliedCompareLeftEngineId('');
          setSuppliedCompareRightEngineId('');
          setSuppliedRegionsError(
            body?.refusalReasons?.[0]?.detail || 'These readings could not be compared.',
          );
          return;
        }
        setSuppliedRegions(Array.isArray(body?.regions) ? body.regions : []);
        setSuppliedSystems(Array.isArray(body?.systems) ? body.systems : []);
        setSuppliedMerged(body?.merged ?? null);
        setSuppliedCompareLeftEngineId(String(body?.left?.engineId || ''));
        setSuppliedCompareRightEngineId(String(body?.right?.engineId || ''));
      })
      .catch((err) => {
        if (cancelled || controller.signal.aborted) return;
        // Never fall back to the client diff: a wrong highlight cannot be
        // told apart from a real disagreement, which is worse than none.
        setSuppliedRegions([]);
        setSuppliedRegionsError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [compareRegionsUrl]);

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
          currentLabel: rightLabel,
          checkpointLabel: leftLabel,
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
    // TD-02 classification 3 (one-time initialization). This effect keys on the
    // compare URLs only. handleFileUpload and the setters it closes over would
    // re-run the fetch and replace the live score on every editor state change,
    // discarding user edits. Do not add them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareLeftUrl, compareRightUrl, leftLabel]);

  useEffect(() => {
    if (!reviewScoreUrl) return;

    const loadReviewScore = async () => {
      setCheckpointBusy(true);
      try {
        const response = await fetch(reviewScoreUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch ${reviewLabel}`);
        }
        const xml = await response.text();
        const blob = new Blob([xml], { type: 'application/xml' });
        const file = new File([blob], 'review-score.xml');
        await handleFileUpload(file, {
          preserveScoreId: false,
          updateUrl: false,
          telemetrySource: 'change_review_load',
        });
      } catch (err) {
        console.error('Failed to load review score:', err);
        setChangeReviewError(err instanceof Error ? err.message : String(err));
      } finally {
        setCheckpointBusy(false);
      }
    };

    void loadReviewScore();
    // TD-02 classification 3 (one-time initialization). Keyed on the review score
    // URL only; adding handleFileUpload would reload and replace the working score
    // whenever an unrelated editor callback identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewLabel, reviewScoreUrl]);

  // Load score from sessionStorage if opened from "Open in Editor" button
  useEffect(() => {
    const openInEditorData = sessionStorage.getItem('openInEditor');
    if (!openInEditorData) return;

    const loadScoreFromSession = async () => {
      try {
        const { xml, filename, launchContext: storedLaunchContext } = JSON.parse(openInEditorData);
        setSessionLaunchContext(sanitizeEditorLaunchContext(storedLaunchContext));

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
    // TD-02 classification 3 (one-time initialization). The sessionStorage handoff
    // from "Open in Editor" is consumed exactly once on mount; re-running it would
    // reload the handoff score over whatever the user has since edited.
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
    const shouldLoadText =
      hasTextElementClass(selectedElementClasses) || Boolean(textEditorPosition);
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

  // Reset the edited flag whenever the inline text editor opens or closes.
  useEffect(() => {
    inlineTextEditedRef.current = false;
  }, [textEditorPosition]);

  // Populate the (uncontrolled) inline editor from the selected element's text.
  // Runs on open and again if the text loads asynchronously, but never once the
  // user has started typing, so keystrokes are not reverted by a late load.
  useEffect(() => {
    if (!textEditorPosition || inlineTextEditedRef.current) {
      return;
    }
    const node = inlineTextContentRef.current;
    if (!node) {
      return;
    }
    if (node.textContent !== selectedTextValue) {
      node.textContent = selectedTextValue;
    }
    node.focus();
    const selection = typeof window !== 'undefined' ? window.getSelection() : null;
    if (selection && typeof document !== 'undefined') {
      const range = document.createRange();
      range.selectNodeContents(node);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }, [textEditorPosition, selectedTextValue]);

  const refreshInspector = useCallback(async () => {
    const activeScore = scoreRef.current ?? score;
    if (!activeScore?.getSelectedElementProperties) {
      setInspectorData(null);
      setFretDiagramData(null);
      return;
    }
    setInspectorLoading(true);
    try {
      const properties = await Promise.resolve(activeScore.getSelectedElementProperties());
      setInspectorData(properties);
      const fretboard = activeScore.getSelectedFretDiagram
        ? await Promise.resolve(activeScore.getSelectedFretDiagram())
        : null;
      setFretDiagramData(fretboard);
    } catch (err) {
      console.warn('Failed to load Inspector properties:', err);
      setInspectorData(null);
      setFretDiagramData(null);
    } finally {
      setInspectorLoading(false);
    }
  }, [score]);

  useEffect(() => {
    if (!score || (!selectedElement && selectionBoxes.length === 0 && !selectedPoint)) {
      setInspectorData(null);
      setFretDiagramData(null);
      setInspectorLoading(false);
      return;
    }
    void refreshInspector();
  }, [
    refreshInspector,
    score,
    selectedElement,
    selectedElementClasses,
    selectedPoint,
    selectionBoxes.length,
  ]);

  const ensureScoreId = useCallback(
    (fallbackPrefix: string) => {
      if (scoreId) {
        return scoreId;
      }
      const generated = `${fallbackPrefix}:${crypto.randomUUID()}`;
      setScoreId(generated);
      updateUrlScoreId(generated);
      return generated;
    },
    [scoreId],
  );

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
      return {
        title: 'Legacy checkpoints',
        detail: 'Unscoped checkpoints',
        type: 'legacy' as const,
      };
    }
    if (id.startsWith('ots:')) {
      const [, workId = '', sourceId = ''] = id.split(':');
      return {
        title: sourceId ? `OTS source ${sourceId}` : 'OurTextScores source',
        detail: workId ? `Work ${workId}` : 'OurTextScores source',
        type: 'other' as const,
      };
    }
    return { title: id, detail: '', type: 'other' as const };
  };

  const escapeXml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

  const newScoreInstrumentGroups =
    instrumentGroups.length > 0 ? instrumentGroups : instrumentFallbackGroups;

  const newScoreInstrumentOptions = useMemo(() => {
    if (newScoreInstrumentGroups.length) {
      return newScoreInstrumentGroups.flatMap((group) =>
        group.instruments.map((instrument) => ({
          id: instrument.id,
          name: instrument.name,
          label: group.name ? `${instrument.name} (${group.name})` : instrument.name,
        })),
      );
    }
    return [
      { id: 'piano', name: 'Piano', label: 'Piano' },
      { id: 'violin', name: 'Violin', label: 'Violin' },
      { id: 'flute', name: 'Flute', label: 'Flute' },
      { id: 'guitar', name: 'Guitar', label: 'Guitar' },
      { id: 'voice', name: 'Voice', label: 'Voice' },
    ];
  }, [newScoreInstrumentGroups]);
  const newScoreCommonInstrumentPreferences = useMemo(
    () => [
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
    ],
    [],
  );
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
  const compareCheckpointTitle = compareView?.checkpointLabel || compareView?.title || 'Checkpoint';
  const compareCurrentTitle = compareView?.currentLabel || 'Current';
  const compareLeftScore = compareSwapped ? score : compareRightScore;
  const compareRightScoreDisplay = compareSwapped ? compareRightScore : score;
  const compareLeftParts = compareSwapped ? scoreParts : compareRightParts;
  const compareRightPartsDisplay = compareSwapped ? compareRightParts : scoreParts;
  const compareLeftLabel = isEmbedMode
    ? compareSwapped
      ? rightLabel
      : leftLabel
    : compareSwapped
      ? compareCurrentTitle
      : compareCheckpointTitle;
  const compareRightLabel = isEmbedMode
    ? compareSwapped
      ? leftLabel
      : rightLabel
    : compareSwapped
      ? compareCheckpointTitle
      : compareCurrentTitle;
  const compareLeftXml = compareView
    ? compareSwapped
      ? compareView.currentXml
      : compareView.checkpointXml
    : '';
  const compareRightXml = compareView
    ? compareSwapped
      ? compareView.checkpointXml
      : compareView.currentXml
    : '';
  // Load state is auxiliary-score-keyed; the viewport status it feeds is pane-keyed.
  // Resolve the mapping once, here, rather than letting a compareRight*-named value
  // reach the right pane on the assumption that the auxiliary is always drawn there.
  const comparePaneStatus = resolveComparePaneStatus({
    liveIsLeftPane: compareSwapped,
    liveScorePresent: Boolean(score),
    auxiliaryScorePresent: Boolean(compareRightScore),
    auxiliaryLoading: compareRightLoading,
    auxiliaryError: compareRightError,
  });
  const compareLeftIsCurrent = compareLeftScore === score;
  const compareRightIsCurrent = compareRightScoreDisplay === score;
  const compareLeftRole: CompareScoreRole | null = compareLeftScore
    ? compareLeftIsCurrent
      ? 'current'
      : 'proposal'
    : null;
  const compareRightRole: CompareScoreRole | null = compareRightScoreDisplay
    ? compareRightIsCurrent
      ? 'current'
      : 'proposal'
    : null;
  /**
   * The score at a position in *this* workspace, which has only two.
   *
   * `CompareSide` carries a third value for the scanner comparator's merged
   * pane. Resolving it to null here is the honest answer — folding it into
   * 'right' with a two-armed ternary is how a position-keyed value ends up
   * holding another pane's score, which has already caused two defects.
   */
  const compareScoreForSide = useCallback(
    (side: CompareSide | null): Score | null => {
      if (side === 'left') return compareLeftScore;
      if (side === 'right') return compareRightScoreDisplay;
      return null;
    },
    [compareLeftScore, compareRightScoreDisplay],
  );
  const compareActiveScore = compareScoreForSide(compareActiveSide);
  const compareActiveRole: CompareScoreRole | null = compareActiveScore
    ? compareActiveScore === score
      ? 'current'
      : 'proposal'
    : null;
  const compareLeftSelectionBoxes = compareLeftRole
    ? compareSelectionBoxesByRole[compareLeftRole]
    : [];
  const compareRightSelectionBoxes = compareRightRole
    ? compareSelectionBoxesByRole[compareRightRole]
    : [];
  const compareSupportsReflow = Boolean(
    score?.measureLineBreaks &&
    score?.setMeasureLineBreaks &&
    compareRightScore?.measureLineBreaks &&
    compareRightScore?.setMeasureLineBreaks &&
    score?.setLayoutMode &&
    compareRightScore?.setLayoutMode,
  );
  const compareAlignmentByPart = useMemo(() => {
    const map = new Map<number, PartAlignment>();
    for (const alignment of compareAlignments) {
      map.set(alignment.partIndex, alignment);
    }
    return map;
  }, [compareAlignments]);
  const changeReviewThreadsByAnchor = useMemo(() => {
    const map = new Map<string, ChangeReviewThread>();
    const threads = changeReviewScoreView?.threads || changeReviewDiff?.threads || [];
    threads.forEach((thread) => {
      map.set(thread.diffAnchor.anchorId, thread);
    });
    changeReviewScoreView?.bars.forEach((bar) => {
      const barThread =
        map.get(bar.anchorId) ||
        (bar.threadAnchorId ? map.get(bar.threadAnchorId) : null) ||
        (bar.changeAnchorId ? map.get(bar.changeAnchorId) : null);
      if (barThread && !map.has(bar.anchorId)) {
        map.set(bar.anchorId, barThread);
      }
    });
    return map;
  }, [changeReviewDiff, changeReviewScoreView]);
  const changeReviewRegionsInMeasureOrder = useMemo(() => {
    return sortChangeReviewRegionsByMeasure(changeReviewDiff?.scoreRegions || []);
  }, [changeReviewDiff]);
  const changeReviewCompareBarsForGutter = useMemo(
    () =>
      (changeReviewDiff?.bars || [])
        .filter(
          (bar) =>
            bar.anchorId === changeReviewFocusedAnchorId ||
            changeReviewThreadsByAnchor.has(bar.anchorId),
        )
        .sort(
          (a, b) =>
            a.measureIndex - b.measureIndex ||
            a.partIndex - b.partIndex ||
            a.side.localeCompare(b.side),
        ),
    [changeReviewDiff, changeReviewFocusedAnchorId, changeReviewThreadsByAnchor],
  );

  const refreshChangeReview = useCallback(async () => {
    if (!changeReviewId) {
      setChangeReviewDetail(null);
      setChangeReviewDiff(null);
      setChangeReviewScoreView(null);
      setChangeReviewError(null);
      return;
    }
    setChangeReviewLoading(true);
    setChangeReviewError(null);
    try {
      const [detail, reviewData] = await Promise.all([
        fetchJsonOrThrow<ChangeReviewDetail>(
          `/api/proxy/change-reviews/${encodeURIComponent(changeReviewId)}`,
        ),
        isChangeReviewSingleScoreMode
          ? fetchJsonOrThrow<ChangeReviewScoreView>(
              `/api/proxy/change-reviews/${encodeURIComponent(changeReviewId)}/score-view${changeReviewPatchset ? `?patchset=${encodeURIComponent(changeReviewPatchset)}` : ''}`,
            )
          : fetchJsonOrThrow<ChangeReviewDiff>(
              `/api/proxy/change-reviews/${encodeURIComponent(changeReviewId)}/diff${changeReviewPatchset ? `?patchset=${encodeURIComponent(changeReviewPatchset)}` : ''}`,
            ),
      ]);
      setChangeReviewDetail(detail);
      if (isChangeReviewSingleScoreMode) {
        setChangeReviewScoreView(reviewData as ChangeReviewScoreView);
        setChangeReviewDiff(null);
      } else {
        setChangeReviewDiff(reviewData as ChangeReviewDiff);
        setChangeReviewScoreView(null);
      }
    } catch (err) {
      setChangeReviewError(err instanceof Error ? err.message : String(err));
    } finally {
      setChangeReviewLoading(false);
    }
  }, [changeReviewId, changeReviewPatchset, isChangeReviewSingleScoreMode]);
  const notifyParentChangeReviewUpdated = useCallback(() => {
    if (typeof window === 'undefined' || !changeReviewId || window.parent === window) {
      return;
    }
    window.parent.postMessage(
      {
        type: 'ots.change-review.updated',
        reviewId: changeReviewId,
      },
      window.location.origin,
    );
  }, [changeReviewId]);
  const runChangeReviewAction = useCallback(
    async (fn: () => Promise<void>) => {
      setChangeReviewActionBusy(true);
      setChangeReviewActionError(null);
      try {
        await fn();
        await refreshChangeReview();
        notifyParentChangeReviewUpdated();
      } catch (err) {
        setChangeReviewActionError(err instanceof Error ? err.message : String(err));
      } finally {
        setChangeReviewActionBusy(false);
      }
    },
    [notifyParentChangeReviewUpdated, refreshChangeReview],
  );
  /**
   * Owns the thread-creation request so the compare gutter does not. A presentation
   * component holding the review endpoint, its URL shape and a fetch primitive means
   * the API contract lives in two places; this keeps it here, next to the other
   * change-review calls, and hands the gutter an action.
   */
  const createChangeReviewThread = useCallback(
    async (anchorId: string, content: string) => {
      await runChangeReviewAction(async () => {
        await fetchJsonOrThrow(
          `/api/proxy/change-reviews/${encodeURIComponent(changeReviewId)}/threads`,
          {
            method: 'POST',
            body: JSON.stringify({
              anchorId,
              content,
              patchsetNumber: changeReviewPatchset ? Number(changeReviewPatchset) : undefined,
            }),
          },
        );
        setChangeReviewNewThreadAnchorId(null);
        setChangeReviewNewThreadContent('');
      });
    },
    [changeReviewId, changeReviewPatchset, runChangeReviewAction],
  );
  useEffect(() => {
    if (!isChangeReviewMode) {
      setChangeReviewDetail(null);
      setChangeReviewDiff(null);
      setChangeReviewScoreView(null);
      setChangeReviewMeasurePositions(null);
      setChangeReviewLoading(false);
      setChangeReviewError(null);
      setChangeReviewActionError(null);
      setChangeReviewActionBusy(false);
      setChangeReviewNewThreadAnchorId(null);
      setChangeReviewNewThreadContent('');
      setChangeReviewReplyThreadId(null);
      setChangeReviewReplyContent('');
      return;
    }
    void refreshChangeReview();
  }, [isChangeReviewMode, refreshChangeReview]);
  const renderChangeReviewThread = useCallback(
    (thread: ChangeReviewThread) => (
      <div className="mt-2 grid gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-2 text-[10px] text-slate-700">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
              thread.status === 'open'
                ? 'bg-amber-100 text-amber-800'
                : 'bg-emerald-100 text-emerald-800'
            }`}
          >
            {thread.status}
          </span>
          {changeReviewDetail?.permissions.canResolve && (
            <button
              type="button"
              disabled={changeReviewActionBusy}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-[10px] text-slate-700 disabled:opacity-50"
              onClick={() =>
                void runChangeReviewAction(async () => {
                  await fetchJsonOrThrow(
                    `/api/proxy/change-reviews/${encodeURIComponent(changeReviewId)}/threads/${encodeURIComponent(thread.threadId)}`,
                    {
                      method: 'PATCH',
                      body: JSON.stringify({
                        status: thread.status === 'open' ? 'resolved' : 'open',
                      }),
                    },
                  );
                })
              }
            >
              {thread.status === 'open' ? 'Resolve' : 'Reopen'}
            </button>
          )}
        </div>
        <div className="grid gap-2">
          {thread.comments.map((comment) => (
            <div
              key={comment.commentId}
              className="rounded border border-slate-200 bg-white px-2 py-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-[9px] text-slate-500">
                  {comment.username || comment.userId} ·{' '}
                  {new Date(comment.createdAt).toLocaleString()}
                  {comment.editedAt ? ' · edited' : ''}
                </div>
                {changeReviewDetail?.viewerUserId === comment.userId && (
                  <button
                    type="button"
                    disabled={changeReviewActionBusy}
                    className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[9px] text-slate-700 disabled:opacity-50"
                    onClick={() =>
                      void runChangeReviewAction(async () => {
                        await fetchJsonOrThrow(
                          `/api/proxy/change-reviews/${encodeURIComponent(changeReviewId)}/comments/${encodeURIComponent(comment.commentId)}`,
                          {
                            method: 'DELETE',
                          },
                        );
                      })
                    }
                  >
                    Delete
                  </button>
                )}
              </div>
              <div className="mt-1 whitespace-pre-wrap text-[10px] text-slate-800">
                {comment.content}
              </div>
            </div>
          ))}
        </div>
        {changeReviewDetail?.permissions.canReply && (
          <div className="grid gap-2">
            {changeReviewReplyThreadId === thread.threadId ? (
              <>
                <textarea
                  value={changeReviewReplyContent}
                  onChange={(event) => setChangeReviewReplyContent(event.target.value)}
                  rows={3}
                  placeholder="Write a reply"
                  className="min-h-[72px] w-full rounded border border-slate-300 bg-white px-2 py-1 text-[10px] text-slate-900 placeholder-slate-400"
                  disabled={changeReviewActionBusy}
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={changeReviewActionBusy}
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-[10px] text-slate-700 disabled:opacity-50"
                    onClick={() => {
                      setChangeReviewReplyThreadId(null);
                      setChangeReviewReplyContent('');
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={changeReviewActionBusy}
                    className="rounded border border-sky-300 bg-sky-50 px-2 py-1 text-[10px] text-sky-700 disabled:opacity-50"
                    onClick={() =>
                      void runChangeReviewAction(async () => {
                        await fetchJsonOrThrow(
                          `/api/proxy/change-reviews/${encodeURIComponent(changeReviewId)}/threads/${encodeURIComponent(thread.threadId)}/comments`,
                          {
                            method: 'POST',
                            body: JSON.stringify({ content: changeReviewReplyContent }),
                          },
                        );
                        setChangeReviewReplyThreadId(null);
                        setChangeReviewReplyContent('');
                      })
                    }
                  >
                    Reply
                  </button>
                </div>
              </>
            ) : (
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={changeReviewActionBusy}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-[10px] text-slate-700 disabled:opacity-50"
                  onClick={() => {
                    setChangeReviewReplyThreadId(thread.threadId);
                    setChangeReviewReplyContent('');
                  }}
                >
                  Reply
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    ),
    [
      changeReviewActionBusy,
      changeReviewDetail,
      changeReviewId,
      changeReviewReplyContent,
      changeReviewReplyThreadId,
      runChangeReviewAction,
    ],
  );
  const isAiCompareMode = compareView?.title === 'Assistant Proposal';
  const aiDiffCurrentBlocks = useMemo(() => {
    if (!isAiCompareMode) {
      return [] as Array<{
        partIndex: number;
        blockIndex: number;
        blockKey: string;
        measureRange: string;
        contentSignature: string;
      }>;
    }
    const blocks: Array<{
      partIndex: number;
      blockIndex: number;
      blockKey: string;
      measureRange: string;
      contentSignature: string;
    }> = [];
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
        const measureRange =
          primaryStart !== undefined
            ? `${primaryStart + 1}${primaryEnd !== primaryStart ? `-${primaryEnd + 1}` : ''}`
            : 'unknown';
        const stableMeasureKey =
          measureRange !== 'unknown'
            ? measureRange
            : `${blockIndex}:${leftStart ?? 'x'}:${leftEnd ?? 'x'}:${rightStart ?? 'x'}:${rightEnd ?? 'x'}`;
        const blockKey = `${partIndex}:${stableMeasureKey}`;
        blocks.push({
          partIndex,
          blockIndex,
          blockKey,
          measureRange,
          contentSignature: aiDiffBlockContentSignature(
            compareSignatures,
            partIndex,
            leftIndices,
            rightIndices,
          ),
        });
      });
    });
    return blocks;
  }, [
    isAiCompareMode,
    comparePartCount,
    compareAlignmentByPart,
    buildMismatchBlocks,
    compareSignatures,
  ]);
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
  const getReviewStatusForFeedback = useCallback(
    (review: BlockReview | undefined): BlockReviewStatus => {
      if (!review) {
        return 'pending';
      }
      if (review.status !== 'comment') {
        return review.status;
      }
      return review.comment.trim() ? 'comment' : 'pending';
    },
    [],
  );
  const resolveAiDiffReview = useCallback(
    (block: AiDiffBlockRef): BlockReview | undefined => {
      const review =
        aiDiffReviewByKey.get(block.blockKey) ??
        aiDiffReviewByRange.get(`${block.partIndex}:${block.measureRange}`);
      // A review from an earlier proposal cycle only applies to a block whose content it
      // was made against; a different change in the same measures starts unreviewed.
      if (
        review?.contentSignature &&
        block.contentSignature &&
        review.contentSignature !== block.contentSignature
      ) {
        return undefined;
      }
      return review;
    },
    [aiDiffReviewByKey, aiDiffReviewByRange],
  );
  const aiDiffRejectedCount = useMemo(
    () =>
      aiDiffCurrentBlocks.filter(
        (block) => getReviewStatusForFeedback(resolveAiDiffReview(block)) === 'rejected',
      ).length,
    [aiDiffCurrentBlocks, resolveAiDiffReview, getReviewStatusForFeedback],
  );
  const aiDiffCommentCount = useMemo(
    () =>
      aiDiffCurrentBlocks.filter(
        (block) => getReviewStatusForFeedback(resolveAiDiffReview(block)) === 'comment',
      ).length,
    [aiDiffCurrentBlocks, resolveAiDiffReview, getReviewStatusForFeedback],
  );
  const aiDiffPendingCount = useMemo(
    () =>
      aiDiffCurrentBlocks.filter(
        (block) => getReviewStatusForFeedback(resolveAiDiffReview(block)) === 'pending',
      ).length,
    [aiDiffCurrentBlocks, resolveAiDiffReview, getReviewStatusForFeedback],
  );
  const aiDiffAcceptedCount = useMemo(
    () =>
      aiDiffReviews.filter((review) => getReviewStatusForFeedback(review) === 'accepted').length,
    [aiDiffReviews, getReviewStatusForFeedback],
  );
  // Measure-thread notes with at least one user comment are also sent as feedback.
  const aiMeasureNoteCount = useMemo(
    () =>
      Object.values(aiMeasureThreads).filter((thread) =>
        thread.comments.some((entry) => entry.author === 'you' && entry.text.trim()),
      ).length,
    [aiMeasureThreads],
  );
  const aiDiffCommentTotal = aiDiffCommentCount + aiMeasureNoteCount;
  const hasGlobalNote = aiDiffGlobalComment.trim().length > 0;
  const compareManualEditCount = compareEditedRoles.length;
  const canSendDiffFeedback = useMemo(
    () =>
      !aiBusy &&
      !aiDiffFeedbackBusy &&
      !compareSwapBusy &&
      !compareEditBusy &&
      (aiDiffRejectedCount + aiDiffCommentTotal > 0 ||
        hasGlobalNote ||
        compareManualEditCount > 0 ||
        (aiDiffPendingCount > 0 && aiDiffAcceptedCount > 0)),
    [
      aiBusy,
      aiDiffFeedbackBusy,
      compareSwapBusy,
      compareEditBusy,
      aiDiffRejectedCount,
      aiDiffCommentTotal,
      hasGlobalNote,
      compareManualEditCount,
      aiDiffPendingCount,
      aiDiffAcceptedCount,
    ],
  );
  const diffFeedbackButtonLabel = useMemo(() => {
    const parts: string[] = [];
    if (aiDiffCommentTotal > 0) {
      parts.push(`${aiDiffCommentTotal} comment${aiDiffCommentTotal === 1 ? '' : 's'}`);
    }
    if (aiDiffRejectedCount > 0) {
      parts.push(`${aiDiffRejectedCount} rejection${aiDiffRejectedCount === 1 ? '' : 's'}`);
    }
    if (hasGlobalNote) {
      parts.push('global note');
    }
    if (compareManualEditCount > 0) {
      parts.push(
        `${compareManualEditCount} edited score${compareManualEditCount === 1 ? '' : 's'}`,
      );
    }
    if (
      aiDiffPendingCount > 0 &&
      aiDiffAcceptedCount > 0 &&
      aiDiffRejectedCount + aiDiffCommentTotal === 0 &&
      !hasGlobalNote
    ) {
      parts.push(`${aiDiffPendingCount} pending`);
    }
    return parts.length ? `Send Feedback (${parts.join(', ')})` : 'Send Feedback';
  }, [
    aiDiffCommentTotal,
    aiDiffRejectedCount,
    hasGlobalNote,
    compareManualEditCount,
    aiDiffPendingCount,
    aiDiffAcceptedCount,
  ]);
  const compareEffectiveZoom = compareZoom ?? compareFitZoom;
  const compareEffectiveZoomRef = useRef(compareEffectiveZoom);
  compareEffectiveZoomRef.current = compareEffectiveZoom;

  const compareGutterRegionRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const hitTestMeasure = useCallback(
    (
      positions: Positions | null,
      clientX: number,
      clientY: number,
      wrapperRef: React.RefObject<HTMLDivElement | null>,
      zoom: number,
    ): number => {
      if (!positions?.elements.length || !wrapperRef.current) return -1;
      const rect = wrapperRef.current.getBoundingClientRect();
      const scoreX = (clientX - rect.left) / zoom;
      const scoreY = (clientY - rect.top) / zoom;
      const pageHeight = positions.pageSize?.height ?? 0;
      // Exact hit first
      const exact = positions.elements.findIndex((el) => {
        const w = typeof el.sx === 'number' ? el.sx : (el.width ?? 0);
        const h = typeof el.sy === 'number' ? el.sy : (el.height ?? 0);
        const needsPageOffset = pageHeight > 0 && el.page > 0 && el.y + h <= pageHeight * 1.2;
        const pageOffset = needsPageOffset ? el.page * pageHeight : 0;
        const y = el.y + pageOffset;
        return scoreX >= el.x && scoreX <= el.x + w && scoreY >= y && scoreY <= y + h;
      });
      if (exact >= 0) return exact;
      // Nearest fallback: closest measure by 2D distance to its centre
      let bestIdx = -1;
      let bestDist = Infinity;
      positions.elements.forEach((el, idx) => {
        const w = typeof el.sx === 'number' ? el.sx : (el.width ?? 0);
        const h = typeof el.sy === 'number' ? el.sy : (el.height ?? 0);
        const needsPageOffset = pageHeight > 0 && el.page > 0 && el.y + h <= pageHeight * 1.2;
        const pageOffset = needsPageOffset ? el.page * pageHeight : 0;
        const cy = el.y + pageOffset + h / 2;
        const cx = el.x + w / 2;
        const dist = (scoreX - cx) ** 2 + (scoreY - cy) ** 2;
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = idx;
        }
      });
      return bestIdx;
    },
    [],
  );

  const handleCompareScoreClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>, side: 'left' | 'right') => {
      const positions =
        side === 'left' ? compareLeftMeasurePositions : compareRightMeasurePositions;
      const wrapperRef = side === 'left' ? compareLeftWrapperRef : compareRightWrapperRef;
      const measureIndex = hitTestMeasure(
        positions,
        event.clientX,
        event.clientY,
        wrapperRef,
        compareEffectiveZoom,
      );
      if (measureIndex < 0) return;

      if (isChangeReviewCompareMode) {
        const crSide = compareSwapped
          ? side === 'left'
            ? 'head'
            : 'base'
          : side === 'left'
            ? 'base'
            : 'head';
        let clickedPartIndex = 0;
        if (comparePartCount > 1 && wrapperRef.current && positions) {
          const el = positions.elements[measureIndex];
          if (el) {
            const h = typeof el.sy === 'number' ? el.sy : (el.height ?? 0);
            const pageHeight = positions.pageSize?.height ?? 0;
            const needsPageOffset = pageHeight > 0 && el.page > 0 && el.y + h <= pageHeight * 1.2;
            const pageOffset = needsPageOffset ? el.page * pageHeight : 0;
            const rect = wrapperRef.current.getBoundingClientRect();
            const scoreY = (event.clientY - rect.top) / compareEffectiveZoom;
            const relativeY = scoreY - (el.y + pageOffset);
            clickedPartIndex = Math.min(
              Math.max(Math.floor((relativeY / h) * comparePartCount), 0),
              comparePartCount - 1,
            );
          }
        }
        const region = changeReviewDiff?.scoreRegions.find(
          (r) =>
            r.partIndex === clickedPartIndex &&
            (crSide === 'base'
              ? r.baseMeasureIndex === measureIndex
              : r.headMeasureIndex === measureIndex),
        );
        const bar = changeReviewDiff?.bars.find(
          (candidate) =>
            candidate.side === crSide &&
            candidate.partIndex === clickedPartIndex &&
            candidate.measureIndex === measureIndex,
        );
        const nextAnchorId = region?.anchorId ?? bar?.anchorId;
        if (!nextAnchorId) return;
        const toggling = changeReviewFocusedAnchorId === nextAnchorId;

        // Compute the measure indices for the blue highlight on both sides
        let leftIndex: number | null = null;
        let rightIndex: number | null = null;
        const focusedPartIndex: number | null =
          region?.partIndex ?? bar?.partIndex ?? clickedPartIndex;
        if (!toggling) {
          if (region) {
            const baseIdx = region.baseMeasureIndex ?? null;
            const headIdx = region.headMeasureIndex ?? null;
            leftIndex = compareSwapped ? headIdx : baseIdx;
            rightIndex = compareSwapped ? baseIdx : headIdx;
          } else {
            // Unchanged bar: use alignment to find the partner index
            leftIndex = side === 'left' ? measureIndex : null;
            rightIndex = side === 'right' ? measureIndex : null;
            const alignment = compareAlignmentByPart.get(clickedPartIndex);
            if (alignment) {
              for (const row of alignment.rows) {
                const rowIdx = side === 'left' ? row.leftIndex : row.rightIndex;
                if (rowIdx === measureIndex) {
                  leftIndex = row.leftIndex ?? null;
                  rightIndex = row.rightIndex ?? null;
                  break;
                }
              }
            }
          }
        }

        setCompareClickedMeasures(
          toggling ? null : { leftIndex, rightIndex, partIndex: focusedPartIndex },
        );
        setChangeReviewFocusedAnchorId(toggling ? null : nextAnchorId);

        if (!toggling) {
          const existingThread = changeReviewThreadsByAnchor.get(nextAnchorId);
          if (!existingThread && changeReviewDetail?.permissions.canAddThread) {
            setChangeReviewNewThreadAnchorId(nextAnchorId);
            setChangeReviewNewThreadContent('');
          } else {
            setChangeReviewNewThreadAnchorId(null);
            setChangeReviewNewThreadContent('');
          }
          requestAnimationFrame(() => {
            compareGutterRegionRefs.current
              .get(nextAnchorId)
              ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          });
        }
        return;
      }

      if (isAiCompareMode) {
        // Anchor an ephemeral measure-level thread at the clicked measure (toggle on repeat).
        let clickedPartIndex = 0;
        if (comparePartCount > 1 && wrapperRef.current && positions) {
          const el = positions.elements[measureIndex];
          if (el) {
            const h = typeof el.sy === 'number' ? el.sy : (el.height ?? 0);
            const pageHeight = positions.pageSize?.height ?? 0;
            const needsPageOffset = pageHeight > 0 && el.page > 0 && el.y + h <= pageHeight * 1.2;
            const pageOffset = needsPageOffset ? el.page * pageHeight : 0;
            const rect = wrapperRef.current.getBoundingClientRect();
            const scoreY = (event.clientY - rect.top) / compareEffectiveZoom;
            const relativeY = scoreY - (el.y + pageOffset);
            clickedPartIndex = Math.min(
              Math.max(Math.floor((relativeY / h) * comparePartCount), 0),
              comparePartCount - 1,
            );
          }
        }
        let leftIndex: number | null = side === 'left' ? measureIndex : null;
        let rightIndex: number | null = side === 'right' ? measureIndex : null;
        const alignment = compareAlignmentByPart.get(clickedPartIndex);
        if (alignment) {
          for (const row of alignment.rows) {
            const rowIdx = side === 'left' ? row.leftIndex : row.rightIndex;
            if (rowIdx === measureIndex) {
              leftIndex = row.leftIndex ?? null;
              rightIndex = row.rightIndex ?? null;
              break;
            }
          }
        }
        // Anchor on the base/current (left) measure number so it matches the numbering the
        // AI uses in its patch/annotations (which target the current XML). Falls back to the
        // proposal index only for inserted measures that have no base counterpart.
        const measureNumber = (leftIndex ?? rightIndex ?? measureIndex) + 1;
        const key = `${clickedPartIndex}:m${measureNumber}`;
        setAiFocusedMeasureAnchor((prev) =>
          prev?.key === key
            ? null
            : { key, partIndex: clickedPartIndex, measureNumber, leftIndex, rightIndex },
        );
        setAiMeasureThreadDraft('');
        return;
      }

      // Plain compare mode: focus the gutter block that contains this measure
      for (const [partIndex, alignment] of compareAlignmentByPart) {
        const blocks = buildMismatchBlocks(alignment.rows);
        for (let bi = 0; bi < blocks.length; bi++) {
          const block = blocks[bi];
          const rows = alignment.rows.slice(block.start, block.end + 1);
          const indices = rows
            .map((r) => (side === 'left' ? r.leftIndex : r.rightIndex))
            .filter((v): v is number => v !== null);
          if (!indices.includes(measureIndex)) continue;
          const rightIndices = rows.map((r) => r.rightIndex).filter((v): v is number => v !== null);
          const leftIndices = rows.map((r) => r.leftIndex).filter((v): v is number => v !== null);
          const rStart = rightIndices[0];
          const rEnd = rightIndices[rightIndices.length - 1];
          const lStart = leftIndices[0];
          const lEnd = leftIndices[leftIndices.length - 1];
          const primaryStart = rightIndices.length ? rStart : lStart;
          const primaryEnd = rightIndices.length ? rEnd : lEnd;
          const measureRange =
            primaryStart !== undefined
              ? `${primaryStart + 1}${primaryEnd !== primaryStart ? `-${primaryEnd + 1}` : ''}`
              : `${bi}:${lStart ?? 'x'}:${lEnd ?? 'x'}:${rStart ?? 'x'}:${rEnd ?? 'x'}`;
          const blockKey = `${partIndex}:${measureRange}`;
          setCompareFocusedBlockKey((prev) => (prev === blockKey ? null : blockKey));
          return;
        }
      }
    },
    [
      compareLeftMeasurePositions,
      compareRightMeasurePositions,
      compareLeftWrapperRef,
      compareRightWrapperRef,
      compareEffectiveZoom,
      hitTestMeasure,
      isChangeReviewCompareMode,
      isAiCompareMode,
      compareSwapped,
      comparePartCount,
      changeReviewDiff,
      changeReviewFocusedAnchorId,
      changeReviewThreadsByAnchor,
      changeReviewDetail,
      compareAlignmentByPart,
      buildMismatchBlocks,
    ],
  );

  const compareGutterRowHeight = 56;
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
        const rawHeight =
          typeof element.sy === 'number'
            ? element.sy
            : typeof element.height === 'number'
              ? element.height
              : 0;
        const needsPageOffset =
          pageHeight > 0 && element.page > 0 && element.y + rawHeight <= pageHeight * 1.2;
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
      const rawHeight =
        typeof element.sy === 'number'
          ? element.sy
          : typeof element.height === 'number'
            ? element.height
            : 0;
      const needsPageOffset =
        pageHeight > 0 && element.page > 0 && element.y + rawHeight <= pageHeight * 1.2;
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
    const leftCount =
      compareLeftMeasurePositions?.elements.length ??
      Math.max(0, ...compareAlignments.map((alignment) => alignment.leftCount));
    const rightCount =
      compareRightMeasurePositions?.elements.length ??
      Math.max(0, ...compareAlignments.map((alignment) => alignment.rightCount));
    const leftMismatch = Array.from({ length: leftCount }, () => false);
    const rightMismatch = Array.from({ length: rightCount }, () => false);

    // Keep the part axis. Collapsing every part into one flag per measure is why
    // checkpoint and AI compare highlighted a whole system when a single staff changed.
    const leftParts: Array<{ partIndex: number; measureIndex: number }> = [];
    const rightParts: Array<{ partIndex: number; measureIndex: number }> = [];

    compareAlignments.forEach((alignment) => {
      const partIndex = alignment.partIndex;
      alignment.rows.forEach((row) => {
        if (!row.match) {
          if (row.leftIndex !== null && row.leftIndex >= 0 && row.leftIndex < leftMismatch.length) {
            leftMismatch[row.leftIndex] = true;
            leftParts.push({ partIndex, measureIndex: row.leftIndex });
          }
          if (
            row.rightIndex !== null &&
            row.rightIndex >= 0 &&
            row.rightIndex < rightMismatch.length
          ) {
            rightMismatch[row.rightIndex] = true;
            rightParts.push({ partIndex, measureIndex: row.rightIndex });
          }
        }
      });
    });

    return {
      left: leftMismatch.map((value) => (value ? 'old-diff' : null)),
      right: rightMismatch.map((value) => (value ? 'new-diff' : null)),
      leftParts,
      rightParts,
    };
  }, [compareAlignments, compareLeftMeasurePositions, compareRightMeasurePositions]);
  const compareLeftHighlights = useMemo(
    () =>
      isSuppliedRegionsMode
        ? buildPartLocalizedSuppliedHighlights(
            compareLeftMeasurePositions,
            suppliedRegions || [],
            'left',
            compareEffectiveZoom,
            comparePartCount,
            compareLeftStaffBands,
          )
        : isChangeReviewCompareMode
          ? buildPartLocalizedChangeReviewHighlights(
              compareLeftMeasurePositions,
              changeReviewDiff?.scoreRegions || [],
              'base',
              compareEffectiveZoom,
              comparePartCount,
              compareLeftStaffBands,
            )
          : buildPartLocalizedAlignmentHighlights(
              compareLeftMeasurePositions,
              compareMeasureStatuses.leftParts,
              'old-diff',
              compareEffectiveZoom,
              comparePartCount,
              compareLeftStaffBands,
            ),
    [
      changeReviewDiff,
      compareLeftMeasurePositions,
      compareLeftStaffBands,
      compareMeasureStatuses.leftParts,
      compareEffectiveZoom,
      comparePartCount,
      isChangeReviewCompareMode,
      isSuppliedRegionsMode,
      suppliedRegions,
    ],
  );
  const compareRightHighlights = useMemo(
    () =>
      isSuppliedRegionsMode
        ? buildPartLocalizedSuppliedHighlights(
            compareRightMeasurePositions,
            suppliedRegions || [],
            'right',
            compareEffectiveZoom,
            comparePartCount,
            compareRightStaffBands,
          )
        : isChangeReviewCompareMode
          ? buildPartLocalizedChangeReviewHighlights(
              compareRightMeasurePositions,
              changeReviewDiff?.scoreRegions || [],
              'head',
              compareEffectiveZoom,
              comparePartCount,
              compareRightStaffBands,
            )
          : buildPartLocalizedAlignmentHighlights(
              compareRightMeasurePositions,
              compareMeasureStatuses.rightParts,
              'new-diff',
              compareEffectiveZoom,
              comparePartCount,
              compareRightStaffBands,
            ),
    [
      changeReviewDiff,
      compareRightMeasurePositions,
      compareRightStaffBands,
      compareMeasureStatuses.rightParts,
      compareEffectiveZoom,
      comparePartCount,
      isChangeReviewCompareMode,
      isSuppliedRegionsMode,
      suppliedRegions,
    ],
  );
  const compareCommentedLeftHighlights = useMemo(() => {
    if (isChangeReviewCompareMode || isAiCompareMode) return [];
    // The block key is `${partIndex}:${measureRange}`, so a note's part is recoverable
    // and its highlight can sit on that staff rather than across the whole system.
    const entries: Array<{ partIndex: number; measureIndex: number }> = [];
    Object.entries(compareBlockComments).forEach(([blockKey, block]) => {
      if (!block.comment.trim()) return;
      const partIndex = Number.parseInt(blockKey.split(':')[0] ?? '', 10);
      if (!Number.isFinite(partIndex)) return;
      block.leftIndices.forEach((measureIndex) => entries.push({ partIndex, measureIndex }));
    });
    if (!entries.length) return [];
    return buildPartLocalizedAlignmentHighlights(
      compareLeftMeasurePositions,
      entries,
      'commented',
      compareEffectiveZoom,
      comparePartCount,
      compareLeftStaffBands,
    );
  }, [
    compareBlockComments,
    compareLeftMeasurePositions,
    compareLeftStaffBands,
    compareEffectiveZoom,
    comparePartCount,
    isChangeReviewCompareMode,
    isAiCompareMode,
  ]);
  const compareCommentedRightHighlights = useMemo(() => {
    if (isChangeReviewCompareMode || isAiCompareMode) return [];
    // The block key is `${partIndex}:${measureRange}`, so a note's part is recoverable
    // and its highlight can sit on that staff rather than across the whole system.
    const entries: Array<{ partIndex: number; measureIndex: number }> = [];
    Object.entries(compareBlockComments).forEach(([blockKey, block]) => {
      if (!block.comment.trim()) return;
      const partIndex = Number.parseInt(blockKey.split(':')[0] ?? '', 10);
      if (!Number.isFinite(partIndex)) return;
      block.rightIndices.forEach((measureIndex) => entries.push({ partIndex, measureIndex }));
    });
    if (!entries.length) return [];
    return buildPartLocalizedAlignmentHighlights(
      compareRightMeasurePositions,
      entries,
      'commented',
      compareEffectiveZoom,
      comparePartCount,
      compareRightStaffBands,
    );
  }, [
    compareBlockComments,
    compareRightMeasurePositions,
    compareRightStaffBands,
    compareEffectiveZoom,
    comparePartCount,
    isChangeReviewCompareMode,
    isAiCompareMode,
  ]);
  const compareThreadedLeftHighlights = useMemo(() => {
    if (!isChangeReviewCompareMode) return [];
    return buildPartLocalizedChangeReviewBarHighlights(
      compareLeftMeasurePositions,
      (changeReviewDiff?.bars || []).filter((bar) => changeReviewThreadsByAnchor.has(bar.anchorId)),
      compareSwapped ? 'head' : 'base',
      compareEffectiveZoom,
      comparePartCount,
      compareLeftStaffBands,
    );
  }, [
    changeReviewDiff,
    changeReviewThreadsByAnchor,
    compareEffectiveZoom,
    compareLeftMeasurePositions,
    compareLeftStaffBands,
    comparePartCount,
    compareSwapped,
    isChangeReviewCompareMode,
  ]);
  const compareThreadedRightHighlights = useMemo(() => {
    if (!isChangeReviewCompareMode) return [];
    return buildPartLocalizedChangeReviewBarHighlights(
      compareRightMeasurePositions,
      (changeReviewDiff?.bars || []).filter((bar) => changeReviewThreadsByAnchor.has(bar.anchorId)),
      compareSwapped ? 'base' : 'head',
      compareEffectiveZoom,
      comparePartCount,
      compareRightStaffBands,
    );
  }, [
    changeReviewDiff,
    changeReviewThreadsByAnchor,
    compareEffectiveZoom,
    comparePartCount,
    compareRightMeasurePositions,
    compareRightStaffBands,
    compareSwapped,
    isChangeReviewCompareMode,
  ]);
  /**
   * Load each pane's staff bands from its own score.
   *
   * Keyed on layout inputs, not zoom: bands are page-space, so zoom is applied at render
   * time and reloading per zoom step would be wasted engine work. Sequential rather than
   * Promise.all because both scores live in one WASM instance.
   */
  useEffect(() => {
    if (!compareView) {
      setCompareLeftStaffBands(EMPTY_STAFF_BANDS);
      setCompareRightStaffBands(EMPTY_STAFF_BANDS);
      return;
    }
    let cancelled = false;
    void (async () => {
      const left = await loadStaffBands(compareLeftScore);
      if (cancelled) {
        return;
      }
      const right = await loadStaffBands(compareRightScoreDisplay);
      if (cancelled) {
        return;
      }
      setCompareLeftStaffBands(left);
      setCompareRightStaffBands(right);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    compareLeftScore,
    compareLeftMeasurePositions,
    compareRightScoreDisplay,
    compareRightMeasurePositions,
    compareView,
  ]);

  /**
   * Vertical extent of one part's bar in a pane, in the same zoomed space as the gutter's
   * measure bounds. Single geometry rule for panes and gutter alike; null when the engine
   * gave no bands, which leaves the caller on the even-split fallback.
   */
  const compareResolvePartBounds = useCallback(
    (
      side: 'left' | 'right',
      measureIndex: number,
      partIndex: number,
    ): { top: number; height: number } | null => {
      const positions =
        side === 'left' ? compareLeftMeasurePositions : compareRightMeasurePositions;
      const staffBands = side === 'left' ? compareLeftStaffBands : compareRightStaffBands;
      const element = positions?.elements[measureIndex];
      if (!element || !staffBands.bands.length || comparePartCount <= 0) {
        return null;
      }
      const rect = localizeMeasureToPart(
        element,
        partIndex,
        comparePartCount,
        positions?.pageSize?.height ?? 0,
        compareEffectiveZoom,
        staffBands,
      );
      return rect.geometry === 'staff' ? { top: rect.top, height: rect.height } : null;
    },
    [
      compareEffectiveZoom,
      compareLeftMeasurePositions,
      compareLeftStaffBands,
      comparePartCount,
      compareRightMeasurePositions,
      compareRightStaffBands,
    ],
  );

  const compareFocusedHighlights = useMemo((): {
    left: { left: number; top: number; width: number; height: number } | null;
    right: { left: number; top: number; width: number; height: number } | null;
  } => {
    const nullResult = { left: null, right: null };
    const focus =
      isChangeReviewCompareMode && changeReviewFocusedAnchorId && compareClickedMeasures
        ? compareClickedMeasures
        : isAiCompareMode && aiFocusedMeasureAnchor
          ? {
              leftIndex: aiFocusedMeasureAnchor.leftIndex,
              rightIndex: aiFocusedMeasureAnchor.rightIndex,
              partIndex: aiFocusedMeasureAnchor.partIndex,
            }
          : null;
    if (!focus) return nullResult;
    const pIdx = focus.partIndex;
    const nParts = pIdx !== null && comparePartCount > 1 ? comparePartCount : 1;
    const getBox = (positions: Positions | null, measureIndex: number | null) => {
      if (measureIndex == null || !positions?.elements.length) return null;
      const el = positions.elements[measureIndex];
      if (!el) return null;
      const w = typeof el.sx === 'number' ? el.sx : (el.width ?? 0);
      const h = typeof el.sy === 'number' ? el.sy : (el.height ?? 0);
      const pageHeight = positions.pageSize?.height ?? 0;
      const needsPageOffset = pageHeight > 0 && el.page > 0 && el.y + h <= pageHeight * 1.2;
      const pageOffset = needsPageOffset ? el.page * pageHeight : 0;
      const partH = h / nParts;
      const partOffset = pIdx !== null ? pIdx * partH : 0;
      return {
        left: el.x * compareEffectiveZoom,
        top: (el.y + pageOffset + partOffset) * compareEffectiveZoom,
        width: w * compareEffectiveZoom,
        height: partH * compareEffectiveZoom,
      };
    };
    return {
      left: getBox(compareLeftMeasurePositions, focus.leftIndex),
      right: getBox(compareRightMeasurePositions, focus.rightIndex),
    };
  }, [
    isChangeReviewCompareMode,
    changeReviewFocusedAnchorId,
    compareClickedMeasures,
    isAiCompareMode,
    aiFocusedMeasureAnchor,
    comparePartCount,
    compareLeftMeasurePositions,
    compareRightMeasurePositions,
    compareEffectiveZoom,
  ]);
  useEffect(() => {
    if (!isChangeReviewSingleScoreMode || !score) {
      setChangeReviewMeasurePositions(null);
      return;
    }
    void refreshMeasurePositions(score, setChangeReviewMeasurePositions);
  }, [currentPage, isChangeReviewSingleScoreMode, refreshMeasurePositions, score, scoreRevision]);
  const changeReviewBarBoxes = useMemo(() => {
    if (!changeReviewMeasurePositions?.elements.length || !changeReviewScoreView) {
      return [];
    }
    const partCount = Math.max(
      scoreParts.length,
      ...changeReviewScoreView.bars.map((bar) => bar.partIndex + 1),
      1,
    );
    return changeReviewScoreView.bars.flatMap((bar) => {
      const element = changeReviewMeasurePositions.elements[bar.measureIndex];
      if (!element || element.page !== currentPage) {
        return [];
      }
      const width =
        typeof element.sx === 'number'
          ? element.sx
          : typeof (element as { width?: number }).width === 'number'
            ? (element as { width?: number }).width!
            : 0;
      const height =
        typeof element.sy === 'number'
          ? element.sy
          : typeof (element as { height?: number }).height === 'number'
            ? (element as { height?: number }).height!
            : 0;
      const partHeight = height / partCount;
      return [
        {
          bar,
          left: element.x,
          top: element.y + partHeight * bar.partIndex,
          width,
          height: partHeight,
        },
      ];
    });
  }, [changeReviewMeasurePositions, changeReviewScoreView, currentPage, scoreParts.length]);
  const changeReviewGutterBars = useMemo(
    () =>
      changeReviewBarBoxes
        .filter(
          ({ bar }) =>
            bar.anchorId === changeReviewFocusedAnchorId ||
            changeReviewThreadsByAnchor.has(bar.anchorId),
        )
        .sort((a, b) => a.top - b.top || a.bar.partIndex - b.bar.partIndex),
    [changeReviewBarBoxes, changeReviewFocusedAnchorId, changeReviewThreadsByAnchor],
  );

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
      return {
        staves: 2,
        clefs: [
          { staff: 1, clef: 'G' },
          { staff: 2, clef: 'F' },
        ],
      };
    }
    if (lowerName.includes('viola')) {
      return { staves: 1, clefs: [{ staff: 1, clef: 'C3' }] };
    }
    if (
      lowerName.includes('cello') ||
      lowerName.includes('contrabass') ||
      lowerName.includes('double bass') ||
      lowerName.includes('tuba') ||
      lowerName.includes('bassoon')
    ) {
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
      1: 'whole',
      2: 'half',
      4: 'quarter',
      8: 'eighth',
      16: '16th',
      32: '32nd',
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
    const measureDuration = Math.round(
      (divisions * 4 * options.timeNumerator) / options.timeDenominator,
    );
    const partsXml = options.instruments.map((instrument, index) => {
      const partId = `P${index + 1}`;
      const rawName = instrument.name.trim() || 'Instrument';
      const instrumentName = escapeXml(rawName);
      const clefSpec = resolveInstrumentClefs(instrument.id, rawName);
      const staves = Math.max(clefSpec.staves || 1, clefSpec.clefs.length || 1);
      const clefXml = clefSpec.clefs
        .map((clefEntry) => {
          const mapEntry = clefCodeMap[clefEntry.clef] ?? clefCodeMap.G;
          const staffAttr = staves > 1 ? ` number="${clefEntry.staff}"` : '';
          const octave = mapEntry.octave
            ? `\n        <clef-octave-change>${mapEntry.octave}</clef-octave-change>`
            : '';
          return `        <clef${staffAttr}>\n          <sign>${mapEntry.sign}</sign>\n          <line>${mapEntry.line}</line>${octave}\n        </clef>`;
        })
        .join('\n');
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
        const attributes = measureIndex === 0 && !hasPickup ? fullAttributesXml : '';
        const notesXml = Array.from({ length: staves }, (_, staffIndex) => {
          const staffNumber = staffIndex + 1;
          const voice = staffIndex * 4 + 1;
          const backup =
            staffIndex > 0
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
        const pickupDuration = Math.round(
          (divisions * 4 * options.pickup.numerator) / options.pickup.denominator,
        );
        const pickupRestType = pickupDurationToRestType(
          options.pickup.numerator,
          options.pickup.denominator,
        );
        const pickupNotesXml = Array.from({ length: staves }, (_, staffIndex) => {
          const staffNumber = staffIndex + 1;
          const voice = staffIndex * 4 + 1;
          const backup =
            staffIndex > 0
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

  const decodeXmlData = useCallback(
    async (data: unknown): Promise<string | null> => {
      const normalized = await normalizeXmlData(data);
      if (!normalized) {
        return null;
      }
      return new TextDecoder().decode(normalized);
    },
    [normalizeXmlData],
  );

  const getScoreMusicXmlText = useCallback(
    async (targetScore: Score | null, fallbackXml: string | null) => {
      if (!targetScore?.saveXml) {
        return fallbackXml;
      }
      try {
        const data = await runSerializedScoreOperation(() => targetScore.saveXml!(), 'saveXml');
        const decoded = await decodeXmlData(data);
        return decoded ?? fallbackXml;
      } catch (err) {
        console.warn('Failed to export MusicXML from score:', err);
        return fallbackXml;
      }
    },
    [decodeXmlData, runSerializedScoreOperation],
  );

  const getScoreXmlData = useCallback(async () => {
    const activeScore = scoreRef.current ?? score;
    if (!activeScore?.saveXml) {
      alert('This build of webmscore does not expose "saveXml".');
      return null;
    }
    const data = await runSerializedScoreOperation(() => activeScore.saveXml!(), 'saveXml');
    return await normalizeXmlData(data);
  }, [score, normalizeXmlData, runSerializedScoreOperation]);

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

  const getScoreMscxText = useCallback(
    async (targetScore: Score) => {
      if (!targetScore?.saveMsc) {
        return null;
      }
      const data = await targetScore.saveMsc('mscx');
      return await decodeXmlData(data);
    },
    [decodeXmlData],
  );

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

  const openScoreSession = useCallback(
    async (xml?: string) => {
      if (isSyncingRef.current) {
        return { scoreSessionId, revision: scoreRevision };
      }

      let nextSessionId = scoreSessionId;
      let nextRevision = scoreRevision;
      try {
        const content = xml || (await resolveXmlContext());
        if (!content.trim()) {
          return { scoreSessionId: nextSessionId, revision: nextRevision };
        }

        // Skip if content and revision haven't changed since last successful sync
        if (
          content === lastSyncedXmlRef.current &&
          scoreRevision === lastSyncedRevisionRef.current
        ) {
          return { scoreSessionId: nextSessionId, revision: nextRevision };
        }

        isSyncingRef.current = true;
        const isSync = Boolean(scoreSessionId);
        const endpoint = isSync ? '/api/music/scoreops/sync' : '/api/music/scoreops/session/open';
        const body: {
          content: string;
          scoreMeta?: { launchContext: EditorLaunchContext };
          scoreSessionId?: string;
          baseRevision?: number;
        } = { content };
        if (activeLaunchContext) {
          body.scoreMeta = {
            launchContext: activeLaunchContext,
          };
        }
        if (scoreSessionId) {
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
            console.info(
              `[session] ${isSync ? 'Synced' : 'Opened'} score session: ${result.scoreSessionId}, revision: ${nextRev}`,
            );
          }
        }
      } catch (err) {
        console.warn('[session] Failed to open/sync score session:', err);
      } finally {
        isSyncingRef.current = false;
      }
      return { scoreSessionId: nextSessionId, revision: nextRevision };
    },
    [activeLaunchContext, resolveXmlContext, scoreSessionId, scoreRevision],
  );

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

  const parseMusicXmlPatch = useCallback(
    (
      text: string,
    ): {
      patch: MusicXmlPatch | null;
      annotations?: PatchAnnotation[];
      error: string;
    } => {
      if (!text.trim()) {
        return { patch: null as MusicXmlPatch | null, error: 'AI response is empty.' };
      }
      let parsedValue: unknown;
      try {
        parsedValue = JSON.parse(text);
      } catch {
        return { patch: null, error: 'AI response is not valid JSON.' };
      }
      const parsed = asRecord(parsedValue);
      if (!parsed || parsed.format !== 'musicxml-patch@1' || !Array.isArray(parsed.ops)) {
        return { patch: null, error: 'AI response is not a musicxml-patch@1 payload.' };
      }
      const ops: MusicXmlPatchOp[] = [];
      const allowedOps = new Set([
        'replace',
        'setText',
        'setAttr',
        'insertBefore',
        'insertAfter',
        'delete',
      ]);
      const analyzeXmlFragmentShape = (value: string) => {
        const tokenPattern =
          /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<![^>]*>|<\/?[^>]+?>|[^<]+/g;
        const tokens = value.match(tokenPattern) || [];
        let depth = 0;
        let topLevelElementCount = 0;
        let hasTopLevelText = false;
        let unbalancedTags = false;
        for (const token of tokens) {
          if (!token) {
            continue;
          }
          if (
            token.startsWith('<!--') ||
            token.startsWith('<?') ||
            (token.startsWith('<!') && !token.startsWith('<![CDATA['))
          ) {
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
        const op = asRecord(parsed.ops[i]);
        if (!op) {
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
        if (
          opName === 'setText' ||
          opName === 'replace' ||
          opName === 'insertBefore' ||
          opName === 'insertAfter'
        ) {
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
              return {
                patch: null,
                error: `Patch op ${i + 1} ${opName} value has unbalanced XML tags.`,
              };
            }
            if (shape.hasTopLevelText) {
              return {
                patch: null,
                error: `Patch op ${i + 1} ${opName} value has top-level text; it must contain exactly one XML element.`,
              };
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
      return {
        patch: { format: 'musicxml-patch@1', ops },
        annotations: extractPatchAnnotations(parsed),
        error: '',
      };
    },
    [],
  );

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
      const elementChildren = Array.from(wrapper.childNodes).filter(
        (node) => node.nodeType === Node.ELEMENT_NODE,
      );
      const textChildren = Array.from(wrapper.childNodes).filter(
        (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim(),
      );
      if (elementChildren.length !== 1 || textChildren.length > 0) {
        return { node: null, error: 'Patch value must contain exactly one element.' };
      }
      const imported = doc.importNode(elementChildren[0], true);
      return { node: imported, error: '' };
    };
    const resolveNodes = (path: string) => {
      try {
        const result = doc.evaluate(
          path,
          doc,
          resolver,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
          null,
        );
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
      } catch {
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
            current.nodeType === Node.ELEMENT_NODE &&
            (current as Element).tagName === 'measure' &&
            segment === 'attributes'
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
      if (error || nodes.length === 0) {
        return { xml: '', error: `Patch op ${i + 1} failed: ${error || 'Target not found.'}` };
      }
      if (nodes.length !== 1) {
        return {
          xml: '',
          error: `Patch op ${i + 1} failed: XPath "${op.path}" matched ${nodes.length} nodes.`,
        };
      }
      const node = nodes[0];
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
        return {
          xml: '',
          error: `Patch op ${i + 1} failed: ${fragment.error || 'Invalid value.'}`,
        };
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
      const buffer = toOwnedArrayBuffer(currentData);
      const title = buildCheckpointTitle('', 'Auto checkpoint');
      await saveCheckpoint({
        title,
        createdAt: Date.now(),
        format: 'musicxml',
        data: buffer,
        size: currentData.byteLength,
        scoreId: activeScoreId,
        ...buildCheckpointMetadata(),
      });
      setScoreDirtySinceCheckpoint(false);
      await loadCheckpointList();
    }
    return { ok: true, currentXml };
  };

  const applyXmlToScore: ApplyXmlToScore = async (sourceXml, options) => {
    if (!score) {
      alert('Load a score before applying XML edits.');
      return false;
    }
    if (!sourceXml.trim()) {
      alert('XML content is empty.');
      return false;
    }
    const checkpointState = await ensureCheckpointBeforeApply();
    if (!checkpointState.ok) {
      return false;
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
    return applied;
  };
  applyXmlToScoreRef.current = applyXmlToScore;

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
      if (scoreId && !items.some((item) => item.scoreId === scoreId)) {
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

  const loadCheckpointList = useCallback(
    async (targetScoreId?: string) => {
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
    },
    [scoreId, loadScoreSummaryList],
  );

  const refreshSourceHistory = useCallback(
    async (branchNameOverride?: string) => {
      if (!otsSourceContext) {
        setSourceHistory(null);
        return;
      }
      setVersionsLoading(true);
      try {
        const nextHistory = await getSourceHistory({
          workId: otsSourceContext.workId,
          sourceId: otsSourceContext.sourceId,
          branch: branchNameOverride ?? versionsBranchName,
          limit: 100,
        });
        setSourceHistory(nextHistory);
        setVersionsError(null);
        if (
          nextHistory.selectedBranch?.name &&
          nextHistory.selectedBranch.name !== versionsBranchName
        ) {
          setVersionsBranchName(nextHistory.selectedBranch.name);
        }
      } catch (err) {
        console.warn('Failed to load OurTextScores source history', err);
        setSourceHistory(null);
        setVersionsError(errorMessage(err) || 'Unable to load versions.');
      } finally {
        setVersionsLoading(false);
      }
    },
    [otsSourceContext, versionsBranchName],
  );

  const resolveVersionsTargetRevisionId = useCallback(() => {
    const selectedBranch = sourceHistory?.selectedBranch;
    return (
      selectedBranch?.headRevisionId ||
      selectedBranch?.baseRevisionId ||
      otsSourceContext?.revisionId ||
      activeLaunchContext?.revisionId ||
      undefined
    );
  }, [sourceHistory, otsSourceContext, activeLaunchContext]);

  const buildCheckpointMetadata = useCallback(
    (overrides?: { branchName?: string; upstreamRevisionId?: string; baseRevisionId?: string }) => {
      if (
        activeLaunchContext?.source !== 'ourtextscores' ||
        !activeLaunchContext.workId ||
        !activeLaunchContext.sourceId
      ) {
        return {};
      }
      return {
        upstreamKind: 'ourtextscores' as const,
        workId: activeLaunchContext.workId,
        sourceId: activeLaunchContext.sourceId,
        branchName:
          overrides?.branchName ?? versionsBranchName ?? activeLaunchContext.branchName ?? 'trunk',
        baseRevisionId: overrides?.baseRevisionId ?? activeLaunchContext.revisionId,
        upstreamRevisionId: overrides?.upstreamRevisionId ?? activeLaunchContext.revisionId,
      };
    },
    [activeLaunchContext, versionsBranchName],
  );

  const createInitialLoadCheckpoint = useCallback(
    async (loadedScore: Score, preferredScoreId?: string) => {
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
          data: toOwnedArrayBuffer(xmlData),
          size: xmlData.byteLength,
          scoreId: activeScoreId,
          ...buildCheckpointMetadata(),
        });

        await loadCheckpointList(activeScoreId);
        setScoreDirtySinceCheckpoint(false);
      } catch (err) {
        console.warn('Failed to create initial load checkpoint', err);
      }
    },
    [
      buildCheckpointMetadata,
      ensureScoreId,
      loadCheckpointList,
      normalizeXmlData,
      runSerializedScoreOperation,
    ],
  );

  const exposeScoreToWindow = (s: Score | null) => {
    // Debug handle for Playwright and console sessions to poke at WASM bindings
    // directly. Nothing in the product reads it, so a production build should not
    // carry it: a live Score handle on `window` widens what injected script can
    // reach (SECURITY_CORRECTNESS_FINDINGS L2, and M3/M4's blast radius) in exchange
    // for a convenience only developers use.
    //
    // The deterministic browser matrix runs against `next dev`, so the 37 specs that
    // read it are unaffected. The embed integration suite is the one that runs against
    // a production build, and it does not use the handle.
    if (process.env.NODE_ENV === 'production') {
      return;
    }
    if (typeof window !== 'undefined') {
      (window as Window & { __webmscore?: Score | null }).__webmscore = s;
    }
  };

  useEffect(() => {
    void loadCheckpointList();
  }, [loadCheckpointList]);

  useEffect(() => {
    void loadScoreSummaryList();
  }, [loadScoreSummaryList]);

  useEffect(() => {
    if (!otsSourceContext) {
      return;
    }
    void refreshSourceHistory();
  }, [otsSourceContext, versionsBranchName, refreshSourceHistory]);

  useEffect(() => {
    if (!versionsSelectedBaseRevisionId) {
      return;
    }
    const stillVisible = sourceHistory?.revisions.some(
      (revision) => revision.revisionId === versionsSelectedBaseRevisionId,
    );
    if (!stillVisible) {
      setVersionsSelectedBaseRevisionId(null);
    }
  }, [sourceHistory, versionsSelectedBaseRevisionId]);

  useEffect(() => {
    const paramScoreId = searchParams.get('scoreId');
    const urlScore = searchParams.get('score');
    const nextScoreId = paramScoreId || (urlScore ? `url:${urlScore}` : '');
    if (nextScoreId && nextScoreId !== scoreId) {
      setScoreId(nextScoreId);
    }
  }, [searchParams, scoreId]);

  useEffect(() => {
    if (!otsSourceContext) {
      setSourceHistory(null);
      setVersionsError(null);
      setVersionsLoading(false);
      setVersionsActionBusy(false);
      setVersionsActionError(null);
      setVersionsActionNotice(null);
      setVersionsSelectedBaseRevisionId(null);
      setVersionsCommitMessage('');
      setVersionsCreateBranchName('');
      setVersionsCreateBranchPolicy('public');
      if (leftSidebarTab === 'versions') {
        setLeftSidebarTab('checkpoints');
      }
      return;
    }
    setVersionsBranchName(otsSourceContext.branchName || 'trunk');
    setVersionsSelectedBaseRevisionId(null);
    if (!scoreId) {
      const nextScoreId = buildOtsScoreId(otsSourceContext.workId, otsSourceContext.sourceId);
      setScoreId(nextScoreId);
      updateUrlScoreId(nextScoreId);
    }
  }, [leftSidebarTab, otsSourceContext, scoreId]);

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
    const needsXmlForSidebarTab =
      (xmlSidebarTab === 'assistant' && aiIncludeXml) ||
      xmlSidebarTab === 'notagen' ||
      xmlSidebarTab === 'harmony' ||
      xmlSidebarTab === 'functional' ||
      xmlSidebarTab === 'mma';
    if (needsXmlForSidebarTab && !xmlText.trim()) {
      void loadXmlFromScore();
    }
  }, [xmlSidebarTab, aiIncludeXml, xmlText, loadXmlFromScore]);

  const selectedAiModelDescriptor = useMemo(() => {
    const discovered = aiModelDescriptors.find(
      (descriptor) =>
        descriptor.provider === aiProvider &&
        descriptor.id === aiModel.trim().replace(/^models\//, ''),
    );
    return discovered ?? resolveAiModelDescriptor(aiProvider, aiModel);
  }, [aiModel, aiModelDescriptors, aiProvider]);
  const aiSupportsImageContext = selectedAiModelDescriptor.inputs.image === 'supported';
  const aiSupportsPdfContext = selectedAiModelDescriptor.inputs.pdf === 'supported';
  const aiSupportsCustomMaxTokens =
    selectedAiModelDescriptor.parameters.maxOutputTokens.support === 'supported';
  const aiSupportsTemperature =
    selectedAiModelDescriptor.parameters.temperature.support === 'supported' &&
    selectedAiModelDescriptor.parameters.temperature.fixed === undefined;

  useEffect(() => {
    if (!aiSupportsPdfContext && aiIncludePdf) {
      setAiIncludePdf(false);
    }
    if (!aiSupportsImageContext && aiIncludeRenderedImage) {
      setAiIncludeRenderedImage(false);
    }
    if (!aiSupportsCustomMaxTokens && aiMaxTokensMode === 'custom') {
      setAiMaxTokensMode('auto');
    }
    if (!aiSupportsTemperature && aiTemperatureMode === 'custom') {
      setAiTemperatureMode('auto');
    }
    const maxOutputTokens =
      selectedAiModelDescriptor.maxOutputTokens ??
      selectedAiModelDescriptor.parameters.maxOutputTokens.max;
    if (maxOutputTokens !== undefined && aiMaxTokens > maxOutputTokens) {
      setAiMaxTokens(maxOutputTokens);
    }
    const temperatureCapability = selectedAiModelDescriptor.parameters.temperature;
    if (temperatureCapability.min !== undefined && aiTemperature < temperatureCapability.min) {
      setAiTemperature(temperatureCapability.min);
    } else if (
      temperatureCapability.max !== undefined &&
      aiTemperature > temperatureCapability.max
    ) {
      setAiTemperature(temperatureCapability.max);
    }
  }, [
    aiIncludePdf,
    aiIncludeRenderedImage,
    aiMaxTokens,
    aiMaxTokensMode,
    aiSupportsCustomMaxTokens,
    aiSupportsImageContext,
    aiSupportsPdfContext,
    aiSupportsTemperature,
    aiTemperature,
    aiTemperatureMode,
    selectedAiModelDescriptor,
    setAiIncludePdf,
    setAiIncludeRenderedImage,
    setAiMaxTokens,
    setAiMaxTokensMode,
    setAiTemperature,
    setAiTemperatureMode,
  ]);

  useEffect(() => {
    if (!aiEnabled) {
      setAiModels([]);
      setAiModelDescriptors([]);
      setAiModelsError(null);
      setAiModelsLoading(false);
      return;
    }
    const trimmedKey = aiApiKey.trim();
    if (!trimmedKey) {
      setAiModels([]);
      setAiModelDescriptors([]);
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
        let descriptors: AiModelDescriptor[] = [];
        let proxyResponse: Response | null = null;
        if (useLlmProxy) {
          const nextProxyResponse = await fetch(proxyUrlFor(`/api/llm/${aiProvider}/models`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey: trimmedKey }),
          });
          if (nextProxyResponse.ok) {
            proxyResponse = nextProxyResponse;
          } else if (
            aiProvider === 'anthropic' &&
            isEmbedBuild &&
            !llmProxyBase &&
            isMissingProxyStatus(nextProxyResponse.status)
          ) {
            throw new Error(ANTHROPIC_EMBED_PROXY_ERROR);
          } else if (!(
            isEmbedBuild &&
            !llmProxyBase &&
            isMissingProxyStatus(nextProxyResponse.status)
          )) {
            const errorText = await nextProxyResponse.text();
            throw new Error(errorText || 'Failed to load models.');
          }
        }

        if (proxyResponse) {
          const data = await proxyResponse.json();
          models = Array.isArray(data?.models)
            ? data.models.filter((id: unknown): id is string => typeof id === 'string')
            : [];
          descriptors = parseAiModelDescriptors(data?.modelDescriptors);
        } else {
          descriptors = await loadAiModelDescriptorsDirect({
            provider: aiProvider,
            apiKey: trimmedKey,
          });
          models = descriptors.map((descriptor) => descriptor.id);
        }

        if (canceled) {
          return;
        }
        const filtered =
          aiProvider === 'openai' ? models.filter((id: string) => /^gpt-|^o/.test(id)) : models;
        const sorted = [...new Set(filtered.length ? filtered : models)].sort();
        const descriptorsById = new Map(
          descriptors.map((descriptor) => [descriptor.id, descriptor]),
        );
        const sortedDescriptors = sorted.map(
          (id) => descriptorsById.get(id) ?? resolveAiModelDescriptor(aiProvider, id),
        );
        setAiModels(sorted);
        setAiModelDescriptors(sortedDescriptors);
        // Keep the user's current selection if it is still valid; only
        // pick a default when the selection is empty or no longer offered.
        // Uses a functional update so this effect need not depend on
        // aiModel (which would refetch/reset on every keystroke).
        setAiModel((prev) => {
          if (prev && sorted.includes(prev)) {
            return prev;
          }
          return (
            sorted.find((id: string) => id === DEFAULT_MODEL_BY_PROVIDER[aiProvider]) ||
            sorted[0] ||
            DEFAULT_MODEL_BY_PROVIDER[aiProvider] ||
            ''
          );
        });
      } catch (err) {
        if (!canceled) {
          console.error(`Failed to load ${AI_PROVIDER_LABELS[aiProvider]} models`, err);
          setAiModels([]);
          setAiModelDescriptors([]);
          const message = errorMessage(err);
          setAiModelsError(
            message || 'Failed to load models. Check your API key or enter a model manually.',
          );
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
  }, [
    aiApiKey,
    aiEnabled,
    aiProvider,
    isEmbedBuild,
    llmProxyBase,
    proxyUrlFor,
    setAiModel,
    setAiModelDescriptors,
    setAiModels,
    setAiModelsError,
    setAiModelsLoading,
    useLlmProxy,
  ]);

  useEffect(() => {
    if (!newScoreDialogOpen) {
      return;
    }
    if (newScoreInstrumentOptions.length === 0) {
      return;
    }
    const fallbackId = newScoreInstrumentOptions[0].id;
    if (
      !newScoreInstrumentToAdd ||
      !newScoreInstrumentOptions.some((option) => option.id === newScoreInstrumentToAdd)
    ) {
      setNewScoreInstrumentToAdd(fallbackId);
    }
    if (newScoreInstrumentIds.length === 0) {
      setNewScoreInstrumentIds([fallbackId]);
    }
  }, [
    newScoreDialogOpen,
    newScoreInstrumentIds.length,
    newScoreInstrumentOptions,
    newScoreInstrumentToAdd,
  ]);

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
          const groups = Array.isArray(data?.groups)
            ? (data.groups as InstrumentTemplateGroup[])
            : [];
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
        const hasSessionRestore =
          typeof window !== 'undefined' && Boolean(sessionStorage.getItem('openInEditor'));
        const scoreUrl = searchParams.get('score');
        if (scoreUrl) {
          await handleUrlLoad(scoreUrl, abortController.signal);
          return;
        }
        if (!hasSessionRestore && launchContext?.canonicalXmlUrl) {
          if (
            launchContext.source === 'ourtextscores' &&
            launchContext.workId &&
            launchContext.sourceId
          ) {
            const response = await fetch(launchContext.canonicalXmlUrl, {
              signal: abortController.signal,
            });
            if (!response.ok) {
              throw new Error('Failed to fetch launch-context score');
            }
            const xml = await response.text();
            const file = new File(
              [new TextEncoder().encode(xml)],
              `${launchContext.sourceId}-${launchContext.revisionId || 'launch'}.musicxml`,
              { type: 'application/xml' },
            );
            await handleFileUpload(file, {
              scoreIdOverride: buildOtsScoreId(launchContext.workId, launchContext.sourceId),
              updateUrl: false,
              telemetrySource: 'ots_launch',
            });
            return;
          }
          await handleUrlLoad(launchContext.canonicalXmlUrl, abortController.signal);
        }
      } catch (err) {
        if (!abortController.signal.aborted) {
          console.error('Failed to initialize webmscore', err);
        }
      }
    };

    boot();
    return () => abortController.abort();
  }, [
    handleFileUpload,
    handleUrlLoad,
    launchContext?.canonicalXmlUrl,
    launchContext?.revisionId,
    launchContext?.source,
    launchContext?.sourceId,
    launchContext?.workId,
    searchParams,
  ]);

  const requestLayoutProgress = (targetScore: Score, targetPage: number) =>
    requestScoreLayoutProgress(targetScore, targetPage, runSerializedScoreOperation);

  const runWithTimeout = async <T,>(
    promise: Promise<T>,
    timeoutMs: number,
    label: string,
  ): Promise<T> => {
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

  const {
    hasPendingOperations: hasPendingCompareOperations,
    invalidateOperations: invalidateCompareOperations,
    isGenerationCurrent: isCompareGenerationCurrent,
    queueKeyboardOperation: queueCompareKeyboardOperation,
    queueScoreTeardown: queueCompareScoreTeardown,
    trackOperation: trackCompareOperation,
  } = useCompareOperationCoordinator({
    auxiliaryScoreRef: compareRightScoreRef,
    runSerializedScoreOperation,
  });

  const scheduleLargeScoreInteractionPrime = useCallback(
    (targetScore: Score) => {
      if (!largeScoreSessionRef.current) {
        return;
      }
      clearInteractionPrime();
      const runId = interactionPrimeRunIdRef.current;
      interactionPrimeTimerRef.current = setTimeout(() => {
        if (interactionPrimeRunIdRef.current !== runId || scoreRef.current !== targetScore) {
          return;
        }
        void (async () => {
          try {
            if (targetScore.relayout) {
              await runSerializedScoreOperation(
                () => Promise.resolve(targetScore.relayout!()),
                'relayout(interaction-prime)',
              );
            }
            const refreshedPage = await refreshPageCount(targetScore, currentPageRef.current);
            await renderScore(targetScore, refreshedPage, false);
            setInteractionState({ preparing: false, ready: true });
            if (targetScore.saveAudio) {
              queueMicrotask(() => {
                void ensureSoundFontLoaded(targetScore).catch((err) => {
                  console.warn('Deferred SoundFont warmup after interaction prime failed.', err);
                });
              });
            }
          } catch {
            setInteractionState({ preparing: false, ready: true });
            if (targetScore.saveAudio) {
              queueMicrotask(() => {
                void ensureSoundFontLoaded(targetScore).catch((soundFontErr) => {
                  console.warn(
                    'Deferred SoundFont warmup after failed interaction prime failed.',
                    soundFontErr,
                  );
                });
              });
            }
          }
        })();
      }, LARGE_SCORE_INTERACTION_PRIME_DELAY_MS);
    },
    [
      clearInteractionPrime,
      ensureSoundFontLoaded,
      refreshPageCount,
      renderScore,
      runSerializedScoreOperation,
      setInteractionState,
    ],
  );

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

    const rawBoxes: SelectionGeometryBox[] = selectionBoxes.length
      ? selectionBoxes
      : selectedElement
        ? [
            {
              index: selectedIndex,
              page: primaryPoint?.page ?? currentPageRef.current ?? 0,
              x: selectedElement.x,
              y: selectedElement.y,
              w: selectedElement.w,
              h: selectedElement.h,
              classes: classList || 'unknown',
            },
          ]
        : [];

    const boxes = rawBoxes
      .map((box, index) => {
        const x = typeof box?.x === 'number' ? box.x : NaN;
        const y = typeof box?.y === 'number' ? box.y : NaN;
        const w =
          typeof box?.w === 'number' ? box.w : typeof box?.width === 'number' ? box.width : NaN;
        const h =
          typeof box?.h === 'number' ? box.h : typeof box?.height === 'number' ? box.height : NaN;
        if (
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          !Number.isFinite(w) ||
          !Number.isFinite(h)
        ) {
          return null;
        }
        return {
          index: typeof box?.index === 'number' ? box.index : index,
          page:
            typeof box?.page === 'number'
              ? box.page
              : (primaryPoint?.page ?? currentPageRef.current ?? 0),
          x,
          y,
          w,
          h,
          classes: typeof box?.classes === 'string' && box.classes.trim() ? box.classes : 'n/a',
        };
      })
      .filter(
        (
          box,
        ): box is {
          index: number;
          page: number;
          x: number;
          y: number;
          w: number;
          h: number;
          classes: string;
        } => Boolean(box),
      );

    if (boxes.length) {
      const shown = boxes.slice(0, AI_SELECTION_BOX_CONTEXT_LIMIT);
      const selectionLines = shown.map(
        (box, index) =>
          `#${index + 1}: page=${box.page + 1}, x=${box.x.toFixed(2)}, y=${box.y.toFixed(2)}, w=${box.w.toFixed(2)}, h=${box.h.toFixed(2)}, index=${box.index ?? 'n/a'}, classes=${box.classes || 'n/a'}`,
      );
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
              `Selection MIME XML:\n${truncated.value}${
                truncated.truncated
                  ? `\n[Selection MIME XML truncated from ${truncated.originalLength} characters.]`
                  : ''
              }`,
            );
          }
        }
      } catch (err) {
        console.warn('Failed to capture selection MIME context for AI request:', err);
      }
    }

    return lines.join('\n\n').trim();
  }, [
    score,
    selectedElement,
    selectedElementClasses,
    selectedIndex,
    selectionBoxes,
    runSerializedScoreOperation,
  ]);

  const resolveCurrentPageImageAttachment =
    useCallback(async (): Promise<AiImageAttachment | null> => {
      const activeScore = scoreRef.current ?? score;
      if (!activeScore?.savePng) {
        return null;
      }
      const pageIndex = Math.max(0, currentPageRef.current || 0);
      try {
        const png: unknown = await runSerializedScoreOperation(
          () => Promise.resolve(activeScore.savePng!(pageIndex, true, true)),
          `savePng(ai-context-page=${pageIndex + 1})`,
        );
        const bytes =
          png instanceof Uint8Array ? png : png instanceof ArrayBuffer ? new Uint8Array(png) : null;
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
      const pdf: unknown = await runSerializedScoreOperation(
        () => Promise.resolve(activeScore.savePdf()),
        'savePdf(ai-context)',
      );
      const bytes =
        pdf instanceof Uint8Array ? pdf : pdf instanceof ArrayBuffer ? new Uint8Array(pdf) : null;
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

  const aiScoreBridge = useMemo<AiScoreBridge>(
    () => ({
      getLiveXml: (fallback = null) => getScoreMusicXmlText(scoreRef.current ?? score, fallback),
      getContextXml: resolveXmlContext,
      applyXml: (xml, telemetrySource) => applyXmlToScoreRef.current(xml, { telemetrySource }),
      getSelectionContext: resolveSelectionContext,
      getPageSvgContext: resolveCurrentPageSvgContext,
      getPageImage: resolveCurrentPageImageAttachment,
      getScorePdf: resolveScorePdfAttachment,
    }),
    [
      getScoreMusicXmlText,
      resolveCurrentPageImageAttachment,
      resolveCurrentPageSvgContext,
      resolveScorePdfAttachment,
      resolveSelectionContext,
      resolveXmlContext,
      score,
    ],
  );

  const loadScoreWithEngineFallback = async (
    format: InputFileFormat,
    data: Uint8Array,
    logStage?: (stage: string, extra?: unknown) => void,
  ) => {
    const loadStart = performance.now();
    const largeScore = isLargeScoreData(data);
    const logLargeLoad = (stage: string, extra?: unknown) => {
      logStage?.(stage, extra);
      if (!largeScore) return;
      const elapsedMs = Math.round(performance.now() - loadStart);
      if (typeof extra === 'undefined') {
        console.info(`[large-load] ${format} ${stage} @ ${elapsedMs}ms`);
        return;
      }
      console.info(`[large-load] ${format} ${stage} @ ${elapsedMs}ms`, extra);
    };
    return loadScoreWithSharedEngineFallback(format, data, {
      progressiveEnabled: progressiveLoadEnabled,
      runSerialized: runSerializedScoreOperation,
      logStage: logLargeLoad,
    });
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
      if (isLargeInput && interactionPreparingRef.current) {
        backgroundInitTimerRef.current = setTimeout(() => {
          void runTasks(attempt);
        }, 1000);
        log('background-tasks:deferred', { reason: 'interaction-preparing', attempt });
        return;
      }
      if (
        isLargeInput &&
        (pageNavigationInFlightRef.current || progressivePageLoadInFlightRef.current)
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
        await runWithTimeout(refreshScoreMetadata(loadedScore), 20_000, 'Score metadata refresh');
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
          await runWithTimeout(ensureSoundFontLoaded(loadedScore), 25_000, 'SoundFont load');
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

    if (loadedScore.saveAudio) {
      if (isLargeInput && interactionPreparingRef.current) {
        log('soundfont:warmup-deferred', { reason: 'interaction-preparing' });
        queueMicrotask(() => {
          void prefetchSoundFontBytes().catch((err) => {
            log('soundfont:warmup-prefetch-failed', err);
            console.warn('Background SoundFont prefetch failed.', err);
          });
        });
      } else {
        log('soundfont:warmup-scheduled');
        queueMicrotask(() => {
          void ensureSoundFontLoaded(loadedScore).catch((err) => {
            log('soundfont:warmup-failed', err);
            console.warn('Background SoundFont warmup failed.', err);
          });
        });
      }
    }

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

  handleUrlLoadRef.current = async (url, signal) => {
    if (signal?.aborted) {
      return false;
    }
    const loadStartedAt = Date.now();
    clearScheduledBackgroundInit();
    clearInteractionPrime();
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
    setInteractionState({ preparing: false, ready: false });
    soundFontLoadedRef.current = false;
    triedSoundFontRef.current = false;
    soundFontManagerRef.current?.invalidateTargets();
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
    let engineMode: string | undefined;
    try {
      const fetchUrl = resolvePublicScoreUrl(url);
      const response = await fetch(fetchUrl, signal ? { signal } : undefined);
      if (!response.ok) throw new Error('Failed to fetch score');
      const buffer = await response.arrayBuffer();
      const data = new Uint8Array(buffer);
      const inputByteLength = data.byteLength;
      const inputIsLarge = isLargeScoreData(data);
      largeScoreSessionRef.current = inputIsLarge;
      const format = detectScoreInputFormat(url, data);
      if (score) {
        score.destroy();
      }

      const skipCoverPage = shouldSkipCoverPageFirstRender(format, data);
      const {
        loadedScore,
        progressivePaging,
        progressiveHasMore,
        initialAvailablePages,
        engineMode: actualEngineMode,
      } = await loadScoreWithEngineFallback(
        format,
        data,
        inputIsLarge
          ? (stage: string, extra?: unknown) => {
              if (typeof extra === 'undefined') {
                console.info(`[large-load] ${format} ${stage}`);
                return;
              }
              console.info(`[large-load] ${format} ${stage}`, extra);
            }
          : undefined,
      );
      engineMode = actualEngineMode;
      if (inputIsLarge) console.info(`[large-load] ${format} engine:${engineMode}`);
      if (signal?.aborted) {
        loadedScore.destroy();
        return false;
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
      if (inputIsLarge && progressivePaging && initialAvailablePages <= 1) {
        setInteractionState({ preparing: true, ready: false });
        scheduleLargeScoreInteractionPrime(loadedScore);
      } else {
        setInteractionState({ preparing: false, ready: true });
      }
      const autoFit = handleFitHeight;
      if (autoFitPendingRef.current && typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            autoFit();
            autoFitPendingRef.current = false;
          });
        });
      } else {
        autoFit();
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
      if (!signal?.aborted) {
        alert(scoreLoadErrorMessage(err));
      }
      setInteractionState({ preparing: false, ready: false });
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

  handleFileUploadRef.current = async (file, options) => {
    clearScheduledBackgroundInit();
    clearInteractionPrime();
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
    setInteractionState({ preparing: false, ready: false });
    soundFontLoadedRef.current = false;
    triedSoundFontRef.current = false;
    soundFontManagerRef.current?.invalidateTargets();
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
      format = detectScoreInputFormat(file.name, data);
      // But wait, we need to destroy previous score if exists
      if (score) {
        score.destroy();
      }

      const skipCoverPage = shouldSkipCoverPageFirstRender(format, data);
      const loadResult = await loadScoreWithEngineFallback(format, data, logUploadStage);
      const {
        loadedScore,
        progressivePaging: nextProgressivePaging,
        progressiveHasMore: nextProgressiveHasMore,
        initialAvailablePages,
        engineMode: actualEngineMode,
      } = loadResult;
      engineMode = actualEngineMode;
      progressivePaging = nextProgressivePaging;
      progressiveHasMore = nextProgressiveHasMore;
      logUploadStage('load-score:done', {
        engineMode,
        progressivePaging,
        progressiveHasMore,
        initialAvailablePages,
      });
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
      if (isLargeUpload && progressivePaging && initialAvailablePages <= 1) {
        setInteractionState({ preparing: true, ready: false });
        scheduleLargeScoreInteractionPrime(loadedScore);
      } else {
        setInteractionState({ preparing: false, ready: true });
      }
      if (autoFitPendingRef.current && typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            handleFitHeight();
            autoFitPendingRef.current = false;
          });
        });
      } else {
        handleFitHeight();
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
      alert(scoreLoadErrorMessage(err));
      setInteractionState({ preparing: false, ready: false });
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

  const handleLoadScoreUpload = (file: File) =>
    handleFileUpload(file, {
      createInitialCheckpoint: true,
      telemetrySource: 'file_upload',
    });

  const handleOpenCompareScoreLoader = () => {
    setCompareScoreLoaderError(null);
    setCompareScoreLoaderOpen(true);
  };

  const handleLoadScoresToCompare = async (leftFile: File, rightFile: File) => {
    setCompareScoreLoaderBusy(true);
    setCompareScoreLoaderError(null);
    try {
      const leftXml = await loadCompareScoreMusicXml(leftFile);
      const loaded = await handleFileUpload(rightFile, {
        preserveScoreId: false,
        telemetrySource: 'compare_load_right',
      });
      if (!loaded) {
        throw new Error(`Could not load ${rightFile.name}.`);
      }

      const rightXml = await getScoreMusicXmlText(scoreRef.current, null);
      if (!rightXml) {
        throw new Error(`Could not create a MusicXML snapshot of ${rightFile.name}.`);
      }

      setCompareView({
        title: leftFile.name,
        currentXml: rightXml,
        checkpointXml: leftXml,
        currentLabel: rightFile.name,
        checkpointLabel: leftFile.name,
      });
      setCompareScoreLoaderOpen(false);
    } catch (err) {
      console.error('Failed to load scores for comparison:', err);
      setCompareScoreLoaderError(errorMessage(err));
    } finally {
      setCompareScoreLoaderBusy(false);
    }
  };

  refreshPageCountRef.current = async (targetScore, preferredPage = currentPageRef.current) => {
    if (!targetScore?.npages) {
      setPageCount(1);
      setCurrentPage(0);
      return 0;
    }

    try {
      const pages = Math.max(
        1,
        await runSerializedScoreOperation(() => targetScore.npages!(), 'npages'),
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
        const expanded = Boolean(
          await runWithTimeout(
            runSerializedScoreOperation(
              () => Promise.resolve(targetScore.layoutUntilPage!(targetPage)),
              `layoutUntilPage(page=${targetPage + 1})`,
            ),
            PROGRESSIVE_PAGE_LAYOUT_EXPAND_TIMEOUT_MS,
            `Expand layout to page ${targetPage + 1}`,
          ),
        );
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
        targetSatisfied = Boolean(
          await runWithTimeout(
            runSerializedScoreOperation(
              () => Promise.resolve(targetScore.layoutUntilPage!(targetPage)),
              `layoutUntilPage(page=${targetPage + 1})`,
            ),
            PROGRESSIVE_PAGE_LAYOUT_CONFIRM_TIMEOUT_MS,
            `Layout page ${targetPage + 1}`,
          ),
        );
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

  renderScoreRef.current = async (currentScore, pageIndex, highlightSelection = true) => {
    if (!currentScore || !containerRef.current) return false;

    try {
      const targetPage = typeof pageIndex === 'number' ? pageIndex : currentPage;
      const timeoutMs =
        largeScoreSessionRef.current && progressivePagingActive
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
        containerRef.current.innerHTML = sanitizeEngineSvg(svgData);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error rendering score:', err);
      return false;
    }
  };

  async function applyHarmonyDisplayInterpretation(
    targetScore: Score | null,
    literal: boolean,
  ): Promise<boolean> {
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

  const renderScoreToContainer = useCallback(
    async (
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
        container.innerHTML = sanitizeEngineSvg(svgData);
        const svg = container.querySelector('svg');
        if (svg instanceof SVGSVGElement) {
          svg.style.width = '100%';
          svg.style.height = '100%';
        }
        return true;
      } catch (err) {
        const message = errorMessage(err).toLowerCase();
        if (message.includes('table index is out of bounds')) {
          console.warn(
            'Compare score render failed (WASM table bounds). The proposal may contain invalid MusicXML.',
            err,
          );
        } else {
          console.error('Error rendering compare score:', err);
        }
        return false;
      }
    },
    [runSerializedScoreOperation],
  );

  const syncCompareSvgSize = useCallback(
    (
      container: HTMLDivElement | null,
      setSize: React.Dispatch<React.SetStateAction<{ width: number; height: number } | null>>,
    ) => {
      const svg = container?.querySelector('svg');
      if (!(svg instanceof SVGSVGElement)) {
        return;
      }
      const size = getSvgNaturalSize(svg, compareEffectiveZoomRef.current);
      if (!size) {
        return;
      }
      setSize(size);
    },
    [],
  );

  const getCompareTargetPage = useCallback(
    (targetScore: Score | null) => {
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
    },
    [compareContinuousMode, score, compareRightScore, currentPage, compareRightPageCount],
  );

  const getCompareScoreRole = useCallback(
    (targetScore: Score): CompareScoreRole => (targetScore === score ? 'current' : 'proposal'),
    [score],
  );

  const refreshCompareSelectionGeometry = useCallback(
    async (
      targetScore: Score,
      role: CompareScoreRole,
      side: CompareSide,
      selected?: boolean,
      isCurrent?: () => boolean,
    ) => {
      if (isCurrent && !isCurrent()) {
        return [] as SelectionBox[];
      }
      if (selected === false) {
        setCompareSelection(role, [], false);
        return [] as SelectionBox[];
      }

      const hasGeometryBinding = Boolean(
        targetScore.getSelectionBoundingBoxes || targetScore.getSelectionBoundingBox,
      );
      let rawBoxes: Array<{
        page: number;
        x: number;
        y: number;
        width: number;
        height: number;
      }> = [];
      try {
        if (targetScore.getSelectionBoundingBoxes) {
          const result = await runSerializedScoreOperation(
            () => Promise.resolve(targetScore.getSelectionBoundingBoxes!()),
            `compare-selection-boxes:${side}`,
          );
          rawBoxes = Array.isArray(result) ? result : [];
        }
        if (rawBoxes.length === 0 && targetScore.getSelectionBoundingBox) {
          const result = await runSerializedScoreOperation(
            () => Promise.resolve(targetScore.getSelectionBoundingBox!()),
            `compare-selection-box:${side}`,
          );
          if (result) {
            rawBoxes = [result];
          }
        }
      } catch (err) {
        console.warn(`Failed to read ${side} compare selection geometry:`, err);
      }

      let boxes: SelectionBox[] = rawBoxes
        .filter(
          (box) =>
            Number.isFinite(box.x) &&
            Number.isFinite(box.y) &&
            Number.isFinite(box.width) &&
            Number.isFinite(box.height) &&
            box.width > 0 &&
            box.height > 0,
        )
        .map((box, index) => ({
          index,
          page: box.page,
          x: box.x,
          y: box.y,
          w: box.width,
          h: box.height,
          centerX: box.x + box.width / 2,
          centerY: box.y + box.height / 2,
          classes: '',
        }));

      // Older bindings may expose selection in the highlighted SVG without a
      // bounding-box method. Mirror the main editor's DOM fallback so a selected
      // note still gets the same blue interaction rectangle.
      if (boxes.length === 0) {
        const container =
          side === 'left' ? compareLeftContainerRef.current : compareRightContainerRef.current;
        if (container) {
          const containerRect = container.getBoundingClientRect();
          const candidates = Array.from(
            new Set(
              ['.selected', '.note-selected', '.ms-selection'].flatMap((selector) =>
                Array.from(container.querySelectorAll(selector)),
              ),
            ),
          );
          const page = getCompareTargetPage(targetScore);
          boxes = candidates
            .map((candidate, index): SelectionBox | null => {
              const rect = candidate.getBoundingClientRect();
              const x = (rect.left - containerRect.left) / compareEffectiveZoom;
              const y = (rect.top - containerRect.top) / compareEffectiveZoom;
              const w = rect.width / compareEffectiveZoom;
              const h = rect.height / compareEffectiveZoom;
              if (!(w > 0 && h > 0)) {
                return null;
              }
              return {
                index,
                page,
                x,
                y,
                w,
                h,
                centerX: x + w / 2,
                centerY: y + h / 2,
                classes: candidate.getAttribute('class') ?? '',
              };
            })
            .filter((box): box is SelectionBox => Boolean(box));
        }
      }

      const targetPage = getCompareTargetPage(targetScore);
      const visibleBoxes = compareContinuousMode
        ? boxes
        : boxes.filter((box) => box.page === targetPage);
      if (isCurrent && !isCurrent()) {
        return [] as SelectionBox[];
      }
      setCompareSelection(
        role,
        visibleBoxes,
        boxes.length > 0 || (selected === true && !hasGeometryBinding),
      );
      return visibleBoxes;
    },
    [
      compareContinuousMode,
      compareEffectiveZoom,
      getCompareTargetPage,
      runSerializedScoreOperation,
      setCompareSelection,
    ],
  );

  const renderEditedCompareScore = useCallback(
    async (targetScore: Score, side: CompareSide, highlightSelection = true) => {
      // Written out rather than `side === 'left' ? … : …` because that shape
      // silently folds any third position into 'right'. This workspace has
      // only two, and saying so is how it stays true.
      if (side !== 'left' && side !== 'right') {
        return;
      }
      const container =
        side === 'left' ? compareLeftContainerRef.current : compareRightContainerRef.current;
      const setSize = side === 'left' ? setCompareLeftSvgSize : setCompareRightSvgSize;
      const setPositions =
        side === 'left' ? setCompareLeftMeasurePositions : setCompareRightMeasurePositions;
      const targetPage = getCompareTargetPage(targetScore);
      await renderScoreToContainer(targetScore, container, targetPage, highlightSelection);
      syncCompareSvgSize(container, setSize);
      await refreshMeasurePositions(targetScore, setPositions);
    },
    [getCompareTargetPage, refreshMeasurePositions, renderScoreToContainer, syncCompareSvgSize],
  );

  const commitCompareProposalXml = useCallback((afterXml: string) => {
    // This update came from the already-loaded auxiliary Score. Mark the exported XML
    // as loaded so the compare lifecycle does not destroy and recreate that same
    // instance in response to our state update.
    compareLoadedCheckpointXmlRef.current = afterXml;
    setCompareView((prev) => (prev ? { ...prev, checkpointXml: afterXml } : prev));
  }, []);

  const commitCompareCurrentXml = useCallback(
    async (afterXml: string) => {
      setScoreDirtySinceCheckpoint(true);
      setScoreDirtySinceXml(true);
      setCompareView((prev) => (prev ? { ...prev, currentXml: afterXml } : prev));
      if (isAiCompareMode) {
        try {
          await recordAiProposalAppliedXml(afterXml);
          setAiProposalApplyError(null);
        } catch (hashError) {
          const message =
            errorMessage(hashError) ||
            'The score was edited, but proposal continuity could not be advanced.';
          invalidateAiProposalExpectedCurrent(message);
          setAiProposalApplyError(message);
        }
      }
    },
    [
      invalidateAiProposalExpectedCurrent,
      isAiCompareMode,
      recordAiProposalAppliedXml,
      setAiProposalApplyError,
    ],
  );

  const compareFallbackXml = useCallback(
    (role: CompareScoreRole) =>
      role === 'current' ? (compareView?.currentXml ?? null) : (compareView?.checkpointXml ?? null),
    [compareView],
  );

  const {
    persistEdit: persistCompareScoreEdit,
    refreshNoteInputCursor: refreshCompareNoteInputCursor,
  } = useComparePersistence({
    getRole: getCompareScoreRole,
    getFallbackXml: compareFallbackXml,
    exportXml: getScoreMusicXmlText,
    runSerialized: runSerializedScoreOperation,
    recordEdit: recordCompareEdit,
    setNoteInputCursor: setCompareNoteInputCursor,
    commitProposalXml: commitCompareProposalXml,
    commitCurrentXml: commitCompareCurrentXml,
    // Keep the editor underneath the modal current for when the modal closes.
    renderLiveEditor: (targetScore) => renderScore(targetScore, currentPageRef.current),
    renderEditedScore: renderEditedCompareScore,
    refreshSelectionGeometry: (targetScore, role, side, isCurrent) =>
      refreshCompareSelectionGeometry(targetScore, role, side, undefined, isCurrent),
    bumpAlignmentRevision: () => setCompareAlignmentRevision((value) => value + 1),
  });

  const refreshCompareLivePageCount = useCallback(
    async (targetScore: Score) => {
      await refreshPageCount(targetScore, currentPageRef.current);
    },
    [refreshPageCount],
  );
  const reportCompareMutationError = useCallback((label: string, error: unknown) => {
    console.error(`Compare mutation "${label}" failed:`, error);
    alert(`Unable to ${label} in the compare score. Check the console for details.`);
  }, []);
  const performCompareMutation = useCompareMutationController({
    view: compareView,
    activeSide: compareActiveSide,
    leftScore: compareLeftScore,
    rightScore: compareRightScoreDisplay,
    liveScore: score,
    swapBusy: compareSwapBusy,
    feedbackBusy: aiDiffFeedbackBusy,
    beginBusy: beginCompareEdit,
    endBusy: endCompareEdit,
    isBusy: isCompareEditBusy,
    isNoteInputCommitted: isCompareNoteInputCommitted,
    setActiveSide: setCompareActiveSide,
    snapshotScore: getScoreMusicXmlText,
    runSerialized: runSerializedScoreOperation,
    invalidateOperations: invalidateCompareOperations,
    isGenerationCurrent: isCompareGenerationCurrent,
    trackOperation: trackCompareOperation,
    persistEdit: persistCompareScoreEdit,
    refreshLivePageCount: refreshCompareLivePageCount,
    setAuxiliaryPageCount: setCompareRightPageCount,
    refreshNoteInputCursor: refreshCompareNoteInputCursor,
    reportError: reportCompareMutationError,
  });

  const setCompareNoteInputMode = useCallback(
    async (enabled: boolean, side: CompareSide = compareActiveSide ?? 'left') => {
      const targetScore = compareScoreForSide(side);
      if (
        !targetScore?.setNoteEntryMode ||
        isCompareEditBusy() ||
        compareSwapBusy ||
        aiDiffFeedbackBusy
      ) {
        return;
      }
      const generation = invalidateCompareOperations();
      setCompareActiveSide(side);
      const role = getCompareScoreRole(targetScore);
      requestCompareNoteInput(role, enabled);
      const operation = trackCompareOperation(
        (async () => {
          if (enabled && targetScore.setInputStateFromSelection) {
            await runSerializedScoreOperation(
              () => Promise.resolve(targetScore.setInputStateFromSelection!()),
              `compare-note-input-selection:${side}`,
            ).catch(() => {});
            if (!isCompareGenerationCurrent(generation)) {
              return;
            }
          }
          const changed = await runSerializedScoreOperation(
            () => Promise.resolve(targetScore.setNoteEntryMode!(enabled)),
            `compare-note-input:${side}`,
          );
          if (!isCompareGenerationCurrent(generation)) {
            return;
          }
          if (changed === false) {
            rollbackCompareNoteInputRequest(role);
            return;
          }
          commitCompareNoteInput(role, enabled);
          if (enabled) {
            await refreshCompareNoteInputCursor(targetScore, role, side, () =>
              isCompareGenerationCurrent(generation),
            );
          } else {
            setCompareNoteInputCursor(role, null);
          }
        })(),
      );
      try {
        await operation;
      } catch (err) {
        if (isCompareGenerationCurrent(generation)) {
          rollbackCompareNoteInputRequest(role);
          console.warn('Failed to toggle compare note input mode:', err);
        }
      }
    },
    [
      aiDiffFeedbackBusy,
      compareActiveSide,
      compareScoreForSide,
      compareSwapBusy,
      commitCompareNoteInput,
      getCompareScoreRole,
      invalidateCompareOperations,
      isCompareEditBusy,
      isCompareGenerationCurrent,
      refreshCompareNoteInputCursor,
      requestCompareNoteInput,
      rollbackCompareNoteInputRequest,
      runSerializedScoreOperation,
      setCompareNoteInputCursor,
      trackCompareOperation,
    ],
  );

  const toggleCompareNoteInputMode = useCallback(
    (side: CompareSide) => {
      const targetScore = compareScoreForSide(side);
      if (!targetScore) {
        return;
      }
      const role = getCompareScoreRole(targetScore);
      const enabled = !isCompareNoteInputDesired(role);
      void setCompareNoteInputMode(enabled, side);
    },
    [compareScoreForSide, getCompareScoreRole, isCompareNoteInputDesired, setCompareNoteInputMode],
  );

  const handleCompareAddBar = useCallback(
    (side: 'left' | 'right') => {
      void performCompareMutation(
        'add a bar',
        async (targetScore) => {
          if (!targetScore.insertMeasures) {
            alert('This build of webmscore does not expose "insertMeasures".');
            return false;
          }
          return targetScore.insertMeasures(1, measureInsertTargetMap.end);
        },
        { side },
      );
    },
    [performCompareMutation],
  );

  const handleCompareApplyFloatingPaletteItem = useCallback(
    (item: ScorePaletteItem) => {
      const binding = scorePaletteMutation(item);
      if (!binding) {
        console.warn(`Palette item "${item.kind}" is not editable in compare mode.`);
        return;
      }
      const { methodName, args } = binding;
      void performCompareMutation(`apply ${item.label}`, (targetScore) => {
        const fn = (targetScore as unknown as Record<string, unknown>)[methodName];
        if (typeof fn !== 'function') {
          alert(`This build of webmscore does not expose "${methodName}".`);
          return false;
        }
        return (fn as (...values: unknown[]) => unknown).apply(targetScore, args);
      });
    },
    [performCompareMutation],
  );

  const handleComparePaneClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>, side: 'left' | 'right') => {
      const targetScore = side === 'left' ? compareLeftScore : compareRightScoreDisplay;
      const positions =
        side === 'left' ? compareLeftMeasurePositions : compareRightMeasurePositions;
      const wrapper =
        side === 'left' ? compareLeftWrapperRef.current : compareRightWrapperRef.current;
      if (!targetScore || !positions || !wrapper) {
        return;
      }
      setCompareActiveSide(side);
      if (isCompareEditBusy() || compareSwapBusy || aiDiffFeedbackBusy) {
        return;
      }
      const role = getCompareScoreRole(targetScore);
      const measureIndex = hitTestMeasure(
        positions,
        event.clientX,
        event.clientY,
        side === 'left' ? compareLeftWrapperRef : compareRightWrapperRef,
        compareEffectiveZoom,
      );
      const measure = measureIndex >= 0 ? positions.elements[measureIndex] : null;
      const rect = wrapper.getBoundingClientRect();
      const x = (event.clientX - rect.left) / compareEffectiveZoom;
      const absoluteY = (event.clientY - rect.top) / compareEffectiveZoom;
      const pageHeight = positions.pageSize?.height ?? 0;
      const legacyMeasureHeight = measure
        ? (measure as unknown as Record<string, unknown>).height
        : null;
      const rawMeasureHeight = measure
        ? typeof measure.sy === 'number'
          ? measure.sy
          : typeof legacyMeasureHeight === 'number'
            ? legacyMeasureHeight
            : 0
        : 0;
      const usesPageOffset = Boolean(
        measure &&
        pageHeight > 0 &&
        measure.page > 0 &&
        measure.y + rawMeasureHeight <= pageHeight * 1.2,
      );
      const renderedPage = getCompareTargetPage(targetScore);
      const page = compareContinuousMode ? (measure?.page ?? renderedPage) : renderedPage;
      const y = compareContinuousMode && usesPageOffset ? absoluteY - page * pageHeight : absoluteY;

      if (isCompareNoteInputCommitted(role)) {
        void performCompareMutation(
          'place a note',
          async (activeScore) => {
            if (!activeScore.putNote) {
              alert('This build of webmscore does not expose "putNote".');
              return false;
            }
            const result = await activeScore.putNote(page, x, y);
            if (result !== false) {
              setCompareHasSelection(role, true);
            }
            return result;
          },
          { side },
        );
        return;
      }

      handleCompareScoreClick(event, side);
      if (!targetScore.selectElementAtPoint && !targetScore.selectElementAtPointWithMode) {
        return;
      }
      const hasExistingSelection = compareHasSelectionByRole[role];
      const selectionMode: 0 | 2 | 3 =
        event.ctrlKey || event.metaKey ? 2 : event.shiftKey && hasExistingSelection ? 3 : 0;
      const generation = invalidateCompareOperations();
      const selectionOperation = trackCompareOperation(
        runSerializedScoreOperation(
          () =>
            Promise.resolve(
              targetScore.selectElementAtPointWithMode
                ? targetScore.selectElementAtPointWithMode(page, x, y, selectionMode)
                : targetScore.selectElementAtPoint!(page, x, y),
            ),
          `compare-select:${side}`,
        ).then(async (selected) => {
          if (!isCompareGenerationCurrent(generation)) {
            return;
          }
          if (selected === false && selectionMode === 0 && targetScore.clearSelection) {
            await runSerializedScoreOperation(
              () => Promise.resolve(targetScore.clearSelection!()),
              `compare-selection-clear:${side}`,
            );
          }
          await renderEditedCompareScore(targetScore, side, true);
          if (!isCompareGenerationCurrent(generation)) {
            return;
          }
          await refreshCompareSelectionGeometry(targetScore, role, side, selected !== false, () =>
            isCompareGenerationCurrent(generation),
          );
        }),
      );
      void selectionOperation.catch((err) => {
        if (!isCompareGenerationCurrent(generation)) {
          return;
        }
        console.warn('Failed to select an element in compare score:', err);
      });
    },
    [
      aiDiffFeedbackBusy,
      compareEffectiveZoom,
      compareContinuousMode,
      compareLeftMeasurePositions,
      compareLeftScore,
      compareRightMeasurePositions,
      compareRightScoreDisplay,
      compareHasSelectionByRole,
      compareSwapBusy,
      getCompareScoreRole,
      getCompareTargetPage,
      handleCompareScoreClick,
      hitTestMeasure,
      invalidateCompareOperations,
      isCompareEditBusy,
      isCompareGenerationCurrent,
      isCompareNoteInputCommitted,
      performCompareMutation,
      refreshCompareSelectionGeometry,
      renderEditedCompareScore,
      runSerializedScoreOperation,
      setCompareHasSelection,
      trackCompareOperation,
    ],
  );

  const handleCompareOverwriteBlock = useCallback(
    async (
      sourceScore: Score | null,
      targetScore: Score | null,
      partIndex: number,
      pairs: Array<{ leftIndex: number; rightIndex: number }>,
    ): Promise<boolean> => {
      if (compareSwapBusy || isCompareEditBusy() || hasPendingCompareOperations()) {
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
        const isAiProposalCommit =
          compareView?.title === 'Assistant Proposal' && targetScore === score;
        let verifiedTargetXml: string | null = null;
        if (isAiProposalCommit) {
          const liveXml = await getScoreMusicXmlText(scoreRef.current ?? targetScore, null);
          if (!liveXml) {
            const message = 'Unable to verify the current score before applying this proposal.';
            setAiProposalApplyError(message);
            setAiError(message);
            return false;
          }
          verifiedTargetXml = liveXml;
          try {
            const hashCheck = await verifyAiProposalCurrent(liveXml, compareView.currentXml);
            if (!hashCheck.ok) {
              const message =
                'The score changed after this proposal was generated. Regenerate or rebase the proposal before applying it.';
              setAiProposalApplyError(message);
              setAiError(message);
              return false;
            }
          } catch (hashError) {
            const message =
              errorMessage(hashError) || 'Unable to verify the proposal against the current score.';
            setAiProposalApplyError(message);
            setAiError(message);
            return false;
          }
        }

        const fallbackSourceXml =
          sourceScore === score
            ? (compareView?.currentXml ?? null)
            : (compareView?.checkpointXml ?? null);
        const fallbackTargetXml =
          verifiedTargetXml ??
          (targetScore === score
            ? (compareView?.currentXml ?? null)
            : (compareView?.checkpointXml ?? null));
        const sourceXml = fallbackSourceXml ?? (await getScoreMusicXmlText(sourceScore, null));
        const targetXml = fallbackTargetXml ?? (await getScoreMusicXmlText(targetScore, null));
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
          const applied = await aiScoreBridge.applyXml(patched.xml, 'compare_overwrite');
          if (!applied) {
            return false;
          }
          const appliedXml =
            (await getScoreMusicXmlText(scoreRef.current ?? targetScore, patched.xml)) ||
            patched.xml;
          if (isAiProposalCommit) {
            try {
              await recordAiProposalAppliedXml(appliedXml);
              setAiError(null);
            } catch (hashError) {
              const message =
                errorMessage(hashError) ||
                'The change was applied, but the next proposal block cannot be verified.';
              invalidateAiProposalExpectedCurrent(message);
              setAiError(message);
            }
          }
          setCompareView((prev) => (prev ? { ...prev, currentXml: appliedXml } : prev));
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
    },
    [
      aiScoreBridge,
      compareSwapBusy,
      score,
      compareView,
      getScoreMusicXmlText,
      hasPendingCompareOperations,
      isCompareEditBusy,
      replaceMeasuresInMusicXml,
      invalidateAiProposalExpectedCurrent,
      recordAiProposalAppliedXml,
      setAiError,
      setAiProposalApplyError,
      verifyAiProposalCurrent,
    ],
  );

  const handleAcceptAllAiChanges = useCallback(async () => {
    if (!compareView || compareView.title !== 'Assistant Proposal') {
      return;
    }
    if (!score) {
      return;
    }
    if (compareSwapBusy || isCompareEditBusy() || hasPendingCompareOperations()) {
      return;
    }

    setCompareSwapBusy(true);
    let committedXml: string | null = null;
    try {
      const liveXml = await aiScoreBridge.getLiveXml();
      if (!liveXml) {
        const message = 'Unable to verify the current score before applying this proposal.';
        setAiProposalApplyError(message);
        setAiError(message);
        return;
      }
      const hashCheck = await verifyAiProposalCurrent(liveXml, compareView.currentXml);
      if (!hashCheck.ok) {
        const message =
          'The score changed after this proposal was generated. Regenerate or rebase the proposal before applying it.';
        setAiProposalApplyError(message);
        setAiError(message);
        return;
      }

      const applied = await aiScoreBridge.applyXml(compareView.checkpointXml, 'compare_apply_all');
      if (!applied) {
        return;
      }
      const appliedXml =
        (await aiScoreBridge.getLiveXml(compareView.checkpointXml)) || compareView.checkpointXml;
      committedXml = appliedXml;
      await recordAiProposalAppliedXml(appliedXml);
      setAiError(null);
      setCompareView((prev) => (prev ? { ...prev, currentXml: appliedXml } : prev));
      setCompareAlignmentRevision((value) => value + 1);
    } catch (applyError) {
      const message = committedXml
        ? 'The proposal was applied, but its new content hash could not be recorded.'
        : errorMessage(applyError) || 'Unable to apply the complete proposal.';
      if (committedXml) {
        invalidateAiProposalExpectedCurrent(message);
        setCompareView((prev) => (prev ? { ...prev, currentXml: committedXml! } : prev));
        setCompareAlignmentRevision((value) => value + 1);
      }
      setAiProposalApplyError(message);
      setAiError(message);
    } finally {
      setCompareSwapBusy(false);
    }
  }, [
    aiScoreBridge,
    compareView,
    compareSwapBusy,
    hasPendingCompareOperations,
    isCompareEditBusy,
    score,
    invalidateAiProposalExpectedCurrent,
    recordAiProposalAppliedXml,
    setAiError,
    setAiProposalApplyError,
    verifyAiProposalCurrent,
  ]);

  // Recovery path for the stale-base Apply gate: re-anchor the proposal onto the live
  // score. The live serialization becomes the compare view's left side and the gate's
  // expectation, so the refreshed diff shows any drift and Apply/Apply All work again.
  // Nothing is written to the score here — Apply remains the only commit path.
  const rebaseAiProposalOntoLive = useCallback(async () => {
    if (
      !compareView ||
      compareView.title !== 'Assistant Proposal' ||
      !score ||
      compareSwapBusy ||
      isCompareEditBusy() ||
      hasPendingCompareOperations()
    ) {
      return;
    }
    setCompareSwapBusy(true);
    try {
      const liveXml = await getScoreMusicXmlText(scoreRef.current ?? score, null);
      if (!liveXml?.trim()) {
        setAiProposalApplyError('Unable to read the current score to rebase the proposal.');
        return;
      }
      captureAiProposal(null, liveXml);
      setAiBaseXml(liveXml);
      setCompareView((prev) => (prev ? { ...prev, currentXml: liveXml } : prev));
      setAiError(null);
      setCompareAlignmentRevision((value) => value + 1);
    } finally {
      setCompareSwapBusy(false);
    }
  }, [
    compareView,
    compareSwapBusy,
    score,
    getScoreMusicXmlText,
    hasPendingCompareOperations,
    isCompareEditBusy,
    captureAiProposal,
    setAiBaseXml,
    setAiError,
    setAiProposalApplyError,
  ]);

  const setAiDiffBlockStatus = useCallback((block: AiDiffBlockRef, status: BlockReviewStatus) => {
    setAiDiffReviews((prev) => {
      const existing = prev.find((review) => review.blockKey === block.blockKey);
      if (existing) {
        return prev.map((review) =>
          review.blockKey === block.blockKey
            ? {
                ...review,
                status,
                contentSignature: block.contentSignature || review.contentSignature,
                comment: status === 'comment' ? review.comment : '',
                commentCommitted: false,
              }
            : review,
        );
      }
      return [
        ...prev,
        {
          partIndex: block.partIndex,
          blockIndex: block.blockIndex,
          blockKey: block.blockKey,
          measureRange: block.measureRange,
          contentSignature: block.contentSignature,
          status,
          comment: '',
          commentCommitted: false,
        },
      ];
    });
  }, []);

  const clearAiDiffBlockError = useCallback((blockKey: string) => {
    setAiDiffBlockErrors((prev) => {
      if (!prev[blockKey]) {
        return prev;
      }
      const next = { ...prev };
      delete next[blockKey];
      return next;
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

  const commitAiDiffBlockComment = useCallback(
    (block: AiDiffBlockRef) => {
      const existing = resolveAiDiffReview(block);
      const nextComment = getAiDiffBlockCommentValue(block, existing?.comment ?? '');
      const trimmed = nextComment.trim();
      if (!trimmed) {
        setAiDiffBlockErrors((prev) => ({
          ...prev,
          [block.blockKey]: 'Enter a comment before clicking Enter.',
        }));
        return;
      }
      setAiDiffReviews((prev) =>
        prev.map((review) =>
          review.blockKey === block.blockKey
            ? { ...review, status: 'comment', comment: trimmed, commentCommitted: true }
            : review,
        ),
      );
      setAiDiffBlockErrors((prev) => {
        if (!prev[block.blockKey]) {
          return prev;
        }
        const next = { ...prev };
        delete next[block.blockKey];
        return next;
      });
    },
    [resolveAiDiffReview, getAiDiffBlockCommentValue],
  );

  const editAiDiffBlockComment = useCallback((block: AiDiffBlockRef) => {
    setAiDiffReviews((prev) =>
      prev.map((review) =>
        review.blockKey === block.blockKey
          ? { ...review, status: 'comment', commentCommitted: false }
          : review,
      ),
    );
  }, []);

  const handleAiDiffCommentResize = useCallback(
    (element: HTMLTextAreaElement) => {
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
      const clampedWidth = Math.min(
        AI_DIFF_GUTTER_MAX_WIDTH,
        Math.max(AI_DIFF_GUTTER_MIN_WIDTH, nextWidth),
      );
      setAiDiffGutterWidth((prev) => (Math.abs(prev - clampedWidth) >= 2 ? clampedWidth : prev));
    },
    [isAiCompareMode],
  );

  const bindAiDiffCommentTextarea = useCallback(
    (blockKey: string, element: HTMLTextAreaElement | null) => {
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
    },
    [handleAiDiffCommentResize],
  );

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
      const clampedWidth = Math.min(
        AI_DIFF_GUTTER_MAX_WIDTH,
        Math.max(AI_DIFF_GUTTER_MIN_WIDTH, nextWidth),
      );
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

  const handleAcceptAiDiffBlock = useCallback(
    async (block: AiDiffBlockRef, pairs: Array<{ leftIndex: number; rightIndex: number }>) => {
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
          [block.blockKey]:
            getAiProposalApplyError() || 'Could not apply this block. Please retry.',
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
    },
    [
      compareLeftScore,
      compareRightScoreDisplay,
      getAiProposalApplyError,
      handleCompareOverwriteBlock,
      setAiDiffBlockStatus,
    ],
  );

  const handleAddAiMeasureComment = useCallback(() => {
    const anchor = aiFocusedMeasureAnchor;
    const text = aiMeasureThreadDraft.trim();
    if (!anchor || !text) {
      return;
    }
    const comment: AiThreadComment = {
      id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      author: 'you',
      text,
      createdAt: new Date().toISOString(),
    };
    setAiMeasureThreads((prev) => {
      const existing = prev[anchor.key];
      const thread: AiMeasureThread = existing
        ? { ...existing, comments: [...existing.comments, comment] }
        : { ...anchor, comments: [comment] };
      return { ...prev, [anchor.key]: thread };
    });
    setAiMeasureThreadDraft('');
  }, [aiFocusedMeasureAnchor, aiMeasureThreadDraft]);

  const handleRemoveAiMeasureComment = useCallback((key: string, commentId: string) => {
    setAiMeasureThreads((prev) => {
      const thread = prev[key];
      if (!thread) {
        return prev;
      }
      const comments = thread.comments.filter((entry) => entry.id !== commentId);
      const next = { ...prev };
      if (comments.length === 0) {
        delete next[key];
      } else {
        next[key] = { ...thread, comments };
      }
      return next;
    });
  }, []);

  const mergeAiAnnotations = useCallback((annotations: PatchAnnotation[] | undefined | null) => {
    if (!annotations || annotations.length === 0) {
      return;
    }
    setAiMeasureThreads((prev) => {
      const next = { ...prev };
      for (const annotation of annotations) {
        const comment = annotation.comment.trim();
        if (!comment) {
          continue;
        }
        const key = `${annotation.partIndex}:m${annotation.measure}`;
        const existing = next[key];
        if (
          existing?.comments.some((entry) => entry.author === 'assistant' && entry.text === comment)
        ) {
          continue; // avoid duplicating the same note across re-parses/regenerations
        }
        const threadComment: AiThreadComment = {
          id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          author: 'assistant',
          text: comment,
          createdAt: new Date().toISOString(),
        };
        next[key] = existing
          ? { ...existing, comments: [...existing.comments, threadComment] }
          : {
              key,
              partIndex: annotation.partIndex,
              measureNumber: annotation.measure,
              // annotation.measure is base/current numbering (matches the click anchor).
              leftIndex: annotation.measure - 1,
              rightIndex: null,
              comments: [threadComment],
            };
      }
      return next;
    });
  }, []);

  const handleSendDiffFeedback = useCallback(async () => {
    if (
      !compareView ||
      !isAiCompareMode ||
      aiBusy ||
      aiDiffFeedbackBusy ||
      isCompareEditBusy() ||
      hasPendingCompareOperations()
    ) {
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

    const acceptedReviews = aiDiffReviews.filter(
      (review) => getReviewStatusForFeedback(review) === 'accepted',
    );
    const blockMap = new Map<
      string,
      {
        partIndex: number;
        measureRange: string;
        status: BlockReviewStatus;
        comment?: string;
      }
    >();
    acceptedReviews.forEach((review) => {
      blockMap.set(review.blockKey, {
        partIndex: review.partIndex,
        measureRange: review.measureRange,
        status: review.status,
        comment: review.comment,
      });
    });
    aiDiffCurrentBlocks.forEach((block) => {
      const review = resolveAiDiffReview(block);
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
    // Fold measure-level thread notes into the feedback as per-measure comment blocks so
    // the model sees them on the next regeneration.
    const threadFeedbackBlocks = Object.values(aiMeasureThreads)
      .map((thread) => {
        const userText = thread.comments
          .filter((entry) => entry.author === 'you')
          .map((entry) => entry.text.trim())
          .filter(Boolean)
          .join('\n');
        return userText
          ? {
              partIndex: thread.partIndex,
              measureRange: String(thread.measureNumber),
              status: 'comment' as const,
              comment: userText,
            }
          : null;
      })
      .filter(
        (
          block,
        ): block is {
          partIndex: number;
          measureRange: string;
          status: 'comment';
          comment: string;
        } => block !== null,
      );
    const allFeedbackBlocks = [...feedbackBlocks, ...threadFeedbackBlocks];
    const commentBlockKeys = feedbackEntries
      .filter((block) => block.status === 'comment')
      .map((block) => block.blockKey);

    const currentXml = await aiScoreBridge.getLiveXml(compareView.currentXml);
    if (!currentXml?.trim()) {
      const message = 'Unable to export the current score for feedback.';
      setAiError(message);
      setAiDiffFeedbackError(message);
      setCompareRightError(message);
      return;
    }
    const proposalXml =
      (await getScoreMusicXmlText(compareRightScore, compareView.checkpointXml)) ||
      compareView.checkpointXml;
    const userEditDiffs = compareEditedRoles
      .map((role): CompareUserEditDiff | null => {
        const beforeXml = getCompareEditBaseline(role);
        const afterXml = role === 'current' ? currentXml : proposalXml;
        if (!beforeXml) {
          return null;
        }
        const label = role === 'current' ? 'Current score' : 'Assistant proposal';
        const diff = buildCompareUserEditDiff(beforeXml, afterXml, label);
        return diff ? { side: role, label, diff } : null;
      })
      .filter((edit): edit is CompareUserEditDiff => edit !== null);
    if (!allFeedbackBlocks.length && !aiDiffGlobalComment.trim() && !userEditDiffs.length) {
      return;
    }
    const previousCheckpointXml = compareView.checkpointXml;
    const previousContinuity = snapshotAiProposalContinuity();
    const previousEditCycle = captureCompareEditCycle();
    const editRequest = beginAiEdit('feedback', 'Preparing feedback context');
    const requestController = editRequest.controller;
    let requestOutcome: 'success' | 'failure' | 'cancelled' = 'failure';
    setAiError(null);
    setAiPatchError(null);
    setAiDiffFeedbackError(null);
    setXmlSidebarTab('assistant');
    setXmlSidebarMode((prev) => (prev === 'closed' ? 'open' : prev));
    invalidateCompareOperations();
    setCompareView(null);
    setCompareRightLoading(false);
    setCompareRightError(null);
    try {
      // The session snapshot (not the live sidebar toggle) decides chat inclusion; a
      // lazily created session adopts the current iteration so the server's
      // cycle-consistency check holds for pre-session compare views. A cycle that no
      // longer matches the iteration counter means local state diverged, so the
      // previous-cycle claim is dropped rather than relabeled with a new cycle.
      const existingSession = getAiProposalSession();
      const proposalSession: ClientProposalSession = existingSession
        ? existingSession.cycle === aiDiffIteration + 1
          ? existingSession
          : { ...existingSession, cycle: aiDiffIteration + 1, previousCycle: null }
        : {
            ...createClientProposalSession({
              originalInstruction: aiPrompt.trim(),
              includeChat: aiIncludeChat,
            }),
            cycle: aiDiffIteration + 1,
          };
      setAiProposalSession(proposalSession);
      const expectedHashes = getAiProposalExpectedHashes();
      const response = await fetch(resolveScoreEditorApiPath('/api/music/diff/feedback'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        signal: requestController.signal,
        body: JSON.stringify({
          content: currentXml,
          blocks: allFeedbackBlocks,
          userEdits: userEditDiffs,
          globalComment: aiDiffGlobalComment,
          iteration: aiDiffIteration,
          provider: aiProvider,
          model: aiModel.trim(),
          apiKey: aiApiKey.trim(),
          editEffort: aiEditEffort,
          maxTokens: aiMaxTokensMode === 'custom' ? aiMaxTokens : null,
          temperature: aiTemperatureMode === 'custom' ? aiTemperature : null,
          ...(proposalSession.includeChat ? { chatHistory: aiChatMessages } : {}),
          proposalSession: buildProposalSessionRequestPayload(proposalSession, {
            contentHash: expectedHashes.contentHash,
            identityHash: expectedHashes.identityHash,
          }),
        }),
      });
      captureApiTraceContext(response.headers);
      const serviceResponse = await readAiEditServiceResponse(response, (update) =>
        updateAiEditProgress(editRequest, update),
      );
      const result = asRecord(serviceResponse.body) || {};
      if (serviceResponse.status >= 400) {
        if (result.patch && typeof result.patch === 'object') {
          setAiOutput(JSON.stringify(result.patch, null, 2));
        }
        const message =
          typeof result.error === 'string'
            ? result.error
            : `Request failed: ${serviceResponse.status}`;
        throw new Error(message);
      }

      const patchPayload = asRecord(result.patch);
      const parsedPatch = parseMusicXmlPatch(JSON.stringify(patchPayload || {}));
      if (parsedPatch.error || !parsedPatch.patch) {
        throw new Error(parsedPatch.error || 'Service returned an invalid patch payload.');
      }
      const editProposal = findAiEditProposal(result);
      const proposedXml =
        editProposal?.proposedXml ||
        (typeof result.proposedXml === 'string' ? result.proposedXml.trim() : '');
      if (!proposedXml) {
        throw new Error('Service returned empty proposed MusicXML.');
      }
      const proposalBaseXml = editProposal?.baseXml || currentXml;

      setAiOutput(JSON.stringify(parsedPatch.patch, null, 2));
      setAiPatch(parsedPatch.patch);
      setAiPatchError(null);
      setAiPatchedXml(proposedXml);
      setAiBaseXml(proposalBaseXml);
      // A successful response begins a new proposal cycle. Do this explicitly
      // rather than relying on the transient closed-modal effect so a second
      // edit cannot diff against the prior proposal generation.
      clearCompareEditCycle();
      // Keep the standard orientation (Current left/red, Proposal right/green) so Apply
      // writes the proposal into the document. See openAiProposalCompare.
      setCompareSwapped(true);
      captureAiProposal(editProposal, proposalBaseXml);
      setCompareView({
        title: 'Assistant Proposal',
        currentXml: proposalBaseXml,
        checkpointXml: proposedXml,
        currentLabel: 'Current',
        checkpointLabel: 'Assistant Proposal',
      });
      setAiDiffIteration(
        typeof result.iteration === 'number' ? result.iteration : aiDiffIteration + 1,
      );
      setAiDiffReviews((prev) => prev.filter((review) => review.status === 'accepted'));
      setAiDiffGlobalComment('');
      setAiDiffFeedbackError(null);
      setAiDiffBlockErrors({});
      const revisionAnnotations = extractPatchAnnotations({
        annotations: (result as Record<string, unknown>).annotations,
      });
      setAiProposalSession(
        advanceClientProposalSession(proposalSession, {
          responseId: result.proposalSessionId,
          newCycle: result.cycle,
          proposal: editProposal,
          patch: parsedPatch.patch,
          annotations: revisionAnnotations,
          continuityToken: result.continuityToken,
          sentBlocks: allFeedbackBlocks,
          sentGlobalComment: aiDiffGlobalComment,
        }),
      );
      const feedbackAudit = asRecord(result.audit);
      setAiProposalAudit({
        ...(feedbackAudit ?? {}),
        cycle:
          typeof feedbackAudit?.cycle === 'number'
            ? feedbackAudit.cycle
            : typeof result.cycle === 'number'
              ? result.cycle
              : aiDiffIteration + 2,
        verification: result.verification,
      });
      // Surface the assistant's annotations for this revision as measure-thread notes.
      mergeAiAnnotations(revisionAnnotations);
      setCompareAlignmentRevision((value) => value + 1);
      requestOutcome = 'success';
    } catch (err) {
      const wasCancelled =
        requestController.signal.aborted &&
        requestController.signal.reason instanceof DOMException &&
        requestController.signal.reason.name === 'AbortError';
      const rawMessage = errorMessage(err) || 'Failed to request revised proposal.';
      const surfacedMessage = formatAiDiffFeedbackError(rawMessage);
      if (wasCancelled) {
        requestOutcome = 'cancelled';
      }
      setAiError(wasCancelled ? null : surfacedMessage);
      setAiDiffFeedbackError(wasCancelled ? null : surfacedMessage);
      setCompareRightError(wasCancelled ? null : surfacedMessage);
      if (!wasCancelled && commentBlockKeys.length > 0) {
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
        checkpointXml: proposalXml || previousCheckpointXml,
        currentLabel: 'Current',
        checkpointLabel: 'Assistant Proposal',
      });
      restoreCompareEditCycle(previousEditCycle);
      restoreAiProposalContinuity({
        ...previousContinuity,
        baseXml: previousContinuity.baseXml || currentXml,
      });
    } finally {
      finishAiEdit(editRequest, requestOutcome);
      setCompareRightLoading(false);
    }
  }, [
    aiScoreBridge,
    compareView,
    isAiCompareMode,
    aiDiffFeedbackBusy,
    beginAiEdit,
    captureCompareEditCycle,
    captureAiProposal,
    clearCompareEditCycle,
    finishAiEdit,
    getAiProposalExpectedHashes,
    getAiProposalSession,
    getCompareEditBaseline,
    hasPendingCompareOperations,
    isCompareEditBusy,
    restoreAiProposalContinuity,
    restoreCompareEditCycle,
    setAiBaseXml,
    setAiError,
    setAiOutput,
    setAiPatch,
    setAiPatchError,
    setAiPatchedXml,
    setAiProposalAudit,
    setAiProposalSession,
    snapshotAiProposalContinuity,
    updateAiEditProgress,
    aiApiKey,
    aiModel,
    aiProvider,
    aiDiffReviews,
    compareEditedRoles,
    compareRightScore,
    aiMeasureThreads,
    mergeAiAnnotations,
    aiDiffCurrentBlocks,
    resolveAiDiffReview,
    getReviewStatusForFeedback,
    aiDiffGlobalComment,
    aiDiffIteration,
    getScoreMusicXmlText,
    invalidateCompareOperations,
    aiChatMessages,
    aiIncludeChat,
    aiBusy,
    aiEditEffort,
    aiMaxTokensMode,
    aiMaxTokens,
    aiTemperatureMode,
    aiTemperature,
    aiPrompt,
    captureApiTraceContext,
    parseMusicXmlPatch,
  ]);

  const parsePartsFromMetadata = useCallback((metadata: unknown): PartSummary[] => {
    const metadataRecord = asRecord(metadata);
    const parts = Array.isArray(metadataRecord?.parts) ? metadataRecord.parts : [];
    return parts.map((value, index) => {
      const part = asRecord(value);
      return {
        index,
        name: typeof part?.name === 'string' ? part.name : '',
        instrumentName: typeof part?.instrumentName === 'string' ? part.instrumentName : '',
        instrumentId: typeof part?.instrumentId === 'string' ? part.instrumentId : '',
        isVisible: String(part?.isVisible ?? '').toLowerCase() === 'true',
      };
    });
  }, []);

  const refreshScoreMetadata = async (currentScore: Score) => {
    try {
      const metadata = await runSerializedScoreOperation(() => currentScore.metadata(), 'metadata');
      setScoreTitle(typeof metadata.title === 'string' ? metadata.title : '');
      setScoreSubtitle(typeof metadata.subtitle === 'string' ? metadata.subtitle : '');
      setScoreComposer(typeof metadata.composer === 'string' ? metadata.composer : '');
      const lyricistValue =
        typeof metadata.lyricist === 'string'
          ? metadata.lyricist
          : typeof metadata.poet === 'string'
            ? metadata.poet
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

  const refreshInstrumentTemplates = useCallback(
    async (currentScore: Score) => {
      if (!currentScore.listInstrumentTemplates) {
        setInstrumentGroups([]);
        return;
      }
      try {
        const data = await runSerializedScoreOperation(
          () => Promise.resolve(currentScore.listInstrumentTemplates!()),
          'listInstrumentTemplates',
        );
        setInstrumentGroups(Array.isArray(data) ? (data as InstrumentTemplateGroup[]) : []);
      } catch (err) {
        console.warn('Failed to read instrument templates', err);
        setInstrumentGroups([]);
      }
    },
    [runSerializedScoreOperation],
  );

  useEffect(() => {
    if (!newScoreDialogOpen || !score) {
      return;
    }
    if (instrumentGroups.length > 0) {
      return;
    }
    void refreshInstrumentTemplates(score);
  }, [instrumentGroups.length, newScoreDialogOpen, refreshInstrumentTemplates, score]);

  const prefetchSoundFontBytes = useCallback(async (): Promise<{
    url: string;
    buf: Uint8Array;
  } | null> => {
    const source = (await soundFontManagerRef.current?.prefetch()) ?? null;
    return source ? { url: source.url, buf: source.bytes.slice() } : null;
  }, []);

  ensureSoundFontLoadedRef.current = async (targetScore, options) => {
    // scoreRef.current is updated synchronously the moment a newly loaded score
    // becomes "the" main score (see handleUrlLoad/handleFileUpload); the `score`
    // state closure can still be one render behind inside a deferred/background
    // warmup callback queued from within that same load. Comparing against the
    // ref (falling back to state before any score has ever loaded) avoids
    // misclassifying a freshly loaded main score as an auxiliary one.
    const currentMainScore = scoreRef.current ?? score;
    const activeScore = targetScore ?? currentMainScore;
    if (!activeScore || !activeScore.setSoundFont) {
      console.warn('[AUDIO] soundfont load skipped: setSoundFont unavailable');
      return false;
    }
    const isMainScore = activeScore === currentMainScore;
    const forceRetry = Boolean(options?.forceRetry);
    if (isMainScore && !soundFontManagerRef.current?.isApplied(activeScore)) {
      triedSoundFontRef.current = true;
      setTriedSoundFont(true);
    }
    const loaded =
      (await soundFontManagerRef.current?.ensure(activeScore, {
        forceRetry,
        install: (target, bytes) =>
          runSerializedScoreOperation(() => target.setSoundFont(bytes), 'setSoundFont'),
      })) ?? false;
    if (loaded && isMainScore) {
      soundFontLoadedRef.current = true;
      setSoundFontLoaded(true);
    }
    return loaded;
  };

  const handleSoundFontUpload = async (file: File) => {
    if (!score || !score.setSoundFont) {
      alert('SoundFont loading is not available in this build.');
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const data = new Uint8Array(buffer);
      // The manager retains pristine bytes, copies them across the worker
      // boundary, and invalidates every main/compare score installed from the
      // previous source version.
      soundFontManagerRef.current?.replace({ url: `uploaded:${file.name}`, bytes: data });
      const loaded =
        (await soundFontManagerRef.current?.ensure(score, {
          forceRetry: true,
          install: (target, bytes) =>
            runSerializedScoreOperation(() => target.setSoundFont(bytes), 'setSoundFont(upload)'),
        })) ?? false;
      if (!loaded) throw new Error('The uploaded soundfont could not be installed.');
      soundFontLoadedRef.current = true;
      triedSoundFontRef.current = true;
      setSoundFontLoaded(true);
      setTriedSoundFont(true);
    } catch (err) {
      console.error('Failed to load soundfont', err);
      alert(`Failed to load soundfont: ${err instanceof Error ? err.message : String(err)}`);
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
    const instrumentIds =
      newScoreInstrumentIds.length > 0
        ? newScoreInstrumentIds
        : newScoreInstrumentOptions.slice(0, 1).map((option) => option.id);
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
      pickup: newScoreWithPickup
        ? { numerator: newScorePickupNumerator, denominator: newScorePickupDenominator }
        : undefined,
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

  const loadOtsRevisionIntoEditor = useCallback(
    async (input: {
      revisionId: string;
      branchName: string;
      sequenceNumber?: number;
      telemetrySource: string;
    }) => {
      if (!otsSourceContext) {
        return;
      }
      const xml = await getSourceCanonicalXml({
        workId: otsSourceContext.workId,
        sourceId: otsSourceContext.sourceId,
        revisionId: input.revisionId,
      });
      const suffix = typeof input.sequenceNumber === 'number' ? `-${input.sequenceNumber}` : '';
      const file = new File(
        [new TextEncoder().encode(xml)],
        `${otsSourceContext.sourceId}${suffix}.musicxml`,
        { type: 'application/xml' },
      );
      setRuntimeLaunchContext(
        sanitizeEditorLaunchContext({
          ...(activeLaunchContext || {}),
          source: 'ourtextscores',
          workId: otsSourceContext.workId,
          sourceId: otsSourceContext.sourceId,
          revisionId: input.revisionId,
          branchName: input.branchName,
          canonicalXmlUrl: buildSourceCanonicalXmlUrl({
            workId: otsSourceContext.workId,
            sourceId: otsSourceContext.sourceId,
            revisionId: input.revisionId,
          }),
        } satisfies EditorLaunchContext),
      );
      setVersionsBranchName(input.branchName || versionsBranchName);
      await handleFileUpload(file, {
        scoreIdOverride: buildOtsScoreId(otsSourceContext.workId, otsSourceContext.sourceId),
        updateUrl: false,
        telemetrySource: input.telemetrySource,
      });
    },
    [activeLaunchContext, handleFileUpload, otsSourceContext, versionsBranchName],
  );

  const handleVersionsOpenRevision = async (revision: SourceHistoryRevision) => {
    if (!otsSourceContext) {
      return;
    }
    setVersionsActionError(null);
    setVersionsActionNotice(null);
    setLoading(true);
    try {
      await loadOtsRevisionIntoEditor({
        revisionId: revision.revisionId,
        branchName: revision.branchName || versionsBranchName,
        sequenceNumber: revision.sequenceNumber,
        telemetrySource: 'ots_history_open',
      });
    } catch (err) {
      console.error('Failed to open source revision', err);
      alert('Failed to open version. See console for details.');
    } finally {
      setLoading(false);
    }
  };

  const handleVersionsDiffRevision = useCallback(
    async (revision: SourceHistoryRevision) => {
      if (!otsSourceContext || !score) {
        alert('Load a score before opening a version diff.');
        return;
      }
      setVersionsActionBusy(true);
      setVersionsActionError(null);
      setVersionsActionNotice(null);
      try {
        const [currentData, revisionXml] = await Promise.all([
          getScoreXmlData(),
          getSourceCanonicalXml({
            workId: otsSourceContext.workId,
            sourceId: otsSourceContext.sourceId,
            revisionId: revision.revisionId,
          }),
        ]);
        if (!currentData) {
          return;
        }
        const currentXml = new TextDecoder().decode(currentData);
        setCompareSwapped(false);
        setCompareView({
          title: `Revision #${revision.sequenceNumber}`,
          currentXml,
          checkpointXml: revisionXml,
          currentLabel: 'Current',
          checkpointLabel: `Revision #${revision.sequenceNumber}`,
        });
      } catch (err) {
        console.error('Failed to diff source revision', err);
        setVersionsActionError(errorMessage(err) || 'Failed to load version diff.');
      } finally {
        setVersionsActionBusy(false);
      }
    },
    [otsSourceContext, score, getScoreXmlData],
  );

  const handleVersionsDiffAgainstBase = useCallback(
    async (revision: SourceHistoryRevision) => {
      if (
        !otsSourceContext ||
        !versionsSelectedBaseRevisionId ||
        versionsSelectedBaseRevisionId === revision.revisionId
      ) {
        return;
      }
      const baseRevision = sourceHistory?.revisions.find(
        (candidate) => candidate.revisionId === versionsSelectedBaseRevisionId,
      );
      if (!baseRevision) {
        setVersionsActionError('Selected base revision is no longer available on this branch.');
        return;
      }
      setVersionsActionError(null);
      setVersionsActionNotice(null);
      try {
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set(
          'compareLeft',
          buildSourceCanonicalXmlUrl({
            workId: otsSourceContext.workId,
            sourceId: otsSourceContext.sourceId,
            revisionId: baseRevision.revisionId,
          }),
        );
        nextUrl.searchParams.set(
          'compareRight',
          buildSourceCanonicalXmlUrl({
            workId: otsSourceContext.workId,
            sourceId: otsSourceContext.sourceId,
            revisionId: revision.revisionId,
          }),
        );
        nextUrl.searchParams.set('leftLabel', `Revision #${baseRevision.sequenceNumber}`);
        nextUrl.searchParams.set('rightLabel', `Revision #${revision.sequenceNumber}`);
        nextUrl.searchParams.delete('score');
        nextUrl.searchParams.delete('scoreId');
        nextUrl.searchParams.delete('launchContext');
        const opened = window.open(nextUrl.toString(), '_blank', 'noopener,noreferrer');
        if (!opened) {
          setVersionsActionError('Popup blocked. Allow popups to open the revision diff.');
        }
      } catch (err) {
        console.error('Failed to open revision diff', err);
        setVersionsActionError(errorMessage(err) || 'Failed to open revision diff.');
      }
    },
    [otsSourceContext, sourceHistory, versionsSelectedBaseRevisionId],
  );

  const handleVersionsOpenChangeReview = useCallback(
    async (revision: SourceHistoryRevision) => {
      if (!otsSourceContext) {
        return;
      }
      const branchName =
        (revision.branchName || revision.fossilBranch || 'trunk').trim() || 'trunk';
      const branch =
        sourceHistory?.branches.find((candidate) => candidate.name === branchName) || null;
      if (branch?.policy === 'owner_approval') {
        setVersionsActionError('Change reviews are not available for owner approval branches.');
        return;
      }
      setVersionsActionBusy(true);
      setVersionsActionError(null);
      setVersionsActionNotice(null);
      try {
        const response = await fetch(
          `/api/proxy/works/${encodeURIComponent(otsSourceContext.workId)}/sources/${encodeURIComponent(otsSourceContext.sourceId)}/branches/${encodeURIComponent(branchName)}/change-review`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              title: `CR for ${branchName}`,
            }),
          },
        );
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `Failed to open change review (${response.status})`);
        }
        const data = asRecord(await response.json().catch(() => ({})));
        const reviewId = typeof data?.reviewId === 'string' ? data.reviewId : '';
        if (!reviewId) {
          throw new Error('Change review response did not include a review ID.');
        }
        const reviewUrl = `/change-reviews/${encodeURIComponent(reviewId)}`;
        const opened = window.open(reviewUrl, '_blank', 'noopener,noreferrer');
        if (!opened) {
          window.location.assign(reviewUrl);
        }
        setVersionsActionNotice(`Opened CR for branch "${branchName}".`);
      } catch (err) {
        console.error('Failed to open change review', err);
        setVersionsActionError(errorMessage(err) || 'Failed to open change review.');
      } finally {
        setVersionsActionBusy(false);
      }
    },
    [otsSourceContext, sourceHistory],
  );

  const handleVersionsLoadBranchHead = useCallback(async () => {
    if (!sourceHistory?.selectedBranch) {
      return;
    }
    const selectedBranch = sourceHistory.selectedBranch;
    const targetRevisionId = selectedBranch.headRevisionId || selectedBranch.baseRevisionId;
    if (!targetRevisionId) {
      setVersionsActionError('This branch does not have a loadable revision yet.');
      return;
    }
    const targetRevision = sourceHistory.revisions.find(
      (revision) => revision.revisionId === targetRevisionId,
    );
    setVersionsActionError(null);
    setVersionsActionNotice(null);
    setLoading(true);
    try {
      await loadOtsRevisionIntoEditor({
        revisionId: targetRevisionId,
        branchName: selectedBranch.name,
        sequenceNumber: targetRevision?.sequenceNumber,
        telemetrySource: selectedBranch.headRevisionId
          ? 'ots_branch_head_open'
          : 'ots_branch_base_open',
      });
    } catch (err) {
      console.error('Failed to load selected branch revision', err);
      setVersionsActionError(errorMessage(err) || 'Failed to load selected branch.');
    } finally {
      setLoading(false);
    }
  }, [loadOtsRevisionIntoEditor, sourceHistory]);

  const handleVersionsCreateBranch = useCallback(async () => {
    if (!otsSourceContext) {
      return;
    }
    const branchName = versionsCreateBranchName.trim();
    if (!branchName) {
      alert('Enter a branch name first.');
      return;
    }
    setVersionsActionBusy(true);
    setVersionsActionError(null);
    setVersionsActionNotice(null);
    try {
      const targetRevisionId = resolveVersionsTargetRevisionId();
      await createSourceBranch({
        workId: otsSourceContext.workId,
        sourceId: otsSourceContext.sourceId,
        request: {
          name: branchName,
          policy: versionsCreateBranchPolicy,
          baseRevisionId: targetRevisionId,
        },
      });
      setVersionsCreateBranchName('');
      setVersionsBranchName(branchName);
      setVersionsActionNotice(`Created branch "${branchName}".`);
      await refreshSourceHistory(branchName);
    } catch (err) {
      console.error('Failed to create source branch', err);
      setVersionsActionError(errorMessage(err) || 'Failed to create branch.');
    } finally {
      setVersionsActionBusy(false);
    }
  }, [
    otsSourceContext,
    refreshSourceHistory,
    resolveVersionsTargetRevisionId,
    versionsCreateBranchName,
    versionsCreateBranchPolicy,
  ]);

  const handleVersionsCommitCurrent = useCallback(async () => {
    if (!otsSourceContext) {
      return;
    }
    if (!score) {
      alert('Load a score before creating a version.');
      return;
    }
    setVersionsActionBusy(true);
    setVersionsActionError(null);
    setVersionsActionNotice(null);
    try {
      const data = await getScoreXmlData();
      if (!data) {
        return;
      }
      const branch = versionsBranchName.trim() || 'trunk';
      const selectedBranch = sourceHistory?.selectedBranch;
      if (selectedBranch?.lifecycle === 'closed') {
        setVersionsActionError(
          'This branch is closed while its change review is closed. Reopen the CR before committing.',
        );
        return;
      }
      const targetRevisionId =
        selectedBranch?.headRevisionId ||
        selectedBranch?.baseRevisionId ||
        otsSourceContext.revisionId ||
        activeLaunchContext?.revisionId ||
        undefined;
      const filenameBase = scoreTitle ? toSafeFilename(scoreTitle) : otsSourceContext.sourceId;
      const file = new File([toOwnedBytes(data)], `${filenameBase || 'score'}.musicxml`, {
        type: 'application/xml',
      });
      const form = new FormData();
      form.append('file', file);
      if (versionsCommitMessage.trim()) {
        form.append('commitMessage', versionsCommitMessage.trim());
      }
      form.append('branchName', branch);
      if (targetRevisionId) {
        form.append('expectedHeadRevisionId', targetRevisionId);
        form.append('baseRevisionId', targetRevisionId);
      }

      const result = await commitSourceRevision({
        workId: otsSourceContext.workId,
        sourceId: otsSourceContext.sourceId,
        body: form,
      });
      const nextRevisionId = result.revisionId;
      setRuntimeLaunchContext(
        sanitizeEditorLaunchContext({
          ...(activeLaunchContext || {}),
          source: 'ourtextscores',
          workId: otsSourceContext.workId,
          sourceId: otsSourceContext.sourceId,
          revisionId: nextRevisionId,
          branchName: branch,
          canonicalXmlUrl: buildSourceCanonicalXmlUrl({
            workId: otsSourceContext.workId,
            sourceId: otsSourceContext.sourceId,
            revisionId: nextRevisionId,
          }),
        } satisfies EditorLaunchContext),
      );
      setVersionsCommitMessage('');
      setVersionsBranchName(branch);
      setVersionsActionNotice(result.message || 'Created a new revision.');
      await refreshSourceHistory(branch);
    } catch (err) {
      console.error('Failed to commit source revision', err);
      if (err instanceof OurTextScoresApiError && err.status === 409) {
        const details = asRecord(err.details);
        if (details?.error === 'branch_closed_for_review') {
          setVersionsActionError(
            'This branch is closed while its change review is closed. Reopen the CR before committing.',
          );
        } else {
          const actualHeadSequenceNumber =
            typeof details?.actualHeadSequenceNumber === 'number'
              ? details.actualHeadSequenceNumber
              : null;
          setVersionsActionError(
            actualHeadSequenceNumber !== null
              ? `Branch head changed. Refresh and review revision #${actualHeadSequenceNumber} before committing.`
              : 'Branch head changed. Refresh and review the latest branch revision before committing.',
          );
        }
      } else {
        setVersionsActionError(errorMessage(err) || 'Failed to commit current score.');
      }
    } finally {
      setVersionsActionBusy(false);
    }
  }, [
    otsSourceContext,
    score,
    getScoreXmlData,
    versionsBranchName,
    sourceHistory,
    activeLaunchContext,
    scoreTitle,
    versionsCommitMessage,
    refreshSourceHistory,
  ]);

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
      const buffer = toOwnedArrayBuffer(data);
      const title = buildCheckpointTitle(checkpointLabel, scoreTitle);
      await saveCheckpoint({
        title,
        createdAt: Date.now(),
        format: 'musicxml',
        data: buffer,
        size: data.byteLength,
        scoreId: activeScoreId,
        ...buildCheckpointMetadata(),
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

  const handleSaveCompareCheckpoint = useCallback(
    async (side: 'left' | 'right') => {
      if (!compareView) {
        return;
      }
      if (!isIndexedDbAvailable()) {
        alert('IndexedDB is not available in this browser.');
        return;
      }

      const targetIsCurrent = side === 'left' ? compareLeftIsCurrent : compareRightIsCurrent;
      const customLabel =
        side === 'left' ? compareLeftCheckpointLabel : compareRightCheckpointLabel;
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
          data: toOwnedArrayBuffer(xmlData),
          size: xmlData.byteLength,
          scoreId: activeScoreId,
          ...buildCheckpointMetadata({
            branchName: targetIsCurrent ? activeLaunchContext?.branchName : versionsBranchName,
          }),
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
    },
    [
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
      buildCheckpointMetadata,
      activeLaunchContext?.branchName,
      versionsBranchName,
      loadCheckpointList,
    ],
  );

  const handleRestoreCheckpoint = async (checkpoint: CheckpointSummary) => {
    if (!isIndexedDbAvailable()) {
      alert('IndexedDB is not available in this browser.');
      return;
    }
    if (typeof window !== 'undefined') {
      const ok = window.confirm(
        `Restore checkpoint "${checkpoint.title}"? Unsaved changes will be lost.`,
      );
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
      setCompareView({
        title: checkpoint.title,
        currentXml,
        checkpointXml,
        currentLabel: 'Current',
        checkpointLabel: checkpoint.title,
      });
    } catch (err) {
      console.error('Failed to compare checkpoint', err);
      alert('Failed to compare checkpoint. See console for details.');
    } finally {
      setCheckpointBusy(false);
    }
  };

  const handleOpenScoreInEditor = useCallback(
    (side: 'left' | 'right') => {
      if (!compareView) return;

      // Get the XML for the selected side
      const xml = side === 'left' ? compareLeftXml : compareRightXml;
      const label = side === 'left' ? compareLeftLabel : compareRightLabel;

      // Store XML in sessionStorage for the new tab to pick up
      const filename = `${label.replace(/[^a-zA-Z0-9]/g, '_')}.xml`;
      sessionStorage.setItem(
        'openInEditor',
        JSON.stringify({
          xml,
          filename,
          launchContext: activeLaunchContext || undefined,
        }),
      );

      // Open a new tab with the full editor. Only the embed build is served under the
      // /score-editor basePath (next.config.ts) as a static export with an index.html;
      // every other deployment serves the app at the root, where that URL is a 404.
      // Mirrors the same guard in components/toolbar/sections/HelpSection.tsx.
      window.open(
        process.env.NEXT_PUBLIC_BUILD_MODE === 'embed' ? '/score-editor/index.html' : '/',
        '_blank',
      );
    },
    [
      activeLaunchContext,
      compareView,
      compareLeftXml,
      compareRightXml,
      compareLeftLabel,
      compareRightLabel,
    ],
  );

  const handleCloseCompareView = useCallback(() => {
    // Invalidate synchronously in the click event; waiting for the effect that
    // observes compareView=null would leave a window for stale async work to
    // publish or render.
    invalidateCompareOperations();
    setCompareView(null);
  }, [invalidateCompareOperations]);

  useEffect(() => {
    if (!compareView) {
      invalidateCompareOperations();
      // awaitCancel keeps the batch-iterator cancellation inside the tracked
      // operation, so queueCompareScoreTeardown drains it before destroy().
      void stopCompareSideAudio('left', { awaitCancel: true });
      void stopCompareSideAudio('right', { awaitCancel: true });
      const auxiliaryScore = compareRightScoreRef.current;
      void queueCompareScoreTeardown(auxiliaryScore, scoreRef.current, 'compare-close');
      compareLoadedCheckpointXmlRef.current = null;
      setCompareRightScore(null);
      setCompareRightParts([]);
      setCompareRightPageCount(1);
      setCompareRightLoading(false);
      setCompareRightError(null);
      setCompareFitZoom(0.5);
      setCompareZoom(null);
      setCompareActiveSide(null);
      resetCompareEditing();
      setPalettesOpen(false);
      setPaletteCategory(null);
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
        setAiMeasureThreads({});
        setAiFocusedMeasureAnchor(null);
        setAiMeasureThreadDraft('');
        setAiDiffIteration(0);
        setAiDiffGlobalComment('');
        setAiDiffFeedbackError(null);
        setAiDiffBlockErrors({});
        clearAiProposal();
        setAiDiffGutterWidth(AI_DIFF_GUTTER_DEFAULT_WIDTH);
      }
      return;
    }

    // Only reload checkpoint score if the XML has actually changed
    if (compareLoadedCheckpointXmlRef.current === compareView.checkpointXml) {
      return;
    }

    invalidateCompareOperations();
    let canceled = false;
    const loadCompareScore = async () => {
      // The checkpoint side is being replaced -- stop whichever visual side is
      // currently playing it before the underlying Score instance is destroyed.
      await stopCompareSideAudio('left', { awaitCancel: true });
      await stopCompareSideAudio('right', { awaitCancel: true });
      if (canceled) {
        return;
      }
      setCompareRightLoading(true);
      setCompareRightError(null);
      const scoreToReplace = compareRightScoreRef.current;
      await queueCompareScoreTeardown(scoreToReplace, null, 'compare-checkpoint-reload');
      if (canceled) {
        return;
      }
      setCompareRightScore(null);
      resetCompareEditingRole('proposal');
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
  }, [
    compareView,
    parsePartsFromMetadata,
    aiDiffFeedbackBusy,
    clearAiProposal,
    invalidateCompareOperations,
    queueCompareScoreTeardown,
    resetCompareEditing,
    resetCompareEditingRole,
    runSerializedScoreOperation,
    stopCompareSideAudio,
  ]);

  useEffect(() => {
    return () => {
      invalidateCompareOperations();
      void stopCompareSideAudio('left', { awaitCancel: true });
      void stopCompareSideAudio('right', { awaitCancel: true });
      const auxiliaryScore = compareRightScoreRef.current;
      void queueCompareScoreTeardown(auxiliaryScore, scoreRef.current, 'score-editor-unmount');
    };
  }, [invalidateCompareOperations, queueCompareScoreTeardown, stopCompareSideAudio]);

  const prevCompareLiveSelectionScoreRef = useRef<Score | null>(null);
  useEffect(() => {
    if (
      compareView &&
      prevCompareLiveSelectionScoreRef.current &&
      prevCompareLiveSelectionScoreRef.current !== score
    ) {
      resetCompareEditingRole('current');
    }
    prevCompareLiveSelectionScoreRef.current = score;
  }, [compareView, resetCompareEditingRole, score]);

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
    void renderScoreToContainer(
      compareLeftScore,
      compareLeftContainerRef.current,
      targetPage,
      true,
    ).then(() => {
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
    void renderScoreToContainer(
      compareRightScoreDisplay,
      compareRightContainerRef.current,
      targetPage,
      true,
    )
      .then((rendered) => {
        if (!rendered && !compareRightError && isCheckpoint) {
          setCompareRightError(
            'Unable to render compare score. The proposal may contain invalid MusicXML.',
          );
          return;
        }
        syncCompareSvgSize(compareRightContainerRef.current, setCompareRightSvgSize);
        void refreshMeasurePositions(
          compareRightScoreDisplay,
          setCompareRightMeasurePositions,
        ).then((ok) => {
          if (!ok && isCheckpoint) {
            setCompareRightError(
              (prev) => prev ?? 'Unable to compute compare highlights for checkpoint score.',
            );
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
        void Promise.resolve(score.setLayoutMode(restoreMode))
          .then(() => renderScore(score, currentPageRef.current))
          .catch((err: unknown) => {
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
    const currentScore = score;
    const checkpointScore = compareRightScore;
    const leftScore = compareLeftScore;
    const rightScore = compareRightScoreDisplay;
    if (!leftScore || !rightScore) {
      setCompareContinuousMode(false);
      return;
    }

    let canceled = false;
    const enableContinuous = async () => {
      try {
        if (compareLayoutRestoreRef.current === null && currentScore.getLayoutMode) {
          compareLayoutRestoreRef.current = await currentScore.getLayoutMode();
        }
        const targetLayout = compareReflowMode ? LAYOUT_MODES.SYSTEM : LAYOUT_MODES.LINE;
        await currentScore.setLayoutMode!(targetLayout);
        await checkpointScore.setLayoutMode!(targetLayout);
        if (canceled) {
          return;
        }
        setCompareContinuousMode(true);
        const targetPage = 0;
        // Use swapped scores to render to the correct panes
        await renderScoreToContainer(leftScore, compareLeftContainerRef.current, targetPage, true);
        syncCompareSvgSize(compareLeftContainerRef.current, setCompareLeftSvgSize);
        await renderScoreToContainer(
          rightScore,
          compareRightContainerRef.current,
          targetPage,
          true,
        );
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
  }, [
    compareView,
    score,
    compareRightScore,
    compareReflowMode,
    renderScore,
    renderScoreToContainer,
    syncCompareSvgSize,
    compareLeftScore,
    compareRightScoreDisplay,
  ]);

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
    let canceled = false;
    const isCurrent = () => !canceled;

    const clearAlignmentSpacers = async () => {
      const applied = compareAppliedSpacersRef.current;
      compareAppliedSpacersRef.current = [];
      for (const spacer of applied) {
        try {
          await spacer.score.setMeasureSpacer?.(spacer.measureIndex, spacer.staffIndex, 0);
        } catch (err) {
          console.warn('Failed to remove compare alignment spacer:', err);
        }
      }
    };

    const enqueueReflow = (operation: () => Promise<void>) => {
      const queued = compareReflowQueueRef.current.catch(() => {}).then(operation);
      compareReflowQueueRef.current = queued;
      void queued.catch((err) => {
        console.warn('Failed to update compare reflow:', err);
      });
    };

    if (!compareView) {
      const restore = compareLineBreakRestoreRef.current;
      compareLineBreakRestoreRef.current = null;
      if (restore || compareAppliedSpacersRef.current.length) {
        enqueueReflow(async () => {
          await clearAlignmentSpacers();
          if (restore && score) {
            await applyMeasureLineBreaks(score, restore.live);
          }
        });
      }
      return () => {
        canceled = true;
      };
    }

    if (!compareReflowMode) {
      const restore = compareLineBreakRestoreRef.current;
      compareLineBreakRestoreRef.current = null;
      const restoreLeftPaneScore = compareLeftScore;
      const restoreRightPaneScore = compareRightScoreDisplay;
      if (restore || compareAppliedSpacersRef.current.length) {
        enqueueReflow(async () => {
          await clearAlignmentSpacers();
          if (
            !restore ||
            !score ||
            !compareRightScore ||
            !compareSupportsReflow ||
            !restoreLeftPaneScore ||
            !restoreRightPaneScore
          ) {
            return;
          }
          await applyMeasureLineBreaks(score, restore.live);
          await applyMeasureLineBreaks(compareRightScore, restore.auxiliary);
          if (!isCurrent()) {
            return;
          }
          const targetPage = compareContinuousMode ? 0 : currentPageRef.current;
          // Pane content must follow the orientation mapping, not the raw
          // live/auxiliary scores: which pane holds the live score depends on the
          // compare mode, so rendering `score` straight into the left container puts
          // each score in the other pane and writes the wrong score's measure
          // positions into the state that click hit-testing reads. Same rule as the
          // continuous-layout path above, which already says so.
          await renderScoreToContainer(
            restoreLeftPaneScore,
            compareLeftContainerRef.current,
            targetPage,
            true,
          );
          syncCompareSvgSize(compareLeftContainerRef.current, setCompareLeftSvgSize);
          await refreshMeasurePositions(restoreLeftPaneScore, setCompareLeftMeasurePositions);
          await renderScoreToContainer(
            restoreRightPaneScore,
            compareRightContainerRef.current,
            targetPage,
            true,
          );
          syncCompareSvgSize(compareRightContainerRef.current, setCompareRightSvgSize);
          const rightPositionsOk = await refreshMeasurePositions(
            restoreRightPaneScore,
            setCompareRightMeasurePositions,
          );
          if (!rightPositionsOk) {
            setCompareRightError(
              (prev) => prev ?? 'Unable to compute compare highlights for checkpoint score.',
            );
          }
        });
      }
      return () => {
        canceled = true;
      };
    }

    if (!compareView || !score || !compareRightScore) {
      return;
    }
    if (!compareSupportsReflow) {
      return;
    }

    const applyReflow = async () => {
      await clearAlignmentSpacers();
      if (!isCurrent()) {
        return;
      }
      const cached = compareLineBreakRestoreRef.current;
      let liveBreaks = cached?.live ?? [];
      let auxiliaryBreaks = cached?.auxiliary ?? [];
      if (!cached) {
        liveBreaks = await fetchMeasureLineBreaks(score);
        auxiliaryBreaks = await fetchMeasureLineBreaks(compareRightScore);
      }
      if (!isCurrent()) {
        return;
      }
      if (!compareLineBreakRestoreRef.current) {
        compareLineBreakRestoreRef.current = { live: liveBreaks, auxiliary: auxiliaryBreaks };
      }
      // Pane-oriented alignments and score-oriented break arrays are reconciled in
      // buildCompareReflowPlan, which is unit tested for the swapped case.
      const { liveReflow, auxiliaryReflow } = buildCompareReflowPlan({
        liveBreaks,
        auxiliaryBreaks,
        liveIsLeftPane: compareLeftScore === score,
        alignments: compareAlignments,
        buildMismatchBreaks,
      });
      const withResync = (breaks: boolean[], indices: Set<number>) => {
        if (!indices.size) {
          return breaks;
        }
        const next = [...breaks];
        indices.forEach((measureIndex) => {
          if (measureIndex >= 0 && measureIndex < next.length) {
            next[measureIndex] = true;
          }
        });
        return next;
      };
      const reflowLeftPaneScore = compareLeftScore;
      const reflowRightPaneScore = compareRightScoreDisplay;
      if (!reflowLeftPaneScore || !reflowRightPaneScore) {
        return;
      }
      const targetPage = compareContinuousMode ? 0 : currentPageRef.current;
      const renderAndMeasure = async () => {
        let leftPositions: Positions | null = null;
        let rightPositions: Positions | null = null;
        await renderScoreToContainer(
          reflowLeftPaneScore,
          compareLeftContainerRef.current,
          targetPage,
          true,
        );
        await refreshMeasurePositions(reflowLeftPaneScore, (positions) => {
          leftPositions = positions;
        });
        await renderScoreToContainer(
          reflowRightPaneScore,
          compareRightContainerRef.current,
          targetPage,
          true,
        );
        await refreshMeasurePositions(reflowRightPaneScore, (positions) => {
          rightPositions = positions;
        });
        return { leftPositions, rightPositions };
      };
      const publishLayout = ({
        leftPositions,
        rightPositions,
      }: {
        leftPositions: Positions | null;
        rightPositions: Positions | null;
      }) => {
        syncCompareSvgSize(compareLeftContainerRef.current, setCompareLeftSvgSize);
        syncCompareSvgSize(compareRightContainerRef.current, setCompareRightSvgSize);
        setCompareLeftMeasurePositions(leftPositions);
        setCompareRightMeasurePositions(rightPositions);
        if (!rightPositions) {
          setCompareRightError(
            (prev) => prev ?? 'Unable to compute compare highlights for checkpoint score.',
          );
        }
      };

      // Phase 1: establish the deterministic mismatch-block layout. Any previous
      // resync breaks are removed because these arrays start from the saved originals.
      await applyMeasureLineBreaks(score, liveReflow);
      await applyMeasureLineBreaks(compareRightScore, auxiliaryReflow);
      if (!isCurrent()) {
        return;
      }
      let settled = await renderAndMeasure();
      if (!isCurrent() || !settled.leftPositions || !settled.rightPositions) {
        if (isCurrent()) publishLayout(settled);
        return;
      }

      // Phase 2: measure natural wrap divergence from that exact layout, apply the
      // union once, then measure the settled resync result directly. No React state
      // participates in the dependency chain, so a later render cannot shrink the
      // plan and undo it.
      const naturalLeft = buildCompareSystemGeometry(settled.leftPositions);
      const naturalRight = buildCompareSystemGeometry(settled.rightPositions);
      const leftResync = new Set<number>();
      const rightResync = new Set<number>();
      compareAlignments.forEach((alignment) => {
        const breaks = buildResyncBreaks(
          alignment.rows,
          naturalLeft.systemOf,
          naturalRight.systemOf,
        );
        breaks.left.forEach((measureIndex) => leftResync.add(measureIndex));
        breaks.right.forEach((measureIndex) => rightResync.add(measureIndex));
      });
      if (leftResync.size || rightResync.size) {
        const liveIsLeft = compareLeftScore === score;
        await applyMeasureLineBreaks(
          score,
          withResync(liveReflow, liveIsLeft ? leftResync : rightResync),
        );
        await applyMeasureLineBreaks(
          compareRightScore,
          withResync(auxiliaryReflow, liveIsLeft ? rightResync : leftResync),
        );
        if (!isCurrent()) {
          return;
        }
        settled = await renderAndMeasure();
      }
      if (!isCurrent() || !settled.leftPositions || !settled.rightPositions) {
        if (isCurrent()) publishLayout(settled);
        return;
      }

      // Phase 3: only null-sided alignment rows represent actual missing music.
      // Compute each part independently, then take the maximum at an anchor so the
      // same temporal deficit is not multiplied by the score's part count.
      const settledLeft = buildCompareSystemGeometry(settled.leftPositions);
      const settledRight = buildCompareSystemGeometry(settled.rightPositions);
      const structuralAlignments = compareAlignments.filter((alignment) =>
        alignment.rows.some((row) => row.leftIndex === null || row.rightIndex === null),
      );
      const gapPlans = structuralAlignments.map((alignment) =>
        buildAlignmentGaps(
          alignment.rows,
          settledLeft.systemOf,
          settledRight.systemOf,
          settledLeft.systemHeight,
          settledRight.systemHeight,
        ),
      );
      const leftGaps = mergeAlignmentGaps(gapPlans.map((plan) => plan.left));
      const rightGaps = mergeAlignmentGaps(gapPlans.map((plan) => plan.right));
      const applyGaps = async (targetScore: Score, gaps: MeasureGap[]) => {
        if (!gaps.length || !targetScore.setMeasureSpacer || !targetScore.getSpatium) {
          return { applied: [] as MeasureGap[], spatium: 0 };
        }
        const spatium = Number(await targetScore.getSpatium());
        if (!Number.isFinite(spatium) || spatium <= 0 || !isCurrent()) {
          return { applied: [] as MeasureGap[], spatium: 0 };
        }
        const appliedGaps: MeasureGap[] = [];
        for (const gap of gaps) {
          if (!isCurrent()) {
            break;
          }
          // One spacer per temporal anchor is sufficient; using every part's
          // row would multiply the same deficit. Page units become spatium here.
          const staffIndex = Math.max(comparePartCount - 1, 0);
          const applied = await targetScore.setMeasureSpacer(
            gap.measureIndex,
            staffIndex,
            gap.gap / spatium,
          );
          if (applied !== false) {
            compareAppliedSpacersRef.current.push({
              score: targetScore,
              measureIndex: gap.measureIndex,
              staffIndex,
            });
            appliedGaps.push(gap);
          }
        }
        return { applied: appliedGaps, spatium };
      };
      const leftApplied = await applyGaps(reflowLeftPaneScore, leftGaps);
      const rightApplied = await applyGaps(reflowRightPaneScore, rightGaps);
      if (!isCurrent()) {
        return;
      }
      if (leftApplied.applied.length || rightApplied.applied.length) {
        settled = await renderAndMeasure();
      }
      if (!isCurrent() || !settled.leftPositions || !settled.rightPositions) {
        if (isCurrent()) publishLayout(settled);
        return;
      }

      // A MuseScore spacer stores an absolute minimum clearance, while the planner
      // computes additional vertical space. Measure what the first application
      // actually moved, then add the remaining paired-row offset to that same anchor.
      // This keeps the bridge primitive unit-agnostic and includes the score's
      // pre-existing staff/system clearance without trying to reproduce engraving
      // skyline rules in TypeScript.
      const residual = measureStructuralGapResidual(
        structuralAlignments,
        settled.leftPositions,
        settled.rightPositions,
      );
      const correctAppliedGap = async (
        targetScore: Score,
        result: { applied: MeasureGap[]; spatium: number },
        correction: number,
      ) => {
        const anchor = result.applied[0];
        if (
          !anchor ||
          correction <= 0 ||
          result.spatium <= 0 ||
          !targetScore.setMeasureSpacer ||
          !isCurrent()
        ) {
          return false;
        }
        const corrected = await targetScore.setMeasureSpacer(
          anchor.measureIndex,
          Math.max(comparePartCount - 1, 0),
          (anchor.gap + correction) / result.spatium,
        );
        return corrected !== false;
      };
      const leftCorrected = await correctAppliedGap(
        reflowLeftPaneScore,
        leftApplied,
        residual.left,
      );
      const rightCorrected = await correctAppliedGap(
        reflowRightPaneScore,
        rightApplied,
        residual.right,
      );
      if (!isCurrent()) {
        return;
      }
      if (leftCorrected || rightCorrected) {
        settled = await renderAndMeasure();
      }
      if (isCurrent()) {
        publishLayout(settled);
      }
    };

    enqueueReflow(applyReflow);
    return () => {
      canceled = true;
    };
  }, [
    compareView,
    compareReflowMode,
    compareSupportsReflow,
    score,
    compareRightScore,
    compareLeftScore,
    compareRightScoreDisplay,
    compareContinuousMode,
    applyMeasureLineBreaks,
    fetchMeasureLineBreaks,
    compareAlignments,
    comparePartCount,
    buildMismatchBreaks,
    refreshMeasurePositions,
    renderScoreToContainer,
    syncCompareSvgSize,
  ]);

  useEffect(() => {
    // When a caller supplies the differences, the client diff is not merely
    // redundant — it is wrong here, and running it anyway would leave a
    // second, disagreeing answer available to anything that reads it.
    if (!compareView || isSuppliedRegionsMode) {
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
          if (compareLeftXml && compareRightXml) {
            leftSignatures = extractMeasureSignaturesFromXml(compareLeftXml);
            rightSignatures = extractMeasureSignaturesFromXml(compareRightXml);
            usedXml = true;
          } else if (compareLeftScore && compareRightScoreDisplay) {
            const [leftMscx, rightMscx] = await Promise.all([
              getScoreMscxText(compareLeftScore),
              getScoreMscxText(compareRightScoreDisplay),
            ]);
            if (leftMscx && rightMscx) {
              leftSignatures = extractMeasureSignaturesFromXml(leftMscx);
              rightSignatures = extractMeasureSignaturesFromXml(rightMscx);
              usedXml = true;
            }
          }
        } catch (err) {
          console.warn(
            'Failed to parse MusicXML for compare signatures; falling back to WASM.',
            err,
          );
        }

        if (!usedXml) {
          if (!compareLeftScore || !compareRightScoreDisplay) {
            setCompareAlignments([]);
            setCompareSignatures(null);
            return;
          }
          const partCount = Math.max(compareLeftParts.length, compareRightPartsDisplay.length, 1);
          leftSignatures = await Promise.all(
            Array.from({ length: partCount }, (_, index) =>
              fetchMeasureSignatures(compareLeftScore, index),
            ),
          );
          rightSignatures = await Promise.all(
            Array.from({ length: partCount }, (_, index) =>
              fetchMeasureSignatures(compareRightScoreDisplay, index),
            ),
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
    isSuppliedRegionsMode,
    compareAlignmentRevision,
    compareLeftXml,
    compareRightXml,
    compareLeftParts.length,
    compareRightPartsDisplay.length,
    compareLeftScore,
    compareRightScoreDisplay,
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
    const currentRangeKeys = new Set(
      aiDiffCurrentBlocks.map((block) => `${block.partIndex}:${block.measureRange}`),
    );
    setAiDiffReviews((prev) => {
      const next = prev
        .filter(
          (review) =>
            review.status === 'accepted' ||
            currentKeys.has(review.blockKey) ||
            currentRangeKeys.has(`${review.partIndex}:${review.measureRange}`),
        )
        .map((review) => {
          const current = aiDiffCurrentBlocks.find(
            (block) =>
              block.blockKey === review.blockKey ||
              `${block.partIndex}:${block.measureRange}` ===
                `${review.partIndex}:${review.measureRange}`,
          );
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
        if (
          !next.some(
            (review) =>
              review.blockKey === block.blockKey ||
              `${review.partIndex}:${review.measureRange}` ===
                `${block.partIndex}:${block.measureRange}`,
          )
        ) {
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

    const syncScroll = createCompareScrollSync(compareScrollSyncRef);

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
    let animationFrame: number | null = null;
    const updateZoom = () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        const leftWidth = leftContainer.clientWidth;
        const rightWidth = rightContainer.clientWidth;
        if (!leftWidth || !rightWidth) {
          return;
        }
        const fitZoom = Math.min(
          leftWidth / compareLeftSvgSize.width,
          rightWidth / compareRightSvgSize.width,
        );
        if (!Number.isFinite(fitZoom) || fitZoom <= 0) {
          return;
        }
        const nextZoom = Math.max(0.2, Math.min(fitZoom, 1.5));
        setCompareFitZoom((currentZoom) =>
          Math.abs(currentZoom - nextZoom) > 0.01 ? nextZoom : currentZoom,
        );
      });
    };

    updateZoom();
    if (typeof ResizeObserver === 'undefined') {
      return () => {
        if (animationFrame !== null) {
          window.cancelAnimationFrame(animationFrame);
        }
      };
    }
    const observer = new ResizeObserver(updateZoom);
    observer.observe(leftContainer);
    observer.observe(rightContainer);
    return () => {
      observer.disconnect();
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [
    compareView,
    compareRightLoading,
    compareRightError,
    currentPage,
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

  const handleRenameCheckpoint = async (checkpoint: CheckpointSummary) => {
    if (!isIndexedDbAvailable()) {
      alert('IndexedDB is not available in this browser.');
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }
    const nextTitle = window.prompt('Rename checkpoint', checkpoint.title)?.trim();
    if (!nextTitle || nextTitle === checkpoint.title) {
      return;
    }
    setCheckpointBusy(true);
    try {
      await renameCheckpoint(checkpoint.id, nextTitle);
      await loadCheckpointList();
    } catch (err) {
      console.error('Failed to rename checkpoint', err);
      alert('Failed to rename checkpoint. See console for details.');
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
    temperature?: number | null;
    enableSourceRag?: boolean;
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
      temperature = null,
      enableSourceRag = false,
    } = payload;
    const systemPrompt = systemPromptOverride.trim() || AI_PATCH_SYSTEM_PROMPT;
    const userPrompt =
      promptText.trim() ||
      buildPromptWithSections(
        prompt,
        xml.trim() ? [{ title: 'Current MusicXML', content: xml }] : [],
      );
    const capabilityCacheKey = `${provider}:${model.trim().replace(/^models\//, '')}`;
    const knownUnsupported =
      aiUnsupportedParametersRef.current.get(capabilityCacheKey) ??
      new Set<OptionalAiRequestParameter>();
    let effectiveMaxTokens = knownUnsupported.has('maxOutputTokens') ? null : maxTokens;
    let effectiveTemperature = knownUnsupported.has('temperature') ? null : temperature;
    const rememberUnsupported = (parameter: OptionalAiRequestParameter) => {
      const next = new Set(aiUnsupportedParametersRef.current.get(capabilityCacheKey) ?? []);
      const isNewObservation = !next.has(parameter);
      next.add(parameter);
      aiUnsupportedParametersRef.current.set(capabilityCacheKey, next);
      if (isNewObservation) {
        console.warn('[AI] Optional model parameter rejected; retrying without it.', {
          provider,
          model,
          parameter,
          registryVersion: AI_MODEL_CAPABILITY_REGISTRY_VERSION,
        });
      }
      if (parameter === 'temperature') {
        effectiveTemperature = null;
        setAiTemperatureMode('auto');
      } else {
        effectiveMaxTokens = null;
        setAiMaxTokensMode('auto');
      }
    };
    const requestDescriptor =
      aiModelDescriptors.find(
        (descriptor) =>
          descriptor.provider === provider &&
          descriptor.id === model.trim().replace(/^models\//, ''),
      ) ?? resolveAiModelDescriptor(provider, model);

    if (useLlmProxy) {
      const requestBody: Record<string, unknown> = {
        apiKey,
        model,
        prompt,
        xml,
        sourceContext: activeLaunchContext || undefined,
        enableSourceRag,
        systemPrompt: systemPrompt || undefined,
        promptText: userPrompt,
        imageBase64: image?.base64 ?? '',
        imageMediaType: image?.mediaType ?? '',
        pdfBase64: pdf?.base64 ?? '',
        pdfMediaType: pdf?.mediaType ?? '',
        pdfFilename: pdf?.filename ?? '',
        maxTokens: effectiveMaxTokens ?? undefined,
        temperature: effectiveTemperature ?? undefined,
      };
      const sendProxyRequest = () =>
        fetch(proxyUrlFor(`/api/llm/${provider}`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });
      let response = await sendProxyRequest();
      captureApiTraceContext(response.headers);
      let responseErrorText = response.ok ? '' : await response.text();
      const unsupportedParameter = detectUnsupportedAiRequestParameter(responseErrorText);
      const canRetryWithoutParameter =
        unsupportedParameter === 'temperature'
          ? effectiveTemperature != null
          : unsupportedParameter === 'maxOutputTokens' && effectiveMaxTokens != null;
      if (!response.ok && unsupportedParameter && canRetryWithoutParameter) {
        rememberUnsupported(unsupportedParameter);
        delete requestBody[unsupportedParameter === 'temperature' ? 'temperature' : 'maxTokens'];
        response = await sendProxyRequest();
        captureApiTraceContext(response.headers);
        responseErrorText = response.ok ? '' : await response.text();
      }
      if (response.ok) {
        const data = await response.json();
        return {
          text: typeof data?.text === 'string' ? data.text : '',
          sourceRag:
            data &&
            typeof data === 'object' &&
            'sourceRag' in data &&
            data.sourceRag &&
            typeof data.sourceRag === 'object'
              ? (data.sourceRag as AiSourceRagInfo)
              : null,
        };
      }
      if (
        provider === 'anthropic' &&
        isEmbedBuild &&
        !llmProxyBase &&
        isMissingProxyStatus(response.status)
      ) {
        throw new Error(ANTHROPIC_EMBED_PROXY_ERROR);
      }
      const canFallbackDirect =
        provider !== 'anthropic' &&
        isEmbedBuild &&
        !llmProxyBase &&
        isMissingProxyStatus(response.status);
      if (!canFallbackDirect) {
        throw new Error(responseErrorText || 'Request failed.');
      }
    }

    const sendDirectRequest = () =>
      requestAiTextDirect({
        provider,
        apiKey,
        model,
        promptText: userPrompt,
        systemPrompt,
        maxTokens: effectiveMaxTokens,
        temperature: effectiveTemperature,
        modelDescriptor: requestDescriptor,
        image,
        pdf,
      });
    let text: string;
    try {
      text = await sendDirectRequest();
    } catch (err) {
      const unsupportedParameter = detectUnsupportedAiRequestParameter(
        errorMessage(err) || String(err),
      );
      const canRetryWithoutParameter =
        unsupportedParameter === 'temperature'
          ? effectiveTemperature != null
          : unsupportedParameter === 'maxOutputTokens' && effectiveMaxTokens != null;
      if (!unsupportedParameter || !canRetryWithoutParameter) {
        throw err;
      }
      rememberUnsupported(unsupportedParameter);
      text = await sendDirectRequest();
    }
    return { text, sourceRag: null };
  };

  const openAiProposalCompare = useCallback(
    (
      baseXml: string,
      proposedXml: string,
      proposal?: Pick<AiEditProposal, 'expectedCurrentContentHash' | 'expectedCurrentIdentityHash'>,
    ) => {
      if (!baseXml.trim() || !proposedXml.trim()) {
        return false;
      }
      // Standard diff orientation: Current on the LEFT (red/removed), Assistant Proposal on
      // the RIGHT (green/added). compareSwapped=true selects that mapping and makes the
      // per-block Apply / Apply-All handlers write the proposal INTO the document.
      setCompareSwapped(true);
      setAiDiffIteration(0);
      setAiDiffReviews([]);
      setAiMeasureThreads({});
      setAiFocusedMeasureAnchor(null);
      setAiMeasureThreadDraft('');
      setAiDiffGlobalComment('');
      setAiDiffFeedbackError(null);
      setAiDiffBlockErrors({});
      setAiDiffGutterWidth(AI_DIFF_GUTTER_DEFAULT_WIDTH);
      captureAiProposal(proposal, baseXml);
      setCompareView({
        title: 'Assistant Proposal',
        currentXml: baseXml,
        checkpointXml: proposedXml,
        currentLabel: 'Current',
        checkpointLabel: 'Assistant Proposal',
      });
      return true;
    },
    [captureAiProposal],
  );

  const updateAiOutput = useCallback(
    async (
      nextText: string,
      baseXmlOverride?: string,
    ): Promise<{
      ok: boolean;
      baseXml: string;
      proposedXml: string;
      error: string;
      annotations: PatchAnnotation[];
    }> => {
      setAiOutput(nextText);
      setAiPatch(null);
      setAiPatchError(null);
      setAiPatchedXml('');
      if (!nextText.trim()) {
        const error = 'AI output is empty.';
        setAiPatchError(error);
        return { ok: false, baseXml: '', proposedXml: '', error, annotations: [] };
      }
      const parsed = parseMusicXmlPatch(nextText);
      if (parsed.error || !parsed.patch) {
        const error = parsed.error || 'Invalid patch payload.';
        setAiPatchError(error);
        return { ok: false, baseXml: '', proposedXml: '', error, annotations: [] };
      }
      const annotations = parsed.annotations ?? [];
      setAiLastAnnotations(annotations);
      setAiPatch(parsed.patch);
      const baseXml = baseXmlOverride ?? aiBaseXml ?? (await aiScoreBridge.getContextXml());
      if (!baseXml.trim()) {
        const error = 'Unable to apply patch without MusicXML.';
        setAiPatchError(error);
        return { ok: false, baseXml: '', proposedXml: '', error, annotations };
      }
      const applied = applyMusicXmlPatch(baseXml, parsed.patch);
      if (applied.error || !applied.xml.trim()) {
        const error = applied.error || 'Failed to apply patch to MusicXML.';
        setAiPatchError(error);
        return { ok: false, baseXml: baseXml.trim(), proposedXml: '', error, annotations };
      }
      setAiPatchError(null);
      setAiPatchedXml(applied.xml);
      return {
        ok: true,
        baseXml: baseXml.trim(),
        proposedXml: applied.xml.trim(),
        error: '',
        annotations,
      };
    },
    [
      aiBaseXml,
      aiScoreBridge,
      parseMusicXmlPatch,
      setAiOutput,
      setAiPatch,
      setAiPatchError,
      setAiPatchedXml,
    ],
  );

  const handleAiRequest = async () => {
    if (!aiEnabled) {
      alert('AI features are disabled.');
      return;
    }
    if (aiBusy || aiDiffFeedbackBusy) {
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
    const editRequest = beginAiEdit(
      aiDeepEdit ? 'deep' : 'patch',
      aiDeepEdit ? 'Preparing Deep Edit' : 'Preparing patch request',
    );
    const requestController = editRequest.controller;
    let clientTimeoutId: ReturnType<typeof setTimeout> | null = null;
    setAiError(null);
    setAiOutput('');
    setAiPatch(null);
    setAiPatchError(null);
    setAiPatchedXml('');
    clearAiProposal();
    const requestStartedAt = Date.now();
    let requestIssued = false;
    let outcome: 'success' | 'failure' | 'cancelled' = 'failure';
    let failureReason = '';
    try {
      const promptSections: AiPromptSection[] = [];
      // Proposal identity and later Apply/feedback gates must use the same live
      // webmscore serialization. The XML sidebar can briefly retain the source
      // representation after a new score is loaded.
      const baseXml = (await aiScoreBridge.getLiveXml(xmlText || null)) || '';
      if (!baseXml.trim()) {
        failureReason = 'Unable to load MusicXML for patch verification.';
        setAiError(failureReason);
        return;
      }
      const xmlContext = aiIncludeXml ? baseXml : '';
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
      const pdfAttachment = aiIncludePdf ? await aiScoreBridge.getScorePdf() : null;
      if (aiIncludePdf) {
        promptSections.push({
          title: 'Rendered score PDF',
          content: pdfAttachment
            ? `Attached as ${pdfAttachment.filename}.`
            : `PDF attachment unavailable (or exceeds ${Math.round(AI_PDF_ATTACHMENT_MAX_BYTES / (1024 * 1024))} MB limit).`,
        });
      }
      if (aiIncludePage) {
        const pageContextRaw = await aiScoreBridge.getPageSvgContext();
        if (pageContextRaw.trim()) {
          const pageContext = truncateAiContext(pageContextRaw, AI_PAGE_SVG_CONTEXT_MAX_CHARS);
          promptSections.push({
            title: `Current rendered page SVG (page ${Math.max(0, currentPageRef.current) + 1})`,
            content: `${pageContext.value}${
              pageContext.truncated
                ? `\n[Page SVG truncated from ${pageContext.originalLength} characters.]`
                : ''
            }`,
          });
        } else {
          promptSections.push({
            title: `Current rendered page SVG (page ${Math.max(0, currentPageRef.current) + 1})`,
            content: 'Page SVG context is unavailable.',
          });
        }
      }
      if (aiIncludeSelection) {
        const selectionContext = await aiScoreBridge.getSelectionContext();
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
      const imageAttachment = aiIncludeRenderedImage ? await aiScoreBridge.getPageImage() : null;
      if (aiIncludeRenderedImage && !imageAttachment) {
        console.warn('Rendered image context requested, but PNG capture is unavailable.');
      }
      setAiBaseXml(baseXml);
      const maxTokens = aiMaxTokensMode === 'custom' ? aiMaxTokens : null;
      const promptText = buildAiPrompt(aiPrompt, promptSections);
      if (requestController.signal.aborted) {
        throw requestController.signal.reason;
      }
      requestIssued = true;
      telemetryCountersRef.current.aiRequests += 1;
      // Deep Edit is a separate, more expensive endpoint; it does not take
      // image/PDF context in v1.
      const patchEndpoint = aiDeepEdit ? '/api/music/patch/deep' : '/api/music/patch';
      const requestBudgetMs = aiDeepEdit
        ? AI_EDIT_EFFORT_PROFILES[aiEditEffort].deep.budgetMs
        : AI_EDIT_EFFORT_PROFILES[aiEditEffort].patch.budgetMs;
      clientTimeoutId = setTimeout(() => {
        requestController.abort(new DOMException('AI edit request timed out.', 'TimeoutError'));
      }, requestBudgetMs + 30_000);
      const response = await fetch(resolveScoreEditorApiPath(patchEndpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        signal: requestController.signal,
        body: JSON.stringify({
          content: baseXml,
          promptText,
          provider: aiProvider,
          apiKey: aiApiKey.trim(),
          model: aiModel.trim(),
          editEffort: aiEditEffort,
          ...(aiDeepEdit
            ? {}
            : {
                image: imageAttachment,
                pdf: pdfAttachment,
                maxTokens,
                temperature: aiTemperatureMode === 'custom' ? aiTemperature : null,
              }),
        }),
      });
      captureApiTraceContext(response.headers);
      const serviceResponse = await readAiEditServiceResponse(response, (update) =>
        updateAiEditProgress(editRequest, update),
      );
      const result = asRecord(serviceResponse.body) || {};
      if (serviceResponse.status >= 400) {
        const message =
          typeof result.error === 'string'
            ? result.error
            : `Patch request failed: ${serviceResponse.status}`;
        throw new Error(message);
      }

      const verification = asRecord(result.verification);
      const verificationLevel = typeof verification?.level === 'string' ? verification.level : '';
      const verifiedLevels = ['patch_apply', 'engine_load', 'render'];
      if (!verifiedLevels.includes(verificationLevel)) {
        throw new Error('Patch service returned an unverified proposal.');
      }
      const patchPayload = asRecord(result.patch);
      const parsedPatch = patchPayload
        ? parseMusicXmlPatch(JSON.stringify(patchPayload))
        : { patch: null, error: '' };
      if (patchPayload && (parsedPatch.error || !parsedPatch.patch)) {
        throw new Error(parsedPatch.error || 'Patch service returned an invalid patch payload.');
      }
      if (!parsedPatch.patch && !aiDeepEdit) {
        throw new Error('Patch service returned an invalid patch payload.');
      }
      const proposedXml = typeof result.proposedXml === 'string' ? result.proposedXml.trim() : '';
      if (!proposedXml) {
        throw new Error('Patch service returned empty proposed MusicXML.');
      }

      const annotations = extractPatchAnnotations({ annotations: result.annotations });
      const deepEditAudit = asRecord(result.deepEdit);
      if (parsedPatch.patch) {
        setAiOutput(
          JSON.stringify(
            {
              ...parsedPatch.patch,
              ...(annotations.length ? { annotations } : {}),
            },
            null,
            2,
          ),
        );
      } else {
        setAiOutput(
          JSON.stringify(
            {
              deepEdit: {
                finalizedCandidateId: deepEditAudit?.finalizedCandidateId ?? null,
                rationale: deepEditAudit?.rationale ?? '',
              },
            },
            null,
            2,
          ),
        );
      }
      setAiPatch(parsedPatch.patch);
      setAiPatchError(null);
      setAiPatchedXml(proposedXml);
      setAiLastAnnotations(annotations);
      const serviceProposal = findAiEditProposal(result);
      const proposalBaseXml = serviceProposal?.baseXml || baseXml;
      const proposalXml = serviceProposal?.proposedXml || proposedXml;
      if (!openAiProposalCompare(proposalBaseXml, proposalXml, serviceProposal || undefined)) {
        failureReason = 'Unable to open compare view for AI proposal.';
        setAiError(failureReason);
        return;
      }
      // openAiProposalCompare resets threads, so seed the assistant annotations after it.
      mergeAiAnnotations(annotations);
      setAiProposalSession(
        createClientProposalSession({
          id: typeof result.proposalSessionId === 'string' ? result.proposalSessionId : null,
          originalInstruction: aiPrompt.trim(),
          includeChat: aiIncludeChat,
          proposal: serviceProposal,
          patch: parsedPatch.patch,
          annotations,
          continuityToken: result.continuityToken,
        }),
      );
      setAiProposalAudit({
        cycle: 1,
        verification: result.verification,
        ...(deepEditAudit ? { deepEdit: deepEditAudit } : {}),
      });
      outcome = 'success';
    } catch (err) {
      console.error('AI request failed', err);
      const abortReason = requestController.signal.aborted ? requestController.signal.reason : null;
      const wasCancelled = abortReason instanceof DOMException && abortReason.name === 'AbortError';
      const timedOut = abortReason instanceof DOMException && abortReason.name === 'TimeoutError';
      if (wasCancelled) {
        outcome = 'cancelled';
      }
      const message = wasCancelled
        ? 'Request cancelled.'
        : timedOut
          ? 'AI edit request exceeded its client timeout.'
          : errorMessage(err);
      failureReason = message || 'AI request failed. See console for details.';
      setAiError(wasCancelled ? null : message || 'AI request failed. See console for details.');
    } finally {
      if (clientTimeoutId) {
        clearTimeout(clientTimeoutId);
      }
      finishAiEdit(editRequest, outcome, failureReason);
      if (requestIssued) {
        if (outcome === 'failure') {
          telemetryCountersRef.current.aiFailures += 1;
        }
        emitEditorTelemetry('score_editor_ai_request', {
          channel: 'assistant_patch',
          provider: aiProvider,
          model: aiModel,
          edit_effort: aiEditEffort,
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
    const shouldUseSourceRag = shouldEnableSourceRagForPrompt(userMessage.text);

    setAiChatBusy(true);
    setAiError(null);
    const requestStartedAt = Date.now();
    let requestIssued = false;
    let outcome: 'success' | 'failure' = 'failure';
    let failureReason = '';
    try {
      const promptSections: AiPromptSection[] = [];
      const xmlContext = aiIncludeXml ? await aiScoreBridge.getContextXml() : '';
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
      const pdfAttachment = aiIncludePdf ? await aiScoreBridge.getScorePdf() : null;
      if (aiIncludePdf) {
        promptSections.push({
          title: 'Rendered score PDF',
          content: pdfAttachment
            ? `Attached as ${pdfAttachment.filename}.`
            : `PDF attachment unavailable (or exceeds ${Math.round(AI_PDF_ATTACHMENT_MAX_BYTES / (1024 * 1024))} MB limit).`,
        });
      }
      if (aiIncludePage) {
        const pageContextRaw = await aiScoreBridge.getPageSvgContext();
        if (pageContextRaw.trim()) {
          const pageContext = truncateAiContext(pageContextRaw, AI_PAGE_SVG_CONTEXT_MAX_CHARS);
          promptSections.push({
            title: `Current rendered page SVG (page ${Math.max(0, currentPageRef.current) + 1})`,
            content: `${pageContext.value}${
              pageContext.truncated
                ? `\n[Page SVG truncated from ${pageContext.originalLength} characters.]`
                : ''
            }`,
          });
        } else {
          promptSections.push({
            title: `Current rendered page SVG (page ${Math.max(0, currentPageRef.current) + 1})`,
            content: 'Page SVG context is unavailable.',
          });
        }
      }
      if (aiIncludeSelection) {
        const selectionContext = await aiScoreBridge.getSelectionContext();
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
      const imageAttachment = aiIncludeRenderedImage ? await aiScoreBridge.getPageImage() : null;
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
      const result = await requestAiText({
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
        temperature: aiTemperatureMode === 'custom' ? aiTemperature : null,
        enableSourceRag: shouldUseSourceRag,
      });
      const responseText = result.text.trim();
      if (!responseText) {
        failureReason = 'No response was returned by the model.';
        setAiError(failureReason);
        return;
      }
      setAiChatMessages((prev) => [
        ...prev,
        { role: 'assistant', text: responseText, sourceRag: result.sourceRag },
      ]);
      outcome = 'success';
    } catch (err) {
      console.error('AI chat request failed', err);
      const message = errorMessage(err);
      failureReason = message || 'AI chat request failed. See console for details.';
      setAiError(failureReason);
    } finally {
      setAiChatBusy(false);
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

  const postScoreEditorJson = useCallback(
    async (path: string, body: Record<string, unknown>) => {
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
        const details = asRecord(payloadError?.details);
        const providerError = asRecord(details?.providerError);
        const providerMessage =
          typeof providerError?.message === 'string' ? providerError.message : '';
        const traceId = typeof payloadError?.traceId === 'string' ? payloadError.traceId : '';
        const message =
          typeof payloadRecord?.error === 'string'
            ? String(payloadRecord.error)
            : typeof payloadError?.message === 'string'
              ? payloadError.message
              : `Request failed: ${response.status}`;
        const detailParts = [
          providerMessage && providerMessage !== message ? providerMessage : '',
          traceId ? `traceId=${traceId}` : '',
        ].filter(Boolean);
        throw new Error(
          detailParts.length > 0 ? `${message} (${detailParts.join('; ')})` : message,
        );
      }
      return asRecord(payload) || {};
    },
    [captureApiTraceContext],
  );

  const loadNotaGenSpaceOptions = useCallback(
    async (spaceIdOverride?: string) => {
      const targetSpaceId =
        (spaceIdOverride ?? musicNotaGenSpaceId).trim() || 'ElectricAlexis/NotaGen';
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
        const nextPeriod = periods.includes(musicNotaGenSpacePeriod)
          ? musicNotaGenSpacePeriod
          : periods[0] || musicNotaGenSpacePeriod;
        if (nextPeriod !== musicNotaGenSpacePeriod) {
          setMusicNotaGenSpacePeriod(nextPeriod);
        }

        const composersForPeriod = Object.keys(
          (combinations && combinations[nextPeriod]) || {},
        ).sort();
        const nextComposer = composersForPeriod.includes(musicNotaGenSpaceComposer)
          ? musicNotaGenSpaceComposer
          : composersForPeriod[0] || musicNotaGenSpaceComposer;
        if (nextComposer !== musicNotaGenSpaceComposer) {
          setMusicNotaGenSpaceComposer(nextComposer);
        }

        const instrumentsForComposer = (
          (combinations && combinations[nextPeriod] && combinations[nextPeriod][nextComposer]) ||
          []
        )
          .slice()
          .sort();
        const nextInstrumentation = instrumentsForComposer.includes(
          musicNotaGenSpaceInstrumentation,
        )
          ? musicNotaGenSpaceInstrumentation
          : instrumentsForComposer[0] || musicNotaGenSpaceInstrumentation;
        if (nextInstrumentation !== musicNotaGenSpaceInstrumentation) {
          setMusicNotaGenSpaceInstrumentation(nextInstrumentation);
        }
      } catch (err) {
        console.error('Failed to load NotaGen Space options', err);
        setMusicNotaGenSpaceOptionsError(
          errorMessage(err) || 'Failed to load NotaGen Space options.',
        );
      } finally {
        setMusicNotaGenSpaceOptionsLoading(false);
      }
    },
    [
      musicNotaGenSpaceComposer,
      musicNotaGenSpaceId,
      musicNotaGenSpaceInstrumentation,
      musicNotaGenSpacePeriod,
      postScoreEditorJson,
    ],
  );

  useEffect(() => {
    if (!aiEnabled || xmlSidebarTab !== 'notagen') {
      return;
    }
    if (musicNotaGenSpaceCombinations || musicNotaGenSpaceOptionsLoading) {
      return;
    }
    void loadNotaGenSpaceOptions();
  }, [
    aiEnabled,
    loadNotaGenSpaceOptions,
    musicNotaGenSpaceCombinations,
    musicNotaGenSpaceOptionsLoading,
    xmlSidebarTab,
  ]);

  const handleMusicNotaGenRun = async () => {
    if (
      !musicNotaGenSpacePeriod.trim() ||
      !musicNotaGenSpaceComposer.trim() ||
      !musicNotaGenSpaceInstrumentation.trim()
    ) {
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
          const message =
            typeof asRecord(payload)?.error === 'string'
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
          let payloadValue: unknown = null;
          try {
            payloadValue = payloadText ? JSON.parse(payloadText) : null;
          } catch {
            payloadValue = { raw: payloadText };
          }
          const payload = asRecord(payloadValue);
          if (eventName === 'status') {
            const stage = typeof payload?.stage === 'string' ? payload.stage : '';
            const message = typeof payload?.message === 'string' ? payload.message : '';
            setMusicNotaGenStatusText(
              [stage, message].filter(Boolean).join(': ') || stage || message,
            );
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
              streamError =
                typeof payload?.error === 'string'
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

        const resultRecord = finalResult as Record<string, unknown>;
        setMusicNotaGenResult(resultRecord);
        const content = asRecord(resultRecord.content);
        const abc =
          typeof resultRecord.abc === 'string'
            ? resultRecord.abc
            : typeof content?.abc === 'string'
              ? content.abc
              : '';
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
      const abc =
        typeof payload.abc === 'string'
          ? payload.abc
          : typeof content?.abc === 'string'
            ? content.abc
            : '';
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

  const handleNotaGenPeriodChange = useCallback(
    (nextPeriod: string) => {
      setMusicNotaGenSpacePeriod(nextPeriod);
      const composerMap =
        (musicNotaGenSpaceCombinations && musicNotaGenSpaceCombinations[nextPeriod]) || {};
      const composers = Object.keys(composerMap).sort();
      const nextComposer = composers.includes(musicNotaGenSpaceComposer)
        ? musicNotaGenSpaceComposer
        : composers[0] || '';
      setMusicNotaGenSpaceComposer(nextComposer);

      const instruments = nextComposer ? [...(composerMap[nextComposer] || [])].sort() : [];
      const nextInstrumentation = instruments.includes(musicNotaGenSpaceInstrumentation)
        ? musicNotaGenSpaceInstrumentation
        : instruments[0] || '';
      setMusicNotaGenSpaceInstrumentation(nextInstrumentation);
    },
    [musicNotaGenSpaceCombinations, musicNotaGenSpaceComposer, musicNotaGenSpaceInstrumentation],
  );

  const handleNotaGenComposerChange = useCallback(
    (nextComposer: string) => {
      setMusicNotaGenSpaceComposer(nextComposer);
      const instruments =
        musicNotaGenSpaceCombinations &&
        musicNotaGenSpaceCombinations[musicNotaGenSpacePeriod] &&
        musicNotaGenSpaceCombinations[musicNotaGenSpacePeriod][nextComposer]
          ? [...musicNotaGenSpaceCombinations[musicNotaGenSpacePeriod][nextComposer]].sort()
          : [];
      const nextInstrumentation = instruments.includes(musicNotaGenSpaceInstrumentation)
        ? musicNotaGenSpaceInstrumentation
        : instruments[0] || '';
      setMusicNotaGenSpaceInstrumentation(nextInstrumentation);
    },
    [musicNotaGenSpaceCombinations, musicNotaGenSpacePeriod, musicNotaGenSpaceInstrumentation],
  );

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

  const handleTranscodaImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setMusicTranscodaImageFile(file);
    setMusicTranscodaError(null);
    setMusicTranscodaWarning(null);
    setMusicTranscodaResult(null);
    setMusicTranscodaGeneratedKern('');
    setMusicTranscodaGeneratedXml('');
  };

  useEffect(() => {
    if (musicTranscodaPhase === 'idle') {
      musicTranscodaStartedAtRef.current = null;
      setMusicTranscodaElapsedMs(0);
      return;
    }
    if (musicTranscodaStartedAtRef.current === null) {
      musicTranscodaStartedAtRef.current = Date.now();
    }
    const timer = window.setInterval(() => {
      const startedAt = musicTranscodaStartedAtRef.current || Date.now();
      setMusicTranscodaElapsedMs(Math.max(0, Date.now() - startedAt));
    }, 250);
    return () => window.clearInterval(timer);
  }, [musicTranscodaPhase]);

  const handleTranscodaTranscribeImage = async () => {
    if (!musicTranscodaImageFile) {
      alert('Choose a page image before running Transcoda.');
      return;
    }
    setMusicTranscodaPhase('uploading');
    musicTranscodaStartedAtRef.current = null;
    setMusicTranscodaBusy(true);
    setMusicTranscodaError(null);
    setMusicTranscodaWarning(null);
    setMusicTranscodaResult(null);
    setMusicTranscodaGeneratedKern('');
    setMusicTranscodaGeneratedXml('');
    const requestStartedAt = Date.now();
    let outcome: 'success' | 'failure' = 'failure';
    let failureReason = '';
    try {
      const imageDataUrl = await fileToBase64(musicTranscodaImageFile);
      setMusicTranscodaPhase('transcribing');
      musicTranscodaStartedAtRef.current = null;
      const payload = await postScoreEditorJson('/api/music/omr/transcribe', {
        imageDataUrl,
        mimeType: musicTranscodaImageFile.type || 'image/png',
        spaceId: MUSIC_SPECIALISTS_DEFAULT_TRANSCODA_SPACE_ID,
        decoding: musicTranscodaDecoding,
        maxLength: musicTranscodaMaxLength,
        numBeams: musicTranscodaNumBeams,
        repetitionPenalty: musicTranscodaRepetitionPenalty,
        convertToMusicXml: true,
        includeContent: true,
        timeoutMs: 300000,
      });
      setMusicTranscodaResult(payload);
      const content = asRecord(payload.content);
      const kern = typeof content?.kern === 'string' ? content.kern : '';
      const musicxml = typeof content?.musicxml === 'string' ? content.musicxml : '';
      setMusicTranscodaGeneratedKern(kern);
      setMusicTranscodaGeneratedXml(musicxml);
      const conversionError = asRecord(payload.conversionError);
      const conversionErrorMessage =
        typeof conversionError?.message === 'string' ? conversionError.message : '';
      if (!musicxml.trim() && conversionErrorMessage.trim()) {
        setMusicTranscodaWarning(
          `Transcoda returned kern text, but MusicXML conversion failed: ${conversionErrorMessage}`,
        );
      }
      outcome = 'success';
    } catch (err) {
      console.error('Transcoda request failed', err);
      failureReason = errorMessage(err) || 'Transcoda request failed.';
      setMusicTranscodaError(failureReason);
    } finally {
      setMusicTranscodaPhase('idle');
      setMusicTranscodaBusy(false);
      emitEditorTelemetry('score_editor_ai_request', {
        channel: 'transcoda',
        backend: 'huggingface-space',
        model: MUSIC_SPECIALISTS_DEFAULT_TRANSCODA_MODEL,
        space_id: MUSIC_SPECIALISTS_DEFAULT_TRANSCODA_SPACE_ID,
        image_name: musicTranscodaImageFile.name,
        outcome,
        duration_ms: Math.max(0, Date.now() - requestStartedAt),
        error: outcome === 'failure' ? failureReason || undefined : undefined,
      });
    }
  };

  const handleApplyTranscodaOutput = async (mode: 'overwrite' | 'append') => {
    if (!musicTranscodaGeneratedXml.trim()) {
      alert('No Transcoda MusicXML is available yet.');
      return;
    }
    if (mode === 'append' && !score) {
      alert('Load a target score before appending Transcoda output.');
      return;
    }
    setXmlLoading(true);
    setXmlError(null);
    try {
      if (!score || mode === 'overwrite') {
        const encoder = new TextEncoder();
        const encoded = encoder.encode(musicTranscodaGeneratedXml);
        const file = new File([encoded], 'transcoda-output.musicxml', { type: 'application/xml' });
        if (!score) {
          await handleFileUpload(file, {
            preserveScoreId: false,
            updateUrl: false,
            telemetrySource: 'transcoda_output',
          });
        } else {
          await applyXmlToScore(musicTranscodaGeneratedXml, {
            telemetrySource: 'transcoda_output_overwrite',
          });
        }
      } else {
        const currentXml = await resolveXmlContext();
        if (!currentXml.trim()) {
          throw new Error('Unable to load current score MusicXML for Transcoda append.');
        }
        const appendResult = appendMusicXmlMeasures(currentXml, musicTranscodaGeneratedXml);
        if (appendResult.appendedMeasureCount <= 0) {
          throw new Error('Transcoda MusicXML did not contain appendable measures.');
        }
        await applyXmlToScore(appendResult.xml, {
          telemetrySource: 'transcoda_output_append',
          inputFormat: 'musicxml',
        });
      }
      setXmlSidebarTab('xml');
    } catch (err) {
      console.error('Failed to apply Transcoda output XML', err);
      alert('Failed to apply Transcoda MusicXML. See console for details.');
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

  const generateMmaTemplateFromXml = useCallback(
    async (xml: string, options?: { switchToMmaTab?: boolean }) => {
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
        ? payload.warnings.filter(
            (value): value is string => typeof value === 'string' && value.trim().length > 0,
          )
        : [];
      setMmaWarnings(warnings);
      setMmaSanitizedStderr('');
      setMmaResultPayload(payload);
      if (options?.switchToMmaTab) {
        setXmlSidebarTab('mma');
      }
      return payload;
    },
    [mmaArrangementPreset, mmaGroove, postScoreEditorJson],
  );

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
        ? payload.warnings.filter(
            (value): value is string => typeof value === 'string' && value.trim().length > 0,
          )
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
    downloadBlob(
      mmaGeneratedXml,
      'accompaniment.musicxml',
      'application/vnd.recordare.musicxml+xml',
    );
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

  const handleHarmonyAnalyze = async (options?: {
    applyImmediately?: boolean;
    persistArtifacts?: boolean;
    generateMmaTemplate?: boolean;
  }) => {
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
        maxChangesPerMeasure: Math.min(
          8,
          Math.max(1, Math.trunc(harmonyMaxChangesPerMeasure || 1)),
        ),
        timeoutMs: estimateHarmonyTimeoutMs(xml),
      });
      const warnings = Array.isArray(payload.warnings)
        ? payload.warnings.filter(
            (value): value is string => typeof value === 'string' && value.trim().length > 0,
          )
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
    downloadBlob(
      harmonyGeneratedXml,
      `${filenameBase}.musicxml`,
      'application/vnd.recordare.musicxml+xml',
    );
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
          ? payload.warnings.filter(
              (value): value is string => typeof value === 'string' && value.trim().length > 0,
            )
          : [],
      );
      setFunctionalHarmonySegments(
        Array.isArray(payload.segments)
          ? payload.segments.filter((value): value is Record<string, unknown> =>
              Boolean(asRecord(value)),
            )
          : [],
      );
      const exportsRecord = asRecord(payload.exports);
      setFunctionalHarmonyAnnotatedXml(
        typeof payload.annotatedXml === 'string' ? payload.annotatedXml : '',
      );
      setFunctionalHarmonyJsonExport(
        typeof exportsRecord?.json === 'string' ? exportsRecord.json : '',
      );
      setFunctionalHarmonyRntxtExport(
        typeof exportsRecord?.rntxt === 'string' ? exportsRecord.rntxt : '',
      );
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
      const filenameBase = scoreTitle
        ? `functional-harmony-${toSafeFilename(scoreTitle)}`
        : 'functional-harmony';
      downloadBlob(functionalHarmonyJsonExport, `${filenameBase}.json`, 'application/json');
      return;
    }
    if (!functionalHarmonyRntxtExport.trim()) {
      alert('No harmony text export is available yet.');
      return;
    }
    const filenameBase = scoreTitle
      ? `functional-harmony-${toSafeFilename(scoreTitle)}`
      : 'functional-harmony';
    downloadBlob(functionalHarmonyRntxtExport, `${filenameBase}.rntxt`, 'text/plain;charset=utf-8');
  };

  const handleDownloadFunctionalHarmonyXml = () => {
    if (!functionalHarmonyAnnotatedXml.trim()) {
      alert('No annotated harmony MusicXML is available yet.');
      return;
    }
    const filenameBase = scoreTitle
      ? `functional-harmony-${toSafeFilename(scoreTitle)}`
      : 'functional-harmony';
    downloadBlob(
      functionalHarmonyAnnotatedXml,
      `${filenameBase}.musicxml`,
      'application/vnd.recordare.musicxml+xml',
    );
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
    const baseXml = aiBaseXml.trim() || (await aiScoreBridge.getContextXml()).trim();
    if (!baseXml) {
      alert('Unable to load MusicXML for diff review.');
      return;
    }
    const opened = openAiProposalCompare(baseXml, aiPatchedXml);
    if (!opened) {
      alert('Unable to open compare view for AI proposal.');
      return;
    }
    // openAiProposalCompare resets threads; seed the last patch's annotations after it.
    mergeAiAnnotations(aiLastAnnotations);
  };

  const ensureSelectionInWasm = async () => {
    // If the UI is tracking multiple selected elements, avoid collapsing the WASM selection back to a single point.
    if (selectionBoxes.length > 1) {
      return;
    }
    if (!score || !selectedPoint) {
      return;
    }
    // A range selection cannot be reconstructed from a single point, so
    // re-projecting the UI's selection into the engine would destroy it. Box count
    // is not a usable proxy for this: a range renders as one rectangle per system,
    // so a single-system range legitimately has exactly one box and would otherwise
    // fall through to selectElementAtPoint below and collapse to one note. Ask the
    // engine what it is actually holding.
    try {
      if (score.isSelectionRange && (await score.isSelectionRange())) {
        return;
      }
    } catch {
      // Older build without the export: fall through to the point re-select.
    }

    try {
      const { page, x, y } = selectedPoint;
      const containerRect = containerRef.current?.getBoundingClientRect();
      const engravingPoint = containerRect
        ? clientToEngravingPoint(containerRect.left + x * zoom, containerRect.top + y * zoom)
        : null;
      const selectionX = engravingPoint?.x ?? x;
      const selectionY = engravingPoint?.y ?? y;
      const preferTextSelection =
        hasTextElementClass(selectedElementClasses) || Boolean(textEditorPosition);
      if (preferTextSelection && score.selectTextElementAtPoint) {
        const selected = await score.selectTextElementAtPoint(page, selectionX, selectionY);
        if (selected !== false) {
          selectionProjectionNeededRef.current = false;
        }
        return;
      }
      if (!score.selectElementAtPoint) {
        return;
      }
      const selected = await score.selectElementAtPoint(page, selectionX, selectionY);
      if (selected !== false) {
        selectionProjectionNeededRef.current = false;
      }
    } catch (err) {
      console.warn('Re-select in WASM failed; continuing anyway', err);
    }
  };

  const projectSelectionInWasmIfNeeded = async () => {
    if (selectionProjectionNeededRef.current) {
      await ensureSelectionInWasm();
    }
  };

  const refreshSelectionOverlay = (
    fallbackIndex?: number | null,
    fallbackPoint?: { page: number; x: number; y: number } | null,
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
      new Set(selectors.flatMap((sel) => Array.from(containerRef.current!.querySelectorAll(sel)))),
    );
    const allElements = Array.from(
      containerRef.current.querySelectorAll(ELEMENT_SELECTION_SELECTOR),
    );

    let boxes: SelectionBox[] = [];
    if (candidates.length > 0) {
      boxes = candidates
        .map((cand) => {
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
        .sort(
          (a, b) =>
            a.page - b.page ||
            a.y - b.y ||
            a.x - b.x ||
            (a.index ?? Number.MAX_SAFE_INTEGER) - (b.index ?? Number.MAX_SAFE_INTEGER),
        );
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
          boxes = [
            {
              index: useIndex,
              page,
              x,
              y,
              w,
              h,
              centerX,
              centerY,
              classes: fallbackClass,
            },
          ];
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
      const samePage = boxes.filter((box) => box.page === targetPage);
      const pool = samePage.length > 0 ? samePage : boxes;
      primary = pool.reduce(
        (best, box) => {
          if (!best) return box;
          const bestDist = Math.hypot(best.centerX - usePoint.x, best.centerY - usePoint.y);
          const dist = Math.hypot(box.centerX - usePoint.x, box.centerY - usePoint.y);
          return dist < bestDist ? box : best;
        },
        null as SelectionBox | null,
      );
    } else if (useIndex !== null) {
      primary = boxes.find((box) => box.index === useIndex) ?? boxes[0];
    } else {
      primary = boxes[0];
    }

    if (!primary) {
      return;
    }

    setSelectedElement({ x: primary.x, y: primary.y, w: primary.w, h: primary.h });
    setSelectedPoint({ page: primary.page, x: primary.centerX, y: primary.centerY });
    setSelectedIndex(primary.index);
    setSelectedElementClasses(primary.classes ?? '');
  };

  const advanceSelectionOverlay = (
    startIndex?: number | null,
    startPoint?: { page: number; x: number; y: number } | null,
    step: number = 1,
  ) => {
    if (!containerRef.current) {
      return;
    }
    const allElements = Array.from(
      containerRef.current.querySelectorAll(ELEMENT_SELECTION_SELECTOR),
    );
    if (allElements.length === 0) {
      return;
    }

    let index = startIndex ?? selectedIndex;
    const fallbackPoint =
      startPoint ??
      selectedPoint ??
      (selectedElement
        ? {
            page: 0,
            x: selectedElement.x + selectedElement.w / 2,
            y: selectedElement.y + selectedElement.h / 2,
          }
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
    selectionProjectionNeededRef.current = true;
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
            await runSerializedScoreOperation(() => score.npages!(), 'npages'),
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
    if (typeof fn !== 'function') {
      console.warn(`Mutation binding "${methodName}" is missing on Score instance.`);
      alert(`This build of webmscore does not expose "${methodName}".`);
      return null;
    }
    return (...args: unknown[]) => Reflect.apply(fn, activeScore, args);
  };

  const refreshNoteInputCursor = async (targetScore: Score | null = score) => {
    if (!targetScore?.getNoteInputCursorRect) {
      setNoteInputCursorRect(null);
      return null;
    }
    try {
      const cursor = await runSerializedScoreOperation(
        () => Promise.resolve(targetScore.getNoteInputCursorRect!()),
        'getNoteInputCursorRect',
      );
      if (targetScore !== scoreRef.current) {
        return null;
      }
      if (
        !cursor ||
        !Number.isFinite(cursor.page) ||
        !Number.isFinite(cursor.x) ||
        !Number.isFinite(cursor.y) ||
        !Number.isFinite(cursor.width) ||
        !Number.isFinite(cursor.height) ||
        cursor.width <= 0 ||
        cursor.height <= 0
      ) {
        setNoteInputCursorRect(null);
        return null;
      }
      const normalized: NoteInputCursorRect = {
        page: Math.max(0, Math.floor(cursor.page)),
        x: cursor.x,
        y: cursor.y,
        width: cursor.width,
        height: cursor.height,
        voice: Math.min(3, Math.max(0, Math.floor(cursor.voice))),
      };
      setNoteInputCursorRect(normalized);
      return normalized;
    } catch (err) {
      console.warn('Failed to read note input cursor geometry:', err);
      setNoteInputCursorRect(null);
      return null;
    }
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
    action?: () => Promise<unknown> | unknown,
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
    if (!interactiveMutationEnabled) {
      console.warn(`Mutation "${label}" skipped: interaction not ready.`);
      return;
    }
    if (!action) {
      console.warn(`Mutation "${label}" requested but binding is missing on Score instance.`);
      return;
    }

    // Preserve selection state before mutation for use in fallback
    const preservedIndex = selectedIndex;
    const preservedPoint = selectedPoint;
    // Both guards below exist to protect a selection richer than a single point --
    // originally measure selections, which used to render as one box per notehead.
    // A range now renders as one rectangle per system, so box count no longer
    // detects it and the engine has to be asked. Captured before the mutation,
    // while the caller's selection still exists.
    let preservedRangeSelection = false;
    try {
      preservedRangeSelection = Boolean(score.isSelectionRange && (await score.isSelectionRange()));
    } catch {
      // Older build without the export; fall back to the box-count heuristic.
    }
    const preservedMultiSelection = selectionBoxes.length > 1 || preservedRangeSelection;
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
        selectionProjectionNeededRef.current = false;
      }

      if (!mutated) {
        return;
      }
      if (options?.skipWasmReselect && !options.advanceSelection) {
        selectionProjectionNeededRef.current = false;
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
      if (noteInputActiveRef.current) {
        await refreshNoteInputCursor(score);
      }

      // Re-establish selection inside WASM if we had a previously known point.
      if (
        !options?.skipWasmReselect &&
        !preservedMultiSelection &&
        preservedPoint &&
        score.selectElementAtPoint
      ) {
        try {
          await score.selectElementAtPoint(preservedPoint.page, preservedPoint.x, preservedPoint.y);
        } catch (reselectErr) {
          console.warn(
            'Re-select in WASM after mutation failed; continuing with overlay fallback',
            reselectErr,
          );
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
        // Re-projecting the pre-mutation point while entering notes moves
        // libmscore's InputState back to the chord just entered. The engine
        // already owns the advancing insertion cursor, so audition its current
        // selection without changing that cursor.
        void playSelectionPreview(`mutation:${label}`, preservedPoint ?? undefined, {
          // Mutations such as pitch changes and transposition keep their
          // selection inside libmscore. Re-selecting from the old SVG
          // point after relayout can hit staff lines because the note has
          // moved vertically, leaving the overlay and engine selection
          // out of sync.
          reselect: !noteInputActiveRef.current && !options?.skipWasmReselect,
        });
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
    fallbackPoint?: { page: number; x: number; y: number } | null,
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
    // Captured *before* the render, not after: renderScore() is a WASM round-trip
    // whose latency scales with score complexity, so a newer click's generation
    // bump in handleScoreClick can land while this one is still in flight. Bumping
    // (and capturing) up front means that if this call is stale by the time the
    // render resolves, the check below catches it -- capturing after the render
    // would instead let this call re-mint itself as "current" and go on to
    // schedule a refresh for a selection that no longer exists (regression: a
    // note-click's overlay refresh landing after a later bar click, wiping the
    // bar's selection -- reproduces with dense scores where the render is slow
    // enough for this to race; see docs/private/SELECTION_WORK_HANDOFF.md §3).
    const generation = ++selectionOverlayGenerationRef.current;
    try {
      setOverlaySuppressed(false);
      await renderScore(score, currentPageRef.current);
      if (generation !== selectionOverlayGenerationRef.current) {
        return;
      }
      scheduleSelectionOverlayRefresh(fallback?.index ?? null, fallback?.point ?? null, generation);
    } catch (err) {
      console.warn('Failed to refresh selection highlight from SVG:', err);
    }
  };

  const handleSetSelectionFilterBit = async (filterBit: number, enabled: boolean) => {
    const nextMask = enabled
      ? selectionFilterMaskRef.current | filterBit
      : selectionFilterMaskRef.current & ~filterBit;
    selectionFilterMaskRef.current = nextMask;
    setSelectionFilterMask(nextMask);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SELECTION_FILTER_STORAGE_KEY, String(nextMask));
    }
    const activeScore = scoreRef.current ?? score;
    if (!activeScore?.setSelectionFilter) {
      console.warn('Selection filter is not available in this build.');
      return;
    }
    try {
      const applied = await activeScore.setSelectionFilter(nextMask);
      if (applied !== false) {
        await refreshSelectionFromSvg();
      }
    } catch (err) {
      console.warn('Failed to update selection filter:', err);
    }
  };

  const handleDeleteSelection = () =>
    performMutation(
      'delete selection',
      async () => {
        await ensureSelectionInWasm();
        const del = requireMutation('deleteSelection');
        if (!del) {
          return false;
        }
        return await del();
      },
      { clearSelection: true },
    );
  const handleSelectedTextChange = (value: string) => {
    setSelectedTextValue(value);
  };
  const applySelectedTextValue = (value: string) =>
    performMutation('set selected text', async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('setSelectedText');
      if (!fn) {
        return false;
      }
      return fn(value);
    });
  const handleApplySelectedText = () => applySelectedTextValue(selectedTextValue);
  const handleSetInspectorProperty = async (
    propertyName: InspectorPropertyName,
    value: boolean | number | string,
  ) => {
    await performMutation(`set ${propertyName}`, async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('setSelectedElementProperty');
      if (!fn) return false;
      return fn(propertyName, value);
    });
    await refreshInspector();
  };
  const handleSetFretDiagram = async (diagram: FretDiagramData) => {
    // Keep the fret diagram itself selected across the edit. The default
    // post-mutation WASM re-select hit-tests the old element point, but editing
    // the diagram changes its bounding box, so that point can land on a
    // different element and silently deselect the diagram — which then makes
    // getSelectedFretDiagram() return nothing and breaks re-adding a fingering.
    await performMutation(
      'edit fretboard diagram',
      async () => {
        const fn = requireMutation('setSelectedFretDiagram');
        if (!fn) return false;
        return fn(diagram);
      },
      { skipWasmReselect: true },
    );
    await refreshInspector();
  };
  const handleUndo = () =>
    performMutation(
      'undo',
      score?.undo
        ? async () => {
            const result = await score.undo?.();
            if (score.multiMeasureRestsEnabled) {
              setMultiMeasureRestsEnabled(Boolean(await score.multiMeasureRestsEnabled()));
            }
            return result;
          }
        : undefined,
    );
  const handleRedo = () =>
    performMutation(
      'redo',
      score?.redo
        ? async () => {
            const result = await score.redo?.();
            if (score.multiMeasureRestsEnabled) {
              setMultiMeasureRestsEnabled(Boolean(await score.multiMeasureRestsEnabled()));
            }
            return result;
          }
        : undefined,
    );
  const handlePitchUp = () =>
    performMutation(
      'raise pitch',
      async () => {
        await projectSelectionInWasmIfNeeded();
        const fn = requireMutation('pitchUp');
        if (!fn) return;
        return fn();
      },
      { skipWasmReselect: true, playSelectionPreview: true },
    );
  const handlePitchDown = () =>
    performMutation(
      'lower pitch',
      async () => {
        await projectSelectionInWasmIfNeeded();
        const fn = requireMutation('pitchDown');
        if (!fn) return;
        return fn();
      },
      { skipWasmReselect: true, playSelectionPreview: true },
    );
  const handleTranspose = (semitones: number) =>
    performMutation(
      `transpose ${semitones} semitones`,
      async () => {
        const fn = requireMutation('transpose');
        if (!fn) return;
        // Use BY_INTERVAL mode with the closest standard interval for octave shortcuts
        // For octave up/down (±12), use Perfect Octave (index 25)
        const absSemitones = Math.abs(semitones);
        if (absSemitones === 12) {
          const direction = semitones > 0 ? 0 : 1; // UP=0, DOWN=1
          return fn(1, direction, 0, 25, true, true, true); // BY_INTERVAL, Perfect Octave
        }
        // For other semitone values, use BY_INTERVAL with lookup
        // Simple mapping: semitones to interval index (common ones)
        const semitonesToInterval: Record<number, number> = {
          1: 3,
          2: 4,
          3: 7,
          4: 8,
          5: 11,
          6: 12,
          7: 14,
          8: 17,
          9: 18,
          10: 21,
          11: 22,
          12: 25,
        };
        const idx = semitonesToInterval[absSemitones] ?? 0;
        const direction = semitones > 0 ? 0 : 1;
        return fn(1, direction, 0, idx, true, true, true);
      },
      { skipWasmReselect: true, playSelectionPreview: true },
    );
  const handleTransposeEx = (
    mode: number,
    direction: number,
    key: number,
    interval: number,
    trKeys: boolean,
    trChordNames: boolean,
    useDoubleSharpsFlats: boolean,
  ) =>
    performMutation(
      'transpose',
      async () => {
        const fn = requireMutation('transpose');
        if (!fn) return;
        return fn(mode, direction, key, interval, trKeys, trChordNames, useDoubleSharpsFlats);
      },
      { skipWasmReselect: true, playSelectionPreview: true },
    );
  const handleSelectAll = async () => {
    if (!score) return;
    const fn = requireMutation('selectAll');
    if (!fn) return;
    await fn();
    // Re-render to show selection highlights
    await renderScore(score);
    // Refresh selection overlays
    const activeScore = scoreRef.current ?? score;
    const getBBoxesFn = (activeScore as MutationMethods).getSelectionBoundingBoxes;
    if (typeof getBBoxesFn === 'function') {
      const boxes = await getBBoxesFn.call(activeScore);
      if (Array.isArray(boxes) && boxes.length > 0) {
        setSelectionBoxes(
          boxes.map((box, index) => ({
            index,
            page: box.page,
            x: box.x,
            y: box.y,
            w: box.width,
            h: box.height,
            centerX: box.x + box.width / 2,
            centerY: box.y + box.height / 2,
            classes: '',
          })),
        );
      }
    }
  };
  const handleInsertMeasures = (count: number, target: MeasureInsertTarget) =>
    performMutation('insert measures', async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('insertMeasures');
      if (!fn) return false;
      const sanitized = Math.max(1, Math.floor(count));
      const targetValue =
        measureInsertTargetMap[target] ?? measureInsertTargetMap['after-selection'];
      return fn(sanitized, targetValue);
    });
  const handleAddPickup = (numerator: number, denominator: number) =>
    performMutation('add pickup measure', async () => {
      const fn = requireMutation('addPickupMeasure');
      if (!fn) return false;
      return fn(numerator, denominator);
    });
  // Deletes the measures the current selection sits in. ensureSelectionInWasm is
  // required because the engine resolves the measure range from its own selection
  // state, which a UI-side selection has not necessarily reached yet.
  const handleRemoveContainingMeasures = () =>
    performMutation(
      'remove containing measures',
      async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('removeSelectedMeasures');
        if (!fn) return false;
        return fn();
      },
      { clearSelection: true, skipWasmReselect: true },
    );
  const handleRemoveTrailingEmptyMeasures = () =>
    performMutation(
      'remove trailing empty measures',
      async () => {
        const fn = requireMutation('removeTrailingEmptyMeasures');
        if (!fn) return false;
        return fn();
      },
      { clearSelection: true, skipWasmReselect: true },
    );
  const handleSelectNextChord = async () => {
    if (!score) return;
    await projectSelectionInWasmIfNeeded();
    const selectFn = requireMutation('selectNextChord');
    if (!selectFn) {
      return;
    }

    const result = await selectFn.call(score);
    if (!result) {
      return;
    }
    selectionProjectionNeededRef.current = false;

    let targetPage = currentPageRef.current;
    const activeScore = scoreRef.current ?? score;
    if (noteInputActiveRef.current && activeScore.setInputStateFromSelection) {
      await Promise.resolve(activeScore.setInputStateFromSelection());
      const cursor = await refreshNoteInputCursor(activeScore);
      if (cursor) {
        targetPage = cursor.page;
      }
    } else {
      const getBBoxFn = (activeScore as MutationMethods).getSelectionBoundingBox;
      if (typeof getBBoxFn === 'function') {
        const bbox = await getBBoxFn.call(activeScore);
        if (bbox && typeof bbox.page === 'number') {
          targetPage = bbox.page;
        }
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
    await projectSelectionInWasmIfNeeded();
    const selectFn = requireMutation('selectPrevChord');
    if (!selectFn) {
      return;
    }

    const result = await selectFn.call(score);
    if (!result) {
      return;
    }
    selectionProjectionNeededRef.current = false;

    let targetPage = currentPageRef.current;
    const activeScore = scoreRef.current ?? score;
    if (noteInputActiveRef.current && activeScore.setInputStateFromSelection) {
      await Promise.resolve(activeScore.setInputStateFromSelection());
      const cursor = await refreshNoteInputCursor(activeScore);
      if (cursor) {
        targetPage = cursor.page;
      }
    } else {
      const getBBoxFn = (activeScore as MutationMethods).getSelectionBoundingBox;
      if (typeof getBBoxFn === 'function') {
        const bbox = await getBBoxFn.call(activeScore);
        if (bbox && typeof bbox.page === 'number') {
          targetPage = bbox.page;
        }
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
  /**
   * Extends the engine's range selection and mirrors the result into the overlay.
   *
   * `anchor` picks which returned box drives selectedElement/selectedPoint: extending
   * forward should leave the caret on the new trailing edge, backward on the leading
   * one. For a range selection the engine now returns one box per system rather than
   * one per notehead, so this is usually a single box either way.
   */
  const extendSelectionBy = async (
    method:
      | 'extendSelectionNextChord'
      | 'extendSelectionPrevChord'
      | 'extendSelectionNextMeasure'
      | 'extendSelectionPrevMeasure'
      | 'extendSelectionStaffAbove'
      | 'extendSelectionStaffBelow',
    anchor: 'first' | 'last',
  ) => {
    if (!score) return;
    await projectSelectionInWasmIfNeeded();
    const extendFn = requireMutation(method);
    const getBBoxesFn = requireMutation('getSelectionBoundingBoxes');
    if (!extendFn || !getBBoxesFn) {
      return;
    }

    const result = await extendFn.call(score);
    if (!result) return;
    selectionProjectionNeededRef.current = false;

    const bboxes = await getBBoxesFn.call(score);
    await renderScore(score, currentPageRef.current);
    if (!bboxes || bboxes.length === 0) return;

    const boxes = bboxes.map(
      (
        bbox: { page: number; x: number; y: number; width: number; height: number },
        index: number,
      ) => ({
        index,
        page: bbox.page,
        x: bbox.x,
        y: bbox.y,
        w: bbox.width,
        h: bbox.height,
        centerX: bbox.x + bbox.width / 2,
        centerY: bbox.y + bbox.height / 2,
      }),
    );
    const anchorBox = anchor === 'last' ? bboxes[bboxes.length - 1] : bboxes[0];
    setSelectedElement({ x: anchorBox.x, y: anchorBox.y, w: anchorBox.width, h: anchorBox.height });
    setSelectedPoint({
      page: anchorBox.page,
      x: anchorBox.x + anchorBox.width / 2,
      y: anchorBox.y + anchorBox.height / 2,
    });
    setSelectionBoxes(boxes);
  };
  const handleExtendSelectionNextChord = () =>
    extendSelectionBy('extendSelectionNextChord', 'last');
  const handleExtendSelectionPrevChord = () =>
    extendSelectionBy('extendSelectionPrevChord', 'first');
  // Ctrl+Shift+Arrow, matching desktop MuseScore's select-next/prev-measure.
  const handleExtendSelectionNextMeasure = () =>
    extendSelectionBy('extendSelectionNextMeasure', 'last');
  const handleExtendSelectionPrevMeasure = () =>
    extendSelectionBy('extendSelectionPrevMeasure', 'first');
  // Shift+Up/Down, matching desktop MuseScore's select-staff-above/below. This is
  // what widens a range across staves; without it a selection can never span more
  // than the staff it started on.
  const handleExtendSelectionStaffAbove = () =>
    extendSelectionBy('extendSelectionStaffAbove', 'first');
  const handleExtendSelectionStaffBelow = () =>
    extendSelectionBy('extendSelectionStaffBelow', 'last');
  const handleSetAccidental = (accidentalType: number) => {
    return performMutation(
      `set accidental ${accidentalType}`,
      async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('setAccidental');
        if (!fn) return;
        return fn(accidentalType);
      },
      { playSelectionPreview: true },
    );
  };
  const handleDurationLonger = () =>
    performMutation(
      'lengthen duration',
      async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('doubleDuration');
        if (!fn) return;
        return fn();
      },
      { playSelectionPreview: true },
    );
  const handleDurationShorter = () =>
    performMutation(
      'shorten duration',
      async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('halfDuration');
        if (!fn) return;
        return fn();
      },
      { playSelectionPreview: true },
    );

  const handleToggleDot = () =>
    performMutation(
      'toggle dot',
      async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('toggleDot');
        if (!fn) return;
        return fn();
      },
      { playSelectionPreview: true },
    );

  const handleToggleDoubleDot = () =>
    performMutation(
      'toggle double dot',
      async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('toggleDoubleDot');
        if (!fn) return;
        return fn();
      },
      { playSelectionPreview: true },
    );

  const handleSetDurationType = (durationType: number) =>
    performMutation(
      'set duration',
      async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('setDurationType');
        if (!fn) return;
        return fn(durationType);
      },
      { playSelectionPreview: true },
    );

  const handleAddPitchByStep = (noteIndex: number, addToChord: boolean) => {
    const enteringNotes = noteInputActiveRef.current;
    const shouldAdvanceSelection = !enteringNotes && !addToChord;
    return performMutation(
      'add pitch',
      async () => {
        if (!enteringNotes) {
          await ensureSelectionInWasm();
        }
        const fn = requireMutation('addPitchByStep');
        if (!fn) return;
        return fn(noteIndex, addToChord, false);
      },
      {
        skipWasmReselect: true,
        skipSelectionFallback: enteringNotes || shouldAdvanceSelection,
        advanceSelection: shouldAdvanceSelection,
        playSelectionPreview: true,
      },
    );
  };

  const handleEnterRest = () => {
    const enteringNotes = noteInputActiveRef.current;
    return performMutation(
      'enter rest',
      async () => {
        if (!enteringNotes) {
          await ensureSelectionInWasm();
        }
        const fn = requireMutation('enterRest');
        if (!fn) return;
        return fn();
      },
      {
        skipWasmReselect: true,
        skipSelectionFallback: true,
        advanceSelection: !enteringNotes,
      },
    );
  };

  const setNoteInputMode = async (enabled: boolean) => {
    const targetScore = score;
    if (!targetScore?.setNoteEntryMode) {
      return;
    }
    noteInputDesiredRef.current = enabled;
    try {
      if (enabled && targetScore.setInputStateFromSelection) {
        // A click paints its optimistic overlay before the engine selection RPC
        // settles. If N follows immediately, seed note input from the completed
        // click rather than the selection that preceded it.
        await selectionInFlightRef.current?.catch(() => false);
        // Seed the input duration/track from the selection when there is one;
        // fails harmlessly with no selection (putNote derives position per click).
        await Promise.resolve(targetScore.setInputStateFromSelection()).catch(() => {});
      }
      const changed = await Promise.resolve(targetScore.setNoteEntryMode(enabled));
      if (targetScore !== scoreRef.current) {
        return;
      }
      if (changed === false) {
        noteInputDesiredRef.current = noteInputActiveRef.current;
        return;
      }
      noteInputActiveRef.current = enabled;
      setNoteInputActive(enabled);
      if (enabled && targetScore.getSpatium) {
        const spatium = await Promise.resolve(targetScore.getSpatium()).catch(() => null);
        scoreSpatiumRef.current =
          typeof spatium === 'number' && Number.isFinite(spatium) && spatium > 0 ? spatium : null;
      }
      if (enabled) {
        await refreshSelectionFromSvg();
        await refreshNoteInputCursor(targetScore);
      } else {
        setNoteInputCursorRect(null);
        setNoteInputShadow(null);
      }
    } catch (err) {
      if (targetScore === scoreRef.current) {
        noteInputDesiredRef.current = noteInputActiveRef.current;
        console.warn('Failed to toggle note input mode:', err);
      }
    }
  };

  const toggleNoteInputMode = () => {
    void setNoteInputMode(!noteInputDesiredRef.current);
  };

  // Input-state setters only touch the engine InputState — no relayout needed.
  const handleSetInputDuration = async (durationType: number) => {
    const fn = score?.setInputDurationType;
    if (!fn) {
      return;
    }
    try {
      await Promise.resolve(fn.call(score, durationType));
    } catch (err) {
      console.warn('setInputDurationType failed:', err);
    }
  };

  const handleToggleInputDotState = async () => {
    const fn = score?.toggleInputDot;
    if (!fn) {
      return;
    }
    try {
      await Promise.resolve(fn.call(score));
    } catch (err) {
      console.warn('toggleInputDot failed:', err);
    }
  };

  const handleSetInputAccidental = async (accidentalType: number) => {
    const fn = score?.setInputAccidentalType;
    if (!fn) {
      return;
    }
    try {
      await Promise.resolve(fn.call(score, accidentalType));
    } catch (err) {
      console.warn('setInputAccidentalType failed:', err);
    }
  };

  const handleSetInputVoice = async (voiceIndex: number) => {
    const fn = score?.setVoice;
    if (!fn) {
      return;
    }
    try {
      await Promise.resolve(fn.call(score, voiceIndex));
      await refreshNoteInputCursor(score);
    } catch (err) {
      console.warn('setVoice for note input failed:', err);
    }
  };

  const handleSetNoteInputMethod = async (method: number) => {
    const fn = score?.setNoteEntryMethod;
    if (!fn) {
      return;
    }
    try {
      const changed = await Promise.resolve(fn.call(score, method));
      if (changed !== false) {
        setNoteInputMethod(method);
      }
    } catch (err) {
      console.warn('setNoteEntryMethod failed:', err);
    }
  };

  const handlePutNoteAtPoint = async (page: number, x: number, y: number) => {
    let placed = false;
    await performMutation(
      'place note',
      async () => {
        const fn = requireMutation('putNote');
        if (!fn) {
          return false;
        }
        const result = await fn(page, x, y);
        placed = result !== false;
        return result;
      },
      { skipWasmReselect: true, skipSelectionFallback: true },
    );
    // The engine selects the placed note; preview it without reselecting.
    if (placed) {
      void playSelectionPreview('mutation:place note', undefined, { reselect: false });
    }
  };

  const handleToggleLineBreak = () =>
    performMutation(
      'toggle line break',
      async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('toggleLineBreak');
        if (!fn) return;
        return fn();
      },
      { skipWasmReselect: true },
    );

  const handleTogglePageBreak = () =>
    performMutation(
      'toggle page break',
      async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('togglePageBreak');
        if (!fn) return;
        return fn();
      },
      { skipWasmReselect: true },
    );

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

  const handleSetNoteheadGroup = (noteheadGroup: number) =>
    performMutation('set notehead group', async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('setNoteheadGroup');
      if (!fn) return false;
      return fn(noteheadGroup);
    });

  const handleSetBeamMode = (beamMode: number) =>
    performMutation('set beam mode', async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('setBeamMode');
      if (!fn) return false;
      return fn(beamMode);
    });

  const handleAddDynamic = (dynamicType: number) =>
    performMutation('add dynamic', async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addDynamic');
      if (!fn) return;
      return fn(dynamicType);
    });

  const handleAddHairpin = (hairpinType: number) =>
    performMutation('add hairpin', async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addHairpin');
      if (!fn) return;
      return fn(hairpinType);
    });

  const handleAddFermata = (fermataVariant: number) =>
    performMutation('add fermata', async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addFermata');
      if (!fn) return false;
      return fn(fermataVariant);
    });

  const handleAddBreath = (breathType: number) =>
    performMutation('add breath or caesura', async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addBreath');
      if (!fn) return false;
      return fn(breathType);
    });

  const handleAddArpeggio = (arpeggioType: number) =>
    performMutation('add arpeggio', async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addArpeggio');
      if (!fn) return false;
      return fn(arpeggioType);
    });

  const handleAddTremolo = (tremoloType: number) =>
    performMutation('add tremolo', async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addTremolo');
      if (!fn) return false;
      return fn(tremoloType);
    });

  const handleAddOttava = (ottavaType: number) =>
    performMutation('add ottava', async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addOttava');
      if (!fn) return false;
      return fn(ottavaType);
    });

  const handleAddTrill = (trillType: number) =>
    performMutation('add trill line', async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addTrill');
      if (!fn) return false;
      return fn(trillType);
    });

  const handleAddGlissando = (glissandoType: number) =>
    performMutation('add glissando', async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addGlissando');
      if (!fn) return false;
      return fn(glissandoType);
    });

  const handleAddPedal = (pedalVariant: number) =>
    performMutation('add pedal', async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addPedal');
      if (!fn) return;
      return fn(pedalVariant);
    });

  const handleAddSostenutoPedal = () =>
    performMutation('add sostenuto pedal', async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addSostenutoPedal');
      if (!fn) return;
      return fn();
    });

  const handleAddUnaCorda = () =>
    performMutation('add una corda', async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addUnaCorda');
      if (!fn) return;
      return fn();
    });

  const handleSplitPedal = () =>
    performMutation('split pedal', async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('splitPedal');
      if (!fn) return;
      return fn();
    });

  const handleAddTempoText = (bpm: number) => {
    const hadSelection = Boolean(selectedElement);
    return performMutation(
      'add tempo text',
      async () => {
        const fn = requireMutation('addTempoText');
        if (!fn) return;
        return fn(bpm);
      },
      hadSelection ? undefined : { clearSelection: true },
    );
  };

  const handleAddArticulation = (articulationSymbolName: string) =>
    performMutation(`add articulation ${articulationSymbolName}`, async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addArticulation');
      if (!fn) return;
      return fn(articulationSymbolName);
    });

  const handleAddFretDiagram = async (pattern: string) => {
    await performMutation(
      'add fretboard diagram',
      async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('addFretDiagram');
        if (!fn) return false;
        return fn(pattern);
      },
      { skipWasmReselect: true, skipSelectionFallback: true },
    );
    await refreshInspector();
  };

  const handleAddAmbitus = () =>
    performMutation(
      'add ambitus',
      async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('addAmbitus');
        if (!fn) return false;
        return fn();
      },
      { skipWasmReselect: true, skipSelectionFallback: true },
    );

  const runRangeTool = (
    label: string,
    method:
      'explodeSelection' | 'implodeSelection' | 'regroupSelection' | 'resequenceRehearsalMarks',
  ) =>
    performMutation(label, async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation(method);
      if (!fn) return false;
      return fn();
    });

  const handleApplyFloatingPaletteItem = (item: ScorePaletteItem) => {
    switch (item.kind) {
      case 'clef':
        return handleSetClef(item.subtype);
      case 'dynamic':
        return handleAddDynamic(item.subtype);
      case 'articulation': {
        const articulation = articulationOptions[item.subtype];
        if (articulation) handleAddArticulation(articulation.symbol);
        return;
      }
      case 'ottava':
        return handleAddOttava(item.subtype);
      case 'trill':
        return handleAddTrill(item.subtype);
      case 'glissando':
        return handleAddGlissando(item.subtype);
      case 'arpeggio':
        return handleAddArpeggio(item.subtype);
      case 'fermata':
        return handleAddFermata(item.subtype);
      case 'breath':
        return handleAddBreath(item.subtype);
      case 'tremolo':
        return handleAddTremolo(item.subtype);
      case 'marker':
        return handleAddMarker(item.subtype);
      case 'jump':
        return handleAddJump(item.subtype);
      case 'notehead':
        return handleSetNoteheadGroup(item.subtype);
      case 'beam':
        return handleSetBeamMode(item.subtype);
      case 'accidental':
        return handleSetAccidental(item.subtype);
      case 'gracenote':
        return handleAddGraceNote(item.subtype);
      case 'hairpin':
        return handleAddHairpin(item.subtype);
      case 'pedal':
        return handleAddPedal(item.subtype);
      case 'keysig':
        return handleSetKeySignature(item.subtype);
      case 'timesig': {
        const [numerator, denominator, timeSigType] = item.args ?? [];
        if (numerator && denominator) handleSetTimeSignature(numerator, denominator, timeSigType);
        return;
      }
      case 'barline':
        return handleSetBarLineType(item.subtype);
      case 'volta':
        return handleAddVolta(item.subtype);
      case 'repeat-start':
        return handleToggleRepeatStart();
      case 'repeat-end':
        return handleToggleRepeatEnd();
      case 'repeat-count':
        return handleSetRepeatCount(item.subtype);
    }
  };

  const handleAddSlur = () =>
    performMutation('add slur', async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addSlur');
      if (!fn) return;
      return fn();
    });

  const handleFlipStem = () =>
    performMutation('flip stem', async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('flipStem');
      if (!fn) return false;
      return fn();
    });

  const handleAddTie = () =>
    performMutation('add tie', async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addTie');
      if (!fn) return;
      return fn();
    });

  const handleAddGraceNote = (graceType: number) =>
    performMutation(`add grace note ${graceType}`, async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addGraceNote');
      if (!fn) return;
      return fn(graceType);
    });

  const handleAddTuplet = (tupletCount: number) =>
    performMutation(`add tuplet ${tupletCount}`, async () => {
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

  const handleAddNoteFromRest = () =>
    performMutation(
      'add note',
      async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('addNoteFromRest');
        if (!fn) return;
        return fn();
      },
      { playSelectionPreview: true },
    );

  const handleToggleRepeatStart = () =>
    performMutation('toggle repeat start', async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('toggleRepeatStart');
      if (!fn) return;
      return fn();
    });

  const handleToggleRepeatEnd = () =>
    performMutation('toggle repeat end', async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('toggleRepeatEnd');
      if (!fn) return;
      return fn();
    });

  const handleSetRepeatCount = (count: number) =>
    performMutation(`set repeat count ${count}`, async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('setRepeatCount');
      if (!fn) return;
      return fn(count);
    });

  const handleSetBarLineType = (barLineType: number) =>
    performMutation(`set barline type ${barLineType}`, async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('setBarLineType');
      if (!fn) return;
      return fn(barLineType);
    });

  const handleAddVolta = (endingNumber: number) =>
    performMutation(`add volta ${endingNumber}`, async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addVolta');
      if (!fn) return;
      return fn(endingNumber);
    });

  const handleAddMarker = (markerType: number) =>
    performMutation('add navigation marker', async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addMarker');
      if (!fn) return false;
      return fn(markerType);
    });

  const handleAddJump = (jumpType: number) =>
    performMutation('add playback jump', async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addJump');
      if (!fn) return false;
      return fn(jumpType);
    });

  const handleAddMeasureRepeat = (numMeasures: number) =>
    performMutation(
      'add measure repeat',
      async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('addMeasureRepeat');
        if (!fn) return false;
        return fn(numMeasures);
      },
      { skipWasmReselect: true, skipSelectionFallback: true },
    );

  const handleSetMultiMeasureRests = (enabled: boolean) =>
    performMutation(
      'set multi-measure rests',
      async () => {
        const fn = requireMutation('setMultiMeasureRests');
        if (!fn) return false;
        const changed = await fn(enabled);
        if (changed !== false) {
          setMultiMeasureRestsEnabled(enabled);
        }
        return changed;
      },
      { clearSelection: true, skipWasmReselect: true, skipSelectionFallback: true },
    );

  const handleSetTitleText = async (text?: string) => {
    if (!score) {
      return;
    }

    await performMutation(
      'set title',
      async () => {
        const fn = requireMutation('setTitleText');
        if (!fn) return;
        return fn(text ?? scoreTitle);
      },
      { skipWasmReselect: true },
    );
    await refreshScoreMetadata(score);
  };

  const handleSetSubtitleText = async (text?: string) => {
    if (!score) {
      return;
    }

    await performMutation(
      'set subtitle',
      async () => {
        const fn = requireMutation('setSubtitleText');
        if (!fn) return;
        return fn(text ?? scoreSubtitle);
      },
      { skipWasmReselect: true },
    );
    await refreshScoreMetadata(score);
  };

  const handleSetComposerText = async (text?: string) => {
    if (!score) {
      return;
    }

    await performMutation(
      'set composer',
      async () => {
        const fn = requireMutation('setComposerText');
        if (!fn) return;
        return fn(text ?? scoreComposer);
      },
      { skipWasmReselect: true },
    );
    await refreshScoreMetadata(score);
  };

  const handleSetLyricistText = async (text?: string) => {
    if (!score) {
      return;
    }

    await performMutation(
      'set lyricist',
      async () => {
        const fn = requireMutation('setLyricistText');
        if (!fn) return;
        return fn(text ?? scoreLyricist);
      },
      { skipWasmReselect: true },
    );
    await refreshScoreMetadata(score);
  };

  /**
   * ExpressionSection's Text > Score Header menu (Title/Subtitle/Composer/Lyricist).
   * Reuses the same setXText mutations as the (currently unrendered) ScoreSection
   * input/button pair -- see docs/private/SELECTION_WORK_HANDOFF.md open item #3.
   * Prompts rather than positioning an inline editor at the menu's click point:
   * that's the pattern every other Text-menu entry already uses (handleAddStaffText
   * et al., via promptForText), and header text has no associated selection or
   * on-page element to anchor an inline editor to in the general case.
   */
  const handleOpenHeaderEditor = (target: HeaderTextTarget) => {
    const config: Record<
      HeaderTextTarget,
      {
        label: string;
        value: string;
        setValue: (v: string) => void;
        apply: (text?: string) => Promise<void>;
      }
    > = {
      title: {
        label: 'Title:',
        value: scoreTitle,
        setValue: setScoreTitle,
        apply: handleSetTitleText,
      },
      subtitle: {
        label: 'Subtitle:',
        value: scoreSubtitle,
        setValue: setScoreSubtitle,
        apply: handleSetSubtitleText,
      },
      composer: {
        label: 'Composer:',
        value: scoreComposer,
        setValue: setScoreComposer,
        apply: handleSetComposerText,
      },
      lyricist: {
        label: 'Lyricist:',
        value: scoreLyricist,
        setValue: setScoreLyricist,
        apply: handleSetLyricistText,
      },
    };
    const { label, value, setValue, apply } = config[target];
    const text = promptForText(label, value);
    if (text === null) {
      return;
    }
    setValue(text);
    void apply(text);
  };

  const handleAddPart = async (instrumentId: string) => {
    if (!score || !instrumentId) {
      return;
    }

    await performMutation(
      'add instrument',
      async () => {
        const fn = requireMutation('appendPart');
        if (!fn) return;
        return fn(instrumentId);
      },
      { skipWasmReselect: true },
    );
    await refreshScoreMetadata(score);
  };

  const handleRemovePart = async (partIndex: number) => {
    if (!score) {
      return;
    }

    await performMutation(
      'remove instrument',
      async () => {
        const fn = requireMutation('removePart');
        if (!fn) return;
        return fn(partIndex);
      },
      { clearSelection: true, skipWasmReselect: true },
    );
    await refreshScoreMetadata(score);
  };

  const handleTogglePartVisible = async (partIndex: number, visible: boolean) => {
    if (!score) {
      return;
    }

    await performMutation(
      'toggle part visibility',
      async () => {
        const fn = requireMutation('setPartVisible');
        if (!fn) return;
        return fn(partIndex, visible);
      },
      { skipWasmReselect: true },
    );
    await refreshScoreMetadata(score);
  };

  const handleCopySelection = () => {
    const run = copySelectionToClipboard({
      getType: score
        ? (requireMutation('selectionMimeType') as (() => Promise<string>) | null)
        : null,
      getData: score
        ? (requireMutation('selectionMimeData') as (() => Promise<Uint8Array>) | null)
        : null,
      ensureSelection: ensureSelectionInWasm,
      store: (payload) => {
        clipboardRef.current = payload;
      },
    });
    copyInFlightRef.current = run;
    void run.finally(() => {
      if (copyInFlightRef.current === run) copyInFlightRef.current = null;
    });
    return run;
  };

  const handlePasteSelection = () => {
    const fn = requireMutation('pasteSelection');
    const pastePromise = pasteClipboardPayload({
      readPayload: () => clipboardRef.current,
      copyInFlight: copyInFlightRef.current,
      selectionInFlight: selectionInFlightRef.current,
      selectionProjectionNeeded: selectionProjectionNeededRef.current,
      ensureSelection: ensureSelectionInWasm,
      paste: fn as ((mimeType: string, data: Uint8Array) => Promise<unknown> | unknown) | null,
      onEmpty: () => alert('Nothing copied yet.'),
    });
    return performMutation('paste selection', () => pastePromise, { skipWasmReselect: true });
  };

  const handleCompareKeyboardShortcut = useCallback(
    (event: KeyboardEvent) => {
      const mutate = (
        label: string,
        methodName: CompareKeyboardMutationMethod,
        args: unknown[] = [],
        skipRelayout = false,
      ) => {
        void queueCompareKeyboardOperation(() =>
          performCompareMutation(
            label,
            (targetScore) => {
              const fn = (targetScore as MutationMethods)[methodName];
              if (typeof fn !== 'function') {
                alert(`This build of webmscore does not expose "${String(methodName)}".`);
                return false;
              }
              return (fn as (...values: unknown[]) => unknown).apply(targetScore, args);
            },
            { skipRelayout, preserveKeyboardQueue: true },
          ),
        ).catch((err) => {
          console.warn(`Compare keyboard mutation "${label}" failed:`, err);
        });
      };
      const updateInputState = (methodName: CompareInputStateMethod, args: unknown[] = []) => {
        const fn = compareActiveScore ? (compareActiveScore as MutationMethods)[methodName] : null;
        if (typeof fn === 'function') {
          void queueCompareKeyboardOperation(() =>
            runSerializedScoreOperation(
              () =>
                Promise.resolve(
                  (fn as (...values: unknown[]) => unknown).apply(compareActiveScore, args),
                ),
              `compare-input:${String(methodName)}`,
            ),
          ).catch((err) => {
            console.warn(`Compare input shortcut "${String(methodName)}" failed:`, err);
          });
        }
      };
      return routeCompareKeyboardShortcut(event, {
        active: Boolean(
          compareView && compareActiveSide && compareActiveScore && compareActiveRole,
        ),
        activeRole: compareActiveRole,
        hasSelection: compareActiveRole ? compareHasSelectionByRole[compareActiveRole] : false,
        noteMode: compareActiveRole ? isCompareNoteInputCommitted(compareActiveRole) : false,
        mutate,
        updateInputState,
        copySelection: () => {
          if (!compareActiveScore || !compareActiveSide) {
            return;
          }
          const sourceScore = compareActiveScore;
          const sourceSide = compareActiveSide;
          void queueCompareKeyboardOperation(() =>
            copyCompareSelection(sourceScore, sourceSide),
          ).catch((err) => {
            console.warn('Compare selection copy failed:', err);
          });
        },
        pasteSelection: () => {
          if (!compareActiveSide) {
            return;
          }
          const targetSide = compareActiveSide;
          void queueCompareKeyboardOperation(async () => {
            // Resolve the clipboard after prior queued shortcuts complete so
            // a rapid Copy, Paste sequence sees the bytes captured by Copy.
            const clip = clipboardRef.current;
            if (!clip) {
              alert('Nothing copied yet.');
              return false;
            }
            return performCompareMutation(
              'paste selection',
              (targetScore) => {
                if (!targetScore.pasteSelection) {
                  alert('This build of webmscore does not expose "pasteSelection".');
                  return false;
                }
                return targetScore.pasteSelection(clip.mimeType, clip.data);
              },
              {
                side: targetSide,
                preserveKeyboardQueue: true,
              },
            );
          }).catch((err) => {
            console.warn('Compare selection paste failed:', err);
          });
        },
        disableNoteInput: () => {
          if (compareActiveSide) {
            void setCompareNoteInputMode(false, compareActiveSide);
          }
        },
        toggleNoteInput: () => {
          if (compareActiveSide) {
            toggleCompareNoteInputMode(compareActiveSide);
          }
        },
        setHasSelection: setCompareHasSelection,
      });
    },
    [
      // clipboardRef is a stable useRef owned by useCompareClipboard; listed because
      // the rule cannot see through the hook's destructured return.
      clipboardRef,
      compareActiveRole,
      compareActiveScore,
      compareActiveSide,
      compareHasSelectionByRole,
      compareView,
      copyCompareSelection,
      isCompareNoteInputCommitted,
      performCompareMutation,
      queueCompareKeyboardOperation,
      runSerializedScoreOperation,
      setCompareHasSelection,
      setCompareNoteInputMode,
      toggleCompareNoteInputMode,
    ],
  );

  const isEditableTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    const tagName = target.tagName.toLowerCase();
    return (
      target.isContentEditable ||
      tagName === 'input' ||
      tagName === 'textarea' ||
      tagName === 'select'
    );
  };

  keyboardShortcutHandlerRef.current = (event: KeyboardEvent) => {
    if (event.defaultPrevented || !score) {
      return;
    }
    if (isEditableTarget(event.target)) {
      return;
    }
    if (compareView) {
      handleCompareKeyboardShortcut(event);
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
      if (key === 'a') {
        event.preventDefault();
        handleSelectAll();
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

    if (key === 'escape' && noteInputActiveRef.current) {
      event.preventDefault();
      void setNoteInputMode(false);
      return;
    }

    if (!isMod) {
      if (key === 'n' && !event.altKey && !event.shiftKey && interactiveMutationEnabled) {
        event.preventDefault();
        toggleNoteInputMode();
        return;
      }

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

      // In note-input mode the duration/dot keys set the input state for the
      // next placed note rather than mutating the selection.
      if (interactiveMutationEnabled && noteInputActiveRef.current) {
        if (rawKey in durationMap) {
          event.preventDefault();
          void handleSetInputDuration(durationMap[rawKey]);
          return;
        }
        if (rawKey === '.') {
          event.preventDefault();
          void handleToggleInputDotState();
          return;
        }
        if (rawKey === '+' || rawKey === '-' || rawKey === '=') {
          event.preventDefault();
          const accidentalType = rawKey === '+' ? 3 : rawKey === '-' ? 1 : 2;
          void handleSetInputAccidental(accidentalType);
          return;
        }
        if (rawKey === '0') {
          event.preventDefault();
          handleEnterRest();
          return;
        }
        if (!event.altKey && key in noteMap) {
          event.preventDefault();
          handleAddPitchByStep(noteMap[key], event.shiftKey);
          return;
        }
      }

      if (interactiveMutationEnabled && hasSelection) {
        if (key === 's' && !event.altKey && !event.shiftKey && !noteInputActiveRef.current) {
          event.preventDefault();
          handleAddSlur();
          return;
        }

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
      if (noteInputActiveRef.current) {
        event.preventDefault();
        return;
      }
      if (!interactiveMutationEnabled) {
        return;
      }
      const hasSelection = Boolean(selectedElement) || selectionBoxes.length > 0;
      if (!hasSelection) {
        return;
      }
      event.preventDefault();
      if (isMod) {
        handleTranspose(key === 'arrowup' ? 12 : -12);
      } else if (event.shiftKey) {
        // Desktop MuseScore: Shift+Up/Down extends the range to the staff
        // above/below. This must be checked before the pitch handlers --
        // Shift previously fell through to them and transposed instead.
        if (key === 'arrowup') {
          handleExtendSelectionStaffAbove();
        } else {
          handleExtendSelectionStaffBelow();
        }
      } else if (key === 'arrowup') {
        handlePitchUp();
      } else {
        handlePitchDown();
      }
      return;
    }

    if (key === 'arrowleft' || key === 'arrowright') {
      if (!interactiveMutationEnabled) {
        return;
      }
      const hasSelection = Boolean(selectedElement) || selectionBoxes.length > 0;
      if (!hasSelection) {
        return;
      }
      event.preventDefault();
      if (event.shiftKey) {
        // Matches desktop MuseScore: Shift+Arrow extends by chord,
        // Ctrl+Shift+Arrow by whole measure.
        const byMeasure = event.ctrlKey || event.metaKey;
        if (key === 'arrowright') {
          if (byMeasure) {
            handleExtendSelectionNextMeasure();
          } else {
            handleExtendSelectionNextChord();
          }
        } else if (byMeasure) {
          handleExtendSelectionPrevMeasure();
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
      if (interactiveMutationEnabled && (selectedElement || selectionBoxes.length > 0)) {
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => keyboardShortcutHandlerRef.current(event);
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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
      scheduleSelectionOverlayRefresh(
        preservedIndex,
        preservedPoint,
        selectionOverlayGenerationRef.current,
      );
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
      scheduleSelectionOverlayRefresh(
        preservedIndex,
        preservedPoint,
        selectionOverlayGenerationRef.current,
      );
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
      scheduleSelectionOverlayRefresh(
        preservedIndex,
        preservedPoint,
        selectionOverlayGenerationRef.current,
      );
    } catch (err) {
      console.error('Failed to set clef', err);
      alert('Unable to set clef. See console for details.');
    } finally {
      setAudioBusy(false);
    }
  };

  const downloadBlob = (data: BlobPart | Uint8Array, filename: string, mime: string) => {
    const blobPart = data instanceof Uint8Array ? toOwnedBytes(data) : data;
    const blob = new Blob([blobPart], { type: mime });
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
    const defaultPage = Math.max(
      1,
      Math.min((currentPageRef.current || 0) + 1, Math.max(pageCount, 1)),
    );
    setPngExportPageInput(String(defaultPage));
    setPngExportDialogOpen(true);
  };

  const handleConfirmExportPng = async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!score || !score.savePng) {
      alert('PNG export is not available in this build.');
      return;
    }
    const requestedPage = Number(pngExportPageInput);
    if (!Number.isFinite(requestedPage)) {
      alert('Enter a valid page number.');
      return;
    }
    const maxPage = Math.max(1, pageCount);
    const pageNumber = Math.max(1, Math.min(Math.floor(requestedPage), maxPage));
    const pageIndex = pageNumber - 1;
    setPngExportBusy(true);
    try {
      if (score.layoutUntilPage || score.layoutUntilPageState) {
        const ready = await ensurePageIsLaidOut(score, pageIndex);
        if (!ready) {
          throw new Error(`Page ${pageNumber} is not available yet.`);
        }
      }
      const png = await runSerializedScoreOperation(
        () => Promise.resolve(score.savePng!(pageIndex, true, true)),
        `savePng(export-page=${pageNumber})`,
      );
      downloadBlob(png, `score-page-${pageNumber}.png`, 'image/png');
      setPngExportDialogOpen(false);
    } catch (err) {
      console.error('Failed to export PNG', err);
      alert(err instanceof Error ? err.message : 'Unable to export PNG. See console for details.');
    } finally {
      setPngExportBusy(false);
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

  const handleExportToGoogleDrive = async () => {
    if (!score || !score.saveMsc) {
      alert('MSCZ export is not available in this build.');
      return;
    }
    try {
      const mscz = await score.saveMsc('mscz');
      downloadBlob(mscz, 'score.mscz', 'application/vnd.musescore.mscz');
      setGoogleDriveExportDialogOpen(true);
    } catch (err) {
      console.error('Failed to export score for Google Drive', err);
      alert('Unable to export the score. See console for details.');
    }
  };

  const handleOpenShareLinkDialog = () => {
    setGoogleDriveExportDialogOpen(false);
    setShareLinkDialogOpen(true);
    setGeneratedShareUrl('');
    setShareLinkError('');
    setShareLinkCopied(false);
  };

  const handleGenerateShareLink = (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const driveUrl = googleDriveShareUrl.trim();
    setShareLinkCopied(false);
    if (!isGoogleDriveScoreUrl(driveUrl)) {
      setGeneratedShareUrl('');
      setShareLinkError('Paste a Google Drive file share link, not a folder link.');
      return;
    }
    try {
      const shareUrl = buildScoreEditorShareUrl(
        driveUrl,
        window.location.href,
        process.env.NEXT_PUBLIC_SCORE_EDITOR_PUBLIC_URL,
      );
      setGeneratedShareUrl(shareUrl);
      setShareLinkError('');
    } catch {
      setGeneratedShareUrl('');
      setShareLinkError('Unable to create a shareable editor link from this URL.');
    }
  };

  const handleCopyShareLink = async () => {
    if (!generatedShareUrl) return;
    try {
      await navigator.clipboard.writeText(generatedShareUrl);
      setShareLinkCopied(true);
    } catch {
      const input = document.querySelector<HTMLInputElement>(
        '[data-testid="generated-share-link"]',
      );
      input?.select();
      document.execCommand('copy');
      setShareLinkCopied(true);
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
      const xml = await runSerializedScoreOperation(() => score.saveXml!(), 'saveXml(export)');
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
        alert(
          'No default soundfont found. Configure NEXT_PUBLIC_SOUNDFONT_CDN_URL or provide /public/soundfonts/default.sf3 (or .sf2).',
        );
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

  const getPageMeasureRange = async (targetScore: Score, pageIndex: number) => {
    if (typeof targetScore.measureRangeForPage !== 'function') {
      throw new Error('Current-page audio requires an updated webmscore build.');
    }
    const safePageIndex = Math.max(0, pageIndex || 0);
    const range = await Promise.resolve(targetScore.measureRangeForPage(safePageIndex));
    if (
      !range ||
      !Number.isFinite(range.startMeasureIndex) ||
      !Number.isFinite(range.endMeasureIndex)
    ) {
      throw new Error(`No measures found on page ${safePageIndex + 1}.`);
    }
    return range;
  };

  const handleExportCurrentPageAudio = async () => {
    if (!score || !score.saveAudioForMeasureRange) {
      alert('Current-page audio export is not available in this build.');
      return;
    }
    try {
      setAudioBusy(true);
      const ok = await ensureSoundFontLoaded(undefined, { forceRetry: true });
      if (!ok) {
        alert(
          'No default soundfont found. Configure NEXT_PUBLIC_SOUNDFONT_CDN_URL or provide /public/soundfonts/default.sf3 (or .sf2).',
        );
        return;
      }
      const { startMeasureIndex, endMeasureIndex } = await getPageMeasureRange(
        score,
        Math.max(0, currentPageRef.current || 0),
      );
      const wav = await score.saveAudioForMeasureRange('wav', startMeasureIndex, endMeasureIndex);
      downloadBlob(wav, `score-page-${Math.max(0, currentPageRef.current) + 1}.wav`, 'audio/wav');
    } catch (err) {
      console.error('Failed to export current-page audio', err);
      alert(
        err instanceof Error
          ? err.message
          : 'Unable to export current-page audio. See console for details.',
      );
    } finally {
      setAudioBusy(false);
    }
  };

  const stopSynthStream = stopSharedSynthStream;
  const stopPreviewAudio = async (options?: { awaitCancel?: boolean }) => {
    await cancelSynthStream(
      {
        sourcesRef: previewAudioSourcesRef,
        iteratorRef: previewStreamIteratorRef,
        generationRef: previewPlaybackGenerationRef,
      },
      options,
    );
  };

  const stopAudio = async (options?: { awaitCancel?: boolean }) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (tempPlaybackAudioUrlRef.current) {
      URL.revokeObjectURL(tempPlaybackAudioUrlRef.current);
      tempPlaybackAudioUrlRef.current = null;
    }
    await cancelSynthStream(
      {
        sourcesRef: audioSourcesRef,
        iteratorRef: streamIteratorRef,
        generationRef: transportPlaybackGenerationRef,
      },
      options,
    );
    await stopPreviewAudio(options);
    setIsPlaying(false);
    setIsPaused(false);
  };

  const ensureAudioContextReady = async () => {
    const audioCtx = audioCtxRef.current || new AudioContext({ sampleRate: 44100 });
    audioCtxRef.current = audioCtx;
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    return audioCtx;
  };

  /**
   * Pauses without tearing the stream down.
   *
   * Suspending the AudioContext freezes its clock, so already-scheduled sources
   * hold their positions and the render loop's horizon check sees a constant
   * distance ahead of the playhead and idles. The <audio> element path (the
   * non-streaming WAV fallback) is paused alongside it.
   */
  const pauseAudio = async () => {
    const audioCtx = audioCtxRef.current;
    if (audioCtx && audioCtx.state === 'running') {
      await audioCtx.suspend();
    }
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }
    setIsPaused(true);
  };

  const resumeAudio = async () => {
    const audioCtx = audioCtxRef.current;
    if (audioCtx && audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    if (audioRef.current && audioRef.current.paused) {
      await audioRef.current.play().catch(() => {
        /* element playback already gone */
      });
    }
    setIsPaused(false);
  };

  const playSynthBatchStream = async (
    batchFn: SynthBatchIterator,
    options: {
      sourcesRef: React.MutableRefObject<AudioBufferSourceNode[]>;
      iteratorRef: React.MutableRefObject<SynthBatchIterator | null>;
      generationRef: React.MutableRefObject<number>;
      maxDurationSeconds?: number;
      trackTransportState: boolean;
      debugLabel: string;
      prerollSeconds?: number;
      startupBufferSeconds?: number;
      minStartupBatches?: number;
      mergeWindowSeconds?: number;
      renderWindow?: RenderWindow | null;
      stateSetters?: {
        setIsPlaying: (value: boolean) => void;
        setIsPaused: (value: boolean) => void;
      };
    },
  ) => {
    const setPlaying = options.stateSetters?.setIsPlaying ?? setIsPlaying;
    const setPaused = options.stateSetters?.setIsPaused ?? setIsPaused;
    const audioContext = await ensureAudioContextReady();
    await scheduleSynthBatchStream(batchFn, audioContext, {
      sourcesRef: options.sourcesRef,
      iteratorRef: options.iteratorRef,
      generationRef: options.generationRef,
      maxDurationSeconds: options.maxDurationSeconds,
      debugLabel: options.debugLabel,
      prerollSeconds: options.prerollSeconds,
      startupBufferSeconds: options.startupBufferSeconds,
      minStartupBatches: options.minStartupBatches,
      mergeWindowSeconds: options.mergeWindowSeconds,
      renderWindow: options.renderWindow,
      onPlayingChange: options.trackTransportState
        ? (playing) => {
            setPlaying(playing);
            if (!playing) setPaused(false);
          }
        : undefined,
    });
  };

  const playFromUrl = async (url: string, options?: { revokeOnEnded?: boolean }) => {
    if (tempPlaybackAudioUrlRef.current) {
      URL.revokeObjectURL(tempPlaybackAudioUrlRef.current);
      tempPlaybackAudioUrlRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    const audio = new Audio(url);
    audioRef.current = audio;
    if (options?.revokeOnEnded) {
      tempPlaybackAudioUrlRef.current = url;
    }
    audio.onended = () => {
      setIsPlaying(false);
      setIsPaused(false);
      if (options?.revokeOnEnded && tempPlaybackAudioUrlRef.current === url) {
        URL.revokeObjectURL(url);
        tempPlaybackAudioUrlRef.current = null;
      }
    };
    await audio.play();
    setIsPlaying(true);
    setIsPaused(false);
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
        alert(
          'No default soundfont found. Configure NEXT_PUBLIC_SOUNDFONT_CDN_URL or provide /public/soundfonts/default.sf3 (or .sf2).',
        );
        return;
      }
      await stopAudio({ awaitCancel: true });

      const useSelectionStreaming =
        fromSelection && typeof score.synthAudioBatchFromSelection === 'function';
      const useStreaming = fromSelection
        ? useSelectionStreaming
        : typeof score.synthAudioBatch === 'function';
      let streamed = false;
      let streamFailure: unknown = null;
      if (useStreaming) {
        try {
          const batchFn = useSelectionStreaming
            ? ((await score.synthAudioBatchFromSelection!(
                SELECTION_SYNTH_BATCH_SIZE,
              )) as SynthBatchIterator)
            : ((await score.synthAudioBatch!(0, TRANSPORT_SYNTH_BATCH_SIZE)) as SynthBatchIterator);

          await playSynthBatchStream(batchFn, {
            sourcesRef: audioSourcesRef,
            iteratorRef: streamIteratorRef,
            generationRef: transportPlaybackGenerationRef,
            trackTransportState: true,
            debugLabel: useSelectionStreaming ? 'selection-transport' : 'transport',
            prerollSeconds: useSelectionStreaming
              ? SELECTION_SYNTH_START_PREROLL_SECONDS
              : SYNTH_START_PREROLL_SECONDS,
            startupBufferSeconds: useSelectionStreaming
              ? SELECTION_STREAM_STARTUP_BUFFER_SECONDS
              : 0,
            minStartupBatches: useSelectionStreaming ? SELECTION_STREAM_MIN_STARTUP_BATCHES : 1,
            mergeWindowSeconds: useSelectionStreaming ? 0.5 : 0,
            // Transport can run the length of the score, so it is the
            // path that must stay bounded.
            renderWindow: DEFAULT_RENDER_WINDOW,
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
            alert(
              'Play from selection is not available in this running build. Rebuild webmscore JS glue (`cd webmscore-fork/web-public && npm run bundle`) and restart `npm run dev`.',
            );
          } else if (streamFailure) {
            const streamMessage =
              streamFailure instanceof Error ? streamFailure.message : String(streamFailure);
            alert(`Play from selection failed: ${streamMessage}`);
          } else {
            alert('Play from selection is not available in this build.');
          }
          return;
        }
        if (audioUrlRef.current) {
          await playFromUrl(audioUrlRef.current);
        } else {
          const wav = await score.saveAudio('wav');
          const blob = new Blob([toOwnedBytes(wav)], { type: 'audio/wav' });
          const url = URL.createObjectURL(blob);
          audioUrlRef.current = url;
          await playFromUrl(url);
        }
      }
    } catch (err) {
      console.error('Failed to play audio', err);
      // Say what went wrong here rather than deferring to a console the
      // reader may not be able to open: in an embed this runs inside an
      // iframe, where the browser can refuse DevTools outright.
      alert(`Unable to play audio: ${err instanceof Error ? err.message : String(err)}`);
      await stopAudio({ awaitCancel: true });
    } finally {
      setAudioBusy(false);
    }
  };

  const compareTransport = useCompareTransport({
    scores: {
      left: compareLeftScore,
      // The scanner's merged score, when the row layout is showing one.
      // It is owned by `ScannerSystemRows` — which is where it is edited —
      // and reported up to here so playback has one transport for all
      // three panes rather than a second, competing one.
      middle: scannerMergedScore,
      right: compareRightScoreDisplay,
    },
    audioContextRef: audioCtxRef,
    batchSize: TRANSPORT_SYNTH_BATCH_SIZE,
    ensureSoundFontLoaded: (targetScore, options) => ensureSoundFontLoaded(targetScore, options),
    stopMainAudio: () => stopAudio({ awaitCancel: true }),
    stopStream: stopSynthStream,
    playStream: (iterator, target) =>
      playSynthBatchStream(iterator, {
        sourcesRef: target.sourcesRef,
        iteratorRef: target.iteratorRef,
        generationRef: target.generationRef,
        trackTransportState: true,
        stateSetters: {
          setIsPlaying: target.setIsPlaying,
          setIsPaused: target.setIsPaused,
        },
        debugLabel: target.debugLabel,
        renderWindow: DEFAULT_RENDER_WINDOW,
      }),
    reportUnavailable: () => alert('Audio playback is not available for this score.'),
    reportRangedSynthUnavailable: (error: unknown) => {
      // Not an alert: playback still happens, from the top of the score
      // instead of from this row. Saying so once in the console is the
      // proportionate response to a build limitation.
      console.warn(
        'This webmscore build cannot synthesize a measure range; playing the whole score instead.',
        error,
      );
    },
    reportMissingSoundFont: () =>
      alert(
        'No default soundfont found. Configure NEXT_PUBLIC_SOUNDFONT_CDN_URL or provide /public/soundfonts/default.sf3 (or .sf2).',
      ),
    reportPlaybackError: (side, error) => {
      console.error(`Failed to play ${side} compare audio`, error);
      alert('Unable to play audio. See console for details.');
    },
    trackOperation: trackCompareOperation,
  });
  const toggleCompareSidePlayPause = compareTransport.toggleSidePlayPause;
  stopCompareSideAudioRef.current = compareTransport.stopSideAudio;

  const playSelectionPreview = async (
    trigger: string = 'unknown',
    selectionPoint?: { page: number; x: number; y: number },
    options?: { reselect?: boolean },
  ) => {
    const activeScore = scoreRef.current ?? score;
    if (
      !interactionReady ||
      !activeScore ||
      !activeScore.synthSelectionPreviewBatch ||
      isPlaying ||
      audioBusy
    ) {
      return;
    }

    const shouldReselectForPreview = options?.reselect ?? trigger.startsWith('mutation:');
    const previewPoint = selectionPoint ?? selectedPointRef.current;
    if (shouldReselectForPreview && previewPoint && activeScore.selectElementAtPoint) {
      try {
        const containerRect = containerRef.current?.getBoundingClientRect();
        const engravingPoint = containerRect
          ? clientToEngravingPoint(
              containerRect.left + previewPoint.x * zoom,
              containerRect.top + previewPoint.y * zoom,
            )
          : null;
        await activeScore.selectElementAtPoint(
          previewPoint.page,
          engravingPoint?.x ?? previewPoint.x,
          engravingPoint?.y ?? previewPoint.y,
        );
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
      const batchFn = (await activeScore.synthSelectionPreviewBatch(
        PREVIEW_SYNTH_BATCH_SIZE,
        PREVIEW_DURATION_MS,
      )) as SynthBatchIterator;
      await playSynthBatchStream(batchFn, {
        sourcesRef: previewAudioSourcesRef,
        iteratorRef: previewStreamIteratorRef,
        generationRef: previewPlaybackGenerationRef,
        maxDurationSeconds: 0.6,
        trackTransportState: false,
        debugLabel: `preview:${trigger}`,
        // A 0.6s audition is already bounded by maxDurationSeconds; throttling
        // it would only add latency to the interaction it exists to make feel
        // immediate.
        renderWindow: null,
      });
    } catch (err) {
      console.warn('[AUDITION] selection preview playback failed', { trigger, err });
      await stopPreviewAudio({ awaitCancel: true });
    }
  };

  const handlePlayAudio = async () => {
    await playTransportAudio(false);
  };

  /**
   * Single transport control: play -> pause -> resume.
   *
   * Pausing keeps the stream and its scheduled sources alive, so resuming is
   * immediate and does not re-render audio that was already synthesised.
   */
  const handleTogglePlayPause = async () => {
    if (isPlaying && !isPaused) {
      await pauseAudio();
      return;
    }
    if (isPaused) {
      await resumeAudio();
      return;
    }
    await handlePlayAudio();
  };

  const handlePlayFromSelectionAudio = async () => {
    if (!interactionReady) {
      return;
    }
    await playTransportAudio(true);
  };

  const handleZoomIn = () => {
    setZoom((prev) => clampZoom(prev + 0.1));
  };

  const handleZoomOut = () => {
    setZoom((prev) => clampZoom(prev - 0.1));
  };

  // Set an explicit zoom level. This persists per score via the zoom effect above,
  // so the chosen level becomes the score's remembered default.
  const handleSetZoom = (value: number) => {
    setZoom(clampZoom(value));
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

  const scoreSvgForTarget = (target?: Element | null): SVGSVGElement | null => {
    const targetedSvg = target?.closest('svg');
    if (targetedSvg instanceof SVGSVGElement) {
      return targetedSvg;
    }
    return containerRef.current?.querySelector('svg') ?? null;
  };

  const clientToEngravingPoint = (clientX: number, clientY: number, target?: Element | null) => {
    const svg = scoreSvgForTarget(target);
    const matrix = svg && typeof svg.getScreenCTM === 'function' ? svg.getScreenCTM() : null;
    if (!matrix) {
      return null;
    }
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  };

  const eventHasScorePaletteData = (event: React.DragEvent) =>
    Array.from(event.dataTransfer.types).includes(SCORE_PALETTE_DRAG_MIME);

  const handlePaletteDragOver = (event: React.DragEvent) => {
    if (
      !interactiveMutationEnabled ||
      !score?.applyDropAtPoint ||
      !eventHasScorePaletteData(event)
    ) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setPaletteDropActive(true);
  };

  const handlePaletteDragLeave = (event: React.DragEvent) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
      setPaletteDropActive(false);
    }
  };

  const handlePaletteDrop = (event: React.DragEvent) => {
    if (
      !interactiveMutationEnabled ||
      !score?.applyDropAtPoint ||
      !eventHasScorePaletteData(event)
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setPaletteDropActive(false);

    const item = parseScorePaletteItem(event.dataTransfer.getData(SCORE_PALETTE_DRAG_MIME));
    const target = event.target as Element | null;
    const point = clientToEngravingPoint(event.clientX, event.clientY, target);
    if (!item || !point) {
      return;
    }
    const page = resolvePageIndex(target);
    void performMutation(
      `drop ${item.label}`,
      async () => {
        const fn = requireMutation('applyDropAtPoint');
        if (!fn) {
          return false;
        }
        return fn(page, point.x, point.y, item.elementType, item.subtype);
      },
      { skipWasmReselect: true, skipSelectionFallback: true },
    );
  };

  const engravingToOverlayPoint = (x: number, y: number) => {
    const matrix = scoreSvgForTarget()?.getScreenCTM();
    const wrapperRect = scoreWrapperRef.current?.getBoundingClientRect();
    if (!matrix || !wrapperRect) {
      return { x, y };
    }
    const point = new DOMPoint(x, y).matrixTransform(matrix);
    return {
      x: (point.x - wrapperRect.left) / zoom,
      y: (point.y - wrapperRect.top) / zoom,
    };
  };

  const closeGripEdit = useCallback(
    (commit: boolean) => {
      gripDragCleanupRef.current?.();
      gripDragCleanupRef.current = null;
      setGripEdit(null);
      if (score?.endGripEdit) {
        void Promise.resolve(score.endGripEdit(commit)).catch((err: unknown) => {
          console.warn('Ending grip edit failed:', err);
        });
      }
    },
    [score],
  );

  useEffect(() => {
    if (!gripEdit) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      closeGripEdit(false);
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeGripEdit, gripEdit]);

  const beginGripEditAtPoint = async (pageIndex: number, x: number, y: number) => {
    if (!interactiveMutationEnabled || noteInputActiveRef.current || !score?.beginGripEdit) {
      return;
    }
    try {
      const edit = await Promise.resolve(score.beginGripEdit(pageIndex, x, y));
      setGripEdit(edit?.grips?.length ? edit : null);
    } catch (err) {
      console.warn('Starting grip edit failed:', err);
      setGripEdit(null);
    }
  };

  const handleScoreDoubleClick = (event: React.MouseEvent) => {
    const target = event.target as Element | null;
    let textTarget = target;
    while (textTarget && textTarget !== containerRef.current) {
      if (isSvgTextElement(textTarget)) {
        void openTextEditorFromEvent(event);
        return;
      }
      textTarget = textTarget.parentElement;
    }
    const point = clientToEngravingPoint(event.clientX, event.clientY, target);
    if (!point) {
      return;
    }
    event.preventDefault();
    void beginGripEditAtPoint(resolvePageIndex(target), point.x, point.y);
  };

  const handleGripPointerDown = (event: React.PointerEvent, gripIndex: number) => {
    if (event.button !== 0 || !score?.dragGrip || !score?.endGripEdit || !gripEdit) {
      return;
    }
    const grip = gripEdit.grips.find((item) => item.index === gripIndex);
    if (!grip?.draggable) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    gripDragCleanupRef.current?.();
    const pointerId = event.pointerId;
    const startClient = { x: event.clientX, y: event.clientY };
    const startEngraving = clientToEngravingPoint(event.clientX, event.clientY);
    const initial = gripEdit;

    const engravingDelta = (clientX: number, clientY: number) => {
      const current = clientToEngravingPoint(clientX, clientY);
      if (!startEngraving || !current) {
        return {
          dx: (clientX - startClient.x) / zoom,
          dy: (clientY - startClient.y) / zoom,
        };
      }
      return { dx: current.x - startEngraving.x, dy: current.y - startEngraving.y };
    };

    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) {
        return;
      }
      const { dx, dy } = engravingDelta(moveEvent.clientX, moveEvent.clientY);
      setGripEdit({
        ...initial,
        grips: initial.grips.map((item) =>
          item.index === gripIndex ? { ...item, x: item.x + dx, y: item.y + dy } : item,
        ),
      });
      moveEvent.preventDefault();
    };

    const finish = async (upEvent: PointerEvent, commit: boolean) => {
      if (upEvent.pointerId !== pointerId) {
        return;
      }
      gripDragCleanupRef.current?.();
      gripDragCleanupRef.current = null;
      const { dx, dy } = engravingDelta(upEvent.clientX, upEvent.clientY);
      let committed = false;
      try {
        if (commit && (dx !== 0 || dy !== 0)) {
          const modifiers =
            (upEvent.shiftKey ? 1 : 0) | (upEvent.ctrlKey ? 2 : 0) | (upEvent.altKey ? 4 : 0);
          const updated = await Promise.resolve(score.dragGrip?.(gripIndex, dx, dy, modifiers));
          committed = Boolean(updated);
        }
        await Promise.resolve(score.endGripEdit?.(committed));
        setGripEdit(null);
        if (!committed) {
          return;
        }
        setScoreDirtySinceCheckpoint(true);
        setScoreDirtySinceXml(true);
        if (score.relayout) {
          await Promise.resolve(score.relayout());
        }
        const refreshedPage = await refreshPageCount(score, currentPageRef.current);
        await renderScore(score, refreshedPage);
        const selectionPoint = engravingToOverlayPoint(grip.x + dx, grip.y + dy);
        await refreshSelectionFromSvg({
          index: null,
          point: { page: initial.page, ...selectionPoint },
        });
      } catch (err) {
        console.error('Grip drag failed:', err);
        await Promise.resolve(score.endGripEdit?.(false)).catch(() => {});
        setGripEdit(null);
      }
    };

    const onUp = (upEvent: PointerEvent) => {
      void finish(upEvent, true);
    };
    const onCancel = (cancelEvent: PointerEvent) => {
      void finish(cancelEvent, false);
    };
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== 'Escape') {
        return;
      }
      gripDragCleanupRef.current?.();
      gripDragCleanupRef.current = null;
      setGripEdit(null);
      void Promise.resolve(score.endGripEdit?.(false)).catch(() => {});
      keyEvent.preventDefault();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKeyDown);
    gripDragCleanupRef.current = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKeyDown);
    };
  };

  const updateNoteInputShadow = (clientX: number, clientY: number, target: Element | null) => {
    if (!noteInputActiveRef.current || !containerRef.current) {
      setNoteInputShadow(null);
      return;
    }
    const point = clientToScorePoint(clientX, clientY);
    if (!point) {
      setNoteInputShadow(null);
      return;
    }

    const page = resolvePageIndex(target);
    const containerRect = containerRef.current.getBoundingClientRect();
    let nearest: {
      top: number;
      left: number;
      right: number;
      distance: number;
      spatium: number;
    } | null = null;
    for (const staffLines of Array.from(containerRef.current.querySelectorAll('.StaffLines'))) {
      if (resolvePageIndex(staffLines) !== page) {
        continue;
      }
      const rect = staffLines.getBoundingClientRect();
      const left = (rect.left - containerRect.left) / zoom;
      const right = (rect.right - containerRect.left) / zoom;
      const top = (rect.top - containerRect.top) / zoom;
      const bottom = (rect.bottom - containerRect.top) / zoom;
      if (point.x < left || point.x > right) {
        continue;
      }
      const lineSetHeight = bottom - top;
      const spatium = scoreSpatiumRef.current ?? (lineSetHeight > 0 ? lineSetHeight / 4 : 0);
      if (!(spatium > 0)) {
        continue;
      }
      const distance =
        lineSetHeight > 0
          ? point.y < top
            ? top - point.y
            : point.y > bottom
              ? point.y - bottom
              : 0
          : Math.abs(point.y - top);
      if (distance > spatium * 2 || (nearest && distance >= nearest.distance)) {
        continue;
      }
      nearest = { top, left, right, distance, spatium };
    }

    if (!nearest && target?.closest('svg') && containerRef.current.contains(target)) {
      const spatium = scoreSpatiumRef.current;
      if (spatium && spatium > 0) {
        nearest = {
          top: 0,
          left: 0,
          right: containerRect.width / zoom,
          distance: 0,
          spatium,
        };
      }
    }
    if (!nearest || !(nearest.spatium > 0)) {
      setNoteInputShadow(null);
      return;
    }
    const halfStep = nearest.spatium / 2;
    const snappedY = nearest.top + Math.round((point.y - nearest.top) / halfStep) * halfStep;
    const width = nearest.spatium * 1.15;
    const height = nearest.spatium * 0.78;
    setNoteInputShadow({
      x: Math.min(Math.max(point.x - width / 2, nearest.left), nearest.right - width),
      y: snappedY - height / 2,
      w: width,
      h: height,
    });
  };

  const boxesIntersect = (
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number },
  ) => a.x + a.w >= b.x && b.x + b.w >= a.x && a.y + a.h >= b.y && b.y + b.h >= a.y;

  const performDragSelection = async (
    rect: { x: number; y: number; w: number; h: number },
    additive: boolean,
  ): Promise<SelectionFallback> => {
    if (!containerRef.current || !score) {
      return null;
    }

    const containerRect = containerRef.current.getBoundingClientRect();
    const allElements = Array.from(
      containerRef.current.querySelectorAll(ELEMENT_SELECTION_SELECTOR),
    );

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
        const engravingPoint = clientToEngravingPoint(
          elRect.left + elRect.width / 2,
          elRect.top + elRect.height / 2,
          el,
        );
        const selectionX = engravingPoint?.x ?? centerX;
        const selectionY = engravingPoint?.y ?? centerY;
        return { el, index, pageIndex, box, centerX, centerY, selectionX, selectionY };
      })
      .filter((hit): hit is NonNullable<typeof hit> => Boolean(hit))
      .sort(
        (a, b) =>
          a.pageIndex - b.pageIndex || a.box.y - b.box.y || a.box.x - b.box.x || a.index - b.index,
      );

    if (hits.length === 0) {
      if (!additive) {
        setSelectedElement(null);
        setSelectionBoxes([]);
        setSelectedPoint(null);
        setSelectedIndex(null);
        setSelectedElementClasses('');
        setSelectedLayoutBreakSubtype(null);
        if (score.clearSelection) {
          await Promise.resolve(score.clearSelection()).catch((err: unknown) => {
            console.warn('clearSelection not available or failed:', err);
          });
        }
      }
      return null;
    }

    const first = hits[0];
    const hitBoxes: SelectionBox[] = hits.map((hit) => ({
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
      setSelectionBoxes((prev) => {
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
      const hasNotes = hits.some((hit) => {
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
        await score.selectElementAtPointWithMode(
          leftmost.pageIndex,
          leftmost.selectionX,
          leftmost.selectionY,
          firstMode,
        );
        await score.selectElementAtPointWithMode(
          rightmost.pageIndex,
          rightmost.selectionX,
          rightmost.selectionY,
          3,
        );
      } else {
        // For non-note elements (slurs, dynamics, etc.), use ADD mode (original behavior)
        await score.selectElementAtPointWithMode(
          first.pageIndex,
          first.selectionX,
          first.selectionY,
          firstMode,
        );
        for (let i = 1; i < hits.length; i++) {
          const hit = hits[i];
          await score.selectElementAtPointWithMode(
            hit.pageIndex,
            hit.selectionX,
            hit.selectionY,
            1,
          );
        }
      }
      return fallback;
    }

    if (!score.selectElementAtPoint) {
      console.warn('selectElementAtPoint is not available; cannot update selection in WASM');
      return fallback;
    }

    if (!additive && score.clearSelection) {
      await Promise.resolve(score.clearSelection()).catch((err: unknown) => {
        console.warn('clearSelection not available or failed:', err);
      });
    }

    await score.selectElementAtPoint(first.pageIndex, first.selectionX, first.selectionY);
    return fallback;
  };

  const noteDragSupported = Boolean(
    score?.beginElementDrag && score?.updateElementDrag && score?.endElementDrag,
  );

  const findNoteDragCandidate = (target: Element | null) => {
    if (!containerRef.current || !target || typeof target.closest !== 'function') {
      return null;
    }
    const noteEl = target.closest('.Note');
    if (!noteEl || !containerRef.current.contains(noteEl)) {
      return null;
    }
    const containerRect = containerRef.current.getBoundingClientRect();
    const rect = noteEl.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) {
      return null;
    }
    return {
      page: resolvePageIndex(noteEl),
      noteBox: {
        x: (rect.left - containerRect.left) / zoom,
        y: (rect.top - containerRect.top) / zoom,
        w: rect.width / zoom,
        h: rect.height / zoom,
      },
    };
  };

  // Half a staff space (one diatonic step) in score units, from the engine's own
  // spatium — the same value Note::verticalDrag divides by, so ghost and commit
  // agree exactly. Falls back to half the notehead height (a notehead is ~1 space
  // tall) if the export is unavailable or hasn't resolved yet.
  const resolveNoteDragHalfStep = (noteBox: {
    x: number;
    y: number;
    w: number;
    h: number;
  }): number => {
    const spatium = scoreSpatiumRef.current;
    if (spatium !== null && spatium > 0) {
      return spatium / 2;
    }
    return noteBox.h / 2;
  };

  const refreshScoreSpatium = async () => {
    if (!score?.getSpatium) {
      return;
    }
    try {
      const spatium = await Promise.resolve(score.getSpatium());
      scoreSpatiumRef.current = Number.isFinite(spatium) && spatium > 0 ? spatium : null;
    } catch {
      scoreSpatiumRef.current = null;
    }
  };

  const ensureLiveNoteDragStarted = (drag: {
    page: number;
    startX: number;
    startY: number;
    halfStep: number;
  }): Promise<boolean> => {
    if (noteDragEngineBeginRef.current) {
      return noteDragEngineBeginRef.current;
    }
    const begin = score?.beginElementDrag?.bind(score);
    if (!begin) {
      return Promise.resolve(false);
    }
    noteDragEngineBeginRef.current = Promise.resolve(begin(drag.page, drag.startX, drag.startY))
      .then((began) => {
        if (!began) {
          console.warn('Note drag: engine found no draggable element at the start point.');
        }
        return began;
      })
      .catch((err) => {
        console.warn('Starting live note drag failed:', err);
        return false;
      });
    return noteDragEngineBeginRef.current;
  };

  const scheduleLiveNoteDragUpdate = (
    drag: { page: number; startX: number; startY: number; halfStep: number },
    steps: number,
    modifiers: number,
  ) => {
    noteDragLiveUpdateRef.current = { drag, steps, modifiers };
    if (noteDragLiveFrameRef.current !== null || noteDragLiveInFlightRef.current) {
      return;
    }

    noteDragLiveFrameRef.current = requestAnimationFrame(() => {
      noteDragLiveFrameRef.current = null;
      const pending = noteDragLiveUpdateRef.current;
      noteDragLiveUpdateRef.current = null;
      if (!pending || !score?.updateElementDrag) {
        return;
      }

      const task = (async () => {
        const began = await ensureLiveNoteDragStarted(pending.drag);
        if (!began || noteDragFinishingRef.current) {
          return;
        }
        const targetY = pending.drag.startY + pending.steps * pending.drag.halfStep;
        // Y-only mode keeps the gesture in Note::verticalDrag pitch semantics.
        await score.updateElementDrag!(
          pending.drag.page,
          pending.drag.startX,
          targetY,
          pending.modifiers,
          2,
        );
        noteDragRenderedStepsRef.current = pending.steps;
        // Render only the active page. Pointer tracking stays on window while
        // the SVG DOM is replaced, so the gesture remains uninterrupted.
        await renderScore(score, pending.drag.page);
      })()
        .catch((err) => {
          console.warn('Live note drag update failed:', err);
        })
        .finally(() => {
          noteDragLiveInFlightRef.current = null;
          const latest = noteDragLiveUpdateRef.current;
          if (latest && !noteDragFinishingRef.current) {
            scheduleLiveNoteDragUpdate(latest.drag, latest.steps, latest.modifiers);
          }
        });
      noteDragLiveInFlightRef.current = task;
    });
  };

  const stopLiveNoteDragUpdates = async () => {
    if (noteDragLiveFrameRef.current !== null) {
      cancelAnimationFrame(noteDragLiveFrameRef.current);
      noteDragLiveFrameRef.current = null;
    }
    noteDragLiveUpdateRef.current = null;
    await noteDragLiveInFlightRef.current;
  };

  const finishNoteDrag = async (
    drag: { page: number; startX: number; startY: number; halfStep: number },
    steps: number,
    modifiers: number,
    commit: boolean,
  ) => {
    if (!score?.updateElementDrag || !score?.endElementDrag) {
      return;
    }
    noteDragFinishingRef.current = true;
    const targetY = drag.startY + steps * drag.halfStep;

    try {
      await stopLiveNoteDragUpdates();
      const began = await ensureLiveNoteDragStarted(drag);
      if (!began) {
        noteDragEngineBeginRef.current = null;
        noteDragRenderedStepsRef.current = null;
        return;
      }

      if (commit && noteDragRenderedStepsRef.current !== steps) {
        await score.updateElementDrag(drag.page, drag.startX, targetY, modifiers, 2);
      }
      const committed = (await score.endElementDrag(commit)) !== false && commit;
      noteDragEngineBeginRef.current = null;
      noteDragRenderedStepsRef.current = null;

      if (score.relayout) {
        await Promise.resolve(score.relayout()).catch((err: unknown) => {
          console.warn('Relayout after note drag failed:', err);
        });
      }
      const refreshedPage = await refreshPageCount(score, currentPageRef.current);
      await renderScore(score, refreshedPage);

      if (!committed) {
        return;
      }
      setScoreDirtySinceCheckpoint(true);
      setScoreDirtySinceXml(true);
      const generation = ++selectionOverlayGenerationRef.current;
      scheduleSelectionOverlayRefresh(
        null,
        { page: drag.page, x: drag.startX, y: targetY },
        generation,
      );
      void playSelectionPreview('mutation:drag note pitch', undefined, { reselect: false });
    } catch (err) {
      console.error('Note drag failed:', err);
      await Promise.resolve(score.endElementDrag(false)).catch(() => {});
      noteDragEngineBeginRef.current = null;
      noteDragRenderedStepsRef.current = null;
      await renderScore(score, drag.page).catch(() => false);
    } finally {
      noteDragFinishingRef.current = false;
    }
  };

  const resetScorePointerGesture = () => {
    dragKindRef.current = null;
    sawPointerMoveRef.current = false;
    dragPointerIdRef.current = null;
    dragStartClientRef.current = null;
    dragStartScoreRef.current = null;
    dragAdditiveRef.current = false;
    dragActiveRef.current = false;
    noteDragRef.current = null;
    noteDragCandidateRef.current = null;
  };

  // A note drag is driven by window-level listeners rather than the wrapper's React
  // handlers: notes can sit at the very edge of the score wrapper, and the pointer
  // leaves it (into toolbars) before the drag threshold is even reached.
  const beginNoteDragWindowListeners = (pointerId: number) => {
    noteDragCleanupRef.current?.();

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) {
        return;
      }
      const startClient = dragStartClientRef.current;
      const startScore = dragStartScoreRef.current;
      const candidate = noteDragCandidateRef.current;
      if (!startClient || !startScore || !candidate) {
        return;
      }
      if (!dragActiveRef.current) {
        if (Math.hypot(ev.clientX - startClient.x, ev.clientY - startClient.y) < 4) {
          return;
        }
        dragActiveRef.current = true;
        noteDragRef.current = {
          page: candidate.page,
          startX: startScore.x,
          startY: startScore.y,
          noteBox: candidate.noteBox,
          halfStep: resolveNoteDragHalfStep(candidate.noteBox),
        };
        void ensureLiveNoteDragStarted(noteDragRef.current);
      }
      const noteDrag = noteDragRef.current;
      const current = clientToScorePoint(ev.clientX, ev.clientY);
      if (!noteDrag || !current) {
        return;
      }
      const steps = Math.round((current.y - noteDrag.startY) / noteDrag.halfStep);
      const modifiers = (ev.shiftKey ? 1 : 0) | (ev.ctrlKey ? 2 : 0) | (ev.altKey ? 4 : 0);
      setNoteDragGhost({
        x: noteDrag.noteBox.x,
        y: noteDrag.noteBox.y + steps * noteDrag.halfStep,
        w: noteDrag.noteBox.w,
        h: noteDrag.noteBox.h,
        steps,
      });
      scheduleLiveNoteDragUpdate(noteDrag, steps, modifiers);
      ev.preventDefault();
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) {
        return;
      }
      noteDragCleanupRef.current?.();
      noteDragCleanupRef.current = null;

      const noteDrag = noteDragRef.current;
      const wasActive = dragActiveRef.current;
      resetScorePointerGesture();
      setNoteDragGhost(null);

      if (!wasActive || !noteDrag) {
        // Never crossed the drag threshold: let the normal click flow handle it.
        return;
      }

      ignoreNextClickRef.current = true;
      const endScore = clientToScorePoint(ev.clientX, ev.clientY);
      if (!endScore) {
        return;
      }
      const steps = Math.round((endScore.y - noteDrag.startY) / noteDrag.halfStep);
      const modifiers = (ev.shiftKey ? 1 : 0) | (ev.ctrlKey ? 2 : 0) | (ev.altKey ? 4 : 0);
      void finishNoteDrag(noteDrag, steps, modifiers, steps !== 0);
    };

    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) {
        return;
      }
      noteDragCleanupRef.current?.();
      noteDragCleanupRef.current = null;
      const noteDrag = noteDragRef.current;
      const wasActive = dragActiveRef.current;
      resetScorePointerGesture();
      setNoteDragGhost(null);
      if (wasActive && noteDrag) {
        void finishNoteDrag(noteDrag, 0, 0, false);
      }
    };

    // Escape aborts the gesture without committing (roadmap §2.1). No engine call is
    // needed: the WASM drag only begins on release.
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') {
        return;
      }
      noteDragCleanupRef.current?.();
      noteDragCleanupRef.current = null;
      const noteDrag = noteDragRef.current;
      const wasActive = dragActiveRef.current;
      resetScorePointerGesture();
      setNoteDragGhost(null);
      if (wasActive) {
        // Swallow the click fired when the still-held pointer is released.
        ignoreNextClickRef.current = true;
        ev.preventDefault();
      }
      if (wasActive && noteDrag) {
        void finishNoteDrag(noteDrag, 0, 0, false);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKeyDown);
    noteDragCleanupRef.current = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKeyDown);
    };
  };

  const handleScorePointerDown = (e: React.PointerEvent) => {
    if (!interactionReady) {
      return;
    }
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

    const pointerTarget = e.target as Element | null;
    const spannerTarget = pointerTarget?.closest(
      '.SlurSegment, .HairpinSegment, .OttavaSegment, .PedalSegment, .VoltaSegment, .TrillSegment, .TextLineSegment',
    );
    const previousSpannerPointer = lastSpannerPointerRef.current;
    if (
      previousSpannerPointer &&
      e.timeStamp - previousSpannerPointer.time <= 500 &&
      Math.hypot(
        e.clientX - previousSpannerPointer.clientX,
        e.clientY - previousSpannerPointer.clientY,
      ) <= 8
    ) {
      lastSpannerPointerRef.current = null;
      e.preventDefault();
      e.stopPropagation();
      const engravingPoint = clientToEngravingPoint(e.clientX, e.clientY, pointerTarget);
      if (engravingPoint) {
        void beginGripEditAtPoint(
          resolvePageIndex(pointerTarget),
          engravingPoint.x,
          engravingPoint.y,
        );
      }
      return;
    }
    if (spannerTarget) {
      lastSpannerPointerRef.current = {
        time: e.timeStamp,
        clientX: e.clientX,
        clientY: e.clientY,
      };
    } else {
      lastSpannerPointerRef.current = null;
    }

    dragPointerIdRef.current = e.pointerId;
    dragKindRef.current = 'pointer';
    sawPointerMoveRef.current = false;
    dragStartClientRef.current = { x: e.clientX, y: e.clientY };
    dragStartScoreRef.current = start;
    dragAdditiveRef.current = e.metaKey || e.ctrlKey;
    dragActiveRef.current = false;
    noteDragRef.current = null;
    // Pointer-down on a note starts a repitch drag instead of a lasso selection
    // (additive modifier keeps the lasso; note-input mode places notes on click).
    noteDragCandidateRef.current =
      noteDragSupported &&
      interactiveMutationEnabled &&
      !noteDragFinishingRef.current &&
      !dragAdditiveRef.current &&
      !noteInputActiveRef.current
        ? findNoteDragCandidate(e.target as Element | null)
        : null;
    if (noteDragCandidateRef.current) {
      // Async; typically resolved well before the drag threshold is crossed.
      void refreshScoreSpatium();
      beginNoteDragWindowListeners(e.pointerId);
    }
  };

  const handleScorePointerMove = (e: React.PointerEvent) => {
    if (noteInputActiveRef.current) {
      updateNoteInputShadow(e.clientX, e.clientY, e.target as Element | null);
      return;
    }
    if (dragKindRef.current !== 'pointer') {
      return;
    }
    sawPointerMoveRef.current = true;
    if (noteDragCandidateRef.current) {
      // A note drag owns this gesture via window-level listeners.
      return;
    }
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
    if (noteDragCandidateRef.current) {
      // A note drag owns this gesture via window-level listeners.
      return;
    }
    if (dragPointerIdRef.current !== e.pointerId) {
      return;
    }

    const active = dragActiveRef.current;
    const additive = dragAdditiveRef.current;
    const startScore = dragStartScoreRef.current;

    resetScorePointerGesture();

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
    if (noteDragCandidateRef.current) {
      // A note drag owns this gesture via window-level listeners.
      return;
    }
    if (dragPointerIdRef.current !== e.pointerId) {
      return;
    }
    resetScorePointerGesture();
    setDragSelectionRect(null);

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture is not available.
    }
  };

  const handleScoreMouseDown = (e: React.MouseEvent) => {
    if (!interactionReady) {
      return;
    }
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
    if (noteInputActiveRef.current) {
      updateNoteInputShadow(e.clientX, e.clientY, e.target as Element | null);
      return;
    }
    if (
      dragKindRef.current === 'pointer' &&
      !sawPointerMoveRef.current &&
      dragPointerIdRef.current !== null &&
      !noteDragCandidateRef.current
    ) {
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
    if (!interactionReady) {
      return;
    }
    if (gripEdit) {
      closeGripEdit(false);
    }
    if (ignoreNextClickRef.current) {
      ignoreNextClickRef.current = false;
      return;
    }
    if (!containerRef.current || !score) return;

    // Invalidate any overlay refresh scheduled by a previous click (double-RAF
    // in refreshSelectionFromSvg/scheduleSelectionOverlayRefresh) before it fires.
    // Without this, a stale refreshSelectionOverlay callback from an earlier
    // element click can land after this click's selection is already applied,
    // scrape a DOM that has no .selected markers for a backend-highlighted
    // range (see renderScore's highlightSelection path), find nothing, and wipe
    // selectionBoxes/selectedElement -- see docs/private/SELECTION_WORK_HANDOFF.md §3.
    selectionOverlayGenerationRef.current += 1;

    if (noteInputActiveRef.current && interactiveMutationEnabled) {
      const scorePoint = clientToScorePoint(e.clientX, e.clientY);
      if (scorePoint) {
        const pageIndex = resolvePageIndex(e.target as Element | null);
        void handlePutNoteAtPoint(pageIndex, scorePoint.x, scorePoint.y);
      }
      return;
    }

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
      if (score.clearSelection) {
        Promise.resolve(score.clearSelection())
          .then(refreshAfterClear)
          .catch((err: unknown) => {
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
        // Desktop MuseScore's Ctrl+Click on empty bar space does not build a list
        // selection (Score::selectAdd, score.cpp:2984): it either replaces the
        // range with the newly clicked bar, or -- when re-clicking the bar that
        // is already the sole selection -- toggles it off
        // (NotationInteraction::doSelect deselects on a Ctrl-click of an
        // already-selected item). Bars never join a List upstream, and measure
        // deletion (cmdTimeDelete) requires SelState::RANGE and refuses a List
        // outright, so there is no "add this bar too, keep the others" to build.
        // The only behaviour that isn't already the default replace-click is the
        // toggle-off, handled below.
        const isCtrlClick = (e.ctrlKey || e.metaKey) && !e.shiftKey;

        const trySelect = async (): Promise<boolean | 'cleared'> => {
          // Desktop MuseScore maps Shift+Click to SelectType::RANGE and plain
          // click to SINGLE (notationviewinputcontroller.cpp). Mode 3 is RANGE,
          // so shift-clicking another bar -- including one on a different staff
          // -- widens the existing selection instead of replacing it.
          //
          // This has to go through the measure path, not the element one: empty
          // space inside a bar matches no selectable item, so selectElementAtPoint
          // returns false and bar selection actually comes from the
          // selectMeasureAtPoint fallback below. The extend variant is that same
          // lookup without the deselectAll, so the range widens instead.
          if (isShiftClick && score.extendMeasureSelectionAtPoint) {
            const extended = await score.extendMeasureSelectionAtPoint(
              pageIndex,
              scorePoint.x,
              scorePoint.y,
            );
            if (extended) {
              return true;
            }
          }
          if (score.selectElementAtPoint) {
            const elementSelected = await score.selectElementAtPoint(
              pageIndex,
              scorePoint.x,
              scorePoint.y,
            );
            if (elementSelected) {
              return true;
            }
          }

          // If no element was selected, try selecting the measure
          if (score.selectMeasureAtPoint) {
            const readMeasureRange = async () => {
              if (!score.selectionMeasureRange) {
                return null;
              }
              try {
                return await score.selectionMeasureRange();
              } catch {
                return null;
              }
            };

            const previousRange = isCtrlClick ? await readMeasureRange() : null;

            const measureSelected = await score.selectMeasureAtPoint(
              pageIndex,
              scorePoint.x,
              scorePoint.y,
            );
            if (!measureSelected) {
              return false;
            }

            if (
              isCtrlClick &&
              score.clearSelection &&
              previousRange &&
              previousRange.startMeasureIndex === previousRange.endMeasureIndex
            ) {
              const newRange = await readMeasureRange();
              const sameSingleBar =
                newRange &&
                newRange.startMeasureIndex === previousRange.startMeasureIndex &&
                newRange.endMeasureIndex === previousRange.endMeasureIndex;
              if (sameSingleBar) {
                await score.clearSelection();
                return 'cleared' as const;
              }
            }

            return Boolean(measureSelected);
          }

          return false;
        };

        trySelect()
          .then(async (selected) => {
            if (selected === false || selected === 'cleared') {
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
                  const boxes: SelectionBox[] = bboxes.map((bb, index) => {
                    const x = bb.x;
                    const y = bb.y;
                    const w = bb.width;
                    const h = bb.height;
                    const page = bb.page;
                    return {
                      index,
                      page,
                      x,
                      y,
                      w,
                      h,
                      centerX: x + w / 2,
                      centerY: y + h / 2,
                      classes: 'Measure',
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
              void playSelectionPreview('selection-click:element', fallback.point, {
                reselect: true,
              });
            }
          })
          .catch((err) => {
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
      const allElements = Array.from(
        containerRef.current.querySelectorAll(ELEMENT_SELECTION_SELECTOR),
      );
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

      const classAttr = normalizeElementClasses(
        targetElement,
        targetElement.getAttribute('class') ?? '',
      );
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
      const alreadySelected =
        additiveSelection &&
        box.index !== null &&
        selectionBoxes.some((existing) => existing.index === box.index);
      // Mode: 0 = replace, 1 = add, 2 = toggle, 3 = range
      // Use range selection (mode 3) for shift-click when there's already a selection
      const hasExistingSelection = selectionBoxes.length > 0;
      const mode = canModeSelect
        ? additiveSelection
          ? alreadySelected
            ? 2 // Toggle off if already selected
            : isShiftClick && hasExistingSelection
              ? 3 // Range selection for shift-click
              : 1 // Add selection for ctrl/cmd-click
          : 0 // Replace selection
        : null;

      // DOM overlay coordinates are in the wrapper's CSS space, while
      // engine hit testing expects the SVG's engraving coordinate space.
      const engravingPoint = clientToEngravingPoint(e.clientX, e.clientY, targetElement);
      const selectionX = engravingPoint?.x ?? centerX;
      const selectionY = engravingPoint?.y ?? centerY;

      const selectionPromise = canModeSelect
        ? score.selectElementAtPointWithMode!(
            pageIndex,
            selectionX,
            selectionY,
            mode as 0 | 1 | 2 | 3,
          )
        : score.selectElementAtPoint?.(pageIndex, selectionX, selectionY);

      if (selectionPromise !== undefined) {
        const selectionRun = Promise.resolve(selectionPromise);
        selectionInFlightRef.current = selectionRun;
        void selectionRun
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
              // The click RPC above already established the engine
              // selection. Replaying it races immediate copy/paste and can
              // replace the destination after the command was dispatched.
              { reselect: false },
            );
          })
          .catch((err) => {
            console.warn('selectElementAtPoint not available or failed:', err);
            setSelectedElement(null);
            setSelectionBoxes([]);
            setSelectedPoint(null);
            setSelectedIndex(null);
            setSelectedElementClasses('');
            setSelectedLayoutBreakSubtype(null);
          })
          .finally(() => {
            if (selectionInFlightRef.current === selectionRun) {
              selectionInFlightRef.current = null;
            }
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
        const next = selectionBoxes.filter((existing) => existing.index !== box.index);
        setSelectionBoxes(next);

        if (selectedIndex === box.index) {
          const nextPrimary = next.at(-1) ?? null;
          if (!nextPrimary) {
            setSelectedElement(null);
            setSelectedPoint(null);
            setSelectedIndex(null);
          } else {
            setSelectedElement({
              x: nextPrimary.x,
              y: nextPrimary.y,
              w: nextPrimary.w,
              h: nextPrimary.h,
            });
            setSelectedPoint({
              page: nextPrimary.page,
              x: nextPrimary.centerX,
              y: nextPrimary.centerY,
            });
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

  async function openTextEditorFromEvent(e: React.MouseEvent) {
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
    const rect = element.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    const x = (rect.left - containerRect.left) / zoom;
    const y = (rect.top - containerRect.top) / zoom;
    const w = rect.width / zoom;
    const h = rect.height / zoom;
    const pageIndex = resolvePageIndex(element);
    const engravingPoint = clientToEngravingPoint(e.clientX, e.clientY, element);
    if (engravingPoint && score.selectElementAtPoint) {
      const selected = await score.selectElementAtPoint(
        pageIndex,
        engravingPoint.x,
        engravingPoint.y,
      );
      if (selected === false) {
        return;
      }
    }
    const selectableElements = Array.from(
      containerRef.current.querySelectorAll(ELEMENT_SELECTION_SELECTOR),
    );
    const elementIndex = selectableElements.indexOf(element);
    const box: SelectionBox = {
      index: elementIndex >= 0 ? elementIndex : null,
      page: pageIndex,
      x,
      y,
      w,
      h,
      centerX: x + w / 2,
      centerY: y + h / 2,
      classes: normalizeElementClasses(element, element.getAttribute('class') ?? ''),
    };
    setSelectionBoxes([box]);
    setSelectedElement({ x, y, w, h });
    setSelectedIndex(box.index);
    setSelectedPoint({ page: pageIndex, x: box.centerX, y: box.centerY });
    setSelectedElementClasses(box.classes ?? '');
    setHasBackendHighlighting(false);
    const scorePoint = clientToScorePoint(e.clientX, e.clientY);
    if (scorePoint) {
      setTextEditorPosition({ x: scorePoint.x, y: scorePoint.y });
    }
  }

  const handleScoreContextMenu = (e: React.MouseEvent) => {
    void openTextEditorFromEvent(e);
  };

  const closeTextEditor = () => {
    setTextEditorPosition(null);
  };

  const secondarySelectionBoxes = selectionBoxes.filter((box) => {
    if (selectedIndex !== null && box.index === selectedIndex) {
      return false;
    }
    if (
      selectedElement &&
      box.x === selectedElement.x &&
      box.y === selectedElement.y &&
      box.w === selectedElement.w &&
      box.h === selectedElement.h
    ) {
      return false;
    }
    return true;
  });
  // hasBackendHighlighting means the current selection came from the measure/range
  // path, which sets selectionBoxes but never touches selectedElement -- so
  // selectedElement can be stale from whatever was selected before (a notehead, or
  // nothing) and must not be allowed to win here. A range spanning multiple systems
  // gets one box per system (ScoreRangeUtilities::boundingArea upstream), so
  // "the" backend rect isn't well-defined -- that case is rendered separately,
  // below, as one rectangle per box. This stays selectedElement/single-box only.
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
  const textEditorRect = textEditorPosition
    ? (primarySelectionRect ?? { x: textEditorPosition.x, y: textEditorPosition.y, w: 220, h: 30 })
    : null;
  const textSelectionActive =
    hasTextElementClass(selectedElementClasses) || Boolean(textEditorPosition);
  const selectedTextControlDisabled = !interactiveMutationEnabled || !score?.setSelectedText;
  const checkpointControlsDisabled = checkpointBusy || checkpointLoading;
  const checkpointSaveDisabled = checkpointControlsDisabled || !score || !score?.saveXml;
  const checkpointCompareDisabled = checkpointControlsDisabled || !score;
  const xmlControlsDisabled = xmlLoading || !score || !score?.saveXml;
  const xmlApplyEnabled = !xmlControlsDisabled && xmlDirty;
  const xmlReloadEnabled = !xmlControlsDisabled && scoreDirtySinceXml;
  const xmlApplyDisabled = !xmlApplyEnabled;
  const aiToolsSidebarOpen = xmlSidebarMode !== 'closed';
  const xmlEditorHeight = '45vh';
  const xmlEditorMaxHeight = '55vh';

  const MIN_SIDEBAR_WIDTH = 280; // minimum resizable width
  const MAX_SIDEBAR_WIDTH = 800; // maximum resizable width

  const handleSidebarResizeStart = useCallback(
    (e: React.MouseEvent) => {
      if (xmlSidebarMode !== 'open') return;
      e.preventDefault();
      setIsResizingSidebar(true);
      sidebarResizeStartXRef.current = e.clientX;
      sidebarResizeStartWidthRef.current = xmlSidebarWidth;
    },
    [xmlSidebarMode, xmlSidebarWidth],
  );

  useEffect(() => {
    if (!isResizingSidebar) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = sidebarResizeStartXRef.current - e.clientX;
      const newWidth = Math.max(
        MIN_SIDEBAR_WIDTH,
        Math.min(MAX_SIDEBAR_WIDTH, sidebarResizeStartWidthRef.current + delta),
      );
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
  const versionsLoadedRevisionLabel = activeLaunchContext?.revisionId
    ? `rev ${activeLaunchContext.revisionId.slice(0, 8)}`
    : 'current loaded revision';
  const versionsWorkingBranchName =
    activeLaunchContext?.branchName || otsSourceContext?.branchName || versionsBranchName;
  const versionsViewingDifferentBranch = Boolean(
    otsSourceContext && versionsWorkingBranchName !== versionsBranchName,
  );
  const versionsStatusMessage = otsSourceContext
    ? scoreDirtySinceCheckpoint
      ? versionsViewingDifferentBranch
        ? `Detached from ${versionsLoadedRevisionLabel} on ${versionsWorkingBranchName}. Commit target: ${versionsBranchName}. Use Load branch head to switch the working copy.`
        : `Detached from ${versionsLoadedRevisionLabel}. Commit target: ${versionsBranchName}.`
      : versionsViewingDifferentBranch
        ? `Loaded ${versionsLoadedRevisionLabel} on ${versionsWorkingBranchName}. Selected branch: ${versionsBranchName}. Use Load branch head to switch the working copy.`
        : `Tracking ${versionsLoadedRevisionLabel} on ${versionsWorkingBranchName}. Commit target: ${versionsBranchName}.`
    : null;
  const versionsLoadBranchLabel = sourceHistory?.selectedBranch?.headRevisionId
    ? 'Load branch head'
    : sourceHistory?.selectedBranch?.baseRevisionId
      ? 'Load branch base'
      : 'Load branch head';

  const noteInputCursorColor =
    NOTE_INPUT_VOICE_COLORS[noteInputCursorRect?.voice ?? 0] ?? NOTE_INPUT_VOICE_COLORS[0];
  const compareLeftNoteInputCursor = compareLeftRole
    ? compareNoteInputCursorByRole[compareLeftRole]
    : null;
  const compareRightNoteInputCursor = compareRightRole
    ? compareNoteInputCursorByRole[compareRightRole]
    : null;
  const compareLeftNoteInputCursorColor =
    NOTE_INPUT_VOICE_COLORS[compareLeftNoteInputCursor?.voice ?? 0] ?? NOTE_INPUT_VOICE_COLORS[0];
  const compareRightNoteInputCursorColor =
    NOTE_INPUT_VOICE_COLORS[compareRightNoteInputCursor?.voice ?? 0] ?? NOTE_INPUT_VOICE_COLORS[0];
  const compareLeftNoteInputCursorVisible = Boolean(
    compareLeftRole &&
    compareNoteInputByRole[compareLeftRole] &&
    compareLeftNoteInputCursor &&
    (compareContinuousMode ||
      compareLeftNoteInputCursor.page === getCompareTargetPage(compareLeftScore)),
  );
  const compareRightNoteInputCursorVisible = Boolean(
    compareRightRole &&
    compareNoteInputByRole[compareRightRole] &&
    compareRightNoteInputCursor &&
    (compareContinuousMode ||
      compareRightNoteInputCursor.page === getCompareTargetPage(compareRightScoreDisplay)),
  );

  return (
    /*
            Rows mode grows; every other mode fills the window.

            The editor is built for a fixed viewport — `h-screen` with
            `overflow-auto` at each level — which is right when it owns the
            window. Embedded in a page it is not: a scrollable box inside a
            fixed-height frame gives the reader two scrollbars and the shorter
            of two viewports. So in rows mode the chain grows to its content and
            the host sizes the frame to match.
        */
    <div className={isSystemRowsMode ? 'flex flex-col overflow-x-clip' : 'flex flex-col h-screen'}>
      {!isEmbedMode && (
        <div className="relative" style={{ zIndex: 100 }} ref={toolbarRef}>
          <Toolbar
            onNewScore={handleOpenNewScoreDialog}
            onFileUpload={handleLoadScoreUpload}
            onLoadScoresToCompare={handleOpenCompareScoreLoader}
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
            onOpenHeaderEditor={score?.setTitleText ? handleOpenHeaderEditor : undefined}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            zoomLevel={zoom}
            onFitWidth={handleFitWidth}
            onFitHeight={handleFitHeight}
            onSetZoom={handleSetZoom}
            onDeleteSelection={handleDeleteSelection}
            onSelectAll={handleSelectAll}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onPitchUp={handlePitchUp}
            onPitchDown={handlePitchDown}
            onTranspose={handleTranspose}
            onTransposeEx={handleTransposeEx}
            onSetAccidental={noteInputActive ? handleSetInputAccidental : handleSetAccidental}
            onDurationLonger={handleDurationLonger}
            onDurationShorter={handleDurationShorter}
            mutationsEnabled={interactiveMutationEnabled}
            selectionActive={
              Boolean(selectedElement) || selectionBoxes.length > 0 || Boolean(selectedPoint)
            }
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
            onExportCurrentPageAudio={
              score?.saveAudioForMeasureRange ? handleExportCurrentPageAudio : undefined
            }
            onExportToGoogleDrive={handleExportToGoogleDrive}
            onCreateShareableLink={handleOpenShareLinkDialog}
            onTogglePlayPause={() => {
              void handleTogglePlayPause();
            }}
            onStopAudio={() => {
              void stopAudio({ awaitCancel: true });
            }}
            onPlayFromSelectionAudio={interactionReady ? handlePlayFromSelectionAudio : undefined}
            isPlaying={isPlaying}
            isPaused={isPaused}
            audioBusy={audioBusy}
            exportsEnabled={Boolean(score)}
            pngAvailable={Boolean(score?.savePng)}
            audioAvailable={Boolean(score?.saveAudio)}
            onSetTimeSignature={handleSetTimeSignature}
            onSetKeySignature={handleSetKeySignature}
            onSetClef={handleSetClef}
            paletteDropEnabled={Boolean(score?.applyDropAtPoint)}
            onToggleDot={noteInputActive ? handleToggleInputDotState : handleToggleDot}
            onToggleDoubleDot={noteInputActive ? undefined : handleToggleDoubleDot}
            onSetDurationType={noteInputActive ? handleSetInputDuration : handleSetDurationType}
            onToggleLineBreak={handleToggleLineBreak}
            onTogglePageBreak={handleTogglePageBreak}
            onSetVoice={noteInputActive ? handleSetInputVoice : handleSetVoice}
            onAddDynamic={handleAddDynamic}
            onAddHairpin={handleAddHairpin}
            onAddOttava={handleAddOttava}
            onAddTrill={handleAddTrill}
            onAddGlissando={handleAddGlissando}
            onAddFermata={handleAddFermata}
            onAddBreath={handleAddBreath}
            onAddArpeggio={handleAddArpeggio}
            onAddTremolo={handleAddTremolo}
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
            onFlipStem={handleFlipStem}
            onAddTie={handleAddTie}
            onAddGraceNote={handleAddGraceNote}
            onToggleNoteInput={toggleNoteInputMode}
            noteInputActive={noteInputActive}
            noteInputMethod={noteInputMethod}
            onSetNoteInputMethod={handleSetNoteInputMethod}
            onAddTuplet={handleAddTuplet}
            onAddNoteFromRest={handleAddNoteFromRest}
            onToggleRepeatStart={handleToggleRepeatStart}
            onToggleRepeatEnd={handleToggleRepeatEnd}
            onSetRepeatCount={handleSetRepeatCount}
            onSetBarLineType={handleSetBarLineType}
            onAddVolta={handleAddVolta}
            onAddMarker={handleAddMarker}
            onAddJump={handleAddJump}
            onSetNoteheadGroup={handleSetNoteheadGroup}
            onSetBeamMode={handleSetBeamMode}
            onAddFretDiagram={handleAddFretDiagram}
            onAddAmbitus={handleAddAmbitus}
            onExplodeSelection={() => {
              void runRangeTool('explode selection', 'explodeSelection');
            }}
            onImplodeSelection={() => {
              void runRangeTool('implode selection', 'implodeSelection');
            }}
            onRegroupSelection={() => {
              void runRangeTool('regroup rhythms', 'regroupSelection');
            }}
            onResequenceRehearsalMarks={() => {
              void runRangeTool('resequence rehearsal marks', 'resequenceRehearsalMarks');
            }}
            onTogglePalettes={() => {
              setPaletteCategory(null);
              setPalettesOpen((open) => !open);
            }}
            onOpenPalette={openPaletteCategory}
            palettesOpen={palettesOpen}
            onTogglePanels={() => setPanelsVisible((visible) => !visible)}
            panelsVisible={panelsVisible}
            selectionFilterMask={selectionFilterMask}
            onSetSelectionFilterBit={handleSetSelectionFilterBit}
            onAddMeasureRepeat={handleAddMeasureRepeat}
            multiMeasureRestsEnabled={multiMeasureRestsEnabled}
            onSetMultiMeasureRests={handleSetMultiMeasureRests}
            onInsertMeasures={handleInsertMeasures}
            onAddPickup={handleAddPickup}
            onRemoveContainingMeasures={handleRemoveContainingMeasures}
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

      {palettesOpen && (!isEmbedMode || Boolean(compareView)) && (
        <FloatingPalettes
          disabled={
            compareView
              ? !compareActiveScore ||
                !compareActiveRole ||
                !compareHasSelectionByRole[compareActiveRole]
              : !interactiveMutationEnabled ||
                (!selectedElement && selectionBoxes.length === 0 && !selectedPoint)
          }
          dragEnabled={Boolean(
            !compareView && interactiveMutationEnabled && score?.applyDropAtPoint,
          )}
          onApply={
            compareView ? handleCompareApplyFloatingPaletteItem : handleApplyFloatingPaletteItem
          }
          onClose={() => setPalettesOpen(false)}
          category={paletteCategory}
        />
      )}

      <div className={isSystemRowsMode ? 'flex' : 'flex flex-1 min-h-0'}>
        <LeftSidebar
          hidden={isEmbedMode || !panelsVisible}
          collapsed={checkpointsCollapsed}
          onToggleCollapsed={() => setCheckpointsCollapsed((prev) => !prev)}
          onRefresh={() => {
            if (otsSourceContext && leftSidebarTab === 'versions') {
              void refreshSourceHistory();
              return;
            }
            void loadCheckpointList();
          }}
          checkpointControlsDisabled={checkpointControlsDisabled}
          leftSidebarTab={leftSidebarTab}
          onTabChange={setLeftSidebarTab}
          showVersionsTab={Boolean(otsSourceContext)}
          versionsLoading={versionsLoading}
          versionsError={versionsError}
          versionsBranchName={versionsBranchName}
          versionsBranches={sourceHistory?.branches || []}
          versionsSelectedBranch={sourceHistory?.selectedBranch || null}
          versionsRevisions={sourceHistory?.revisions || []}
          versionsCanCreateBranch={Boolean(sourceHistory?.viewer?.canCreateBranch)}
          versionsCanCommit={Boolean(sourceHistory?.viewer?.canCommitToSelectedBranch)}
          versionsActionBusy={versionsActionBusy}
          versionsActionError={versionsActionError}
          versionsActionNotice={versionsActionNotice}
          versionsStatusMode={scoreDirtySinceCheckpoint ? 'detached' : 'tracking'}
          versionsStatusMessage={versionsStatusMessage}
          versionsSelectedBaseRevisionId={versionsSelectedBaseRevisionId}
          versionsLoadBranchLabel={versionsLoadBranchLabel}
          versionsCommitMessage={versionsCommitMessage}
          onVersionsCommitMessageChange={setVersionsCommitMessage}
          onVersionsCommitCurrent={() => void handleVersionsCommitCurrent()}
          versionsCreateBranchName={versionsCreateBranchName}
          onVersionsCreateBranchNameChange={setVersionsCreateBranchName}
          versionsCreateBranchPolicy={versionsCreateBranchPolicy}
          onVersionsCreateBranchPolicyChange={setVersionsCreateBranchPolicy}
          onVersionsCreateBranch={() => void handleVersionsCreateBranch()}
          onVersionsBranchChange={setVersionsBranchName}
          onVersionsRefresh={() => void refreshSourceHistory()}
          onVersionsOpenRevision={(revision) => void handleVersionsOpenRevision(revision)}
          onVersionsDiffRevision={(revision) => void handleVersionsDiffRevision(revision)}
          onVersionsSelectBaseRevision={(revision) =>
            setVersionsSelectedBaseRevisionId(revision?.revisionId || null)
          }
          onVersionsDiffAgainstBase={(revision) => void handleVersionsDiffAgainstBase(revision)}
          onVersionsLoadBranchHead={() => void handleVersionsLoadBranchHead()}
          onVersionsOpenChangeReview={(revision) => void handleVersionsOpenChangeReview(revision)}
          checkpointLabel={checkpointLabel}
          onCheckpointLabelChange={setCheckpointLabel}
          onSaveCheckpoint={() => void handleSaveCheckpoint()}
          checkpointSaveDisabled={checkpointSaveDisabled}
          scoreLoaded={Boolean(score)}
          checkpointError={checkpointError}
          checkpointLoading={checkpointLoading}
          checkpoints={checkpoints}
          checkpointCompareDisabled={checkpointCompareDisabled}
          onRestoreCheckpoint={(checkpoint) => void handleRestoreCheckpoint(checkpoint)}
          onCompareCheckpoint={(checkpoint) => void handleCompareCheckpoint(checkpoint)}
          onRenameCheckpoint={(checkpoint) => void handleRenameCheckpoint(checkpoint)}
          onDeleteCheckpoint={(checkpoint) => void handleDeleteCheckpoint(checkpoint)}
          scoreDirtySinceCheckpoint={scoreDirtySinceCheckpoint}
          scoreSummariesError={scoreSummariesError}
          scoreSummariesLoading={scoreSummariesLoading}
          scoreSummaries={scoreSummaries}
          currentScoreId={scoreId}
          onOpenScoreFromSummary={handleOpenScoreFromSummary}
          formatTimestamp={formatTimestamp}
          formatBytes={formatBytes}
          summarizeScoreId={summarizeScoreId}
        />

        <div
          ref={scrollContainerRef}
          onScroll={(event) => {
            if (isChangeReviewSingleScoreMode && changeReviewGutterRef.current) {
              changeReviewGutterRef.current.scrollTop = event.currentTarget.scrollTop;
            }
          }}
          /*
           * The scanner's row view is a vertical stack of clipped
           * bands; nothing in it is meant to scroll sideways. Each
           * band holds a whole page scaled up so that one system
           * fills the box, and the browser counts that clipped
           * drawing toward this container's scroll area — so a
           * horizontal scrollbar ran the width of the editor,
           * dragged 1441px, and revealed nothing, because there was
           * nothing there. Every other mode still scrolls a score
           * that really is wider than the window.
           *
           * `clip`, not `hidden`. `overflow-x: hidden` with a visible
           * y computes y to `auto`, which makes this a scroll
           * container again — and a scroll container cannot grow to
           * its content, which is what rows mode needs so the host
           * can size the frame. `clip` is the one value that leaves
           * the other axis alone.
           */
          className={`relative z-0 flex-1 bg-gray-50 p-8 ${
            isSystemRowsMode ? 'overflow-x-clip overflow-y-visible' : 'overflow-auto'
          }`}
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
            <>
              {interactionPreparing && (
                <div
                  data-testid="interaction-preparing-banner"
                  className="mb-3 flex items-center justify-between gap-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                >
                  <div>
                    <div className="font-medium">Finalizing interactive layout...</div>
                    <div className="text-xs text-amber-800">
                      Viewing and page playback are available. Note selection, note editing, and
                      selection playback will unlock when relayout finishes.
                    </div>
                  </div>
                  <div className="shrink-0 text-xs font-semibold uppercase tracking-wide text-amber-700">
                    Preparing
                  </div>
                </div>
              )}
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
                  Page {currentPage + 1} of{' '}
                  {progressivePagingActive && progressiveHasMorePages ? `${pageCount}+` : pageCount}
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
                  disabled={
                    currentPage >= pageCount - 1 &&
                    !(progressivePagingActive && progressiveHasMorePages)
                  }
                  className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </>
          )}

          <div
            ref={scoreWrapperRef}
            className={`relative origin-top-left transition-transform duration-200 ease-out bg-white shadow-lg mx-auto ${paletteDropActive ? 'ring-4 ring-blue-400 ring-offset-2' : ''}`}
            data-testid="score-wrapper"
            data-palette-drop-active={paletteDropActive ? 'true' : 'false'}
            style={{
              transform: `scale(${zoom})`,
              width: 'fit-content',
              cursor: noteInputActive ? 'crosshair' : undefined,
            }}
            onClick={
              isChangeReviewSingleScoreMode
                ? () => {
                    setChangeReviewFocusedAnchorId(null);
                    setChangeReviewNewThreadAnchorId(null);
                    setChangeReviewNewThreadContent('');
                  }
                : handleScoreClick
            }
            onDoubleClick={isChangeReviewSingleScoreMode ? undefined : handleScoreDoubleClick}
            onPointerDown={isChangeReviewSingleScoreMode ? undefined : handleScorePointerDown}
            onPointerMove={isChangeReviewSingleScoreMode ? undefined : handleScorePointerMove}
            onPointerUp={isChangeReviewSingleScoreMode ? undefined : handleScorePointerUp}
            onPointerCancel={isChangeReviewSingleScoreMode ? undefined : handleScorePointerCancel}
            onPointerLeave={
              isChangeReviewSingleScoreMode
                ? undefined
                : () => {
                    if (noteInputActiveRef.current && dragPointerIdRef.current === null) {
                      setNoteInputShadow(null);
                    }
                  }
            }
            onMouseDown={isChangeReviewSingleScoreMode ? undefined : handleScoreMouseDown}
            onMouseMove={isChangeReviewSingleScoreMode ? undefined : handleScoreMouseMove}
            onMouseUp={isChangeReviewSingleScoreMode ? undefined : handleScoreMouseUp}
            onContextMenu={isChangeReviewSingleScoreMode ? undefined : handleScoreContextMenu}
            onDragOver={isChangeReviewSingleScoreMode ? undefined : handlePaletteDragOver}
            onDragLeave={isChangeReviewSingleScoreMode ? undefined : handlePaletteDragLeave}
            onDrop={isChangeReviewSingleScoreMode ? undefined : handlePaletteDrop}
          >
            <div ref={containerRef} data-testid="svg-container" />

            {isChangeReviewSingleScoreMode &&
              changeReviewBarBoxes.map(({ bar, left, top, width, height }) => {
                const selected = changeReviewFocusedAnchorId === bar.anchorId;
                const hasThread = bar.hasThread || changeReviewThreadsByAnchor.has(bar.anchorId);
                const changedClasses = hasThread
                  ? 'border-emerald-500 bg-emerald-300/30'
                  : bar.changeType === 'added'
                    ? 'border-emerald-500 bg-emerald-200/20'
                    : bar.changeType === 'modified'
                      ? 'border-amber-500 bg-amber-200/20'
                      : 'border-transparent bg-transparent hover:border-sky-400 hover:bg-sky-100/20';
                return (
                  <button
                    key={bar.anchorId}
                    type="button"
                    aria-label={`Comment on ${bar.label}`}
                    aria-pressed={selected}
                    className={`absolute z-20 cursor-pointer border-2 transition-colors ${changedClasses} ${selected ? 'ring-2 ring-sky-500 ring-offset-1' : ''}`}
                    style={{
                      left,
                      top,
                      width,
                      height,
                      ...(hasThread
                        ? {
                            backgroundColor: 'rgba(16, 185, 129, 0.35)',
                            borderColor: 'rgb(5, 150, 105)',
                          }
                        : {}),
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      const nowFocused = changeReviewFocusedAnchorId !== bar.anchorId;
                      setChangeReviewFocusedAnchorId(nowFocused ? bar.anchorId : null);
                      if (
                        nowFocused &&
                        !hasThread &&
                        changeReviewDetail?.permissions.canAddThread
                      ) {
                        setChangeReviewNewThreadAnchorId(bar.anchorId);
                      } else {
                        setChangeReviewNewThreadAnchorId(null);
                      }
                      setChangeReviewNewThreadContent('');
                    }}
                  />
                );
              })}

            {dragSelectionRect && (
              <div
                data-testid="drag-selection-rect"
                className="absolute border border-blue-600 bg-blue-200 bg-opacity-20 pointer-events-none"
                style={{
                  left: dragSelectionRect.x,
                  top: dragSelectionRect.y,
                  width: dragSelectionRect.w,
                  height: dragSelectionRect.h,
                }}
              />
            )}

            {noteDragGhost && (
              <div
                data-testid="note-drag-ghost"
                className="absolute pointer-events-none z-20"
                style={{
                  left: noteDragGhost.x,
                  top: noteDragGhost.y,
                  width: noteDragGhost.w,
                  height: noteDragGhost.h,
                }}
              >
                <div className="h-full w-full rounded-full border-2 border-blue-600 bg-blue-400/40" />
                {noteDragGhost.steps !== 0 && (
                  <div className="absolute left-full top-1/2 -translate-y-1/2 ml-1 rounded bg-blue-600 px-1 text-[10px] leading-tight text-white whitespace-nowrap">
                    {noteDragGhost.steps < 0
                      ? `▲ ${-noteDragGhost.steps}`
                      : `▼ ${noteDragGhost.steps}`}
                  </div>
                )}
              </div>
            )}

            {noteInputActive && noteInputCursorRect && noteInputCursorRect.page === currentPage && (
              <div
                data-testid="note-input-cursor"
                data-voice={noteInputCursorRect.voice}
                aria-hidden="true"
                className="absolute pointer-events-none z-10"
                style={{
                  left: noteInputCursorRect.x,
                  top: noteInputCursorRect.y,
                  width: noteInputCursorRect.width,
                  height: noteInputCursorRect.height,
                  backgroundColor: `${noteInputCursorColor}32`,
                  borderLeft: `3px solid ${noteInputCursorColor}`,
                }}
              />
            )}

            {noteInputActive && noteInputShadow && (
              <div
                data-testid="note-input-shadow"
                className="absolute pointer-events-none z-20 rounded-full border-2 border-sky-600 bg-sky-400/45"
                style={{
                  left: noteInputShadow.x,
                  top: noteInputShadow.y,
                  width: noteInputShadow.w,
                  height: noteInputShadow.h,
                  transform: 'rotate(-12deg)',
                }}
                title="Click to place note"
              />
            )}

            {gripEdit?.page === currentPage &&
              gripEdit.grips.map((grip) => {
                const overlayPoint = engravingToOverlayPoint(grip.x, grip.y);
                return (
                  <button
                    key={grip.index}
                    type="button"
                    data-testid={`spanner-grip-${grip.index}`}
                    aria-label={`Spanner grip ${grip.index + 1}`}
                    disabled={!grip.draggable}
                    className={`absolute z-30 h-4 w-4 border-2 shadow-md ring-1 ring-white ${
                      grip.draggable
                        ? 'cursor-move border-slate-950 bg-cyan-300 hover:bg-cyan-100'
                        : 'cursor-not-allowed border-slate-700 bg-slate-300 opacity-90'
                    }`}
                    style={{
                      left: overlayPoint.x,
                      top: overlayPoint.y,
                      transform: `translate(-50%, -50%) scale(${1 / zoom})`,
                      transformOrigin: 'center',
                    }}
                    onClick={(event) => event.stopPropagation()}
                    onDoubleClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => handleGripPointerDown(event, grip.index)}
                    title={
                      grip.draggable
                        ? 'Drag to reshape'
                        : 'This anchor requires the desktop score view'
                    }
                  />
                );
              })}

            {/* Selection highlighting is now done natively in the SVG via highlightSelection=true in saveSvg(). Keep the overlays around for testing/interaction feedback. */}
            {secondarySelectionBoxes.map((box, index) => (
              <div
                key={index}
                className="absolute pointer-events-none"
                style={{
                  left: box.x,
                  top: box.y,
                  width: box.w,
                  height: box.h,
                }}
              />
            ))}

            {/* Backend range selections (measure/bar clicks, Shift-extend) get one box
                        per system from the engine -- render every one of them, not just the
                        first, or a range spanning a system break loses its rectangle entirely
                        past the first line. All share the same testid: they're one logical
                        selection, not a list. */}
            {hasBackendHighlighting &&
              selectionBoxes.length > 0 &&
              !overlaySuppressed &&
              selectionBoxes.map((box, index) => (
                <div
                  key={index}
                  data-testid="selection-overlay"
                  className="absolute pointer-events-none border-2 border-blue-600"
                  style={{
                    left: box.x,
                    top: box.y,
                    width: box.w,
                    height: box.h,
                  }}
                />
              ))}
            {primarySelectionRect &&
              !overlaySuppressed &&
              selectionBoxes.length <= 1 &&
              !hasBackendHighlighting && (
                <div
                  data-testid="selection-overlay"
                  className="absolute pointer-events-none border-2 border-blue-600"
                  style={{
                    left: primarySelectionRect.x,
                    top: primarySelectionRect.y,
                    width: primarySelectionRect.w,
                    height: primarySelectionRect.h,
                  }}
                />
              )}
            {selectionBoxes.length > 1 &&
              !overlaySuppressed &&
              !hasBackendHighlighting &&
              selectionBoxes.map((box, index) => (
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
                    height: box.h,
                  }}
                />
              ))}
            {textEditorRect && (
              <div
                data-testid="inline-text-editor"
                className="absolute z-50 flex flex-col gap-1 rounded border-2 border-blue-600 bg-white p-1 shadow-lg"
                style={{
                  left: textEditorRect.x,
                  top: textEditorRect.y,
                  minWidth: Math.max(160, textEditorRect.w),
                  minHeight: Math.max(30, textEditorRect.h),
                  // The editor lives inside the zoomed score canvas; counter-scale so
                  // text editing is always shown at 100% regardless of the score zoom.
                  transform: `scale(${1 / zoom})`,
                  transformOrigin: 'top left',
                }}
                onClick={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <div
                  ref={inlineTextContentRef}
                  data-testid="inline-text-content"
                  role="textbox"
                  aria-label="Edit score text"
                  contentEditable
                  suppressContentEditableWarning
                  onInput={(event) => {
                    inlineTextEditedRef.current = true;
                    handleSelectedTextChange(event.currentTarget.textContent ?? '');
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      closeTextEditor();
                    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                      event.preventDefault();
                      void applySelectedTextValue(event.currentTarget.textContent ?? '');
                      closeTextEditor();
                    }
                  }}
                  className="min-h-7 min-w-[150px] px-1 py-0.5 text-base text-slate-900 outline-none"
                />
                <div className="flex justify-end gap-1 border-t border-slate-200 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      void applySelectedTextValue(
                        inlineTextContentRef.current?.textContent ?? selectedTextValue,
                      );
                      closeTextEditor();
                    }}
                    className="rounded bg-blue-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-blue-700"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={closeTextEditor}
                    className="rounded border border-gray-300 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {isChangeReviewSingleScoreMode && (
          <ChangeReviewScorePanel
            review={{
              detail: changeReviewDetail,
              barBoxes: changeReviewGutterBars,
              threadsByAnchor: changeReviewThreadsByAnchor,
              focusedAnchorId: changeReviewFocusedAnchorId,
              newThreadAnchorId: changeReviewNewThreadAnchorId,
              newThreadContent: changeReviewNewThreadContent,
              loading: changeReviewLoading,
              error: changeReviewError,
              actionBusy: changeReviewActionBusy,
              actionError: changeReviewActionError,
              measurePositions: changeReviewMeasurePositions,
              scoreView: changeReviewScoreView,
              renderThread: renderChangeReviewThread,
              createThread: createChangeReviewThread,
              setFocusedAnchorId: setChangeReviewFocusedAnchorId,
              setNewThreadAnchorId: setChangeReviewNewThreadAnchorId,
              setNewThreadContent: setChangeReviewNewThreadContent,
            }}
            gutterRef={changeReviewGutterRef}
            reviewLabel={reviewLabel}
            zoom={zoom}
          />
        )}

        {!isEmbedMode && panelsVisible && (
          <InspectorPanel
            data={inspectorData}
            loading={inspectorLoading}
            disabled={!interactiveMutationEnabled || !score?.setSelectedElementProperty}
            onChange={(property, value) => {
              void handleSetInspectorProperty(property, value);
            }}
            fretDiagram={fretDiagramData}
            onFretDiagramChange={(diagram) => {
              void handleSetFretDiagram(diagram);
            }}
            collapsed={!inspectorOpen}
            onToggleCollapsed={() => setInspectorOpen((open) => !open)}
          />
        )}

        {!isEmbedMode && panelsVisible && musicXmlOpen && (
          <MusicXmlPanel
            text={xmlText}
            setText={setXmlText}
            setDirty={setXmlDirty}
            scoreLoaded={Boolean(score)}
            layout={{
              editorHeight: xmlEditorHeight,
              editorMaxHeight: xmlEditorMaxHeight,
            }}
            permissions={{
              applyEnabled: xmlApplyEnabled,
              applyDisabled: xmlApplyDisabled,
              reloadEnabled: xmlReloadEnabled,
              controlsDisabled: xmlControlsDisabled,
            }}
            theme={{
              mode: codeEditorTheme,
              setMode: setCodeEditorTheme,
            }}
            actions={{
              apply: () => void handleApplyXmlEdits(),
              refresh: () => void handleRefreshXml(),
              close: () => setMusicXmlOpen(false),
            }}
          />
        )}

        {!isEmbedMode && panelsVisible && aiToolsSidebarOpen && (
          <aside
            className="flex shrink-0 border-l bg-white text-sm"
            style={{ width: `${xmlSidebarWidth}px` }}
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
                <svg
                  width="14"
                  height="24"
                  viewBox="0 0 14 24"
                  fill="none"
                  className="pointer-events-none"
                >
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
                <div className="flex items-center justify-between p-4">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    AI Tools
                  </span>
                  <button
                    type="button"
                    data-testid="btn-xml-toggle"
                    aria-expanded
                    aria-controls="xml-sidebar-content"
                    aria-label="Close AI Tools sidebar"
                    title="Close AI Tools sidebar"
                    onClick={() => setXmlSidebarMode('closed')}
                    className="rounded p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  >
                    <PanelRightClose size={16} />
                  </button>
                </div>
                {aiToolsSidebarOpen && (
                  <AiToolsTabStrip
                    activeTab={xmlSidebarTab}
                    setActiveTab={setXmlSidebarTab}
                    aiEnabled={aiEnabled}
                    status={{
                      checkpointCount: checkpoints.length,
                      dirtySinceCheckpoint: scoreDirtySinceCheckpoint,
                      loading: xmlLoading,
                    }}
                  />
                )}
              </div>
              {aiToolsSidebarOpen && (
                <div id="xml-sidebar-content" className="flex-1 overflow-y-auto pb-4 px-4">
                  {xmlSidebarTab === 'assistant' && aiEnabled && (
                    <AiAssistantPanel
                      controller={aiAssistantController}
                      presentation={{
                        work: aiEditWork,
                        elapsedMs: aiEditElapsedMs,
                        budgetMs: activeAiEditBudgetMs,
                        busy: aiBusy,
                        feedbackBusy: aiDiffFeedbackBusy,
                        feedbackError: aiDiffFeedbackError,
                        modelHint: aiModelHint,
                        selectedModel: selectedAiModelDescriptor,
                        supportsCustomMaxTokens: aiSupportsCustomMaxTokens,
                        supportsTemperature: aiSupportsTemperature,
                        supportsImageContext: aiSupportsImageContext,
                        supportsPdfContext: aiSupportsPdfContext,
                        scoreCanSavePng: Boolean(score?.savePng),
                        outputValidation: aiOutputValidation,
                        applyDisabled: aiApplyDisabled,
                        patchEditorHeight,
                        patchEditorMaxHeight,
                        codeEditorTheme,
                      }}
                      actions={{
                        cancel: cancelAiEditRequest,
                        requestPatch: handleAiRequest,
                        reviewPatch: handleApplyAiOutput,
                        sendChat: handleAiChatSend,
                        updateOutput: updateAiOutput,
                      }}
                    />
                  )}
                  {xmlSidebarTab === 'notagen' && aiEnabled && (
                    <NotaGenPanel
                      space={{
                        period: musicNotaGenSpacePeriod,
                        composer: musicNotaGenSpaceComposer,
                        instrumentation: musicNotaGenSpaceInstrumentation,
                        periods: musicNotaGenSpacePeriods,
                        composers: musicNotaGenSpaceComposers,
                        instrumentations: musicNotaGenSpaceInstrumentations,
                        optionsError: musicNotaGenSpaceOptionsError,
                        setPeriod: handleNotaGenPeriodChange,
                        setComposer: handleNotaGenComposerChange,
                        setInstrumentation: setMusicNotaGenSpaceInstrumentation,
                      }}
                      status={{
                        busy: musicNotaGenBusy,
                        statusText: musicNotaGenStatusText,
                        error: musicNotaGenError,
                        progressLog: musicNotaGenProgressLog,
                      }}
                      result={{
                        generatedAbc: musicNotaGenGeneratedAbc,
                        generatedXml: musicNotaGenGeneratedXml,
                        payload: musicNotaGenResult,
                        setGeneratedXml: setMusicNotaGenGeneratedXml,
                      }}
                      actions={{
                        run: () => void handleMusicNotaGenRun(),
                        applyOutput: () => void handleApplyMusicNotaGenOutput(),
                      }}
                      progressRef={musicNotaGenProgressPreRef}
                      editorTheme={codeEditorTheme}
                    />
                  )}
                  {xmlSidebarTab === 'transcoda' && (
                    <TranscodaPanel
                      input={{
                        imageFile: musicTranscodaImageFile,
                        onImageUpload: handleTranscodaImageUpload,
                      }}
                      decoding={{
                        mode: musicTranscodaDecoding,
                        numBeams: musicTranscodaNumBeams,
                        maxLength: musicTranscodaMaxLength,
                        repetitionPenalty: musicTranscodaRepetitionPenalty,
                        setMode: setMusicTranscodaDecoding,
                        setNumBeams: setMusicTranscodaNumBeams,
                        setMaxLength: setMusicTranscodaMaxLength,
                        setRepetitionPenalty: setMusicTranscodaRepetitionPenalty,
                      }}
                      status={{
                        busy: musicTranscodaBusy,
                        phase: musicTranscodaPhase,
                        elapsedMs: musicTranscodaElapsedMs,
                        error: musicTranscodaError,
                        warning: musicTranscodaWarning,
                      }}
                      result={{
                        generatedXml: musicTranscodaGeneratedXml,
                        generatedKern: musicTranscodaGeneratedKern,
                        payload: musicTranscodaResult,
                      }}
                      actions={{
                        transcribe: () => void handleTranscodaTranscribeImage(),
                        applyOutput: (mode) => void handleApplyTranscodaOutput(mode),
                        downloadXml: () =>
                          downloadBlob(
                            musicTranscodaGeneratedXml,
                            'transcoda-output.musicxml',
                            'application/vnd.recordare.musicxml+xml',
                          ),
                      }}
                      service={{
                        spaceId: MUSIC_SPECIALISTS_DEFAULT_TRANSCODA_SPACE_ID,
                        model: MUSIC_SPECIALISTS_DEFAULT_TRANSCODA_MODEL,
                        revision: MUSIC_SPECIALISTS_DEFAULT_TRANSCODA_REVISION,
                      }}
                      apply={{
                        busy: xmlLoading,
                        canAppend: Boolean(score),
                      }}
                    />
                  )}
                  {xmlSidebarTab === 'multitrack' && (
                    <MultitrackVaePanel
                      postJson={postScoreEditorJson}
                      hasScore={Boolean(score)}
                      getCurrentScoreMidiBase64={async () => {
                        if (!score || !score.saveMidi) {
                          return null;
                        }
                        const midi = await score.saveMidi(true, true);
                        let binary = '';
                        const bytes = new Uint8Array(midi);
                        for (let i = 0; i < bytes.length; i++) {
                          binary += String.fromCharCode(bytes[i]);
                        }
                        return btoa(binary);
                      }}
                      onApplyXml={async (xml, applyMode) => {
                        setXmlLoading(true);
                        setXmlError(null);
                        try {
                          if (!score || applyMode === 'overwrite') {
                            if (!score) {
                              const encoded = new TextEncoder().encode(xml);
                              const file = new File([encoded], 'multitrack-vae.musicxml', {
                                type: 'application/xml',
                              });
                              await handleFileUpload(file, {
                                preserveScoreId: false,
                                updateUrl: false,
                                telemetrySource: 'multitrack_vae_output',
                              });
                            } else {
                              await applyXmlToScore(xml, {
                                telemetrySource: 'multitrack_vae_output_overwrite',
                              });
                            }
                          } else {
                            const currentXml = await resolveXmlContext();
                            if (!currentXml.trim()) {
                              throw new Error('Unable to load current score MusicXML for append.');
                            }
                            const appendResult = appendMusicXmlMeasures(currentXml, xml);
                            if (appendResult.appendedMeasureCount <= 0) {
                              throw new Error(
                                'Generated MusicXML did not contain appendable measures.',
                              );
                            }
                            await applyXmlToScore(appendResult.xml, {
                              telemetrySource: 'multitrack_vae_output_append',
                              inputFormat: 'musicxml',
                            });
                          }
                          setXmlSidebarTab('xml');
                        } finally {
                          setXmlLoading(false);
                        }
                      }}
                    />
                  )}
                  {xmlSidebarTab === 'mma' && (
                    <MmaPanel
                      config={{
                        starterPreset: mmaStarterPreset,
                        arrangementPreset: mmaArrangementPreset,
                        groove: mmaGroove,
                        script: mmaScript,
                        setStarterPreset: handleMmaStarterPresetChange,
                        setArrangementPreset: setMmaArrangementPreset,
                        setGroove: setMmaGroove,
                        setScript: setMmaScript,
                        editorTheme: codeEditorTheme,
                      }}
                      status={{
                        busy: mmaBusy,
                        harmonyBusy,
                        error: mmaError,
                      }}
                      result={{
                        generatedXml: mmaGeneratedXml,
                        midiBase64: mmaMidiBase64,
                        warnings: mmaWarnings,
                        sanitizedStderr: mmaSanitizedStderr,
                        payload: mmaResultPayload,
                        setGeneratedXml: setMmaGeneratedXml,
                      }}
                      actions={{
                        generateTemplate: handleMmaGenerateTemplate,
                        chordifyAndGenerate: () =>
                          void handleHarmonyAnalyze({
                            applyImmediately: false,
                            persistArtifacts: true,
                            generateMmaTemplate: true,
                          }),
                        render: (includeMusicXml) => void handleMmaRender(includeMusicXml),
                        download: handleMmaDownload,
                        applyOutput: handleApplyMmaOutput,
                        openChordify: () => setXmlSidebarTab('harmony'),
                      }}
                    />
                  )}
                  {xmlSidebarTab === 'harmony' && (
                    <HarmonyPanel
                      config={{
                        rhythmMode: harmonyRhythmMode,
                        maxChangesPerMeasure: harmonyMaxChangesPerMeasure,
                        setRhythmMode: setHarmonyRhythmMode,
                        setMaxChangesPerMeasure: setHarmonyMaxChangesPerMeasure,
                      }}
                      status={{
                        busy: harmonyBusy,
                        mmaBusy,
                        error: harmonyError,
                      }}
                      result={{
                        generatedXml: harmonyGeneratedXml,
                        warnings: harmonyWarnings,
                        payload: harmonyResultPayload,
                        setGeneratedXml: setHarmonyGeneratedXml,
                      }}
                      actions={{
                        analyze: () =>
                          void handleHarmonyAnalyze({
                            applyImmediately: false,
                            persistArtifacts: true,
                          }),
                        analyzeAndApply: () =>
                          void handleHarmonyAnalyze({
                            applyImmediately: true,
                            persistArtifacts: true,
                          }),
                        analyzeAndGenerateMma: () =>
                          void handleHarmonyAnalyze({
                            applyImmediately: false,
                            persistArtifacts: true,
                            generateMmaTemplate: true,
                          }),
                        applyOutput: () => void handleApplyHarmonyOutput(),
                        downloadXml: handleDownloadHarmonyXml,
                      }}
                      editorTheme={codeEditorTheme}
                    />
                  )}
                  {xmlSidebarTab === 'functional' && (
                    <FunctionalHarmonyPanel
                      status={{
                        busy: functionalHarmonyBusy,
                        error: functionalHarmonyError,
                      }}
                      result={{
                        payload: functionalHarmonyResult,
                        segments: functionalHarmonySegments,
                        warnings: functionalHarmonyWarnings,
                        annotatedXml: functionalHarmonyAnnotatedXml,
                        jsonExport: functionalHarmonyJsonExport,
                        rntxtExport: functionalHarmonyRntxtExport,
                        setAnnotatedXml: setFunctionalHarmonyAnnotatedXml,
                        setRntxtExport: setFunctionalHarmonyRntxtExport,
                      }}
                      actions={{
                        analyze: () => void handleFunctionalHarmonyAnalyze(),
                        applyOutput: () => void handleApplyFunctionalHarmonyOutput(),
                        download: handleDownloadFunctionalHarmony,
                        downloadXml: handleDownloadFunctionalHarmonyXml,
                      }}
                      editorTheme={codeEditorTheme}
                    />
                  )}
                  {xmlError && <div className="mt-2 text-xs text-red-600">{xmlError}</div>}
                </div>
              )}
            </div>
          </aside>
        )}

        {!isEmbedMode &&
          panelsVisible &&
          (() => {
            const tabs = [
              !inspectorOpen && {
                key: 'inspector',
                label: 'Inspector',
                onOpen: () => setInspectorOpen(true),
              },
              !musicXmlOpen && {
                key: 'musicxml',
                label: 'MusicXML',
                onOpen: () => setMusicXmlOpen(true),
              },
              xmlSidebarMode === 'closed' && {
                key: 'ai-tools',
                label: 'AI Tools',
                onOpen: () => setXmlSidebarMode('open'),
              },
              checkpointsCollapsed && {
                key: 'history',
                label: 'History',
                onOpen: () => setCheckpointsCollapsed(false),
              },
            ].filter(Boolean) as Array<{ key: string; label: string; onOpen: () => void }>;
            if (tabs.length === 0) {
              return null;
            }
            return (
              <div
                style={{ order: 4 }}
                className="flex w-8 shrink-0 flex-col items-stretch gap-2 border-l border-slate-200 bg-slate-50 py-3"
                data-testid="collapsed-panel-strip"
              >
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    data-testid={`expand-panel-${tab.key}`}
                    onClick={tab.onOpen}
                    title={`Open ${tab.label}`}
                    className="flex flex-col items-center gap-1 rounded-l-md border border-r-0 border-slate-200 bg-white py-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  >
                    <PanelRightOpen size={14} />
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wide"
                      style={{ writingMode: 'vertical-rl' }}
                    >
                      {tab.label}
                    </span>
                  </button>
                ))}
              </div>
            );
          })()}

        {pngExportDialogOpen && (
          <PngExportDialog
            pageCount={pageCount}
            pageInput={pngExportPageInput}
            setPageInput={setPngExportPageInput}
            busy={pngExportBusy}
            onConfirm={handleConfirmExportPng}
            onClose={() => setPngExportDialogOpen(false)}
          />
        )}

        {googleDriveExportDialogOpen && (
          <GoogleDriveExportDialog
            onOpenShareLink={handleOpenShareLinkDialog}
            onClose={() => setGoogleDriveExportDialogOpen(false)}
          />
        )}

        {shareLinkDialogOpen && (
          <ShareLinkDialog
            driveUrl={googleDriveShareUrl}
            setDriveUrl={setGoogleDriveShareUrl}
            generatedUrl={generatedShareUrl}
            setGeneratedUrl={setGeneratedShareUrl}
            copied={shareLinkCopied}
            setCopied={setShareLinkCopied}
            error={shareLinkError}
            setError={setShareLinkError}
            onGenerate={handleGenerateShareLink}
            onCopy={() => void handleCopyShareLink()}
            onClose={() => setShareLinkDialogOpen(false)}
          />
        )}

        {newScoreDialogOpen && (
          <NewScoreDialog
            details={{
              title: newScoreTitle,
              composer: newScoreComposer,
              measures: newScoreMeasures,
              setTitle: setNewScoreTitle,
              setComposer: setNewScoreComposer,
              setMeasures: setNewScoreMeasures,
            }}
            signature={{
              keyFifths: newScoreKeyFifths,
              timeNumerator: newScoreTimeNumerator,
              timeDenominator: newScoreTimeDenominator,
              withPickup: newScoreWithPickup,
              pickupNumerator: newScorePickupNumerator,
              pickupDenominator: newScorePickupDenominator,
              setKeyFifths: setNewScoreKeyFifths,
              setTimeNumerator: setNewScoreTimeNumerator,
              setTimeDenominator: setNewScoreTimeDenominator,
              setWithPickup: setNewScoreWithPickup,
              setPickupNumerator: setNewScorePickupNumerator,
              setPickupDenominator: setNewScorePickupDenominator,
            }}
            instruments={{
              selectedIds: newScoreInstrumentIds,
              options: newScoreInstrumentOptions,
              groups: newScoreInstrumentGroups,
              common: newScoreCommonInstruments,
              toAdd: newScoreInstrumentToAdd,
              clefMapError: instrumentClefMapError,
              fallbackError: instrumentFallbackError,
              setToAdd: setNewScoreInstrumentToAdd,
              add: handleAddNewScoreInstrument,
              remove: handleRemoveNewScoreInstrument,
            }}
            actions={{
              create: () => void handleCreateNewScore(),
              close: () => setNewScoreDialogOpen(false),
            }}
          />
        )}

        {compareScoreLoaderOpen && (
          <CompareScoreLoaderDialog
            busy={compareScoreLoaderBusy}
            error={compareScoreLoaderError}
            onCompare={handleLoadScoresToCompare}
            onClose={() => {
              setCompareScoreLoaderError(null);
              setCompareScoreLoaderOpen(false);
            }}
          />
        )}

        {compareView && (
          <div
            className="fixed inset-0 flex items-start justify-center overflow-hidden bg-gray-50"
            style={{ zIndex: 110 }}
            data-testid="checkpoint-compare-modal"
          >
            <div
              className={
                isEmbedMode
                  ? 'flex min-h-0 w-full h-full flex-col gap-4 overflow-hidden bg-white'
                  : 'flex min-h-0 w-full h-full flex-col gap-4 overflow-hidden bg-white p-4'
              }
            >
              {!isEmbedMode && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-gray-800">Compare Scores</div>
                    <div className="text-xs text-gray-500">
                      {compareLeftLabel} vs {compareRightLabel}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {compareView.title === 'Assistant Proposal' && (
                      <AiCompareWorkspaceActions
                        applyBusy={compareSwapBusy || compareEditBusy}
                        feedbackBusy={aiDiffFeedbackBusy}
                        canSendFeedback={canSendDiffFeedback}
                        feedbackLabel={diffFeedbackButtonLabel}
                        onApplyAll={() => void handleAcceptAllAiChanges()}
                        onSendFeedback={() => void handleSendDiffFeedback()}
                      />
                    )}
                    <button
                      type="button"
                      onClick={handleCloseCompareView}
                      className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      {isAiCompareMode ? 'Done - Close' : 'Close'}
                    </button>
                  </div>
                </div>
              )}
              <div
                className={
                  isSystemRowsMode
                    ? 'flex flex-1 flex-col gap-4'
                    : isEmbedMode
                      ? 'flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4'
                      : 'flex min-h-0 flex-1 flex-col gap-4 overflow-auto'
                }
              >
                {isSystemRowsMode ? (
                  <ScannerSystemRows
                    systems={suppliedSystems}
                    regions={suppliedRegions || []}
                    leftXml={compareLeftXml}
                    rightXml={compareRightXml}
                    leftLabel={compareLeftLabel}
                    rightLabel={compareRightLabel}
                    leftEngineId={suppliedCompareLeftEngineId}
                    rightEngineId={suppliedCompareRightEngineId}
                    merged={suppliedMerged}
                    onlyBlockIndex={
                      compareBlockIndex === '' ? undefined : Number(compareBlockIndex)
                    }
                    transport={compareTransport}
                    onMergedScoreChange={setScannerMergedScore}
                    resolveUrl={(relative) =>
                      new URL(relative, new URL(compareRegionsUrl, window.location.href)).toString()
                    }
                  />
                ) : (
                  <>
                    {isAiCompareMode && (
                      <AiCompareWorkspace
                        proposalController={aiProposalController}
                        embedded={isEmbedMode}
                        feedbackBusy={aiDiffFeedbackBusy}
                        globalComment={aiDiffGlobalComment}
                        iteration={aiDiffIteration}
                        feedbackError={aiDiffFeedbackError}
                        onGlobalCommentChange={setAiDiffGlobalComment}
                        onRebase={() => void rebaseAiProposalOntoLive()}
                        rebaseBusy={compareSwapBusy || compareEditBusy}
                      />
                    )}
                    <div
                      className="flex min-w-0 flex-none overflow-x-hidden"
                      style={{ height: '100dvh' }}
                    >
                      <div className="flex min-h-0 min-w-0 flex-1 gap-4">
                        <CompareScorePane
                          model={{
                            side: 'left',
                            label: compareLeftLabel,
                            isCurrent: compareLeftIsCurrent,
                            isActive: compareActiveSide === 'left',
                            embedded: isEmbedMode,
                            scoreAvailable: Boolean(compareLeftScore),
                            editorBusy:
                              compareEditBusy ||
                              compareSwapBusy ||
                              aiDiffFeedbackBusy ||
                              !compareLeftScore,
                            noteInputActive: compareLeftRole
                              ? compareNoteInputByRole[compareLeftRole]
                              : false,
                            zoom: compareEffectiveZoom,
                            wrapperStyle: compareZoomStyle,
                            transport: compareTransport.left,
                            checkpoint: isEmbedMode
                              ? null
                              : { label: compareLeftCheckpointLabel, busy: checkpointBusy },
                            viewportStatus: comparePaneStatus.left,
                            diffHighlights: compareLeftHighlights,
                            positiveDiffStatus: 'new-diff',
                            negativeDiffStatus: null,
                            commentedHighlights: compareCommentedLeftHighlights,
                            threadedHighlights: compareThreadedLeftHighlights,
                            selectionRects: compareLeftSelectionBoxes,
                            noteInputCursor:
                              compareLeftNoteInputCursorVisible && compareLeftNoteInputCursor
                                ? {
                                    rect: compareLeftNoteInputCursor,
                                    color: compareLeftNoteInputCursorColor,
                                  }
                                : null,
                            focusedHighlight: compareFocusedHighlights.left ?? null,
                            measureHitAreaAvailable: Boolean(compareLeftMeasurePositions),
                          }}
                          actions={{
                            activate: () => setCompareActiveSide('left'),
                            openInEditor: isEmbedMode
                              ? () => handleOpenScoreInEditor('left')
                              : null,
                            togglePlayPause: () => void toggleCompareSidePlayPause('left'),
                            stop: () => void stopCompareSideAudio('left', { awaitCancel: true }),
                            setCheckpointLabel: setCompareLeftCheckpointLabel,
                            saveCheckpoint: () => void handleSaveCompareCheckpoint('left'),
                            zoomOut: () =>
                              setCompareZoom((value) =>
                                Math.max(0.2, (value ?? compareEffectiveZoom) - 0.1),
                              ),
                            zoomIn: () =>
                              setCompareZoom((value) =>
                                Math.min(1.5, (value ?? compareEffectiveZoom) + 0.1),
                              ),
                            addBar: () => handleCompareAddBar('left'),
                            toggleNoteInput: () => {
                              setCompareActiveSide('left');
                              toggleCompareNoteInputMode('left');
                            },
                            openPalettes: () => {
                              setCompareActiveSide('left');
                              setPaletteCategory(null);
                              setPalettesOpen(true);
                            },
                            clickScore: (event) => handleComparePaneClick(event, 'left'),
                          }}
                          paneRefs={{
                            scroll: compareLeftScrollRef,
                            wrapper: compareLeftWrapperRef,
                            container: compareLeftContainerRef,
                          }}
                        />
                        <div
                          className={`flex min-h-0 flex-none flex-col items-stretch gap-2 ${isAiCompareMode || isChangeReviewCompareMode ? '' : 'w-44'}`}
                          style={
                            isAiCompareMode || isChangeReviewCompareMode
                              ? { width: `${aiDiffGutterWidth}px` }
                              : undefined
                          }
                        >
                          {isAiCompareMode && (
                            <CompareMeasureComments
                              model={{
                                threads: aiMeasureThreads,
                                focusedAnchor: aiFocusedMeasureAnchor,
                                draft: aiMeasureThreadDraft,
                              }}
                              actions={{
                                focusAnchor: setAiFocusedMeasureAnchor,
                                changeDraft: setAiMeasureThreadDraft,
                                addComment: handleAddAiMeasureComment,
                                removeComment: handleRemoveAiMeasureComment,
                              }}
                            />
                          )}
                          <div
                            ref={compareGutterScrollRef}
                            className="flex min-h-0 w-full flex-1 flex-col gap-3 overflow-x-visible overflow-y-auto rounded border border-gray-200 bg-gray-50 p-2 text-[10px] text-gray-500"
                          >
                            {isChangeReviewCompareMode && changeReviewLoading && (
                              <div className="rounded border border-dashed border-gray-200 bg-white px-2 py-2 text-center text-[10px] text-gray-400">
                                Loading review threads...
                              </div>
                            )}
                            {isChangeReviewCompareMode && changeReviewError && (
                              <div className="rounded border border-rose-200 bg-rose-50 px-2 py-2 text-[10px] text-rose-700">
                                {changeReviewError}
                              </div>
                            )}
                            {isChangeReviewCompareMode && changeReviewActionError && (
                              <div className="rounded border border-rose-200 bg-rose-50 px-2 py-2 text-[10px] text-rose-700">
                                {changeReviewActionError}
                              </div>
                            )}
                            {compareAlignmentLoading && (
                              <div className="rounded border border-dashed border-gray-200 bg-white px-2 py-2 text-center text-[10px] text-gray-400">
                                Aligning measures...
                              </div>
                            )}
                            <CompareDiffGutter
                              mode={{ isAiCompareMode, isChangeReviewCompareMode, isEmbedMode }}
                              panes={{
                                left: {
                                  bounds: compareLeftBounds,
                                  measurePositions: compareLeftMeasurePositions,
                                  parts: compareLeftParts,
                                  score: compareLeftScore,
                                },
                                right: {
                                  bounds: compareRightBounds,
                                  measurePositions: compareRightMeasurePositions,
                                  parts: compareRightPartsDisplay,
                                  score: compareRightScoreDisplay,
                                },
                              }}
                              layout={{
                                partCount: comparePartCount,
                                rowHeight: compareGutterRowHeight,
                                trackHeight: compareGutterTrackHeight,
                                headerSpacerHeight: compareHeaderSpacerHeight,
                                regionRefs: compareGutterRegionRefs,
                                alignmentByPart: compareAlignmentByPart,
                                alignmentLoading: compareAlignmentLoading,
                                signatures: compareSignatures,
                                resolvePartBounds: compareResolvePartBounds,
                              }}
                              diff={{
                                blockContentSignature: aiDiffBlockContentSignature,
                                blockErrors: aiDiffBlockErrors,
                                feedbackBusy: aiDiffFeedbackBusy,
                                bindCommentTextarea: bindAiDiffCommentTextarea,
                                clearBlockError: clearAiDiffBlockError,
                                commitBlockComment: commitAiDiffBlockComment,
                                editBlockComment: editAiDiffBlockComment,
                                onAcceptBlock: handleAcceptAiDiffBlock,
                                onBlockCommentInput: handleAiDiffBlockCommentInput,
                                onCommentResize: handleAiDiffCommentResize,
                                resolveReview: resolveAiDiffReview,
                                setBlockStatus: setAiDiffBlockStatus,
                              }}
                              review={{
                                actionBusy: changeReviewActionBusy,
                                barsForGutter: changeReviewCompareBarsForGutter,
                                detail: changeReviewDetail,
                                focusedAnchorId: changeReviewFocusedAnchorId,
                                loading: changeReviewLoading,
                                newThreadAnchorId: changeReviewNewThreadAnchorId,
                                newThreadContent: changeReviewNewThreadContent,
                                regionsInMeasureOrder: changeReviewRegionsInMeasureOrder,
                                threadsByAnchor: changeReviewThreadsByAnchor,
                                renderThread: renderChangeReviewThread,
                                createThread: createChangeReviewThread,
                                setFocusedAnchorId: setChangeReviewFocusedAnchorId,
                                setNewThreadAnchorId: setChangeReviewNewThreadAnchorId,
                                setNewThreadContent: setChangeReviewNewThreadContent,
                              }}
                              blocks={{
                                buildMismatchBlocks,
                                comments: compareBlockComments,
                                setComments: setCompareBlockComments,
                                focusedKey: compareFocusedBlockKey,
                                setFocusedKey: setCompareFocusedBlockKey,
                                editBusy: compareEditBusy,
                                swapBusy: compareSwapBusy,
                                rightError: compareRightError,
                                onOverwrite: handleCompareOverwriteBlock,
                              }}
                            />
                          </div>
                        </div>
                        <CompareScorePane
                          model={{
                            side: 'right',
                            label: compareRightLabel,
                            isCurrent: compareRightIsCurrent,
                            isActive: compareActiveSide === 'right',
                            embedded: isEmbedMode,
                            scoreAvailable: Boolean(compareRightScoreDisplay),
                            editorBusy:
                              compareEditBusy ||
                              compareSwapBusy ||
                              aiDiffFeedbackBusy ||
                              !compareRightScoreDisplay,
                            noteInputActive: compareRightRole
                              ? compareNoteInputByRole[compareRightRole]
                              : false,
                            zoom: compareEffectiveZoom,
                            wrapperStyle: compareRightZoomStyle,
                            transport: compareTransport.right,
                            checkpoint: isEmbedMode
                              ? null
                              : { label: compareRightCheckpointLabel, busy: checkpointBusy },
                            viewportStatus: comparePaneStatus.right,
                            diffHighlights: compareRightHighlights,
                            positiveDiffStatus: 'new-diff',
                            negativeDiffStatus: 'old-diff',
                            commentedHighlights: compareCommentedRightHighlights,
                            threadedHighlights: compareThreadedRightHighlights,
                            selectionRects: compareRightSelectionBoxes,
                            noteInputCursor:
                              compareRightNoteInputCursorVisible && compareRightNoteInputCursor
                                ? {
                                    rect: compareRightNoteInputCursor,
                                    color: compareRightNoteInputCursorColor,
                                  }
                                : null,
                            focusedHighlight: compareFocusedHighlights.right ?? null,
                            measureHitAreaAvailable: Boolean(compareRightMeasurePositions),
                          }}
                          actions={{
                            activate: () => setCompareActiveSide('right'),
                            openInEditor: isEmbedMode
                              ? () => handleOpenScoreInEditor('right')
                              : null,
                            togglePlayPause: () => void toggleCompareSidePlayPause('right'),
                            stop: () => void stopCompareSideAudio('right', { awaitCancel: true }),
                            setCheckpointLabel: setCompareRightCheckpointLabel,
                            saveCheckpoint: () => void handleSaveCompareCheckpoint('right'),
                            zoomOut: () =>
                              setCompareZoom((value) =>
                                Math.max(0.2, (value ?? compareEffectiveZoom) - 0.1),
                              ),
                            zoomIn: () =>
                              setCompareZoom((value) =>
                                Math.min(1.5, (value ?? compareEffectiveZoom) + 0.1),
                              ),
                            addBar: () => handleCompareAddBar('right'),
                            toggleNoteInput: () => {
                              setCompareActiveSide('right');
                              toggleCompareNoteInputMode('right');
                            },
                            openPalettes: () => {
                              setCompareActiveSide('right');
                              setPaletteCategory(null);
                              setPalettesOpen(true);
                            },
                            clickScore: (event) => handleComparePaneClick(event, 'right'),
                          }}
                          paneRefs={{
                            scroll: compareRightScrollRef,
                            wrapper: compareRightWrapperRef,
                            container: compareRightContainerRef,
                          }}
                        />
                      </div>
                    </div>
                    <XmlDiffView
                      leftLabel={compareLeftLabel}
                      rightLabel={compareRightLabel}
                      leftXml={compareLeftXml}
                      rightXml={compareRightXml}
                    />
                  </>
                )}
              </div>
            </div>
          </div>
        )}
        {isEmbedMode && checkpointBusy && (
          <div
            className="fixed inset-0 flex items-center justify-center bg-white"
            style={{ zIndex: 120 }}
          >
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
