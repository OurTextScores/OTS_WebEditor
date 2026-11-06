import type { Score } from '../../../lib/webmscore-loader';
import { loadScoreWithEngineFallback } from '../../../lib/score-loader';
import { detectScoreInputFormat, resolvePublicScoreUrl } from '../../../lib/public-score-url';
import {
  deviceScoreStore,
  isLocalScore,
  type ScoreStore,
  type StoredScore,
} from '../platform/scoreStore';

type Serial = <T>(operation: () => Promise<T>) => Promise<T>;

/**
 * A score's bytes: kept on the device when there (handed over from the editor as `local:<id>`, or made available
 * offline), else fetched. A `local:` score that is not on the device cannot be opened.
 */
export async function scoreBytes(
  url: string,
  signal: AbortSignal,
  store: ScoreStore = deviceScoreStore(),
): Promise<Pick<StoredScore, 'format' | 'bytes'>> {
  const kept = await store.get(url).catch(() => undefined);
  if (kept) return kept;
  if (isLocalScore(url)) throw new Error('This score is no longer on this device.');
  const response = await fetch(resolvePublicScoreUrl(url), { signal });
  if (!response.ok) throw new Error(`The score could not be fetched (${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { format: detectScoreInputFormat(url, bytes), bytes };
}

/**
 * Opens a score for performing: read-only on the worker engine, laid out eagerly (performer mode lays it out for the
 * device anyway). Reads its playing order (written bars in the order played) from the playback timeline; with
 * `playThrough`, shows instead the score with its repeats written out (the engine's Unroll repeats), whose bar i is
 * written bar `playedBars[i]`. Returns null when aborted (nothing left loaded).
 */
export async function loadPerformerScore(
  url: string,
  playThrough: boolean,
  run: Serial,
  signal: AbortSignal,
): Promise<{ score: Score; playedBars: number[] } | null> {
  const { format, bytes } = await scoreBytes(url, signal);
  const { loadedScore } = await loadScoreWithEngineFallback(format, bytes, {
    progressiveEnabled: false,
  });
  if (signal.aborted) {
    loadedScore.destroy();
    return null;
  }
  const timeline = await run(() => Promise.resolve(loadedScore.playbackTimeline?.() ?? null)).catch(
    () => null,
  );
  const playedBars = timeline?.occurrences.map((occurrence) => occurrence.measureIndex) ?? [];
  if (!playThrough || !loadedScore.unrolledMsc) return { score: loadedScore, playedBars };
  const unrolled = await run(() => loadedScore.unrolledMsc!());
  loadedScore.destroy();
  const shown = (await loadScoreWithEngineFallback('mscz', unrolled, { progressiveEnabled: false }))
    .loadedScore;
  if (signal.aborted) {
    shown.destroy();
    return null;
  }
  return { score: shown, playedBars };
}
