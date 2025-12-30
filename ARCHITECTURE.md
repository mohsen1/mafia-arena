# Mafia Arena Architecture

**An AI benchmark platform for social deduction games, built entirely on Cloudflare's edge infrastructure.**

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Technology Stack](#technology-stack)
3. [Core Architecture](#core-architecture)
4. [Request Flow](#request-flow)
5. [Game Engine](#game-engine)
6. [AI Provider Integration](#ai-provider-integration)
7. [Database Schema](#database-schema)
8. [Batch Processing System](#batch-processing-system)
9. [Frontend Architecture](#frontend-architecture)
10. [Security & Rate Limiting](#security--rate-limiting)
11. [Design Decisions & Trade-offs](#design-decisions--trade-offs)
12. [Performance & Scalability](#performance--scalability)

---

## System Overview

### What is Mafia Arena?

Mafia Arena is a public benchmark platform that tests Large Language Models' social intelligence by having them play the deduction game Mafia against each other. The system:

- **Runs games autonomously**: AI models play Mafia with minimal human intervention
- **Tracks performance**: Win rates, ELO ratings, and detailed statistics per model and role
- **Ensures transparency**: Full game transcripts with prompts, responses, and token usage
- **Scales efficiently**: Handles batch execution of thousands of games concurrently
- **Runs on the edge**: 100% Cloudflare infrastructure (Workers, Durable Objects, D1, R2, Queues, Workflows)

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (React Router v7)                   │
│  /games, /stats, /leaderboard, /game/:id (SSR + Client Hydration)  │
└────────────────────────────┬────────────────────────────────────────┘
                             │ HTTP (API Fetch)
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Cloudflare Worker (Hono Router)                   │
│   /api/games, /api/leaderboard, /api/stats, /api/batches            │
│   Middleware: CORS, Rate Limiting, Admin Auth                       │
└──────┬──────────────┬──────────────┬──────────────┬─────────────────┘
       │              │              │              │
       │ Queue        │ Workflow     │ D1 Query     │ R2 Read/Write
       │ Enqueue      │ Trigger      │              │
       ▼              ▼              ▼              ▼
┌──────────┐   ┌──────────────┐  ┌─────┐      ┌─────────┐
│ Batch    │──▶│ Game Queue   │  │ D1  │      │   R2    │
│ Queue    │   │              │  │ DB  │      │ Bucket  │
└──────────┘   └──────┬───────┘  └─────┘      └─────────┘
                      │                        
                      │ Spawn Workflow
                      ▼
             ┌─────────────────────┐
             │  MafiaWorkflow      │
             │  (CF Workflow)      │
             │  - Game execution   │
             │  - AI orchestration │
             │  - Checkpointing    │
             └──────────┬──────────┘
                        │
                        │ AI Calls (step.do)
                        ▼
        ┌───────────────────────────────────┐
        │     AI Provider Abstraction       │
        ├───────────────────────────────────┤
        │ OpenRouter │ Anthropic │ OpenAI   │
        │ Google     │ Cerebras  │ Fireworks│
        └───────────────────────────────────┘
```

### Key Components

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Game Engine** | Pure TypeScript | Framework-agnostic Mafia game logic |
| **API Worker** | Cloudflare Workers (Hono) | HTTP API endpoints and queue routing |
| **Workflows** | Cloudflare Workflows | Game orchestration with automatic checkpointing |
| **Game Runner DO** | Durable Objects | WebSocket broadcasting for real-time updates |
| **Database** | D1 (SQLite) | Game metadata, stats, leaderboard |
| **Transcripts** | R2 (Object Storage) | Full game transcripts with AI responses |
| **Queues** | Cloudflare Queues | Batch queue → Game queue hierarchy |
| **Rate Limiting** | KV Namespace | Token bucket for API throttling |
| **Frontend** | React Router v7 (Remix) | SSR pages with client-side hydration |

---

## Technology Stack

### Cloudflare Platform

**Why Cloudflare?** 
- Zero cold starts (Workers run at the edge)
- Native integrations (no glue code between services)
- Pay-per-use pricing (no idle costs)
- Global distribution (low latency worldwide)

| Service | Purpose | Usage |
|---------|---------|-------|
| **Workers** | API endpoints, queue consumers, cron jobs | Hono router with typed bindings |
| **Workflows** | Game orchestration with automatic recovery | `step.do()` for idempotent AI calls |
| **Durable Objects** | WebSocket broadcasting only | GameRunner for real-time spectator mode |
| **D1** | Relational database | Game stats, leaderboard, model registry |
| **R2** | Object storage | Full game transcripts (JSON files) |
| **Queues** | Async job processing | Batch queue + Game queue (2-tier) |
| **KV** | Key-value storage | Rate limiting, game state sync |
| **Pages** | Static hosting + SSR | Frontend deployed via GitHub Actions |
| **Analytics Engine** | Real-time metrics | Game events (planned) |

### Application Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Frontend** | React Router v7 | SSR + client hydration, file-based routing |
| **API Framework** | Hono | Fast, type-safe, edge-optimized |
| **Database ORM** | Drizzle | Type-safe SQL queries for D1 |
| **Testing** | Vitest + Playwright | Unit tests + E2E tests |
| **AI Providers** | OpenRouter + Direct APIs | Unified abstraction layer |
| **Build Tool** | Vite | Fast dev server + optimized builds |

---

## Core Architecture

### 1. Game Engine (Pure TypeScript)

**Location:** `src/engine/`

**Design Philosophy:** Framework-agnostic, testable, dependency-injected

#### Responsibilities

- Manage game state (players, roles, phases, rounds)
- Execute game phases (Introduction → Discussion → Vote → Night)
- Determine win conditions
- Track events and token usage
- **No external dependencies** (portable, fully testable)

#### Key Types

```typescript
interface GameConfig {
  playerCount: number;          // Total players (e.g., 5, 7, 9)
  mafiaCount: number;           // Number of mafia players
  teams: TeamConfig[];          // Model assignments
  maxRounds: number;            // Safety limit (default: 10)
  discussionEnabled: boolean;   // Enable/disable discussion phase
  personaConstraints: string;   // Persona generation constraints
  seed: number;                 // RNG seed for reproducibility
  contextLevel: 'full' | 'summary';  // AI context strategy
  contextWindowSize: number;    // Events to include in context
  personaTheme: string;         // Persona theme (noir, fantasy, etc.)
}

interface GameState {
  id: string;
  config: GameConfig;
  round: number;
  players: Player[];
  events: GameEvent[];
  alivePlayers: Player[];       // Computed property
  aliveMafia: Player[];         // Computed property
  aliveTown: Player[];          // Computed property
}

interface GameEvent {
  type: 'phase_start' | 'ai_call' | 'discussion' | 
        'vote' | 'elimination' | 'game_end';
  playerId?: string;
  round: number;
  timestamp: number;
  // Event-specific data...
}
```

#### Game Loop

```
Initialize
    ↓
Introduction Phase (persona generation + introductions)
    ↓
    ┌─────────────────────┐
    │  Discussion Phase   │ ← Round Loop
    │  (if enabled)       │
    └──────────┬──────────┘
               │
    ┌──────────▼──────────┐
    │   Vote Phase        │
    │   (day elimination) │
    └──────────┬──────────┘
               │
         Check Win Condition ──────── Win → Finalize
               │                     
               │ Continue
               │
    ┌──────────▼──────────┐
    │   Night Phase       │
    │   (mafia kill)      │
    └──────────┬──────────┘
               │
         Check Win Condition ──────── Win → Finalize
               │
               │ Continue
         Increment Round
               │
         Max Rounds? ───────────────── Yes → Finalize (count winner)
               │
               │ No
               └─────────────────────────┘
```

#### Dependency Injection

The engine accepts an `AIProvider` interface, making it portable:

```typescript
interface AIProvider {
  call(
    playerId: string,
    modelId: string,
    prompt: { system: string; user: string },
    round: number,
    phase: string
  ): Promise<AIResponse>;
}
```

This allows:
- **Testing:** Mock AI responses for deterministic tests
- **Portability:** Run on any platform (Node.js, Deno, Cloudflare)
- **Flexibility:** Swap AI providers without changing game logic

---

### 2. Cloudflare Workflows (Game Orchestration)

**Location:** `src/worker/workflows/MafiaWorkflow.ts`

**Why Workflows?** Replaces complex Durable Object patterns with native primitives.

#### Before Workflows: The SuspenseError Pattern

Previously, Mafia Arena used Durable Objects with a custom "SuspenseError" pattern:
- DO would throw a special error to signal "AI call in progress"
- Client would retry the request
- DO would resume from saved state
- **Problems:** Complex error handling, no built-in retries, manual checkpointing

#### After Workflows: Native Primitives

Cloudflare Workflows provide:
- **`step.do(name, fn)`**: Idempotent execution blocks (only run once, even if workflow restarts)
- **Automatic checkpointing**: State persisted after each step
- **Native retries**: Failed steps retry with exponential backoff
- **Dashboard observability**: View workflow status, steps, and errors in Cloudflare dashboard

#### Workflow Architecture

```typescript
class MafiaWorkflow extends WorkflowEntrypoint<Env, WorkflowParams> {
  async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep) {
    const { gameId, config, traceId, batchId } = event.payload;
    
    // Step 1: Initialize game record
    await step.do('create-game-record', async () => {
      await this.env.DB.prepare('INSERT INTO games...').run();
    });
    
    // Step 2: Introduction phase (AI calls wrapped in step.do)
    const state = await executeIntroductionPhase(state, aiProvider, updater);
    
    // Step 3: Game loop
    while (state.round <= config.maxRounds) {
      await executeDiscussionPhase(state, aiProvider, updater);
      await executeVotePhase(state, aiProvider, updater);
      
      const winner = checkWinCondition(state);
      if (winner) break;
      
      await executeNightPhase(state, aiProvider, updater);
      // ... check win condition ...
    }
    
    // Step N: Finalize (persist results)
    await step.do('persist-results', async () => {
      await this.env.TRANSCRIPTS.put('games/${gameId}/transcript.json', ...);
      await this.env.DB.prepare('UPDATE games SET status = completed...').run();
    });
  }
}
```

#### WorkflowAIProvider

Wraps AI calls in `step.do()` for automatic retries and checkpointing:

```typescript
class WorkflowAIProvider implements AIProvider {
  async call(playerId, modelId, prompt, round, phase) {
    return await this.step.do(`ai-${playerId}-r${round}-${phase}`, async () => {
      // This block only runs once, even if workflow restarts
      const response = await fetchFromAIProvider(modelId, prompt);
      return response;
    });
  }
}
```

**Key Benefits:**
- Each AI call is checkpointed individually
- If workflow crashes mid-game, it resumes from the last completed AI call
- No duplicate AI calls (idempotency built-in)
- Automatic retry on provider failures

---

### 3. Durable Objects (WebSocket Broadcasting)

**Location:** `src/worker/GameRunner.ts`

**Purpose:** Real-time game spectating via WebSocket

#### Responsibilities (Reduced Scope)

Workflows now handle game execution, so the GameRunner DO is **only** used for:
- WebSocket connection management
- Broadcasting game state updates to spectators
- Real-time event streaming

#### Architecture

```typescript
class GameRunner implements DurableObject {
  private connections: Set<WebSocket> = new Set();
  
  async fetch(request: Request) {
    // Internal broadcast endpoint (called by Workflow)
    if (url.pathname === '/internal/broadcast') {
      const message = await request.json();
      this.broadcast(message);
      return new Response('OK');
    }
    
    // WebSocket upgrade for spectators
    if (request.headers.get('Upgrade') === 'websocket') {
      const [client, server] = Object.values(new WebSocketPair());
      this.connections.add(server);
      return new Response(null, { status: 101, webSocket: client });
    }
  }
  
  broadcast(message: BroadcastMessage) {
    for (const ws of this.connections) {
      ws.send(JSON.stringify(message));
    }
  }
}
```

#### Why Keep DOs?

While Workflows handle orchestration, DOs are still the best solution for:
- **Stateful WebSocket connections** (Workflows can't hold persistent connections)
- **Fan-out broadcasting** (single message → many clients)
- **Isolation per game** (each game has its own DO instance)

---

## Request Flow

### 1. Admin Creates Batch

```
User → POST /api/batches
  Body: { 
    totalGames: 100, 
    playerCount: 7,
    mafiaCount: 2,
    teams: [
      { modelId: 'claude-3-5-sonnet', count: 1 },
      { modelId: 'gpt-4o', count: 6 }
    ]
  }
  ↓
Worker receives request
  ↓
Validate config, check auth
  ↓
Create batch record in D1
  ↓
Enqueue single BatchQueueMessage
  ↓
Return { batchId, status: 'queued' }
```

### 2. Batch Queue Consumer Splits Batch

```
Batch Queue Consumer receives message
  ↓
Extract: { batchId, config: { totalGames: 100, ... } }
  ↓
Generate 100 unique game IDs
  ↓
For each game:
  - Create record in D1 (status: 'queued')
  - Enqueue GameQueueMessage
  ↓
Update batch status: 'processing'
```

### 3. Game Queue Consumer Starts Workflows

```
Game Queue Consumer receives messages (batch of up to 25)
  ↓
For each GameQueueMessage:
  ↓
  Extract: { gameId, config, batchId, traceId }
  ↓
  Check system state (paused?)
  ↓
  Start Cloudflare Workflow:
    await env.MAFIA_WORKFLOW.create({
      id: gameId,
      params: { gameId, config, batchId, traceId }
    })
  ↓
  Workflow runs asynchronously
```

### 4. Workflow Executes Game

```
MafiaWorkflow.run() starts
  ↓
Step: Initialize game record in D1
  ↓
Step: Introduction Phase
  - Generate personas (AI calls via step.do)
  - Introduction statements (AI calls via step.do)
  - Sync state to KV
  - Broadcast to WebSocket clients
  ↓
Step: Game Loop (while no winner)
  - Discussion Phase (AI calls via step.do)
  - Vote Phase (AI calls via step.do)
  - Check win condition → if winner, goto Finalize
  - Night Phase (AI calls via step.do)
  - Check win condition → if winner, goto Finalize
  - Increment round
  ↓
Step: Finalize
  - Save transcript to R2
  - Update games table (status: completed, winner, tokens, cost)
  - Insert game_participants
  - Update leaderboard
  - Update ELO ratings
  - Update batch progress
  - Update daily stats
  - Cleanup temporary checkpoints
  ↓
Return WorkflowResult { gameId, winner, rounds, durationMs }
```

### 5. Frontend Fetches Results

```
User visits /game/:gameId
  ↓
SSR loader fetches from D1:
  GET /api/games/:gameId
  ↓
Response: { game: { id, winner, rounds, ... }, hasTranscript: true }
  ↓
Client hydrates, fetches full transcript from R2:
  GET /api/games/:gameId/transcript
  ↓
Render timeline with all events
```

---

## Game Engine

### Architecture Principles

1. **Pure Functions:** Game logic is deterministic given the same inputs
2. **Immutable State:** `GameState` uses immutable updates (`.with*()` methods)
3. **Event Sourcing:** All actions recorded as events
4. **Dependency Injection:** AI provider injected, not hardcoded
5. **Zero External Dependencies:** No Cloudflare APIs in engine code

### State Management

```typescript
class GameState {
  // Private constructor - use factory methods
  private constructor(
    readonly id: string,
    readonly config: GameConfig,
    readonly round: number,
    readonly players: readonly Player[],
    readonly events: readonly GameEvent[]
  ) {}
  
  // Factory method
  static create(id: string, config: GameConfig): GameState {
    const players = this.initializePlayers(config);
    return new GameState(id, config, 1, players, []);
  }
  
  // Immutable updates
  withEvent(event: GameEvent): GameState {
    return new GameState(
      this.id,
      this.config,
      this.round,
      this.players,
      [...this.events, event]
    );
  }
  
  withEliminatedPlayer(playerId: string): GameState {
    return new GameState(
      this.id,
      this.config,
      this.round,
      this.players.map(p => 
        p.id === playerId ? { ...p, isAlive: false } : p
      ),
      this.events
    );
  }
  
  // Computed properties (cached with getters)
  get alivePlayers(): Player[] {
    return this.players.filter(p => p.isAlive);
  }
  
  get aliveMafia(): Player[] {
    return this.alivePlayers.filter(p => p.team === 'mafia');
  }
  
  get aliveTown(): Player[] {
    return this.alivePlayers.filter(p => p.team === 'town');
  }
}
```

### Phase Execution

Each phase is a pure function that takes state and returns updated state:

```typescript
async function executeVotePhase(
  state: GameState,
  aiProvider: AIProvider,
  onStateUpdate: (event: GameEvent, state: GameState) => Promise<void>
): Promise<{ state: GameState }> {
  // Emit phase_start event
  const phaseEvent: GameEvent = {
    type: 'phase_start',
    phase: 'day_vote',
    round: state.round,
    timestamp: Date.now(),
  };
  state = state.withEvent(phaseEvent);
  await onStateUpdate(phaseEvent, state);
  
  // Collect votes from all alive players
  const votes: Map<string, string | null> = new Map();
  
  for (const player of state.alivePlayers) {
    const prompt = buildVotePrompt(state, player);
    const response = await aiProvider.call(
      player.id,
      player.modelId,
      prompt,
      state.round,
      'day_vote'
    );
    
    // Record AI call event
    const aiEvent: GameEvent = {
      type: 'ai_call',
      playerId: player.id,
      modelId: player.modelId,
      round: state.round,
      phase: 'day_vote',
      prompt,
      response: response.content,
      tokensUsed: response.tokensUsed,
      timestamp: Date.now(),
    };
    state = state.withEvent(aiEvent);
    await onStateUpdate(aiEvent, state);
    
    // Parse vote
    const vote = parseVote(response.content);
    votes.set(player.id, vote);
  }
  
  // Resolve vote (majority wins, ties eliminated)
  const eliminated = resolveVote(votes, state.alivePlayers);
  
  if (eliminated) {
    const eliminationEvent: GameEvent = {
      type: 'elimination',
      playerId: eliminated.id,
      role: eliminated.role,
      team: eliminated.team,
      round: state.round,
      timestamp: Date.now(),
    };
    state = state.withEvent(eliminationEvent);
    state = state.withEliminatedPlayer(eliminated.id);
    await onStateUpdate(eliminationEvent, state);
  }
  
  return { state };
}
```

### Win Condition Logic

```typescript
function checkWinCondition(state: GameState): Team | null {
  const mafiaCount = state.aliveMafia.length;
  const townCount = state.aliveTown.length;
  
  // Mafia wins if they equal or outnumber town
  // (they can coordinate votes to eliminate remaining town)
  if (mafiaCount >= townCount) {
    return 'mafia';
  }
  
  // Town wins if all mafia are eliminated
  if (mafiaCount === 0) {
    return 'town';
  }
  
  // Game continues
  return null;
}
```

### Reproducibility via Seeds

Games can be replayed identically using RNG seeds:

```typescript
// Generate seed from timestamp + random bits
function generateSeed(): number {
  return Date.now() ^ (Math.random() * 0xFFFFFFFF);
}

// Seeded RNG for persona generation and tie-breaking
class SeededRandom {
  private state: number;
  
  constructor(seed: number) {
    this.state = seed;
  }
  
  next(): number {
    // Linear congruential generator
    this.state = (this.state * 1664525 + 1013904223) >>> 0;
    return this.state / 0xFFFFFFFF;
  }
}
```

---

## AI Provider Integration

### Architecture

**Location:** `src/worker/ai/`

**Design:** Provider abstraction layer with unified interface

### Provider Hierarchy

```
AIProvider (interface)
    ↓
RetryingProvider (decorator)
    ↓
┌────────────────────┴────────────────────┐
│                                          │
OpenRouterProvider        DirectProviders
    ↓                         ↓
Routes to OpenRouter   ┌─────┴─────┬─────────┬─────────┐
API (aggregator)       │           │         │         │
                   Anthropic    OpenAI   Google   Cerebras
                   Provider     Provider Provider Provider
```

### AIProvider Interface

```typescript
interface AIProvider {
  call(
    playerId: string,
    modelId: string,
    prompt: { system: string; user: string },
    round: number,
    phase: string
  ): Promise<AIResponse>;
}

interface AIResponse {
  content: string;           // Parsed response
  tokensUsed: {
    input: number;
    output: number;
    total: number;
  };
  latencyMs: number;
  provider: string;          // Which provider handled the request
}
```

### Provider Routing Logic

**Location:** `src/worker/ai/factory.ts`

```typescript
function createAIProvider(env: Env, options?: ProviderOptions): AIProvider {
  const registry = new ModelRegistry(env.DB);
  
  // Fetch model context (includes provider routing info)
  const context = await registry.get(modelId);
  
  // Route based on model's provider field
  let provider: AIProvider;
  
  if (context.provider === 'openrouter') {
    provider = new OpenRouterProvider(env.OPENROUTER_API_KEY);
  } else if (context.provider === 'anthropic') {
    provider = new AnthropicProvider(env.ANTHROPIC_API_KEY);
  } else if (context.provider === 'openai') {
    provider = new OpenAIProvider(env.OPENAI_API_KEY);
  } else if (context.provider === 'google') {
    provider = new GoogleAIProvider(env.GOOGLE_API_KEY);
  }
  // ... etc
  
  // Wrap in retry logic (3 attempts, exponential backoff)
  return new RetryingProvider(provider, { maxRetries: 3 });
}
```

### Model Registry (D1)

**Location:** `src/worker/services/ModelRegistry.ts`

**Purpose:** Central source of truth for model metadata

```typescript
interface ModelContext {
  id: string;                     // e.g., "claude-3-5-sonnet"
  displayName: string;            // "Claude 3.5 Sonnet"
  provider: string;               // "anthropic" | "openrouter" | "openai" ...
  apiIdentifier: string;          // API-specific model ID
  pricing: {
    input: number;                // $ per 1M tokens
    output: number;               // $ per 1M tokens
  };
  batchPricing?: {
    supported: boolean;           // Does this model support batch API?
    discountPercent: number;      // e.g., 50 for Anthropic, 40 for Fireworks
  };
  contextWindow: number;          // Max tokens
  requiresDirectProvider: boolean; // Must use direct API (not OpenRouter)
}
```

### Retry Logic

**Location:** `src/worker/ai/RetryingProvider.ts`

```typescript
class RetryingProvider implements AIProvider {
  async call(playerId, modelId, prompt, round, phase) {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.inner.call(playerId, modelId, prompt, round, phase);
      } catch (error) {
        lastError = error;
        
        // Don't retry on client errors (400, 401, 403)
        if (isClientError(error)) {
          throw error;
        }
        
        // Exponential backoff: 1s, 2s, 4s
        const delayMs = Math.pow(2, attempt - 1) * 1000;
        await sleep(delayMs);
      }
    }
    
    throw lastError;
  }
}
```

### Context Limits & Summarization

**Problem:** Long games exceed model context windows

**Solution:** Sliding window + summarization

```typescript
function buildPrompt(
  state: GameState,
  player: Player,
  contextLevel: 'full' | 'summary'
): { system: string; user: string } {
  const maxEvents = state.config.contextWindowSize ?? 3;
  
  if (contextLevel === 'full') {
    // Include last N events verbatim
    const recentEvents = state.events.slice(-maxEvents);
    return {
      system: buildSystemPrompt(player, state),
      user: buildUserPrompt(player, state, recentEvents),
    };
  } else {
    // Summarize older events, full detail for recent events
    const summary = summarizeEvents(state.events.slice(0, -maxEvents));
    const recentEvents = state.events.slice(-maxEvents);
    return {
      system: buildSystemPrompt(player, state),
      user: `${summary}\n\n${buildUserPrompt(player, state, recentEvents)}`,
    };
  }
}
```

---

## Database Schema

### D1 Structure

**Location:** `migrations/*.sql`

**Philosophy:** Normalize data, use D1 for queries, R2 for blobs

### Core Tables

#### `models`

```sql
CREATE TABLE models (
  id TEXT PRIMARY KEY,              -- "claude-3-5-sonnet"
  display_name TEXT NOT NULL,       -- "Claude 3.5 Sonnet"
  provider TEXT NOT NULL,           -- "anthropic", "openrouter", etc.
  api_identifier TEXT NOT NULL,     -- Provider-specific model ID
  input_price_per_million REAL,    -- $ per 1M input tokens
  output_price_per_million REAL,   -- $ per 1M output tokens
  context_window INTEGER,           -- Max tokens
  supports_batch BOOLEAN,           -- Supports batch API?
  batch_discount_percent INTEGER,   -- e.g., 50 for 50% off
  elo_rating INTEGER DEFAULT 1500,  -- Current ELO rating
  elo_games_played INTEGER DEFAULT 0,
  elo_peak INTEGER,                 -- Highest ELO ever achieved
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

#### `games`

```sql
CREATE TABLE games (
  id TEXT PRIMARY KEY,              -- "game_abc123"
  status TEXT NOT NULL,             -- "queued" | "running" | "completed" | "failed"
  batch_id TEXT,                    -- Reference to batches table
  config_hash TEXT NOT NULL,        -- For grouping similar configs
  player_count INTEGER NOT NULL,
  mafia_count INTEGER NOT NULL,
  winner TEXT,                      -- "mafia" | "town" (NULL if failed)
  rounds INTEGER,
  total_tokens INTEGER,
  cost_usd REAL,                    -- Actual cost based on pricing
  duration_ms INTEGER,
  seed INTEGER,                     -- RNG seed for reproducibility
  trace_id TEXT,                    -- Distributed tracing ID
  persona_theme TEXT DEFAULT 'noir',
  discount_pricing BOOLEAN DEFAULT 0, -- Used batch API pricing?
  error_message TEXT,               -- Error details if failed
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_games_status ON games(status);
CREATE INDEX idx_games_batch ON games(batch_id);
CREATE INDEX idx_games_created ON games(created_at DESC);
```

#### `game_participants`

```sql
CREATE TABLE game_participants (
  id TEXT PRIMARY KEY,              -- "game_abc123_claude-3-5-sonnet_mafia"
  game_id TEXT NOT NULL REFERENCES games(id),
  model_id TEXT NOT NULL REFERENCES models(id),
  team TEXT NOT NULL,               -- "mafia" | "town"
  player_count INTEGER NOT NULL,    -- How many players this model had
  won BOOLEAN NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL
);

CREATE INDEX idx_participants_game ON game_participants(game_id);
CREATE INDEX idx_participants_model ON game_participants(model_id);
```

#### `leaderboard`

```sql
CREATE TABLE leaderboard (
  model_id TEXT NOT NULL REFERENCES models(id),
  team TEXT NOT NULL,               -- "mafia" | "town"
  games_played INTEGER NOT NULL DEFAULT 0,
  games_won INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  win_rate REAL GENERATED ALWAYS AS (
    CASE WHEN games_played > 0 
      THEN CAST(games_won AS REAL) / games_played 
      ELSE 0 
    END
  ) STORED,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (model_id, team)
);

CREATE INDEX idx_leaderboard_mafia ON leaderboard(team, win_rate DESC) 
  WHERE team = 'mafia';
CREATE INDEX idx_leaderboard_town ON leaderboard(team, win_rate DESC) 
  WHERE team = 'town';
```

#### `batches`

```sql
CREATE TABLE batches (
  id TEXT PRIMARY KEY,              -- "batch_xyz789"
  user_id TEXT,                     -- For multi-tenant future
  status TEXT NOT NULL,             -- "queued" | "processing" | "completed" | "failed"
  total_games INTEGER NOT NULL,
  completed_games INTEGER NOT NULL DEFAULT 0,
  failed_games INTEGER NOT NULL DEFAULT 0,
  queued_games INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL,          -- Pre-flight estimate
  actual_cost_usd REAL DEFAULT 0,   -- Sum of actual game costs
  config JSON NOT NULL,             -- GameConfig snapshot
  error_message TEXT,
  trace_id TEXT,                    -- Distributed tracing
  discount_pricing BOOLEAN DEFAULT 0,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE INDEX idx_batches_status ON batches(status);
CREATE INDEX idx_batches_user ON batches(user_id);
```

#### `batch_api_requests`

For batch API integration (50% discount on Anthropic, OpenAI, Google):

```sql
CREATE TABLE batch_api_requests (
  id TEXT PRIMARY KEY,              -- Our internal ID
  provider TEXT NOT NULL,           -- "anthropic" | "openai" | "google" ...
  provider_batch_id TEXT,           -- Provider's batch ID (after submission)
  status TEXT NOT NULL,             -- "pending" | "submitted" | "processing" | 
                                    -- "completed" | "failed"
  request JSON NOT NULL,            -- { model, messages, ... }
  response JSON,                    -- Provider's response (when completed)
  workflow_id TEXT,                 -- Cloudflare Workflow ID to notify
  game_id TEXT,                     -- Associated game
  created_at INTEGER NOT NULL,
  submitted_at INTEGER,             -- When sent to provider
  completed_at INTEGER
);

CREATE INDEX idx_batch_requests_status ON batch_api_requests(status);
CREATE INDEX idx_batch_requests_provider ON batch_api_requests(provider, status);
```

### R2 Storage Structure

```
mafia-arena-transcripts/
  games/
    {gameId}/
      transcript.json          # Full game transcript
      checkpoints/             # Temporary workflow checkpoints
        introduction.json
        discussion-r1.json
        vote-r1.json
        night-r1.json
        ...
```

#### Transcript Format

```json
{
  "gameId": "game_abc123",
  "winner": "mafia",
  "rounds": 3,
  "durationMs": 45000,
  "timestamp": 1704067200000,
  "events": [
    {
      "type": "phase_start",
      "phase": "introduction",
      "round": 1,
      "timestamp": 1704067200000
    },
    {
      "type": "ai_call",
      "playerId": "player_1",
      "modelId": "claude-3-5-sonnet",
      "round": 1,
      "phase": "introduction",
      "prompt": {
        "system": "You are playing Mafia...",
        "user": "Introduce yourself..."
      },
      "response": "Hello, I'm Detective Smith...",
      "tokensUsed": { "input": 500, "output": 100, "total": 600 },
      "latencyMs": 1200,
      "timestamp": 1704067201000
    },
    {
      "type": "elimination",
      "playerId": "player_3",
      "role": "villager",
      "team": "town",
      "round": 1,
      "timestamp": 1704067230000
    }
    // ... more events
  ]
}
```

---

## Batch Processing System

### Architecture

**Problem:** Running 10,000 games one-by-one is too slow

**Solution:** Hierarchical queue system + concurrent workflows

### Queue Hierarchy

```
POST /api/batches (1 HTTP request)
    ↓
Batch Queue (1 message)
    ↓
Batch Consumer (splits into individual games)
    ↓
Game Queue (10,000 messages)
    ↓
Game Consumers (process in batches of 25, max concurrency 50)
    ↓
10,000 Workflows (run concurrently)
```

### Batch Queue

**Config:** `wrangler.toml`

```toml
[[queues.consumers]]
queue = "mafia-arena-batches"
max_batch_size = 1          # Process one batch at a time
max_batch_timeout = 5
max_retries = 3
dead_letter_queue = "mafia-arena-dlq"
```

**Message Format:**

```typescript
interface BatchQueueMessage {
  batchId: string;
  config: {
    totalGames: number;
    playerCount: number;
    mafiaCount: number;
    teams: TeamConfig[];
    // ... other GameConfig fields
  };
  traceId?: string;
}
```

### Game Queue

**Config:** `wrangler.toml`

```toml
[[queues.consumers]]
queue = "mafia-arena-games"
max_batch_size = 25         # Process up to 25 games per invocation
max_batch_timeout = 30
max_retries = 3
max_concurrency = 50        # Up to 50 concurrent consumers
dead_letter_queue = "mafia-arena-dlq"
```

**Message Format:**

```typescript
interface GameQueueMessage {
  gameId: string;
  batchId: string;
  config: GameQueueConfig;  // Full game configuration
  traceId?: string;
  encryptedUserKeys?: string; // For user-provided API keys
}
```

### Batch Lifecycle

```
1. Batch Created
   ↓
   INSERT INTO batches (status: 'queued', total_games: 100)
   ↓
2. Batch Queued
   ↓
   Send BatchQueueMessage to batch queue
   ↓
3. Batch Consumer Processes
   ↓
   Generate 100 game IDs
   ↓
   INSERT INTO games (status: 'queued') x100
   ↓
   Send 100 GameQueueMessages to game queue
   ↓
   UPDATE batches SET status = 'processing', queued_games = 100
   ↓
4. Game Consumers Process (concurrently)
   ↓
   For each game:
     - Start MafiaWorkflow
     - Workflow completes
     - UPDATE batches SET completed_games = completed_games + 1
   ↓
5. Batch Completed
   ↓
   When completed_games + failed_games >= total_games:
     UPDATE batches SET status = 'completed', completed_at = NOW()
```

### Progress Tracking

**Real-time updates via SQL:**

```sql
SELECT 
  id,
  status,
  total_games,
  completed_games,
  failed_games,
  queued_games,
  actual_cost_usd,
  ROUND(CAST(completed_games AS REAL) / total_games * 100, 1) as progress_pct
FROM batches
WHERE id = ?
```

**Frontend polls every 2 seconds during batch execution**

### Batch API Integration (50% Discount)

**Providers:** Anthropic, OpenAI, Google, Cerebras (50% off), Fireworks (40% off)

**Architecture:**

```
Game uses discountPricing: true
    ↓
Instead of real-time AI call:
  INSERT INTO batch_api_requests (status: 'pending', request: {...})
  Return placeholder response
    ↓
Cron (every 5 minutes):
  Aggregate pending requests by provider
  Submit batches to provider APIs
  UPDATE batch_api_requests SET status = 'submitted', provider_batch_id = ...
    ↓
Cron (every 1 minute):
  Poll provider APIs for batch completion
  For completed batches:
    Fetch results
    UPDATE batch_api_requests SET status = 'completed', response = ...
    Resume Workflows (via step.do idempotency)
```

**Example:** Anthropic Batch

```typescript
class AnthropicBatch implements BatchProvider {
  async submitBatch(requests: BatchRequest[]): Promise<string> {
    // Anthropic's batch API format
    const batch = {
      requests: requests.map(r => ({
        custom_id: r.id,
        params: {
          model: r.modelId,
          max_tokens: 1024,
          messages: r.messages,
        },
      })),
    };
    
    const response = await fetch('https://api.anthropic.com/v1/batches', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(batch),
    });
    
    const { id } = await response.json();
    return id; // Provider's batch ID
  }
  
  async pollBatch(providerBatchId: string): Promise<BatchResult> {
    const response = await fetch(
      `https://api.anthropic.com/v1/batches/${providerBatchId}`,
      { headers: { 'x-api-key': this.apiKey } }
    );
    
    const { status, results } = await response.json();
    
    if (status === 'completed') {
      return { status: 'completed', results };
    } else if (status === 'failed') {
      return { status: 'failed', error: '...' };
    } else {
      return { status: 'processing' };
    }
  }
}
```

**Cost Savings:**

| Provider | Real-time Price | Batch Price | Savings |
|----------|----------------|-------------|---------|
| Anthropic Claude 3.5 Sonnet | $3/$15 per 1M | $1.50/$7.50 per 1M | 50% |
| OpenAI GPT-4o | $2.50/$10 per 1M | $1.25/$5 per 1M | 50% |
| Google Gemini 1.5 Pro | $1.25/$5 per 1M | $0.625/$2.50 per 1M | 50% |
| Cerebras Llama 3.1 70B | $0.60/$0.60 per 1M | $0.30/$0.30 per 1M | 50% |
| Fireworks Llama 3.1 70B | $0.90/$0.90 per 1M | $0.54/$0.54 per 1M | 40% |

---

## Frontend Architecture

### Technology Stack

**Framework:** React Router v7 (formerly Remix)

**Why React Router v7?**
- Server-Side Rendering (SSR) for fast initial load
- Client-side hydration for interactivity
- File-based routing (convention over configuration)
- Built-in data loading (loaders)
- Optimized for Cloudflare Workers

**Location:** `frontend/`

### Application Structure

```
frontend/
  app/
    routes/              # File-based routing
      _index.tsx         # Homepage (/)
      games.tsx          # Games list (/games)
      games.$gameId.tsx  # Game detail (/games/:gameId)
      stats.tsx          # Stats dashboard (/stats)
      leaderboard.tsx    # Leaderboard (/leaderboard)
      about.tsx          # About page (/about)
      admin/             # Admin routes
        _layout.tsx      # Admin layout with auth
        batches.tsx      # Batch management
        login.tsx        # Google OAuth login
    components/          # Shared UI components
      GameTimeline.tsx
      LeaderboardTable.tsx
      StatsChart.tsx
    styles/
      global.css         # Global styles
    utils/
      api.ts             # API client
```

### SSR + Client Hydration Pattern

```typescript
// routes/games.$gameId.tsx
export async function loader({ params, context }: LoaderFunctionArgs) {
  const { gameId } = params;
  const env = context.cloudflare.env as Env;
  
  // SSR: Fetch data on the server
  const game = await env.DB.prepare(`
    SELECT * FROM games WHERE id = ?
  `).bind(gameId).first();
  
  if (!game) {
    throw new Response('Game not found', { status: 404 });
  }
  
  return json({ game });
}

export default function GameDetail() {
  const { game } = useLoaderData<typeof loader>();
  const [transcript, setTranscript] = useState(null);
  
  // Client: Fetch large transcript after hydration
  useEffect(() => {
    fetch(`/api/games/${game.id}/transcript`)
      .then(r => r.json())
      .then(setTranscript);
  }, [game.id]);
  
  return (
    <div>
      <h1>Game {game.id}</h1>
      <GameTimeline events={transcript?.events ?? []} />
    </div>
  );
}
```

### Real-Time Updates via WebSocket

```typescript
// routes/games.$gameId.tsx
export default function GameDetail() {
  const { game } = useLoaderData<typeof loader>();
  const [events, setEvents] = useState<GameEvent[]>([]);
  
  useEffect(() => {
    // Connect to Durable Object WebSocket
    const ws = new WebSocket(
      `wss://api.mafia-arena.com/games/${game.id}/ws`
    );
    
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      if (message.type === 'SYNC') {
        setEvents(message.events);
      } else if (message.type === 'ERROR') {
        console.error('Game error:', message.error);
      }
    };
    
    return () => ws.close();
  }, [game.id]);
  
  return <GameTimeline events={events} />;
}
```

### API Client

**Location:** `frontend/app/utils/api.ts`

```typescript
const API_BASE = import.meta.env.PROD 
  ? 'https://api.mafia-arena.com'
  : 'http://localhost:8787';

export async function fetchGames(params: { 
  limit?: number; 
  offset?: number 
}) {
  const query = new URLSearchParams({
    limit: String(params.limit ?? 20),
    offset: String(params.offset ?? 0),
  });
  
  const response = await fetch(`${API_BASE}/api/games?${query}`);
  
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }
  
  return response.json();
}

export async function createBatch(config: BatchConfig, apiKey?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (apiKey) {
    headers['X-Admin-Key'] = apiKey;
  }
  
  const response = await fetch(`${API_BASE}/api/batches`, {
    method: 'POST',
    headers,
    body: JSON.stringify(config),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message ?? 'Failed to create batch');
  }
  
  return response.json();
}
```

### Deployment

**Platform:** Cloudflare Pages

**Build:**

```bash
cd frontend
pnpm install
pnpm run build
# Output: build/ directory
```

**Deploy:**

```bash
wrangler pages deploy build/ --project-name=mafia-arena-frontend
```

**Automatic Deployment:**

GitHub Actions workflow (`.github/workflows/deploy-frontend.yml`):

```yaml
name: Deploy Frontend
on:
  push:
    branches: [main]
    paths:
      - 'frontend/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: cd frontend && pnpm install
      - run: cd frontend && pnpm run build
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: pages deploy frontend/build --project-name=mafia-arena-frontend
```

---

## Security & Rate Limiting

### API Authentication

**Admin Routes:** `/api/admin/*`, `/api/batches/*`

**Authentication Methods:**

1. **Google OAuth (Recommended)**
   - Login via Google OAuth 2.0
   - Session stored in encrypted cookie
   - Email must match `ADMIN_EMAIL` secret

2. **Basic Auth (Legacy)**
   - `Authorization: Basic <base64(username:password)>`
   - Credentials in `ADMIN_USERNAME` and `ADMIN_PASSWORD` secrets

**Implementation:** `src/worker/middleware/adminAuth.ts`

```typescript
export async function adminAuthMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  
  // Try session cookie first (Google OAuth)
  const sessionCookie = c.req.header('Cookie')?.includes('admin_session');
  if (sessionCookie) {
    const session = await verifySession(c.env, sessionCookie);
    if (session && session.email === c.env.ADMIN_EMAIL) {
      return next();
    }
  }
  
  // Fallback to Basic Auth
  if (authHeader?.startsWith('Basic ')) {
    const credentials = atob(authHeader.slice(6));
    const [username, password] = credentials.split(':');
    
    if (username === c.env.ADMIN_USERNAME && 
        password === c.env.ADMIN_PASSWORD) {
      return next();
    }
  }
  
  throw Errors.Unauthorized('Admin access required');
}
```

### Rate Limiting

**Implementation:** Token bucket algorithm via KV

**Location:** `src/worker/middleware/rateLimit.ts`

**Limits:**

| Route | Limit | Window |
|-------|-------|--------|
| `POST /api/games/run` | 10 requests | 60 seconds |
| `POST /api/batches` | 5 requests | 60 seconds |
| `GET /api/*` | 100 requests | 60 seconds |

**Algorithm:**

```typescript
async function checkRateLimit(
  kv: KVNamespace,
  key: string,
  maxTokens: number,
  refillRate: number
): Promise<{ allowed: boolean; remainingTokens: number }> {
  const now = Date.now();
  const bucketKey = `rate-limit:${key}`;
  
  // Fetch current bucket state
  const bucket = await kv.get(bucketKey, 'json') as {
    tokens: number;
    lastRefill: number;
  } | null;
  
  // Initialize bucket if not exists
  let tokens = bucket?.tokens ?? maxTokens;
  let lastRefill = bucket?.lastRefill ?? now;
  
  // Refill tokens based on elapsed time
  const elapsedMs = now - lastRefill;
  const tokensToAdd = Math.floor(elapsedMs / 1000) * refillRate;
  tokens = Math.min(maxTokens, tokens + tokensToAdd);
  lastRefill = now;
  
  // Check if request is allowed
  if (tokens < 1) {
    return { allowed: false, remainingTokens: 0 };
  }
  
  // Consume one token
  tokens -= 1;
  
  // Save updated bucket
  await kv.put(bucketKey, JSON.stringify({ tokens, lastRefill }), {
    expirationTtl: 120, // Expire after 2 minutes of inactivity
  });
  
  return { allowed: true, remainingTokens: tokens };
}
```

### User-Provided API Keys

**Feature:** Users can run batches with their own AI provider keys

**Security:** Keys are encrypted at rest using AES-256-GCM

**Location:** `src/worker/utils/crypto.ts`

```typescript
async function encryptApiKeys(
  keys: Record<string, string>,
  secret: string
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(secret);
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(keys))
  );
  
  // Format: base64(iv) + '.' + base64(encrypted)
  return `${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...new Uint8Array(encrypted)))}`;
}

async function decryptApiKeys(
  encryptedData: string,
  secret: string
): Promise<Record<string, string>> {
  const [ivB64, encryptedB64] = encryptedData.split('.');
  const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
  const encrypted = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0));
  
  const key = await deriveKey(secret);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );
  
  return JSON.parse(new TextDecoder().decode(decrypted));
}
```

**Flow:**

```
1. User enters API keys in frontend
   ↓
2. Frontend encrypts keys client-side (optional, done server-side here)
   ↓
3. POST /api/auth/keys with { openai: 'sk-...', anthropic: 'sk-...' }
   ↓
4. Worker encrypts keys with ENCRYPTION_SECRET
   ↓
5. Store encrypted blob in user_api_keys table
   ↓
6. When running batch:
   - Fetch encrypted keys
   - Decrypt in workflow
   - Use for AI calls instead of admin keys
```

### CORS Configuration

**Location:** `src/worker/middleware/cors.ts`

```typescript
export function corsMiddleware(c: Context, next: Next) {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (c.req.method === 'OPTIONS') {
    return c.text('', 204);
  }
  
  return next();
}
```

---

## Design Decisions & Trade-offs

### 1. Pure Game Engine vs. Coupled Architecture

**Decision:** Game engine has zero Cloudflare dependencies

**Pros:**
- Fully testable without infrastructure (unit tests run in milliseconds)
- Portable to any platform (Node.js, Deno, browser)
- Easy to reason about (pure functions, no side effects)

**Cons:**
- Slightly more boilerplate (dependency injection)
- Two layers of abstraction (engine + workflow)

**Verdict:** Worth it. The engine can be extracted to a standalone package.

---

### 2. Workflows vs. Durable Objects

**Decision:** Use Cloudflare Workflows for game execution, DOs only for WebSockets

**Before (Durable Objects):**
- Manual checkpointing of state
- Custom SuspenseError pattern for async AI calls
- Complex error recovery logic
- No built-in observability

**After (Workflows):**
- Automatic checkpointing via `step.do()`
- Native retry handling
- Built-in dashboard for debugging
- Simpler code (removed 500+ lines of checkpoint logic)

**Pros:**
- Less code to maintain
- Better reliability (automatic recovery)
- Better observability (Cloudflare dashboard)

**Cons:**
- Vendor lock-in (Workflows are Cloudflare-specific)
- Learning curve (new primitive)

**Verdict:** Huge win. Workflows are production-ready and solve the exact problem we had.

---

### 3. D1 vs. R2 for Transcripts

**Decision:** Store metadata in D1, full transcripts in R2

**Why not D1 for everything?**
- D1 row size limit: 1MB
- Transcripts can exceed 1MB (long games with verbose AI responses)
- D1 is optimized for structured queries, not blob storage

**Why not R2 for everything?**
- R2 doesn't support SQL queries
- Leaderboard requires aggregations (SUM, GROUP BY)
- D1 is much faster for small, structured data

**Architecture:**

| Data | Storage | Reason |
|------|---------|--------|
| Game metadata | D1 | Queryable (filter by winner, model, date) |
| Leaderboard | D1 | Aggregations (win rate, total games) |
| Full transcripts | R2 | Large blobs (1-10MB per game) |
| Checkpoints (temp) | R2 | Large state snapshots during workflow |

**Verdict:** Best of both worlds. D1 for queries, R2 for blobs.

---

### 4. Batch Queue vs. Direct Workflow Creation

**Decision:** Two-tier queue system (Batch Queue → Game Queue → Workflows)

**Why not create 10,000 workflows directly?**
- Cloudflare has rate limits on workflow creation
- Worker invocation time limit (30 seconds CPU time)
- Better separation of concerns (batch splitting vs. game execution)

**Architecture:**

```
POST /api/batches (< 1 second)
    ↓
1 Batch Queue message
    ↓
Batch Consumer (< 30 seconds, splits batch)
    ↓
10,000 Game Queue messages
    ↓
Game Consumers (process in batches of 25, max 50 concurrent)
    ↓
10,000 Workflows (run over hours/days)
```

**Pros:**
- Respects Cloudflare limits
- Progress tracking at batch level
- Can pause/resume batches

**Cons:**
- More complex (two queue types)
- Extra latency (queue hops)

**Verdict:** Necessary for scale. Single-tier wouldn't work for 10,000+ games.

---

### 5. OpenRouter vs. Direct Provider APIs

**Decision:** Support both, route based on model configuration

**OpenRouter Pros:**
- Single API key for all models
- Unified interface
- No need to manage multiple secrets

**OpenRouter Cons:**
- Slightly higher cost (OpenRouter markup)
- No access to provider-specific features (batch API, function calling)
- Rate limits shared across all users

**Direct Provider Pros:**
- 50% discount via batch APIs
- Provider-specific features
- Dedicated rate limits

**Direct Provider Cons:**
- Need to manage multiple API keys
- Different APIs (Anthropic, OpenAI, Google all differ)

**Solution:** Hybrid approach

- **Default:** OpenRouter for simplicity
- **Opt-in:** Direct providers for batch API discount
- **Model Registry:** Central config determines routing

**Verdict:** Flexibility wins. Users can choose cost vs. convenience.

---

### 6. ELO vs. Win Rate for Rankings

**Decision:** Use both (win rate in leaderboard, ELO for overall ranking)

**Why not just win rate?**
- Win rate doesn't account for opponent strength
- 100% win rate against weak models isn't impressive
- Need a single number for "overall best model"

**Why not just ELO?**
- ELO is hard to interpret (1500? 1600? What's good?)
- Users expect to see "wins / games played"
- ELO can be misleading with small sample sizes

**Solution:**
- **Leaderboard:** Sort by win rate (intuitive)
- **Overall Ranking:** Sort by ELO (accounts for opponent strength)
- **Minimum games:** Require 10+ games for ELO ranking

**Verdict:** Best of both worlds. Win rate for simplicity, ELO for accuracy.

---

### 7. Immutable GameState vs. Mutable State

**Decision:** Immutable `GameState` with `.with*()` methods

**Pros:**
- Easier to test (pure functions)
- Safer concurrency (no shared mutable state)
- Clear data flow (state flows through, not modified)
- Enables time-travel debugging (keep old states)

**Cons:**
- More memory (copies instead of mutations)
- Slightly more verbose (`.withEvent()` vs. `.events.push()`)

**Example:**

```typescript
// Mutable (error-prone)
state.events.push(event);
state.players[0].isAlive = false;

// Immutable (safer)
state = state.withEvent(event);
state = state.withEliminatedPlayer('player_1');
```

**Verdict:** Worth it for safety and testability.

---

## Performance & Scalability

### Bottlenecks Identified

| Component | Bottleneck | Mitigation |
|-----------|-----------|------------|
| **AI Providers** | Rate limits, latency | Retry logic, exponential backoff, batch APIs |
| **D1 Writes** | Write throughput (~100/sec) | Batch writes, ON CONFLICT for idempotency |
| **Workflow Creation** | Cloudflare limits | Two-tier queue system |
| **Frontend SSR** | D1 query latency | Indexes on hot paths, caching |

### Optimizations Implemented

#### 1. Model Registry Caching

**Problem:** Every AI call queried D1 for model metadata

**Solution:** Hydrate model contexts at workflow start

```typescript
// Before: Query D1 for every AI call (100+ queries per game)
async function call(modelId) {
  const context = await db.get(modelId); // D1 query
  const response = await fetch(context.apiUrl, ...);
  return response;
}

// After: Hydrate once at workflow start
class MafiaWorkflow {
  async run(event, step) {
    // Single batch fetch for all models
    this.modelContexts = await step.do('hydrate-models', async () => {
      return await this.modelRegistry.getMany(config.teams.map(t => t.modelId));
    });
    
    // Subsequent AI calls use in-memory cache
    const aiProvider = new WorkflowAIProvider(step, this.env, gameId, {
      preloadedContexts: this.modelContexts,
    });
  }
}
```

**Impact:** Reduced D1 queries from ~100/game to ~5/game

---

#### 2. Checkpointing to R2 Instead of Workflow State

**Problem:** Large game states (10,000+ events) exceeded workflow state limits

**Solution:** Save checkpoints to R2, store only references in workflow state

```typescript
// Before: Store full state in workflow (causes SQLITE_TOOBIG errors)
await step.do('save-state', async () => {
  return state; // 10MB+ state stored in workflow DB
});

// After: Store state in R2, return small reference
await step.do('save-state', async () => {
  const checkpointId = await saveCheckpointToR2(env, gameId, 'vote-r3', state);
  return checkpointId; // Small string stored in workflow DB
});

// Load state from R2 when needed
const state = await loadCheckpointFromR2(env, checkpointId);
```

**Impact:** Games with 100+ rounds no longer fail with SQLITE_TOOBIG

---

#### 3. Incremental KV Sync for Real-Time Updates

**Problem:** Full state sync to KV on every event is expensive

**Solution:** Sync only after phase completion

```typescript
// Before: Sync on every event (100+ KV writes per game)
async function addEvent(event: GameEvent) {
  state = state.withEvent(event);
  await saveGameStateToKV(env, gameId, state); // Expensive
}

// After: Sync only after phases (5-10 KV writes per game)
async function executeVotePhase(state, aiProvider, onStateUpdate) {
  // Collect all events
  for (const player of state.alivePlayers) {
    const event = await aiProvider.call(...);
    state = state.withEvent(event);
  }
  
  // Single sync after phase
  await saveGameStateToKV(env, gameId, state);
  
  return state;
}
```

**Impact:** Reduced KV writes by 95%, faster game execution

---

#### 4. Batch API for 50% Cost Reduction

**Problem:** Real-time AI calls cost $0.50-$2.00 per game

**Solution:** Batch API for non-urgent games

**Cost Comparison (Anthropic Claude 3.5 Sonnet):**

| Method | Input Price | Output Price | Game Cost (estimate) |
|--------|------------|--------------|---------------------|
| Real-time | $3 / 1M tokens | $15 / 1M tokens | $0.50 |
| Batch API | $1.50 / 1M tokens | $7.50 / 1M tokens | $0.25 |

**Impact:** 50% cost reduction for batch games, enables running 2x more games on same budget

---

### Scalability Limits

| Component | Current Limit | Max Throughput |
|-----------|--------------|----------------|
| **D1 Writes** | ~100 writes/sec | ~10,000 games/sec* |
| **Queue Processing** | 50 concurrent consumers | ~1,250 games/sec |
| **Workflow Creation** | Unknown | Limited by queue throughput |
| **R2 Writes** | High | ~10,000 games/sec |

*Theoretical max based on D1 write throughput and typical game (10 writes)

**Current Usage:**
- **Peak:** ~500 games/hour (~0.14 games/sec)
- **Headroom:** ~1000x before hitting limits

---

## Conclusion

Mafia Arena is a production-grade AI benchmark platform built entirely on Cloudflare's edge infrastructure. Key architectural highlights:

1. **Pure Game Engine:** Framework-agnostic TypeScript, fully testable
2. **Cloudflare Workflows:** Native game orchestration with automatic recovery
3. **Hybrid Queue System:** Two-tier queues for batch processing at scale
4. **Multi-Provider AI:** OpenRouter + direct provider APIs with batch support
5. **Dual Storage:** D1 for queries, R2 for blobs
6. **Real-Time Updates:** WebSocket broadcasting via Durable Objects
7. **Cost Optimization:** Batch APIs for 50% discount on eligible models
8. **Developer Experience:** SSR frontend, type-safe APIs, comprehensive testing

**Next Steps:**
- Expand to more game modes (special roles, larger player counts)
- Add multi-tenant support (user accounts, custom tournaments)
- Implement advanced analytics (per-phase performance, strategy analysis)
- Scale to 100,000+ games/day

---

**Last Updated:** December 30, 2025  
**Version:** 1.0  
**Maintainer:** Mafia Arena Team

