/**
 * Introduction Phase Handler
 * All players generate personas (if enabled) and introduce themselves at the start of the game.
 */

import type { GameState } from '../GameState.js';
import type {
  AIProvider,
  AICallEvent,
  IntroductionEvent,
  PersonaGenerationEvent,
  PhaseEndEvent,
  ConversationMessage,
  Player,
} from '../types.js';
import { getVisibleState } from '../utils/visibility.js';
import { SYSTEM_PROMPTS, ACTION_PROMPTS, PERSONA_PROMPTS } from '../utils/prompts.js';
import { sanitizePersona } from '../utils/sanitize.js';
import { getUniqueAssignments } from '../utils/game-presets.js';
import { ensurePhaseStart } from '../utils/idempotency.js';

export interface IntroductionPhaseResult {
  readonly state: GameState;
  readonly messages: readonly ConversationMessage[];
}

/**
 * Generate personas for all players in PARALLEL for faster execution.
 * This significantly reduces wall-clock time for persona generation.
 * 
 * Uses pre-assigned names and archetypes to ensure:
 * - Unique names (no "Vesper-2" duplicates)
 * - Diverse personalities (prevents "Analytical Phalanx")
 * - Consistent character development
 */
async function generatePersonas(
  initialState: GameState,
  aiProvider: AIProvider,
  players: readonly Player[]
): Promise<GameState> {
  let state = initialState;
  const personaConstraints = state.config.personaConstraints ?? 'moderate';
  const playerCount = players.length;
  const personaTheme = state.config.personaTheme ?? 'noir';

  // Pre-assign unique names and archetypes using seeded RNG for reproducibility
  const assignments = getUniqueAssignments(playerCount, personaTheme, state.rng);

  // Generate all persona requests in parallel
  const personaPromises = players.map(async (player, index) => {
    const assignment = assignments[index];
    const visibleState = getVisibleState(state, player);

    // Generate appropriate system prompt based on team
    const systemPrompt =
      player.team === 'mafia'
        ? SYSTEM_PROMPTS.mafia(
            state.aliveMafia
              .filter((p) => p.id !== player.id)
              .map((p) => p.name)
          )
        : SYSTEM_PROMPTS.town();

    // Use persona generation prompt with pre-assigned name and archetype
    const userPrompt =
      player.team === 'mafia'
        ? PERSONA_PROMPTS.mafia(personaConstraints, playerCount, assignment)
        : PERSONA_PROMPTS.town(personaConstraints, playerCount, assignment);

    const response = await aiProvider.getAction(
      {
        gameId: state.gameId,
        playerId: player.id,
        playerName: player.name,
        modelId: player.modelId,
        team: player.team,
        phase: 'introduction',
        round: state.round,
        visibleState,
      },
      {
        type: 'persona_generation',
        systemPrompt,
        userPrompt,
      }
    );

    return { player, response, systemPrompt, userPrompt, assignment };
  });

  // Wait for all persona generations to complete
  const results = await Promise.all(personaPromises);

  // Process results sequentially to maintain state consistency
  for (const { player, response, systemPrompt, userPrompt, assignment } of results) {
    // Record the AI call event
    const aiCallEvent: AICallEvent = {
      type: 'ai_call',
      phase: 'introduction',
      round: state.round,
      playerId: player.id,
      playerName: player.name,
      modelId: player.modelId,
      team: player.team,
      actionType: 'persona_generation',
      prompt: {
        system: systemPrompt,
        user: userPrompt,
      },
      response: {
        raw: response.rawResponse,
        parsed: response.action,
      },
      tokensUsed: response.tokensUsed,
      latencyMs: response.latencyMs,
      timestamp: Date.now(),
    };
    state = state.withEvent(aiCallEvent);

    // Parse and store the persona
    // Note: GameAIAdapter guarantees persona_generation type via zod validation
    if (response.action.type === 'persona_generation' && assignment) {
      const rawPersona = response.action.persona;
      
      // Use PRE-ASSIGNED name and occupation from archetype to ensure uniqueness
      // AI only generates background and personality (which are constrained by archetype)
      const personaInput: {
        name: string;
        background: string;
        personality: string;
        occupation?: string;
      } = {
        name: assignment.name, // Use pre-assigned name (guaranteed unique)
        background: rawPersona.background, // AI-generated background
        personality: rawPersona.personality, // AI-generated personality
        occupation: assignment.archetype.role, // Use archetype role
      };
      
      const persona = sanitizePersona(personaInput);
      state = state.withPlayerPersona(player.id, persona);

      const personaEvent: PersonaGenerationEvent = {
        type: 'persona_generation',
        round: state.round,
        playerId: player.id,
        playerName: persona.name,
        persona,
        timestamp: Date.now(),
      };
      state = state.withEvent(personaEvent);
    }
  }

  return state;
}

