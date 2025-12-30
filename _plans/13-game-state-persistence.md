# Plan 13: Granular Game State Persistence & UI Visibility

**Status**: Planning → Ready for Implementation  
**Priority**: High  
**Estimated Effort**: 2-3 days  
**Created**: 2025-12-30  
**Gemini Review Score**: 9/10 ✅

### Review Corrections Applied
- ✅ Fixed `this.clients` → `this.sessions` in GameRunner code
- ✅ Fixed file path `src/worker/durable-objects/GameRunner.ts` → `src/worker/GameRunner.ts`
- ✅ Fixed URL `http://internal/internal/progress` → `http://internal/progress`
- ✅ Added route registration step for `/internal/progress`
- ✅ Added Gemini review workflow section
- ✅ Added nice-to-have improvements (analytics, testing, UI)

---

## Executive Summary

Currently, the game state is only checkpointed to R2 and KV at the end of each phase (e.g., after *all* introductions are done). If a workflow crashes mid-phase, we lose visibility into progress, and the UI remains stuck on "Running" without indicating who we are waiting for.

This plan implements a "CQRS-lite" pattern where the Workflow frequently updates a "View Model" in KV containing granular progress (e.g., "Waiting for Player 3 to vote"). This enables real-time UI feedback and ensures that if a workflow restarts (replays steps), the user sees the recovery progress.

### Problems Addressed

1. **🔴 Stuck Games (P0)**: AI API calls hang indefinitely without timeout - games appear "stuck" for 60+ minutes
2. **Crash Recovery**: When a game crashes mid-phase, conversation history and progress is lost
3. **UI Visibility**: Running games show minimal state `{ status: 'running', eventCount: 0 }` with no indication of what's happening

---

## Research Summary

### Key Findings

- Workflows only checkpoint to R2 at **phase boundaries**, leaving games vulnerable mid-phase
- The `WorkflowGameState` in KV lacks progress indicators
- Phase executors already accept `onStateUpdate` callbacks (currently unused in Workflow)
- Cloudflare Workflows memoize `step.do` results - on restart, completed steps return immediately
- KV writes are cheap (~15/round is negligible vs AI costs)

### Files Explored

| File | Purpose |
|------|---------|
| `src/worker/workflows/MafiaWorkflow.ts` | Main orchestration loop. Currently only syncs state after phase completion |
| `src/worker/utils/workflow-sync.ts` | Utilities for writing `WorkflowGameState` to KV |
| `src/engine/GameState.ts` | Core state object. Needs logic to determine pending actions |
| `src/engine/phases/*.ts` | Phase executors with `onStateUpdate` callback |
| `src/worker/routes/games.ts` | API endpoints that read from KV to serve UI state |

### Existing Patterns to Follow

- **Idempotency**: Engine uses `utils/idempotency.ts` to prevent duplicate events during replays
- **Step Memoization**: `WorkflowAIProvider` uses `step.do` to wrap AI calls (primary crash recovery)
- **State Callbacks**: `executeIntroductionPhase` accepts an `onStateUpdate` callback
- **R2 Checkpoints**: Already using R2 for large state (see `saveCheckpointToR2`) because of step.do size limits

---

## Cloudflare Infrastructure Limits

⚠️ **Critical constraints that affect our architecture:**

### Workers KV

| Limit | Value | Impact |
|-------|-------|--------|
| **Value size** | 25 MiB max | Game state must stay under this |
| **Key size** | 512 bytes max | Not an issue for game IDs |
| **Write rate** | 1 write/sec per key | **CRITICAL**: Can't sync after every AI action to same key |
| **Read rate** | Unlimited | Safe for polling |

⚠️ **The 1 write/sec per key limit** means we can NOT do `step.do('sync-pre-player1')` then `step.do('sync-post-player1')` rapidly. We must either:
1. Use different keys for each sync (e.g., `game-state:{gameId}:sync:{timestamp}`)
2. Batch updates and sync less frequently (every 2-3 seconds)
3. Use Durable Object storage instead of KV for real-time updates

### Cloudflare Workflows

| Limit | Value | Impact |
|-------|-------|--------|
| **step.do return value** | ~1 MB | Already addressed via R2 checkpoints |
| **Step count** | Unknown (high) | Monitor for 10+ round games |
| **Workflow duration** | Up to 1 year | Not a concern |
| **Memory** | 128 MB per invocation | Large state must stream/chunk |

### Durable Objects Storage

| Limit | Value | Impact |
|-------|-------|--------|
| **Storage per DO** | 10 GB | More than enough |
| **Key size** | 2 KiB (2048 bytes) | Fine for our keys |
| **Value size** | 128 KiB (131,072 bytes) | **CRITICAL**: Individual DO storage values limited |
| **Combined key+value** | 2 MB (some sources) | Varies by operation |

⚠️ **DO storage** is better for frequent writes (no rate limit per key), but has smaller per-value limits.

