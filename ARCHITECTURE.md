# Project Architecture

## Overview

Werewolf AI is a Next.js 15 application written in TypeScript.  It implements the classic Werewolf/Mafia game where AI agents replace human players.  The project consists of a Next.js UI and API layer and a self-contained game engine that orchestrates phases, roles and AI interactions.  Persistence is handled with PostgreSQL via the Drizzle ORM.  Below is an overview of the main pieces and how they fit together.

## Directory Structure

```
src/
  app/             # Next.js App Router pages and API routes
  components/      # React components
  context/         # React context providers
  dictionaries/    # i18n translation JSON files
  hooks/           # Custom React hooks
  lib/             # Core domain logic
    ai/            # Wrappers around AI SDKs
    auth/          # NextAuth configuration
    db/            # Database schema and services
    engine/        # Game engine implementation
    i18n/          # i18n utilities and settings
    tts/           # Text to speech support
  middleware.ts    # Next.js middleware
```

Other important folders include `tests/` for Playwright e2e tests and `scripts/` for database setup and seeding.  Migrations live in `drizzle/`.

## Game Engine

The heart of the application lives in `src/lib/engine`.  The engine is designed to run independently from the web front‑end and exposes a `Game` class representing a single match.  Key sub‑modules are:

- **agents/** – Implementations of the `IAgent` interface.  Includes `OpenAIAgent`, `ClaudeAgent`, `GeminiAgent`, `HumanAgent` and a dummy agent for testing.
- **core/** – Foundational classes such as `Game`, `Player`, `ConversationLog` and `Message`.
- **phases/** – Each phase of gameplay (initialization, day, night, etc.) implements `IGamePhase` with `runStep` and `transition` methods.
- **roles/** – Role definitions like Villager, Mafia, Doctor and Seer extending a base role class.
- **interfaces/** – Shared types used throughout the engine.
- **prompts.ts** – Functions for constructing prompts for LLM based agents.
- **rendering/** – Hooks for UI rendering during game progression.

A new game is created through `Game.createNewGame()` which receives player setups (agent instance and role).  `Game.runGameLoop()` then drives the phases, requesting actions from each player via the `IAgent.getAction()` method.  The engine tracks conversation logs, agent memories and win conditions while emitting events to registered renderers so the UI can update.

## Database Layer

Under `src/lib/db` the Drizzle ORM defines the PostgreSQL schema in `schema.ts` with tables for users, sessions, games and game participants.  `game.service.ts` provides CRUD operations used by the application to save, load and list games.  The rest of the application calls these functions rather than talking to the database directly.  Migration metadata lives in `drizzle/meta`.

## API and Server Components

The Next.js `app/` directory hosts both pages and API routes.  Important endpoints include `api/auth/[...nextauth]` for authentication and `api/speak` which proxies the ElevenLabs text‑to‑speech service.  Server actions located in `app/actions` perform mutations such as creating games.  Dynamic locale support is implemented with a `[lang]` segment so every route is prefixed by a language code.

## Front‑End Components

Reusable UI pieces reside under `src/components`, organized by domain (`game/` components) and generic elements (`ui/` from Shadcn).  React context providers for settings and authentication sit in `src/context`.  Hooks such as `useGame` encapsulate common logic.  Styling is handled by Tailwind CSS.

## AI and TTS Integration

AI models are configured through helper definitions in `src/lib/models.ts`.  `agentFactory.ts` converts the stored provider/model data into concrete agent instances.  Multiple providers are supported (OpenAI, Anthropic Claude, Google Gemini, Groq, Fireworks and local Ollama).  Text‑to‑speech uses `src/lib/tts/elevenlabsService.ts` and the `/api/speak` route to generate audio for chat messages.

## Testing

Vitest is used for unit tests (`pnpm test`) and Playwright provides E2E coverage (`pnpm test:e2e`).  The configuration for Vitest resides in `vitest.config.mts` while Playwright is configured in `playwright.config.ts`.

## Configuration and Scripts

Environment variables are documented in `env.example`.  Scripts under `package.json` manage the database (`db:*` commands), translations, and development server.  Database setup and seeding scripts are stored in `scripts/`.

## Summary

The repository combines a Next.js front‑end with a TypeScript game engine that relies on pluggable AI agents and Drizzle based persistence.  The modular layout keeps the engine decoupled from the UI layer while still enabling rich interactions like text‑to‑speech and multilingual support.
