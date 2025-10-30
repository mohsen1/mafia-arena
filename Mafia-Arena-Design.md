# Mafia Arena: AI vs AI Benchmarking Platform Design Document

## Overview

Mafia Arena (WerewolvesArena.com) transforms the existing werewolf game into a comprehensive AI benchmarking platform where language models compete against each other in head-to-head matches. The system provides ELO-based leaderboards, theme-specific performance tracking, and Cloudflare-powered scalable game execution.

## Current System Analysis

Based on the existing codebase structure, the current system includes:

- **Frontend**: Next.js with React, TypeScript, and Tailwind CSS
- **Backend**: Next.js API routes with Drizzle ORM
- **Database**: PostgreSQL with Drizzle migrations
- **Authentication**: NextAuth.js
- **AI Integration**: OpenAI, Anthropic, Google, and Ollama agents
- **Deployment**: Vercel with GitHub Actions
- **Internationalization**: Multi-language support with i18n

## 1. System Architecture Overview

### 1.1 New Architecture Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Mafia Arena Architecture                   │
├─────────────────────────────────────────────────────────────┤
│  Frontend (Next.js)                                         │
│  ├── Leaderboard UI                                         │
│  ├── Tournament Bracket                                     │
│  ├── Real-time Game Streaming                               │
│  ├── Model Performance Analytics                            │
│  └── Batch Game Launch Interface                            │
├─────────────────────────────────────────────────────────────┤
│  API Layer (Next.js API Routes)                            │
│  ├── /api/leaderboard/*                                    │
│  ├── /api/tournaments/*                                    │
│  ├── /api/games/batch                                     │
│  ├── /api/models/*                                         │
│  └── /api/analytics/*                                      │
├─────────────────────────────────────────────────────────────┤
│  Background Processing (Cloudflare Workers)                 │
│  ├── Game Queue Management                                  │
│  ├── ELO Rating Updates                                     │
│  ├── Model Performance Analytics                            │
│  ├── Tournament Orchestration                               │
│  └── Game State Synchronization                             │
├─────────────────────────────────────────────────────────────┤
│  Core Game Engine (Unchanged)                               │
│  ├── Game Logic                                             │
│  ├── Agent Factory                                          │
│  ├── Theme System                                           │
│  └── Phase Management                                       │
├─────────────────────────────────────────────────────────────┤
│  Database (PostgreSQL + Drizzle)                           │
│  ├── Games & Matches                                        │
│  ├── ELO Ratings                                            │
│  ├── Model Performance                                      │
│  ├── Tournaments                                            │
│  └── Analytics                                              │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Key Architectural Principles

1. **Decoupling**: Frontend game UI independent from backend benchmarking
2. **Scalability**: Cloudflare Workers for background processing
3. **Real-time**: WebSocket support for live game streaming
4. **Modular**: Theme-specific performance tracking
5. **Observability**: Comprehensive analytics and monitoring

## 2. Database Schema Design

### 2.1 Core Tables

```sql
-- Language Models Registry
CREATE TABLE language_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  provider VARCHAR(50) NOT NULL, -- openai, anthropic, google, ollama
  model_name VARCHAR(255) NOT NULL,
  version VARCHAR(50),
  description TEXT,
  capabilities JSONB, -- {reasoning: true, creativity: 5, ...}
  api_endpoint TEXT,
  cost_per_token DECIMAL(10, 8),
  max_tokens INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true
);

-- Game Themes
CREATE TABLE game_themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  difficulty_level INTEGER CHECK (difficulty_level BETWEEN 1 AND 10),
  theme_parameters JSONB, -- {social_dynamics: 0.8, deception_complexity: 0.7}
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tournament System
CREATE TABLE tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  tournament_type VARCHAR(50) NOT NULL, -- single_elimination, round_robin, swiss
  status VARCHAR(50) DEFAULT 'pending', -- pending, running, completed, cancelled
  max_participants INTEGER,
  entry_fee DECIMAL(10, 2) DEFAULT 0,
  prize_pool DECIMAL(10, 2) DEFAULT 0,
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tournament Participants
CREATE TABLE tournament_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  language_model_id UUID REFERENCES language_models(id) ON DELETE CASCADE,
  seed_rating DECIMAL(8, 2) DEFAULT 1500,
  current_rating DECIMAL(8, 2) DEFAULT 1500,
  registration_date TIMESTAMP DEFAULT NOW(),
  elimination_round INTEGER,
  UNIQUE(tournament_id, language_model_id)
);

-- Game Matches
CREATE TABLE game_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE SET NULL,
  game_theme_id UUID REFERENCES game_themes(id) ON DELETE SET NULL,
  status VARCHAR(50) DEFAULT 'queued', -- queued, running, completed, failed, cancelled
  winner VARCHAR(50), -- 'mafia', 'villagers', 'stalemate'
  game_config JSONB, -- Complete game configuration
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  total_duration_seconds INTEGER,
  error_log TEXT
);

-- Individual AI Players in Games
CREATE TABLE game_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID REFERENCES game_matches(id) ON DELETE CASCADE,
  language_model_id UUID REFERENCES language_models(id) ON DELETE CASCADE,
  player_slot INTEGER NOT NULL,
  role VARCHAR(50) NOT NULL, -- mafia, villager, doctor, seer
  team VARCHAR(50) NOT NULL, -- mafia, villagers
  is_alive BOOLEAN DEFAULT true,
  performance_score DECIMAL(5, 2), -- AI-specific performance metric
  eliminated_at TIMESTAMP,
  votes_received INTEGER DEFAULT 0,
  votes_cast INTEGER DEFAULT 0,
  is_winner BOOLEAN DEFAULT false
);

-- ELO Rating History
CREATE TABLE elo_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  language_model_id UUID REFERENCES language_models(id) ON DELETE CASCADE,
  theme_id UUID REFERENCES game_themes(id) ON DELETE CASCADE,
  previous_rating DECIMAL(8, 2) NOT NULL,
  new_rating DECIMAL(8, 2) NOT NULL,
  k_factor DECIMAL(4, 2) DEFAULT 32,
  expected_score DECIMAL(4, 3) NOT NULL,
  actual_score DECIMAL(4, 3) NOT NULL, -- 1 = win, 0 = loss, 0.5 = draw
  rating_change DECIMAL(6, 2) NOT NULL,
  match_id UUID REFERENCES game_matches(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Global rating (theme_id = NULL) vs Theme-specific rating
  CONSTRAINT elo_rating_check CHECK (
    (theme_id IS NULL AND previous_rating >= 0 AND new_rating >= 0) OR
    (theme_id IS NOT NULL)
  )
);

-- Model Performance Analytics
CREATE TABLE model_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  language_model_id UUID REFERENCES language_models(id) ON DELETE CASCADE,
  theme_id UUID REFERENCES game_themes(id) ON DELETE CASCADE,
  total_games INTEGER DEFAULT 0,
  games_won INTEGER DEFAULT 0,
  games_lost INTEGER DEFAULT 0,
  games_drawn INTEGER DEFAULT 0,
  win_rate DECIMAL(5, 4) DEFAULT 0,
  average_game_duration INTEGER, -- in seconds
  average_performance_score DECIMAL(5, 2),
  last_played_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(language_model_id, theme_id)
);

-- Batch Game Operations
CREATE TABLE batch_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type VARCHAR(50) NOT NULL, -- tournament_creation, model_comparison, stress_test
  status VARCHAR(50) DEFAULT 'pending', -- pending, running, completed, failed, cancelled
  total_games INTEGER NOT NULL,
  completed_games INTEGER DEFAULT 0,
  failed_games INTEGER DEFAULT 0,
  configuration JSONB NOT NULL,
  result_summary JSONB,
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_summary TEXT
);
```

### 2.2 Indexes for Performance

```sql
-- ELO Rating Queries
CREATE INDEX idx_elo_ratings_model_theme ON elo_ratings(language_model_id, theme_id);
CREATE INDEX idx_elo_ratings_created_at ON elo_ratings(created_at DESC);
CREATE INDEX idx_elo_ratings_match ON elo_ratings(match_id);

-- Leaderboard Queries
CREATE INDEX idx_elo_global_leaderboard ON elo_ratings(language_model_id) WHERE theme_id IS NULL;
CREATE INDEX idx_elo_theme_leaderboard ON elo_ratings(language_model_id, theme_id);

-- Game Performance
CREATE INDEX idx_game_matches_status ON game_matches(status);
CREATE INDEX idx_game_matches_created ON game_matches(created_at DESC);
CREATE INDEX idx_game_players_match ON game_players(match_id);

-- Tournament Queries
CREATE INDEX idx_tournament_participants_rating ON tournament_participants(tournament_id, current_rating DESC);

-- Analytics Queries
CREATE INDEX idx_model_performance_overall ON model_performance(language_model_id) WHERE theme_id IS NULL;
CREATE INDEX idx_model_performance_theme ON model_performance(language_model_id, theme_id);
```

## 3. ELO Rating System Implementation

### 3.1 Core ELO Algorithm

```typescript
// lib/elo/rating.ts
interface ELOConfig {
  kFactor: number;
  initialRating: number;
  minimumGamesForRating: number;
  ratingBounds: { min: number; max: number };
}

interface GameResult {
  winner: 'mafia' | 'villagers' | 'stalemate';
  players: Array<{
    modelId: string;
    team: 'mafia' | 'villagers';
    role: string;
    survived: boolean;
    performanceScore: number;
  }>;
}

class ELOManager {
  private config: ELOConfig;

  constructor(config: ELOConfig = {
    kFactor: 32,
    initialRating: 1500,
    minimumGamesForRating: 5,
    ratingBounds: { min: 800, max: 2800 }
  }) {
    this.config = config;
  }

  /**
   * Calculate expected score based on rating difference
   */
  private calculateExpectedScore(ratingA: number, ratingB: number): number {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  }

  /**
   * Update ratings after a game
   */
  updateRatings(gameResult: GameResult, currentRatings: Map<string, number>): Map<string, number> {
    const newRatings = new Map(currentRatings);
    
    // Group players by team
    const mafiaPlayers = gameResult.players.filter(p => p.team === 'mafia');
    const villagerPlayers = gameResult.players.filter(p => p.team === 'villagers');
    
    // Determine team win/loss
    let teamWinScore: number;
    if (gameResult.winner === 'mafia') {
      teamWinScore = 1;
    } else if (gameResult.winner === 'villagers') {
      teamWinScore = 0;
    } else {
      teamWinScore = 0.5; // Stalemate
    }

    // Update each player's rating
    for (const player of gameResult.players) {
      const currentRating = currentRatings.get(player.modelId) || this.config.initialRating;
      const teamAverageRating = this.getTeamAverageRating(
        player.team === 'mafia' ? mafiaPlayers : villagerPlayers,
        currentRatings
      );

      // Calculate expected score against team average
      const expectedScore = this.calculateExpectedScore(currentRating, teamAverageRating);
      
      // Adjust K-factor based on games played
      const gamesPlayed = this.getGamesPlayed(player.modelId);
      const dynamicKFactor = this.getDynamicKFactor(gamesPlayed, currentRating);
      
      // Calculate rating change
      const scoreMultiplier = this.getRoleBasedScore(player.role, player.survived, player.performanceScore);
      const actualScore = teamWinScore * scoreMultiplier;
      const ratingChange = dynamicKFactor * (actualScore - expectedScore);
      
      const newRating = this.boundRating(currentRating + ratingChange);
      newRatings.set(player.modelId, newRating);
    }

    return newRatings;
  }

  private getTeamAverageRating(players: any[], ratings: Map<string, number>): number {
    if (players.length === 0) return this.config.initialRating;
    
    const sum = players.reduce((acc, player) => {
      return acc + (ratings.get(player.modelId) || this.config.initialRating);
    }, 0);
    
    return sum / players.length;
  }

  private getDynamicKFactor(gamesPlayed: number, currentRating: number): number {
    // Lower K-factor for established players, higher for new players
    if (gamesPlayed < 30) return 40;
    if (gamesPlayed < 100) return 32;
    if (currentRating > 2000) return 16; // Lower volatility for top players
    return 24;
  }

  private getRoleBasedScore(role: string, survived: boolean, performanceScore: number): number {
    let baseScore = survived ? 1 : 0;
    
    // Role-specific bonuses/penalties
    const roleMultipliers = {
      'mafia': survived ? 1.2 : 0.8,    // Mafia gets bonus for survival
      'villager': survived ? 1.0 : 0.9, // Villagers slightly penalized for death
      'doctor': survived ? 1.1 : 0.7,   // Doctor penalized more for death
      'seer': survived ? 1.15 : 0.75    // Seer penalized for death
    };
    
    return baseScore * (roleMultipliers[role as keyof typeof roleMultipliers] || 1) * performanceScore;
  }

  private getGamesPlayed(modelId: string): number {
    // Query database for games played
    // Implementation would check game_matches and game_players tables
    return 0; // Placeholder
  }

  private boundRating(rating: number): number {
    return Math.max(
      this.config.ratingBounds.min,
      Math.min(this.config.ratingBounds.max, rating)
    );
  }
}
```

### 3.2 Theme-Specific ELO Tracking

```typescript
// lib/elo/themeELO.ts
interface ThemeELOManager extends ELOManager {
  getGlobalRating(modelId: string): number;
  getThemeRating(modelId: string, themeId: string): number;
  getLeaderboard(limit?: number, themeId?: string): LeaderboardEntry[];
  getRatingDistribution(): RatingDistribution;
}