### R2 Object Storage

| Limit | Value | Impact |
|-------|-------|--------|
| **Object size** | 5 TiB | More than enough |
| **Single upload** | 5 GiB | More than enough |
| **Write rate** | 1 write/sec per key | Same as KV |
| **Metadata size** | 8 KiB | Fine for our metadata |

### D1 Database

| Limit | Value | Impact |
|-------|-------|--------|
| **Database size** | 10 GB (paid) | Monitor long-term |
| **Row/BLOB size** | 2 MB max | **CRITICAL**: Can't store full transcript in D1 |
| **Columns per table** | 100 max | Fine |

### Recommended Architecture Given Limits

Given the **1 write/sec per key** KV limit:

1. **Don't sync to KV after every AI action** - will hit rate limit
2. **Use unique keys** or **Durable Object storage** for real-time progress
3. **Batch KV updates** - sync every 3-5 seconds or on significant state changes
4. **Use R2 for large state** (already doing this with checkpoints)

**Proposed Solution**: Use a combination approach:
- **KV**: Sync once per phase + on significant milestones (not per action)
- **DO WebSocket**: Broadcast real-time progress to connected clients (no storage limits)
- **R2**: Continue using for large state checkpoints

---

## Approach Selection

### Option A: R2 Persistence Per Action

**Description:** Write the full serialized `GameState` to R2 after every single AI action.

**Pros:**
- Extreme durability
- Can resume from any point without replay

**Cons:**
- Slow (R2 latency per action)
- Expensive (Class A write operations)
- Creates thousands of small files
- Overkill for "viewing" state

**Effort:** High

---

### Option B: KV View Model + Workflow Replay (Recommended)

**Description:** Update a lightweight JSON object in KV after every action containing just enough data for the UI (progress, current actor, recent events). Rely on Cloudflare Workflow's native `step.do` memoization for actual "state recovery".

**Pros:**
- Fast (KV is low latency)
- Cheap (KV writes are essentially free)
- Excellent UI feedback ("Waiting for GPT-4...")
- Aligns with Cloudflare Workflow architecture

**Cons:**
- If Workflow history is lost (rare platform failure), falls back to last phase checkpoint

**Effort:** Medium

---

### Option C: Full Event Sourcing

**Description:** Store every event to D1/R2 as it happens. Rebuild state by replaying events.

**Pros:**
- Complete audit trail
- Can replay/debug any crash

**Cons:**
- High complexity
- Replay time grows with game length
- Significant refactoring needed

**Effort:** Very High

---

### Chosen Approach: Option B

**Reasoning:** KV View Model provides the best balance of UI responsiveness, crash recovery, and implementation effort. The ~15 KV writes per round are negligible compared to AI inference costs, and Cloudflare's native step memoization handles the heavy lifting for crash recovery.

---

## Implementation Steps

### Step 1: Add `getPendingActions` to GameState

**File(s):** `src/engine/GameState.ts`

**Description:**
Add a helper method to determine which players are expected to act next based on the current phase and existing events.

**Code Changes:**

```typescript
// src/engine/GameState.ts

export class GameState {
  // ... existing code ...

  /**
   * Get list of players who still need to act in the current phase/round.
   * Used for UI progress indicators.
   */
  getPendingActions(): Array<{
    playerId: string;
    name: string;
    team: string;
    modelId: string;
    actionType: 'introduction' | 'discussion' | 'vote' | 'night_action';
  }> {
    const pending: typeof this.getPendingActions extends () => infer R ? R : never = [];
    
    if (this.phase === 'introduction') {
      for (const p of this.alivePlayers) {
        const hasIntro = this.events.some(e => 
          e.type === 'introduction' && e.playerId === p.id
        );
        if (!hasIntro) {
          pending.push({
            playerId: p.id,
            name: p.name,
            team: p.team,
            modelId: p.modelId,
            actionType: 'introduction'
          });
        }
      }
    }
    else if (this.phase === 'day_discussion') {
      // For discussion, we track who hasn't spoken in current sub-round
      // Implementation depends on how sub-rounds are tracked
    }
    else if (this.phase === 'day_vote') {
      for (const p of this.alivePlayers) {
        const hasVoted = this.events.some(e =>
          e.type === 'vote' && 
          e.round === this.round && 
          e.voterId === p.id
        );
        if (!hasVoted) {
          pending.push({
            playerId: p.id,
            name: p.name,
            team: p.team,
            modelId: p.modelId,
            actionType: 'vote'
          });
        }
      }
    }
    else if (this.phase === 'night') {
      const mafia = this.alivePlayers.filter(p => p.team === 'mafia');
      for (const p of mafia) {
        const hasAction = this.events.some(e =>
          e.type === 'night_action' && 
          e.round === this.round && 
          e.actorId === p.id
        );
        if (!hasAction) {
          pending.push({
            playerId: p.id,
            name: p.name,
            team: p.team,
            modelId: p.modelId,
            actionType: 'night_action'
          });
        }
      }
    }
    
    return pending;
  }
  
  /**
   * Get progress information for UI display.
   */
  getProgress(): {
    current: number;
    total: number;
    label: string;
    pendingPlayers: string[];
  } {
    const pending = this.getPendingActions();
    const total = this.alivePlayers.length;
    const completed = total - pending.length;
    
    const pendingNames = pending.map(p => p.name);
    const label = pending.length === 0 
      ? 'All actions complete'
      : `Waiting for ${pending.length} player${pending.length > 1 ? 's' : ''}`;
    
    return { current: completed, total, label, pendingPlayers: pendingNames };
  }
}
```

