


This is a comprehensive migration plan to move from a Durable Object + Suspense architecture to Cloudflare Workflows. This shift will dramatically simplify your state management, eliminate the "Active Punt" zombie game logic, and make batch processing native.

Here is the high-level roadmap:

1.  **Phase 1: Foundation & AI Adapter** (Setup bindings, create the `WorkflowAIProvider`).
2.  **Phase 2: The Core Workflow Logic** (Porting `Game.ts` loop to `MafiaWorkflow.ts`).
3.  **Phase 3: State Persistence & Visibility** (Connecting Workflow steps to D1/KV for the frontend).
4.  **Phase 4: Batch API Integration** (Implementing "Sleep & Poll" patterns for discount pricing).
5.  **Phase 5: API & WebSocket Updates** (Replacing `GameRunner` DO with a View-Layer DO).
6.  **Phase 6: Cleanup & Migration** (Removing `GameRunner`, legacy queues, and Cron triggers).

---

## Part 1: Foundation & AI Adapter

**Objective:** Enable Cloudflare Workflows in the project and create the bridge between your pure TS Engine (`engine/`) and the Workflow `step` API. We will replace the complex `SuspenseError` logic with native `await step.do()`.

### 1. Update Configuration

We need to define the Workflow binding in `wrangler.jsonc` (or `wrangler.toml` if you convert it, but assuming JSONC based on your files).

**Action:** Update `wrangler.jsonc` to include the workflow binding.

```jsonc
// Add to wrangler.jsonc
"workflows": [
  {
    "name": "mafia-workflow",
    "binding": "MAFIA_WORKFLOW",
    "class_name": "MafiaWorkflow"
  }
]
```

**Action:** Update `worker/types.ts` to include the binding in `Env`.

```typescript
// worker/types.ts
import { Workflow } from 'cloudflare:workers';

export interface Env {
  // ... existing bindings
  MAFIA_WORKFLOW: Workflow;
}
```

### 2. Create `WorkflowAIProvider`

This is the most critical piece. Instead of the `GameAIAdapter` throwing errors to suspend, this provider wraps calls in `step.do()`. This ensures that if the workflow sleeps or retries, we don't re-bill for tokens.

**Action:** Create `worker/providers/WorkflowAIProvider.ts`.

**Requirements for this file:**
*   Implement `AIProvider` from `../../engine/types.js`.
*   Take `WorkflowStep`, `Env`, and `gameId` in the constructor.
*   In `getAction`:
    *   Generate a deterministic `stepId` based on `phase`, `round`, `playerId`, and `actionType`.
    *   Wrap the actual API call logic inside `this.step.do(stepId, async () => { ... })`.
    *   Inside the step, instantiate the specific model provider (OpenAI, Anthropic, etc.) using your existing `ai/factory.ts`.
    *   Return the `AIResponse`.

### 3. Create the Workflow Skeleton

We need the entry point class that will eventually hold the game loop. For now, we will just set up the structure.

**Action:** Create `worker/workflows/MafiaWorkflow.ts`.

**Requirements for this file:**
*   Extend `WorkflowEntrypoint`.
*   Define the payload interface (GameConfig, GameId, etc.).
*   Initialize the `GameState` using `GameState.create`.
*   Initialize the `WorkflowAIProvider`.
*   (Placeholder) Add a simple loop that runs just the `Introduction` phase to prove the concept.

### 4. Create the Trigger Route

We need a way to start a workflow from your API.

**Action:** Create `worker/routes/workflow-trigger.ts` (or add to `games.ts`).

**Requirements:**
*   Add a POST endpoint `/api/games/workflow/run`.
*   It should accept the same config as `/run-direct`.
*   Instead of calling `GameRunner` DO, it calls `await env.MAFIA_WORKFLOW.create({ id: gameId, params: body })`.
*   Return the `gameId` immediately.

---

### Instructions for Cursor (Part 1)

**Prompt to feed Cursor:**

