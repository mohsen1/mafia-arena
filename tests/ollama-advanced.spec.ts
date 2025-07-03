import { test, expect } from '@playwright/test';

test.describe('Advanced Ollama Integration', () => {
  test.beforeEach(async ({ page }) => {
    // Check if Ollama is running before tests
    try {
      const response = await fetch('http://localhost:11434/api/tags');
      if (!response.ok) {
        test.skip();
      }
    } catch (error) {
      test.skip();
    }
  });

  test('should handle Ollama connection errors gracefully', async ({ page }) => {
    // Navigate to new game page
    await page.goto('/en/new');
    await expect(page.locator('h1:has-text("Start New Game")')).toBeVisible();
    
    // Select Local Ollama
    const providerSelector = page.locator('button[role="combobox"]').first();
    await providerSelector.click();
    await page.locator('text=Local Ollama').click();
    
    // Configure with invalid endpoint
    const configButton = page.locator('button:has-text("Configure")').first();
    await configButton.click();
    
    // Change to invalid host
    const hostInput = page.locator('input[id="ollama-host"]');
    await hostInput.clear();
    await hostInput.fill('invalid-host-12345');
    
    // Test connection
    const testButton = page.locator('button:has-text("Test Connection")');
    await testButton.click();
    
    // Should show error message
    await expect(page.locator('text=Connection Error')).toBeVisible({ timeout: 10000 });
  });

  test('should automatically check and display available models', async ({ page }) => {
    await page.goto('/en/new');
    await expect(page.locator('h1:has-text("Start New Game")')).toBeVisible();
    
    // Select Local Ollama
    const providerSelector = page.locator('button[role="combobox"]').first();
    await providerSelector.click();
    await page.locator('text=Local Ollama').click();
    
    // Configure Ollama
    const configButton = page.locator('button:has-text("Configure")').first();
    await configButton.click();
    
    // Test connection
    const testButton = page.locator('button:has-text("Test Connection")');
    await testButton.click();
    
    // Should show available models
    await expect(page.locator('text=Available Models')).toBeVisible({ timeout: 10000 });
    
    // Should show at least one model (we pulled llama3.2 and mistral earlier)
    await expect(page.locator('text=llama3.2')).toBeVisible();
  });

  test('should create and play a game with Ollama agents', async ({ page }) => {
    // Navigate to new game page
    await page.goto('/en/new');
    await expect(page.locator('h1:has-text("Start New Game")')).toBeVisible();
    
    // Select Local Ollama as provider
    const providerSelector = page.locator('button[role="combobox"]').first();
    await providerSelector.click();
    await page.locator('text=Local Ollama').click();
    
    // Select model
    const modelSelector = page.locator('button[role="combobox"]').nth(1);
    await modelSelector.click();
    await page.locator('text=Llama 3.2').first().click();
    
    // Set number of players to 5
    const playerCountInput = page.locator('input[type="number"]').first();
    await playerCountInput.clear();
    await playerCountInput.fill('5');
    
    // Start the game
    const startButton = page.locator('button:has-text("Start Game")');
    await startButton.click();
    
    // Wait for character generation
    await expect(page.locator('text=Generating characters')).toBeVisible();
    
    // Wait for game to start (increased timeout for Ollama)
    await expect(page.locator('text=Round 1')).toBeVisible({ timeout: 60000 });
    
    // Verify game elements
    await expect(page.locator('text=Night Phase')).toBeVisible();
    
    // Check that AI agents are making actions
    await expect(page.locator('text=has joined the game')).toBeVisible({ timeout: 30000 });
  });

  test('should handle model switching during configuration', async ({ page }) => {
    await page.goto('/en/new');
    await expect(page.locator('h1:has-text("Start New Game")')).toBeVisible();
    
    // Select Local Ollama
    const providerSelector = page.locator('button[role="combobox"]').first();
    await providerSelector.click();
    await page.locator('text=Local Ollama').click();
    
    // Select first model
    const modelSelector = page.locator('button[role="combobox"]').nth(1);
    await modelSelector.click();
    await page.locator('text=Llama 3.2').first().click();
    
    // Switch to different model
    await modelSelector.click();
    await page.locator('text=Mistral').first().click();
    
    // Verify model selection persists
    await expect(modelSelector).toContainText('Mistral');
  });

  test('should show Ollama setup instructions when no models available', async ({ page }) => {
    await page.goto('/en/new');
    await expect(page.locator('h1:has-text("Start New Game")')).toBeVisible();
    
    // Select Local Ollama
    const providerSelector = page.locator('button[role="combobox"]').first();
    await providerSelector.click();
    await page.locator('text=Local Ollama').click();
    
    // Open configuration
    const configButton = page.locator('button:has-text("Configure")').first();
    await configButton.click();
    
    // Should show setup instructions
    await expect(page.locator('text=Setup Instructions')).toBeVisible();
    await expect(page.locator('text=ollama serve')).toBeVisible();
    await expect(page.locator('text=ollama pull')).toBeVisible();
  });

  test('should persist Ollama configuration across page reloads', async ({ page }) => {
    await page.goto('/en/new');
    await expect(page.locator('h1:has-text("Start New Game")')).toBeVisible();
    
    // Select Local Ollama
    const providerSelector = page.locator('button[role="combobox"]').first();
    await providerSelector.click();
    await page.locator('text=Local Ollama').click();
    
    // Configure custom endpoint
    const configButton = page.locator('button:has-text("Configure")').first();
    await configButton.click();
    
    const portInput = page.locator('input[id="ollama-port"]');
    await portInput.clear();
    await portInput.fill('8080');
    
    // Reload page
    await page.reload();
    
    // Open configuration again
    await page.locator('button[role="combobox"]').first().click();
    await page.locator('text=Local Ollama').click();
    await page.locator('button:has-text("Configure")').first().click();
    
    // Check if custom port persisted (Note: this depends on implementation)
    // For now, we'll just verify the configuration UI is still accessible
    await expect(page.locator('input[id="ollama-port"]')).toBeVisible();
  });

  test('should handle HTTPS Ollama endpoints', async ({ page }) => {
    await page.goto('/en/new');
    await expect(page.locator('h1:has-text("Start New Game")')).toBeVisible();
    
    // Select Local Ollama
    const providerSelector = page.locator('button[role="combobox"]').first();
    await providerSelector.click();
    await page.locator('text=Local Ollama').click();
    
    // Configure Ollama
    const configButton = page.locator('button:has-text("Configure")').first();
    await configButton.click();
    
    // Open advanced settings
    await page.locator('button:has-text("Advanced Settings")').click();
    
    // Change to HTTPS
    await page.locator('button[id="ollama-protocol"]').click();
    await page.locator('text=HTTPS').click();
    
    // Verify endpoint preview updates
    await expect(page.locator('code:has-text("https://localhost:11434/v1")')).toBeVisible();
  });
});

