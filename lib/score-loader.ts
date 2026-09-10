import { detectScoreInputFormat, resolvePublicScoreUrl } from './public-score-url';
import {
  loadWebMscore,
  loadWebMscoreInProcess,
  type InputFileFormat,
  type LayoutProgressState,
  type Score,
  type WebMscoreInstance,
} from './webmscore-loader';

export const LARGE_SCORE_THRESHOLD_BYTES = 2 * 1024 * 1024;

type SerializedOperation = <T>(operation: () => Promise<T>, label: string) => Promise<T>;

export type InitialScoreLoad = {
  loadedScore: Score;
  progressivePaging: boolean;
  progressiveHasMore: boolean;
  initialAvailablePages: number;
};

export type ScoreLoadResult = InitialScoreLoad & {
  engineMode: 'worker' | 'in_process';
};

const directOperation: SerializedOperation = (operation) => operation();

export const isLargeScoreData = (data: Uint8Array) =>
  data.byteLength >= LARGE_SCORE_THRESHOLD_BYTES;

export const shouldSkipCoverPageFirstRender = (format: InputFileFormat, data: Uint8Array) =>
  isLargeScoreData(data) && (format === 'mscz' || format === 'mscx' || format === 'mxl');

const parseLayoutProgressState = (value: unknown): LayoutProgressState | null => {
  if (!value || typeof value !== 'object') return null;
  const state = value as Partial<LayoutProgressState>;
  if (
    typeof state.targetPage !== 'number' ||
    typeof state.targetSatisfied !== 'boolean' ||
    typeof state.availablePages !== 'number' ||
    typeof state.totalMeasures !== 'number' ||
    typeof state.laidOutMeasures !== 'number' ||
    typeof state.loadedUntilTick !== 'number' ||
    typeof state.hasMorePages !== 'boolean' ||
    typeof state.isComplete !== 'boolean'
  )
    return null;
  return state as LayoutProgressState;
};

export async function requestScoreLayoutProgress(
  score: Score,
  targetPage: number,
  runSerialized: SerializedOperation = directOperation,
): Promise<LayoutProgressState> {
  if (score.layoutUntilPageState) {
    const raw = await runSerialized(
      () => Promise.resolve(score.layoutUntilPageState!(targetPage)),
      `layoutUntilPageState(page=${targetPage + 1})`,
    );
    const parsed = parseLayoutProgressState(raw);
    if (parsed) return parsed;
  }

  const targetSatisfied = Boolean(
    await runSerialized(
      () => Promise.resolve(score.layoutUntilPage?.(targetPage)),
      `layoutUntilPage(page=${targetPage + 1})`,
    ),
  );
  const availablePages = score.npages
    ? Math.max(1, await runSerialized(() => Promise.resolve(score.npages!()), 'npages'))
    : targetPage + (targetSatisfied ? 1 : 0);
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
}

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export async function loadScoreWithInitialLayout(
  engine: WebMscoreInstance,
  format: InputFileFormat,
  data: Uint8Array,
  options: {
    progressiveEnabled?: boolean;
    runSerialized?: SerializedOperation;
    logStage?: (stage: string, extra?: unknown) => void;
  } = {},
): Promise<InitialScoreLoad> {
  const progressive =
    options.progressiveEnabled !== false &&
    isLargeScoreData(data) &&
    (format === 'musicxml' || format === 'mscz' || format === 'mscx' || format === 'mxl');
  if (!progressive) {
    options.logStage?.('eager-load:start');
    const loadedScore = await engine.load(format, data);
    options.logStage?.('eager-load:done');
    return {
      loadedScore,
      progressivePaging: false,
      progressiveHasMore: false,
      initialAvailablePages: 1,
    };
  }

  let progressiveScore: Score | null = null;
  try {
    const loadTimeoutMs = format === 'musicxml' ? 12_000 : 180_000;
    const firstPageTimeoutMs = format === 'musicxml' ? 10_000 : 90_000;
    options.logStage?.('progressive-load:start', { timeoutMs: loadTimeoutMs });
    progressiveScore = await withTimeout(
      engine.load(format, data.slice(), [], false),
      loadTimeoutMs,
      `Progressive load for ${format}`,
    );
    options.logStage?.('progressive-load:done');
    if (progressiveScore.layoutUntilPage || progressiveScore.layoutUntilPageState) {
      options.logStage?.('initial-layout:start', { timeoutMs: firstPageTimeoutMs });
      const state = await withTimeout(
        requestScoreLayoutProgress(progressiveScore, 0, options.runSerialized),
        firstPageTimeoutMs,
        'Initial incremental layout',
      );
      options.logStage?.('initial-layout:done', state);
      if (state.targetSatisfied) {
        return {
          loadedScore: progressiveScore,
          progressivePaging: true,
          progressiveHasMore: state.hasMorePages,
          initialAvailablePages: Math.max(1, state.availablePages || 1),
        };
      }
    }
    if (progressiveScore.relayout) {
      options.logStage?.('relayout-fallback:start');
      await withTimeout(
        (options.runSerialized ?? directOperation)(
          () => Promise.resolve(progressiveScore!.relayout!()),
          'relayout(progressive-fallback)',
        ),
        20_000,
        'Progressive relayout fallback',
      );
      options.logStage?.('relayout-fallback:done');
      return {
        loadedScore: progressiveScore,
        progressivePaging: false,
        progressiveHasMore: false,
        initialAvailablePages: 1,
      };
    }
    progressiveScore.destroy();
    progressiveScore = null;
  } catch (error) {
    progressiveScore?.destroy();
    options.logStage?.('progressive-load:failed', error);
    console.warn('Progressive score load failed, retrying with eager layout.', error);
  }

  options.logStage?.('eager-fallback:start');
  const loadedScore = await engine.load(format, data);
  options.logStage?.('eager-fallback:done');
  return {
    loadedScore,
    progressivePaging: false,
    progressiveHasMore: false,
    initialAvailablePages: 1,
  };
}