```text
We are migrating our backend from Durable Objects to Cloudflare Workflows. 
This is Part 1 of 6.

Goal: Set up the Workflow infrastructure and the AI Adapter.

1. Update `wrangler.jsonc`:
   - Add a workflow binding named `MAFIA_WORKFLOW` pointing to class `MafiaWorkflow`.

2. Update `worker/types.ts`:
   - Add `MAFIA_WORKFLOW: Workflow;` to the `Env` interface.

3. Create `worker/providers/WorkflowAIProvider.ts`:
   - This class implements the `AIProvider` interface from `engine/types`.
   - Constructor takes `step: WorkflowStep`, `env: Env`, `gameId: string`, and `options` (like discountPricing).
   - In `getAction`, generate a unique step ID string using `${context.round}-${context.phase}-${context.playerId}-${prompt.type}`.
   - Use `await this.step.do(stepId, ...)` to execute the call.
   - Inside the step, use `createProvider` from `worker/ai/factory.ts` to get the actual LLM provider and call `complete`.
   - Handle the response parsing using logic similar to `worker/ai/GameAIAdapter.ts` (we need to parse the JSON response into a PlayerAction). 
   - NOTE: Do NOT use the `suspenseMode` logic from the old adapter. Workflows handle suspension natively via `await`.

4. Create `worker/workflows/MafiaWorkflow.ts`:
   - Extend `WorkflowEntrypoint<Env, GameStartParams>`.
   - In the `run` method:
     - Initialize `GameState` from `engine/GameState`.
     - Instantiate `WorkflowAIProvider`.
     - Create a step to run `executeIntroductionPhase` (import from `engine/phases/IntroductionPhase`).
     - Log the result.

5. Update `worker/index.ts`:
   - Export `MafiaWorkflow` from `./workflows/MafiaWorkflow.js`.

6. Add a temporary route in `worker/routes/games.ts`:
   - POST `/api/games/test-workflow`: Accepts `GameConfig`, generates an ID, and calls `env.MAFIA_WORKFLOW.create()`.
```



This is Part 2 of the 6-part migration plan.

**Objective:** Port the game orchestration logic from `engine/Game.ts` into the Cloudflare Workflow. We will implement the autonomous loop (Introduction → Discussion → Vote → Night) and ensure the frontend can see the progress via KV updates.

**Note on Parallelism:** Your engine's `IntroductionPhase` generates personas in parallel (`Promise.all`). Cloudflare Workflows supports parallel steps via `Promise.all([step.do(...), step.do(...)])`. Since your `WorkflowAIProvider` (from Part 1) generates deterministic unique IDs for every call, parallel execution will work natively without code changes in the engine.

### Instructions for Cursor (Part 2)

**Prompt:**

```text
This is Part 2 of the migration to Cloudflare Workflows.
Goal: Implement the main game loop and state persistence in `MafiaWorkflow.ts`.

Reference `engine/Game.ts` for the logical flow and `worker/GameRunner.ts` for the persistence logic.

1. Create `worker/utils/workflow-sync.ts`:
   - Create a helper function `saveGameStateToKV(env: Env, gameId: string, state: GameState)`.
   - This should serialize the state (`state.serialize()`) and put it into `env.GAME_KV` (you may need to add this binding to types if missing, mapped to your existing RateLimit KV or a new one).
   - TTL: 24 hours.

2. Update `worker/workflows/MafiaWorkflow.ts`:
   - Import phase executors: `executeIntroductionPhase`, `executeDiscussionPhase`, `executeVotePhase`, `executeNightPhase` from `engine/phases`.
   - Import `checkWinCondition` from `engine/utils/winCondition`.
   - Import `calculateExactCost` from `worker/utils/budget`.
   
   - Implement the `run` method:
     1. **Setup:** Initialize `GameState` and `WorkflowAIProvider`.
     2. **Loop:** Create a `while` loop checking `state.round <= config.maxRounds`.
     3. **Phases:** inside the loop, execute phases sequentially similar to `engine/Game.ts`.
        - Wrap each phase execution in `await step.do('phase-name-round-x', ...)` so the phase itself is a checkpoint.
        - **Crucial:** After every phase update `state = result.state`.
        - **Crucial:** Call `await step.do('sync-kv-round-x-phase', () => saveGameStateToKV(...))` after every phase to update the UI.
     4. **Win Check:** After Vote and Night phases, check `checkWinCondition`. If there is a winner, `break`.
     5. **Next Round:** Call `state = state.withNextRound()` at end of loop.

3. Implement Finalization (The "Save" Step):
   - After the loop breaks (game over), create a final step: `await step.do('persist-results', ...)`
   - Port the logic from `GameRunner.ts` -> `persistResults` method.
   - **Transcript:** Save full transcript to R2 (`env.TRANSCRIPTS`).
   - **Database:** Insert into D1 (`games`, `game_participants`, `leaderboard`).
     - *Note:* You can reuse the existing `worker/db` Drizzle logic here.
     - Calculate costs using `participant.tokensUsed` and `calculateExactCost`.

4. Error Handling:
   - Wrap the entire run logic in a `try/catch`.
   - If an error occurs, update the KV state with `status: 'failed'` and `error: message` so the frontend knows it crashed.
```

