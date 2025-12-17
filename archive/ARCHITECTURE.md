# Project Architecture

## Overview

Werewolf AI is a web application that blends a Next.js 15 front‑end with a standalone game engine written entirely in TypeScript. The engine simulates the classic Werewolf/Mafia party game while AI agents stand in for human players. A PostgreSQL database stores persistent data via Drizzle ORM. The codebase is organized so the core engine can run independently from the UI layer, allowing future CLI or server implementations.

## Core Technologies

- **Framework:** Next.js 15 App Router
- **Language:** TypeScript
- **Runtime:** Node.js 18+
- **Database:** PostgreSQL accessed through Drizzle ORM
- **Authentication:** NextAuth.js with a Drizzle adapter
- **AI Providers:** OpenAI, Anthropic Claude, Google Gemini, Groq, Fireworks and local Ollama
- **Styling:** Tailwind CSS + Shadcn UI components
- **Testing:** Vitest for unit tests and Playwright for end‑to‑end tests

## High Level Directory Layout

```
/ (root)
  ARCHITECTURE.md         # This document
  env.example             # Example environment variables
  next.config.mjs         # Next.js configuration
  package.json            # Scripts and dependencies
  playwright.config.ts    # E2E test setup
  tsconfig.json           # TypeScript options
  drizzle/                # Database migrations
  public/                 # Static assets
  scripts/                # DB setup and helper scripts
  tests/                  # Playwright E2E specs
  src/
    app/                  # Next.js pages, API routes and server actions
    components/           # React components
    context/              # React context providers
    hooks/                # Custom hooks
    dictionaries/         # i18n JSON translations
    lib/                  # Core application logic
```

### src/lib Breakdown

```
lib/
  ai/          # Wrappers around AI SDKs
  auth/        # NextAuth configuration and helpers
  db/          # Drizzle schema and database services
  engine/      # Self‑contained game engine
  i18n/        # i18next utilities
  tts/         # ElevenLabs text‑to‑speech helpers
  models.ts    # AI model definitions
  agentFactory.ts # Instantiate agent classes from stored configs
```

## Game Engine Deep Dive

The engine in `src/lib/engine` orchestrates all gameplay without any hard dependency on Next.js. It exposes a `Game` class that controls phases, players and event rendering.

**Key Areas**

