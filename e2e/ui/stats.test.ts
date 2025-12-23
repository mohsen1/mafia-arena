import { test, expect } from '@playwright/test';

test.describe('Stats Overview', () => {
  test.setTimeout(60000);

  test('displays page header', async ({ page }) => {
    await page.goto('/stats');

    await expect(page.getByRole('heading', { name: /statistics/i })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('Aggregate performance metrics')).toBeVisible();
  });

  test('shows metrics cards', async ({ page }) => {
    await page.goto('/stats');

    // Wait for stats to load
    await expect(page.getByRole('main').getByText('Games')).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('Avg Time')).toBeVisible();
    await expect(page.getByText('Tokens')).toBeVisible();
  });

  test('shows team win rate sections', async ({ page }) => {
    await page.goto('/stats');

    // Should show Mafia and Town sections with win rates
    await expect(page.getByRole('main').locator('text=Mafia').first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('main').locator('text=Town').first()).toBeVisible();

    // Win rates should be percentages - check for at least one
    await expect(page.getByText(/%/).first()).toBeVisible();
  });

  test('displays top performing models section', async ({ page }) => {
    await page.goto('/stats');

    // Check table header
    await expect(page.getByText('Top Performing Models')).toBeVisible({ timeout: 30000 });
  });

  test('shows medal icons for top models', async ({ page }) => {
    await page.goto('/stats');

    // Wait for models table
    await expect(page.getByText('Top Performing Models')).toBeVisible({ timeout: 30000 });

    // Should show medal emojis
    await expect(page.getByText('🥇')).toBeVisible();
    await expect(page.getByText('🥈')).toBeVisible();
  });

  test('navigation tabs work correctly', async ({ page }) => {
    await page.goto('/stats');

    // Check for stats navigation links
    const matchupsLink = page.getByRole('link', { name: /matchups/i });
    await expect(matchupsLink).toBeVisible({ timeout: 30000 });

    // Click matchups
    await matchupsLink.click();
    await expect(page).toHaveURL(/\/stats\/matchups/);
  });
});

test.describe('Stats Matchups', () => {
  test.setTimeout(60000);

  test('displays matchups page header', async ({ page }) => {
    await page.goto('/stats/matchups');

    // Matchups page has its own heading
    await expect(page.getByRole('heading', { name: /matrix|matchup/i })).toBeVisible({ timeout: 30000 });
  });

  test('shows matrix content', async ({ page }) => {
    await page.goto('/stats/matchups');

    // Wait for content to load
    await page.waitForLoadState('networkidle');

    // The page should have loaded and show some content
    const pageContent = page.locator('main');
    await expect(pageContent).toBeVisible({ timeout: 30000 });
  });
});
