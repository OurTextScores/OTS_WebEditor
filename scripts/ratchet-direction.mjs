/**
 * Ratchet direction check.
 *
 * `check:debt` proves the tree is inside its budgets. It cannot prove the budgets
 * themselves were not simply raised to fit — and during the technical-debt sprint they
 * were, three times, each in the same commit as the work that overflowed them. The
 * budget file's own rule says "never raise one to make a commit pass", but nothing
 * enforced it, so a genuine regression and a justified raise looked identical in CI.
 *
 * This compares the budget file against the same file at a base ref. Any increase must
 * be declared in the file's `raises` array with the exact before/after values and a
 * written reason, which puts the justification in the diff a reviewer is already
 * reading. Entries stay as a permanent log: matching on `from` as well as `to` means an
 * old entry cannot silently authorize a later raise back to the same number.
 *
 * Lowering a budget always passes and never needs an entry.
 */

/** Numeric budget leaves, flattened to dotted keys. */
const flattenBudgets = (budget) => {
  const out = new Map();
  const visit = (value, path) => {
    if (typeof value === 'number') {
      out.set(path.join('.'), value);
      return;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    for (const [key, child] of Object.entries(value)) {
      // Keys starting with `_` are prose comments, and `raises` is the log itself.
      if (key.startsWith('_') || (path.length === 0 && key === 'raises')) continue;
      visit(child, [...path, key]);
    }
  };
  visit(budget, []);
  return out;
};

const MINIMUM_REASON_LENGTH = 20;

/**
 * @param {object} baseBudget the budget file as it exists at the base ref
 * @param {object} currentBudget the budget file in the working tree
 * @returns {{ raises: Array<{key: string, from: number, to: number}>, failures: Array<{rule: string, detail: string}> }}
 */
export function analyzeRatchetDirection(baseBudget, currentBudget) {
  const failures = [];
  const fail = (rule, detail) => failures.push({ rule, detail });

  const base = flattenBudgets(baseBudget);
  const current = flattenBudgets(currentBudget);
  const declared = Array.isArray(currentBudget?.raises) ? currentBudget.raises : [];

  const raises = [];
  for (const [key, value] of current) {
    const previous = base.get(key);
    // A newly budgeted surface is not a raise: it had no budget to raise.
    if (previous === undefined || value <= previous) continue;
    raises.push({ key, from: previous, to: value });

    const entry = declared.find(
      (row) => row && row.key === key && row.from === previous && row.to === value,
    );
    if (!entry) {
      fail(
        'undeclared-raise',
        `${key} rose ${previous} -> ${value} with no matching entry in "raises". ` +
          `Add { "key": "${key}", "from": ${previous}, "to": ${value}, "reason": "…" } ` +
          'or bring the tree back under the existing budget.',
      );
      continue;
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim().length < MINIMUM_REASON_LENGTH) {
      fail(
        'unjustified-raise',
        `${key} rose ${previous} -> ${value} but its "raises" entry has no usable reason ` +
          `(at least ${MINIMUM_REASON_LENGTH} characters).`,
      );
    }
  }

  // A declared raise for a budget that did not move is either a typo or a leftover
  // pre-authorization for a raise nobody has made. Neither should sit in the file.
  for (const entry of declared) {
    if (!entry || typeof entry.key !== 'string') {
      fail(
        'malformed-raise-entry',
        `"raises" contains an entry with no key: ${JSON.stringify(entry)}`,
      );
      continue;
    }
    if (!current.has(entry.key)) {
      fail(
        'stale-raise-entry',
        `raises entry for ${entry.key} names a budget that no longer exists; remove it.`,
      );
    }
  }

  return { raises, failures };
}
