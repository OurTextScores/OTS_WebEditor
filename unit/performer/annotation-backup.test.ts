import { describe, expect, it } from 'vitest';
import {
  backupFileName,
  backupOf,
  parseBackup,
} from '../../components/performer/annotations/annotationBackup';
import type { Annotation } from '../../components/performer/annotations/annotationModel';

const mark: Annotation = {
  id: 'a1',
  scoreKey: '/s.mscz',
  scorePart: 0,
  kind: 'ink',
  anchor: { bar: 3, part: 0 },
  points: [
    [0, 0, 0.5],
    [1, 1, 0.6],
  ],
  style: { color: 'crimson', width: 0.18, opacity: 1 },
  hiddenAt: [2],
  createdAt: 1,
};

describe('marks backup', () => {
  it('round-trips', () => {
    const text = JSON.stringify(backupOf([mark], new Date('2026-11-06T10:00:00Z')));
    expect(parseBackup(text)).toEqual({ annotations: [mark], skipped: 0 });
    expect(backupFileName(new Date('2026-11-06T10:00:00Z'))).toBe(
      'ots-perform-marks-2026-11-06.json',
    );
  });

  it('skips damaged marks and refuses other files and newer versions', () => {
    const backup = {
      ...backupOf([mark]),
      annotations: [mark, { ...mark, id: 7 }, { ...mark, points: [[1, 2]] }],
    };
    expect(parseBackup(JSON.stringify(backup))).toEqual({ annotations: [mark], skipped: 2 });
    expect(parseBackup('not json')).toEqual({ error: 'This file is not a marks backup.' });
    expect(parseBackup('{"format":"other","annotations":[]}')).toEqual({
      error: 'This file is not a marks backup.',
    });
    expect(parseBackup(JSON.stringify({ ...backupOf([]), version: 2 }))).toEqual({
      error: 'This backup is from a newer version of OurTextScores.',
    });
  });
});
