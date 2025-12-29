# Plan 11: Batch Processing Reliability Improvements

**Status**: Planning  
**Priority**: High  
**Estimated Effort**: 2-3 days  
**Created**: 2025-12-29

---

## Executive Summary

A deep code review revealed critical reliability issues in the batch processing system. The most severe is a **duplicate game creation bug** that can cause batches to run 1.5x+ more games than intended when queue messages are retried. This plan addresses all identified issues with a phased approach.

---

## Issues Identified

### 🔴 P0 - Critical

#### 1. Non-Deterministic Game IDs Cause Duplicates on Retry

**Location**: `src/worker/batch/service.ts` - `processBatchMessage()`

**Problem**: Game IDs are generated using `Date.now()` and `Math.random()`:
```typescript
const gameId = `game_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}_${i}`;
```

If the worker crashes after sending 500 of 1000 game messages, the queue retries the batch message. The loop restarts from `i=0` with **new timestamps and random values**, creating 1000 NEW game IDs instead of resuming.

**Impact**: 
- Batch runs 1500 games instead of 1000
- `completed_games` can exceed `total_games` (150%+ progress)
- Wasted compute and API costs
- Corrupted statistics

---

### 🟠 P1 - Medium

#### 2. No Checkpoint/Resume for Batch Queuing

**Location**: `src/worker/batch/service.ts`

**Problem**: No tracking of how many games have been successfully queued. If batch processing fails mid-way, there's no way to know where to resume.

**Impact**: Cannot safely retry failed batches without risk of duplicates.

---

#### 3. Spin-Wait on System Pause

**Location**: `src/worker/batch/service.ts` - `processBatchMessage()`

**Problem**: When system is paused, batch messages are re-queued with 60s delay:
```typescript
if (systemState.processingPaused) {
  await env.BATCH_QUEUE.send(msg, { delaySeconds: 60 });
  return;
}
```

**Impact**: 
- Long pauses (hours/days) cause continuous queue churn
- Consumes worker invocations unnecessarily
- Risk of hitting queue retry limits → messages sent to DLQ

---

### 🟡 P2 - Low

#### 4. Inaccurate Cost Estimation

**Location**: `src/worker/batch/service.ts` - `estimateCost()`

**Problem**: Uses hardcoded `DEFAULT_PRICING` instead of model-specific pricing from DB:
```typescript
const baseCostPer1k = (DEFAULT_PRICING.input * 0.7 + DEFAULT_PRICING.output * 0.3);
```

**Impact**: GPT-4o and GPT-4o-mini show same estimated cost, which is misleading.

---

#### 5. Missing Intermediate Batch States

**Location**: `src/worker/batch/service.ts`

**Problem**: Batch status jumps from `queued` → `processing` with no visibility into queuing progress.

**Impact**: No way to know if "All games have been queued to GAME_QUEUE" vs "Still queuing games".

---

## Solution Design

### Phase 1: Fix Duplicate Game Creation (P0)

**Approach**: Make game IDs deterministic based on batch ID + index.

#### Changes to `src/worker/batch/service.ts`:

```typescript
// BEFORE (non-deterministic)
const gameId = `game_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}_${i}`;

// AFTER (deterministic)
const gameId = `${batchId}_game_${String(i).padStart(5, '0')}`;
// Example: batch_mjril8ar_i44ye2_game_00042
```

**Benefits**:
- Same batch + same index = same game ID
- If queue retries, duplicate messages have same ID
- Workflow creation with duplicate ID is idempotent (or fails gracefully)

#### Additional Safety: Deduplication at Workflow Creation

In `src/worker/queues.ts`, add try-catch around workflow creation:

