export type InputFileFormat =
  | 'mscz'
  | 'mscx'
  | 'mxl'
  | 'musicxml'
  | 'xml'
  | 'midi'
  | 'kar'
  | 'gtp'
  | 'gp3'
  | 'gp4'
  | 'gp5'
  | 'gpx'
  | 'gp'
  | 'ptb';

/** One part's vertical extent within one laid-out system, in page coordinates. */
export interface StaffSystemBand {
  page: number;
  system: number;
  partIndex: number;
  y: number;
  height: number;
}

/** A measure MuseScore considers irregular, and by how much. */
export interface IrregularMeasure {
  index: number;
  number: string;
  /** First short measure: displayed as pickup measure 0, not a one-based bar. */
  pickup?: boolean;
  /** `n/d`, the length the measure actually holds. */
  actual: string;
  /** `n/d`, the time signature in force there. */
  nominal: string;
  irregular: boolean;
}

export interface Positions {
  elements: Array<{
    id: number;
    x: number;
    y: number;
    sx: number;
    sy: number;
    width?: number;
    height?: number;
    page: number;
  }>;
  events: Array<{
    elid: number;
    position: number;
  }>;
  pageSize: {
    height: number;
    width: number;
  };
}

export interface PlaybackTimelineOccurrence {
  occurrenceIndex: number;
  measureIndex: number;
  startMs: number;
  endMs: number;
}

export interface PlaybackTimeline {
  schemaVersion: 1;
  durationMs: number;
  renderDurationMs: number;
  occurrences: PlaybackTimelineOccurrence[];
}

export interface GripEditInfo {
  page: number;
  grips: Array<{
    index: number;
    x: number;
    y: number;
    draggable: boolean;
  }>;
}

export type InspectorPropertyName =
  | 'visible'
  | 'color'
  | 'placement'
  | 'offsetX'
  | 'offsetY'
  | 'small'
  | 'stemDirection'
  | 'lineStyle';

export interface InspectorPropertyState {
  value: boolean | number | string | null;
  mixed: boolean;
  applicableCount: number;
}

export interface SelectedElementProperties {
  selectionCount: number;
  elementType: string;
  properties: Partial<Record<InspectorPropertyName, InspectorPropertyState>>;
}

export interface FretDiagramData {
  strings: number;
  frets: number;
  fretOffset: number;
  showNut: boolean;
  dots: Array<{ string: number; fret: number; type: number }>;
  markers: Array<{ string: number; type: number }>;
  barres: Array<{ fret: number; startString: number; endString: number }>;
}

export type SynthAudioBatchChunk = {
  chunk: Uint8Array;
  startTime: number;
  endTime?: number;
  done?: boolean;
};

export type SynthAudioBatchIterator = (cancel?: boolean) => Promise<SynthAudioBatchChunk[]>;

