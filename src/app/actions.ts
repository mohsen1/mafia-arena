'use server';

import { gameStateManager } from '@/lib/state/gameStateManager';
import { determineNextSpeaker, initializeNewGame, advancePhase, checkWinCondition } from '@/lib/game/engine'; // Added initializeNewGame, advancePhase, checkWinCondition
import { getAIResponse } from '@/lib/ai/openaiService';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { ChatMessage, GameState, NightAction, Player, Vote, Role, GameSettings, PlayerInitializationData, AICharacterProfile } from '@/lib/types/game'; // Added Vote and Role, PlayerInitializationData, AICharacterProfile
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation'; // Added redirect
import crypto from 'crypto';
import { DEFAULT_GAME_SETTINGS, calculateNumPlayers } from '@/lib/config'; // Added config imports
import { generateAICharacterProfile, formatPersonaFromProfile, getAIGameTitleAndDescription } from '@/lib/ai/openaiService'; // Import generation utils
import { selectCharacterImage } from '@/lib/utils/imageUtils'; // Import image utility

// Define the expected input shape for the action
interface StartGameConfig {
    aiModel: string;
    roleDistribution: Record<Role, number>;
}

// Extend the expected return type for generateCharacterAction
type GenerateCharacterResult = PlayerInitializationData & { imageUrl?: string | null };

// Action to start a new game - Accepts player list (now including imageUrl) and model
export async function startGameAction(playerInitDataList: GenerateCharacterResult[], aiModel: string) {
    console.log(`Attempting to start a new game with ${playerInitDataList.length} players using model ${aiModel}`);
    
    let gameIdToRedirect: string | null = null;
    try {
        // --- Basic Validation ---
        if (!playerInitDataList || playerInitDataList.length < 5) {
             throw new Error("A minimum of 5 players is required.");
        }
        // --- End Validation ---

        // --- Construct Settings --- 
        const numPlayers = playerInitDataList.length;
        const settings: GameSettings = { 
            roleDistribution: playerInitDataList.reduce((acc, curr) => {
                acc[curr.role] = (acc[curr.role] || 0) + 1;
                return acc;
            }, {} as Record<Role, number>),
            discussionRoundsPerPlayer: DEFAULT_GAME_SETTINGS.discussionRoundsPerPlayer,
            aiModel: aiModel, 
            numPlayers: numPlayers
        };
        // --- End Settings --- 
        
        const gameId = `game-${crypto.randomUUID()}`;
        const createdAt = Date.now();
        
        // --- Initialize Game State --- 
        const initialGameState = await initializeNewGame(settings, gameId, createdAt, playerInitDataList); 
        
        // --- Save Game State --- 
        const newGame = await gameStateManager.createAndSaveGame(initialGameState); // Use the correct method
        console.log(`New game created with ID: ${newGame.gameId}`);
        gameIdToRedirect = newGame.gameId;

    } catch (error: any) {
        if (error.digest?.startsWith('NEXT_REDIRECT')) throw error; 
        console.error("Failed to start new game:", error);
        // Consider returning the error message to the UI instead of throwing
        return { error: `Failed to create the game: ${error.message || 'Unknown error'}` }; 
    }

    if (gameIdToRedirect) {
        redirect(`/game/${gameIdToRedirect}`);
    } else {
        // This case might indicate an error occurred but wasn't caught properly
        return { error: "Game creation failed unexpectedly." };
    }
}