- **core/** – Fundamental classes such as `Game`, `Player`, `Message`, and `ConversationLog`. The `Game` class drives the game loop, tracks rounds and delegates to the current phase.
- **phases/** – Individual phases implement `IGamePhase`. Notable phases include `InitializationPhase`, `CharacterGenerationPhase`, `DayPhase`, `NightPhase` and `GameOverPhase`. Each phase defines `runStep()` to progress the game and `transition()` to choose the next phase.
- **roles/** – Role logic is split out so agents can have abilities like doctor heals or seer reveals. Roles extend a common base and expose `performNightAction` hooks used by the night phase.
- **agents/** – Implementations of `IAgent` for different AI providers plus a `HumanAgent` for user controlled players. Agents receive a prompt describing game state and must return a `PlayerAction` (vote, kill, protect, etc.).
- **interfaces/** – Shared TypeScript types used across the engine including `IAgent`, `IRole`, `IPlayer` and `IGameRenderer`.
- **rendering/** – Renderer classes receive events from the engine so the UI can update in real time. The Next.js UI registers a renderer that writes to React state.
- **prompts.ts** – Helper methods to craft system and user prompts for the various AI models based on role and theme.

A new match is created through `Game.createNewGame()` which takes a list of player setups (agent instance + role) along with theme and language. The engine maintains an ordered list of players, a conversation log, and per‑agent memory. `Game.runGameLoop()` iterates through phases, requesting actions from each agent via `IAgent.getAction`. After every step it notifies renderers so the UI layer can display messages and decisions. The engine never imports React or Next.js modules, keeping it fully decoupled.

Game state can be serialized with `Game.toSerializable()` and later rehydrated via `Game.loadFromState()`. This enables saving and resuming games from the database or other storage mechanisms.

## Gameplay and Rules

The basic flow mirrors the classic Mafia social deduction game:

1. **Setup** – Each participant is secretly assigned a role such as Villager, Werewolf, Doctor or Seer. The engine supports custom themes but follows the traditional team structure of villagers versus werewolves.
2. **Night Phase** – Under cover of darkness the werewolves secretly agree on a victim while the doctor may protect one player and the seer can divine another player's team. AI agents decide their actions by analyzing the conversation log and role objectives.
3. **Day Phase** – All players discuss who might be a werewolf and then vote on a lynch target. The player with the most votes is eliminated from the game.
4. **Victory** – The villagers win if they eliminate all werewolves. The werewolves win once they equal or outnumber the remaining villagers.

The engine tracks these phases automatically and uses role hooks (e.g., `performNightAction`) to implement special abilities. Variants such as multiple werewolves or additional roles can be configured when creating a new match.

## AI Provider Integration

`src/lib/models.ts` describes available models for each provider. `agentFactory.ts` converts persisted provider information into concrete agent classes. Each agent wrapper handles authentication, request formatting and response parsing for its respective API. The engine interacts with agents only through the generic `IAgent` interface, making it easy to plug in new providers.

## Text‑to‑Speech

The `tts/elevenlabsService.ts` module implements an ElevenLabs client used by the `/api/speak` route under `app/api/speak/route.ts`. When a chat message requires audio, the server route calls the service to generate an MP3 which is streamed back to the browser.

## Internationalization

Localization is handled by next‑i18next. All translated strings live in `src/dictionaries/[lang].json`. The `src/lib/i18n` folder provides initialization code and utilities. Pages are nested under a dynamic `[lang]` segment so URLs are prefixed with a language code. A helper script (`scripts/generate-translations.ts`) can auto‑translate missing keys using an AI model defined in `DEFAULT_TRANSLATION_MODEL`.

## Authentication & Sessions

User accounts are managed by NextAuth.js using credentials or OAuth providers (Google and GitHub). The Drizzle adapter stores session and user data in PostgreSQL. Middleware under `src/lib/auth` guards pages that require a signed‑in user. Each game is associated with the user who created it, enabling per‑user game history.

## Database and Persistence

Database schema definitions live in `src/lib/db/schema.ts`. Tables include `users`, `sessions`, `games`, and `participants`. Database helper functions in `persistence.ts` and `game.service.ts` handle creating and loading games. Migration files are kept in the `drizzle/` directory and can be generated with `pnpm run db:generate`.

## API & Server Components

The `app/` directory contains both React server components and API routes. Examples:

- `api/auth/[...nextauth]/route.ts` – NextAuth handler
- `api/speak/route.ts` – ElevenLabs proxy for text‑to‑speech
- `actions/` – Server actions used by React components to start games or update settings

Server components fetch data directly from the database using Drizzle services and render the initial HTML on the server. Client components hydrate on the browser side for interactivity.

## Front‑End UI Layer

`src/components` hosts reusable React components grouped by domain. Game related components live under `game/` and generic elements under `ui/` (copied from the Shadcn library). Global context providers (e.g., theme, authentication, settings) reside in `src/context`. Custom hooks in `src/hooks` encapsulate stateful logic such as `useGame` which subscribes to engine events. Styling is powered by Tailwind CSS with utility classes merged via `tailwind-merge`.

## Build, Tooling & Scripts

- **Package Manager:** pnpm
- **Linting:** `pnpm lint`
- **Type Checking:** `pnpm tsc`
- **Database:** `pnpm run db:*` scripts for setup, migrations and seeding
- **Translations:** `pnpm run translate`
- **Dev Server:** `pnpm run dev` (or `pnpm run dev:db` to bootstrap database first)

TypeScript settings are located in `tsconfig.json` and Vite is used for unit test runs through Vitest. Environment variables are documented in `env.example` and loaded via `dotenv` when running scripts.

## Testing Strategy

Unit tests under `src/lib/**/tests` cover engine logic. Vitest runs these via `pnpm test`. Playwright specs in the `tests/` folder drive a headless browser to validate full game flows (`pnpm test:e2e`). Database seeding is performed automatically before E2E tests so they start with a clean state.

## Development Workflow

1. Clone the repo and install dependencies with `pnpm install`.
2. Set up PostgreSQL database:
   - **Docker (Recommended):** Run `docker compose up -d` to start PostgreSQL in a container
   - **Native:** Run `pnpm run db:setup` to install PostgreSQL (macOS only) and create the development database
3. Configure environment variables by copying `env.example` to `.env.local` and updating DATABASE_URL if using Docker
4. Run database migrations with `pnpm run db:migrate`
5. Start the dev server with `pnpm run dev`
6. Modify engine or UI code. The app reloads automatically via Next.js hot reloading.
7. Run `pnpm test` and `pnpm test:e2e` to ensure changes do not break existing functionality.

## Summary

The repository is structured around a clear separation of concerns. A self‑contained TypeScript game engine drives all game logic, while a Next.js front‑end handles rendering, API routes and authentication. Drizzle manages persistence and migrations, and a collection of pluggable AI agents provides the brains behind each player. This modular design makes it straightforward to extend AI providers, introduce new roles or even reuse the engine in non‑web environments.
