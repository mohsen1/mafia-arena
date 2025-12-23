# 🏗️ Architecture Review - Mafia Arena
## December 24, 2025 (Overnight Session)

---

## Executive Summary

After an in-depth overnight analysis of the Mafia Arena codebase, I've identified **critical architectural issues** that caused production failures, along with **structural improvements** that would significantly improve system reliability, scalability, and maintainability.

---

## Current Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              MAFIA ARENA ARCHITECTURE                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────────────────────────┐│
│  │   Frontend  │────▶│   Worker    │────▶│       Durable Object            ││
│  │   (Astro)   │◀────│   (Hono)    │◀────│       (GameRunner)              ││
│  └─────────────┘     └─────────────┘     └─────────────────────────────────┘│
│        │                   │                          │                      │
│        │                   │                          ▼                      │
│        │              ┌────┴────┐          ┌─────────────────────┐          │
│        │              │   D1    │          │    Game Engine      │          │
│        │              │(SQLite) │          │  (Pure TypeScript)  │          │
│        │              └─────────┘          └─────────────────────┘          │
│        │                                             │                      │
│        │              ┌─────────┐                    ▼                      │
│        └─────────────▶│   R2    │◀───────┬─────────────────────┐           │
│                       │ (S3-like)│        │    AI Providers     │           │
│                       └─────────┘        │   (OpenRouter)      │           │
│                                          └─────────────────────┘           │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| Frontend | Astro + React | Live game viewing, admin panel |
| Worker | Cloudflare Workers + Hono | API routing, auth, game launching |
| Game Runner | Durable Objects | Game orchestration, state management |
| Game Engine | Pure TypeScript | Game logic (Mafia rules) |
| Database | Cloudflare D1 (SQLite) | Stats, leaderboard, game metadata |
| Storage | Cloudflare R2 | Game transcripts, event streams |
| Queue | Cloudflare Queues | Batch job processing |
| AI | OpenRouter | Multi-model LLM access |

---

## ✅ Architecture Strengths

### 1. Pure Game Engine (Excellent)
The game engine in `/src/engine/` is completely decoupled from Cloudflare:
- No external dependencies
- Fully testable with mock AI providers
- Portable to any runtime

```typescript
// Clean separation - engine only depends on types
export class Game {
  constructor(
    config: GameConfig,
    aiProvider: AIProvider,  // Injected interface
    options: GameOptions = {}
  ) { ... }
}
```

### 2. Event Sourcing Pattern
All game state changes are captured as events:
- Full audit trail
- Supports replay functionality
- Enables live streaming

### 3. Multi-Tier Storage Strategy
- **DO Storage**: Fast, transient (for resumption)
- **R2**: Unlimited, durable (for transcripts)
- **D1**: Queryable (for stats/leaderboard)

### 4. WebSocket + Polling Fallback
Live streaming gracefully degrades:
```javascript
ws.onerror = () => {
  fallbackToPolling();  // Automatic fallback
};
```

### 5. AI Provider Abstraction
Models are injected via interfaces with retry logic:
```typescript
export class RetryingProvider implements AIProviderInterface {
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    // Exponential backoff with jitter
  }
}
```

---

## 🚨 Critical Issues Found

### Issue #1: DO Storage Limit (128KB) - **FIXED TONIGHT**

**Problem**: Durable Object SQLite storage has a 128KB limit per value. Both `eventLog` and `conversationHistory` grew unbounded, causing games to fail.

**Root Cause**:
```typescript
// Before fix - stored everything
await this.ctx.storage.put(STORAGE_KEYS.GAME_STATE, serializedState);

// serializedState included:
// - events: GameEvent[]           // Can be 100+ events with full prompts
// - conversationHistory: ConversationMessage[]  // Can be 50+ messages
```

**Fix Applied**:
```typescript
const MAX_DO_STORAGE_EVENTS = 30;
const MAX_CONVERSATION_HISTORY = 50;

const strippedState = {
  ...serializedState,
  events: serializedState.events.slice(-MAX_DO_STORAGE_EVENTS),
  conversationHistory: serializedState.conversationHistory.slice(-MAX_CONVERSATION_HISTORY),
};
```

