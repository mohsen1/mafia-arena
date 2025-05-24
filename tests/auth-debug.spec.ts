import { test, expect } from '@playwright/test';

const DEV_USER = {
  email: 'dev@werewolf-ai.com',
  password: 'DevPassword123!',
  name: 'Developer',
};

test.describe('Authentication Debug', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test('debug sign-in flow step by step', async ({ page }) => {
    console.log('Step 1: Navigate to home page');
    await page.goto('/en');
    await page.screenshot({ path: 'debug-1-home.png' });
    
    console.log('Step 2: Navigate to sign-in page');
    await page.goto('/en/auth/signin');
    await page.screenshot({ path: 'debug-2-signin-page.png' });
    
    // Check if the sign-in form is present
    const emailField = page.locator('#email');
    const passwordField = page.locator('#password');
    const submitButton = page.locator('button[type="submit"]');
    
    await expect(emailField).toBeVisible();
    await expect(passwordField).toBeVisible();
    await expect(submitButton).toBeVisible();
    
    console.log('Step 3: Fill in credentials');
    await emailField.fill(DEV_USER.email);
    await passwordField.fill(DEV_USER.password);
    await page.screenshot({ path: 'debug-3-filled-form.png' });
    
    console.log('Step 4: Submit form');
    await submitButton.click();
    
    // Wait a bit for any processing
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'debug-4-after-submit.png' });
    
    console.log('Current URL:', await page.url());
    console.log('Page title:', await page.title());
    
    // Check if there are any error messages
    const errorElements = await page.locator('.text-destructive, .text-red-500, [role="alert"]').all();
    if (errorElements.length > 0) {
      console.log('Error messages found:');
      for (const error of errorElements) {
        const text = await error.textContent();
        console.log('  -', text);
      }
    }
    
    // Get the full page content to see what's actually there
    const bodyText = await page.locator('body').textContent();
    console.log('Page content preview:', bodyText?.substring(0, 500));
    
    // Check specifically for authentication status indicators
    const signInButton = page.locator('button:has-text("Sign In")');
    const userMenu = page.locator('button').filter({ hasText: /Developer/i });
    
    const signInVisible = await signInButton.count();
    const userMenuVisible = await userMenu.count();
    
    console.log('Sign In button count:', signInVisible);
    console.log('User menu button count:', userMenuVisible);
    
    // Check for any text containing "Developer"
    const developerText = page.locator('text=Developer');
    const developerCount = await developerText.count();
    console.log('Elements containing "Developer":', developerCount);
    
    if (developerCount > 0) {
      for (let i = 0; i < developerCount; i++) {
        const text = await developerText.nth(i).textContent();
        const isVisible = await developerText.nth(i).isVisible();
        console.log(`  Developer element ${i}: "${text}", visible: ${isVisible}`);
      }
    }
    
    await page.screenshot({ path: 'debug-5-final-state.png' });
  });

  test('check header structure on authenticated page', async ({ page }) => {
    // Go directly to home and see what the header looks like
    await page.goto('/en');
    await page.screenshot({ path: 'debug-header-unauthenticated.png' });
    
    // Get all header elements
    const headerElements = await page.locator('nav, header, [role="banner"]').all();
    console.log('Header elements found:', headerElements.length);
    
    for (let i = 0; i < headerElements.length; i++) {
      const headerText = await headerElements[i].textContent();
      console.log(`Header ${i}:`, headerText?.substring(0, 200));
    }
    
    // Look for any buttons in the header
    const headerButtons = await page.locator('nav button, header button').all();
    console.log('Header buttons found:', headerButtons.length);
    
    for (let i = 0; i < headerButtons.length; i++) {
      const buttonText = await headerButtons[i].textContent();
      console.log(`Button ${i}:`, buttonText);
    }
  });
}); 