**Acceptance Criteria:**
- [ ] `getPendingActions` returns correct list for Introduction phase
- [ ] Returns correct list for Voting phase (players who haven't voted)
- [ ] Returns correct list for Night phase (Mafia who haven't acted)
- [ ] `getProgress` returns human-readable progress info

**Verification:**
```bash
timeout 30s pnpm test -- -t "getPendingActions"
```

---

### Step 2: Enhance WorkflowGameState Interface

**File(s):** `src/worker/utils/workflow-sync.ts`

**Description:**
Update the `WorkflowGameState` interface to include progress and pending action information.

**Code Changes:**

```typescript
// src/worker/utils/workflow-sync.ts

export interface WorkflowGameState {
  state: SerializedGameState;
  status: 'running' | 'completed' | 'failed';
  error?: string;
  updatedAt: number;
  transcriptKey?: string;
  
  // NEW: Progress information for UI
  progress?: {
    current: number;
    total: number;
    label: string;
    pendingPlayers: string[];  // Names of players we're waiting for
  };
  
  // NEW: Current phase info (derived from state but easier for UI)
  currentPhase?: string;
  currentRound?: number;
  
  // NEW: What we're actively waiting for (direct flow)
  waitingFor?: {
    playerName: string;
    modelId: string;
    actionType: string;
  } | null;
  
  // NEW: Batch API status (for discountPricing games)
  batchStatus?: {
    isWaitingForBatch: boolean;
    provider: string;         // 'openai' | 'anthropic'
    submittedAt: number;      // Timestamp when batch was submitted
    pollCount: number;        // How many times we've polled
    estimatedWaitHours?: number;
  };
}

export interface SaveGameStateOptions {
  currentPhase?: string;
  progress?: WorkflowGameState['progress'];
  waitingFor?: WorkflowGameState['waitingFor'];
}

export async function saveGameStateToKV(
  env: Env,
  gameId: string,
  state: GameState,
  status: 'running' | 'completed' | 'failed',
  options?: SaveGameStateOptions
): Promise<void> {
  const kvState: WorkflowGameState = {
    state: state.serialize(),
    status,
    updatedAt: Date.now(),
    // Include new fields
    currentPhase: options?.currentPhase ?? state.phase,
    currentRound: state.round,
    progress: options?.progress ?? state.getProgress(),
    waitingFor: options?.waitingFor,
  };
  
  await env.GAME_STATE_KV.put(
    `game-state:${gameId}`,
    JSON.stringify(kvState),
    { expirationTtl: 86400 * 7 }
  );
}
```

**Acceptance Criteria:**
- [ ] KV object includes `progress` field
- [ ] KV object includes `waitingFor` field
- [ ] Backward compatibility for existing calls (fields optional)

**Verification:**
```bash
timeout 30s pnpm typecheck
```

---

### Step 3: Implement Real-Time Progress via WebSocket + Throttled KV

**File(s):** `src/worker/workflows/MafiaWorkflow.ts`, `src/worker/durable-objects/GameRunner.ts`

**Description:**
Due to KV's 1 write/sec per key rate limit, we can NOT sync before/after every AI action to KV.

**Strategy:**
1. **WebSocket (real-time)**: Broadcast progress to connected clients via DO - no rate limit
2. **KV (polling fallback)**: Throttled updates every ~3 seconds or on phase changes
3. **Use unique keys** for more frequent updates if needed: `game-progress:{gameId}:{timestamp}`

**Code Changes:**

```typescript
// src/worker/workflows/MafiaWorkflow.ts

/**
 * Broadcast progress to WebSocket clients via DO.
 * This has NO rate limit - safe to call after every action.
 */
private async broadcastProgress(
  state: GameState,
  waitingFor?: { playerName: string; modelId: string; actionType: string } | null
): Promise<void> {
  try {
    const id = this.env.GAME_RUNNER.idFromName(this.gameId);
    const stub = this.env.GAME_RUNNER.get(id);
    
    const progress = state.getProgress();
    
    await stub.fetch('http://internal/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameId: this.gameId,
        phase: state.phase,
        round: state.round,
        progress,
        waitingFor,
        timestamp: Date.now(),
      }),
    });
  } catch {
    // Non-fatal - best effort
  }
}

/**
 * Throttled KV sync - use for polling clients.
 * Only syncs if enough time has passed since last sync.
 */
private lastKVSync = 0;
private readonly KV_SYNC_INTERVAL_MS = 3000; // 3 seconds

private async maybeSyncToKV(
  step: WorkflowStep,
  state: GameState,
  stepId: string,
  force: boolean = false
): Promise<void> {
  const now = Date.now();
  if (!force && now - this.lastKVSync < this.KV_SYNC_INTERVAL_MS) {
    return; // Skip - too soon
  }
  
  await step.do(stepId, async () => {
    await saveGameStateToKV(this.env, this.gameId, state, 'running', {
      currentPhase: state.phase,
      progress: state.getProgress(),
    });
  });
  this.lastKVSync = now;
}

// Example: Inside Introduction phase loop
for (const player of speakingOrder) {
  // Broadcast "Waiting for X" via WebSocket (instant, no rate limit)
  await this.broadcastProgress(state, { 
    playerName: player.name, 
    modelId: player.modelId, 
    actionType: 'introduction' 
  });
  
  // Execute AI action (existing logic)
  const response = await step.do(`intro-${player.id}`, async () => {
    return await aiProvider.getIntroduction(player, state);
  });
  
  // Apply to state
  state = state.addEvent({ type: 'introduction', playerId: player.id, message: response });
  
  // Broadcast updated progress (instant)
  await this.broadcastProgress(state, null);
  
  // Throttled KV sync for polling clients (every ~3 sec)
  await this.maybeSyncToKV(step, state, `sync-intro-${player.id}`);
}

// Force KV sync at phase end
await this.maybeSyncToKV(step, state, `sync-intro-complete`, true);
```

**GameRunner DO Update** (`src/worker/GameRunner.ts`):

```typescript
// 1. Add to switch statement in fetch() method
case '/internal/progress':
  return await this.handleProgressUpdate(request);

// 2. Add method implementation
async handleProgressUpdate(request: Request): Promise<Response> {
  const data = await request.json(); // Type as ProgressUpdate if needed
  
  // Store in DO storage (no rate limit)
  await this.state.storage.put('progress', data);
  
  // Broadcast to all connected WebSocket clients
  // NOTE: Use this.sessions, NOT this.clients (matches actual codebase)
  const message = JSON.stringify({
    type: 'PROGRESS',
    ...data,
  });

  for (const session of this.sessions) {
    try {
      session.send(message);
    } catch {
      // Session dead, will be cleaned up by hibernation API
    }
  }
  
  return new Response('OK');
}
```

**Acceptance Criteria:**
- [ ] WebSocket clients receive real-time progress updates
- [ ] KV updates are throttled to respect 1 write/sec limit
- [ ] Polling clients get reasonably fresh state (within 3 sec)
- [ ] Phase boundaries force KV sync for consistency

**Verification:**
```bash
# Manual: Start a game and check KV state during execution
wrangler kv:key get --binding=GAME_STATE_KV "game-state:{gameId}"
```

---

### Step 4: Update API Response

**File(s):** `src/worker/routes/games.ts`

**Description:**
Update the `GET /api/games/:id/events` endpoint to return the new progress fields.

**Code Changes:**

```typescript
// src/worker/routes/games.ts

// In GET /:id/events handler
if (kvState) {
  return c.json({
    status: kvState.status,
    gameId: id,
    eventCount: kvState.state?.events?.length ?? 0,
    events: kvState.state?.events ?? [],
    // NEW: Include progress info
    phase: kvState.currentPhase,
    round: kvState.currentRound,
    progress: kvState.progress,
    waitingFor: kvState.waitingFor,
  });
}
```

**Acceptance Criteria:**
- [ ] API returns `progress` object when game is running
- [ ] API returns `waitingFor` object during AI calls
- [ ] Backward compatible (fields are optional in response)

**Verification:**
```bash
# Manual verification
curl http://localhost:8787/api/games/{gameId}/events | jq '.progress'
```

---

### Step 5: Update Frontend to Display Progress

**File(s):** `frontend/app/routes/games/$id.tsx` (or relevant component)

**Description:**
Update the game detail page to show progress indicators when a game is running.

**Code Changes:**

```tsx
// frontend/app/routes/games/$id.tsx

function GameProgress({ progress, waitingFor }: { 
  progress?: { current: number; total: number; label: string; pendingPlayers: string[] };
  waitingFor?: { playerName: string; modelId: string; actionType: string } | null;
}) {
  if (!progress) return null;
  
  const percentage = Math.round((progress.current / progress.total) * 100);
  
  return (
    <div className="game-progress">
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${percentage}%` }} />
      </div>
      <p className="progress-label">{progress.label}</p>
      {waitingFor && (
        <p className="waiting-for">
          <span className="spinner" />
          Waiting for <strong>{waitingFor.playerName}</strong> ({waitingFor.modelId}) 
          to {waitingFor.actionType.replace('_', ' ')}...
        </p>
      )}
    </div>
  );
}
```

**Acceptance Criteria:**
- [ ] Progress bar shows completion percentage
- [ ] "Waiting for X" message displays during AI calls
- [ ] Graceful handling when fields are undefined

**Batch-Specific UI:**

```tsx
// Handle batch games differently from direct games
function GameProgress({ progress, waitingFor, batchStatus }: GameProgressProps) {
  // Batch game - show "waiting for batch" UI
  if (batchStatus?.isWaitingForBatch) {
    return (
      <div className="batch-status">
        <span className="batch-icon">⏳</span>
        <p>Waiting for {batchStatus.provider} batch processing...</p>
        <p className="muted">
          Submitted {formatTimeAgo(batchStatus.submittedAt)}
          {batchStatus.estimatedWaitHours && 
            ` • Est. ${batchStatus.estimatedWaitHours}h remaining`}
        </p>
        <p className="help-text">
          Batch games can take up to 24 hours. Check back later!
        </p>
      </div>
    );
  }
  
  // Direct game - show real-time progress
  if (waitingFor) {
    return (
      <div className="direct-status">
        <span className="spinner" />
        <p>Waiting for {waitingFor.playerName} to {waitingFor.actionType}...</p>
      </div>
    );
  }
  
  // ... progress bar UI
}
```

---

## Testing Strategy

### Unit Tests

| Component | Test File | Tests to Add |
|-----------|-----------|--------------|
| GameState.getPendingActions | `src/engine/__tests__/GameState.test.ts` | Test for all phases |
| GameState.getProgress | `src/engine/__tests__/GameState.test.ts` | Test progress calculation |

### Integration Tests

1. **Progress Updates**: Start game, verify KV updates after each action
2. **Crash Recovery**: Kill worker mid-phase, restart, verify workflow resumes with correct state

### Manual Testing

1. Start a game via `/games/new` or API
2. Open game detail page in browser
3. Verify progress bar updates in real-time
4. Verify "Waiting for [Player Name]" shows during AI calls
5. Refresh page mid-game, verify state is preserved

---

## Rollback Plan

If issues arise:

1. **Step 1-2**: No rollback needed (additive changes)
2. **Step 3**: Revert workflow sync calls, falls back to phase-end syncs
3. **Step 4-5**: Frontend gracefully handles missing fields

All changes are backward compatible - existing games continue to work.

---

## Migration Notes

- **KV Schema**: Changes are additive. Existing games will lack `progress` field until they update
- **No D1 migrations**: State changes are in KV/R2 only
- **Frontend**: Must handle `undefined` for new fields during transition

---

## Open Questions

- [ ] **Step Count Limits**: Does adding sync steps per action exhaust Cloudflare Workflow step limits for long games (10+ rounds)?
- [x] ~~**KV Rate Limits**: Is ~15 writes/round sustainable?~~ → **NO!** KV has 1 write/sec per key limit. Must use WebSocket for real-time + throttled KV.
- [x] ~~**WebSocket Broadcast**: Should we also push progress updates via WebSocket?~~ → **YES!** This is the only way to get real-time updates without hitting KV limits.
- [ ] **Discussion Phase**: How do we track "sub-rounds" for discussion progress?
- [ ] **DO Storage vs KV**: Should we use Durable Object storage (128 KiB limit per value, no rate limit) instead of KV for progress state?
- [ ] **Workflow step.do Size**: Verify the ~1MB limit per step.do return value. Current R2 checkpoint pattern should handle this.
- [ ] **Long Game Memory**: For games with 10+ rounds and verbose AI responses, will the in-memory GameState exceed 128MB worker limit?

---

## 🔴 CRITICAL: AI Provider Timeout Handling

### Root Cause of Stuck Games

**Investigation revealed the PRIMARY cause of stuck games is NOT workflow issues, but hanging AI API calls:**

| Game ID | Models | Status | Stuck On |
|---------|--------|--------|----------|
| `game_mjrtcje4_lbqaw4_direct` | `gemini-3-flash` + `glm-4p7` | Running 56+ min | Single AI call |
| `game_mjru2fjo_gz3shx_direct` | `gemini-2.5-flash-lite` + `gemini-2.5-flash` | Running 60+ min | `ai-1-day_vote-player_5-elimination_vote-0-1` |

**Evidence:**
- Workflows successfully complete 130+ steps
- Then hang indefinitely on a **single Google Gemini API call**
- No timeout, no error, no response - just hangs forever
- Health checks report "stuck" because heartbeat goes stale

### Why Current Timeouts Don't Work

`GoogleAIProvider` has an `AbortController` timeout, but it's not being respected:
- Either `fetch` in Workers runtime doesn't honor the signal under certain network conditions
- Or the error is being swallowed somewhere

### Defense in Depth Strategy

We need **three layers** of timeout protection:

| Layer | Location | Timeout | Purpose |
|-------|----------|---------|---------|
| **1. Provider** | `GoogleAIProvider.ts` | 60 sec | Close sockets, be a good citizen |
| **2. Promise.race** | `WorkflowAIProvider.ts` | 120 sec | **Hard guarantee** - force rejection if provider hangs |
| **3. step.do** | Workflow engine | 3 min | Platform-level safety net |

### Step 6: Add Hard Timeout to WorkflowAIProvider (Direct Flow ONLY)

**File(s):** `src/worker/providers/WorkflowAIProvider.ts`

**Description:**
Wrap AI provider calls in `Promise.race` to guarantee timeout even if `fetch` hangs.

⚠️ **CRITICAL: Only apply to `executeDirectFlow`** - NOT `executeBatchFlow`!

Batch API games (`discountPricing=true`) use a polling loop that can last up to 24 hours. Applying the 120s timeout to batch flow would **break all batch games**.

**Code Changes:**

```typescript
// src/worker/providers/WorkflowAIProvider.ts

