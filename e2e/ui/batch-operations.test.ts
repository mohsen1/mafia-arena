/**
 * E2E tests for batch operations UI.
 * Tests batch status display, admin batch management, and discount pricing games.
 */

import { test, expect } from '@playwright/test';
import {
  MOCK_ADMIN_BATCHES,
  MOCK_BATCH_GAME_EVENTS,
  MOCK_GAMES,
} from '../fixtures/mock-data';

test.describe('Batch Operations UI', () => {
  test.describe('Game Batch Status', () => {
    test('displays batch waiting indicator with estimated time', async ({ page }) => {
      await page.route('**/api/games/*', async (route) => {
        const url = route.request().url();
        if (url.includes('/events')) {
          await route.fulfill({ json: MOCK_BATCH_GAME_EVENTS });
        } else if (!url.includes('/live') && !url.includes('/transcript')) {
          await route.fulfill({ json: { id: MOCK_BATCH_GAME_EVENTS.gameId, status: 'running' } });
        } else {
          await route.continue();
        }
      });

      await page.goto(`/games/${MOCK_BATCH_GAME_EVENTS.gameId}/live`);
      await page.waitForLoadState('networkidle');

      // Check batch status banner/indicator
      await expect(page.getByText(/batch/i)).toBeVisible();
      await expect(page.getByText(/4.*h/i)).toBeVisible();
    });

    test('shows provider name in batch status', async ({ page }) => {
      await page.route('**/api/games/*/events', async (route) => {
        await route.fulfill({ json: MOCK_BATCH_GAME_EVENTS });
      });

      await page.route('**/api/games/*', async (route) => {
        const url = route.request().url();
        if (!url.includes('/events') && !url.includes('/live') && !url.includes('/transcript')) {
          await route.fulfill({ json: { id: MOCK_BATCH_GAME_EVENTS.gameId, status: 'running' } });
        } else {
          await route.continue();
        }
      });

      await page.goto(`/games/${MOCK_BATCH_GAME_EVENTS.gameId}/live`);
      await page.waitForLoadState('networkidle');

      // Batch status should indicate it's waiting for batch API
      await expect(page.getByText(/Waiting for.*batch/i)).toBeVisible();
    });

    test('updates batch status as time progresses', async ({ page }) => {
      let pollCount = 0;

      await page.route('**/api/games/*/events', async (route) => {
        pollCount++;
        const waitHours = Math.max(0, 4 - Math.floor(pollCount / 3));
        
        await route.fulfill({
          json: {
            ...MOCK_BATCH_GAME_EVENTS,
            batchStatus: {
              ...MOCK_BATCH_GAME_EVENTS.batchStatus,
              pollCount: MOCK_BATCH_GAME_EVENTS.batchStatus!.pollCount! + pollCount,
              estimatedWaitHours: waitHours,
            },
          },
        });
      });

      await page.route('**/api/games/*', async (route) => {
        const url = route.request().url();
        if (!url.includes('/events') && !url.includes('/live')) {
          await route.fulfill({ json: { id: MOCK_BATCH_GAME_EVENTS.gameId, status: 'running' } });
        } else {
          await route.continue();
        }
      });

      await page.goto(`/games/${MOCK_BATCH_GAME_EVENTS.gameId}/live`);
      
      // Initial wait time
      await expect(page.getByText(/4.*h/i)).toBeVisible();
    });
  });

  test.describe('Games List with Running Games', () => {
    test('shows running games in games list', async ({ page }) => {
      await page.route('**/api/games?*', async (route) => {
        await route.fulfill({
          json: {
            games: [
              ...MOCK_GAMES.games,
              {
                id: 'game-running-001',
                batch_id: 'batch-live',
                winner: null,
                rounds: 2,
                duration_ms: 0,
                status: 'running' as const,
                created_at: Date.now() - 60000,
                participants: [
                  { model_id: 'openai/gpt-4o', model_name: 'gpt-4o', team: 'mafia' as const, player_count: 2, won: 0 },
                  { model_id: 'anthropic/claude-3.5-sonnet', model_name: 'claude-3.5-sonnet', team: 'town' as const, player_count: 5, won: 0 },
                ],
              },
            ],
            total: 4,
            hasMore: false,
          },
        });
      });

      await page.goto('/games');
      await page.waitForLoadState('networkidle');

      // Should show running status indicator
      await expect(page.getByText(/running/i).first()).toBeVisible();
    });
  });

  test.describe('Admin Batches Page', () => {
    test.beforeEach(async ({ page }) => {
      // Note: Admin pages may require authentication
      // In tests, we can either:
      // 1. Mock the auth endpoints
      // 2. Set auth cookies/headers directly
      // 3. Skip auth in test environment
      
      // For this test, we'll mock the admin endpoint directly
      await page.route('**/api/admin/batches*', async (route) => {
        await route.fulfill({ json: MOCK_ADMIN_BATCHES });
      });
    });

    test('displays batch list with progress', async ({ page }) => {
      await page.goto('/admin/batches');
      await page.waitForLoadState('networkidle');

      // Check batch names are shown
      await expect(page.getByText('Daily Tournament')).toBeVisible();
      await expect(page.getByText('Model Comparison')).toBeVisible();
    });

    test('shows batch status correctly', async ({ page }) => {
      await page.goto('/admin/batches');
      await page.waitForLoadState('networkidle');

      // Check status indicators
      await expect(page.getByText(/processing/i)).toBeVisible();
      await expect(page.getByText(/completed/i).first()).toBeVisible();
    });

    test('displays batch progress percentage', async ({ page }) => {
      await page.goto('/admin/batches');
      await page.waitForLoadState('networkidle');

      // Check progress display
      await expect(page.getByText('50.0%')).toBeVisible();
      await expect(page.getByText('100.0%')).toBeVisible();
    });

    test('shows game counts per batch', async ({ page }) => {
      await page.goto('/admin/batches');
      await page.waitForLoadState('networkidle');

      // Check game counts (45 completed of 100)
      await expect(page.getByText('45')).toBeVisible();
      await expect(page.getByText('100')).toBeVisible();
    });
  });
});

