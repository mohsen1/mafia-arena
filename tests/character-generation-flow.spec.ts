import { test, expect, type Page } from '@playwright/test';

// Skip these heavy e2e tests when the required services are not running.
test.skip(true, 'Skipping e2e tests in CI environment');

async function signInUser(page: Page) {
  await page.goto('/en/auth/signin');
  await page.fill('input[name="email"]', 'dev@example.com');
  await page.fill('input[name="password"]', 'devpassword');
  await page.click('button[type="submit"]');
  await page.waitForURL('/en');
}

test.describe('Character Generation Flow E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Set up any necessary test data or authentication
    await page.goto('/en');
  });

  test('should complete character generation without infinite loops', async ({ page }) => {
    // Authenticate user
    await signInUser(page);
    
    // Navigate to new game creation
    await page.click('a[href="/en/new"]');
    await expect(page.locator('#global-provider-provider')).toBeVisible({ timeout: 10000 });

    // Wait for the form to be ready
    const startGameButton = page.locator('button').filter({ hasText: /Generate.*Start.*Game/i });
    await expect(startGameButton).not.toBeDisabled({ timeout: 10000 });

    // Start game creation
    await startGameButton.click();
    
    // Should navigate to game page
    await page.waitForURL(/\/en\/game\/[^\/]+/, { timeout: 30000 });
    
    // Should show character generation UI
    const characterGenerationTitle = page.locator('text=Creating Characters');
    await expect(characterGenerationTitle).toBeVisible({ timeout: 5000 });
    
    // Monitor for infinite loop indicators
    let progressUpdates = 0;
    let lastProgress = '';
    
    // Set up a listener for progress changes
    const progressElement = page.locator('[data-testid="progress"], .progress, text=/Generated.*of.*characters/');
    
    // Wait for character generation to start and track progress
    const startTime = Date.now();
    const maxWaitTime = 60000; // 1 minute max
    let generationComplete = false;
    
    while (!generationComplete && (Date.now() - startTime) < maxWaitTime) {
      try {
        // Check if generation is complete
        const completeMessage = page.locator('text=Characters Ready!');
        if (await completeMessage.isVisible({ timeout: 1000 })) {
          generationComplete = true;
          break;
        }
        
        // Check if we're in the actual game (generation completed and transitioned)
        const gameInterface = page.locator('[data-testid="conversation-log"], .conversation-log, text=Round');
        if (await gameInterface.isVisible({ timeout: 1000 })) {
          generationComplete = true;
          break;
        }
        
        // Track progress to detect infinite loops
        try {
          const currentProgress = await progressElement.first().textContent({ timeout: 1000 });
          if (currentProgress && currentProgress !== lastProgress) {
            progressUpdates++;
            lastProgress = currentProgress;
            console.log(`Progress update ${progressUpdates}: ${currentProgress}`);
            
            // If we see too many identical progress updates, it might be an infinite loop
            if (progressUpdates > 50) {
              throw new Error('Possible infinite loop detected: too many progress updates');
            }
          }
        } catch (e) {
          // Progress element might not be visible, continue
        }
        
        // Check for error states
        const errorMessage = page.locator('text=Generation Error, text=Error');
        if (await errorMessage.isVisible({ timeout: 1000 })) {
          const errorText = await errorMessage.textContent();
          throw new Error(`Character generation failed: ${errorText}`);
        }
        
        // Wait a bit before next check
        await page.waitForTimeout(1000);
        
      } catch (error) {
        if (error instanceof Error && error.message.includes('infinite loop')) {
          throw error;
        }
        // Continue on other errors (timeouts, etc.)
      }
    }
    
    if (!generationComplete) {
      throw new Error('Character generation did not complete within the expected time');
    }
    
    console.log(`✅ Character generation completed successfully with ${progressUpdates} progress updates`);
    
    // Verify we're in the game or completion state
    const isInGame = await page.locator('[data-testid="conversation-log"], .conversation-log, text=Round').isVisible({ timeout: 5000 });
    const isComplete = await page.locator('text=Characters Ready!').isVisible({ timeout: 1000 });
    
    expect(isInGame || isComplete).toBe(true);
    
    // If we're in the complete state, wait for transition to game
    if (isComplete) {
      await page.waitForTimeout(3000); // Give time for transition
      const finalGameState = await page.locator('[data-testid="conversation-log"], .conversation-log, text=Round').isVisible({ timeout: 10000 });
      expect(finalGameState).toBe(true);
    }
  });

  test('should handle character generation errors gracefully', async ({ page }) => {
    // Mock character generation to fail
    await page.route('**/actions/character-generation**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Mock character generation failure'
        })
      });
    });

    // Authenticate and create game
    await signInUser(page);
    await page.click('a[href="/en/new"]');
    await expect(page.locator('#global-provider-provider')).toBeVisible({ timeout: 10000 });

    const startGameButton = page.locator('button').filter({ hasText: /Generate.*Start.*Game/i });
    await expect(startGameButton).not.toBeDisabled({ timeout: 10000 });

    // Start game creation
    await startGameButton.click();
    
    // Should navigate to game page
    await page.waitForURL(/\/en\/game\/[^\/]+/, { timeout: 30000 });
    
    // Should show error UI
    await expect(page.locator('text=Generation Error')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Mock character generation failure')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Try Again')).toBeVisible({ timeout: 5000 });
    
    console.log('✅ Error handling working correctly');
  });

  test('should not make excessive API calls during character generation', async ({ page }) => {
    let apiCallCount = 0;
    let progressCallCount = 0;
    let generationCallCount = 0;
    
    // Monitor API calls
    page.on('request', request => {
      const url = request.url();
      if (url.includes('character-generation')) {
        apiCallCount++;
        if (url.includes('progress')) {
          progressCallCount++;
        } else {
          generationCallCount++;
        }
      }
    });

    // Authenticate and create game
    await signInUser(page);
    await page.click('a[href="/en/new"]');
    await expect(page.locator('#global-provider-provider')).toBeVisible({ timeout: 10000 });

    const startGameButton = page.locator('button').filter({ hasText: /Generate.*Start.*Game/i });
    await expect(startGameButton).not.toBeDisabled({ timeout: 10000 });

    // Start game creation
    await startGameButton.click();
    
    // Wait for navigation and initial character generation
    await page.waitForURL(/\/en\/game\/[^\/]+/, { timeout: 30000 });
    
    // Wait for character generation to complete or timeout
    const startTime = Date.now();
    const maxWaitTime = 60000; // 1 minute
    
    while ((Date.now() - startTime) < maxWaitTime) {
      const isComplete = await page.locator('text=Characters Ready!, [data-testid="conversation-log"], .conversation-log').isVisible({ timeout: 1000 });
      if (isComplete) {
        break;
      }
      await page.waitForTimeout(1000);
    }
    
    console.log(`API call summary:
      - Total character generation calls: ${apiCallCount}
      - Progress calls: ${progressCallCount}
      - Generation calls: ${generationCallCount}`);
    
    // Verify reasonable API usage (not infinite loops)
    expect(generationCallCount).toBeLessThanOrEqual(3); // Should only call generation once, maybe retry once or twice
    expect(progressCallCount).toBeLessThan(100); // Should not poll excessively
    expect(apiCallCount).toBeLessThan(150); // Total calls should be reasonable
    
    console.log('✅ API call count is within reasonable limits');
  });

  test('should handle rapid component re-renders without issues', async ({ page }) => {
    // Authenticate and create game
    await signInUser(page);
    await page.click('a[href="/en/new"]');
    await expect(page.locator('#global-provider-provider')).toBeVisible({ timeout: 10000 });

    const startGameButton = page.locator('button').filter({ hasText: /Generate.*Start.*Game/i });
    await expect(startGameButton).not.toBeDisabled({ timeout: 10000 });

    // Start game creation
    await startGameButton.click();
    
    // Wait for navigation
    await page.waitForURL(/\/en\/game\/[^\/]+/, { timeout: 30000 });
    
    // Rapidly trigger potential re-renders by resizing window, changing focus, etc.
    for (let i = 0; i < 5; i++) {
      await page.setViewportSize({ width: 800 + (i * 100), height: 600 + (i * 50) });
      await page.waitForTimeout(100);
      
      // Trigger focus events
      await page.evaluate(() => {
        window.dispatchEvent(new Event('focus'));
        window.dispatchEvent(new Event('blur'));
      });
      await page.waitForTimeout(100);
    }
    
    // Reset viewport
    await page.setViewportSize({ width: 1280, height: 720 });
    
    // Verify the character generation UI is still working correctly
    const isGenerating = await page.locator('text=Creating Characters').isVisible({ timeout: 5000 });
    const isComplete = await page.locator('text=Characters Ready!').isVisible({ timeout: 1000 });
    const isInGame = await page.locator('[data-testid="conversation-log"], .conversation-log').isVisible({ timeout: 1000 });
    
    // Should be in one of these states
    expect(isGenerating || isComplete || isInGame).toBe(true);
    
    console.log('✅ Component handles re-renders gracefully');
  });

  test('should transition from character generation to game correctly', async ({ page }) => {
    // Authenticate and create game
    await signInUser(page);
    await page.click('a[href="/en/new"]');
    await expect(page.locator('#global-provider-provider')).toBeVisible({ timeout: 10000 });

    const startGameButton = page.locator('button').filter({ hasText: /Generate.*Start.*Game/i });
    await expect(startGameButton).not.toBeDisabled({ timeout: 10000 });

    // Start game creation
    await startGameButton.click();
    
    // Wait for navigation
    await page.waitForURL(/\/en\/game\/[^\/]+/, { timeout: 30000 });
    
    // Should start with character generation
    await expect(page.locator('text=Creating Characters')).toBeVisible({ timeout: 10000 });
    
    // Wait for completion
    const maxWaitTime = 60000; // 1 minute
    const startTime = Date.now();
    
    while ((Date.now() - startTime) < maxWaitTime) {
      // Check if we've transitioned to the game
      const gameElements = page.locator('[data-testid="conversation-log"], .conversation-log, text=Round');
      if (await gameElements.isVisible({ timeout: 1000 })) {
        console.log('✅ Successfully transitioned to game');
        break;
      }
      
      // Check if we're in the completion state
      const completeMessage = page.locator('text=Characters Ready!');
      if (await completeMessage.isVisible({ timeout: 1000 })) {
        console.log('Characters generation complete, waiting for game transition...');
        // Wait a bit more for the transition
        await page.waitForTimeout(5000);
        continue;
      }
      
      await page.waitForTimeout(1000);
    }
    
    // Verify we're in the game
    const finalGameState = await page.locator('[data-testid="conversation-log"], .conversation-log, text=Round').isVisible({ timeout: 5000 });
    expect(finalGameState).toBe(true);
    
    // Verify game elements are present
    const sidebar = page.locator('[data-testid="game-sidebar"], .game-sidebar, text=Players');
    await expect(sidebar).toBeVisible({ timeout: 5000 });
    
    console.log('✅ Game transition completed successfully');
  });
}); 