export interface Score {
  destroy: (soft?: boolean) => void;
  saveSvg: (
    pageNumber?: number,
    drawPageBackground?: boolean,
    highlightSelection?: boolean,
  ) => Promise<string>;
  savePdf: () => Promise<Uint8Array>;
  saveXml?: () => Promise<Uint8Array>;
  saveMxl?: () => Promise<Uint8Array>;
  saveMsc?: (format?: 'mscz' | 'mscx') => Promise<Uint8Array>;
  saveMidi?: (midiExpandRepeats?: boolean, exportRPNs?: boolean) => Promise<Uint8Array>;
  saveAudio?: (format: 'wav' | 'ogg' | 'flac' | 'mp3') => Promise<Uint8Array>;
  saveAudioForMeasureRange?: (
    format: 'wav',
    startMeasureIndex: number,
    endMeasureIndex: number,
  ) => Promise<Uint8Array>;
  savePng?: (
    pageNumber?: number,
    drawPageBackground?: boolean,
    transparent?: boolean,
  ) => Promise<Uint8Array>;
  setSoundFont: (data: Uint8Array) => Promise<void>;
  synthAudioBatch?: (
    startTime: number,
    batchSize: number,
  ) => Promise<SynthAudioBatchIterator> | SynthAudioBatchIterator;
  synthAudioBatchFromSelection?: (
    batchSize: number,
  ) => Promise<SynthAudioBatchIterator> | SynthAudioBatchIterator;
  synthAudioBatchForMeasureRange?: (
    startMeasureIndex: number,
    endMeasureIndex: number,
    batchSize: number,
  ) => Promise<SynthAudioBatchIterator> | SynthAudioBatchIterator;
  synthSelectionPreviewBatch?: (
    batchSize: number,
    durationMs?: number,
  ) => Promise<SynthAudioBatchIterator> | SynthAudioBatchIterator;
  metadata: () => Promise<Record<string, unknown>>;
  npages?: () => Promise<number>;
  measurePositions: () => Promise<Positions>;
  measureRangeForPage?: (
    pageIndex: number,
  ) =>
    | Promise<{ startMeasureIndex: number; endMeasureIndex: number } | null>
    | { startMeasureIndex: number; endMeasureIndex: number }
    | null;
  playbackTimeline?: () => Promise<PlaybackTimeline | null> | PlaybackTimeline | null;
  selectionMeasureRange?: () =>
    | Promise<{ startMeasureIndex: number; endMeasureIndex: number } | null>
    | { startMeasureIndex: number; endMeasureIndex: number }
    | null;
  segmentPositions: () => Promise<Positions>;
  measureSignatureCount?: (partIndex: number) => Promise<number> | number;
  measureSignatureAt?: (partIndex: number, measureIndex: number) => Promise<string> | string;
  measureSignatures?: (partIndex: number) => Promise<string[]> | string[];
  measureLineBreaks?: () => Promise<boolean[]> | boolean[];
  /**
   * Measures whose actual length differs from their time signature — what
   * MuseScore marks with a small plus, with both lengths named.
   */
  irregularMeasures?: () => Promise<IrregularMeasure[]> | IrregularMeasure[];
  /** Set one measure's actual length back to its time signature. */
  setMeasureLengthToTimeSignature?: (measureIndex: number) => Promise<boolean> | boolean;
  setMeasureLineBreaks?: (breaks: boolean[]) => Promise<boolean> | boolean;
  /**
   * Optional mutation/undo surface exposed by custom webmscore builds.
   * These methods may be undefined if the WASM bindings were not compiled with mutation support.
   */
  selectElementAtPoint?: (pageNumber: number, x: number, y: number) => Promise<unknown> | unknown;
  selectMeasureAtPoint?: (pageNumber: number, x: number, y: number) => Promise<unknown> | unknown;
  extendMeasureSelectionAtPoint?: (
    pageNumber: number,
    x: number,
    y: number,
  ) => Promise<unknown> | unknown;
  selectPartMeasureByIndex?: (
    partIndex: number,
    measureIndex: number,
  ) => Promise<unknown> | unknown;
  selectTextElementAtPoint?: (
    pageNumber: number,
    x: number,
    y: number,
  ) => Promise<unknown> | unknown;
  selectElementAtPointWithMode?: (
    pageNumber: number,
    x: number,
    y: number,
    mode: 0 | 1 | 2 | 3,
  ) => Promise<unknown> | unknown;
  beginElementDrag?: (pageNumber: number, x: number, y: number) => Promise<boolean> | boolean;
  updateElementDrag?: (
    pageNumber: number,
    x: number,
    y: number,
    modifiers?: number,
    dragMode?: 0 | 1 | 2,
  ) => Promise<boolean> | boolean;
  endElementDrag?: (commit: boolean) => Promise<boolean> | boolean;
  applyDropAtPoint?: (
    pageNumber: number,
    x: number,
    y: number,
    elementType: 0 | 1 | 2,
    subtype: number,
  ) => Promise<boolean> | boolean;
  beginGripEdit?: (
    pageNumber: number,
    x: number,
    y: number,
  ) => Promise<GripEditInfo | null> | GripEditInfo | null;
  dragGrip?: (
    gripIndex: number,
    dx: number,
    dy: number,
    modifiers?: number,
  ) => Promise<GripEditInfo | null> | GripEditInfo | null;
  endGripEdit?: (commit: boolean) => Promise<boolean> | boolean;
  getSpatium?: () => Promise<number> | number;
  selectNextChord?: () => Promise<unknown> | unknown;
  selectPrevChord?: () => Promise<unknown> | unknown;
  extendSelectionNextChord?: () => Promise<unknown> | unknown;
  extendSelectionPrevChord?: () => Promise<unknown> | unknown;
  isSelectionRange?: () => Promise<unknown> | unknown;
  extendSelectionNextMeasure?: () => Promise<unknown> | unknown;
  extendSelectionPrevMeasure?: () => Promise<unknown> | unknown;
  extendSelectionStaffAbove?: () => Promise<unknown> | unknown;
  extendSelectionStaffBelow?: () => Promise<unknown> | unknown;
  getSelectionBoundingBox?: () =>
    | Promise<{ page: number; x: number; y: number; width: number; height: number } | null>
    | { page: number; x: number; y: number; width: number; height: number }
    | null;
  getSelectionBoundingBoxes?: () =>
    | Promise<Array<{ page: number; x: number; y: number; width: number; height: number }>>
    | Array<{ page: number; x: number; y: number; width: number; height: number }>;
  /**
   * Vertical band of each part within each laid-out system, in page coordinates —
   * the staff dimension `measurePositions()` does not carry. Only laid-out systems
   * appear; the engine lays out lazily, so call `layoutUntilPage` first if a later
   * page is needed.
   */
  staffSystemBands?: () => Promise<StaffSystemBand[]> | StaffSystemBand[];
  /**
   * Vertical padding below one staff of one measure, in spatium; `gapSpatium <= 0`
   * removes it. The only way to leave a hole where the other compare pane has an extra
   * bar — a line break can move a bar to another system but cannot create empty space.
   */
  setMeasureSpacer?: (
    measureIndex: number,
    staffIdx: number,
    gapSpatium: number,
  ) => Promise<boolean> | boolean;
  clearSelection?: () => Promise<unknown> | unknown;
  selectionMimeType?: () => Promise<string> | string;
  selectionMimeData?: () => Promise<Uint8Array> | Uint8Array;
  pasteSelection?: (mimeType: string, data: Uint8Array) => Promise<unknown> | unknown;
  deleteSelection?: () => Promise<unknown> | unknown;
  pitchUp?: () => Promise<unknown> | unknown;
  pitchDown?: () => Promise<unknown> | unknown;
  transpose?: (
    mode: number,
    direction: number,
    key: number,
    interval: number,
    trKeys: boolean,
    trChordNames: boolean,
    useDoubleSharpsFlats: boolean,
  ) => Promise<unknown> | unknown;
  selectAll?: () => Promise<unknown> | unknown;
  setAccidental?: (accidentalType: number) => Promise<unknown> | unknown;
  doubleDuration?: () => Promise<unknown> | unknown;
  halfDuration?: () => Promise<unknown> | unknown;
  toggleDot?: () => Promise<unknown> | unknown;
  toggleDoubleDot?: () => Promise<unknown> | unknown;
  setNoteEntryMode?: (enabled: boolean) => Promise<unknown> | unknown;
  getNoteInputCursorRect?: () =>
    | Promise<{
        page: number;
        x: number;
        y: number;
        width: number;
        height: number;
        voice: number;
      } | null>
    | {
        page: number;
        x: number;
        y: number;
        width: number;
        height: number;
        voice: number;
      }
    | null;
  setNoteEntryMethod?: (method: number) => Promise<unknown> | unknown;
  setInputStateFromSelection?: () => Promise<unknown> | unknown;
  setInputAccidentalType?: (accidentalType: number) => Promise<unknown> | unknown;
  setInputDurationType?: (durationType: number) => Promise<unknown> | unknown;
  toggleInputDot?: () => Promise<unknown> | unknown;
  putNote?: (
    pageNumber: number,
    x: number,
    y: number,
    replace?: boolean,
    insert?: boolean,
  ) => Promise<boolean> | boolean;
  addPitchByStep?: (
    note: number,
    addToChord?: boolean,
    insert?: boolean,
  ) => Promise<unknown> | unknown;
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
  setTimeSignatureWithType?: (
    numerator: number,
    denominator: number,
    timeSigType: number,
  ) => Promise<unknown> | unknown;
  setKeySignature?: (fifths: number) => Promise<unknown> | unknown;
  setHarmonyVoiceLiteral?: (literal: boolean) => Promise<unknown> | unknown;
  setChordSymbolStylePreset?: (preset: 'std' | 'jazz') => Promise<unknown> | unknown;
  getKeySignature?: () => Promise<number> | number;
  setClef?: (clefType: number) => Promise<unknown> | unknown;
  addDynamic?: (dynamicType: number) => Promise<unknown> | unknown;
  addHairpin?: (hairpinType: number) => Promise<unknown> | unknown;
  addFermata?: (fermataVariant: number) => Promise<boolean> | boolean;
  addBreath?: (breathType: number) => Promise<boolean> | boolean;
  addArpeggio?: (arpeggioType: number) => Promise<boolean> | boolean;
  addTremolo?: (tremoloType: number) => Promise<boolean> | boolean;
  addOttava?: (ottavaType: number) => Promise<boolean> | boolean;
  addTrill?: (trillType: number) => Promise<boolean> | boolean;
  addGlissando?: (glissandoType: number) => Promise<boolean> | boolean;
  addMarker?: (markerType: number) => Promise<boolean> | boolean;
  addJump?: (jumpType: number) => Promise<boolean> | boolean;
  setNoteheadGroup?: (noteheadGroup: number) => Promise<boolean> | boolean;
  setBeamMode?: (beamMode: number) => Promise<boolean> | boolean;
  setSelectionFilter?: (filterMask: number) => Promise<boolean> | boolean;
  addMeasureRepeat?: (numMeasures: number) => Promise<boolean> | boolean;
  setMultiMeasureRests?: (enabled: boolean) => Promise<boolean> | boolean;
  multiMeasureRestsEnabled?: () => Promise<boolean> | boolean;
  addPedal?: (pedalVariant: number) => Promise<unknown> | unknown;
  addSostenutoPedal?: () => Promise<unknown> | unknown;
  addUnaCorda?: () => Promise<unknown> | unknown;
  splitPedal?: () => Promise<unknown> | unknown;
  addRehearsalMark?: () => Promise<unknown> | unknown;
  addTempoText?: (bpm: number) => Promise<unknown> | unknown;
  addArticulation?: (articulationSymbolName: string) => Promise<unknown> | unknown;
  addSlur?: () => Promise<unknown> | unknown;
  flipStem?: () => Promise<boolean> | boolean;
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
  getSelectedElementProperties?: () =>
    Promise<SelectedElementProperties> | SelectedElementProperties;
  setSelectedElementProperty?: (
    propertyName: InspectorPropertyName,
    value: boolean | number | string,
  ) => Promise<boolean> | boolean;
  addFretDiagram?: (pattern: string) => Promise<boolean> | boolean;
  getSelectedFretDiagram?: () => Promise<FretDiagramData | null> | FretDiagramData | null;
  setSelectedFretDiagram?: (diagram: FretDiagramData) => Promise<boolean> | boolean;
  addAmbitus?: () => Promise<boolean> | boolean;
  explodeSelection?: () => Promise<boolean> | boolean;
  implodeSelection?: () => Promise<boolean> | boolean;
  regroupSelection?: () => Promise<boolean> | boolean;
  resequenceRehearsalMarks?: () => Promise<boolean> | boolean;
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
  addPickupMeasure?: (numerator: number, denominator: number) => Promise<unknown> | unknown;
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
  load: (
    format: InputFileFormat,
    data: Uint8Array,
    fonts?: Uint8Array[],
    doLayout?: boolean,
  ) => Promise<Score>;
  ready: Promise<void>;
}

