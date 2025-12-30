# Plan 14: Cost Accuracy Fix

## Problem Statement

Cost tracking in the system has accuracy issues that cause stored costs to diverge from actual API charges:

1. **Critical**: Batch API discount not applied when persisting game costs
2. **Medium**: Cost estimation assumes flat 50% discount for all batch providers (Fireworks is 40%)
3. **Low**: Static pricing for direct providers may drift from actual provider pricing

## Current State

### How Costs Are Calculated Today

1. `GameRunner.persistResults()` fetches model pricing from DB via raw SQL
2. Calls `calculateExactCost(inputTokens, outputTokens, pricing)` per participant
3. Stores total in `games.cost_usd`, updates `leaderboard`, `daily_stats`, `batches`
4. **BUG**: `state.discountPricing` flag exists but is never used to adjust cost

### Affected Code Locations

- `src/worker/GameRunner.ts` - `persistResults()` method (lines ~2617-2755)
- `src/worker/batch/service.ts` - `estimateCost()` function (lines ~330-362)
- `src/worker/services/ModelRegistry.ts` - `BATCH_PROVIDER_MAP` with discount percentages
- `src/worker/utils/budget.ts` - `calculateExactCost()` (correct, no changes needed)

### Affected Database Tables

- `games.cost_usd` - Individual game costs (inflated for batch games)
- `games.discount_pricing` - Boolean flag (exists but cost not adjusted)
- `batches.actual_cost_usd` - Aggregate batch costs (inflated)
- `batches.estimated_cost_usd` - Estimates (slightly off for Fireworks)
- `daily_stats.cost_usd` - Daily aggregates (inflated)
- `leaderboard.cost_usd` - Per-model aggregates (inflated)

## Proposed Solution

### Phase 1: Refactor to Use ModelRegistry (Prerequisite)

**File**: `src/worker/GameRunner.ts`

Replace raw SQL queries with `ModelRegistry` to get consistent pricing and batch discount info:

```typescript
// Current (raw SQL):
const modelRow = await db.prepare('SELECT config FROM models WHERE id = ?')
  .bind(modelId)
  .first<{ config: string | null }>();
pricingMap.set(modelId, parsePricingFromConfig(modelRow?.config ?? null));

// Proposed (use ModelRegistry):
const registry = new ModelRegistry(this.env.DB);
const modelContexts = await registry.getMany(modelIds);
```

### Phase 2: Apply Per-Participant Batch Discount (Critical)

**Key Insight from Review**: A game might be flagged `discountPricing: true` but contain a mix of models where some support batching and others don't. Apply discount per-participant, not per-game.

```typescript
// In persistResults(), per participant:
const registry = new ModelRegistry(this.env.DB);
const modelContexts = await registry.getMany(modelIds);

for (const participant of result.participants) {
  const modelContext = modelContexts.get(participant.modelId);
  let pricing = modelContext?.pricing ?? DEFAULT_PRICING;
  
  // Check if THIS specific model supports batch pricing
  const useBatchRate = discountPricing && modelContext?.batchPricing?.supported;
  
  if (useBatchRate) {
    // Apply provider-specific discount (50% for most, 40% for Fireworks)
    const discountMultiplier = 1 - (modelContext.batchPricing.discountPercent / 100);
    pricing = {
      input: pricing.input * discountMultiplier,
      output: pricing.output * discountMultiplier
    };
  }
  
  const cost = calculateExactCost(
    participant.tokensUsed.input,
    participant.tokensUsed.output,
    pricing
  );
  participantCosts.set(`${participant.modelId}_${participant.team}`, cost);
  totalCostUsd += cost;
}
```

### Phase 3: Fix Cost Estimation (Medium)

**File**: `src/worker/batch/service.ts`

Update `estimateCost()` to use conservative estimate (40% = Fireworks, lowest discount):

```typescript
export function estimateCost(config: BatchConfig): CostEstimate {
  const { totalGames, gameConfig, useBatchAPI = false } = config;

  // ... existing token calculation ...

  const baseCostPer1k = (DEFAULT_PRICING.input * 0.7 + DEFAULT_PRICING.output * 0.3);
  
  // Apply conservative batch discount (40% = Fireworks, lowest)
  // This ensures we don't under-estimate costs
  let avgCostPer1k = baseCostPer1k;
  if (useBatchAPI) {
    const CONSERVATIVE_DISCOUNT = 40; // Fireworks uses 40%, others 50%
    avgCostPer1k = baseCostPer1k * (1 - CONSERVATIVE_DISCOUNT / 100);
  }

  const estimatedCostUsd = (totalTokens / 1000) * avgCostPer1k;
  // ...
}
```

