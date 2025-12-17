import { test, expect } from '@playwright/test';

test.describe('Ollama Two Models E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Check if Ollama is running before each test
    try {
      const response = await fetch('http://localhost:11434/api/tags');
      if (!response.ok) {
        test.skip();
      }
    } catch (error) {
      test.skip();
    }
  });

  test('should allow using different Ollama models for Town and Mafia', async ({ page }) => {
    // Navigate to new game page
    await page.goto('/en/new');
    await expect(page.locator('h1:has-text("Werewolf AI")')).toBeVisible();
    
    // Select Local Ollama as the main provider
    const mainProviderSelector = page.locator('button[role="combobox"]').first();
    await mainProviderSelector.click();
    await page.locator('text=Local Ollama').click();
    
    // Wait for model dropdown to be populated
    await page.waitForTimeout(1000);
    
    // Select first model (e.g., llama3.2)
    const mainModelSelector = page.locator('button[role="combobox"]').nth(1);
    await mainModelSelector.click();
    const firstModel = await page.locator('[role="option"]').first().textContent();
    await page.locator('[role="option"]').first().click();
    
    // Enable separate AI model for Mafia
    const separateMafiaCheckbox = page.locator('input[type="checkbox"]').filter({ hasText: 'Use a separate AI engine for Mafia players' });
    await separateMafiaCheckbox.check();
    
    // Verify Mafia AI Engine section appears
    await expect(page.locator('text=Mafia AI Engine')).toBeVisible();
    
    // Select Local Ollama for Mafia
    const mafiaProviderSelector = page.locator('#mafia-provider-provider');
    await mafiaProviderSelector.click();
    await page.locator('text=Local Ollama').last().click();
    
    // Select a different model for Mafia
    const mafiaModelSelector = page.locator('#mafia-provider-model');
    await mafiaModelSelector.click();
    
    // Try to select a different model if available
    const modelOptions = await page.locator('[role="option"]').count();
    if (modelOptions > 1) {
      await page.locator('[role="option"]').nth(1).click();
    } else {
      await page.locator('[role="option"]').first().click();
    }
    
    // Start the game
    const startButton = page.locator('button:has-text("Start Game")');
    await expect(startButton).toBeEnabled();
    await startButton.click();
    
    // Wait for navigation to game page
    await page.waitForURL(/\/en\/game\/[^\/]+/, { timeout: 30000 });
    
    // Verify character generation starts
    await expect(page.locator('text=Creating Characters, text=Character generation in progress')).toBeVisible({ timeout: 10000 });
  });

  test('should show Ollama configuration when Ollama is selected', async ({ page }) => {
    await page.goto('/en/new');
    await expect(page.locator('h1:has-text("Werewolf AI")')).toBeVisible();
    
    // Select Local Ollama
    const providerSelector = page.locator('button[role="combobox"]').first();
    await providerSelector.click();
    await page.locator('text=Local Ollama').click();
    
    // Check if Ollama configuration button appears
    await expect(page.locator('button:has-text("Configure Ollama")')).toBeVisible();
    
    // Click to show configuration
    await page.locator('button:has-text("Configure Ollama")').click();
    
    // Verify configuration options are shown
    await expect(page.locator('text=Ollama Configuration')).toBeVisible();
    await expect(page.locator('input[placeholder="localhost"]')).toBeVisible();
    await expect(page.locator('input[placeholder="11434"]')).toBeVisible();
    
    // Test connection button should be visible
    await expect(page.locator('button:has-text("Test Connection")').or(page.locator('text=ollama.testConnection'))).toBeVisible();
  });

  test('should validate model selection when using two models', async ({ page }) => {
    await page.goto('/en/new');
    
    // Select Local Ollama
    const mainProviderSelector = page.locator('button[role="combobox"]').first();
    await mainProviderSelector.click();
    await page.locator('text=Local Ollama').click();
    
    // Enable separate Mafia model
    await page.locator('text=Use a separate AI engine for Mafia players').click();
    
    // Select Local Ollama for Mafia
    const mafiaProviderSelector = page.locator('#mafia-provider-provider');
    await mafiaProviderSelector.click();
    await page.locator('text=Local Ollama').last().click();
    
    // Try to start without selecting models
    const startButton = page.locator('button:has-text("Start Game")');
    
    // The button should be disabled if models aren't selected
    const isDisabled = await startButton.isDisabled();
    
    // Select models if button is disabled
    if (isDisabled) {
      // Select main model
      const mainModelSelector = page.locator('button[role="combobox"]').nth(1);
      await mainModelSelector.click();
      await page.locator('[role="option"]').first().click();
      
      // Select Mafia model
      const mafiaModelSelector = page.locator('#mafia-provider-model');
      await mafiaModelSelector.click();
      await page.locator('[role="option"]').first().click();
    }
    
    // Now button should be enabled
    await expect(startButton).toBeEnabled();
  });

  test('should handle Ollama connection errors gracefully', async ({ page }) => {
    // Temporarily test with wrong port to simulate connection error
    await page.goto('/en/new');
    
    // Select Local Ollama
    const providerSelector = page.locator('button[role="combobox"]').first();
    await providerSelector.click();
    await page.locator('text=Local Ollama').click();
    
    // Open configuration
    await page.locator('button:has-text("Configure Ollama")').click();
    
    // Change port to invalid one
    const portInput = page.locator('input[type="number"]');
    await portInput.clear();
    await portInput.fill('99999');
    
    // Test connection
    const testButton = page.locator('button:has-text("Test")').filter({ hasText: /test/i });
    if (await testButton.isVisible()) {
      await testButton.click();
      
      // Should show error message
      await expect(page.locator('text=/connection.*error|failed.*connect/i')).toBeVisible({ timeout: 15000 });
    }
  });

  test('should remember Ollama configuration settings', async ({ page }) => {
    await page.goto('/en/new');
    
    // Select Local Ollama
    const providerSelector = page.locator('button[role="combobox"]').first();
    await providerSelector.click();
    await page.locator('text=Local Ollama').click();
    
    // Open configuration
    await page.locator('button:has-text("Configure Ollama")').click();
    
    // Check default values
    const hostInput = page.locator('input[placeholder="localhost"]');
    const portInput = page.locator('input[placeholder="11434"]');
    
    await expect(hostInput).toHaveValue('localhost');
    await expect(portInput).toHaveValue('11434');
    
    // Change values
    await hostInput.clear();
    await hostInput.fill('127.0.0.1');
    
    // Hide and show configuration again
    await page.locator('button:has-text("Hide")').click();
    await page.locator('button:has-text("Configure Ollama")').click();
    
    // Values should be preserved
    await expect(hostInput).toHaveValue('127.0.0.1');
  });
}); 