// ⚠️ ONLY inside executeDirectFlow method - NOT executeBatchFlow!
const STEP_TIMEOUT_MS = 120_000; // 2 minutes - MUST be shorter than step.do timeout

const result = await this.step.do(stepId, {
  retries: {
    limit: 3,
    delay: '5 second',
    backoff: 'exponential',
  },
  timeout: '3 minutes', // Cloudflare platform limit
}, async () => {
  const provider = createProviderFromContext(modelContext, this.env, {
    enableRetry: true,
    discountPricing: this.options.discountPricing ?? false,
  });

  const startTime = Date.now();

  // CRITICAL: Wrap in Promise.race to force timeout
  const aiCallPromise = provider.complete({
    systemPrompt: prompt.systemPrompt,
    userPrompt: prompt.userPrompt,
    structuredOutput,
    temperature: 0.7,
    maxTokens: 4000,
  });

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`AI call timed out after ${STEP_TIMEOUT_MS}ms for model ${modelContext.id}`));
    }, STEP_TIMEOUT_MS);
  });

  try {
    const response = await Promise.race([aiCallPromise, timeoutPromise]);

    return {
      content: response.content,
      tokensUsed: response.tokensUsed,
      latencyMs: Date.now() - startTime,
      modelId: response.modelId,
    };
  } catch (error) {
    // Log timeout vs provider error
    if (error instanceof Error && error.message.includes('timed out')) {
      this.log.error('Hard timeout triggered in Workflow step', { 
        modelId: modelContext.id, 
        stepId 
      });
    }
    throw error; // Re-throw to trigger step.do retries
  }
});
```

**Acceptance Criteria:**
- [ ] AI calls timeout after 120 seconds even if fetch hangs
- [ ] Timeout triggers step.do retry logic (3 attempts with exponential backoff)
- [ ] Timeout errors are explicitly logged for debugging
- [ ] After 3 retries, game fails with clear timeout error message

---

### Step 7: Verify Signal Propagation in GoogleAIProvider

**File(s):** `src/worker/ai/providers/GoogleAIProvider.ts`

**Description:**
Ensure the AbortController signal is correctly passed to fetch.

**Code Changes:**

```typescript
// src/worker/ai/providers/GoogleAIProvider.ts

