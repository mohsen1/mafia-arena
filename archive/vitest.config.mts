/// <reference types="vitest" />
import { defineConfig } from 'vite';
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    react(), // Assuming you might have React components to test, keep if needed
    tsconfigPaths(), // Add this plugin
  ],
  test: {
    globals: true, // Optional: Use if you prefer global test functions (describe, it, etc.)
    environment: 'jsdom', // Or 'node' if not testing DOM-related code
    setupFiles: './vitest.setup.ts', // Optional: if you have setup files
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/*.spec.ts', // Exclude Playwright tests
      '**/tests/**/*.spec.ts', // Exclude Playwright tests in tests directory
    ],
    // Add any other Vitest specific options here
    deps: {
      // Ensure server-side dependencies are handled correctly if needed
      // Example: external: ['@/lib/engine/.*'] if engine code uses Node-specific APIs not available in test env
    },
    // Clean test output configuration
    silent: false, // Keep test results visible
    reporters: ['default'], // Use default reporter for clean output
    // Disable console output during tests
    onConsoleLog: () => false, // Suppress all console.log output
    pool: 'forks', // Use separate processes for better isolation
    // Optional: limit concurrent tests for cleaner output
    maxConcurrency: 4,
  },
}); 