/**
 * Mock data fixtures for UI E2E tests.
 *
 * These fixtures match the real API response formats,
 * allowing realistic UI testing without backend calls.
 */

// =============================================================================
// GAMES DATA
// =============================================================================

export const MOCK_GAMES = {
  games: [
    {
      id: 'game-001-abc123',
      batch_id: 'batch-001',
      winner: 'mafia' as const,
      rounds: 4,
      duration_ms: 45000,
      total_tokens: 125000,
      persona_theme: 'noir' as const,
      status: 'completed' as const,
      created_at: Date.now() - 3600000,
      participants: [
        { model_id: 'anthropic/claude-3.5-sonnet', model_name: 'claude-3.5-sonnet', team: 'mafia' as const, player_count: 2, won: 1 },
        { model_id: 'openai/gpt-4o', model_name: 'gpt-4o', team: 'town' as const, player_count: 5, won: 0 },
      ],
    },
    {
      id: 'game-002-def456',
      batch_id: 'batch-001',
      winner: 'town' as const,
      rounds: 6,
      duration_ms: 78000,
      total_tokens: 189000,
      persona_theme: 'victorian' as const,
      status: 'completed' as const,
      created_at: Date.now() - 7200000,
      participants: [
        { model_id: 'google/gemini-2.5-pro', model_name: 'gemini-2.5-pro', team: 'mafia' as const, player_count: 2, won: 0 },
        { model_id: 'anthropic/claude-3.5-sonnet', model_name: 'claude-3.5-sonnet', team: 'town' as const, player_count: 5, won: 1 },
      ],
    },
    {
      id: 'game-003-ghi789',
      batch_id: 'batch-002',
      winner: 'town' as const,
      rounds: 5,
      duration_ms: 62000,
      total_tokens: 156000,
      persona_theme: 'modern' as const,
      status: 'completed' as const,
      created_at: Date.now() - 10800000,
      participants: [
        { model_id: 'openai/gpt-4o', model_name: 'gpt-4o', team: 'mafia' as const, player_count: 2, won: 0 },
        { model_id: 'google/gemini-2.5-pro', model_name: 'gemini-2.5-pro', team: 'town' as const, player_count: 5, won: 1 },
      ],
    },
  ],
  total: 3,
  hasMore: false,
};

export const MOCK_LIVE_GAMES = {
  games: [
    {
      id: 'game-live-001',
      batch_id: 'batch-live',
      winner: null,
      rounds: 2,
      duration_ms: 0,
      total_tokens: 45000,
      persona_theme: 'fantasy' as const,
      status: 'running' as const,
      created_at: Date.now() - 60000,
      participants: [
        { model_id: 'anthropic/claude-3.5-sonnet', model_name: 'claude-3.5-sonnet', team: 'mafia' as const, player_count: 2, won: 0 },
        { model_id: 'openai/gpt-4o', model_name: 'gpt-4o', team: 'town' as const, player_count: 5, won: 0 },
      ],
    },
  ],
  total: 1,
  hasMore: false,
};

// =============================================================================
// GAME DETAIL + TRANSCRIPT
// =============================================================================

export const MOCK_GAME_DETAIL = {
  id: 'game-001-abc123',
  batch_id: 'batch-001',
  winner: 'mafia' as const,
  rounds: 4,
  duration_ms: 45000,
  total_tokens: 125000,
  persona_theme: 'noir' as const,
  status: 'completed' as const,
  created_at: Date.now() - 3600000,
  config_hash: 'config-hash-abc',
  player_count: 7,
  mafia_count: 2,
  participants: [
    { model_id: 'anthropic/claude-3.5-sonnet', model_name: 'claude-3.5-sonnet', team: 'mafia' as const, player_count: 2, won: 1 },
    { model_id: 'openai/gpt-4o', model_name: 'gpt-4o', team: 'town' as const, player_count: 5, won: 0 },
  ],
  transcriptUrl: '/api/games/game-001-abc123/transcript',
};