const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

try {
  const response = await fetch(url, {
    method: 'POST',
    headers: { /* ... */ },
    body: JSON.stringify(googleRequest),
    signal: controller.signal, // <--- MUST be present
  });
  // ...
} finally {
  clearTimeout(timeoutId); // Clean up timer
}
```

**Acceptance Criteria:**
- [ ] `signal: controller.signal` is passed to every fetch call
- [ ] `clearTimeout` is called in finally block

---

### Step 8: Improve Error Handling in MafiaWorkflow

**File(s):** `src/worker/workflows/MafiaWorkflow.ts`

**Description:**
Detect timeout errors specifically to give better UI feedback.

**Code Changes:**

```typescript
// src/worker/workflows/MafiaWorkflow.ts - error handler

} catch (err) {
  const errorMessage = err instanceof Error ? err.message : String(err);
  
  // Detect timeout specifically for better UI feedback
  const isTimeout = errorMessage.includes('timed out') || 
                    errorMessage.includes('Durable Object reset') ||
                    errorMessage.includes('AbortError');
  
  const finalError = isTimeout 
    ? `AI Provider timed out repeatedly. The model may be experiencing high load. Error: ${errorMessage}`
    : errorMessage;

  this.log.error('Workflow failed', { gameId, error: finalError, isTimeout });

  await step.do('handle-error', async () => {
    await saveErrorStateToKV(this.env, gameId, finalError, state);
    // ... rest of error handling
  });
}
```

**Acceptance Criteria:**
- [ ] Timeout errors show user-friendly message
- [ ] Error logs include `isTimeout` flag for monitoring
- [ ] UI can display "AI provider timed out" instead of generic error

---

---

### Step 9: Update Batch Polling with Progress Updates

**File(s):** `src/worker/providers/WorkflowAIProvider.ts`

**Description:**
Batch games spend 99% of their time sleeping in `waitForBatchResult`. Without updates, users see "Waiting for Player X" then silence for hours. Update KV periodically during batch polling.

**Code Changes:**

```typescript
// src/worker/providers/WorkflowAIProvider.ts

