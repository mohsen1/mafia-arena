import { test, expect } from '@playwright/test';

test.describe('Ollama Integration', () => {
  test('should show Ollama configuration when Local Ollama is selected', async ({ page }) => {
    // Navigate to new game page
    await page.goto('/en/new');
    
    // Wait for the page to load
    await expect(page.locator('h1:has-text("Start New Game")')).toBeVisible();
    
    // Find and click the provider selector
    const providerSelector = page.locator('button[role="combobox"]').first();
    await providerSelector.click();
    
    // Select Local Ollama from the dropdown
    await page.locator('text=Local Ollama').click();
    
    // Verify Ollama configuration section appears
    await expect(page.locator('text=Ollama Configuration')).toBeVisible();
    
    // Click Configure Ollama button
    const configButton = page.locator('button:has-text("Configure")').first();
    await configButton.click();
    
    // Verify Ollama configuration UI elements
    await expect(page.locator('text=Ollama')).toBeVisible();
    await expect(page.locator('input[id="ollama-host"]')).toBeVisible();
    await expect(page.locator('input[id="ollama-port"]')).toBeVisible();
    
    // Verify default values
    await expect(page.locator('input[id="ollama-host"]')).toHaveValue('localhost');
    await expect(page.locator('input[id="ollama-port"]')).toHaveValue('11434');
    
    // Verify endpoint preview
    await expect(page.locator('code:has-text("http://localhost:11434/v1")')).toBeVisible();
  });

  test('should allow custom Ollama endpoint configuration', async ({ page }) => {
    await page.goto('/en/new');
    await expect(page.locator('h1:has-text("Start New Game")')).toBeVisible();
    
    // Select Local Ollama
    const providerSelector = page.locator('button[role="combobox"]').first();
    await providerSelector.click();
    await page.locator('text=Local Ollama').click();
    
    // Open Ollama configuration
    const configButton = page.locator('button:has-text("Configure")').first();
    await configButton.click();
    
    // Change host and port
    const hostInput = page.locator('input[id="ollama-host"]');
    await hostInput.clear();
    await hostInput.fill('custom-ollama-server.local');
    
    const portInput = page.locator('input[id="ollama-port"]');
    await portInput.clear();
    await portInput.fill('8080');
    
    // Verify endpoint preview updates
    await expect(page.locator('code:has-text("http://custom-ollama-server.local:8080/v1")')).toBeVisible();
    
    // Open advanced settings
    await page.locator('button:has-text("Advanced Settings")').click();
    
    // Verify advanced options are visible
    await expect(page.locator('text=Protocol')).toBeVisible();
    await expect(page.locator('text=API Path')).toBeVisible();
    
    // Change to HTTPS
    await page.locator('button[id="ollama-protocol"]').click();
    await page.locator('text=HTTPS').click();
    
    // Verify endpoint updates with HTTPS
    await expect(page.locator('code:has-text("https://custom-ollama-server.local:8080/v1")')).toBeVisible();
  });

  test('should show setup instructions for Ollama', async ({ page }) => {
    await page.goto('/en/new');
    await expect(page.locator('h1:has-text("Start New Game")')).toBeVisible();
    
    // Select Local Ollama
    const providerSelector = page.locator('button[role="combobox"]').first();
    await providerSelector.click();
    await page.locator('text=Local Ollama').click();
    
    // Open Ollama configuration
    const configButton = page.locator('button:has-text("Configure")').first();
    await configButton.click();
    
    // Verify setup instructions are visible
    await expect(page.locator('text=Setup Instructions')).toBeVisible();
    await expect(page.locator('text=ollama serve')).toBeVisible();
    await expect(page.locator('text=ollama pull llama3.1')).toBeVisible();
    
    // Verify test connection button exists
    await expect(page.locator('button:has-text("Test Connection")')).toBeVisible();
  });

  test('should select Ollama models when Local Ollama is chosen', async ({ page }) => {
    await page.goto('/en/new');
    await expect(page.locator('h1:has-text("Start New Game")')).toBeVisible();
    
    // Select Local Ollama as provider
    const providerSelector = page.locator('button[role="combobox"]').first();
    await providerSelector.click();
    await page.locator('text=Local Ollama').click();
    
    // Click on model selector
    const modelSelector = page.locator('button[role="combobox"]').nth(1);
    await modelSelector.click();
    
    // Verify Ollama models are available
    await expect(page.locator('text=Llama 3.1')).toBeVisible();
    await expect(page.locator('text=Mistral')).toBeVisible();
    await expect(page.locator('text=Codellama')).toBeVisible();
  });
}); 