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
import retry from 'async-retry'; // Import async-retry
import type { Options as RetryOptions } from 'async-retry'; // Import types for options
import { cleanAIResponse } from '../lib/utils/stringUtils'; // Import cleaning utility

// ElevenLabs configuration
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1";

// Define the expected input shape for the action
interface StartGameConfig {
    aiModel: string;
    roleDistribution: Record<Role, number>;
}

// Extend the expected return type for generateCharacterAction
// Add voiceId here as well, although assigned later
type GenerateCharacterResult = PlayerInitializationData & { imageUrl?: string | null, voiceId?: string };

// Helper function to fetch ElevenLabs voices
async function getElevenLabsVoices(): Promise<{ voice_id: string, name: string, category: string }[]> {
    if (!ELEVENLABS_API_KEY) {
        console.warn('ElevenLabs API key not configured. Skipping voice fetching.');
        return [];
    }
    try {
        const response = await fetch(`${ELEVENLABS_API_URL}/voices`, {
            headers: {
                'xi-api-key': ELEVENLABS_API_KEY,
            },
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch ElevenLabs voices: ${response.statusText}`);
        }
        const data = await response.json();
        return data.voices || [];
    } catch (error) {
        console.error("Error fetching ElevenLabs voices:", error);
        return [];
    }
}

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

        // --- Fetch Voices --- 
        const availableVoices = await getElevenLabsVoices();
        const usableVoices = availableVoices.filter(v => v.category === 'premade'); // Use only premade voices
        let voiceIndex = 0;

        // --- Assign Voices to Init Data (before passing to initializeNewGame) ---
        const playersWithVoicesAssigned = playerInitDataList.map(playerInit => {
            let assignedVoiceId: string | undefined = undefined;
            if (usableVoices.length > 0) {
                assignedVoiceId = usableVoices[voiceIndex % usableVoices.length].voice_id;
                voiceIndex++;
            }
            return { ...playerInit, voiceId: assignedVoiceId }; 
        });

        // --- Construct Settings --- 
        const numPlayers = playersWithVoicesAssigned.length;
        const settings: GameSettings = { 
            roleDistribution: playersWithVoicesAssigned.reduce((acc, curr) => {
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
        // Pass player data with voice IDs assigned to initializeNewGame
        const initialGameState = await initializeNewGame(settings, gameId, createdAt, playersWithVoicesAssigned); 
        
        // --- Save Game State --- 
        const newGame = await gameStateManager.createAndSaveGame(initialGameState); // Use the correct method
        console.log(`New game created with ID: ${newGame.gameId}`);
        gameIdToRedirect = newGame.gameId;

    } catch (error: any) {
        if (error.digest?.startsWith('NEXT_REDIRECT')) throw error; 
        console.error("Failed to start new game:", error);
        return { error: `Failed to create the game: ${error.message || 'Unknown error'}` }; 
    }

    if (gameIdToRedirect) {
        redirect(`/game/${gameIdToRedirect}`);
    } else {
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
Your task is to introduce yourself briefly to the other players (1-2 sentences, maximum 30 words).
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
            const rawIntroductionContent = await getAIResponse(
                promptMessages,
                gameId,
                nextSpeakerId,
                { model: currentState.settings.aiModel, temperature: 0.8, max_tokens: 800 } // Increased tokens for thinking
            );

            const introductionContent = cleanAIResponse(rawIntroductionContent); // Clean

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
                    const rawTargetNumberStr = await getAIResponse(
                        promptMessages,
                        gameId,
                        activePlayer.id,
                        { model: currentState.settings.aiModel, temperature: 0.3, max_tokens: 50 }
                    );
                    targetNumberStr = cleanAIResponse(rawTargetNumberStr); // Clean
                    const choiceIndex = parseInt(targetNumberStr.trim(), 10) - 1; // Convert to 0-based index

                    // Validate the number
                    if (!isNaN(choiceIndex) && choiceIndex >= 0 && choiceIndex < targetOptions.length) {
                        // Valid number and within range
                        targetPlayerId = targetOptions[choiceIndex].id;
                        // Further validation (e.g., werewolf targeting werewolf) is implicitly handled by targetOptions generation now
                    } else {
                        // Invalid number or out of range
                        console.warn(`Invalid night action choice "${targetNumberStr}" (parsed as ${choiceIndex + 1}) received from ${activePlayer.name} (${activePlayer.role}). Expected 1-${targetOptions.length}. Retrying... (${retries - 1} left)`);
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
Keep your response concise (2-4 sentences, maximum 30 words).`;

            const promptMessages: ChatCompletionMessageParam[] = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Okay ${nextSpeaker.name}, what are your thoughts?` }
            ];

            // 3. Get AI response
            let rawDiscussionContent = '';
            let errorMessage = '';
            try {
                 rawDiscussionContent = await getAIResponse(
                    promptMessages,
                    gameId,
                    nextSpeakerId,
                    { model: currentState.settings.aiModel, temperature: 0.7, max_tokens: 800 } // Increased tokens for thinking
                );
            } catch (error: any) {
                console.error(`AI discussion response failed for ${nextSpeakerId}:`, error);
                errorMessage = "(Seems lost in thought...)"; 
            }

            const discussionContent = errorMessage || cleanAIResponse(rawDiscussionContent); // Clean

            // 4. Fetch latest state again before final update
            let stateAfterThinking = await gameStateManager.getGameState(gameId);
            if (!stateAfterThinking) {
                 console.error(`Game state lost after thinking (discussion) for ${gameId}`);
                 return; 
            }

            // 5. Create final message
            // Log the content right before creating the message object
            console.log(`[${gameId}|${nextSpeakerId}] Final discussion content before state update:`, discussionContent);
            
            const finalMessage: ChatMessage = {
                messageId: `msg-${crypto.randomUUID()}`,
                gameId: gameId,
                speaker: { type: 'player', playerId: nextSpeakerId },
                speakerName: nextSpeaker.name,
                content: discussionContent,
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
                    const rawTargetNumberStr = await getAIResponse(
                        promptMessages,
                        gameId,
                        voter.id,
                        { model: currentState.settings.aiModel, temperature: 0.3, max_tokens: 50 }
                    );
                    targetNumberStr = cleanAIResponse(rawTargetNumberStr); // Clean
                    const choiceIndex = parseInt(targetNumberStr.trim(), 10) - 1; // Convert to 0-based index

                    // Validate the number
                    if (!isNaN(choiceIndex) && choiceIndex >= 0 && choiceIndex < targetOptions.length) {
                        // Valid number and within range
                        targetPlayerId = targetOptions[choiceIndex].id;
                        // No need to check for self-vote here as self is already filtered out
                    } else {
                        // Invalid number or out of range
                        console.warn(`Invalid vote choice "${targetNumberStr}" (parsed as ${choiceIndex + 1}) received from ${voter.name}. Expected 1-${targetOptions.length}. Retrying... (${retries - 1} left)`);
                        promptMessages.push({ role: 'assistant', content: targetNumberStr });
                        promptMessages.push({ role: 'user', content: `That wasn't a valid number from the list (1-${targetOptions.length}). Please respond ONLY with the number corresponding to the player you want to vote for.` });
                        retries--;
                        targetNumberStr = ''; // Reset for logging/context if needed
                    }
                } catch (error) {
                    console.error(`AI call failed for ${voter.name}'s vote:`, error);
                    retries = 0; // Stop retrying on API error
                }
            }

            // Add the vote if a valid target was selected
            if (targetPlayerId) {
                const finalTargetName = currentState.players[targetPlayerId].name; // Get canonical name
                console.log(`${voter.name} voted for ${finalTargetName} (${targetPlayerId})`);
                collectedVotes.push({ voterPlayerId: voter.id, targetPlayerId });
            } else {
                console.warn(`${voter.name} failed to provide a valid vote target after retries.`);
                // Handle failure - e.g., abstention or random vote? For now, just log.
            }
        } // End loop collecting votes

        console.log("Finished collecting votes:", collectedVotes);

        // Fetch latest state before tallying
        const stateBeforeTally = await gameStateManager.getGameState(gameId);
        if (!stateBeforeTally) { console.error(`State disappeared for ${gameId} before tallying`); return; }

        let stateWithVotes = {
            ...stateBeforeTally,
            votes: collectedVotes,
        };

        // --- Vote Tally and Resolution ---
        let stateAfterTally = { ...stateWithVotes };
        let voteModeratorMessages: ChatMessage[] = [];
        let dayEliminatedPlayerId: string | null = null;

        if (stateAfterTally.votes.length > 0) {
            const voteCounts: Record<string, number> = {};
            stateAfterTally.votes.forEach(vote => {
                voteCounts[vote.targetPlayerId] = (voteCounts[vote.targetPlayerId] || 0) + 1;
            });

            console.log("Vote Counts:", voteCounts);

            let maxVotes = 0;
            let playersWithMaxVotes: string[] = [];
            for (const playerId in voteCounts) {
                if (voteCounts[playerId] > maxVotes) {
                    maxVotes = voteCounts[playerId];
                    playersWithMaxVotes = [playerId];
                } else if (voteCounts[playerId] === maxVotes) {
                    playersWithMaxVotes.push(playerId);
                }
            }

            // Format vote results message
            const voteDetails = Object.entries(voteCounts)
                .map(([targetId, count]) => `- ${stateAfterTally.players[targetId]?.name || 'Unknown'}: ${count} ${count === 1 ? 'vote' : 'votes'}`)
                .join('\n');
            const votesMessage: ChatMessage = {
                messageId: `msg-${crypto.randomUUID()}-votes`,
                gameId: gameId,
                speaker: { type: 'moderator' },
                speakerName: "Moderator",
                content: `The votes are in!\n${voteDetails}`,
                timestamp: Date.now(),
                round: stateAfterTally.round,
                phase: stateAfterTally.phase,
                audience: { type: 'all' },
            };
            voteModeratorMessages.push(votesMessage);

            if (playersWithMaxVotes.length === 1) {
                // Clear winner
                dayEliminatedPlayerId = playersWithMaxVotes[0];
                const eliminatedPlayer = stateAfterTally.players[dayEliminatedPlayerId];
                console.log(`Player ${eliminatedPlayer?.name} (${dayEliminatedPlayerId}) received the most votes (${maxVotes}) and will be eliminated.`);
                const eliminationMessage: ChatMessage = {
                    messageId: `msg-${crypto.randomUUID()}-elimination`,
                    gameId: gameId,
                    speaker: { type: 'moderator' },
                    speakerName: "Moderator",
                    content: `With ${maxVotes} votes, ${eliminatedPlayer?.name} has been eliminated by the village. They were a ${eliminatedPlayer?.role}.`, // Reveal role on day death
                    timestamp: Date.now() + 1, // Ensure it appears after vote counts
                    round: stateAfterTally.round,
                    phase: stateAfterTally.phase,
                    audience: { type: 'all' },
                };
                voteModeratorMessages.push(eliminationMessage);

            } else {
                // Tie
                console.log(`Vote resulted in a tie between ${playersWithMaxVotes.length} players with ${maxVotes} votes each.`);
                const tiedPlayerNames = playersWithMaxVotes.map(id => stateAfterTally.players[id]?.name || 'Unknown').join(' and ');
                 const tieMessage: ChatMessage = {
                    messageId: `msg-${crypto.randomUUID()}-tie`,
                    gameId: gameId,
                    speaker: { type: 'moderator' },
                    speakerName: "Moderator",
                    content: `The vote is tied between ${tiedPlayerNames}! No one is eliminated today.`, 
                    timestamp: Date.now() + 1, 
                    round: stateAfterTally.round,
                    phase: stateAfterTally.phase,
                    audience: { type: 'all' },
                };
                voteModeratorMessages.push(tieMessage);
            }
        } else {
            // No votes cast (e.g., only 1 player left?)
             console.log("No votes were cast in this round.");
             const noVotesMessage: ChatMessage = {
                messageId: `msg-${crypto.randomUUID()}-novotes`,
                gameId: gameId,
                speaker: { type: 'moderator' },
                speakerName: "Moderator",
                content: `No votes were cast. The village remains undecided.`, 
                timestamp: Date.now(),
                round: stateAfterTally.round,
                phase: stateAfterTally.phase,
                audience: { type: 'all' },
            };
             voteModeratorMessages.push(noVotesMessage);
        }

        // Update player status if elimination occurred
        if (dayEliminatedPlayerId) {
            const playersCopy = { ...stateAfterTally.players };
            playersCopy[dayEliminatedPlayerId] = { ...playersCopy[dayEliminatedPlayerId], status: 'dead' };
            
            stateAfterTally = {
                ...stateAfterTally,
                players: playersCopy,
                livingPlayerIds: stateAfterTally.livingPlayerIds.filter(id => id !== dayEliminatedPlayerId),
                lastEliminatedPlayerId: dayEliminatedPlayerId,
            };
        }

         stateAfterTally = {
             ...stateAfterTally,
             conversationLog: [...stateAfterTally.conversationLog, ...voteModeratorMessages],
         };

        // Check Win Condition *after* vote resolution
        stateAfterTally = checkWinCondition(stateAfterTally);
        if (stateAfterTally.phase === 'GameOver') {
            console.log(`Game Over detected after vote resolution. Winner: ${stateAfterTally.winner}`);
             const gameOverMessage: ChatMessage = {
                messageId: `msg-${crypto.randomUUID()}-gameover-vote`,
                gameId: gameId,
                speaker: { type: 'moderator' },
                speakerName: "Moderator",
                content: `The game is over! The ${stateAfterTally.winner} team wins!`, 
                timestamp: Date.now(),
                round: stateAfterTally.round, 
                phase: stateAfterTally.phase, 
                audience: { type: 'all' },
             };
             stateAfterTally = {
                 ...stateAfterTally,
                 conversationLog: [...stateAfterTally.conversationLog, gameOverMessage]
             };
             // Save final game over state
             await gameStateManager.updateGameState(gameId, stateAfterTally);
             console.log(`Game ${gameId} ended after voting.`);
             revalidatePath(`/game/${gameId}`);
             return; // End action
        }

        // Advance Phase (to Night)
        let nextState = advancePhase(stateAfterTally);

        // Add phase change message
        const nightStartMessage: ChatMessage = {
            messageId: `msg-${crypto.randomUUID()}-night-start`,
            gameId: gameId,
            speaker: { type: 'moderator' },
            speakerName: "Moderator",
            content: `The sun sets. Night ${nextState.round} falls upon the village. Close your eyes...`, 
            timestamp: Date.now(),
            round: nextState.round,
            phase: nextState.phase,
            audience: { type: 'all' },
        };

        nextState = {
            ...nextState,
            conversationLog: [...nextState.conversationLog, nightStartMessage],
            // Clear actions/votes for the new night phase
            nightActions: [], 
            votes: [], 
            turnOrderIndex: 0, // Reset index (though not strictly needed for Night)
        };

        // Save the final state for the voting phase transition
        await gameStateManager.updateGameState(gameId, nextState);
        console.log(`Game ${gameId} advanced from Voting to ${nextState.phase}`);
    } 

    // --- Generic Revalidation --- 
    // Revalidate the path to ensure the UI updates with the latest state changes
    revalidatePath(`/game/${gameId}`);
    console.log(`Path revalidated for game ${gameId}`);
}

