# Cost Measurement & Tracking - Enhancement Plan

**Issue:** While we have planned for cost tracking in the Arena system, we're missing **actual token usage measurement** from AI API calls.

**Status:** ⚠️ GAP IDENTIFIED - Need to implement actual token counting

---

## Current State Analysis

### ✅ What We Have Planned

1. **Database Schema** - Ready for cost data:
   ```typescript
   // arena_matches table
   totalTokensUsed: integer('total_tokens_used'),
   estimatedCost: real('estimated_cost'),
   
   // arena_players table
   tokensUsed: integer('tokens_used'),
   
   // ai_models table
   costPerMillionTokens: real('cost_per_million_tokens'),
   ```

2. **Cost Tracking Module** - Planned in Phase 3:
   - Model cost database (per-model pricing)
   - Cost estimation formulas
   - Budget guards
   - Analytics dashboard

3. **Batch Operations** - Cost controls:
   ```typescript
   maxCostUsd: real('max_cost_usd'),
   currentCostUsd: real('current_cost_usd'),
   ```

### ❌ What We're Missing

**CRITICAL GAP:** The actual AI agent implementations don't capture or return token usage from API responses!

**Evidence:**
- `OpenAIAgent.getAction()` - Doesn't capture `completion.usage`
- `ClaudeAgent.getAction()` - Doesn't capture token usage
- `GeminiAgent.getAction()` - Doesn't capture token usage
- No interface method for returning usage metadata

---

## Solution: Token Usage Instrumentation

### Phase 1: Extend Agent Interface (Immediate)

**1.1 Update IAgent Interface**

**File:** `src/lib/engine/interfaces/IAgent.ts`

```typescript
// Add to existing interface
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  modelName?: string;
  provider?: string;
}

export interface AgentResponse {
  action: PlayerAction;
  usage?: TokenUsage; // Optional for backward compatibility
}

export interface IAgent {
  id: PlayerId;
  agentName: string;
  persona: Persona;
  
  // UPDATED: Return usage metadata
  getAction(
    gameState: VisibleGameState,
    allowedActions: PlayerAction['type'][]
  ): Promise<AgentResponse>; // Changed from Promise<PlayerAction>
  
  generatePersona(
    themeDescription: string,
    language?: string,
    existingNames?: string[]
  ): Promise<TokenUsage | void>; // Track persona generation cost too
}
```

**Impact:** This is a **breaking change** but necessary for accurate cost tracking.

**Migration Strategy:**
- Default `usage` to undefined for human agents
- Update all AI agents to return usage
- Update game engine to handle new response format

---

### Phase 2: Implement Token Capture in Each Agent

#### 2.1 OpenAI/Groq/Fireworks Agent

**File:** `src/lib/engine/agents/OpenAIAgent.ts`

```typescript
async getAction(
  gameState: VisibleGameState,
  allowedActions: PlayerAction['type'][]
): Promise<AgentResponse> {
  // ... existing prompt building code ...

  try {
    const completion = await this.openai.chat.completions.create({
      model: this.model,
      messages: conversationLog,
      temperature: 0.8,
      max_tokens: 500,
    });

    // ✅ CAPTURE TOKEN USAGE
    const usage: TokenUsage | undefined = completion.usage
      ? {
          inputTokens: completion.usage.prompt_tokens,
          outputTokens: completion.usage.completion_tokens,
          totalTokens: completion.usage.total_tokens,
          modelName: this.model,
          provider: this.getProvider(), // 'openai', 'groq', 'fireworks'
        }
      : undefined;

    const responseContent = completion.choices[0]?.message?.content;
    
    // ... existing parsing logic ...
    
    return {
      action: parsedAction,
      usage, // Return usage metadata
    };
  } catch (error) {
    // ... error handling ...
  }
}

async generatePersona(
  themeDescription: string,
  language?: string,
  existingNames?: string[]
): Promise<TokenUsage> {
  // ... existing code ...
  
  const completion = await this.openai.chat.completions.create({
    model: this.model,
    messages: [{ role: 'user', content: personaPrompt }],
    temperature: 1.0,
    max_tokens: 400,
  });

  // ✅ CAPTURE PERSONA GENERATION COST
  const usage: TokenUsage = {
    inputTokens: completion.usage?.prompt_tokens || 0,
    outputTokens: completion.usage?.completion_tokens || 0,
    totalTokens: completion.usage?.total_tokens || 0,
    modelName: this.model,
    provider: this.getProvider(),
  };

  // ... existing persona parsing ...
  
  return usage;
}

private getProvider(): string {
  if (this.apiBase.includes('groq.com')) return 'groq';
  if (this.apiBase.includes('fireworks.ai')) return 'fireworks';
  if (this.apiBase.includes('localhost')) return 'ollama_local';
  return 'openai';
}
```