**Architectural Concern**: This is a band-aid. The real issue is using DO storage for large state at all.

---

### Issue #2: Games Never Start (ctx.waitUntil Reliability)

**Problem**: Multiple games were created in D1 with status "running" but had 0 events - the DO never actually executed the game.

**Root Cause**: `ctx.waitUntil()` is designed for short background tasks, not long-running game loops.

```typescript
// Current approach - potentially unreliable for long games
if (background) {
  this.ctx.waitUntil(this.runGameWithErrorHandling(gameId, batchId, gameConfig));
  return Response.json({ success: true, ... });
}
```

**Risk**: If the Worker times out before `waitUntil` starts, or if there's an exception during setup, the game silently fails.

---

### Issue #3: Frontend Connection State Management

**Problem**: Live game page sometimes shows "Connecting..." indefinitely, even when API has events.

**Root Cause**: 
1. WebSocket upgrade failures don't always trigger `onerror`
2. Polling backoff is too slow (30s max)
3. No visual feedback during slow AI responses

```javascript
// Current polling implementation
const MAX_POLL_DELAY = 30000;  // 30 seconds is too long for live viewing
```

---

### Issue #4: No Heartbeat Mechanism

**Problem**: No way to distinguish between:
- Game actively waiting for AI response (healthy)
- Game stuck/crashed (unhealthy)

**Current Detection**: Only `lastActivity` timestamp, updated on events.

**Gap**: If AI call takes 5 minutes, `lastActivity` looks stale but game is healthy.

---

### Issue #5: Inconsistent Error Handling

**Problem**: Errors are swallowed in multiple places:

```typescript
// Silent failure example
await this.updateLastActivityInD1(gameId).catch(() => {});  // Fire and forget

// Error logged but not surfaced
} catch (error) {
  logErrorWithStack(gameLog, 'Failed to stream events to R2', error, {
    eventCount: this.eventLog.length,
  });
  // Game continues without R2 stream - data could be lost
}
```

---

## 🎯 Architectural Recommendations

### Recommendation #1: Move Large State to R2

**Current**: Store serialized game state in DO storage (128KB limit)

**Proposed**: Store only critical pointers in DO, full state in R2

```typescript
// New storage architecture
const DO_STORAGE = {
  gameId: string,
  status: 'running' | 'completed' | 'failed',
  currentRound: number,
  currentPhase: Phase,
  lastEventIndex: number,  // Pointer to R2 stream
  checksum: string,        // For integrity verification
};

// Full state lives in R2
const R2_STATE = {
  events: GameEvent[],
  conversationHistory: ConversationMessage[],
  fullGameState: SerializedGameState,
};
```

**Benefits**:
- No storage limit issues
- Survives DO evictions
- Cheaper than DO storage

---

### Recommendation #2: Queue-Based Game Execution

**Current**: `ctx.waitUntil()` for background games

**Proposed**: Use Cloudflare Queues with step-based processing

```typescript
// Phase-based queue messages
interface GamePhaseMessage {
  gameId: string;
  phase: 'intro' | 'discussion' | 'vote' | 'night';
  round: number;
  stateUrl: string;  // R2 location of current state
}

// Handler processes one phase at a time
async queue(batch: MessageBatch<GamePhaseMessage>, env: Env) {
  for (const message of batch.messages) {
    const state = await loadStateFromR2(message.body.stateUrl);
    const newState = await runPhase(state, message.body.phase);
    await saveStateToR2(newState);
    
    if (!isGameOver(newState)) {
      await env.GAME_QUEUE.send(nextPhaseMessage(newState));
    }
  }
}
```

**Benefits**:
- Guaranteed delivery
- Automatic retries
- Survives Worker restarts
- Better observability

---

### Recommendation #3: Heartbeat System

**Proposed**: Active heartbeat during AI calls

```typescript
class GameRunner {
  private heartbeatInterval: number | null = null;
  
  private startHeartbeat(gameId: string) {
    this.heartbeatInterval = setInterval(async () => {
      await this.ctx.storage.put(STORAGE_KEYS.HEARTBEAT, Date.now());
      // Also update D1 every minute for external monitoring
      await this.env.DB.prepare(
        'UPDATE games SET heartbeat = ? WHERE id = ?'
      ).bind(Date.now(), gameId).run();
    }, 30_000);  // Every 30 seconds
  }
  
  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }
}
```

