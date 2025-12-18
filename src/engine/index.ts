/**
 * Mafia Arena Game Engine
 *
 * A pure TypeScript implementation of the Mafia social deduction game.
 * This engine has NO external dependencies and can be tested without mocking infrastructure.
 *
 * @example
 * ```typescript
 * import { Game, validateConfig } from '@mafia-arena/engine';
 *
 * const config = {
 *   playerCount: 7,
 *   mafiaCount: 2,
 *   teams: [
 *     { modelId: 'gpt-4o', team: 'mafia', count: 2 },
 *     { modelId: 'claude-3-5-sonnet', team: 'town', count: 5 },
 *   ],
 *   maxRounds: 10,
 *   discussionEnabled: true,
 * };
 *
 * const validation = validateConfig(config);
 * if (!validation.valid) {
 *   throw new Error(validation.errors.join(', '));
 * }
 *
 * const game = new Game(config, aiProvider);
 * const result = await game.run();
 *
 * console.log(`Winner: ${result.winner}`);
 * console.log(`Rounds: ${result.rounds}`);
 * ```
 */

// Main game class
export { Game, validateConfig, type GameOptions } from './Game.js';

// State management
export { GameState } from './GameState.js';

// Phase handlers
export {
  executeNightPhase,
  executeDiscussionPhase,
  executeVotePhase,
  type NightPhaseResult,
  type DiscussionPhaseResult,
  type VotePhaseResult,
} from './phases/index.js';

// Utilities
export { resolveVotes, getVoteCounts } from './utils/votes.js';
export { getVisibleState, getValidKillTargets, getValidEliminationTargets, formatPlayerList, formatPlayerListShuffled } from './utils/visibility.js';
export { checkWinCondition, explainWinCondition } from './utils/winCondition.js';
export { 
  SYSTEM_PROMPTS, 
  ACTION_PROMPTS, 
  PERSONA_PROMPTS, 
  generateNightContext, 
  formatPersona, 
  formatPlayersPersonas,
  formatFullGameHistory,
  formatVoteAnalysis,
  hasFullHistoryContext
} from './utils/prompts.js';
export { analyzePersonaConsistency, getModelConsistencyScore } from './utils/consistency.js';
export { createSeededRandom, createRandomGenerator, createDefaultRandomGenerator, generateSeed, type RandomGenerator } from './utils/random.js';
export { sanitizePersona, sanitizePersonaName, sanitizePersonaBackground, sanitizePersonaPersonality, containsDangerousPatterns } from './utils/sanitize.js';

// All types
export type {
  // Core types
  Team,
  Phase,
  Player,
  DeadPlayer,

  // Persona types
  Persona,
  PersonaConstraints,
  PersonaAnalysis,
  PlayerConsistencyScore,

  // Configuration
  GameConfig,
  TeamAssignment,
  ContextLevel,

  // Results
  GameResult,
  ParticipantResult,
  TokenUsage,

  // AI Provider interface
  AIProvider,
  AIContext,
  ActionPrompt,
  AIResponse,

  // Player actions
  PlayerAction,
  PersonaGenerationAction,
  IntroductionAction,
  KillVoteAction,
  DiscussionAction,
  EliminationVoteAction,

  // Visible state
  VisibleGameState,
  VisiblePlayer,
  VisibleDeadPlayer,
  ConversationMessage,
  VoteRecord,
  GameLogEntry,

  // Events
  GameEvent,
  PhaseStartEvent,
  PhaseEndEvent,
  PersonaGenerationEvent,
  AICallEvent,
  IntroductionEvent,
  DiscussionEvent,
  VoteEvent,
  EliminationEvent,
  GameEndEvent,
  AIParseErrorEvent,
} from './types.js';

