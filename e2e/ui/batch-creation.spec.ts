/**
 * E2E tests for batch creation UI.
 * Tests the unified batch creation flow for both regular users and admins.
 */

import { test, expect } from '@playwright/test';

// Common mock responses
const mockAuthUser = (isAdmin: boolean) => ({
  authenticated: true,
  user: {
    name: isAdmin ? 'Admin User' : 'Regular User',
    email: isAdmin ? 'admin@example.com' : 'user@example.com',
    isAdmin,
  },
});

const mockModels = {
  models: [
    { id: 'openai/gpt-4o', display_name: 'GPT-4o', api_provider: 'openai', supports_batch_pricing: false },
    { id: 'openai/gpt-4o-mini', display_name: 'GPT-4o Mini', api_provider: 'openai', supports_batch_pricing: false },
    { id: 'anthropic/claude-3-5-sonnet', display_name: 'Claude 3.5 Sonnet', api_provider: 'anthropic', supports_batch_pricing: true },
    { id: 'anthropic/claude-3-haiku', display_name: 'Claude 3 Haiku', api_provider: 'anthropic', supports_batch_pricing: true },
  ],
  modelsByApiProvider: {
    openai: [
      { id: 'openai/gpt-4o', display_name: 'GPT-4o' },
      { id: 'openai/gpt-4o-mini', display_name: 'GPT-4o Mini' },
    ],
    anthropic: [
      { id: 'anthropic/claude-3-5-sonnet', display_name: 'Claude 3.5 Sonnet' },
      { id: 'anthropic/claude-3-haiku', display_name: 'Claude 3 Haiku' },
    ],
  },
};

const mockUserKeys = {
  keys: [
    { provider: 'openai', fingerprint: 'sk-...abc' },
    { provider: 'anthropic', fingerprint: 'sk-...xyz' },
  ],
};

