import { beforeEach, describe, expect, it, vi } from 'vitest';

const mb = vi.hoisted(() => {
  const state = {
    samples: [] as { close: ReturnType<typeof vi.fn> }[],
    videoSamples: [] as { close: ReturnType<typeof vi.fn> }[],
    audioAdd: vi.fn(),
    videoAdd: vi.fn(),
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
  class VideoSample {
    close = vi.fn();
    constructor(public frame: unknown) {
      state.videoSamples.push(this);
    }
  }
  class VideoSampleSource {
    add = async (sample: unknown) => {
      state.videoAdd(sample);
    };
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
      VideoSample,
      VideoSampleSource,
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
  mb.state.videoSamples.length = 0;
  mb.state.videoAdd.mockClear();
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

describe('createMediabunnySink I420 frames', () => {
  const frames: { data: Uint8Array; init: Record<string, unknown> }[] = [];
  let reads = 0;
  const makeI420 = () =>
    createMediabunnySink({
      canvas: {
        width: 4,
        height: 2,
        getContext: () => ({
          getImageData: () => {
            reads += 1;
            return { data: new Uint8ClampedArray(4 * 2 * 4).fill(255) };
          },
        }),
      } as unknown as OffscreenCanvas,
      format,
      videoBitsPerSecond: 1,
      audioBitsPerSecond: 1,
      hasAudio: false,
      frames: 'i420',
    });

  beforeEach(() => {
    frames.length = 0;
    reads = 0;
    vi.stubGlobal(
      'VideoFrame',
      class {
        constructor(
          public data: Uint8Array,
          public init: Record<string, unknown>,
        ) {
          frames.push({ data, init });
        }
      },
    );
  });

  it('gives the encoder a planar I420 frame in BT.709 with microsecond times, and closes the sample', async () => {
    const sink = await makeI420();
    await sink.addFrame(1.5, 0.5);
    expect(frames[0].init).toMatchObject({
      format: 'I420',
      codedWidth: 4,
      codedHeight: 2,
      timestamp: 1_500_000,
      duration: 500_000,
    });
    expect(frames[0].init.colorSpace).toMatchObject({ matrix: 'bt709', fullRange: false });
    expect(frames[0].data).toHaveLength(4 * 2 * 1.5);
    expect(mb.state.videoAdd).toHaveBeenCalledTimes(1);
    expect(mb.state.videoSamples[0].close).toHaveBeenCalledTimes(1);
  });

  it('reads the canvas back only for a changed frame, and reuses the pixels for repeats', async () => {
    const sink = await makeI420();
    await sink.addFrame(0, 0.1, false);
    await sink.addFrame(0.1, 0.1, true);
    await sink.addFrame(0.2, 0.1, true);
    expect(reads).toBe(1);
    expect(frames).toHaveLength(3);
    expect(frames[1].init.timestamp).toBe(100_000);
    await sink.addFrame(0.3, 0.1, false);
    expect(reads).toBe(2);
  });

  it('reads the canvas for the first frame even if told it is unchanged', async () => {
    const sink = await makeI420();
    await sink.addFrame(0, 0.1, true);
    expect(reads).toBe(1);
  });

  it('names the video encoder when it fails', async () => {
    const sink = await makeI420();
    mb.state.videoAdd.mockImplementationOnce(() => {
      throw new Error('Encoding error. (Unexpected frame format.)');
    });
    await expect(sink.addFrame(0, 0.1)).rejects.toThrow(
      /The video encoder failed \(WEBM, vp9\): Encoding error/,
    );
    expect(mb.state.videoSamples[0].close).toHaveBeenCalledTimes(1);
  });
});
