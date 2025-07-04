'use server';

import { Game } from '@/lib/engine/core/Game';
import { Themes } from '@/lib/engine/interfaces/Theme';
import { selectCharacterImage } from '@/lib/utils/imageUtils';
import { loadGameData, saveGameData } from '@/lib/db/persistence';
import { filterGameStateForClient } from '@/lib/visibilityHelper';
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { GameService } from '@/lib/db/game.service';
import { createAgentInstance } from '@/lib/agentFactory';

export interface CharacterGenerationProgress {
  currentStep: string;
  progress: number;
  totalSteps: number;
  completedCharacters: number;
  totalCharacters: number;
  currentCharacterName?: string;
  error?: string;
  characters?: Array<{
    id: string;
    name: string;
    imageUrl: string | null;
    backstory?: string;
  }>;
}

export async function generateGameCharactersAction(
  gameId: string
): Promise<FilteredGameState | { error: string }> {
  try {
    console.log(
      `[CharacterGen] Starting character generation for game ${gameId}`
    );

    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      console.error('[CharacterGen] No authenticated session');
      return { error: 'Authentication required' };
    }

    // Check if user owns the game
    const isOwner = await GameService.isGameOwner(gameId, session.user.id);
    if (!isOwner) {
      console.error(
        `[CharacterGen] User ${session.user.id} does not own game ${gameId}`
      );
      return { error: "You don't have permission to modify this game" };
    }

    const gameState = await loadGameData(gameId);
    if (!gameState) {
      console.error(`[CharacterGen] Game ${gameId} not found in database`);
      return { error: 'Game not found' };
    }

    if (gameState.phase !== 'CharacterGeneration') {
      console.log(
        `[CharacterGen] Game ${gameId} is in phase ${gameState.phase}, not CharacterGeneration`
      );
      return { error: 'Character generation already completed' };
    }

    const theme = Themes[gameState.themeKey];
    if (!theme) {
      console.error(`[CharacterGen] Invalid theme key: ${gameState.themeKey}`);
      return { error: `Invalid theme key: ${gameState.themeKey}` };
    }

    // Log AI players configuration
    const aiPlayers = Object.values(gameState.players).filter(
      (player) => !player.isHuman
    );

    console.log(
      `[CharacterGen] Found ${aiPlayers.length} AI players to generate personas for`
    );
    aiPlayers.forEach((player) => {
      console.log(
        `[CharacterGen] Player ${player.id}: ${player.name}, Agent: ${player.agentConfig?.agentType}, Provider: ${player.agentConfig?.providerValue}, Model: ${player.agentConfig?.modelName}`
      );
    });

    // Check environment variables for API keys
    const envVars = {
      GROQ_API_KEY: !!process.env.GROQ_API_KEY,
      OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      GOOGLE_AI_API_KEY: !!process.env.GOOGLE_AI_API_KEY,
      FIREWORKS_API_KEY: !!process.env.FIREWORKS_API_KEY,
    };
    console.log(
      '[CharacterGen] Available API keys:',
      Object.entries(envVars)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(', ')
    );

    // Load game and use the optimized parallel persona generation
    const game = await Game.loadFromState(gameState);

    console.log('[CharacterGen] Starting persona generation...');

    try {
      // This now generates personas in parallel internally
      await game.ensurePersonasGenerated();
      console.log('[CharacterGen] Persona generation completed successfully');
    } catch (error) {
      console.error('[CharacterGen] Error during persona generation:', error);
      console.error(
        '[CharacterGen] Error stack:',
        error instanceof Error ? error.stack : 'No stack trace'
      );

      // Return more detailed error message
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unknown error during persona generation';
      return {
        error: `Character generation failed: ${errorMessage}. Please check your API keys and try again.`,
      };
    }

    // Get the updated state after persona generation
    const updatedState = game.getCurrentSerializableState();

    // Check if any AI player failed to generate a proper persona
    const failedPersonas = aiPlayers.filter((player) => {
      const updatedPlayer = updatedState.players[player.id];
      if (!updatedPlayer || !updatedPlayer.persona) {
        console.log(`[CharacterGen] Player ${player.id} has no persona at all`);
        return true; // No persona at all
      }

      // Check if the persona is still using default/placeholder values
      const persona = updatedPlayer.persona;

      // The initial placeholder backstory for AI players is exactly this format
      const expectedPlaceholderBackstory = `A resident of ${theme.name.toLowerCase()}`;

      const isPlaceholder =
        persona.name === player.name || // Still using original name
        persona.name === 'Anonymous Player' || // Default name
        persona.backstory === 'A human player' || // Human placeholder
        persona.backstory === expectedPlaceholderBackstory || // AI placeholder - exact match
        persona.backstory === 'Their past is shrouded in mystery.' || // DEFAULT_PERSONA backstory
        !persona.name ||
        persona.name.trim() === '' ||
        // Check if personality traits are still the placeholder ones
        (persona.personalityTraits.length === 1 &&
          persona.personalityTraits[0] === 'Mysterious');

      if (isPlaceholder) {
        console.log(
          `[CharacterGen] Player ${player.id} has placeholder persona: name="${persona.name}", backstory="${persona.backstory}", expected placeholder: "${expectedPlaceholderBackstory}"`
        );
      }

      return isPlaceholder;
    });

    if (failedPersonas.length > 0) {
      const failedNames = failedPersonas.map((p) => p.name).join(', ');
      console.error(
        `[CharacterGen] Character generation failed for: ${failedNames}`
      );
      
      // Collect detailed error information for each failed persona
      const failedDetails = await Promise.all(
        failedPersonas.map(async (player) => {
          const updatedPlayer = updatedState.players[player.id];
          
          // Try to get more detailed error info by attempting to regenerate and catching the error
          let errorDetails = 'Unknown error';
          try {
            // Create a temporary agent to get the actual error
            const tempAgent = await createAgentInstance(
              player.agentConfig!,
              player.id
            );
            
            if (tempAgent.generatePersona) {
              await tempAgent.generatePersona(
                `${theme.name} ${theme.description}`,
                gameState.language,
                []
              );
            }
          } catch (error) {
            if (error instanceof Error) {
              errorDetails = error.message;
              
              // Extract specific error types from the message
              if (error.message.includes('401') || error.message.includes('authentication')) {
                errorDetails = `Authentication error - Invalid API key for ${player.agentConfig?.providerValue || 'provider'}`;
              } else if (error.message.includes('429') || error.message.includes('rate limit')) {
                errorDetails = `Rate limit exceeded for ${player.agentConfig?.providerValue || 'provider'}`;
              } else if (error.message.includes('timeout')) {
                errorDetails = `Request timeout - ${player.agentConfig?.providerValue || 'provider'} service is busy`;
              } else if (error.message.includes('model') || error.message.includes('not found')) {
                errorDetails = `Model "${player.agentConfig?.modelName}" not available for ${player.agentConfig?.providerValue || 'provider'}`;
              } else if (error.message.includes('Ollama') || error.message.includes('ECONNREFUSED')) {
                errorDetails = 'Ollama service is not running. Please start Ollama with: ollama serve';
              } else if (error.message.includes('quota') || error.message.includes('insufficient')) {
                errorDetails = `API quota exceeded for ${player.agentConfig?.providerValue || 'provider'}`;
              } else if (error.message.includes('network') || error.message.includes('fetch')) {
                errorDetails = `Network error connecting to ${player.agentConfig?.providerValue || 'provider'}`;
              }
            }
          }
          
          return {
            id: player.id,
            name: player.name,
            agentConfig: player.agentConfig,
            persona: updatedPlayer?.persona,
            error: errorDetails
          };
        })
      );
      
      console.error(
        `[CharacterGen] Failed personas with detailed errors:`,
        JSON.stringify(failedDetails, null, 2)
      );
      
      // Build a more informative error message
      const errorGroups = new Map<string, string[]>();
      failedDetails.forEach((detail) => {
        const errorKey = detail.error || 'Unknown error';
        const players = errorGroups.get(errorKey) || [];
        players.push(detail.name);
        errorGroups.set(errorKey, players);
      });
      
      let detailedErrorMessage = `Character generation failed for ${failedPersonas.length} character(s):\n`;
      errorGroups.forEach((players, error) => {
        detailedErrorMessage += `\n• ${error}: ${players.join(', ')}`;
      });
      
      return {
        error: detailedErrorMessage.trim(),
      };
    }

    console.log(
      '[CharacterGen] All personas generated successfully, generating images...'
    );

    // Generate character images in parallel for all non-human players
    const imagePromises = aiPlayers.map(async (player) => {
      if (!player.imageUrl) {
        try {
          const gender = Math.random() > 0.5 ? 'male' : 'female';
          const ageCategory = Math.random() > 0.5 ? 'young' : 'old';
          const imageUrl = await selectCharacterImage(gender, ageCategory);
          console.log(
            `[CharacterGen] Generated image for ${player.name}: ${imageUrl}`
          );
          return { playerId: player.id, imageUrl };
        } catch (error) {
          console.warn(
            `[CharacterGen] Failed to generate image for ${player.name}:`,
            error
          );
          return { playerId: player.id, imageUrl: null };
        }
      }
      return { playerId: player.id, imageUrl: player.imageUrl };
    });

    // Wait for all images to be generated
    const imageResults = await Promise.all(imagePromises);

    // Apply generated images to the state
    for (const result of imageResults) {
      if (updatedState.players[result.playerId]) {
        updatedState.players[result.playerId].imageUrl = result.imageUrl;
      }
    }

    // Save the updated state
    await saveGameData(gameId, updatedState);
    console.log(
      '[CharacterGen] Game state saved with generated personas and images'
    );

    // Mark generation phases as complete and transition
    game.markRolesAssigned();
    game.markPersonasGenerated();
    game.createInitialAgentMemories();

    // Transition from CharacterGeneration to Init phase
    game.advanceToPhase('Init');

    const initPhase = game.getCurrentPhase();
    if (initPhase.type !== 'Init') {
      console.error(
        `[CharacterGen] Failed to transition to Init phase, current phase: ${initPhase.type}`
      );
      throw new Error('Game did not transition to Init phase correctly.');
    }

    await initPhase.runStep(game);

    const nextPhaseType = initPhase.transition(game);
    game.advanceToPhase(nextPhaseType);

    // After all characters are generated, save final state
    const finalState = game.getCurrentSerializableState(
      game.getPendingHumanAction()
    );
    await saveGameData(gameId, finalState);

    const filteredState = filterGameStateForClient(
      finalState,
      finalState.humanPlayerId
    );

    console.log('[CharacterGen] Character generation completed successfully');
    return filteredState;
  } catch (error) {
    console.error('[CharacterGen] Unexpected error:', error);
    console.error(
      '[CharacterGen] Error stack:',
      error instanceof Error ? error.stack : 'No stack trace'
    );
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Failed to generate characters',
    };
  }
}

