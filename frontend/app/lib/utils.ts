import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Get the API URL based on environment.
 * - Uses VITE_API_URL env var if set
 * - Returns empty string in development (client-side) to use relative paths via Vite proxy
 *   This ensures SameSite=Lax cookies are sent (same-origin from browser's perspective)
 * - Falls back to https://api.mafia-arena.com in production
 */
export function getApiUrl(): string {
  // Check for explicit env var first (Vite style)
  if (typeof import.meta.env !== 'undefined' && import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // In browser/client-side, check hostname
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      // Return empty string to use relative paths via Vite proxy
      // This ensures SameSite=Lax cookies work (browser sees same-origin)
      return '';
    }
    // Production - use custom domain
    return 'https://api.mafia-arena.com';
  }
  
  // Server-side (SSR) - must use absolute URL for fetch
  if (typeof import.meta.env !== 'undefined' && import.meta.env.DEV) {
    return 'http://localhost:8787';
  }
  
  // Production fallback
  return 'https://api.mafia-arena.com';
}
