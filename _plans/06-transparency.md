# Milestone 6: Full Transparency

## Objective

Add complete visibility into AI behavior by displaying prompts, responses, and token usage in game replays. This is the "full debug" mode that makes the benchmark auditable.

## Deliverables

1. **Game Replay Page** (`/games/:id/replay`)
   - Timeline view of all game events
   - Expandable AI call details
   - Token usage breakdown

2. **Transcript Viewer Component**
   - Phase-by-phase navigation
   - Syntax highlighting for prompts
   - Collapsible sections

3. **R2 Integration**
   - Fetch transcripts from R2
   - Streaming for large files

## Page Design

### Game Replay (`/games/:id/replay`)

```
┌─────────────────────────────────────────────────────────────────┐
│  MAFIA ARENA                                    [Games] [About] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Game #abc123 Replay                                            │
│  GPT-4o (Mafia) vs Claude 3.5 Sonnet (Town)                     │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Round 1 │ Round 2 │ Round 3 │ Round 4                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ═══════════════════════════════════════════════════════════   │
│  🌙 NIGHT PHASE                                                 │
│  ═══════════════════════════════════════════════════════════   │
│                                                                 │
│  ▼ Player 1 (GPT-4o, Mafia) - Kill Vote                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ SYSTEM PROMPT                                            │   │
│  │ ──────────────────────────────────────────────────────── │   │
│  │ You are playing Mafia. You are a MAFIA member.           │   │
│  │ Your goal is to eliminate all Town members...            │   │
│  │                                                          │   │
│  │ USER PROMPT                                              │   │
│  │ ──────────────────────────────────────────────────────── │   │
│  │ It's night. Choose a player to kill.                     │   │
│  │ Alive players: Player 2, Player 3, Player 4...           │   │
│  │                                                          │   │
│  │ RESPONSE                                          1.2s   │   │
│  │ ──────────────────────────────────────────────────────── │   │
│  │ { "action": "kill", "target": "player_3",                │   │
│  │   "reasoning": "Player 3 has been asking too many..." }  │   │
│  │                                                          │   │
│  │ Tokens: 523 in / 87 out │ Cost: $0.0012                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ▶ Player 2 (GPT-4o, Mafia) - Kill Vote                        │
│                                                                 │
│  ═══════════════════════════════════════════════════════════   │
│  ☀️ DAY PHASE - Discussion                                      │
│  ═══════════════════════════════════════════════════════════   │
│                                                                 │
│  ▶ Player 3 (Claude, Town) - Discussion                        │
│  ▶ Player 4 (Claude, Town) - Discussion                        │
│  ...                                                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Transcript Schema

```typescript
// Stored in R2: /games/{id}/transcript.json

interface GameTranscript {
  gameId: string;
  config: GameConfig;
  events: GameEvent[];
  result: GameResult;
  metadata: {
    totalTokens: { input: number; output: number };
    totalCost: number;
    durationMs: number;
  };
}

type GameEvent =
  | PhaseStartEvent
  | AICallEvent
  | ActionEvent
  | EliminationEvent
  | PhaseEndEvent;

interface AICallEvent {
  type: 'ai_call';
  timestamp: number;
  round: number;
  phase: 'night' | 'day_discussion' | 'day_vote';
  playerId: string;
  playerName: string;
  modelId: string;
  team: 'mafia' | 'town';
  actionType: 'kill_vote' | 'discussion' | 'elimination_vote';
  prompt: {
    system: string;
    user: string;
  };
  response: {
    raw: string;
    parsed: PlayerAction;
  };
  tokens: {
    input: number;
    output: number;
  };
  latencyMs: number;
  cost: number;
}
```

## Components

### Timeline Component

```astro
---
// src/components/Timeline.astro
interface Props {
  events: GameEvent[];
  currentRound: number;
}

const { events, currentRound } = Astro.props;
const roundEvents = events.filter(e => e.round === currentRound);
---

<div class="timeline">
  {roundEvents.map(event => (
    event.type === 'ai_call' ? (
      <AICallCard event={event} />
    ) : event.type === 'phase_start' ? (
      <PhaseHeader phase={event.phase} />
    ) : null
  ))}
