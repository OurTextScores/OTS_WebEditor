import type { Score } from '../../../lib/webmscore-loader';
import { loadScoreFromUrl, loadScoreWithEngineFallback } from '../../../lib/score-loader';

type Serial = <T>(operation: () => Promise<T>) => Promise<T>;

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
  const { loadedScore } = await loadScoreFromUrl(url, { signal, progressiveEnabled: false });
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
