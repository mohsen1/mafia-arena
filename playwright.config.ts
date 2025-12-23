import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Mafia Arena UI E2E tests.
 *
 * Uses network interception to mock API responses - no real LLM calls.
 * Always runs headless for CI/CD compatibility.
 */
export default defineConfig({
  testDir: './e2e/ui',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: 'http://localhost:4321',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    headless: true, // Always headless
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
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

