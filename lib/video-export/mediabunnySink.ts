import {
  AudioSample,
  AudioSampleSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  VideoSample,
  VideoSampleSource,
  WebMOutputFormat,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
} from 'mediabunny';
import type { AudioBlock } from './audioFeed';
import type { AudioCodecName, EncoderSupport, ExportFormat, VideoCodecName } from './capabilities';
import { rgbaToI420 } from './i420';
import type { VideoSink } from './sink';

type Format = Extract<ExportFormat, { ok: true }>;

export interface SinkOptions {
  readonly canvas: OffscreenCanvas | HTMLCanvasElement;
  readonly format: Format;
  readonly videoBitsPerSecond: number;
  readonly audioBitsPerSecond: number;
  readonly hasAudio: boolean;
  /**
   * How frames reach the encoder. `canvas` hands it the canvas itself (fast; the browser picks the frame's backing);
   * `i420` reads the pixels back and gives it plain CPU I420 frames, which encoders that reject canvas-backed frames accept.
   */
  readonly frames?: 'canvas' | 'i420';
  /** Ask for the browser's software encoder: some platform hardware encoders reject frames the software one accepts. */
  readonly hardwareAcceleration?: 'prefer-software';
  /** Stream the file here (a `FileSystemWritableFileStream`) instead of holding it in memory. */
  readonly writable?: WritableStream;
}

/** Seconds of audio gathered before it is handed to the encoder; a chunk is 11 ms, far too small to encode alone. */
const AUDIO_BATCH_SECONDS = 0.5;

/** The browser's encoders, found by asking it, for `chooseFormat`. */
export async function probeEncoders(size: {
  width: number;
  height: number;
}): Promise<EncoderSupport> {
  const videoCandidates: VideoCodecName[] = ['avc', 'vp9', 'av1'];
  const audioCandidates: AudioCodecName[] = ['aac', 'opus'];
  const video: VideoCodecName[] = [];
  const audio: AudioCodecName[] = [];
  if (typeof VideoEncoder === 'undefined') return { video, audio };
  for (const codec of videoCandidates) {
    if ((await getFirstEncodableVideoCodec([codec], size)) === codec) video.push(codec);
  }
  if (typeof AudioEncoder !== 'undefined') {
    for (const codec of audioCandidates) {
      if (
        (await getFirstEncodableAudioCodec([codec], {
          numberOfChannels: 2,
          sampleRate: 44_100,
        })) === codec
      ) {
        audio.push(codec);
      }
    }
  }
  return { video, audio };
}

/** An encoder failure with which encoder and format it was, since the browser's own message names neither. */
function named(encoder: string, format: Format, hasAudio: boolean, error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error);
  const codecs = `${format.container.toUpperCase()}, ${format.video}${hasAudio ? ` + ${format.audio}` : ''}`;
  return new Error(`${encoder} failed (${codecs}): ${detail}`, { cause: error });
}

/** The real sink: mediabunny's canvas video source and audio sample source into an MP4 or WebM container. */
export async function createMediabunnySink(options: SinkOptions): Promise<VideoSink> {
  const { canvas, format } = options;
  const bufferTarget = options.writable ? null : new BufferTarget();
  const target = options.writable
    ? new StreamTarget(options.writable, { chunked: true })
    : bufferTarget!;
  const output = new Output({
    format: format.container === 'mp4' ? new Mp4OutputFormat() : new WebMOutputFormat(),
    target,
  });
  const videoConfig = {
    codec: format.video,
    bitrate: options.videoBitsPerSecond,
    ...(options.hardwareAcceleration ? { hardwareAcceleration: options.hardwareAcceleration } : {}),
  };
  const i420 = options.frames === 'i420';
  let lastPixels: Uint8Array | null = null;
  const video = i420 ? new VideoSampleSource(videoConfig) : new CanvasSource(canvas, videoConfig);
  output.addVideoTrack(video);
  const audio = options.hasAudio
    ? new AudioSampleSource({ codec: format.audio, bitrate: options.audioBitsPerSecond })
    : null;
  if (audio) output.addAudioTrack(audio);
  await output.start();

  // Audio is gathered into ~0.5 s samples; the first block fixes the track's channel count and rate.
  let pending: {
    channels: Float32Array[];
    startSeconds: number;
    sampleRate: number;
    frames: number;
  } | null = null;
  const flushAudio = async () => {
    if (!pending || !audio) return;
    const { channels, startSeconds, sampleRate, frames } = pending;
    pending = null;
    const planar = new Float32Array(frames * 2);
    // Always stereo: a mono block is duplicated, so the track never changes shape mid-stream.
    planar.set(channels[0], 0);
    planar.set(channels[1] ?? channels[0], frames);
    // The encoder takes a copy; the sample itself is ours to close, or the browser warns when it is collected.
    const sample = new AudioSample({
      data: planar,
      format: 'f32-planar',
      numberOfChannels: 2,
      sampleRate,
      timestamp: startSeconds,
    });
    try {
      await audio.add(sample);
    } catch (error) {
      throw named('The audio encoder', format, options.hasAudio, error);
    } finally {
      sample.close();
    }
  };

  return {
    async addFrame(timestampSeconds, durationSeconds, unchanged = false) {
      try {
        if (video instanceof CanvasSource)
          return await video.add(timestampSeconds, durationSeconds);
        const context = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
        const { width, height } = canvas;
        // Reading the canvas back and converting it is the slow part; a frame the same as the last reuses its pixels.
        if (!unchanged || lastPixels === null) {
          lastPixels = rgbaToI420(context.getImageData(0, 0, width, height).data, width, height);
        }
        const pixels = lastPixels;
        const sample = new VideoSample(
          new VideoFrame(pixels, {
            format: 'I420',
            codedWidth: width,
            codedHeight: height,
            timestamp: Math.round(timestampSeconds * 1e6),
            duration: Math.round(durationSeconds * 1e6),
            colorSpace: {
              primaries: 'bt709',
              transfer: 'bt709',
              matrix: 'bt709',
              fullRange: false,
            },
          }),
        );
        try {
          await video.add(sample);
        } finally {
          sample.close();
        }
      } catch (error) {
        throw named('The video encoder', format, options.hasAudio, error);
      }
    },
    async addAudio(block: AudioBlock, offsetSeconds: number) {
      if (!audio) return;
      const left = block.channels[0];
      const right = block.channels[1] ?? left;
      if (!pending) {
        pending = {
          channels: [new Float32Array(0), new Float32Array(0)],
          startSeconds: block.startSeconds + offsetSeconds,
          sampleRate: block.sampleRate,
          frames: 0,
        };
      }
      const join = (a: Float32Array, b: Float32Array) => {
        const out = new Float32Array(a.length + b.length);
        out.set(a);
        out.set(b, a.length);
        return out;
      };
      pending.channels = [join(pending.channels[0], left), join(pending.channels[1], right)];
      pending.frames += block.frames;
      if (pending.frames / pending.sampleRate >= AUDIO_BATCH_SECONDS) await flushAudio();
    },
    async finish() {
      await flushAudio();
      await output.finalize();
      return bufferTarget?.buffer
        ? new Blob([bufferTarget.buffer], { type: format.mimeType })
        : null;
    },
    async cancel() {
      pending = null;
      await output.cancel();
    },
  };
}
