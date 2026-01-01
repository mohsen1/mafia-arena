/**
 * Vitest configuration for Worker E2E tests.
 * Uses @cloudflare/vitest-pool-workers for full Cloudflare emulation.
 *
 * Run with: pnpm test:e2e
 */

import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    globals: true,
    include: ['src/worker/__tests__/**/*.test.ts'],
    // Run tests sequentially to avoid queue consumer conflicts
    fileParallelism: false,
    poolOptions: {
      workers: {
        wrangler: {
          configPath: './wrangler.toml',
        },
        miniflare: {
          // Enable compatibility flags
          compatibilityDate: '2024-12-01',
          compatibilityFlags: ['nodejs_compat'],

          // D1 Database - use in-memory for tests
          d1Databases: {
            DB: 'test-db',
          },

          // R2 Bucket - use in-memory for tests
          r2Buckets: ['TRANSCRIPTS'],

          // KV Namespace - use in-memory for tests
          kvNamespaces: ['RATE_LIMIT'],

          // Durable Objects are automatically configured from wrangler.toml
        },
        // Disable isolated storage for Workflows compatibility
        isolatedStorage: false,
        // Use single worker to avoid queue consumer conflicts
        singleWorker: true,
      },
    },
    // Longer timeout for E2E game tests
    testTimeout: 30000,
  },
});

