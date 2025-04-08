"use server";

import { SupportedLanguage } from "@/hooks/useGameConfig";
import { generateAICharacterProfile, getAIResponse } from "@/lib/ai/openaiService";
import { GENERATE_UI_TRANSLATION_PROMPT } from "@/lib/ai/PROMPTS";
import { DEFAULT_GAME_SETTINGS } from "@/lib/config"; // Added config imports
import {
    advancePhase,
    checkWinCondition,
    determineNextSpeaker,
    initializeNewGame,
} from "@/lib/game/engine"; // Added initializeNewGame, advancePhase, checkWinCondition
import { gameStateManager } from "@/lib/state/gameStateManager";
import dictionaryDataJson from '@/lib/translation/dictionary.json'; // Import the source dictionary
import {
    DictionaryData,
    LanguageCode,
    supportedLanguagesMap,
    TranslationEntry // Assuming these types are defined correctly in languages.ts or elsewhere
} from "@/lib/translation/languages";
import {
    AICharacterProfile,
    ChatMessage,
    GameSettings,
    NightAction,
    Player,
    PlayerInitializationData,
    Role,
    Vote
} from "@/lib/types/game"; // Added Vote and Role, PlayerInitializationData, AICharacterProfile
import { selectCharacterImage } from "@/lib/utils/imageUtils"; // Import image utility
import crypto from "crypto";
import fs from "fs/promises"; // OK to use fs in server actions
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation"; // Added redirect
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import path from "path";
import {
    DAY_DISCUSSION_PROMPT,
    DAY_INTRODUCTION_PROMPT,
    NIGHT_ACTION_DOCTOR_PROMPT,
    NIGHT_ACTION_SEER_PROMPT,
    NIGHT_ACTION_WEREWOLF_PROMPT,
    VOTING_PROMPT,
} from "../lib/ai/PROMPTS"; // Import game turn prompts
import { cleanAIResponse } from "../lib/utils/stringUtils"; // Import cleaning utility

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
type GenerateCharacterResult = PlayerInitializationData & {
  imageUrl?: string | null;
  voiceId?: string;
  aiModel: string;
};

// Helper function to fetch ElevenLabs voices
async function getElevenLabsVoices(): Promise<
  { voice_id: string; name: string; category: string }[]
