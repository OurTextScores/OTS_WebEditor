import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  search: new URLSearchParams({ score: '/score.musicxml', follow: '0' }),
  loadScoreFromUrl: vi.fn(),
  requestScoreLayoutProgress: vi.fn(),
  trackEvent: vi.fn(),
  onTransportMessage: null as ((message: string) => void) | null,
  transport: {
    state: 'idle',
    stateRef: { current: 'idle' },
    positionMs: 0,
    positionRef: { current: 0 },
    renderWindowIdle: false,
    fallbackMode: false,
    togglePlayPause: vi.fn(),
    stopAt: vi.fn(),
    seek: vi.fn(),
    reset: vi.fn(),
    dispose: vi.fn(async () => {}),
    prefetchSoundFont: vi.fn(async () => null),
  },
}));

vi.mock('next/navigation', () => ({ useSearchParams: () => mocks.search }));
vi.mock('@/lib/score-loader', () => ({
  loadScoreFromUrl: mocks.loadScoreFromUrl,
  requestScoreLayoutProgress: mocks.requestScoreLayoutProgress,
}));
vi.mock('@/lib/playback/use-score-transport', () => ({
  useScoreTransport: (options: { onMessage?: (message: string) => void }) => {
    mocks.onTransportMessage = options.onMessage ?? null;
    return mocks.transport;
  },
}));
vi.mock('@/lib/editor-analytics', () => ({
  trackEditorAnalyticsEvent: mocks.trackEvent,
}));

import EmbeddedScorePlayer from '@/components/score-player/EmbeddedScorePlayer';

const positions = {
  elements: [
    { id: 0, x: 0, y: 0, sx: 100, sy: 40, page: 0 },
    { id: 1, x: 0, y: 0, sx: 100, sy: 40, page: 1 },
  ],
  events: [],
  pageSize: { width: 100, height: 40 },
};

const makeScore = (overrides: { segmentPositions?: () => Promise<unknown> } = {}) => ({
  destroy: vi.fn(),
  metadata: vi.fn(async () => ({ title: 'Test score', duration: 2 })),
  npages: vi.fn(async () => 1),
  measurePositions: vi.fn(async () => positions),
  segmentPositions:
    overrides.segmentPositions ??
    vi.fn(async () => ({
      elements: [
        { id: 0, x: 0, y: 0, sx: 8, sy: 40, page: 0 },
        { id: 1, x: 50, y: 0, sx: 8, sy: 40, page: 0 },
      ],
      events: [
        { elid: 0, position: 0 },
        { elid: 1, position: 500 },
      ],
      pageSize: { width: 100, height: 40 },
    })),
  playbackTimeline: vi.fn(async () => ({
    schemaVersion: 1 as const,
    durationMs: 2_000,
    renderDurationMs: 5_000,
    occurrences: [
      { occurrenceIndex: 0, measureIndex: 0, startMs: 0, endMs: 1_000 },
      { occurrenceIndex: 1, measureIndex: 1, startMs: 1_000, endMs: 2_000 },
    ],
  })),
  saveSvg: vi.fn(async (page: number) => `<svg data-page="${page}"></svg>`),
});

