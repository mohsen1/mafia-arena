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
  PhaseStartEvent,
  PhaseEndEvent,
  ConversationMessage,
  Persona,
  Player,
} from '../types.js';
import { getVisibleState } from '../utils/visibility.js';
import { SYSTEM_PROMPTS, ACTION_PROMPTS, PERSONA_PROMPTS } from '../utils/prompts.js';
import { sanitizePersona } from '../utils/sanitize.js';

export interface IntroductionPhaseResult {
  readonly state: GameState;
  readonly messages: readonly ConversationMessage[];
}

/**
 * Parse persona from AI response.
 */
function parsePersona(rawResponse: string): Persona | null {
  try {
    const parsed = JSON.parse(rawResponse);
    if (parsed.name && parsed.background && parsed.personality) {
      // Sanitize to prevent prompt injection
      return sanitizePersona({
        name: parsed.name,
        background: parsed.background,
        personality: parsed.personality,
        occupation: parsed.occupation,
      });
    }
  } catch {
    // Try to extract from malformed JSON
    const nameMatch = rawResponse.match(/"name"\s*:\s*"([^"]+)"/);
    const backgroundMatch = rawResponse.match(/"background"\s*:\s*"([^"]+)"/);
    const personalityMatch = rawResponse.match(/"personality"\s*:\s*"([^"]+)"/);
    
    if (nameMatch && backgroundMatch && personalityMatch) {
      // Sanitize to prevent prompt injection
      return sanitizePersona({
        name: nameMatch[1]!,
        background: backgroundMatch[1]!,
        personality: personalityMatch[1]!,
      });
    }
  }
  return null;
}

/**
 * Ensure persona name is unique by adding suffix if needed.
 */
function ensureUniqueName(name: string, usedNames: Set<string>): string {
  if (!usedNames.has(name.toLowerCase())) {
    return name;
  }
  // Add numeric suffix to make unique
  let suffix = 2;
  while (usedNames.has(`${name.toLowerCase()}-${suffix}`)) {
    suffix++;
  }
  return `${name}-${suffix}`;
}

/**
 * Generate personas for all players.
 */
async function generatePersonas(
  initialState: GameState,
  aiProvider: AIProvider,
  players: readonly Player[]
): Promise<GameState> {
  let state = initialState;
  const personaConstraints = state.config.personaConstraints ?? 'moderate';
  const playerCount = players.length;
  const usedNames = new Set<string>();

  for (const player of players) {
    const visibleState = getVisibleState(state, player);
    
    // Get list of already taken names to tell the LLM
    const takenNames = Array.from(usedNames);

    // Generate appropriate system prompt based on team
    const systemPrompt =
      player.team === 'mafia'
        ? SYSTEM_PROMPTS.mafia(
            state.aliveMafia
              .filter((p) => p.id !== player.id)
              .map((p) => p.name)
          )
        : SYSTEM_PROMPTS.town();

    // Use persona generation prompt with taken names
    const userPrompt =
      player.team === 'mafia'
        ? PERSONA_PROMPTS.mafia(personaConstraints, playerCount, takenNames)
        : PERSONA_PROMPTS.town(personaConstraints, playerCount, takenNames);

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
    if (response.action.type === 'persona_generation') {
      let persona = response.action.persona;
      // Ensure unique name
      const uniqueName = ensureUniqueName(persona.name, usedNames);
      usedNames.add(uniqueName.toLowerCase());
      
      if (uniqueName !== persona.name) {
        persona = { ...persona, name: uniqueName };
      }
      
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
    } else {
      // Fallback: try to parse from raw response
      let persona = parsePersona(response.rawResponse);
      if (persona) {
        // Ensure unique name
        const uniqueName = ensureUniqueName(persona.name, usedNames);
        usedNames.add(uniqueName.toLowerCase());
        
        if (uniqueName !== persona.name) {
          persona = { ...persona, name: uniqueName };
        }
        
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

  // Add phase start event
  const phaseStartEvent: PhaseStartEvent = {
    type: 'phase_start',
    phase: 'introduction',
    round: state.round,
    timestamp: Date.now(),
  };
  state = state.withEvent(phaseStartEvent);

  // Generate personas first (if enabled)
  if (state.config.personaEnabled) {
    state = await generatePersonas(state, aiProvider, alivePlayers);
  }

  // Re-fetch players after persona generation (names may have changed)
  const playersForIntro = state.config.personaEnabled 
    ? alivePlayers.map(p => state.getPlayer(p.id)!).filter(Boolean)
    : alivePlayers;

  // Each player introduces themselves
  for (const player of playersForIntro) {
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
