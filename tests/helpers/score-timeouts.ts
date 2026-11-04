/** Firefox's Playwright build executes native score operations more slowly. */
export const SCORE_OPERATION_TIMEOUT =
  process.env.PLAYWRIGHT_BROWSER === 'firefox' ? 60_000 : 20_000;
