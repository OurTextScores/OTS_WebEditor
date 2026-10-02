import { render, screen, waitFor } from '@testing-library/react';
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

describe('ScoreEditor: zoom and export bindings', () => {
  setupScoreEditorTest(mocked, mockedNavigation);

  it('zooms in/out and clamps zoom limits', async () => {
    const user = userEvent.setup();
    render(<ScoreEditor />);

    const wrapper = screen.getByTestId('score-wrapper');
    expect(wrapper).toHaveStyle({ transform: 'scale(1)' });

    for (let i = 0; i < 20; i++) {
      await user.click(screen.getByTestId('btn-zoom-out'));
    }
    expect(wrapper).toHaveStyle({ transform: 'scale(0.01)' });

    for (let i = 0; i < 50; i++) {
      await user.click(screen.getByTestId('btn-zoom-in'));
    }
    expect(wrapper).toHaveStyle({ transform: 'scale(1)' });
  }, 10000);

  it('exports PDF/PNG/MXL/MSCZ/MSCX/MusicXML/ABC/MIDI via Score methods', async () => {
    const user = userEvent.setup();

    const score = {
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg><g class="Note"></g></svg>'),
      savePdf: vi.fn(async () => new Uint8Array([1])),
      savePng: vi.fn(async () => new Uint8Array([2])),
      saveMxl: vi.fn(async () => new Uint8Array([3])),
      saveMsc: vi.fn(async () => new Uint8Array([4])),
      saveXml: vi.fn(async () =>
        new TextEncoder().encode(
          '<score-partwise version="3.1"><part-list/><part id="P1"><measure number="1"/></part></score-partwise>',
        ),
      ),
      saveMidi: vi.fn(async () => new Uint8Array([5])),
      metadata: vi.fn(async () => ({})),
      measurePositions: vi.fn(async () => ({})),
      segmentPositions: vi.fn(async () => ({})),
    };

    const webmscore = {
      ready: Promise.resolve(),
      load: vi.fn(async () => score),
    };

    mocked.loadWebMscore.mockResolvedValue(webmscore);
    testGlobals.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/music/convert')) {
        return {
          ok: true,
          headers: new Headers(),
          json: async () => ({ content: 'X:1\nM:4/4\nK:C\nC D E F|' }),
          arrayBuffer: async () => new ArrayBuffer(0),
        };
      }
      return {
        ok: false,
        headers: new Headers(),
        json: async () => ({}),
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    });

    testGlobals.URL.createObjectURL = vi.fn(() => 'blob:mock');
    testGlobals.URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<ScoreEditor />);

    const file = new File([new Uint8Array([1])], 'demo.mscz', { type: 'application/octet-stream' });
    await user.upload(screen.getByTestId('open-score-input'), file);

    await waitFor(() =>
      expect(screen.getByTestId('svg-container').querySelector('svg')).toBeTruthy(),
    );

    await runEditorCommand('btn-export-pdf');
    await runEditorCommand('btn-export-png');
    await expect(screen.findByTestId('png-export-page-input')).resolves.toHaveValue(1);
    await user.click(await screen.findByTestId('btn-confirm-export-png'));
    await runEditorCommand('btn-export-mxl');
    await runEditorCommand('btn-export-mscz');
    await runEditorCommand('btn-export-mscx');
    await runEditorCommand('btn-export-musicxml');
    await runEditorCommand('btn-export-abc');
    await runEditorCommand('btn-export-midi');

    await waitFor(() => expect(score.savePdf).toHaveBeenCalled());
    await waitFor(() => expect(score.savePng).toHaveBeenCalledWith(0, true, true));
    await waitFor(() => expect(score.saveMxl).toHaveBeenCalled());
    await waitFor(() => expect(score.saveMsc).toHaveBeenCalledWith('mscz'));
    await waitFor(() => expect(score.saveMsc).toHaveBeenCalledWith('mscx'));
    await waitFor(() => expect(score.saveXml).toHaveBeenCalled());
    await waitFor(() => expect(score.saveMidi).toHaveBeenCalledWith(true, true));
    await waitFor(() => expect(testGlobals.URL.createObjectURL).toHaveBeenCalled());
    await waitFor(() =>
      expect(testGlobals.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/music/convert'),
        expect.any(Object),
      ),
    );
  }, 10000);

  it('alerts when optional export bindings are missing', async () => {
    const user = userEvent.setup();

    const score = {
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg></svg>'),
      savePdf: vi.fn(async () => new Uint8Array([1])),
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

    await runEditorCommand('btn-export-mxl');
    expect(noticeTitles()).toContain('MXL export is not available in this build.');

    await runEditorCommand('btn-export-mscz');
    expect(noticeTitles()).toContain('MSCZ export is not available in this build.');

    await runEditorCommand('btn-export-mscx');
    expect(noticeTitles()).toContain('MSCX export is not available in this build.');

    await runEditorCommand('btn-export-musicxml');
    expect(noticeTitles()).toContain('MusicXML export is not available in this build.');

    await runEditorCommand('btn-export-abc');
    expect(noticeTitles()).toContain('ABC export is not available in this build.');

    await runEditorCommand('btn-export-midi');
    expect(noticeTitles()).toContain('MIDI export is not available in this build.');
  });

  // TD-04: this and the two cases below were skipped because they asserted a retired
  // transport vocabulary (Play -> "Working…" -> "Replay"). PlaybackSection now renders
  // Play / Pause / Resume and gates startup by disabling the button rather than
  // relabelling it. The assertions are restated against the current contract; the
  // behavior under test -- render once, reuse the cached object URL, stop resets -- is
  // unchanged.
});
