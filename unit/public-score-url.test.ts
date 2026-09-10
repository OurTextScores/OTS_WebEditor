import { describe, expect, it } from 'vitest';

import {
  buildScoreEditorShareUrl,
  detectScoreInputFormat,
  isGoogleDriveScoreUrl,
  resolvePublicScoreUrl,
} from '../lib/public-score-url';

describe('resolvePublicScoreUrl', () => {
  it('routes a Google Drive share URL through the server-side proxy', () => {
    expect(
      resolvePublicScoreUrl('https://drive.google.com/file/d/abc_123-XYZ/view?usp=sharing'),
    ).toBe(
      '/api/fetch-score?url=https%3A%2F%2Fdrive.usercontent.google.com%2Fdownload%3Fid%3Dabc_123-XYZ%26export%3Ddownload',
    );
  });

  it('supports Google Drive links that carry the file ID in the query', () => {
    expect(resolvePublicScoreUrl('https://drive.google.com/open?id=abc123')).toBe(
      '/api/fetch-score?url=https%3A%2F%2Fdrive.usercontent.google.com%2Fdownload%3Fid%3Dabc123%26export%3Ddownload',
    );
  });

  it('uses NEXT_PUBLIC_SCORE_EDITOR_API_BASE as the proxy prefix in embed builds', () => {
    const original = process.env.NEXT_PUBLIC_SCORE_EDITOR_API_BASE;
    process.env.NEXT_PUBLIC_SCORE_EDITOR_API_BASE = '/api/score-editor';
    try {
      expect(resolvePublicScoreUrl('https://drive.google.com/file/d/abc123/view?usp=sharing')).toBe(
        '/api/score-editor/fetch-score?url=https%3A%2F%2Fdrive.usercontent.google.com%2Fdownload%3Fid%3Dabc123%26export%3Ddownload',
      );
    } finally {
      if (original === undefined) delete process.env.NEXT_PUBLIC_SCORE_EDITOR_API_BASE;
      else process.env.NEXT_PUBLIC_SCORE_EDITOR_API_BASE = original;
    }
  });

  it('does not alter relative or non-Google URLs', () => {
    expect(resolvePublicScoreUrl('/scores/example.musicxml')).toBe('/scores/example.musicxml');
    expect(resolvePublicScoreUrl('https://example.com/example.mscz')).toBe(
      'https://example.com/example.mscz',
    );
  });
});

describe('buildScoreEditorShareUrl', () => {
  it('uses the runtime origin and editor path while removing unrelated query parameters', () => {
    const driveUrl = 'https://drive.google.com/file/d/abc123/view?usp=sharing';
    expect(
      buildScoreEditorShareUrl(
        driveUrl,
        'https://www.ourtextscores.com/score-editor?old=value#section',
      ),
    ).toBe(`https://www.ourtextscores.com/score-editor?score=${encodeURIComponent(driveUrl)}`);
  });

  it('supports an explicitly configured public editor URL', () => {
    expect(
      buildScoreEditorShareUrl(
        'https://drive.google.com/open?id=abc123',
        'http://localhost:3000/',
        'https://staging.example.com/score-editor',
      ),
    ).toBe(
      'https://staging.example.com/score-editor?score=https%3A%2F%2Fdrive.google.com%2Fopen%3Fid%3Dabc123',
    );
  });

  it('recognizes Drive file links but rejects folders and other providers', () => {
    expect(isGoogleDriveScoreUrl('https://drive.google.com/file/d/abc123/view')).toBe(true);
    expect(isGoogleDriveScoreUrl('https://drive.google.com/drive/folders/abc123')).toBe(false);
    expect(isGoogleDriveScoreUrl('https://example.com/score.mscz')).toBe(false);
  });
});

describe('detectScoreInputFormat', () => {
  it('detects MusicXML from extensionless XML data', () => {
    const data = new TextEncoder().encode('<?xml version="1.0"?><score-partwise version="4.0">');
    expect(detectScoreInputFormat('https://example.com/download?id=1', data)).toBe('musicxml');
  });

  it('distinguishes compressed MusicXML from MSCZ using ZIP entry names', () => {
    const mxl = new Uint8Array([0x50, 0x4b, ...new TextEncoder().encode('META-INF/container.xml')]);
    // Classic MSCZ (pre-4.x): just a .mscx inside the zip
    const msczClassic = new Uint8Array([0x50, 0x4b, ...new TextEncoder().encode('score.mscx')]);
    // MuseScore 4.x MSCZ: also has META-INF/container.xml alongside the .mscx
    const mscz4x = new Uint8Array([
      0x50,
      0x4b,
      ...new TextEncoder().encode('something-5string.mscxMETA-INF/container.xml'),
    ]);
    expect(detectScoreInputFormat('https://example.com/download', mxl)).toBe('mxl');
    expect(detectScoreInputFormat('https://example.com/download', msczClassic)).toBe('mscz');
    expect(detectScoreInputFormat('https://example.com/download', mscz4x)).toBe('mscz');
  });

  it('uses .mscz extension to fast-path detection without reading file bytes', () => {
    expect(detectScoreInputFormat('https://example.com/something.mscz')).toBe('mscz');
    expect(detectScoreInputFormat('https://example.com/something.mscz?token=abc')).toBe('mscz');
  });
});