```typescript
try {
  await env.MAFIA_WORKFLOW.create({ id: gameId, params: {...} });
} catch (error) {
  // Handle duplicate workflow creation
  const errorMsg = error instanceof Error ? error.message : String(error);
  
  if (errorMsg.includes('already exists') || errorMsg.includes('running')) {
    console.log(`[${traceId}] Workflow ${gameId} already exists/running, skipping duplicate`);
    message.ack();
    return;
  }
  
  // Edge case: Workflow exists but is terminated/failed
  // For now, skip - but log for investigation
  if (errorMsg.includes('completed') || errorMsg.includes('failed')) {
    console.warn(`[${traceId}] Workflow ${gameId} previously terminated, skipping re-run`);
    message.ack();
    return;
  }
  
  throw error;
}
```

**Note**: If a workflow previously failed (e.g., during first step), the ID may be in "failed" state. The current policy is to skip re-runs to avoid duplicate games in stats. If needed, admin can manually retry via `/games/:id/resume`.

---

### Phase 2: Add Batch Queuing Checkpoint (P1)

**Approach**: Track `games_queued` in the batches table and resume from checkpoint.

#### Migration: `0037_batch_queued_count.sql`

```sql
ALTER TABLE batches ADD COLUMN games_queued INTEGER NOT NULL DEFAULT 0;
```

#### Changes to `src/worker/batch/service.ts`:

```typescript
export async function processBatchMessage(
  env: Env,
  batchId: string,
  config: BatchConfig,
  traceId?: string
): Promise<void> {
  // ... system pause check ...

  // Get current checkpoint
  const batch = await getBatch(env, batchId);
  if (!batch) {
    console.error(`[${traceId}] Batch ${batchId} not found`);
    return;
  }

  const startIndex = batch.games_queued;
  const CHECKPOINT_INTERVAL = 50; // Save progress every 50 games

  console.log(`[${traceId}] Processing batch ${batchId}: ${startIndex}/${config.totalGames} games queued`);

  // Update status to processing
  if (batch.status === 'queued') {
    await updateBatchStatus(env, batchId, 'processing');
  }

  const messages: MessageSendRequest<GameQueueMessage>[] = [];

  for (let i = startIndex; i < config.totalGames; i++) {
    const gameId = `${batchId}_game_${String(i).padStart(5, '0')}`;
    
    // ... build game message ...
    messages.push({ body: gameMessage });

    // Send in batches of 100
    if (messages.length >= 100) {
      await env.GAME_QUEUE.sendBatch(messages);
      messages.length = 0;

      // Checkpoint every 50 games
      if ((i + 1) % CHECKPOINT_INTERVAL === 0) {
        await updateGamesQueued(env, batchId, i + 1);
      }
    }
  }

  // Send remaining + final checkpoint
  if (messages.length > 0) {
    await env.GAME_QUEUE.sendBatch(messages);
  }
  await updateGamesQueued(env, batchId, config.totalGames);

  console.log(`[${traceId}] Batch ${batchId}: All ${config.totalGames} games queued`);
}

async function updateGamesQueued(env: Env, batchId: string, count: number): Promise<void> {
  await env.DB.prepare(`
    UPDATE batches SET games_queued = ? WHERE id = ?
  `).bind(count, batchId).run();
}
```

---

### Phase 3: Improve Pause Handling (P1)

**Approach**: Use exponential backoff with a maximum delay, and track pause wait time.

#### Changes to `src/worker/batch/service.ts`:

```typescript
export async function processBatchMessage(
  env: Env,
  batchId: string,
  config: BatchConfig,
  traceId?: string,
  attempt: number = 1
): Promise<void> {
  const systemState = await getSystemState(env);
  
  if (systemState.processingPaused) {
    // Exponential backoff: 60s, 120s, 240s, ... max 30 minutes
    const delaySeconds = Math.min(60 * Math.pow(2, attempt - 1), 1800);
    
    console.log(`[${traceId}] System paused, retrying batch ${batchId} in ${delaySeconds}s (attempt ${attempt})`);
    
    const msg: BatchQueueMessage = { 
      batchId, 
      config, 
      createdAt: Date.now(),
      pauseAttempt: attempt + 1, // Track attempts
    };
    if (traceId) msg.traceId = traceId;
    
    await env.BATCH_QUEUE.send(msg, { delaySeconds });
    return;
  }
  
  // Reset attempt counter when not paused
  // ... rest of processing ...
}
```

