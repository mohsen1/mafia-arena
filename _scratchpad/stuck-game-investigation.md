# Stuck Game Investigation: game_mjstd5rq_tge3cc_direct

## Issue
Game is stuck in "Starting" state showing "Waiting for events..." at:
https://mafia-arena.com/games/game_mjstd5rq_tge3cc_direct/live

## Symptoms
- Status: "Starting" (should be "LIVE" or showing progress)
- Round: "-"
- Timer: "00:000tok"
- Message: "Waiting for events..."
- No events have been emitted yet

## Architecture Overview
1. **Game Creation**: `POST /api/games/run-direct` creates:
   - D1 record with status 'running'
   - Cloudflare Workflow instance (`MAFIA_WORKFLOW`)

2. **Workflow Execution**:
   - Step 1: Hydrate model contexts (D1 query)
   - Step 2: Create/update game record in D1
   - Step 3: Introduction phase (first AI calls)
   - Syncs state to KV after each phase

3. **Frontend**:
   - Polls `/api/games/:id/events` endpoint
   - Checks KV for workflow state
   - Falls back to Durable Object if no KV state

## Root Cause Analysis

### Most Likely Causes (in order of probability):

1. **Workflow hasn't started yet** (60% probability)
   - Cloudflare Workflows can have a delay before execution starts
   - Check Cloudflare Dashboard → Workers → Workflows
   - Look for workflow ID: `game_mjstd5rq_tge3cc_direct`

2. **Workflow stuck on `hydrate-models` step** (30% probability)
   - First step queries D1 for model contexts
   - Could be slow or timing out
   - No error handling before first sync to KV

3. **Workflow failed silently before first sync** (10% probability)
   - Error occurred before any KV state was created
   - D1 record still shows 'running' but workflow is dead

## Diagnostic Steps

### 1. Check Workflow Status
```bash
# Via Cloudflare Dashboard
https://dash.cloudflare.com/workers/workflows
# Search for: game_mjstd5rq_tge3cc_direct
```

Look for:
- Workflow status: `running`, `completed`, `failed`, or `pending`
- Last execution time
- Error messages if failed

### 2. Check D1 Database
```sql
SELECT * FROM games WHERE id = 'game_mjstd5rq_tge3cc_direct';
```

Check:
- `status`: Should be 'running'
- `created_at`: When game was created
- `last_activity`: Should update during execution (may be null if stuck)
- `error_message`: Should be null unless failed

### 3. Check KV State
```bash
# Via Cloudflare Dashboard or API
# Key: game-state:game_mjstd5rq_tge3cc_direct
```

If key doesn't exist:
- Workflow hasn't reached first `syncAndBroadcast` call
- Likely stuck on `hydrate-models` or `create-game-record` step

### 4. Check Batch API Requests (if discount pricing)
```sql
SELECT * FROM batch_api_requests 
WHERE game_id = 'game_mjstd5rq_tge3cc_direct';
```

If records exist with status 'pending' or 'bundled':
- Game is waiting for batch API (expected for discount pricing)
- This is normal and not a bug

## Potential Fixes

### Fix 1: Add Timeout to Workflow Start
If workflow hasn't started after 5 minutes, mark game as failed:

```typescript
// In run-direct endpoint, after workflow creation
// Add a delayed check that marks game as failed if no events after timeout
```

### Fix 2: Add Initial KV State on Workflow Start
Sync an initial "workflow_started" event to KV immediately:

```typescript
// In MafiaWorkflow.run(), before hydrate-models
await step.do('initial-sync', async () => {
  await saveGameStateToKV(this.env, gameId, state, 'running', 'starting');
});
```

### Fix 3: Improve Error Handling for hydrate-models
Wrap hydrate-models in better error handling:

```typescript
try {
  this.modelContexts = await step.do('hydrate-models', async () => {
    // ... existing code
  });
} catch (error) {
  // Save error state immediately
  await saveErrorStateToKV(this.env, gameId, error.message, state);
  throw error;
}
```

### Fix 4: Add Health Check for Workflow
Create a workflow status endpoint that checks:
- Workflow execution status
- Last step completed
- Time since last activity

## Immediate Actions

1. **Check Cloudflare Dashboard** for workflow status
2. **If workflow is pending**: Wait a few minutes, then check again
3. **If workflow is failed**: Check error logs in dashboard
4. **If workflow doesn't exist**: Workflow creation may have failed silently
5. **If workflow is running but stuck**: Check which step it's on

## Prevention

1. **Add workflow status monitoring** to detect stuck workflows
2. **Add initial sync** before first AI call to show "Starting" state
3. **Add timeout detection** to mark games as failed if no progress after threshold
4. **Improve error visibility** by syncing errors to KV immediately

## Related Code

- Workflow: `src/worker/workflows/MafiaWorkflow.ts`
- API Route: `src/worker/routes/games.ts` (run-direct endpoint)
- State Sync: `src/worker/utils/workflow-sync.ts`
- Events Endpoint: `src/worker/routes/games.ts` (GET /api/games/:id/events)

