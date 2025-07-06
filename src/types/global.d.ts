/**
 * Global type definitions for the application
 */

import * as Sentry from '@sentry/nextjs';

declare global {
  interface Window {
    Sentry: typeof Sentry;
  }
}

export {};
