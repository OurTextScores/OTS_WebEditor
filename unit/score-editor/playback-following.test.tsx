import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import React, { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PlaybackFollowLayer,
  usePlaybackFollowing,
  type FollowTransport,
  type PlaybackFollowing,
} from '@/components/score-editor/score-following';
import {
  getFollowState,
  requestReveal,
  resetFollowStateForTests,
  resumeFollowing,
} from '@/lib/playback/score-following';
import type { ScoreTransportState } from '@/lib/playback/use-score-transport';
import type { PlaybackTimeline, Positions, Score } from '@/lib/webmscore-loader';

const segment = (x: number, page: number) => ({ id: 0, x, y: 100, sx: 40, sy: 200, page });
// Segments 0–1 on page 0, 2 on page 1.
const segments: Positions = {
  elements: [segment(0, 0), segment(40, 0), segment(0, 1)],
  events: [
    { elid: 0, position: 0 },
    { elid: 1, position: 1000 },
    { elid: 2, position: 2000 },
  ],
  pageSize: { width: 1000, height: 1400 },
};
const timeline: PlaybackTimeline = {
  schemaVersion: 1,
  durationMs: 3000,
  renderDurationMs: 6000,
  occurrences: [0, 1, 2].map((index) => ({
    occurrenceIndex: index,
    measureIndex: index,
    startMs: index * 1000,
    endMs: index * 1000 + 1000,
  })),
};

function fakeTransport(state: ScoreTransportState = 'playing') {
  const listeners = new Set<() => void>();
  const transport: FollowTransport = {
    state,
    stateRef: { current: state },
    positionRef: { current: 0 },
    subscribePosition: (notify) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    seek: vi.fn(),
    playbackOptions: null,
  };
  return {
    transport,
    tick(ms: number) {
      transport.positionRef.current = ms;
      act(() => listeners.forEach((notify) => notify()));
    },
  };
}

const fakeScore = () =>
  ({
    segmentPositions: vi.fn(async () => segments),
    measurePositions: vi.fn(async () => segments),
    playbackTimeline: vi.fn(async () => timeline),
  }) as unknown as Score;

function Harness({
  following,
  state,
  page,
}: {
  following: PlaybackFollowing;
  state: ScoreTransportState;
  page: number;
}) {
  const scroll = useRef<HTMLDivElement | null>(null);
  const wrapper = useRef<HTMLDivElement | null>(null);
  return (
    <div ref={scroll} data-testid="scroll" tabIndex={0}>
      <div ref={wrapper}>
        <PlaybackFollowLayer
          following={following}
          transportState={state}
          currentPage={page}
          zoom={1}
          scrollContainerRef={scroll}
          scoreWrapperRef={wrapper}
        />
      </div>
    </div>
  );
}

function setup(state: ScoreTransportState = 'playing') {
  const fake = fakeTransport(state);
  const score = fakeScore();
  const goToPage = vi.fn();
  const hook = renderHook(
    (props: { page: number }) =>
      usePlaybackFollowing({ score, transport: fake.transport, currentPage: props.page, goToPage }),
    { initialProps: { page: 0 } },
  );
  const view = render(<Harness following={hook.result.current} state={state} page={0} />);
  const setPage = (page: number) => {
    hook.rerender({ page });
    view.rerender(<Harness following={hook.result.current} state={state} page={page} />);
  };
  return { ...fake, score, goToPage, hook, view, setPage };
}

const scrollTo = vi.fn();
beforeEach(() => {
  // jsdom lays nothing out and has no element scrolling.
  Element.prototype.scrollTo = scrollTo as unknown as Element['scrollTo'];
});

afterEach(() => {
  // Unmount first: resetting the store under a mounted layer would replay a reveal into the next test.
  cleanup();
  window.localStorage.clear();
  resetFollowStateForTests();
  scrollTo.mockReset();
  vi.unstubAllGlobals();
});

describe('editor playback cursor', () => {
  it('reads the map once playback is live and leads with the sounding segment', async () => {
    const { score, tick } = setup();
    await waitFor(() => expect(getFollowState().tracking).toBe('segment'));
    expect(score.segmentPositions).toHaveBeenCalledOnce();
    tick(500);
    expect(screen.getByTestId('playback-cursor').dataset.elementId).toBe('0');
    tick(1200);
    expect(screen.getByTestId('playback-cursor').dataset.elementId).toBe('1');
    expect(screen.getByTestId('playback-cursor').style.left).toBe('39px');
  });

  it('does not read the map or draw a cursor while idle', async () => {
    const { score } = setup('idle');
    await act(async () => {});
    expect(score.segmentPositions).not.toHaveBeenCalled();
    expect(screen.queryByTestId('playback-cursor')).toBeNull();
  });
});

