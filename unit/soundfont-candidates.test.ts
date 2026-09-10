import { describe, expect, it } from 'vitest';
import { buildSoundFontCandidates } from '@/lib/playback/soundfont';

/**
 * The embed is served under a basePath, and a soundfont path written from the
 * origin root misses the file vendored beside it. Next's `basePath` rewrites
 * links and imports, not strings fetched at runtime — which is why playback
 * failed in the scanner with the soundfont sitting at
 * `/score-editor/soundfonts/default.sf3` and the editor asking for
 * `/soundfonts/default.sf3`.
 *
 * Every same-origin fallback must be offered under the embed prefix before the
 * bare one.
 */
describe('soundfont candidates', () => {
  it('looks under the embed basePath first, then the origin root', () => {
    const candidates = buildSoundFontCandidates({ embedBuild: true });

    expect(candidates[0]).toBe('/score-editor/soundfonts/MuseScore_General.sf3');
    // The file actually vendored with the embed today.
    expect(candidates).toContain('/score-editor/soundfonts/default.sf3');
    // The bare paths stay, because a host may serve them there.
    expect(candidates).toContain('/soundfonts/default.sf3');
    expect(candidates.indexOf('/score-editor/soundfonts/default.sf3')).toBeLessThan(
      candidates.indexOf('/soundfonts/default.sf3'),
    );
  });

  it('offers only the origin root outside an embed build', () => {
    const candidates = buildSoundFontCandidates({ embedBuild: false });

    expect(candidates).toEqual([
      '/soundfonts/MuseScore_General.sf3',
      '/soundfonts/MuseScore_General.sf2',
      '/soundfonts/default.sf3',
      '/soundfonts/default.sf2',
    ]);
  });

  it('puts a configured CDN ahead of local fallbacks without duplicates', () => {
    const candidates = buildSoundFontCandidates({
      cdnUrl: 'https://cdn.example.test/default.sf3',
      embedBuild: false,
    });

    expect(candidates[0]).toBe('https://cdn.example.test/default.sf3');
    expect(candidates[1]).toBe('https://cdn.example.test/default.sf2');
    expect(new Set(candidates).size).toBe(candidates.length);
  });

  it('prefers a compressed sibling for a legacy direct SF2 URL', () => {
    const candidates = buildSoundFontCandidates({
      cdnUrl: 'https://cdn.example.test/default.sf2',
      embedBuild: false,
    });

    expect(candidates.slice(0, 2)).toEqual([
      'https://cdn.example.test/default.sf3',
      'https://cdn.example.test/default.sf2',
    ]);
  });
});