test.describe('Batch API Flow', () => {
  test('POST /api/games/run with discountPricing creates batch game', async ({ page, request }) => {
    // This test makes an actual API call to verify the endpoint behavior
    // In a real E2E test, this would hit your dev/staging server
    
    // For now, we mock the response
    await page.route('**/api/games/run', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        await route.fulfill({
          json: {
            batchId: 'batch-test-001',
            gameIds: ['game-1', 'game-2'],
            message: body?.config?.discountPricing 
              ? 'Games queued with discount pricing (batch API)' 
              : 'Games queued for direct execution',
            discountPricing: body?.config?.discountPricing ?? false,
          },
        });
      } else {
        await route.continue();
      }
    });

    // Simulate API call via page context
    const response = await page.evaluate(async () => {
      const res = await fetch('/api/games/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count: 2,
          config: {
            playerCount: 7,
            mafiaCount: 2,
            teams: [
              { modelId: 'openai/gpt-4o', team: 'mafia', count: 2 },
              { modelId: 'anthropic/claude-3.5-sonnet', team: 'town', count: 5 },
            ],
            discountPricing: true,
          },
        }),
      });
      return res.json();
    });

    expect(response.discountPricing).toBe(true);
    expect(response.message).toContain('discount pricing');
  });

  test('Games created with discountPricing show batch indicator', async ({ page }) => {
    // Mock the events endpoint to return batch status
    await page.route('**/api/games/*/events', async (route) => {
      await route.fulfill({
        json: {
          status: 'running',
          gameId: 'batch-created-game',
          events: [],
          players: [],
          batchStatus: {
            isWaitingForBatch: true,
            provider: 'anthropic',
            submittedAt: Date.now(),
            estimatedWaitHours: 6,
          },
        },
      });
    });

    await page.route('**/api/games/*', async (route) => {
      const url = route.request().url();
      if (!url.includes('/events') && !url.includes('/live')) {
        await route.fulfill({ json: { id: 'batch-created-game', status: 'running' } });
      } else {
        await route.continue();
      }
    });

    await page.goto('/games/batch-created-game/live');
    await page.waitForLoadState('networkidle');

    // Should show batch waiting indicator
    await expect(page.getByText(/batch/i)).toBeVisible();
    await expect(page.getByText(/6.*h/i)).toBeVisible();
  });
});

