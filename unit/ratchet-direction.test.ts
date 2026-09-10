import { describe, expect, it } from 'vitest';
import { analyzeRatchetDirection } from '../scripts/ratchet-direction.mjs';
import type { RatchetBudget } from '../scripts/ratchet-direction.mjs';

const reason = 'Bug fix adds a guarded orientation mapping to the render path.';

const budget = (overrides: Partial<RatchetBudget> = {}): RatchetBudget => ({
  _comment: 'prose, not a budget',
  scoreEditor: { maxLines: 18887, maxBytes: 881728 },
  eslint: { maxErrors: 0, maxWarnings: 0 },
  modules: {
    'components/score-editor/compare/CompareScorePane.tsx': { maxLines: 900, maxBytes: 36000 },
  },
  ...overrides,
});

describe('analyzeRatchetDirection', () => {
  it('passes when every budget stays put or falls', () => {
    const lowered = budget({ scoreEditor: { maxLines: 18000, maxBytes: 870000 } });

    expect(analyzeRatchetDirection(budget(), lowered)).toEqual({ raises: [], failures: [] });
    expect(analyzeRatchetDirection(budget(), budget())).toEqual({ raises: [], failures: [] });
  });

  it('fails an undeclared raise, naming the entry that would authorize it', () => {
    const raised = budget({ scoreEditor: { maxLines: 18893, maxBytes: 881893 } });

    const { raises, failures } = analyzeRatchetDirection(budget(), raised);

    expect(raises).toEqual([
      { key: 'scoreEditor.maxLines', from: 18887, to: 18893 },
      { key: 'scoreEditor.maxBytes', from: 881728, to: 881893 },
    ]);
    expect(failures).toHaveLength(2);
    expect(failures.every((failure) => failure.rule === 'undeclared-raise')).toBe(true);
    expect(failures[0].detail).toContain(
      '"key": "scoreEditor.maxLines", "from": 18887, "to": 18893',
    );
  });

  it('accepts a raise declared with matching values and a reason', () => {
    const raised = budget({
      scoreEditor: { maxLines: 18893, maxBytes: 881893 },
      raises: [
        { key: 'scoreEditor.maxLines', from: 18887, to: 18893, reason },
        { key: 'scoreEditor.maxBytes', from: 881728, to: 881893, reason },
      ],
    });

    expect(analyzeRatchetDirection(budget(), raised).failures).toEqual([]);
  });

  it('rejects a declaration whose before value does not match, so an old entry cannot re-authorize a later raise', () => {
    // The entry describes the raise that already landed. A second raise from the new
    // floor is a different raise and needs its own justification.
    const base = budget({
      scoreEditor: { maxLines: 18893, maxBytes: 881728 },
      raises: [{ key: 'scoreEditor.maxLines', from: 18887, to: 18893, reason }],
    });
    const raisedAgain = budget({
      scoreEditor: { maxLines: 19100, maxBytes: 881728 },
      raises: [{ key: 'scoreEditor.maxLines', from: 18887, to: 18893, reason }],
    });

    const { failures } = analyzeRatchetDirection(base, raisedAgain);

    expect(failures).toHaveLength(1);
    expect(failures[0].rule).toBe('undeclared-raise');
  });

  it('rejects a raise whose reason is missing or too thin to review', () => {
    const raised = budget({
      scoreEditor: { maxLines: 18893, maxBytes: 881728 },
      raises: [{ key: 'scoreEditor.maxLines', from: 18887, to: 18893, reason: 'wip' }],
    });

    const { failures } = analyzeRatchetDirection(budget(), raised);

    expect(failures).toHaveLength(1);
    expect(failures[0].rule).toBe('unjustified-raise');
  });

  it('treats a newly budgeted module as a new budget, not a raise', () => {
    const added = budget({
      modules: {
        'components/score-editor/compare/CompareScorePane.tsx': { maxLines: 900, maxBytes: 36000 },
        'components/score-editor/compare/CompareDiffGutter.tsx': { maxLines: 900, maxBytes: 52000 },
      },
    });

    expect(analyzeRatchetDirection(budget(), added)).toEqual({ raises: [], failures: [] });
  });

  it('catches module budgets too, not just the ScoreEditor ones', () => {
    const raised = budget({
      modules: {
        'components/score-editor/compare/CompareScorePane.tsx': { maxLines: 1200, maxBytes: 36000 },
      },
    });

    const { failures } = analyzeRatchetDirection(budget(), raised);

    expect(failures).toHaveLength(1);
    expect(failures[0].detail).toContain(
      'modules.components/score-editor/compare/CompareScorePane.tsx.maxLines',
    );
  });

  it('flags a raises entry that no longer names a real budget', () => {
    const withStale = budget({
      raises: [{ key: 'scoreEditor.maxGlyphs', from: 1, to: 2, reason }],
    });

    const { failures } = analyzeRatchetDirection(budget(), withStale);

    expect(failures).toEqual([expect.objectContaining({ rule: 'stale-raise-entry' })]);
  });
});