export const MOCK_TRANSCRIPT = {
  gameId: 'game-001-abc123',
  events: [
    // Round 1 - Introduction
    {
      type: 'ai_call',
      phase: 'introduction',
      round: 1,
      playerId: 'player-1',
      playerName: 'Vincent',
      team: 'mafia',
      modelId: 'anthropic/claude-3.5-sonnet',
      response: { raw: '{"message": "Good evening, everyone. I\'m Vincent, a jazz club owner. I\'ve seen many dark nights in this city."}' },
    },
    {
      type: 'ai_call',
      phase: 'introduction',
      round: 1,
      playerId: 'player-2',
      playerName: 'Margaret',
      team: 'town',
      modelId: 'openai/gpt-4o',
      response: { raw: '{"message": "Hello, I\'m Margaret. I run the local bakery. Something feels wrong in our town lately."}' },
    },
    {
      type: 'ai_call',
      phase: 'introduction',
      round: 1,
      playerId: 'player-3',
      playerName: 'Thomas',
      team: 'town',
      modelId: 'openai/gpt-4o',
      response: { raw: '{"message": "I\'m Thomas, the town doctor. I\'ve dedicated my life to healing, but I fear darker times ahead."}' },
    },
    // Round 1 - Night Phase
    {
      type: 'ai_call',
      phase: 'night',
      round: 1,
      playerId: 'player-1',
      playerName: 'Vincent',
      team: 'mafia',
      modelId: 'anthropic/claude-3.5-sonnet',
      response: { raw: '{"action": "kill", "target": "player-2", "reasoning": "Margaret seems too observant for her own good."}' },
    },
    {
      type: 'elimination',
      phase: 'night',
      round: 1,
      playerId: 'player-2',
      playerName: 'Margaret',
      team: 'town',
    },
    // Round 2 - Day Discussion
    {
      type: 'ai_call',
      phase: 'day_discussion',
      round: 2,
      playerId: 'player-3',
      playerName: 'Thomas',
      team: 'town',
      modelId: 'openai/gpt-4o',
      response: { raw: '{"message": "Margaret is gone! We must find who did this. I noticed Vincent was acting strange last night."}' },
    },
    {
      type: 'ai_call',
      phase: 'day_discussion',
      round: 2,
      playerId: 'player-1',
      playerName: 'Vincent',
      team: 'mafia',
      modelId: 'anthropic/claude-3.5-sonnet',
      response: { raw: '{"message": "How dare you accuse me! I was at my club all night. Perhaps you\'re deflecting, Thomas."}' },
    },
    // Round 2 - Day Vote
    {
      type: 'ai_call',
      phase: 'day_vote',
      round: 2,
      playerId: 'player-3',
      playerName: 'Thomas',
      team: 'town',
      modelId: 'openai/gpt-4o',
      response: { raw: '{"vote": "player-1", "reasoning": "Vincent is too defensive. His alibi seems weak."}' },
    },
    {
      type: 'ai_call',
      phase: 'day_vote',
      round: 2,
      playerId: 'player-1',
      playerName: 'Vincent',
      team: 'mafia',
      modelId: 'anthropic/claude-3.5-sonnet',
      response: { raw: '{"vote": "player-3", "reasoning": "Thomas is trying to frame me. He must be eliminated."}' },
    },
    // Game End
    {
      type: 'game_end',
      winner: 'mafia',
      reason: 'Mafia has achieved numerical parity with Town',
      rounds: 4,
    },
  ],
};

// =============================================================================
// LEADERBOARD
// =============================================================================

