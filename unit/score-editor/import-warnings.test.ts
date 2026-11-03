import { afterEach, describe, expect, it } from 'vitest';
import { notifyImportWarnings } from '../../components/score-editor/import-warnings';
import { clearNotices, getNoticeSnapshot } from '../../components/shell/notices';

describe('import warnings notice (roadmap E25)', () => {
  afterEach(() => clearNotices());

  it('says nothing when the import reported no problems', () => {
    notifyImportWarnings([]);
    expect(getNoticeSnapshot().notices).toHaveLength(0);
  });

  it("lists the importer's problems as one warning, as MuseScore words it", () => {
    notifyImportWarnings(['The MEI file does not seem to be a MEI Basic version file']);
    const [notice] = getNoticeSnapshot().notices;
    expect(notice.kind).toBe('warning');
    expect(notice.title).toBe('1 problem occurred and the import may be incomplete.');
    expect(notice.detail).toBe('The MEI file does not seem to be a MEI Basic version file');
  });

  it('lists the first eight and counts the rest', () => {
    notifyImportWarnings(Array.from({ length: 11 }, (_, i) => `problem ${i + 1}`));
    const [notice] = getNoticeSnapshot().notices;
    expect(notice.title).toBe('11 problems occurred and the import may be incomplete.');
    expect(notice.detail?.split('\n')).toEqual([
      ...Array.from({ length: 8 }, (_, i) => `problem ${i + 1}`),
      '…and 3 more',
    ]);
  });
});
