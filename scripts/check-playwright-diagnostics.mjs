// Keep browser specs on the shared test fixture so failed tests preserve RPC diagnostics.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

function specs(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? specs(file) : /\.(spec|perf)\.ts$/.test(file) ? [file] : [];
  });
}
const missing = specs('tests').filter((file) =>
  /import\s+(?!type\b)[^;]*?\bfrom\s*['"](?:@playwright\/test|playwright\/test)['"]/.test(readFileSync(file, 'utf8')),
);
if (missing.length) {
  console.error('Use tests/helpers/diagnostic-test for the Playwright test fixture:', missing.join(', '));
  process.exitCode = 1;
} else {
  console.log('Playwright specs use the shared diagnostics fixture.');
}
