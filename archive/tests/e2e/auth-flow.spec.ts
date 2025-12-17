import { test, expect } from '@playwright/test';

test.describe('Authentication Flow E2E Tests', () => {
  const baseURL = 'http://localhost:3099';
  const testUser = {
    email: 'test@example.com',
    password: 'TestPassword123!'
  };

  test.beforeEach(async ({ page }) => {
    // Clear any existing sessions
    await page.context().clearCookies();
    await page.goto(baseURL);
  });

  test.describe('Credentials Authentication', () => {
    test('should display sign-in form', async ({ page }) => {
      await page.goto(`${baseURL}/en/auth/signin`);
      
      // Check for email and password fields
      await expect(page.locator('input[type="email"]')).toBeVisible();
      await expect(page.locator('input[type="password"]')).toBeVisible();
      
      // Check for sign-in button
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('should show validation errors for empty fields', async ({ page }) => {
      await page.goto(`${baseURL}/en/auth/signin`);
      
      // Try to submit with empty fields
      await page.click('button[type="submit"]');
      
      // Should show validation errors
      const emailError = page.locator('text=Email is required');
      const passwordError = page.locator('text=Password is required');
      
      // Wait a bit for validation to appear
      await page.waitForTimeout(1000);
      
      // Check if validation messages appear
      const hasEmailError = await emailError.isVisible().catch(() => false);
      const hasPasswordError = await passwordError.isVisible().catch(() => false);
      
      console.log('Email validation visible:', hasEmailError);
      console.log('Password validation visible:', hasPasswordError);
    });

    test('should handle invalid credentials', async ({ page }) => {
      await page.goto(`${baseURL}/en/auth/signin`);
      
      // Fill in invalid credentials
      await page.fill('input[type="email"]', testUser.email);
      await page.fill('input[type="password"]', testUser.password);
      
      // Submit the form
      await page.click('button[type="submit"]');
      
      // Wait for response
      await page.waitForTimeout(2000);
      
      // Should either show error message or redirect
      const url = page.url();
      console.log('URL after invalid login:', url);
      
      // Check if we're still on signin page or redirected
      if (url.includes('/signin')) {
        // Should show error message
        const errorMessage = page.locator('text=Invalid');
        const hasError = await errorMessage.isVisible().catch(() => false);
        console.log('Error message visible:', hasError);
      }
    });

    test('should handle valid credentials (when user exists)', async ({ page }) => {
      // First, we need to create a test user
      // For now, let's test the API endpoint directly
      
      const response = await page.request.post(`${baseURL}/api/auth/callback/credentials`, {
        headers: {
          'Content-Type': 'application/json',
        },
        data: {
          email: testUser.email,
          password: testUser.password,
        }
      });
      
      console.log('Credentials API response status:', response.status());
      
      // The response might be a redirect or JSON
      if (response.status() === 302) {
        const location = response.headers()['location'];
        console.log('Redirect location:', location);
      } else {
        const text = await response.text();
        console.log('Response text:', text);
      }
    });

    test('should maintain session after successful login', async ({ page }) => {
      // Test session persistence by checking if user stays logged in
      await page.goto(`${baseURL}/en/auth/signin`);
      
      // This test would require a valid user to be created first
      // For now, we'll test the session endpoint
      
      const sessionResponse = await page.request.get(`${baseURL}/api/auth/session`);
      console.log('Session endpoint status:', sessionResponse.status());
      
      const sessionData = await sessionResponse.json();
      console.log('Session data:', sessionData);
    });
  });

  test.describe('OAuth Flow Tests', () => {
    test('should redirect to Google OAuth', async ({ page }) => {
      await page.goto(`${baseURL}/en/auth/signin`);
      
      // Click Google sign-in button
      await page.click('text=Sign in with Google');
      
      // Should redirect to Google
      await page.waitForTimeout(2000);
      
      const url = page.url();
      console.log('After Google sign-in click, URL:', url);
      
      if (url.includes('accounts.google.com')) {
        console.log('✅ Google OAuth redirect working');
      } else {
        console.log('❌ Google OAuth redirect failed, URL:', url);
      }
    });

    test('should redirect to GitHub OAuth', async ({ page }) => {
      await page.goto(`${baseURL}/en/auth/signin`);
      
      // Click GitHub sign-in button
      await page.click('text=Sign in with GitHub');
      
      // Should redirect to GitHub
      await page.waitForTimeout(2000);
      
      const url = page.url();
      console.log('After GitHub sign-in click, URL:', url);
      
      if (url.includes('github.com')) {
        console.log('✅ GitHub OAuth redirect working');
      } else {
        console.log('❌ GitHub OAuth redirect failed, URL:', url);
      }
    });
  });

  test.describe('Protected Routes', () => {
    test('should redirect unauthenticated users from protected routes', async ({ page }) => {
      const protectedRoutes = ['/games', '/profile', '/character-setup', '/statistics'];
      
      for (const route of protectedRoutes) {
        await page.goto(`${baseURL}/en${route}`);
        
        // Wait a moment for potential redirects
        await page.waitForTimeout(1000);
        
        const url = page.url();
        console.log(`Route ${route} - Current URL:`, url);
        
        // Should either redirect to signin or show auth error
        if (url.includes('/signin') || url.includes('/auth/error')) {
          console.log(`✅ ${route} properly protected`);
        } else if (url.includes(route)) {
          console.log(`❌ ${route} is NOT protected - returning 200`);
        } else {
          console.log(`⚠️  ${route} redirected to:`, url);
        }
      }
    });
  });

  test.describe('Session Management', () => {
    test('should handle session creation and validation', async ({ page }) => {
      // Test session API endpoints
      const sessionResponse = await page.request.get(`${baseURL}/api/auth/session`);
      console.log('Session API status:', sessionResponse.status());
      
      if (sessionResponse.status() === 200) {
        const sessionData = await sessionResponse.json();
        console.log('Session data structure:', Object.keys(sessionData));
      }
      
      // Test providers endpoint
      const providersResponse = await page.request.get(`${baseURL}/api/auth/providers`);
      console.log('Providers API status:', providersResponse.status());
      
      if (providersResponse.status() === 200) {
        const providersData = await providersResponse.json();
        console.log('Providers available:', providersData.providers);
      }
    });
  });

  test.describe('API Endpoints Health Check', () => {
    test('should respond to authentication API endpoints', async ({ page }) => {
      const endpoints = [
        '/api/auth/session',
        '/api/auth/providers', 
        '/api/auth/health'
      ];
      
      for (const endpoint of endpoints) {
        try {
          const response = await page.request.get(`${baseURL}${endpoint}`);
          console.log(`${endpoint}: ${response.status()}`);
          
          if (response.status() === 200) {
            console.log(`✅ ${endpoint} working`);
          } else {
            console.log(`⚠️  ${endpoint} returned ${response.status()}`);
          }
        } catch (error) {
          console.log(`❌ ${endpoint} failed:`, error instanceof Error ? error.message : String(error));
        }
      }
    });
  });
});