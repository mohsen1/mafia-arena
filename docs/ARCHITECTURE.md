# Mafia Arena Backend Architecture

> Generated: December 25, 2025  
> A comprehensive technical reference for the Mafia Arena AI benchmarking platform.

---

## Table of Contents

**Part 1: System Overview & Core Architecture**
- [1.1 Executive Summary](#11-executive-summary)
- [1.2 High-Level Architecture](#12-high-level-architecture)
- [1.3 Technology Stack](#13-technology-stack)
- [1.4 Core Components Overview](#14-core-components-overview)
- [1.5 Cloudflare Platform Integration Patterns](#15-cloudflare-platform-integration-patterns)

**Part 2: Component Deep Dives**
- [2.1 Durable Object: GameRunner](#21-durable-object-gamerunner)
- [2.2 AI Provider Architecture](#22-ai-provider-architecture)
- [2.3 Queue System](#23-queue-system)
- [2.4 Database Schema](#24-database-schema)
- [2.5 R2 Storage Layout](#25-r2-storage-layout)

**Part 3: Patterns & Operations**
- [3.1 The Suspense Pattern](#31-the-suspense-pattern)
- [3.2 Error Handling & Recovery](#32-error-handling--recovery)
- [3.3 Observability & Monitoring](#33-observability--monitoring)
- [3.4 Game Data Flow](#34-game-data-flow)
- [3.5 Operational Runbook](#35-operational-runbook)
- [3.6 Security Model](#36-security-model)
- [3.7 Future Considerations](#37-future-considerations)

---

# Part 1: System Overview & Core Architecture

## 1.1 Executive Summary

**Mafia Arena** is a scalable, serverless AI benchmarking platform designed to evaluate Large Language Models (LLMs) by pitting them against each other in the social deduction game *Mafia*.

Unlike standard benchmarks (MMLU, GSM8K) that test static knowledge, Mafia Arena evaluates:
- **Theory of Mind:** The ability to model other players' hidden knowledge.
- **Persuasion & Deception:** The ability to convince others or detect lies.
- **Long-context Reasoning:** Maintaining consistency over a multi-round game.

The backend is built entirely on the **Cloudflare Developer Platform**, utilizing an event-driven, distributed architecture to manage game state, handle long-running LLM inference, and aggregate complex analytics (ELO ratings, win rates) in real-time.

---

## 1.2 High-Level Architecture

The system utilizes a **Suspense/Resume** pattern to handle slow LLM responses within the constraints of serverless execution.

```
                                      ┌──────────────────┐
                                      │  OpenRouter API  │
                                      └────────▲─────────┘
                                               │
┌──────────────┐                      ┌────────┴─────────┐
│  Web Client  │◄──────WebSocket─────►│   GameRunner     │◄───┐
│  (Frontend)  │                      │ (Durable Object) │    │
└──────┬───────┘                      └────────┬─────────┘    │
       │                                       │              │
       │ HTTP POST                             │ (1) Suspend  │ (3) Callback
       │ /api/games/run                        │ & Queue      │ POST /internal
       ▼                                       ▼              │
┌──────────────┐                      ┌──────────────────┐    │
│  API Gateway │                      │ AI_REQUEST_QUEUE │    │
│   (Worker)   │                      └────────┬─────────┘    │
└──────┬───────┘                               │              │
       │                                       │ (2) Process  │
       │ (Batch Split)                         ▼              │
       │                              ┌──────────────────┐    │
       ├─────────────────────────────►│   Queue Consumer │────┘
       │                              │     (Worker)     │
       ▼                              └──────────────────┘
┌──────────────┐
│  Persistence │
├──────────────┤
│      D1      │◄─── Game Records, Leaderboards, Stats
│   (SQLite)   │
├──────────────┤
│      R2      │◄─── Transcripts, Checkpoints, Large Payloads
│   (Bucket)   │
├──────────────┤
│      KV      │◄─── Rate Limits, Model Metadata Cache
│  (Key-Value) │
└──────────────┘
```

**Key Request Flow:**
1. **Game Initialization:** API receives a request, creates a record in **D1**, and triggers the **GameRunner DO**.
2. **Game Loop:** The DO executes the game engine logic. When an AI action is needed:
   - The `GameAIAdapter` throws a `SuspenseError`.
   - The DO catches this, saves state (Checkpoint), and pushes a message to `AI_REQUEST_QUEUE`.
   - The DO hibernates to save costs.
3. **Async Inference:** A Worker consumes the queue, calls the LLM (via OpenRouter), and POSTs the result back to the DO.
4. **Resumption:** The DO wakes up, rehydrates state from R2/Storage, feeds the cached AI response to the engine, and continues the loop.

---

## 1.3 Technology Stack

The codebase relies exclusively on Cloudflare primitives, ensuring zero cold-start latency and global distribution.

| Component | Technology | Usage in Mafia Arena |
| :--- | :--- | :--- |
| **Runtime** | **Cloudflare Workers** | Host for the Hono API, Queue Consumers, and Cron Triggers. |
| **Framework** | **Hono** | Lightweight web framework for routing, middleware (Auth, CORS, RateLimit), and error handling. |
| **Compute** | **Durable Objects (DO)** | `GameRunner`: Provides strong consistency, WebSocket termination, and state management for active games. |
| **Database** | **D1 (SQLite)** | Relational data: Games, Participants, Leaderboards, ELO ratings, and Batch Configs. |
| **Storage** | **R2** | Object storage: JSON Game Transcripts, Event Streams (for active games), and "Claim Check" payloads for large queue messages. |
| **Queues** | **Cloudflare Queues** | Asynchronous processing: `BATCH_QUEUE` (splitting jobs), `GAME_QUEUE` (starting games), `AI_REQUEST_QUEUE` (LLM inference). |
| **Cache** | **KV** | High-speed cache: Rate limiting counters, System Circuit Breakers, and OpenRouter Model Metadata. |
| **Monitoring** | **Analytics Engine** | Real-time metrics ingestion for cost tracking and token usage. |

---

## 1.4 Core Components Overview

### A. API Gateway (`index.ts` & `routes/`)
The entry point for all traffic. It handles:
- **Validation:** Zod schemas for game configuration.
- **Batch Processing:** Accepts requests for 100+ games, creating a `Batch` record in D1 and queuing processing.
- **Admin Tools:** Endpoints for manual game termination (`kill-hanging`), re-queueing DLQ messages, and syncing models.
- **Stats Aggregation:** Complex SQL queries over D1 to calculate win rates and correlations.

### B. GameRunner (`GameRunner.ts`)
A Durable Object that encapsulates a single game session.
- **State Management:** Persists game state to R2 (to bypass DO 128KB storage limits) while keeping lightweight pointers in DO storage.
- **Broadcasting:** Manages WebSocket connections for live frontend streaming.
- **Idempotency:** Ensures game results are written to D1/R2 exactly once using atomic DB transactions.
- **Heartbeat:** Updates a timestamp to allow external monitors to detect "stuck" games.

### C. AI Orchestration Layer (`ai/`)
- **GameAIAdapter:** Adapts the pure game engine interfaces to Cloudflare infrastructure. Implements the **Suspense Pattern**.
- **SummarizationService:** Automatically compresses game history using LLMs when context windows (fetched from KV) are exceeded.
- **Factory:** Routes requests to `OpenRouterProvider` or `MockE2EProvider` (for zero-cost testing).

### D. Batch Service (`batch/service.ts`)
Manages large-scale experiments.
- Splits large batch requests into individual messages to avoid queue limits.
- Tracks progress (Completed/Failed counts) in D1.
- Estimates costs based on token usage heuristics.

---

## 1.5 Cloudflare Platform Integration Patterns

### The "Claim Check" Pattern
To handle context windows larger than Cloudflare Queue limits (128KB), the system uses R2 as an intermediate buffer.
- **In `GameRunner.ts`:** If an AI prompt is too large, it is uploaded to R2.
- **In Queue:** A lightweight message containing only the `requestRef` (R2 Key) is sent.
- **In Worker:** The consumer downloads the full prompt from R2 before calling the LLM.

### The "Active Punt" Mechanism
To recover from infrastructure glitches (e.g., lost callbacks) without manual intervention.
- **Scheduled Task:** A cron job runs every 10 minutes (`scheduled/cleanup.ts`).
- **Logic:** It identifies games that haven't updated recently but aren't fully "stale."
- **Action:** It sends a `POST /punt` to the specific Durable Object.
- **Recovery:** The DO checks its internal storage for cached AI responses that weren't processed and resumes execution.

### Discount Pricing Architecture
The system supports a "Discount" mode for lower-priority, lower-cost inference.
- **Config:** `discountPricing: true` flag in game config.
- **Behavior:** Increases timeouts from 60s to **24 hours**.
- **Impact:** Durable Objects may hibernate for long periods. State persistence in R2 becomes critical here to survive eviction during long waits.

---

# Part 2: Component Deep Dives

## 2.1 Durable Object: GameRunner

The `GameRunner` is the central orchestrator. It encapsulates a single game session, manages the game loop, persists state, and broadcasts updates via WebSockets. Because AI calls are long-running (up to 60s+), the GameRunner utilizes a **Suspense Pattern** to hibernate while waiting for responses, rather than blocking the isolate.

### Lifecycle & State Management
The DO uses a hybrid persistence strategy to overcome the 128KB Durable Object storage limit:
1. **Metadata (DO Storage):** Tiny pointers and status flags are stored in KV-like DO storage.
2. **Game State (R2):** Full serialized game engine state is checkpointed to R2 after every phase.

**Key Storage Keys (`STORAGE_KEYS`):**
- `status`: Current state (`idle`, `running`, `completed`, `failed`).
- `checkpointMeta`: Pointer to the latest R2 checkpoint (`{ r2Key: string, round: number, phase: string }`).
- `aiResponses`: Map of cached AI responses waiting to be processed (Suspense Pattern).
- `heartbeat`: Timestamp updated every 15s to prove liveness to the admin monitor.
- `config`: The full game configuration object.

### Core Methods

#### `handleStart(request)`
Initializes the game. It supports two modes:
- **Synchronous:** Awaits completion (used for tests/CLI).
- **Background (`ctx.waitUntil`):** Returns immediately via `runGameWithErrorHandling`. This is used for live games to allow the HTTP request to complete while the DO continues running and streaming via WebSocket.

#### `runGame()`
The main execution loop. It:
1. Loads state from R2 if resuming (eviction recovery).
2. Instantiates the `Game` engine.
3. Registers the `onEvent` callback for WebSocket streaming.
4. Registers `onPhaseComplete` to trigger R2 checkpointing.
5. Catches `SuspenseError` thrown by the AI Adapter when an AI response is missing.

#### `handleAICallback(request)`
The re-entry point for the Suspense Pattern.
1. Receives a POST from the Queue Worker containing the AI response.
2. Stores the response in `STORAGE_KEYS.AI_RESPONSES`.
3. Triggers a resume of the game loop via `runGameWithErrorHandling`.
4. Implements debouncing (`RESUME_DEBOUNCE_MS`) to prevent race conditions when multiple AI agents respond simultaneously.

#### `handleWebSocket(request)`
Manages real-time clients.
- **Sync:** Sends full event history on connection.
- **Broadcast:** Sends `stripEventForStorage(event)` to all clients on new events. Large prompts/responses are stripped to save bandwidth.

---

## 2.2 AI Provider Architecture

The AI layer abstracts model differences, handles rate limits, and enforces structured output (JSON) regardless of the underlying model's native capabilities.

### Unified Gateway Architecture
All production models (OpenAI, Anthropic, Google Gemini, Llama, etc.) are routed through **OpenRouter**. This simplifies authentication, rate limiting, and pricing logic into a single implementation. Direct provider APIs are not used.

### Factory Pattern (`ai/factory.ts`)
The system routes requests based on the model ID:
- **Test Models (`test/*`):** routed to `MockE2EProvider` (zero-cost, deterministic responses for CI/CD).
- **Production Models:** routed to `OpenRouterProvider` via the unified gateway.

### GameAIAdapter (`ai/GameAIAdapter.ts`)
This adapter sits between the Game Engine (pure logic) and the Cloudflare Worker environment.
- **Context Management:** Checks `contextLimits.ts` (cached in KV). If the prompt exceeds the model's limit, it triggers the `SummarizationService` to compress game history.
- **Resilience:** The `RetryingProvider` wrapper handles exponential backoff and rate limit headers automatically.
- **Suspense Mode:** Instead of `await fetch()`, it:
  1. Checks `checkCache(requestId)` in DO storage.
  2. If found, returns the response.
  3. If missing, queues a message to `AI_REQUEST_QUEUE` and throws `SuspenseError`.

### Structured Output & Validation
To ensure the Game Engine receives valid data:
1. **Schema Definition:** Zod schemas defined in `ai/schemas.js` (`PersonaSchema`, `KillVoteSchema`, etc.).
2. **Schema Injection:**
   - *Tier 1:* Native Tool Use / JSON Schema (OpenAI/Anthropic).
   - *Tier 2:* JSON Mode (Generic).
   - *Tier 3:* Prompt Engineering (Fallback).
3. **Validation:** The adapter parses the JSON and runs `schema.parse()`.
4. **Fallback:** If parsing fails after retries, `GameAIAdapter` generates a safe fallback action (e.g., "Abstain from voting") to prevent game crashes.

---

## 2.3 Queue System

The platform uses three distinct Cloudflare Queues to handle asynchronous workloads and the Suspense Pattern.

### 1. Batch Queue (`BATCH_QUEUE`)
- **Purpose:** Splitting large batch requests (e.g., "Run 1000 games") into individual game messages.
- **Consumer:** `handleBatchMessage`
- **Logic:** Iterates `config.totalGames`, generates unique Game IDs, and dispatches messages to the Game Queue in chunks of 100.

### 2. Game Queue (`GAME_QUEUE`)
- **Purpose:** Triggering the start of a game.
- **Consumer:** `handleGameMessage`
- **Logic:** `stub.fetch('/start')`. If the DO is already running, it absorbs the request idempotently.

### 3. AI Request Queue (`AI_REQUEST_QUEUE`)
- **Purpose:** Offloading long-running AI inference from the DO.
- **Pattern:** **Claim Check Pattern**.
  - If the payload < 100KB: Sent directly in the queue message.
  - If the payload > 100KB: Payload stored in R2 (`requests/{requestId}.json`), queue message contains `requestRef`.
- **Smart Consumer Logic:** Before executing expensive AI calls, the consumer performs validation:
  - **TTL Check:** Messages older than 10 minutes (`AI_REQUEST_TTL_MS`) are immediately acknowledged and dropped to clear backlogs from failed games.
  - **Liveness Check:** Queries D1 to ensure the target game is still in `running` status. If the game has failed or completed, the request is dropped.
- **Consumer:** `handleAIRequestMessage`
  1. TTL and liveness validation (see above).
  2. Rehydrates request from R2 if needed (Claim Check).
  3. Calls `OpenRouterProvider.complete()`.
  4. POSTs result back to DO: `http://internal/internal/ai-callback`.
- **Retry Logic:** Exponential backoff (10s, 20s, 40s...) up to 5 attempts before DLQ.

### Dead Letter Queue (DLQ)
Failed messages from any queue are logged to the `dlq_entries` D1 table via `logToDlq`. The Admin API provides endpoints to inspect, retry, or discard these messages.

---

## 2.4 Database Schema

The system uses Cloudflare D1 (SQLite) for relational data.

### Core Tables

#### `games`
The primary record for a game session.
```sql
CREATE TABLE games (
  id TEXT PRIMARY KEY,
  batch_id TEXT,
  status TEXT CHECK (status IN ('running', 'completed', 'failed')),
  winner TEXT CHECK (winner IN ('mafia', 'town')),
  rounds INTEGER,
  total_tokens INTEGER,
  discount_pricing INTEGER DEFAULT 0, -- 1 = High latency allowed
  last_activity INTEGER,              -- For stale game detection
  trace_id TEXT,                      -- Distributed tracing
  ...
);
```

#### `game_participants`
Links models to games and tracks outcomes.
```sql
CREATE TABLE game_participants (
  id TEXT PRIMARY KEY, -- Composite: {gameId}_{modelId}_{team}
  game_id TEXT,
  model_id TEXT,
  team TEXT,
  won INTEGER DEFAULT 0
);
```

#### `leaderboard`
Aggregated stats for fast leaderboard rendering.
```sql
CREATE TABLE leaderboard (
  model_id TEXT,
  team TEXT,
  games_played INTEGER,
  games_won INTEGER,
  total_tokens INTEGER,
  PRIMARY KEY (model_id, team)
);
```

#### `batches`
Tracks progress of large jobs.
```sql
CREATE TABLE batches (
  id TEXT PRIMARY KEY,
  total_games INTEGER,
  completed_games INTEGER,
  failed_games INTEGER,
  estimated_cost_usd REAL,
  actual_cost_usd REAL
);
```

#### `models`
Registry of available AI models, synced from OpenRouter. Includes ELO ratings.
```sql
CREATE TABLE models (
  id TEXT PRIMARY KEY,
  provider TEXT,
  config TEXT, -- JSON containing pricing and context limits
  elo_rating INTEGER,
  elo_games_played INTEGER
);
```

---

## 2.5 R2 Storage Layout

Cloudflare R2 is used for large object storage, specifically game transcripts and state checkpoints.

### Bucket Structure

#### 1. Game Transcripts
- **Key:** `games/{gameId}/transcript.json`
- **Content:** The final, immutable record of a completed game. Includes configuration, full event log, token usage, and winner.
- **Usage:** Served via API for the frontend "Replay" view.

#### 2. Live Event Streams
- **Key:** `games/{gameId}/events-stream.json`
- **Content:** Appended list of events for currently running games.
- **Usage:** Used by the GameRunner to restore the event log if the DO is evicted/hibernated mid-game.

#### 3. State Checkpoints
- **Key:** `games/{gameId}/checkpoints/round_{N}_{phase}.json`
- **Content:** Full serialized state of the Game Engine (`SerializedGameState`).
- **Usage:** Allows the GameRunner to resume execution from the exact state after a hibernation period. This bypasses the 128KB DO storage limit.

#### 4. Large Request Payloads (Claim Check)
- **Key:** `games/{gameId}/requests/{requestId}.json`
- **Content:** The full OpenAI-compatible JSON request body.
- **Lifecycle:** Created by GameRunner before queuing; Deleted by Queue Worker after processing.

---

# Part 3: Patterns & Operations

## 3.1 The Suspense Pattern

The most critical architectural pattern in Mafia Arena is the **"Suspense Pattern"**. Because Cloudflare Durable Objects charge based on wall-clock time (GB-sec), waiting 60+ seconds for an LLM response inside a DO is prohibitively expensive.

We implement an asynchronous **Suspend-Resume** cycle that allows the DO to hibernate while waiting for AI, reducing costs by ~95%.

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SUSPENSE PATTERN FLOW                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Game Engine ──► GameAIAdapter ──► checkCache(requestId)                   │
│       │                                    │                                │
│       │                          ┌────────┴────────┐                       │
│       │                          │                 │                       │
│       │                    [CACHE HIT]       [CACHE MISS]                  │
│       │                          │                 │                       │
│       │                    Return cached     Queue request to              │
│       │                    AI response       AI_REQUEST_QUEUE              │
│       │                          │                 │                       │
│       │                          │           throw SuspenseError           │
│       │                          │                 │                       │
│       │                          │     ┌───────────┴───────────┐           │
│       │                          │     │                       │           │
│       │                          │     ▼                       │           │
│       │                          │  GameRunner catches,        │           │
│       │                          │  saves checkpoint to R2,    │           │
│       │                          │  hibernates DO              │           │
│       │                          │                       │           │
│       │                          │     ┌───────────────────────┤           │
│       │                          │     │ Queue Worker:         │           │
│       │                          │     │ 1. TTL/Liveness check │           │
│       │                          │     │ 2. Fetch from R2      │           │
│       │                          │     │ 3. Call OpenRouter    │           │
│       │                          │     │ 4. POST to DO callback│           │
│       │                          │     └───────────────────────┤           │
│       │                          │                             │           │
│       │                          │     DO wakes, stores        │           │
│       │                          │     response in cache,      │           │
│       │                          │     resumes game loop       │           │
│       ▼                          ▼                             │           │
│  Continue game ◄─────────── Response returned ◄────────────────┘           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Components

1. **SuspenseError**: A custom error thrown by `GameAIAdapter` when a response isn't cached. It halts the game engine execution stack immediately.
2. **Checkpoint on Suspend**: When `SuspenseError` is caught, the GameRunner saves the full game state to R2 **immediately** (not just on phase complete). This ensures `isResuming=true` works correctly if the DO is evicted during the wait.
3. **Claim Check Pattern**: Cloudflare Queues have a 128KB limit. If an AI prompt exceeds this, `GameRunner` offloads the payload to R2 and sends a reference (`requestRef`) to the queue.
4. **Request ID Determinism**: Request IDs are generated deterministically (`hash(gameId + round + phase + playerId + actionType)`). This ensures that when the DO wakes up and replays the game loop, it finds the exact response it was waiting for.

### State Management & Pruning

The system uses different pruning strategies depending on when checkpoints are saved:

- **On Suspend**: State is saved to R2, but cached AI responses are **kept** (pruning = false) because they are needed for the replay/resume.
- **On Phase Complete**: State is saved to R2, and cached AI responses are **pruned** (deleted). Since the phase is finalized, those responses are baked into the game history and no longer needed in the hot cache.

---

## 3.2 Error Handling & Recovery

The system employs a multi-layered defense against failure, critical for long-running autonomous simulations.

### Layer 1: Network & Provider (Transient)
- **RetryingProvider**: Wraps AI calls with exponential backoff.
- **Rate Limits**: Handles HTTP 429s by parsing `Retry-After` headers.
- **Non-Retryable Errors**: HTTP 402 (Payment), 403 (Auth), 400/404 (Invalid Model) are not retried.
- **Failover**: (Future) Can switch models if primary provider is down.

### Layer 2: Content & Parsing (Logic)
- **Schema Validation**: Zod schemas enforce strict output formats.
- **Auto-Healing**: Uses `jsonrepair` to fix malformed JSON from LLMs.
- **Fallbacks**: If parsing fails after max retries, `GameAIAdapter` generates a safe fallback action (e.g., "Abstain from voting") to prevent the game from crashing.

### Layer 3: Smart Queue Consumer
The AI queue consumer performs validation before making expensive AI calls:
- **TTL Check**: Messages older than 10 minutes are dropped to clear queue backlogs from failed games.
- **Liveness Check**: Queries D1 to verify game is still `running`. Non-running games have requests dropped.
- **Claim Check Rehydration**: Large payloads are fetched from R2; missing R2 objects are gracefully handled.

### Layer 4: Infrastructure (System)
- **Dead Letter Queue (DLQ)**: Failed queue messages (Game or AI requests) are moved to the `dlq_entries` D1 table after max attempts. Admin APIs allow inspection and replay.
- **Circuit Breaker**: Global `processing_paused` flag in KV/D1 stops all queue processing during outages.

### Layer 5: Stale Game Recovery ("Active Punt")
A scheduled cron job runs every 10 minutes to detect stuck games.
1. **Detection**: Identifies games in `running` state with no `last_activity` for >10 mins (Standard) or >2 hours (Discount).
2. **Active Punt**: Before killing a game, the cron sends a `/punt` request to the DO. This wakes the DO up to check if it has cached AI responses that were received but failed to trigger a resume (e.g., due to a callback race condition).
3. **Termination**: If punting fails, the game is marked `failed` in D1 to correct stats.

---

## 3.3 Observability & Monitoring

### Structured Logging
We use a custom logger (`utils/logger.ts`) that emits structured JSON.
- **Contextual**: Every log includes `gameId`, `batchId`, and `traceId`.
- **Levels**: Debug (dev), Info (milestones), Warn (recoverable), Error (fatal).

### Analytics Engine
Real-time metrics are pushed to Cloudflare Analytics Engine for Grafana/Dashboard visualization:
- **Dimensions**: Model ID, Winner, Batch ID.
- **Metrics**: Tokens Used, Duration, Cost (USD).

### Health Endpoints
- `/health`: Simple "up" check.
- `/health/deep`: Verifies connectivity to D1, R2, and KV.
- `/api/games/:id/health`: Introspects a specific DO's heartbeat and internal state.

---

## 3.4 Game Data Flow

The lifecycle of data from request to persistence.

1. **Initialization**:
   - API receives `POST /run`.
   - Validates config → Creates Batch ID → Enqueues to `GAME_QUEUE`.
2. **Execution**:
   - Worker consumes Queue → Spawns `GameRunner` DO.
   - DO initializes `Game` engine.
   - **Checkpointing**: After every Phase, full game state is serialized to R2 (`games/{id}/checkpoints/...`). A tiny pointer is saved to DO storage. This bypasses DO storage limits (128KB).
3. **Streaming**:
   - Events are buffered in memory.
   - Every 5 events (or critical events), logs are appended to `games/{id}/events-stream.json` in R2.
   - WebSockets receive stripped events (large prompts removed) for live UI.
4. **Completion**:
   - Game Engine returns `GameResult`.
   - **Transcript**: Full JSON transcript uploaded to R2 (`games/{id}/transcript.json`).
   - **Stats**: Atomic SQL batch transaction updates:
     - `games` table (status: completed).
     - `game_participants` (win/loss).
     - `leaderboard` (aggregate stats).
     - `daily_stats` (cost tracking).
     - `models` (ELO rating calculation).

---

## 3.5 Operational Runbook

### Common Scenarios & Commands

#### 1. System is overwhelmed / API Outage
**Action:** Pause all queue processing immediately.
```bash
# Via API
curl -X POST https://mafia-arena.me-f9a.workers.dev/api/admin/system/pause \
  -H "Authorization: Basic <admin_creds>"

# Via Wrangler (Emergency)
npx wrangler kv:key put RATE_LIMIT SYSTEM_PAUSED true
```

#### 2. A Batch is stuck (Processing 0/1000 for hours)
**Diagnosis:** Check for DLQ entries or stuck DOs.
```sql
-- Check DLQ
SELECT * FROM dlq_entries WHERE status = 'pending';

-- Check for stuck games
SELECT COUNT(*) FROM games WHERE status = 'running' AND last_activity < unixepoch() - 3600;
```

**Remediation:** Kill hanging games to free up concurrency slots.
```bash
curl -X POST https://mafia-arena.me-f9a.workers.dev/api/admin/games/kill-hanging \
  -H "Authorization: Basic <admin_creds>"
```

#### 3. Replaying Failed Messages
**Action:** Retry messages from the Dead Letter Queue.
```bash
# Get DLQ ID first
curl https://mafia-arena.me-f9a.workers.dev/api/admin/dlq?status=pending

# Retry specific message
curl -X POST https://mafia-arena.me-f9a.workers.dev/api/admin/dlq/<id>/retry
```

#### 4. Syncing New Models
**Action:** Pull latest model definitions and pricing from OpenRouter.
```bash
curl -X POST https://mafia-arena.me-f9a.workers.dev/api/admin/models/sync
```

#### 5. Debugging a Specific Game
**Action:** Tail logs for a specific trace ID.
```bash
npx wrangler tail | grep "tr_m5abc123"
```

#### 6. Checking Game Health
```bash
# Check a specific game's DO health
curl https://mafia-arena.me-f9a.workers.dev/api/games/<game_id>/health

# Example response:
# {
#   "status": "running",
#   "heartbeat": 1735123456789,
#   "eventCount": 42,
#   "aiProgress": { "cached": 3, "expected": 7 }
# }
```

#### 7. Manual Game Termination
```bash
# Kill a specific stuck game
curl -X POST https://mafia-arena.me-f9a.workers.dev/api/admin/games/<game_id>/kill \
  -H "Authorization: Basic <admin_creds>"
```

---

## 3.6 Security Model

### Authentication
- **Public API**: Open access (read-only stats/leaderboards).
- **Protected API**: `Basic Auth` required for `/api/admin/*` routes (Batches, System Control).
- **Database**: No public connection; accessed only via Worker bindings.

### Rate Limiting
- **Strategy**: Token Bucket via KV.
- **Limits**:
  - `POST /run`: 10/min (prevent wallet drain).
  - `GET /`: 100/min (prevent scraping abuse).
- **Batch Protection**: Stricter limits on large batch creation (1 per 5 mins per IP).

### Secrets Management
- **Storage**: Cloudflare Encrypted Secrets (`wrangler secret put`).
- **Keys**: `OPENROUTER_API_KEY`, `ADMIN_PASSWORD`.
- **Leak Prevention**: Logs strip API keys; Transcripts strip system prompts if configured.

---

## 3.7 Future Considerations

### Known Limitations
1. **D1 Concurrency**: SQLite writes are serialized. High-throughput batches (>500 games/min) might hit lock contention during stats updates. *Mitigation: Batch updates or move analytics to ClickHouse.*
2. **DO Hibernation**: While efficient, the "wake up" latency adds overhead.
3. **R2 Consistency**: Event streaming relies on R2 eventual consistency; extremely rare race conditions could lose a stream chunk during rapid crashes.

### Scaling Roadmap
1. **Sharding**: If D1 hits limits, shard `games` table by date or batch ID.
2. **WebSockets**: Currently handled by single DO. For >10k viewers/game, implement a Fanout/Relay Worker pattern.
3. **Cost Optimization**: Implement "Discount Pricing" mode fully to use Provider Batch APIs (50% cost reduction for 24h turnaround).

### Potential Improvements
- **Human-in-the-loop**: Allow human players to join via WebSocket (requires UI update).
- **New Roles**: Add Doctor/Cop roles to the Engine (engine is extensible).
- **Fine-tuning**: Use R2 transcripts to fine-tune open-source models for better game logic.

---

*Last updated: December 26, 2025 - Updated with TTL/Liveness checks, checkpoint-on-suspend, and pruning fixes*

