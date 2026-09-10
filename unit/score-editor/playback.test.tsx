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

type TestMock = ReturnType<typeof vi.fn>;

describe('ScoreEditor: soundfont loading, playback and preview audio', () => {
  setupScoreEditorTest(mocked, mockedNavigation);

  it('loads default soundfont and enables WAV export when audio is available', async () => {
    const user = userEvent.setup();

    const score = {
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg><g class="Note"></g></svg>'),
      savePdf: vi.fn(async () => new Uint8Array([1])),
      saveAudio: vi.fn(async () => new Uint8Array([0])),
      setSoundFont: vi.fn(async () => {}),
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

  it('plays audio from WAV once and replays from cached URL', async () => {
    const user = userEvent.setup();

    const saveAudioDeferred: { resolve?: (value: Uint8Array) => void } = {};
    const saveAudio = vi.fn(
      () =>
        new Promise<Uint8Array>((resolve) => {
          saveAudioDeferred.resolve = resolve;
        }),
    );

    const score = {
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg></svg>'),
      saveAudio,
      setSoundFont: vi.fn(async () => {}),
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
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }));

    testGlobals.URL.createObjectURL = vi.fn(() => 'blob:audio');
    testGlobals.URL.revokeObjectURL = vi.fn();

    const createdAudios: MockAudio[] = [];
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
    testGlobals.Audio = MockAudio;

    render(<ScoreEditor />);

    const file = new File([new Uint8Array([1])], 'demo.mscz', { type: 'application/octet-stream' });
    await user.upload(screen.getByTestId('open-score-input'), file);

    await waitFor(() => expect(score.setSoundFont).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('btn-play')).toBeEnabled());

    await user.click(screen.getByTestId('btn-play'));
    // Startup is signalled by disabling the control, not by a label change.
    await waitFor(() => expect(screen.getByTestId('btn-play')).toBeDisabled());

    saveAudioDeferred.resolve?.(new Uint8Array([0]));

    await waitFor(() => expect(screen.getByTestId('btn-play')).toHaveTextContent('Pause'));
    expect(saveAudio).toHaveBeenCalledTimes(1);
    expect(createdAudios.length).toBeGreaterThanOrEqual(1);

    // Stop resets the transport and leaves the rendered WAV cached.
    await user.click(screen.getByTestId('btn-stop'));
    await waitFor(() => expect(screen.getByTestId('btn-play')).toHaveTextContent('Play'));
    expect(createdAudios.at(-1)?.pause).toHaveBeenCalled();

    // Replaying reuses the cached object URL instead of re-rendering audio.
    await user.click(screen.getByTestId('btn-play'));
    await waitFor(() => expect(screen.getByTestId('btn-play')).toHaveTextContent('Pause'));
    expect(saveAudio).toHaveBeenCalledTimes(1);
    expect(testGlobals.URL.createObjectURL).toHaveBeenCalledTimes(1);
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

    const score = {
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg></svg>'),
      saveAudio: vi.fn(async () => new Uint8Array([0])),
      setSoundFont: vi.fn(async () => {}),
      synthAudioBatch: vi.fn(async () => batchFn),
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
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }));

    type MockAudioSource = {
      buffer: AudioBuffer | null;
      connect: TestMock;
      start: TestMock;
      stop: TestMock;
      onended: (() => void) | null;
    };
    const createdSources: MockAudioSource[] = [];
    const resumeAudioContext = vi.fn(async () => {});
    class MockAudioContext {
      state: 'running' | 'suspended' = 'suspended';
      currentTime = 0;
      sampleRate = 44100;
      destination = {};

      resume = vi.fn(async () => {
        this.state = 'running';
        await resumeAudioContext();
      });

      createBuffer = vi.fn(() => ({
        copyToChannel: vi.fn(),
      }));

      createBufferSource = vi.fn(() => {
        const source = {
          buffer: null,
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          onended: null,
        };
        createdSources.push(source as MockAudioSource);
        return source;
      });
    }

    testGlobals.AudioContext = MockAudioContext;

    render(<ScoreEditor />);

    const file = new File([new Uint8Array([1])], 'demo.mscz', { type: 'application/octet-stream' });
    await user.upload(screen.getByTestId('open-score-input'), file);

    await waitFor(() => expect(score.setSoundFont).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('btn-play')).toBeEnabled());

    await user.click(screen.getByTestId('btn-play'));
    await waitFor(() => expect(score.synthAudioBatch).toHaveBeenCalled());

    // Streaming must not fall back to rendering a whole WAV.
    expect(score.saveAudio).not.toHaveBeenCalled();
    expect(resumeAudioContext).toHaveBeenCalled();
    await waitFor(() => expect(createdSources.length).toBeGreaterThan(0));

    // Stop cancels the iterator and tears down the scheduled sources. The transport
    // stays clickable during playback, so wait on the transport state rather than on
    // the button being re-enabled.
    await waitFor(() => expect(screen.getByTestId('btn-stop')).toBeEnabled());
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

    const score = {
      destroy: vi.fn(),
      saveSvg: vi.fn(async () => '<svg><g class="Note"></g></svg>'),
      saveAudio: vi.fn(async () => new Uint8Array([0])),
      setSoundFont: vi.fn(async () => {}),
      synthAudioBatchFromSelection: vi.fn(async (startTick?: number) => {
        void startTick;
        return fromSelectionBatchFn;
      }),
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
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null,
      }));
    }
    testGlobals.AudioContext = MockAudioContext;

    render(<ScoreEditor />);

    const file = new File([new Uint8Array([1])], 'demo.mscz', { type: 'application/octet-stream' });
    await user.upload(screen.getByTestId('open-score-input'), file);
    await waitFor(() => expect(score.setSoundFont).toHaveBeenCalled());

    const note = screen.getByTestId('svg-container').querySelector('.Note');
    expect(note).toBeTruthy();
    fireEvent.click(note!);
    await screen.findByTestId('selection-overlay');

    await user.click(screen.getByTestId('btn-play-from-selection'));
    await waitFor(() => expect(score.synthAudioBatchFromSelection).toHaveBeenCalled());
    expect(score.synthAudioBatchFromSelection.mock.calls[0]?.[0]).toEqual(expect.any(Number));
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

    const score = {
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

    const webmscore = {
      ready: Promise.resolve(),
      load: vi.fn(async () => score),
    };

    mocked.loadWebMscore.mockResolvedValue(webmscore);
    testGlobals.fetch = vi.fn(async () => ({
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
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null,
      }));
    }
    testGlobals.AudioContext = MockAudioContext;

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
    await waitFor(() =>
      expect(score.synthSelectionPreviewBatch.mock.calls.length).toBeGreaterThanOrEqual(2),
    );
  });
});
