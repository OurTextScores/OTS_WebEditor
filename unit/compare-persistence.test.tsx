import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  normalizeNoteInputCursor,
  useComparePersistence,
} from '../components/score-editor/compare/useComparePersistence';
import type { CompareScoreRole } from '../components/score-editor/compare/compare-types';
import type { Score } from '../lib/webmscore-loader';

const liveScore = { id: 'live' } as unknown as Score;
const auxiliaryScore = { id: 'auxiliary' } as unknown as Score;

type Overrides = Partial<Parameters<typeof useComparePersistence>[0]>;

const renderPersistence = (overrides: Overrides = {}) => {
  const calls: string[] = [];
  const options = {
    getRole: (score: Score): CompareScoreRole => (score === liveScore ? 'current' : 'proposal'),
    getFallbackXml: () => '<fallback/>',
    exportXml: vi.fn(async () => '<after/>'),
    runSerialized: <T,>(operation: () => Promise<T>) => operation(),
    recordEdit: vi.fn(() => {
      calls.push('recordEdit');
    }),
    setNoteInputCursor: vi.fn(),
    commitProposalXml: vi.fn(() => {
      calls.push('commitProposal');
    }),
    commitCurrentXml: vi.fn(async () => {
      calls.push('commitCurrent');
    }),
    renderLiveEditor: vi.fn(async () => {
      calls.push('renderLive');
    }),
    renderEditedScore: vi.fn(async () => {
      calls.push('render');
    }),
    refreshSelectionGeometry: vi.fn(async () => {
      calls.push('geometry');
    }),
    bumpAlignmentRevision: vi.fn(() => {
      calls.push('alignment');
    }),
    ...overrides,
  };
  const hook = renderHook(() => useComparePersistence(options));
  return { ...hook, ...options, calls };
};

describe('normalizeNoteInputCursor', () => {
  it('normalizes a usable rect and clamps page and voice', () => {
    expect(
      normalizeNoteInputCursor({
        page: 2.7,
        x: 10,
        y: 20,
        width: 3,
        height: 40,
        voice: 9,
      }),
    ).toEqual({ page: 2, x: 10, y: 20, width: 3, height: 40, voice: 3 });

    expect(
      normalizeNoteInputCursor({
        page: -4,
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        voice: -2,
      }),
    ).toEqual({ page: 0, x: 0, y: 0, width: 1, height: 1, voice: 0 });
  });

  it.each([
    ['null', null],
    ['a zero-width rect', { page: 0, x: 0, y: 0, width: 0, height: 10, voice: 0 }],
    ['a zero-height rect', { page: 0, x: 0, y: 0, width: 10, height: 0, voice: 0 }],
    ['a negative-size rect', { page: 0, x: 0, y: 0, width: -5, height: 10, voice: 0 }],
    ['a non-finite coordinate', { page: 0, x: Number.NaN, y: 0, width: 4, height: 4, voice: 0 }],
    [
      'an infinite dimension',
      { page: 0, x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 4, voice: 0 },
    ],
    ['a missing field', { page: 0, x: 0, y: 0, width: 4 }],
  ])('rejects %s rather than painting a degenerate cursor', (_label, input) => {
    expect(normalizeNoteInputCursor(input)).toBeNull();
  });
});

