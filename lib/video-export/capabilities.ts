export type VideoContainer = 'mp4' | 'webm';
export type VideoCodecName = 'avc' | 'vp9' | 'av1';
export type AudioCodecName = 'aac' | 'opus';

/** What this browser can encode, as found by probing (see `probeEncoders`). */
export interface EncoderSupport {
  readonly video: readonly VideoCodecName[];
  readonly audio: readonly AudioCodecName[];
}

export type ExportFormat =
  | {
      readonly ok: true;
      readonly container: VideoContainer;
      readonly video: VideoCodecName;
      readonly audio: AudioCodecName;
      readonly extension: 'mp4' | 'webm';
      readonly mimeType: string;
    }
  | { readonly ok: false; readonly reason: string };

/**
 * `withAudio` false (a silent video) needs no audio encoder at all, so MP4 is chosen whenever H.264 encodes.
 * MP4 (H.264 + AAC) where both encode, since that plays everywhere; else WebM (VP9 or AV1 + Opus). MP4 with Opus is not
 * offered: it plays poorly outside browsers. Without a usable pair the reason is spelled out for the dialog.
 */
export function chooseFormat(support: EncoderSupport, withAudio = true): ExportFormat {
  if (support.video.includes('avc') && (!withAudio || support.audio.includes('aac'))) {
    return {
      ok: true,
      container: 'mp4',
      video: 'avc',
      audio: 'aac',
      extension: 'mp4',
      mimeType: 'video/mp4',
    };
  }
  const webmVideo = support.video.includes('vp9')
    ? 'vp9'
    : support.video.includes('av1')
      ? 'av1'
      : null;
  if (webmVideo && (!withAudio || support.audio.includes('opus'))) {
    return {
      ok: true,
      container: 'webm',
      video: webmVideo,
      audio: 'opus',
      extension: 'webm',
      mimeType: 'video/webm',
    };
  }
  if (support.video.length === 0) {
    return {
      ok: false,
      reason:
        'This browser cannot encode video (WebCodecs is not available). Try a recent Chrome, Edge or Safari.',
    };
  }
  return {
    ok: false,
    reason:
      'This browser cannot encode a matching audio track. Try a recent Chrome, Edge or Safari.',
  };
}

/** The longest export, in seconds of video, for the given bitrate when the output is held in memory. */
export function maxInMemorySeconds(
  videoBitsPerSecond: number,
  audioBitsPerSecond: number,
  memoryBytes = 400 * 1024 * 1024,
): number {
  const bytesPerSecond = (videoBitsPerSecond + audioBitsPerSecond) / 8;
  return Math.floor(memoryBytes / bytesPerSecond);
}