#### 2.2 Claude Agent

**File:** `src/lib/engine/agents/ClaudeAgent.ts`

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { TokenUsage, AgentResponse } from '../interfaces/IAgent';

async getAction(
  gameState: VisibleGameState,
  allowedActions: PlayerAction['type'][]
): Promise<AgentResponse> {
  // ... existing prompt building ...

  try {
    const response = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 500,
      system: systemPrompt,
      messages: conversationLog,
    });

    // ✅ CAPTURE TOKEN USAGE (Anthropic format)
    const usage: TokenUsage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      modelName: this.model,
      provider: 'anthropic',
    };

    // ... existing parsing ...
    
    return {
      action: parsedAction,
      usage,
    };
  } catch (error) {
    // ... error handling ...
  }
}
```

#### 2.3 Gemini Agent

**File:** `src/lib/engine/agents/GeminiAgent.ts`

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { TokenUsage, AgentResponse } from '../interfaces/IAgent';

async getAction(
  gameState: VisibleGameState,
  allowedActions: PlayerAction['type'][]
): Promise<AgentResponse> {
  // ... existing prompt building ...

  try {
    const result = await this.model.generateContent({
      contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
      generationConfig: {
        maxOutputTokens: 500,
        temperature: 0.8,
      },
    });

    const response = result.response;

    // ✅ CAPTURE TOKEN USAGE (Gemini format)
    const usageMetadata = response.usageMetadata;
    const usage: TokenUsage | undefined = usageMetadata
      ? {
          inputTokens: usageMetadata.promptTokenCount || 0,
          outputTokens: usageMetadata.candidatesTokenCount || 0,
          totalTokens: usageMetadata.totalTokenCount || 0,
          modelName: this.modelName,
          provider: 'google',
        }
      : undefined;

    // ... existing parsing ...
    
    return {
      action: parsedAction,
      usage,
    };
  } catch (error) {
    // ... error handling ...
  }
}
```

#### 2.4 Human Agent (No Tokens)

**File:** `src/lib/engine/agents/HumanAgent.ts`

```typescript
async getAction(
  gameState: VisibleGameState,
  allowedActions: PlayerAction['type'][]
): Promise<AgentResponse> {
  // ... existing human action logic ...
  
  return {
    action: humanAction,
    usage: undefined, // No tokens for human players
  };
}
```

---

### Phase 3: Update Game Engine to Collect Usage

**File:** `src/lib/engine/core/Game.ts`

