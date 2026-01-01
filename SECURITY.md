# Security Policy

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please report it responsibly.

### How to Report

**Please DO NOT open a public GitHub issue for security vulnerabilities.**

Instead, use one of these methods:

1. **GitHub Private Vulnerability Reporting** (preferred):
   - Go to [Security Advisories](https://github.com/mohsen1/mafia-arena/security/advisories/new)
   - Or run: `gh security-advisory create --repo mohsen1/mafia-arena`

2. **Request Private Contact**:
   - Open a GitHub issue stating you found a security issue and need to report it privately
   - A maintainer will reach out via email

### What to Include

When reporting a vulnerability, please include:

1. **Description** of the vulnerability
2. **Steps to reproduce** the issue
3. **Potential impact** of the vulnerability
4. **Suggested fix** (if you have one)
5. **Your contact information** for follow-up

### What to Expect

- **Acknowledgment**: We will acknowledge receipt within 48 hours
- **Initial Assessment**: We will provide an initial assessment within 7 days
- **Resolution Timeline**: We aim to resolve critical issues within 30 days
- **Credit**: We will credit reporters in security advisories (unless you prefer anonymity)


## Security Measures

### Infrastructure

- **Cloudflare Workers**: Runs in isolated V8 isolates with no shared memory
- **D1 Database**: Encrypted at rest, isolated per deployment
- **R2 Storage**: Encrypted at rest with Cloudflare's infrastructure
- **HTTPS Only**: All traffic encrypted in transit

### Authentication

- **Admin Routes**: Protected by Google OAuth or Basic Auth
- **Rate Limiting**: Token bucket algorithm prevents abuse
- **API Key Encryption**: User-provided API keys encrypted with AES-256-GCM

### Data Handling

- **No PII Collection**: We don't collect personal information beyond admin auth
- **API Keys**: Stored encrypted, never logged, transmitted over HTTPS only
- **Transcripts**: Game data is public by design (AI benchmark results)

### Code Security

- **Dependency Audits**: Regular `pnpm audit` checks
- **Type Safety**: Strict TypeScript prevents many common vulnerabilities
- **Input Validation**: Zod schemas validate all API inputs
- **No `eval()`**: No dynamic code execution

## Best Practices for Contributors

1. **Never commit secrets**: Use `.env.example` as a template, keep actual keys in `.dev.vars`
2. **Validate inputs**: All user inputs should be validated with Zod schemas
3. **Use parameterized queries**: Always use prepared statements for D1
4. **Review dependencies**: Check new dependencies for known vulnerabilities
5. **Follow least privilege**: Request only necessary permissions

## Security-Related Configuration

### Required Secrets

Set these via `wrangler secret put SECRET_NAME`:

```bash
# Required
wrangler secret put OPENROUTER_API_KEY
wrangler secret put ENCRYPTION_SECRET  # 32+ character secret

# For admin auth
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put ADMIN_EMAIL
```

### Environment Isolation

- **Development**: Uses `mafia-arena-dev` worker with preview resources
- **Production**: Uses `mafia-arena` worker with production resources
- **Secrets**: Never shared between environments

## Known Limitations

1. **Public Game Data**: All game transcripts are publicly accessible by design
2. **Rate Limits**: May not prevent all forms of abuse at extreme scale
3. **Third-Party APIs**: Security depends on AI provider implementations



Thank you for helping keep Mafia Arena secure.