export const MOCK_LEADERBOARD = {
  rankings: [
    {
      model_id: 'anthropic/claude-3.5-sonnet',
      display_name: 'Claude 3.5 Sonnet',
      provider: 'anthropic',
      team: 'mafia' as const,
      games_played: 45,
      games_won: 32,
      win_rate: 0.711,
      total_tokens: 2500000,
    },
    {
      model_id: 'openai/gpt-4o',
      display_name: 'GPT-4o',
      provider: 'openai',
      team: 'town' as const,
      games_played: 52,
      games_won: 35,
      win_rate: 0.673,
      total_tokens: 2800000,
    },
    {
      model_id: 'google/gemini-2.5-pro',
      display_name: 'Gemini 2.5 Pro',
      provider: 'google',
      team: 'mafia' as const,
      games_played: 38,
      games_won: 24,
      win_rate: 0.632,
      total_tokens: 1900000,
    },
    {
      model_id: 'anthropic/claude-3-opus',
      display_name: 'Claude 3 Opus',
      provider: 'anthropic',
      team: 'town' as const,
      games_played: 28,
      games_won: 17,
      win_rate: 0.607,
      total_tokens: 1600000,
    },
  ],
};

// =============================================================================
// STATS
// =============================================================================

export const MOCK_STATS_OVERVIEW = {
  totals: {
    games: 156,
    tokens: 15600000,
    mafiaWins: 72,
    townWins: 84,
    avgRounds: 4.8,
    avgDurationMs: 58000,
  },
  byProvider: [
    { provider: 'anthropic', games: 65, wins: 42, tokens: 6500000 },
    { provider: 'openai', games: 58, wins: 35, tokens: 5800000 },
    { provider: 'google', games: 33, wins: 19, tokens: 3300000 },
  ],
  topModels: [
    { model_id: 'anthropic/claude-3.5-sonnet', display_name: 'Claude 3.5 Sonnet', provider: 'anthropic', games: 45, wins: 32, win_rate: 0.711 },
    { model_id: 'openai/gpt-4o', display_name: 'GPT-4o', provider: 'openai', games: 52, wins: 35, win_rate: 0.673 },
    { model_id: 'google/gemini-2.5-pro', display_name: 'Gemini 2.5 Pro', provider: 'google', games: 38, wins: 24, win_rate: 0.632 },
  ],
};

export const MOCK_MATCHUPS = {
  matchups: [
    { model_a: 'anthropic/claude-3.5-sonnet', model_a_name: 'Claude 3.5 Sonnet', model_b: 'openai/gpt-4o', model_b_name: 'GPT-4o', games: 24, model_a_wins: 15 },
    { model_a: 'anthropic/claude-3.5-sonnet', model_a_name: 'Claude 3.5 Sonnet', model_b: 'google/gemini-2.5-pro', model_b_name: 'Gemini 2.5 Pro', games: 18, model_a_wins: 12 },
    { model_a: 'openai/gpt-4o', model_a_name: 'GPT-4o', model_b: 'google/gemini-2.5-pro', model_b_name: 'Gemini 2.5 Pro', games: 20, model_a_wins: 11 },
  ],
  selfPlay: [
    { model_id: 'anthropic/claude-3.5-sonnet', games: 12, mafia_wins: 5, town_wins: 7 },
    { model_id: 'openai/gpt-4o', games: 8, mafia_wins: 3, town_wins: 5 },
  ],
  models: [
    { id: 'anthropic/claude-3.5-sonnet', display_name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
    { id: 'openai/gpt-4o', display_name: 'GPT-4o', provider: 'openai' },
    { id: 'google/gemini-2.5-pro', display_name: 'Gemini 2.5 Pro', provider: 'google' },
  ],
  filter: { team: null },
};

// =============================================================================
// MODELS
// =============================================================================

export const MOCK_MODELS = {
  models: [
    { id: 'anthropic/claude-3.5-sonnet', provider: 'anthropic', display_name: 'Claude 3.5 Sonnet' },
    { id: 'openai/gpt-4o', provider: 'openai', display_name: 'GPT-4o' },
    { id: 'google/gemini-2.5-pro', provider: 'google', display_name: 'Gemini 2.5 Pro' },
    { id: 'anthropic/claude-3-opus', provider: 'anthropic', display_name: 'Claude 3 Opus' },
    { id: 'openai/gpt-4-turbo', provider: 'openai', display_name: 'GPT-4 Turbo' },
  ],
};