**Architectural Note for Part 3 (Next):**
Once this is implemented, the "Live" page on your frontend won't work yet because it expects a WebSocket connection. In Part 3/5, we will build a lightweight "View-Layer DO" or polling endpoint that reads from the KV we just populated.






This is Part 3 of the 6-part migration plan.

**Objective:** Connect the "Brain" (Workflow) to the "Screen" (Frontend). We will convert the existing `GameRunner` Durable Object from a heavy game executor into a lightweight **View-Layer Broadcaster**.

**Why this approach?**
Your frontend (`live-game.ts`) expects a WebSocket connection to stream events. Instead of rewriting the complex frontend polling logic, we will keep the WebSocket contract. The Workflow will push updates to the `GameRunner` DO, which simply forwards them to the browser. This allows us to keep the frontend code exactly as is.

### Instructions for Cursor (Part 3)

**Prompt:**

```text
This is Part 3 of the migration to Cloudflare Workflows.
Goal: Transform the `GameRunner` Durable Object into a lightweight "Broadcaster" and connect the Workflow to it.

1. **Refactor `worker/GameRunner.ts`**:
   - DELETE all game logic (AI adapters, checkpoints, suspense handling, runGame, etc.).
   - The class should now implement a simple Pub/Sub pattern.
   - **State**: Keep `sessions: WebSocket[]` and `lastSync: WsMessage | null`.
   - **Method `fetch(request)`**:
     - Handle `GET /websocket`: Existing logic (accept websocket), but immediately send `this.lastSync` if available.
     - Handle `POST /internal/broadcast`:
       - Parse JSON body (expect `WsMessage`).
       - Update `this.lastSync`.
       - Loop through `this.sessions` and send the data.
       - Return 200 OK.
     - Remove `/start`, `/events`, `/health` logic (or make them return dummy "healthy" responses for now).

2. **Update `worker/workflows/MafiaWorkflow.ts`**:
   - Add a helper method `broadcastToViewLayer(gameId: string, message: WsMessage)`.
   - Implementation:
     - Get the DO stub: `const id = this.env.GAME_RUNNER.idFromName(gameId);`
     - `const stub = this.env.GAME_RUNNER.get(id);`
     - `await stub.fetch('http://internal/internal/broadcast', { method: 'POST', body: JSON.stringify(message) });`
   - Update the `run` loop:
     - Inside your loop, whenever you called `syncKV` (from Part 2), ALSO call `broadcastToViewLayer`.
     - Construct the `WsMessage` object (matching the interface in `live-game.ts`):
       ```typescript
       {
         type: 'SYNC', // or 'EVENT'
         status: 'running',
         events: state.events, // Or just the new event
         gameId: gameId,
         // ... other fields frontend expects
       }
       ```

3. **Verification**:
   - Ensure `worker/types.ts` still has `GAME_RUNNER` binding.
   - Ensure the `GameEvent` types match what the frontend expects.

**Resulting Flow:**
1. Workflow Step runs Game Logic -> produces `GameState`.
2. Workflow Step calls `step.do('broadcast')` -> POSTs to `GameRunner`.
3. `GameRunner` receives POST -> Broadcasts to WebSockets.
4. Frontend receives WS message -> Updates UI.
```






This is Part 4 of the 6-part migration plan.

**Objective:** Implement the "Discount Mode" (Batch API) integration.
**Strategy:** We will retain the database-backed aggregation (because submitting 10,000 tiny batch files to OpenAI is inefficient), but we will replace the complex "Queue -> Callback -> Resume" logic with a simple **"Sleep & Poll"** pattern native to Workflows.

### Conceptual Change
*   **Old Way:** DO suspends -> Cron aggregates -> Cron polls provider -> Cron sends HTTP callback to DO -> DO wakes up.
*   **New Way:** Workflow inserts request to DB -> Workflow calls `step.sleep('15 minutes')` -> Workflow checks DB -> Repeat.