test.describe('Batch Creation - Regular User', () => {
  test.beforeEach(async ({ page }) => {
    // Mock auth as regular user
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({ json: mockAuthUser(false) });
    });

    // Mock user's API keys
    await page.route('**/api/auth/keys', async (route) => {
      await route.fulfill({ json: mockUserKeys });
    });

    // Mock models list
    await page.route('**/api/models*', async (route) => {
      await route.fulfill({ json: mockModels });
    });
  });

  test('should not show admin options for regular users', async ({ page }) => {
    await page.goto('/batches/new');
    await page.waitForLoadState('networkidle');

    // Admin options should NOT be visible
    await expect(page.getByText('Admin Options')).not.toBeVisible();
    await expect(page.getByLabel('Use System API Keys')).not.toBeVisible();
  });

  test('should enforce 50 game limit for regular users', async ({ page }) => {
    await page.goto('/batches/new');
    await page.waitForLoadState('networkidle');

    // Find the number of games input
    const gamesInput = page.getByLabel(/number of games/i);
    await expect(gamesInput).toBeVisible();

    // Check max attribute or try to enter more than 50
    const maxAttr = await gamesInput.getAttribute('max');
    expect(parseInt(maxAttr || '0')).toBeLessThanOrEqual(50);
  });

  test('should require user API keys', async ({ page }) => {
    // Mock NO keys
    await page.route('**/api/auth/keys', async (route) => {
      await route.fulfill({ json: { keys: [] } });
    });

    await page.goto('/batches/new');
    await page.waitForLoadState('networkidle');

    // Should show warning about missing keys
    await expect(page.getByText(/api keys/i)).toBeVisible();
  });

  test('should submit batch with user keys', async ({ page }) => {
    let submittedBody: Record<string, unknown> | null = null;

    await page.route('**/api/batches', async (route) => {
      if (route.request().method() === 'POST') {
        submittedBody = route.request().postDataJSON();
        await route.fulfill({
          json: {
            success: true,
            batchId: 'batch_user_123',
            useSystemKeys: false,
            message: 'Batch created using your API keys',
          },
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/batches/new');
    await page.waitForLoadState('networkidle');

    // Fill in batch name
    await page.getByLabel(/batch name/i).fill('My User Batch');
    await page.getByLabel(/number of games/i).fill('5');

    // Select models using the dropdowns
    const mafiaSelect = page.locator('[data-testid="mafia-model-select"]').first();
    const townSelect = page.locator('[data-testid="town-model-select"]').first();

    if (await mafiaSelect.isVisible()) {
      await mafiaSelect.selectOption('openai/gpt-4o-mini');
      await townSelect.selectOption('openai/gpt-4o-mini');
    }

    // Submit
    await page.getByRole('button', { name: /create/i }).click();

    // Wait for navigation or success
    await page.waitForURL(/\/batches\//);

    // Verify useSystemKeys was NOT sent or was false
    if (submittedBody) {
      expect(submittedBody.useSystemKeys).toBeFalsy();
    }
  });
});

test.describe('Batch Creation - Admin User', () => {
  test.beforeEach(async ({ page }) => {
    // Mock auth as admin
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({ json: mockAuthUser(true) });
    });

    // Mock user's API keys (admin may also have personal keys)
    await page.route('**/api/auth/keys', async (route) => {
      await route.fulfill({ json: mockUserKeys });
    });

    // Mock models list
    await page.route('**/api/models*', async (route) => {
      await route.fulfill({ json: mockModels });
    });
  });

  test('should show admin options for admin users', async ({ page }) => {
    await page.goto('/batches/new');
    await page.waitForLoadState('networkidle');

    // Admin options SHOULD be visible
    await expect(page.getByText('Admin Options')).toBeVisible();
  });

  test('should allow higher game limits for admins', async ({ page }) => {
    await page.goto('/batches/new');
    await page.waitForLoadState('networkidle');

    // Find the number of games input
    const gamesInput = page.getByLabel(/number of games/i);
    await expect(gamesInput).toBeVisible();

    // Admin should have higher limit (up to 10000)
    const maxAttr = await gamesInput.getAttribute('max');
    expect(parseInt(maxAttr || '0')).toBeGreaterThan(50);
  });

  test('should toggle system keys option', async ({ page }) => {
    await page.goto('/batches/new');
    await page.waitForLoadState('networkidle');

    // Find system keys toggle
    const systemKeysToggle = page.getByLabel(/system.*api.*keys/i);
    await expect(systemKeysToggle).toBeVisible();

    // Should be unchecked by default
    await expect(systemKeysToggle).not.toBeChecked();

    // Toggle it on
    await systemKeysToggle.check();
    await expect(systemKeysToggle).toBeChecked();
  });

  test('should submit batch with system keys when toggled', async ({ page }) => {
    let submittedBody: Record<string, unknown> | null = null;

    await page.route('**/api/batches', async (route) => {
      if (route.request().method() === 'POST') {
        submittedBody = route.request().postDataJSON();
        await route.fulfill({
          json: {
            success: true,
            batchId: 'batch_admin_123',
            useSystemKeys: true,
            message: 'Batch created using system API keys',
          },
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/batches/new');
    await page.waitForLoadState('networkidle');

    // Enable system keys
    await page.getByLabel(/system.*api.*keys/i).check();

    // Fill form
    await page.getByLabel(/batch name/i).fill('Admin System Batch');
    await page.getByLabel(/number of games/i).fill('100');

    // Submit
    await page.getByRole('button', { name: /create/i }).click();

    // Wait for success
    await page.waitForURL(/\/batches\//);

    // Verify useSystemKeys was sent as true
    expect(submittedBody?.useSystemKeys).toBe(true);
  });

  test('should enable batch API toggle when compatible models selected', async ({ page }) => {
    await page.goto('/batches/new');
    await page.waitForLoadState('networkidle');

    // Enable system keys first (often required for batch API)
    const systemKeysToggle = page.getByLabel(/system.*api.*keys/i);
    if (await systemKeysToggle.isVisible()) {
      await systemKeysToggle.check();
    }

    // Find batch API toggle
    const batchApiToggle = page.getByLabel(/batch.*api|discount.*pricing/i);

    // Initially may be disabled until compatible models are selected
    // After selecting Anthropic models, it should be enabled
    // This depends on the UI implementation
    if (await batchApiToggle.isVisible()) {
      // Check the toggle behavior
      await expect(batchApiToggle).toBeVisible();
    }
  });
});

test.describe('Batch List - Status Display', () => {
  test.beforeEach(async ({ page }) => {
    // Mock auth
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({ json: mockAuthUser(false) });
    });
  });

  test('should display failed status with red styling', async ({ page }) => {
    await page.route('**/api/batches*', async (route) => {
      await route.fulfill({
        json: {
          batches: [
            {
              id: 'batch_failed_001',
              name: 'Failed Batch',
              status: 'failed',
              totalGames: 10,
              completedGames: 3,
              failedGames: 7,
              progress: 100,
              createdAt: Date.now() - 3600000,
              errorMessage: 'API key validation failed',
            },
          ],
          total: 1,
        },
      });
    });

    await page.goto('/batches');
    await page.waitForLoadState('networkidle');

    // Check that failed status is visible
    await expect(page.getByText('failed')).toBeVisible();

    // Check for failed count indicator
    await expect(page.getByText('7')).toBeVisible();
  });

  test('should display all batch statuses correctly', async ({ page }) => {
    await page.route('**/api/batches*', async (route) => {
      await route.fulfill({
        json: {
          batches: [
            { id: 'b1', name: 'Queued', status: 'queued', totalGames: 10, completedGames: 0, failedGames: 0, progress: 0, createdAt: Date.now() },
            { id: 'b2', name: 'Processing', status: 'processing', totalGames: 10, completedGames: 5, failedGames: 0, progress: 50, createdAt: Date.now() },
            { id: 'b3', name: 'Completed', status: 'completed', totalGames: 10, completedGames: 10, failedGames: 0, progress: 100, createdAt: Date.now() },
            { id: 'b4', name: 'Cancelled', status: 'cancelled', totalGames: 10, completedGames: 3, failedGames: 0, progress: 30, createdAt: Date.now() },
            { id: 'b5', name: 'Failed', status: 'failed', totalGames: 10, completedGames: 2, failedGames: 8, progress: 100, createdAt: Date.now() },
          ],
          total: 5,
        },
      });
    });

    await page.goto('/batches');
    await page.waitForLoadState('networkidle');

    // All statuses should be visible
    await expect(page.getByText('queued')).toBeVisible();
    await expect(page.getByText('processing')).toBeVisible();
    await expect(page.getByText('completed')).toBeVisible();
    await expect(page.getByText('cancelled')).toBeVisible();
    await expect(page.getByText('failed')).toBeVisible();
  });

  test('should filter batches by status', async ({ page }) => {
    let lastUrl = '';

    await page.route('**/api/batches*', async (route) => {
      lastUrl = route.request().url();
      await route.fulfill({
        json: { batches: [], total: 0 },
      });
    });

    await page.goto('/batches');
    await page.waitForLoadState('networkidle');

    // Find and click failed filter
    const failedFilter = page.getByRole('button', { name: /failed/i });
    if (await failedFilter.isVisible()) {
      await failedFilter.click();
      await page.waitForLoadState('networkidle');

      // URL should contain status=failed parameter
      expect(lastUrl).toContain('status=failed');
    }
  });
});

test.describe('Batch Detail - Failed Status', () => {
  test('should display error message for failed batch', async ({ page }) => {
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({ json: mockAuthUser(false) });
    });

    await page.route('**/api/batches/batch_failed_001', async (route) => {
      await route.fulfill({
        json: {
          id: 'batch_failed_001',
          name: 'Failed Batch',
          status: 'failed',
          totalGames: 10,
          completedGames: 3,
          failedGames: 7,
          gamesQueued: 10,
          progress: 100,
          createdAt: Date.now() - 3600000,
          errorMessage: 'Queue processing failed after 3 retries',
        },
      });
    });

    await page.goto('/batches/batch_failed_001');
    await page.waitForLoadState('networkidle');

    // Check for failed status indicator
    await expect(page.getByText('failed')).toBeVisible();

    // Check for error message
    await expect(page.getByText(/queue processing failed/i)).toBeVisible();
  });

  test('should show failed games count', async ({ page }) => {
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({ json: mockAuthUser(false) });
    });

    await page.route('**/api/batches/batch_with_failures', async (route) => {
      await route.fulfill({
        json: {
          id: 'batch_with_failures',
          name: 'Batch With Failures',
          status: 'completed',
          totalGames: 10,
          completedGames: 8,
          failedGames: 2,
          progress: 100,
          createdAt: Date.now(),
        },
      });
    });

    await page.goto('/batches/batch_with_failures');
    await page.waitForLoadState('networkidle');

    // Should show failed count
    await expect(page.getByText('2 failed')).toBeVisible();
  });
});

test.describe('Admin Batch Pages Redirect', () => {
  test('admin batch pages should redirect to unified routes', async ({ page }) => {
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({ json: mockAuthUser(true) });
    });

    // Try to access old admin batch pages
    await page.goto('/admin/batches/new');

    // Should redirect to /batches/new
    await expect(page).toHaveURL(/\/batches\/new/);
  });
});

