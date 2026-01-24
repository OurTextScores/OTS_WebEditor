import { test, expect } from '@playwright/test';

/**
 * Embed Mode Tests
 *
 * Tests the external XML comparison embed mode functionality that allows
 * loading two XML files via URL parameters and displaying only the compare view.
 *
 * Tests use local sample files from public/sample-left.xml and public/sample-right.xml
 */

test.describe('Embed Mode - External XML Comparison', () => {
    // Use local sample files served from public directory
    const baseUrl = 'http://localhost:3000';
    const leftXmlUrl = `${baseUrl}/sample-left.xml`;
    const rightXmlUrl = `${baseUrl}/sample-right.xml`;

    // For mocked external URL tests
    const testXmlLeft = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1">
      <part-name>Music</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <type>whole</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

    const testXmlRight = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1">
      <part-name>Music</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>4</duration>
        <type>whole</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

    test('should detect embed mode when compareLeft and compareRight params are present', async ({ page }) => {
        // Navigate with embed mode parameters using local files
        await page.goto(`/?compareLeft=${encodeURIComponent(leftXmlUrl)}&compareRight=${encodeURIComponent(rightXmlUrl)}`);

        // Wait for loading to complete
        await page.waitForTimeout(3000);

        // Verify compare modal is visible
        await expect(page.getByTestId('checkpoint-compare-modal')).toBeVisible();
    });

    test('should hide toolbar in embed mode', async ({ page }) => {
        await page.goto(`/?compareLeft=${encodeURIComponent(leftXmlUrl)}&compareRight=${encodeURIComponent(rightXmlUrl)}`);
        await page.waitForTimeout(3000);

        // Toolbar should not be visible in embed mode
        const toolbar = page.locator('div').filter({ has: page.getByText('New Score') });
        await expect(toolbar).not.toBeVisible();
    });

    test('should hide checkpoint sidebar in embed mode', async ({ page }) => {
        await page.goto(`/?compareLeft=${encodeURIComponent(leftXmlUrl)}&compareRight=${encodeURIComponent(rightXmlUrl)}`);
        await page.waitForTimeout(3000);

        // Checkpoint sidebar should not be visible
        await expect(page.getByTestId('checkpoint-sidebar')).not.toBeVisible();
    });

    test('should hide save checkpoint buttons in embed mode', async ({ page }) => {
        await page.goto(`/?compareLeft=${encodeURIComponent(leftXmlUrl)}&compareRight=${encodeURIComponent(rightXmlUrl)}`);
        await page.waitForTimeout(3000);

        // Save checkpoint buttons should not be visible
        const saveButtons = page.getByText('💾 Save checkpoint');
        await expect(saveButtons.first()).not.toBeVisible();
    });

    test('should hide overwrite arrows in embed mode', async ({ page }) => {
        await page.goto(`/?compareLeft=${encodeURIComponent(leftXmlUrl)}&compareRight=${encodeURIComponent(rightXmlUrl)}`);
        await page.waitForTimeout(5000);

        // Overwrite arrow buttons should not be visible in embed mode
        const overwriteButtons = page.getByRole('button', { name: /Overwrite/ });
        await expect(overwriteButtons.first()).not.toBeVisible();
    });

    test('should use custom labels from URL parameters', async ({ page }) => {
        await page.goto(`/?compareLeft=${encodeURIComponent(leftXmlUrl)}&compareRight=${encodeURIComponent(rightXmlUrl)}&leftLabel=Version%201&rightLabel=Version%202`);
        await page.waitForTimeout(3000);

        // Custom labels should be visible in the compare view
        await expect(page.getByText('Version 1')).toBeVisible();
        await expect(page.getByText('Version 2')).toBeVisible();
    });

    test('should use default labels when not specified', async ({ page }) => {
        await page.goto(`/?compareLeft=${encodeURIComponent(leftXmlUrl)}&compareRight=${encodeURIComponent(rightXmlUrl)}`);
        await page.waitForTimeout(3000);

        // Default labels should be visible
        await expect(page.getByText('Left')).toBeVisible();
        await expect(page.getByText('Right')).toBeVisible();
    });

    test('should show loading state while fetching external files', async ({ page }) => {
        // Intercept local file requests to add delay
        await page.route(leftXmlUrl, async route => {
            await new Promise(resolve => setTimeout(resolve, 1000));
            await route.continue();
        });

        await page.route(rightXmlUrl, async route => {
            await new Promise(resolve => setTimeout(resolve, 1000));
            await route.continue();
        });

        await page.goto(`/?compareLeft=${encodeURIComponent(leftXmlUrl)}&compareRight=${encodeURIComponent(rightXmlUrl)}`);

        // Loading indicator should be visible initially
        await expect(page.getByText('Loading comparison...')).toBeVisible({ timeout: 1000 });

        // Wait for loading to complete
        await page.waitForTimeout(3000);

        // Loading should be gone
        await expect(page.getByText('Loading comparison...')).not.toBeVisible();
    });

    test('should handle fetch errors gracefully', async ({ page }) => {
        // Mock a failed request
        await page.route('https://example.com/left.xml', async route => {
            await route.fulfill({ status: 404, body: 'Not Found' });
        });

        await page.route('https://example.com/right.xml', async route => {
            await route.fulfill({ status: 200, contentType: 'application/xml', body: testXmlRight });
        });

        // Listen for alert dialogs
        page.on('dialog', async dialog => {
            expect(dialog.message()).toContain('Failed to load files');
            await dialog.accept();
        });

        await page.goto('/?compareLeft=https://example.com/left.xml&compareRight=https://example.com/right.xml');
        await page.waitForTimeout(2000);
    });

    test('should allow swapping sides in embed mode', async ({ page }) => {
        await page.goto(`/?compareLeft=${encodeURIComponent(leftXmlUrl)}&compareRight=${encodeURIComponent(rightXmlUrl)}&leftLabel=Old&rightLabel=New`);
        await page.waitForTimeout(3000);

        // Initial state
        const leftPane = page.getByTestId('compare-pane-left');
        const rightPane = page.getByTestId('compare-pane-right');

        await expect(leftPane).toBeVisible();
        await expect(rightPane).toBeVisible();

        // Find and click swap button
        const swapButton = page.getByRole('button', { name: /Swap sides/i });
        await swapButton.click();

        await page.waitForTimeout(1000);

        // After swap, labels should be reversed
        // The "Old" label should now be on the right, "New" on the left
        // (This assumes the labels move with the content)
    });

    test('should not activate embed mode with only one URL parameter', async ({ page }) => {
        await page.goto(`/?compareLeft=${encodeURIComponent(leftXmlUrl)}`);
        await page.waitForTimeout(1000);

        // Toolbar should be visible (not embed mode)
        const toolbar = page.locator('div').filter({ has: page.getByText('New Score') });
        await expect(toolbar).toBeVisible();

        // Compare modal should not be visible
        const compareModal = page.getByTestId('checkpoint-compare-modal');
        await expect(compareModal).not.toBeVisible();
    });

    test('should display compare panes with loaded scores', async ({ page }) => {
        await page.goto(`/?compareLeft=${encodeURIComponent(leftXmlUrl)}&compareRight=${encodeURIComponent(rightXmlUrl)}`);
        await page.waitForTimeout(5000);

        // Both panes should be visible
        const leftPane = page.getByTestId('compare-pane-left');
        const rightPane = page.getByTestId('compare-pane-right');

        await expect(leftPane).toBeVisible();
        await expect(rightPane).toBeVisible();

        // Panes should contain SVG elements (rendered scores)
        await expect(leftPane.locator('svg').first()).toBeVisible({ timeout: 10000 });
        await expect(rightPane.locator('svg').first()).toBeVisible({ timeout: 10000 });
    });

    test('should show "Open in Editor" buttons in embed mode', async ({ page }) => {
        await page.goto(`/?compareLeft=${encodeURIComponent(leftXmlUrl)}&compareRight=${encodeURIComponent(rightXmlUrl)}&leftLabel=Left&rightLabel=Right`);
        await page.waitForTimeout(3000);

        // Open in Editor buttons should be visible
        const openInEditorButtons = page.getByRole('button', { name: /Open in Editor/ });
        await expect(openInEditorButtons.first()).toBeVisible();
        await expect(openInEditorButtons.nth(1)).toBeVisible();
    });

    test('should open left score in full editor when clicking "Open in Editor"', async ({ page }) => {
        await page.goto(`/?compareLeft=${encodeURIComponent(leftXmlUrl)}&compareRight=${encodeURIComponent(rightXmlUrl)}&leftLabel=Version%201&rightLabel=Version%202`);
        await page.waitForTimeout(3000);

        // Click the "Open in Editor" button for the left pane
        const openInEditorButtons = page.getByRole('button', { name: /Open in Editor/ });
        await openInEditorButtons.first().click();

        // Wait for editor to load
        await page.waitForTimeout(3000);

        // Compare modal should be closed
        const compareModal = page.getByTestId('checkpoint-compare-modal');
        await expect(compareModal).not.toBeVisible();

        // Toolbar should now be visible (full editor mode)
        const toolbar = page.locator('div').filter({ has: page.getByText('New Score') });
        await expect(toolbar).toBeVisible();

        // Sidebar should be visible
        await expect(page.getByTestId('checkpoint-sidebar')).toBeVisible();

        // Score should be loaded in main editor
        const mainScoreContainer = page.locator('[ref="containerRef"]').first();
        // Check that score is rendered (SVG present)
        await expect(page.locator('svg').first()).toBeVisible({ timeout: 5000 });
    });

    test('should open right score in full editor when clicking "Open in Editor"', async ({ page }) => {
        await page.goto(`/?compareLeft=${encodeURIComponent(leftXmlUrl)}&compareRight=${encodeURIComponent(rightXmlUrl)}&leftLabel=Version%201&rightLabel=Version%202`);
        await page.waitForTimeout(3000);

        // Click the "Open in Editor" button for the right pane
        const openInEditorButtons = page.getByRole('button', { name: /Open in Editor/ });
        await openInEditorButtons.nth(1).click();

        // Wait for editor to load
        await page.waitForTimeout(3000);

        // Compare modal should be closed
        const compareModal = page.getByTestId('checkpoint-compare-modal');
        await expect(compareModal).not.toBeVisible();

        // Toolbar should now be visible (full editor mode)
        const toolbar = page.locator('div').filter({ has: page.getByText('New Score') });
        await expect(toolbar).toBeVisible();

        // Sidebar should be visible
        await expect(page.getByTestId('checkpoint-sidebar')).toBeVisible();

        // Score should be loaded in main editor
        await expect(page.locator('svg').first()).toBeVisible({ timeout: 5000 });
    });
});
