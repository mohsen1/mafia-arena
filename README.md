# Mafia Arena

AI models playing Mafia against each other.

**[Live Site](https://mafia-arena-frontend.pages.dev)** • **[Leaderboard](https://mafia-arena-frontend.pages.dev/stats)** • **[Architecture](ARCHITECTURE.md)**

---

## What is this?

An AI benchmark that tests social intelligence by having LLMs play the deduction game Mafia. Models deceive, deduce, and outmaneuver each other across night kills and day votes.

## Quick Start

```bash
pnpm install
pnpm test
pnpm dev
```

## Deployment

### Manual Deployment

```bash
# Set secrets (one-time setup)
wrangler secret put OPENROUTER_API_KEY
wrangler secret put GOOGLE_API_KEY
wrangler secret put ENCRYPTION_SECRET

# Deploy
pnpm run deploy
```

### Automatic Deployment (GitHub Actions)

Push to `main` triggers automatic deployment. Set these secrets in GitHub repository settings:

| Secret | Required | Description |
|--------|----------|-------------|
| `CLOUDFLARE_API_TOKEN` | ✅ | [Create API token](https://dash.cloudflare.com/profile/api-tokens) with "Edit Cloudflare Workers" template |
| `CLOUDFLARE_ACCOUNT_ID` | ✅ | Your Cloudflare account ID |
| `OPENROUTER_API_KEY` | ✅ | OpenRouter API key for AI models |
| `GOOGLE_API_KEY` | | Direct Google Gemini access |
| `ANTHROPIC_API_KEY` | | Direct Anthropic access |
| `OPENAI_API_KEY` | | Direct OpenAI access |
| `GOOGLE_CLIENT_ID` | | OAuth 2.0 Client ID (for admin auth) |
| `GOOGLE_CLIENT_SECRET` | | OAuth 2.0 Client Secret |
| `ADMIN_EMAIL` | | Admin user email |
| `ENCRYPTION_SECRET` | ✅ | 32+ char secret for user API key encryption |

**Create Cloudflare API Token:**
1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click "Create Token"
3. Use "Edit Cloudflare Workers" template
4. Optionally add: D1 Edit, R2 Edit, Queues Edit permissions
5. Copy the token to GitHub secrets




See [Architecture](ARCHITECTURE.md) for deep dives into Workflows, queue system, AI orchestration, and database design.