// NOTE:
// The `webmscore` package can present different module shapes depending on
// runtime/bundler interop (CJS/ESM default wrapping). Resolve once so callers
// always receive an object with { ready, load }.
const resolveWebMscore = (mod: unknown): WebMscoreInstance => {
  const isModuleCandidate = (value: unknown): value is Record<string, unknown> =>
    value !== null && (typeof value === 'object' || typeof value === 'function');
  const moduleRecord = isModuleCandidate(mod) ? (mod as Record<string, unknown>) : undefined;
  const defaultRecord = isModuleCandidate(moduleRecord?.default)
    ? (moduleRecord.default as Record<string, unknown>)
    : undefined;
  const candidates = [
    defaultRecord,
    isModuleCandidate(defaultRecord?.default)
      ? (defaultRecord.default as Record<string, unknown>)
      : undefined,
    moduleRecord,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    let load: unknown;
    let ready: unknown;
    try {
      load = candidate.load;
      ready = candidate.ready;
    } catch {
      continue;
    }
    if (
      typeof load === 'function' &&
      ready &&
      typeof (ready as Promise<void>).then === 'function'
    ) {
      return candidate as unknown as WebMscoreInstance;
    }
  }

  throw new Error('Unexpected webmscore module shape: missing ready/load');
};

let initialized = false;
let webMscore: WebMscoreInstance | null = null;
let initPromise: Promise<WebMscoreInstance> | null = null;
let inProcessInitialized = false;
let inProcessWebMscore: WebMscoreInstance | null = null;
let inProcessInitPromise: Promise<WebMscoreInstance> | null = null;

