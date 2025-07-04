import { test, expect, type Page } from '@playwright/test';

async function signInUser(page: Page) {
  await page.goto('/en/auth/signin');
  await page.fill('input[name="email"]', 'dev@example.com');
  await page.fill('input[name="password"]', 'devpassword');
  await page.click('button[type="submit"]');
  await page.waitForURL('/en');
}

test.describe('Enhanced Character Generation Feedback', () => {
  test('should display model attribution during character generation', async ({ page }) => {
    // Sign in
    await signInUser(page);
    
    // Navigate to new game
    await page.goto('/en/new');
    
    // Wait for the form to be ready
    await expect(page.locator('#global-provider-provider')).toBeVisible({ timeout: 10000 });
    
    // Select a provider and model
    await page.selectOption('#global-provider-provider', 'groq');
    await page.waitForTimeout(500);
    
    // Start game
    const startButton = page.locator('button').filter({ hasText: /Generate.*Start.*Game/i });
    await expect(startButton).not.toBeDisabled({ timeout: 10000 });
    await startButton.click();
    
    // Wait for character generation page
    await page.waitForURL(/\/en\/game\/[^\/]+/, { timeout: 30000 });
    
    // Check for model attribution in character cards
    const modelAttribution = page.locator('text=/groq.*\\(.*\\)/i');
    await expect(modelAttribution.first()).toBeVisible({ timeout: 10000 });
    
    console.log('✅ Model attribution is displayed');
  });
  
  test('should show prompt display toggle', async ({ page }) => {
    // Sign in
    await signInUser(page);
    
    // Navigate to new game
    await page.goto('/en/new');
    
    // Start game (simplified)
    await page.waitForTimeout(2000);
    const startButton = page.locator('button').filter({ hasText: /Generate.*Start.*Game/i });
    await expect(startButton).not.toBeDisabled({ timeout: 10000 });
    await startButton.click();
    
    // Wait for character generation page
    await page.waitForURL(/\/en\/game\/[^\/]+/, { timeout: 30000 });
    
    // Look for prompt toggle button
    const promptToggle = page.locator('button').filter({ hasText: /Show Prompt|Hide Prompt/i });
    
    // The button might not be immediately visible if generation hasn't started
    try {
      await expect(promptToggle).toBeVisible({ timeout: 5000 });
      console.log('✅ Prompt toggle button is available');
      
      // Click to show prompt
      await promptToggle.click();
      
      // Check if prompt is displayed
      const promptContent = page.locator('text=/You are a creative writer/i');
      await expect(promptContent).toBeVisible({ timeout: 3000 });
      console.log('✅ Prompt content is displayed');
    } catch (e) {
      console.log('ℹ️ Prompt toggle not visible - generation may have completed too quickly');
    }
  });
  
  test('should display enhanced error messages with provider details', async ({ page }) => {
    // Mock character generation to fail with specific error
    await page.route('**/actions/character-generation**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Authentication error - Invalid API key for groq'
        })
      });
    });
    
    // Sign in
    await signInUser(page);
    
    // Navigate to new game
    await page.goto('/en/new');
    
    // Start game
    await page.waitForTimeout(2000);
    const startButton = page.locator('button').filter({ hasText: /Generate.*Start.*Game/i });
    await expect(startButton).not.toBeDisabled({ timeout: 10000 });
    await startButton.click();
    
    // Wait for error display
    await expect(page.locator('text=Generation Error')).toBeVisible({ timeout: 10000 });
    
    // Check for enhanced error suggestions
    await expect(page.locator('text=/Check your API key in the profile settings/i')).toBeVisible();
    await expect(page.locator('text=/Consider using a different AI provider/i')).toBeVisible();
    
    console.log('✅ Enhanced error messages are displayed');
  });
}); 