### Phase 4: Data Migration (Recommended)

Since we store `total_tokens` and model info in `game_participants`, we can recalculate costs.

**Migration Script** (`scripts/fix-batch-costs.js`):

```sql
-- Step 1: Identify affected games
SELECT g.id, g.cost_usd as current_cost, g.total_tokens, g.discount_pricing
FROM games g
WHERE g.discount_pricing = 1 AND g.cost_usd > 0;

-- Step 2: For simple correction (assumes 50% discount for all):
UPDATE games 
SET cost_usd = cost_usd * 0.5 
WHERE discount_pricing = 1 AND cost_usd > 0;

-- Step 3: Rebuild leaderboard cost aggregates
-- (Complex: requires joining games with participants and summing corrected costs)
-- May need to run programmatically

-- Step 4: Rebuild daily_stats cost aggregates
UPDATE daily_stats ds
SET cost_usd = (
  SELECT SUM(g.cost_usd) 
  FROM games g 
  WHERE DATE(g.created_at/1000, 'unixepoch') = ds.date
)
WHERE EXISTS (
  SELECT 1 FROM games g 
  WHERE DATE(g.created_at/1000, 'unixepoch') = ds.date
);
```

**Note**: Migration is approximate since we don't store which specific provider discount was used. 50% is a reasonable default since Anthropic/OpenAI/Google (the main batch providers) all use 50%.

## Implementation Plan

### Step 1: Export BATCH_PROVIDER_MAP

Move/export `BATCH_PROVIDER_MAP` from `ModelRegistry.ts` to a shared location (`worker/ai/models.ts`) so it can be reused.

### Step 2: Add Tests

Create test cases in `src/worker/__tests__/cost-calculation.test.ts`:

1. Test `calculateExactCost` with various pricing (already correct)
2. Test cost calculation applies discount when `discountPricing = true` AND `batchPricing.supported = true`
3. Test cost calculation does NOT apply discount when model doesn't support batch
4. Test `estimateCost` uses conservative 40% discount

### Step 3: Refactor GameRunner.persistResults

1. Replace raw SQL with `ModelRegistry.getMany(modelIds)` 
2. Check `state.discountPricing && modelContext.batchPricing.supported` per participant
3. Apply `modelContext.batchPricing.discountPercent` to pricing before calculation
4. Continue storing result in same DB tables

### Step 4: Fix batch/service.ts estimateCost

1. Update `estimateCost()` to use 40% conservative discount
2. Add comment explaining limitation (sync function, no DB access)

### Step 5: Run Migration (Optional)

1. Create `scripts/fix-batch-costs.js` migration script
2. Apply 50% correction to existing `discount_pricing = 1` games
3. Rebuild leaderboard/daily_stats aggregates if needed

### Step 6: Verify

1. Run existing tests
2. Deploy to staging
3. Run a batch with `discountPricing: true`
4. Verify stored costs are ~50% lower than before fix
5. Verify mixed-model games apply discount only to supported models

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Double-applying discount | Add test, check `discountPricing && batchPricing.supported` once per participant |
| Breaking existing cost display | Frontend uses stored `cost_usd`, no formula changes |
| Mixed providers in same game | Apply discount per-participant based on their model's batch support |
| Zero-cost models | `calculateExactCost` handles 0 pricing correctly (0 * x = 0) |
| Historical data inaccurate | Migration script available; approximate correction (50% default) |
| Model not in DB | `ModelRegistry` falls back to `DEFAULT_PRICING` with no batch support |

## Success Criteria

- [ ] Games with `discount_pricing = 1` have costs ~50% lower than equivalent non-batch game
- [ ] Participant-level: only models with `batchPricing.supported = true` get discount
- [ ] Batch cost estimates are within 20% of actual costs
- [ ] All existing tests pass
- [ ] New tests cover discount application per-participant

## Timeline

- Step 1-2: 30 minutes (export constant, add tests)
- Step 3: 1 hour (refactor GameRunner)
- Step 4: 15 minutes (fix estimateCost)
- Step 5: 30 minutes (migration script, optional)
- Total: ~2 hours

## Out of Scope

- Real-time pricing sync from providers
- Per-participant cost column in `game_participants` table
- UI indicator for "batch pricing applied"

