# Mafia Arena - Detailed Implementation Plan

**Project:** AI Benchmarking Platform for Werewolf AI  
**Timeline:** 6-8 Weeks (MVP to Production)  
**Start Date:** November 4, 2025  
**Target Launch:** December 20, 2025  

---

## Table of Contents

1. [Pre-Implementation Checklist](#pre-implementation-checklist)
2. [Phase 0: Foundation & Setup](#phase-0-foundation--setup-week-0)
3. [Phase 1: Core Arena System](#phase-1-core-arena-system-weeks-1-2)
4. [Phase 2: Leaderboard & UI](#phase-2-leaderboard--ui-week-3)
5. [Phase 3: Cost Controls & Analytics](#phase-3-cost-controls--analytics-week-4)
6. [Phase 4: Polish & Testing](#phase-4-polish--testing-week-5)
7. [Phase 5: Production Deploy](#phase-5-production-deploy-week-6)
8. [Post-Launch Roadmap](#post-launch-roadmap)
9. [Team Responsibilities](#team-responsibilities)
10. [Risk Mitigation](#risk-mitigation)

---

## Pre-Implementation Checklist

### ✅ Decisions Needed Before Starting

- [ ] **Budget Approval:** Confirm max testing budget ($50-100)
- [ ] **Launch Budget:** Confirm monthly operating budget ($100-500)
- [ ] **Model Selection:** Which AI models to include in MVP?
  - Recommended: GPT-3.5-Turbo, Gemini Flash, Claude Haiku (affordable)
  - Optional: GPT-4o, Claude Sonnet (expensive, add later)
- [ ] **Theme Selection:** Which game themes to benchmark?
  - Recommended: Start with 1-2 themes (UK_VILLAGE_1900S, CLASSIC)
- [ ] **Access Controls:** Who can queue games? Admin-only or public?
- [ ] **Melody Auth Timeline:** Coordinate with auth migration
- [ ] **Analytics Provider:** Cloudflare Analytics or custom?

### 📋 Pre-requisites

- [ ] Ensure database is on SQLite/D1 (verified: ✅)
- [ ] Cloudflare Workers deployment working (verified: ✅)
- [ ] All AI provider API keys configured
- [ ] Rate limiting tested for each provider
- [ ] Game engine can run headless (verified: ✅)

---

## Phase 0: Foundation & Setup (Week 0)

**Duration:** 2-3 days  
**Goal:** Prepare development environment and validate assumptions

### Tasks

#### 0.1 Environment Setup

```bash
# Create feature branch
git checkout -b feature/mafia-arena

# Install any new dependencies (if needed)
pnpm add -D @faker-js/faker  # For generating test data

# Create new directories
mkdir -p src/lib/arena
mkdir -p src/lib/arena/tests
mkdir -p src/app/api/arena
mkdir -p src/components/arena
mkdir -p scripts/arena
```

**Files to Create:**
- `src/lib/arena/` - Core arena logic
- `src/app/api/arena/` - API routes
- `src/components/arena/` - UI components
- `scripts/arena/` - Utility scripts

#### 0.2 Database Schema Design

**File:** `src/lib/db/schema-arena.ts`

Create new schema file (don't modify existing schema.ts):

```typescript
// Complete schema from Mafia-Arena-Design-v2.md
import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { users, games } from './schema';

// [Copy schema from revised design]
```

**Validation Steps:**
1. Run `pnpm db:generate` to create migration
2. Review generated SQL carefully
3. Test on local SQLite database first

#### 0.3 Baseline Testing

**Goal:** Validate game engine works for AI vs AI

**Script:** `scripts/arena/test-ai-vs-ai.ts`

```typescript
/**
 * Test that AI vs AI games complete successfully
 * Run 5 games with cheapest models (Gemini Flash)
 */
import { createAIvsAIGame } from '@/lib/arena/gameRunner';

async function testBaseline() {
  console.log('🎮 Testing AI vs AI Baseline...\n');
  
  const results = {
    completed: 0,
    failed: 0,
    totalCost: 0,
    totalDuration: 0,
  };

  for (let i = 0; i < 5; i++) {
    console.log(`\n--- Game ${i + 1}/5 ---`);
    try {
      const result = await createAIvsAIGame({
        models: [
          { provider: 'google', model: 'gemini-1.5-flash', count: 4 },
        ],
        theme: 'UK_VILLAGE_1900S',
      });
      
      results.completed++;
      results.totalCost += result.estimatedCost;
      results.totalDuration += result.durationSeconds;
      
      console.log(`✅ Completed in ${result.durationSeconds}s`);
      console.log(`   Winner: ${result.winner}`);
      console.log(`   Cost: $${result.estimatedCost.toFixed(4)}`);
    } catch (error) {
      results.failed++;
      console.error(`❌ Failed:`, error);
    }
  }

  console.log('\n📊 Baseline Results:');
  console.log(`   Completed: ${results.completed}/5`);
  console.log(`   Failed: ${results.failed}/5`);
  console.log(`   Avg Duration: ${(results.totalDuration / results.completed).toFixed(1)}s`);
  console.log(`   Total Cost: $${results.totalCost.toFixed(4)}`);
  console.log(`   Avg Cost per Game: $${(results.totalCost / results.completed).toFixed(4)}`);
}

testBaseline();
```

**Run:**
```bash
pnpm tsx scripts/arena/test-ai-vs-ai.ts
```

**Success Criteria:**
- [ ] 4/5 games complete successfully (80% success rate)
- [ ] Average game duration < 600 seconds (10 minutes)
- [ ] Average cost per game < $0.01
- [ ] No memory leaks or crashes

#### 0.4 Cost Modeling

**File:** `scripts/arena/cost-estimator.ts`

```typescript
/**
 * Calculate projected costs for different scenarios
 */
import { MODEL_COSTS, estimateGameCost } from '@/lib/arena/costTracking';

interface Scenario {
  name: string;
  gamesPerDay: number;
  modelMix: Array<{ model: string; percentage: number }>;
}

const scenarios: Scenario[] = [
  {
    name: 'Conservative Launch',
    gamesPerDay: 50,
    modelMix: [
      { model: 'gemini-1.5-flash', percentage: 60 },
      { model: 'gpt-3.5-turbo', percentage: 30 },
      { model: 'claude-3-5-sonnet', percentage: 10 },
    ],
  },
  {
    name: 'Active Community',
    gamesPerDay: 200,
    modelMix: [
      { model: 'gemini-1.5-flash', percentage: 40 },
      { model: 'gpt-3.5-turbo', percentage: 30 },
      { model: 'gpt-4o', percentage: 20 },
      { model: 'claude-3-5-sonnet', percentage: 10 },
    ],
  },
  {
    name: 'Premium Tournament',
    gamesPerDay: 500,
    modelMix: [
      { model: 'gpt-4o', percentage: 50 },
      { model: 'claude-3-5-sonnet', percentage: 30 },
      { model: 'gpt-3.5-turbo', percentage: 20 },
    ],
  },
];

function calculateScenarioCost(scenario: Scenario): void {
  console.log(`\n📊 ${scenario.name}`);
  console.log(`   Games/day: ${scenario.gamesPerDay}`);
  
  let dailyCost = 0;
  
  for (const { model, percentage } of scenario.modelMix) {
    const gamesForModel = scenario.gamesPerDay * (percentage / 100);
    const costPerGame = estimateGameCost(model);
    const modelDailyCost = gamesForModel * costPerGame;
    
    dailyCost += modelDailyCost;
    
    console.log(`   ${model}: ${gamesForModel.toFixed(0)} games × $${costPerGame.toFixed(4)} = $${modelDailyCost.toFixed(2)}/day`);
  }
  
  console.log(`   ─────────────────────────────`);
  console.log(`   Daily Cost: $${dailyCost.toFixed(2)}`);
  console.log(`   Monthly Cost: $${(dailyCost * 30).toFixed(2)}`);
  console.log(`   Yearly Cost: $${(dailyCost * 365).toFixed(2)}`);
}

scenarios.forEach(calculateScenarioCost);
```

**Output Example:**
```
📊 Conservative Launch
   Games/day: 50
   gemini-1.5-flash: 30 games × $0.0050 = $0.15/day
   gpt-3.5-turbo: 15 games × $0.0200 = $0.30/day
   claude-3-5-sonnet: 5 games × $0.2000 = $1.00/day
   ─────────────────────────────
   Daily Cost: $1.45
   Monthly Cost: $43.50
   Yearly Cost: $529.25
```

**Decision Point:** Approve budget based on cost projections

---

## Phase 1: Core Arena System (Weeks 1-2)

**Duration:** 10 days  
**Goal:** Database schema, ELO system, game queue, batch runner

### Week 1: Database, ELO & Token Tracking

#### 1.1 Database Migration (Days 1-2)

**File:** `drizzle/0008_add_arena_system.sql`

**Tasks:**
1. Create migration from `schema-arena.ts`
2. Test migration on local database
3. Verify indexes are created
4. Test rollback script

**⚠️ CRITICAL:** Review `COST_TRACKING_ENHANCEMENT.md` - we need to implement actual token usage capture!

**Commands:**
```bash
# Generate migration
pnpm db:generate

# Apply to local database
pnpm db:push

# Verify tables exist
pnpm db:studio
```

**Validation:**
```sql
-- Verify all tables created
SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'ai_%' OR name LIKE 'arena_%';

-- Should return:
-- ai_models
-- arena_matches
-- arena_players
-- model_ratings
-- rating_history
-- batch_operations
```

#### 1.1b Token Usage Interface (Day 2)

**⚠️ CRITICAL ADDITION:** Before proceeding, implement token tracking!

**File:** `src/lib/engine/interfaces/IAgent.ts`

Add token usage tracking:

```typescript
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  modelName?: string;
  provider?: string;
}

export interface AgentResponse {
  action: PlayerAction;
  usage?: TokenUsage;
}

// Update interface method signature
export interface IAgent {
  // ... existing properties ...
  
  // UPDATED: Return usage metadata
  getAction(
    gameState: VisibleGameState,
    allowedActions: PlayerAction['type'][]
  ): Promise<AgentResponse>; // Changed from Promise<PlayerAction>
  
  generatePersona(
    themeDescription: string,
    language?: string,
    existingNames?: string[]
  ): Promise<TokenUsage | void>;
}
```

**See:** `COST_TRACKING_ENHANCEMENT.md` for complete implementation details

#### 1.2 Model Registry (Day 2)

**File:** `src/lib/arena/modelRegistry.ts`

```typescript
/**
 * AI Model Registry
 * Manages available AI models for arena matches
 */

import { db } from '@/lib/db';
import { aiModels } from '@/lib/db/schema-arena';
import { eq } from 'drizzle-orm';

export interface RegisterModelInput {
  name: string;
  provider: 'openai' | 'anthropic' | 'google' | 'groq' | 'fireworks' | 'ollama';
  modelIdentifier: string;
  version?: string;
  capabilities?: Record<string, unknown>;
  costPerMillionTokens?: number;
}

export class ModelRegistry {
  /**
   * Register a new AI model
   */
  async register(input: RegisterModelInput): Promise<string> {
    const [model] = await db
      .insert(aiModels)
      .values({
        name: input.name,
        provider: input.provider,
        modelIdentifier: input.modelIdentifier,
        version: input.version,
        capabilities: input.capabilities ? JSON.stringify(input.capabilities) : null,
        costPerMillionTokens: input.costPerMillionTokens,
        isActive: true,
        createdAt: new Date(),
      })
      .returning();

    return model.id;
  }

  /**
   * Get all active models
   */
  async getActive(): Promise<typeof aiModels.$inferSelect[]> {
    return db
      .select()
      .from(aiModels)
      .where(eq(aiModels.isActive, true));
  }

  /**
   * Get model by ID
   */
  async getById(id: string): Promise<typeof aiModels.$inferSelect | null> {
    const models = await db
      .select()
      .from(aiModels)
      .where(eq(aiModels.id, id))
      .limit(1);

    return models[0] || null;
  }

  /**
   * Get model by provider and identifier
   */
  async getByIdentifier(
    provider: string,
    modelIdentifier: string
  ): Promise<typeof aiModels.$inferSelect | null> {
    const models = await db
      .select()
      .from(aiModels)
      .where(eq(aiModels.provider, provider))
      .where(eq(aiModels.modelIdentifier, modelIdentifier))
      .limit(1);

    return models[0] || null;
  }

  /**
   * Deactivate a model
   */
  async deactivate(id: string): Promise<void> {
    await db
      .update(aiModels)
      .set({ isActive: false })
      .where(eq(aiModels.id, id));
  }
}
```

**Seed Script:** `scripts/arena/seed-models.ts`

```typescript
/**
 * Seed initial AI models
 */
import { ModelRegistry } from '@/lib/arena/modelRegistry';

async function seedModels() {
  const registry = new ModelRegistry();

  const models = [
    // OpenAI Models
    {
      name: 'GPT-4o',
      provider: 'openai' as const,
      modelIdentifier: 'gpt-4o',
      version: '2024-11-20',
      costPerMillionTokens: 5.0,
      capabilities: { reasoning: 'excellent', speed: 'fast' },
    },
    {
      name: 'GPT-3.5 Turbo',
      provider: 'openai' as const,
      modelIdentifier: 'gpt-3.5-turbo',
      costPerMillionTokens: 1.0,
      capabilities: { reasoning: 'good', speed: 'very-fast' },
    },
    // Google Models
    {
      name: 'Gemini 1.5 Flash',
      provider: 'google' as const,
      modelIdentifier: 'gemini-1.5-flash',
      costPerMillionTokens: 0.2,
      capabilities: { reasoning: 'good', speed: 'very-fast' },
    },
    {
      name: 'Gemini 1.5 Pro',
      provider: 'google' as const,
      modelIdentifier: 'gemini-1.5-pro',
      costPerMillionTokens: 2.5,
      capabilities: { reasoning: 'excellent', speed: 'medium' },
    },
    // Anthropic Models
    {
      name: 'Claude 3.5 Sonnet',
      provider: 'anthropic' as const,
      modelIdentifier: 'claude-3-5-sonnet-20241022',
      costPerMillionTokens: 7.5,
      capabilities: { reasoning: 'excellent', speed: 'medium' },
    },
    {
      name: 'Claude 3 Haiku',
      provider: 'anthropic' as const,
      modelIdentifier: 'claude-3-haiku-20240307',
      costPerMillionTokens: 0.8,
      capabilities: { reasoning: 'good', speed: 'fast' },
    },
    // Groq Models
    {
      name: 'Llama 3.1 70B (Groq)',
      provider: 'groq' as const,
      modelIdentifier: 'llama-3.1-70b-versatile',
      costPerMillionTokens: 0.1, // Essentially free
      capabilities: { reasoning: 'good', speed: 'very-fast' },
    },
  ];

  for (const model of models) {
    try {
      const id = await registry.register(model);
      console.log(`✅ Registered: ${model.name} (${id})`);
    } catch (error) {
      console.error(`❌ Failed to register ${model.name}:`, error);
    }
  }
}

seedModels();
```

**Run:**
```bash
pnpm tsx scripts/arena/seed-models.ts
```

#### 1.3 Update AI Agents for Token Capture (Day 3)

**⚠️ BREAKING CHANGE:** Update all agent implementations

**Files to Update:**
- `src/lib/engine/agents/OpenAIAgent.ts`
- `src/lib/engine/agents/ClaudeAgent.ts`
- `src/lib/engine/agents/GeminiAgent.ts`
- `src/lib/engine/agents/HumanAgent.ts` (return undefined usage)

**Example (OpenAI):**
```typescript
async getAction(
  gameState: VisibleGameState,
  allowedActions: PlayerAction['type'][]
): Promise<AgentResponse> {
  const completion = await this.openai.chat.completions.create({...});
  
  // ✅ CAPTURE TOKEN USAGE
  const usage: TokenUsage | undefined = completion.usage
    ? {
        inputTokens: completion.usage.prompt_tokens,
        outputTokens: completion.usage.completion_tokens,
        totalTokens: completion.usage.total_tokens,
        modelName: this.model,
        provider: this.getProvider(),
      }
    : undefined;

  return {
    action: parsedAction,
    usage, // Return usage metadata
  };
}
```

**See:** `COST_TRACKING_ENHANCEMENT.md` Section "Phase 2" for all agents

**Run Tests:**
```bash
pnpm test src/lib/engine/agents/*.test.ts
```

#### 1.4 Update Game Engine to Collect Usage (Day 3-4)

**File:** `src/lib/engine/core/Game.ts`

Add token tracking:

```typescript
export class Game {
  private tokenUsageLog: Map<PlayerId, TokenUsage[]> = new Map();
  
  private recordTokenUsage(playerId: PlayerId, usage?: TokenUsage): void {
    if (!usage) return;
    const playerLog = this.tokenUsageLog.get(playerId) || [];
    playerLog.push(usage);
    this.tokenUsageLog.set(playerId, playerLog);
  }
  
  private async getPlayerAction(
    player: IPlayer,
    allowedActions: PlayerAction['type'][]
  ): Promise<PlayerAction> {
    const response = await player.getAgent().getAction(gameState, allowedActions);
    this.recordTokenUsage(player.getId(), response.usage);
    return response.action;
  }
  
  public getTokenUsageByPlayer(): Map<PlayerId, { total: number; details: TokenUsage[] }> {
    // ... implementation ...
  }
}
```

**See:** `COST_TRACKING_ENHANCEMENT.md` Section "Phase 3"

#### 1.5 ELO Rating System (Day 4)

**File:** `src/lib/arena/elo.ts`

Copy implementation from `Mafia-Arena-Design-v2.md` with:
- Full ELO calculation logic
- K-factor dynamics
- Team-based scoring
- Rating bounds

**Test File:** `src/lib/arena/tests/elo.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { ELOManager } from '../elo';

describe('ELOManager', () => {
  const elo = new ELOManager();

  it('should calculate expected scores correctly', () => {
    // Equal ratings = 50% expected score
    expect(elo['expectedScore'](1500, 1500)).toBeCloseTo(0.5);
    
    // Higher rating = higher expected score
    expect(elo['expectedScore'](1600, 1400)).toBeGreaterThan(0.5);
    
    // Lower rating = lower expected score
    expect(elo['expectedScore'](1400, 1600)).toBeLessThan(0.5);
  });

  it('should update ratings after Mafia team wins', () => {
    const result = {
      winner: 'Mafia' as const,
      players: [
        { aiModelId: 'model-1', allegiance: 'Mafia' as const, currentRating: 1500, gamesPlayed: 10 },
        { aiModelId: 'model-2', allegiance: 'Mafia' as const, currentRating: 1500, gamesPlayed: 10 },
        { aiModelId: 'model-3', allegiance: 'Town' as const, currentRating: 1500, gamesPlayed: 10 },
        { aiModelId: 'model-4', allegiance: 'Town' as const, currentRating: 1500, gamesPlayed: 10 },
      ],
    };

    const updates = elo.calculateRatingUpdates(result);

    // Mafia players should gain rating
    expect(updates.find(u => u.aiModelId === 'model-1')?.ratingChange).toBeGreaterThan(0);
    expect(updates.find(u => u.aiModelId === 'model-2')?.ratingChange).toBeGreaterThan(0);

    // Town players should lose rating
    expect(updates.find(u => u.aiModelId === 'model-3')?.ratingChange).toBeLessThan(0);
    expect(updates.find(u => u.aiModelId === 'model-4')?.ratingChange).toBeLessThan(0);
  });

  it('should handle draws correctly', () => {
    const result = {
      winner: null,
      players: [
        { aiModelId: 'model-1', allegiance: 'Mafia' as const, currentRating: 1500, gamesPlayed: 10 },
        { aiModelId: 'model-2', allegiance: 'Town' as const, currentRating: 1500, gamesPlayed: 10 },
      ],
    };

    const updates = elo.calculateRatingUpdates(result);

    // Equal ratings + draw = minimal rating change
    expect(Math.abs(updates[0].ratingChange)).toBeLessThan(1);
  });

  it('should use higher K-factor for new players', () => {
    const newPlayer = { aiModelId: 'new', allegiance: 'Mafia' as const, currentRating: 1500, gamesPlayed: 5 };
    const veteran = { aiModelId: 'vet', allegiance: 'Mafia' as const, currentRating: 1500, gamesPlayed: 150 };

    const result = {
      winner: 'Mafia' as const,
      players: [newPlayer, veteran],
    };

    const updates = elo.calculateRatingUpdates(result);
    const newPlayerUpdate = updates.find(u => u.aiModelId === 'new');
    const veteranUpdate = updates.find(u => u.aiModelId === 'vet');

    // New player should have larger rating change
    expect(Math.abs(newPlayerUpdate!.ratingChange)).toBeGreaterThan(Math.abs(veteranUpdate!.ratingChange));
  });
});
```

**Run Tests:**
```bash
pnpm test src/lib/arena/tests/elo.test.ts
```

### Week 2: Game Queue & Runner

#### 1.6 Game Queue System (Days 5-6)

**File:** `src/lib/arena/gameQueue.ts`

Copy implementation from `Mafia-Arena-Design-v2.md` with:
- Database-backed queue
- Retry logic
- Status tracking
- Error handling

**Test File:** `src/lib/arena/tests/gameQueue.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { GameQueue } from '../gameQueue';
import { db } from '@/lib/db';
import { arenaMatches } from '@/lib/db/schema-arena';

describe('GameQueue', () => {
  const queue = new GameQueue();

  beforeEach(async () => {
    // Clean up test data
    await db.delete(arenaMatches);
  });

  it('should enqueue a game', async () => {
    const matchId = await queue.enqueue({
      matchId: 'test-match-1',
      aiModels: [
        { aiModelId: 'model-1' },
        { aiModelId: 'model-2' },
      ],
      themeKey: 'UK_VILLAGE_1900S',
      matchType: 'ranked',
    });

    expect(matchId).toBe('test-match-1');

    const match = await db.select().from(arenaMatches).where(eq(arenaMatches.id, matchId));
    expect(match).toHaveLength(1);
    expect(match[0].status).toBe('queued');
  });

  it('should dequeue oldest game first', async () => {
    await queue.enqueue({ matchId: 'match-1', aiModels: [], themeKey: 'TEST', matchType: 'ranked' });
    await queue.enqueue({ matchId: 'match-2', aiModels: [], themeKey: 'TEST', matchType: 'ranked' });

    const game = await queue.dequeue();
    expect(game?.matchId).toBe('match-1');
  });

  it('should handle retry logic', async () => {
    const matchId = await queue.enqueue({ matchId: 'retry-test', aiModels: [], themeKey: 'TEST', matchType: 'ranked' });

    await queue.markFailed(matchId, 'Test error');
    const match = await db.select().from(arenaMatches).where(eq(arenaMatches.id, matchId));
    
    expect(match[0].status).toBe('queued'); // Should retry
    expect(match[0].retryCount).toBe(1);
  });
});
```

#### 1.7 Game Runner with Cost Tracking (Days 7-8)

**File:** `src/lib/arena/gameRunner.ts`

**⚠️ UPDATED:** Must collect token usage and calculate actual costs!

```typescript
/**
 * Arena Game Runner
 * Executes AI vs AI games and records results
 */

import { Game } from '@/lib/engine/core/Game';
import { createAgentInstance } from '@/lib/agentFactory';
import type { AgentConfig } from '@/lib/interfaces/persistence.types';
import { db } from '@/lib/db';
import { arenaPlayers, aiModels } from '@/lib/db/schema-arena';
import { eq } from 'drizzle-orm';

export interface ArenaGameConfig {
  matchId: string;
  themeKey: string;
  aiModels: Array<{
    aiModelId: string;
    rolePreference?: string;
  }>;
}

export interface ArenaGameResult {
  matchId: string;
  winner: 'Mafia' | 'Town' | null;
  durationSeconds: number;
  totalRounds: number;
  players: Array<{
    aiModelId: string;
    roleName: string;
    allegiance: string;
    survived: boolean;
    isWinner: boolean;
  }>;
  // ✅ ACTUAL USAGE DATA
  tokensUsed: number; // Required, not optional!
  estimatedCost: number; // Calculated from actual usage
  playerTokenUsage?: Map<string, number>; // Per-model breakdown
}

export class ArenaGameRunner {
  /**
   * Execute an arena game
   */
  async run(config: ArenaGameConfig): Promise<ArenaGameResult> {
    const startTime = Date.now();

    // Load AI model configs
    const modelConfigs = await this.loadModelConfigs(config.aiModels);

    // Create agent instances
    const agents = await Promise.all(
      modelConfigs.map(cfg => this.createAgent(cfg))
    );

    // Create game with AI agents
    const game = await Game.createNewGame({
      theme: config.themeKey,
      language: 'en',
      agents,
    });

    // Run game to completion
    await game.runGameLoop();

    const endTime = Date.now();
    const durationSeconds = Math.floor((endTime - startTime) / 1000);

    // Extract results
    const players = game.getPlayers();
    const winner = game.getWinner();

    // ✅ COLLECT TOKEN USAGE
    const tokenUsageByPlayer = game.getTokenUsageByPlayer();
    
    let totalTokens = 0;
    const playerUsage = new Map<string, number>();
    
    for (const [playerId, usage] of tokenUsageByPlayer) {
      totalTokens += usage.total;
      const modelId = this.getModelIdForPlayer(playerId, config.aiModels);
      playerUsage.set(modelId, (playerUsage.get(modelId) || 0) + usage.total);
    }
    
    // ✅ CALCULATE ACTUAL COST
    const actualCost = await this.calculateActualCost(playerUsage, config.aiModels);

    const result: ArenaGameResult = {
      matchId: config.matchId,
      winner: winner === 'Mafia' ? 'Mafia' : winner === 'Town' ? 'Town' : null,
      durationSeconds,
      totalRounds: game.getRound(),
      players: players.map(p => ({
        aiModelId: this.getModelIdForPlayer(p.getId(), config.aiModels),
        roleName: p.getRole().getName(),
        allegiance: p.getAllegiance(),
        survived: p.isAlive(),
        isWinner: p.getAllegiance() === winner,
      })),
      tokensUsed: totalTokens,
      estimatedCost: actualCost,
      playerTokenUsage: Object.fromEntries(playerUsage),
    };

    // Update player records AND cost data
    await this.updatePlayerResults(result);
    await this.updateMatchWithCost(result);

    return result;
  }

  private async loadModelConfigs(
    aiModels: ArenaGameConfig['aiModels']
  ): Promise<AgentConfig[]> {
    return Promise.all(
      aiModels.map(async ({ aiModelId }) => {
        const model = await db
          .select()
          .from(aiModels)
          .where(eq(aiModels.id, aiModelId))
          .limit(1);

        if (!model[0]) {
          throw new Error(`Model ${aiModelId} not found`);
        }

        return this.modelToAgentConfig(model[0]);
      })
    );
  }

  private modelToAgentConfig(model: typeof aiModels.$inferSelect): AgentConfig {
    // Map database model to agent config
    return {
      agentType: this.providerToAgentType(model.provider),
      modelName: model.modelIdentifier,
      providerValue: model.provider,
    };
  }

  private providerToAgentType(provider: string): string {
    const mapping: Record<string, string> = {
      openai: 'OpenAI',
      anthropic: 'Claude',
      google: 'Gemini',
      groq: 'Groq',
      fireworks: 'Fireworks',
      ollama: 'Ollama',
    };
    return mapping[provider] || 'OpenAI';
  }

  private async createAgent(config: AgentConfig) {
    return createAgentInstance(config, {
      apiKey: this.getApiKeyForProvider(config.providerValue),
    });
  }

  private getApiKeyForProvider(provider: string): string {
    const keys: Record<string, string> = {
      openai: process.env.OPENAI_API_KEY || '',
      anthropic: process.env.ANTHROPIC_API_KEY || '',
      google: process.env.GOOGLE_API_KEY || '',
      groq: process.env.GROQ_API_KEY || '',
    };
    return keys[provider] || '';
  }

  private getModelIdForPlayer(
    playerId: string,
    aiModels: ArenaGameConfig['aiModels']
  ): string {
    // Match player to model (simplified for now)
    const index = parseInt(playerId.split('-').pop() || '0');
    return aiModels[index]?.aiModelId || aiModels[0].aiModelId;
  }

  private async updatePlayerResults(result: ArenaGameResult): Promise<void> {
    for (const player of result.players) {
      await db
        .update(arenaPlayers)
        .set({
          survived: player.survived,
          isWinner: player.isWinner,
        })
        .where(eq(arenaPlayers.matchId, result.matchId));
    }
  }

  // ✅ NEW: Calculate actual cost from token usage
  private async calculateActualCost(
    playerUsage: Map<string, number>,
    aiModels: ArenaGameConfig['aiModels']
  ): Promise<number> {
    let totalCost = 0;
    
    for (const [modelId, tokens] of playerUsage) {
      const model = await db
        .select()
        .from(aiModels)
        .where(eq(aiModels.id, modelId))
        .limit(1);
      
      if (model[0]?.costPerMillionTokens) {
        const cost = (tokens / 1_000_000) * model[0].costPerMillionTokens;
        totalCost += cost;
      }
    }
    
    return totalCost;
  }
  
  // ✅ NEW: Update match with cost data
  private async updateMatchWithCost(result: ArenaGameResult): Promise<void> {
    await db
      .update(arenaMatches)
      .set({
        totalTokensUsed: result.tokensUsed,
        estimatedCost: result.estimatedCost,
      })
      .where(eq(arenaMatches.id, result.matchId));
    
    // Update per-player token usage
    if (result.playerTokenUsage) {
      for (const [modelId, tokens] of Object.entries(result.playerTokenUsage)) {
        await db
          .update(arenaPlayers)
          .set({ tokensUsed: tokens })
          .where(eq(arenaPlayers.aiModelId, modelId));
      }
    }
  }
}
```

#### 1.8 Batch Runner API (Days 9-10)

**File:** `src/app/api/arena/batch/route.ts`

Copy implementation from `Mafia-Arena-Design-v2.md` with:
- POST endpoint to process queue
- ELO updates after each game
- Error handling and retries
- Progress tracking

**API Route:** `POST /api/arena/batch`

**Request:**
```json
{
  "maxGames": 5
}
```

**Response:**
```json
{
  "results": [
    {
      "matchId": "match-1",
      "status": "completed",
      "winner": "Mafia",
      "durationSeconds": 234
    },
    {
      "matchId": "match-2",
      "status": "failed",
      "error": "AI timeout"
    }
  ]
}
```

**Test:**
```bash
# Queue a game first
curl -X POST http://localhost:3099/api/arena/queue \
  -H "Content-Type: application/json" \
  -d '{
    "aiModels": [{"aiModelId": "model-1"}, {"aiModelId": "model-2"}],
    "themeKey": "UK_VILLAGE_1900S",
    "matchType": "ranked"
  }'

# Process queue
curl -X POST http://localhost:3099/api/arena/batch \
  -H "Content-Type: application/json" \
  -d '{"maxGames": 1}'
```

---

## Phase 2: Leaderboard & UI (Week 3)

**Duration:** 5 days  
**Goal:** Public leaderboard, model profiles, match history

### 2.1 Leaderboard API (Days 11-12)

**File:** `src/app/api/arena/leaderboard/route.ts`

Copy implementation from `Mafia-Arena-Design-v2.md`

**Endpoints:**
- `GET /api/arena/leaderboard` - Get ranked models
- `GET /api/arena/leaderboard/[modelId]` - Get model details
- `GET /api/arena/leaderboard/history` - Get rating history

**Features:**
- Pagination (limit, offset)
- Filtering (theme, provider, minGames)
- Sorting (rating, winRate, gamesPlayed)

### 2.2 Leaderboard UI Components (Days 12-13)

**File:** `src/components/arena/Leaderboard.tsx`

Features:
- Top 50 models by rating
- Win rate percentage
- Games played count
- Rating trend indicator
- Provider badges
- Click to view model details

**File:** `src/components/arena/ModelCard.tsx`

Features:
- Model name and provider
- Current rating with tier badge
- Win/Loss/Draw stats
- Recent match history (last 10)
- Rating chart (last 30 days)
- Head-to-head records

**File:** `src/components/arena/MatchHistory.tsx`

Features:
- Recent matches list
- Winner indicator
- Player lineup
- Game duration
- View replay link (future)

### 2.3 Arena Dashboard Page (Day 14)

**File:** `src/app/[lang]/arena/page.tsx`

```typescript
import { Leaderboard } from '@/components/arena/Leaderboard';
import { ArenaStats } from '@/components/arena/ArenaStats';
import { RecentMatches } from '@/components/arena/RecentMatches';

export default async function ArenaPage() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-4xl font-bold mb-8">Mafia Arena</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <ArenaStats />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-2xl font-bold mb-4">Leaderboard</h2>
          <Leaderboard />
        </div>
        
        <div>
          <h2 className="text-2xl font-bold mb-4">Recent Matches</h2>
          <RecentMatches />
        </div>
      </div>
    </div>
  );
}
```

### 2.4 Model Detail Page (Day 15)

**File:** `src/app/[lang]/arena/models/[modelId]/page.tsx`

Features:
- Model overview
- Rating history chart
- Performance by theme
- Performance by role
- Head-to-head matchups
- All matches table

---

## Phase 3: Cost Controls & Analytics (Week 4)

**Duration:** 5 days  
**Goal:** Budget management, cost tracking, analytics

### 3.1 Cost Tracking System (Days 16-17)

**File:** `src/lib/arena/costTracking.ts`

Copy implementation from `Mafia-Arena-Design-v2.md` with:
- Model cost database
- Cost estimation
- Budget guards
- Real-time tracking

**File:** `src/app/api/arena/costs/route.ts`

```typescript
// GET /api/arena/costs - Get cost breakdown
// GET /api/arena/costs/budget - Get remaining budget
// POST /api/arena/costs/budget - Set budget limit
```

### 3.2 Admin Controls (Days 18-19)

**File:** `src/app/[lang]/admin/arena/page.tsx`

Features:
- Queue management (pause/resume)
- Budget dashboard
- Model activation/deactivation
- Emergency stop button
- Manual game triggering
- Cost alerts configuration

**Access Control:**
- Admin-only (check user email against `ADMIN_EMAIL` env var)
- Or use Melody Auth roles (after migration)

### 3.3 Analytics Dashboard (Day 20)

**File:** `src/components/arena/AnalyticsDashboard.tsx`

Metrics:
- Games per day chart
- Cost per day chart
- Win rate by provider
- Average game duration
- Most played models
- Theme popularity

**Tools:**
- Use `recharts` for charts
- Export CSV functionality
- Date range filters

---

## Phase 4: Polish & Testing (Week 5)

**Duration:** 5 days  
**Goal:** Bug fixes, performance optimization, comprehensive testing

### 4.1 Comprehensive Testing (Days 21-22)

#### Unit Tests
```bash
# Run all tests
pnpm test

# Coverage report
pnpm test --coverage
```

**Target Coverage:**
- ELO system: 95%+
- Game queue: 90%+
- Cost tracking: 95%+
- Game runner: 80%+

#### Integration Tests

**File:** `tests/arena-integration.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Arena System', () => {
  test('should complete full game cycle', async ({ page }) => {
    // 1. Navigate to arena page
    await page.goto('/en/arena');
    await expect(page.locator('h1')).toContainText('Mafia Arena');

    // 2. Check leaderboard loads
    const leaderboard = page.locator('[data-testid="leaderboard"]');
    await expect(leaderboard).toBeVisible();

    // 3. View model details
    await page.locator('[data-testid="model-card"]').first().click();
    await expect(page.locator('h2')).toContainText('Model Details');

    // 4. Admin: Queue game (if admin)
    // 5. Wait for completion
    // 6. Verify leaderboard updated
  });

  test('should respect budget limits', async ({ page }) => {
    // Test budget guard functionality
  });

  test('should handle API errors gracefully', async ({ page }) => {
    // Test error states
  });
});
```

### 4.2 Performance Optimization (Days 23-24)

**Database Optimization:**
```sql
-- Analyze slow queries
EXPLAIN QUERY PLAN 
SELECT * FROM model_ratings 
JOIN ai_models ON model_ratings.ai_model_id = ai_models.id
ORDER BY model_ratings.rating DESC
LIMIT 50;

-- Add missing indexes if needed
CREATE INDEX IF NOT EXISTS idx_model_ratings_rating_desc 
ON model_ratings(rating DESC);
```

**Caching Strategy:**
```typescript
// Cache leaderboard for 5 minutes
import { unstable_cache } from 'next/cache';

export const getLeaderboard = unstable_cache(
  async () => {
    return db.select().from(modelRatings)...;
  },
  ['arena-leaderboard'],
  { revalidate: 300 } // 5 minutes
);
```

**Rate Limiting:**
```typescript
// Add rate limiting to queue endpoint
import { Ratelimit } from '@upstash/ratelimit';

const ratelimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(10, '1 m'),
});

// In API route
const { success } = await ratelimit.limit(ip);
if (!success) {
  return new Response('Too many requests', { status: 429 });
}
```

### 4.3 Documentation (Day 25)

**Files to Create/Update:**
- `docs/ARENA.md` - User guide
- `docs/ARENA_API.md` - API documentation
- `docs/ARENA_ADMIN.md` - Admin guide
- `README.md` - Update with Arena section

**API Documentation Example:**
```markdown
# Arena API

## Queue a Game

**Endpoint:** `POST /api/arena/queue`

**Request:**
```json
{
  "aiModels": [
    { "aiModelId": "model-uuid-1" },
    { "aiModelId": "model-uuid-2" }
  ],
  "themeKey": "UK_VILLAGE_1900S",
  "matchType": "ranked"
}
```

**Response:**
```json
{
  "matchId": "match-uuid",
  "status": "queued",
  "queuePosition": 5
}
```
```

---

## Phase 5: Production Deploy (Week 6)

**Duration:** 5 days  
**Goal:** Production deployment, monitoring, launch

### 5.1 Pre-Deployment Checklist (Day 26)

- [ ] All tests passing
- [ ] Database migrations tested on staging
- [ ] Environment variables documented
- [ ] API keys secured (Wrangler secrets)
- [ ] Budget limits configured
- [ ] Monitoring setup
- [ ] Error tracking enabled
- [ ] Backup strategy in place

### 5.2 Staging Deployment (Day 27)

```bash
# Deploy to Cloudflare staging
pnpm pages:build
wrangler pages deploy .vercel/output/static --project-name werewolf-ai-staging

# Run migration
wrangler d1 execute werewolf-ai-db-staging --file=./drizzle/0008_add_arena_system.sql

# Seed models
pnpm tsx scripts/arena/seed-models.ts --env=staging

# Run smoke tests
pnpm test:e2e:staging
```

### 5.3 Production Deployment (Day 28)

```bash
# Backup production database
wrangler d1 backup create werewolf-ai-db --name="pre-arena-launch"

# Deploy
pnpm pages:build
pnpm pages:deploy

# Run migration
wrangler d1 execute werewolf-ai-db --file=./drizzle/0008_add_arena_system.sql

# Seed models
pnpm tsx scripts/arena/seed-models.ts --env=production

# Verify deployment
curl https://werewolfarena.com/api/arena/leaderboard
```

### 5.4 Monitoring Setup (Day 29)

**Cloudflare Analytics:**
- Enable Web Analytics
- Set up custom events for key actions
- Configure alerts

**Custom Monitoring:**
```typescript
// src/lib/monitoring/arenaMetrics.ts
export const ARENA_METRICS = {
  GAME_STARTED: 'arena.game.started',
  GAME_COMPLETED: 'arena.game.completed',
  GAME_FAILED: 'arena.game.failed',
  COST_ALERT: 'arena.cost.alert',
  QUEUE_DEPTH: 'arena.queue.depth',
};

export async function trackMetric(metric: string, value?: number) {
  // Send to analytics
  await fetch('https://analytics.endpoint', {
    method: 'POST',
    body: JSON.stringify({ metric, value, timestamp: Date.now() }),
  });
}
```

### 5.5 Soft Launch (Day 30)

**Launch Plan:**
1. **Day 1:** Internal testing (admin-only)
   - Run 50 test games
   - Monitor costs
   - Check for errors

2. **Day 2:** Beta users
   - Invite 10-20 beta users
   - Gather feedback
   - Monitor performance

3. **Day 3:** Public launch
   - Announce on social media
   - Update landing page
   - Monitor usage

**Launch Checklist:**
- [ ] Status page updated
- [ ] Documentation published
- [ ] Social media posts scheduled
- [ ] Support channels ready
- [ ] Emergency contacts notified

---

## Post-Launch Roadmap

### Phase 6: Tournaments (Weeks 7-9)

**Features:**
- Round-robin tournaments
- Tournament creation UI
- Bracket visualization
- Prize tracking (optional)

### Phase 7: Advanced Analytics (Weeks 10-12)

**Features:**
- Role-specific performance
- Theme difficulty analysis
- Head-to-head stats
- Performance trends
- Predictive analytics

### Phase 8: Public API (Weeks 13-15)

**Features:**
- API authentication
- Rate limiting
- Webhook notifications
- Model submission endpoint
- Results export

### Phase 9: Community Features (Weeks 16+)

**Features:**
- User-created tournaments
- Model voting/favorites
- Comments on matches
- Model comparisons
- Custom themes submission

---

## Team Responsibilities

### Solo Developer (Recommended Timeline)

**Full-time (40 hrs/week):** 6 weeks  
**Part-time (20 hrs/week):** 12 weeks  
**Spare-time (10 hrs/week):** 24 weeks

### Team of 2-3

**Backend Developer:**
- Database schema
- ELO system
- Game queue
- API endpoints
- Cost tracking

**Frontend Developer:**
- Leaderboard UI
- Model profiles
- Analytics dashboard
- Admin panel

**DevOps/Testing:**
- CI/CD pipeline
- Testing
- Monitoring
- Deployment

---

## Risk Mitigation

### High-Risk Areas

#### 1. AI API Costs
**Risk:** Budget overrun  
**Mitigation:**
- Start with cheap models (Gemini Flash, GPT-3.5)
- Hard budget limits in code
- Daily cost alerts
- Auto-pause at threshold

#### 2. Game Failures
**Risk:** Games hang or crash  
**Mitigation:**
- 30-minute timeout per game
- Automatic retries (max 3)
- Detailed error logging
- Manual intervention tools

#### 3. Database Performance
**Risk:** Slow queries on D1  
**Mitigation:**
- Proper indexing
- Query optimization
- Caching layer
- Pagination on all lists

#### 4. Rate Limiting
**Risk:** API bans from providers  
**Mitigation:**
- Respect rate limits
- Delays between games
- Multiple API keys
- Exponential backoff

### Contingency Plans

**If costs too high:**
- Disable expensive models
- Reduce game frequency
- Switch to cheaper providers
- Implement user payment system

**If performance poor:**
- Optimize database queries
- Add Redis caching
- Reduce real-time features
- Batch operations more

**If adoption low:**
- Marketing campaign
- Partnerships with AI researchers
- Free credits for new models
- Community challenges

---

## Success Metrics

### Week 1 (MVP)
- [ ] 100 games completed successfully
- [ ] ELO ratings calculated
- [ ] Cost < $10 total

### Week 3 (UI Launch)
- [ ] 1000+ games completed
- [ ] 10+ models ranked
- [ ] Leaderboard accessible
- [ ] Cost < $50 total

### Week 6 (Public Launch)
- [ ] 5000+ games completed
- [ ] 20+ models ranked
- [ ] 100+ daily active users
- [ ] Cost < $200/month
- [ ] 95% uptime

### Month 3 (Growth)
- [ ] 50,000+ games completed
- [ ] 50+ models ranked
- [ ] 1000+ daily active users
- [ ] Break-even or profitable
- [ ] 99% uptime

---

## Appendix

### A. Required Environment Variables

```bash
# .env.production
AUTH_SERVER_URL=https://werewolfarena.com
AUTH_JWT_SECRET=<32-char-secret>
AUTH_COOKIE_SECRET=<32-char-secret>

# AI Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
GROQ_API_KEY=gsk_...

# Database
DATABASE_URL=<D1-binding>

# Admin
ADMIN_EMAIL=admin@werewolfarena.com

# Budget
ARENA_DAILY_BUDGET_USD=50
ARENA_MONTHLY_BUDGET_USD=1000
```

### B. Deployment Commands

```bash
# Development
pnpm dev

# Build
pnpm build

# Test
pnpm test
pnpm test:e2e

# Database
pnpm db:generate
pnpm db:push
pnpm db:studio

# Deploy
pnpm pages:build
pnpm pages:deploy

# Cloudflare
wrangler d1 execute werewolf-ai-db --command="SELECT * FROM ai_models"
wrangler secret put OPENAI_API_KEY
```

### C. Monitoring URLs

- **Production:** https://werewolfarena.com
- **Staging:** https://staging.werewolfarena.com
- **Analytics:** https://dash.cloudflare.com/analytics
- **Database:** https://dash.cloudflare.com/d1

### D. Support Contacts

- **Technical Lead:** [Your email]
- **On-Call:** [Phone number]
- **Community:** Discord/GitHub Discussions

---

## Timeline Summary

```
Week 0: Foundation & Setup (3 days)
Week 1: Database & ELO (5 days)
Week 2: Queue & Runner (5 days)
Week 3: Leaderboard UI (5 days)
Week 4: Cost Controls (5 days)
Week 5: Testing & Polish (5 days)
Week 6: Production Deploy (5 days)
────────────────────────────────
Total: 6 weeks (30 working days)
```

**Next Step:** Review and approve this plan, then begin Phase 0!
