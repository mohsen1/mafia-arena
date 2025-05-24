import { test, expect } from '@playwright/test';

test.describe('Model Provider Selection', () => {
  test('should update models when provider is changed', async ({ page }) => {
    // Navigate to the home page
    await page.goto('/en');

    // Wait for the page to load
    await expect(page.locator('h1')).toContainText('Werewolf AI');

    // Find the provider selector
    const providerSelect = page.locator('[id$="-provider"]').first();
    await expect(providerSelect).toBeVisible();

    // Find the model selector 
    const modelSelect = page.locator('[id$="-model"]').first();
    await expect(modelSelect).toBeVisible();

    // Test changing from default provider to Groq
    await providerSelect.click();
    await page.locator('text=Groq').click();

    // Wait for the model dropdown to update
    await page.waitForTimeout(500);

    // Click on model selector to see available models
    await modelSelect.click();

    // Verify that Groq models are available
    await expect(page.locator('text=Gemma 2 9B IT (Google, Default)')).toBeVisible();
    await expect(page.locator('text=Llama 3.3 70B Versatile (Meta)')).toBeVisible();

    // Close the model dropdown
    await page.keyboard.press('Escape');

    // Test changing to Claude
    await providerSelect.click();
    await page.locator('text=Claude').click();

    // Wait for the model dropdown to update
    await page.waitForTimeout(500);

    // Click on model selector to see available models
    await modelSelect.click();

    // Verify that Claude models are available
    await expect(page.locator('text=Claude 3.7 Sonnet (Default)')).toBeVisible();
    await expect(page.locator('text=Claude 3.5 Sonnet')).toBeVisible();

    // Close the model dropdown
    await page.keyboard.press('Escape');

    // Test changing to OpenAI
    await providerSelect.click();
    await page.locator('text=Official OpenAI API').click();

    // Wait for the model dropdown to update
    await page.waitForTimeout(500);

    // Click on model selector to see available models
    await modelSelect.click();

    // Verify that OpenAI models are available
    await expect(page.locator('text=GPT-4.1 Mini (Default, Fast)')).toBeVisible();
    await expect(page.locator('text=GPT-4.1 (Advanced)')).toBeVisible();

    // Close the model dropdown
    await page.keyboard.press('Escape');

    // Test changing to Gemini
    await providerSelect.click();
    await page.locator('text=Gemini').click();

    // Wait for the model dropdown to update
    await page.waitForTimeout(500);

    // Click on model selector to see available models
    await modelSelect.click();

    // Verify that Gemini models are available
    await expect(page.locator('text=Gemini 2.5 Flash (Default)')).toBeVisible();
    await expect(page.locator('text=Gemini 2.5 Pro')).toBeVisible();
  });

  test('should have default provider and model selected', async ({ page }) => {
    // Navigate to the home page
    await page.goto('/en');

    // Wait for the page to load
    await expect(page.locator('h1')).toContainText('Werewolf AI');

    // Find the provider selector
    const providerSelect = page.locator('[id$="-provider"]').first();
    await expect(providerSelect).toBeVisible();

    // Find the model selector 
    const modelSelect = page.locator('[id$="-model"]').first();
    await expect(modelSelect).toBeVisible();

    // Verify default selections are present (should have some text, not placeholder)
    await expect(providerSelect).not.toContainText('Select provider');
    await expect(modelSelect).not.toContainText('Select model');
  });
}); 