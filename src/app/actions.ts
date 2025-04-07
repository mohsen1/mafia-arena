'use server';

import { gameStateManager } from '@/lib/state/gameStateManager';
import { determineNextSpeaker, initializeNewGame, advancePhase, checkWinCondition } from '@/lib/game/engine'; // Added initializeNewGame, advancePhase, checkWinCondition
import { getAIResponse } from '@/lib/ai/openaiService';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { ChatMessage, GameState, NightAction, Player, Vote } from '@/lib/types/game'; // Added Vote
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
                    prompt = `${systemPromptBase}\n\nAs a Werewolf, choose one player from the list below to eliminate tonight. Respond ONLY with the exact name of the player you choose.\n\nLiving Non-Werewolf Players:\n${targetOptions.map(p => `- ${p.name}`).join('\n')}`;
                    break;
                case 'Seer':
                    targetOptions = livingPlayers.filter(p => p.status === 'alive' && p.id !== activePlayer.id);
                    prompt = `${systemPromptBase}\n\nAs the Seer, choose one player from the list below to investigate their role (Werewolf or Villager). Respond ONLY with the exact name of the player you choose.\n\nOther Living Players:\n${targetOptions.map(p => `- ${p.name}`).join('\n')}`;
                    break;
                case 'Doctor':
                    targetOptions = livingPlayers.filter(p => p.status === 'alive');
                    prompt = `${systemPromptBase}\n\nAs the Doctor, choose one player from the list below to protect from elimination tonight. You may choose yourself. Respond ONLY with the exact name of the player you choose.\n\nLiving Players:\n${targetOptions.map(p => `- ${p.name}`).join('\n')}`;
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

            let targetName = '';
            let targetPlayerId: string | null = null;
            let retries = 2;

            // Retry loop for getting a valid target name from AI
            while (retries > 0 && targetPlayerId === null) {
                try {
                    targetName = await getAIResponse(
                        promptMessages,
                        gameId,
                        activePlayer.id,
                        { model: currentState.settings.aiModel, temperature: 0.3 }
                    );
                    targetName = targetName.replace(/[^a-zA-Z0-9\s'-]/g, '').trim(); // Sanitize name slightly

                    targetPlayerId = getPlayerIdByName(targetName);
                    if (!targetPlayerId) {
                        // AI provided an invalid name
                        console.warn(`Invalid target name \"${targetName}\" received from ${activePlayer.name}. Retrying... (${retries - 1} left)`);
                        promptMessages.push({ role: 'assistant', content: targetName });
                        promptMessages.push({ role: 'user', content: `That name wasn't on the list of living players or was spelled incorrectly. Please look at the list again and respond ONLY with the exact name.` });
                        retries--;
                        targetName = ''; // Reset for next attempt
                    } else {
                        // AI provided a valid player name, now check if it's a valid *target* for the role
                        if (!targetOptions.some(p => p.id === targetPlayerId)) {
                            console.warn(`Target \"${targetName}\" (${targetPlayerId}) is not a valid option for ${activePlayer.role}. Retrying... (${retries - 1} left)`);
                            promptMessages.push({ role: 'assistant', content: targetName });
                            promptMessages.push({ role: 'user', content: `You cannot target ${targetName} with your ability according to the rules. Please choose a different name from the valid list.` });
                            retries--;
                            targetPlayerId = null; // Invalidate targetId, keep targetName for context
                            targetName = '';
                        }
                        // If valid name AND valid target option, the loop will exit
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
            
            if (saveAction && saveAction.targetPlayerId === targetId) {
                console.log(`Player ${targetPlayer.name} (${targetId}) was targeted for elimination but saved by the Doctor.`);
                // No public message needed, maybe internal log?
            } else {
                console.log(`Player ${targetPlayer.name} (${targetId}) was eliminated by werewolves.`);
                eliminatedPlayerId = targetId;
            }
        } else {
            console.log("No werewolf kill action was performed this night.");
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
            // Note: No public message about the seer result.
        }

        // 4. Generate Moderator Message based on elimination
        let summaryContent = '';
        if (eliminatedPlayerId) {
            const eliminatedPlayerName = stateAfterResolution.players[eliminatedPlayerId].name;
            summaryContent = `A scream pierces the night! The villagers gather in the morning to find ${eliminatedPlayerName} dead.`;
        } else if (killAction && saveAction && killAction.targetPlayerId === saveAction.targetPlayerId) {
             summaryContent = "A chilling silence fell over the village, but dawn arrives without incident. Someone was lucky tonight.";
        } else {
            summaryContent = "The night passes uneventfully.";
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

        // Helper to get living player ID by name
        const getPlayerIdByName = (name: string): string | null => {
            const lowerCaseName = name.toLowerCase().trim();
            const player = livingPlayers.find(p => p.name.toLowerCase() === lowerCaseName);
            return player ? player.id : null;
        };

        // Collect votes from all living players
        for (const voter of livingPlayers) {
            console.log(`Getting vote from ${voter.name}...`);
            
            const targetOptions = livingPlayers.filter(p => p.id !== voter.id);
            if (targetOptions.length === 0) {
                console.log(`Skipping vote for ${voter.name} (no other living players).`);
                continue;
            }

            const systemPrompt = `You are playing a character in a game of Werewolf.

Your Character Details:
${voter.persona}

Your Character Name: ${voter.name}
Your Assigned Role (SECRET): ${voter.role}

The current game phase is Voting (Round ${currentState.round}). Discussion is over. It is time to vote to eliminate a player you suspect is a werewolf.

Living Players (You cannot vote for yourself):
${targetOptions.map(p => `- ${p.name}`).join('\n')}

Consider the discussion and your suspicions. Choose one player from the list above to vote for elimination. Respond ONLY with the exact name of the player you are voting for.`;

            const promptMessages: ChatCompletionMessageParam[] = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Who do you vote to eliminate, ${voter.name}?` }
            ];

            let targetName = '';
            let targetPlayerId: string | null = null;
            let retries = 2;

            while (retries > 0 && targetPlayerId === null) {
                try {
                    targetName = await getAIResponse(
                        promptMessages,
                        gameId,
                        voter.id,
                        { model: currentState.settings.aiModel, temperature: 0.3 }
                    );
                    targetName = targetName.replace(/[^a-zA-Z0-9\s'-]/g, '').trim(); 

                    targetPlayerId = getPlayerIdByName(targetName);
                    if (!targetPlayerId) {
                        console.warn(`Invalid vote target name \"${targetName}\" received from ${voter.name}. Retrying... (${retries - 1} left)`);
                        promptMessages.push({ role: 'assistant', content: targetName });
                        promptMessages.push({ role: 'user', content: `That name wasn't on the list of living players or was spelled incorrectly. Please look at the list again and respond ONLY with the exact name.` });
                        retries--;
                        targetName = ''; 
                    } else {
                        if (targetPlayerId === voter.id) {
                            console.warn(`${voter.name} tried to vote for themselves. Retrying... (${retries - 1} left)`);
                            promptMessages.push({ role: 'assistant', content: targetName });
                            promptMessages.push({ role: 'user', content: `You cannot vote for yourself. Please choose another player from the list.` });
                            retries--;
                            targetPlayerId = null; 
                            targetName = '';
                        } else if (!targetOptions.some(p => p.id === targetPlayerId)) {
                            console.warn(`Target \"${targetName}\" (${targetPlayerId}) is not a valid target (e.g., dead or typo). Retrying... (${retries - 1} left)`);
                             promptMessages.push({ role: 'assistant', content: targetName });
                             promptMessages.push({ role: 'user', content: `That name wasn't on the list of valid targets. Please choose a name exactly as listed.` });
                             retries--;
                             targetPlayerId = null; 
                             targetName = '';
                        }
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

        // ----- Vote Processing & Elimination (Placeholder/Next Step) -----
        // TODO: Implement Vote Processing Logic

        // --- TEMPORARY: Skip vote processing, advance phase --- 
        console.warn("Vote PROCESSING logic not implemented yet. Advancing phase.");
        let stateAfterVoting = { ...stateAfterVoteCollection };
        let nextState = advancePhase(stateAfterVoting);

        const phaseChangeMessage: ChatMessage = {
            messageId: `msg-${crypto.randomUUID()}`,
            gameId: gameId,
            speaker: { type: 'moderator' },
            speakerName: "Moderator",
            content: `The votes are cast. Night falls...`, // Placeholder message
            timestamp: Date.now(),
            round: nextState.round,
            phase: nextState.phase,
            audience: { type: 'all' },
        };
        nextState = {
            ...nextState,
            conversationLog: [...nextState.conversationLog, phaseChangeMessage],
            turnOrderIndex: 0,
            nightActions: [],
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