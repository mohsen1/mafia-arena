/**
 * E2E tests for game progress tracking UI.
 * Tests the new progress bar, waiting indicator, and pending players display.
 */

import { test, expect } from '@playwright/test';
import {
  MOCK_RUNNING_GAME_EVENTS,
  MOCK_BATCH_GAME_EVENTS,
  MOCK_FAILED_GAME_TIMEOUT,
  MOCK_PROGRESS_COMPLETE,
  MOCK_GAME_DETAIL,
} from '../fixtures/mock-data';

test.describe('Game Progress UI', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the initial game detail endpoint
    await page.route('**/api/games/*', async (route) => {
      const url = route.request().url();
      // Skip events and transcript endpoints - handle them separately
      if (url.includes('/events') || url.includes('/transcript') || url.includes('/live')) {
        return route.continue();
      }
      await route.fulfill({ json: { ...MOCK_GAME_DETAIL, status: 'running', winner: null } });
    });
  });

  test('displays progress bar and waiting indicator for running game', async ({ page }) => {
    // Mock the events endpoint with progress data
    await page.route('**/api/games/*/events', async (route) => {
      await route.fulfill({ json: MOCK_RUNNING_GAME_EVENTS });
    });

    await page.goto(`/games/${MOCK_RUNNING_GAME_EVENTS.gameId}/live`);

    // Wait for the page to load
    await page.waitForLoadState('networkidle');

    // Check progress bar exists (look for the progress container)
    const progressBar = page.locator('[class*="h-1.5"][class*="rounded-full"]').first();
    await expect(progressBar).toBeVisible();

    // Check progress count is displayed (1/3)
    await expect(page.getByText('1/3')).toBeVisible();

    // Check waiting indicator shows the pending player
    await expect(page.getByText('Waiting for')).toBeVisible();
    await expect(page.getByText('Bob')).toBeVisible();
  });

  test('displays pending players list', async ({ page }) => {
    await page.route('**/api/games/*/events', async (route) => {
      await route.fulfill({ json: MOCK_RUNNING_GAME_EVENTS });
    });

    await page.goto(`/games/${MOCK_RUNNING_GAME_EVENTS.gameId}/live`);
    await page.waitForLoadState('networkidle');

    // Check pending players are shown (Bob and Charlie)
    // The UI shows "Pending: Bob, Charlie" or similar
    await expect(page.getByText(/Pending.*Bob/i)).toBeVisible();
  });

  test('shows "All actions complete" when progress is done', async ({ page }) => {
    await page.route('**/api/games/*/events', async (route) => {
      await route.fulfill({ json: MOCK_PROGRESS_COMPLETE });
    });

    await page.goto(`/games/${MOCK_PROGRESS_COMPLETE.gameId}/live`);
    await page.waitForLoadState('networkidle');

    // Check that all actions complete label is shown
    await expect(page.getByText('2/2')).toBeVisible();
    
    // Waiting for indicator should not be visible when done
    await expect(page.getByText('Waiting for').first()).not.toBeVisible();
  });

  test('displays batch status for discount pricing games', async ({ page }) => {
    await page.route('**/api/games/*/events', async (route) => {
      await route.fulfill({ json: MOCK_BATCH_GAME_EVENTS });
    });

    await page.goto(`/games/${MOCK_BATCH_GAME_EVENTS.gameId}/live`);
    await page.waitForLoadState('networkidle');

    // Check batch waiting indicator is shown
    await expect(page.getByText(/Waiting for.*batch/i)).toBeVisible();
    
    // Check estimated wait time is shown
    await expect(page.getByText(/4.*h/i)).toBeVisible();
  });

  test('displays user-friendly timeout error message', async ({ page }) => {
    await page.route('**/api/games/*/events', async (route) => {
      await route.fulfill({ json: MOCK_FAILED_GAME_TIMEOUT });
    });

    await page.goto(`/games/${MOCK_FAILED_GAME_TIMEOUT.gameId}/live`);
    await page.waitForLoadState('networkidle');

    // Check failed status
    await expect(page.getByText('FAILED')).toBeVisible();
    
    // Check error message contains timeout info
    await expect(page.getByText(/timed out/i)).toBeVisible();
  });

  test('progress updates when polling new data', async ({ page }) => {
    let pollCount = 0;

    await page.route('**/api/games/*/events', async (route) => {
      pollCount++;
      
      if (pollCount <= 2) {
        // First polls: 1 of 3 complete
        await route.fulfill({ json: MOCK_RUNNING_GAME_EVENTS });
      } else {
        // Later polls: 2 of 3 complete
        await route.fulfill({
          json: {
            ...MOCK_RUNNING_GAME_EVENTS,
            progress: {
              current: 2,
              total: 3,
              label: 'Waiting for 1 player',
              pendingPlayers: ['Charlie'],
            },
            waitingFor: {
              playerName: 'Charlie',
              modelId: 'google/gemini-2.5-pro',
              actionType: 'discussion',
            },
          },
        });
      }
    });

    await page.goto(`/games/${MOCK_RUNNING_GAME_EVENTS.gameId}/live`);
    
    // Initial state
    await expect(page.getByText('1/3')).toBeVisible();

    // Wait for polling to update
    await page.waitForTimeout(2000);

    // Updated state
    await expect(page.getByText('2/3')).toBeVisible();
    await expect(page.getByText('Charlie')).toBeVisible();
  });

  test('shows LIVE badge for running games', async ({ page }) => {
    await page.route('**/api/games/*/events', async (route) => {
      await route.fulfill({ json: MOCK_RUNNING_GAME_EVENTS });
    });

    await page.goto(`/games/${MOCK_RUNNING_GAME_EVENTS.gameId}/live`);
    await page.waitForLoadState('networkidle');

    // Check LIVE badge
    await expect(page.getByText('LIVE')).toBeVisible();
  });

  test('displays team information correctly', async ({ page }) => {
    await page.route('**/api/games/*/events', async (route) => {
      await route.fulfill({ json: MOCK_RUNNING_GAME_EVENTS });
    });

    await page.goto(`/games/${MOCK_RUNNING_GAME_EVENTS.gameId}/live`);
    await page.waitForLoadState('networkidle');

    // Check team labels
    await expect(page.getByText('MAFIA')).toBeVisible();
    await expect(page.getByText('TOWN')).toBeVisible();
  });

  test('handles WebSocket connection with polling fallback', async ({ page }) => {
    // Mock the events endpoint
    await page.route('**/api/games/*/events', async (route) => {
      await route.fulfill({ json: MOCK_RUNNING_GAME_EVENTS });
    });

    // Block WebSocket connections to force polling fallback
    await page.route('**/api/games/*/live', async (route) => {
      await route.abort('failed');
    });

    await page.goto(`/games/${MOCK_RUNNING_GAME_EVENTS.gameId}/live`);
    await page.waitForLoadState('networkidle');

    // Game should still show progress via polling
    await expect(page.getByText('1/3')).toBeVisible();
  });
});

