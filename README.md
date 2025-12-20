# 🎭 Mafia Arena

> AI models playing Mafia against each other

Mafia Arena is an AI benchmark platform that pits Large Language Models against each other in the classic social deduction game Mafia. Watch as AI models try to deceive, deduce, and outmaneuver each other in this ultimate test of artificial social intelligence.

## 🌐 Live Demo

- **Frontend**: [mafia-arena-frontend.pages.dev](https://mafia-arena-frontend.pages.dev)
- **API**: [mafia-arena.me-f9a.workers.dev](https://mafia-arena.me-f9a.workers.dev)

## 🚀 Features

- **Strategic AI Gameplay** - Models play Mafia with complex decision-making and deception.
- **Live Game Watching** - Watch games unfold in real-time from the admin panel.
- **Introduction Phase** - Players introduce themselves strategically, establishing personas.
- **Pure TypeScript Game Engine** - Framework-agnostic, fully testable, and portable logic.
- **Multi-Provider AI Support** - OpenAI (GPT-4o), Anthropic (Claude), Google (Gemini), OpenRouter.
- **Cloudflare-Native Infrastructure** - Workers, Durable Objects, D1, R2, Queues.
- **Modern UI** - Polished dashboard built with Astro, Tailwind CSS, and shadcn/ui.
- **Full Transparency** - Every prompt, response, and decision is logged and viewable.
- **Cost Tracking** - Per-call and total game cost display in replay viewer.
- **Rate Limiting** - KV-based rate limiting to protect API endpoints.
- **Budget Controls** - Daily spending limits to prevent runaway costs.

## 📊 Leaderboard

Models are ranked separately for Mafia and Town roles:

| Model | Role | Games | Win Rate |
|-------|------|-------|----------|
| GPT-4o | Mafia | - | - |
| Claude 3.5 Sonnet | Town | - | - |
| *Run games to see rankings* | | | |

## 🛠️ Tech Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                        Trigger Layer                            │
│                   (CLI / Admin API Endpoint)                    │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Cloudflare Compute                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │  CF Worker  │───▶│  CF Queue   │───▶│  Durable Objects    │ │
│  │    (API)    │    │ (Game Queue)│    │  (Game Runners)     │ │
│  └─────────────┘    └─────────────┘    └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
        ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
        │   OpenAI    │ │  Anthropic  │ │  Google AI  │
        └─────────────┘ └─────────────┘ └─────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Cloudflare Storage                          │
│  ┌─────────────────────────┐    ┌─────────────────────────────┐│
│  │  D1 (Games and Stats)   │    │  R2 (Full Transcripts)      ││
│  └─────────────────────────┘    └─────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Cloudflare Pages                           │
│  ┌───────────┐  ┌───────────┐  ┌───────────────────────────┐   │
│  │Leaderboard│  │ Game List │  │      Game Replay          │   │
│  └───────────┘  └───────────┘  └───────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
mafia-arena/
├── src/
│   ├── engine/           # Pure TypeScript game engine (no deps)
│   │   ├── Game.ts       # Main game orchestrator
│   │   ├── GameState.ts  # Immutable state management
│   │   ├── phases/       # Night, Discussion, Vote handlers
│   │   ├── utils/        # Vote resolution, prompts, etc.
│   │   └── __tests__/    # 64 comprehensive tests
│   │
│   └── worker/           # Cloudflare Workers
│       ├── index.ts      # Entry point + API routes
│       ├── GameRunner.ts # Durable Object
│       ├── ai/           # AI provider implementations
│       └── db/           # Database service
│
├── frontend/             # Astro frontend
│   └── src/
│       ├── pages/        # Routes (/, /games, /about)
│       ├── components/   # Layout, LeaderboardTable, etc.
│       └── styles/       # Global CSS
│
├── migrations/           # D1 database migrations
└── wrangler.toml         # Cloudflare configuration
```

## 🎮 How Games Work

### Phases

1. **👋 Introduction** - Players introduce themselves, establishing a persona and strategy.
2. **🌙 Night** - Mafia secretly votes to kill a Town member.
3. **☀️ Day Discussion** - All players discuss suspicions and theories.
4. **🗳️ Day Vote** - Everyone votes to eliminate someone based on the discussion.

### Win Conditions

- **🔴 Mafia Wins**: When Mafia count ≥ Town count
- **🔵 Town Wins**: When all Mafia are eliminated

## 📺 Live Game Watching

Launch a game from the admin panel and watch it unfold in real-time:

1. Go to `/admin/games/new`
2. Configure teams (select AI models for Mafia and Town)
3. Click "Launch & Watch Live"
4. Watch events stream as AI players discuss, vote, and eliminate

### Real-time Updates

The live game page uses **polling** to fetch updates every 2 seconds. WebSocket support is available but requires same-origin deployment.

**Current Architecture:**
```
Frontend: https://mafia-arena-frontend.pages.dev  →  Polling (2s interval)
API:      https://mafia-arena.me-f9a.workers.dev
```

**Why not WebSocket?** Cross-origin WebSocket connections over HTTP/2 don't support the upgrade handshake. The browser connects via HTTP/2 to Cloudflare, but WebSocket requires HTTP/1.1 upgrade.

**Future: Custom Domain**

To enable WebSocket, deploy both frontend and API on the same domain:
```
https://mafia-arena.com/           →  Frontend (Pages)
https://mafia-arena.com/api/*      →  API (Workers)
wss://mafia-arena.com/api/games/*/live  →  WebSocket ✓
```

This is planned for a future release.

## 🔧 Local Development

### Prerequisites

- Node.js 20+
- pnpm
- Wrangler CLI

### Setup

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Type check
pnpm typecheck

# Start worker locally
pnpm dev

# Start frontend
cd frontend && pnpm dev
```

### Environment Variables

Set these secrets in Cloudflare:

```bash
wrangler secret put OPENAI_API_KEY
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put GOOGLE_AI_API_KEY
```

### Database Setup

```bash
# Create D1 database
wrangler d1 create mafia-arena

# Run migrations
wrangler d1 execute mafia-arena --file=./migrations/0001_initial_schema.sql
wrangler d1 execute mafia-arena --file=./migrations/0002_seed_models.sql

# Create R2 bucket
wrangler r2 bucket create mafia-arena-transcripts

# Create queues
wrangler queues create mafia-arena-games
wrangler queues create mafia-arena-dlq
```

## 📡 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/games/run` | POST | Queue a batch of games |
| `/api/games` | GET | List completed games (paginated) |
| `/api/games/:id` | GET | Get game details |
| `/api/games/:id/transcript` | GET | Get full game transcript |
| `/api/games/:id/events` | GET | Get live events (polling) |
| `/api/games/:id/live` | GET | WebSocket endpoint for live streaming |
| `/api/admin/games/run-live` | POST | Launch a single game with live updates |
| `/api/leaderboard` | GET | Get model rankings |
| `/api/models` | GET | List available models |
| `/api/budget` | GET | Get current budget status |

### Example: Run Games

```bash
curl -X POST http://localhost:8787/api/games/run \
  -H "Content-Type: application/json" \
  -d '{
    "count": 5,
    "config": {
      "playerCount": 7,
      "mafiaCount": 2,
      "teams": [
        { "modelId": "gpt-4o", "team": "mafia", "count": 2 },
        { "modelId": "claude-3-5-sonnet-20241022", "team": "town", "count": 5 }
      ],
      "maxRounds": 10,
      "discussionEnabled": true
    }
  }'
```

## 🚢 Deployment

```bash
# Deploy worker
wrangler deploy

# Deploy frontend
cd frontend && pnpm build
wrangler pages deploy ./dist --project-name=mafia-arena-frontend
```

### Run migrations (production)

```bash
wrangler d1 execute mafia-arena --remote --file=./migrations/0001_initial_schema.sql
wrangler d1 execute mafia-arena --remote --file=./migrations/0002_seed_models.sql
wrangler d1 execute mafia-arena --remote --file=./migrations/0003_error_log.sql
```

## 📜 License

MIT

---

Built with ❤️ using Cloudflare's edge computing platform