The Cron is still needed to *send* the batches to OpenAI/Anthropic, but it no longer needs to know *who* is waiting for them. It just updates the database row.

### Instructions for Cursor (Part 4)

**Prompt:**

```text
This is Part 4 of the migration to Cloudflare Workflows.
Goal: Integrate Batch API logic using a "Sleep & Poll" pattern within the Workflow.

1. **Refactor `worker/batch/BatchService.ts`**:
   - Locate the `dispatchResult` method.
   - **Remove** the logic that calls `this.env.GAME_RUNNER.get(id).fetch(...)`.
   - The method should ONLY update the `batch_api_requests` table in D1 with `status = 'completed'` and the `response_body`.
   - This decouples the Batch Service from the GameRunner. It now acts purely as a "DB State Updater."

2. **Update `worker/providers/WorkflowAIProvider.ts`**:
   - Implement the `executeBatchFlow` method (which was stubbed in Part 1 or needs to be added).
   - **Step A (Submit):** Use `step.do('submit-batch-req', ...)` to insert the request into `batch_api_requests` (reuse logic from `BatchService.storeRequest`).
   - **Step B (Poll Loop):**
     - Create a loop: `while (true)`.
     - Inside loop: `await this.step.sleep('wait-for-batch', '10 minutes')`. (Note: Cloudflare Workflows sleep syntax might vary, ensure valid syntax).
     - Inside loop: `await this.step.do('check-batch-status', ...)`:
       - Query D1 `SELECT status, response_body, error_message FROM batch_api_requests WHERE request_id = ?`.
       - If `status === 'completed'`: Parse `response_body` and return it.
       - If `status === 'failed'`: Throw error.
       - If `status === 'pending' | 'bundled'`: Continue loop.

3. **Verify `worker/index.ts` (Scheduled Handler):**
   - Ensure the `scheduled` handler still runs `batchService.aggregateAndSubmit()` and `batchService.pollAndDispatch()`.
   - This Cron is still required to actually bundle the rows in D1 and send them to the AI Providers (OpenAI/Anthropic).

4. **Optimization (Optional but recommended):**
   - In `WorkflowAIProvider`, check `env.ENVIRONMENT`. If it is `development`, force the sleep time to be shorter (e.g., '10 seconds') or bypass batching entirely to make testing easier.

**Outcome:**
The Workflow will now autonomously handle "long-running" AI tasks without complex callback webhooks. It simply naps until the database says the work is done.
```


This is Part 5 of the 6-part migration plan.

**Objective:** Wire up the API endpoints and Queue Consumers to trigger the new `MafiaWorkflow` instead of the old `GameRunner` logic.

**Strategy:**
1.  **Direct Games:** Update the HTTP endpoints to call `env.MAFIA_WORKFLOW.create()`.
2.  **Queued Games (Batches):** Update the `queue` handler in `index.ts`. Instead of the worker calling `DO.fetch('/start')`, the worker will now call `MAFIA_WORKFLOW.create()`.
3.  **Live Games:** The WebSocket endpoint (`/live`) remains pointing to the `GameRunner` DO, but remember—in Part 3 we gutted that DO to be just a broadcaster. This means the frontend connects to the DO, and the Workflow pushes data to the DO.

### Instructions for Cursor (Part 5)

**Prompt:**