export async function getCharacterGenerationProgressAction(
  gameId: string
): Promise<CharacterGenerationProgress | { error: string }> {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { error: 'Authentication required' };
    }

    // Check if user owns the game
    const isOwner = await GameService.isGameOwner(gameId, session.user.id);
    if (!isOwner) {
      return { error: "You don't have permission to view this game" };
    }

    const gameState = await loadGameData(gameId);
    if (!gameState) {
      return { error: 'Game not found' };
    }

    const aiPlayers = Object.values(gameState.players).filter(
      (player) => !player.isHuman
    );
    const totalCharacters = aiPlayers.length;

    if (totalCharacters === 0) {
      return {
        currentStep: 'Complete',
        progress: 100,
        totalSteps: 0,
        completedCharacters: 0,
        totalCharacters: 0,
        characters: [],
      };
    }

    const theme = Themes[gameState.themeKey];
    if (!theme) {
      // This case should be rare if game setup ensures a valid theme
      console.error(
        `Invalid theme key '${gameState.themeKey}' for game ${gameId} in getCharacterGenerationProgressAction.`
      );
      return {
        currentStep: 'Error',
        progress: 0,
        totalSteps: totalCharacters,
        completedCharacters: 0,
        totalCharacters,
        error: 'Invalid theme configuration.',
      };
    }
    // Default backstory for AI players, used to determine if a persona has been generated.
    const aiPlaceholderBackstory = `A resident of ${theme.name.toLowerCase()}`;

    const generatedCharacters = aiPlayers.filter(
      (player) =>
        player.persona && player.persona.backstory !== aiPlaceholderBackstory
    );

    const completedCharacters = generatedCharacters.length;
    const progressPercentage = Math.round(
      (completedCharacters / totalCharacters) * 100
    );

    // Determine current step and current character name
    let currentStepText = 'Generating characters...';
    if (progressPercentage >= 100) {
      currentStepText = 'Complete';
    } else if (gameState.phase !== 'CharacterGeneration') {
      // If phase is not CharacterGeneration but progress is not 100%, it implies an issue or premature completion.
      // However, generateGameCharactersAction advances the phase only after all generation.
      // For safety, if somehow not in CharacterGeneration phase but not 100%, mark as complete.
      currentStepText = 'Complete';
    }

    const currentCharacterName =
      currentStepText === 'Generating characters...' &&
      completedCharacters < totalCharacters
        ? aiPlayers[completedCharacters]?.name
        : undefined;

    // Prepare character data for completed characters
    const characters = generatedCharacters.map((player) => ({
      id: player.id,
      name: player.persona?.name || player.name,
      imageUrl: player.imageUrl || null,
      backstory: player.persona?.backstory,
    }));

    return {
      currentStep: currentStepText,
      progress: progressPercentage,
      totalSteps: totalCharacters,
      completedCharacters,
      totalCharacters,
      currentCharacterName,
      characters,
    };
  } catch (error) {
    console.error('Error getting character generation progress:', error);
    return {
      error: error instanceof Error ? error.message : 'Failed to get progress',
    };
  }
}