describe('page following', () => {
  it('turns to the playback page, and treats that turn as its own', async () => {
    const { tick, goToPage, setPage } = setup();
    await waitFor(() => expect(getFollowState().tracking).toBe('segment'));
    tick(2100);
    expect(goToPage).toHaveBeenCalledWith(1);
    expect(getFollowState().playbackPage).toBe(1);
    setPage(1);
    expect(getFollowState()).toMatchObject({ suspended: false, playbackPage: null });
    expect(screen.getByTestId('playback-cursor').dataset.elementId).toBe('2');
  });

  it('suspends on manual paging or scrolling until Resume following, then reveals once', async () => {
    const { tick, goToPage, setPage } = setup();
    await waitFor(() => expect(getFollowState().tracking).toBe('segment'));
    tick(500);
    setPage(1);
    expect(getFollowState().suspended).toBe(true);
    tick(1200);
    expect(goToPage).not.toHaveBeenCalled();
    expect(getFollowState().playbackPage).toBe(0);
    act(() => resumeFollowing());
    expect(goToPage).toHaveBeenCalledWith(0);
    expect(getFollowState().suspended).toBe(false);

    setPage(0);
    act(() => {
      screen.getByTestId('scroll').dispatchEvent(new WheelEvent('wheel'));
    });
    expect(getFollowState().suspended).toBe(true);
    act(() => requestReveal());
    expect(getFollowState().suspended).toBe(true);
  });
});

describe('system following', () => {
  const layOut = (systemTop: number) => {
    const scroll = screen.getByTestId('scroll');
    Object.defineProperty(scroll, 'clientHeight', { value: 500, configurable: true });
    Object.defineProperty(scroll, 'clientWidth', { value: 800, configurable: true });
    scroll.getBoundingClientRect = () => ({ top: 0, left: 0 }) as DOMRect;
    (scroll.firstElementChild as HTMLElement).getBoundingClientRect = () =>
      ({ top: systemTop - 100, left: 0 }) as DOMRect;
  };

  it('scrolls a system outside the safe band into view, smoothly unless reduced motion is asked for', async () => {
    const { tick } = setup();
    layOut(900);
    await waitFor(() => expect(getFollowState().tracking).toBe('segment'));
    tick(100);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 825, left: 0, behavior: 'smooth' });
    // Same system: no viewport work while the cursor walks along it.
    tick(1100);
    expect(scrollTo).toHaveBeenCalledOnce();
  });

  it('jumps without animation under reduced motion', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
    const { tick } = setup();
    layOut(900);
    await waitFor(() => expect(getFollowState().tracking).toBe('segment'));
    tick(100);
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: 'auto' }));
  });
});

describe('contextual click-to-seek', () => {
  const note = () => {
    const element = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    element.setAttribute('class', 'Note');
    return element;
  };

  it('seeks a plain note click while playing, without selecting, and leaves other clicks alone', async () => {
    const { hook, transport } = setup();
    await waitFor(() => expect(getFollowState().tracking).toBe('segment'));
    const following = hook.result.current;
    const click = {
      target: note(),
      point: { x: 50, y: 150 },
      modified: false,
      noteInputActive: false,
    };
    let seeked = false;
    act(() => {
      seeked = following.seekFromClick(click);
    });
    expect(seeked).toBe(true);
    expect(transport.seek).toHaveBeenCalledWith(1000);
    expect(screen.getByTestId('playback-seek-marker')).toBeTruthy();

    expect(following.seekFromClick({ ...click, modified: true })).toBe(false);
    expect(following.seekFromClick({ ...click, noteInputActive: true })).toBe(false);
    expect(following.seekFromClick({ ...click, target: document.createElement('div') })).toBe(
      false,
    );
    expect(following.seekFromClick({ ...click, point: { x: 50, y: 10 } })).toBe(false);
    transport.stateRef.current = 'paused';
    expect(following.seekFromClick(click)).toBe(false);
    expect(transport.seek).toHaveBeenCalledOnce();
  });
});
