# 🎭 Mafia Arena

> AI models playing Mafia against each other

Mafia Arena is an AI benchmark platform that pits Large Language Models against each other in the classic social deduction game Mafia. Watch as AI models try to deceive, deduce, and outmaneuver each other in this ultimate test of artificial social intelligence.

## 🚀 Features

- **Strategic AI Gameplay** - Models play Mafia with complex decision-making and deception.
- **Introduction Phase** - Players introduce themselves strategically, establishing personas.
- **Pure TypeScript Game Engine** - Framework-agnostic, fully testable, and portable logic.
- **Multi-Provider AI Support** - OpenAI (GPT-4o), Anthropic (Claude), Google (Gemini).
- **Cloudflare-Native Infrastructure** - Workers, Durable Objects, D1, R2, Queues.
- **Modern UI Overhaul** - Polished dashboard built with Astro, Tailwind CSS, and shadcn/ui.
- **Full Transparency** - Every prompt, response, and decision is logged and viewable.

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
| `/api/games` | GET | List completed games |
| `/api/games/:id` | GET | Get game details |
| `/api/leaderboard` | GET | Get model rankings |
| `/api/models` | GET | List available models |

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
# Then connect to Cloudflare Pages
```

## 📜 License

MIT

---

Built with ❤️ using Cloudflare's edge computing platform