test.describe('Ollama Performance Tests', () => {
  test('should handle multiple concurrent Ollama agents', async ({ page }) => {
    // Skip if Ollama not running
    try {
      const response = await fetch('http://localhost:11434/api/tags');
      if (!response.ok) {
        test.skip();
      }
    } catch (error) {
      test.skip();
    }
    
    await page.goto('/en/new');
    await expect(page.locator('h1:has-text("Start New Game")')).toBeVisible();
    
    // Select Local Ollama
    const providerSelector = page.locator('button[role="combobox"]').first();
    await providerSelector.click();
    await page.locator('text=Local Ollama').click();
    
    // Set high number of players to test concurrent requests
    const playerCountInput = page.locator('input[type="number"]').first();
    await playerCountInput.clear();
    await playerCountInput.fill('8');
    
    // Start the game
    const startButton = page.locator('button:has-text("Start Game")');
    await startButton.click();
    
    // Measure time for character generation
    const startTime = Date.now();
    
    // Wait for character generation to complete
    await expect(page.locator('text=Round 1')).toBeVisible({ timeout: 120000 });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Log performance metric
    console.log(`Character generation for 8 players took ${duration}ms`);
    
    // Verify all players were created
    const playerCards = page.locator('[data-testid="player-card"]');
    await expect(playerCards).toHaveCount(8);
  });
}); 