// Inside waitForBatchResult polling loop
private async waitForBatchResult(
  requestId: string,
  modelContext: ModelContext,
  maxWaitTime: number = 24 * 60 * 60 * 1000 // 24 hours
): Promise<BatchResult> {
  const pollInterval = 10 * 60 * 1000; // 10 minutes
  const maxPolls = Math.ceil(maxWaitTime / pollInterval);
  const submittedAt = Date.now();
  
  for (let i = 0; i < maxPolls; i++) {
    // Check batch status
    const result = await this.step.do(`poll-${requestId}-${i}`, async () => {
      return await this.checkBatchStatus(requestId);
    });
    
    if (result.status === 'completed') {
      return result;
    }
    
    if (result.status === 'failed') {
      throw new Error(`Batch request failed: ${result.error}`);
    }
    
    // NEW: Update KV every 6 polls (~1 hour) so UI knows we're alive
    if (i % 6 === 0 && i > 0) {
      await this.step.do(`batch-progress-${i}`, async () => {
        await saveGameStateToKV(this.env, this.gameId, this.currentState, 'running', {
          batchStatus: {
            isWaitingForBatch: true,
            provider: modelContext.provider,
            submittedAt,
            pollCount: i,
            estimatedWaitHours: Math.max(0, Math.ceil((maxWaitTime - (i * pollInterval)) / 3600000)),
          },
        });
      });
    }
    
    // Sleep before next poll
    await this.step.sleep('poll-wait', pollInterval);
  }
  
  throw new Error('Batch request timed out after 24 hours');
}
```

**Acceptance Criteria:**
- [ ] Batch games update KV every ~1 hour during polling
- [ ] UI shows "Waiting for batch processing" with estimated time
- [ ] Games don't appear "stuck" during batch polling

---

### Timeout Handling Flow

```
AI Call Start
     │
     ▼
