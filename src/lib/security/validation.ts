import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize HTML content to prevent XSS attacks
 * @param dirty Untrusted HTML string
 * @param options DOMPurify options
 * @returns Sanitized HTML string
 */
export function sanitizeHtml(
  dirty: string,
  options?: Record<string, unknown>
): string {
  const result = DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br'],
    ALLOWED_ATTR: [],
    ...options,
  });
  // DOMPurify can return TrustedHTML in some environments, convert to string
  return String(result);
}

/**
 * Sanitize user input for display
 * @param input User input string
 * @returns Sanitized string safe for display
 */
export function sanitizeUserInput(input: string): string {
  if (typeof input !== 'string') return '';

  // Remove any HTML tags
  const stripped = input.replace(/<[^>]*>/g, '');

  // Escape special characters
  return stripped
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validate email address
 * @param email Email address to validate
 * @returns True if valid email
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate username
 * @param username Username to validate
 * @returns True if valid username
 */
export function isValidUsername(username: string): boolean {
  // Allow alphanumeric, spaces, hyphens, and underscores
  // Between 2 and 30 characters
  const usernameRegex = /^[\w\s-]{2,30}$/;
  return usernameRegex.test(username);
}

/**
 * Validate game name
 * @param gameName Game name to validate
 * @returns True if valid game name
 */
export function isValidGameName(gameName: string): boolean {
  // Allow alphanumeric, spaces, and common punctuation
  // Between 3 and 50 characters
  const gameNameRegex = /^[\w\s\-,.!?']{3,50}$/;
  return gameNameRegex.test(gameName);
}

/**
 * Validate URL
 * @param url URL to validate
 * @returns True if valid URL
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate and sanitize file paths
 * @param path File path to validate
 * @returns Sanitized path or null if invalid
 */
export function sanitizeFilePath(path: string): string | null {
  // Prevent directory traversal attacks
  if (path.includes('..') || path.includes('~')) {
    return null;
  }

  // Remove any null bytes
  const cleaned = path.replace(/\0/g, '');

  // Ensure path doesn't start with / or contain absolute paths
  if (cleaned.startsWith('/') || /^[a-zA-Z]:/.test(cleaned)) {
    return null;
  }

  return cleaned;
}

/**
 * Validate API key format
 * @param key API key to validate
 * @param provider AI provider name
 * @returns True if valid format for provider
 */
export function isValidApiKey(key: string, provider: string): boolean {
  switch (provider) {
    case 'groq':
      return key.startsWith('gsk_') && key.length > 20;
    case 'openai':
      return key.startsWith('sk-') && key.length > 20;
    case 'anthropic':
      return key.startsWith('sk-ant-') && key.length > 20;
    case 'gemini':
    case 'google':
      return key.length > 20 && /^[a-zA-Z0-9_-]+$/.test(key);
    default:
      return key.length > 10; // Generic validation
  }
}

/**
 * Truncate string to maximum length
 * @param str String to truncate
 * @param maxLength Maximum length
 * @returns Truncated string
 */
export function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}