```typescript
export class Game {
  private tokenUsageLog: Map<PlayerId, TokenUsage[]> = new Map();
  
  // Add method to track usage per player
  private recordTokenUsage(playerId: PlayerId, usage?: TokenUsage): void {
    if (!usage) return;
    
    const playerLog = this.tokenUsageLog.get(playerId) || [];
    playerLog.push(usage);
    this.tokenUsageLog.set(playerId, playerLog);
  }
  
  // Update player action method
  private async getPlayerAction(
    player: IPlayer,
    allowedActions: PlayerAction['type'][]
  ): Promise<PlayerAction> {
    const gameState = this.getVisibleGameState(player);
    
    // ✅ CAPTURE USAGE
    const response = await player.getAgent().getAction(gameState, allowedActions);
    
    // ✅ RECORD USAGE
    this.recordTokenUsage(player.getId(), response.usage);
    
    return response.action;
  }
  
  // Add method to get total usage
  public getTokenUsageByPlayer(): Map<PlayerId, { total: number; details: TokenUsage[] }> {
    const summary = new Map();
    
    for (const [playerId, usageLog] of this.tokenUsageLog) {
      const total = usageLog.reduce((sum, u) => sum + u.totalTokens, 0);
      summary.set(playerId, { total, details: usageLog });
    }
    
    return summary;
  }
  
  // Add to serializable state
  public toSerializable(): SerializableGameState {
    // ... existing serialization ...
    
    return {
      // ... existing fields ...
      tokenUsage: Object.fromEntries(this.tokenUsageLog),
    };
  }
}
```

---

### Phase 4: Arena Integration

**File:** `src/lib/arena/gameRunner.ts`

```typescript
export class ArenaGameRunner {
  async run(config: ArenaGameConfig): Promise<ArenaGameResult> {
    const startTime = Date.now();
    
    // ... create agents and game ...
    
    // Run game
    await game.runGameLoop();
    
    // ✅ COLLECT TOKEN USAGE
    const tokenUsageByPlayer = game.getTokenUsageByPlayer();
    
    let totalTokens = 0;
    const playerUsage = new Map<string, number>();
    
    for (const [playerId, usage] of tokenUsageByPlayer) {
      totalTokens += usage.total;
      
      // Map player ID to model ID
      const modelId = this.getModelIdForPlayer(playerId, config.aiModels);
      playerUsage.set(modelId, (playerUsage.get(modelId) || 0) + usage.total);
    }
    
    // ✅ CALCULATE ACTUAL COST
    const actualCost = await this.calculateActualCost(playerUsage, config.aiModels);
    
    const result: ArenaGameResult = {
      // ... existing fields ...
      tokensUsed: totalTokens,
      estimatedCost: actualCost,
      playerTokenUsage: Object.fromEntries(playerUsage),
    };
    
    // ✅ UPDATE DATABASE
    await this.updateMatchWithCost(result);
    
    return result;
  }
  
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
  
  private async updateMatchWithCost(result: ArenaGameResult): Promise<void> {
    // Update arena_matches table
    await db
      .update(arenaMatches)
      .set({
        totalTokensUsed: result.tokensUsed,
        estimatedCost: result.estimatedCost,
      })
      .where(eq(arenaMatches.id, result.matchId));
    
    // Update arena_players table
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

---

## Cost Analytics Enhancements

### Enhanced Leaderboard with Cost Metrics

**File:** `src/app/api/arena/leaderboard/route.ts`

```typescript
export async function GET(request: Request) {
  const leaderboard = await db
    .select({
      modelId: aiModels.id,
      modelName: aiModels.name,
      provider: aiModels.provider,
      rating: modelRatings.rating,
      gamesPlayed: modelRatings.gamesPlayed,
      wins: modelRatings.wins,
      
      // ✅ ADD COST METRICS
      avgTokensPerGame: sql<number>`
        AVG(${arenaPlayers.tokensUsed})
      `,
      totalCost: sql<number>`
        SUM(${arenaMatches.estimatedCost})
      `,
      avgCostPerGame: sql<number>`
        AVG(${arenaMatches.estimatedCost})
      `,
      costPerWin: sql<number>`
        SUM(${arenaMatches.estimatedCost}) / NULLIF(${modelRatings.wins}, 0)
      `,
    })
    .from(modelRatings)
    .innerJoin(aiModels, eq(modelRatings.aiModelId, aiModels.id))
    .leftJoin(arenaPlayers, eq(arenaPlayers.aiModelId, aiModels.id))
    .leftJoin(arenaMatches, eq(arenaMatches.id, arenaPlayers.matchId))
    .groupBy(aiModels.id, modelRatings.rating)
    .orderBy(desc(modelRatings.rating));
  
  return NextResponse.json({ leaderboard });
}
```

### Cost Efficiency Ranking

**New Endpoint:** `GET /api/arena/leaderboard/cost-efficiency`

```typescript
// Rank models by "rating per dollar"
export async function GET(request: Request) {
  const costEfficiency = await db
    .select({
      modelName: aiModels.name,
      rating: modelRatings.rating,
      totalCost: sql<number>`SUM(${arenaMatches.estimatedCost})`,
      ratingPerDollar: sql<number>`
        ${modelRatings.rating} / NULLIF(SUM(${arenaMatches.estimatedCost}), 0)
      `,
    })
    .from(modelRatings)
    .innerJoin(aiModels, eq(modelRatings.aiModelId, aiModels.id))
    .leftJoin(arenaPlayers, eq(arenaPlayers.aiModelId, aiModels.id))
    .leftJoin(arenaMatches, eq(arenaMatches.id, arenaPlayers.matchId))
    .where(gte(modelRatings.gamesPlayed, 10)) // Min 10 games
    .groupBy(aiModels.id, modelRatings.rating)
    .orderBy(desc(sql`ratingPerDollar`));
  
  return NextResponse.json({ costEfficiency });
}
```

---

## Dashboard Enhancements

### Cost Analytics Component

**File:** `src/components/arena/CostAnalytics.tsx`

```typescript
'use client';

