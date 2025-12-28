# Mafia Arena: Product & Technical Requirements Document

**Version:** 1.2  
**Last Updated:** December 28, 2025  
**Status:** ✅ Approved  
**Revision Notes:** Final version - validated against codebase by Gemini 2.5 Pro (10/10 rating)  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Vision & Goals](#2-product-vision--goals)
3. [System Architecture Overview](#3-system-architecture-overview)
4. [Core Async Architecture](#4-core-async-architecture)
5. [Batch Processing System](#5-batch-processing-system)
6. [User & API Key Management](#6-user--api-key-management)
7. [Game Engine](#7-game-engine)
8. [Operational Scenarios](#8-operational-scenarios)
9. [Data Models](#9-data-models)
10. [Non-Functional Requirements](#10-non-functional-requirements)
11. [Advanced Features](#11-advanced-features)
    - Context Summarization
    - Output Validation & Repair
    - Distributed Tracing
    - Testing Infrastructure
    - Active Punt (Zombie Prevention)

---

## 1. Executive Summary

### What is Mafia Arena?

Mafia Arena is an **AI Social Intelligence Benchmark** platform that evaluates Large Language Models (LLMs) by having them play the social deduction game "Mafia" (Werewolf) against each other. Unlike traditional benchmarks that test coding or math skills, Mafia Arena measures:

- **Deception & Persuasion** — Can the model convincingly lie?
- **Deductive Reasoning** — Can the model identify hidden information from behavior?
- **Theory of Mind** — Does the model understand what other agents know/believe?
- **Persona Consistency** — Can the model maintain a character under pressure?

### Who is it for?

| Persona | Use Case |
|---------|----------|
| **AI Researchers** | Benchmark new models against SOTA (GPT-4o, Claude 3.5, Gemini) |
| **Model Developers** | Debug failure modes (e.g., "Why does my model reveal its role?") |
| **Enthusiasts** | Watch live AI battles and read transcripts |
| **Platform Admins** | Manage costs, run batch experiments, monitor system health |

### Key Differentiators

1. **Async-First Architecture** — Games hibernate during slow AI calls (no billing for idle time)
2. **50% Cost Savings** — Batch API integration with major providers
3. **ELO Rating System** — Statistical rankings with confidence intervals
4. **Full Transparency** — Every game generates a complete transcript with reasoning traces

---

## 2. Product Vision & Goals

### Vision Statement

> To become the industry standard for evaluating AI Social Intelligence—measuring a model's ability to understand hidden motives, maintain consistent personas, and navigate complex multi-agent dynamics.

### Primary Objectives

| Objective | Metric | Target |
|-----------|--------|--------|
| **Autonomous Simulation** | Game completion rate | >95% |
| **Cost Efficiency** | Batch API utilization | 50% cost reduction |
| **Benchmark Integrity** | ELO accuracy | Statistical significance at 100 games |
| **Scalability** | Concurrent games | 100+ per batch node |

### Success Metrics

- **Games Completed**: Total successful game simulations
- **ELO Stability**: Ranking variance after N games
- **Cost per Game**: Average USD spent per complete game
- **Persona Consistency Score**: AI adherence to assigned character

---

## 3. System Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           MAFIA ARENA ARCHITECTURE                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌──────────────┐      ┌──────────────┐      ┌────────────────────────────────┐│
│  │   Frontend   │─────▶│    Worker    │─────▶│     Durable Object (DO)        ││
│  │  (React RR7) │◀─────│    (Hono)    │◀─────│        GameRunner              ││
│  └──────────────┘      └──────────────┘      └────────────────────────────────┘│
│        │                     │                           │                      │
│        │                     │                           ▼                      │
│        │                ┌────┴────┐            ┌───────────────────┐           │
│        │                │   D1    │            │   Game Engine     │           │
│        │                │(SQLite) │            │ (Pure TypeScript) │           │
│        │                └─────────┘            └───────────────────┘           │
│        │                     │                           │                      │
│        │    ┌────────────────┼────────────────┬──────────┴──────────┐          │
│        │    │                │                │                     │          │
│        │    ▼                ▼                ▼                     ▼          │
│        │  ┌─────┐       ┌─────────┐     ┌───────────┐        ┌───────────┐    │
│        └─▶│ R2  │       │   KV    │     │  Queues   │        │    AI     │    │
│           │(S3) │       │(Cache)  │     │           │        │ Providers │    │
│           └─────┘       └─────────┘     └───────────┘        └───────────┘    │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Frontend** | React Router 7 + Cloudflare Pages | Game viewer, admin panel, leaderboards |
| **API Layer** | Cloudflare Workers + Hono | REST API, WebSocket upgrades, auth |
| **Game Orchestrator** | Durable Objects | Stateful game sessions, WebSocket hub |
| **Game Engine** | Pure TypeScript | Mafia rules, phase management, win conditions |
| **Database** | Cloudflare D1 (SQLite) | Stats, leaderboard, game metadata, batch tracking |
| **Object Storage** | Cloudflare R2 | Game transcripts, checkpoints, large payloads |
| **Cache** | Cloudflare KV | Sessions, rate limits, model lists |
| **Message Queue** | Cloudflare Queues | Game spawning, AI request offloading, batch jobs |
| **AI Providers** | OpenAI, Anthropic, Google, OpenRouter, etc. | LLM completions |

### Cloudflare Bindings

```typescript
interface Env {
  // Durable Objects
  GAME_RUNNER: DurableObjectNamespace;
  
  // Storage
  DB: D1Database;           // SQLite for structured data
  TRANSCRIPTS: R2Bucket;    // Game transcripts & checkpoints
  RATE_LIMIT: KVNamespace;  // Sessions, rate limits
  
  // Queues
  GAME_QUEUE: Queue;        // Game spawning
  AI_REQUEST_QUEUE: Queue;  // AI call offloading
  BATCH_QUEUE: Queue;       // Bulk game creation
  
  // AI Provider Keys
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  
  // Auth & Security
  ENCRYPTION_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  ADMIN_EMAIL?: string;
}
```

---

## 4. Core Async Architecture

### The Problem: Serverless Constraints

Cloudflare Durable Objects have hard limits:
- **30 second CPU time** before forced hibernation
- **128KB storage limit** per value
- **128MB memory limit** per DO

AI API calls can take **10-60+ seconds**. If the DO waits synchronously, it will:
1. Get evicted mid-request
2. Lose the in-flight promise
3. Restart and make the same call again → **infinite loop**

### The Solution: Suspense Pattern

We implemented an **Async Suspend-Resume Pattern** that allows the game engine to "pause" during AI calls and resume when results arrive.

> **⚠️ Important Distinction: Suspense vs Batch**
> - **Suspense Pattern**: Used for *ALL* async AI calls to handle DO timeout constraints. The DO hibernates while waiting, regardless of pricing mode.
> - **Batch Processing**: A *routing* decision for cost savings. When `discountPricing=true`, requests are sent to provider Batch APIs (50% discount, up to 24h latency) instead of real-time endpoints.
> 
> They are related but distinct: Suspense is *how* we wait; Batch is *where* we send the request.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SUSPENSE PATTERN FLOW                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Game Engine                GameRunner DO              Queue Worker        │
│       │                           │                          │              │
│       │  getAction(player)        │                          │              │
│       │─────────────────────────▶│                          │              │
│       │                           │                          │              │
│       │                           │ Check cache              │              │
│       │                           │────┐                     │              │
│       │                           │    │ MISS                │              │
│       │                           │◀───┘                     │              │
│       │                           │                          │              │
│       │   throw SuspenseError     │                          │              │
│       │◀─────────────────────────│                          │              │
│       │                           │                          │              │
│       │                           │ 1. Save checkpoint to R2 │              │
│       │                           │ 2. Queue AI request      │              │
│       │                           │─────────────────────────▶│              │
│       │                           │ 3. Hibernate             │              │
│       │                           │                          │              │
│       │                           │         (time passes)    │              │
│       │                           │                          │              │
│       │                           │                          │ Call AI API  │
│       │                           │                          │────┐         │
│       │                           │                          │    │         │
│       │                           │                          │◀───┘         │
│       │                           │                          │              │
│       │                           │   POST /internal/callback│              │
│       │                           │◀─────────────────────────│              │
│       │                           │                          │              │
│       │                           │ 4. Cache response        │              │
│       │                           │ 5. Load checkpoint       │              │
│       │                           │ 6. Resume game.run()     │              │
│       │                           │                          │              │
│       │  getAction(player)        │                          │              │
│       │─────────────────────────▶│                          │              │
│       │                           │ Check cache              │              │
│       │                           │────┐                     │              │
│       │                           │    │ HIT!                │              │
│       │                           │◀───┘                     │              │
│       │   return response         │                          │              │
│       │◀─────────────────────────│                          │              │
│       │                           │                          │              │
│       │   (game continues...)     │                          │              │
│       │                           │                          │              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Details

#### 1. SuspenseError

```typescript
// Thrown when AI response isn't cached yet
export class SuspenseError extends Error {
  constructor(
    public readonly requestId: string,
    public readonly modelId: string,
    public readonly reason: string
  ) {
    super(`Suspending for AI request: ${requestId}`);
  }
}
```

#### 2. GameAIAdapter (Cache-First Pattern)

```typescript
async getAction(context: GameContext, prompt: string): Promise<AIResponse> {
  // 1. Generate deterministic request ID
  const requestId = this.generateRequestId(context);
  
  // 2. Check cache FIRST
  const cached = await this.checkCache(requestId);
  if (cached) {
    return cached; // Resume path - return immediately
  }
  
  // 3. No cache hit - throw to suspend
  throw new SuspenseError(requestId, this.modelId, 'Waiting for AI response');
}
```

#### 3. Request ID Generation (Deterministic)

```typescript
// Must be deterministic so replays generate same ID
generateRequestId(context: AIContext, prompt: ActionPrompt): string {
  // Include discussionRound to differentiate multi-turn discussion phases
  const discussionRound = context.discussionRound ?? 0;
  const data = `${context.gameId}:${context.round}:${context.phase}:${context.playerId}:${prompt.type}:${discussionRound}`;
  
  // Simple hash for ID (deterministic)
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `req_${Math.abs(hash).toString(16)}`;
}
```

#### 4. Checkpoint to R2 (Bypass 128KB Limit)

```typescript
async saveCheckpoint(): Promise<void> {
  const state = this.game.serialize();
  const key = `checkpoints/${this.gameId}/${Date.now()}.json`;
  
  await this.env.TRANSCRIPTS.put(key, JSON.stringify(state));
  
  // Store only the pointer in DO storage (stays under 128KB)
  await this.ctx.storage.put(STORAGE_KEYS.CHECKPOINT_META, {
    key,
    timestamp: Date.now(),
    version: state.version,
  });
}
```

#### 5. Resume Dirty Flag (Race Condition Prevention)

When multiple AI responses arrive simultaneously:

```typescript
class GameRunner {
  private isResuming = false;
  private resumeDirty = false;
  
  async handleAICallback(requestId: string, response: AIResponse): Promise<void> {
    // Cache the response
    await this.cacheAIResponse(requestId, response);
    
    // Check if we're already resuming
    if (this.isResuming) {
      this.resumeDirty = true;  // Mark for re-run
      return;
    }
    
    // Start resume loop
    this.isResuming = true;
    try {
      do {
        this.resumeDirty = false;
        await this.runGameWithErrorHandling();
      } while (this.resumeDirty);
    } finally {
      this.isResuming = false;
    }
  }
}
```

### Queue Architecture

| Queue | Purpose | Message Type |
|-------|---------|--------------|
| `GAME_QUEUE` | Spawn new game instances | `{ gameId, config, batchId? }` |
| `BATCH_QUEUE` | Create bulk game batches | `{ batchId, config, count }` |
| `AI_REQUEST_QUEUE` | Offload AI calls from DO | `AIRequestMessage` |

#### AI Request Message

```typescript
interface AIRequestMessage {
  requestId: string;          // Deterministic ID for caching
  gameId: string;             // Target DO for callback
  modelId: string;            // e.g., "anthropic/claude-3-5-sonnet"
  request: CompletionRequest; // Prompt, system message, etc.
  context: {
    playerId: string;
    round: number;
    phase: string;
    subRoundIndex?: number;
  };
  discountPricing?: boolean;  // Route to batch API?
  traceId?: string;           // For distributed tracing
}
```

### Claim Check Pattern (Large Payloads)

Queue messages have a 128KB limit. For large prompts:

```typescript
async queueAIRequest(message: AIRequestMessage): Promise<void> {
  const payload = JSON.stringify(message);
  
  if (payload.length > 100_000) {
    // Store in R2, send reference
    const key = `ai-requests/${message.requestId}.json`;
    await this.env.TRANSCRIPTS.put(key, payload);
    
    await this.env.AI_REQUEST_QUEUE.send({
      requestId: message.requestId,
      requestRef: key,  // R2 reference instead of full payload
      gameId: message.gameId,
    });
  } else {
    // Small enough - send directly
    await this.env.AI_REQUEST_QUEUE.send(message);
  }
}
```

---

## 5. Batch Processing System

### Why Batch Processing?

Major AI providers offer **40-50% discounts** for batch requests:

| Provider | Discount | Latency |
|----------|----------|---------|
| Anthropic | 50% | Up to 24 hours |
| OpenAI | 50% | Up to 24 hours |
| Google | 50% | Up to 24 hours |
| Cerebras | 50% | Up to 24 hours |
| Fireworks | 40% | Up to 24 hours |

For research/benchmarking where latency isn't critical, this is significant savings.

### Batch Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        BATCH PROCESSING FLOW                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   AI_REQUEST_QUEUE          D1 Database              Provider API           │
│         │                        │                        │                 │
│         │ discountPricing=true   │                        │                 │
│         │───────────────────────▶│                        │                 │
│         │                        │ INSERT batch_api_requests               │
│         │                        │ status='pending'       │                 │
│         │                        │                        │                 │
│         │                        │                        │                 │
│   CRON (*/5 min)                 │                        │                 │
│         │ aggregateAndSubmit()   │                        │                 │
│         │───────────────────────▶│                        │                 │
│         │                        │ SELECT pending         │                 │
│         │                        │ GROUP BY provider      │                 │
│         │                        │────────────────────────▶                 │
│         │                        │                        │ Create batch job│
│         │                        │                        │                 │
│         │                        │ UPDATE status='bundled'│                 │
│         │                        │ batch_job_id=...       │                 │
│         │                        │                        │                 │
│         │                        │         (hours pass)   │                 │
│         │                        │                        │                 │
│   CRON (*/1 min)                 │                        │                 │
│         │ pollAndDispatch()      │                        │                 │
│         │───────────────────────▶│                        │                 │
│         │                        │────────────────────────▶                 │
│         │                        │                        │ GET batch status│
│         │                        │                        │ → 'completed'   │
│         │                        │                        │                 │
│         │                        │ Download results       │                 │
│         │                        │◀────────────────────────                 │
│         │                        │                        │                 │
│         │                        │ For each result:       │                 │
│         │                        │   - Parse custom_id    │                 │
│         │                        │   - Find request       │                 │
│         │                        │   - POST callback to DO│                 │
│         │                        │                        │                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Batch Database Schema

```sql
-- Individual AI requests waiting for batch processing
CREATE TABLE batch_api_requests (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,      -- Deterministic ID for DO callback
  custom_id TEXT NOT NULL,       -- Provider's correlation ID
  game_id TEXT NOT NULL,         -- Target DO for callback
  model_id TEXT NOT NULL,        -- e.g., "anthropic/claude-3-5-sonnet"
  provider TEXT NOT NULL,        -- 'anthropic', 'openai', 'google', etc.
  request_body TEXT NOT NULL,    -- JSON CompletionRequest
  context_json TEXT NOT NULL,    -- Game context for callback
  status TEXT DEFAULT 'pending', -- pending | bundled | completed | failed
  batch_job_id TEXT,             -- Foreign key to batch_api_jobs
  response_json TEXT,            -- AI response (when completed)
  error_message TEXT,            -- Error (when failed)
  retry_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);

-- Batch jobs submitted to providers
CREATE TABLE batch_api_jobs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_batch_id TEXT,        -- Provider's batch ID
  status TEXT DEFAULT 'created', -- created | submitted | processing | completed | failed
  request_count INTEGER NOT NULL,
  completed_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  input_file_url TEXT,           -- JSONL file location
  output_file_url TEXT,          -- Results file location
  submitted_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL
);
```

### Provider Integration

Each provider has a specific batch implementation:

```typescript
abstract class BaseBatchProvider {
  abstract name: BatchProvider;
  
  // Format requests into provider-specific JSONL
  abstract formatBatchInput(requests: BatchRequest[]): string;
  
  // Submit batch to provider API
  abstract submitBatch(inputFileUrl: string): Promise<string>;
  
  // Check batch status
  abstract getBatchStatus(batchId: string): Promise<BatchStatus>;
  
  // Download and parse results
  abstract downloadResults(batchId: string): Promise<BatchResult[]>;
}
```

#### Anthropic Example

```typescript
class AnthropicBatch extends BaseBatchProvider {
  name = 'anthropic' as const;
  
  formatBatchInput(requests: BatchRequest[]): string {
    return requests.map(req => JSON.stringify({
      custom_id: req.customId,
      params: {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: req.maxTokens,
        messages: req.messages,
        system: req.systemPrompt,
      }
    })).join('\n');
  }
  
  async submitBatch(inputFileUrl: string): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages/batches', {
      method: 'POST',
      headers: {
        'anthropic-version': '2023-06-01',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify({
        requests: await this.fetchAndParse(inputFileUrl),
      }),
    });
    
    const batch = await response.json();
    return batch.id;
  }
}
```

### Routing Decision

```typescript
function shouldUseBatchPricing(message: AIRequestMessage): boolean {
  // 1. User must opt-in
  if (!message.discountPricing) return false;
  
  // 2. Model must support batch API
  const provider = getProviderForModel(message.modelId);
  if (!provider) return false;
  
  // 3. Provider API key must be configured
  if (!hasProviderKey(provider)) return false;
  
  return true;
}
```

### Discount Pricing Mode Effects

When `discountPricing: true`, more than just routing changes:

| Setting | Standard Mode | Discount Mode |
|---------|---------------|---------------|
| **Routing** | Direct API call | Batch API (if supported) |
| **Timeout** | 60 seconds | 300 seconds |
| **Max Retries** | 8 | 20 |
| **Stale Threshold** | 1 hour | 24 hours |
| **Cost** | Full price | ~50% discount |

This is because batch-compatible requests may still go through immediate processing if the model doesn't support batch APIs, but with relaxed timeouts for slower providers.

---

## 6. User & API Key Management

### Authentication Flow

We use **Google OAuth 2.0** for authentication:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AUTHENTICATION FLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   User              Frontend           Worker             Google            │
│    │                   │                  │                  │              │
│    │  Click "Sign In"  │                  │                  │              │
│    │──────────────────▶│                  │                  │              │
│    │                   │                  │                  │              │
│    │                   │ GET /api/auth/google               │              │
│    │                   │─────────────────▶│                  │              │
│    │                   │                  │                  │              │
│    │                   │  302 Redirect    │                  │              │
│    │◀──────────────────│◀─────────────────│                  │              │
│    │                   │                  │                  │              │
│    │  Consent Screen   │                  │                  │              │
│    │─────────────────────────────────────────────────────────▶              │
│    │                   │                  │                  │              │
│    │  Auth Code        │                  │                  │              │
│    │◀─────────────────────────────────────────────────────────              │
│    │                   │                  │                  │              │
│    │  /api/auth/callback?code=...        │                  │              │
│    │──────────────────────────────────────▶                  │              │
│    │                   │                  │                  │              │
│    │                   │                  │ Exchange code    │              │
│    │                   │                  │─────────────────▶│              │
│    │                   │                  │                  │              │
│    │                   │                  │ Access token     │              │
│    │                   │                  │◀─────────────────│              │
│    │                   │                  │                  │              │
│    │                   │                  │ GET /userinfo    │              │
│    │                   │                  │─────────────────▶│              │
│    │                   │                  │                  │              │
│    │                   │                  │ User profile     │              │
│    │                   │                  │◀─────────────────│              │
│    │                   │                  │                  │              │
│    │                   │   Set-Cookie: mafia_session=...    │              │
│    │◀──────────────────│◀─────────────────│                  │              │
│    │                   │                  │                  │              │
│    │  Authenticated!   │                  │                  │              │
│    │                   │                  │                  │              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Session Management

Sessions are stored in **Cloudflare KV** with 7-day TTL:

```typescript
interface SessionData {
  userId: string;       // Google user ID (stable)
  email: string;
  name: string;
  picture?: string;
  isAdmin: boolean;     // true if email matches ADMIN_EMAIL
  createdAt: number;
  expiresAt: number;
}

// Store session
await KV.put(`session:${sessionId}`, JSON.stringify(sessionData), {
  expirationTtl: 7 * 24 * 60 * 60, // 7 days
});
```

### User Database

Users are synced to D1 on login:

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,          -- Google user ID
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  picture TEXT,
  is_admin INTEGER DEFAULT 0,   -- 1 if ADMIN_EMAIL
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);
```

### API Key Management

Users can bring their own API keys for AI providers. Keys are **encrypted at rest** using AES-256-GCM.

#### Encryption Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        API KEY ENCRYPTION                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   User Input          Worker                    D1 Database                 │
│       │                  │                          │                       │
│       │ POST /api/auth/keys                        │                       │
│       │ { provider: "openai", apiKey: "sk-..." }   │                       │
│       │─────────────────▶│                          │                       │
│       │                  │                          │                       │
│       │                  │ 1. Generate random IV    │                       │
│       │                  │    (96-bit for AES-GCM)  │                       │
│       │                  │                          │                       │
│       │                  │ 2. Derive key from       │                       │
│       │                  │    ENCRYPTION_SECRET     │                       │
│       │                  │                          │                       │
│       │                  │ 3. Encrypt with AES-GCM  │                       │
│       │                  │                          │                       │
│       │                  │ 4. Create fingerprint    │                       │
│       │                  │    "sk-...1234"          │                       │
│       │                  │                          │                       │
│       │                  │ INSERT user_api_keys     │                       │
│       │                  │─────────────────────────▶│                       │
│       │                  │                          │                       │
│       │ { fingerprint: "sk-...1234" }              │                       │
│       │◀─────────────────│                          │                       │
│       │                  │                          │                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Database Schema

```sql
CREATE TABLE user_api_keys (
  id TEXT PRIMARY KEY,            -- {userId}_{provider}
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,         -- 'openai', 'anthropic', 'google', etc.
  encrypted_key TEXT NOT NULL,    -- Base64 AES-GCM ciphertext
  iv_vector TEXT NOT NULL,        -- Base64 initialization vector
  key_fingerprint TEXT NOT NULL,  -- "sk-...1234" for UI display
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);
```

#### Supported Providers

```typescript
// User API key providers (BYOK)
const SUPPORTED_PROVIDERS = [
  'openai',       // GPT-4, GPT-4o, o1
  'anthropic',    // Claude 3.5, Claude 3 Opus
  'google',       // Gemini Pro, Gemini Flash
  'openrouter',   // Aggregator (100+ models)
  'cerebras',     // Llama variants (fast)
  'fireworks',    // Fine-tuned Llama, Mistral
] as const;

// Additional direct providers (platform keys)
// minimax, cohere, ai21, xai, deepseek, mistral, hyperbolic
```

#### Key Usage Flow

When a user starts a game with their own keys:

1. **Game Creation**: User's encrypted keys are copied to DO storage
2. **Game Execution**: DO decrypts keys on-demand when creating AI provider
3. **Fallback**: If user key fails, system can fall back to platform keys (configurable)

```typescript
async createProviderWithUserKeys(modelId: string): Promise<AIProvider> {
  // 1. Try to get user's key for this provider
  const userKeys = await this.getDecryptedUserKeys();
  const provider = inferProviderFromModel(modelId);
  
  if (userKeys?.has(provider)) {
    // 2. Use user's key
    return createProvider(modelId, {
      ...this.env,
      [`${provider.toUpperCase()}_API_KEY`]: userKeys.get(provider),
    });
  }
  
  // 3. Fall back to platform keys
  return createProvider(modelId, this.env);
}
```

### Authorization Levels

| Role | Capabilities |
|------|--------------|
| **Anonymous** | View public leaderboards, read transcripts |
| **Authenticated** | All anonymous + manage own API keys, view own game history |
| **Admin** | All authenticated + system pause, batch management, DLQ, kill games |

---

## 7. Game Engine

### Overview

The game engine is **pure TypeScript** with no external dependencies on Cloudflare. This enables:
- Unit testing without mocks
- Running in any JavaScript runtime
- Potential client-side simulation

### Game Configuration

```typescript
interface GameConfig {
  playerCount: number;                    // Total players (7-11 typical)
  mafiaCount: number;                     // 2-3 typically
  teams: readonly TeamAssignment[];       // Flexible team composition
  maxRounds: number;                      // Safety limit (default: 20)
  discussionEnabled: boolean;             // Enable day discussion phase
  dayDiscussionRounds?: number;           // Rounds per day discussion (default: 3)
  nightDiscussionRounds?: number;         // Rounds for mafia coordination (default: 2)
  seed?: number;                          // RNG seed for reproducibility
  personaTheme?: PersonaTheme;            // 'noir' | 'victorian' | 'modern' | 'fantasy'
  contextLevel?: ContextLevel;            // 'full' | 'windowed' | 'summary'
  contextWindowSize?: number;             // Rounds for windowed context (default: 3)
  personaConstraints?: PersonaConstraints; // 'strict' | 'moderate' | 'free'
}

interface TeamAssignment {
  modelId: string;    // e.g., "anthropic/claude-3-5-sonnet"
  team: 'mafia' | 'town';
  count: number;      // How many players of this model on this team
}

// Example: 2 Claude mafia vs 5 GPT-4o town
const config: GameConfig = {
  playerCount: 7,
  mafiaCount: 2,
  teams: [
    { modelId: 'anthropic/claude-3-5-sonnet', team: 'mafia', count: 2 },
    { modelId: 'openai/gpt-4o', team: 'town', count: 5 },
  ],
  maxRounds: 20,
  discussionEnabled: true,
  personaTheme: 'noir',
};
```

### Phase Progression

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           GAME PHASE FLOW                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────┐                                                          │
│   │ Introduction │  All players generate personas and introduce themselves │
│   │              │  (Simultaneous - all players speak once)                 │
│   └──────┬───────┘                                                          │
│          │                                                                  │
│          ▼                                                                  │
│   ┌──────────────┐                                                          │
│   │     Day      │  Public discussion (dayDiscussionRounds iterations)      │
│   │  Discussion  │  Each round: all alive players speak in sequence         │
│   │              │  Default: 3 rounds × N players = 3N messages             │
│   └──────┬───────┘                                                          │
│          │                                                                  │
│          ▼                                                                  │
│   ┌──────────────┐                                                          │
│   │   Day Vote   │  All alive players vote to eliminate someone             │
│   │              │  (Can vote for any other alive player or abstain)        │
│   └──────┬───────┘                                                          │
│          │                                                                  │
│          │◀──────────────────────┐                                          │
│          ▼                       │                                          │
│   ┌──────────────┐               │                                          │
│   │  Elimination │               │ Game continues if                        │
│   │   (or Tie)   │               │ no winner yet                            │
│   └──────┬───────┘               │                                          │
│          │                       │                                          │
│          ▼                       │                                          │
│   ┌──────────────┐               │                                          │
│   │ Win Check    │───────────────┼──▶ Town wins: All mafia eliminated       │
│   └──────┬───────┘               │    Mafia wins: Mafia >= Town             │
│          │                       │                                          │
│          │ No winner             │                                          │
│          ▼                       │                                          │
│   ┌──────────────┐               │                                          │
│   │    Night     │  Mafia privately discuss (nightDiscussionRounds)         │
│   │  Discussion  │  Then vote to kill a town member                         │
│   │              │  Default: 2 discussion rounds                            │
│   └──────┬───────┘               │                                          │
│          │                       │                                          │
│          ▼                       │                                          │
│   ┌──────────────┐               │                                          │
│   │  Night Kill  │───────────────┘                                          │
│   │              │  Mafia consensus or random if tied                       │
│   └──────────────┘                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Discussion Round Mechanics:**
- Players speak in a fixed order (shuffled at game start to avoid position bias)
- Each player sees all previous messages in the current round before responding
- `discussionRound` is tracked for request ID uniqueness (1-indexed)

### Win Conditions

```typescript
function checkWinCondition(state: GameState): WinResult | null {
  const alive = state.players.filter(p => p.isAlive);
  const aliveMafia = alive.filter(p => p.team === 'mafia');
  const aliveTown = alive.filter(p => p.team === 'town');
  
  // Town wins: All mafia eliminated
  if (aliveMafia.length === 0) {
    return { winner: 'town', reason: 'All mafia have been eliminated' };
  }
  
  // Mafia wins: Equal or greater than town
  // (Because mafia can coordinate votes to eliminate remaining town)
  if (aliveMafia.length >= aliveTown.length) {
    return { winner: 'mafia', reason: 'Mafia have achieved majority' };
  }
  
  return null; // Game continues
}
```

### Persona System

Each player is assigned a persona archetype:

```typescript
interface Persona {
  name: string;           // "Detective Morgan"
  archetype: string;      // "Noir Detective"
  background: string;     // Rich backstory
  speechPatterns: string; // How they talk
  quirks: string[];       // Behavioral traits
}

const PERSONA_THEMES = {
  noir: ['Private Eye', 'Femme Fatale', 'Beat Cop', 'Jazz Singer', ...],
  fantasy: ['Dwarven Smith', 'Elven Sage', 'Hedge Witch', 'Merchant Prince', ...],
  startup: ['CEO', 'Data Scientist', 'UX Designer', 'DevOps Engineer', ...],
};
```

### Fog of War (Information Isolation)

Critical for fair benchmarking. Implemented in `engine/utils/visibility.ts`:

```typescript
function getVisibleState(state: GameState, player: Player): VisibleGameState {
  // All players see: alive players, dead players (with revealed teams)
  const alivePlayers = state.alivePlayers.map(p => ({
    id: p.id,
    name: p.name,
    persona: p.persona,
    // NOTE: team is NOT visible for alive players
  }));
  
  const deadPlayers = state.deadPlayers.map(p => ({
    id: p.id,
    name: p.name,
    team: p.team,  // Roles are revealed on death
    persona: p.persona,
  }));
  
  // Mafia can see their teammates
  const teammates = player.team === 'mafia'
    ? state.aliveMafia.filter(p => p.id !== player.id).map(p => p.id)
    : undefined;
  
  // Public conversation history (non-mafia channel)
  const publicHistory = state.getCurrentRoundPublicConversation();
  
  // Mafia gets access to their private strategy chat
  const mafiaHistory = player.team === 'mafia'
    ? state.getCurrentRoundMafiaConversation()
    : undefined;
  
  // Context level determines how much history to include
  // 'full': Complete verbatim history (for large context models)
  // 'windowed': Last N rounds + summary of earlier
  // 'summary': Current round only (default)
  const largeContextFields = buildLargeContextFields(state, player);
  
  return {
    round: state.round,
    phase: state.phase,
    alivePlayers,
    deadPlayers,
    conversationHistory: publicHistory,
    mafiaHistory,
    teammates,
    ...largeContextFields,  // fullConversationHistory, voteHistory, gameLog
  };
}
```

**Key Isolation Rules:**
- Town players NEVER see mafia channel messages
- Town players NEVER know who mafia members are (until death)
- Mafia players see each other from game start
- Dead player teams are revealed to everyone

---

## 8. Operational Scenarios

### Scenario 1: Live Game (Immediate Processing)

**User wants to watch a game in real-time.**

```
Timeline:
0s    - User clicks "Start Game" (Claude vs GPT-4o)
0.1s  - Worker creates GameRunner DO, returns game ID
0.2s  - Frontend opens WebSocket to DO
0.5s  - DO starts Introduction phase
1-30s - Each player generates persona (AI calls via queue)
        - Each call: DO suspends → Queue processes → DO resumes
        - WebSocket streams events to frontend in real-time
...   - Game continues through phases
5-15m - Game completes, winner declared
        - Full transcript saved to R2
        - Stats updated in D1
```

**Key Characteristics:**
- `discountPricing: false`
- AI calls processed immediately (no 24h wait)
- WebSocket provides real-time updates
- Typical game: 5-15 minutes

### Scenario 2: Batch Research Run (Discount Pricing)

**Researcher wants to run 100 games for statistical analysis.**

```
Timeline:
0s        - Admin creates batch: 100 games, Claude vs Gemini, discount pricing
0.1s      - Batch message queued
1s        - Batch split into 100 GAME_QUEUE messages
1-10s     - 100 GameRunner DOs created
10s-5m    - Each DO starts, makes AI requests
           - Requests routed to BatchService instead of immediate processing
           - Each DO suspends after queueing request
           - DOs hibernate (no compute charges)
           
Every 5m  - Cron: aggregateAndSubmit()
           - Groups pending requests by provider
           - Submits batch jobs to Anthropic, Google APIs
           
Every 1m  - Cron: pollAndDispatch()
           - Checks batch job status
           - When complete: downloads results, dispatches callbacks

~1-24h    - Provider processes batches
           - As results arrive, callbacks wake DOs
           - Games resume and continue
           
Final     - All 100 games complete
           - ELO ratings updated
           - Cost: ~50% of immediate pricing
```

**Key Characteristics:**
- `discountPricing: true`
- AI calls aggregated and sent to provider batch APIs
- Games hibernate between phases (cost efficient)
- Completion: 1-24 hours
- Cost: 50% savings

### Scenario 3: User's Own API Keys

**User wants to use their own OpenAI key for billing.**

```
Timeline:
0s    - User authenticates via Google OAuth
0.1s  - User navigates to Settings > API Keys
0.2s  - User enters OpenAI API key
0.3s  - Worker encrypts key, stores in D1
1s    - User starts a game
1.1s  - Worker copies encrypted keys to DO storage
1.2s  - DO decrypts keys when creating AI provider
...   - Game uses user's key for all OpenAI calls
      - User pays OpenAI directly
      - Platform pays nothing for AI
```

**Key Characteristics:**
- Keys encrypted with AES-256-GCM
- Keys stored per-user in D1
- Copied to DO storage at game start
- Decrypted on-demand during execution

### Scenario 4: Game Recovery (DO Eviction)

**DO gets evicted during long-running game.**

```
Before Eviction:
- Game at Round 3, Night Phase
- 2 AI requests in flight (queued, not yet returned)
- Last checkpoint saved after Round 2

Eviction Occurs:
- Cloudflare evicts DO due to inactivity
- In-flight promises lost (expected)
- All DO memory cleared

Recovery (on next request or callback):
1. Queue worker completes AI call #1
2. Worker POSTs callback to DO
3. DO wakes up (fresh instance)
4. DO loads CHECKPOINT_META from storage
5. DO downloads full state from R2
6. DO reconstructs Game object
7. DO processes callback, caches response
8. Game.run() resumes from Round 2
9. Game replays to Round 3 (cache hits)
10. Round 3 Night Phase continues
```

**Key Characteristics:**
- Checkpoints saved to R2 at phase boundaries
- Only pointers in DO storage (under 128KB)
- Deterministic replay via cached AI responses
- No data loss even with eviction

### Scenario 5: Stuck Game Detection & Cleanup

**Game appears stuck - how is it detected and resolved?**

```
Detection:
- Heartbeat updated every 15 seconds during execution
- lastActivity updated on each game event

Health States:
┌─────────────────────────────────────────────────────────────────┐
│ Heartbeat Age │ Event Age  │ Status   │ Meaning                 │
├───────────────┼────────────┼──────────┼─────────────────────────│
│ < 60s         │ any        │ healthy  │ Game actively executing │
│ > 60s         │ < 5m       │ warning  │ Waiting for AI (normal) │
│ > 60s         │ > 5m       │ critical │ Game stuck/crashed      │
│ > 60s         │ > 10m      │ dead     │ Kill candidate          │
└─────────────────────────────────────────────────────────────────┘

Cleanup:
- Cron job runs every 5 minutes
- Queries for games in 'running' status with stale heartbeats
- "Active Punt": Wakes DO to check for unprocessed cached responses
- If truly stuck: Marks as 'failed', releases resources

API:
- GET /api/games/:id/health - Returns detailed health status
- POST /api/admin/games/:id/kill - Force-kills a game
- POST /api/admin/games/kill-hanging - Batch cleanup
```

---

## 9. Data Models

### Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DATA MODEL RELATIONSHIPS                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────┐       ┌──────────────┐       ┌──────────┐                   │
│   │  users   │───────│ user_api_keys │       │  models  │                   │
│   └────┬─────┘       └──────────────┘       └────┬─────┘                   │
│        │                                         │                          │
│        │                                         │                          │
│        │             ┌──────────────┐            │                          │
│        └────────────▶│    games     │◀───────────┘                          │
│                      └──────┬───────┘                                       │
│                             │                                               │
│              ┌──────────────┼──────────────┐                               │
│              │              │              │                                │
│              ▼              ▼              ▼                                │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                     │
│   │ participants │  │    batch     │  │  error_log   │                     │
│   └──────────────┘  └──────────────┘  └──────────────┘                     │
│                             │                                               │
│                             ▼                                               │
│                      ┌──────────────┐                                       │
│                      │ batch_api_*  │                                       │
│                      └──────────────┘                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Tables

#### games

```sql
CREATE TABLE games (
  id TEXT PRIMARY KEY,
  batch_id TEXT,
  config_hash TEXT NOT NULL,         -- Hash for grouping similar configs
  player_count INTEGER NOT NULL,
  mafia_count INTEGER NOT NULL,
  winner TEXT,                       -- 'mafia' | 'town' | NULL
  rounds INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,           -- Total AI cost (calculated)
  status TEXT DEFAULT 'completed',   -- 'running' | 'completed' | 'failed'
  error_message TEXT,
  seed INTEGER,                      -- RNG seed for reproducibility
  persona_enabled INTEGER DEFAULT 0, -- boolean
  persona_theme TEXT,                -- 'noir' | 'victorian' | 'modern' | 'fantasy'
  trace_id TEXT,                     -- Distributed tracing ID
  discount_pricing INTEGER DEFAULT 0,-- Whether using batch API (boolean)
  last_activity INTEGER,             -- For stuck game detection
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);
-- Note: transcript_url is NOT stored - uses convention: games/${gameId}/transcript.json in R2
```

#### game_participants

```sql
CREATE TABLE game_participants (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL REFERENCES models(id),
  team TEXT NOT NULL,                -- 'mafia' | 'town'
  player_count INTEGER NOT NULL,     -- Players of this model on this team
  won INTEGER NOT NULL,              -- boolean: on winning team?
  consistency_score REAL,            -- Persona consistency (0-1)
  input_tokens INTEGER DEFAULT 0,    -- For accurate cost calculation
  output_tokens INTEGER DEFAULT 0
);
```

#### game_summaries (Context Compression)

```sql
CREATE TABLE game_summaries (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,            -- Which model generated this summary
  round_start INTEGER NOT NULL,      -- First round summarized
  round_end INTEGER NOT NULL,        -- Last round summarized
  summary_type TEXT NOT NULL,        -- 'conversation' | 'votes' | 'full'
  summary_text TEXT NOT NULL,        -- The compressed summary
  token_count INTEGER NOT NULL,      -- Tokens in the summary
  created_at INTEGER NOT NULL
);
```

#### models

```sql
CREATE TABLE models (
  id TEXT PRIMARY KEY,               -- See Model ID Convention below
  display_name TEXT NOT NULL,
  family TEXT NOT NULL,              -- "claude", "gpt", "gemini"
  api_provider TEXT DEFAULT 'openrouter',
  api_model_id TEXT,                 -- Provider-specific model identifier
  supports_batch_pricing INTEGER DEFAULT 0,
  elo_rating INTEGER DEFAULT 1500,
  elo_games_played INTEGER DEFAULT 0,
  elo_peak INTEGER DEFAULT 1500,
  elo_updated_at INTEGER,
  config TEXT,                       -- JSON: { contextLength, pricing }
  created_at INTEGER NOT NULL
);
```

**Model ID Convention:**
The `id` field follows a `provider/model-name` pattern that determines API routing:

| ID Pattern | Routed To |
|------------|-----------|
| `anthropic/claude-*` | Anthropic direct API |
| `openai/gpt-*` | OpenAI direct API |
| `google/gemini-*` | Google AI direct API |
| `openrouter/google/gemini-*` | OpenRouter (aggregator) |
| `test/*` | MockE2EProvider (no cost) |

The `api_provider` column can override this for edge cases.

### R2 Object Structure

```
games/
├── {gameId}/
│   ├── transcript.json       # Full game log (final)
│   ├── events-stream.json    # Incremental event stream (JSON array)
│   └── summary.json          # AI-generated summary

checkpoints/
├── {gameId}/
│   └── {timestamp}.json      # Game state snapshot

ai-requests/
├── {requestId}.json          # Large payloads (Claim Check)
```

---

## 10. Non-Functional Requirements

### Performance

| Metric | Target | Current |
|--------|--------|---------|
| API Response (p50) | <100ms | ~50ms |
| API Response (p95) | <500ms | ~200ms |
| WebSocket Latency | <50ms | ~30ms |
| Game Start Time | <2s | ~1s |
| Checkpoint Save | <500ms | ~200ms |

### Scalability

| Dimension | Limit | Mitigation |
|-----------|-------|------------|
| Concurrent Games | 1000+ | Each game is isolated DO |
| Game Duration | 24+ hours | R2 checkpoints, suspense pattern |
| Event Log Size | Unlimited | Stream to R2, summarize for context |
| Batch Size | 10,000 games | Queue-based processing |

### Reliability

| Scenario | Recovery Strategy |
|----------|-------------------|
| DO Eviction | R2 checkpoints + deterministic replay |
| AI Provider Down | Retry with exponential backoff |
| Queue Backpressure | DLQ + manual retry |
| D1 Unavailable | Graceful degradation (game continues, stats delayed) |

### Security

| Concern | Mitigation |
|---------|------------|
| API Key Exposure | AES-256-GCM encryption at rest |
| Prompt Injection | Input sanitization, dangerous pattern stripping |
| Session Hijacking | Secure cookies, KV expiration |
| Admin Access | Google OAuth + email allowlist |
| Rate Limiting | KV-based token bucket per IP/user |

### Cost Management

| Strategy | Implementation |
|----------|----------------|
| Batch Pricing | 50% discount via provider batch APIs |
| Token Counting | `js-tiktoken` for accurate estimation |
| Budget Limits | Max rounds, max tokens per game |
| DO Hibernation | Suspense pattern - no compute during AI wait |
| R2 vs DO Storage | Large data in R2 (cheaper), pointers in DO |

---

## 11. Advanced Features

### Context Window Management (Summarization)

Long games can exceed model context limits. The system automatically compresses history.

**Implementation:** `worker/ai/SummarizationService.ts`, `worker/ai/contextLimits.ts`

#### How It Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CONTEXT SUMMARIZATION FLOW                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Before AI Call                                                            │
│       │                                                                     │
│       ▼                                                                     │
│   ┌──────────────────┐                                                      │
│   │ Check Token Count │                                                     │
│   │ vs Model Limit    │                                                     │
│   └────────┬─────────┘                                                      │
│            │                                                                │
│   ┌────────┴────────┐                                                       │
│   │                 │                                                       │
│   ▼                 ▼                                                       │
│  < 80%            > 80%                                                     │
│   │                 │                                                       │
│   ▼                 ▼                                                       │
│  Use Full       ┌──────────────┐                                           │
│  History        │ Check for    │                                           │
│                 │ Existing Sum │                                           │
│                 └──────┬───────┘                                           │
│                        │                                                    │
│              ┌─────────┴─────────┐                                          │
│              │                   │                                          │
│              ▼                   ▼                                          │
│          Found               Not Found                                      │
│              │                   │                                          │
│              │                   ▼                                          │
│              │         ┌─────────────────┐                                  │
│              │         │ Generate Summary │                                 │
│              │         │ (LLM Call)       │                                 │
│              │         └────────┬────────┘                                  │
│              │                  │                                           │
│              │                  ▼                                           │
│              │         ┌─────────────────┐                                  │
│              │         │ Store in D1     │                                  │
│              │         │ game_summaries  │                                  │
│              │         └────────┬────────┘                                  │
│              │                  │                                           │
│              ▼                  ▼                                           │
│         Use Summary + Recent Rounds                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Context Levels

| Level | Description | Use Case |
|-------|-------------|----------|
| `full` | Complete verbatim history | Large context models (GPT-4, Claude) |
| `windowed` | Last N rounds + summary | Medium context models |
| `summary` | Current round only | Small context models, cost savings |

#### Summary Generation Prompt

```typescript
const SUMMARY_SYSTEM_PROMPT = `You are a concise summarizer for a Mafia game.
Your task is to compress game history while preserving strategically important information.

Rules:
- Be extremely concise (target 15-20% of original length)
- Preserve: accusations, defenses, voting patterns, alliances, suspicious behavior
- Include: who eliminated whom, what their teams were
- Skip: casual chat, greetings, filler content
- Use bullet points for clarity
- Do NOT add analysis or speculation - just summarize what happened`;
```

### Output Validation & Repair

LLMs sometimes produce malformed JSON. The system uses `jsonrepair` and Zod schemas.

**Implementation:** `worker/ai/GameAIAdapter.ts`, `worker/ai/schemas.ts`

```typescript
import { jsonrepair } from 'jsonrepair';
import { DiscussionSchema, EliminationVoteSchema } from './schemas.js';

// 1. Attempt JSON repair (handles Markdown code blocks, trailing commas, etc.)
const repaired = jsonrepair(rawResponse);

// 2. Parse and validate with Zod
const result = DiscussionSchema.safeParse(JSON.parse(repaired));

// 3. If validation fails, generate fallback action
if (!result.success) {
  return generateFallbackAction(actionType, player);
}
```

**Fallback Actions:**
- `persona` → Generic persona based on theme
- `discussion` → "I'm still thinking about this..."
- `vote` → Abstain
- `kill_vote` → Random valid target

### Distributed Tracing

All operations are tagged with a `traceId` for debugging.

**Implementation:** `worker/utils/trace.ts`

```typescript
// Format: tr_{timestamp}_{random}
// Example: tr_m5abc123_x7z9q2

function generateTraceId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `tr_${timestamp}_${random}`;
}

// Propagated via:
// - Headers (x-trace-id)
// - Queue messages (traceId field)
// - D1 records (trace_id column)
// - Log entries (context.traceId)
```

### Testing Infrastructure

Zero-cost E2E testing via mock providers.

**Implementation:** `worker/ai/providers/MockE2EProvider.ts`

#### Test Model Convention

Models prefixed with `test/` are routed to `MockE2EProvider`:

```typescript
// In factory.ts
if (modelId.startsWith('test/')) {
  return new MockE2EProvider(modelId);
}

// Available test scenarios:
// - test/mock-fast: Quick random responses
// - test/town-wins: Town always wins
// - test/mafia-wins: Mafia always wins
```

#### Running Tests Without AI Costs

```typescript
// E2E test configuration
const testConfig: GameConfig = {
  playerCount: 7,
  mafiaCount: 2,
  teams: [
    { modelId: 'test/mock-fast', team: 'mafia', count: 2 },
    { modelId: 'test/mock-fast', team: 'town', count: 5 },
  ],
  // ...
};
```

### Active Punt (Zombie Prevention)

Games can get "stuck" if callbacks are lost. The cleanup job tries to recover them.

**Implementation:** `worker/scheduled/cleanup.ts`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ACTIVE PUNT STRATEGY                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Cron Job (every 10 min)                                                   │
│       │                                                                     │
│       ▼                                                                     │
│   Query games where:                                                        │
│   - status = 'running'                                                      │
│   - last_activity > PUNT_THRESHOLD                                          │
│   - last_activity < KILL_THRESHOLD                                          │
│       │                                                                     │
│       ▼                                                                     │
│   For each game:                                                            │
│       │                                                                     │
│       ▼                                                                     │
│   POST /internal/punt to DO                                                 │
│       │                                                                     │
│       ▼                                                                     │
│   DO checks for cached AI responses                                         │
│       │                                                                     │
│   ┌───┴───┐                                                                 │
│   │       │                                                                 │
│   ▼       ▼                                                                 │
│  Found   None                                                               │
│   │       │                                                                 │
│   ▼       ▼                                                                 │
│  Resume  Return                                                             │
│  Game    (will be killed at KILL_THRESHOLD)                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Thresholds:**

| Game Type | Punt After | Kill After |
|-----------|------------|------------|
| Standard | 10 minutes | 1 hour |
| Discount Pricing | 2 hours | 24 hours |

---

## Appendix A: Environment Variables

```bash
# Cloudflare Bindings (wrangler.toml)
GAME_RUNNER        # Durable Object namespace
DB                 # D1 database
TRANSCRIPTS        # R2 bucket
RATE_LIMIT         # KV namespace
GAME_QUEUE         # Queue
AI_REQUEST_QUEUE   # Queue
BATCH_QUEUE        # Queue

# AI Provider Keys (Platform)
OPENAI_API_KEY
ANTHROPIC_API_KEY
GOOGLE_API_KEY
OPENROUTER_API_KEY
CEREBRAS_API_KEY
FIREWORKS_API_KEY
DEEPSEEK_API_KEY
XAI_API_KEY
MISTRAL_API_KEY
COHERE_API_KEY
AI21_API_KEY
MINIMAX_API_KEY
HYPERBOLIC_API_KEY

# Authentication
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
ADMIN_EMAIL
ENCRYPTION_SECRET   # 32-byte hex for AES-256

# Optional
ADMIN_PASSWORD      # Basic auth fallback
FRONTEND_URL        # OAuth redirect
```

## Appendix B: API Reference

### Public Endpoints

```
GET  /api/games                    # List games (paginated)
GET  /api/games/:id                # Get game details
GET  /api/games/:id/transcript     # Get full transcript
GET  /api/games/:id/events         # SSE event stream
GET  /api/games/:id/health         # Health check
WS   /api/games/:id/ws             # WebSocket live stream

GET  /api/leaderboard              # Model rankings
GET  /api/models                   # Available models
GET  /api/stats                    # Platform statistics
```

### Authenticated Endpoints

```
GET  /api/auth/me                  # Current user
POST /api/auth/logout              # Clear session
GET  /api/auth/keys                # List user's API keys
POST /api/auth/keys                # Add API key
DELETE /api/auth/keys/:provider    # Remove API key
```

### Admin Endpoints

```
POST /api/games                    # Create game
POST /api/games/:id/kill           # Kill game
POST /api/admin/games/kill-hanging # Cleanup stuck games
GET  /api/admin/system             # System status
POST /api/admin/system/pause       # Pause game creation
POST /api/admin/batch              # Create batch
GET  /api/admin/dlq                # Dead letter queue
```

---

*Document generated: December 28, 2025*

