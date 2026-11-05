import { expect, it, vi } from 'vitest';
import type { TestCase, TestResult } from '@playwright/test/reporter';
import PlaywrightProgressReporter from '../../scripts/playwright-progress-reporter';

it('logs the active test and its outcome for interrupted CI shards', () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const test = { titlePath: () => ['webkit', 'score.spec.ts', 'edits a note'] } as TestCase;
  const result = { workerIndex: 1, status: 'passed', duration: 1234 } as TestResult;
  const reporter = new PlaywrightProgressReporter();
  reporter.onTestBegin(test, result);
  reporter.onTestEnd(test, result);
  expect(log).toHaveBeenNthCalledWith(1, '[playwright-progress] start worker=1 webkit › score.spec.ts › edits a note');
  expect(log).toHaveBeenNthCalledWith(2, '[playwright-progress] end status=passed durationMs=1234 webkit › score.spec.ts › edits a note');
  log.mockRestore();
});
