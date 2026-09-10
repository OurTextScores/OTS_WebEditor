import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { boundingRect, setupScoreEditorTest, testGlobals } from './test-harness';

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

describe('ScoreEditor: toolbar mutations, note input and keyboard shortcuts', () => {
  const { rectSpy } = setupScoreEditorTest(mocked, mockedNavigation);

  it('invokes mutation and export handlers from the toolbar', async () => {
    const user = userEvent.setup();

    const score = {
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg><g class="Note"></g></svg>'),
      savePdf: vi.fn(async () => new Uint8Array([1])),
      setSoundFont: vi.fn(async () => {}),
      metadata: vi.fn(async () => ({})),
      measurePositions: vi.fn(async () => ({})),
      segmentPositions: vi.fn(async () => ({})),
      relayout: vi.fn(async () => true),
      selectElementAtPoint: vi.fn(async () => true),
      pitchUp: vi.fn(async () => true),
      transpose: vi.fn(async () => true),
      setAccidental: vi.fn(async () => true),
      doubleDuration: vi.fn(async () => true),
      toggleDot: vi.fn(async () => true),
      changeSelectedElementsVoice: vi.fn(async () => true),
      addDynamic: vi.fn(async () => true),
      setTimeSignature: vi.fn(async () => true),
      setKeySignature: vi.fn(async () => true),
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

    testGlobals.URL.createObjectURL = vi.fn(() => 'blob:mock');
    testGlobals.URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

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

    await user.click(screen.getByTestId('btn-pitch-up'));
    await user.click(screen.getByTestId('btn-transpose-12'));
    await user.click(screen.getByTestId('btn-duration-longer'));
    await user.click(screen.getByTestId('dropdown-rhythm'));
    await user.click(await screen.findByTestId('btn-dot'));
    await user.click(screen.getByTestId('dropdown-voice'));
    await user.click(await screen.findByTestId('btn-voice-2'));
    await user.click(screen.getByTestId('dropdown-accidental'));
    await user.click(await screen.findByTestId('btn-acc-3'));
    await user.click(screen.getByTestId('dropdown-markings'));
    await user.click(await screen.findByTestId('btn-dynamic-6'));
    await user.click(screen.getByTestId('dropdown-signature'));
    await user.click(await screen.findByTestId('btn-timesig-4-4'));
    await user.click(screen.getByTestId('dropdown-key'));
    await user.click(await screen.findByTestId('btn-keysig-0'));

    await waitFor(() => expect(score.pitchUp).toHaveBeenCalled());
    await waitFor(() =>
      expect(score.transpose).toHaveBeenCalledWith(1, 0, 0, 25, true, true, true),
    );
    await waitFor(() => expect(score.setAccidental).toHaveBeenCalledWith(3));
    await waitFor(() => expect(score.doubleDuration).toHaveBeenCalled());
    await waitFor(() => expect(score.toggleDot).toHaveBeenCalled());
    await waitFor(() => expect(score.changeSelectedElementsVoice).toHaveBeenCalledWith(1));
    await waitFor(() => expect(score.addDynamic).toHaveBeenCalledWith(6));
    await waitFor(() => expect(score.setTimeSignature).toHaveBeenCalledWith(4, 4));
    await waitFor(() => expect(score.setKeySignature).toHaveBeenCalledWith(0));

    await user.click(screen.getByTestId('dropdown-export'));
    await user.click(await screen.findByTestId('btn-export-svg'));
    await waitFor(() => expect(score.saveSvg).toHaveBeenCalled());
    await waitFor(() => expect(testGlobals.URL.createObjectURL).toHaveBeenCalled());
  }, 15000);

  it('adds tempo text at the start of the score without requiring a selection', async () => {
    const user = userEvent.setup();

    const score = {
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg><g class="Note"></g></svg>'),
      relayout: vi.fn(async () => true),
      addTempoText: vi.fn(async () => true),
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
    expect(screen.queryByTestId('selection-overlay')).not.toBeInTheDocument();

    const tempoInput = screen.getByTestId('input-tempo-bpm');
    await user.clear(tempoInput);
    await user.type(tempoInput, '96');
    await user.click(screen.getByTestId('btn-tempo-apply'));

    await waitFor(() => expect(score.addTempoText).toHaveBeenCalledWith(96));
  });

  it('supports note respelling keyboard shortcuts', async () => {
    const user = userEvent.setup();

    const score = {
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg><g class="Note"></g></svg>'),
      relayout: vi.fn(async () => true),
      selectElementAtPoint: vi.fn(async () => true),
      addPitchByStep: vi.fn(async () => true),
      setAccidental: vi.fn(async () => true),
      setDurationType: vi.fn(async () => true),
      toggleDot: vi.fn(async () => true),
      enterRest: vi.fn(async () => true),
      addTie: vi.fn(async () => true),
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

    const note = screen.getByTestId('svg-container').querySelector('.Note');
    expect(note).toBeTruthy();
    fireEvent.click(note!);
    await screen.findByTestId('selection-overlay');

    fireEvent.keyDown(window, { key: '1' });
    await waitFor(() => expect(score.setDurationType).toHaveBeenCalledWith(8));

    fireEvent.keyDown(window, { key: '.' });
    await waitFor(() => expect(score.toggleDot).toHaveBeenCalled());

    fireEvent.keyDown(window, { key: '+' });
    await waitFor(() => expect(score.setAccidental).toHaveBeenCalledWith(3));

    fireEvent.keyDown(window, { key: '-' });
    await waitFor(() => expect(score.setAccidental).toHaveBeenCalledWith(1));

    fireEvent.keyDown(window, { key: '=' });
    await waitFor(() => expect(score.setAccidental).toHaveBeenCalledWith(2));

    fireEvent.keyDown(window, { key: 'c' });
    await waitFor(() => expect(score.addPitchByStep).toHaveBeenCalledWith(0, false, false));

    fireEvent.keyDown(window, { key: '0' });
    await waitFor(() => expect(score.enterRest).toHaveBeenCalled());

    fireEvent.keyDown(window, { key: 'T' });
    await waitFor(() => expect(score.addTie).toHaveBeenCalled());
  });

  it('shows and advances the engine note-input cursor without a prior UI selection', async () => {
    const user = userEvent.setup();
    let cursorX = 14;
    const score = {
      destroy: vi.fn(),
      saveSvg: vi.fn(
        async () => '<svg width="200" height="100"><g class="Rest selected"></g></svg>',
      ),
      setNoteEntryMode: vi.fn(async () => true),
      getNoteInputCursorRect: vi.fn(async () => ({
        page: 0,
        x: cursorX,
        y: 20,
        width: 18,
        height: 48,
        voice: 0,
      })),
      getSpatium: vi.fn(async () => 10),
      addPitchByStep: vi.fn(async () => {
        cursorX = 46;
        return true;
      }),
      relayout: vi.fn(async () => true),
      metadata: vi.fn(async () => ({})),
      measurePositions: vi.fn(async () => ({})),
      segmentPositions: vi.fn(async () => ({})),
    };
    mocked.loadWebMscore.mockResolvedValue({
      ready: Promise.resolve(),
      load: vi.fn(async () => score),
    });
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

    fireEvent.keyDown(window, { key: 'n' });
    await waitFor(() =>
      expect(screen.getByTestId('note-input-cursor')).toHaveStyle({
        left: '14px',
        top: '20px',
        width: '18px',
        height: '48px',
        borderLeft: '3px solid #0065BF',
      }),
    );

    fireEvent.keyDown(window, { key: 'c' });
    await waitFor(() => expect(score.addPitchByStep).toHaveBeenCalledWith(0, false, false));
    await waitFor(() =>
      expect(screen.getByTestId('note-input-cursor')).toHaveStyle({
        left: '46px',
      }),
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('note-input-cursor')).not.toBeInTheDocument());
    expect(score.setNoteEntryMode).toHaveBeenLastCalledWith(false);
  });

  it('advances selection with left/right arrows', async () => {
    const user = userEvent.setup();

    let selectedIndex: number | null = null;
    const score = {
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => {
        const firstSelected = selectedIndex === 0 ? ' selected' : '';
        const secondSelected = selectedIndex === 1 ? ' selected' : '';
        return `<svg><g class="Note note-1${firstSelected}"></g><g class="Note note-2${secondSelected}"></g></svg>`;
      }),
      selectElementAtPoint: vi.fn(async (_page: number, x: number) => {
        selectedIndex = x > 100 ? 1 : 0;
        return true;
      }),
      selectNextChord: vi.fn(async () => {
        selectedIndex = selectedIndex === null ? 0 : Math.min(1, selectedIndex + 1);
        return true;
      }),
      selectPrevChord: vi.fn(async () => {
        selectedIndex = selectedIndex === null ? 0 : Math.max(0, selectedIndex - 1);
        return true;
      }),
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
      if (classes.includes('note-2')) {
        return {
          ...boundingRect,
          left: 120,
          right: 220,
        } as DOMRect;
      }
      if (classes.includes('note-1')) {
        return {
          ...boundingRect,
          left: 0,
          right: 100,
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

    const notes = screen.getByTestId('svg-container').querySelectorAll('.Note');
    expect(notes.length).toBe(2);
    fireEvent.click(notes[0]!);
    await screen.findByTestId('selection-overlay');

    await waitFor(() =>
      expect(screen.getByTestId('selection-overlay')).toHaveStyle({ left: '0px' }),
    );

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await waitFor(() =>
      expect(screen.getByTestId('selection-overlay')).toHaveStyle({ left: '120px' }),
    );
    expect(score.selectNextChord).toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    await waitFor(() =>
      expect(screen.getByTestId('selection-overlay')).toHaveStyle({ left: '0px' }),
    );
    expect(score.selectPrevChord).toHaveBeenCalled();
  });

  it('alerts when a mutation binding is missing', async () => {
    const user = userEvent.setup();

    const score = {
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg><g class="Note"></g></svg>'),
      selectElementAtPoint: vi.fn(async () => true),
      relayout: vi.fn(async () => true),
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

    const note = screen.getByTestId('svg-container').querySelector('.Note');
    expect(note).toBeTruthy();
    fireEvent.click(note!);
    await screen.findByTestId('selection-overlay');

    await user.click(screen.getByTestId('dropdown-rhythm'));
    await user.click(await screen.findByTestId('btn-double-dot'));
    expect(testGlobals.alert).toHaveBeenCalledWith(
      'This build of webmscore does not expose "toggleDoubleDot".',
    );
  });

  it('clears selection on delete even when the binding is missing', async () => {
    const user = userEvent.setup();

    const score = {
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg><g class="Note"></g></svg>'),
      selectElementAtPoint: vi.fn(async () => true),
      relayout: vi.fn(async () => true),
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

    const note = screen.getByTestId('svg-container').querySelector('.Note');
    expect(note).toBeTruthy();
    fireEvent.click(note!);
    await screen.findByTestId('selection-overlay');

    await user.click(screen.getByTestId('btn-delete'));
    await waitFor(() => expect(screen.queryByTestId('selection-overlay')).not.toBeInTheDocument());
    expect(testGlobals.alert).toHaveBeenCalledWith(
      'This build of webmscore does not expose "deleteSelection".',
    );
  });
});
