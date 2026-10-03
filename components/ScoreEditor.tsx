'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Score, InputFileFormat, Positions, type InspectorPropertyName, type SelectedElementProperties, type FretDiagramData } from '../lib/webmscore-loader';
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
import { type AiEditProposal } from '../lib/ai-edit-proposal';
import { fetchJsonOrThrow } from '../lib/fetch-json';
import { copySelectionToClipboard, pasteClipboardPayload } from '../lib/selection-clipboard';
import type { MeasureInsertTarget, HeaderTextTarget } from './score-editor/editorProps';
import { noPerf, type PerfHandle } from '../lib/perf-trace';
import { confirmDialog, notifyError, notifyWarning, promptDialog } from './shell/notices';
import { ShellHeader } from './shell/ShellHeader';
import {
  addAmbitus,
  addArpeggio,
  addArticulation,
  addBreath,
  addDynamic,
  addExpressionText,
  addFermata,
  addFiguredBassText,
  addFingeringText,
  addGlissando,
  addGraceNote,
  addHairpin,
  addInstrumentChangeText,
  addJump,
  addLeftHandGuitarFingeringText,
  addLyricText,
  addMarker,
  addMeasureRepeat,
  addNoteFromRest,
  addOttava,
  addPedal,
  addPickup,
  addPitchByStep,
  addRightHandGuitarFingeringText,
  addSlur,
  addSostenutoPedal,
  addStaffText,
  addStickingText,
  addStringNumberText,
  addSystemText,
  addTempoText,
  addTie,
  addTremolo,
  addTrill,
  addTuplet,
  addUnaCorda,
  addVolta,
  applySelectedText,
  deleteSelection,
  durationLonger,
  durationShorter,
  enterRest,
  exportMidi,
  exportMscx,
  exportMscz,
  exportMusicXml,
  exportMxl,
  exportPdf,
  exportSvg,
  flipStem,
  insertMeasures,
  removeContainingMeasures,
  removeTrailingEmptyMeasures,
  runRangeToolOnSelection,
  setAccidental,
  setBarLineType,
  setBeamMode,
  setDurationType,
  setInputAccidental,
  setInputDuration,
  setNoteheadGroup,
  setRepeatCount,
  setVoice,
  splitPedal,
  toggleDot,
  toggleDoubleDot,
  toggleInputDotState,
  toggleLineBreak,
  togglePageBreak,
  toggleRepeatEnd,
  toggleRepeatStart,
  transpose,
  transposeEx,
} from './score-editor/commands';
import { StatusBar } from './shell/StatusBar';
import { useSelectionAnnouncer } from './shell/announcer';
import { WriteToolbar } from './shell/toolbar/WriteToolbar';
import { HistoryToolbar } from './shell/toolbar/HistoryToolbar';
import { CompareToolbar } from './shell/toolbar/CompareToolbar';
import { TransposeDialog } from './toolbar/TransposeDialog';
import type { LeftDockProps } from './shell/LeftDock';
import { EditorWorkspace } from './shell/EditorWorkspace';
import { selectWorkspaceMode } from './shell/selectWorkspaceMode';
import { usePersistedActivity } from './shell/usePersistedActivity';
import { MODE_TRAITS } from './shell/workspaceMode';
import { buildWorkspaceMode, type CompareRenderOptions } from './modes';
import { useShellPanels } from './shell/useShellPanels';
import { useWorkspaceDock } from './shell/useWorkspaceDock';
import type { WorkspaceInsets } from './shell/vendor/viritura';
import { useShellCommands } from './score-editor/useShellCommands';
import { useEditorCommands } from './score-editor/useEditorCommands';
import { ESCAPE_PRIORITY } from './shell/keyboard/escapeLayers';
import { useEscapeLayer } from './shell/keyboard/useEscapeLayer';
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
import { AI_PROVIDER_CONFIGS, DEFAULT_MODEL_BY_PROVIDER, type AiProvider } from '../lib/ai-provider-adapters';
import { resolveAiModelDescriptor, type OptionalAiRequestParameter } from '../lib/ai-model-capabilities';
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
import { buildSourceCanonicalXmlUrl, createSourceBranch, getSourceCanonicalXml, getSourceHistory, type SourceHistoryResponse, type SourceHistoryRevision } from '../lib/ourtextscores-api-client';
import { appendMusicXmlMeasures } from '../lib/musicxml-append-parts';
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
import { type PatchAnnotation } from '../lib/patch-annotations';
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
import { useCompareReflow } from './score-editor/compare/useCompareReflow';
import { useCompareAlignment } from './score-editor/compare/useCompareAlignment';
import { useCompareRightScoreLoading } from './score-editor/compare/useCompareRightScoreLoading';
import { useAiModelList } from './score-editor/ai-tools/useAiModelList';
import { ScoreCanvas } from './score-editor/canvas/ScoreCanvas';
import { ChangeReviewBarOverlay } from './score-editor/canvas/ChangeReviewBarOverlay';
import { DragFeedbackOverlays } from './score-editor/canvas/DragFeedbackOverlays';
import { NoteInputOverlays } from './score-editor/canvas/NoteInputOverlays';
import { GripHandles } from './score-editor/canvas/GripHandles';
import { SelectionOverlays } from './score-editor/canvas/SelectionOverlays';
import { InlineTextEditor } from './score-editor/canvas/InlineTextEditor';
import { ChangeReviewThreadView } from './score-editor/compare/ChangeReviewThreadView';
import { CompareDiffGutter } from './score-editor/compare/CompareDiffGutter';
import {
  ScannerFindingRows,
  type FindingRowsFinding
} from './score-editor/compare/ScannerFindingRows';
import { createCompareScrollSync } from './score-editor/compare/compare-scroll-sync';
import { MmaPanel } from './score-editor/ai-tools/MmaPanel';
import { TranscodaPanel } from './score-editor/ai-tools/TranscodaPanel';
import { FunctionalHarmonyPanel } from './score-editor/ai-tools/FunctionalHarmonyPanel';
import { HarmonyPanel } from './score-editor/ai-tools/HarmonyPanel';
import { NotaGenPanel } from './score-editor/ai-tools/NotaGenPanel';
import { NewScoreDialog } from './score-editor/NewScoreDialog';
import { ChangeReviewScorePanel } from './score-editor/ChangeReviewScorePanel';
import { PngExportDialog } from './score-editor/PngExportDialog';
import { CompareScoreLoaderDialog } from './score-editor/CompareScoreLoaderDialog';
import { loadCompareScoreMusicXml } from '../lib/compare-score-file';
import { GoogleDriveExportDialog } from './score-editor/GoogleDriveExportDialog';
import { ShareLinkDialog } from './score-editor/ShareLinkDialog';
import {
  MusicXmlPanel,
  type MusicXmlPanelProps,
} from './score-editor/MusicXmlPanel';
import type { AiToolsTab } from './score-editor/ai-tools/aiToolsTab';
import { resolveComparePaneStatus } from './score-editor/compare/compare-pane-status';
import { CompareScorePane } from './score-editor/compare/CompareScorePane';
import { ScannerSystemRows, type ScannerSystem } from './score-editor/compare/ScannerSystemRows';
import type { MergedScoreState } from './score-editor/compare/useMergedScoreDocument';
import { XmlDiffView } from './score-editor/XmlDiffView';
import { useAiAssistantController } from './score-editor/useAiAssistantController';
import { type AiImageAttachment, type AiPdfAttachment } from './score-editor/ai-assistant-types';
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
  useCompareEditing,
  useCompareMutationController,
} from './score-editor/compare/useCompareEditing';
import { type CompareScoreRole } from '../lib/compare-user-edit-diff';
import { type NoteInputCursorRect, type SelectionBox, type SelectionFallback } from './score-editor/selection-types';
import { type ApplyXmlToScore, type EditorTelemetryCounters, type EditorTraceContext, type EnsureSoundFontLoaded, type HandleFileUpload, type HandleUrlLoad, type InstrumentTemplateGroup, type PartSummary, type RefreshPageCount, type RenderScore, type StopCompareSideAudio, type SynthBatchIterator } from './score-editor/editor-types';
import { type MutationMethods, hasMutationApi } from './score-editor/mutation-api';
import { type CompareViewState, type PartAlignment } from './score-editor/compare/compare-types';
import { type HarmonyVariant } from './score-editor/ai-assistant-types';
import { TRANSPORT_SYNTH_BATCH_SIZE } from './score-editor/playback-constants';
import { DEFAULT_PAGE_RENDER_TIMEOUT_MS, LARGE_PROGRESSIVE_PAGE_RENDER_TIMEOUT_MS, LARGE_SCORE_INTERACTION_PRIME_DELAY_MS, LAYOUT_MODES, measureInsertTargetMap } from './score-editor/layout-constants';
import { DEFAULT_SELECTION_FILTER_MASK, ELEMENT_SELECTION_SELECTOR, NOTE_INPUT_VOICE_COLORS, SELECTION_FILTER_STORAGE_KEY, hasTextElementClass, isSvgTextElement, normalizeElementClasses, resolveTextElement } from './score-editor/selection-classes';
import { AI_CHAT_SOURCE_RAG_HINT_DISMISSED_STORAGE_KEY, AI_DIFF_COMMENT_GUTTER_PADDING, AI_DIFF_GUTTER_DEFAULT_WIDTH, AI_DIFF_GUTTER_MAX_WIDTH, AI_DIFF_GUTTER_MIN_WIDTH, AI_PDF_ATTACHMENT_MAX_BYTES } from './score-editor/ai-constants';
import { CODE_EDITOR_THEME_STORAGE_KEY, CODE_EDITOR_THEME_VALUES } from './score-editor/music-specialists-constants';
import { aiDiffBlockContentSignature } from './score-editor/ai-prompts';
import { encodeBase64, toOwnedArrayBuffer } from './score-editor/byte-encoding';
import { buildCheckpointTitle, formatBytes, formatTimestamp, toSafeFilename } from './score-editor/checkpoint-labels';
import { buildOtsScoreId, updateUrlScoreId } from './score-editor/score-url';
import { getSvgNaturalSize } from './score-editor/svg-size';
import { errorMessage, scoreLoadErrorMessage } from './score-editor/error-messages';
import { newScoreCommonInstrumentPreferences } from './score-editor/new-score';
import { buildMismatchBlocks } from './score-editor/alignment';
import { getReviewStatusForFeedback } from './score-editor/block-review-status';
import { buildMeasureBounds, getPageMeasureRange, refreshMeasurePositions } from './score-editor/score-measures';
import { decodeXmlData, normalizeXmlData } from './score-editor/musicxml';
import { runWithTimeout } from './score-editor/async-timeout';
import { parsePartsFromMetadata } from './score-editor/part-metadata';
import { downloadBlob } from './score-editor/download-blob';
import { isEditableTarget } from './score-editor/editable-target';
import { summarizeScoreId } from './score-editor/score-id';
import { useNotaGenTool } from './score-editor/ai-tools/useNotaGenTool';
import { useTranscodaTool } from './score-editor/ai-tools/useTranscodaTool';
import { useChordTools } from './score-editor/ai-tools/useChordTools';
import { requestAiTextImpl } from './score-editor/ai-text-request';
import { sendAiChatMessage } from './score-editor/ai-chat';
import { requestAiPatch } from './score-editor/ai-patch-request';
import { useEditorCore, type EditorCoreLateInputs } from './score-editor/core';
import { promptForText } from './score-editor/prompt-for-text';
import { useCanvasGestures, type CanvasGesturesLateInputs } from './score-editor/canvas';
import { comparePaneClick, compareScoreClick, refreshCompareSelectionGeometryImpl, setCompareNoteInputModeImpl } from './score-editor/compare/compare-pane-clicks';
import { acceptAllAiChanges, compareKeyboardShortcut, compareOverwriteBlock, saveCompareCheckpoint } from './score-editor/compare/compare-actions';
import { sendDiffFeedback, updateAiOutputImpl } from './score-editor/ai-diff-feedback';
import { buildNewScoreXmlImpl } from './score-editor/new-score';
import { ensurePageIsLaidOutImpl, goToPageImpl, openScoreSessionImpl, resolveSelectionContextImpl, scheduleBackgroundInitTasksImpl } from './score-editor/score-session';
import { playSelectionPreviewImpl, playTransportAudioImpl } from './score-editor/playback';
import { updateNoteInputShadowImpl } from './score-editor/note-input-shadow';
import { commitCurrentVersion } from './score-editor/versions';


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
  /**
   * Cross-staff findings for one page, reviewed one issue at a time.
   *
   * A findings review has one reading, not two: findings are an engine's own consistency
   * check and arrive on single-engine jobs, where no second engine read the page. So this
   * mode needs `compareLeft` and the regions document, and deliberately does *not* accept
   * `compareRight` -- a second reading here would mean the caller wanted the comparison
   * view and built the wrong URL.
   */
  // Which surface the URL asks for. `selectWorkspaceMode` is the one place that decides it
  // (the precedence among findings, rows, change review and compare lives there, with the
  // reasoning above); the rest of the editor reads the kind or its traits.
  const hostKind = selectWorkspaceMode(searchParams, { compareViewActive: false, activity: 'write' });
  const hostTraits = MODE_TRAITS[hostKind];
  const isSuppliedRegionsMode =
    (Boolean(compareLeftUrl && compareRightUrl) || hostKind === 'host-scanner-findings') &&
    Boolean(compareRegionsUrl);

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
    if (hostTraits.layout !== 'content' || typeof ResizeObserver === 'undefined') return;
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
  }, [hostTraits.layout]);

  const [suppliedFindings, setSuppliedFindings] = useState<FindingRowsFinding[]>([]);

  const isChangeReviewCompareMode = hostKind === 'host-compare' && Boolean(changeReviewId);
  const isChangeReviewMode = isChangeReviewCompareMode || hostKind === 'host-change-review';
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

    const [scoreSessionId, setScoreSessionId] = useState<string | null>(null);
  const [scoreRevision, setScoreRevision] = useState<number>(0);
  const lastSyncedXmlRef = useRef<string>('');
  const lastSyncedRevisionRef = useRef<number>(-1);
  const isSyncingRef = useRef<boolean>(false);
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
      const scoreWrapperRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const changeReviewGutterRef = useRef<HTMLDivElement>(null);
  const MIN_ZOOM = 0.01;
  const MAX_ZOOM = 1.0;
  const clampZoom = (value: number) => Math.min(Math.max(value, MIN_ZOOM), MAX_ZOOM);
  const [loading, setLoading] = useState(false);
            const [hasBackendHighlighting, setHasBackendHighlighting] = useState(false);
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
        const ignoreNextClickRef = useRef(false);
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
    const noteInputDesiredRef = useRef(false);
  const lateInputs = useRef<EditorCoreLateInputs>({
    interactiveMutationEnabled: false,
    playSelectionPreview: async () => undefined as never,
    refreshNoteInputCursor: async () => undefined as never,
  });
  const core = useEditorCore({
    refreshPageCount,
    renderScore,
    lateInputs,
  });
  const {
    blockOverlayRefreshRef,
    clientToEngravingPoint,
    containerRef,
    currentPage,
    currentPageRef,
    ensureSelectionInWasm,
    noteInputActiveRef,
    overlaySuppressed,
    performMutation,
    refreshSelectionOverlay,
    requireMutation,
    resolvePageIndex,
    runSerializedScoreOperation,
    score,
    scoreDirtySinceCheckpoint,
    scoreDirtySinceXml,
    scoreRef,
    scoreSvgForTarget,
    selectedElement,
    selectedElementClasses,
    selectedIndex,
    selectedLayoutBreakSubtype,
    selectedPoint,
    selectionBoxes,
    selectionOverlayGenerationRef,
    selectionProjectionNeededRef,
    setCurrentPage,
    setOverlaySuppressed,
    setScore,
    setScoreDirtySinceCheckpoint,
    setScoreDirtySinceXml,
    setSelectedElement,
    setSelectedElementClasses,
    setSelectedIndex,
    setSelectedLayoutBreakSubtype,
    setSelectedPoint,
    setSelectionBoxes,
    setTextEditorPosition,
    setZoom,
    textEditorPosition,
    zoom,
  } = core;

  useEffect(() => {
    noteInputActiveRef.current = false;
    noteInputDesiredRef.current = false;
    setNoteInputActive(false);
    setNoteInputMethod(1);
    setNoteInputCursorRect(null);
    setNoteInputShadow(null);
  }, [score, noteInputActiveRef]);
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
      const [mutationEnabled, setMutationEnabled] = useState(false);
  const [interactionReady, setInteractionReady] = useState(false);
  const [interactionPreparing, setInteractionPreparing] = useState(false);
  const interactionReadyRef = useRef(interactionReady);
  const interactionPreparingRef = useRef(interactionPreparing);
  const [soundFontLoaded, setSoundFontLoaded] = useState(false);
  const [triedSoundFont, setTriedSoundFont] = useState(false);
  const soundFontLoadedRef = useRef(soundFontLoaded);
  const triedSoundFontRef = useRef(triedSoundFont);
  const soundFontManagerRef = useRef<SoundFontManager<Score> | null>(null);
  if (!soundFontManagerRef.current) soundFontManagerRef.current = new SoundFontManager<Score>();
  const [scoreTitle, setScoreTitle] = useState('');
  const [transposeDialogOpen, setTransposeDialogOpen] = useState(false);
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
  const [activity, setActivity] = usePersistedActivity();
  // The mode on screen: a host surface from the URL, else compare while a session is open,
  // else the selected activity (always Write under ?shell=legacy, which has no activities).
  const kind = selectWorkspaceMode(searchParams, {
    compareViewActive: Boolean(compareView),
    activity,
  });
  const traits = MODE_TRAITS[kind];
  // What the mode lets the user do to the score: History and the scanner views only look.
  const interactiveMutationEnabled =
    mutationEnabled && interactionReady && traits.interaction === 'edit';
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
  const compareLeftContainerRef = useRef<HTMLDivElement>(null);
  const compareRightContainerRef = useRef<HTMLDivElement>(null);
  const compareLeftWrapperRef = useRef<HTMLDivElement>(null);
  const compareRightWrapperRef = useRef<HTMLDivElement>(null);
  const compareLeftScrollRef = useRef<HTMLDivElement>(null);
  const compareRightScrollRef = useRef<HTMLDivElement>(null);
  const compareGutterScrollRef = useRef<HTMLDivElement>(null);
  const compareScrollSyncRef = useRef(false);
  const compareRightRenderInFlightRef = useRef(false);
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
      const [xmlSidebarMode, setXmlSidebarMode] = useState<'closed' | 'open'>('closed');
  // The MusicXML editor is its own right-side sidebar, separate from the AI tools.
  const [musicXmlOpen, setMusicXmlOpen] = useState(false);
  const [xmlSidebarTab, setXmlSidebarTab] = useState<AiToolsTab>('assistant');
  const [codeEditorTheme, setCodeEditorTheme] = useState<CodeEditorThemeMode>('light');
  const [xmlText, setXmlText] = useState('');
  const [xmlDirty, setXmlDirty] = useState(false);
  const [xmlLoading, setXmlLoading] = useState(false);
  const [xmlError, setXmlError] = useState<string | null>(null);
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
                                                                  const [aiChatBusy, setAiChatBusy] = useState(false);
  const aiUnsupportedParametersRef = useRef<Map<string, Set<OptionalAiRequestParameter>>>(
    new Map(),
  );
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
  }, [scoreId, setZoom]);
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
    const selectedPointRef = useRef<{ page: number; x: number; y: number } | null>(selectedPoint);
    const progressivePageLoadInFlightRef = useRef(false);
  const pageNavigationInFlightRef = useRef(false);
  const largeScoreSessionRef = useRef(false);
  const largeSessionXmlAutoloadDeferredLoggedRef = useRef(false);
  const backgroundInitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactionPrimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactionPrimeRunIdRef = useRef(0);
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

    const reportClipboardUnsupported = useCallback(() => {
    notifyError('This build of webmscore does not expose selection copy.');
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

                        useEffect(() => {
    scoreRef.current = score;
    selectionProjectionNeededRef.current = false;
  }, [score, scoreRef, selectionProjectionNeededRef]);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage, currentPageRef]);

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
    if (
      xmlSidebarTab !== 'transcoda' &&
      xmlSidebarTab !== 'multitrack' &&
      xmlSidebarTab !== 'mma' &&
      xmlSidebarTab !== 'harmony' &&
      xmlSidebarTab !== 'functional'
    ) {
      setXmlSidebarTab('transcoda');
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
        // In the same document as the systems they point at, deliberately. Two
        // documents could disagree about `statusVersion`, and a finding pointing at a
        // system from a different revision of the page points somewhere wrong.
        setSuppliedFindings(Array.isArray(body?.findings) ? body.findings : []);
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
    // A findings review has one reading. Requiring both here is what left the embed
    // showing "No score loaded": the mode turned on, the regions arrived, and nothing
    // ever fetched the score they describe.
    if (!compareLeftUrl) return;
    if (!compareRightUrl && hostKind !== 'host-scanner-findings') return;

    const loadExternalCompare = async () => {
      setCheckpointBusy(true);
      try {
        // Load both files in parallel
        const [leftResponse, rightResponse] = await Promise.all([
          fetch(compareLeftUrl),
          compareRightUrl ? fetch(compareRightUrl) : Promise.resolve(null),
        ]);

        if (!leftResponse.ok || (rightResponse && !rightResponse.ok)) {
          throw new Error('Failed to fetch files');
        }

        const leftXml = await leftResponse.text();
        const rightXml = rightResponse ? await rightResponse.text() : '';

        // The score the editor works on. With two readings that is the right-hand one,
        // which the reviewer merges into; with one it is the only one there is.
        const mainXml = rightResponse ? rightXml : leftXml;
        const mainBlob = new Blob([mainXml], { type: 'application/xml' });
        const mainFile = new File([mainBlob], rightResponse ? 'right.xml' : 'reading.xml');
        await handleFileUpload(mainFile, {
          preserveScoreId: false,
          updateUrl: false,
          telemetrySource: rightResponse ? 'compare_load_right' : 'findings_load_reading',
        });

        // Set up compare view
        setCompareView({
          title: leftLabel,
          currentXml: mainXml,
          checkpointXml: leftXml,
          currentLabel: rightResponse ? rightLabel : leftLabel,
          checkpointLabel: leftLabel,
        });
      } catch (err) {
        console.error('Failed to load comparison:', err);
        const message = err instanceof Error ? err.message : 'Unknown error';
        notifyError(`Failed to load files:\n${message}`);
      } finally {
        setCheckpointBusy(false);
      }
    };

    loadExternalCompare();
    // TD-02 classification 3 (one-time initialization). This effect keys on the
    // compare URLs only. handleFileUpload and the setters it closes over would
    // re-run the fetch and replace the live score on every editor state change,
    // discarding user edits. Do not add them.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time initialization keyed on the compare URLs only (see above)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time initialization keyed on the review score URL only (see above)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time initialization: the sessionStorage handoff is consumed once on mount (see above)
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
  }, [score, selectedElementClasses, setSelectedLayoutBreakSubtype]);

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
  }, [score, scoreRef]);

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

  useSelectionAnnouncer(inspectorData);

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
  }, [newScoreInstrumentOptions]);

  const comparePartCount = Math.max(scoreParts.length, compareRightParts.length, 1);
  const compareCheckpointTitle = compareView?.checkpointLabel || compareView?.title || 'Checkpoint';
  const compareCurrentTitle = compareView?.currentLabel || 'Current';
  const compareLeftScore = compareSwapped ? score : compareRightScore;
  const compareRightScoreDisplay = compareSwapped ? compareRightScore : score;
  const compareLeftParts = compareSwapped ? scoreParts : compareRightParts;
  const compareRightPartsDisplay = compareSwapped ? compareRightParts : scoreParts;
  const compareLeftLabel = hostTraits.labelsFromUrl
    ? compareSwapped
      ? rightLabel
      : leftLabel
    : compareSwapped
      ? compareCurrentTitle
      : compareCheckpointTitle;
  const compareRightLabel = hostTraits.labelsFromUrl
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
        hostKind === 'host-change-review'
          ? fetchJsonOrThrow<ChangeReviewScoreView>(
              `/api/proxy/change-reviews/${encodeURIComponent(changeReviewId)}/score-view${changeReviewPatchset ? `?patchset=${encodeURIComponent(changeReviewPatchset)}` : ''}`,
            )
          : fetchJsonOrThrow<ChangeReviewDiff>(
              `/api/proxy/change-reviews/${encodeURIComponent(changeReviewId)}/diff${changeReviewPatchset ? `?patchset=${encodeURIComponent(changeReviewPatchset)}` : ''}`,
            ),
      ]);
      setChangeReviewDetail(detail);
      if (hostKind === 'host-change-review') {
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
  }, [changeReviewId, changeReviewPatchset, hostKind]);
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
      <ChangeReviewThreadView
        thread={thread}
        changeReviewId={changeReviewId}
        canResolve={Boolean(changeReviewDetail?.permissions.canResolve)}
        canReply={Boolean(changeReviewDetail?.permissions.canReply)}
        viewerUserId={changeReviewDetail?.viewerUserId}
        actionBusy={changeReviewActionBusy}
        replyThreadId={changeReviewReplyThreadId}
        replyContent={changeReviewReplyContent}
        setReplyThreadId={setChangeReviewReplyThreadId}
        setReplyContent={setChangeReviewReplyContent}
        runAction={runChangeReviewAction}
      />
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
    [aiDiffCurrentBlocks, resolveAiDiffReview],
  );
  const aiDiffCommentCount = useMemo(
    () =>
      aiDiffCurrentBlocks.filter(
        (block) => getReviewStatusForFeedback(resolveAiDiffReview(block)) === 'comment',
      ).length,
    [aiDiffCurrentBlocks, resolveAiDiffReview],
  );
  const aiDiffPendingCount = useMemo(
    () =>
      aiDiffCurrentBlocks.filter(
        (block) => getReviewStatusForFeedback(resolveAiDiffReview(block)) === 'pending',
      ).length,
    [aiDiffCurrentBlocks, resolveAiDiffReview],
  );
  const aiDiffAcceptedCount = useMemo(
    () =>
      aiDiffReviews.filter((review) => getReviewStatusForFeedback(review) === 'accepted').length,
    [aiDiffReviews],
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

    const handleCompareScoreClick = useCallback((event: React.MouseEvent<HTMLDivElement>, side: 'left' | 'right') => compareScoreClick({
      compareLeftMeasurePositions,
      compareRightMeasurePositions,
      compareLeftWrapperRef,
      compareRightWrapperRef,
      compareEffectiveZoom,
      isChangeReviewCompareMode,
      compareSwapped,
      comparePartCount,
      changeReviewDiff,
      changeReviewFocusedAnchorId,
      compareAlignmentByPart,
      setCompareClickedMeasures,
      setChangeReviewFocusedAnchorId,
      changeReviewThreadsByAnchor,
      changeReviewDetail,
      setChangeReviewNewThreadAnchorId,
      setChangeReviewNewThreadContent,
      compareGutterRegionRefs,
      isAiCompareMode,
      setAiFocusedMeasureAnchor,
      setAiMeasureThreadDraft,
      setCompareFocusedBlockKey,
    }, event, side), [
      compareLeftMeasurePositions,
      compareRightMeasurePositions,
      compareLeftWrapperRef,
      compareRightWrapperRef,
      compareEffectiveZoom,
      isChangeReviewCompareMode,
      isAiCompareMode,
      compareSwapped,
      comparePartCount,
      changeReviewDiff,
      changeReviewFocusedAnchorId,
      changeReviewThreadsByAnchor,
      changeReviewDetail,
      compareAlignmentByPart,
      ]);

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
    const compareLeftBounds = useMemo(
    () => buildMeasureBounds(compareLeftMeasurePositions, compareEffectiveZoom),
    [compareLeftMeasurePositions, compareEffectiveZoom],
  );
  const compareRightBounds = useMemo(
    () => buildMeasureBounds(compareRightMeasurePositions, compareEffectiveZoom),
    [compareRightMeasurePositions, compareEffectiveZoom],
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
    if (hostKind !== 'host-change-review' || !score) {
      setChangeReviewMeasurePositions(null);
      return;
    }
    void refreshMeasurePositions(score, setChangeReviewMeasurePositions);
  }, [currentPage, hostKind, score, scoreRevision]);
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

    const buildNewScoreXml = (options: {
    title: string;
    composer: string;
    instruments: { id: string; name: string }[];
    measures: number;
    keyFifths: number;
    timeNumerator: number;
    timeDenominator: number;
    pickup?: { numerator: number; denominator: number };
  }) => buildNewScoreXmlImpl({
      resolveInstrumentClefs,
    }, options);

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
    [runSerializedScoreOperation],
  );

  const getScoreXmlData = useCallback(async () => {
    const activeScore = scoreRef.current ?? score;
    if (!activeScore?.saveXml) {
      notifyError('This build of webmscore does not expose "saveXml".');
      return null;
    }
    const data = await runSerializedScoreOperation(() => activeScore.saveXml!(), 'saveXml');
    return await normalizeXmlData(data);
  }, [score, runSerializedScoreOperation, scoreRef]);

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
  }, [score, getScoreXmlData, setScoreDirtySinceXml]);

  /** After an AI tool applies its output: show the resulting MusicXML in the Score Source panel. */
  const revealScoreSource = () => {
    setPanelsVisible(true);
    setMusicXmlOpen(true);
    void loadXmlFromScore();
  };

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
  }, [xmlText, getScoreXmlData, setScoreDirtySinceXml]);

  const openScoreSession = useCallback((xml?: string) => openScoreSessionImpl({
      isSyncingRef,
      scoreSessionId,
      scoreRevision,
      resolveXmlContext,
      lastSyncedXmlRef,
      lastSyncedRevisionRef,
      activeLaunchContext,
      setScoreSessionId,
      setScoreRevision,
    }, xml), [activeLaunchContext, resolveXmlContext, scoreSessionId, scoreRevision]);

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

      const ensureCheckpointBeforeApply = async () => {
    if (!isIndexedDbAvailable()) {
      notifyWarning('IndexedDB is not available; cannot verify checkpoint status.');
      return { ok: false, currentXml: '' };
    }
    const currentData = await getScoreXmlData();
    if (!currentData) {
      notifyError('Unable to read MusicXML for checkpointing.');
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
      notifyWarning('Load a score before applying XML edits.');
      return false;
    }
    if (!sourceXml.trim()) {
      notifyWarning('XML content is empty.');
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
      runSerializedScoreOperation, setScoreDirtySinceCheckpoint,
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

  useAiModelList({ aiEnabled, setAiModels, setAiModelDescriptors, setAiModelsError, setAiModelsLoading, aiApiKey, useLlmProxy, proxyUrlFor, aiProvider, isEmbedBuild, llmProxyBase, setAiModel });

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
      setInteractionState, currentPageRef, scoreRef,
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
  }, [score, runSerializedScoreOperation, containerRef, currentPageRef, scoreRef]);

  const resolveSelectionContext = useCallback(() => resolveSelectionContextImpl({
      selectedPointRef,
      selectedElementClasses,
      selectionBoxes,
      selectedElement,
      selectedIndex,
      currentPageRef,
      scoreRef,
      score,
      runSerializedScoreOperation,
    }), [
    score,
    selectedElement,
    selectedElementClasses,
    selectedIndex,
    selectionBoxes,
    runSerializedScoreOperation, currentPageRef, scoreRef,
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
    }, [score, runSerializedScoreOperation, currentPageRef, scoreRef]);

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
  }, [score, runSerializedScoreOperation, scoreRef]);

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
      score, scoreRef,
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

  const scheduleBackgroundInitTasks = (loadedScore: Score, options: {
      format: InputFileFormat;
      inputByteLength: number;
      isLargeInput: boolean;
      progressivePaging: boolean;
      createInitialCheckpoint?: boolean;
      checkpointScoreId?: string;
      logStage?: (stage: string, extra?: unknown) => void;
    }) => scheduleBackgroundInitTasksImpl({
      clearScheduledBackgroundInit,
      scoreRef,
      backgroundInitTimerRef,
      interactionPreparingRef,
      pageNavigationInFlightRef,
      progressivePageLoadInFlightRef,
      refreshScoreMetadata,
      refreshInstrumentTemplates,
      ensureSoundFontLoaded,
      createInitialLoadCheckpoint,
      prefetchSoundFontBytes,
    }, loadedScore, options);

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
        notifyError(scoreLoadErrorMessage(err));
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
      notifyError(scoreLoadErrorMessage(err));
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

  const ensurePageIsLaidOut = (targetScore: Score, targetPage: number): Promise<boolean> => ensurePageIsLaidOutImpl({
      pageCount,
      progressivePageLoadInFlightRef,
      runSerializedScoreOperation,
      setPageCount,
      requestLayoutProgress,
      setProgressiveHasMorePages,
    }, targetScore, targetPage);

  renderScoreRef.current = async (
    currentScore,
    pageIndex,
    highlightSelection = true,
    perf: PerfHandle = noPerf,
  ) => {
    if (!currentScore || !containerRef.current) return false;

    try {
      const targetPage = typeof pageIndex === 'number' ? pageIndex : currentPage;
      const timeoutMs =
        largeScoreSessionRef.current && progressivePagingActive
          ? LARGE_PROGRESSIVE_PAGE_RENDER_TIMEOUT_MS
          : DEFAULT_PAGE_RENDER_TIMEOUT_MS;
      // The round trip includes the worker's layout-free SVG write, the byte transfer and the
      // UTF-8 decode on this thread.
      const svgData = await perf.time('saveSvg', () =>
        runWithTimeout(
          runSerializedScoreOperation(
            () => currentScore.saveSvg(targetPage, true, highlightSelection),
            `saveSvg(page=${targetPage + 1})`,
          ),
          timeoutMs,
          `Render page ${targetPage + 1}`,
        ),
      );
      if (svgData) {
        const clean = await perf.time('sanitize', () => sanitizeEngineSvg(svgData));
        await perf.time('innerHTML', () => {
          containerRef.current!.innerHTML = clean;
        });
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

  const refreshCompareSelectionGeometry = useCallback((targetScore: Score, role: CompareScoreRole, side: CompareSide, selected?: boolean, isCurrent?: () => boolean) => refreshCompareSelectionGeometryImpl({
      setCompareSelection,
      runSerializedScoreOperation,
      compareLeftContainerRef,
      compareRightContainerRef,
      getCompareTargetPage,
      compareEffectiveZoom,
      compareContinuousMode,
    }, targetScore, role, side, selected, isCurrent), [
      compareContinuousMode,
      compareEffectiveZoom,
      getCompareTargetPage,
      runSerializedScoreOperation,
      setCompareSelection,
    ]);

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
    [getCompareTargetPage, renderScoreToContainer, syncCompareSvgSize],
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
      setAiProposalApplyError, setScoreDirtySinceCheckpoint, setScoreDirtySinceXml,
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
    [refreshPageCount, currentPageRef],
  );
  const reportCompareMutationError = useCallback((label: string, error: unknown) => {
    console.error(`Compare mutation "${label}" failed:`, error);
    notifyError(`Unable to ${label} in the compare score. Check the console for details.`);
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

  const setCompareNoteInputMode = useCallback((enabled: boolean, side: CompareSide = compareActiveSide ?? 'left') => setCompareNoteInputModeImpl({
      compareScoreForSide,
      isCompareEditBusy,
      compareSwapBusy,
      aiDiffFeedbackBusy,
      invalidateCompareOperations,
      setCompareActiveSide,
      getCompareScoreRole,
      requestCompareNoteInput,
      trackCompareOperation,
      runSerializedScoreOperation,
      isCompareGenerationCurrent,
      rollbackCompareNoteInputRequest,
      commitCompareNoteInput,
      refreshCompareNoteInputCursor,
      setCompareNoteInputCursor,
    }, enabled, side), [
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
    ]);

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
            notifyError('This build of webmscore does not expose "insertMeasures".');
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
          notifyError(`This build of webmscore does not expose "${methodName}".`);
          return false;
        }
        return (fn as (...values: unknown[]) => unknown).apply(targetScore, args);
      });
    },
    [performCompareMutation],
  );

  const handleComparePaneClick = useCallback((event: React.MouseEvent<HTMLDivElement>, side: 'left' | 'right') => comparePaneClick({
      compareLeftScore,
      compareRightScoreDisplay,
      compareLeftMeasurePositions,
      compareRightMeasurePositions,
      compareLeftWrapperRef,
      compareRightWrapperRef,
      setCompareActiveSide,
      isCompareEditBusy,
      compareSwapBusy,
      aiDiffFeedbackBusy,
      getCompareScoreRole,
      compareEffectiveZoom,
      getCompareTargetPage,
      compareContinuousMode,
      isCompareNoteInputCommitted,
      performCompareMutation,
      setCompareHasSelection,
      handleCompareScoreClick,
      compareHasSelectionByRole,
      invalidateCompareOperations,
      trackCompareOperation,
      runSerializedScoreOperation,
      isCompareGenerationCurrent,
      renderEditedCompareScore,
      refreshCompareSelectionGeometry,
    }, event, side), [
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
    ]);

  const handleCompareOverwriteBlock = useCallback((sourceScore: Score | null, targetScore: Score | null, partIndex: number, pairs: Array<{ leftIndex: number; rightIndex: number }>): Promise<boolean> => compareOverwriteBlock({
      compareSwapBusy,
      isCompareEditBusy,
      hasPendingCompareOperations,
      setCompareSwapBusy,
      compareView,
      score,
      getScoreMusicXmlText,
      scoreRef,
      setAiProposalApplyError,
      setAiError,
      verifyAiProposalCurrent,
      aiScoreBridge,
      recordAiProposalAppliedXml,
      invalidateAiProposalExpectedCurrent,
      setCompareView,
      setCompareAlignmentRevision,
    }, sourceScore, targetScore, partIndex, pairs), [
      aiScoreBridge,
      compareSwapBusy,
      score,
      compareView,
      getScoreMusicXmlText,
      hasPendingCompareOperations,
      isCompareEditBusy,
      invalidateAiProposalExpectedCurrent,
      recordAiProposalAppliedXml,
      setAiError,
      setAiProposalApplyError,
      verifyAiProposalCurrent, scoreRef,
    ]);

  const handleAcceptAllAiChanges = useCallback(() => acceptAllAiChanges({
      compareView,
      score,
      compareSwapBusy,
      isCompareEditBusy,
      hasPendingCompareOperations,
      setCompareSwapBusy,
      aiScoreBridge,
      setAiProposalApplyError,
      setAiError,
      verifyAiProposalCurrent,
      recordAiProposalAppliedXml,
      setCompareView,
      setCompareAlignmentRevision,
      invalidateAiProposalExpectedCurrent,
    }), [
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
    setAiProposalApplyError, scoreRef,
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

  const handleSendDiffFeedback = useCallback(() => sendDiffFeedback({
      compareView,
      isAiCompareMode,
      aiBusy,
      aiDiffFeedbackBusy,
      isCompareEditBusy,
      hasPendingCompareOperations,
      aiApiKey,
      aiProvider,
      aiModel,
      aiDiffReviews,
      aiDiffCurrentBlocks,
      resolveAiDiffReview,
      aiMeasureThreads,
      aiScoreBridge,
      setAiError,
      setAiDiffFeedbackError,
      setCompareRightError,
      getScoreMusicXmlText,
      compareRightScore,
      compareEditedRoles,
      getCompareEditBaseline,
      aiDiffGlobalComment,
      snapshotAiProposalContinuity,
      captureCompareEditCycle,
      beginAiEdit,
      setAiPatchError,
      setXmlSidebarTab,
      setXmlSidebarMode,
      invalidateCompareOperations,
      setCompareView,
      setCompareRightLoading,
      getAiProposalSession,
      aiDiffIteration,
      aiPrompt,
      aiIncludeChat,
      setAiProposalSession,
      getAiProposalExpectedHashes,
      aiEditEffort,
      aiMaxTokensMode,
      aiMaxTokens,
      aiTemperatureMode,
      aiTemperature,
      aiChatMessages,
      captureApiTraceContext,
      updateAiEditProgress,
      setAiOutput,
      setAiPatch,
      setAiPatchedXml,
      setAiBaseXml,
      clearCompareEditCycle,
      setCompareSwapped,
      captureAiProposal,
      setAiDiffIteration,
      setAiDiffReviews,
      setAiDiffGlobalComment,
      setAiDiffBlockErrors,
      setAiProposalAudit,
      mergeAiAnnotations,
      setCompareAlignmentRevision,
      restoreCompareEditCycle,
      restoreAiProposalContinuity,
      finishAiEdit,
    }), [
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
    ]);

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
      notifyError('SoundFont loading is not available in this build.');
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
      notifyError(`Failed to load soundfont: ${err instanceof Error ? err.message : String(err)}`);
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
      notifyWarning('Select at least one instrument.');
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
      notifyError('Failed to open version. See console for details.');
    } finally {
      setLoading(false);
    }
  };

  const handleVersionsDiffRevision = useCallback(
    async (revision: SourceHistoryRevision) => {
      if (!otsSourceContext || !score) {
        notifyWarning('Load a score before opening a version diff.');
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
      notifyWarning('Enter a branch name first.');
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

  const handleVersionsCommitCurrent = useCallback(() => commitCurrentVersion({
      otsSourceContext,
      score,
      setVersionsActionBusy,
      setVersionsActionError,
      setVersionsActionNotice,
      getScoreXmlData,
      versionsBranchName,
      sourceHistory,
      activeLaunchContext,
      scoreTitle,
      versionsCommitMessage,
      setRuntimeLaunchContext,
      setVersionsCommitMessage,
      setVersionsBranchName,
      refreshSourceHistory,
    }), [
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
      notifyWarning('Load a score before saving a checkpoint.');
      return;
    }
    if (!isIndexedDbAvailable()) {
      notifyWarning('IndexedDB is not available in this browser.');
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
      notifyError('Failed to save checkpoint. See console for details.');
    } finally {
      setCheckpointBusy(false);
    }
  };

  const handleSaveCompareCheckpoint = useCallback((side: 'left' | 'right') => saveCompareCheckpoint({
      compareView,
      compareLeftIsCurrent,
      compareRightIsCurrent,
      compareLeftCheckpointLabel,
      compareRightCheckpointLabel,
      compareLeftLabel,
      compareRightLabel,
      setCheckpointBusy,
      getScoreXmlData,
      getScoreMusicXmlText,
      compareRightScore,
      ensureScoreId,
      buildCheckpointMetadata,
      activeLaunchContext,
      versionsBranchName,
      loadCheckpointList,
      setCompareLeftCheckpointLabel,
      setCompareRightCheckpointLabel,
    }, side), [
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
      versionsBranchName,
      loadCheckpointList, activeLaunchContext,
    ]);

  const handleRestoreCheckpoint = async (checkpoint: CheckpointSummary) => {
    if (!isIndexedDbAvailable()) {
      notifyWarning('IndexedDB is not available in this browser.');
      return;
    }
    const ok = await confirmDialog({
      title: `Restore checkpoint "${checkpoint.title}"?`,
      message: 'Unsaved changes will be lost.',
      confirmLabel: 'Restore',
    });
    if (!ok) {
      return;
    }
    setCheckpointBusy(true);
    try {
      const record = await getCheckpoint(checkpoint.id);
      if (!record) {
        notifyError('Checkpoint not found.');
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
      notifyError('Failed to restore checkpoint. See console for details.');
    } finally {
      setCheckpointBusy(false);
    }
  };

  const handleCompareCheckpoint = async (checkpoint: CheckpointSummary) => {
    if (!score) {
      notifyWarning('Load a score before comparing checkpoints.');
      return;
    }
    if (!isIndexedDbAvailable()) {
      notifyWarning('IndexedDB is not available in this browser.');
      return;
    }
    setCheckpointBusy(true);
    try {
      const record = await getCheckpoint(checkpoint.id);
      if (!record) {
        notifyError('Checkpoint not found.');
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
      notifyError('Failed to compare checkpoint. See console for details.');
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

  useCompareRightScoreLoading({ compareView, invalidateCompareOperations, stopCompareSideAudio, compareRightScoreRef, queueCompareScoreTeardown, scoreRef, compareLoadedCheckpointXmlRef, setCompareRightScore, setCompareRightParts, setCompareRightPageCount, setCompareRightLoading, setCompareRightError, setCompareFitZoom, setCompareZoom, setCompareActiveSide, resetCompareEditing, setPalettesOpen, setPaletteCategory, setCompareLeftSvgSize, setCompareRightSvgSize, setCompareLeftMeasurePositions, setCompareRightMeasurePositions, setCompareSignatures, setCompareSwapped, setCompareLeftCheckpointLabel, setCompareRightCheckpointLabel, aiDiffFeedbackBusy, setAiDiffReviews, setAiMeasureThreads, setAiFocusedMeasureAnchor, setAiMeasureThreadDraft, setAiDiffIteration, setAiDiffGlobalComment, setAiDiffFeedbackError, setAiDiffBlockErrors, clearAiProposal, setAiDiffGutterWidth, resetCompareEditingRole, runSerializedScoreOperation });

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
    compareRightScoreDisplay, currentPageRef,
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

  useCompareReflow({ compareView, score, compareReflowMode, compareLeftScore, compareRightScoreDisplay, compareRightScore, compareSupportsReflow, compareContinuousMode, currentPageRef, renderScoreToContainer, compareLeftContainerRef, syncCompareSvgSize, setCompareLeftSvgSize, setCompareLeftMeasurePositions, compareRightContainerRef, setCompareRightSvgSize, setCompareRightMeasurePositions, setCompareRightError, compareAlignments, comparePartCount });

  useCompareAlignment({ compareView, isSuppliedRegionsMode, setCompareAlignments, setCompareAlignmentLoading, setCompareSignatures, compareLeftXml, compareRightXml, compareLeftScore, compareRightScoreDisplay, compareLeftParts, compareRightPartsDisplay, compareAlignmentRevision });

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
      notifyWarning('Load a score before refreshing MusicXML.');
      return;
    }
    if (xmlDirty) {
      const ok = await confirmDialog({
        title: 'Discard local MusicXML edits and reload from the score?',
        confirmLabel: 'Discard',
        destructive: true,
      });
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
      notifyError('Failed to apply MusicXML edits. See console for details.');
    } finally {
      setXmlLoading(false);
    }
  };

  const handleDeleteCheckpoint = async (checkpoint: CheckpointSummary) => {
    if (!isIndexedDbAvailable()) {
      notifyWarning('IndexedDB is not available in this browser.');
      return;
    }
    const ok = await confirmDialog({
      title: `Delete checkpoint "${checkpoint.title}"?`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) {
      return;
    }
    setCheckpointBusy(true);
    try {
      await deleteCheckpoint(checkpoint.id);
      await loadCheckpointList();
    } catch (err) {
      console.error('Failed to delete checkpoint', err);
      notifyError('Failed to delete checkpoint. See console for details.');
    } finally {
      setCheckpointBusy(false);
    }
  };

  const handleRenameCheckpoint = async (checkpoint: CheckpointSummary) => {
    if (!isIndexedDbAvailable()) {
      notifyWarning('IndexedDB is not available in this browser.');
      return;
    }
    const nextTitle = (
      await promptDialog({ title: 'Rename checkpoint', defaultValue: checkpoint.title })
    )?.trim();
    if (!nextTitle || nextTitle === checkpoint.title) {
      return;
    }
    setCheckpointBusy(true);
    try {
      await renameCheckpoint(checkpoint.id, nextTitle);
      await loadCheckpointList();
    } catch (err) {
      console.error('Failed to rename checkpoint', err);
      notifyError('Failed to rename checkpoint. See console for details.');
    } finally {
      setCheckpointBusy(false);
    }
  };

  const requestAiText = (payload: {
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
  }) => requestAiTextImpl({
      aiUnsupportedParametersRef,
      setAiTemperatureMode,
      setAiMaxTokensMode,
      aiModelDescriptors,
      useLlmProxy,
      activeLaunchContext,
      proxyUrlFor,
      captureApiTraceContext,
      isEmbedBuild,
      llmProxyBase,
    }, payload);

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

  const updateAiOutput = useCallback((nextText: string, baseXmlOverride?: string): Promise<{
      ok: boolean;
      baseXml: string;
      proposedXml: string;
      error: string;
      annotations: PatchAnnotation[];
    }> => updateAiOutputImpl({
      setAiOutput,
      setAiPatch,
      setAiPatchError,
      setAiPatchedXml,
      setAiLastAnnotations,
      aiBaseXml,
      aiScoreBridge,
    }, nextText, baseXmlOverride), [
      aiBaseXml,
      aiScoreBridge,
      setAiOutput,
      setAiPatch,
      setAiPatchError,
      setAiPatchedXml,
    ]);

  const handleAiRequest = () => requestAiPatch({
      aiEnabled,
      aiBusy,
      aiDiffFeedbackBusy,
      aiApiKey,
      aiProvider,
      aiPrompt,
      aiModel,
      aiMaxTokensMode,
      aiMaxTokens,
      beginAiEdit,
      aiDeepEdit,
      setAiError,
      setAiOutput,
      setAiPatch,
      setAiPatchError,
      setAiPatchedXml,
      clearAiProposal,
      aiScoreBridge,
      xmlText,
      aiIncludeXml,
      aiIncludePdf,
      aiIncludePage,
      currentPageRef,
      aiIncludeSelection,
      aiIncludeChat,
      aiChatMessages,
      aiIncludeRenderedImage,
      setAiBaseXml,
      telemetryCountersRef,
      aiEditEffort,
      aiTemperatureMode,
      aiTemperature,
      captureApiTraceContext,
      updateAiEditProgress,
      setAiLastAnnotations,
      openAiProposalCompare,
      mergeAiAnnotations,
      setAiProposalSession,
      setAiProposalAudit,
      finishAiEdit,
      emitEditorTelemetry,
    });

  const handleAiChatSend = () => sendAiChatMessage({
      aiEnabled,
      aiApiKey,
      aiProvider,
      aiModel,
      aiChatInput,
      aiMaxTokensMode,
      aiMaxTokens,
      aiChatMessages,
      setAiChatBusy,
      setAiError,
      aiIncludeXml,
      aiScoreBridge,
      aiIncludePdf,
      aiIncludePage,
      currentPageRef,
      aiIncludeSelection,
      aiIncludeChat,
      aiIncludeRenderedImage,
      setAiChatInput,
      setAiChatMessages,
      telemetryCountersRef,
      requestAiText,
      aiTemperatureMode,
      aiTemperature,
      emitEditorTelemetry,
    });

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

                                                const handleApplyAiOutput = async () => {
    if (!aiPatchedXml.trim()) {
      notifyError(aiPatchError || 'AI patch has not produced valid MusicXML.');
      return;
    }
    const baseXml = aiBaseXml.trim() || (await aiScoreBridge.getContextXml()).trim();
    if (!baseXml) {
      notifyError('Unable to load MusicXML for diff review.');
      return;
    }
    const opened = openAiProposalCompare(baseXml, aiPatchedXml);
    if (!opened) {
      notifyError('Unable to open compare view for AI proposal.');
      return;
    }
    // openAiProposalCompare resets threads; seed the last patch's annotations after it.
    mergeAiAnnotations(aiLastAnnotations);
  };

    const projectSelectionInWasmIfNeeded = async () => {
    if (selectionProjectionNeededRef.current) {
      await ensureSelectionInWasm();
    }
  };

      const goToPage = (targetPage: number) => goToPageImpl({
      score,
      pageNavigationInFlightRef,
      currentPageRef,
      pageCount,
      largeScoreSessionRef,
      progressivePagingActive,
      progressiveHasMorePages,
      ensurePageIsLaidOut,
      runSerializedScoreOperation,
      setPageCount,
      setCurrentPage,
      renderScore,
      refreshSelectionOverlay,
      selectedIndex,
      selectedPoint,
    }, targetPage);

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

  const handleDeleteSelection = () => deleteSelection(core);
  const handleSelectedTextChange = (value: string) => {
    setSelectedTextValue(value);
  };
  const applySelectedTextValue = (value: string) => applySelectedText(core, value);
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
      { skipWasmReselect: true, playSelectionPreview: true, incrementalLayout: true },
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
      { skipWasmReselect: true, playSelectionPreview: true, incrementalLayout: true },
    );
  const handleTranspose = (semitones: number) => transpose(core, semitones);
  const handleTransposeEx = (mode: number, direction: number, key: number, interval: number, trKeys: boolean, trChordNames: boolean, useDoubleSharpsFlats: boolean) => transposeEx(core, mode, direction, key, interval, trKeys, trChordNames, useDoubleSharpsFlats);
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
  const handleInsertMeasures = (count: number, target: MeasureInsertTarget) => insertMeasures(core, count, target);
  const handleAddPickup = (numerator: number, denominator: number) => addPickup(core, numerator, denominator);
  // Deletes the measures the current selection sits in. ensureSelectionInWasm is
  // required because the engine resolves the measure range from its own selection
  // state, which a UI-side selection has not necessarily reached yet.
  const handleRemoveContainingMeasures = () => removeContainingMeasures(core);
  const handleRemoveTrailingEmptyMeasures = () => removeTrailingEmptyMeasures(core);
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
  const handleSetAccidental = (accidentalType: number) => setAccidental(core, accidentalType);
  const handleDurationLonger = () => durationLonger(core);
  const handleDurationShorter = () => durationShorter(core);

  const handleToggleDot = () => toggleDot(core);

  const handleToggleDoubleDot = () => toggleDoubleDot(core);

  const handleSetDurationType = (durationType: number) => setDurationType(core, durationType);

  const handleAddPitchByStep = (noteIndex: number, addToChord: boolean) => addPitchByStep(core, noteIndex, addToChord);

  const handleEnterRest = () => enterRest(core);

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
  const handleSetInputDuration = (durationType: number) => setInputDuration(core, durationType);

  const handleToggleInputDotState = () => toggleInputDotState(core);

  const handleSetInputAccidental = (accidentalType: number) => setInputAccidental(core, accidentalType);

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

  const handleToggleLineBreak = () => toggleLineBreak(core);

  const handleTogglePageBreak = () => togglePageBreak(core);

  // Delete on a selected line or page break removes the break, as it does in MuseScore.
  const handleDeleteOrBreak = () =>
    selectedLayoutBreakSubtype === 'line'
      ? handleToggleLineBreak()
      : selectedLayoutBreakSubtype === 'page'
        ? handleTogglePageBreak()
        : handleDeleteSelection();

  const handleSetVoice = (voiceIndex: number) => setVoice(core, voiceIndex);

  const handleSetNoteheadGroup = (noteheadGroup: number) => setNoteheadGroup(core, noteheadGroup);

  const handleSetBeamMode = (beamMode: number) => setBeamMode(core, beamMode);

  const handleAddDynamic = (dynamicType: number) => addDynamic(core, dynamicType);

  const handleAddHairpin = (hairpinType: number) => addHairpin(core, hairpinType);

  const handleAddFermata = (fermataVariant: number) => addFermata(core, fermataVariant);

  const handleAddBreath = (breathType: number) => addBreath(core, breathType);

  const handleAddArpeggio = (arpeggioType: number) => addArpeggio(core, arpeggioType);

  const handleAddTremolo = (tremoloType: number) => addTremolo(core, tremoloType);

  const handleAddOttava = (ottavaType: number) => addOttava(core, ottavaType);

  const handleAddTrill = (trillType: number) => addTrill(core, trillType);

  const handleAddGlissando = (glissandoType: number) => addGlissando(core, glissandoType);

  const handleAddPedal = (pedalVariant: number) => addPedal(core, pedalVariant);

  const handleAddSostenutoPedal = () => addSostenutoPedal(core);

  const handleAddUnaCorda = () => addUnaCorda(core);

  const handleSplitPedal = () => splitPedal(core);

  const handleAddTempoText = (bpm: number) => addTempoText(core, bpm);

  const handleAddArticulation = (articulationSymbolName: string) => addArticulation(core, articulationSymbolName);

  const handleAddFretDiagram = async (pattern: string) => {
    await performMutation(
      'add fretboard diagram',
      async () => {
        await ensureSelectionInWasm();
        const fn = requireMutation('addFretDiagram');
        if (!fn) return false;
        return fn(pattern);
      },
      { skipWasmReselect: true, skipSelectionFallback: true, incrementalLayout: true },
    );
    await refreshInspector();
  };

  const handleAddAmbitus = () => addAmbitus(core);

  const runRangeTool = (label: string, method:
      'explodeSelection' | 'implodeSelection' | 'regroupSelection' | 'resequenceRehearsalMarks') => runRangeToolOnSelection(core, label, method);

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

  const handleAddSlur = () => addSlur(core);

  const handleFlipStem = () => flipStem(core);

  const handleAddTie = () => addTie(core);

  const handleAddGraceNote = (graceType: number) => addGraceNote(core, graceType);

  const handleAddTuplet = (tupletCount: number) => addTuplet(core, tupletCount);

  const handleAddStaffText = () => addStaffText(core);

  const handleAddSystemText = () => addSystemText(core);

  const handleAddExpressionText = () => addExpressionText(core);

  const handleAddLyricText = () => addLyricText(core);

  const harmonyLabels: Record<HarmonyVariant, string> = {
    0: 'Chord symbol',
    1: 'Roman numeral',
    2: 'Nashville number',
  };

  const handleAddHarmonyText = async (variant: HarmonyVariant) => {
    const label = harmonyLabels[variant];
    const text = await promptForText(`${label} text:`);
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

  const handleAddFingeringText = () => addFingeringText(core);

  const handleAddLeftHandGuitarFingeringText = () => addLeftHandGuitarFingeringText(core);

  const handleAddRightHandGuitarFingeringText = () => addRightHandGuitarFingeringText(core);

  const handleAddStringNumberText = () => addStringNumberText(core);

  const handleAddInstrumentChangeText = () => addInstrumentChangeText(core);

  const handleAddStickingText = () => addStickingText(core);

  const handleAddFiguredBassText = () => addFiguredBassText(core);

  const handleAddNoteFromRest = () => addNoteFromRest(core);

  const handleToggleRepeatStart = () => toggleRepeatStart(core);

  const handleToggleRepeatEnd = () => toggleRepeatEnd(core);

  const handleSetRepeatCount = (count: number) => setRepeatCount(core, count);

  const handleSetBarLineType = (barLineType: number) => setBarLineType(core, barLineType);

  const handleAddVolta = (endingNumber: number) => addVolta(core, endingNumber);

  const handleAddMarker = (markerType: number) => addMarker(core, markerType);

  const handleAddJump = (jumpType: number) => addJump(core, jumpType);

  const handleAddMeasureRepeat = (numMeasures: number) => addMeasureRepeat(core, numMeasures);

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
  const handleOpenHeaderEditor = async (target: HeaderTextTarget) => {
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
    const text = await promptForText(label, value);
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
      onEmpty: () => notifyWarning('Nothing copied yet.'),
    });
    return performMutation('paste selection', () => pastePromise, { skipWasmReselect: true });
  };

  const handleCompareKeyboardShortcut = useCallback((event: KeyboardEvent) => compareKeyboardShortcut({
      queueCompareKeyboardOperation,
      performCompareMutation,
      compareActiveScore,
      runSerializedScoreOperation,
      compareView,
      compareActiveSide,
      compareActiveRole,
      compareHasSelectionByRole,
      isCompareNoteInputCommitted,
      copyCompareSelection,
      clipboardRef,
      setCompareNoteInputMode,
      toggleCompareNoteInputMode,
      setCompareHasSelection,
    }, event), [
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
    ]);

    // Editing keys in the main score go through the keyboard router (components/shell/keyboard).
  // Only a compare session still has its own table, until it moves onto the same commands.
  keyboardShortcutHandlerRef.current = (event: KeyboardEvent) => {
    if (event.defaultPrevented || !score || !compareView || isEditableTarget(event.target)) {
      return;
    }
    handleCompareKeyboardShortcut(event);
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
      notifyError('Unable to set time signature. See console for details.');
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
      notifyError('Unable to set key signature. See console for details.');
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
      notifyError('Unable to set clef. See console for details.');
    } finally {
      setAudioBusy(false);
    }
  };

    const handleExportSvg = () => exportSvg(core);

  const handleExportPdf = () => exportPdf(core);

  const handleExportPng = async () => {
    if (!score || !score.savePng) {
      notifyError('PNG export is not available in this build.');
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
      notifyError('PNG export is not available in this build.');
      return;
    }
    const requestedPage = Number(pngExportPageInput);
    if (!Number.isFinite(requestedPage)) {
      notifyWarning('Enter a valid page number.');
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
      notifyError(err instanceof Error ? err.message : 'Unable to export PNG. See console for details.');
    } finally {
      setPngExportBusy(false);
    }
  };

  const handleExportMxl = () => exportMxl(core);

  const handleExportMscz = () => exportMscz(core);

  const handleExportToGoogleDrive = async () => {
    if (!score || !score.saveMsc) {
      notifyError('MSCZ export is not available in this build.');
      return;
    }
    try {
      const mscz = await score.saveMsc('mscz');
      downloadBlob(mscz, 'score.mscz', 'application/vnd.musescore.mscz');
      setGoogleDriveExportDialogOpen(true);
    } catch (err) {
      console.error('Failed to export score for Google Drive', err);
      notifyError('Unable to export the score. See console for details.');
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

  const handleExportMscx = () => exportMscx(core);

  const handleExportMusicXml = () => exportMusicXml(core);

  const handleExportAbc = async () => {
    if (!score || !score.saveXml) {
      notifyError('ABC export is not available in this build.');
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
      notifyError('Unable to export ABC. See console for details.');
    }
  };

  const handleExportMidi = () => exportMidi(core);

  const handleExportAudio = async () => {
    if (!score || !score.saveAudio) {
      notifyError('Audio export is not available in this build.');
      return;
    }
    try {
      setAudioBusy(true);
      const ok = await ensureSoundFontLoaded(undefined, { forceRetry: true });
      if (!ok) {
        notifyError(
          'No default soundfont found. Configure NEXT_PUBLIC_SOUNDFONT_CDN_URL or provide /public/soundfonts/default.sf3 (or .sf2).',
        );
        return;
      }
      const wav = await score.saveAudio('wav');
      downloadBlob(wav, 'score.wav', 'audio/wav');
    } catch (err) {
      console.error('Failed to export audio', err);
      notifyError('Unable to export audio. See console for details.');
    } finally {
      setAudioBusy(false);
    }
  };

    const handleExportCurrentPageAudio = async () => {
    if (!score || !score.saveAudioForMeasureRange) {
      notifyError('Current-page audio export is not available in this build.');
      return;
    }
    try {
      setAudioBusy(true);
      const ok = await ensureSoundFontLoaded(undefined, { forceRetry: true });
      if (!ok) {
        notifyError(
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
      notifyError(
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

  const playTransportAudio = (fromSelection: boolean) => playTransportAudioImpl({
      score,
      setAudioBusy,
      ensureSoundFontLoaded,
      stopAudio,
      playSynthBatchStream,
      audioSourcesRef,
      streamIteratorRef,
      transportPlaybackGenerationRef,
      audioUrlRef,
      playFromUrl,
    }, fromSelection);

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
    reportUnavailable: () => notifyError('Audio playback is not available for this score.'),
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
      notifyError(
        'No default soundfont found. Configure NEXT_PUBLIC_SOUNDFONT_CDN_URL or provide /public/soundfonts/default.sf3 (or .sf2).',
      ),
    reportPlaybackError: (side, error) => {
      console.error(`Failed to play ${side} compare audio`, error);
      notifyError('Unable to play audio. See console for details.');
    },
    trackOperation: trackCompareOperation,
  });
  const toggleCompareSidePlayPause = compareTransport.toggleSidePlayPause;
  stopCompareSideAudioRef.current = compareTransport.stopSideAudio;

  const playSelectionPreview = (trigger: string = 'unknown', selectionPoint?: { page: number; x: number; y: number }, options?: { reselect?: boolean }) => playSelectionPreviewImpl({
      scoreRef,
      score,
      interactionReady,
      isPlaying,
      audioBusy,
      selectedPointRef,
      containerRef,
      clientToEngravingPoint,
      zoom,
      ensureSoundFontLoaded,
      stopPreviewAudio,
      playSynthBatchStream,
      previewAudioSourcesRef,
      previewStreamIteratorRef,
      previewPlaybackGenerationRef,
    }, trigger, selectionPoint, options);

  lateInputs.current = { interactiveMutationEnabled, playSelectionPreview, refreshNoteInputCursor };

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

    const gestureLateInputs = useRef<CanvasGesturesLateInputs>({ updateNoteInputShadow: async () => undefined as never, refreshScoreSpatium: async () => undefined as never, clearEditorSelection: async () => undefined as never });
  const {
    beginGripEditAtPoint,
    closeGripEdit,
    dragPointerIdRef,
    dragSelectionRect,
    gripEdit,
    handleGripPointerDown,
    handleScoreClick,
    handleScoreMouseDown,
    handleScoreMouseMove,
    handleScoreMouseUp,
    handleScorePointerCancel,
    handleScorePointerDown,
    handleScorePointerMove,
    handleScorePointerUp,
    noteDragGhost,
  } = useCanvasGestures({
    core,
    clientToScorePoint,
    ignoreNextClickRef,
    refreshPageCount,
    renderScore,
    scheduleSelectionOverlayRefresh,
    playSelectionPreview,
    scoreSpatiumRef,
    engravingToOverlayPoint,
    refreshSelectionFromSvg,
    interactionReady,
    interactiveMutationEnabled,
    handlePutNoteAtPoint,
    setHasBackendHighlighting,
    selectionInFlightRef,
    gestureLateInputs,
  });

  useEscapeLayer(Boolean(gripEdit), ESCAPE_PRIORITY.gripEdit, () => closeGripEdit(false));

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

    const updateNoteInputShadow = (clientX: number, clientY: number, target: Element | null) => updateNoteInputShadowImpl({
      noteInputActiveRef,
      containerRef,
      setNoteInputShadow,
      clientToScorePoint,
      resolvePageIndex,
      zoom,
      scoreSpatiumRef,
    }, clientX, clientY, target);

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

                            useEscapeLayer(noteInputActive, ESCAPE_PRIORITY.noteInput, () => void setNoteInputMode(false));

  /** Clears the selection in the UI and the engine (a click on nothing, or Escape). */
  const clearEditorSelection = () => {
    if (!score) return;
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

  gestureLateInputs.current = { updateNoteInputShadow, refreshScoreSpatium, clearEditorSelection };

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

  const panels = useShellPanels();
  const dock = useWorkspaceDock({
    enabled: traits.chrome === 'full',
    compareView: Boolean(compareView),
    floatingOpen: palettesOpen,
    setFloatingOpen: setPalettesOpen,
    setCategory: setPaletteCategory,
  });
  useShellCommands({
    dock: traits.chrome === 'full' ? dock : null,
    activity, setActivity, compareOpen: Boolean(compareView), closeCompare: handleCloseCompareView,
    score, aiEnabled, pageCount, currentPage, goToPage,
    goToNextPage: handleNextPage, goToPreviousPage: handlePrevPage,
    inspectorOpen, setInspectorOpen, musicXmlOpen, setMusicXmlOpen,
    aiToolsOpen: aiToolsSidebarOpen, setAiTool: setXmlSidebarTab, setPanelsVisible,
    setAiToolsOpen: (open) => setXmlSidebarMode(open ? 'open' : 'closed'),
    saveCheckpoint: handleSaveCheckpoint, copySelection: handleCopySelection,
    pasteSelection: handlePasteSelection, scoreSummaries, openScoreFromSummary: handleOpenScoreFromSummary,
    zoom, isPlaying, isPaused, audioBusy, interactionPreparing, dirty: scoreDirtySinceCheckpoint,
    checkpointCount: checkpoints.length, progressiveLoadEnabled,
    pageCountIsFloor: progressivePagingActive && progressiveHasMorePages,
    toggleProgressiveLoad: () => setProgressiveLoadEnabled((prev) => !prev),
  });
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

  // The mode's interaction policy decides what the canvas does with the pointer: `edit` has it
  // all, `review` hands clicks to the review gutter, `readonly` keeps selection only.
  const canEditScore = traits.interaction === 'edit';
  const reviewsScore = traits.interaction === 'review';
  const growsToContent = traits.layout === 'content';
  const renderCanvas = (insets: WorkspaceInsets) => (
    <ScoreCanvas
      scrollContainerRef={scrollContainerRef}
      scoreWrapperRef={scoreWrapperRef}
      containerRef={containerRef}
      onScrollTop={
        reviewsScore
          ? (scrollTop) => {
              if (changeReviewGutterRef.current) {
                changeReviewGutterRef.current.scrollTop = scrollTop;
              }
            }
          : null
      }
      insets={insets}
      growsToContent={growsToContent}
      hiddenUnderRows={growsToContent && Boolean(compareView)}
      loading={loading}
      hasScore={Boolean(score)}
      zoom={zoom}
      noteInputActive={noteInputActive}
      paletteDropActive={paletteDropActive}
      onWrapperClick={
        reviewsScore
          ? () => {
              setChangeReviewFocusedAnchorId(null);
              setChangeReviewNewThreadAnchorId(null);
              setChangeReviewNewThreadContent('');
            }
          : handleScoreClick
      }
      editing={
        canEditScore
          ? {
              onDoubleClick: handleScoreDoubleClick,
              onPointerDown: handleScorePointerDown,
              onPointerMove: handleScorePointerMove,
              onPointerUp: handleScorePointerUp,
              onPointerCancel: handleScorePointerCancel,
              onPointerLeave: () => {
                if (noteInputActiveRef.current && dragPointerIdRef.current === null) {
                  setNoteInputShadow(null);
                }
              },
              onMouseDown: handleScoreMouseDown,
              onMouseMove: handleScoreMouseMove,
              onMouseUp: handleScoreMouseUp,
              onContextMenu: handleScoreContextMenu,
              onDragOver: handlePaletteDragOver,
              onDragLeave: handlePaletteDragLeave,
              onDrop: handlePaletteDrop,
            }
          : null
      }
    >
      {reviewsScore && (
        <ChangeReviewBarOverlay
          boxes={changeReviewBarBoxes}
          focusedAnchorId={changeReviewFocusedAnchorId}
          anchorsWithThreads={changeReviewThreadsByAnchor}
          canAddThread={Boolean(changeReviewDetail?.permissions.canAddThread)}
          setFocusedAnchorId={setChangeReviewFocusedAnchorId}
          setNewThreadAnchorId={setChangeReviewNewThreadAnchorId}
          setNewThreadContent={setChangeReviewNewThreadContent}
        />
      )}
      <DragFeedbackOverlays selectionRect={dragSelectionRect} noteGhost={noteDragGhost} />
      <NoteInputOverlays
        active={noteInputActive}
        currentPage={currentPage}
        cursorRect={noteInputCursorRect}
        cursorColor={noteInputCursorColor}
        shadow={noteInputShadow}
      />
      <GripHandles
        gripEdit={gripEdit}
        currentPage={currentPage}
        zoom={zoom}
        engravingToOverlayPoint={engravingToOverlayPoint}
        onGripPointerDown={handleGripPointerDown}
      />
      <SelectionOverlays
        secondaryBoxes={secondarySelectionBoxes}
        selectionBoxes={selectionBoxes}
        primaryRect={primarySelectionRect}
        hasBackendHighlighting={hasBackendHighlighting}
        overlaySuppressed={overlaySuppressed}
      />
      {textEditorRect && (
        <InlineTextEditor
          rect={textEditorRect}
          zoom={zoom}
          contentRef={inlineTextContentRef}
          editedRef={inlineTextEditedRef}
          selectedTextValue={selectedTextValue}
          onChange={handleSelectedTextChange}
          onApply={applySelectedTextValue}
          onClose={closeTextEditor}
        />
      )}
    </ScoreCanvas>
  );

  const notaGen = useNotaGenTool({
    postScoreEditorJson,
    telemetryCountersRef,
    captureApiTraceContext,
    emitEditorTelemetry,
    setXmlLoading,
    setXmlError,
    score,
    handleFileUpload,
    applyXmlToScore,
    revealScoreSource,
    aiEnabled,
    xmlSidebarTab,
    codeEditorTheme,
  });

  const transcoda = useTranscodaTool({
    postScoreEditorJson,
    emitEditorTelemetry,
    score,
    setXmlLoading,
    setXmlError,
    handleFileUpload,
    applyXmlToScore,
    resolveXmlContext,
    revealScoreSource,
    xmlLoading,
  });

  const chordTools = useChordTools({
    postScoreEditorJson,
    setXmlSidebarTab,
    resolveXmlContext,
    setXmlLoading,
    setXmlError,
    score,
    scoreTitle,
    handleFileUpload,
    applyXmlToScore,
    revealScoreSource,
    codeEditorTheme,
  });

  const renderAiToolsBody = () => (
    <>
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
                    <NotaGenPanel {...notaGen.panel}
                    />
                  )}
                  {xmlSidebarTab === 'transcoda' && (
                    <TranscodaPanel {...transcoda.panel}
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
                          revealScoreSource();
                        } finally {
                          setXmlLoading(false);
                        }
                      }}
                    />
                  )}
                  {xmlSidebarTab === 'mma' && (
                    <MmaPanel {...chordTools.mmaPanel}
                    />
                  )}
                  {xmlSidebarTab === 'harmony' && (
                    <HarmonyPanel {...chordTools.harmonyPanel}
                    />
                  )}
                  {xmlSidebarTab === 'functional' && (
                    <FunctionalHarmonyPanel {...chordTools.functionalHarmonyPanel}
                    />
                  )}
                  {xmlError && <div className="mt-2 text-xs text-red-600">{xmlError}</div>}
    </>
  );

  const inspectorProps: LeftDockProps['inspector'] = {
    data: inspectorData,
    loading: inspectorLoading,
    disabled: !interactiveMutationEnabled || !score?.setSelectedElementProperty,
    onChange: (property, value) => {
      void handleSetInspectorProperty(property, value);
    },
    fretDiagram: fretDiagramData,
    onFretDiagramChange: (diagram) => {
      void handleSetFretDiagram(diagram);
    },
  };

  const musicXmlPanelProps: MusicXmlPanelProps = {
    text: xmlText,
    setText: setXmlText,
    setDirty: setXmlDirty,
    scoreLoaded: Boolean(score),
    layout: {
      editorHeight: xmlEditorHeight,
      editorMaxHeight: xmlEditorMaxHeight,
    },
    permissions: {
      applyEnabled: xmlApplyEnabled,
      applyDisabled: xmlApplyDisabled,
      reloadEnabled: xmlReloadEnabled,
      controlsDisabled: xmlControlsDisabled,
    },
    theme: {
      mode: codeEditorTheme,
      setMode: setCodeEditorTheme,
    },
    actions: {
      apply: () => void handleApplyXmlEdits(),
      refresh: () => void handleRefreshXml(),
      close: () => setMusicXmlOpen(false),
    },
  };

  const renderHistory = () => (
    <LeftSidebar
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
  );

  const renderCompare = ({ variant, placement, hosted, grows }: CompareRenderOptions) => (
    <>
        {compareView && (
          /*
                        A modal everywhere but rows mode, where it is the page.

                        `fixed inset-0` takes this out of flow, so it adds
                        nothing to `document.body.scrollHeight` -- and that is
                        the height reported to the host. The frame was therefore
                        sized to whatever was left in flow behind it: the
                        ordinary editor canvas, holding a whole engraved page at
                        the current zoom. Measured at 4314px of frame around
                        390px of rows, and the mismatch runs the other way just
                        as easily, where `inset-0` plus `overflow-hidden` clips
                        the rows to a frame too short for them with nothing able
                        to scroll to the rest.

                        In rows mode it is an ordinary block instead: its height
                        is its content, the content's height is the document's,
                        and the host sizes the frame to that -- which is what
                        the growable chain above was built for.
                    */
          <div
            className={
              // Both row views grow with their content and let the host scroll. Left on
              // `(variant === 'rows')`, the findings view fell into the fixed, clipped branch
              // and reported a viewport-sized height for a 7,000px document.
              grows
                ? 'relative w-full bg-slate-50'
                : placement === 'inline'
                  ? 'absolute bottom-0 right-0 top-0 flex items-start justify-center overflow-hidden bg-slate-50'
                  : 'fixed inset-0 flex items-start justify-center overflow-hidden bg-slate-50'
            }
            style={
              placement === 'inline'
                ? { left: 'var(--shell-activity-w, 44px)', zIndex: 'var(--ots-z-panel)' }
                : { zIndex: 'var(--ots-z-header)' }
            }
            data-testid="checkpoint-compare-modal"
          >
            <div
              className={
                grows
                  ? 'flex w-full flex-col gap-4 bg-white'
                  : hosted
                    ? 'flex min-h-0 w-full h-full flex-col gap-4 overflow-hidden bg-white'
                    : 'flex min-h-0 w-full h-full flex-col gap-4 overflow-hidden bg-white p-4'
              }
            >
              <div
                className={
                  grows
                    ? 'flex flex-1 flex-col gap-4'
                    : hosted
                      ? 'flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4'
                      : 'flex min-h-0 flex-1 flex-col gap-4 overflow-auto'
                }
              >
                {(variant === 'findings') ? (
                  <ScannerFindingRows
                    systems={suppliedSystems}
                    findings={suppliedFindings}
                    xml={compareLeftXml}
                    label={compareLeftLabel}
                    engineId={suppliedCompareLeftEngineId || ''}
                    merged={suppliedMerged}
                    onMergedScoreChange={setScannerMergedScore}
                    resolveUrl={(relative) =>
                      new URL(relative, new URL(compareRegionsUrl, window.location.href)).toString()
                    }
                  />
                ) : (variant === 'rows') ? (
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
                        embedded={hosted}
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
                            embedded: hosted,
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
                            checkpoint: hosted
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
                            openInEditor: hosted
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
                            className="flex min-h-0 w-full flex-1 flex-col gap-3 overflow-x-visible overflow-y-auto rounded border border-slate-200 bg-slate-50 p-2 text-caption text-slate-500"
                          >
                            {isChangeReviewCompareMode && changeReviewLoading && (
                              <div className="rounded border border-dashed border-slate-200 bg-white px-2 py-2 text-center text-caption text-slate-500">
                                Loading review threads...
                              </div>
                            )}
                            {isChangeReviewCompareMode && changeReviewError && (
                              <div className="rounded border border-rose-200 bg-rose-50 px-2 py-2 text-caption text-rose-700">
                                {changeReviewError}
                              </div>
                            )}
                            {isChangeReviewCompareMode && changeReviewActionError && (
                              <div className="rounded border border-rose-200 bg-rose-50 px-2 py-2 text-caption text-rose-700">
                                {changeReviewActionError}
                              </div>
                            )}
                            {compareAlignmentLoading && (
                              <div className="rounded border border-dashed border-slate-200 bg-white px-2 py-2 text-center text-caption text-slate-500">
                                Aligning measures...
                              </div>
                            )}
                            <CompareDiffGutter
                              mode={{ isAiCompareMode, isChangeReviewCompareMode, hosted }}
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
                            embedded: hosted,
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
                            checkpoint: hosted
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
                            openInEditor: hosted
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
    </>
  );

  // The kind of selection, for command gates. `selectionBoxes` cannot say: a range draws one
  // rectangle per system, so one box is a single note or a one-system range. Ask the engine.
  const [selectionKind, setSelectionKind] = useState<'single' | 'list' | 'range'>('single');
  const hasSelection = Boolean(selectedElement) || selectionBoxes.length > 0 || Boolean(selectedPoint);
  useEffect(() => {
    if (!hasSelection) return;
    let cancelled = false;
    void (async () => {
      let kind: 'single' | 'list' | 'range' = selectionBoxes.length > 1 ? 'list' : 'single';
      try {
        if (score?.isSelectionRange && (await score.isSelectionRange())) kind = 'range';
      } catch {
        // A build without the export keeps the box-count guess.
      }
      if (!cancelled) setSelectionKind(kind);
    })();
    return () => {
      cancelled = true;
    };
  }, [hasSelection, score, scoreRevision, selectedElement, selectedPoint, selectionBoxes]);

  useEditorCommands({
    onNewScore: handleOpenNewScoreDialog,
    onFileUpload: handleLoadScoreUpload,
    onLoadScoresToCompare: handleOpenCompareScoreLoader,
    onSoundFontUpload: handleSoundFontUpload,
    onOpenHeaderEditor: score?.setTitleText ? handleOpenHeaderEditor : undefined,
    onZoomIn: handleZoomIn,
    onZoomOut: handleZoomOut,
    zoomLevel: zoom,
    onFitWidth: handleFitWidth,
    onFitHeight: handleFitHeight,
    onSetZoom: handleSetZoom,
    onDeleteSelection: handleDeleteOrBreak,
    onClearSelection: clearEditorSelection,
    onRelayoutScore: () => performMutation('relayout score', async () => true, { skipWasmReselect: true }),
    onSelectAll: handleSelectAll,
    onUndo: handleUndo,
    onRedo: handleRedo,
    onPitchUp: handlePitchUp,
    onPitchDown: handlePitchDown,
    onTranspose: handleTranspose,
    onTransposeEx: handleTransposeEx,
    onSetAccidental: noteInputActive ? handleSetInputAccidental : handleSetAccidental,
    onDurationLonger: handleDurationLonger,
    onDurationShorter: handleDurationShorter,
    mutationsEnabled: interactiveMutationEnabled,
    selectionActive: hasSelection,
    selectionKind,
    workspaceKind: kind,
    onExportSvg: handleExportSvg,
    onExportPdf: handleExportPdf,
    onExportPng: handleExportPng,
    onExportMxl: handleExportMxl,
    onExportMscz: handleExportMscz,
    onExportMscx: handleExportMscx,
    onExportMusicXml: handleExportMusicXml,
    onExportAbc: handleExportAbc,
    onExportMidi: handleExportMidi,
    onExportAudio: handleExportAudio,
    onExportCurrentPageAudio: 
      score?.saveAudioForMeasureRange ? handleExportCurrentPageAudio : undefined
    ,
    onExportToGoogleDrive: handleExportToGoogleDrive,
    onCreateShareableLink: handleOpenShareLinkDialog,
    onTogglePlayPause: () => {
      void handleTogglePlayPause();
    },
    onStopAudio: () => {
      void stopAudio({ awaitCancel: true });
    },
    onPlayFromSelectionAudio: interactionReady ? handlePlayFromSelectionAudio : undefined,
    isPlaying,
    isPaused,
    audioBusy,
    exportsEnabled: Boolean(score),
    pngAvailable: Boolean(score?.savePng),
    audioAvailable: Boolean(score?.saveAudio),
    onSetTimeSignature: handleSetTimeSignature,
    onSetKeySignature: handleSetKeySignature,
    onSetClef: handleSetClef,
    onToggleDot: noteInputActive ? handleToggleInputDotState : handleToggleDot,
    onToggleDoubleDot: noteInputActive ? undefined : handleToggleDoubleDot,
    onSetDurationType: noteInputActive ? handleSetInputDuration : handleSetDurationType,
    onToggleLineBreak: handleToggleLineBreak,
    onTogglePageBreak: handleTogglePageBreak,
    onSetVoice: noteInputActive ? handleSetInputVoice : handleSetVoice,
    onAddDynamic: handleAddDynamic,
    onAddHairpin: handleAddHairpin,
    onAddOttava: handleAddOttava,
    onAddTrill: handleAddTrill,
    onAddGlissando: handleAddGlissando,
    onAddFermata: handleAddFermata,
    onAddBreath: handleAddBreath,
    onAddArpeggio: handleAddArpeggio,
    onAddTremolo: handleAddTremolo,
    onAddPedal: handleAddPedal,
    onAddSostenutoPedal: handleAddSostenutoPedal,
    onAddUnaCorda: handleAddUnaCorda,
    onSplitPedal: handleSplitPedal,
    onAddTempoText: handleAddTempoText,
    onAddStaffText: handleAddStaffText,
    onAddSystemText: handleAddSystemText,
    onAddExpressionText: handleAddExpressionText,
    onAddLyricText: handleAddLyricText,
    onAddHarmonyText: handleAddHarmonyText,
    onAddFingeringText: handleAddFingeringText,
    onAddLeftHandGuitarFingeringText: handleAddLeftHandGuitarFingeringText,
    onAddRightHandGuitarFingeringText: handleAddRightHandGuitarFingeringText,
    onAddStringNumberText: handleAddStringNumberText,
    onAddInstrumentChangeText: handleAddInstrumentChangeText,
    onAddStickingText: handleAddStickingText,
    onAddFiguredBassText: handleAddFiguredBassText,
    onAddArticulation: handleAddArticulation,
    onAddSlur: handleAddSlur,
    onFlipStem: handleFlipStem,
    onAddTie: handleAddTie,
    onAddGraceNote: handleAddGraceNote,
    onToggleNoteInput: toggleNoteInputMode,
    onAddPitchByStep: handleAddPitchByStep,
    onEnterRest: handleEnterRest,
    onSelectNextChord: handleSelectNextChord,
    onSelectPrevChord: handleSelectPrevChord,
    onExtendSelectionNextChord: handleExtendSelectionNextChord,
    onExtendSelectionPrevChord: handleExtendSelectionPrevChord,
    onExtendSelectionNextMeasure: handleExtendSelectionNextMeasure,
    onExtendSelectionPrevMeasure: handleExtendSelectionPrevMeasure,
    onExtendSelectionStaffAbove: handleExtendSelectionStaffAbove,
    onExtendSelectionStaffBelow: handleExtendSelectionStaffBelow,
    noteInputActive,
    noteInputMethod,
    onSetNoteInputMethod: handleSetNoteInputMethod,
    onAddTuplet: handleAddTuplet,
    onAddNoteFromRest: handleAddNoteFromRest,
    onToggleRepeatStart: handleToggleRepeatStart,
    onToggleRepeatEnd: handleToggleRepeatEnd,
    onSetRepeatCount: handleSetRepeatCount,
    onSetBarLineType: handleSetBarLineType,
    onAddVolta: handleAddVolta,
    onAddMarker: handleAddMarker,
    onAddJump: handleAddJump,
    onSetBeamMode: handleSetBeamMode,
    onAddFretDiagram: handleAddFretDiagram,
    onAddAmbitus: handleAddAmbitus,
    onExplodeSelection: () => {
      void runRangeTool('explode selection', 'explodeSelection');
    },
    onImplodeSelection: () => {
      void runRangeTool('implode selection', 'implodeSelection');
    },
    onRegroupSelection: () => {
      void runRangeTool('regroup rhythms', 'regroupSelection');
    },
    onResequenceRehearsalMarks: () => {
      void runRangeTool('resequence rehearsal marks', 'resequenceRehearsalMarks');
    },
    onTogglePalettes: dock.togglePalettes,
    onOpenPalette: dock.openPalette,
    palettesOpen: dock.palettesVisible,
    onTogglePanels: () => setPanelsVisible((visible) => !visible),
    panelsVisible,
    selectionFilterMask,
    onSetSelectionFilterBit: handleSetSelectionFilterBit,
    onAddMeasureRepeat: handleAddMeasureRepeat,
    multiMeasureRestsEnabled,
    onSetMultiMeasureRests: handleSetMultiMeasureRests,
    onInsertMeasures: handleInsertMeasures,
    onAddPickup: handleAddPickup,
    onRemoveContainingMeasures: handleRemoveContainingMeasures,
    onRemoveTrailingEmptyMeasures: handleRemoveTrailingEmptyMeasures,
    insertMeasuresDisabled: !score?.insertMeasures,
    parts: scoreParts,
    instrumentGroups,
    onAddPart: handleAddPart,
    onRemovePart: handleRemovePart,
    onTogglePartVisible: handleTogglePartVisible,
    selectedTextActive: textSelectionActive,
    onApplySelectedText: handleApplySelectedText,
    selectedTextDisabled: selectedTextControlDisabled,
    onOpenTransposeDialog: () => setTransposeDialogOpen(true),
  });

  const mode = buildWorkspaceMode(kind, {
    nodes: {
      header: <ShellHeader title={scoreTitle} dirty={scoreDirtySinceCheckpoint} />,
      writeToolbar: <WriteToolbar noteInputMethod={noteInputMethod} />,
      historyToolbar: <HistoryToolbar />,
      compareToolbar: compareView ? (
        <CompareToolbar
          leftLabel={compareLeftLabel}
          rightLabel={compareRightLabel}
          actions={
            compareView.title === 'Assistant Proposal' ? (
              <AiCompareWorkspaceActions
                applyBusy={compareSwapBusy || compareEditBusy}
                feedbackBusy={aiDiffFeedbackBusy}
                canSendFeedback={canSendDiffFeedback}
                feedbackLabel={diffFeedbackButtonLabel}
                onApplyAll={() => void handleAcceptAllAiChanges()}
                onSendFeedback={() => void handleSendDiffFeedback()}
              />
            ) : null
          }
          closeLabel={isAiCompareMode ? 'Done - Close' : 'Close'}
          onClose={handleCloseCompareView}
        />
      ) : null,
      floatingPalettes: palettesOpen ? (
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
          onDock={!compareView ? () => dock.setPoppedOut(false) : undefined}
          category={paletteCategory}
        />
      ) : null,
      statusBar: <StatusBar />,
      canvas: renderCanvas,
      changeReviewPanel: (
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

      ),
      write: {
        dock,
        widths: panels,
        panelsVisible,
        onShowPanels: () => setPanelsVisible(true),
        left: {
          palettes: {
            disabled:
              !interactiveMutationEnabled ||
              (!selectedElement && selectionBoxes.length === 0 && !selectedPoint),
            dragEnabled: Boolean(interactiveMutationEnabled && score?.applyDropAtPoint),
            onApply: handleApplyFloatingPaletteItem,
            category: paletteCategory,
            onShowAll: () => setPaletteCategory(null),
          },
          instruments: { parts: scoreParts, groups: instrumentGroups },
          inspector: inspectorProps,
        },
        ai: {
          open: aiToolsSidebarOpen,
          tool: xmlSidebarTab,
          onToolChange: setXmlSidebarTab,
          aiEnabled,
          loading: xmlLoading,
          onClose: () => setXmlSidebarMode('closed'),
          body: renderAiToolsBody(),
        },
        source: {
          open: musicXmlOpen,
          onClose: () => setMusicXmlOpen(false),
          content: <MusicXmlPanel embedded {...musicXmlPanelProps} />,
        },
      },
      historyContent: renderHistory(),
      historyWidth: panels.history,
      dialogs: (
        <>
        {handleTransposeEx && (
          <TransposeDialog
            open={transposeDialogOpen}
            onOpenChange={setTransposeDialogOpen}
            onTranspose={handleTransposeEx}
          />
        )}
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

        </>
      ),
      compare: renderCompare,
      hostBusy: (
        <>
        {checkpointBusy && (
          <div
            className="fixed inset-0 flex items-center justify-center bg-white"
            style={{ zIndex: 'var(--ots-z-float)' }}
          >
            <div className="text-center">
              <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-ink-muted"></div>
              <p className="text-sm text-slate-600">Loading comparison...</p>
            </div>
          </div>
        )}
        </>
      ),
    },
  });

  return <EditorWorkspace mode={mode} />;
}
