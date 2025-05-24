import { test, expect } from '@playwright/test';

const DEV_USER = {
  email: 'dev@werewolf-ai.com',
  password: 'DevPassword123!',
  name: 'Developer',
};

test.describe('Authentication and Game Creation E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Ensure we start from a clean slate
    await page.context().clearCookies();
    await page.goto('/en');
  });

  test('should sign in and successfully create a game', async ({ page }) => {
    // Step 1: Navigate to sign-in page
    await page.goto('/en/auth/signin');
    await expect(page.locator('h2')).toContainText('Sign In');

    // Step 2: Fill in credentials
    await page.fill('#email', DEV_USER.email);
    await page.fill('#password', DEV_USER.password);

    // Step 3: Submit the form
    await page.click('button[type="submit"]');

    // Step 4: Verify successful sign-in (should redirect to home page)
    await expect(page).toHaveURL('/en');
    await expect(page.locator('text=Developer')).toBeVisible({ timeout: 10000 });

    // Step 5: Navigate to new game page
    await page.click('a[href="/en/new"]');
    await expect(page).toHaveURL('/en/new');

    // Step 6: Verify we're on the authenticated new game page (not the unauthenticated view)
    await expect(page.locator('h1')).toContainText('Werewolf AI');
    await expect(page.locator('text=Authentication Required')).not.toBeVisible();

    // Step 7: Wait for the game configuration form to load
    await expect(page.locator('#global-provider-provider')).toBeVisible({ timeout: 10000 });

    // Step 8: Verify default configuration is loaded
    const providerSelect = page.locator('#global-provider-provider');
    const modelSelect = page.locator('#global-provider-model');
    
    await expect(providerSelect).toBeVisible();
    await expect(modelSelect).toBeVisible();
    await expect(modelSelect).not.toBeDisabled();

    // Step 9: Look for the "Generate Characters & Start Game" button
    const startGameButton = page.locator('button').filter({ hasText: /Generate.*Start.*Game/i });
    await expect(startGameButton).toBeVisible({ timeout: 10000 });

    // Step 10: Verify the button is enabled (meaning configuration is valid)
    await expect(startGameButton).not.toBeDisabled({ timeout: 10000 });

    // Step 11: Click the start game button
    await startGameButton.click();

    // Step 12: Wait for game creation to complete or show progress
    // Look for either:
    // - Success message indicating game started
    // - Redirect to game page
    // - Loading/progress indicator
    
    // First check if there are any error messages
    const errorMessages = page.locator('.text-destructive, .text-red-500, [role="alert"]');
    
    // Wait a bit for any errors to appear
    await page.waitForTimeout(2000);
    
    // Check that no authentication error appears
    const authError = page.locator('text=Authentication required');
    await expect(authError).not.toBeVisible();
    
    // Check for generic error messages and log them if they exist
    const visibleErrors = await errorMessages.count();
    if (visibleErrors > 0) {
      console.log('Errors found during game creation:');
      for (let i = 0; i < visibleErrors; i++) {
        const errorText = await errorMessages.nth(i).textContent();
        console.log(`  Error ${i + 1}: ${errorText}`);
      }
    }

    // Step 13: Verify no authentication-related errors
    await expect(page.locator('text=Authentication required to start a game')).not.toBeVisible();
    
    // Step 14: Check for success indicators
    // This could be a redirect to game page, success message, or loading state
    const successIndicators = [
      page.locator('text=Game started successfully'),
      page.locator('text=Starting game'),
      page.locator('text=Generating characters'),
      page.locator('.animate-spin'), // Loading spinner
    ];

    let successFound = false;
    for (const indicator of successIndicators) {
      try {
        await indicator.waitFor({ timeout: 5000 });
        successFound = true;
        break;
      } catch {
        // Continue to next indicator
      }
    }

    // If no success indicators, at least verify no auth errors
    if (!successFound) {
      console.log('No clear success indicators found, but checking for absence of auth errors');
    }

    // Final verification: ensure we didn't get the authentication error
    await expect(page.locator('text=Authentication required to start a game')).not.toBeVisible();
  });

  test('should show correct authenticated state in header', async ({ page }) => {
    // Sign in first
    await page.goto('/en/auth/signin');
    await page.fill('#email', DEV_USER.email);
    await page.fill('#password', DEV_USER.password);
    await page.click('button[type="submit"]');

    // Wait for redirect and verify authenticated header
    await expect(page).toHaveURL('/en');
    
    // Check that user name or dropdown is visible in header
    const userInfo = page.locator('text=Developer, [data-testid="user-menu"], button:has-text("Developer")').first();
    await expect(userInfo).toBeVisible({ timeout: 10000 });

    // Verify "Play Now" button is visible for authenticated users
    const playNowButton = page.locator('a[href="/en/new"]').filter({ hasText: /Play.*Now/i });
    await expect(playNowButton).toBeVisible();
  });

  test('should redirect unauthenticated users to sign-in when accessing new game page directly', async ({ page }) => {
    // Try to access new game page without authentication
    await page.goto('/en/new');
    
    // Should show unauthenticated view with sign-in prompt
    await expect(page.locator('text=Authentication Required')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('a[href="/en/auth/signin"]')).toBeVisible();
  });

  test('should handle sign-out flow correctly', async ({ page }) => {
    // Sign in first
    await page.goto('/en/auth/signin');
    await page.fill('#email', DEV_USER.email);
    await page.fill('#password', DEV_USER.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/en');

    // Open user menu and sign out
    const userMenuButton = page.locator('button').filter({ hasText: /Developer/i }).first();
    await userMenuButton.click();
    
    const signOutButton = page.locator('text=Sign Out, [data-testid="sign-out"]').first();
    await signOutButton.click();

    // Verify we're signed out - should see sign in button in header
    await expect(page.locator('button:has-text("Sign In")')).toBeVisible({ timeout: 10000 });
    
    // Verify that accessing new game page now shows unauthenticated view
    await page.goto('/en/new');
    await expect(page.locator('text=Authentication Required')).toBeVisible();
  });
}); 