/**
 * Execute the introduction phase.
 * Each player introduces themselves at the start of the game.
 */
export async function executeIntroductionPhase(
  initialState: GameState,
  aiProvider: AIProvider
): Promise<IntroductionPhaseResult> {
  let state = initialState.withPhase('introduction');
  // Use seeded RNG for reproducible player order
  const alivePlayers = state.rng.shuffled(state.alivePlayers);
  const messages: ConversationMessage[] = [];
  const playerCount = alivePlayers.length;

  // Helper to emit events (Introduction phase doesn't stream, so just adds to state)
  const emitEvent = async (event: import('../types.js').GameEvent): Promise<void> => {
    state = state.withEvent(event);
  };

  // Idempotent phase start - only emits if not already emitted
  await ensurePhaseStart(state, 'introduction', emitEvent);

  // Generate personas for all players
  state = await generatePersonas(state, aiProvider, alivePlayers);

  // Re-fetch players after persona generation (names may have changed)
  const playersForIntro = alivePlayers.map(p => state.getPlayer(p.id)!).filter(Boolean);

  // Generate all introduction requests in PARALLEL for faster execution
  const introPromises = playersForIntro.map(async (player) => {
    const visibleState = getVisibleState(state, player);

    // Generate appropriate system prompt based on team
    const systemPrompt =
      player.team === 'mafia'
        ? SYSTEM_PROMPTS.mafia(
            state.aliveMafia
              .filter((p) => p.id !== player.id)
              .map((p) => p.name)
          )
        : SYSTEM_PROMPTS.town();

    // Use introduction-specific prompts (with persona if available)
    const userPrompt =
      player.team === 'mafia'
        ? ACTION_PROMPTS.introductionMafia(player.name, playerCount, player.persona)
        : ACTION_PROMPTS.introductionTown(player.name, playerCount, player.persona);

    const response = await aiProvider.getAction(
      {
        gameId: state.gameId,
        playerId: player.id,
        playerName: player.name,
        modelId: player.modelId,
        team: player.team,
        phase: 'introduction',
        round: state.round,
        visibleState,
      },
      {
        type: 'introduction',
        systemPrompt,
        userPrompt,
      }
    );

    return { player, response, systemPrompt, userPrompt };
  });

  // Wait for all introductions to complete
  const introResults = await Promise.all(introPromises);

  // Process results sequentially to maintain message order consistency
  for (const { player, response, systemPrompt, userPrompt } of introResults) {
    // Record the AI call event
    const aiCallEvent: AICallEvent = {
      type: 'ai_call',
      phase: 'introduction',
      round: state.round,
      playerId: player.id,
      playerName: player.name,
      modelId: player.modelId,
      team: player.team,
      actionType: 'introduction',
      prompt: {
        system: systemPrompt,
        user: userPrompt,
      },
      response: {
        raw: response.rawResponse,
        parsed: response.action,
      },
      tokensUsed: response.tokensUsed,
      latencyMs: response.latencyMs,
      timestamp: Date.now(),
    };
    state = state.withEvent(aiCallEvent);

    // Extract and record the introduction message
    if (response.action.type === 'introduction') {
      const message: ConversationMessage = {
        playerId: player.id,
        playerName: player.name,
        message: response.action.message,
        round: state.round,
      };

      messages.push(message);
      state = state.withConversationMessage(message);

      const introductionEvent: IntroductionEvent = {
        type: 'introduction',
        round: state.round,
        playerId: player.id,
        playerName: player.name,
        message: response.action.message,
        timestamp: Date.now(),
      };
      state = state.withEvent(introductionEvent);
    }
  }

  // Add phase end event
  const phaseEndEvent: PhaseEndEvent = {
    type: 'phase_end',
    phase: 'introduction',
    round: state.round,
    timestamp: Date.now(),
  };
  state = state.withEvent(phaseEndEvent);

  return { state, messages };
}