describe('EmbeddedScorePlayer progressive pages', () => {
  afterEach(() => vi.useRealTimers());

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.search = new URLSearchParams({ score: '/score.musicxml', follow: '0' });
    mocks.transport.state = 'idle';
    mocks.transport.stateRef.current = 'idle';
    mocks.transport.positionMs = 0;
    mocks.transport.positionRef.current = 0;
    mocks.transport.renderWindowIdle = true;
    mocks.onTransportMessage = null;
    const score = makeScore();
    mocks.loadScoreFromUrl.mockResolvedValue({
      loadedScore: score,
      progressivePaging: true,
      progressiveHasMore: true,
      initialAvailablePages: 1,
      engineMode: 'worker',
      format: 'musicxml',
      data: new Uint8Array([1]),
    });
  });

  it('queues layout during playback, shows status, then runs in the render-ahead idle window', async () => {
    mocks.transport.state = 'playing';
    mocks.transport.renderWindowIdle = false;
    mocks.requestScoreLayoutProgress.mockResolvedValue({
      targetPage: 1,
      targetSatisfied: true,
      availablePages: 2,
      totalMeasures: 2,
      laidOutMeasures: 2,
      loadedUntilTick: 960,
      hasMorePages: false,
      isComplete: true,
    });
    const view = render(<EmbeddedScorePlayer />);
    await screen.findByTestId('player-svg');

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('Preparing next page…')).toBeInTheDocument();
    expect(mocks.requestScoreLayoutProgress).not.toHaveBeenCalled();

    mocks.transport.renderWindowIdle = true;
    view.rerender(<EmbeddedScorePlayer />);
    await waitFor(() => expect(mocks.requestScoreLayoutProgress).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByText('Page 2 of 2')).toBeInTheDocument());
  });

  it('keeps the last rendered score visible when progressive layout fails', async () => {
    mocks.requestScoreLayoutProgress.mockRejectedValue(new Error('Layout timed out'));
    render(<EmbeddedScorePlayer />);
    await waitFor(() =>
      expect(screen.getByTestId('player-svg').innerHTML).toContain('data-page="0"'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findByText('Layout timed out');

    expect(screen.getByTestId('player-svg')).toBeVisible();
    expect(screen.getByTestId('player-play')).toBeEnabled();
  });

  it('offers an inline retry after the score fails to load', async () => {
    mocks.loadScoreFromUrl.mockRejectedValueOnce(
      new Error('The score could not be fetched (503).'),
    );
    render(<EmbeddedScorePlayer />);

    await screen.findByText('The score could not be fetched (503).');
    expect(
      screen.getByText('The score could not be fetched (503).').closest('[role="status"]'),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await screen.findByTestId('player-svg');
    expect(mocks.loadScoreFromUrl).toHaveBeenCalledTimes(2);
    expect(mocks.trackEvent).toHaveBeenCalledWith(
      'score_player_error',
      expect.objectContaining({
        surface: 'embedded_player',
        error_category: 'score',
      }),
    );
  });

  it('emits bounded player telemetry without score metadata', async () => {
    const view = render(<EmbeddedScorePlayer />);
    await screen.findByTestId('player-svg');
    await waitFor(() =>
      expect(mocks.trackEvent).toHaveBeenCalledWith(
        'score_player_loaded',
        expect.objectContaining({
          surface: 'embedded_player',
          input_format: 'musicxml',
          page_count_bucket: '1',
          duration_bucket: 'under_30s',
        }),
      ),
    );

    mocks.transport.state = 'playing';
    mocks.transport.stateRef.current = 'playing';
    view.rerender(<EmbeddedScorePlayer />);
    expect(mocks.trackEvent).toHaveBeenCalledWith('score_player_play_started', expect.any(Object));
    expect(screen.getByText('Playback started.')).toBeInTheDocument();
    mocks.transport.state = 'paused';
    mocks.transport.stateRef.current = 'paused';
    view.rerender(<EmbeddedScorePlayer />);
    expect(mocks.trackEvent).toHaveBeenCalledWith('score_player_paused', expect.any(Object));
    expect(screen.getByText('Playback paused.')).toBeInTheDocument();
    mocks.transport.state = 'ended';
    mocks.transport.stateRef.current = 'ended';
    view.rerender(<EmbeddedScorePlayer />);
    expect(mocks.trackEvent).toHaveBeenCalledWith('score_player_completed', expect.any(Object));

    expect(JSON.stringify(mocks.trackEvent.mock.calls)).not.toContain('/score.musicxml');
    expect(JSON.stringify(mocks.trackEvent.mock.calls)).not.toContain('Test score');
  });

  it('announces playback failure assertively', async () => {
    const view = render(<EmbeddedScorePlayer />);
    await screen.findByTestId('player-svg');

    act(() => mocks.onTransportMessage?.('Playback soundfont is unavailable.'));
    mocks.transport.state = 'unavailable';
    mocks.transport.stateRef.current = 'unavailable';
    view.rerender(<EmbeddedScorePlayer />);

    expect(screen.getByRole('alert')).toHaveTextContent('Playback soundfont is unavailable.');
  });

  it('extends progressive layout when follow reaches the last known measure', async () => {
    mocks.search = new URLSearchParams({ score: '/score.musicxml' });
    mocks.transport.positionMs = 1_500;
    mocks.transport.positionRef.current = 1_500;
    const score = makeScore();
    vi.mocked(score.measurePositions)
      .mockResolvedValueOnce({ ...positions, elements: positions.elements.slice(0, 1) })
      .mockResolvedValue(positions);
    mocks.loadScoreFromUrl.mockResolvedValue({
      loadedScore: score,
      progressivePaging: true,
      progressiveHasMore: true,
      initialAvailablePages: 1,
      engineMode: 'worker',
      format: 'musicxml',
      data: new Uint8Array([1]),
    });
    mocks.requestScoreLayoutProgress.mockResolvedValue({
      targetPage: 1,
      targetSatisfied: true,
      availablePages: 2,
      totalMeasures: 2,
      laidOutMeasures: 2,
      loadedUntilTick: 960,
      hasMorePages: false,
      isComplete: true,
    });

    render(<EmbeddedScorePlayer />);

    await waitFor(() => expect(mocks.requestScoreLayoutProgress).toHaveBeenCalledWith(score, 1));
    await waitFor(() => expect(screen.getByText('Page 2 of 2')).toBeInTheDocument());
  });

  it('restores the last readable page when rendering a newly laid-out page fails', async () => {
    const score = makeScore();
    vi.mocked(score.saveSvg).mockImplementation(async (page: number) => {
      if (page === 1) throw new Error('Page render failed');
      return '<svg data-page="0"></svg>';
    });
    mocks.loadScoreFromUrl.mockResolvedValue({
      loadedScore: score,
      progressivePaging: true,
      progressiveHasMore: true,
      initialAvailablePages: 1,
      engineMode: 'worker',
      format: 'musicxml',
      data: new Uint8Array([1]),
    });
    mocks.requestScoreLayoutProgress.mockResolvedValue({
      targetPage: 1,
      targetSatisfied: true,
      availablePages: 2,
      totalMeasures: 2,
      laidOutMeasures: 2,
      loadedUntilTick: 960,
      hasMorePages: false,
      isComplete: true,
    });
    render(<EmbeddedScorePlayer />);
    await waitFor(() =>
      expect(screen.getByTestId('player-svg').innerHTML).toContain('data-page="0"'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findByText('Page render failed');

    await waitFor(() => expect(screen.getByText('Page 1 of 2')).toBeInTheDocument());
    expect(screen.getByTestId('player-svg').innerHTML).toContain('data-page="0"');
    expect(screen.getByTestId('player-play')).toBeEnabled();
  });

  it('accepts valid host commands only from the configured parent origin', async () => {
    mocks.search = new URLSearchParams({
      score: '/score.musicxml',
      follow: '0',
      playerId: 'review-player',
      parentOrigin: window.location.origin,
    });
    render(<EmbeddedScorePlayer />);
    await screen.findByTestId('player-svg');

    const command = {
      type: 'ots-player:command',
      version: 1,
      playerId: 'review-player',
      command: 'seek',
      value: 750,
    };
    window.dispatchEvent(
      new MessageEvent('message', {
        data: command,
        origin: 'https://untrusted.example',
        source: window,
      }),
    );
    expect(mocks.transport.seek).not.toHaveBeenCalled();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: command,
        origin: window.location.origin,
        source: window,
      }),
    );
    expect(mocks.transport.seek).toHaveBeenCalledWith(750);
    expect(mocks.trackEvent).toHaveBeenCalledWith('score_player_seeked', expect.any(Object));
  });

  it('temporarily suspends follow after manual page navigation', async () => {
    mocks.search = new URLSearchParams({ score: '/score.musicxml' });
    const score = makeScore();
    vi.mocked(score.npages).mockResolvedValue(2);
    mocks.loadScoreFromUrl.mockResolvedValue({
      loadedScore: score,
      progressivePaging: false,
      progressiveHasMore: false,
      initialAvailablePages: 2,
      engineMode: 'worker',
      format: 'musicxml',
      data: new Uint8Array([1]),
    });
    render(<EmbeddedScorePlayer />);
    await screen.findByTestId('player-svg');

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getAllByRole('button', { name: 'Follow score' })[0]).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    act(() => vi.advanceTimersByTime(4_000));
    expect(screen.getAllByRole('button', { name: 'Follow score' })[0]).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    vi.useRealTimers();
  });

  it('owns playback shortcuts only while focus is inside the player', async () => {
    render(<EmbeddedScorePlayer />);
    const root = await screen.findByTestId('embedded-score-player');

    fireEvent.keyDown(document.body, { key: ' ' });
    expect(mocks.transport.togglePlayPause).not.toHaveBeenCalled();

    root.focus();
    fireEvent.keyDown(root, { key: ' ' });
    expect(mocks.transport.togglePlayPause).toHaveBeenCalledOnce();
    fireEvent.keyDown(screen.getByTestId('player-seek'), { key: 'Home' });
    expect(mocks.transport.stopAt).not.toHaveBeenCalled();
  });

  it('switches to note-level tracking on toggle without fetching segments before', async () => {
    render(<EmbeddedScorePlayer />);
    await screen.findByTestId('player-svg');
    await waitFor(() => expect(screen.getByTestId('active-measure-highlight')).toBeInTheDocument());

    const loaded = await mocks.loadScoreFromUrl.mock.results[0].value;
    expect(loaded.loadedScore.segmentPositions).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('button', { name: 'Note highlighting' })[0]);

    await waitFor(() =>
      expect(loaded.loadedScore.segmentPositions).toHaveBeenCalledTimes(1),
    );
    await waitFor(() => expect(screen.getByTestId('active-note-highlight')).toBeInTheDocument());
    expect(
      screen.getAllByRole('button', { name: 'Note highlighting' })[0],
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByTestId('active-measure-highlight')).not.toBeInTheDocument();
  });

  it('falls back to measure highlighting with an inline message when segments fail', async () => {
    render(<EmbeddedScorePlayer />);
    await screen.findByTestId('player-svg');

    const loaded = await mocks.loadScoreFromUrl.mock.results[0].value;
    vi.mocked(loaded.loadedScore.segmentPositions).mockRejectedValueOnce(new Error('boom'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Note highlighting' })[0]);

    await screen.findByText('Note highlighting is unavailable for this score.');
    expect(screen.getByTestId('active-measure-highlight')).toBeInTheDocument();
    expect(screen.queryByTestId('active-note-highlight')).not.toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Note highlighting' })[0],
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('starts in note mode from the highlight query parameter', async () => {
    mocks.search = new URLSearchParams({ score: '/score.musicxml', highlight: 'note' });
    render(<EmbeddedScorePlayer />);
    await screen.findByTestId('player-svg');

    const loaded = await mocks.loadScoreFromUrl.mock.results[0].value;
    await waitFor(() =>
      expect(loaded.loadedScore.segmentPositions).toHaveBeenCalledTimes(1),
    );
    await waitFor(() => expect(screen.getByTestId('active-note-highlight')).toBeInTheDocument());
  });
});