const ensureBrowserMscoreScriptUrl = () => {
  if (typeof window === 'undefined') {
    return;
  }
  const globalScope = globalThis as Record<string, unknown>;
  if (
    typeof globalScope.MSCORE_SCRIPT_URL === 'string' &&
    globalScope.MSCORE_SCRIPT_URL.length > 0
  ) {
    return;
  }
  const base = typeof document !== 'undefined' ? document.baseURI : window.location.href;
  globalScope.MSCORE_SCRIPT_URL = new URL('.', base).href;
};

export const loadWebMscore = async (): Promise<WebMscoreInstance> => {
  if (initialized && webMscore) {
    return webMscore;
  }
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const imported = await import('./webmscore-worker-runtime.js');
    const resolved = resolveWebMscore(imported as unknown);
    await resolved.ready;
    webMscore = resolved;
    initialized = true;
    return resolved;
  })();

  try {
    return await initPromise;
  } finally {
    initPromise = null;
  }
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
    const originalFetch = globalThis.fetch;
    let inProcessImport: unknown;
    try {
      inProcessImport =
        typeof window === 'undefined'
          ? await import('./webmscore-in-process-node-runtime.js')
          : await import('./webmscore-in-process-browser-runtime.js');
    } finally {
      // The vendored Node shim clears global fetch during module evaluation.
      // Keep that compatibility behavior local to webmscore initialization.
      if (typeof originalFetch === 'function' && typeof globalThis.fetch !== 'function') {
        globalThis.fetch = originalFetch;
      }
    }
    const resolved = resolveWebMscore(inProcessImport);
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