#### Update `BatchQueueMessage` type:

```typescript
interface BatchQueueMessage {
  batchId: string;
  config: BatchConfig;
  createdAt: number;
  traceId?: string;
  pauseAttempt?: number; // NEW: Track pause retry attempts
}
```

---

### Phase 4: Improve Cost Estimation (P2)

**Approach**: Query model pricing from DB when estimating costs.

#### Changes to `src/worker/batch/service.ts`:

```typescript
export async function estimateCost(
  env: Env, // Now requires env
  config: BatchConfig
): Promise<CostEstimate> {
  const { totalGames, gameConfig, useBatchAPI = false } = config;

  // Get unique model IDs from teams
  const modelIds = [...new Set(gameConfig.teams.map(t => t.modelId))];

  // Fetch pricing from DB
  const models = await env.DB.prepare(`
    SELECT id, config FROM models WHERE id IN (${modelIds.map(() => '?').join(',')})
  `).bind(...modelIds).all<{ id: string; config: string | null }>();

  // Calculate weighted average pricing
  let totalInputCost = 0;
  let totalOutputCost = 0;
  let modelCount = 0;

  for (const model of models.results) {
    const pricing = model.config ? JSON.parse(model.config).pricing : null;
    if (pricing) {
      totalInputCost += pricing.inputPer1K;
      totalOutputCost += pricing.outputPer1K;
      modelCount++;
    }
  }

  // Fall back to defaults if no pricing found
  const avgInputPer1K = modelCount > 0 ? totalInputCost / modelCount : DEFAULT_PRICING.input;
  const avgOutputPer1K = modelCount > 0 ? totalOutputCost / modelCount : DEFAULT_PRICING.output;

  // ... rest of calculation using actual pricing ...
}
```

#### Update callers:

- `admin.ts` POST /batches: Pass `env` to `estimateCost(env, config)`
- `admin.ts` POST /estimate: Pass `env` to `estimateCost(env, config)`

---

### Phase 5: Add Intermediate Batch States (P2)

**Approach**: Add `queuing` status between `queued` and `processing`.

#### Update batch status enum:

```typescript
type BatchStatus = 'queued' | 'queuing' | 'processing' | 'completed' | 'cancelled' | 'paused';
```

#### State transitions:

```
queued → queuing (when processBatchMessage starts)
queuing → processing (when all games_queued == total_games)
processing → completed (when completed_games + failed_games == total_games)
```

#### Benefits:
- Clear visibility: "This batch is still sending games to the queue"
- Admin can see progress: "500/1000 games queued"

---

## Implementation Order

| Phase | Task | Priority | Estimate |
|-------|------|----------|----------|
| 1 | Deterministic game IDs | P0 | 1 hour |
| 1 | Duplicate workflow handling | P0 | 30 min |
| 2 | Migration: games_queued column | P1 | 15 min |
| 2 | Checkpoint logic in processBatchMessage | P1 | 2 hours |
| 3 | Exponential backoff on pause | P1 | 1 hour |
| 4 | Model-specific cost estimation | P2 | 2 hours |
| 5 | Queuing status + state machine | P2 | 2 hours |

**Total Estimate**: 8-10 hours

---

## Testing Plan

### Unit Tests

1. **Deterministic ID generation**
   - Same batch + index = same game ID
   - Different batches = different game IDs

2. **Checkpoint resume**
   - Batch with games_queued=500 starts at index 500
   - Checkpoint updates correctly every N games

3. **Pause backoff**
   - Delay increases exponentially
   - Caps at 30 minutes

### Integration Tests

1. **Duplicate prevention**
   - Create workflow twice with same ID → second call is no-op
   - Queue retry → no duplicate games created

