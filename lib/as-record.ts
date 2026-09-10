/**
 * Narrows unknown JSON to a record, for reading service payloads in the browser.
 *
 * This exists separately from the identical helper in `lib/music-services/common.ts`
 * because that module reaches `lib/score-artifacts.ts`, which imports `node:crypto`.
 * Importing it from a client component makes webpack fail the whole page build with
 * "Reading from node:crypto is not handled by plugins" -- a failure typecheck, lint and
 * jsdom tests all pass straight through, because only a browser build resolves it.
 *
 * Keep this file free of imports.
 */
export const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