**Cleanup Job**:
```sql
-- Stale = no heartbeat for 5 minutes
SELECT id FROM games 
WHERE status = 'running' 
  AND heartbeat < (strftime('%s', 'now') * 1000 - 300000);
```

---

### Recommendation #4: Server-Sent Events (SSE) Alternative

**Current**: WebSocket with polling fallback

**Proposed**: Add SSE as middle ground (more reliable than WS, real-time unlike polling)

```typescript
// SSE endpoint
app.get('/api/games/:id/stream', async (c) => {
  return c.stream(async (stream) => {
    const gameId = c.req.param('id');
    
    // Send initial state
    const state = await loadGameState(gameId);
    await stream.write(`data: ${JSON.stringify(state)}\n\n`);
    
    // Subscribe to events
    const unsubscribe = subscribeToGameEvents(gameId, async (event) => {
      await stream.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    
    // Cleanup on close
    c.req.raw.signal.addEventListener('abort', unsubscribe);
  });
});
```

---

### Recommendation #5: Structured Observability

**Proposed**: Consistent logging with correlation

```typescript
interface TraceContext {
  traceId: string;
  gameId?: string;
  batchId?: string;
  playerId?: string;
  phase?: string;
  round?: number;
}

// Every log includes trace context
log.info('AI call completed', {
  ...context,
  modelId,
  latencyMs,
  tokensUsed,
});

// Metrics via Analytics Engine
env.ANALYTICS.writeDataPoint({
  blobs: [gameId, modelId, phase],
  doubles: [latencyMs, tokensUsed],
  indexes: [traceId],
});
```

**Dashboard Queries**:
```sql
-- P95 AI call latency by model
SELECT 
  blob1 AS model_id,
  QUANTILE(double1, 0.95) AS p95_latency_ms
FROM analytics
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY blob1;
```

---

### Recommendation #6: Progressive State Loading

**Current**: Load all events on page load

**Proposed**: Paginated/streaming transcript loading

```typescript
// API with pagination
GET /api/games/:id/events?from=0&limit=50

// Frontend loads progressively
const [events, setEvents] = useState([]);
const [loading, setLoading] = useState(false);

const loadMore = async () => {
  setLoading(true);
  const newEvents = await fetchEvents(gameId, events.length, 50);
  setEvents([...events, ...newEvents]);
  setLoading(false);
};
```

---

## 📊 Priority Matrix

| Recommendation | Impact | Effort | Priority |
|----------------|--------|--------|----------|
| R2 for large state | HIGH | MEDIUM | 🔴 P0 |
| Heartbeat system | HIGH | LOW | 🔴 P0 |
| Queue-based execution | HIGH | HIGH | 🟡 P1 |
| SSE streaming | MEDIUM | MEDIUM | 🟡 P1 |
| Structured observability | MEDIUM | MEDIUM | 🟢 P2 |
| Progressive loading | LOW | LOW | 🟢 P2 |

---

## Next Steps

### Immediate (This Week)
1. Monitor the storage limit fix in production
2. Add heartbeat mechanism to detect stuck games
3. Improve frontend polling responsiveness

### Short-term (2 Weeks)
4. Migrate large state to R2
5. Add SSE streaming option
6. Implement structured logging

### Medium-term (1 Month)
7. Refactor to queue-based execution
8. Build observability dashboard
9. Add automated game health monitoring

---

## Conclusion

The Mafia Arena architecture has solid foundations (pure engine, event sourcing, DI patterns) but suffers from **scalability issues** in state management and **reliability issues** in background task execution. 

The critical bug fixed tonight (128KB storage limit) was a symptom of a deeper architectural issue: using DO storage for unbounded data. The recommended R2-based state management would eliminate this entire class of bugs.

The system works well for small games but will continue to hit limits as games grow longer or player counts increase. Implementing the P0 recommendations would significantly improve reliability for production use.

---

*Report generated: 4:00 AM Dec 24, 2025*
*Session duration: ~4 hours*
*Games monitored: 87+ completed, 3 launched*
*Bugs found: 2 (1 fixed, 1 documented)*