┌────────────────────────────────────────────┐
│  Layer 1: Provider timeout (60s)           │
│  - AbortController cancels fetch           │
│  - If works: throws AbortError             │
└────────────────┬───────────────────────────┘
                 │ (may hang if fetch ignores signal)
                 ▼
┌────────────────────────────────────────────┐
│  Layer 2: Promise.race (120s)              │
│  - HARD GUARANTEE - forces rejection       │
│  - Throws: "AI call timed out..."          │
└────────────────┬───────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────┐
│  step.do retry logic                       │
│  - 3 retries with exponential backoff      │
│  - 5s → 10s → 20s delays                   │
└────────────────┬───────────────────────────┘
                 │ (if all retries fail)
                 ▼
┌────────────────────────────────────────────┐
│  Layer 3: step.do timeout (3 min)          │
│  - Platform-level safety net               │
│  - Kills entire step if still hanging      │
└────────────────┬───────────────────────────┘
                 │
                 ▼
        Game fails with clear error

---

## Dependencies

### Implementation Priority Order

| Priority | Steps | Description | Estimated Time |
|----------|-------|-------------|----------------|
| **P0** | Step 6, 7, 8 | AI timeout handling - fixes stuck **direct** games | 2-3 hours |
| **P1** | Step 9 | Batch polling progress updates | 1 hour |
| **P2** | Step 1, 2 | Add `getPendingActions` + enhance KV state | 2 hours |
| **P3** | Step 3, 4 | WebSocket progress + API updates | 3 hours |
| **P4** | Step 5 | Frontend progress display (incl. batch UI) | 2 hours |

### Must Be Done First
- **Steps 6-8 (Timeout Handling)**: Root cause of stuck direct games - fix first
- **Step 9 (Batch Progress)**: Ensures batch games show progress during 24h polling

### Can Be Parallelized
- Step 1 & Step 2 can be done in parallel
- Step 6 & Step 7 can be done in parallel
- Step 4 & Step 5 can be done in parallel after Step 2

### Batch API Compatibility Checklist
- [ ] Step 6 timeout ONLY applies to `executeDirectFlow`
- [ ] `executeBatchFlow` retains 24-hour polling timeout
- [ ] Step 9 updates KV during batch polling (~1 hour intervals)
- [ ] Frontend distinguishes batch vs direct game status
- [ ] Admin batch view uses D1 polling, NOT WebSocket per game

