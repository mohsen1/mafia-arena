'use server';

import { gameStateManager } from '@/lib/state/gameStateManager';
import { determineNextSpeaker, initializeNewGame, advancePhase, checkWinCondition } from '@/lib/game/engine'; // Added initializeNewGame, advancePhase, checkWinCondition
import { getAIResponse } from '@/lib/ai/openaiService';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { ChatMessage, GameState } from '@/lib/types/game'; // Added GameState
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation'; // Added redirect
import crypto from 'crypto';
import { DEFAULT_GAME_SETTINGS, calculateNumPlayers } from '@/lib/config'; // Added config imports

// Action to start a new game
export async function startGameAction() {
    console.log("Attempting to start a new game with default settings...");
    try {
        // 1. Determine number of players from default settings
        const numPlayers = calculateNumPlayers(DEFAULT_GAME_SETTINGS.roleDistribution);
        const settings = { ...DEFAULT_GAME_SETTINGS, numPlayers };

        // 2. Generate gameId and createdAt (needed for initializeNewGame)
        const gameId = `game-${crypto.randomUUID()}`;
        const createdAt = Date.now();

        // 3. Initialize the full game state locally first
        const initialGameState = await initializeNewGame(
            settings,
            gameId, 
            createdAt
        );

        // 4. Create the game using the manager (it handles saving/caching)
        // Note: gameStateManager.createGame expects the state *without* gameId/createdAt
        // It might be better to refactor createGame OR initializeNewGame
        // For now, let's create it directly here and then just use updateGameState
        // or perhaps add a dedicated method to the manager if this pattern repeats.
        // --- Simpler Approach: Let Manager handle ID/Timestamp --- 
        // Refactor: Let's assume createGame *should* take the initialized state
        // Or adjust initializeNewGame to not require id/timestamp beforehand.
        // Let's stick to the current structure for initializeNewGame and call createGame differently

        const newGame = await gameStateManager.createGame(initialGameState); 
        // If createGame is strict about not wanting gameId/createdAt, we'd adjust:
        // const { gameId: _gid, createdAt: _ca, ...coreState } = initialGameState;
        // const newGame = await gameStateManager.createGame(coreState); 
        // Let's assume createGame is flexible or we'll adjust it later.

        console.log(`New game created with ID: ${newGame.gameId}`);

        // 5. Redirect to the new game page
        redirect(`/game/${newGame.gameId}`);

    } catch (error: any) {
        // Check if the error is the specific NEXT_REDIRECT error
        if (error.digest?.startsWith('NEXT_REDIRECT')) {
            throw error; // Re-throw NEXT_REDIRECT error for Next.js to handle
        }
        
        // Log other types of errors
        console.error("Failed to start new game:", error);
        // TODO: How to report this error back to the user? 
        // Maybe redirect to an error page or show a message on the home page.
        // For now, just logging server-side.
        // Returning an error object here won't work alongside a potential redirect
    }
}

