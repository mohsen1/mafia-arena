import { test, expect } from '@playwright/test';

// Skip when the application backend is not running.
test.skip(true, 'Skipping e2e tests in CI environment');

test.describe('Model Provider Selection', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the home page
    await page.goto('/en');
    
    // Wait for the page to load
    await expect(page.locator('h1')).toContainText('Werewolf AI');
  });

  test('should update models when provider is changed', async ({ page }) => {
    const providerSelect = page.locator('#global-provider-provider');
    await expect(providerSelect).toBeVisible();
    const modelSelect = page.locator('#global-provider-model');
    await expect(modelSelect).toBeVisible();

    const providersToTest = ['Groq', 'Claude', 'Official OpenAI API', 'Gemini'];

    for (const providerName of providersToTest) {
        await providerSelect.click();
        await page.getByRole('option', { name: providerName }).click();

        await expect(modelSelect).not.toBeDisabled();
        await expect(providerSelect).toContainText(providerName);
        
        // Minimal delay for UI to settle
        await page.waitForTimeout(50); 
    }
  });

  test('should have default provider and model selected', async ({ page }) => {
    // Find the GLOBAL provider selector specifically
    const providerSelect = page.locator('#global-provider-provider');
    await expect(providerSelect).toBeVisible();

    // Find the GLOBAL model selector 
    const modelSelect = page.locator('#global-provider-model');
    await expect(modelSelect).toBeVisible();

    // Verify default selections are present (should have some text, not placeholder)
    await expect(providerSelect).not.toContainText('Select provider');
    await expect(modelSelect).not.toContainText('Select model');
  });

  test('should open model dropdown and show options', async ({ page }) => {
    // Find the GLOBAL provider and model selectors
    const providerSelect = page.locator('#global-provider-provider');
    const modelSelect = page.locator('#global-provider-model');
    
    await expect(providerSelect).toBeVisible();
    await expect(modelSelect).toBeVisible();

    // Ensure Groq is selected (default)
    await providerSelect.click();
    await page.getByRole('option', { name: 'Groq' }).click();
    await expect(modelSelect).not.toBeDisabled();

    // Click on model selector to open dropdown
    await modelSelect.click();

    // Verify that at least some options are available (should have multiple options)
    const modelOptions = page.locator('[role="option"]');
    await expect(modelOptions.first()).toBeVisible();
    
    // Verify we have multiple model options
    await expect(modelOptions).not.toHaveCount(0);
    
    // Close the dropdown
    await page.keyboard.press('Escape');
  });
}); 