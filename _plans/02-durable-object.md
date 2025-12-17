# Milestone 2: Durable Object Wrapper

## Objective

Create a Cloudflare Durable Object that wraps the game engine, handles the async nature of AI API calls, implements retry logic, and persists results to D1/R2.

## Why Durable Objects?

| Feature | Benefit |
|---------|---------|
| **Stateful** | Maintains game state across multiple async operations |
| **No timeout** | Unlike Workers (30s), DOs can run for minutes |
| **Single-threaded** | No race conditions within a game instance |
| **Hibernation** | Saves costs when idle |

## Deliverables

1. **Durable Object Class** (`/src/worker/GameRunner.ts`)
   - Lifecycle management (create, run, complete)
   - AI provider integration with retry logic
   - Result persistence to D1 and R2

2. **Worker Entry Point** (`/src/worker/index.ts`)
   - DO namespace exports
   - Basic health check endpoint

3. **Wrangler Configuration** (`/wrangler.toml`)
   - DO bindings
   - D1 database binding
   - R2 bucket binding
   - Environment variables for API keys

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Durable Object: GameRunner                  │
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │  Receive    │───▶│    Run      │───▶│      Persist        │ │
│  │  Config     │    │  Game Loop  │    │     Results         │ │
│  └─────────────┘    └─────────────┘    └─────────────────────┘ │
│         │                  │                     │              │
│         ▼                  ▼                     ▼              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │   Init      │    │  Call AI    │    │   Write D1          │ │
│  │   Engine    │    │  w/ Retry   │    │   Write R2          │ │
│  └─────────────┘    └─────────────┘    └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Key Implementation

```typescript
// src/worker/GameRunner.ts

export class GameRunner implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private game: Game | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    switch (url.pathname) {
      case '/start':
        return this.startGame(request);
      case '/status':
        return this.getStatus();
      default:
        return new Response('Not found', { status: 404 });
    }
  }

  private async startGame(request: Request): Promise<Response> {
    const config = await request.json<GameConfig>();
    
    // Create AI provider with retry logic
    const aiProvider = new RetryingAIProvider(this.env, {
      maxRetries: 3,
      backoffMs: [1000, 2000, 4000],
    });

    // Initialize and run game
    this.game = new Game(config, aiProvider);
    const result = await this.game.run();

    // Persist results
    await this.persistResults(result);

    return Response.json({ success: true, gameId: result.id });
  }

  private async persistResults(result: GameResult): Promise<void> {
    // Write stats to D1
    await this.env.DB.prepare(`
      INSERT INTO games (id, config_hash, winner, rounds, duration_ms, total_tokens, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      result.id,
      hashConfig(result.config),
      result.winner,
      result.rounds,
      result.durationMs,
      result.tokenUsage.total,
      Date.now()
    ).run();

    // Write full transcript to R2
    await this.env.TRANSCRIPTS.put(
      `games/${result.id}/transcript.json`,
      JSON.stringify(result.events)
    );
  }
}
```

## Retry Logic

```typescript
class RetryingAIProvider implements AIProvider {
  private maxRetries: number;
  private backoffMs: number[];

  async getAction(context: AIContext, prompt: ActionPrompt): Promise<AIResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.callAI(context, prompt);
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.maxRetries) {
          await sleep(this.backoffMs[attempt]);
        }
      }
    }

    throw new GameError('AI_FAILURE', `Failed after ${this.maxRetries} retries`, lastError);
  }
}
```

## Wrangler Configuration

```toml
# wrangler.toml
name = "mafia-arena"
main = "src/worker/index.ts"
compatibility_date = "2024-01-01"

[durable_objects]
bindings = [
  { name = "GAME_RUNNER", class_name = "GameRunner" }
]

[[migrations]]
tag = "v1"
new_classes = ["GameRunner"]

[[d1_databases]]
binding = "DB"
database_name = "mafia-arena"
database_id = "placeholder"

[[r2_buckets]]
binding = "TRANSCRIPTS"
bucket_name = "mafia-arena-transcripts"

[vars]
ENVIRONMENT = "development"

# Secrets (set via wrangler secret put)
# OPENAI_API_KEY
# ANTHROPIC_API_KEY
# GOOGLE_AI_API_KEY
```

## File Structure

```
/src/worker/
├── index.ts              # Worker entry, DO exports
├── GameRunner.ts         # Durable Object class
├── ai/
│   ├── AIProvider.ts     # AI provider implementations
│   ├── RetryingProvider.ts
│   └── providers/
│       ├── openai.ts
│       ├── anthropic.ts
│       └── google.ts
└── utils/
    └── errors.ts         # Error types

/wrangler.toml            # Cloudflare config
```

## Acceptance Criteria

- [ ] DO can receive game config and run a complete game
- [ ] AI calls retry up to 3 times with exponential backoff
- [ ] Game results are written to D1
- [ ] Full transcripts are written to R2
- [ ] DO properly hibernates after game completion
- [ ] Errors are handled gracefully and logged
- [ ] Can deploy to Cloudflare Workers

## Deploy Checklist

1. Create D1 database: `wrangler d1 create mafia-arena`
2. Create R2 bucket: `wrangler r2 bucket create mafia-arena-transcripts`
3. Set secrets: `wrangler secret put OPENAI_API_KEY`
4. Deploy: `wrangler deploy`

## Estimated Effort

- **Time:** 2-3 days
- **Files:** ~10 files
- **Deploy:** First CF deployment

## Next Milestone

After completion, proceed to [M3: Queue + API](./03-queue-api.md).

