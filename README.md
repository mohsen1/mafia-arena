# Werewolf AI

<div align="center">
  <img src="public/images/logo.png" width="120" alt="Werewolf AI Logo" />
  <h3>An AI-Powered Social Deduction Game</h3>
</div>

## Overview

Werewolf AI brings the classic Werewolf/Mafia party game to the web. It pairs a Next.js 15 front-end with a stand-alone TypeScript game engine. AI agents take on each role so you can play solo or alongside computer-controlled opponents. The engine is decoupled from the UI layer, allowing future CLI or server implementations.

## Key Features

- Multiple AI providers (OpenAI, Claude, Gemini, Groq, **Local Ollama**)
- **Bring Your Own API Keys** - Use your personal API keys for any provider
- OAuth login with Google and GitHub or username/password
- PostgreSQL persistence via Drizzle ORM
- Full internationalization with auto-generated translations
- ElevenLabs text-to-speech for immersive play
- Configurable roles, themes and AI models
- **Self-hosted AI support** - Run completely offline with Ollama

## Architecture

The repository separates the front-end UI from the core game engine. The engine under `src/lib/engine` manages phases, roles and AI agents without importing Next.js. A PostgreSQL database stores games and user data. The UI layer uses React server components and API routes to interact with the engine.

### Directory Layout

```text
/ (root)
  ARCHITECTURE.md         # Detailed architecture review
  env.example             # Example environment variables
  next.config.mjs         # Next.js configuration
  drizzle/                # Database migrations
  public/                 # Static assets
  scripts/                # DB setup and helper scripts
  src/
    app/                  # Pages, API routes and server actions
    components/           # React components
    context/              # React providers
    hooks/                # Custom hooks
    dictionaries/         # i18n JSON translations
    lib/                  # Core engine and services
```

## Prerequisites

- Node.js 18+
- pnpm 9+
- PostgreSQL
- API keys for at least one AI provider (or [Ollama](docs/OLLAMA_INTEGRATION.md) for local AI, or use [your own keys](docs/USER_API_KEYS.md))
- OAuth credentials for Google and GitHub

## Getting Started

1. Clone the repository
   ```bash
   git clone https://github.com/mohsen1/werewolf-ai.git
   cd werewolf-ai
   pnpm install
   ```
2. Copy `env.example` to `.env.local` and fill in the required values
3. Set up the database and start the dev server
   ```bash
   pnpm run dev:db
   ```
4. Visit `http://localhost:3099`

## Testing

Run the following to verify your changes:

```bash
pnpm tsc
pnpm lint
pnpm test
```

## Deployment

Database migrations are automatically applied during Vercel deploys. The
`vercel.json` file first checks database connectivity with `pnpm run check-db`
and then runs `pnpm run db:push` before building the application so no manual
database setup is required.

### Deployment Failure Automation

The project includes comprehensive deployment failure automation:

- **Automatic monitoring** of deployment status
- **Issue creation** for deployment failures with categorization
- **Recovery scripts** to diagnose and fix common issues
- **Daily health checks** to ensure deployment stability

If a deployment fails:
1. An issue is automatically created with troubleshooting steps
2. Run `pnpm run deploy:check` locally to diagnose issues
3. See [Deployment Failure Automation](docs/DEPLOYMENT_FAILURE_AUTOMATION.md) for details

## Contributing

Please read our [contributing guidelines](CONTRIBUTING.md) before opening a pull request.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