```text
This is Part 5 of the migration to Cloudflare Workflows.
Goal: Update the entry points (Routes and Queues) to trigger the Workflow.

1. **Update `worker/index.ts` (Queue Handler)**:
   - Locate the `handleGameMessage` function.
   - **Remove** the logic that calls `env.GAME_RUNNER.get(id).fetch(...)`.
   - **Replace** with:
     ```typescript
     await env.MAFIA_WORKFLOW.create({
       id: gameId,
       params: {
         gameId,
         config, // The config from the message
         traceId,
         batchId
       }
     });
     ```
   - This ensures batch processing (which sends messages to GAME_QUEUE) now spawns Workflows.

2. **Update `worker/routes/games.ts` (Direct Run)**:
   - Locate `POST /run-direct`.
   - **Remove** the `stub.fetch('http://internal/start', ...)` logic.
   - **Replace** with `await env.MAFIA_WORKFLOW.create(...)`.
   - Ensure you pass the `encryptedUserKeys` if they exist in the request body (so the Workflow can decrypt them).

3. **Update `worker/routes/admin.ts` (Live Run)**:
   - Locate `POST /games/run-live`.
   - **Replace** the DO fetch with `env.MAFIA_WORKFLOW.create(...)`.
   - Note: The `background: true` flag logic isn't needed for Workflows (they are always background), but ensure the Workflow ID matches the `gameId` so the frontend knows where to connect.

4. **Verify WebSocket Route (`worker/routes/games.ts`)**:
   - Locate `GET /:id/live`.
   - **Keep this as is.** It should still connect to `env.GAME_RUNNER`.
   - Since we refactored `GameRunner` in Part 3 to be a dumb broadcaster, this route now correctly serves the "View Layer" while the Workflow does the heavy lifting.

5. **Type Safety Check**:
   - Ensure the `params` object passed to `MAFIA_WORKFLOW.create()` matches the type definition in `worker/workflows/MafiaWorkflow.ts`. If there is a mismatch, update the Workflow type definition to include optional fields like `traceId` and `encryptedUserKeys`.
```



This is Part 6 of the 6-part migration plan.

**Objective:** Clean up the "scaffolding" we used to support the old architecture. Now that the Workflow manages state, retries, and sleeping natively, we can delete the complex code that manually emulated these features using Durable Objects and Queues.

**Strategy:**
1.  **Delete the Suspense Logic:** The `SuspenseError`, `AI_REQUEST_QUEUE`, and the complex `handleAIRequestMessage` handler in `worker/index.ts` are no longer needed.
2.  **Slim Down GameRunner:** Ensure `GameRunner.ts` contains *only* WebSocket broadcasting logic. Delete all methods related to state saving, checkpointing, or AI callbacks.
3.  **Remove Internal Routes:** Delete the `/internal/*` routes that were used for inter-worker communication.

### Instructions for Cursor (Part 6)

**Prompt:**

```text
This is Part 6 (Final) of the migration to Cloudflare Workflows.
Goal: Delete legacy code and cleanup the codebase.

1. **Clean up `worker/index.ts`**:
   - Remove the `AI_REQUEST_QUEUE` binding from the `Env` interface (and `worker/types.ts`).
   - Delete the `handleAIRequestMessage` function entirely.
   - Remove the `queue` handler logic that checks for `requestId` (the branch that called `handleAIRequestMessage`).

2. **Clean up `worker/GameRunner.ts`**:
   - **Delete** the following methods/properties if they still exist:
     - `stateCache`, `eventLog` (except for what's needed for new connections), `lastR2StreamIndex`.
     - `loadState`, `saveState`, `loadSerializedGameState`, `saveCheckpoint`.
     - `handleStart` (we moved this to `MafiaWorkflow` creation).
     - `handleAICallback`, `handlePunt`, `handleResume`.
     - `runGame`, `persistResults`.
   - **Verify**: The class should effectively only have `handleWebSocket`, `broadcast`, and a minimal `fetch` handler for the `/websocket` upgrade and `/internal/broadcast` POST.

3. **Delete Dead Files**:
   - Delete `worker/ai/GameAIAdapter.ts` (Replaced by `WorkflowAIProvider`).
   - Delete `worker/ai/types.ts` -> `SuspenseError` class definition.
   - Delete `worker/scheduled/cleanup.ts` (Workflows don't get "stuck" in the same way DOs do; the platform handles timeouts).

4. **Update `wrangler.jsonc`**:
   - Remove the `AI_REQUEST_QUEUE` configuration.
   - Remove the cron trigger for `cleanupStaleGames` (keep the batch aggregation cron!).

5. **Final Review**:
   - Search the codebase for `SuspenseError`. It should not appear anywhere.
   - Search for `/internal/punt`. It should not appear anywhere.
```

### Post-Migration Checklist

Once Cursor finishes this step, your architecture will have shifted from:

*   **Old:** `API -> DO (Suspend) -> Queue -> Worker -> HTTP Callback -> DO (Resume)`
*   **New:** `API -> Workflow (Sleep/Await) -> Database`

You will have deleted approximately **1,500 lines of complex state-management code** while gaining native reliability and better observability through the Cloudflare Workflow dashboard.