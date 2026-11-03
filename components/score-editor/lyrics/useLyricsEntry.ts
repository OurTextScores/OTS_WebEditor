import { useCallback, useState } from 'react';
import type { LyricsEntryPosition } from '../../../lib/webmscore-score-settings-types';
import type { EditorCore } from '../core';
import { LYRICS_ACTIONS, type LyricsAction } from './lyricsKeys';

/**
 * Lyric entry (roadmap E17): started at the selection, it shows a text box where the lyric goes; each key that moves
 * on writes the syllable as one undoable edit and moves the box (lyricsentry.h holds MuseScore's syllable rules).
 */
export function useLyricsEntry(
  core: Pick<
    EditorCore,
    'score' | 'performMutation' | 'ensureSelectionInWasm' | 'runSerializedScoreOperation'
  >,
) {
  const { score, performMutation, ensureSelectionInWasm, runSerializedScoreOperation } = core;
  const [entry, setEntry] = useState<LyricsEntryPosition | null>(null);

  const supported = Boolean(score?.startLyricsEntry && score?.lyricsEntryCommit);

  /** Starts at the selected note, rest or lyric; false when the engine found nothing to put a lyric on. */
  const start = useCallback(async () => {
    const begin = score?.startLyricsEntry;
    if (!score || !begin) return false;
    await ensureSelectionInWasm();
    const position = await runSerializedScoreOperation(
      () => begin.call(score),
      'start lyric entry',
    );
    setEntry(position ?? null);
    return Boolean(position);
  }, [score, ensureSelectionInWasm, runSerializedScoreOperation]);

  /** Writes `text` and does what the key asks; the box moves, or closes once entry ends. */
  const commit = useCallback(
    async (text: string, action: LyricsAction) => {
      const write = score?.lyricsEntryCommit;
      if (!score || !write) return;
      let next: LyricsEntryPosition | null = null;
      await performMutation(
        action === LYRICS_ACTIONS.end ? 'enter lyrics' : 'enter lyrics and move',
        async () => {
          next = await write.call(score, text, action);
          return true;
        },
        { skipWasmReselect: true, skipSelectionFallback: true },
      );
      setEntry(action === LYRICS_ACTIONS.end ? null : next);
    },
    [score, performMutation],
  );

  /** Stops without writing (the score changed under the box). */
  const stop = useCallback(async () => {
    setEntry(null);
    await score?.endLyricsEntry?.();
  }, [score]);

  return { entry, supported, start, commit, stop };
}

export type LyricsEntryModel = ReturnType<typeof useLyricsEntry>;
