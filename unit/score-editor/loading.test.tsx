import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { noticeTitles, runEditorCommand, setupScoreEditorTest, testGlobals } from './test-harness';

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

describe('ScoreEditor: loading, format detection and progressive layout', () => {
  const { params } = setupScoreEditorTest(mocked, mockedNavigation);

  it('loads a score from file upload, supports selection, and applies clef', async () => {
    const user = userEvent.setup();

    const score = {
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg><g class="Note"></g></svg>'),
      savePdf: vi.fn(async () => new Uint8Array([1])),
      setSoundFont: vi.fn(async () => {}),
      metadata: vi.fn(async () => ({})),
      measurePositions: vi.fn(async () => ({})),
      segmentPositions: vi.fn(async () => ({})),
      selectElementAtPoint: vi.fn(async () => true),
      setClef: vi.fn(async () => true),
      relayout: vi.fn(async () => true),
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

    const file = new File([new Uint8Array([1, 2, 3])], 'demo.mscz', {
      type: 'application/octet-stream',
    });
    await user.upload(screen.getByTestId('open-score-input'), file);

    await waitFor(() => expect(webmscore.load).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTestId('svg-container').querySelector('svg')).toBeTruthy(),
    );

    const note = screen.getByTestId('svg-container').querySelector('.Note');
    expect(note).toBeTruthy();
    fireEvent.click(note!);

    await screen.findByTestId('selection-overlay');

    await runEditorCommand('btn-clef-0');

    await waitFor(() => expect(score.setClef).toHaveBeenCalledWith(0));
    expect(score.relayout).toHaveBeenCalled();
    expect(score.selectElementAtPoint.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  // Regression: handleOpenScoreInEditor hardcoded '/score-editor/index.html', which only
  // exists in the embed build (next.config.ts sets that basePath for BUILD_MODE=embed and
  // exports a static index.html). Every other deployment serves the app at the root, so
  // "Open in Editor" opened a 404. Found by the deterministic browser matrix.
  it.each([
    ['embed', 'embed', '/score-editor/index.html'],
    ['a root deployment', undefined, '/'],
  ])(
    'opens the full editor at the deployed base path in %s',
    async (_label, buildMode, expectedUrl) => {
      vi.stubEnv('NEXT_PUBLIC_BUILD_MODE', buildMode as string);
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list>
  <part id="P1"><measure number="1"><note><rest/><duration>4</duration><type>whole</type></note></measure></part>
</score-partwise>`;
      const makeScore = () => ({
        destroy: vi.fn(),
        saveSvg: vi.fn(async () => '<svg><g class="Note"></g></svg>'),
        saveMusicXml: vi.fn(async () => xml),
        metadata: vi.fn(async () => ({ parts: [{ name: 'Music' }] })),
        measurePositions: vi.fn(async () => ({
          elements: [{ id: 0, x: 0, y: 0, sx: 100, sy: 40, page: 0 }],
          events: [],
          pageSize: { width: 100, height: 40 },
        })),
        segmentPositions: vi.fn(async () => ({})),
        npages: vi.fn(async () => 1),
      });
      const auxiliaryScore = makeScore();
      const webmscore = {
        ready: Promise.resolve(),
        load: vi.fn().mockResolvedValueOnce(makeScore()).mockResolvedValueOnce(auxiliaryScore),
      };

      params.values = {
        compareLeft: '/left.musicxml',
        compareRight: '/right.musicxml',
      };
      mocked.loadWebMscore.mockResolvedValue(webmscore);
      testGlobals.fetch = vi.fn(async () => ({
        ok: true,
        text: async () => xml,
        arrayBuffer: async () => new TextEncoder().encode(xml).buffer,
      }));
      const openSpy = vi.fn(() => null);
      testGlobals.open = openSpy;

      const { unmount } = render(<ScoreEditor />);
      await waitFor(() => expect(auxiliaryScore.saveSvg).toHaveBeenCalled());

      const openButtons = await screen.findAllByTitle('Open this score in the full editor');
      fireEvent.click(openButtons[0]);

      expect(openSpy).toHaveBeenCalledWith(expectedUrl, '_blank');
      unmount();
    },
  );

  it('detects .mxl uploads and loads them with mxl format', async () => {
    const user = userEvent.setup();
    const largeData = new Uint8Array(2 * 1024 * 1024 + 8);

    const score = {
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg></svg>'),
      savePdf: vi.fn(async () => new Uint8Array([1])),
      setSoundFont: vi.fn(async () => {}),
      metadata: vi.fn(async () => ({})),
      measurePositions: vi.fn(async () => ({})),
      segmentPositions: vi.fn(async () => ({})),
      npages: vi.fn(async () => 1),
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

    const file = new File([largeData], 'beethoven.mxl', {
      type: 'application/vnd.recordare.musicxml',
    });
    await user.upload(screen.getByTestId('open-score-input'), file);

    await waitFor(() => expect(webmscore.load).toHaveBeenCalled());
    expect(webmscore.load).toHaveBeenNthCalledWith(1, 'mxl', expect.any(Uint8Array), [], false);
  });

  it('detects .mscz uploads and starts with deferred load', async () => {
    const user = userEvent.setup();
    const largeData = new Uint8Array(2 * 1024 * 1024 + 256);
    const score = {
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg></svg>'),
      savePdf: vi.fn(async () => new Uint8Array([1])),
      setSoundFont: vi.fn(async () => {}),
      metadata: vi.fn(async () => ({})),
      measurePositions: vi.fn(async () => ({})),
      segmentPositions: vi.fn(async () => ({})),
      npages: vi.fn(async () => 1),
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

    const file = new File([largeData], 'beethoven.mscz', {
      type: 'application/octet-stream',
    });
    await user.upload(screen.getByTestId('open-score-input'), file);

    await waitFor(() => expect(webmscore.load).toHaveBeenCalled());
    expect(webmscore.load).toHaveBeenNthCalledWith(1, 'mscz', expect.any(Uint8Array), [], false);
  });

  it('progressively lays out the next page when navigating large .musicxml scores', async () => {
    const user = userEvent.setup();
    const largeData = new Uint8Array(2 * 1024 * 1024 + 8);
    let pages = 1;

    const score = {
      destroy: vi.fn(),
      saveSvg: vi.fn(
        async (pageIndex?: number) => `<svg><text>page-${pageIndex ?? 0}</text></svg>`,
      ),
      savePdf: vi.fn(async () => new Uint8Array([1])),
      savePng: vi.fn(async () => new Uint8Array([2])),
      setSoundFont: vi.fn(async () => {}),
      metadata: vi.fn(async () => ({})),
      measurePositions: vi.fn(async () => ({})),
      segmentPositions: vi.fn(async () => ({})),
      layoutUntilPage: vi.fn(async (targetPage: number) => {
        if (targetPage === 0) {
          pages = 1;
          return true;
        }
        if (targetPage === 1) {
          pages = 2;
          return true;
        }
        return false;
      }),
      npages: vi.fn(async () => pages),
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

    const file = new File([largeData], 'beethoven.musicxml', { type: 'application/xml' });
    await user.upload(screen.getByTestId('open-score-input'), file);

    await waitFor(() =>
      expect(webmscore.load).toHaveBeenNthCalledWith(
        1,
        'musicxml',
        expect.any(Uint8Array),
        [],
        false,
      ),
    );
    await waitFor(() => expect(score.layoutUntilPage).toHaveBeenCalledWith(0));
    await waitFor(() =>
      expect(screen.getByTestId('page-indicator').textContent).toContain('of 1+'),
    );

    await user.click(screen.getByRole('button', { name: 'Next page' }));

    await waitFor(() => expect(score.layoutUntilPage).toHaveBeenCalledWith(1));
    await waitFor(() =>
      expect(screen.getByTestId('page-indicator').textContent).toContain('of 2+'),
    );
    await waitFor(() => expect(score.saveSvg).toHaveBeenCalledWith(1, true, true));

    await runEditorCommand('btn-export-png');
    await expect(screen.findByTestId('png-export-page-input')).resolves.toHaveValue(2);
    await user.click(await screen.findByTestId('btn-confirm-export-png'));
    await waitFor(() => expect(score.savePng).toHaveBeenCalledWith(1, true, true));
  });

  it('alerts when score load fails', async () => {
    const user = userEvent.setup();

    const webmscore = {
      ready: Promise.resolve(),
      load: vi.fn(async () => {
        throw new Error('boom');
      }),
    };

    mocked.loadWebMscore.mockResolvedValue(webmscore);
    testGlobals.fetch = vi.fn(async () => ({
      ok: false,
      arrayBuffer: async () => new ArrayBuffer(0),
    }));

    render(<ScoreEditor />);

    const file = new File([new Uint8Array([1])], 'bad.mscz', { type: 'application/octet-stream' });
    await user.upload(screen.getByTestId('open-score-input'), file);

    await waitFor(() =>
      expect(noticeTitles()).toContain('Failed to load score. See console for details.'),
    );
  });

  it('auto-loads a score from the URL query param', async () => {
    params.score = '/test_scores/demo.musicxml';

    const score = {
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg></svg>'),
    };

    const webmscore = {
      ready: Promise.resolve(),
      load: vi.fn(async () => score),
    };

    mocked.loadWebMscore.mockResolvedValue(webmscore);
    testGlobals.fetch = vi.fn(async (url: string) => {
      expect(url).toBe('/test_scores/demo.musicxml');
      return {
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      };
    });

    render(<ScoreEditor />);

    await waitFor(() => expect(webmscore.load).toHaveBeenCalled());
    expect(webmscore.load).toHaveBeenCalledWith('musicxml', expect.any(Uint8Array));
    await waitFor(() =>
      expect(screen.getByTestId('svg-container').querySelector('svg')).toBeTruthy(),
    );
  });

  it('does not report a failure, or touch the loading state, for a URL load that was aborted', async () => {
    params.score = '/test_scores/demo.musicxml';
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocked.loadWebMscore.mockResolvedValue({ ready: Promise.resolve(), load: vi.fn() });
    // A fetch that never answers, and fails the way a real one does when it is aborted.
    testGlobals.fetch = vi.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('signal is aborted without reason', 'AbortError')),
          );
        }),
    );

    const view = render(<ScoreEditor />);
    await waitFor(() => expect(testGlobals.fetch).toHaveBeenCalled());
    view.unmount();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(
      errors.mock.calls.filter((call) => String(call[0]).includes('Error auto-loading file')),
    ).toEqual([]);
    expect(noticeTitles()).toEqual([]);
    errors.mockRestore();
  });
});
