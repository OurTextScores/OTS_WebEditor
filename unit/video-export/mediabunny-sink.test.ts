import { beforeEach, describe, expect, it, vi } from 'vitest';

const mb = vi.hoisted(() => {
  const state = {
    samples: [] as { close: ReturnType<typeof vi.fn> }[],
    audioAdd: vi.fn(),
    failAudio: false,
  };
  class AudioSample {
    close = vi.fn();
    constructor(public init: unknown) {
      state.samples.push(this);
    }
  }
  class AudioSampleSource {
    add = async (sample: unknown) => {
      state.audioAdd(sample);
      if (state.failAudio) throw new Error('Encoding error. (Unexpected frame format.)');
    };
  }
  class CanvasSource {
    add = async () => {};
  }
  class Output {
    addVideoTrack() {}
    addAudioTrack() {}
    async start() {}
    async finalize() {}
    async cancel() {}
  }
  class BufferTarget {
    buffer: ArrayBuffer | null = new ArrayBuffer(4);
  }
  class Fmt {}
  return {
    state,
    module: {
      AudioSample,
      AudioSampleSource,
      CanvasSource,
      Output,
      BufferTarget,
      StreamTarget: class {},
      Mp4OutputFormat: Fmt,
      WebMOutputFormat: Fmt,
      getFirstEncodableAudioCodec: async () => null,
      getFirstEncodableVideoCodec: async () => null,
    },
  };
});
vi.mock('mediabunny', () => mb.module);

import { createMediabunnySink } from '../../lib/video-export/mediabunnySink';

const format = {
  ok: true,
  container: 'webm',
  video: 'vp9',
  audio: 'opus',
  extension: 'webm',
  mimeType: 'video/webm',
} as const;
const block = (start: number) => ({
  channels: [new Float32Array(512), new Float32Array(512)],
  sampleRate: 1024, // so one block is 0.5 s, the sink's batch size
  startSeconds: start,
  frames: 512,
});
const make = () =>
  createMediabunnySink({
    canvas: {} as OffscreenCanvas,
    format,
    videoBitsPerSecond: 1,
    audioBitsPerSecond: 1,
    hasAudio: true,
  });

beforeEach(() => {
  mb.state.samples.length = 0;
  mb.state.audioAdd.mockClear();
  mb.state.failAudio = false;
});

describe('createMediabunnySink audio', () => {
  it('closes every audio sample once it has been handed to the encoder', async () => {
    const sink = await make();
    await sink.addAudio(block(0), 0);
    await sink.addAudio(block(0.5), 0);
    await sink.finish();
    expect(mb.state.audioAdd).toHaveBeenCalledTimes(2);
    expect(mb.state.samples).toHaveLength(2);
    for (const sample of mb.state.samples) expect(sample.close).toHaveBeenCalledTimes(1);
  });

  it('closes the sample when the encoder fails, and names the audio encoder', async () => {
    mb.state.failAudio = true;
    const sink = await make();
    await expect(sink.addAudio(block(0), 0)).rejects.toThrow(
      /The audio encoder failed \(WEBM, vp9 \+ opus\): Encoding error/,
    );
    expect(mb.state.samples[0].close).toHaveBeenCalledTimes(1);
  });

  it('gathers blocks into half-second samples instead of encoding each 11 ms chunk', async () => {
    const sink = await make();
    const small = { ...block(0), sampleRate: 44_100 };
    for (let i = 0; i < 10; i += 1) await sink.addAudio(small, 0);
    expect(mb.state.audioAdd).not.toHaveBeenCalled();
    await sink.finish();
    expect(mb.state.audioAdd).toHaveBeenCalledTimes(1);
  });
});
