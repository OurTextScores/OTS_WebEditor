import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  loadWebMscore: vi.fn(),
  loadWebMscoreInProcess: vi.fn(),
}));

const mockedNavigation = vi.hoisted(() => ({
  useSearchParams: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: mockedNavigation.useSearchParams,
}));

vi.mock('../lib/webmscore-loader', () => ({
  loadWebMscore: mocked.loadWebMscore,
  loadWebMscoreInProcess: mocked.loadWebMscoreInProcess,
}));

import ScoreEditor from '../components/ScoreEditor';

describe('ScoreEditor', () => {
  const suppressConsole = () => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  };

  let scoreParamValue: string | null = null;

  const searchParams = {
    get: (key: string) => (key === 'score' ? scoreParamValue : null),
  };

  const boundingRect = {
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    top: 0,
    left: 0,
    right: 100,
    bottom: 40,
    toJSON: () => ({}),
  };

  let rectSpy: ReturnType<typeof vi.spyOn> | undefined;

  beforeAll(() => {
    suppressConsole();
  });

  beforeEach(() => {
    scoreParamValue = null;
    mocked.loadWebMscore.mockReset();
    mocked.loadWebMscoreInProcess.mockReset();
    mocked.loadWebMscoreInProcess.mockImplementation(() => mocked.loadWebMscore());
    mockedNavigation.useSearchParams.mockReturnValue(searchParams);

    rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(boundingRect as any);
    (globalThis as any).alert = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    suppressConsole();
  });

  it('loads a score from file upload, supports selection, and applies clef', async () => {
    const user = userEvent.setup();

    const score: any = {
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

    const webmscore: any = {
      ready: Promise.resolve(),
      load: vi.fn(async () => score),
    };

    mocked.loadWebMscore.mockResolvedValue(webmscore);
    (globalThis as any).fetch = vi.fn(async () => ({
      ok: false,
      arrayBuffer: async () => new ArrayBuffer(0),
    }));

    render(<ScoreEditor />);

    const file = new File([new Uint8Array([1, 2, 3])], 'demo.mscz', { type: 'application/octet-stream' });
    await user.upload(screen.getByTestId('open-score-input'), file);

    await waitFor(() => expect(webmscore.load).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('svg-container').querySelector('svg')).toBeTruthy());

    const note = screen.getByTestId('svg-container').querySelector('.Note');
    expect(note).toBeTruthy();
    fireEvent.click(note!);

    await screen.findByTestId('selection-overlay');

    await user.click(screen.getByTestId('dropdown-clef'));
    await user.click(await screen.findByTestId('btn-clef-0'));

    await waitFor(() => expect(score.setClef).toHaveBeenCalledWith(0));
    expect(score.relayout).toHaveBeenCalled();
    expect(score.selectElementAtPoint.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('detects .mxl uploads and loads them with mxl format', async () => {
    const user = userEvent.setup();
    const largeData = new Uint8Array((2 * 1024 * 1024) + 8);

    const score: any = {
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg></svg>'),
      savePdf: vi.fn(async () => new Uint8Array([1])),
      setSoundFont: vi.fn(async () => {}),
      metadata: vi.fn(async () => ({})),
      measurePositions: vi.fn(async () => ({})),
      segmentPositions: vi.fn(async () => ({})),
      npages: vi.fn(async () => 1),
    };

    const webmscore: any = {
      ready: Promise.resolve(),
      load: vi.fn(async () => score),
    };

    mocked.loadWebMscore.mockResolvedValue(webmscore);
    (globalThis as any).fetch = vi.fn(async () => ({
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
    const largeData = new Uint8Array((2 * 1024 * 1024) + 256);
    const score: any = {
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg></svg>'),
      savePdf: vi.fn(async () => new Uint8Array([1])),
      setSoundFont: vi.fn(async () => {}),
      metadata: vi.fn(async () => ({})),
      measurePositions: vi.fn(async () => ({})),
      segmentPositions: vi.fn(async () => ({})),
      npages: vi.fn(async () => 1),
    };
    const webmscore: any = {
      ready: Promise.resolve(),
      load: vi.fn(async () => score),
    };

    mocked.loadWebMscore.mockResolvedValue(webmscore);
    (globalThis as any).fetch = vi.fn(async () => ({
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
    const largeData = new Uint8Array((2 * 1024 * 1024) + 8);
    let pages = 1;

    const score: any = {
      destroy: vi.fn(),
      saveSvg: vi.fn(async (pageIndex?: number) => `<svg><text>page-${pageIndex ?? 0}</text></svg>`),
      savePdf: vi.fn(async () => new Uint8Array([1])),
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

    const webmscore: any = {
      ready: Promise.resolve(),
      load: vi.fn(async () => score),
    };

    mocked.loadWebMscore.mockResolvedValue(webmscore);
    (globalThis as any).fetch = vi.fn(async () => ({
      ok: false,
      arrayBuffer: async () => new ArrayBuffer(0),
    }));

    render(<ScoreEditor />);

    const file = new File([largeData], 'beethoven.musicxml', { type: 'application/xml' });
    await user.upload(screen.getByTestId('open-score-input'), file);

    await waitFor(() => expect(webmscore.load).toHaveBeenNthCalledWith(1, 'musicxml', expect.any(Uint8Array), [], false));
    await waitFor(() => expect(score.layoutUntilPage).toHaveBeenCalledWith(0));
    await waitFor(() => expect(screen.getByTestId('page-indicator').textContent).toContain('Page 1 of 1+'));

    await user.click(screen.getByText('Next'));

    await waitFor(() => expect(score.layoutUntilPage).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.getByTestId('page-indicator').textContent).toContain('Page 2 of 2+'));
    await waitFor(() => expect(score.saveSvg).toHaveBeenCalledWith(1, true, true));
  });

  it('alerts when score load fails', async () => {
    const user = userEvent.setup();

    const webmscore: any = {
      ready: Promise.resolve(),
      load: vi.fn(async () => {
        throw new Error('boom');
      }),
    };

    mocked.loadWebMscore.mockResolvedValue(webmscore);
    (globalThis as any).fetch = vi.fn(async () => ({
      ok: false,
      arrayBuffer: async () => new ArrayBuffer(0),
    }));

    render(<ScoreEditor />);

    const file = new File([new Uint8Array([1])], 'bad.mscz', { type: 'application/octet-stream' });
    await user.upload(screen.getByTestId('open-score-input'), file);

    await waitFor(() =>
      expect((globalThis as any).alert).toHaveBeenCalledWith('Failed to load score. See console for details.'),
    );
  });

  it('loads default soundfont and enables WAV export when audio is available', async () => {
    const user = userEvent.setup();

    const score: any = {
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg><g class="Note"></g></svg>'),
      savePdf: vi.fn(async () => new Uint8Array([1])),
      saveAudio: vi.fn(async () => new Uint8Array([0])),
      setSoundFont: vi.fn(async () => {}),
      metadata: vi.fn(async () => ({})),
      measurePositions: vi.fn(async () => ({})),
      segmentPositions: vi.fn(async () => ({})),
    };

    const webmscore: any = {
      ready: Promise.resolve(),
      load: vi.fn(async () => score),
    };

    mocked.loadWebMscore.mockResolvedValue(webmscore);
    (globalThis as any).fetch = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }));

    render(<ScoreEditor />);

    const file = new File([new Uint8Array([1])], 'demo.mscz', { type: 'application/octet-stream' });
    await user.upload(screen.getByTestId('open-score-input'), file);

    await waitFor(() => expect(score.setSoundFont).toHaveBeenCalled());
    await user.click(screen.getByTestId('dropdown-export'));
    await waitFor(() => expect(screen.getByTestId('btn-export-audio')).toBeEnabled());
  });

  it('invokes mutation and export handlers from the toolbar', async () => {
    const user = userEvent.setup();

    const score: any = {
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

    const webmscore: any = {
      ready: Promise.resolve(),
      load: vi.fn(async () => score),
    };

    mocked.loadWebMscore.mockResolvedValue(webmscore);
    (globalThis as any).fetch = vi.fn(async () => ({
      ok: false,
      arrayBuffer: async () => new ArrayBuffer(0),
    }));

    (globalThis as any).URL.createObjectURL = vi.fn(() => 'blob:mock');
    (globalThis as any).URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<ScoreEditor />);

    const file = new File([new Uint8Array([1])], 'demo.mscz', { type: 'application/octet-stream' });
    await user.upload(screen.getByTestId('open-score-input'), file);

    await waitFor(() => expect(screen.getByTestId('svg-container').querySelector('svg')).toBeTruthy());

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
    await waitFor(() => expect(score.transpose).toHaveBeenCalledWith(12));
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
    await waitFor(() => expect((globalThis as any).URL.createObjectURL).toHaveBeenCalled());
  }, 15000);

  it('auto-loads a score from the URL query param', async () => {
    scoreParamValue = '/test_scores/demo.musicxml';

    const score: any = {
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg></svg>'),
    };

    const webmscore: any = {
      ready: Promise.resolve(),
      load: vi.fn(async () => score),
    };

    mocked.loadWebMscore.mockResolvedValue(webmscore);
    (globalThis as any).fetch = vi.fn(async (url: string) => {
      expect(url).toBe('/test_scores/demo.musicxml');
      return {
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      };
    });

    render(<ScoreEditor />);

    await waitFor(() => expect(webmscore.load).toHaveBeenCalled());
    expect(webmscore.load).toHaveBeenCalledWith('musicxml', expect.any(Uint8Array));
    await waitFor(() => expect(screen.getByTestId('svg-container').querySelector('svg')).toBeTruthy());
  });

  it('adds tempo text at the start of the score without requiring a selection', async () => {
    const user = userEvent.setup();

    const score: any = {
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg><g class="Note"></g></svg>'),
      relayout: vi.fn(async () => true),
      addTempoText: vi.fn(async () => true),
      metadata: vi.fn(async () => ({})),
      measurePositions: vi.fn(async () => ({})),
      segmentPositions: vi.fn(async () => ({})),
    };

    const webmscore: any = {
      ready: Promise.resolve(),
      load: vi.fn(async () => score),
    };

    mocked.loadWebMscore.mockResolvedValue(webmscore);
    (globalThis as any).fetch = vi.fn(async () => ({
      ok: false,
      arrayBuffer: async () => new ArrayBuffer(0),
    }));

    render(<ScoreEditor />);

    const file = new File([new Uint8Array([1])], 'demo.mscz', { type: 'application/octet-stream' });
    await user.upload(screen.getByTestId('open-score-input'), file);

    await waitFor(() => expect(screen.getByTestId('svg-container').querySelector('svg')).toBeTruthy());
    expect(screen.queryByTestId('selection-overlay')).not.toBeInTheDocument();

    const tempoInput = screen.getByTestId('input-tempo-bpm');
    await user.clear(tempoInput);
    await user.type(tempoInput, '96');
    await user.click(screen.getByTestId('btn-tempo-apply'));

    await waitFor(() => expect(score.addTempoText).toHaveBeenCalledWith(96));
  });

  it('zooms in/out and clamps zoom limits', async () => {
    const user = userEvent.setup();
    render(<ScoreEditor />);

    const wrapper = screen.getByTestId('score-wrapper');
    expect(wrapper).toHaveStyle({ transform: 'scale(1)' });

    await user.click(screen.getByTestId('btn-zoom-in'));
    expect(wrapper).toHaveStyle({ transform: 'scale(1.1)' });

    for (let i = 0; i < 20; i++) {
      await user.click(screen.getByTestId('btn-zoom-out'));
    }
    expect(wrapper).toHaveStyle({ transform: 'scale(0.5)' });

    for (let i = 0; i < 50; i++) {
      await user.click(screen.getByTestId('btn-zoom-in'));
    }
    expect(wrapper).toHaveStyle({ transform: 'scale(3)' });
  }, 10000);

  it('exports PDF/PNG/MXL/MSCZ/MIDI via Score methods', async () => {
    const user = userEvent.setup();

    const score: any = {
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg><g class="Note"></g></svg>'),
      savePdf: vi.fn(async () => new Uint8Array([1])),
      savePng: vi.fn(async () => new Uint8Array([2])),
      saveMxl: vi.fn(async () => new Uint8Array([3])),
      saveMsc: vi.fn(async () => new Uint8Array([4])),
      saveMidi: vi.fn(async () => new Uint8Array([5])),
      metadata: vi.fn(async () => ({})),
      measurePositions: vi.fn(async () => ({})),
      segmentPositions: vi.fn(async () => ({})),
    };

    const webmscore: any = {
      ready: Promise.resolve(),
      load: vi.fn(async () => score),
    };

    mocked.loadWebMscore.mockResolvedValue(webmscore);
    (globalThis as any).fetch = vi.fn(async () => ({
      ok: false,
      arrayBuffer: async () => new ArrayBuffer(0),
    }));

    (globalThis as any).URL.createObjectURL = vi.fn(() => 'blob:mock');
    (globalThis as any).URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<ScoreEditor />);

    const file = new File([new Uint8Array([1])], 'demo.mscz', { type: 'application/octet-stream' });
    await user.upload(screen.getByTestId('open-score-input'), file);

    await waitFor(() => expect(screen.getByTestId('svg-container').querySelector('svg')).toBeTruthy());

    await user.click(screen.getByTestId('dropdown-export'));
    await user.click(await screen.findByTestId('btn-export-pdf'));
    await user.click(screen.getByTestId('dropdown-export'));
    await user.click(await screen.findByTestId('btn-export-png'));
    await user.click(screen.getByTestId('dropdown-export'));
    await user.click(await screen.findByTestId('btn-export-mxl'));
    await user.click(screen.getByTestId('dropdown-export'));
    await user.click(await screen.findByTestId('btn-export-mscz'));
    await user.click(screen.getByTestId('dropdown-export'));
    await user.click(await screen.findByTestId('btn-export-midi'));

    await waitFor(() => expect(score.savePdf).toHaveBeenCalled());
    await waitFor(() => expect(score.savePng).toHaveBeenCalledWith(0, true, true));
    await waitFor(() => expect(score.saveMxl).toHaveBeenCalled());
    await waitFor(() => expect(score.saveMsc).toHaveBeenCalledWith('mscz'));
    await waitFor(() => expect(score.saveMidi).toHaveBeenCalledWith(true, true));
    await waitFor(() => expect((globalThis as any).URL.createObjectURL).toHaveBeenCalled());
  }, 10000);

  it('supports note respelling keyboard shortcuts', async () => {
    const user = userEvent.setup();

    const score: any = {
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

    const webmscore: any = {
      ready: Promise.resolve(),
      load: vi.fn(async () => score),
    };

    mocked.loadWebMscore.mockResolvedValue(webmscore);
    (globalThis as any).fetch = vi.fn(async () => ({
      ok: false,
      arrayBuffer: async () => new ArrayBuffer(0),
    }));

    render(<ScoreEditor />);

    const file = new File([new Uint8Array([1])], 'demo.mscz', { type: 'application/octet-stream' });
    await user.upload(screen.getByTestId('open-score-input'), file);

    await waitFor(() => expect(screen.getByTestId('svg-container').querySelector('svg')).toBeTruthy());

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

  it('advances selection with left/right arrows', async () => {
    const user = userEvent.setup();

    let selectedIndex: number | null = null;
    const score: any = {
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

    const webmscore: any = {
      ready: Promise.resolve(),
      load: vi.fn(async () => score),
    };

    rectSpy?.mockImplementation(function (this: Element) {
      const classes = this.getAttribute?.('class') || '';
      if (classes.includes('note-2')) {
        return {
          ...boundingRect,
          left: 120,
          right: 220,
        } as any;
      }
      if (classes.includes('note-1')) {
        return {
          ...boundingRect,
          left: 0,
          right: 100,
        } as any;
      }
      return boundingRect as any;
    });

    mocked.loadWebMscore.mockResolvedValue(webmscore);
    (globalThis as any).fetch = vi.fn(async () => ({
      ok: false,
      arrayBuffer: async () => new ArrayBuffer(0),
    }));

    render(<ScoreEditor />);

    const file = new File([new Uint8Array([1])], 'demo.mscz', { type: 'application/octet-stream' });
    await user.upload(screen.getByTestId('open-score-input'), file);
    await waitFor(() => expect(screen.getByTestId('svg-container').querySelector('svg')).toBeTruthy());

    const notes = screen.getByTestId('svg-container').querySelectorAll('.Note');
    expect(notes.length).toBe(2);
    fireEvent.click(notes[0]!);
    await screen.findByTestId('selection-overlay');

    await waitFor(() => expect(screen.getByTestId('selection-overlay')).toHaveStyle({ left: '0px' }));

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await waitFor(() => expect(screen.getByTestId('selection-overlay')).toHaveStyle({ left: '120px' }));
    expect(score.selectNextChord).toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    await waitFor(() => expect(screen.getByTestId('selection-overlay')).toHaveStyle({ left: '0px' }));
    expect(score.selectPrevChord).toHaveBeenCalled();
  });

  it('alerts when optional export bindings are missing', async () => {
    const user = userEvent.setup();

    const score: any = {
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg></svg>'),
      savePdf: vi.fn(async () => new Uint8Array([1])),
      metadata: vi.fn(async () => ({})),
      measurePositions: vi.fn(async () => ({})),
      segmentPositions: vi.fn(async () => ({})),
    };

    const webmscore: any = {
      ready: Promise.resolve(),
      load: vi.fn(async () => score),
    };

    mocked.loadWebMscore.mockResolvedValue(webmscore);
    (globalThis as any).fetch = vi.fn(async () => ({
      ok: false,
      arrayBuffer: async () => new ArrayBuffer(0),
    }));

    render(<ScoreEditor />);

    const file = new File([new Uint8Array([1])], 'demo.mscz', { type: 'application/octet-stream' });
    await user.upload(screen.getByTestId('open-score-input'), file);

    await waitFor(() => expect(screen.getByTestId('svg-container').querySelector('svg')).toBeTruthy());

    await user.click(screen.getByTestId('dropdown-export'));
    await user.click(await screen.findByTestId('btn-export-mxl'));
    expect((globalThis as any).alert).toHaveBeenCalledWith('MXL export is not available in this build.');

    await user.click(screen.getByTestId('dropdown-export'));
    await user.click(await screen.findByTestId('btn-export-mscz'));
    expect((globalThis as any).alert).toHaveBeenCalledWith('MSCZ export is not available in this build.');

    await user.click(screen.getByTestId('dropdown-export'));
    await user.click(await screen.findByTestId('btn-export-midi'));
    expect((globalThis as any).alert).toHaveBeenCalledWith('MIDI export is not available in this build.');
  });

  it('plays audio from WAV once and replays from cached URL', async () => {
    const user = userEvent.setup();

    const saveAudioDeferred: { resolve?: (value: Uint8Array) => void } = {};
    const saveAudio = vi.fn(
      () =>
        new Promise<Uint8Array>((resolve) => {
          saveAudioDeferred.resolve = resolve;
        }),
    );

    const score: any = {
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg></svg>'),
      saveAudio,
      setSoundFont: vi.fn(async () => {}),
      metadata: vi.fn(async () => ({})),
      measurePositions: vi.fn(async () => ({})),
      segmentPositions: vi.fn(async () => ({})),
    };

    const webmscore: any = {
      ready: Promise.resolve(),
      load: vi.fn(async () => score),
    };

    mocked.loadWebMscore.mockResolvedValue(webmscore);
    (globalThis as any).fetch = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }));

    (globalThis as any).URL.createObjectURL = vi.fn(() => 'blob:audio');
    (globalThis as any).URL.revokeObjectURL = vi.fn();

    const createdAudios: any[] = [];
    class MockAudio {
      src = '';
      currentTime = 0;
      onended: (() => void) | null = null;
      pause = vi.fn();
      play = vi.fn(async () => {});

      constructor(url: string) {
        this.src = url;
        createdAudios.push(this);
      }
    }
    (globalThis as any).Audio = MockAudio;

    render(<ScoreEditor />);

    const file = new File([new Uint8Array([1])], 'demo.mscz', { type: 'application/octet-stream' });
    await user.upload(screen.getByTestId('open-score-input'), file);

    await waitFor(() => expect(score.setSoundFont).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('btn-play')).toBeEnabled());

    await user.click(screen.getByTestId('btn-play'));
    await waitFor(() => expect(screen.getByTestId('btn-play')).toHaveTextContent('Working…'));

    saveAudioDeferred.resolve?.(new Uint8Array([0]));

    await waitFor(() => expect(screen.getByTestId('btn-play')).toHaveTextContent('Replay'));
    expect(saveAudio).toHaveBeenCalledTimes(1);
    expect(createdAudios.length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByTestId('btn-play'));
    await waitFor(() => expect(screen.getByTestId('btn-play')).toHaveTextContent('Replay'));
    expect(saveAudio).toHaveBeenCalledTimes(1);
    expect((globalThis as any).URL.createObjectURL).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('btn-stop'));
    await waitFor(() => expect(screen.getByTestId('btn-play')).toHaveTextContent('Play'));
    expect(createdAudios.at(-1).pause).toHaveBeenCalled();
  });

  it('streams playback when synthAudioBatch is available and cancels on stop', async () => {
    const user = userEvent.setup();

    const floatChunk = new Float32Array(512);
    const chunkBytes = new Uint8Array(floatChunk.buffer);

    let batchesReturned = 0;
    const batchFn = vi.fn(async (cancel?: boolean) => {
      if (cancel) return [];
      if (batchesReturned > 0) return [];
      batchesReturned++;
      return [
        {
          chunk: chunkBytes,
          startTime: 0,
          done: true,
        },
      ];
    });

    const score: any = {
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg></svg>'),
      saveAudio: vi.fn(async () => new Uint8Array([0])),
      setSoundFont: vi.fn(async () => {}),
      synthAudioBatch: vi.fn(async () => batchFn),
      metadata: vi.fn(async () => ({})),
      measurePositions: vi.fn(async () => ({})),
      segmentPositions: vi.fn(async () => ({})),
    };

    const webmscore: any = {
      ready: Promise.resolve(),
      load: vi.fn(async () => score),
    };

    mocked.loadWebMscore.mockResolvedValue(webmscore);
    (globalThis as any).fetch = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }));

    const createdSources: any[] = [];
    let lastAudioCtx: any | null = null;
    class MockAudioContext {
      state: 'running' | 'suspended' = 'suspended';
      currentTime = 0;
      sampleRate = 44100;
      destination = {};

      constructor(_opts?: any) {
        lastAudioCtx = this;
      }

      resume = vi.fn(async () => {
        this.state = 'running';
      });

      createBuffer = vi.fn(() => ({
        copyToChannel: vi.fn(),
      }));

      createBufferSource = vi.fn(() => {
        const source = {
          buffer: null as any,
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          onended: null as any,
        };
        createdSources.push(source);
        return source;
      });
    }

    (globalThis as any).AudioContext = MockAudioContext;

    render(<ScoreEditor />);

    const file = new File([new Uint8Array([1])], 'demo.mscz', { type: 'application/octet-stream' });
    await user.upload(screen.getByTestId('open-score-input'), file);

    await waitFor(() => expect(score.setSoundFont).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('btn-play')).toBeEnabled());

    await user.click(screen.getByTestId('btn-play'));
    await waitFor(() => expect(screen.getByTestId('btn-play')).toHaveTextContent('Replay'));

    expect(score.synthAudioBatch).toHaveBeenCalled();
    expect(score.saveAudio).not.toHaveBeenCalled();
    expect(lastAudioCtx?.resume).toHaveBeenCalled();
    expect(createdSources.length).toBeGreaterThan(0);

    await user.click(screen.getByTestId('btn-stop'));
    await waitFor(() => expect(screen.getByTestId('btn-play')).toHaveTextContent('Play'));
    expect(batchFn).toHaveBeenCalledWith(true);
    expect(createdSources[0].stop).toHaveBeenCalled();
  });

  it('plays transport from selection when the dedicated streaming binding is available', async () => {
    const user = userEvent.setup();

    const floatChunk = new Float32Array(512);
    const chunkBytes = new Uint8Array(floatChunk.buffer);
    const fromSelectionBatchFn = vi.fn(async (cancel?: boolean) => {
      if (cancel) return [];
      return [
        {
          chunk: chunkBytes,
          startTime: 0,
          done: true,
        },
      ];
    });

    const score: any = {
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg><g class="Note"></g></svg>'),
      saveAudio: vi.fn(async () => new Uint8Array([0])),
      setSoundFont: vi.fn(async () => {}),
      synthAudioBatchFromSelection: vi.fn(async () => fromSelectionBatchFn),
      selectElementAtPoint: vi.fn(async () => true),
      metadata: vi.fn(async () => ({})),
      measurePositions: vi.fn(async () => ({})),
      segmentPositions: vi.fn(async () => ({})),
    };

    const webmscore: any = {
      ready: Promise.resolve(),
      load: vi.fn(async () => score),
    };

    mocked.loadWebMscore.mockResolvedValue(webmscore);
    (globalThis as any).fetch = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }));

    class MockAudioContext {
      state: 'running' | 'suspended' = 'suspended';
      currentTime = 0;
      sampleRate = 44100;
      destination = {};
      resume = vi.fn(async () => {
        this.state = 'running';
      });
      createBuffer = vi.fn(() => ({
        copyToChannel: vi.fn(),
      }));
      createBufferSource = vi.fn(() => ({
        buffer: null as any,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null as any,
      }));
    }
    (globalThis as any).AudioContext = MockAudioContext;

    render(<ScoreEditor />);

    const file = new File([new Uint8Array([1])], 'demo.mscz', { type: 'application/octet-stream' });
    await user.upload(screen.getByTestId('open-score-input'), file);
    await waitFor(() => expect(score.setSoundFont).toHaveBeenCalled());

    const note = screen.getByTestId('svg-container').querySelector('.Note');
    expect(note).toBeTruthy();
    fireEvent.click(note!);
    await screen.findByTestId('selection-overlay');

    await user.click(screen.getByTestId('btn-play-from-selection'));
    await waitFor(() => expect(score.synthAudioBatchFromSelection).toHaveBeenCalledWith(1));
    expect(score.saveAudio).not.toHaveBeenCalled();
  });

  it('triggers isolated preview audio on selection and note mutation', async () => {
    const user = userEvent.setup();

    const floatChunk = new Float32Array(512);
    const chunkBytes = new Uint8Array(floatChunk.buffer);
    const previewBatchFn = vi.fn(async (cancel?: boolean) => {
      if (cancel) return [];
      return [
        {
          chunk: chunkBytes,
          startTime: 0,
          endTime: 0.5,
          done: true,
        },
      ];
    });

    const score: any = {
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg><g class="Note"></g></svg>'),
      saveAudio: vi.fn(async () => new Uint8Array([0])),
      setSoundFont: vi.fn(async () => {}),
      selectElementAtPoint: vi.fn(async () => true),
      addPitchByStep: vi.fn(async () => true),
      relayout: vi.fn(async () => true),
      synthSelectionPreviewBatch: vi.fn(async () => previewBatchFn),
      metadata: vi.fn(async () => ({})),
      measurePositions: vi.fn(async () => ({})),
      segmentPositions: vi.fn(async () => ({})),
    };

    const webmscore: any = {
      ready: Promise.resolve(),
      load: vi.fn(async () => score),
    };

    mocked.loadWebMscore.mockResolvedValue(webmscore);
    (globalThis as any).fetch = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }));

    class MockAudioContext {
      state: 'running' | 'suspended' = 'suspended';
      currentTime = 0;
      sampleRate = 44100;
      destination = {};
      resume = vi.fn(async () => {
        this.state = 'running';
      });
      createBuffer = vi.fn(() => ({
        copyToChannel: vi.fn(),
      }));
      createBufferSource = vi.fn(() => ({
        buffer: null as any,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null as any,
      }));
    }
    (globalThis as any).AudioContext = MockAudioContext;

    render(<ScoreEditor />);

    const file = new File([new Uint8Array([1])], 'demo.mscz', { type: 'application/octet-stream' });
    await user.upload(screen.getByTestId('open-score-input'), file);
    await waitFor(() => expect(score.setSoundFont).toHaveBeenCalled());

    const note = screen.getByTestId('svg-container').querySelector('.Note');
    expect(note).toBeTruthy();
    fireEvent.click(note!);
    await screen.findByTestId('selection-overlay');

    await waitFor(() => expect(score.synthSelectionPreviewBatch).toHaveBeenCalled());

    fireEvent.keyDown(window, { key: 'c' });
    await waitFor(() => expect(score.addPitchByStep).toHaveBeenCalledWith(0, false, false));
    await waitFor(() => expect(score.synthSelectionPreviewBatch.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('extracts page index from SVG ancestry and clears selection on invalid boxes', async () => {
    const user = userEvent.setup();

    const score: any = {
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg><g id="page-2"><g class="Note"><path id="inner"/></g></g></svg>'),
      selectElementAtPoint: vi.fn(async () => true),
      metadata: vi.fn(async () => ({})),
      measurePositions: vi.fn(async () => ({})),
      segmentPositions: vi.fn(async () => ({})),
    };

    const webmscore: any = {
      ready: Promise.resolve(),
      load: vi.fn(async () => score),
    };

    mocked.loadWebMscore.mockResolvedValue(webmscore);
    (globalThis as any).fetch = vi.fn(async () => ({
      ok: false,
      arrayBuffer: async () => new ArrayBuffer(0),
    }));

    render(<ScoreEditor />);

    const file = new File([new Uint8Array([1])], 'demo.mscz', { type: 'application/octet-stream' });
    await user.upload(screen.getByTestId('open-score-input'), file);

    await waitFor(() => expect(screen.getByTestId('svg-container').querySelector('svg')).toBeTruthy());

    const inner = screen.getByTestId('svg-container').querySelector('#inner');
    expect(inner).toBeTruthy();
    fireEvent.click(inner!);

    await waitFor(() => expect(score.selectElementAtPoint).toHaveBeenCalledWith(1, expect.any(Number), expect.any(Number)));

    await screen.findByTestId('selection-overlay');

    rectSpy?.mockReturnValue({
      ...boundingRect,
      width: 0,
      height: 0,
      right: 0,
      bottom: 0,
    } as any);

    fireEvent.click(inner!);
    await waitFor(() => expect(screen.queryByTestId('selection-overlay')).not.toBeInTheDocument());
  });

  it.skip('clears selection when clicking blank space and allows re-selecting notes', async () => {
    const user = userEvent.setup();

    const score: any = {
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg><g class="Note"></g></svg>'),
      selectElementAtPoint: vi.fn(async () => true),
      metadata: vi.fn(async () => ({})),
      measurePositions: vi.fn(async () => ({})),
      segmentPositions: vi.fn(async () => ({})),
    };

    const webmscore: any = {
      ready: Promise.resolve(),
      load: vi.fn(async () => score),
    };

    mocked.loadWebMscore.mockResolvedValue(webmscore);
    (globalThis as any).fetch = vi.fn(async () => ({
      ok: false,
      arrayBuffer: async () => new ArrayBuffer(0),
    }));

    render(<ScoreEditor />);

    const file = new File([new Uint8Array([1])], 'demo.mscz', { type: 'application/octet-stream' });
    await user.upload(screen.getByTestId('open-score-input'), file);
    await waitFor(() => expect(screen.getByTestId('svg-container').querySelector('svg')).toBeTruthy());

    const svg = screen.getByTestId('svg-container').querySelector('svg');
    expect(svg).toBeTruthy();

    const note = screen.getByTestId('svg-container').querySelector('.Note');
    expect(note).toBeTruthy();

    fireEvent.click(note!);
    await screen.findByTestId('selection-overlay');
    expect(score.selectElementAtPoint).toHaveBeenCalledTimes(1);

    fireEvent.click(svg!);

    await waitFor(() => expect(screen.queryByTestId('selection-overlay')).not.toBeInTheDocument());
    expect(score.selectElementAtPoint).toHaveBeenCalledTimes(1);

    fireEvent.click(note!);
    await screen.findByTestId('selection-overlay');
    expect(score.selectElementAtPoint).toHaveBeenCalledTimes(2);
  });

  it('refreshes selection overlay after mutation using SVG selection classes', async () => {
    const user = userEvent.setup();

    const score: any = {
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

    const webmscore: any = {
      ready: Promise.resolve(),
      load: vi.fn(async () => score),
    };

    rectSpy?.mockImplementation(function (this: Element) {
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
        } as any;
      }
      return boundingRect as any;
    });

    mocked.loadWebMscore.mockResolvedValue(webmscore);
    (globalThis as any).fetch = vi.fn(async () => ({
      ok: false,
      arrayBuffer: async () => new ArrayBuffer(0),
    }));

    render(<ScoreEditor />);

    const file = new File([new Uint8Array([1])], 'demo.mscz', { type: 'application/octet-stream' });
    await user.upload(screen.getByTestId('open-score-input'), file);
    await waitFor(() => expect(screen.getByTestId('svg-container').querySelector('svg')).toBeTruthy());

    const note = screen.getByTestId('svg-container').querySelector('.Note');
    expect(note).toBeTruthy();
    fireEvent.click(note!);
    await screen.findByTestId('selection-overlay');

    expect(screen.getByTestId('selection-overlay')).toHaveStyle({ left: '0px', top: '0px' });

    await user.click(screen.getByTestId('btn-pitch-up'));

    await waitFor(() => expect(screen.getByTestId('selection-overlay')).toHaveStyle({ left: '20px', top: '30px' }));
    expect(score.pitchUp).toHaveBeenCalled();
  });

  it('alerts when a mutation binding is missing', async () => {
    const user = userEvent.setup();

    const score: any = {
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg><g class="Note"></g></svg>'),
      selectElementAtPoint: vi.fn(async () => true),
      relayout: vi.fn(async () => true),
      metadata: vi.fn(async () => ({})),
      measurePositions: vi.fn(async () => ({})),
      segmentPositions: vi.fn(async () => ({})),
    };

    const webmscore: any = {
      ready: Promise.resolve(),
      load: vi.fn(async () => score),
    };

    mocked.loadWebMscore.mockResolvedValue(webmscore);
    (globalThis as any).fetch = vi.fn(async () => ({
      ok: false,
      arrayBuffer: async () => new ArrayBuffer(0),
    }));

    render(<ScoreEditor />);

    const file = new File([new Uint8Array([1])], 'demo.mscz', { type: 'application/octet-stream' });
    await user.upload(screen.getByTestId('open-score-input'), file);

    await waitFor(() => expect(screen.getByTestId('svg-container').querySelector('svg')).toBeTruthy());

    const note = screen.getByTestId('svg-container').querySelector('.Note');
    expect(note).toBeTruthy();
    fireEvent.click(note!);
    await screen.findByTestId('selection-overlay');

    await user.click(screen.getByTestId('dropdown-rhythm'));
    await user.click(await screen.findByTestId('btn-double-dot'));
    expect((globalThis as any).alert).toHaveBeenCalledWith('This build of webmscore does not expose "toggleDoubleDot".');
  });

  it('clears selection on delete even when the binding is missing', async () => {
    const user = userEvent.setup();

    const score: any = {
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg><g class="Note"></g></svg>'),
      selectElementAtPoint: vi.fn(async () => true),
      relayout: vi.fn(async () => true),
      metadata: vi.fn(async () => ({})),
      measurePositions: vi.fn(async () => ({})),
      segmentPositions: vi.fn(async () => ({})),
    };

    const webmscore: any = {
      ready: Promise.resolve(),
      load: vi.fn(async () => score),
    };

    mocked.loadWebMscore.mockResolvedValue(webmscore);
    (globalThis as any).fetch = vi.fn(async () => ({
      ok: false,
      arrayBuffer: async () => new ArrayBuffer(0),
    }));

    render(<ScoreEditor />);

    const file = new File([new Uint8Array([1])], 'demo.mscz', { type: 'application/octet-stream' });
    await user.upload(screen.getByTestId('open-score-input'), file);

    await waitFor(() => expect(screen.getByTestId('svg-container').querySelector('svg')).toBeTruthy());

    const note = screen.getByTestId('svg-container').querySelector('.Note');
    expect(note).toBeTruthy();
    fireEvent.click(note!);
    await screen.findByTestId('selection-overlay');

    await user.click(screen.getByTestId('btn-delete'));
    await waitFor(() => expect(screen.queryByTestId('selection-overlay')).not.toBeInTheDocument());
    expect((globalThis as any).alert).toHaveBeenCalledWith('This build of webmscore does not expose "deleteSelection".');
  });
});
