import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OPTIONS,
  estimateBytes,
  fileNameFor,
  formatBytes,
  frameSize,
  videoBitrate,
} from '../../lib/video-export/options';

describe('video export options', () => {
  it('uses even frame sizes, which H.264 requires', () => {
    for (const layout of ['landscape', 'portrait'] as const) {
      const { width, height } = frameSize(layout);
      expect(width % 2).toBe(0);
      expect(height % 2).toBe(0);
    }
    expect(frameSize('landscape')).toEqual({ width: 1920, height: 1080 });
    expect(frameSize('portrait')).toEqual({ width: 1080, height: 1920 });
  });

  it('asks for more bits at 60 fps, but not double', () => {
    expect(videoBitrate(60)).toBeGreaterThan(videoBitrate(30));
    expect(videoBitrate(60)).toBeLessThan(videoBitrate(30) * 2);
  });

  it('estimates the size from the bitrates and the duration', () => {
    expect(estimateBytes(10_000, DEFAULT_OPTIONS)).toBe(
      Math.round(10 * ((2_000_000 + 128_000) / 8)),
    );
    expect(estimateBytes(10_000, { ...DEFAULT_OPTIONS, audio: false })).toBe(10 * 250_000);
  });

  it('makes a safe file name from the title', () => {
    expect(fileNameFor('Fauré: Après un rêve / op. 7?', 'mp4')).toBe(
      'Fauré Après un rêve op. 7.mp4',
    );
    expect(fileNameFor('', 'webm')).toBe('score.webm');
    expect(fileNameFor(null, 'mp4')).toBe('score.mp4');
    expect(fileNameFor('x'.repeat(200), 'mp4')).toHaveLength(80 + 4);
  });

  it('formats sizes', () => {
    expect(formatBytes(500)).toBe('1 KB');
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB');
    expect(formatBytes(250 * 1024 * 1024)).toBe('250 MB');
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.0 GB');
  });
});
