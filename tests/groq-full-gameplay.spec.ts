import { test, expect, type Page } from '@playwright/test';

/**
 * Comprehensive Groq Full Gameplay E2E Test
 * Tests complete game flow with Groq AI models
 */

test.describe('Groq Full Gameplay Test', () => {
  test.setTimeout(180000); // 3 minutes for full game

  // Helper to create a game with Groq
  async function createGroqGame(page: Page, config: {
    playerCount?: number;
    model?: string;
    useSeparateMafiaModel?: boolean;
    mafiaModel?: string;
    includeHuman?: boolean;
  } = {}) {
    const {
      playerCount = 5,
      model = 'llama-3.1-8b-instant',
      useSeparateMafiaModel = false,
      mafiaModel = 'gemma2-9b-it',
      includeHuman = false
    } = config;

    // Navigate to new game page
    await page.goto('/en/new');
    
    // Wait for the page to load
    await page.waitForSelector('#global-provider-provider', { timeout: 10000 });

    // Select Groq as the global provider
    const globalProviderSelect = page.locator('#global-provider-provider');
    await globalProviderSelect.click();
    await page.getByRole('option', { name: 'Groq' }).click();
    
    // Select the model
    const globalModelSelect = page.locator('#global-provider-model');
    await globalModelSelect.click();
    await page.getByRole('option', { name: new RegExp(model) }).click();

    // Configure separate Mafia model if requested
    if (useSeparateMafiaModel) {
      const mafiaCheckbox = page.locator('input[type="checkbox"]').filter({ hasText: /separate.*mafia/i });
      await mafiaCheckbox.check();
      
      // Wait for Mafia selectors to appear
      await page.waitForSelector('#mafia-provider-provider');
      
      const mafiaProviderSelect = page.locator('#mafia-provider-provider');
      await mafiaProviderSelect.click();
      await page.getByRole('option', { name: 'Groq' }).click();
      
      const mafiaModelSelect = page.locator('#mafia-provider-model');
      await mafiaModelSelect.click();
      await page.getByRole('option', { name: new RegExp(mafiaModel) }).click();
    }

    // Add players if needed
    const currentPlayerCount = await page.locator('[data-testid*="player-slot"], .player-slot').count();
    for (let i = currentPlayerCount; i < playerCount; i++) {
      const addButton = page.locator('button:has-text("Add")').first();
      if (await addButton.isVisible()) {
        await addButton.click();
        await page.waitForTimeout(100);
      }
    }

    // Configure first player as human if requested
    if (includeHuman) {
      const humanCheckbox = page.locator('input[type="checkbox"]').filter({ hasText: /human/i }).first();
      await humanCheckbox.check();
    }

    // Start the game
    const startButton = page.locator('button').filter({ hasText: /Generate.*Start.*Game/i });
    await expect(startButton).toBeEnabled({ timeout: 10000 });
    await startButton.click();

    // Wait for redirect to game page
    await page.waitForURL(/\/en\/game\/[a-f0-9-]+/, { timeout: 30000 });
    
    const gameId = page.url().split('/').pop();
    return gameId;
  }

  // Helper to monitor game progress
  async function monitorGameProgress(page: Page, config: {
    maxDuration?: number;
    autoMode?: boolean;
    trackPerformance?: boolean;
  } = {}) {
    const {
      maxDuration = 120000, // 2 minutes
      autoMode = true,
      trackPerformance = true
    } = config;

    const startTime = Date.now();
    const metrics = {
      rounds: new Set<number>(),
      phases: new Set<string>(),
      messages: 0,
      apiCalls: 0,
      errors: 0,
      phaseTimings: [] as { phase: string; duration: number }[],
      lastPhaseTime: Date.now()
    };

    // Track API calls if performance monitoring is enabled
    if (trackPerformance) {
      page.on('request', request => {
        if (request.url().includes('groq.com')) {
          metrics.apiCalls++;
        }
      });

      page.on('requestfailed', request => {
        if (request.url().includes('groq.com')) {
          metrics.errors++;
        }
      });
    }

    // Enable auto mode if requested
    if (autoMode) {
      const autoButton = page.locator('button').filter({ hasText: /auto/i });
      if (await autoButton.isVisible({ timeout: 5000 })) {
        await autoButton.click();
        console.log('✅ Auto mode enabled');
      }
    }

    // Monitor game progress
    while ((Date.now() - startTime) < maxDuration) {
      try {
        // Check for game over
        if (await page.locator('text=Game Over').isVisible({ timeout: 1000 })) {
          console.log('🏁 Game completed!');
          break;
        }

        // Track rounds
        const roundElement = page.locator('text=/Round \\d+/').first();
        if (await roundElement.isVisible({ timeout: 1000 })) {
          const roundText = await roundElement.textContent();
          const roundMatch = roundText?.match(/Round (\d+)/);
          if (roundMatch) {
            const round = parseInt(roundMatch[1]);
            metrics.rounds.add(round);
          }
        }

        // Track phases
        const phaseElements = await page.locator('text=/Phase:|Day|Night/').all();
        for (const element of phaseElements) {
          const text = await element.textContent();
          if (text) {
            metrics.phases.add(text);
            
            // Track phase timing
            if (trackPerformance && metrics.phases.size > 1) {
              const phaseDuration = Date.now() - metrics.lastPhaseTime;
              metrics.phaseTimings.push({ phase: text, duration: phaseDuration });
              metrics.lastPhaseTime = Date.now();
            }
          }
        }

        // Count messages
        const messageCount = await page.locator('[data-testid="message-bubble"], .message-bubble').count();
        if (messageCount > metrics.messages) {
          metrics.messages = messageCount;
        }

        await page.waitForTimeout(2000);
        
      } catch (error) {
        // Continue monitoring
      }
    }

    const totalDuration = Date.now() - startTime;
    
    return {
      success: metrics.rounds.size > 0,
      rounds: Array.from(metrics.rounds).sort(),
      phases: Array.from(metrics.phases),
      messages: metrics.messages,
      apiCalls: metrics.apiCalls,
      errors: metrics.errors,
      duration: totalDuration,
      phaseTimings: metrics.phaseTimings
    };
  }

  test('should complete a full game with Groq AI players', async ({ page }) => {
    console.log('🎮 Starting Groq full gameplay test...');
    
    const gameId = await createGroqGame(page, {
      playerCount: 5,
      model: 'llama-3.1-8b-instant' // Fast model for testing
    });
    
    expect(gameId).toBeTruthy();
    console.log(`✅ Game created: ${gameId}`);

    // Wait for character generation
    await expect(page.locator('text=Creating Characters')).toBeVisible({ timeout: 10000 });
    console.log('🎭 Character generation started...');

    // Wait for game to start
    await page.waitForSelector('[data-testid="game-sidebar"], .game-sidebar, text=Round', { timeout: 60000 });
    console.log('🎯 Game started successfully!');

    // Monitor game progress
    const result = await monitorGameProgress(page, {
      maxDuration: 120000,
      autoMode: true,
      trackPerformance: true
    });

    // Verify game completed successfully
    expect(result.success).toBe(true);
    expect(result.rounds.length).toBeGreaterThan(0);
    expect(result.phases.length).toBeGreaterThan(1);
    
    console.log(`📊 Game Statistics:`);
    console.log(`  - Rounds played: ${result.rounds.length} (${result.rounds.join(', ')})`);
    console.log(`  - Phases seen: ${result.phases.length}`);
    console.log(`  - Messages: ${result.messages}`);
    console.log(`  - API calls: ${result.apiCalls}`);
    console.log(`  - Errors: ${result.errors}`);
    console.log(`  - Duration: ${(result.duration / 1000).toFixed(1)}s`);
    
    // Performance analysis
    if (result.phaseTimings.length > 0) {
      console.log(`\n⏱️  Phase Performance:`);
      const avgTiming = result.phaseTimings.reduce((sum, t) => sum + t.duration, 0) / result.phaseTimings.length;
      console.log(`  - Average phase duration: ${(avgTiming / 1000).toFixed(1)}s`);
    }

    // Verify no errors occurred
    expect(result.errors).toBe(0);
    
    // Take a screenshot of the final state
    await page.screenshot({ path: `test-results/groq-game-complete-${gameId}.png` });
  });

  test('should handle different Groq models for Town vs Mafia', async ({ page }) => {
    console.log('🎮 Testing multi-model Groq game...');
    
    const gameId = await createGroqGame(page, {
      playerCount: 6,
      model: 'llama-3.1-8b-instant', // Fast model for Town
      useSeparateMafiaModel: true,
      mafiaModel: 'gemma2-9b-it' // Different model for Mafia
    });
    
    expect(gameId).toBeTruthy();
    console.log(`✅ Multi-model game created: ${gameId}`);

    // Wait for game to start
    await page.waitForSelector('[data-testid="game-sidebar"], .game-sidebar', { timeout: 60000 });

    // Monitor for a few rounds to ensure both teams are functioning
    const result = await monitorGameProgress(page, {
      maxDuration: 60000, // 1 minute
      autoMode: true
    });

    expect(result.success).toBe(true);
    expect(result.rounds.length).toBeGreaterThan(0);
    
    console.log(`✅ Multi-model game working correctly`);
    console.log(`  - Town model: llama-3.1-8b-instant`);
    console.log(`  - Mafia model: gemma2-9b-it`);
    console.log(`  - Rounds completed: ${result.rounds.length}`);
  });

  test('should complete game with mixed human and Groq AI players', async ({ page }) => {
    console.log('🎮 Testing mixed human/AI Groq game...');
    
    const gameId = await createGroqGame(page, {
      playerCount: 5,
      model: 'llama-3.1-8b-instant',
      includeHuman: true
    });
    
    expect(gameId).toBeTruthy();
    console.log(`✅ Mixed game created: ${gameId}`);

    // Wait for game to start
    await page.waitForSelector('[data-testid="game-sidebar"], .game-sidebar', { timeout: 60000 });

    // Verify human input is available
    const humanInput = page.locator('textarea, input[type="text"]').filter({ hasText: /message|action/i });
    await expect(humanInput.first()).toBeVisible({ timeout: 10000 });
    
    console.log('✅ Human player interface available');

    // Submit a test message as human
    await humanInput.first().fill('Hello, I am the human player!');
    const submitButton = page.locator('button').filter({ hasText: /submit|send/i });
    await submitButton.first().click();

    // Monitor for a few rounds
    const result = await monitorGameProgress(page, {
      maxDuration: 30000,
      autoMode: false // Don't use auto mode with human player
    });

    expect(result.messages).toBeGreaterThan(0);
    console.log(`✅ Mixed game functioning with ${result.messages} messages`);
  });

  test('should measure Groq performance across different models', async ({ page }) => {
    console.log('📊 Starting Groq performance benchmark...');
    
    const models = [
      { name: 'llama-3.1-8b-instant', description: 'Fastest' },
      { name: 'gemma2-9b-it', description: 'Balanced' },
      { name: 'mixtral-8x7b-32768', description: 'High quality' }
    ];
    
    const results = [];
    
    for (const model of models) {
      console.log(`\n🧪 Testing ${model.name} (${model.description})...`);
      
      try {
        const startTime = Date.now();
        
        const gameId = await createGroqGame(page, {
          playerCount: 5,
          model: model.name
        });
        
        // Wait for character generation
        await page.waitForSelector('[data-testid="game-sidebar"], .game-sidebar, text=Round', { timeout: 60000 });
        
        // Monitor for 3 rounds
        const gameResult = await monitorGameProgress(page, {
          maxDuration: 60000,
          autoMode: true,
          trackPerformance: true
        });
        
        const totalTime = Date.now() - startTime;
        
        results.push({
          model: model.name,
          description: model.description,
          gameCreationTime: totalTime,
          rounds: gameResult.rounds.length,
          apiCalls: gameResult.apiCalls,
          avgPhaseTime: gameResult.phaseTimings.length > 0 
            ? gameResult.phaseTimings.reduce((sum, t) => sum + t.duration, 0) / gameResult.phaseTimings.length 
            : 0
        });
        
        console.log(`  ✅ Completed - ${gameResult.rounds.length} rounds in ${(totalTime / 1000).toFixed(1)}s`);
        
        // Navigate back to home for next test
        await page.goto('/en');
        
      } catch (error) {
        console.log(`  ❌ Failed: ${error}`);
        results.push({
          model: model.name,
          description: model.description,
          error: true
        });
      }
    }
    
    // Performance summary
    console.log('\n📈 Performance Summary:');
    console.log('Model | Description | Time | Rounds | API Calls | Avg Phase Time');
    console.log('------|-------------|------|--------|-----------|---------------');
    
    results.forEach(r => {
      if ('error' in r && r.error) {
        console.log(`${r.model} | ${r.description} | ERROR | - | - | -`);
      } else {
        console.log(
          `${r.model} | ${r.description} | ${((r as any).gameCreationTime / 1000).toFixed(1)}s | ${(r as any).rounds} | ${(r as any).apiCalls} | ${((r as any).avgPhaseTime / 1000).toFixed(1)}s`
        );
      }
    });
  });

  test('should handle Groq API errors gracefully', async ({ page }) => {
    console.log('🔧 Testing Groq error handling...');
    
    // Intercept Groq API calls and simulate errors
    await page.route('**/api.groq.com/**', async route => {
      const url = route.request().url();
      
      // Simulate intermittent failures
      if (Math.random() < 0.3) { // 30% failure rate
        await route.abort('failed');
      } else {
        await route.continue();
      }
    });
    
    const gameId = await createGroqGame(page, {
      playerCount: 5,
      model: 'llama-3.1-8b-instant'
    });
    
    expect(gameId).toBeTruthy();
    
    // Game should still function despite some API failures
    await page.waitForSelector('[data-testid="game-sidebar"], .game-sidebar', { timeout: 60000 });
    
    // Monitor progress
    const result = await monitorGameProgress(page, {
      maxDuration: 30000,
      autoMode: true
    });
    
    // Game should handle errors and continue
    expect(result.success).toBe(true);
    console.log(`✅ Game handled ${result.errors} API errors gracefully`);
  });
});

