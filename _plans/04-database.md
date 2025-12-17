# Milestone 4: Database + Stats

## Objective

Implement the full D1 database schema, create aggregation queries for the leaderboard, and add a stats calculation system that updates after each game.

## Deliverables

1. **D1 Schema** (`/drizzle/schema.ts` or raw SQL)
   - Models table
   - Games table
   - Game participants table
   - Leaderboard table (materialized view)

2. **Database Service** (`/src/worker/db/`)
   - CRUD operations
   - Stats aggregation functions
   - Leaderboard queries

3. **Migrations** (`/drizzle/`)
   - Initial schema migration
   - Seed data for models

4. **Leaderboard API** (update `/src/worker/api/`)
   - `GET /api/leaderboard` endpoint
   - `GET /api/models` endpoint

## Schema Design

```sql
-- Models registry
CREATE TABLE models (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  display_name TEXT NOT NULL,
  config TEXT,  -- JSON string
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Game metadata
CREATE TABLE games (
  id TEXT PRIMARY KEY,
  batch_id TEXT,
  config_hash TEXT NOT NULL,
  player_count INTEGER NOT NULL,
  mafia_count INTEGER NOT NULL,
  winner TEXT NOT NULL CHECK (winner IN ('mafia', 'town')),
  rounds INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('running', 'completed', 'failed')),
  error_message TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Per-game participation (for detailed queries)
CREATE TABLE game_participants (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL REFERENCES models(id),
  team TEXT NOT NULL CHECK (team IN ('mafia', 'town')),
  player_count INTEGER NOT NULL,
  won INTEGER NOT NULL CHECK (won IN (0, 1))
);

-- Aggregated leaderboard (updated after each game)
CREATE TABLE leaderboard (
  model_id TEXT NOT NULL REFERENCES models(id),
  team TEXT NOT NULL CHECK (team IN ('mafia', 'town')),
  games_played INTEGER NOT NULL DEFAULT 0,
  games_won INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  avg_game_duration_ms INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (model_id, team)
);

-- Indexes
CREATE INDEX idx_games_created ON games(created_at DESC);
CREATE INDEX idx_games_batch ON games(batch_id);
CREATE INDEX idx_games_status ON games(status);
CREATE INDEX idx_participants_game ON game_participants(game_id);
CREATE INDEX idx_participants_model ON game_participants(model_id);
```

## Database Service

```typescript
// src/worker/db/service.ts

export class DatabaseService {
  constructor(private db: D1Database) {}

  // === MODELS ===
  
  async getModels(): Promise<Model[]> {
    const result = await this.db
      .prepare('SELECT * FROM models ORDER BY display_name')
      .all<Model>();
    return result.results;
  }

  async getModel(id: string): Promise<Model | null> {
    return this.db
      .prepare('SELECT * FROM models WHERE id = ?')
      .bind(id)
      .first<Model>();
  }

  // === GAMES ===

  async createGame(game: NewGame): Promise<void> {
    await this.db.prepare(`
      INSERT INTO games (id, batch_id, config_hash, player_count, mafia_count, 
                         winner, rounds, duration_ms, total_tokens, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      game.id,
      game.batchId,
      game.configHash,
      game.playerCount,
      game.mafiaCount,
      game.winner,
      game.rounds,
      game.durationMs,
      game.totalTokens,
      'completed'
    ).run();
  }

  async createParticipants(gameId: string, participants: Participant[]): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO game_participants (id, game_id, model_id, team, player_count, won)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    await this.db.batch(
      participants.map(p => stmt.bind(
        crypto.randomUUID(),
        gameId,
        p.modelId,
        p.team,
        p.playerCount,
        p.won ? 1 : 0
      ))
    );
  }

  async getGames(options: { limit: number; offset: number; status?: string }): Promise<{
    games: Game[];
    total: number;
  }> {
    let whereClause = '';
    const params: any[] = [];

    if (options.status) {
      whereClause = 'WHERE status = ?';
      params.push(options.status);
    }

    const countResult = await this.db
      .prepare(`SELECT COUNT(*) as count FROM games ${whereClause}`)
      .bind(...params)
      .first<{ count: number }>();

    const gamesResult = await this.db
      .prepare(`
        SELECT * FROM games ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `)
      .bind(...params, options.limit, options.offset)
      .all<Game>();

    return {
      games: gamesResult.results,
      total: countResult?.count ?? 0,
    };
  }

  async getGame(id: string): Promise<GameWithParticipants | null> {
    const game = await this.db
      .prepare('SELECT * FROM games WHERE id = ?')
      .bind(id)
      .first<Game>();

    if (!game) return null;

    const participants = await this.db
      .prepare(`
        SELECT gp.*, m.display_name as model_name
        FROM game_participants gp
        JOIN models m ON gp.model_id = m.id
        WHERE gp.game_id = ?
      `)
      .bind(id)
      .all<ParticipantWithModel>();

    return { ...game, participants: participants.results };
  }

  // === LEADERBOARD ===

  async updateLeaderboard(gameResult: GameResult): Promise<void> {
    // For each participating model, update their stats
    for (const participant of gameResult.participants) {
      await this.db.prepare(`
        INSERT INTO leaderboard (model_id, team, games_played, games_won, total_tokens, updated_at)
        VALUES (?, ?, 1, ?, ?, unixepoch())
        ON CONFLICT (model_id, team) DO UPDATE SET
          games_played = games_played + 1,
          games_won = games_won + excluded.games_won,
          total_tokens = total_tokens + excluded.total_tokens,
          updated_at = unixepoch()
      `).bind(
        participant.modelId,
        participant.team,
        participant.won ? 1 : 0,
        participant.tokensUsed
      ).run();
    }
  }

  async getLeaderboard(team?: 'mafia' | 'town'): Promise<LeaderboardEntry[]> {
    let query = `
      SELECT 
        l.*,
        m.display_name,
        m.provider,
        CASE WHEN l.games_played > 0 
          THEN CAST(l.games_won AS REAL) / l.games_played 
          ELSE 0 
        END as win_rate
      FROM leaderboard l
      JOIN models m ON l.model_id = m.id
    `;

    if (team) {
      query += ` WHERE l.team = ?`;
    }

    query += ` ORDER BY win_rate DESC, games_played DESC`;

    const result = team
      ? await this.db.prepare(query).bind(team).all<LeaderboardEntry>()
      : await this.db.prepare(query).all<LeaderboardEntry>();

    return result.results;
  }
}
```

## API Endpoints

### GET /api/leaderboard

```typescript
// src/worker/api/leaderboard.ts

