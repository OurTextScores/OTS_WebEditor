import { describe, expect, it } from 'vitest';

import { sanitizeEditorLaunchContext } from '@/lib/editor-launch-context';

/**
 * Two silent-drop points stand between a reviewer clicking "fix the reading" and the
 * backend knowing why a bar changed, and neither would raise anything if it failed.
 *
 * `sanitizeEditorLaunchContext` iterates a field allowlist, so a field missing from it
 * vanishes however carefully the caller sends it. And the save query is rebuilt key by
 * key, which has already lost a field three times on the scanner side.
 *
 * An edit that arrives without its source is filed as a comparison edit: the corpus then
 * records that two independent readings disagreed, on a job where only one reading
 * exists.
 */
describe('finding context survives the launch allowlist', () => {
  it('keeps the finding kind and part', () => {
    expect(
      sanitizeEditorLaunchContext({
        source: 'scanner',
        findingKind: 'clef_profile_mismatch',
        findingPart: 'cello',
      }),
    ).toMatchObject({ findingKind: 'clef_profile_mismatch', findingPart: 'cello' });
  });

  it('keeps them alongside the fields the scanner already sends', () => {
    const context = sanitizeEditorLaunchContext({
      source: 'scanner',
      sourceLabel: 'quartet.pdf — page 1',
      canonicalXmlUrl: 'https://example.test/score.musicxml',
      findingKind: 'dangling_slur_start',
    });
    expect(context).toMatchObject({
      source: 'scanner',
      sourceLabel: 'quartet.pdf — page 1',
      findingKind: 'dangling_slur_start',
    });
  });

  it('omits them entirely for an ordinary launch', () => {
    const context = sanitizeEditorLaunchContext({ source: 'scanner' });
    expect(context).not.toHaveProperty('findingKind');
    expect(context).not.toHaveProperty('findingPart');
  });

  it('bounds them like every other field', () => {
    const context = sanitizeEditorLaunchContext({
      findingKind: 'k'.repeat(200),
      findingPart: 'p'.repeat(400),
    });
    expect(context!.findingKind).toHaveLength(64);
    expect(context!.findingPart).toHaveLength(128);
  });

  it('drops a non-string rather than coercing it', () => {
    expect(sanitizeEditorLaunchContext({ findingKind: 42, source: 'scanner' }))
      .not.toHaveProperty('findingKind');
  });
});