</div>
```

### AI Call Card

```astro
---
// src/components/AICallCard.astro
interface Props {
  event: AICallEvent;
}

const { event } = Astro.props;
const isExpanded = false; // Client-side state
---

<details class="ai-call-card">
  <summary>
    <span class="player">
      {event.playerName} ({event.modelId}, {event.team})
    </span>
    <span class="action-type">{event.actionType}</span>
    <span class="latency">{event.latencyMs}ms</span>
  </summary>
  
  <div class="prompt-section">
    <h4>System Prompt</h4>
    <pre><code>{event.prompt.system}</code></pre>
  </div>
  
  <div class="prompt-section">
    <h4>User Prompt</h4>
    <pre><code>{event.prompt.user}</code></pre>
  </div>
  
  <div class="response-section">
    <h4>Response</h4>
    <pre><code>{event.response.raw}</code></pre>
  </div>
  
  <div class="meta">
    <span>Tokens: {event.tokens.input} in / {event.tokens.output} out</span>
    <span>Cost: ${event.cost.toFixed(4)}</span>
  </div>
</details>

<style>
  .ai-call-card {
    border: 1px solid var(--border);
    border-radius: 4px;
    margin: 0.5rem 0;
  }
  
  summary {
    padding: 0.75rem 1rem;
    cursor: pointer;
    display: flex;
    gap: 1rem;
  }
  
  .prompt-section, .response-section {
    padding: 1rem;
    border-top: 1px solid var(--border);
  }
  
  pre {
    background: #111;
    padding: 1rem;
    border-radius: 4px;
    overflow-x: auto;
    font-size: 0.875rem;
  }
  
  .meta {
    padding: 0.5rem 1rem;
    background: #111;
    display: flex;
    gap: 2rem;
    font-size: 0.75rem;
    color: var(--muted);
  }
</style>
```

## R2 Fetching

```typescript
// src/lib/transcript.ts

export async function getTranscript(gameId: string): Promise<GameTranscript> {
  const url = `${import.meta.env.R2_PUBLIC_URL}/games/${gameId}/transcript.json`;
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Transcript not found: ${gameId}`);
  }
  
  return response.json();
}
```

## Cost Calculation

```typescript
// src/lib/costs.ts

const PRICING = {
  'gpt-4o': { input: 0.005, output: 0.015 },        // per 1K tokens
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'claude-3-5-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  'gemini-1.5-pro': { input: 0.00125, output: 0.005 },
  'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },
};

export function calculateCost(modelId: string, tokens: { input: number; output: number }): number {
  const pricing = PRICING[modelId] || { input: 0.01, output: 0.03 };
  return (tokens.input / 1000) * pricing.input + (tokens.output / 1000) * pricing.output;
}
```

## File Structure

```
/src/pages/
├── games/
│   ├── [id].astro        # Game overview
│   └── [id]/
│       └── replay.astro  # Full replay

/src/components/
├── Timeline.astro
├── AICallCard.astro
├── PhaseHeader.astro
├── RoundNav.astro
└── TokenStats.astro

/src/lib/
├── transcript.ts         # R2 fetching
└── costs.ts              # Cost calculation
```

## Acceptance Criteria

- [ ] Game replay page loads transcript from R2
- [ ] Events are grouped by round and phase
- [ ] AI calls are expandable with full details
- [ ] Prompts are syntax highlighted
- [ ] Token counts and costs are displayed
- [ ] Round navigation works
- [ ] Large transcripts don't block page load

## R2 Public Access Setup

```toml
# wrangler.toml

[[r2_buckets]]
binding = "TRANSCRIPTS"
bucket_name = "mafia-arena-transcripts"
preview_bucket_name = "mafia-arena-transcripts-preview"

# Enable public access for transcripts
[env.production.r2_buckets]
TRANSCRIPTS = { bucket_name = "mafia-arena-transcripts" }
```

Public URL pattern: `https://pub-{hash}.r2.dev/games/{id}/transcript.json`

## Estimated Effort

- **Time:** 2-3 days
- **Files:** ~10 files
- **Deploy:** Pages update

## Next Milestone

After completion, proceed to [M7: Polish + Deploy](./07-polish-deploy.md).

