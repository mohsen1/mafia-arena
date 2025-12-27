import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Get the API URL based on environment.
 * - Uses PUBLIC_API_URL env var if set
 * - Falls back to https://api.mafia-arena.com in production
 * - Falls back to http://localhost:8787 in development
 */
export function getApiUrl(): string {
  // Check for explicit env var first
  if (import.meta.env.PUBLIC_API_URL) {
    return import.meta.env.PUBLIC_API_URL;
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
  
  // Server-side (Astro) - check if we're in production
  // In production, Astro runs on Cloudflare Pages, so we use the production API
  // In dev, Astro runs locally, so we use localhost
  if (import.meta.env.DEV) {
    return 'http://localhost:8787';
  }
  
  // Production fallback
  return 'https://api.mafia-arena.com';
}