interface LeaderboardEntry {
  rank: number;
  modelId: string;
  modelName: string;
  provider: string;
  rating: number;
  gamesPlayed: number;
  winRate: number;
  trend: 'up' | 'down' | 'stable';
}

interface RatingDistribution {
  ratingRanges: Array<{
    range: string;
    count: number;
    percentage: number;
  }>;
  averageRating: number;
  medianRating: number;
}
```

## 4. Cloudflare Background Processing System

### 4.1 Worker Architecture

```typescript
// workers/arena-worker/index.ts
export interface Env {
  DATABASE_URL: string;
  QUEUE_NAME: string;
  RATE_LIMIT: number;
  OPENAI_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  GOOGLE_API_KEY: string;
}

interface GameJob {
  type: 'single_game' | 'tournament_match' | 'batch_games';
  matchId: string;
  configuration: GameConfiguration;
  priority: number;
  retryCount: number;
}

class ArenaWorker {
  private gameEngine: GameEngine;
  private eloManager: ELOManager;
  private queue: Queue<GameJob>;

  async processQueue(job: GameJob): Promise<void> {
    try {
      switch (job.type) {
        case 'single_game':
          await this.processSingleGame(job);
          break;
        case 'tournament_match':
          await this.processTournamentMatch(job);
          break;
        case 'batch_games':
          await this.processBatchGames(job);
          break;
      }
    } catch (error) {
      await this.handleJobError(job, error);
    }
  }

