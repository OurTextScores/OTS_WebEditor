import { describe, expect, it } from 'vitest';
import { isHostMode, selectWorkspaceMode } from '../../components/shell/selectWorkspaceMode';
import type { OtsActivity, OtsModeKind } from '../../components/shell/workspaceMode';

const select = (
  query: string,
  state: { compareViewActive?: boolean; activity?: OtsActivity } = {},
): OtsModeKind =>
  selectWorkspaceMode(new URLSearchParams(query), {
    compareViewActive: state.compareViewActive ?? false,
    activity: state.activity ?? 'write',
  });

describe('selectWorkspaceMode', () => {
  // One row per URL combination in SHELL_REDESIGN_DESIGN §2.4, then the precedence rules.
  const urlTable: [string, string, OtsModeKind][] = [
    ['no parameters', '', 'write'],
    ['a plain score launch', 'score=/bach.mscz', 'write'],
    ['compare embed', 'compareLeft=a.xml&compareRight=b.xml', 'host-compare'],
    [
      'compare embed with a change review',
      'compareLeft=a.xml&compareRight=b.xml&changeReviewId=r1',
      'host-compare',
    ],
    ['change review of one score', 'reviewScore=s.xml&changeReviewId=r1', 'host-change-review'],
    [
      'scanner rows',
      'compareLeft=a.xml&compareRight=b.xml&compareRegions=r.json&compareMode=rows',
      'host-scanner-rows',
    ],
    [
      'scanner findings',
      'compareLeft=a.xml&compareRegions=r.json&compareMode=findings',
      'host-scanner-findings',
    ],
  ];

  it.each(urlTable)('%s -> %s', (_name, query, expected) => {
    expect(select(query)).toBe(expected);
  });

  describe('parameters that do not make a host surface', () => {
    it.each([
      ['compareLeft alone', 'compareLeft=a.xml'],
      ['compareRight alone', 'compareRight=b.xml'],
      ['reviewScore without changeReviewId', 'reviewScore=s.xml'],
      ['changeReviewId without reviewScore', 'changeReviewId=r1'],
      [
        'regions and rows without both sides',
        'compareLeft=a.xml&compareRegions=r.json&compareMode=rows',
      ],
      ['findings without the regions document', 'compareLeft=a.xml&compareMode=findings'],
      ['findings without compareLeft', 'compareRegions=r.json&compareMode=findings'],
      ['blank changeReviewId', 'reviewScore=s.xml&changeReviewId=%20%20'],
    ])('%s stays in the editor', (_name, query) => {
      expect(select(query)).toBe('write');
    });
  });

  describe('a compare embed is still a compare embed', () => {
    it('when regions are supplied but the mode is not rows', () => {
      expect(select('compareLeft=a.xml&compareRight=b.xml&compareRegions=r.json')).toBe(
        'host-compare',
      );
      expect(
        select('compareLeft=a.xml&compareRight=b.xml&compareRegions=r.json&compareMode=other'),
      ).toBe('host-compare');
    });

    it('when rows is requested without the regions document', () => {
      expect(select('compareLeft=a.xml&compareRight=b.xml&compareMode=rows')).toBe('host-compare');
    });

    it('when findings is requested but a second reading was also supplied', () => {
      // Findings deliberately does not accept compareRight: a second reading means the
      // caller built the comparison URL, so it gets the comparison view.
      expect(
        select('compareLeft=a.xml&compareRight=b.xml&compareRegions=r.json&compareMode=findings'),
      ).toBe('host-compare');
    });
  });

  it('trims the values the editor trims', () => {
    expect(select('compareLeft=a.xml&compareRegions=%20r.json%20&compareMode=%20findings%20')).toBe(
      'host-scanner-findings',
    );
    expect(select('reviewScore=s.xml&changeReviewId=%20r1%20')).toBe('host-change-review');
  });

  describe('precedence', () => {
    it('host surfaces beat everything', () => {
      expect(select('reviewScore=s.xml&changeReviewId=r1', { compareViewActive: true })).toBe(
        'host-change-review',
      );
      expect(
        select('compareLeft=a.xml&compareRight=b.xml', {
          activity: 'history',
          compareViewActive: true,
        }),
      ).toBe('host-compare');
    });

    it('single-score change review beats a compare embed', () => {
      expect(
        select('reviewScore=s.xml&changeReviewId=r1&compareLeft=a.xml&compareRight=b.xml'),
      ).toBe('host-change-review');
    });

    it('findings beats rows beats change review beats compare embed', () => {
      const everything =
        'compareLeft=a.xml&compareRegions=r.json&compareMode=findings&reviewScore=s.xml&changeReviewId=r1';
      expect(select(everything)).toBe('host-scanner-findings');
      expect(
        select(
          'compareLeft=a.xml&compareRight=b.xml&compareRegions=r.json&compareMode=rows&reviewScore=s.xml&changeReviewId=r1',
        ),
      ).toBe('host-scanner-rows');
    });

    it('an open compare session beats the selected activity', () => {
      expect(select('', { compareViewActive: true, activity: 'write' })).toBe('compare');
      expect(select('', { compareViewActive: true, activity: 'history' })).toBe('compare');
    });

    it('otherwise the selected activity decides', () => {
      expect(select('', { activity: 'write' })).toBe('write');
      expect(select('', { activity: 'history' })).toBe('history');
    });
  });

  it('only host modes are chrome-less', () => {
    const all: OtsModeKind[] = [
      'write',
      'compare',
      'history',
      'host-compare',
      'host-change-review',
      'host-scanner-rows',
      'host-scanner-findings',
    ];
    expect(all.filter(isHostMode)).toEqual([
      'host-compare',
      'host-change-review',
      'host-scanner-rows',
      'host-scanner-findings',
    ]);
  });
});
