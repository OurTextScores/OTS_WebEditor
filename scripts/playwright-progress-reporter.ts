import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';

/** CI progress survives a job timeout, unlike Playwright's end-of-run summary. */
export default class PlaywrightProgressReporter implements Reporter {
  onTestBegin(test: TestCase, result: TestResult): void {
    console.log(`[playwright-progress] start worker=${result.workerIndex} ${test.titlePath().filter(Boolean).join(' › ')}`);
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    console.log(`[playwright-progress] end status=${result.status} durationMs=${result.duration} ${test.titlePath().filter(Boolean).join(' › ')}`);
  }
}
