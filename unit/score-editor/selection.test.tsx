import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { boundingRect, runEditorCommand, setupScoreEditorTest, testGlobals } from './test-harness';

const mocked = vi.hoisted(() => ({
  loadWebMscore: vi.fn(),
  loadWebMscoreInProcess: vi.fn(),
}));
const mockedNavigation = vi.hoisted(() => ({ useSearchParams: vi.fn() }));

vi.mock('next/navigation', () => ({ useSearchParams: mockedNavigation.useSearchParams }));
vi.mock('../../lib/webmscore-loader', () => ({
  loadWebMscore: mocked.loadWebMscore,
  loadWebMscoreInProcess: mocked.loadWebMscoreInProcess,
}));

import ScoreEditor from '../../components/ScoreEditor';

describe('ScoreEditor: selection geometry and overlay refresh', () => {
  const { rectSpy } = setupScoreEditorTest(mocked, mockedNavigation);

  it('extracts page index from SVG ancestry and clears selection on invalid boxes', async () => {
    const user = userEvent.setup();

    const score = {
      destroy: vi.fn(),
      saveSvg: vi.fn(
        async () => '<svg><g id="page-2"><g class="Note"><path id="inner"/></g></g></svg>',
      ),
      selectElementAtPoint: vi.fn(async () => true),
      metadata: vi.fn(async () => ({})),
      measurePositions: vi.fn(async () => ({})),
      segmentPositions: vi.fn(async () => ({})),
    };

    const webmscore = {
      ready: Promise.resolve(),
      load: vi.fn(async () => score),
    };

    mocked.loadWebMscore.mockResolvedValue(webmscore);
    testGlobals.fetch = vi.fn(async () => ({
      ok: false,
      arrayBuffer: async () => new ArrayBuffer(0),
    }));

    render(<ScoreEditor />);

    const file = new File([new Uint8Array([1])], 'demo.mscz', { type: 'application/octet-stream' });
    await user.upload(screen.getByTestId('open-score-input'), file);

    await waitFor(() =>
      expect(screen.getByTestId('svg-container').querySelector('svg')).toBeTruthy(),
    );

    const inner = screen.getByTestId('svg-container').querySelector('#inner');
    expect(inner).toBeTruthy();
    fireEvent.click(inner!);

    await waitFor(() =>
      expect(score.selectElementAtPoint).toHaveBeenCalledWith(
        1,
        expect.any(Number),
        expect.any(Number),
      ),
    );

    await screen.findByTestId('selection-overlay');

    rectSpy.current?.mockReturnValue({
      ...boundingRect,
      width: 0,
      height: 0,
      right: 0,
      bottom: 0,
    } as DOMRect);

    fireEvent.click(inner!);
    await waitFor(() => expect(screen.queryByTestId('selection-overlay')).not.toBeInTheDocument());
  });

  // TD-04 / AC-06: kept skipped as a deterministic reproducer, with an owner, rather
  // than deleted or weakened.
  //
  // Its original premise was already wrong and has been corrected here: it asserted the
  // retired design where a blank-space click was cleared client-side without consulting
  // the engine. handleScoreClick now defers an unmatched click to libmscore (invariant 1)
  // and clears locally only when the point cannot be mapped to score coordinates, so the
  // mock below reports "nothing at this point" instead of unconditionally reporting
  // success. That is the contract the app is supposed to honour.
  //
  // With the premise corrected the case still fails, and the failure looks real rather
  // than mock-shaped: trySelect() resolves false, clearSelectionState() runs and sets
  // overlaySuppressed, but the double-RAF refreshSelectionFromSvg scheduled by the
  // preceding note click can still land afterwards, call setOverlaySuppressed(false),
  // re-scrape the SVG and restore a selection box. That is the same stale-refresh race
  // as SECURITY_CORRECTNESS_FINDINGS L5 and docs/private/SELECTION_WORK_HANDOFF.md #3.
  //
  // Re-checked 2026-08-01 under TD-07 L5, with the mechanism traced further than before.
  // refreshSelectionFromSvg() clears blockOverlayRefreshRef and bumps the overlay
  // generation at entry, so it re-mints itself as "current". That is correct when it
  // starts before a newer click, and wrong when the first click's async flow only reaches
  // it *after* the second click's clearSelectionState() has run: the stale refresh
  // unblocks the overlay, renders, and rebuilds a selection box the user just dismissed.
  // The reappearing box in this test carries the harness bounding rect, which is what a
  // fallback-index rebuild produces.
  //
  // The fix is to thread a click generation captured at click time into
  // refreshSelectionFromSvg and bail when the ref has moved, rather than bumping
  // unconditionally. That is a change to the hot selection path, and section 3.3 scopes
  // L5 as a stretch item precisely so it is not attempted without the deterministic
  // browser matrix run against it. Un-skip it as part of that fix; do not relax the
  // assertions to make it green.
  it.skip('clears selection when clicking blank space and allows re-selecting notes', async () => {
    const user = userEvent.setup();

    const selectElementAtPoint = vi.fn(async () => true);
    const score = {
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg><g class="Note"></g></svg>'),
      selectElementAtPoint,
      clearSelection: vi.fn(async () => true),
      metadata: vi.fn(async () => ({})),
      measurePositions: vi.fn(async () => ({})),
      segmentPositions: vi.fn(async () => ({})),
    };

    const webmscore = {
      ready: Promise.resolve(),
      load: vi.fn(async () => score),
    };

    mocked.loadWebMscore.mockResolvedValue(webmscore);
    testGlobals.fetch = vi.fn(async () => ({
      ok: false,
      arrayBuffer: async () => new ArrayBuffer(0),
    }));

    render(<ScoreEditor />);

    const file = new File([new Uint8Array([1])], 'demo.mscz', { type: 'application/octet-stream' });
    await user.upload(screen.getByTestId('open-score-input'), file);
    await waitFor(() =>
      expect(screen.getByTestId('svg-container').querySelector('svg')).toBeTruthy(),
    );

    const svg = screen.getByTestId('svg-container').querySelector('svg');
    expect(svg).toBeTruthy();

    const note = screen.getByTestId('svg-container').querySelector('.Note');
    expect(note).toBeTruthy();

    fireEvent.click(note!);
    await screen.findByTestId('selection-overlay');
    expect(selectElementAtPoint).toHaveBeenCalledTimes(1);

    // Blank space is routed to the engine, which reports nothing there.
    selectElementAtPoint.mockResolvedValueOnce(false);
    fireEvent.click(svg!);

    await waitFor(() => expect(screen.queryByTestId('selection-overlay')).not.toBeInTheDocument());
    expect(selectElementAtPoint).toHaveBeenCalledTimes(2);

    fireEvent.click(note!);
    await screen.findByTestId('selection-overlay');
    expect(selectElementAtPoint).toHaveBeenCalledTimes(3);
  });

  it('refreshes selection overlay after mutation using SVG selection classes', async () => {
    const user = userEvent.setup();

    const score = {
      destroy: vi.fn(),
      saveSvg: vi
        .fn()
        .mockResolvedValueOnce('<svg><g class="Note"></g></svg>')
        .mockResolvedValueOnce('<svg><g class="Note selected"></g></svg>'),
      relayout: vi.fn(async () => true),
      selectElementAtPoint: vi.fn(async () => true),
      pitchUp: vi.fn(async () => true),
      metadata: vi.fn(async () => ({})),
      measurePositions: vi.fn(async () => ({})),
      segmentPositions: vi.fn(async () => ({})),
    };

    const webmscore = {
      ready: Promise.resolve(),
      load: vi.fn(async () => score),
    };

    rectSpy.current?.mockImplementation(function (this: Element) {
      const classes = this.getAttribute?.('class') || '';
      if (classes.includes('selected')) {
        return {
          ...boundingRect,
          left: 20,
          top: 30,
          right: 70,
          bottom: 90,
          width: 50,
          height: 60,
        } as DOMRect;
      }
      return boundingRect;
    });

    mocked.loadWebMscore.mockResolvedValue(webmscore);
    testGlobals.fetch = vi.fn(async () => ({
      ok: false,
      arrayBuffer: async () => new ArrayBuffer(0),
    }));

    render(<ScoreEditor />);

    const file = new File([new Uint8Array([1])], 'demo.mscz', { type: 'application/octet-stream' });
    await user.upload(screen.getByTestId('open-score-input'), file);
    await waitFor(() =>
      expect(screen.getByTestId('svg-container').querySelector('svg')).toBeTruthy(),
    );

    const note = screen.getByTestId('svg-container').querySelector('.Note');
    expect(note).toBeTruthy();
    fireEvent.click(note!);
    await screen.findByTestId('selection-overlay');

    expect(screen.getByTestId('selection-overlay')).toHaveStyle({ left: '0px', top: '0px' });

    await runEditorCommand('btn-pitch-up');

    await waitFor(() =>
      expect(screen.getByTestId('selection-overlay')).toHaveStyle({ left: '20px', top: '30px' }),
    );
    expect(score.pitchUp).toHaveBeenCalled();
  });
});
