import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Derive API URL from a given hostname.
 * - For localhost, returns empty string (uses Vite proxy)
 * - For preview deployments (*.workers.dev), uses the preview worker URL
 * - For production, uses api.mafia-arena.com
 */
function getApiUrlFromHostname(hostname: string): string {
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return '';
  }

  // Preview deployment detection: {hash}-mafia-arena-frontend.{account}.workers.dev
  // Should use backend at: mafia-arena.{account}.workers.dev
  const previewMatch = hostname.match(/^[a-f0-9]+-mafia-arena-frontend\.(.+\.workers\.dev)$/);
  if (previewMatch) {
    return `https://mafia-arena.${previewMatch[1]}`;
  }

  // Production - use custom domain
  return 'https://api.mafia-arena.com';
}

/**
 * Get the API URL based on environment.
 * - For client-side: detects hostname from window.location
 * - For server-side (SSR): pass the request to detect preview deployments
 * - Returns empty string in development to use relative paths via Vite proxy
 * - For preview deployments (*.workers.dev), uses the preview worker URL
 * - Falls back to https://api.mafia-arena.com in production
 */
export function getApiUrl(request?: Request): string {
  // If request is provided (SSR), extract hostname from it
  if (request) {
    const url = new URL(request.url);
    return getApiUrlFromHostname(url.hostname);
  }

  // In browser/client-side, check hostname
  if (typeof window !== 'undefined') {
    return getApiUrlFromHostname(window.location.hostname);
  }

  // Server-side (SSR) without request - check env vars
  if (typeof import.meta.env !== 'undefined') {
    if (import.meta.env.DEV) {
      return 'http://localhost:8787';
    }

    // Check if VITE_API_URL is explicitly set to a non-production URL
    const apiUrl = import.meta.env.VITE_API_URL;
    if (apiUrl && apiUrl !== 'https://api.mafia-arena.com') {
      return apiUrl;
    }
  }

  // Production fallback
  return 'https://api.mafia-arena.com';
}
