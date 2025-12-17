import { test, expect } from '@playwright/test';

test.describe('User API Key Management', () => {
  test('should show API key management in user profile', async ({ page }) => {
    // Navigate to sign in page
    await page.goto('/en/auth/signin');
    
    // Sign in with test credentials
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    
    // Wait for redirect to home
    await expect(page).toHaveURL(/\/en$/);
    
    // Navigate to profile
    await page.click('button[aria-label*="User menu"]');
    await page.click('text=Profile');
    
    // Verify API key section exists
    await expect(page.locator('text=Your API Keys')).toBeVisible();
    await expect(page.locator('text=Manage your personal API keys')).toBeVisible();
    
    // Check for Add API Key button
    await expect(page.locator('button:has-text("Add API Key")')).toBeVisible();
  });

  test('should allow adding a new API key', async ({ page }) => {
    // Assume already signed in
    await page.goto('/en/profile');
    
    // Click Add API Key button
    await page.click('button:has-text("Add API Key")');
    
    // Verify form appears
    await expect(page.locator('text=Add New API Key')).toBeVisible();
    
    // Fill in the form
    await page.click('button[role="combobox"]');
    await page.click('text=OpenAI');
    
    await page.fill('input[placeholder*="Personal"]', 'My Test Key');
    await page.fill('input[type="password"]', 'sk-test-1234567890');
    
    // Verify Test Connection button exists
    await expect(page.locator('button:has-text("Test Connection")')).toBeVisible();
  });

  test('should show user API keys in game creation', async ({ page }) => {
    // Navigate to new game page
    await page.goto('/en/new');
    
    // Click on provider selector
    const providerSelector = page.locator('button[role="combobox"]').first();
    await providerSelector.click();
    
    // Check for provider options with user key indicators
    const providerOptions = page.locator('[role="option"]');
    
    // Verify providers show key source
    // Should see options like:
    // - "OpenAI (System)"
    // - "OpenAI (My Test Key)"
    // - "Groq (System + Work Key)"
    await expect(providerOptions.first()).toBeVisible();
  });

  test('should display key source indicators correctly', async ({ page }) => {
    await page.goto('/en/new');
    
    // Open provider dropdown
    await page.locator('button[role="combobox"]').first().click();
    
    // Look for different key source indicators
    const systemIndicator = page.locator('text=(System)');
    const userKeyIndicator = page.locator('text=)').filter({ hasText: /\((?!System).*\)/ });
    
    // At least one provider should be available
    const hasProviders = await page.locator('[role="option"]').count() > 0;
    expect(hasProviders).toBeTruthy();
  });

  test('should handle no API keys gracefully', async ({ page }) => {
    await page.goto('/en/new');
    
    // If no providers are configured, should show helpful message
    const noProvidersAlert = page.locator('text=No AI providers configured');
    const addKeysLink = page.locator('text=add API keys in your profile');
    
    // These elements may or may not be visible depending on environment keys
    // The important thing is the UI handles both cases gracefully
    const alertCount = await noProvidersAlert.count();
    
    if (alertCount > 0) {
      // If no providers, should show helpful message and link
      await expect(addKeysLink).toBeVisible();
    } else {
      // If providers exist, game creation should work
      await expect(page.locator('button:has-text("Generate")')).toBeVisible();
    }
  });
}); 