import { test, expect } from '@playwright/test';

async function createGameWithGroqGemma(page: any) {
  // Navigate to new game page
  await page.goto('/en/new');
  
  // Wait for the page to load
  await page.waitForSelector('[data-testid="game-setup"], .game-setup, h1:has-text("Configure New Game")');

  // Add enough players for a game (minimum 5)
  for (let i = 0; i < 5; i++) {
    const addButton = page.locator('button:has-text("Add"), [aria-label*="Add"]').first();
    if (await addButton.isVisible()) {
      await addButton.click();
    }
  }

  // Configure all players to use Groq Gemma for fast testing
  const playerSlots = page.locator('[data-testid*="player-slot"], .player-slot');
  const playerCount = await playerSlots.count();
  
  for (let i = 0; i < playerCount; i++) {
    const slot = playerSlots.nth(i);
    
    // Select Groq provider
    const providerSelect = slot.locator('select[data-testid*="provider"], select:has(option:text-contains("Groq"))').first();
    if (await providerSelect.isVisible()) {
      await providerSelect.selectOption('groq');
      await page.waitForTimeout(500); // Wait for models to load
    }
    
    // Select Gemma model
    const modelSelect = slot.locator('select[data-testid*="model"], select:has(option:text-contains("gemma"))').first();
    if (await modelSelect.isVisible()) {
      await modelSelect.selectOption('gemma2-9b-it');
    }
  }

  // Start the game
  const startButton = page.locator('button:has-text("Generate & Start Game"), button:has-text("Start Game")').first();
  await startButton.click();

  // Wait for character generation to complete
  await page.waitForSelector('text=Characters Ready!, text=Starting your game, [data-testid="game-interface"]', { timeout: 60000 });
  
  // Get the game ID from URL
  await page.waitForURL(/\/en\/game\/[a-f0-9-]+/);
  const url = page.url();
  const gameId = url.split('/').pop();
  
  return gameId;
}

async function enableAutoMode(page: any) {
  // Look for auto mode toggle/button
  const autoModeButton = page.locator('button:has-text("Auto"), [data-testid*="auto"], [aria-label*="Auto"]').first();
  if (await autoModeButton.isVisible()) {
    await autoModeButton.click();
  }
}

async function monitorGameProgress(page: any, maxWaitTime = 30000) {
  const startTime = Date.now();
  let lastRound = 0;
  let lastPhase = '';
  let stuckCounter = 0;
  let logEntryCount = 0;

  while ((Date.now() - startTime) < maxWaitTime) {
    try {
      // Get current round and phase
      const roundElement = page.locator('text=/Round \\d+/, [data-testid*="round"]').first();
      const phaseElement = page.locator('text=/Phase:/, [data-testid*="phase"]').first();
      
      let currentRound = 0;
      let currentPhase = '';
      
      if (await roundElement.isVisible({ timeout: 1000 })) {
        const roundText = await roundElement.textContent();
        const roundMatch = roundText?.match(/(\d+)/);
        if (roundMatch) currentRound = parseInt(roundMatch[1]);
      }
      
      if (await phaseElement.isVisible({ timeout: 1000 })) {
        currentPhase = await phaseElement.textContent() || '';
      }

      // Count log entries to see if game is progressing
      const logEntries = page.locator('[data-testid="conversation-log"] > *, .conversation-log > *, .message');
      const currentLogCount = await logEntries.count();

      console.log(`Round: ${currentRound}, Phase: ${currentPhase}, Log entries: ${currentLogCount}`);

      // Check if game is progressing
      if (currentRound === lastRound && currentPhase === lastPhase && currentLogCount === logEntryCount) {
        stuckCounter++;
        console.warn(`Game appears stuck: Round ${currentRound}, Phase: ${currentPhase}, Stuck count: ${stuckCounter}`);
        
        if (stuckCounter >= 5) {
          throw new Error(`Game stuck in infinite loop: Round ${currentRound}, Phase: ${currentPhase}`);
        }
      } else {
        stuckCounter = 0; // Reset if progress was made
      }

      // Check if game is over
      const gameOverIndicator = page.locator('text=Game Over, text=Winner, [data-testid*="game-over"]');
      if (await gameOverIndicator.isVisible({ timeout: 1000 })) {
        console.log('Game completed successfully');
        return { success: true, finalRound: currentRound, finalPhase: currentPhase };
      }

      lastRound = currentRound;
      lastPhase = currentPhase;
      logEntryCount = currentLogCount;
      
      await page.waitForTimeout(2000); // Wait before next check
      
    } catch (error) {
      if (error instanceof Error && error.message.includes('infinite loop')) {
        throw error;
      }
      // Continue on other errors (timeouts, etc.)
    }
  }

  throw new Error(`Game monitoring timed out after ${maxWaitTime}ms`);
}

