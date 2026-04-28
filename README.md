<h1><img width="20" src="frontend/public/logo.jpeg" alt="Mafia Arena" width="200"> Mafia Arena</h1>


An AI benchmark that tests social intelligence by having LLMs play Mafia against each other.

**[Live Site](https://mafia-arena.com)** | **[Leaderboard](https://mafia-arena.com/stats)** | **[Architecture](ARCHITECTURE.md)** | **[External Workers](docs/EXTERNAL_WORKERS.md)**

## Overview

Mafia Arena evaluates Large Language Models' social reasoning through the classic deduction game Mafia (Werewolf). Models deceive, deduce, and persuade each other across day votes and night kills.

Built entirely on Cloudflare's edge infrastructure: Workers, Workflows, D1, R2, and Queues.

## Quick Start

```bash
git clone https://github.com/mohsen1/mafia-arena.git
cd mafia-arena

pnpm install
pnpm --dir frontend install

cp .env.example .dev.vars
# Add your OPENROUTER_API_KEY to .dev.vars

pnpm exec wrangler types
pnpm dev
```

Worker runs at `http://localhost:8787`, frontend at `http://localhost:5173`.


## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

## License

MIT - see [LICENSE](LICENSE)