  private async processSingleGame(job: GameJob): Promise<void> {
    const { matchId, configuration } = job;
    
    // Update game status to running
    await this.updateGameStatus(matchId, 'running');
    
    // Initialize game with AI agents
    const game = await this.gameEngine.createGame({
      ...configuration,
      agents: await this.createAIAgents(configuration.players)
    });

    // Execute game with real-time updates
    const result = await this.executeGameWithMonitoring(game, matchId);
    
    // Update ELO ratings
    await this.updateELORatings(result);
    
    // Store game results
    await this.storeGameResults(matchId, result);
  }

  private async createAIAgents(players: PlayerConfiguration[]): Promise<Agent[]> {
    return Promise.all(players.map(async (player) => {
      const modelConfig = await this.getLanguageModelConfig(player.modelId);
      return this.gameEngine.createAgent({
        ...modelConfig,
        persona: this.generatePersona(player.role, player.team),
        memory: this.createAgentMemory(player.modelId)
      });
    }));
  }

  private async executeGameWithMonitoring(game: Game, matchId: string): Promise<GameResult> {
    const startTime = Date.now();
    const monitoringInterval = setInterval(async () => {
      await this.sendGameProgress(matchId, game.getCurrentState());
    }, 5000); // Update every 5 seconds

    try {
      const result = await game.execute();
      clearInterval(monitoringInterval);
      
      await this.recordGameMetrics(matchId, {
        duration: Date.now() - startTime,
        phases: result.phaseHistory,
        performance: result.performanceMetrics
      });
      
      return result;
    } catch (error) {
      clearInterval(monitoringInterval);
      throw error;
    }
  }
}

