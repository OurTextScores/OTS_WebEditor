import { afterEach, describe, expect, it } from 'vitest';
import type { Score } from '../../lib/webmscore-loader';
import { exportFileName, resetParts, safeFileStem } from '../../components/score-editor/parts';
import { setPartsSnapshot } from '../../components/score-editor/parts/partsStore';

describe('export file names in a part view (roadmap E18)', () => {
  afterEach(() => resetParts());

  it('names the shown part, and only then', () => {
    expect(exportFileName('pdf')).toBe('score.pdf');
    setPartsSnapshot({
      score: {} as Score,
      parts: [
        { name: 'Violin I', instruments: ['Violin'] },
        { name: 'Cello/Bass', instruments: ['Cello'] },
      ],
      current: 1,
    });
    expect(exportFileName('pdf')).toBe('score-CelloBass.pdf');
    expect(exportFileName('png', 'score-page-2')).toBe('score-page-2-CelloBass.png');
    setPartsSnapshot({ current: -1 });
    expect(exportFileName('mid')).toBe('score.mid');
  });

  it('keeps letters in any script, and falls back for a name with none', () => {
    expect(safeFileStem('Violoncelle (é) / 2')).toBe('Violoncelle é  2');
    expect(safeFileStem('??')).toBe('part');
  });
});
