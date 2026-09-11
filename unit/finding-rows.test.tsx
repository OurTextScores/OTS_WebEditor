import { describe, expect, it } from 'vitest';

import { groupFindingsByKind } from '../components/score-editor/compare/ScannerFindingRows';

/**
 * The grouping is the whole navigation model, so it is tested on its own.
 *
 * Stepping through *kinds* rather than findings is the point: eleven identical layout
 * deviations are one thing with a count. A reviewer stepping through them individually
 * would answer the same question eleven times, and dispositions are recorded per kind and
 * part for exactly that reason.
 */
const finding = (kind: string, system?: number, part?: string) => ({
  kind,
  message: `${kind} at ${system ?? 'page'}`,
  ...(system === undefined ? {} : { system }),
  ...(part ? { part } : {}),
});

describe('groupFindingsByKind', () => {
  it('collapses repetitions of one kind into a single issue with a count', () => {
    // The real page: 11 layout deviations, 2 slur stops, 4 slur starts.
    const groups = groupFindingsByKind([
      ...Array.from({ length: 11 }, (_, i) => finding('profile_layout_deviation', i)),
      ...Array.from({ length: 2 }, (_, i) => finding('dangling_slur_stop', i)),
      ...Array.from({ length: 4 }, (_, i) => finding('dangling_slur_start', i)),
    ]);
    expect(groups).toHaveLength(3);
    expect(groups.map((group) => group.findings.length)).toEqual([11, 2, 4]);
  });

  it('keeps kinds in first-seen order, so navigation matches the reading order', () => {
    const groups = groupFindingsByKind([
      finding('dangling_slur_start', 3),
      finding('clef_profile_mismatch', 1),
      finding('dangling_slur_start', 5),
    ]);
    expect(groups.map((group) => group.kind)).toEqual([
      'dangling_slur_start',
      'clef_profile_mismatch',
    ]);
  });

  it('lists each touched system once, in page order', () => {
    // Two findings on the same system are one strip, not two.
    const groups = groupFindingsByKind([
      finding('time_signature_mismatch', 4),
      finding('time_signature_mismatch', 1),
      finding('time_signature_mismatch', 4),
    ]);
    expect(groups[0].systems).toEqual([1, 4]);
  });

  it('leaves a page-level kind with no systems rather than inventing one', () => {
    // `page_staff_count_mismatch` is raised with staff positions and no system at all.
    // Pointing it at a strip would point at the wrong place.
    const groups = groupFindingsByKind([finding('page_staff_count_mismatch')]);
    expect(groups[0].systems).toEqual([]);
    expect(groups[0].findings).toHaveLength(1);
  });

  it('keeps a page-level finding even when others of its kind have systems', () => {
    const groups = groupFindingsByKind([
      finding('part_order_mismatch'),
      finding('part_order_mismatch', 2),
    ]);
    expect(groups[0].findings).toHaveLength(2);
    expect(groups[0].systems).toEqual([2]);
  });

  it('carries the part through, since a decision is per kind and part', () => {
    const groups = groupFindingsByKind([finding('clef_profile_mismatch', 0, 'cello')]);
    expect(groups[0].findings[0].part).toBe('cello');
  });

  it('returns nothing for nothing', () => {
    expect(groupFindingsByKind([])).toEqual([]);
  });
});

/**
 * The two levels exist for different reasons and must not be conflated: the outer steps
 * between questions, the inner between the places raising the same question. Eleven
 * layout deviations are one decision and eleven things to look at.
 */
describe('examples within a kind', () => {
  it('keeps every occurrence, so each can be looked at in turn', () => {
    const groups = groupFindingsByKind(
      Array.from({ length: 11 }, (_, i) => finding('profile_layout_deviation', i)),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].findings).toHaveLength(11);
    expect(groups[0].findings.map((f) => f.system)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it('keeps examples that name different parts distinguishable', () => {
    // A decision is recorded against a kind *and part*. One kind can raise the same
    // question about several parts, so the example -- not the kind -- carries the part
    // the host decides about.
    const groups = groupFindingsByKind([
      finding('clef_profile_mismatch', 0, 'cello'),
      finding('clef_profile_mismatch', 1, 'viola'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].findings.map((f) => f.part)).toEqual(['cello', 'viola']);
  });

  it('keeps two occurrences on one system as two examples', () => {
    // Deduplicated for strips, not for stepping: two slurs on one system are two things
    // to look at even though they share a picture.
    const groups = groupFindingsByKind([
      finding('dangling_slur_start', 2),
      finding('dangling_slur_start', 2),
    ]);
    expect(groups[0].findings).toHaveLength(2);
    expect(groups[0].systems).toEqual([2]);
  });
});
