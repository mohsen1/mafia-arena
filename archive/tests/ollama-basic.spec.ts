import { test, expect } from '@playwright/test';

test.use({
  baseURL: 'http://localhost:3099',
});

test.describe('Basic Ollama Integration', () => {
  test('should display Ollama option in provider dropdown', async ({ page }) => {
    // Navigate to new game page
    await page.goto('/en/new');
    
    // Wait for page to load - using the actual heading text
    await expect(page.locator('h1').filter({ hasText: 'Start New Game' })).toBeVisible({ timeout: 30000 });
    
    // Click on provider selector
    const providerSelector = page.locator('button[role="combobox"]').first();
    await providerSelector.click();
    
    // Check that Local Ollama option is available
    await expect(page.locator('text=Local Ollama')).toBeVisible();
  });

  test('should show Ollama configuration when selected', async ({ page }) => {
    await page.goto('/en/new');
    await expect(page.locator('h1').filter({ hasText: 'Start New Game' })).toBeVisible({ timeout: 30000 });
    
    // Select Local Ollama
    const providerSelector = page.locator('button[role="combobox"]').first();
    await providerSelector.click();
    await page.locator('text=Local Ollama').click();
    
    // Should show Configure button
    await expect(page.locator('button:has-text("Configure")')).toBeVisible();
    
    // Click Configure
    await page.locator('button:has-text("Configure")').first().click();
    
    // Should show Ollama configuration
    await expect(page.locator('text=Ollama')).toBeVisible();
    await expect(page.locator('input[id="ollama-host"]')).toBeVisible();
    await expect(page.locator('input[id="ollama-port"]')).toBeVisible();
  });

  test('should test Ollama connection', async ({ page }) => {
    await page.goto('/en/new');
    await expect(page.locator('h1').filter({ hasText: 'Start New Game' })).toBeVisible({ timeout: 30000 });
    
    // Select Local Ollama
    const providerSelector = page.locator('button[role="combobox"]').first();
    await providerSelector.click();
    await page.locator('text=Local Ollama').click();
    
    // Configure Ollama
    await page.locator('button:has-text("Configure")').first().click();
    
    // Test connection
    await page.locator('button:has-text("Test Connection")').click();
    
    // Should show either success or error
    await expect(page.locator('text=/Connection|Available Models/')).toBeVisible({ timeout: 15000 });
  });
}); 