import { test, expect } from '@playwright/test';

test.describe('Message Visibility in Conversation Log', () => {
  test('should display both moderator and player messages', async ({ page }) => {
    // This test will verify that both system/moderator messages and player messages
    // are properly displayed in the conversation log
    
    // Navigate to home page
    await page.goto('/en');
    
    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Werewolf AI', { timeout: 30000 });
    
    // Start a new game
    await page.click('a[href="/en/new"]');
    
    // Wait for game setup form
    await expect(page.locator('#global-provider-provider')).toBeVisible({ timeout: 30000 });
    
    // Start the game
    const startButton = page.locator('button').filter({ hasText: /Start.*Game/i });
    await startButton.click();
    
    // Wait for game to load and character generation to complete
    await page.waitForURL(/\/game\//, { timeout: 60000 });
    
    // Wait for conversation log to appear
    const conversationLog = page.locator('[class*="overflow-y-auto"]').first();
    await expect(conversationLog).toBeVisible({ timeout: 30000 });
    
    // Wait for some messages to appear
    await page.waitForTimeout(5000);
    
    // Check for different types of messages
    const messages = page.locator('[class*="rounded-2xl"]');
    const messageCount = await messages.count();
    
    console.log(`Found ${messageCount} messages in conversation log`);
    
    // Verify we have more than just moderator messages
    expect(messageCount).toBeGreaterThan(1);
    
    // Check for moderator messages (should have specific styling)
    const moderatorMessages = page.locator('[class*="rounded-2xl"][class*="bg-secondary"]');
    const moderatorCount = await moderatorMessages.count();
    console.log(`Found ${moderatorCount} moderator messages`);
    
    // Check for player messages (should have different styling)
    const playerMessages = page.locator('[class*="rounded-2xl"][class*="bg-muted"]');
    const playerCount = await playerMessages.count();
    console.log(`Found ${playerCount} player messages`);
    
    // Verify we have both types of messages
    expect(moderatorCount).toBeGreaterThan(0);
    expect(playerCount).toBeGreaterThan(0);
    
    // Check message content
    const firstModeratorMessage = await moderatorMessages.first().textContent();
    console.log(`First moderator message: ${firstModeratorMessage}`);
    
    if (playerCount > 0) {
      const firstPlayerMessage = await playerMessages.first().textContent();
      console.log(`First player message: ${firstPlayerMessage}`);
      
      // Verify player messages contain actual content (not just "Moderator")
      expect(firstPlayerMessage).not.toContain('Moderator');
    }
  });
  
  test('should show player names in messages', async ({ page }) => {
    // This test verifies that player names are displayed correctly
    
    await page.goto('/en');
    await expect(page.locator('h1')).toContainText('Werewolf AI', { timeout: 30000 });
    
    // Start a new game
    await page.click('a[href="/en/new"]');
    await expect(page.locator('#global-provider-provider')).toBeVisible({ timeout: 30000 });
    
    const startButton = page.locator('button').filter({ hasText: /Start.*Game/i });
    await startButton.click();
    
    // Wait for game to load
    await page.waitForURL(/\/game\//, { timeout: 60000 });
    
    // Wait for messages to appear
    await page.waitForTimeout(5000);
    
    // Look for player names in messages
    const messageContainers = page.locator('[class*="flex items-start gap-2"]');
    const containerCount = await messageContainers.count();
    
    let foundPlayerName = false;
    
    for (let i = 0; i < containerCount; i++) {
      const container = messageContainers.nth(i);
      const nameElement = container.locator('span[class*="text-xs font-semibold"]');
      
      if (await nameElement.isVisible()) {
        const name = await nameElement.textContent();
        console.log(`Found name in message ${i}: ${name}`);
        
        // Check if this is a player name (not "Moderator")
        if (name && name !== 'Moderator' && name.trim().length > 0) {
          foundPlayerName = true;
          break;
        }
      }
    }
    
    expect(foundPlayerName).toBe(true);
  });
}); 