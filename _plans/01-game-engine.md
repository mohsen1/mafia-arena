# Milestone 1: Game Engine Core

## Objective

Build a pure TypeScript game engine that can run a complete Mafia game to completion, with no external dependencies on Cloudflare, React, or any framework.

## Deliverables

1. **Game Engine Library** (`/src/engine/`)
   - Game state management
   - Phase transitions (Night → Day → Vote → Elimination)
   - Win condition detection
   - AI action interface (dependency injection)

2. **Full Test Coverage** (`/src/engine/__tests__/`)
   - Unit tests for all game logic
   - Integration tests with mock AI responses
   - Edge case handling (ties, early wins, etc.)

3. **Type Definitions** (`/src/engine/types.ts`)
   - `GameConfig`, `GameState`, `GameResult`
   - `Player`, `Team`, `Phase`
   - `AIAction`, `AIResponse`

## Architecture

```
/src/engine/
├── index.ts              # Public API exports
├── types.ts              # All type definitions
├── Game.ts               # Main game class
├── GameState.ts          # Immutable state management
├── phases/
│   ├── NightPhase.ts     # Mafia kills
│   ├── DayPhase.ts       # Discussion
│   └── VotePhase.ts      # Elimination voting
├── ai/
│   └── AIInterface.ts    # Abstract AI caller interface
└── __tests__/
    ├── Game.test.ts
    ├── phases.test.ts
    └── integration.test.ts
```

## Key Interfaces

```typescript
// Game configuration
interface GameConfig {
  playerCount: number;
  mafiaCount: number;
  teams: TeamAssignment[];
  maxRounds: number;
  discussionEnabled: boolean;
}

interface TeamAssignment {
  modelId: string;
  team: 'mafia' | 'town';
  count: number;
}

// Game result
interface GameResult {
  id: string;
  config: GameConfig;
  winner: 'mafia' | 'town';
  rounds: number;
  events: GameEvent[];
  tokenUsage: TokenUsage;
  durationMs: number;
}

// AI interface (injected dependency)
interface AIProvider {
  getAction(
    context: AIContext,
    prompt: ActionPrompt
  ): Promise<AIResponse>;
}

interface AIContext {
  gameId: string;
  playerId: string;
  modelId: string;
  phase: Phase;
  round: number;
  visibleState: VisibleGameState;
}

interface AIResponse {
  action: PlayerAction;
  reasoning?: string;
  tokensUsed: { input: number; output: number };
  latencyMs: number;
}
```

## Game Flow

```
1. Initialize game with config
2. Assign players to teams randomly
3. Loop until win condition:
   a. NIGHT PHASE
      - Each mafia player votes to kill
      - Resolve kill (majority vote)
   b. DAY PHASE (if discussion enabled)
      - Each alive player discusses
   c. VOTE PHASE
      - Each alive player votes to eliminate
      - Resolve elimination (majority vote)
   d. Check win condition
4. Return GameResult
```

## Win Conditions

- **Mafia wins:** Mafia count >= Town count
- **Town wins:** Mafia count == 0

## Testing Strategy

| Test Type | Coverage |
|-----------|----------|
| Unit | Each phase in isolation |
| Integration | Full game with mock AI |
| Edge Cases | Ties, 0 votes, early termination |
| Determinism | Same seed = same result |

## Dependencies

- **Runtime:** None (pure TypeScript)
- **Dev:** Vitest for testing
- **Types:** TypeScript strict mode

## Acceptance Criteria

- [ ] Can create a game with configurable player count
- [ ] Night phase correctly resolves mafia kills
- [ ] Day phase collects discussion messages
- [ ] Vote phase correctly resolves eliminations
- [ ] Win conditions are detected correctly
- [ ] All events are logged to GameResult
- [ ] 100% test coverage on core logic
- [ ] No framework dependencies

## Estimated Effort

- **Time:** 2-3 days
- **Files:** ~15 files
- **Tests:** ~30 test cases

## Next Milestone

After completion, proceed to [M2: Durable Object Wrapper](./02-durable-object.md).

