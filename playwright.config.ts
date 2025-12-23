import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Mafia Arena UI E2E tests.
 *
 * For game lifecycle tests (creating games via API), you need:
 * 1. Worker running: pnpm dev (in root)
 * 2. Or set SKIP_WORKER=1 to only run UI structure tests
 *
 * Test models (test/mock-fast, etc.) use MockE2EProvider - no LLM costs.
 * Always runs headless for CI/CD compatibility.
 */

// API URL for game creation tests (worker endpoint)
const WORKER_URL = process.env.WORKER_URL || 'http://localhost:8787';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4321';

export default defineConfig({
  testDir: './e2e/ui',
  // Limit parallelism to avoid overwhelming the local worker with game creation tests
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Limit workers to prevent overwhelming the worker with concurrent game requests
  workers: process.env.CI ? 1 : 3,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: FRONTEND_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    headless: true,
    // Pass API URL to tests
    extraHTTPHeaders: {
      'x-test-mode': 'true',
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Start Astro dev server before running tests
  webServer: {
    command: 'pnpm --dir frontend dev',
    url: FRONTEND_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // Point frontend to local worker for game lifecycle tests
      PUBLIC_API_URL: WORKER_URL,
    },
  },
});

