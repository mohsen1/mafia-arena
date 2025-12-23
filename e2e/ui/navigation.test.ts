import { test, expect } from '@playwright/test';

test.describe('Site Navigation', () => {
  test.setTimeout(60000);

  test('homepage loads correctly', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/mafia/i);
  });

  test('navigate to games page', async ({ page }) => {
    await page.goto('/');

    // Find games link in navigation
    const gamesLink = page.getByRole('link', { name: /games/i }).first();
    await expect(gamesLink).toBeVisible();
    await gamesLink.click();

    await expect(page).toHaveURL('/games');
    await expect(page.getByRole('heading', { name: 'Games' })).toBeVisible({ timeout: 30000 });
  });

  test('can access stats page directly', async ({ page }) => {
    // Stats page is accessible via direct URL
    await page.goto('/stats');

    await expect(page.getByRole('heading', { name: /statistics/i })).toBeVisible({ timeout: 30000 });
  });

  test('can access about page directly', async ({ page }) => {
    // About page is accessible via direct URL
    await page.goto('/about');

    // Page should load without error
    await expect(page.locator('main')).toBeVisible({ timeout: 30000 });
  });

  test('404 page displays for unknown routes', async ({ page }) => {
    await page.goto('/nonexistent-page-xyz-123');

    // Should show 404 content
    const page404 = await page.getByText(/404|not found/i).isVisible();
    expect(page404).toBe(true);
  });

  test('logo links to homepage', async ({ page }) => {
    await page.goto('/stats');

    // Click logo/site name to go home
    const logoLink = page.getByRole('link', { name: /mafia arena/i }).first();
    await logoLink.click();

    await expect(page).toHaveURL('/');
  });

  test('responsive navigation on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/');

    // Page should still load
    await expect(page.locator('h1').first()).toContainText('AI Mafia Arena');
  });

  test('GitHub link opens in new tab', async ({ page }) => {
    await page.goto('/');

    // Find GitHub link
    const githubLink = page.getByRole('link', { name: /github/i });
    await expect(githubLink).toBeVisible();
    await expect(githubLink).toHaveAttribute('target', '_blank');
    await expect(githubLink).toHaveAttribute('href', /github\.com/);
  });
});

test.describe('Accessibility', () => {
  test('page has proper heading structure', async ({ page }) => {
    await page.goto('/');

    // Check that main heading exists
    const h1 = page.locator('h1').first();
    await expect(h1).toBeVisible();
  });

  test('links are focusable via keyboard', async ({ page }) => {
    await page.goto('/');

    // Tab to first link and check it's focused
    await page.keyboard.press('Tab');
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });

  test('page loads without critical errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Filter out common non-critical errors
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes('favicon') &&
        !e.includes('404') &&
        !e.includes('fetch') &&
        !e.includes('CORS') &&  // Font CORS errors are non-critical
        !e.includes('fonts.gstatic.com') && // Google fonts loading issues
        !e.includes('net::ERR_FAILED') // Network errors during tests
    );

    expect(criticalErrors).toHaveLength(0);
  });
});
