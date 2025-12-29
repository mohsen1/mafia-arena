/**
 * Pre-configured game scenarios for E2E testing.
 *
 * These helpers configure ScriptedWorkerProvider instances to produce
 * deterministic game outcomes for testing specific scenarios.
 */

import {
  ScriptedWorkerProvider,
  createScriptedProviders,
} from './ScriptedWorkerProvider.js';

/**
 * Standard game configuration for tests.
 * 7 players: 2 mafia, 5 town (minimum valid configuration)
 * 
 * NOTE: Model IDs must start with 'test/' to be recognized as test models.
 * This disables suspense mode in GameRunner, allowing synchronous execution.
 */
export const STANDARD_GAME_CONFIG = {
  playerCount: 7,
  mafiaCount: 2,
  teams: [
    { modelId: 'test/model', team: 'mafia' as const, count: 2 },
    { modelId: 'test/model', team: 'town' as const, count: 5 },
  ],
  maxRounds: 10,
  discussionEnabled: false, // Faster tests
  personaConstraints: 'moderate' as const,
  seed: 12345, // Deterministic RNG
};

/**
 * Game config with discussion enabled (for discussion phase tests).
 * Inherits test/model from STANDARD_GAME_CONFIG.
 */
export const DISCUSSION_GAME_CONFIG = {
  ...STANDARD_GAME_CONFIG,
  discussionEnabled: true,
  dayDiscussionRounds: 1,
  nightDiscussionRounds: 1,
};

/**
 * Configure providers for a scenario where Town wins.
 *
 * Strategy:
 * - Town players all vote for the same mafia member
 * - Mafia votes are split (no coordination)
 * - Town eliminates mafia faster than mafia can kill
 */
export function setupTownWinsScenario(
  provider: ScriptedWorkerProvider
): void {
  // Reset any existing state
  provider.reset();

  // Set up default elimination votes to always target mafia (player_1 and player_2)
  // In a 7-player game with seed 12345, mafia are typically assigned first
  provider.setDefaultResponse('elimination_vote', {
    vote: 'player_1',
    reasoning: 'I suspect this player is mafia based on their behavior.',
  });

  // Mafia kill votes - target town members (player_3+)
  provider.setDefaultResponse('kill_vote', {
    target: 'player_3',
    reasoning: 'This town member seems most threatening.',
  });
}

/**
 * Configure providers for a scenario where Mafia wins.
 *
 * Strategy:
 * - Mafia coordinates on kills and votes
 * - Town votes are scattered
 */
export function setupMafiaWinsScenario(
  provider: ScriptedWorkerProvider
): void {
  provider.reset();

  // Town votes are split across different targets
  // This will cause ties and ineffective voting
  provider.setDefaultResponse('elimination_vote', {
    vote: null, // Abstain - leads to no elimination
    reasoning: 'I am not sure who to vote for.',
  });

  // Mafia coordinates kills effectively
  provider.setDefaultResponse('kill_vote', {
    target: 'player_3',
    reasoning: 'Coordinated attack on the most vocal town member.',
  });
}

/**
 * Configure provider for testing parse error recovery.
 *
 * Returns invalid JSON for the first N attempts, then valid JSON.
 * Tests AI provider parsing retry logic.
 */
export function setupParseErrorScenario(
  provider: ScriptedWorkerProvider,
  failedAttempts: number = 2
): void {
  provider.reset();

  // Queue invalid responses first
  for (let i = 0; i < failedAttempts; i++) {
    if (i === 0) {
      // First attempt: completely invalid JSON
      provider.queueRawResponse('This is not JSON at all!');
    } else {
      // Second attempt: invalid schema (missing required field)
      provider.queueAction('discussion', {
        wrong_field: 'no message field',
        extra: 123,
      });
    }
  }

  // Final attempt: valid response
  provider.queueAction('discussion', {
    message: 'Finally a valid response after retries!',
  });
}

/**
 * Configure provider for testing timeout/slow response scenarios.
 */
export function setupSlowResponseScenario(
  provider: ScriptedWorkerProvider,
  latencyMs: number = 5000
): void {
  provider.reset();

  // Queue a slow but valid response
  provider.queueAction(
    'discussion',
    { message: 'This response was slow but valid.' },
    { latencyMs }
  );
}

/**
 * Configure provider for testing high token usage scenarios.
 */
export function setupHighTokenScenario(
  provider: ScriptedWorkerProvider,
  inputTokens: number = 10000,
  outputTokens: number = 2000
): void {
  provider.reset();

  // Queue a response with high token usage
  provider.queueAction(
    'discussion',
    { message: 'A response with high token usage.' },
    { tokensUsed: { input: inputTokens, output: outputTokens } }
  );
}

/**
 * Create a provider map pre-configured for a specific scenario.
 */
export function createScenarioProviders(
  modelIds: string[],
  scenario: 'town_wins' | 'mafia_wins' | 'default'
): Map<string, ScriptedWorkerProvider> {
  const providers = createScriptedProviders(modelIds);

  for (const provider of providers.values()) {
    switch (scenario) {
      case 'town_wins':
        setupTownWinsScenario(provider);
        break;
      case 'mafia_wins':
        setupMafiaWinsScenario(provider);
        break;
      case 'default':
        // Use built-in defaults
        break;
    }
  }

  return providers;
}

/**
 * Shared provider instance for tests that use vi.mock().
 * This allows tests to configure the provider before running.
 */
let sharedProviders: Map<string, ScriptedWorkerProvider> | null = null;

/**
 * Set up shared providers for mocked factory.
 * Call this in beforeEach to configure providers for your test.
 */
export function setSharedProviders(
  providers: Map<string, ScriptedWorkerProvider>
): void {
  sharedProviders = providers;
}

/**
 * Get shared providers (used by mocked factory).
 */
export function getSharedProviders(): Map<string, ScriptedWorkerProvider> | null {
  return sharedProviders;
}

/**
 * Clear shared providers (call in afterEach).
 */
export function clearSharedProviders(): void {
  sharedProviders = null;
}

/**
 * Get or create a shared provider for a specific model.
 * Used by the mocked factory implementation.
 */
export function getOrCreateProvider(modelId: string): ScriptedWorkerProvider {
  if (!sharedProviders) {
    sharedProviders = new Map();
  }

  let provider = sharedProviders.get(modelId);
  if (!provider) {
    provider = new ScriptedWorkerProvider(modelId);
    sharedProviders.set(modelId, provider);
  }

  return provider;
}

