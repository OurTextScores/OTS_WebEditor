import {
  AudioSample,
  AudioSampleSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  WebMOutputFormat,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
} from 'mediabunny';
import type { AudioBlock } from './audioFeed';
import type { AudioCodecName, EncoderSupport, ExportFormat, VideoCodecName } from './capabilities';
import type { VideoSink } from './sink';

type Format = Extract<ExportFormat, { ok: true }>;

export interface SinkOptions {
  readonly canvas: OffscreenCanvas | HTMLCanvasElement;
  readonly format: Format;
  readonly videoBitsPerSecond: number;
  readonly audioBitsPerSecond: number;
  readonly hasAudio: boolean;
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
  const video = new CanvasSource(canvas, {
    codec: format.video,
    bitrate: options.videoBitsPerSecond,
  });
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
    await audio.add(
      new AudioSample({
        data: planar,
        format: 'f32-planar',
        numberOfChannels: 2,
        sampleRate,
        timestamp: startSeconds,
      }),
    );
  };

  return {
    addFrame: (timestampSeconds, durationSeconds) => video.add(timestampSeconds, durationSeconds),
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
