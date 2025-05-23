// Vitest setup file (optional)
// You can add global setup logic here, like mocking fetch or setting up environment variables.

import { vi, beforeEach, afterEach } from 'vitest';

// Example: Mocking fetch globally if needed
// global.fetch = vi.fn(); 

// Mock console methods to reduce noise in test output
// Only suppress during tests, keep errors visible for debugging
const originalError = console.error;
const originalWarn = console.warn;

beforeEach(() => {
  // Mock console.warn to suppress warning noise
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  
  // Mock console.error but still log to help with debugging actual test failures
  vi.spyOn(console, 'error').mockImplementation((message, ...args) => {
    // Only show errors that are likely test failures, not expected warnings
    if (typeof message === 'string' && (
      message.includes('Test failed') || 
      message.includes('Error in test') ||
      message.includes('expect') ||
      message.includes('AssertionError')
    )) {
      originalError(message, ...args);
    }
  });
});

afterEach(() => {
  // Restore console methods after each test
  vi.restoreAllMocks();
}); 