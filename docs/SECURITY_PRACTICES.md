# Security Practices

## Overview

This document outlines the security practices and measures implemented in the Werewolf AI application.

## Content Security Policy (CSP)

The application implements a comprehensive CSP in `next.config.mjs`:

- **script-src**: Allows self, Vercel analytics, and required inline scripts
- **style-src**: Allows self and inline styles (required for some UI components)
- **connect-src**: Restricted to specific API domains and localhost for development
- **img-src**: Allows images from self, data URIs, and OAuth provider avatars
- **frame-ancestors**: Set to 'none' to prevent clickjacking

## Input Sanitization

### HTML Sanitization

The application uses `isomorphic-dompurify` for sanitizing HTML content:

```typescript
// src/lib/security/validation.ts
export function sanitizeHtml(dirty: string, options?: any): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br'],
    ALLOWED_ATTR: [],
    ...options,
  });
}
```

### Markdown Rendering

For AI-generated content, we use `react-markdown` without the `rehype-raw` plugin:

```typescript
// src/components/MemoizedReactMarkdown.tsx
<ReactMarkdown>{message.content}</ReactMarkdown>
```

This provides built-in XSS protection by:
- Escaping HTML by default
- Not allowing raw HTML in markdown
- Sanitizing URLs in links

### User Input Validation

All user inputs are validated and sanitized:

```typescript
// Username validation (2-30 chars, alphanumeric + spaces/hyphens)
export function isValidUsername(username: string): boolean {
  const usernameRegex = /^[\w\s-]{2,30}$/;
  return usernameRegex.test(username);
}

// Email validation
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// API key format validation
export function isValidApiKey(key: string, provider: string): boolean {
  // Provider-specific validation rules
}
```

## Authentication & Authorization

### NextAuth.js Security

- Session tokens are httpOnly cookies
- CSRF protection enabled by default
- Secure session secret required (`NEXTAUTH_SECRET`)

### API Route Protection

All sensitive API routes check authentication:

```typescript
const session = await getServerSession(authOptions);
if (!session?.user) {
  return new Response('Unauthorized', { status: 401 });
}
```

## Database Security

### SQL Injection Prevention

Using Drizzle ORM with parameterized queries:

```typescript
// Safe: Uses parameterized queries
await db.select().from(games).where(eq(games.id, gameId));

// Never: String concatenation
// await db.execute(`SELECT * FROM games WHERE id = '${gameId}'`);
```

### Data Access Control

- Row-level security through application logic
- Users can only access their own games
- Cascade deletes for data consistency

## API Security

### Rate Limiting

Optional rate limiting with Upstash:

```typescript
// src/lib/security/rateLimit.ts
const ratelimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(10, '10 s'),
});
```

### API Key Storage

- User API keys are encrypted before storage
- Keys are never logged or exposed in responses
- Provider-specific validation for key formats

## File Security

### Path Traversal Prevention

```typescript
export function sanitizeFilePath(path: string): string | null {
  // Prevent directory traversal
  if (path.includes('..') || path.includes('~')) {
    return null;
  }
  // Remove null bytes
  const cleaned = path.replace(/\0/g, '');
  // Prevent absolute paths
  if (cleaned.startsWith('/') || /^[a-zA-Z]:/.test(cleaned)) {
    return null;
  }
  return cleaned;
}
```

## Environment Variables

### Validation

Required environment variables are validated at build time:

```typescript
// src/lib/config/server.ts
const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  NEXTAUTH_SECRET: z.string().min(1, 'NEXTAUTH_SECRET is required'),
  // ... other validations
});
```

### Client-Side Safety

Only `NEXT_PUBLIC_*` variables are exposed to the client:

```typescript
// src/lib/config/client.ts
export const clientConfig = {
  NEXTAUTH_URL: process.env.NEXT_PUBLIC_NEXTAUTH_URL || '',
  // Never expose sensitive keys here
};
```

## Security Headers

Additional security headers in `next.config.mjs`:

- `Strict-Transport-Security`: HSTS enabled
- `X-Content-Type-Options`: Prevents MIME sniffing
- `X-Frame-Options`: Prevents clickjacking
- `X-XSS-Protection`: Legacy XSS protection
- `Referrer-Policy`: Controls referrer information

## Best Practices

1. **Never trust user input**: Always validate and sanitize
2. **Use parameterized queries**: Prevent SQL injection
3. **Implement least privilege**: Users only access their own data
4. **Encrypt sensitive data**: API keys are encrypted at rest
5. **Keep dependencies updated**: Regular security updates
6. **Use HTTPS everywhere**: Enforced via HSTS
7. **Validate on both client and server**: Defense in depth

## Regular Security Tasks

- Review and update dependencies monthly
- Monitor security advisories for used packages
- Test authentication flows regularly
- Review access logs for suspicious activity
- Keep security documentation updated 