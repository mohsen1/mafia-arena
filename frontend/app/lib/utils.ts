import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Get the API URL based on environment.
 * - Uses VITE_API_URL env var if set
 * - Falls back to https://api.mafia-arena.com in production
 * - Falls back to http://localhost:8787 in development
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
      return 'http://localhost:8787';
    }
    // Production - use custom domain
    return 'https://api.mafia-arena.com';
  }
  
  // Server-side - check if we're in production
  if (typeof import.meta.env !== 'undefined' && import.meta.env.DEV) {
    return 'http://localhost:8787';
  }
  
  // Production fallback
  return 'https://api.mafia-arena.com';
}
