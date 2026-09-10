export const AI_EDIT_EFFORTS = ['efficient', 'balanced', 'thorough'] as const;

export type AiEditEffort = (typeof AI_EDIT_EFFORTS)[number];

export type AiEditEffortProfile = {
  label: string;
  description: string;
  patch: {
    maxAttempts: number;
    budgetMs: number;
    requestTimeoutMs: number;
  };
  deep: {
    maxLlmCalls: number;
    maxToolCalls: number;
    maxCandidates: number;
    maxRenders: number;
    budgetMs: number;
  };
};

export const DEFAULT_AI_EDIT_EFFORT: AiEditEffort = 'balanced';

export const AI_EDIT_EFFORT_PROFILES: Record<AiEditEffort, AiEditEffortProfile> = {
  efficient: {
    label: 'Efficient',
    description: 'Lower cost and latency; one patch attempt or a compact Deep Edit search.',
    patch: { maxAttempts: 1, budgetMs: 60_000, requestTimeoutMs: 45_000 },
    deep: {
      maxLlmCalls: 4,
      maxToolCalls: 10,
      maxCandidates: 2,
      maxRenders: 1,
      budgetMs: 120_000,
    },
  },
  balanced: {
    label: 'Balanced',
    description: 'Default balance of repair attempts, verification, latency, and cost.',
    patch: { maxAttempts: 3, budgetMs: 120_000, requestTimeoutMs: 60_000 },
    deep: {
      maxLlmCalls: 12,
      maxToolCalls: 24,
      maxCandidates: 4,
      maxRenders: 3,
      budgetMs: 300_000,
    },
  },
  thorough: {
    label: 'Thorough',
    description: 'More repair attempts and candidate exploration with higher latency and cost.',
    patch: { maxAttempts: 5, budgetMs: 300_000, requestTimeoutMs: 120_000 },
    deep: {
      maxLlmCalls: 20,
      maxToolCalls: 40,
      maxCandidates: 6,
      maxRenders: 5,
      budgetMs: 600_000,
    },
  },
};

export const parseAiEditEffort = (value: unknown): AiEditEffort =>
  typeof value === 'string' && AI_EDIT_EFFORTS.includes(value.trim().toLowerCase() as AiEditEffort)
    ? (value.trim().toLowerCase() as AiEditEffort)
    : DEFAULT_AI_EDIT_EFFORT;

export const formatAiEditBudgetDuration = (budgetMs: number): string => {
  const totalSeconds = Math.max(0, Math.round(budgetMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 && seconds === 0
    ? `${minutes} min`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
};
