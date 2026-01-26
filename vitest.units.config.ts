/**
 * Vitest configuration for Worker unit tests.
 * Tests individual functions and components in isolation.
 *
 * Run with: npx vitest run --config vitest.units.config.ts
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/worker/middleware/**/*.test.ts',
      'src/worker/ai/**/*.test.ts',
      'src/worker/utils/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', '**/__tests__/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'src/worker/middleware/**/*.ts',
        'src/worker/ai/**/*.ts',
        'src/worker/utils/**/*.ts',
      ],
      exclude: ['**/*.test.ts', '**/__tests__/**'],
    },
  },
});
