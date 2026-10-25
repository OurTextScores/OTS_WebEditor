import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePlaybackOptionsRefresh } from '@/components/score-player/usePlaybackOptionsRefresh';
import type { HighlightMode } from '@/lib/playback/player-message-api';
import type { PlaybackOptions, PlaybackTimeline, Positions, Score } from '@/lib/webmscore-loader';

const options = (revision: number): PlaybackOptions => ({
  schemaVersion: 1,
  tempoMultiplier: 0.5,
  playRepeats: true,
  revision,
});
const timeline = { schemaVersion: 1, optionsRevision: 1, durationMs: 8000 } as PlaybackTimeline;
const positions = { optionsRevision: 1, elements: [], events: [] } as unknown as Positions;

function setup(mode: HighlightMode = 'measure') {
  const score = {
    playbackTimeline: vi.fn(async () => timeline),
    measurePositions: vi.fn(async () => positions),
  } as unknown as Score;
  const scoreRef = { current: score as Score | null };
  const targets = {
    setTimeline: vi.fn(),
    setPositions: vi.fn(),
    notes: { modeRef: { current: mode }, fetchSegments: vi.fn() },
  };
  const hook = renderHook(
    ({ accepted }: { accepted: PlaybackOptions | null }) =>
      usePlaybackOptionsRefresh(scoreRef, accepted, targets),
    { initialProps: { accepted: null as PlaybackOptions | null } },
  );
  return { score, scoreRef, targets, hook };
}

describe('player timing refresh on a playback-options revision', () => {
  it('keeps the timing the score loaded with until the options change', () => {
    const { score, hook } = setup();
    hook.rerender({ accepted: options(0) });
    expect(score.playbackTimeline).not.toHaveBeenCalled();
    expect(score.measurePositions).not.toHaveBeenCalled();
  });

  it('re-reads the timeline, measure positions and (in note mode) note positions for the new revision', async () => {
    const { score, targets, hook } = setup('note');
    hook.rerender({ accepted: options(1) });
    await waitFor(() => expect(targets.setTimeline).toHaveBeenCalledWith(timeline));
    expect(targets.setPositions).toHaveBeenCalledWith(positions);
    expect(targets.notes.fetchSegments).toHaveBeenCalledWith(score);
    hook.rerender({ accepted: { ...options(1), changed: false } });
    expect(score.playbackTimeline).toHaveBeenCalledOnce();
  });

  it('drops a refresh that finishes after the score was replaced', async () => {
    const { score, scoreRef, targets, hook } = setup();
    let resolve!: (value: PlaybackTimeline) => void;
    vi.mocked(score.playbackTimeline!).mockReturnValue(new Promise((done) => (resolve = done)));
    hook.rerender({ accepted: options(1) });
    scoreRef.current = null;
    resolve(timeline);
    await new Promise((done) => setTimeout(done, 0));
    expect(targets.setTimeline).not.toHaveBeenCalled();
  });
});