### ⚠️ WebSocket Scaling Warning

**Do NOT** connect to WebSocket for every game in a batch from the admin view:
- Batches can have 100+ games running in parallel
- Opening 100 WebSocket connections will overwhelm the browser
- Admin batch view should use **D1 polling** for aggregate progress
- Only connect WebSocket when drilling into a **single game**

---

## Success Metrics

| Metric | Before | Target |
|--------|--------|--------|
| **Games stuck >10 min** | Common (60+ min hangs) | **0** - timeout after 2 min |
| **AI call max duration** | Unlimited (hangs forever) | 120 sec hard limit |
| **Clear timeout errors** | No (just "stuck") | Yes - "AI provider timed out" |
| UI shows "what's happening" | No | Yes - phase, progress, waiting for |
| Progress updates (WebSocket) | Phase-end only | Real-time per-action |
| Progress updates (Polling/KV) | Phase-end only | Every ~3 seconds |
| Crash recovery visibility | None | Shows replay progress |
| Time to understand game state | Manual log inspection | Instant via UI |
| KV write rate | ~4/game (phase ends) | ~20-30/game (throttled) |
| WebSocket broadcasts | ~4/game | ~50-100/game (per action) |

---

## Gemini Review Workflow

**After completing each step, run Gemini review to catch issues early:**

### Step Completion Review Template

```bash
# After completing Step N, run:
./scripts/ask-gemini.js --dirs="src/worker/" "Review my implementation of Step N from Plan 13 (Game State Persistence).

Check:
1. Does the code match the plan's intent?
2. Any bugs or edge cases I missed?
3. Does it integrate correctly with existing code?
4. Any performance concerns?

Specifically verify:
- [List specific files changed]
- [List key behaviors to verify]"
```

### Review Checkpoints

| After Step | Review Focus | Example Query |
|------------|--------------|---------------|
| **6** (Timeout) | Promise.race scope | "Verify the timeout only affects executeDirectFlow, not executeBatchFlow" |
| **7** (Signal) | AbortController | "Check GoogleAIProvider passes signal to fetch correctly" |
| **3** (WebSocket) | DO integration | "Verify handleProgressUpdate route is registered in GameRunner.fetch" |
| **9** (Batch) | Polling updates | "Check batch polling updates KV without breaking 24h timeout" |
| **5** (Frontend) | UI states | "Verify frontend handles both batch and direct game progress states" |

### Post-Implementation Full Review

```bash
# After all steps complete:
./scripts/ask-gemini.js --dirs="src/worker/,frontend/app/" --tokens=1000k "
Full review of Plan 13 implementation:

1. Are all steps implemented correctly?
2. Any integration issues between components?
3. Test coverage adequate?
4. Ready for production deployment?

Files changed:
- src/worker/providers/WorkflowAIProvider.ts
- src/worker/ai/providers/GoogleAIProvider.ts
- src/worker/workflows/MafiaWorkflow.ts
- src/worker/GameRunner.ts
- src/worker/utils/workflow-sync.ts
- src/engine/GameState.ts
- frontend/app/routes/games/\$id.tsx
"
```

---

## Nice-to-Have Improvements

### 1. Analytics for Timeouts (Recommended)

Track provider reliability over time:

```typescript
// In WorkflowAIProvider.ts, inside the catch block for timeouts:
if (error.message.includes('timed out')) {
  await this.env.ANALYTICS.writeDataPoint({
    blobs: [modelContext.id, 'timeout'],
    doubles: [STEP_TIMEOUT_MS],
    indexes: [this.gameId],
  });
}
```

### 2. Automated Timeout Testing

Add to `MockE2EProvider`:

```typescript
// tests/mocks/MockE2EProvider.ts
if (this.config.simulateTimeout) {
  await new Promise(resolve => setTimeout(resolve, 150_000)); // 150s > 120s timeout
}
```

Test case:

```typescript
it('should timeout and retry on slow AI response', async () => {
  const provider = new MockE2EProvider({ simulateTimeout: true });
  // ... verify retry logic triggers
});
```

### 3. Discussion Phase "Typing" Indicator

Prevent UI flicker during rapid discussion turns:

```tsx
// frontend/app/routes/games/$id.tsx
const [isTyping, setIsTyping] = useState(false);
const typingTimeoutRef = useRef<NodeJS.Timeout>();

useEffect(() => {
  if (waitingFor?.actionType === 'discussion') {
    setIsTyping(true);
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 500);
  }
}, [waitingFor]);
```

---

## Final Verification Checklist

```bash
# Run full verification suite
timeout 60s pnpm typecheck && \
timeout 30s pnpm lint && \
timeout 60s pnpm test
```

- [ ] All tests pass
- [ ] Type check passes
- [ ] Lint passes
- [ ] Manual testing: game shows real-time progress
- [ ] Manual testing: crash recovery shows progress during replay
- [ ] Ready for commit