2. **Full batch flow**
   - Create batch → queuing → processing → completed
   - Verify games_queued == completed_games + failed_games == total_games

### Manual Testing

1. Create batch of 10 games, kill worker mid-queue, verify resume works
2. Pause system, create batch, verify exponential backoff in logs
3. Create batch with expensive/cheap models, verify estimate accuracy

---

## Rollback Plan

Each phase is independent and can be rolled back:

1. **Phase 1**: Revert to random IDs (low risk, duplicates were rare)
2. **Phase 2**: Migration is additive, code change is backward compatible
3. **Phase 3**: Revert to fixed 60s delay
4. **Phase 4**: Revert to DEFAULT_PRICING
5. **Phase 5**: Remove queuing status, keep as 2-state

---

## Success Metrics

| Metric | Before | Target |
|--------|--------|--------|
| Duplicate games per batch | Unknown (potentially 50%+) | 0 |
| Batch completion accuracy | ~100% (when no crashes) | 100% |
| Cost estimate accuracy | ±50% | ±20% |
| Pause queue churn | 1 msg/60s indefinitely | 1 msg/30min max |

---

---

## Part B: AI Batch API Reliability Issues

*These issues affect the AI provider batch processing system (`BatchService.ts`), not game batch creation.*

### 🔴 P0 - Critical

#### 6. Race Condition in Batch Aggregation

**Location**: `src/worker/batch/BatchService.ts` - `aggregateAndSubmit()`

**Problem**: If two cron triggers overlap, multiple workers select the same pending requests:
1. Worker A: `SELECT * FROM batch_requests WHERE status = 'pending'` → gets 100 requests
2. Worker B: `SELECT * FROM batch_requests WHERE status = 'pending'` → gets SAME 100 requests
3. Both submit to AI provider → **double billing**

**Fix**: Atomic claim with `UPDATE ... RETURNING` using subquery (D1/SQLite compatible):
```sql
-- NOTE: UPDATE...LIMIT is not guaranteed in D1. Use subquery instead.
UPDATE batch_requests 
SET status = 'bundling', bundled_at = ?
WHERE id IN (
  SELECT id FROM batch_requests 
  WHERE status = 'pending' AND model_id = ? 
  LIMIT 100
)
RETURNING *;
```

---

#### 7. Zombie Batch - Lost Provider Job ID

**Location**: `src/worker/batch/BatchService.ts` - `submitBatch()`

**Problem**: If worker crashes between API call and DB update:
1. `INSERT INTO batch_api_jobs` (status: pending)
2. `providerImpl.createBatch` → SUCCESS (provider has batch)
3. **CRASH HERE**
4. `UPDATE batch_api_jobs SET provider_job_id = ?` → NEVER HAPPENS

**Impact**: Batch runs on provider, costs money, but we never retrieve results. Game hangs forever.

**Fix**: Add recovery mechanism:
- Query provider's "List Batches" API to find orphaned batches
- Match via metadata (game IDs, timestamps)
- Or timeout pending jobs after N minutes and retry (accept double-submission risk)

**Prerequisite**: Update provider implementations to send `batch_job_id` in metadata:
```typescript
// In BaseBatchProvider or specific implementations
async createBatch(requests: BatchRequest[]): Promise<string> {
  const response = await this.client.batches.create({
    // ... existing params ...
    metadata: {
      mafia_arena_job_id: this.jobId, // Internal tracking ID
      created_at: new Date().toISOString(),
    }
  });
}
```

**Recovery query** (cron job):
```typescript
// Find orphaned jobs: pending for >5 minutes with no provider_job_id
const orphans = await db.query(`
  SELECT * FROM batch_api_jobs 
  WHERE status = 'pending' 
    AND provider_job_id IS NULL 
    AND created_at < datetime('now', '-5 minutes')
