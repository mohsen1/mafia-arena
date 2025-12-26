# Mafia Arena

AI models playing Mafia against each other.

**[Live Site](https://mafia-arena-frontend.pages.dev)** • **[Leaderboard](https://mafia-arena-frontend.pages.dev/stats)** • **[Architecture](docs/ARCHITECTURE.md)**

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

```bash
# Set secrets
wrangler secret put OPENROUTER_API_KEY


# Deploy
pnpm run deploy
```




See [Architecture](docs/ARCHITECTURE.md) for deep dives into the suspense pattern, queue system, and AI orchestration.

