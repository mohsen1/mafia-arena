# Milestone 3: Queue + API

## Objective

Implement a Cloudflare Queue for game scheduling and a Worker API for triggering game batches. This decouples game requests from execution and enables concurrent game processing.

## Why Queues?

| Feature | Benefit |
|---------|---------|
| **Decoupling** | API responds immediately, games run async |
| **Backpressure** | Queue manages load automatically |
| **Retries** | Failed games can be retried |
| **Concurrency** | Multiple DOs process games in parallel |

## Deliverables

1. **Queue Consumer** (update `/src/worker/index.ts`)
   - Process queue messages
   - Create DO instances for each game

2. **API Endpoints** (`/src/worker/api/`)
   - `POST /api/games/run` - Enqueue games
   - `GET /api/games` - List games
   - `GET /api/games/:id` - Get game details

3. **Queue Configuration** (update `/wrangler.toml`)
   - Queue producer and consumer bindings

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          API Layer                              │
│                                                                 │
│  POST /api/games/run                                            │
│  { count: 10, config: {...} }                                   │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Validate → Generate Game IDs → Enqueue Messages        │   │
│  └─────────────────────────────────────────────────────────┘   │
│         │                                                       │
│         ▼ (N messages)                                          │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Queue                             │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                       │
│  │Game1│ │Game2│ │Game3│ │Game4│ │Game5│ ...                   │
│  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘                       │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼ (batch of messages)
┌─────────────────────────────────────────────────────────────────┐
│                    Queue Consumer                               │
│                                                                 │
│  for each message:                                              │
│    → Get/Create Durable Object by game ID                       │
│    → Call DO.fetch('/start', config)                            │
│    → Ack message on success                                     │
└─────────────────────────────────────────────────────────────────┘
```

## API Design

### POST /api/games/run

Trigger a batch of games to run.

**Request:**
```json
{
  "count": 10,
  "config": {
    "playerCount": 7,
    "mafiaCount": 2,
    "teams": [
      { "modelId": "gpt-4o", "team": "mafia", "count": 2 },
      { "modelId": "claude-3-5-sonnet", "team": "town", "count": 5 }
    ],
    "maxRounds": 10,
    "discussionEnabled": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "batchId": "batch_abc123",
  "queued": 10,
  "gameIds": ["game_1", "game_2", "..."]
}
```

### GET /api/games

List completed games.

**Query Parameters:**
- `limit` (default: 20)
- `offset` (default: 0)
- `status` (optional: "completed", "running", "failed")

**Response:**
```json
{
  "games": [
    {
      "id": "game_123",
      "winner": "mafia",
      "rounds": 4,
      "durationMs": 45000,
      "createdAt": 1234567890
    }
  ],
  "total": 150,
  "hasMore": true
}
```

### GET /api/games/:id

Get details for a specific game.

**Response:**
```json
{
  "id": "game_123",
  "config": { ... },
  "winner": "mafia",
  "rounds": 4,
  "participants": [
    { "modelId": "gpt-4o", "team": "mafia", "won": true }
  ],
  "transcriptUrl": "https://r2.../games/game_123/transcript.json"
}
```

## Implementation

### Queue Producer (API)

```typescript
// src/worker/api/games.ts

export async function runGames(request: Request, env: Env): Promise<Response> {
  const body = await request.json<RunGamesRequest>();
  
  // Validate
  if (body.count < 1 || body.count > 100) {
    return Response.json({ error: 'Count must be 1-100' }, { status: 400 });
  }

  // Generate game IDs and queue messages
  const batchId = `batch_${crypto.randomUUID().slice(0, 8)}`;
  const gameIds: string[] = [];
  const messages: MessageSendRequest[] = [];

  for (let i = 0; i < body.count; i++) {
    const gameId = `game_${crypto.randomUUID().slice(0, 12)}`;
    gameIds.push(gameId);
    messages.push({
      body: { gameId, config: body.config, batchId },
    });
  }

  // Send to queue
  await env.GAME_QUEUE.sendBatch(messages);

  return Response.json({
    success: true,
    batchId,
    queued: body.count,
    gameIds,
  });
}
```

### Queue Consumer

```typescript
// src/worker/index.ts

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // ... API routing ...
  },

  async queue(batch: MessageBatch<GameQueueMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      const { gameId, config, batchId } = message.body;

      try {
        // Get DO instance by game ID
        const id = env.GAME_RUNNER.idFromName(gameId);
        const stub = env.GAME_RUNNER.get(id);

        // Start the game
        await stub.fetch('http://internal/start', {
          method: 'POST',
          body: JSON.stringify(config),
        });

        // Ack message
        message.ack();
      } catch (error) {
        console.error(`Failed to process game ${gameId}:`, error);
        // Message will be retried by CF Queues
        message.retry();
      }
    }
  },
};
```

## Updated Wrangler Config

```toml
# wrangler.toml (additions)

[[queues.producers]]
queue = "mafia-arena-games"
binding = "GAME_QUEUE"

[[queues.consumers]]
queue = "mafia-arena-games"
max_batch_size = 10
max_batch_timeout = 30
max_retries = 3
dead_letter_queue = "mafia-arena-dlq"
```

## File Structure

```
/src/worker/
├── index.ts              # Entry point + queue consumer
├── GameRunner.ts         # Durable Object (from M2)
├── api/
│   ├── router.ts         # Route handling
│   ├── games.ts          # Game endpoints
│   └── middleware.ts     # Auth, validation, etc.
├── ai/                   # (from M2)
└── utils/
```

## Acceptance Criteria

- [ ] `POST /api/games/run` enqueues games correctly
- [ ] Queue consumer creates DO instances
- [ ] Multiple games can run concurrently (10+)
- [ ] Failed games are retried automatically
- [ ] `GET /api/games` returns completed games
- [ ] `GET /api/games/:id` returns game details
- [ ] Dead letter queue captures permanently failed games

## Deploy Checklist

1. Create queue: `wrangler queues create mafia-arena-games`
2. Create DLQ: `wrangler queues create mafia-arena-dlq`
3. Update wrangler.toml with queue bindings
4. Deploy: `wrangler deploy`

## Estimated Effort

- **Time:** 1-2 days
- **Files:** ~5 new files
- **Deploy:** Queue + API update

## Next Milestone

After completion, proceed to [M4: Database + Stats](./04-database.md).

