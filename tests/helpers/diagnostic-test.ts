import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test as base } from 'playwright/test';
import { collectWorkerRpcDiagnostics } from './worker-rpc-artifact';

export * from 'playwright/test';

/** Capture the score worker state before Playwright closes the failed test's context. */
export const test = base.extend<{ workerRpcDiagnostics: void }>({
  workerRpcDiagnostics: [async ({ context }, use, testInfo) => {
    await use();
    if (testInfo.status === testInfo.expectedStatus || testInfo.status === 'skipped') return;
    try {
      const report = await collectWorkerRpcDiagnostics(context);
      // Keep a copy outside Playwright's per-test directory: two sanitized test
      // titles can collide, and a later test can remove an earlier trace directory.
      const dir = path.join(testInfo.project.outputDir, 'rpc-diagnostics');
      await mkdir(dir, { recursive: true });
      const id = createHash('sha256').update(testInfo.testId).digest('hex').slice(0, 16);
      const artifactPath = path.join(dir, `worker-rpc-diagnostics-${id}-${testInfo.repeatEachIndex}-${testInfo.retry}.json`);
      await writeFile(artifactPath, JSON.stringify(report, null, 2));
      await testInfo.attach('worker-rpc-diagnostics', { path: artifactPath, contentType: 'application/json' });
    } catch (error) {
      console.warn('Could not attach worker RPC diagnostics:', error);
    }
  }, { auto: true }],
});