export async function loadScoreWithEngineFallback(
  format: InputFileFormat,
  data: Uint8Array,
  options: {
    progressiveEnabled?: boolean;
    runSerialized?: SerializedOperation;
    logStage?: (stage: string, extra?: unknown) => void;
    loadWorker?: () => Promise<WebMscoreInstance>;
    loadInProcess?: () => Promise<WebMscoreInstance>;
  } = {},
): Promise<ScoreLoadResult> {
  const loadOptions = {
    progressiveEnabled: options.progressiveEnabled,
    runSerialized: options.runSerialized,
    logStage: options.logStage,
  };
  try {
    const engine = await (options.loadWorker ?? loadWebMscore)();
    options.logStage?.('worker-engine:ready');
    const result = await loadScoreWithInitialLayout(engine, format, data.slice(), loadOptions);
    return { ...result, engineMode: 'worker' };
  } catch (workerError) {
    options.logStage?.('worker-engine:failed', workerError);
    console.warn('Worker webmscore load failed, retrying with in-process engine.', workerError);
    const engine = await (options.loadInProcess ?? loadWebMscoreInProcess)();
    options.logStage?.('in-process-engine:ready');
    const result = await loadScoreWithInitialLayout(engine, format, data.slice(), loadOptions);
    options.logStage?.('in-process-engine:done');
    return { ...result, engineMode: 'in_process' };
  }
}

export async function loadScoreFromUrl(
  url: string,
  options: Parameters<typeof loadScoreWithEngineFallback>[2] & { signal?: AbortSignal } = {},
) {
  const response = await fetch(
    resolvePublicScoreUrl(url),
    options.signal ? { signal: options.signal } : undefined,
  );
  if (!response.ok) throw new Error(`The score could not be fetched (${response.status}).`);
  const data = new Uint8Array(await response.arrayBuffer());
  const format = detectScoreInputFormat(url, data);
  const result = await loadScoreWithEngineFallback(format, data, options);
  return { ...result, format, data };
}
