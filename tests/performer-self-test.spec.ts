import { expect, test } from './helpers/diagnostic-test';

// The performer device self-test (/perform?selftest): automatic checks on open, the large-score engine run, the
// pedal log, and a report that carries all of it.

test('runs the automatic checks, logs pedal keys and puts everything in the report', async ({
  page,
}) => {
  await page.goto('/perform?selftest');
  const report = page.getByTestId('self-test-report');
  await expect(report).toContainText('"storage"', { timeout: 60_000 });
  await expect(report).toContainText('"wakeLock"');
  await expect(report).toContainText('"offlineApp"');
  await expect(report).toContainText('"standalone": false');

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('PageDown');
  await expect(page.getByTestId('self-test-keys')).toContainText('ArrowRight (ArrowRight)');
  await expect(page.getByTestId('self-test-keys')).toContainText('PageDown');

  await page.getByTestId('self-test-engine').click();
  await expect(report).toContainText('"ok": true', { timeout: 120_000 });
  await expect(report).toContainText('"renderAllMs"');
  await expect(report).toContainText('"pedalKeys"');
});
