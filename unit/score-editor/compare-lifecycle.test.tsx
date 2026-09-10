import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { setupScoreEditorTest, testGlobals } from './test-harness';

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

describe('ScoreEditor: compare pane lifecycle, routing and audio teardown', () => {
  const { params } = setupScoreEditorTest(mocked, mockedNavigation);

  it('highlights a compare selection and retires its score safely during an in-flight edit', async () => {
    const user = userEvent.setup();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list>
  <part id="P1"><measure number="1"><note><rest/><duration>4</duration><type>whole</type></note></measure></part>
</score-partwise>`;
    let resolveInsert!: (value: boolean) => void;
    const insertPending = new Promise<boolean>((resolve) => {
      resolveInsert = resolve;
    });
    let resolveNoteEntryDisable!: (value: boolean) => void;
    const noteEntryDisablePending = new Promise<boolean>((resolve) => {
      resolveNoteEntryDisable = resolve;
    });
    const makeScore = () => ({
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg width="100" height="40"></svg>'),
      saveXml: vi.fn(async () => new TextEncoder().encode(xml)),
      setSoundFont: vi.fn(async () => {}),
      setNoteEntryMode: vi.fn(async () => true),
      metadata: vi.fn(async () => ({ parts: [{ name: 'Music' }] })),
      measurePositions: vi.fn(async () => ({
        elements: [{ id: 0, x: 0, y: 0, sx: 100, sy: 40, page: 0 }],
        events: [],
        pageSize: { width: 100, height: 40 },
      })),
      segmentPositions: vi.fn(async () => ({})),
      npages: vi.fn(async () => 1),
      relayout: vi.fn(async () => true),
      selectElementAtPointWithMode: vi.fn(async () => true),
      getSelectionBoundingBoxes: vi.fn(async () => [
        {
          page: 0,
          x: 12,
          y: 8,
          width: 18,
          height: 14,
        },
      ]),
    });
    const mainScore = makeScore();
    const auxiliaryScore = {
      ...makeScore(),
      insertMeasures: vi.fn(() => insertPending),
      setNoteEntryMode: vi.fn((enabled: boolean) =>
        enabled ? Promise.resolve(true) : noteEntryDisablePending,
      ),
    };
    const webmscore = {
      ready: Promise.resolve(),
      load: vi.fn().mockResolvedValueOnce(mainScore).mockResolvedValueOnce(auxiliaryScore),
    };

    params.values = {
      compareLeft: '/left.musicxml',
      compareRight: '/right.musicxml',
    };
    mocked.loadWebMscore.mockResolvedValue(webmscore);
    testGlobals.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/left.musicxml') || url.endsWith('/right.musicxml')) {
        return {
          ok: true,
          text: async () => xml,
          arrayBuffer: async () => new TextEncoder().encode(xml).buffer,
        };
      }
      return {
        ok: false,
        text: async () => '',
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    });

    const { unmount } = render(<ScoreEditor />);
    await waitFor(() => expect(auxiliaryScore.saveSvg).toHaveBeenCalled());
    const leftPane = await screen.findByTestId('compare-pane-left');
    const selectionSurface = leftPane.querySelector('[title^="Click to select this score"]');
    expect(selectionSurface).toBeTruthy();
    fireEvent.click(selectionSurface!, { clientX: 30, clientY: 20 });
    await waitFor(() =>
      expect(auxiliaryScore.selectElementAtPointWithMode).toHaveBeenCalledWith(
        0,
        expect.any(Number),
        expect.any(Number),
        0,
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId('compare-selection-overlay-left')).toHaveStyle({
        left: '12px',
        top: '8px',
        width: '18px',
        height: '14px',
      }),
    );
    auxiliaryScore.getSelectionBoundingBoxes.mockResolvedValueOnce([]);
    fireEvent.click(selectionSurface!, { clientX: 30, clientY: 20, ctrlKey: true });
    await waitFor(() =>
      expect(auxiliaryScore.selectElementAtPointWithMode).toHaveBeenLastCalledWith(
        0,
        expect.any(Number),
        expect.any(Number),
        2,
      ),
    );
    await waitFor(() =>
      expect(screen.queryByTestId('compare-selection-overlay-left')).not.toBeInTheDocument(),
    );
    expect(auxiliaryScore.saveSvg.mock.calls.every((call: unknown[]) => call[2] === true)).toBe(
      true,
    );

    await user.click(await screen.findByTestId('btn-compare-add-bar-left'));
    await waitFor(() => expect(auxiliaryScore.insertMeasures).toHaveBeenCalledWith(1, 3));

    unmount();
    expect(auxiliaryScore.destroy).not.toHaveBeenCalled();

    resolveInsert(true);
    await waitFor(() => expect(auxiliaryScore.setNoteEntryMode).toHaveBeenLastCalledWith(false));
    expect(auxiliaryScore.destroy).not.toHaveBeenCalled();

    resolveNoteEntryDisable(true);
    await waitFor(() => expect(auxiliaryScore.destroy).toHaveBeenCalledOnce());
    expect(auxiliaryScore.setNoteEntryMode.mock.invocationCallOrder.at(-1)).toBeLessThan(
      auxiliaryScore.destroy.mock.invocationCallOrder[0],
    );
  });

  // AC-16 of the editable-compare design: publishing an edited proposal must not reload
  // or destroy the auxiliary Score it came from. The guard is one ref assignment in
  // commitCompareProposalXml; the AC-13 walk found nothing holding it in place.

  it('publishes an edited proposal without reloading its auxiliary score', async () => {
    const user = userEvent.setup();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list>
  <part id="P1"><measure number="1"><note><rest/><duration>4</duration><type>whole</type></note></measure></part>
</score-partwise>`;
    // The publish only skips the reload because the ref is updated first. If the exported
    // XML matched what was loaded, the effect would skip for the wrong reason and this
    // test would pass with the guard removed.
    const editedXml = xml.replace('</part>', '<measure number="2"/></part>');
    let edited = false;
    const makeScore = () => ({
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg width="100" height="40"></svg>'),
      saveXml: vi.fn(async () => new TextEncoder().encode(edited ? editedXml : xml)),
      setSoundFont: vi.fn(async () => {}),
      setNoteEntryMode: vi.fn(async () => true),
      metadata: vi.fn(async () => ({ parts: [{ name: 'Music' }] })),
      measurePositions: vi.fn(async () => ({
        elements: [{ id: 0, x: 0, y: 0, sx: 100, sy: 40, page: 0 }],
        events: [],
        pageSize: { width: 100, height: 40 },
      })),
      segmentPositions: vi.fn(async () => ({})),
      npages: vi.fn(async () => 1),
      relayout: vi.fn(async () => true),
      selectElementAtPointWithMode: vi.fn(async () => true),
      getSelectionBoundingBoxes: vi.fn(async () => []),
    });
    const mainScore = makeScore();
    const auxiliaryScore = {
      ...makeScore(),
      insertMeasures: vi.fn(async () => {
        edited = true;
        return true;
      }),
    };
    const webmscore = {
      ready: Promise.resolve(),
      load: vi.fn().mockResolvedValueOnce(mainScore).mockResolvedValueOnce(auxiliaryScore),
    };

    params.values = {
      compareLeft: '/left.musicxml',
      compareRight: '/right.musicxml',
    };
    mocked.loadWebMscore.mockResolvedValue(webmscore);
    testGlobals.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/left.musicxml') || url.endsWith('/right.musicxml')) {
        return {
          ok: true,
          text: async () => xml,
          arrayBuffer: async () => new TextEncoder().encode(xml).buffer,
        };
      }
      return { ok: false, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) };
    });

    render(<ScoreEditor />);
    await waitFor(() => expect(auxiliaryScore.saveSvg).toHaveBeenCalled());
    expect(webmscore.load).toHaveBeenCalledTimes(2);

    // The left pane holds the auxiliary score, which carries the proposal role in embed
    // compare, so + Bar here runs the proposal publish path.
    await user.click(await screen.findByTestId('btn-compare-add-bar-left'));
    await waitFor(() => expect(auxiliaryScore.insertMeasures).toHaveBeenCalled());
    await waitFor(() => expect(auxiliaryScore.saveXml).toHaveBeenCalled());

    // The publish updates compareView.checkpointXml. Without the ref guard the compare
    // lifecycle reads that as a new checkpoint, tears the auxiliary down and loads a
    // third score -- mid-edit, against the instance the user is working in.
    await waitFor(() => expect(auxiliaryScore.saveSvg.mock.calls.length).toBeGreaterThan(1));
    expect(auxiliaryScore.destroy).not.toHaveBeenCalled();
    expect(webmscore.load).toHaveBeenCalledTimes(2);
  });

  it('does not start compare audio after close cancels soundfont setup', async () => {
    const user = userEvent.setup();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list>
  <part id="P1"><measure number="1"><note><rest/><duration>4</duration><type>whole</type></note></measure></part>
</score-partwise>`;
    let releaseAuxiliarySoundFont!: () => void;
    const auxiliarySoundFontPending = new Promise<void>((resolve) => {
      releaseAuxiliarySoundFont = resolve;
    });
    const commonScoreMethods = {
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg width="100" height="40"></svg>'),
      saveXml: vi.fn(async () => new TextEncoder().encode(xml)),
      metadata: vi.fn(async () => ({ parts: [{ name: 'Music' }] })),
      measurePositions: vi.fn(async () => ({
        elements: [{ id: 0, x: 0, y: 0, sx: 100, sy: 40, page: 0 }],
        events: [],
        pageSize: { width: 100, height: 40 },
      })),
      segmentPositions: vi.fn(async () => ({})),
      npages: vi.fn(async () => 1),
      setNoteEntryMode: vi.fn(async () => true),
    };
    const mainScore = {
      ...commonScoreMethods,
      destroy: vi.fn(),
      setSoundFont: vi.fn(async () => {}),
    };
    const auxiliaryScore = {
      ...commonScoreMethods,
      destroy: vi.fn(),
      setSoundFont: vi.fn(() => auxiliarySoundFontPending),
      synthAudioBatch: vi.fn(async () => vi.fn(async () => [])),
    };

    params.values = {
      compareLeft: '/left.musicxml',
      compareRight: '/right.musicxml',
    };
    mocked.loadWebMscore.mockResolvedValue({
      ready: Promise.resolve(),
      load: vi.fn().mockResolvedValueOnce(mainScore).mockResolvedValueOnce(auxiliaryScore),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/left.musicxml') || url.endsWith('/right.musicxml')) {
          return {
            ok: true,
            text: async () => xml,
            arrayBuffer: async () => new TextEncoder().encode(xml).buffer,
          };
        }
        if (url.includes('/soundfonts/')) {
          return {
            ok: true,
            text: async () => '',
            arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
          };
        }
        return {
          ok: false,
          text: async () => '',
          arrayBuffer: async () => new ArrayBuffer(0),
        };
      }),
    );

    const { unmount } = render(<ScoreEditor />);
    await waitFor(() => expect(auxiliaryScore.saveSvg).toHaveBeenCalled());
    await user.click(await screen.findByTestId('btn-compare-play-left'));
    await waitFor(() => expect(auxiliaryScore.setSoundFont).toHaveBeenCalledOnce());

    unmount();
    releaseAuxiliarySoundFont();

    await waitFor(() => expect(auxiliaryScore.destroy).toHaveBeenCalledOnce());
    expect(auxiliaryScore.synthAudioBatch).not.toHaveBeenCalled();
  });

  it('ignores compare mutations before activation and routes shortcuts to the displayed score', async () => {
    const user = userEvent.setup();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list>
  <part id="P1"><measure number="1"><note><rest/><duration>4</duration><type>whole</type></note></measure></part>
</score-partwise>`;
    const makeScore = () => ({
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg width="100" height="40"></svg>'),
      saveXml: vi.fn(async () => new TextEncoder().encode(xml)),
      setSoundFont: vi.fn(async () => {}),
      setNoteEntryMode: vi.fn(async () => true),
      metadata: vi.fn(async () => ({ parts: [{ name: 'Music' }] })),
      measurePositions: vi.fn(async () => ({
        elements: [{ id: 0, x: 0, y: 0, sx: 100, sy: 40, page: 0 }],
        events: [],
        pageSize: { width: 100, height: 40 },
      })),
      segmentPositions: vi.fn(async () => ({})),
      npages: vi.fn(async () => 1),
      relayout: vi.fn(async () => true),
      selectAll: vi.fn(async () => true),
      pitchUp: vi.fn(async () => true),
      getSelectionBoundingBoxes: vi.fn(async () => [
        {
          page: 0,
          x: 12,
          y: 8,
          width: 18,
          height: 14,
        },
      ]),
    });
    const mainScore = makeScore();
    const auxiliaryScore = makeScore();
    const webmscore = {
      ready: Promise.resolve(),
      load: vi.fn().mockResolvedValueOnce(mainScore).mockResolvedValueOnce(auxiliaryScore),
    };

    params.values = {
      compareLeft: '/left.musicxml',
      compareRight: '/right.musicxml',
    };
    mocked.loadWebMscore.mockResolvedValue(webmscore);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/left.musicxml') || url.endsWith('/right.musicxml')) {
          return {
            ok: true,
            text: async () => xml,
            arrayBuffer: async () => new TextEncoder().encode(xml).buffer,
          };
        }
        return {
          ok: false,
          text: async () => '',
          arrayBuffer: async () => new ArrayBuffer(0),
        };
      }),
    );

    render(<ScoreEditor />);
    await waitFor(() => expect(auxiliaryScore.saveSvg).toHaveBeenCalled());

    fireEvent.keyDown(window, { key: 'a', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(auxiliaryScore.selectAll).not.toHaveBeenCalled();
    expect(auxiliaryScore.pitchUp).not.toHaveBeenCalled();
    expect(mainScore.selectAll).not.toHaveBeenCalled();
    expect(mainScore.pitchUp).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('btn-compare-activate-left'));
    fireEvent.keyDown(window, { key: 'a', ctrlKey: true });
    await waitFor(() => expect(auxiliaryScore.selectAll).toHaveBeenCalledOnce());
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    await waitFor(() => expect(auxiliaryScore.pitchUp).toHaveBeenCalledOnce());
    expect(mainScore.selectAll).not.toHaveBeenCalled();
    expect(mainScore.pitchUp).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('btn-compare-activate-right'));
    fireEvent.keyDown(window, { key: 'a', ctrlKey: true });
    await waitFor(() => expect(mainScore.selectAll).toHaveBeenCalledOnce());
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    await waitFor(() => expect(mainScore.pitchUp).toHaveBeenCalledOnce());
    expect(auxiliaryScore.selectAll).toHaveBeenCalledOnce();
    expect(auxiliaryScore.pitchUp).toHaveBeenCalledOnce();
  });
});