export async function getLeaderboard(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const team = url.searchParams.get('team') as 'mafia' | 'town' | null;

  const db = new DatabaseService(env.DB);
  const rankings = await db.getLeaderboard(team ?? undefined);

  return Response.json({ rankings });
}
```

**Response:**
```json
{
  "rankings": [
    {
      "model_id": "gpt-4o",
      "display_name": "GPT-4o",
      "provider": "openai",
      "team": "mafia",
      "games_played": 45,
      "games_won": 32,
      "win_rate": 0.711,
      "total_tokens": 125000
    }
  ]
}
```

### GET /api/models

```typescript
export async function getModels(request: Request, env: Env): Promise<Response> {
  const db = new DatabaseService(env.DB);
  const models = await db.getModels();

  return Response.json({ models });
}
```

## Seed Data

```sql
-- Initial models
INSERT INTO models (id, provider, display_name) VALUES
  ('gpt-4o', 'openai', 'GPT-4o'),
  ('gpt-4o-mini', 'openai', 'GPT-4o Mini'),
  ('claude-3-5-sonnet', 'anthropic', 'Claude 3.5 Sonnet'),
  ('claude-3-haiku', 'anthropic', 'Claude 3 Haiku'),
  ('gemini-1.5-pro', 'google', 'Gemini 1.5 Pro'),
  ('gemini-1.5-flash', 'google', 'Gemini 1.5 Flash');
```

## File Structure

```
/src/worker/
├── db/
│   ├── service.ts        # DatabaseService class
│   ├── types.ts          # DB types
│   └── migrations/
│       └── 0001_initial.sql
├── api/
│   ├── leaderboard.ts    # Leaderboard endpoint
│   └── models.ts         # Models endpoint
```

## Acceptance Criteria

- [ ] D1 schema is created with all tables
- [ ] Models are seeded in the database
- [ ] Game results are persisted correctly
- [ ] Leaderboard updates after each game
- [ ] `GET /api/leaderboard` returns ranked models
- [ ] `GET /api/leaderboard?team=mafia` filters by team
- [ ] `GET /api/models` returns all models
- [ ] Win rate calculation is correct

## Deploy Checklist

1. Create migration: `wrangler d1 migrations create mafia-arena initial`
2. Apply migration: `wrangler d1 migrations apply mafia-arena`
3. Seed models: `wrangler d1 execute mafia-arena --file=./seed.sql`
4. Deploy: `wrangler deploy`

## Estimated Effort

- **Time:** 1-2 days
- **Files:** ~5 new files
- **Deploy:** Schema + API update

## Next Milestone

After completion, proceed to [M5: Frontend MVP](./05-frontend.md).