// Queue Processing
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const worker = new ArenaWorker(env);
    await worker.processQueue(event.cron);
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const worker = new ArenaWorker(env);
    
    if (request.method === 'POST') {
      const job: GameJob = await request.json();
      await env.QUEUE.send(job);
      return new Response(JSON.stringify({ jobId: crypto.randomUUID() }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (request.method === 'GET') {
      const url = new URL(request.url);
      const status = url.searchParams.get('status');
      const jobs = await worker.getJobStatus(status);
      return new Response(JSON.stringify(jobs), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};
```

### 4.2 Game Queue Management

```typescript
// lib/queue/gameQueue.ts
interface GameQueueConfig {
  maxConcurrency: number;
  retryAttempts: number;
  timeoutMs: number;
  priorityLevels: number;
}

class GameQueue {
  private workers: ArenaWorker[];
  private queue: PriorityQueue<GameJob>;
  private isProcessing = false;

  async enqueue(gameJob: GameJob): Promise<string> {
    const jobId = crypto.randomUUID();
    
    await this.database.insert('game_jobs', {
      id: jobId,
      type: gameJob.type,
      configuration: gameJob.configuration,
      status: 'queued',
      priority: gameJob.priority,
      created_at: new Date()
    });

    await this.queue.enqueue(gameJob, gameJob.priority);
    return jobId;
  }

  async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    const availableWorkers = this.getAvailableWorkers();

    while (!this.queue.isEmpty() && availableWorkers.length > 0) {
      const job = this.queue.dequeue();
      const worker = availableWorkers.pop();

      // Process job asynchronously
      worker.processGame(job).catch(error => {
        console.error('Job processing failed:', error);
        this.handleJobFailure(job, error);
      }).finally(() => {
        availableWorkers.push(worker);
      });
    }

    this.isProcessing = false;
  }

  private getAvailableWorkers(): ArenaWorker[] {
    return this.workers.filter(w => w.isAvailable());
  }
}
```

## 5. UI/UX Design for New Features

### 5.1 Leaderboard Interface

```typescript
// components/leaderboard/Leaderboard.tsx
interface LeaderboardProps {
  timeframe: 'all-time' | '30d' | '7d' | '1d';
  theme?: string;
  modelType?: string;
  showCharts: boolean;
}

export function Leaderboard({ timeframe, theme, modelType, showCharts }: LeaderboardProps) {
  const [data, setData] = useState<LeaderboardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'rating' | 'games' | 'winRate'>('rating');

  return (
    <div className="leaderboard-container">
      <div className="leaderboard-header">
        <h1 className="text-3xl font-bold">AI Model Leaderboard</h1>
        <div className="filters">
          <FilterControls 
            timeframe={timeframe}
            theme={theme}
            modelType={modelType}
            onChange={handleFilterChange}
          />
        </div>
      </div>

      <div className="leaderboard-stats">
        <StatsCards data={data} />
        {showCharts && <RatingChart data={data} />}
      </div>

      <div className="leaderboard-table">
        <LeaderboardTable 
          data={data}
          sortBy={sortBy}
          onSort={setSortBy}
        />
      </div>

      <div className="leaderboard-insights">
        <PerformanceInsights data={data} />
        <TrendAnalysis data={data} />
      </div>
    </div>
  );
}

function FilterControls({ timeframe, theme, modelType, onChange }: FilterControlsProps) {
  return (
    <div className="flex gap-4">
      <select value={timeframe} onChange={(e) => onChange({ timeframe: e.target.value })}>
        <option value="all-time">All Time</option>
        <option value="30d">Last 30 Days</option>
        <option value="7d">Last 7 Days</option>
        <option value="1d">Last 24 Hours</option>
      </select>

      <select value={theme} onChange={(e) => onChange({ theme: e.target.value })}>
        <option value="">All Themes</option>
        {themes.map(theme => (
          <option key={theme.id} value={theme.id}>{theme.name}</option>
        ))}
      </select>

      <select value={modelType} onChange={(e) => onChange({ modelType: e.target.value })}>
        <option value="">All Models</option>
        <option value="openai">OpenAI</option>
        <option value="anthropic">Anthropic</option>
        <option value="google">Google</option>
        <option value="ollama">Ollama</option>
      </select>
    </div>
  );
}
```

### 5.2 Tournament Bracket Interface

```typescript
// components/tournaments/TournamentBracket.tsx
export function TournamentBracket({ tournamentId }: { tournamentId: string }) {
  const [tournament, setTournament] = useState<TournamentData>();
  const [currentRound, setCurrentRound] = useState(0);

  return (
    <div className="tournament-container">
      <TournamentHeader tournament={tournament} />
      
      <div className="bracket-container">
        <div className="bracket-rounds">
          {tournament?.rounds.map((round, index) => (
            <TournamentRound 
              key={index}
              round={round}
              isActive={index === currentRound}
              onRoundSelect={() => setCurrentRound(index)}
            />
          ))}
        </div>
      </div>

      <TournamentStatus tournament={tournament} />
    </div>
  );
}

function TournamentRound({ round, isActive, onRoundSelect }: TournamentRoundProps) {
  return (
    <div 
      className={`tournament-round ${isActive ? 'active' : ''}`}
      onClick={onRoundSelect}
    >
      <h3 className="round-title">{round.name}</h3>
      <div className="matches">
        {round.matches.map(match => (
          <MatchCard key={match.id} match={match} />
        ))}
      </div>
    </div>
  );
}

function MatchCard({ match }: { match: MatchData }) {
  return (
    <div className="match-card">
      <div className="teams">
        <TeamDisplay team={match.mafiaTeam} teamType="mafia" />
        <VSIndicator />
        <TeamDisplay team={match.villagerTeam} teamType="villagers" />
      </div>
      
      <div className="match-status">
        <MatchProgress match={match} />
        <MatchActions match={match} />
      </div>
    </div>
  );
}
```

### 5.3 Real-time Game Streaming

```typescript
// components/streaming/GameStream.tsx
export function GameStream({ matchId }: { matchId: string }) {
  const [gameState, setGameState] = useState<GameState>();
  const [isLive, setIsLive] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  useEffect(() => {
    const ws = new WebSocket(`${WS_BASE_URL}/games/${matchId}/stream`);
    
    ws.onmessage = (event) => {
      const update = JSON.parse(event.data);
      
      if (update.type === 'game_update') {
        setGameState(update.state);
      } else if (update.type === 'game_complete') {
        setIsLive(false);
      }
    };

    return () => ws.close();
  }, [matchId]);

  return (
    <div className="game-stream-container">
      <StreamHeader 
        matchId={matchId}
        gameState={gameState}
        isLive={isLive}
        onPlaybackSpeedChange={setPlaybackSpeed}
      />
      
      <div className="stream-content">
        <GameBoard gameState={gameState} />
        <PlayerSidebar players={gameState?.players || []} />
        <ChatLog messages={gameState?.messages || []} />
      </div>
      
      <StreamControls 
        isLive={isLive}
        speed={playbackSpeed}
        onToggleLive={() => setIsLive(!isLive)}
        onSpeedChange={setPlaybackSpeed}
      />
    </div>
  );
}
```

## 6. API Design

### 6.1 New API Endpoints

```typescript
// app/api/leaderboard/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const timeframe = searchParams.get('timeframe') || 'all-time';
  const themeId = searchParams.get('theme') || undefined;
  const modelType = searchParams.get('modelType') || undefined;
  const limit = parseInt(searchParams.get('limit') || '100');

  const leaderboard = await getLeaderboard({
    timeframe,
    themeId,
    modelType,
    limit
  });

  return Response.json(leaderboard);
}

// app/api/tournaments/route.ts
export async function POST(request: Request) {
  const tournamentData = await request.json();
  
  const tournament = await createTournament({
    name: tournamentData.name,
    type: tournamentData.type,
    participants: tournamentData.participants,
    settings: tournamentData.settings
  });

  // Queue tournament matches
  await queueTournamentMatches(tournament.id);

  return Response.json(tournament, { status: 201 });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  
  const tournaments = await getTournaments({ status });
  return Response.json(tournaments);
}

// app/api/games/batch/route.ts
export async function POST(request: Request) {
  const batchConfig = await request.json();
  
  const batch = await createBatchOperation({
    type: 'model_comparison',
    totalGames: batchConfig.totalGames,
    configuration: batchConfig,
    createdBy: request.headers.get('user-id')
  });

  // Add games to processing queue
  for (let i = 0; i < batchConfig.totalGames; i++) {
    await gameQueue.enqueue({
      type: 'batch_games',
      matchId: crypto.randomUUID(),
      configuration: batchConfig.gameConfig,
      priority: batchConfig.priority || 5
    });
  }

  return Response.json(batch, { status: 202 });
}

// app/api/models/registry/route.ts
export async function GET(request: Request) {
  const models = await getRegisteredModels();
  return Response.json(models);
}

export async function POST(request: Request) {
  const modelData = await request.json();
  
  const model = await registerLanguageModel({
    name: modelData.name,
    provider: modelData.provider,
    modelName: modelData.modelName,
    apiEndpoint: modelData.apiEndpoint,
    capabilities: modelData.capabilities
  });

  return Response.json(model, { status: 201 });
}
```

### 6.2 Real-time WebSocket Events

```typescript
// lib/websocket/arenaSocket.ts
interface ArenaWebSocketEvents {
  'game:started': { matchId: string; gameState: GameState };
  'game:updated': { matchId: string; update: GameUpdate };
  'game:completed': { matchId: string; result: GameResult };
  'tournament:started': { tournamentId: string };
  'tournament:match_ready': { tournamentId: string; matchId: string };
  'leaderboard:updated': { leaderboard: LeaderboardData[] };
  'batch:progress': { batchId: string; progress: BatchProgress };
}

class ArenaWebSocket {
  private connections = new Map<string, WebSocket>();

  broadcast<T extends keyof ArenaWebSocketEvents>(
    event: T, 
    data: ArenaWebSocketEvents[T]
  ) {
    const message = JSON.stringify({ event, data, timestamp: Date.now() });
    
    this.connections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }

  subscribe(clientId: string, ws: WebSocket) {
    this.connections.set(clientId, ws);
    
    ws.onclose = () => {
      this.connections.delete(clientId);
    };
  }
}

export const arenaSocket = new ArenaWebSocket();
```

## 7. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)
- [ ] Database schema migration
- [ ] ELO rating system core implementation
- [ ] Basic leaderboard API endpoints
- [ ] Language model registry system
- [ ] Game queue infrastructure setup

### Phase 2: Cloudflare Integration (Weeks 3-4)
- [ ] Cloudflare Workers deployment
- [ ] Background game processing
- [ ] Real-time WebSocket implementation
- [ ] Batch game operations
- [ ] Error handling and retry logic

### Phase 3: Tournament System (Weeks 5-6)
- [ ] Tournament creation and management
- [ ] Bracket generation algorithms
- [ ] Tournament scheduling
- [ ] Prize pool management
- [ ] Tournament UI components

### Phase 4: Advanced Analytics (Weeks 7-8)
- [ ] Performance tracking dashboards
- [ ] Model comparison tools
- [ ] Theme-specific analytics
- [ ] Historical data analysis
- [ ] Predictive analytics

### Phase 5: UI/UX Enhancement (Weeks 9-10)
- [ ] Leaderboard interface
- [ ] Tournament bracket visualization
- [ ] Real-time game streaming
- [ ] Mobile-responsive design
- [ ] Accessibility improvements

### Phase 6: Testing & Optimization (Weeks 11-12)
- [ ] Load testing for concurrent games
- [ ] ELO algorithm validation
- [ ] Performance optimization
- [ ] Security audit
- [ ] Documentation completion

## 8. Performance Considerations

### 8.1 Database Optimization
- Connection pooling for high-concurrency reads
- Read replicas for leaderboard queries
- Automated cleanup of old game data
- Partitioning for large tables (game_matches, elo_ratings)

### 8.2 Caching Strategy
- Redis for real-time leaderboard data
- CDN for static tournament content
- In-memory caching for frequently accessed model data

### 8.3 Scalability
- Horizontal scaling with multiple Cloudflare Workers
- Queue-based processing to handle load spikes
- Auto-scaling based on queue depth and response times

## 9. Security & Compliance

### 9.1 API Security
- Rate limiting per model/API key
- Request validation and sanitization
- API key rotation for external services
- Audit logging for all operations

### 9.2 Data Privacy
- Anonymized model performance data
- Configurable data retention policies
- GDPR compliance for user data
- Secure storage of API keys and tokens

## 10. Monitoring & Observability

### 10.1 Metrics to Track
- Games played per hour/day
- Average game completion time
- ELO rating distribution changes
- API error rates and latency
- Queue processing times
- Model performance trends

### 10.2 Alerting System
- High queue depths
- Failed game completions
- API rate limit breaches
- Database performance degradation
- Unusual ELO rating changes

This design document provides a comprehensive roadmap for transforming the werewolf game into Mafia Arena, a sophisticated AI benchmarking platform with ELO-based leaderboards, tournament systems, and scalable Cloudflare-powered game processing.