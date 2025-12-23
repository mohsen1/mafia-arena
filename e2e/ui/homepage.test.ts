import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test('displays title and hero section', async ({ page }) => {
    await page.goto('/');

    // Check main heading
    await expect(page.locator('h1').first()).toContainText('AI Mafia Arena');

    // Check hero description
    await expect(page.getByText('benchmarking platform')).toBeVisible();
  });

  test('displays model rankings section', async ({ page }) => {
    await page.goto('/');

    // Check rankings header
    await expect(page.getByText('Model Rankings')).toBeVisible();
  });

  test('navigation links are present', async ({ page }) => {
    await page.goto('/');

    // Check navigation links exist
    await expect(page.getByRole('link', { name: /games/i }).first()).toBeVisible();
  });

  test('Mafia link opens Wikipedia', async ({ page }) => {
    await page.goto('/');

    // Find the Mafia link with exact match
    const mafiaLink = page.getByRole('link', { name: 'Mafia', exact: true });
    await expect(mafiaLink).toHaveAttribute('href', /wikipedia.*mafia/i);
  });
});
