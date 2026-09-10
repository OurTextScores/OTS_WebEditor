import { describe, expect, it } from 'vitest';

import {
  AI_EDIT_EFFORT_PROFILES,
  DEFAULT_AI_EDIT_EFFORT,
  formatAiEditBudgetDuration,
  parseAiEditEffort,
} from '../lib/ai-edit-effort';

describe('AI edit effort profiles', () => {
  it('normalizes known values and defaults unknown input to balanced', () => {
    expect(parseAiEditEffort(' THOROUGH ')).toBe('thorough');
    expect(parseAiEditEffort('efficient')).toBe('efficient');
    expect(parseAiEditEffort('unbounded')).toBe(DEFAULT_AI_EDIT_EFFORT);
    expect(parseAiEditEffort(null)).toBe(DEFAULT_AI_EDIT_EFFORT);
  });

  it('keeps the profiles ordered by patch and deep-edit budgets', () => {
    expect(AI_EDIT_EFFORT_PROFILES.efficient.patch.budgetMs).toBeLessThan(
      AI_EDIT_EFFORT_PROFILES.balanced.patch.budgetMs,
    );
    expect(AI_EDIT_EFFORT_PROFILES.balanced.patch.budgetMs).toBeLessThan(
      AI_EDIT_EFFORT_PROFILES.thorough.patch.budgetMs,
    );
    expect(AI_EDIT_EFFORT_PROFILES.efficient.deep.maxLlmCalls).toBeLessThan(
      AI_EDIT_EFFORT_PROFILES.balanced.deep.maxLlmCalls,
    );
    expect(AI_EDIT_EFFORT_PROFILES.balanced.deep.maxLlmCalls).toBeLessThan(
      AI_EDIT_EFFORT_PROFILES.thorough.deep.maxLlmCalls,
    );
  });

  it('formats elapsed and budget durations compactly', () => {
    expect(formatAiEditBudgetDuration(0)).toBe('0:00');
    expect(formatAiEditBudgetDuration(12_400)).toBe('0:12');
    expect(formatAiEditBudgetDuration(60_000)).toBe('1 min');
    expect(formatAiEditBudgetDuration(125_000)).toBe('2:05');
  });
});