// Action to run the next turn or step in the game
export async function runGameTurnAction(gameId: string) {
    console.log(`Running turn for game: ${gameId}`);

    // Use let because we might update it after fetching latest state
    let currentState = await gameStateManager.getGameState(gameId);

    if (!currentState) {
        console.error(`Game state not found for ${gameId}`);
        return;
    }

    if (currentState.phase === 'GameOver') {
        console.log(`Game ${gameId} is already over.`);
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
            // All players have introduced themselves. Time to advance the phase.
            console.log("All players introduced. Advancing phase...");
            
            // Fetch the latest state to ensure we are advancing from the correct point
            const stateBeforePhaseAdvance = await gameStateManager.getGameState(gameId);
            if (!stateBeforePhaseAdvance) {
                console.error(`Game state lost before phase advance for ${gameId}`);
                return; 
            }

            let nextState = advancePhase(stateBeforePhaseAdvance);

            // Add a moderator message indicating the start of the next phase
            const phaseChangeMessage: ChatMessage = {
                messageId: `msg-${crypto.randomUUID()}`,
                gameId: gameId,
                speaker: { type: 'moderator' },
                speakerName: "Moderator",
                content: `Introductions are complete. The floor is now open for discussion.`, 
                timestamp: Date.now(),
                round: nextState.round, 
                phase: nextState.phase, 
                audience: { type: 'all' },
            };
            nextState = {
                ...nextState,
                conversationLog: [...nextState.conversationLog, phaseChangeMessage],
                // Reset turn index for the new phase (discussion)
                turnOrderIndex: 0, 
            };

            // Save the updated state with the new phase
            await gameStateManager.updateGameState(gameId, nextState);
            console.log(`Game ${gameId} advanced from DayIntroductions to ${nextState.phase}`);
        }

    // --- Logic specifically for Night phase ---
    } else if (currentState.phase === 'Night') {
        console.log(`Processing Night phase actions for game ${gameId}...`);

        const livingPlayers = currentState.livingPlayerIds.map(id => currentState.players[id]);
        const playersWithNightActions = livingPlayers.filter(p =>
            p.status === 'alive' && (p.role === 'Werewolf' || p.role === 'Seer' || p.role === 'Doctor')
        );

        const collectedActions: NightAction[] = [];

        // Helper function to find living player ID by name (case-insensitive)
        const getPlayerIdByName = (name: string): string | null => {
            const lowerCaseName = name.toLowerCase().trim();
            // Ensure we only target living players
            const player = livingPlayers.find(p => p.status === 'alive' && p.name.toLowerCase() === lowerCaseName);
            return player ? player.id : null;
        };

        for (const activePlayer of playersWithNightActions) {
            console.log(`Getting night action for ${activePlayer.name} (${activePlayer.role})...`);
            let prompt = '';
            let targetOptions: Player[] = [];
            const systemPromptBase = `You are playing a character in a game of Werewolf.\n\nYour Character Details:\n${activePlayer.persona}\n\nYour Character Name: ${activePlayer.name}\nYour Assigned Role (SECRET): ${activePlayer.role}\n\nThe current game phase is Night. It is time for you to perform your nightly action.`;

            // Determine valid targets based on role
            switch (activePlayer.role) {
                case 'Werewolf':
                    targetOptions = livingPlayers.filter(p => p.status === 'alive' && p.role !== 'Werewolf');
                    prompt = `${systemPromptBase}\n\nAs a Werewolf, choose one player from the list below to eliminate tonight. Respond ONLY with the number corresponding to the player.\n\nLiving Non-Werewolf Players:\n${targetOptions.map(p => `- ${p.name}`).join('\n')}`;
                    break;
                case 'Seer':
                    targetOptions = livingPlayers.filter(p => p.status === 'alive' && p.id !== activePlayer.id);
                    prompt = `${systemPromptBase}\n\nAs the Seer, choose one player from the list below to investigate their role (Werewolf or Villager). Respond ONLY with the number corresponding to the player.\n\nOther Living Players:\n${targetOptions.map(p => `- ${p.name}`).join('\n')}`;
                    break;
                case 'Doctor':
                    targetOptions = livingPlayers.filter(p => p.status === 'alive');
                    prompt = `${systemPromptBase}\n\nAs the Doctor, choose one player from the list below to protect from elimination tonight. You may choose yourself. Respond ONLY with the number corresponding to the player.\n\nLiving Players:\n${targetOptions.map(p => `- ${p.name}`).join('\n')}`;
                    break;
            }

            if (!prompt || targetOptions.length === 0) {
                console.log(`Skipping action for ${activePlayer.name} (no valid targets or action).`);
                continue;
            }

            const promptMessages: ChatCompletionMessageParam[] = [
                { role: 'system', content: prompt },
                { role: 'user', content: `Choose your target.` }
            ];

            let targetNumberStr = '';
            let targetPlayerId: string | null = null;
            let retries = 2;

            // Retry loop for getting a valid target number from AI
            while (retries > 0 && targetPlayerId === null) {
                try {
                    targetNumberStr = await getAIResponse(
                        promptMessages,
                        gameId,
                        activePlayer.id,
                        { model: currentState.settings.aiModel, temperature: 0.3 }
                    );
                     // Try to parse the response as a number
                    const choiceIndex = parseInt(targetNumberStr.trim(), 10) - 1; // Convert to 0-based index

                    // Validate the number
                    if (!isNaN(choiceIndex) && choiceIndex >= 0 && choiceIndex < targetOptions.length) {
                        // Valid number and within range
                        targetPlayerId = targetOptions[choiceIndex].id;
                        // Further validation (e.g., werewolf targeting werewolf) is implicitly handled by targetOptions generation now
                    } else {
                        // Invalid number or out of range
                        console.warn(`Invalid night action choice \"${targetNumberStr}\" (parsed as ${choiceIndex + 1}) received from ${activePlayer.name} (${activePlayer.role}). Expected 1-${targetOptions.length}. Retrying... (${retries - 1} left)`);
                        promptMessages.push({ role: 'assistant', content: targetNumberStr });
                        promptMessages.push({ role: 'user', content: `That wasn't a valid number from the list (1-${targetOptions.length}). Please respond ONLY with the number corresponding to the player you want to target.` });
                        retries--;
                        targetNumberStr = ''; // Reset for logging/context
                    }
                } catch (error) {
                    console.error(`AI call failed for ${activePlayer.name}'s night action:`, error);
                    retries = 0; // Stop retrying on API error
                }
            }

            // Add action if a valid target was successfully chosen
            if (targetPlayerId) {
                const finalTargetName = currentState.players[targetPlayerId].name; // Get canonical name
                console.log(`${activePlayer.name} (${activePlayer.role}) targeted ${finalTargetName} (${targetPlayerId})`);
                let action: NightAction | null = null;
                switch (activePlayer.role) {
                    case 'Werewolf':
                        action = { type: 'werewolf_kill', actingPlayerId: activePlayer.id, targetPlayerId };
                        break;
                    case 'Seer':
                        // Result is determined during resolution phase
                        action = { type: 'seer_investigation', actingPlayerId: activePlayer.id, targetPlayerId, result: 'Villager' /* Placeholder */ };
                        break;
                    case 'Doctor':
                        action = { type: 'doctor_save', actingPlayerId: activePlayer.id, targetPlayerId };
                        break;
                }
                if (action) {
                    collectedActions.push(action);
                }
            } else {
                console.warn(`${activePlayer.name} (${activePlayer.role}) failed to provide a valid target after retries.`);
                // Handle failure case - e.g., player performs no action this night
            }
        } // End loop through players with night actions

        console.log("Finished collecting night actions:", collectedActions);

        // Update the state with collected actions before resolving them
        // Fetch latest state again in case concurrent actions modified it (though unlikely with current model)
        const stateBeforeResolution = await gameStateManager.getGameState(gameId);
        if (!stateBeforeResolution) { console.error(`State disappeared for ${gameId} before resolution`); return; }

        let stateWithCollectedActions = {
            ...stateBeforeResolution,
            nightActions: collectedActions, // Add the newly collected actions
        };
        // Save state with actions collected, allows viewing if resolution fails?
        await gameStateManager.updateGameState(gameId, stateWithCollectedActions);
        // Revalidate now might show actions were *collected* but not yet resolved.
        // Optional: revalidatePath(`/game/${gameId}`);
        console.log(`State updated with collected night actions for ${gameId}.`);

        // ----- Night Action Resolution -----
        let stateAfterResolution = { ...stateWithCollectedActions }; // Start from state with collected actions
        let moderatorMessages: ChatMessage[] = [];
        let eliminatedPlayerId: string | null = null;

        // 1. Determine Kill
        const killAction = stateAfterResolution.nightActions.find(a => a.type === 'werewolf_kill');
        const saveAction = stateAfterResolution.nightActions.find(a => a.type === 'doctor_save');
        
        if (killAction) {
            const targetId = killAction.targetPlayerId;
            const targetPlayer = stateAfterResolution.players[targetId];
            
            if (targetPlayer?.status !== 'alive') {
                console.log(`Werewolf target ${targetPlayer?.name || targetId} was already dead. Attack ineffective.`);
                 // No public message needed
            } else if (saveAction && saveAction.targetPlayerId === targetId) {
                console.log(`Player ${targetPlayer.name} (${targetId}) was targeted for elimination but saved by the Doctor.`);
                // No public message needed, maybe internal log?
            } else {
                console.log(`Player ${targetPlayer.name} (${targetId}) was eliminated by werewolves.`);
                eliminatedPlayerId = targetId;
            }
        } else {
            console.log("No werewolf kill action was performed or targeted this night.");
        }

        // 2. Update Player Status & Living IDs if elimination occurred
        if (eliminatedPlayerId) {
            const playersCopy = { ...stateAfterResolution.players };
            playersCopy[eliminatedPlayerId] = { ...playersCopy[eliminatedPlayerId], status: 'dead' };
            
            stateAfterResolution = {
                ...stateAfterResolution,
                players: playersCopy,
                livingPlayerIds: stateAfterResolution.livingPlayerIds.filter(id => id !== eliminatedPlayerId),
                lastEliminatedPlayerId: eliminatedPlayerId
            };
        }

        // 3. Determine & Store Seer Result (Internal State)
        const investigationAction = stateAfterResolution.nightActions.find(a => a.type === 'seer_investigation');
        if (investigationAction) {
            const targetId = investigationAction.targetPlayerId;
            const targetPlayer = stateAfterResolution.players[targetId]; // Get target player from potentially updated state
            const seerId = investigationAction.actingPlayerId;
            
             if (!targetPlayer || targetPlayer.status !== 'alive') {
                 console.log(`Seer (${seerId}) investigated ${targetPlayer?.name || targetId}, but they were already dead. No result.`);
                 // Optionally store 'Dead' or similar? For now, no result stored.
             } else {
                const result: 'Werewolf' | 'Villager' = targetPlayer.role === 'Werewolf' ? 'Werewolf' : 'Villager';
                console.log(`Seer (${seerId}) investigated ${targetPlayer.name} (${targetId}) - Result: ${result}`);

                // Update internal state (initialize if needed)
                const internalState = stateAfterResolution._internalState || {};
                const seerResults = internalState.seerResults || {};
                seerResults[`${seerId}-${targetId}-${stateAfterResolution.round}`] = result; // Include round to avoid overwrite if same target
                
                stateAfterResolution = {
                    ...stateAfterResolution,
                    _internalState: { 
                        ...internalState, 
                        seerResults 
                    }
                };
             }
            // Note: No public message about the seer result.
        }

        // 4. Generate Moderator Message based on elimination
        let summaryContent = '';
        if (eliminatedPlayerId) {
            const eliminatedPlayerName = stateAfterResolution.players[eliminatedPlayerId].name;
            const eliminatedPlayerRole = stateAfterResolution.players[eliminatedPlayerId].role; // Reveal role on night death
            summaryContent = `A scream pierces the night! The villagers gather in the morning to find ${eliminatedPlayerName} dead. They were a ${eliminatedPlayerRole}.`;
        } else if (killAction && saveAction && killAction.targetPlayerId === saveAction.targetPlayerId && stateAfterResolution.players[killAction.targetPlayerId]?.status === 'alive') {
             summaryContent = "A chilling silence fell over the village, but dawn arrives without incident. Someone was lucky tonight.";
        } else {
            summaryContent = "The night passes uneventfully. Dawn breaks.";
        }

        const summaryMessage: ChatMessage = {
            messageId: `msg-${crypto.randomUUID()}-night-summary`,
            gameId: gameId,
            speaker: { type: 'moderator' },
            speakerName: "Moderator",
            content: summaryContent,
            timestamp: Date.now(),
            round: stateAfterResolution.round, // Round before advancing
            phase: stateAfterResolution.phase, // Still Night phase technically during resolution
            audience: { type: 'all' },
        };
        moderatorMessages.push(summaryMessage);

        stateAfterResolution = {
            ...stateAfterResolution,
            conversationLog: [...stateAfterResolution.conversationLog, ...moderatorMessages],
        };

        // 5. Check Win Condition *after* updating statuses
        stateAfterResolution = checkWinCondition(stateAfterResolution);
        if (stateAfterResolution.phase === 'GameOver') {
             console.log(`Game Over detected after night resolution. Winner: ${stateAfterResolution.winner}`);
             // Add Game Over message?
             const gameOverMessage: ChatMessage = {
                messageId: `msg-${crypto.randomUUID()}-gameover`,
                gameId: gameId,
                speaker: { type: 'moderator' },
                speakerName: "Moderator",
                content: `The game is over! The ${stateAfterResolution.winner} team wins!`, 
                timestamp: Date.now(),
                round: stateAfterResolution.round, 
                phase: stateAfterResolution.phase, 
                audience: { type: 'all' },
             };
             stateAfterResolution = {
                 ...stateAfterResolution,
                 conversationLog: [...stateAfterResolution.conversationLog, gameOverMessage]
             };
             // Skip phase advancement if game is over
             await gameStateManager.updateGameState(gameId, stateAfterResolution);
             console.log(`Game ${gameId} ended.`);
             revalidatePath(`/game/${gameId}`);
             return; // End the action here if game over
        }

        // 6. Advance Phase (to DayDiscussion or DayIntroductions)
        let nextState = advancePhase(stateAfterResolution);

        // Add phase change message *after* advancing
        const phaseChangeMessage: ChatMessage = {
            messageId: `msg-${crypto.randomUUID()}-phase-change`,
            gameId: gameId,
            speaker: { type: 'moderator' },
            speakerName: "Moderator",
            // Message depends on the *next* phase determined by advancePhase
            content: nextState.phase === 'DayDiscussion' ? `Day ${nextState.round} begins. Discuss what happened and who you suspect.` : `Day ${nextState.round} begins. Time for introductions.`, 
            timestamp: Date.now(),
            round: nextState.round,
            phase: nextState.phase,
            audience: { type: 'all' },
        };
        
        nextState = {
            ...nextState,
            conversationLog: [...nextState.conversationLog, phaseChangeMessage],
            // Clear actions/votes *after* processing and phase change
            nightActions: [], 
            votes: [], 
            turnOrderIndex: 0, // Reset turn index for the new phase
        };

        // 7. Save the final state for the night phase
        await gameStateManager.updateGameState(gameId, nextState);
        console.log(`Game ${gameId} advanced from Night to ${nextState.phase}`);

    // --- Logic specifically for DayDiscussion phase ---
    } else if (currentState.phase === 'DayDiscussion') {
        console.log(`Processing DayDiscussion phase for game ${gameId}...`);
        const nextSpeakerId = determineNextSpeaker(currentState);

        if (nextSpeakerId) {
            const nextSpeaker = currentState.players[nextSpeakerId];
            const thinkingMessageId = `msg-${crypto.randomUUID()}-thinking`;

            console.log(`Getting discussion contribution from ${nextSpeaker.name}...`);

            // 1. Add "Thinking..." message
            const thinkingMessage: ChatMessage = {
                messageId: thinkingMessageId,
                gameId: gameId,
                speaker: { type: 'player', playerId: nextSpeakerId },
                speakerName: nextSpeaker.name,
                content: "", 
                timestamp: Date.now(),
                round: currentState.round,
                phase: currentState.phase,
                audience: { type: 'all' },
                isThinking: true,
            };

            let stateWithThinking = {
                ...currentState,
                conversationLog: [...currentState.conversationLog, thinkingMessage],
            };
            // Update cache, start background save, revalidate immediately
            await gameStateManager.updateGameState(gameId, stateWithThinking);
            revalidatePath(`/game/${gameId}`); 
            console.log(`Added thinking message for ${nextSpeaker.name} discussion.`);

            // 2. Construct Prompt for Discussion
            const relevantLog = currentState.conversationLog.filter(
                msg => msg.round === currentState.round && !msg.isThinking 
            ).slice(-15);
            const conversationHistory = relevantLog.map(msg => `${msg.speakerName}: ${msg.content}`).join('\n');
            const livingPlayerNames = currentState.livingPlayerIds.map(id => currentState.players[id].name);

            const systemPrompt = `You are playing a character in a game of Werewolf.

Your Character Details:
${nextSpeaker.persona}

Your Character Name: ${nextSpeaker.name}
Your Assigned Role (SECRET): ${nextSpeaker.role}

The current game phase is Day Discussion (Round ${currentState.round}).
Living Players: ${livingPlayerNames.join(', ')}

Recent Conversation:
${conversationHistory || '[No discussion yet this round]'}

It's your turn to speak. Share your thoughts, suspicions, defend yourself, or try to guide the conversation based on your persona and secret role. Speak in the first person.
Be mindful of what you reveal. Do NOT explicitly state your role (${nextSpeaker.role}) unless you have a strategic reason within the game's context (which is rare for most roles).
Keep your response concise (2-4 sentences).`;

            const promptMessages: ChatCompletionMessageParam[] = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Okay ${nextSpeaker.name}, what are your thoughts?` }
            ];

            // 3. Get AI response
            let discussionContent = '';
            let errorMessage = '';
            try {
                 discussionContent = await getAIResponse(
                    promptMessages,
                    gameId,
                    nextSpeakerId,
                    { model: currentState.settings.aiModel, temperature: 0.7 }
                );
            } catch (error: any) {
                console.error(`AI discussion response failed for ${nextSpeakerId}:`, error);
                errorMessage = "(Seems lost in thought...)"; 
            }

            // 4. Fetch latest state again before final update
            let stateAfterThinking = await gameStateManager.getGameState(gameId);
            if (!stateAfterThinking) {
                 console.error(`Game state lost after thinking (discussion) for ${gameId}`);
                 return; 
            }

            // 5. Create final message
            const finalMessage: ChatMessage = {
                messageId: `msg-${crypto.randomUUID()}`,
                gameId: gameId,
                speaker: { type: 'player', playerId: nextSpeakerId },
                speakerName: nextSpeaker.name,
                content: errorMessage || discussionContent,
                timestamp: Date.now(), 
                round: stateAfterThinking.round,
                phase: stateAfterThinking.phase,
                audience: { type: 'all' },
                isThinking: false, // Explicitly set to false
            };

            // 6. Update Game State: Remove thinking message, add final, increment turn
            let finalState = {
                ...stateAfterThinking,
                conversationLog: [
                    ...stateAfterThinking.conversationLog.filter(msg => msg.messageId !== thinkingMessageId),
                    finalMessage
                ],
                turnOrderIndex: stateAfterThinking.turnOrderIndex + 1, 
            };
            
            // 7. Check if discussion round is over (e.g., all living players have spoken once)
            // If over, transition to Voting phase.
            const playersSpokenThisRound = finalState.turnOrderIndex;
            if (playersSpokenThisRound >= finalState.livingPlayerIds.length) {
                console.log("All living players have spoken this round. Transitioning to Voting...");
                
                // Advance to Voting Phase
                let stateBeforeVote = advancePhase(finalState);

                // Add moderator message for voting start
                const voteStartMessage: ChatMessage = {
                    messageId: `msg-${crypto.randomUUID()}`,
                    gameId: gameId,
                    speaker: { type: 'moderator' },
                    speakerName: "Moderator",
                    content: `Discussion time is over. It is now time to vote for who to eliminate.`, 
                    timestamp: Date.now(),
                    round: stateBeforeVote.round, 
                    phase: stateBeforeVote.phase, 
                    audience: { type: 'all' },
                };

                finalState = {
                    ...stateBeforeVote,
                    conversationLog: [...stateBeforeVote.conversationLog, voteStartMessage],
                    turnOrderIndex: 0, // Reset index for voting phase
                    votes: [], // Clear any previous votes
                };
                console.log(`Game ${gameId} advanced to ${finalState.phase} phase.`);
            } else {
                 console.log(`Player ${nextSpeaker.name} finished speaking. ${finalState.livingPlayerIds.length - playersSpokenThisRound} players remaining this round.`);
            }

            // 8. Save final updated state for this turn/phase change
            await gameStateManager.updateGameState(gameId, finalState);
            console.log(`DayDiscussion turn processed for ${nextSpeaker.name}. Current index: ${finalState.turnOrderIndex}`);

        } else {
            // This case should ideally not be reached if the check above handles the transition
            console.error("Reached unexpected state in DayDiscussion: No next speaker, but phase transition didn't happen.");
            // Fallback: Force transition to Voting just in case
            let stateBeforeVote = await gameStateManager.getGameState(gameId);
            if (stateBeforeVote && stateBeforeVote.phase === 'DayDiscussion') {
                 console.warn("Forcing phase transition to Voting due to unexpected state.");
                 let nextState = advancePhase(stateBeforeVote); 
                 // Add moderator message
                 const voteStartMessage: ChatMessage = {
                    messageId: `msg-${crypto.randomUUID()}`,
                    gameId: gameId,
                    speaker: { type: 'moderator' },
                    speakerName: "Moderator",
                    content: `Discussion time is over. It is now time to vote for who to eliminate.`, 
                    timestamp: Date.now(),
                    round: nextState.round, // Use round/phase from the advanced state
                    phase: nextState.phase, 
                    audience: { type: 'all' },
                };
                 nextState = { 
                    ...nextState, 
                    conversationLog: [...nextState.conversationLog, voteStartMessage], 
                    turnOrderIndex: 0, 
                    votes: [] 
                 };
                 await gameStateManager.updateGameState(gameId, nextState);
            }
        }
    }
    
    // --- Logic specifically for Voting phase ---
    else if (currentState.phase === 'Voting') {
        console.log(`Processing Voting phase for game ${gameId}...`);
        
        const livingPlayers = currentState.livingPlayerIds.map(id => currentState.players[id]).filter(p => p.status === 'alive');
        const collectedVotes: Vote[] = [];

        // Collect votes from all living players
        for (const voter of livingPlayers) {
            console.log(`Getting vote from ${voter.name}...`);
            
            // Filter out the voter themselves
            const targetOptions = livingPlayers.filter(p => p.id !== voter.id); 
            if (targetOptions.length === 0) {
                console.log(`Skipping vote for ${voter.name} (no other living players).`);
                continue;
            }

            // Create numbered list for the prompt
            const numberedTargetList = targetOptions
                .map((p, index) => `${index + 1}. ${p.name}`)
                .join('\n');

            const systemPrompt = `You are playing a character in a game of Werewolf.

Your Character Details:
${voter.persona}

Your Character Name: ${voter.name}
Your Assigned Role (SECRET): ${voter.role}

The current game phase is Voting (Round ${currentState.round}). Discussion is over. It is time to vote to eliminate a player you suspect is a werewolf.

Choose one player from the list below to vote for elimination. Respond ONLY with the number corresponding to the player.

Available Players:
${numberedTargetList}

Respond ONLY with the number.`;

            const promptMessages: ChatCompletionMessageParam[] = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Who do you vote to eliminate, ${voter.name}? (Respond with the number)` }
            ];

            let targetNumberStr = '';
            let targetPlayerId: string | null = null;
            let retries = 2;

            while (retries > 0 && targetPlayerId === null) {
                try {
                    targetNumberStr = await getAIResponse(
                        promptMessages,
                        gameId,
                        voter.id,
                        { model: currentState.settings.aiModel, temperature: 0.3 }
                    );
                     // Try to parse the response as a number
                    const choiceIndex = parseInt(targetNumberStr.trim(), 10) - 1; // Convert to 0-based index

                    // Validate the number
                    if (!isNaN(choiceIndex) && choiceIndex >= 0 && choiceIndex < targetOptions.length) {
                        // Valid number and within range
                        targetPlayerId = targetOptions[choiceIndex].id;
                        // No need to check for self-vote here as self is already filtered out
                    } else {
                        // Invalid number or out of range
                        console.warn(`Invalid vote choice \"${targetNumberStr}\" (parsed as ${choiceIndex + 1}) received from ${voter.name}. Expected 1-${targetOptions.length}. Retrying... (${retries - 1} left)`);
                        promptMessages.push({ role: 'assistant', content: targetNumberStr });
                        promptMessages.push({ role: 'user', content: `That wasn't a valid number from the list (1-${targetOptions.length}). Please respond ONLY with the number corresponding to the player you want to vote for.` });
                        retries--;
                        targetNumberStr = ''; // Reset for logging/context if needed
                    }
                } catch (error) {
                    console.error(`AI call failed for ${voter.name}'s vote:`, error);
                    retries = 0; 
                }
            }

            if (targetPlayerId) {
                const finalTargetName = currentState.players[targetPlayerId].name;
                console.log(`${voter.name} voted for ${finalTargetName} (${targetPlayerId})`);
                collectedVotes.push({ voterPlayerId: voter.id, targetPlayerId });
            } else {
                console.warn(`${voter.name} failed to provide a valid vote after retries. Their vote is abstained.`);
            }
        } // End loop through voters

        console.log("Finished collecting votes:", collectedVotes);

        const stateWithVotes = await gameStateManager.getGameState(gameId);
        if (!stateWithVotes) { console.error(`State disappeared for ${gameId} before saving votes`); return; }

        let stateAfterVoteCollection = {
            ...stateWithVotes,
            votes: collectedVotes,
        };
        await gameStateManager.updateGameState(gameId, stateAfterVoteCollection);
        console.log(`State updated with collected votes for ${gameId}.`);

        // ----- Vote Processing & Elimination -----
        console.log("Processing votes...");
        const voteCounts: { [playerId: string]: number } = {};
        collectedVotes.forEach(vote => {
            voteCounts[vote.targetPlayerId] = (voteCounts[vote.targetPlayerId] || 0) + 1;
        });

        let maxVotes = 0;
        let playersToEliminate: string[] = [];
        for (const playerId in voteCounts) {
            if (voteCounts[playerId] > maxVotes) {
                maxVotes = voteCounts[playerId];
                playersToEliminate = [playerId];
            } else if (voteCounts[playerId] === maxVotes) {
                playersToEliminate.push(playerId);
            }
        }

        let stateAfterVoting = { ...stateAfterVoteCollection };
        let eliminatedPlayerId: string | null = null;
        let voteResultMessage = '';

        // Create vote tally message content
        const voteTallyParts: string[] = [];
        livingPlayers.forEach(player => {
            const vote = collectedVotes.find(v => v.voterPlayerId === player.id);
            if (vote) {
                const targetName = stateAfterVoting.players[vote.targetPlayerId]?.name || 'Unknown Target';
                 voteTallyParts.push(`${player.name} voted for ${targetName}`);
            } else {
                 voteTallyParts.push(`${player.name} abstained`);
            }
        });
        const voteTallyString = voteTallyParts.join('. ');

        if (playersToEliminate.length === 1 && maxVotes > 0) {
            // Single player eliminated
            eliminatedPlayerId = playersToEliminate[0];
            const eliminatedPlayer = stateAfterVoting.players[eliminatedPlayerId];
            console.log(`Player ${eliminatedPlayer.name} (${eliminatedPlayerId}) was eliminated by vote.`);
            
            voteResultMessage = `The votes are in! ${voteTallyString}. With ${maxVotes} vote(s), ${eliminatedPlayer.name} has been eliminated! Their role was ${eliminatedPlayer.role}. Night falls...`;
            
            // Update player status
            const playersCopy = { ...stateAfterVoting.players };
            playersCopy[eliminatedPlayerId] = { ...playersCopy[eliminatedPlayerId], status: 'dead' };
            
            stateAfterVoting = {
                ...stateAfterVoting,
                players: playersCopy,
                livingPlayerIds: stateAfterVoting.livingPlayerIds.filter(id => id !== eliminatedPlayerId),
                lastEliminatedPlayerId: eliminatedPlayerId
            };
            
        } else if (playersToEliminate.length > 1) {
            // Tie vote
            const tiedNames = playersToEliminate.map(id => stateAfterVoting.players[id]?.name || 'Unknown').join(' and ');
            console.log(`Vote tied between ${tiedNames}. No one is eliminated.`);
            voteResultMessage = `The votes are in! ${voteTallyString}. It's a tie between ${tiedNames} with ${maxVotes} vote(s) each! No one is eliminated. Night falls...`;
            // No status update needed
            stateAfterVoting = { ...stateAfterVoting, lastEliminatedPlayerId: undefined };

        } else {
            // No votes cast or only abstentions
            console.log("No majority vote or no votes cast. No one is eliminated.");
            voteResultMessage = `The votes are in! ${voteTallyString}. No majority was reached. No one is eliminated. Night falls...`;
             stateAfterVoting = { ...stateAfterVoting, lastEliminatedPlayerId: undefined };
        }
        
         // Add the vote result message
         const voteResultMessageObj: ChatMessage = {
            messageId: `msg-${crypto.randomUUID()}-vote-result`,
            gameId: gameId,
            speaker: { type: 'moderator' },
            speakerName: "Moderator",
            content: voteResultMessage,
            timestamp: Date.now(),
            round: stateAfterVoting.round, // Current round
            phase: stateAfterVoting.phase, // Still Voting phase during result announcement
            audience: { type: 'all' },
         };
        
        stateAfterVoting = {
             ...stateAfterVoting,
             conversationLog: [...stateAfterVoting.conversationLog, voteResultMessageObj]
        };

        // Check win condition AFTER elimination
        stateAfterVoting = checkWinCondition(stateAfterVoting);
        if (stateAfterVoting.phase === 'GameOver') {
            console.log(`Game Over detected after vote resolution. Winner: ${stateAfterVoting.winner}`);
            const gameOverMessage: ChatMessage = {
                messageId: `msg-${crypto.randomUUID()}-gameover`,
                gameId: gameId,
                speaker: { type: 'moderator' },
                speakerName: "Moderator",
                content: `The game is over! The ${stateAfterVoting.winner} team wins!`,
                timestamp: Date.now(),
                round: stateAfterVoting.round,
                phase: stateAfterVoting.phase,
                audience: { type: 'all' },
            };
            stateAfterVoting = {
                ...stateAfterVoting,
                conversationLog: [...stateAfterVoting.conversationLog, gameOverMessage]
            };
            await gameStateManager.updateGameState(gameId, stateAfterVoting);
            console.log(`Game ${gameId} ended.`);
            revalidatePath(`/game/${gameId}`);
            return; // End action here
        }

        // If game not over, advance to Night phase
        let nextState = advancePhase(stateAfterVoting);

        // Message is implicit in the vote result ("Night falls...")
        // No separate phase change message needed here usually

        nextState = {
            ...nextState,
            // conversationLog: [...nextState.conversationLog, phaseChangeMessage], // Optional if needed
            turnOrderIndex: 0,
            nightActions: [], // Clear actions for the new night
            // Votes are already processed and stored in stateAfterVoting if needed for history
        };

        await gameStateManager.updateGameState(gameId, nextState);
        console.log(`Game ${gameId} advanced from Voting to ${nextState.phase}`);

    }

    else { // Fallback for other unimplemented phases
        console.warn(`runGameTurnAction not implemented for phase: ${currentState.phase}`);
    }

    // Final Revalidation for the entire turn action
    revalidatePath(`/game/${gameId}`);
}

