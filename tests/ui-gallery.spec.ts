import { expect, test } from '@playwright/test';

test('the UI gallery renders every primitive on the design tokens', async ({ page }) => {
  await page.goto('/dev/ui');
  const gallery = page.getByTestId('ui-gallery');
  await expect(gallery.getByRole('heading', { name: 'OTS design language' })).toBeVisible();

  // Tokens reach the page: the accent, the type face and the caption size.
  const computed = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const body = getComputedStyle(document.body);
    return {
      accent: root.getPropertyValue('--ots-accent').trim(),
      shellAccent: root.getPropertyValue('--shell-accent').trim(),
      font: body.fontFamily,
    };
  });
  expect(computed.accent).toBe('#1d4ed8');
  expect(computed.shellAccent).toBe('#1d4ed8');
  expect(computed.font).toMatch(/geist|system-ui/i);

  const captionSize = await gallery
    .getByText('text-caption, 11px')
    .evaluate((element) => getComputedStyle(element).fontSize);
  expect(captionSize).toBe('11px');

  // A form field is wired to its label, hint and error.
  await expect(gallery.getByLabel('Title')).toHaveAttribute('aria-describedby', /.+/);
  await expect(gallery.getByLabel('Composer')).toHaveAttribute('aria-invalid', 'true');
  await expect(gallery.getByRole('alert')).toHaveText('A composer is required.');

  // Icon buttons carry their names; disabled buttons are disabled.
  await expect(gallery.getByRole('button', { name: 'Zoom in' })).toBeVisible();
  await expect(gallery.getByRole('button', { name: 'Disabled', exact: true })).toBeDisabled();
});

test('the layer tokens are ordered the way the shell stacks', async ({ page }) => {
  await page.goto('/dev/ui');
  const layers = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return [
      'canvas',
      'panel',
      'status',
      'toolbar',
      'activity',
      'header',
      'float',
      'toast',
      'menu',
      'palette',
    ].map((name) => Number(style.getPropertyValue(`--ots-z-${name}`)));
  });
  expect(layers).toEqual([...layers].sort((a, b) => a - b));
  expect(new Set(layers).size).toBe(layers.length);
});
