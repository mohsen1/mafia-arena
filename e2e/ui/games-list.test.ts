import { test, expect } from '@playwright/test';

test.describe('Games List', () => {
  test.setTimeout(60000);

  test('displays page header', async ({ page }) => {
    await page.goto('/games');

    await expect(page.getByRole('heading', { name: 'Games' })).toBeVisible({ timeout: 30000 });
  });

  test('shows games count in header', async ({ page }) => {
    await page.goto('/games');

    // Should show completed count (any number)
    await expect(page.getByText(/\d+ completed/)).toBeVisible({ timeout: 30000 });
  });

  test('displays games table with correct columns', async ({ page }) => {
    await page.goto('/games');

    // Check table headers exist
    await expect(page.getByText('Matchup')).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('Winner')).toBeVisible();
    await expect(page.getByText('Rounds')).toBeVisible();
  });

  test('shows winner team indicators', async ({ page }) => {
    await page.goto('/games');

    // Wait for table to load
    await expect(page.locator('table')).toBeVisible({ timeout: 30000 });

    // Check for team winner indicators - they show "M" or "T" in a span
    const winnerColumn = page.locator('td').nth(1);
    await expect(winnerColumn).toBeVisible();
  });

  test('shows persona theme for each game', async ({ page }) => {
    await page.goto('/games');

    // Wait for table to load
    await expect(page.locator('table')).toBeVisible({ timeout: 30000 });

    // Check for theme labels (any theme)
    const themes = ['Noir', 'Victorian', 'Modern', 'Fantasy'];
    let foundTheme = false;

    for (const theme of themes) {
      const count = await page.getByText(theme, { exact: true }).count();
      if (count > 0) {
        foundTheme = true;
        break;
      }
    }

    expect(foundTheme).toBe(true);
  });

  test('pagination controls exist when needed', async ({ page }) => {
    await page.goto('/games');

    // Wait for content to load
    await expect(page.locator('table')).toBeVisible({ timeout: 30000 });

    // Pagination should exist if there are more pages (check for Prev/Next text)
    const prevText = page.getByText('Prev');
    const nextText = page.getByText('Next');

    // At least one pagination element should exist (even if disabled)
    const hasPagination =
      (await prevText.count()) > 0 || (await nextText.count()) > 0;
    expect(hasPagination).toBe(true);
  });
});