// Groq-specific character generation test
test.describe('Groq Character Generation', () => {
  test('should generate diverse characters with Groq', async ({ page }) => {
    console.log('🎭 Testing Groq character generation...');
    
    await page.goto('/en/new');
    await page.waitForSelector('#global-provider-provider');
    
    // Select Groq
    const providerSelect = page.locator('#global-provider-provider');
    await providerSelect.click();
    await page.getByRole('option', { name: 'Groq' }).click();
    
    // Use Gemma for character generation (good at creative tasks)
    const modelSelect = page.locator('#global-provider-model');
    await modelSelect.click();
    await page.getByRole('option', { name: /gemma2-9b-it/ }).click();
    
    // Start game
    const startButton = page.locator('button').filter({ hasText: /Generate.*Start.*Game/i });
    await startButton.click();
    
    // Wait for character generation
    await expect(page.locator('text=Creating Characters')).toBeVisible({ timeout: 10000 });
    
    // Track character generation progress
    const characters = new Set<string>();
    const startTime = Date.now();
    
    while ((Date.now() - startTime) < 60000) { // 1 minute max
      const characterElements = await page.locator('[data-testid*="character-"], .character-name').all();
      
      for (const element of characterElements) {
        const name = await element.textContent();
        if (name && name.trim()) {
          characters.add(name.trim());
        }
      }
      
      if (characters.size >= 5) {
        break;
      }
      
      await page.waitForTimeout(1000);
    }
    
    console.log(`✅ Generated ${characters.size} unique characters:`);
    characters.forEach(name => console.log(`  - ${name}`));
    
    expect(characters.size).toBeGreaterThanOrEqual(5);
  });
}); 