/**
 * Server Action to delete a specific game.
 * 
 * @param gameId The ID of the game to delete.
 * @throws If deletion fails.
 */
export async function deleteGameAction(gameId: string): Promise<void> {
    console.log(`Attempting to delete game: ${gameId}`);
    try {
        const deleted = await gameStateManager.deleteGame(gameId);
        if (deleted) {
            console.log(`Game ${gameId} deleted successfully.`);
        } else {
            console.warn(`Game ${gameId} deletion reported failure, but may have succeeded (e.g., file not found).`);
        }
    } catch (error: any) {
        console.error(`Failed to delete game ${gameId}:`, error);
        // Optionally re-throw or return error details
        throw new Error(`Failed to delete game: ${error.message}`);
    }
    // Revalidate the home page to update the list of games
    revalidatePath('/');
}

/**
 * Server Action to generate a single AI character profile AND select an image.
 * Returns the profile, role, and selected imageUrl or null.
 */
export async function generateCharacterAction(
    role: Role, 
    aiModel: string
): Promise<GenerateCharacterResult | { error: string }> { // Update return type
    console.log(`Generating profile and selecting image for role: ${role} using model ${aiModel}`);
    try {
        // 1. Generate Profile
        const profile = await generateAICharacterProfile(role, aiModel);
        if (!profile) {
            throw new Error("AI failed to generate a valid profile.");
        }
        
        // 2. Select Image based on generated profile
        const imageUrl = await selectCharacterImage(profile.gender, profile.ageCategory);
        
        // 3. Return combined data
        return { role, profile, imageUrl };
    } catch (error: any) {
        console.error(`Error in generateCharacterAction for ${role}:`, error);
        return { error: `Failed to generate character: ${error.message || 'Unknown error'}` };
    }
}

// Add empty export for module compatibility if needed
export {};