> {
  if (!ELEVENLABS_API_KEY) {
    console.warn("ElevenLabs API key not configured. Skipping voice fetching.");
    return [];
  }
  try {
    const response = await fetch(`${ELEVENLABS_API_URL}/voices`, {
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
      },
    });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch ElevenLabs voices: ${response.statusText}`
      );
    }
    const data = await response.json();
    return data.voices || [];
  } catch (error) {
    console.error("Error fetching ElevenLabs voices:", error);
    return [];
  }
}

// Action to start a new game - Accepts player list and language
export async function startGameAction(
  playerInitDataList: GenerateCharacterResult[],
  language: SupportedLanguage
) {
  console.log(
    `Attempting to start a new game with ${playerInitDataList.length} players in ${language}...`
  );

  let gameIdToRedirect: string | null = null;
  try {
    // --- Basic Validation ---
    if (!playerInitDataList || playerInitDataList.length < 5) {
      throw new Error("A minimum of 5 players is required.");
    }
    // --- End Validation ---

    // --- Fetch Voices ---
    const availableVoices = await getElevenLabsVoices();
    const usableVoices = availableVoices.filter(
      (v) => v.category === "premade"
    ); // Use only premade voices
    let voiceIndex = 0;

    // --- Assign Voices to Init Data (before passing to initializeNewGame) ---
    const playersWithVoicesAssigned = playerInitDataList.map((playerInit) => {
      let assignedVoiceId: string | undefined = undefined;
      if (usableVoices.length > 0) {
        assignedVoiceId =
          usableVoices[voiceIndex % usableVoices.length].voice_id;
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
      discussionRoundsPerPlayer:
        DEFAULT_GAME_SETTINGS.discussionRoundsPerPlayer,
      numPlayers: numPlayers,
    };
    // --- End Settings ---

    const gameId = `game-${crypto.randomUUID()}`;
    const createdAt = Date.now();

    // --- Initialize Game State ---
    // Pass player data with voice IDs assigned to initializeNewGame
    const initialGameState = await initializeNewGame(
      settings,
      gameId,
      createdAt,
      playersWithVoicesAssigned,
      language
    );

    // --- Save Game State ---
    const newGame = await gameStateManager.createAndSaveGame(initialGameState); // Use the correct method
    console.log(`New game created with ID: ${newGame.gameId}`);
    gameIdToRedirect = newGame.gameId;
  } catch (error: any) {
    if (error.digest?.startsWith("NEXT_REDIRECT")) throw error;
    console.error("Failed to start new game:", error);
    return {
      error: `Failed to create the game: ${error.message || "Unknown error"}`,
    };
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

  // Get language from state
  const language = currentState.language;
  const languageInstruction = `\n\nIMPORTANT: Respond ONLY in ${language}.`;

  if (currentState.phase === "GameOver") {
    console.log(`Game ${gameId} is already over.`);
    return;
  }

  // --- Add Initial Welcome Message if needed ---
  // Check if it's the very start of the game (before first turn)
  if (
    currentState.round === 1 &&
    currentState.phase === "DayIntroductions" &&
    currentState.turnOrderIndex === 0 &&
    currentState.conversationLog.length === 0 // Ensure it hasn't been added already
  ) {
      const originalWelcomeMsg = `Welcome to "${currentState.title || 'Werewolf AI'}"! ${currentState.livingPlayerIds.length} players have gathered. The first phase is introductions. Each player will briefly introduce themselves.`;
      const translatedWelcomeMsg = await translateText(originalWelcomeMsg, language);
      const welcomeMessage: ChatMessage = {
           messageId: `msg-${crypto.randomUUID()}-init`,
           gameId: gameId,
           speaker: { type: "moderator" },
           speakerName: "Moderator",
           content: translatedWelcomeMsg,
           timestamp: Date.now() - 1000, // Slightly before first action
           round: currentState.round,
           phase: currentState.phase,
           audience: { type: "all" },
       };
       // Add message and update state *before* proceeding
       currentState = {
           ...currentState,
           conversationLog: [welcomeMessage],
           updatedAt: Date.now()
       };
       await gameStateManager.updateGameState(gameId, currentState);
       console.log(`[${gameId}] Added translated welcome message.`);
  }
  // --- End Initial Welcome Message ---

  // --- Logic specifically for DayIntroductions phase ---
  if (currentState.phase === "DayIntroductions") {
    const nextSpeakerId = determineNextSpeaker(currentState);

    if (nextSpeakerId) {
      const nextSpeaker = currentState.players[nextSpeakerId];

      // Check if player object exists and has the aiModel property
      if (!nextSpeaker || !nextSpeaker.aiModel) {
         console.error(`Player ${nextSpeakerId} or their aiModel not found in game state.`);
         // Handle the error appropriately, maybe skip turn or use a default model
         return; // Or throw error
      }
      
      // 1. Construct Prompt using the detailed persona
      // --- Add logic to get previous introductions & recent events --- 
      const prevMessages = currentState.conversationLog.filter(
        (msg) =>
          // Get messages from the current round's introduction phase
          (msg.phase === "DayIntroductions" && msg.round === currentState.round && !msg.isThinking) ||
          // OR get recent moderator messages from previous phases/rounds
          (msg.speaker.type === 'moderator' && msg.timestamp > (Date.now() - 1000 * 60 * 10)) // e.g., last 10 mins
      );

      // Separate player intros from moderator messages
      const prevIntroMessages = prevMessages.filter(msg => msg.speaker.type === 'player');
      const recentModMessages = prevMessages.filter(msg => msg.speaker.type === 'moderator');

      const previousIntroductionsText = prevIntroMessages
        .map((msg) => `${msg.speakerName}: ${msg.content}`)
        .join("\n");
      const recentModeratorMessagesText = recentModMessages
        .map(msg => `- ${msg.content}`) // Simple formatting for the intro prompt
        .join("\n");
      // --- End logic --- 

      const systemPrompt = DAY_INTRODUCTION_PROMPT(
        nextSpeaker.persona,
        nextSpeaker.name,
        nextSpeaker.role,
        previousIntroductionsText,
        recentModeratorMessagesText // Pass moderator messages
      );

      const promptMessages: ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: `Okay ${nextSpeaker.name}, it's your turn. Please introduce yourself to everyone.${languageInstruction}`,
        },
      ];

      // 2. Get AI response - Use the player's specific model
      const rawIntroductionContent = await getAIResponse(
        promptMessages,
        gameId,
        nextSpeakerId,
        { model: nextSpeaker.aiModel, temperature: 0.8 }
      );

      const introductionContent = cleanAIResponse(rawIntroductionContent); // Clean

      // 3. Create Chat Message
      const newMessage: ChatMessage = {
        messageId: `msg-${crypto.randomUUID()}`,
        gameId: gameId,
        speaker: { type: "player", playerId: nextSpeakerId },
        speakerName: nextSpeaker.name,
        content: introductionContent,
        timestamp: Date.now(),
        round: currentState.round,
        phase: currentState.phase,
        audience: { type: "all" },
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
      const stateBeforePhaseAdvance = await gameStateManager.getGameState(
        gameId
      );
      if (!stateBeforePhaseAdvance) {
        console.error(`Game state lost before phase advance for ${gameId}`);
        return;
      }

      let nextState = advancePhase(stateBeforePhaseAdvance);

      // Add a moderator message indicating the start of the next phase
      // --- Translate Moderator Message --- 
      const originalIntroCompleteMsg = `Introductions are complete. The floor is now open for discussion.`;
      const translatedIntroCompleteMsg = await translateText(originalIntroCompleteMsg, language);
      // --- End Translation ---
      const phaseChangeMessage: ChatMessage = {
        messageId: `msg-${crypto.randomUUID()}`,
        gameId: gameId,
        speaker: { type: "moderator" },
        speakerName: "Moderator",
        content: translatedIntroCompleteMsg, // Use translated message
        timestamp: Date.now(),
        round: nextState.round,
        phase: nextState.phase,
        audience: { type: "all" },
      };
      nextState = {
        ...nextState,
        conversationLog: [...nextState.conversationLog, phaseChangeMessage],
        // Reset turn index for the new phase (discussion)
        turnOrderIndex: 0,
      };

      // Save the updated state with the new phase
      await gameStateManager.updateGameState(gameId, nextState);
      console.log(
        `Game ${gameId} advanced from DayIntroductions to ${nextState.phase}`
      );
    }

    // --- Logic specifically for Night phase ---
  } else if (currentState.phase === "Night") {
    console.log(`Processing Night phase actions for game ${gameId}...`);

    const livingPlayers = currentState.livingPlayerIds.map(
      (id) => currentState.players[id]
    );
    const playersWithNightActions = livingPlayers.filter(
      (p) =>
        p.status === "alive" &&
        (p.role === "Werewolf" || p.role === "Seer" || p.role === "Doctor")
    );
    const livingWerewolfIds = livingPlayers
      .filter((p) => p.role === "Werewolf")
      .map((p) => p.id);

    // Store individual actions/preferences temporarily
    const collectedIndividualActions: NightAction[] = [];
    const werewolfPreferences: Record<string, string> = {}; // voterId -> targetId

    // Helper function to find living player ID by name (case-insensitive)
    const getPlayerIdByName = (name: string): string | null => {
      const lowerCaseName = name.toLowerCase().trim();
      // Ensure we only target living players
      const player = livingPlayers.find(
        (p) => p.status === "alive" && p.name.toLowerCase() === lowerCaseName
      );
      return player ? player.id : null;
    };

    for (const activePlayer of playersWithNightActions) {
      // Check if player object exists and has the aiModel property
      if (!activePlayer || !activePlayer.aiModel) {
         console.error(`Active player ${activePlayer?.id} or their aiModel not found in game state.`);
         // Handle the error appropriately
         continue; // Skip this player's action
      }
      
      console.log(
        `Getting night action/preference for ${activePlayer.name} (${activePlayer.role})...`
      );
      let prompt = "";
      let targetOptions: Player[] = [];
      // Remove the systemPromptBase as it's incorporated into the specific prompt functions now

      // Determine valid targets based on role
      switch (activePlayer.role) {
        case "Werewolf":
          targetOptions = livingPlayers.filter(
            (p) => p.status === "alive" && p.role !== "Werewolf"
          );
          const fellowNames = livingWerewolfIds
            .filter((id) => id !== activePlayer.id) // Exclude self
            .map((id) => currentState.players[id].name); // Get names

          prompt = NIGHT_ACTION_WEREWOLF_PROMPT(
            activePlayer.persona,
            activePlayer.name,
            fellowNames,
            targetOptions.map((p) => p.name)
          );
          break;
        case "Seer":
          targetOptions = livingPlayers.filter(
            (p) => p.status === "alive" && p.id !== activePlayer.id
          );
          prompt = NIGHT_ACTION_SEER_PROMPT(
            activePlayer.persona,
            activePlayer.name,
            targetOptions.map((p) => p.name)
          );
          break;
        case "Doctor":
          targetOptions = livingPlayers.filter((p) => p.status === "alive");
          prompt = NIGHT_ACTION_DOCTOR_PROMPT(
            activePlayer.persona,
            activePlayer.name,
            targetOptions.map((p) => p.name)
          );
          break;
      }

      if (!prompt || targetOptions.length === 0) {
        console.log(
          `Skipping action/preference for ${activePlayer.name} (no valid targets or action).`
        );
        continue;
      }

      const promptMessages: ChatCompletionMessageParam[] = [
        { role: "system", content: prompt },
        { role: "user", content: `Choose your target.${languageInstruction}` }, 
      ];

      let targetNumberStr = "";
      let targetPlayerId: string | null = null;
      let retries = 2;

      // Retry loop for getting a valid target number from AI
      while (retries > 0 && targetPlayerId === null) {
        try {
          const rawResponse = await getAIResponse(
            promptMessages,
            gameId,
            activePlayer.id,
            { model: activePlayer.aiModel, temperature: 0.3 }
          );
          // --- Enhanced Parsing Start ---
          const cleanedResponse = cleanAIResponse(rawResponse);
          // Attempt to extract the first sequence of digits
          const match = cleanedResponse.match(/\d+/);
          const extractedNumberStr = match ? match[0] : null;

          if (extractedNumberStr) {
            const choiceIndex = parseInt(extractedNumberStr, 10) - 1;
            // Validate the extracted number
            if (
              !isNaN(choiceIndex) &&
              choiceIndex >= 0 &&
              choiceIndex < targetOptions.length
            ) {
              targetPlayerId = targetOptions[choiceIndex].id;
            } else {
              console.warn(
                `Invalid night choice number ${
                  choiceIndex + 1
                } (extracted from "${cleanedResponse}") by ${
                  activePlayer.name
                }. Expected 1-${targetOptions.length}. Retrying... (${
                  retries - 1
                } left)`
              );
              targetNumberStr = cleanedResponse; // Keep original cleaned response for retry context
            }
          } else {
            console.warn(
              `No number found in night choice response "${cleanedResponse}" from ${
                activePlayer.name
              }. Retrying... (${retries - 1} left)`
            );
            targetNumberStr = cleanedResponse; // Keep original cleaned response for retry context
          }
          // --- Enhanced Parsing End ---

          if (targetPlayerId === null && retries > 0) {
            promptMessages.push({
              role: "assistant",
              content: targetNumberStr,
            });
            promptMessages.push({
              role: "user",
              content: `Invalid input. Respond ONLY with a single number from the list (1-${targetOptions.length}).${languageInstruction}`,
            });
            retries--;
            targetNumberStr = ""; // Reset for logging/context if needed
          }
        } catch (error) {
          console.error(
            `AI call failed for ${activePlayer.name}'s night action/preference:`,
            error
          );
          retries = 0; // Stop retrying on API error
        }
      }

      // Add action/preference if a valid target was successfully chosen
      if (targetPlayerId) {
        const finalTargetName = currentState.players[targetPlayerId].name;

        switch (activePlayer.role) {
          case "Werewolf":
            // Store preference instead of creating action immediately
            console.log(
              `${activePlayer.name} (Werewolf) indicated preference for ${finalTargetName} (${targetPlayerId})`
            );
            werewolfPreferences[activePlayer.id] = targetPlayerId;
            break;
          case "Seer":
            console.log(
              `${activePlayer.name} (Seer) targeted ${finalTargetName} (${targetPlayerId}) for investigation`
            );
            collectedIndividualActions.push({
              type: "seer_investigation",
              actingPlayerId: activePlayer.id,
              targetPlayerId,
              result: "Villager" /* Placeholder */,
            });
            break;
          case "Doctor":
            console.log(
              `${activePlayer.name} (Doctor) targeted ${finalTargetName} (${targetPlayerId}) for protection`
            );
            collectedIndividualActions.push({
              type: "doctor_save",
              actingPlayerId: activePlayer.id,
              targetPlayerId,
            });
            break;
        }
      } else {
        console.warn(
          `${activePlayer.name} (${activePlayer.role}) failed to provide a valid target after retries.`
        );
        // Handle failure case - e.g., player performs no action/preference this night
      }
    } // End loop through players with night actions

    console.log("Finished collecting individual night actions/preferences.");
    console.log("Werewolf Preferences:", werewolfPreferences);
    console.log("Other Actions:", collectedIndividualActions);

    // --- Tally Werewolf Preferences and Determine Pack Action ---
    const finalNightActions: NightAction[] = [...collectedIndividualActions]; // Start with Seer/Doctor actions
    let packTargetId: string | null = null;

    if (Object.keys(werewolfPreferences).length > 0) {
      const targetVoteCounts: Record<string, number> = {};
      let maxVotes = 0;
      let targetsWithMaxVotes: string[] = [];

      // Tally votes
      Object.values(werewolfPreferences).forEach((targetId) => {
        targetVoteCounts[targetId] = (targetVoteCounts[targetId] || 0) + 1;
      });

      console.log("Werewolf Target Vote Counts:", targetVoteCounts);

      // Find max votes and target(s)
      for (const targetId in targetVoteCounts) {
        if (targetVoteCounts[targetId] > maxVotes) {
          maxVotes = targetVoteCounts[targetId];
          targetsWithMaxVotes = [targetId];
        } else if (targetVoteCounts[targetId] === maxVotes) {
          targetsWithMaxVotes.push(targetId);
        }
      }
      console.log(
        `[Vote Tally Debug] Max Votes: ${maxVotes}, Targets with Max: ${targetsWithMaxVotes.join(
          ", "
        )}`
      );
      console.log(
        `[Vote Tally Debug] voteCounts used for summary:`,
        targetVoteCounts
      );

      // Determine final target based on votes
      if (targetsWithMaxVotes.length === 1) {
        // Clear winner
        packTargetId = targetsWithMaxVotes[0];
        const packTargetName = currentState.players[packTargetId]?.name;
        console.log(
          `Werewolf pack agreed to target ${packTargetName} (${packTargetId}) with ${maxVotes} votes.`
        );
        // Find a representative werewolf ID for the action (e.g., the first living one)
        const representativeWolfId = livingWerewolfIds[0];
        if (representativeWolfId) {
          finalNightActions.push({
            type: "werewolf_kill",
            actingPlayerId: representativeWolfId,
            targetPlayerId: packTargetId,
          });
        } else {
          console.error(
            "Could not find a representative werewolf ID to assign the kill action."
          );
        }
      } else if (targetsWithMaxVotes.length > 1) {
        // Tie
        const tiedNames = targetsWithMaxVotes
          .map((id) => currentState.players[id]?.name)
          .join(" and ");
        console.log(
          `Werewolf vote resulted in a tie between ${tiedNames} (${maxVotes} votes each). No pack kill tonight.`
        );
        // No kill action added
      } else {
        // No votes cast (shouldn't happen if werewolfPreferences has keys, but safety check)
        console.log("No werewolf preferences were successfully cast.");
      }
    } else {
      console.log("No living werewolves or no preferences submitted.");
    }
    // --- End Werewolf Voting Logic ---

    console.log("Final Night Actions for Resolution:", finalNightActions);

    // Update the state with collected actions before resolving them
    // Fetch latest state again in case concurrent actions modified it
    const stateBeforeResolution = await gameStateManager.getGameState(gameId);
    if (!stateBeforeResolution) {
      console.error(`State disappeared for ${gameId} before resolution`);
      return;
    }

    let stateWithCollectedActions = {
      ...stateBeforeResolution,
      nightActions: finalNightActions, // Use the final combined actions
    };
    // Save state with actions collected
    await gameStateManager.updateGameState(gameId, stateWithCollectedActions);
    console.log(`State updated with final night actions for ${gameId}.`);

    // ----- Night Action Resolution -----
    let stateAfterResolution = { ...stateWithCollectedActions };
    let moderatorMessages: ChatMessage[] = [];
    let eliminatedPlayerId: string | null = null;

    // 1. Determine Kill
    const killAction = stateAfterResolution.nightActions.find(
      (a) => a.type === "werewolf_kill"
    );
    const saveAction = stateAfterResolution.nightActions.find(
      (a) => a.type === "doctor_save"
    );

    if (killAction) {
      const targetId = killAction.targetPlayerId;
      const targetPlayer = stateAfterResolution.players[targetId];

      if (targetPlayer?.status !== "alive") {
        console.log(
          `Werewolf target ${
            targetPlayer?.name || targetId
          } was already dead. Attack ineffective.`
        );
        // No public message needed
      } else if (saveAction && saveAction.targetPlayerId === targetId) {
        console.log(
          `Player ${targetPlayer.name} (${targetId}) was targeted for elimination but saved by the Doctor.`
        );
        // No public message needed, maybe internal log?
      } else {
        console.log(
          `Player ${targetPlayer.name} (${targetId}) was eliminated by werewolves.`
        );
        eliminatedPlayerId = targetId;
      }
    } else {
      console.log(
        "No werewolf kill action was performed or targeted this night."
      );
    }

    // 2. Update Player Status & Living IDs if elimination occurred
    if (eliminatedPlayerId) {
      const playersCopy = { ...stateAfterResolution.players };
      playersCopy[eliminatedPlayerId] = {
        ...playersCopy[eliminatedPlayerId],
        status: "dead",
      };

      stateAfterResolution = {
        ...stateAfterResolution,
        players: playersCopy,
        livingPlayerIds: stateAfterResolution.livingPlayerIds.filter(
          (id) => id !== eliminatedPlayerId
        ),
        lastEliminatedPlayerId: eliminatedPlayerId,
      };
    }

    // 3. Determine & Store Seer Result (Internal State)
    const investigationAction = stateAfterResolution.nightActions.find(
      (a) => a.type === "seer_investigation"
    );
    if (investigationAction) {
      const targetId = investigationAction.targetPlayerId;
      const targetPlayer = stateAfterResolution.players[targetId]; // Get target player from potentially updated state
      const seerId = investigationAction.actingPlayerId;

      if (!targetPlayer || targetPlayer.status !== "alive") {
        console.log(
          `Seer (${seerId}) investigated ${
            targetPlayer?.name || targetId
          }, but they were already dead. No result.`
        );
        // Optionally store 'Dead' or similar? For now, no result stored.
      } else {
        const result: "Werewolf" | "Villager" =
          targetPlayer.role === "Werewolf" ? "Werewolf" : "Villager";
        console.log(
          `Seer (${seerId}) investigated ${targetPlayer.name} (${targetId}) - Result: ${result}`
        );

        // Update internal state (initialize if needed)
        const internalState = stateAfterResolution._internalState || {};
        const seerResults = internalState.seerResults || {};
        seerResults[`${seerId}-${targetId}-${stateAfterResolution.round}`] =
          result; // Include round to avoid overwrite if same target

        stateAfterResolution = {
          ...stateAfterResolution,
          _internalState: {
            ...internalState,
            seerResults,
          },
        };
      }
      // Note: No public message about the seer result.
    }

    // 4. Generate Moderator Message based on elimination
    // --- Translate Moderator Messages --- 
    let originalSummaryContent = "";
    if (eliminatedPlayerId) {
      const eliminatedPlayerName =
        stateAfterResolution.players[eliminatedPlayerId].name;
      const eliminatedPlayerRole =
        stateAfterResolution.players[eliminatedPlayerId].role; // Reveal role on night death
      originalSummaryContent = `A scream pierces the night! The villagers gather in the morning to find ${eliminatedPlayerName} dead. They were a ${eliminatedPlayerRole}.`;
    } else if (
      killAction &&
      saveAction &&
      killAction.targetPlayerId === saveAction.targetPlayerId &&
      stateAfterResolution.players[killAction.targetPlayerId]?.status ===
        "alive"
    ) {
      originalSummaryContent =
        "A chilling silence fell over the village, but dawn arrives without incident. Someone was lucky tonight.";
    } else {
      originalSummaryContent = "The night passes uneventfully. Dawn breaks.";
    }
    const summaryContent = await translateText(originalSummaryContent, language);
    // --- End Translation ---

    const summaryMessage: ChatMessage = {
      messageId: `msg-${crypto.randomUUID()}-night-summary`,
      gameId: gameId,
      speaker: { type: "moderator" },
      speakerName: "Moderator",
      content: summaryContent,
      timestamp: Date.now(),
      round: stateAfterResolution.round, // Round before advancing
      phase: stateAfterResolution.phase, // Still Night phase technically during resolution
      audience: { type: "all" },
    };
    moderatorMessages.push(summaryMessage);

    stateAfterResolution = {
      ...stateAfterResolution,
      conversationLog: [
        ...stateAfterResolution.conversationLog,
        ...moderatorMessages,
      ],
    };

    // 5. Check Win Condition *after* updating statuses
    const winResultNight = checkWinCondition(stateAfterResolution);
    if (winResultNight) {
      console.log(
        `Game Over detected after night resolution. Outcome: ${winResultNight.outcome}`
      );
      // Add Game Over message using the win condition details
      // --- Translate Game Over Message ---
      const originalGameOverMsg = winResultNight.message;
      const translatedGameOverMsg = await translateText(originalGameOverMsg, language);
      // --- End Translation ---
      const gameOverMessage: ChatMessage = {
        messageId: `msg-${crypto.randomUUID()}-gameover`,
        gameId: gameId,
        speaker: { type: "moderator" },
        speakerName: "Moderator",
        // Use the message from the win condition object
        content: translatedGameOverMsg, // Use translated message
        timestamp: Date.now(),
        round: stateAfterResolution.round,
        phase: "GameOver", // Set phase directly
        audience: { type: "all" },
      };
      stateAfterResolution = {
        ...stateAfterResolution,
        phase: "GameOver", // Update phase
        winCondition: winResultNight, // Store the win condition object
        conversationLog: [
          ...stateAfterResolution.conversationLog,
          gameOverMessage,
        ],
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
    // --- Translate Moderator Message --- 
    const originalPhaseChangeMsg = nextState.phase === "DayDiscussion"
          ? `Day ${nextState.round} begins. Discuss what happened and who you suspect.`
          : `Day ${nextState.round} begins. Time for introductions.`;
    const translatedPhaseChangeMsg = await translateText(originalPhaseChangeMsg, language);
    // --- End Translation ---
    const phaseChangeMessage: ChatMessage = {
      messageId: `msg-${crypto.randomUUID()}-phase-change`,
      gameId: gameId,
      speaker: { type: "moderator" },
      speakerName: "Moderator",
      // Message depends on the *next* phase determined by advancePhase
      content: translatedPhaseChangeMsg, // Use translated message
      timestamp: Date.now(),
      round: nextState.round,
      phase: nextState.phase,
      audience: { type: "all" },
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
  } else if (currentState.phase === "DayDiscussion") {
    console.log(`Processing DayDiscussion phase for game ${gameId}...`);
    const nextSpeakerId = determineNextSpeaker(currentState);

    if (nextSpeakerId) {
      const nextSpeaker = currentState.players[nextSpeakerId];

      // Check if player object exists and has the aiModel property
      if (!nextSpeaker || !nextSpeaker.aiModel) {
         console.error(`Next speaker ${nextSpeakerId} or their aiModel not found in game state.`);
         // Handle the error appropriately
         return; // Or skip turn
      }
      
      const thinkingMessageId = `msg-${crypto.randomUUID()}-thinking`;

      console.log(
        `Getting discussion contribution from ${nextSpeaker.name}...`
      );

      // 1. Add "Thinking..." message
      const thinkingMessage: ChatMessage = {
        messageId: thinkingMessageId,
        gameId: gameId,
        speaker: { type: "player", playerId: nextSpeakerId },
        speakerName: nextSpeaker.name,
        content: "",
        timestamp: Date.now(),
        round: currentState.round,
        phase: currentState.phase,
        audience: { type: "all" },
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
      // Provide a larger slice of the *entire* conversation history, excluding thinking messages
      const relevantLog = currentState.conversationLog
        .filter((msg) => !msg.isThinking)
        .slice(-40); // Get the last 40 non-thinking messages overall
      
      // Format history including clear indication of moderator messages
      const conversationHistory = relevantLog
        .map(msg => {
          if (msg.speaker.type === 'moderator') {
            return `**Moderator:** ${msg.content}`;
          } else {
            return `${msg.speakerName}: ${msg.content}`;
          }
        })
        .join("\n");
        
      const livingPlayerNames = currentState.livingPlayerIds.map(
        (id) => currentState.players[id].name
      );

      const systemPrompt = DAY_DISCUSSION_PROMPT(
        nextSpeaker.persona,
        nextSpeaker.name,
        nextSpeaker.role,
        currentState.round,
        livingPlayerNames,
        conversationHistory
      );

      const promptMessages: ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Okay ${nextSpeaker.name}, what are your thoughts?${languageInstruction}`,
        },
      ];

      // 3. Get AI response
      let rawDiscussionContent = "";
      let errorMessage = "";
      try {
        rawDiscussionContent = await getAIResponse(
          promptMessages,
          gameId,
          nextSpeakerId,
          { model: nextSpeaker.aiModel, temperature: 0.7 }
        );
      } catch (error: any) {
        console.error(
          `AI discussion response failed for ${nextSpeakerId}:`,
          error
        );
        errorMessage = "(Seems lost in thought...)";
      }

      const discussionContent =
        errorMessage || cleanAIResponse(rawDiscussionContent); // Clean

      // 4. Fetch latest state again before final update
      let stateAfterThinking = await gameStateManager.getGameState(gameId);
      if (!stateAfterThinking) {
        console.error(
          `Game state lost after thinking (discussion) for ${gameId}`
        );
        return;
      }

      // 5. Create final message
      // Log the content right before creating the message object
      console.log(
        `[${gameId}|${nextSpeakerId}] Final discussion content before state update:`,
        discussionContent
      );

      const finalMessage: ChatMessage = {
        messageId: `msg-${crypto.randomUUID()}`,
        gameId: gameId,
        speaker: { type: "player", playerId: nextSpeakerId },
        speakerName: nextSpeaker.name,
        content: discussionContent,
        timestamp: Date.now(),
        round: stateAfterThinking.round,
        phase: stateAfterThinking.phase,
        audience: { type: "all" },
        isThinking: false, // Explicitly set to false
      };

      // 6. Update Game State: Remove thinking message, add final, increment turn
      let finalState = {
        ...stateAfterThinking,
        conversationLog: [
          ...stateAfterThinking.conversationLog.filter(
            (msg) => msg.messageId !== thinkingMessageId
          ),
          finalMessage,
        ],
        turnOrderIndex: stateAfterThinking.turnOrderIndex + 1,
      };

      // 7. Check if discussion round is over (e.g., all living players have spoken once)
      // If over, transition to Voting phase.
      const playersSpokenThisRound = finalState.turnOrderIndex;
      if (playersSpokenThisRound >= finalState.livingPlayerIds.length) {
        console.log(
          "All living players have spoken this round. Transitioning to Voting..."
        );

        // Advance to Voting Phase
        let stateBeforeVote = advancePhase(finalState);

        // Add moderator message for voting start
        // --- Translate Moderator Message --- 
        const originalVoteStartMsg = `Discussion time is over. It is now time to vote for who to eliminate.`;
        const translatedVoteStartMsg = await translateText(originalVoteStartMsg, language);
        // --- End Translation ---
        const voteStartMessage: ChatMessage = {
          messageId: `msg-${crypto.randomUUID()}`,
          gameId: gameId,
          speaker: { type: "moderator" },
          speakerName: "Moderator",
          content: translatedVoteStartMsg,
          timestamp: Date.now(),
          round: stateBeforeVote.round,
          phase: stateBeforeVote.phase,
          audience: { type: "all" },
        };

        finalState = {
          ...stateBeforeVote,
          conversationLog: [
            ...stateBeforeVote.conversationLog,
            voteStartMessage,
          ],
          turnOrderIndex: 0, // Reset index for voting phase
          votes: [], // Clear any previous votes
        };
        console.log(`Game ${gameId} advanced to ${finalState.phase} phase.`);
      } else {
        console.log(
          `Player ${nextSpeaker.name} finished speaking. ${
            finalState.livingPlayerIds.length - playersSpokenThisRound
          } players remaining this round.`
        );
      }

      // 8. Save final updated state for this turn/phase change
      await gameStateManager.updateGameState(gameId, finalState);
      console.log(
        `DayDiscussion turn processed for ${nextSpeaker.name}. Current index: ${finalState.turnOrderIndex}`
      );
    } else {
      // All players have spoken in discussion. Time to advance to Voting.
      console.log("All players discussed. Advancing phase to Voting...");

      // Fetch the latest state before advancing
      const stateBeforeVote = await gameStateManager.getGameState(gameId);
      if (!stateBeforeVote) {
         console.error(`Game state lost before advancing to Voting for ${gameId}`);
         return;
      }

      let nextState = advancePhase(stateBeforeVote);

      // Add moderator message for voting start
      // --- Translate Moderator Message --- 
      const originalVoteStartMsg = `Discussion time is over. It is now time to vote for who to eliminate.`;
      const translatedVoteStartMsg = await translateText(originalVoteStartMsg, language);
      // --- End Translation ---
      const voteStartMessage: ChatMessage = {
        messageId: `msg-${crypto.randomUUID()}`,
        gameId: gameId,
        speaker: { type: "moderator" },
        speakerName: "Moderator",
        content: translatedVoteStartMsg,
        timestamp: Date.now(),
        round: stateBeforeVote.round,
        phase: stateBeforeVote.phase,
        audience: { type: "all" },
      };
      nextState = {
        ...nextState,
        conversationLog: [...nextState.conversationLog, voteStartMessage],
      };

      // Save the updated state with the new phase
      await gameStateManager.updateGameState(gameId, nextState);
      console.log(`Game ${gameId} advanced from DayDiscussion to Voting.`);
    }
  }

  // --- Logic specifically for Voting phase ---
  else if (currentState.phase === "Voting") {
    console.log(`Processing Voting phase for game ${gameId}...`);

    const livingPlayers = currentState.livingPlayerIds
      .map((id) => currentState.players[id])
      .filter((p) => p.status === "alive");
    const collectedVotes: Vote[] = [];

    // Collect votes from all living players
    for (const voter of livingPlayers) {
      console.log(`Getting vote from ${voter.name}...`);

      // Filter out the voter themselves
      const targetOptions = livingPlayers.filter((p) => p.id !== voter.id);
      if (targetOptions.length === 0) {
        console.log(
          `Skipping vote for ${voter.name} (no other living players).`
        );
        continue;
      }

      // Create numbered list for the prompt
      const numberedTargetList = targetOptions
        .map((p, index) => `${index + 1}. ${p.name}`)
        .join("\n");

      const systemPrompt = VOTING_PROMPT(
        voter.persona,
        voter.name,
        voter.role,
        currentState.round,
        numberedTargetList
      );

      const promptMessages: ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Who do you vote to eliminate, ${voter.name}? (Respond with the number)${languageInstruction}`,
        },
      ];

      let targetNumberStr = "";
      let targetPlayerId: string | null = null;
      let retries = 2;

      while (retries > 0 && targetPlayerId === null) {
        try {
          const rawResponse = await getAIResponse(
            promptMessages,
            gameId,
            voter.id,
            { model: voter.aiModel, temperature: 0.3 }
          );
          // --- Enhanced Parsing Start ---
          const cleanedResponse = cleanAIResponse(rawResponse);
          // Attempt to extract the first sequence of digits
          const match = cleanedResponse.match(/\d+/);
          const extractedNumberStr = match ? match[0] : null;

          if (extractedNumberStr) {
            const choiceIndex = parseInt(extractedNumberStr, 10) - 1;
            // Validate the extracted number
            if (
              !isNaN(choiceIndex) &&
              choiceIndex >= 0 &&
              choiceIndex < targetOptions.length
            ) {
              targetPlayerId = targetOptions[choiceIndex].id;
            } else {
              console.warn(
                `Invalid vote choice number ${
                  choiceIndex + 1
                } (extracted from "${cleanedResponse}") by ${
                  voter.name
                }. Expected 1-${targetOptions.length}. Retrying... (${
                  retries - 1
                } left)`
              );
              targetNumberStr = cleanedResponse;
            }
          } else {
            console.warn(
              `No number found in vote response "${cleanedResponse}" from ${
                voter.name
              }. Retrying... (${retries - 1} left)`
            );
            targetNumberStr = cleanedResponse;
          }
          // --- Enhanced Parsing End ---

          if (targetPlayerId === null && retries > 0) {
            promptMessages.push({
              role: "assistant",
              content: targetNumberStr,
            });
            promptMessages.push({
              role: "user",
              content: `Invalid input. Respond ONLY with a single number from the list (1-${targetOptions.length}).${languageInstruction}`,
            });
            retries--;
            targetNumberStr = ""; // Reset for logging/context if needed
          }
        } catch (error) {
          console.error(`AI call failed for ${voter.name}'s vote:`, error);
          retries = 0; // Stop retrying on API error
        }
      }

      // Add the vote if a valid target was selected
      if (targetPlayerId) {
        const finalTargetName = currentState.players[targetPlayerId].name; // Get canonical name
        console.log(
          `${voter.name} voted for ${finalTargetName} (${targetPlayerId})`
        );
        collectedVotes.push({ voterPlayerId: voter.id, targetPlayerId });
      } else {
        console.warn(
          `${voter.name} failed to provide a valid vote target after retries.`
        );
        // Handle failure - e.g., abstention or random vote? For now, just log.
      }
    } // End loop collecting votes

    console.log("Finished collecting votes:", collectedVotes);

    // Fetch latest state before tallying
    const stateBeforeTally = await gameStateManager.getGameState(gameId);
    if (!stateBeforeTally) {
      console.error(`State disappeared for ${gameId} before tallying`);
      return;
    }

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
      stateAfterTally.votes.forEach((vote) => {
        voteCounts[vote.targetPlayerId] =
          (voteCounts[vote.targetPlayerId] || 0) + 1;
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
      console.log(
        `[Vote Tally Debug] Max Votes: ${maxVotes}, Players with Max: ${playersWithMaxVotes.join(
          ", "
        )}`
      );
      console.log(
        `[Vote Tally Debug] voteCounts used for summary:`,
        voteCounts
      );

      // Format vote results message
      // --- Translate Vote Results --- 
      const originalVoteDetails = Object.entries(voteCounts)
        .map(
          ([targetId, count]) =>
            `- ${
              stateAfterTally.players[targetId]?.name || "Unknown"
            }: ${count} ${count === 1 ? "vote" : "votes"}`
        )
        .join("\n");
      const originalVotesMsgContent = `The votes are in!\n${originalVoteDetails}`;
      const translatedVotesMsgContent = await translateText(originalVotesMsgContent, language);
      // --- End Translation ---
      const votesMessage: ChatMessage = {
        messageId: `msg-${crypto.randomUUID()}-votes`,
        gameId: gameId,
        speaker: { type: "moderator" },
        speakerName: "Moderator",
        content: translatedVotesMsgContent, // Use translated message
        timestamp: Date.now(),
        round: stateAfterTally.round,
        phase: stateAfterTally.phase,
        audience: { type: "all" },
      };
      voteModeratorMessages.push(votesMessage);

      // **** DECISION LOGIC ****
      if (playersWithMaxVotes.length === 1) {
        console.log("[Vote Tally Debug] Entering ELIMINATION branch."); // Log branch
        // Clear winner
        dayEliminatedPlayerId = playersWithMaxVotes[0];
        const eliminatedPlayer = stateAfterTally.players[dayEliminatedPlayerId];
        console.log(
          `Player ${eliminatedPlayer?.name} (${dayEliminatedPlayerId}) received the most votes (${maxVotes}) and will be eliminated.`
        );
        // --- Translate Elimination Message --- 
        const originalEliminationMsg = `With ${maxVotes} votes, ${eliminatedPlayer?.name} has been eliminated by the village. They were a ${eliminatedPlayer?.role}.`;
        const translatedEliminationMsg = await translateText(originalEliminationMsg, language);
        // --- End Translation ---
        const eliminationMessage: ChatMessage = {
          messageId: `msg-${crypto.randomUUID()}-elimination`,
          gameId: gameId,
          speaker: { type: "moderator" },
          speakerName: "Moderator",
          content: translatedEliminationMsg, // Use translated message
          timestamp: Date.now() + 1, // Ensure it appears after vote counts
          round: stateAfterTally.round,
          phase: stateAfterTally.phase,
          audience: { type: "all" },
        };
        voteModeratorMessages.push(eliminationMessage);
      } else if (playersWithMaxVotes.length > 1) {
        // Explicit check for TIE
        console.log("[Vote Tally Debug] Entering TIE branch."); // Log branch
        // Tie
        console.log(
          `Vote resulted in a tie between ${playersWithMaxVotes.length} players with ${maxVotes} votes each.`
        );
        console.log(
          `[Vote Tally Debug] Tied Players for message: ${playersWithMaxVotes.join(
            ", "
          )}`
        );
        const tiedPlayerNames = playersWithMaxVotes
          .map((id) => stateAfterTally.players[id]?.name || "Unknown")
          .join(" and ");
        // --- Translate Tie Message ---
        const originalTieMsg = `The vote is tied between ${tiedPlayerNames}! No one is eliminated today.`;
        const translatedTieMsg = await translateText(originalTieMsg, language);
        // --- End Translation ---
        const tieMessage: ChatMessage = {
          messageId: `msg-${crypto.randomUUID()}-tie`,
          gameId: gameId,
          speaker: { type: "moderator" },
          speakerName: "Moderator",
          content: translatedTieMsg, // Use translated message
          timestamp: Date.now() + 1,
          round: stateAfterTally.round,
          phase: stateAfterTally.phase,
          audience: { type: "all" },
        };
        voteModeratorMessages.push(tieMessage);
        dayEliminatedPlayerId = null; // Ensure no elimination on tie
      } else {
        // Handle cases like zero votes or unexpected scenarios
        console.log(
          "[Vote Tally Debug] Entering NO MAJORITY / NO VOTES branch."
        );
        // No elimination message needed here if it's covered by the 'no votes' logic below.
        dayEliminatedPlayerId = null; // Ensure no elimination
        // --- Translate No Votes Message --- 
        const originalNoVotesMsg = `No votes were cast. The village remains undecided.`;
        const translatedNoVotesMsg = await translateText(originalNoVotesMsg, language);
        // --- End Translation ---
        const noVotesMessage: ChatMessage = {
          messageId: `msg-${crypto.randomUUID()}-novotes`,
          gameId: gameId,
          speaker: { type: "moderator" },
          speakerName: "Moderator",
          content: translatedNoVotesMsg, // Use translated message
          timestamp: Date.now(),
          round: stateAfterTally.round,
          phase: stateAfterTally.phase,
          audience: { type: "all" },
        };
        voteModeratorMessages.push(noVotesMessage);
      }

      // Update player status if elimination occurred
      console.log(
        `[Vote Tally Debug] Before Status Update: dayEliminatedPlayerId = ${dayEliminatedPlayerId}`
      ); // Log decision
      if (dayEliminatedPlayerId) {
        const playersCopy = { ...stateAfterTally.players };
        playersCopy[dayEliminatedPlayerId] = {
          ...playersCopy[dayEliminatedPlayerId],
          status: "dead",
        };

        stateAfterTally = {
          ...stateAfterTally,
          players: playersCopy,
          livingPlayerIds: stateAfterTally.livingPlayerIds.filter(
            (id) => id !== dayEliminatedPlayerId
          ),
          lastEliminatedPlayerId: dayEliminatedPlayerId,
        };
      }

      stateAfterTally = {
        ...stateAfterTally,
        conversationLog: [
          ...stateAfterTally.conversationLog,
          ...voteModeratorMessages,
        ],
      };

      // Check Win Condition *after* vote resolution
      const winResultVote = checkWinCondition(stateAfterTally);
      if (winResultVote) {
        console.log(
          `Game Over detected after vote resolution. Outcome: ${winResultVote.outcome}`
        );
        // Add Game Over message using the win condition details
        // --- Translate Game Over Message ---
        const originalGameOverVoteMsg = winResultVote.message;
        const translatedGameOverVoteMsg = await translateText(originalGameOverVoteMsg, language);
        // --- End Translation ---
        const gameOverMessage: ChatMessage = {
          messageId: `msg-${crypto.randomUUID()}-gameover-vote`,
          gameId: gameId,
          speaker: { type: "moderator" },
          speakerName: "Moderator",
          // Use the message from the win condition object
          content: translatedGameOverVoteMsg, // Use translated message
          timestamp: Date.now(),
          round: stateAfterTally.round,
          phase: "GameOver", // Set phase directly
          audience: { type: "all" },
        };
        stateAfterTally = {
          ...stateAfterTally,
          phase: "GameOver", // Update phase
          winCondition: winResultVote, // Store the win condition object
          conversationLog: [
            ...stateAfterTally.conversationLog,
            gameOverMessage,
          ],
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
      // --- Translate Night Start Message --- 
      const originalNightStartMsg = `The sun sets. Night ${nextState.round} falls upon the village. Close your eyes...`;
      const translatedNightStartMsg = await translateText(originalNightStartMsg, language);
      // --- End Translation ---
      const nightStartMessage: ChatMessage = {
        messageId: `msg-${crypto.randomUUID()}-night-start`,
        gameId: gameId,
        speaker: { type: "moderator" },
        speakerName: "Moderator",
        content: translatedNightStartMsg, // Use translated message
        timestamp: Date.now(),
        round: nextState.round,
        phase: nextState.phase,
        audience: { type: "all" },
      };

      nextState = {
        ...nextState,
        conversationLog: [...nextState.conversationLog, nightStartMessage],
        // Clear actions/votes for the new night phase
        nightActions: [],
        votes: [],
        turnOrderIndex: 0, // Reset index (though not strictly needed for Night)
      };

      // Log the final state before saving
      console.log(
        `[Vote Tally Debug] Final 'nextState' livingPlayerIds before save: ${nextState.livingPlayerIds.join(
          ", "
        )}`
      );
      // Save the final state for the voting phase transition
      await gameStateManager.updateGameState(gameId, nextState);
      console.log(`Game ${gameId} advanced from Voting to ${nextState.phase}`);
    }
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
    revalidatePath("/"); // Revalidate the home page (or wherever games are listed)
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
  model: string,
  language: SupportedLanguage,
  existingProfiles?: AICharacterProfile[]
): Promise<GenerateCharacterResult | { error: string }> {
  console.log(`generateCharacterAction called for role: ${role}, model: ${model}, lang: ${language}`);
  try {
    // Pass parameters in the correct order
    const profile = await generateAICharacterProfile(role, model, language, existingProfiles);
    if (!profile) {
      throw new Error("AI profile generation returned null.");
    }

    // Select image after profile generation
    const imageUrl = await selectCharacterImage(profile.gender, profile.ageCategory);

    // Return the combined result
    const result: GenerateCharacterResult = {
      role: role,
      profile: profile,
      aiModel: model, // Pass model through
      imageUrl: imageUrl ?? undefined,
      // voiceId will be assigned later in startGameAction
    };
    return result;

  } catch (error: any) {
    console.error(
      `Error in generateCharacterAction for role ${role}:`, error
    );
    return { error: error.message || "Failed to generate character profile." };
  }
}

// --- Helper Function for Translation (using AI) --- 
async function translateText(text: string, targetLanguage: SupportedLanguage): Promise<string> {
    // Avoid translation if already in the target language (basic check)
    if (targetLanguage === 'English') { // Assuming English is the base
        return text;
    }
    if (!text) return ""; // Handle empty strings

    console.log(`[Translate] Requesting translation to ${targetLanguage} for: "${text.substring(0, 50)}..."`);

    try {
        // Simple prompt for translation
        const messages: ChatCompletionMessageParam[] = [
            { role: "system", content: `You are a helpful translation assistant. Translate the user's text accurately into ${targetLanguage}. Respond ONLY with the translated text, nothing else.` },
            { role: "user", content: text },
        ];
        
        // Use specified model for this helper function
        const translation = await getAIResponse(messages, 'translation-task', 'translator', {
            model: 'llama-3.3-70b-versatile', // Explicitly use llama-3.3-70b-versatile
            temperature: 0.1, 
        });

        console.log(`[Translate] Received: "${translation.substring(0, 50)}..."`);
        return cleanAIResponse(translation); // Clean potential extra formatting
    } catch (error) {
        console.error(`[Translate] Error translating to ${targetLanguage}:`, error);
        return text; // Fallback to original text on error
    }
}

// --- Translation Caching/Generation Action --- 

const dictionary: DictionaryData = dictionaryDataJson;
const CACHE_DIR = path.join(process.cwd(), 'data', 'translations');

/**
 * Server action to get translations for a language, using cache or generating via LLM.
 */
export async function getOrGenerateTranslationsAction(
    targetLangCode: LanguageCode
): Promise<Record<string, string>> {
    
    // Handle English separately - read directly from imported JSON
    if (targetLangCode === 'en') {
        console.log("[Action:getTranslations] Requested 'en', loading from source dictionary...");
        const englishMap: Record<string, string> = {};
        (dictionary.en || []).forEach((item: TranslationEntry) => { englishMap[item.phrase] = item.translation; });
        return englishMap;
    }

    const cacheFilePath = path.join(CACHE_DIR, `${targetLangCode}.json`);
    const targetLanguageName = supportedLanguagesMap[targetLangCode];

    try {
        // 1. Try reading from cache
        console.log(`[Action:getTranslations] Checking cache: ${cacheFilePath}`);
        const cachedData = await fs.readFile(cacheFilePath, 'utf-8');
        console.log(`[Action:getTranslations] Cache HIT for ${targetLanguageName}.`);
        return JSON.parse(cachedData) as Record<string, string>;
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            // 2. Cache MISS - Generate using LLM
            console.log(`[Action:getTranslations] Cache MISS for ${targetLanguageName}. Generating...`);
            try {
                const englishDictionary = dictionary.en;
                if (!englishDictionary || englishDictionary.length === 0) {
                    throw new Error("Source English dictionary ('en') is missing or empty.");
                }

                const systemPrompt = GENERATE_UI_TRANSLATION_PROMPT(targetLanguageName);
                const userMessage = JSON.stringify(englishDictionary, null, 2);
                const messages: ChatCompletionMessageParam[] = [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage },
                ];

                // --- LLM Call --- 
                const aiResponse = await getAIResponse(messages, `translation-gen-${targetLangCode}`, 'translator', {
                    model: 'llama-3.3-70b-versatile', // Explicitly use llama-3.3-70b-versatile
                    temperature: 0.2,
                });
                const cleanedResponse = cleanAIResponse(aiResponse);
                let translatedArray: TranslationEntry[];
                try {
                    translatedArray = JSON.parse(cleanedResponse);
                    if (!Array.isArray(translatedArray)) throw new Error("LLM response is not an array.");
                    // Add more validation if needed
                } catch (parseError: any) {
                    console.error("[Action:getTranslations] Failed to parse LLM response:", cleanedResponse);
                    throw new Error(`Failed to parse LLM translation response: ${parseError.message}`);
                }
                // --- End LLM Call & Parse --- 

                const translationMap: Record<string, string> = {};
                const originalPhrases = new Set(englishDictionary.map((item: TranslationEntry) => item.phrase));
                for (const item of translatedArray) {
                    if (originalPhrases.has(item.phrase)) {
                        translationMap[item.phrase] = item.translation;
                    } else {
                        console.warn(`[Action:getTranslations] LLM returned unknown phrase "${item.phrase}", skipping.`);
                    }
                }
                // Check for missing keys
                 const missingKeys = englishDictionary.filter((item: TranslationEntry) => !(item.phrase in translationMap));
                 if (missingKeys.length > 0) {
                     console.warn(`[Action:getTranslations] LLM translation missed ${missingKeys.length} phrases: ${missingKeys.map((k: TranslationEntry)=>k.phrase).join(', ')}`);
                 }

                console.log(`[Action:getTranslations] Successfully generated translations for ${targetLanguageName}.`);

                // 3. Write to cache (inside the generation block)
                try {
                    await fs.mkdir(CACHE_DIR, { recursive: true }); 
                    await fs.writeFile(cacheFilePath, JSON.stringify(translationMap, null, 2));
                    console.log(`[Action:getTranslations] Wrote generated translations to cache: ${cacheFilePath}`);
                } catch (writeError: any) {
                    console.error(`[Action:getTranslations] FAILED to write cache file ${cacheFilePath}:`, writeError);
                    // Still return generated data even if caching fails
                }

                return translationMap;

            } catch (generationError: any) {
                console.error(`[Action:getTranslations] FAILED to generate translations for ${targetLanguageName}:`, generationError);
                // Throw a new error to avoid exposing internal details potentially
                throw new Error(`Failed to generate translations for ${targetLanguageName}.`); 
            }
        } else {
            // Other file system error (permissions, etc.)
            console.error(`[Action:getTranslations] Error reading cache file ${cacheFilePath}:`, error);
            throw new Error(`Failed to read translation cache for ${targetLanguageName}.`);
        }
    }
}
