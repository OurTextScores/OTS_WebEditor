/** Types for the ratchet direction rule engine so consumers need no suppression. */

export type RatchetRaiseEntry = {
  key: string;
  from: number;
  to: number;
  reason: string;
};

export type RatchetBudget = {
  raises?: RatchetRaiseEntry[];
  [key: string]: unknown;
};

export type RatchetRaise = {
  key: string;
  from: number;
  to: number;
};

export type RatchetFailure = {
  rule: 'undeclared-raise' | 'unjustified-raise' | 'malformed-raise-entry' | 'stale-raise-entry';
  detail: string;
};

export function analyzeRatchetDirection(
  baseBudget: RatchetBudget,
  currentBudget: RatchetBudget,
): { raises: RatchetRaise[]; failures: RatchetFailure[] };