import { Card } from '@/components/ui/card';
import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';

interface ModelCostData {
  modelName: string;
  rating: number;
  avgCostPerGame: number;
  costPerWin: number;
  totalCost: number;
}

export function CostAnalytics() {
  const [data, setData] = useState<ModelCostData[]>([]);
  
  useEffect(() => {
    fetch('/api/arena/leaderboard?includeCost=true')
      .then(res => res.json())
      .then(data => setData(data.leaderboard));
  }, []);
  
  return (
    <Card className="p-6">
      <h3 className="text-xl font-bold mb-4">Cost Analysis</h3>
      
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="border p-4 rounded">
          <div className="text-sm text-gray-500">Most Expensive per Game</div>
          <div className="text-2xl font-bold">
            {data[0]?.modelName || 'N/A'}
          </div>
          <div className="text-sm">${data[0]?.avgCostPerGame.toFixed(4)}</div>
        </div>
        
        <div className="border p-4 rounded">
          <div className="text-sm text-gray-500">Best Value (Rating/$)</div>
          <div className="text-2xl font-bold">
            {/* TODO: Fetch from cost-efficiency endpoint */}
          </div>
        </div>
      </div>
      
      <BarChart width={600} height={300} data={data}>
        <XAxis dataKey="modelName" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Bar dataKey="avgCostPerGame" fill="#8884d8" name="Avg Cost/Game" />
        <Bar dataKey="costPerWin" fill="#82ca9d" name="Cost/Win" />
      </BarChart>
    </Card>
  );
}
```

---

## Implementation Timeline

### Immediate (Week 1)
- [ ] Update `IAgent` interface with `AgentResponse` type
- [ ] Implement token capture in `OpenAIAgent`
- [ ] Implement token capture in `ClaudeAgent`
- [ ] Implement token capture in `GeminiAgent`
- [ ] Update `Game` engine to collect usage

### Week 2
- [ ] Update `ArenaGameRunner` to calculate actual costs
- [ ] Update database records with real token counts
- [ ] Test with 10 games - verify accurate cost tracking

### Week 3
- [ ] Add cost metrics to leaderboard API
- [ ] Create cost analytics dashboard
- [ ] Add cost-efficiency rankings
- [ ] Test cost alerts and budget guards

---

## Testing Strategy

### Unit Tests

```typescript
// src/lib/arena/tests/tokenTracking.test.ts
describe('Token Usage Tracking', () => {
  it('should capture OpenAI token usage', async () => {
    const agent = new OpenAIAgent('test-1');
    const response = await agent.getAction(mockGameState, ['VOTE']);
    
    expect(response.usage).toBeDefined();
    expect(response.usage?.totalTokens).toBeGreaterThan(0);
    expect(response.usage?.provider).toBe('openai');
  });
  
  it('should calculate accurate cost', async () => {
    const usage = new Map([
      ['gpt-4o', 5000],  // 5k tokens
      ['gpt-3.5-turbo', 3000],  // 3k tokens
    ]);
    
    const cost = await calculateActualCost(usage, models);
    
    // GPT-4o: 5000 / 1M * $5 = $0.025
    // GPT-3.5: 3000 / 1M * $1 = $0.003
    // Total: $0.028
    expect(cost).toBeCloseTo(0.028, 4);
  });
});
```

### Integration Test

```typescript
// Run a full game and verify cost tracking
test('should track cost for full AI vs AI game', async () => {
  const matchId = await queue.enqueue({
    matchId: 'cost-test-1',
    aiModels: [
      { aiModelId: 'gemini-flash-1' },
      { aiModelId: 'gemini-flash-2' },
    ],
    themeKey: 'UK_VILLAGE_1900S',
    matchType: 'ranked',
  });
  
  const runner = new ArenaGameRunner();
  const result = await runner.run({
    matchId,
    themeKey: 'UK_VILLAGE_1900S',
    aiModels: [
      { aiModelId: 'gemini-flash-1' },
      { aiModelId: 'gemini-flash-2' },
    ],
  });
  
  // Verify cost was captured
  expect(result.tokensUsed).toBeGreaterThan(0);
  expect(result.estimatedCost).toBeGreaterThan(0);
  
  // Verify it's in database
  const match = await db.select().from(arenaMatches).where(eq(arenaMatches.id, matchId));
  expect(match[0].totalTokensUsed).toBe(result.tokensUsed);
  expect(match[0].estimatedCost).toBe(result.estimatedCost);
});
```

---

## Key Metrics to Track

### Per Model
- Average tokens per game
- Average cost per game
- Cost per win
- Token efficiency (rating / avg tokens)
- Cost efficiency (rating / avg cost)

### Per Game
- Total tokens used
- Actual cost (from real usage)
- Cost breakdown by model
- Most expensive player
- Most token-efficient player

### Global
- Total platform spend
- Daily/weekly/monthly burn rate
- Cost per active user
- ROI metrics (engagement / cost)

---

## Success Criteria

### Week 1
- [ ] All agents return token usage
- [ ] Game engine collects usage per player
- [ ] Database stores actual token counts

### Week 2
- [ ] 100% of games have accurate cost data
- [ ] Leaderboard shows cost metrics
- [ ] Cost alerts trigger correctly

### Week 3
- [ ] Cost analytics dashboard live
- [ ] Can compare models by efficiency
- [ ] Budget guards prevent overspend

---

## Summary

**Yes, we have planned for cost tracking, BUT:**

✅ Database schema ready  
✅ Cost estimation formulas planned  
✅ Budget controls designed  
❌ **MISSING: Actual token usage capture from AI APIs** ← **Critical gap**

**Action Required:**
1. Implement token usage capture (this document)
2. Update agent interface (breaking change)
3. Integrate into game engine
4. Test with real games
5. Deploy cost analytics

**Timeline:** 3 weeks to full implementation  
**Priority:** HIGH - Essential for accurate benchmarking

This enhancement makes the Arena a true **cost-aware benchmarking platform** where users can see:
- Which models perform best
- Which models are most cost-efficient
- True cost of achieving certain win rates
- ROI metrics for AI model selection
