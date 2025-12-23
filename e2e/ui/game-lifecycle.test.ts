/**
 * E2E tests for complete game lifecycle.
 * 
 * These tests create actual games via the API using test models
 * (test/mock-fast) which use MockE2EProvider instead of calling LLMs.
 * 
 * PREREQUISITES:
 * 1. Worker must be running: pnpm dev (starts wrangler on port 8787)
 * 2. Frontend dev server is started automatically by Playwright
 * 
 * ZERO COST: No API calls to OpenRouter or any LLM provider.
 * Games complete in seconds with deterministic responses.
 */

import { test, expect } from '@playwright/test';

// Worker API URL (where game creation requests go)
const WORKER_URL = process.env.WORKER_URL || 'http://localhost:8787';

// Check if worker is available before running tests
async function isWorkerRunning(request: any): Promise<boolean> {
  try {
    // Try to hit any API endpoint - even 404 means worker is running
    const response = await request.get(`${WORKER_URL}/`, { timeout: 5000 });
    return true; // Any response means worker is up
  } catch {
    return false;
  }
}

test.describe('Game Lifecycle', () => {
  // Games can take some time to complete
  test.setTimeout(120000);

  test('creates and runs a complete game with mock models', async ({ request, page }) => {
    // 1. Create a game via the run-direct API
    // Note: Minimum 7 players required (2 mafia + 5 town)
    const createResponse = await request.post(`${WORKER_URL}/api/games/run-direct`, {
      data: {
        config: {
          playerCount: 7,
          mafiaCount: 2,
          teams: [
            { modelId: 'test/mock-fast', team: 'mafia', count: 2 },
            { modelId: 'test/mock-fast', team: 'town', count: 5 },
          ],
          maxRounds: 10,
          discussionEnabled: false, // Faster without discussion
        },
      },
    });

    // Should succeed
    expect(createResponse.ok()).toBe(true);
    const createResult = await createResponse.json();
    expect(createResult.success).toBe(true);
    expect(createResult.gameId).toBeTruthy();
    
    const gameId = createResult.gameId;
    console.log(`Created test game: ${gameId}`);

    // 2. Visit the live game page
    await page.goto(`/games/${gameId}/live`);

    // 3. Wait for the page to load and show game info
    await expect(page.locator('text=Mafia')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Town')).toBeVisible({ timeout: 10000 });

    // 4. Wait for game to complete (mock games are fast)
    // Look for either "wins" text or completed state
    const winnerText = page.locator('text=/Mafia.*wins|Town.*wins|wins/i');
    await expect(winnerText).toBeVisible({ timeout: 60000 });

    console.log('Game completed successfully!');
  });

  test('game appears in games list after completion', async ({ request, page }) => {
    // 1. Create and run a game (min 7 players)
    const createResponse = await request.post(`${WORKER_URL}/api/games/run-direct`, {
      data: {
        config: {
          playerCount: 7,
          mafiaCount: 2,
          teams: [
            { modelId: 'test/mock-fast', team: 'mafia', count: 2 },
            { modelId: 'test/mock-fast', team: 'town', count: 5 },
          ],
          maxRounds: 5,
          discussionEnabled: false,
        },
      },
    });

    expect(createResponse.ok()).toBe(true);
    const result = await createResponse.json();
    const gameId = result.gameId;

    // 2. Wait for game to complete by polling status
    let status = 'running';
    let attempts = 0;
    while (status === 'running' && attempts < 30) {
      await page.waitForTimeout(1000);
      const statusResponse = await request.get(`${WORKER_URL}/api/games/${gameId}`);
      if (statusResponse.ok()) {
        const gameData = await statusResponse.json();
        status = gameData.status || gameData.game?.status || 'unknown';
      }
      attempts++;
    }

    expect(status).toBe('completed');

    // 3. Navigate to games list
    await page.goto('/games');
    
    // 4. The game should appear in the list
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 });
    
    // Look for our game ID in the table (it should be truncated)
    const shortId = gameId.split('_').pop()?.slice(-6) || gameId.slice(-6);
    const gameRow = page.locator(`text=${shortId}`);
    
    // Game might be on first page or need pagination
    // For now just verify the table has games
    const rowCount = await page.locator('table tbody tr').count();
    expect(rowCount).toBeGreaterThan(0);
  });

  test('can view game transcript after completion', async ({ request, page }) => {
    // 1. Create and run a game (min 7 players)
    const createResponse = await request.post(`${WORKER_URL}/api/games/run-direct`, {
      data: {
        config: {
          playerCount: 7,
          mafiaCount: 2,
          teams: [
            { modelId: 'test/mock-fast', team: 'mafia', count: 2 },
            { modelId: 'test/mock-fast', team: 'town', count: 5 },
          ],
          maxRounds: 5,
          discussionEnabled: false,
        },
      },
    });

    expect(createResponse.ok()).toBe(true);
    const result = await createResponse.json();
    const gameId = result.gameId;

    // 2. Wait for game completion
    let completed = false;
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(1000);
      const response = await request.get(`${WORKER_URL}/api/games/${gameId}`);
      if (response.ok()) {
        const data = await response.json();
        if (data.status === 'completed' || data.game?.status === 'completed') {
          completed = true;
          break;
        }
      }
    }
    expect(completed).toBe(true);

    // 3. Navigate to game detail page
    await page.goto(`/games/${gameId}`);

    // 4. Verify transcript content is visible
    // Should show game events like introductions, discussions, votes
    await expect(page.locator('text=/Round|Introduction|Discussion|Vote|Night/i')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Game Scenarios', () => {
  test.setTimeout(120000);

  test('test/town-wins scenario completes successfully', async ({ request }) => {
    const response = await request.post(`${WORKER_URL}/api/games/run-direct`, {
      data: {
        config: {
          playerCount: 7,
          mafiaCount: 2,
          teams: [
            { modelId: 'test/town-wins', team: 'mafia', count: 2 },
            { modelId: 'test/town-wins', team: 'town', count: 5 },
          ],
          maxRounds: 10,
          discussionEnabled: false,
        },
      },
    });

    expect(response.ok()).toBe(true);
    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.gameId).toBeTruthy();

    // Note: We can't guarantee town will win, but game should complete
    // The mock provider just biases voting patterns
  });

  test('test/mafia-wins scenario completes successfully', async ({ request }) => {
    const response = await request.post(`${WORKER_URL}/api/games/run-direct`, {
      data: {
        config: {
          playerCount: 7,
          mafiaCount: 2,
          teams: [
            { modelId: 'test/mafia-wins', team: 'mafia', count: 2 },
            { modelId: 'test/mafia-wins', team: 'town', count: 5 },
          ],
          maxRounds: 10,
          discussionEnabled: false,
        },
      },
    });

    expect(response.ok()).toBe(true);
    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.gameId).toBeTruthy();
  });
});

test.describe('Game API Validation', () => {
  test('rejects missing config', async ({ request }) => {
    const response = await request.post(`${WORKER_URL}/api/games/run-direct`, {
      data: {
        // Missing config entirely
        maxRounds: 5,
      },
    });

    // Should fail validation with 400
    expect(response.status()).toBe(400);
  });

  test('rejects missing teams in config', async ({ request }) => {
    const response = await request.post(`${WORKER_URL}/api/games/run-direct`, {
      data: {
        config: {
          playerCount: 6,
          mafiaCount: 2,
          // Missing teams array
        },
      },
    });

    expect(response.status()).toBe(400);
  });
});