// Action to run the next turn or step in the game
export async function runGameTurnAction(gameId: string) {
    console.log(`Running turn for game: ${gameId}`);

    const currentState = await gameStateManager.getGameState(gameId);

    if (!currentState) {
        console.error(`Game state not found for ${gameId}`);
        // TODO: Handle error appropriately (e.g., redirect, show message)
        return;
    }

    if (currentState.phase === 'GameOver') {
        console.log(`Game ${gameId} is already over.`);
        // No action needed if game is finished
        return; 
    }

    // --- Logic specifically for DayIntroductions phase ---
    if (currentState.phase === 'DayIntroductions') {
        const nextSpeakerId = determineNextSpeaker(currentState);

        if (nextSpeakerId) {
            const nextSpeaker = currentState.players[nextSpeakerId];
            
            // 1. Construct Prompt using the detailed persona
            const systemPrompt = `You are playing a character in a game of Werewolf.

Your Character Details:
${nextSpeaker.persona}

Your Character Name: ${nextSpeaker.name}
Your Assigned Role (SECRET): ${nextSpeaker.role}

The current game phase is Day Introductions. The villagers have gathered, and it's your turn to speak.
Your task is to introduce yourself briefly to the other players (1-2 sentences).
Speak in the first person, embodying the character described in your details.
Behave according to your personality traits and background.
CRITICALLY IMPORTANT: Do NOT reveal your secret assigned role (${nextSpeaker.role}) or mention the game mechanics (like roles, phases, werewolves) in your introduction. Keep it purely in-character as if meeting the others in the village square under tense circumstances.`;

            const promptMessages: ChatCompletionMessageParam[] = [
                { 
                    role: 'system', 
                    content: systemPrompt
                },
                {
                    role: 'user',
                    content: `Okay ${nextSpeaker.name}, it's your turn. Please introduce yourself to everyone.`
                }
            ];

            // 2. Get AI response
            const introductionContent = await getAIResponse(
                promptMessages,
                gameId,
                nextSpeakerId,
                { model: currentState.settings.aiModel, temperature: 0.8 } // Slightly higher temp for more character? 
            );

            // 3. Create Chat Message
            const newMessage: ChatMessage = {
                messageId: `msg-${crypto.randomUUID()}`,
                gameId: gameId,
                speaker: { type: 'player', playerId: nextSpeakerId },
                speakerName: nextSpeaker.name,
                content: introductionContent,
                timestamp: Date.now(),
                round: currentState.round,
                phase: currentState.phase,
                audience: { type: 'all' }, 
                // turnNumber: currentState.turnOrderIndex // Optional
            };

            // 4. Update Game State
            const updatedState = {
                ...currentState,
                conversationLog: [...currentState.conversationLog, newMessage],
                turnOrderIndex: currentState.turnOrderIndex + 1, // Move to next speaker
            };

             // Check if all players have introduced themselves
             if (updatedState.turnOrderIndex >= updatedState.livingPlayerIds.length) {
                 // TODO: Transition to the next phase (e.g., DayDiscussion or Voting)
                 console.log("All players introduced. Phase transition needed.");
                 // updatedState = advancePhase(updatedState); // Need advancePhase function
                 // For now, just log - Phase transition logic needs to be added
             }


            // 5. Save updated state
            await gameStateManager.updateGameState(gameId, updatedState);

            console.log(`Introduction from ${nextSpeaker.name} added.`);

        } else {
            console.log("All players have introduced themselves in this round.");
            // TODO: Logic to advance the phase (e.g., to DayDiscussion or Voting)
             // let nextState = advancePhase(currentState); // Need advancePhase function
             // await gameStateManager.updateGameState(gameId, nextState);
             console.warn("Phase advancement logic not implemented yet.");
        }

    // --- Logic specifically for Night phase ---
    } else if (currentState.phase === 'Night') {
        console.log(`Processing end of Night phase for game ${gameId}...`);
        
        // TODO: Implement Night Action Collection
        // - Iterate through players with night actions (Werewolves, Seer, Doctor)
        // - Call AI for each to determine their target
        // - Store NightAction objects in `currentState.nightActions`

        // TODO: Implement Night Action Resolution
        // - Process collected `nightActions`
        // - Determine who was killed, saved, investigated
        // - Update player statuses (e.g., set killed player to 'dead')
        // - Update internal state (e.g., seer results)
        // - Add moderator messages summarizing results (e.g., "Player X was found dead.")

        // For now, just advance the phase
        let nextState = advancePhase(currentState);

        // Add a moderator message about the phase change
        const phaseChangeMessage: ChatMessage = {
            messageId: `msg-${crypto.randomUUID()}`,
            gameId: gameId,
            speaker: { type: 'moderator' },
            speakerName: "Moderator",
            content: `Dawn breaks. The village gathers. Time for introductions.`, 
            timestamp: Date.now(),
            round: nextState.round, // Use the round from the *new* state
            phase: nextState.phase, // Use the phase from the *new* state
            audience: { type: 'all' },
        };
        nextState = {
            ...nextState,
            conversationLog: [...nextState.conversationLog, phaseChangeMessage],
        };

        // TODO: Check win condition *after* processing night actions and updating statuses
        // nextState = checkWinCondition(nextState);

        // Save the updated state
        await gameStateManager.updateGameState(gameId, nextState);
        console.log(`Game ${gameId} advanced from Night to ${nextState.phase}`);

    } else {
        // TODO: Implement logic for other phases (DayDiscussion, Voting)
        console.warn(`runGameTurnAction not implemented for phase: ${currentState.phase}`);
    }


    // 6. Revalidate the game page path to show updates
    revalidatePath(`/game/${gameId}`);
}

/**
 * Server Action to delete a specific game.
 * 
 * @param gameId The ID of the game to delete.
 * @throws If deletion fails.
 */
export async function deleteGameAction(gameId: string): Promise<void> {
    console.log(`deleteGameAction triggered for ${gameId}`);
    try {
        const success = await gameStateManager.deleteGame(gameId);
        if (!success) {
            throw new Error("Game state manager failed to delete the game.");
        }
        console.log(`Game ${gameId} deleted successfully via action.`);
    } catch (error: any) {
        console.error(`Error in deleteGameAction for ${gameId}:`, error);
        // Re-throw the error to potentially be caught by an error boundary
        throw new Error(`Failed to delete game ${gameId}: ${error.message || 'Unknown error'}`);
    }

    // Revalidate the home page path to update the list
    revalidatePath('/');
}

// Add empty export for module compatibility if needed
export {};