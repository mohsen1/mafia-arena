import { test, expect } from '@playwright/test';

test.describe('Game Detail', () => {
  // Use longer timeouts for pages that need to fetch from backend
  test.setTimeout(60000);

  test('can navigate from games list to game detail', async ({ page }) => {
    // Navigate to games list
    await page.goto('/games');
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 30000 });

    // Click the first game row to navigate to detail
    await page.locator('table tbody tr').first().click();

    // Should navigate to game detail page
    await expect(page).toHaveURL(/\/games\/.+/, { timeout: 30000 });

    // Verify game detail page structure - should show team names
    await expect(page.locator('text=Mafia').first()).toBeVisible({ timeout: 30000 });
  });
});