/**
 * Decode whatever this build of webmscore returned from `saveXml`.
 *
 * Deliberately not `new TextDecoder().decode(value)`: the bytes can arrive from
 * another realm (the WASM module, a worker, or an embed iframe), where
 * `value instanceof Uint8Array` is false even though the value is a perfectly
 * good typed array. `TextDecoder` then refuses it with a message that says
 * nothing about realms, and the symptom is a save that silently does nothing.
 */
export async function decodeScoreXml(value: unknown): Promise<string> {
  if (typeof value === 'string') {
    return value;
  }
  // `ArrayBuffer.isView` is realm-safe by specification; `instanceof` is not,
  // which is the whole point of this function.
  if (ArrayBuffer.isView(value)) {
    return new TextDecoder().decode(
      new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
    );
  }
  // For a bare buffer there is no `isView` equivalent, so match the brand
  // rather than the constructor — `instanceof ArrayBuffer` is false for a
  // buffer that came from another realm, which is exactly the case here.
  const brand = Object.prototype.toString.call(value);
  if (brand === '[object ArrayBuffer]' || brand === '[object SharedArrayBuffer]') {
    return new TextDecoder().decode(new Uint8Array(value as ArrayBuffer));
  }
  if (brand === '[object Blob]' || brand === '[object File]') {
    return (value as Blob).text();
  }
  throw new Error('The score engine returned an unsupported MusicXML payload.');
}