`);

for (const orphan of orphans) {
  // Option A: Query provider API for batches with matching metadata
  // Option B: Mark as failed and let requests retry
  await markJobFailed(orphan.id, 'Lost provider connection');
}
```

---

### 🟠 P1 - Medium

#### 8. Memory Overflow on Large Results

**Location**: `src/worker/batch/providers/BaseBatchProvider.ts` - `parseJsonl()`

**Problem**: 
```typescript
const jsonl = await response.text(); // Loads entire file into memory
return jsonl.split('\n')...
```

With 100 requests and verbose responses, results file can exceed 128MB worker memory limit.

**Fix**: Stream JSONL processing:
```typescript
const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop() || ''; // Keep incomplete line
  
  for (const line of lines) {
    if (line.trim()) yield JSON.parse(line);
  }
}
```

---

#### 9. Non-Idempotent Result Dispatch

**Location**: `src/worker/batch/BatchService.ts` - `pollAndDispatch()`

**Problem**: If worker crashes mid-dispatch, next cron re-processes same batch and overwrites results.

**Fix**: Add idempotency check:
```sql
UPDATE batch_requests 
SET status = 'completed', result = ?
WHERE id = ? AND status != 'completed';
```

---

### 🟡 P2 - Low

#### 10. Inefficient Batch Polling

**Location**: `src/worker/providers/WorkflowAIProvider.ts` - `waitForBatchResult()`

**Problem**: Fixed 10-minute polling interval. If batch finishes in 11 minutes, waits 20 minutes total.

**Fix**: Dynamic polling with backoff:
```typescript
const intervals = ['1 minute', '2 minutes', '5 minutes', '10 minutes', '10 minutes', ...];
```

---

## Updated Implementation Order

**Priority Order**: Financial impact (double-billing) → Data integrity → UX improvements

| Phase | Task | Priority | Estimate | Reason |
|-------|------|----------|----------|--------|
| **Phase A: Critical Fixes (Do First)** |
| 1 | Deterministic game IDs | P0 | 1 hour | Prevents duplicate games |
| 1 | Duplicate workflow handling | P0 | 30 min | Defense in depth |
| 6 | Atomic aggregation claim | P0 | 2 hours | **Prevents double-billing** |
| 7 | Add metadata to provider calls | P0 | 1 hour | Required for zombie recovery |
| **Phase B: Reliability** |
| 2 | Migration: games_queued column | P1 | 15 min | Enables checkpointing |
| 2 | Checkpoint logic in processBatchMessage | P1 | 2 hours | Resume from failures |
| 7 | Zombie batch recovery cron | P1 | 3 hours | Detect lost batches |
| 9 | Idempotent result dispatch | P1 | 1 hour | Safe re-processing |
| **Phase C: Improvements** |
| 3 | Exponential backoff on pause | P1 | 1 hour | Reduce queue churn |
| 8 | Streaming JSONL parser | P1 | 3 hours | Prevent OOM on large batches |
| **Phase D: Polish** |
| 4 | Model-specific cost estimation | P2 | 2 hours | Better UX |
| 5 | Queuing status + state machine | P2 | 2 hours | Better observability |
| 10 | Dynamic batch polling | P2 | 1 hour | Faster batch completion |

**Total Estimate**: 18-20 hours

---

## Open Questions

1. Should we add a `max_pause_duration` after which batches auto-cancel?
2. Should game IDs include a version/hash for cache busting if config changes?
3. Do we need to migrate existing batches or just fix for new ones?
4. For zombie batch recovery, should we prefer provider API query or aggressive timeout?
5. Is D1's SQLite capable of `UPDATE ... RETURNING`? If not, what's the alternative?

---

## References

- Original code review: Gemini deep analysis (2025-12-29)
- Related files:
  - `src/worker/batch/service.ts`
  - `src/worker/batch/index.ts`
  - `src/worker/routes/admin.ts`
  - `src/worker/queues.ts`
  - `src/worker/types.ts`