test.describe('Game Infinite Loop Fix', () => {
  test.beforeEach(async ({ page }) => {
    // Set longer timeout for this test
    test.setTimeout(120000);
  });

  test('should not get stuck in infinite loop with AI-only game', async ({ page }) => {
    console.log('🎮 Creating AI-only game with Groq Gemma models...');
    
    const gameId = await createGameWithGroqGemma(page);
    expect(gameId).toBeTruthy();
    console.log(`Game created: ${gameId}`);

    console.log('🤖 Enabling auto mode...');
    await enableAutoMode(page);

    console.log('📊 Monitoring game progress...');
    try {
      const result = await monitorGameProgress(page, 60000); // 60 second timeout
      
      expect(result.success).toBe(true);
      expect(result.finalRound).toBeGreaterThan(0);
      console.log(`✅ Game completed successfully at Round ${result.finalRound}`);
      
    } catch (error) {
      if (error instanceof Error && error.message.includes('infinite loop')) {
        console.log(`❌ INFINITE LOOP DETECTED: ${error.message}`);
        
        // Take a screenshot for debugging
        await page.screenshot({ path: `test-results/infinite-loop-${gameId}.png` });
        
        // This should NOT happen with the fix
        throw error;
      }
      throw error;
    }
  });

  test('should make progress through multiple rounds and phases', async ({ page }) => {
    console.log('🎮 Creating game to test multi-round progress...');
    
    const gameId = await createGameWithGroqGemma(page);
    expect(gameId).toBeTruthy();

    await enableAutoMode(page);

    // Monitor for at least 3 rounds of progress
    let rounds = new Set<number>();
    let phases = new Set<string>();
    const startTime = Date.now();
    const maxWaitTime = 45000; // 45 seconds

    while ((Date.now() - startTime) < maxWaitTime && rounds.size < 3) {
      try {
        const roundElement = page.locator('text=/Round \\d+/').first();
        const phaseElement = page.locator('text=/Phase:/, text=/Day/, text=/Night/').first();
        
        if (await roundElement.isVisible({ timeout: 2000 })) {
          const roundText = await roundElement.textContent();
          const roundMatch = roundText?.match(/(\d+)/);
          if (roundMatch) {
            const round = parseInt(roundMatch[1]);
            rounds.add(round);
            console.log(`Observed round: ${round}`);
          }
        }
        
        if (await phaseElement.isVisible({ timeout: 2000 })) {
          const phaseText = await phaseElement.textContent() || '';
          phases.add(phaseText);
          console.log(`Observed phase: ${phaseText}`);
        }

        // Check if game completed
        if (await page.locator('text=Game Over').isVisible({ timeout: 1000 })) {
          console.log('Game completed');
          break;
        }

        await page.waitForTimeout(3000);
        
      } catch (error) {
        // Continue monitoring
      }
    }

    console.log(`Final progress: ${rounds.size} rounds, ${phases.size} different phases`);
    console.log(`Rounds seen: ${Array.from(rounds).sort()}`);
    console.log(`Phases seen: ${Array.from(phases)}`);

    // Verify we saw progress
    expect(rounds.size).toBeGreaterThanOrEqual(2); // At least 2 different rounds
    expect(phases.size).toBeGreaterThanOrEqual(2); // At least 2 different phases
  });

  test('should handle mixed human/AI game without infinite loops', async ({ page }) => {
    console.log('🎮 Creating mixed human/AI game...');
    
    // Navigate to new game page
    await page.goto('/en/new');
    await page.waitForSelector('[data-testid="game-setup"], h1:has-text("Configure New Game")');

    // Add players
    for (let i = 0; i < 4; i++) {
      const addButton = page.locator('button:has-text("Add")').first();
      if (await addButton.isVisible()) {
        await addButton.click();
      }
    }

    // Configure first player as human
    const humanToggle = page.locator('input[type="checkbox"]:near(text=/human/i), [data-testid*="human"]').first();
    if (await humanToggle.isVisible()) {
      await humanToggle.check();
    }

    // Configure other players as AI with Groq Gemma
    const playerSlots = page.locator('[data-testid*="player-slot"], .player-slot');
    const playerCount = await playerSlots.count();
    
    for (let i = 1; i < playerCount; i++) { // Skip first (human) player
      const slot = playerSlots.nth(i);
      
      const providerSelect = slot.locator('select').first();
      if (await providerSelect.isVisible()) {
        await providerSelect.selectOption('groq');
        await page.waitForTimeout(500);
      }
      
      const modelSelect = slot.locator('select').last();
      if (await modelSelect.isVisible()) {
        await modelSelect.selectOption('gemma2-9b-it');
      }
    }

    // Start the game
    const startButton = page.locator('button:has-text("Generate & Start Game"), button:has-text("Start Game")').first();
    await startButton.click();

    await page.waitForSelector('text=Characters Ready!, [data-testid="game-interface"]', { timeout: 60000 });
    
    // Check that game doesn't immediately get stuck
    await page.waitForTimeout(5000);
    
    // Verify we can see the game interface and it's waiting for human action
    const humanActionPrompt = page.locator('text=/your turn/i, text=/your action/i, button:has-text("Submit")');
    const gameInterface = page.locator('[data-testid="game-interface"], .game-interface');
    
    // Should see either human action prompt or game interface
    await expect(humanActionPrompt.or(gameInterface)).toBeVisible({ timeout: 10000 });
    
    console.log('✅ Mixed game created successfully without infinite loop');
  });
}); 