describe('useComparePersistence', () => {
  it('clears the cursor on a build without the geometry export', async () => {
    const persistence = renderPersistence();

    await act(async () => {
      await persistence.result.current.refreshNoteInputCursor(liveScore, 'current', 'left');
    });

    expect(persistence.setNoteInputCursor).toHaveBeenCalledWith('current', null);
  });

  it('does not publish cursor geometry after invalidation', async () => {
    const score = {
      getNoteInputCursorRect: async () => ({
        page: 0,
        x: 1,
        y: 2,
        width: 3,
        height: 4,
        voice: 0,
      }),
    } as unknown as Score;
    const persistence = renderPersistence();

    await act(async () => {
      await persistence.result.current.refreshNoteInputCursor(
        score,
        'proposal',
        'right',
        () => false,
      );
    });

    expect(persistence.setNoteInputCursor).not.toHaveBeenCalled();
  });

  it('clears the cursor when the engine read throws', async () => {
    const score = {
      getNoteInputCursorRect: async () => {
        throw new Error('engine gone');
      },
    } as unknown as Score;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const persistence = renderPersistence();

    await act(async () => {
      await persistence.result.current.refreshNoteInputCursor(score, 'current', 'left');
    });

    expect(persistence.setNoteInputCursor).toHaveBeenCalledWith('current', null);
    warn.mockRestore();
  });

  it('records no edit when the export is byte-identical but still re-renders', async () => {
    const persistence = renderPersistence({ exportXml: vi.fn(async () => '<same/>') });

    let result: string | null = null;
    await act(async () => {
      result = await persistence.result.current.persistEdit(
        liveScore,
        'left',
        '<same/>',
        () => true,
      );
    });

    expect(result).toBe('<same/>');
    expect(persistence.recordEdit).not.toHaveBeenCalled();
    expect(persistence.calls).toEqual(['render', 'geometry']);
    expect(persistence.bumpAlignmentRevision).not.toHaveBeenCalled();
    // No document changed, so the editor under the modal must not be re-rendered.
    expect(persistence.renderLiveEditor).not.toHaveBeenCalled();
  });

  it('commits a proposal edit without touching live editor state', async () => {
    const persistence = renderPersistence();

    await act(async () => {
      await persistence.result.current.persistEdit(
        auxiliaryScore,
        'right',
        '<before/>',
        () => true,
      );
    });

    expect(persistence.recordEdit).toHaveBeenCalledWith('proposal', '<before/>', '<after/>');
    expect(persistence.commitProposalXml).toHaveBeenCalledWith('<after/>');
    expect(persistence.commitCurrentXml).not.toHaveBeenCalled();
    // A proposal edit must never re-render the live editor.
    expect(persistence.renderLiveEditor).not.toHaveBeenCalled();
    expect(persistence.calls).toEqual([
      'recordEdit',
      'commitProposal',
      'render',
      'geometry',
      'alignment',
    ]);
  });

  it('commits a current-role edit through the live editor path', async () => {
    const persistence = renderPersistence();

    await act(async () => {
      await persistence.result.current.persistEdit(liveScore, 'left', '<before/>', () => true);
    });

    expect(persistence.recordEdit).toHaveBeenCalledWith('current', '<before/>', '<after/>');
    expect(persistence.commitCurrentXml).toHaveBeenCalledWith('<after/>');
    expect(persistence.commitProposalXml).not.toHaveBeenCalled();
    // Ordering matters: the editor under the modal is re-rendered between the state
    // commit and the pane render, so it is already current when the modal closes.
    expect(persistence.calls).toEqual([
      'recordEdit',
      'commitCurrent',
      'renderLive',
      'render',
      'geometry',
      'alignment',
    ]);
  });

  it('stops before rendering when the generation is invalidated during export', async () => {
    const persistence = renderPersistence();

    let result: string | null = '<unset/>';
    await act(async () => {
      result = await persistence.result.current.persistEdit(
        liveScore,
        'left',
        '<before/>',
        () => false,
      );
    });

    expect(result).toBeNull();
    expect(persistence.recordEdit).not.toHaveBeenCalled();
    expect(persistence.calls).toEqual([]);
  });

  it('stops before alignment when invalidated after the state commit', async () => {
    let live = true;
    const persistence = renderPersistence({
      commitCurrentXml: vi.fn(async () => {
        live = false;
      }),
    });

    let result: string | null = '<unset/>';
    await act(async () => {
      result = await persistence.result.current.persistEdit(
        liveScore,
        'left',
        '<before/>',
        () => live,
      );
    });

    expect(result).toBeNull();
    expect(persistence.renderLiveEditor).not.toHaveBeenCalled();
    expect(persistence.renderEditedScore).not.toHaveBeenCalled();
    expect(persistence.bumpAlignmentRevision).not.toHaveBeenCalled();
  });

  it('throws when the score cannot be exported', async () => {
    const persistence = renderPersistence({ exportXml: vi.fn(async () => null) });

    await expect(
      act(async () => {
        await persistence.result.current.persistEdit(liveScore, 'left', '<before/>', () => true);
      }),
    ).rejects.toThrow('Unable to export the edited compare score.');
  });
});