// --- Game Deletion Action --- 

/**
 * Deletes a game state file.
 * @param gameId The ID of the game to delete.
 */
export async function deleteGameAction(gameId: string): Promise<void> {
    console.log(`Attempting to delete game: ${gameId}`);
    try {
        await gameStateManager.deleteGame(gameId);
        console.log(`Game ${gameId} deleted successfully.`);
        revalidatePath('/'); // Revalidate the home page (or wherever games are listed)
    } catch (error) {
        console.error(`Failed to delete game ${gameId}:`, error);
        // Rethrow or handle as appropriate for your UI
        throw new Error(`Could not delete game ${gameId}.`);
    }
}

// --- Character Generation Action --- 

/**
 * Action to generate a single AI character profile based on a role.
 * Uses async-retry to handle potential API flakiness.
 * @param role The role for the character.
 * @param aiModel The AI model to use.
 * @param existingProfiles Profiles already generated in this session, to encourage variety.
 * @returns A promise resolving to the generated character profile or an error object.
 */
export async function generateCharacterAction(
    role: Role, 
    aiModel: string,
    existingProfiles: AICharacterProfile[] 
): Promise<GenerateCharacterResult | { error: string }> { 
    console.log(`Generating character profile for role: ${role} using model ${aiModel}`);

    // Define retry options
    const retryOptions: RetryOptions = {
        retries: 2, // Try the initial attempt + 2 retries
        minTimeout: 500, // Start with 500ms delay
        factor: 2, // Double the delay each time
        onRetry: (error: unknown, attempt) => { // Correct type for onRetry error
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.warn(`Attempt ${attempt} failed for role ${role}: ${errorMessage}. Retrying...`);
        }
    };

    try {
        // Wrap the AI call with retry logic
        const profile: AICharacterProfile | null = await retry(async (bail, attempt) => {
            try {
                // Pass existing profiles to the generation function
                return await generateAICharacterProfile(role, aiModel, existingProfiles);
            } catch (error: any) {
                // Don't retry on non-transient errors (e.g., bad request, auth error)
                if (error.status && error.status >= 400 && error.status < 500) {
                    bail(new Error(`Non-retryable error (${error.status}): ${error.message}`));
                    return null; // Return null, bail will throw
                }
                // Otherwise, throw to trigger retry
                throw error;
            }
        }, retryOptions);

        if (!profile || !profile.characterName) {
            throw new Error("Generated profile was incomplete after retries.");
        }

        // Select an image based on the generated profile
        // Pass required arguments to selectCharacterImage
        const imageUrl = await selectCharacterImage(profile.gender, profile.ageCategory);

        console.log(`Successfully generated profile for ${profile.characterName} (${role}), Image: ${imageUrl}`);
        
        // Combine profile, role, and image URL for the result
        const result: GenerateCharacterResult = {
            role: role,
            profile: profile,
            imageUrl: imageUrl,
            // voiceId is assigned later in startGameAction
        };
        return result;

    } catch (error: any) {
        console.error(`Failed to generate character profile for role ${role} after retries:`, error);
        return { error: `Failed to generate character: ${error.message || 'Unknown error'}` };
    }
}