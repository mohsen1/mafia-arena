# Werewolf AI

<div align="center">
  <img src="public/images/logo.png" width="120" alt="Werewolf AI Logo" />
  <h3>An AI-Powered Social Deduction Game</h3>
</div>

## Overview

Werewolf AI brings the classic Werewolf/Mafia party game to the web. It pairs a Next.js 15 front-end with a stand-alone TypeScript game engine. AI agents take on each role so you can play solo or alongside computer-controlled opponents. The engine is decoupled from the UI layer, allowing future CLI or server implementations.

## Key Features

- Multiple AI providers (OpenAI, Claude, Gemini, Groq)
- OAuth login with Google and GitHub or username/password
- PostgreSQL persistence via Drizzle ORM
- Full internationalization with auto-generated translations
- ElevenLabs text-to-speech for immersive play
- Configurable roles, themes and AI models

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
- API keys for at least one AI provider
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

## Contributing

Please read our [contributing guidelines](CONTRIBUTING.md) before opening a pull request.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
