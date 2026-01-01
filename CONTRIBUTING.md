# Contributing to Mafia Arena

Thank you for your interest in contributing to Mafia Arena! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Testing](#testing)
- [Code Style](#code-style)
- [Questions and Support](#questions-and-support)

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/mafia-arena.git
   cd mafia-arena
   ```
3. **Add the upstream remote**:
   ```bash
   git remote add upstream https://github.com/mohsen1/mafia-arena.git
   ```

## Development Setup

### Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0 (install via `npm install -g pnpm`)
- **Wrangler CLI** (installed via dependencies)

### Installation

```bash
# Install dependencies
pnpm install
pnpm --dir frontend install

# Generate Cloudflare Worker types
pnpm exec wrangler types

# Copy environment variables
cp .env.example .dev.vars
# Edit .dev.vars with your API keys
```

### Running Locally

```bash
# Start both worker and frontend in development mode
pnpm dev

# Or run separately:
pnpm dev:worker    # Cloudflare Worker on http://localhost:8787
pnpm dev:frontend  # Frontend on http://localhost:5173
```

### Running Tests

```bash
# Unit tests
pnpm test

# E2E tests (Cloudflare Workers runtime)
pnpm test:e2e

# UI tests (Playwright)
pnpm test:ui

# All tests
pnpm test:all
```

## Project Structure

```
mafia-arena/
├── src/
│   ├── engine/           # Pure TypeScript game engine (no external deps)
│   │   ├── core/         # Game state, phases, events
│   │   ├── prompts/      # AI prompt templates
│   │   └── __tests__/    # Unit tests
│   └── worker/           # Cloudflare Worker
│       ├── ai/           # AI provider integrations
│       ├── routes/       # Hono API routes
│       ├── workflows/    # Cloudflare Workflows
│       └── middleware/   # Auth, rate limiting, CORS
├── frontend/
│   └── app/
│       ├── routes/       # React Router pages
│       ├── components/   # UI components
│       └── lib/          # Utilities
├── migrations/           # D1 database migrations
├── e2e/                  # End-to-end tests
└── scripts/              # Utility scripts
```

### Key Architecture Principles

- **Game Engine**: Pure TypeScript, no Cloudflare dependencies, fully testable
- **Dependency Injection**: AI providers are injected, enabling mocking in tests
- **Immutable State**: Game state uses `.with*()` methods for updates
- **Event Sourcing**: All game actions recorded as events

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed documentation.

## Making Changes

### Branch Naming

```
<type>/<short-description>

Examples:
feat/leaderboard-filtering
fix/ai-retry-logic
docs/api-documentation
```

### Types

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `refactor` - Code refactoring
- `test` - Adding/updating tests
- `chore` - Maintenance tasks

## Commit Guidelines

We use **Conventional Commits**:

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### Scopes

| Scope | Area |
|-------|------|
| `engine` | Game engine logic |
| `worker` | Cloudflare Worker |
| `api` | API endpoints |
| `ai` | AI providers |
| `frontend` | React pages |
| `ui` | Components/styling |
| `db` | Database/D1 |
| `do` | Durable Objects |

### Examples

```bash
# Single-line commit
git commit -m "feat(engine): add vote resolution with tie-breaking"

# Multi-line commit
git commit -m "feat(api): implement rate limiting" \
           -m "- Add KV-based token bucket" \
           -m "- Apply to POST /api/games/run"

# Fix with reference
git commit -m "fix(do): handle AI timeout during night phase" \
           -m "Closes #42"
```

## Pull Request Process

1. **Create a feature branch** from `main`:
   ```bash
   git checkout -b feat/your-feature
   ```

2. **Make your changes** with clear, atomic commits

3. **Run the test suite**:
   ```bash
   pnpm test
   pnpm typecheck
   pnpm lint
   ```

4. **Push to your fork**:
   ```bash
   git push origin feat/your-feature
   ```

5. **Open a Pull Request** on GitHub with:
   - Clear title following commit convention
   - Description of changes
   - Link to related issues (if any)
   - Screenshots for UI changes

6. **Address review feedback** - maintainers may request changes

7. **Squash commits** if requested before merge

### PR Checklist

- [ ] Tests pass (`pnpm test`)
- [ ] Types check (`pnpm typecheck`)
- [ ] Linter passes (`pnpm lint`)
- [ ] Documentation updated (if applicable)
- [ ] Commit messages follow convention
- [ ] PR description explains the changes

## Testing

### Unit Tests

Located in `__tests__/` directories alongside source files:

```typescript
// src/engine/__tests__/VoteResolution.test.ts
import { describe, it, expect } from 'vitest';
import { resolveVote } from '../core/voting';

describe('resolveVote', () => {
  it('should eliminate player with majority votes', () => {
    // Test implementation
  });
});
```

### E2E Tests

Test the full Cloudflare Workers runtime:

```typescript
// Located in e2e/ directory
import { env } from 'cloudflare:test';

describe('Game API', () => {
  it('creates a game', async () => {
    const response = await fetch('/api/games', { method: 'POST', ... });
    expect(response.status).toBe(201);
  });
});
```

### UI Tests

Playwright tests for the frontend:

```typescript
// Located in e2e/ui/
test('displays game list', async ({ page }) => {
  await page.goto('/games');
  await expect(page.getByRole('heading', { name: 'Games' })).toBeVisible();
});
```

## Code Style

### TypeScript

- Use strict TypeScript (`strict: true`)
- Prefer explicit types over `any`
- Use interfaces for object shapes
- Use `readonly` for immutable data

### Formatting

- **Prettier** for formatting
- **ESLint** for linting
- Run before committing:
  ```bash
  pnpm format
  pnpm lint
  ```

### Naming Conventions

- **Files**: `kebab-case.ts` for utilities, `PascalCase.tsx` for React components
- **Variables/Functions**: `camelCase`
- **Types/Interfaces**: `PascalCase`
- **Constants**: `SCREAMING_SNAKE_CASE`

## Questions and Support

- **Questions**: Open a [GitHub Discussion](https://github.com/mohsen1/mafia-arena/discussions)
- **Bugs**: Open a [GitHub Issue](https://github.com/mohsen1/mafia-arena/issues)
- **Security**: See [SECURITY.md](SECURITY.md)

---

Thank you for contributing! 🎉
