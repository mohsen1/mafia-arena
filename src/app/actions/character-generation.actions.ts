'use server';

import { Game } from '@/lib/engine/core/Game';
import { Themes } from '@/lib/engine/interfaces/Theme';
import { generateCharacterPersona } from './setup.actions';
import { selectCharacterImage } from '@/lib/utils/imageUtils';
import { loadGameData, saveGameData } from '@/lib/db/persistence';
import { filterGameStateForClient } from '@/lib/visibilityHelper';
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { GameService } from '@/lib/db/game.service';

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
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { error: 'Authentication required' };
    }

    // Check if user owns the game
    const isOwner = await GameService.isGameOwner(gameId, session.user.id);
    if (!isOwner) {
      return { error: "You don't have permission to modify this game" };
    }

    const gameState = await loadGameData(gameId);
    if (!gameState) {
      return { error: 'Game not found' };
    }

    if (gameState.phase !== 'CharacterGeneration') {
      return { error: 'Character generation already completed' };
    }

    const theme = Themes[gameState.themeKey];
    if (!theme) {
      return { error: `Invalid theme key: ${gameState.themeKey}` };
    }

    // Generate characters for non-human players
    const aiPlayers = Object.values(gameState.players).filter(
      (player) => !player.isHuman
    );

    const generatedNames: string[] = [];

    // First, collect names of human players who already have names
    Object.values(gameState.players).forEach((player) => {
      if (player.isHuman && player.name) {
        generatedNames.push(player.name);
      }
    });

    for (let i = 0; i < aiPlayers.length; i++) {
      const player = aiPlayers[i];

      try {
        // Generate persona
        const persona = await generateCharacterPersona(
          player.name,
          player.id,
          player.agentConfig,
          theme.description,
          gameState.language,
          generatedNames
        );

        // Check for duplicate names and retry if necessary
        let finalPersona = persona;
        if (generatedNames.includes(persona.name)) {
          console.warn(
            `Duplicate name generated: ${persona.name}. Retrying...`
          );
          // Retry with current existing names
          try {
            finalPersona = await generateCharacterPersona(
              player.name,
              player.id,
              player.agentConfig,
              theme.description,
              gameState.language,
              generatedNames
            );
          } catch (retryError) {
            console.warn(
              `Retry failed, using fallback name for ${player.name}:`,
              retryError
            );
            finalPersona = {
              ...persona,
              name: `${persona.name}-${player.id.slice(-4)}`, // Ensure uniqueness
            };
          }
        }

        // Add the final name to the list
        generatedNames.push(finalPersona.name);

        // Generate character image
        let characterImageUrl = player.imageUrl;
        if (!characterImageUrl) {
          try {
            const gender = Math.random() > 0.5 ? 'male' : 'female';
            const ageCategory = Math.random() > 0.5 ? 'young' : 'old';
            characterImageUrl = await selectCharacterImage(gender, ageCategory);
          } catch (error) {
            console.warn(`Failed to generate image for ${player.name}:`, error);
            characterImageUrl = null;
          }
        }

        // Update player with generated data
        gameState.players[player.id] = {
          ...player,
          name: finalPersona.name,
          persona: finalPersona,
          imageUrl: characterImageUrl,
        };

        // Save progress after each character generation
        await saveGameData(gameId, gameState);
      } catch (error) {
        console.error(
          `Failed to generate character for ${player.name}:`,
          error
        );
        // Keep placeholder data if generation fails
        generatedNames.push(player.name); // Add original name to avoid conflicts
      }
    }

    // Load game and transition to next phase
    const game = Game.loadFromState(gameState);

    game.markRolesAssigned();
    game.markPersonasGenerated();
    game.createInitialAgentMemories();

    // Transition from CharacterGeneration to Init phase
    game.advanceToPhase('Init');

    const initPhase = game.getCurrentPhase();
    if (initPhase.type !== 'Init') {
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
    return filteredState;
  } catch (error) {
    console.error('Error generating characters:', error);
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
