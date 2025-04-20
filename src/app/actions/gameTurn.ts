"use server";

import { getAIResponse } from "@/lib/ai/openaiService";
import {
  DAY_DISCUSSION_PROMPT,
  DAY_INTRODUCTION_PROMPT,
  NIGHT_ACTION_DOCTOR_PROMPT,
  NIGHT_ACTION_SEER_PROMPT,
  NIGHT_ACTION_WEREWOLF_PROMPT,
  VOTING_PROMPT,
  WEREWOLF_CHAT_PROMPT,
} from "@/lib/ai/PROMPTS";
import {
  advancePhase,
  checkWinCondition,
  determineNextSpeaker,
  calculateTotalDiscussionTurns,
} from "@/lib/game/engine";
import { gameStateManager } from "@/lib/state/gameStateManager";
import type {
  ChatMessage,
  NightAction,
  Player,
  Vote,
  AIMessageLogEntry,
  Role,
  GameState,
  PendingHumanAction,
} from "@/lib/types/game";
import { cleanAIResponse } from "@/lib/utils/stringUtils";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

// Helper function to get a placeholder string for missing player names
const getPlayerName = (
  state: GameState,
  playerId: string | null | undefined,
): string => {
  if (!playerId) return "Unknown";
  return state.players[playerId]?.name || "Unknown";
};

// Helper function to get a placeholder string for missing player roles
const getPlayerRole = (
  state: GameState,
  playerId: string | null | undefined,
): Role | "Unknown Role" => {
  if (!playerId) return "Unknown Role";
  return state.players[playerId]?.role || "Unknown Role";
};

// Action to run the next turn or step in the game
export async function runGameTurnAction(gameId: string) {
  console.log(`Running turn for game: ${gameId}`);

  // Fetch the latest game state
  // Use let because we might update it after fetching latest state
  let currentState = await gameStateManager.getGameState(gameId);

  if (!currentState) {
    throw new Error(`Game state not found for gameId: ${gameId}`);
  }

  // Correctly access language via settings
  const language = currentState.settings.language;
  const languageInstruction = `\n\nIMPORTANT: Respond ONLY in ${language}.`;

  if (currentState.phase === "GameOver") {
    console.log(`Game ${gameId} is already over.`);
    return;
  }

  // --- Add Initial Welcome Message if needed ---
  // Check if it's the very start of the game (before first turn)
  if (
    currentState.round === 1 &&
    currentState.phase === "Day Introductions" &&
    currentState.turnOrderIndex === 0 &&
    currentState.conversationLog.length === 0 // Ensure it hasn't been added already
  ) {
    // Use currentState directly here, as it's the relevant state for this check
    const originalWelcomeMsg = `Welcome to "${
      currentState.title || "Werewolf AI"
    }"! ${currentState.livingPlayerIds.length} players have gathered. The first phase is introductions. Each player will briefly introduce themselves.`;
    const welcomeMessage: ChatMessage = {
      messageId: `msg-${crypto.randomUUID()}-init`,
      gameId: gameId,
      speaker: { type: "moderator" },
      speakerName: "Moderator",
      content: originalWelcomeMsg,
      timestamp: Date.now() - 1000, // Slightly before first action
      round: currentState.round,
      phase: currentState.phase,
      audience: { type: "all" },
      phraseKey: "WelcomeMessage", // Added key
      placeholders: { // Added placeholders
        gameTitle: currentState.title || "Werewolf AI",
        playerCount: currentState.livingPlayerIds.length,
      },
    };
    // Add message and update state *before* proceeding
    // Re-fetch latest state here as adding welcome msg is async
    let stateAfterWelcome = await gameStateManager.getGameState(gameId);
    if (!stateAfterWelcome) {
      console.error(
        `Game state lost after welcome message fetch for ${gameId}`,
      );
      return;
    }
    stateAfterWelcome = {
      ...stateAfterWelcome,
      conversationLog: [...stateAfterWelcome.conversationLog, welcomeMessage],
      updatedAt: Date.now(),
    };
    await gameStateManager.updateGameState(gameId, stateAfterWelcome);
    console.log(`[${gameId}] Added translated welcome message.`);
    // IMPORTANT: Update the outer currentState variable
    currentState = stateAfterWelcome;
    // No need for extra assignment/const here, the next phase block will handle it.
  }
  // --- End Initial Welcome Message ---

  // --- Logic specifically for Day Introductions phase ---
  if (currentState.phase === "Day Introductions") {
    // Assign to block-scoped const for this phase's logic
    const gamePhaseState = currentState;
    const nextSpeakerId = determineNextSpeaker(gamePhaseState);

    if (nextSpeakerId) {
      const nextSpeaker = gamePhaseState.players[nextSpeakerId];

      // --- START HUMAN PLAYER CHECK ---
      if (nextSpeaker.isHuman) {
        console.log(
          `[${gameId}] Human player ${nextSpeaker.name}'s turn for Introduction. Setting pending action.`
        );
        const pendingAction: PendingHumanAction = { 
          type: 'chat', 
          phase: gamePhaseState.phase 
        }; // Or derive from phase if needed
        const updatedState = {
          ...gamePhaseState,
          pendingHumanAction: pendingAction,
          updatedAt: Date.now(),
        };
        await gameStateManager.updateGameState(gameId, updatedState);
        revalidatePath(`/game/${gameId}`); // Notify frontend
        return; // Wait for human input
      }
      // --- END HUMAN PLAYER CHECK ---

      // Check if player object exists and has the aiModel property
      if (!nextSpeaker || !nextSpeaker.aiModel) {
        console.error(
          `Player ${nextSpeakerId} or their aiModel not found in game state.`,
        );
        // Handle the error appropriately, maybe skip turn or use a default model
        return; // Or throw error
      }

      // 1. Construct Prompt using the detailed persona
      // --- Add logic to get previous introductions & recent events ---
      const prevMessages = gamePhaseState.conversationLog.filter(
        (msg) =>
          // Get messages from the current round's introduction phase
          (msg.phase === "Day Introductions" &&
            msg.round === gamePhaseState.round &&
            !msg.isThinking) ||
          // OR get recent moderator messages from previous phases/rounds
          (msg.speaker.type === "moderator" &&
            msg.timestamp > Date.now() - 1000 * 60 * 10), // e.g., last 10 mins
      );

      // Separate player intros from moderator messages
      const prevIntroMessages = prevMessages.filter(
        (msg) => msg.speaker.type === "player",
      );
      const recentModMessages = prevMessages.filter(
        (msg) => msg.speaker.type === "moderator",
      );

      const previousIntroductionsText = prevIntroMessages
        .map((msg) => `${msg.speakerName}: ${msg.content}`)
        .join("\n");
      const recentModeratorMessagesText = recentModMessages
        .map((msg) => `- ${msg.content}`) // Simple formatting for the intro prompt
        .join("\n");
      // --- End logic ---

      const systemPrompt = DAY_INTRODUCTION_PROMPT(
        nextSpeaker.persona,
        nextSpeaker.name,
        nextSpeaker.role,
        previousIntroductionsText,
        recentModeratorMessagesText, // Pass moderator messages
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
      let rawIntroductionContent = "";
      let aiError: Error | null = null;
      const aiModel = nextSpeaker.aiModel;
      const aiSettings = { 
        model: aiModel, 
        temperature: 0.9,
        presence_penalty: 0.7,
        frequency_penalty: 0.7
      };

      try {
        rawIntroductionContent = await getAIResponse(
          promptMessages,
          gameId,
          nextSpeakerId,
          aiSettings,
        );
      } catch (error) {
        console.error(
          `AI call failed for ${nextSpeakerId} introduction:`,
          error,
        );
        aiError = error instanceof Error ? error : new Error(String(error));
        rawIntroductionContent = "(Seems lost in thought...)"; // Default message on error
      }

      // Log the AI interaction
      const logEntry: AIMessageLogEntry = {
        timestamp: Date.now(),
        gameId,
        playerId: nextSpeakerId,
        model: aiModel,
        promptMessages,
        responseContent: aiError ? null : rawIntroductionContent,
        error: aiError ? aiError.message : undefined,
        phase: gamePhaseState.phase,
        round: gamePhaseState.round,
      };

      // Fetch latest state *before* updating log to avoid race conditions
      let stateBeforeLogUpdate = await gameStateManager.getGameState(gameId);
      if (!stateBeforeLogUpdate) {
        console.error(`Game state lost before logging AI intro for ${gameId}`);
        return; // Or handle error appropriately
      }

      // Update state with the log entry
      stateBeforeLogUpdate = {
        ...stateBeforeLogUpdate,
        aiMessageLog: [...(stateBeforeLogUpdate.aiMessageLog || []), logEntry],
        updatedAt: Date.now(),
      };
      await gameStateManager.updateGameState(gameId, stateBeforeLogUpdate);

      // Now, process the response and update the conversation log
      const introductionContent = cleanAIResponse(rawIntroductionContent); // Clean

      // Fetch latest state *again* before adding chat message
      const stateBeforeChatUpdate = await gameStateManager.getGameState(gameId);
      if (!stateBeforeChatUpdate) {
        console.error("Game state lost before adding intro chat for ${gameId}");
        return; // Or handle error appropriately
      }

      // 3. Create Chat Message
      const newMessage: ChatMessage = {
        messageId: `msg-${crypto.randomUUID()}`,
        gameId: gameId,
        speaker: { type: "player", playerId: nextSpeakerId },
        speakerName: nextSpeaker.name,
        content: introductionContent,
        timestamp: Date.now(),
        round: stateBeforeChatUpdate.round,
        phase: stateBeforeChatUpdate.phase,
        audience: { type: "all" },
        // turnNumber: currentState.turnOrderIndex // Optional
      };

      // 4. Update Game State
      const updatedState = {
        ...stateBeforeChatUpdate,
        conversationLog: [...stateBeforeChatUpdate.conversationLog, newMessage],
        turnOrderIndex: stateBeforeChatUpdate.turnOrderIndex + 1, // Move to next speaker
        updatedAt: Date.now(),
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
      const stateBeforePhaseAdvance =
        await gameStateManager.getGameState(gameId);
      if (!stateBeforePhaseAdvance) {
        console.error(`Game state lost before phase advance for ${gameId}`);
        return;
      }

      let nextState = advancePhase(stateBeforePhaseAdvance);

      // Add a moderator message indicating the start of the next phase
      // --- Translate Moderator Message ---
      const originalIntroCompleteMsg =
        "Introductions are complete. The floor is now open for discussion.";
      // --- End Translation ---
      const phaseChangeMessage: ChatMessage = {
        messageId: `msg-${crypto.randomUUID()}`,
        gameId: gameId,
        speaker: { type: "moderator" },
        speakerName: "Moderator",
        content: originalIntroCompleteMsg, // Removed t() call, use original string
        timestamp: Date.now(),
        round: nextState.round,
        phase: nextState.phase,
        audience: { type: "all" },
        phraseKey: "IntroCompleteMessage", // Added key
        placeholders: {}, // Added placeholders (none needed)
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
        `Game ${gameId} advanced from Day Introductions to ${nextState.phase}`,
      );
    }

    // --- Logic specifically for Night phase ---
  } else if (currentState.phase === "Night") {
    // Assign to block-scoped const for this phase's logic
    const gamePhaseState = currentState;
    console.log(`Processing Night phase for game ${gameId}...`);

    const livingPlayers = gamePhaseState.livingPlayerIds.map(
      (id) => gamePhaseState.players[id],
    );
    const playersWithNightActions = livingPlayers.filter(
      (p) =>
        p.status === "alive" &&
        (p.role === "Werewolf" || p.role === "Seer" || p.role === "Doctor"),
    );
    const livingWerewolves = playersWithNightActions.filter(
      (p) => p.role === "Werewolf",
    );
    const livingWerewolfIds = livingWerewolves.map((p) => p.id);

    let updatedState = { ...gamePhaseState };
    const collectedIndividualActions: NightAction[] = [];
    const werewolfPreferences: Record<string, string> = {}; // voterId -> targetId
    const werewolfChatMessages: ChatMessage[] = []; // Messages generated *this* night

    // --- Werewolf Chat Logic (Moved Here) ---
    console.log(
      `Werewolves [${livingWerewolves.map((w) => w.name).join(", ")}] are preparing their night actions...`,
    );

    // Get summary of last *day's* events (vote result)
    const lastDaySummary =
      gamePhaseState.conversationLog
        .filter(
          (msg) =>
            msg.messageId.includes("-elimination") ||
            msg.messageId.includes("-tie"),
        )
        .pop()?.content || "The previous day's events are unclear.";

    for (const wolf of livingWerewolves) {
      if (!wolf.aiModel) {
        console.error(`Werewolf ${wolf.name} missing AI model.`);
        continue;
      }

      const fellowNames = livingWerewolves
        .filter((w) => w.id !== wolf.id)
        .map((w) => w.name);
      const recentChatHistory = werewolfChatMessages
        .map((msg) => `${msg.speakerName}: ${msg.content}`)
        .join("\n");

      const systemPromptChat = WEREWOLF_CHAT_PROMPT(
        wolf.persona,
        wolf.name,
        fellowNames,
        gamePhaseState.round,
        lastDaySummary,
        recentChatHistory,
      );
      const promptMessagesChat: ChatCompletionMessageParam[] = [
        { role: "system", content: systemPromptChat },
        {
          role: "user",
          content: `What do you say privately to your fellow werewolf/wolves, ${wolf.name}?${languageInstruction}`,
        },
      ];

      let rawChatContent = "";
      let aiErrorChat: Error | null = null;
      const aiModelChat = wolf.aiModel;
      const aiSettingsChat = { 
        model: aiModelChat, 
        temperature: 0.9,
        presence_penalty: 0.8,
        frequency_penalty: 0.7
      };

      try {
        rawChatContent = await getAIResponse(
          promptMessagesChat,
          gameId,
          wolf.id,
          aiSettingsChat,
        );
      } catch (error) {
        console.error(`AI call failed for ${wolf.name} werewolf chat:`, error);
        aiErrorChat = error instanceof Error ? error : new Error(String(error));
        rawChatContent = "(Remains silent...)";
      }
      const chatContent = cleanAIResponse(rawChatContent);

      const chatMessage: ChatMessage = {
        messageId: `msg-${crypto.randomUUID()}-wwchat`,
        gameId: gameId,
        speaker: { type: "player", playerId: wolf.id },
        speakerName: wolf.name,
        content: chatContent,
        timestamp: Date.now(),
        round: updatedState.round,
        phase: updatedState.phase,
        audience: { type: "werewolves" },
      };
      werewolfChatMessages.push(chatMessage);

      // Log AI interaction for chat
      const logEntryChat: AIMessageLogEntry = {
        timestamp: Date.now(),
        gameId,
        playerId: wolf.id,
        model: aiModelChat,
        promptMessages: promptMessagesChat,
        responseContent: aiErrorChat ? null : rawChatContent,
        error: aiErrorChat ? aiErrorChat.message : undefined,
        phase: updatedState.phase,
        round: updatedState.round,
      };
      // Update log (fetch latest state first)
      let stateForChatLog = await gameStateManager.getGameState(gameId);
      if (stateForChatLog) {
        stateForChatLog = {
          ...stateForChatLog,
          aiMessageLog: [...(stateForChatLog.aiMessageLog || []), logEntryChat],
          updatedAt: Date.now(),
        };
        await gameStateManager.updateGameState(gameId, stateForChatLog);
        updatedState = stateForChatLog; // Keep updatedState current with logs
      } else {
        console.error(
          `Game state lost during werewolf chat AI log for ${gameId}`,
        );
      }
    } // End werewolf chat loop

    // Update the internal state with the collected chat messages *before* action prompts
    updatedState = {
      ...updatedState,
      _internalState: {
        ...(updatedState._internalState || {}),
        werewolfChatLog: [
          ...(updatedState._internalState?.werewolfChatLog || []),
          ...werewolfChatMessages,
        ],
      },
      updatedAt: Date.now(), // Refresh timestamp
    };
    // Save state with chat log potentially updated
    await gameStateManager.updateGameState(gameId, updatedState);
    // Crucially, refresh currentState for the action loop
    currentState = await gameStateManager.getGameState(gameId);
    if (!currentState) {
      console.error(`Game state lost before night action loop for ${gameId}`);
      return;
    }
    // Assign the LATEST state to a new const for the action loop
    const stateForNightActions = currentState;
    console.log(
      `Werewolf private chat/prep concluded for Night ${stateForNightActions.round}.`,
    );
    // --- End Werewolf Chat Logic ---

    // --- Collect Actions (Seer, Doctor, Werewolf Kill Preference) ---
    const werewolfChatHistoryForPrompt = werewolfChatMessages
      .map((msg) => `${msg.speakerName}: ${msg.content}`)
      .join("\n");

    for (const activePlayer of playersWithNightActions) {
      // Check if player object exists and has the aiModel property
      if (!activePlayer || !activePlayer.aiModel) {
        console.error(
          `Active player ${activePlayer?.id} or their aiModel not found in game state.`,
        );
        // Handle the error appropriately
        continue; // Skip this player's action
      }

      console.log(
        `Getting night action/preference for ${activePlayer.name} (${activePlayer.role})...`,
      );
      let prompt = "";
      let targetOptions: Player[] = [];
      // Remove the systemPromptBase as it's incorporated into the specific prompt functions now

      // Determine valid targets based on role
      switch (activePlayer.role) {
        case "Werewolf": {
          targetOptions = livingPlayers.filter(
            (p) => p.status === "alive" && p.role !== "Werewolf",
          );
          const fellowNames = livingWerewolfIds
            .filter((id) => id !== activePlayer.id)
            .map((id) => stateForNightActions.players[id].name);
          // Pass the chat history to the kill prompt
          prompt = NIGHT_ACTION_WEREWOLF_PROMPT(
            activePlayer.persona,
            activePlayer.name,
            fellowNames,
            targetOptions.map((p) => p.name),
            werewolfChatHistoryForPrompt,
          );
          break;
        }
        case "Seer":
          targetOptions = livingPlayers.filter(
            (p) => p.status === "alive" && p.id !== activePlayer.id,
          );
          prompt = NIGHT_ACTION_SEER_PROMPT(
            activePlayer.persona,
            activePlayer.name,
            targetOptions.map((p) => p.name),
          );
          break;
        case "Doctor":
          targetOptions = livingPlayers.filter((p) => p.status === "alive");
          prompt = NIGHT_ACTION_DOCTOR_PROMPT(
            activePlayer.persona,
            activePlayer.name,
            targetOptions.map((p) => p.name),
          );
          break;
      }

      if (!prompt || targetOptions.length === 0) {
        console.log(
          `Skipping action/preference for ${activePlayer.name} (no valid targets or action).`,
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
      const aiModelNight = activePlayer.aiModel;
      const aiSettingsNight = { model: aiModelNight, temperature: 0.8 };
      const latestPromptMessages = [...promptMessages]; // Copy for logging
      let rawResponse = "";
      let aiErrorNight: Error | null = null;

      // Retry loop for getting a valid target number from AI
      while (retries > 0 && targetPlayerId === null) {
        aiErrorNight = null; // Reset error for this attempt
        rawResponse = ""; // Reset response
        try {
          rawResponse = await getAIResponse(
            latestPromptMessages, // Use potentially updated prompts in loop
            gameId,
            activePlayer.id,
            aiSettingsNight,
          );
          // --- Enhanced Parsing Start ---
          const cleanedResponse = cleanAIResponse(rawResponse);
          // Attempt to extract the first sequence of digits
          const match = cleanedResponse.match(/\d+/);
          const extractedNumberStr = match ? match[0] : null;

          if (extractedNumberStr) {
            const choiceIndex = Number.parseInt(extractedNumberStr, 10) - 1;
            // Validate the extracted number
            if (
              !Number.isNaN(choiceIndex) &&
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
                } left)`,
              );
              targetNumberStr = cleanedResponse;
            }
          } else {
            console.warn(
              `No number found in night choice response "${cleanedResponse}" from ${
                activePlayer.name
              }. Retrying... (${retries - 1} left)`,
            );
            targetNumberStr = cleanedResponse;
          }
          // --- Enhanced Parsing End ---

          if (targetPlayerId === null && retries > 0 && !aiErrorNight) {
            latestPromptMessages.push({
              role: "assistant",
              content: targetNumberStr, // The invalid response we just logged
            });
            latestPromptMessages.push({
              role: "user",
              content: `Invalid input. Respond ONLY with a single number from the list (1-${targetOptions.length}).${languageInstruction}`,
            });
            retries--;
            targetNumberStr = ""; // Reset for logging/context if needed
          } else if (aiErrorNight) {
            // If there was an API error, retries are already 0, loop will terminate.
          } else {
            // Successfully parsed, loop will terminate.
          }
        } catch (error) {
          console.error(
            `AI call failed for ${activePlayer.name}'s night action/preference:`,
            error,
          );
          aiErrorNight =
            error instanceof Error ? error : new Error(String(error));
          retries = 0; // Stop retrying on API error
        }

        // Log the AI interaction attempt (inside the loop)
        const logEntryNight: AIMessageLogEntry = {
          timestamp: Date.now(),
          gameId,
          playerId: activePlayer.id,
          model: aiModelNight,
          promptMessages: [...latestPromptMessages], // Log the prompts *for this attempt*
          responseContent: aiErrorNight ? null : rawResponse,
          error: aiErrorNight ? aiErrorNight.message : undefined,
          phase: stateForNightActions.phase,
          round: stateForNightActions.round,
        };

        // Fetch latest state and update log immediately
        let stateForNightLog = await gameStateManager.getGameState(gameId);
        if (!stateForNightLog) {
          console.error(`Game state lost during night AI log for ${gameId}`);
          break; // Exit loop if state is lost
        }
        stateForNightLog = {
          ...stateForNightLog,
          aiMessageLog: [
            ...(stateForNightLog.aiMessageLog || []),
            logEntryNight,
          ],
          updatedAt: Date.now(),
        };
        await gameStateManager.updateGameState(gameId, stateForNightLog);
        // --- Important: Refresh currentState if needed, though maybe not strictly required here
        // currentState = stateForNightLog; // Could cause issues if loop logic depends on pre-loop state?

        // Add assistant/user messages for retry *after* logging the failed attempt
        if (targetPlayerId === null && retries > 0 && !aiErrorNight) {
          latestPromptMessages.push({
            role: "assistant",
            content: targetNumberStr, // The invalid response we just logged
          });
          latestPromptMessages.push({
            role: "user",
            content: `Invalid input. Respond ONLY with a single number from the list (1-${targetOptions.length}).${languageInstruction}`,
          });
          retries--;
          targetNumberStr = ""; // Reset for logging/context if needed
        } else if (aiErrorNight) {
          // Loop will terminate.
        } else {
          // Successfully parsed, loop will terminate.
        }
      }

      // Add action/preference if a valid target was successfully chosen
      if (targetPlayerId) {
        const finalTargetName =
          stateForNightActions.players[targetPlayerId].name;

        switch (activePlayer.role) {
          case "Werewolf":
            console.log(
              `${activePlayer.name} (Werewolf) indicated preference for ${finalTargetName} (${targetPlayerId})`,
            );
            werewolfPreferences[activePlayer.id] = targetPlayerId;
            break;
          case "Seer":
            console.log(
              `${activePlayer.name} (Seer) targeted ${finalTargetName} (${targetPlayerId}) for investigation`,
            );
            collectedIndividualActions.push({
              type: "seer_investigation",
              actingPlayerId: activePlayer.id,
              targetPlayerId,
            });
            break;
          case "Doctor":
            console.log(
              `${activePlayer.name} (Doctor) targeted ${finalTargetName} (${targetPlayerId}) for protection`,
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
          `${activePlayer.name} (${activePlayer.role}) failed to provide a valid target after retries.`,
        );
      }
    } // End loop through players with night actions

    console.log("Finished collecting night actions/preferences.");

    // --- Tally Werewolf Preferences and Determine Pack Action ---
    const finalNightActions: NightAction[] = [...collectedIndividualActions]; // Start with Seer/Doctor actions
    let packTargetId: string | null = null;

    if (Object.keys(werewolfPreferences).length > 0) {
      const targetVoteCounts: Record<string, number> = {};
      let maxVotes = 0;
      let targetsWithMaxVotes: string[] = [];

      // Tally votes
      for (const targetId of Object.values(werewolfPreferences)) {
        targetVoteCounts[targetId] = (targetVoteCounts[targetId] || 0) + 1;
      }

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
        `[Vote Tally Debug] Max Votes: ${maxVotes}, Targets with Max: ${targetsWithMaxVotes
          .map((id) => stateForNightActions.players[id]?.name || id) // Get names from state
          .join(", ")}`,
      );
      console.log(
        "[Vote Tally Debug] voteCounts used for summary:",
        targetVoteCounts,
      );

      // Determine final target based on votes
      if (targetsWithMaxVotes.length === 1) {
        packTargetId = targetsWithMaxVotes[0];
        const packTargetName = stateForNightActions.players[packTargetId]?.name;
        console.log(
          `Werewolf pack agreed to target ${packTargetName} (${packTargetId}) with ${maxVotes} votes.`,
        );
        const representativeWolfId = livingWerewolfIds[0];
        if (representativeWolfId) {
          finalNightActions.push({
            type: "werewolf_kill",
            actingPlayerId: representativeWolfId,
            targetPlayerId: packTargetId,
          });
        }
      } else {
        // Tie or no majority - Log message but add no kill action
        if (targetsWithMaxVotes.length > 1) {
          const tiedNames = targetsWithMaxVotes
            // Use stateForNightActions for names
            .map((id) => stateForNightActions.players[id]?.name)
            .join(" and ");
          console.log(`Werewolf vote tied between ${tiedNames}. No kill.`);
        } else {
          console.log("No werewolf majority or no preferences cast.");
        }
      }
    } else {
      console.log("No living werewolves to perform kill action.");
    }

    console.log("Final Night Actions Collected:", finalNightActions);

    // 1. Fetch latest state before updating with collected actions
    const stateBeforeAdvance = await gameStateManager.getGameState(gameId);
    if (!stateBeforeAdvance) {
      console.error(
        `State disappeared for ${gameId} before saving night actions`,
      );
      return;
    }

    // 2. Update state ONLY with collected actions
    const stateWithCollectedActions = {
      ...stateBeforeAdvance,
      nightActions: finalNightActions, // Store the collected actions
      updatedAt: Date.now(),
      // Reset other transient states that *might* have been set previously (belt-and-suspenders)
      lastWerewolfTargetId: null,
      lastDoctorSaveId: null,
      lastSeerTargetId: null,
      lastEliminatedPlayerId: null, // Clear any previous day elim
    };

    // 3. Advance phase to ResolveNight
    const nextState = advancePhase(stateWithCollectedActions);

    // REMOVED: Simple moderator message indicating night is over.
    // const originalNightEndMsg = `Night ${stateBeforeAdvance.round} ends. Actions have been taken...`;
    // const nightEndMessage: ChatMessage = {
    //   messageId: `msg-${crypto.randomUUID()}-night-end`,
    //   gameId: gameId,
    //   speaker: { type: "moderator" },
    //   speakerName: "Moderator",
    //   content: originalNightEndMsg,
    //   phraseKey: "NightEndMessage",
    //   placeholders: { round: stateBeforeAdvance.round },
    //   timestamp: Date.now(),
    //   round: nextState.round,
    //   phase: nextState.phase,
    //   audience: { type: "all" },
    // };

    const finalStateForNight = {
      ...nextState,
      // REMOVED: Don't add the nightEndMessage
      // conversationLog: [...nextState.conversationLog, nightEndMessage],
    };

    // 4. Save the state with collected actions and the new phase (ResolveNight)
    await gameStateManager.updateGameState(gameId, finalStateForNight);
    console.log(
      `Game ${gameId} finished Night phase. Actions collected. Advanced to ${finalStateForNight.phase}.`,
    );
    // END OF NIGHT PHASE LOGIC - Resolution happens in the next block
  } else if (currentState.phase === "ResolveNight") {
    // Assign to block-scoped const for this phase's logic
    const gamePhaseState = currentState;
    console.log(`Processing ResolveNight phase for game ${gameId}...`);

    // ----- Night Action Resolution -----
    let stateAfterResolution = { ...gamePhaseState };
    const moderatorMessages: ChatMessage[] = [];
    let eliminatedPlayerId: string | null = null;
    let actualKillTargetId: string | null = null;
    let actualSaveTargetId: string | null = null;
    let actualSeerTargetId: string | null = null;

    // 1. Identify Actions from State
    const killAction = stateAfterResolution.nightActions.find(
      (a) => a.type === "werewolf_kill",
    );
    const saveAction = stateAfterResolution.nightActions.find(
      (a) => a.type === "doctor_save",
    );
    const investigationAction = stateAfterResolution.nightActions.find(
      (a) => a.type === "seer_investigation",
    );

    // Store the intended targets for logging/state
    actualKillTargetId = killAction?.targetPlayerId ?? null;
    actualSaveTargetId = saveAction?.targetPlayerId ?? null;
    actualSeerTargetId = investigationAction?.targetPlayerId ?? null;

    // 2. Determine Kill Outcome
    if (killAction) {
      const targetId = killAction.targetPlayerId;
      const targetPlayer = stateAfterResolution.players[targetId];

      if (targetPlayer?.status !== "alive") {
        console.log(
          `Werewolf target ${
            targetPlayer?.name || targetId
          } was already dead. Attack ineffective.`,
        );
      } else if (saveAction && saveAction.targetPlayerId === targetId) {
        console.log(
          `Player ${targetPlayer.name} (${targetId}) was targeted for elimination but saved by the Doctor.`,
        );
        // Target was saved, no elimination
      } else {
        console.log(
          `Player ${targetPlayer.name} (${targetId}) was eliminated by werewolves.`,
        );
        eliminatedPlayerId = targetId;
      }
    } else {
      console.log(
        "No werewolf kill action was performed or targeted this night.",
      );
    }

    // 3. Update Player Status & Game State IDs if elimination occurred
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
          (id) => id !== eliminatedPlayerId,
        ),
        deadPlayerIds: [
          ...stateAfterResolution.deadPlayerIds,
          eliminatedPlayerId,
        ],
        lastEliminatedPlayerId: eliminatedPlayerId, // Record elimination
      };
    }

    // 4. Determine & Store Seer Result (Internal State)
    if (investigationAction) {
      const targetId = investigationAction.targetPlayerId;
      // IMPORTANT: Check target status *before* potential elimination update
      // Use gamePhaseState (state at start of resolution) for this check
      const targetPlayer = gamePhaseState.players[targetId];
      const seerId = investigationAction.actingPlayerId;

      if (!targetPlayer || targetPlayer.status !== "alive") {
        console.log(
          `Seer (${seerId}) investigated ${
            targetPlayer?.name || targetId
          }, but they were dead or invalid. No result.`,
        );
      } else {
        // Determine the actual result based on the target's role
        const result: "Werewolf" | "Villager" =
          targetPlayer.role === "Werewolf" ? "Werewolf" : "Villager";
        console.log(
          `Seer (${seerId}) investigated ${targetPlayer.name} (${targetId}) - Result: ${result}`,
        );

        // Update internal state (initialize if needed)
        const internalState = stateAfterResolution._internalState || {};
        const seerResults = internalState.seerResults || {};
        // Store result with a key including round to prevent overwrites
        seerResults[`${seerId}-${targetId}-${stateAfterResolution.round}`] =
          result;

        stateAfterResolution = {
          ...stateAfterResolution,
          _internalState: {
            ...internalState,
            seerResults,
          },
        };
      }
    }

    // Update the main state with who was targeted/saved, regardless of outcome
    stateAfterResolution = {
      ...stateAfterResolution,
      lastWerewolfTargetId: actualKillTargetId,
      lastDoctorSaveId: actualSaveTargetId,
      lastSeerTargetId: actualSeerTargetId,
      updatedAt: Date.now(),
    };

    // 5. Generate Moderator Summary Message
    let originalSummaryContent = "";
    let summaryPhraseKey: string | undefined = undefined;
    let summaryPlaceholders: Record<string, string | number> = {};
    // Next round number is current round + 1 (for day announcement)
    const nextDayRound = stateAfterResolution.round; // This is already incremented by the time we resolve night

    if (eliminatedPlayerId) {
      const eliminatedPlayerName =
        stateAfterResolution.players[eliminatedPlayerId].name;
      const eliminatedPlayerRole =
        stateAfterResolution.players[eliminatedPlayerId].role; // Reveal role on night death
      originalSummaryContent = `A scream pierces the night! The villagers gather in the morning to find ${eliminatedPlayerName} dead. They were a ${eliminatedPlayerRole}.`;
      summaryPhraseKey = "NightSummaryElimination";
      summaryPlaceholders = {
        playerName: eliminatedPlayerName,
        playerRole: eliminatedPlayerRole,
      };
    } else if (
      killAction &&
      saveAction &&
      killAction.targetPlayerId === saveAction.targetPlayerId &&
      // Ensure the target was actually alive before the save
      // Use gamePhaseState (state *before* resolution started) for this check
      gamePhaseState.players[killAction.targetPlayerId]?.status === "alive"
    ) {
      originalSummaryContent =
        "A chilling silence fell over the village, but dawn arrives without incident. Someone was lucky tonight.";
      summaryPhraseKey = "NightSummarySaved";
      summaryPlaceholders = {};
    } else {
      originalSummaryContent = "The night passes uneventfully. Dawn breaks.";
      summaryPhraseKey = "NightSummaryPeaceful";
      summaryPlaceholders = {};
    }

    const summaryMessage: ChatMessage = {
      messageId: `msg-${crypto.randomUUID()}-night-summary`,
      gameId: gameId,
      speaker: { type: "moderator" },
      speakerName: "Moderator",
      content: originalSummaryContent, // Fallback content
      phraseKey: summaryPhraseKey, // <-- Use phrase key
      placeholders: summaryPlaceholders, // <-- Add placeholders
      timestamp: Date.now(),
      round: stateAfterResolution.round, // Use round from the state being resolved
      phase: stateAfterResolution.phase, // Still ResolveNight phase technically
      audience: { type: "all" },
    };
    moderatorMessages.push(summaryMessage);

    // Add moderator messages to the state
    stateAfterResolution = {
      ...stateAfterResolution,
      conversationLog: [
        ...stateAfterResolution.conversationLog,
        ...moderatorMessages,
      ],
    };

    // 6. Check Win Condition *after* updating statuses and adding summary
    const winResultNight = checkWinCondition(stateAfterResolution);
    if (winResultNight) {
      console.log(
        `Game Over detected after night resolution. Outcome: ${winResultNight.outcome}`,
      );
      const originalGameOverMsg = winResultNight.message;
      const gameOverPhraseKey =
        winResultNight.outcome === "Villager Win"
          ? "ModeratorGameOverVillagersWin"
          : winResultNight.outcome === "Werewolf Win"
          ? "ModeratorGameOverWerewolvesWin"
          : "GameOverMessage";
      // --- Replace Translation ---
      // const translatedGameOverMsg = await translateText(
      //   originalGameOverMsg,
      //   language,
      // );
      // --- End Replace Translation ---
      const gameOverMessage: ChatMessage = {
        messageId: `msg-${crypto.randomUUID()}-gameover-night`,
        gameId: gameId,
        speaker: { type: "moderator" },
        speakerName: "Moderator",
        content: originalGameOverMsg, // Fallback content (assuming winResultNight.message is suitable)
        phraseKey: gameOverPhraseKey,
        placeholders: {},
        timestamp: Date.now(),
        round: stateAfterResolution.round,
        phase: "GameOver",
        audience: { type: "all" },
      };
      stateAfterResolution = {
        ...stateAfterResolution,
        phase: "GameOver",
        winCondition: winResultNight,
        conversationLog: [
          ...stateAfterResolution.conversationLog,
          gameOverMessage,
        ],
        updatedAt: Date.now(),
        isWaitingForVotes: false, // Ensure flag is false on game over
      };
      // Save final game over state
      await gameStateManager.updateGameState(gameId, stateAfterResolution);
      console.log(`Game ${gameId} ended after night resolution.`);
      revalidatePath(`/game/${gameId}`);
      return; // End the action here if game over
    }

    // 7. If game not over, Advance Phase (to WerewolfChat, DayDiscussion, or Day Introductions)
    let nextState = advancePhase(stateAfterResolution);

    // 8. Remove the separate day start message - it's now combined with night resolution
    // let originalPhaseStartMsg = "";
    // let phaseStartPhraseKey: string | undefined = undefined;
    // let phaseStartPlaceholders: Record<string, string | number> = {};

    if (nextState.phase === "Day Introductions") {
      // Keep this special case for the first introduction
      const originalPhaseStartMsg = `Welcome to "${nextState.title || "the game"}"! ${nextState.livingPlayerIds.length} players have gathered. The first phase is introductions. Each player will briefly introduce themselves.`;
      const phaseStartPhraseKey = "WelcomeMessage";
      const phaseStartPlaceholders = {
        gameTitle: nextState.title || "the game",
        playerCount: nextState.livingPlayerIds.length,
      };
      
      const phaseStartMessage: ChatMessage = {
        messageId: `msg-${crypto.randomUUID()}-phasestart`,
        gameId: gameId,
        speaker: { type: "moderator" },
        speakerName: "Moderator",
        content: originalPhaseStartMsg, // Fallback content
        phraseKey: phaseStartPhraseKey, // <-- Use phrase key
        placeholders: phaseStartPlaceholders, // <-- Add placeholders
        timestamp: Date.now(),
        round: nextState.round,
        phase: nextState.phase,
        audience: { type: "all" },
      };
      // Add message to the *next* state's log
      nextState = {
        ...nextState,
        conversationLog: [...nextState.conversationLog, phaseStartMessage],
      };
    } 
    // Remove the DayDiscussion and Night cases - we've combined them with previous messages

    // 9. Save the final state for the ResolveNight transition
    await gameStateManager.updateGameState(gameId, nextState);
    console.log(
      `Game ${gameId} advanced from ResolveNight to ${nextState.phase}`,
    );
  } else if (currentState.phase === "DayDiscussion") { // START OF DAY DISCUSSION PHASE
    console.log(`Processing DayDiscussion phase for game ${gameId}...`);
    const gamePhaseState = currentState;
    const nextSpeakerId = determineNextSpeaker(gamePhaseState);

    if (nextSpeakerId) {
      const nextSpeaker = gamePhaseState.players[nextSpeakerId];

      // --- START HUMAN PLAYER CHECK ---
      if (nextSpeaker.isHuman) {
        console.log(
          `[${gameId}] Human player ${nextSpeaker.name}'s turn for Discussion. Setting pending action.`
        );
        const pendingAction: PendingHumanAction = { 
          type: 'chat', 
          phase: gamePhaseState.phase 
        }; // Or derive from phase if needed
        const updatedState = {
          ...gamePhaseState,
          pendingHumanAction: pendingAction,
          updatedAt: Date.now(),
        };
        await gameStateManager.updateGameState(gameId, updatedState);
        revalidatePath(`/game/${gameId}`); // Notify frontend
        return; // Wait for human input
      }
      // --- END HUMAN PLAYER CHECK ---

      // Check if player object exists and has the aiModel property
      if (!nextSpeaker || !nextSpeaker.aiModel) {
        console.error(
          `Next speaker ${nextSpeakerId} or their aiModel not found in game state.`,
        );
        // Handle the error appropriately
        return; // Or skip turn
      }

      const thinkingMessageId = `msg-${crypto.randomUUID()}-thinking`;

      console.log(
        `Getting discussion contribution from ${nextSpeaker.name}...`,
      );

      // 1. Add "Thinking..." message
      const thinkingMessage: ChatMessage = {
        messageId: thinkingMessageId,
        gameId: gameId,
        speaker: { type: "player", playerId: nextSpeakerId },
        speakerName: nextSpeaker.name,
        content: "",
        timestamp: Date.now(),
        round: gamePhaseState.round,
        phase: gamePhaseState.phase,
        audience: { type: "all" },
        isThinking: true,
      };

      const stateWithThinking = {
        ...gamePhaseState,
        conversationLog: [...gamePhaseState.conversationLog, thinkingMessage],
        updatedAt: Date.now(),
      };
      // Update cache, start background save, revalidate immediately
      await gameStateManager.updateGameState(gameId, stateWithThinking);
      revalidatePath(`/game/${gameId}`);
      console.log(`Added thinking message for ${nextSpeaker.name} discussion.`);

      // 2. Construct Prompt for Discussion
      // Provide a larger slice of the *entire* conversation history, excluding thinking messages
      const relevantLog = gamePhaseState.conversationLog
        .filter((msg) => !msg.isThinking)
        .slice(-40); // Get the last 40 non-thinking messages overall

      // Format history including clear indication of moderator messages
      const conversationHistory = relevantLog
        .map((msg) => {
          if (msg.speaker.type === "moderator") {
            return `**Moderator:** ${msg.content}`;
          }
          return `${msg.speakerName}: ${msg.content}`;
        })
        .join("\n");

      const livingPlayerNames = gamePhaseState.livingPlayerIds.map(
        (id) => gamePhaseState.players[id].name,
      );

      const systemPrompt = DAY_DISCUSSION_PROMPT(
        nextSpeaker.persona,
        nextSpeaker.name,
        nextSpeaker.role,
        gamePhaseState.round,
        livingPlayerNames,
        conversationHistory,
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
      let aiErrorDiscussion: Error | null = null;
      const aiModelDiscussion = nextSpeaker.aiModel;
      const aiSettingsDiscussion = {
        model: aiModelDiscussion,
        temperature: 0.95,
        presence_penalty: 0.9,
        frequency_penalty: 0.8,
      };

      try {
        rawDiscussionContent = await getAIResponse(
          promptMessages,
          gameId,
          nextSpeakerId,
          aiSettingsDiscussion,
        );
      } catch (error: unknown) {
        console.error(
          `AI discussion response failed for ${nextSpeakerId}:`,
          error,
        );
        aiErrorDiscussion =
          error instanceof Error ? error : new Error(String(error));
        errorMessage = "(Seems lost in thought...)";
        rawDiscussionContent = errorMessage; // Ensure raw content reflects error state
      }

      // Log the AI interaction
      const logEntryDiscussion: AIMessageLogEntry = {
        timestamp: Date.now(),
        gameId,
        playerId: nextSpeakerId,
        model: aiModelDiscussion,
        promptMessages,
        responseContent: aiErrorDiscussion ? null : rawDiscussionContent,
        error: aiErrorDiscussion ? aiErrorDiscussion.message : undefined,
        phase: gamePhaseState.phase,
        round: gamePhaseState.round,
      };

      // Fetch latest state *before* updating log
      let stateBeforeDiscLog = await gameStateManager.getGameState(gameId);
      if (!stateBeforeDiscLog) {
        console.error(
          `Game state lost before logging AI discussion for ${gameId}`,
        );
        // Decide how to handle - skip logging? return?
      } else {
        stateBeforeDiscLog = {
          ...stateBeforeDiscLog,
          aiMessageLog: [
            ...(stateBeforeDiscLog.aiMessageLog || []),
            logEntryDiscussion,
          ],
          updatedAt: Date.now(),
        };
        await gameStateManager.updateGameState(gameId, stateBeforeDiscLog);
      }

      const discussionContent =
        errorMessage || cleanAIResponse(rawDiscussionContent); // Clean

      // 4. Fetch latest state again before final update
      const stateAfterThinking = await gameStateManager.getGameState(gameId);
      if (!stateAfterThinking) {
        console.error(
          `Game state lost after thinking (discussion) for ${gameId}`,
        );
        return;
      }

      // 5. Create final message
      // Log the content right before creating the message object
      console.log(
        `[${gameId}|${nextSpeakerId}] Final discussion content before state update:`,
        discussionContent,
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
            (msg) => msg.messageId !== thinkingMessageId,
          ),
          finalMessage,
        ],
        turnOrderIndex: stateAfterThinking.turnOrderIndex + 1,
        updatedAt: Date.now(),
      };

      // 7. Check if discussion phase is over
      const totalTurnsTaken = finalState.turnOrderIndex;
      const totalExpectedTurns = calculateTotalDiscussionTurns(finalState); // Use helper from engine

      if (totalTurnsTaken >= totalExpectedTurns) {
        console.log(
          `All ${totalExpectedTurns} discussion turns completed. Transitioning to Voting...`,
        );

        // Advance to Voting Phase
        const stateBeforeVote = advancePhase(finalState); // advancePhase resets turnOrderIndex

        // Add moderator message for voting start
        // const originalVoteStartMsg =
        //   "Discussion time is over. It is now time to vote for who to eliminate.";
        // const voteStartMessage: ChatMessage = {
        //   messageId: `msg-${crypto.randomUUID()}-vote-start`,
        //   gameId: gameId,
        //   speaker: { type: "moderator" },
        //   speakerName: "Moderator",
        //   content: originalVoteStartMsg,
        //   timestamp: Date.now(),
        //   round: stateBeforeVote.round,
        //   phase: stateBeforeVote.phase, // Should be 'Voting'
        //   audience: { type: "all" },
        //   phraseKey: "VoteStartMessage", // Added key
        //   placeholders: {}, // Added placeholders (none needed)
        // };

        finalState = {
          ...stateBeforeVote,
          // Remove the VoteStartMessage addition
          // conversationLog: [
          //   ...stateBeforeVote.conversationLog,
          //   voteStartMessage,
          // ],
          // turnOrderIndex is already reset by advancePhase
          votes: [], // Clear any previous votes from other phases potentially
          isWaitingForVotes: true, // Set the flag
        };
        console.log(`Game ${gameId} advanced to ${finalState.phase} phase.`);
      } else {
        // Discussion continues
        // Calculate the effective index within the living players for the *next* turn
        const nextEffectiveIndex =
          totalTurnsTaken % finalState.livingPlayerIds.length;
        const nextSpeakerId = finalState.livingPlayerIds[nextEffectiveIndex];
        const nextSpeakerName =
          finalState.players[nextSpeakerId]?.name || "Next Player";
        const remainingTurns = totalExpectedTurns - totalTurnsTaken;

        console.log(
          `Player ${nextSpeaker.name} finished speaking. Turn ${totalTurnsTaken}/${totalExpectedTurns}. Next up: ${nextSpeakerName}. (${remainingTurns} turns remaining)`,
        );
      }

      // 8. Save final updated state for this turn/phase change
      await gameStateManager.updateGameState(gameId, finalState);
      console.log(
        `DayDiscussion turn processed for ${nextSpeaker.name}. Total turns taken: ${finalState.turnOrderIndex}`,
      );
    } else {
      // determineNextSpeaker returned null
      // This case should now only happen if determineNextSpeaker correctly identifies
      // that all expected discussion turns are complete. We advance the phase.

      // Safety check: Ensure the phase is still DayDiscussion before advancing
      if (gamePhaseState.phase !== "DayDiscussion") {
        console.warn(
          `Attempted to advance from non-discussion phase (${gamePhaseState.phase}) when nextSpeaker was null. Aborting advance.`,
        );
        // Revalidate and exit? Or trust the initial check? For now, just log.
      } else {
        console.log(
          "All expected discussion turns completed (determineNextSpeaker returned null). Advancing phase to Voting...",
        );

        // Fetch the latest state before advancing (paranoid check)
        const stateBeforeVote = await gameStateManager.getGameState(gameId);
        if (!stateBeforeVote) {
          console.error(
            `Game state lost before advancing to Voting (null speaker case) for ${gameId}`,
          );
          return;
        }
        if (stateBeforeVote.phase !== "DayDiscussion") {
          console.warn(
            `State phase changed to ${stateBeforeVote.phase} before advancing from null speaker case. Aborting.`,
          );
          return;
        }

        let nextState = advancePhase(stateBeforeVote); // advancePhase resets turnOrderIndex

        
        nextState = {
          ...nextState,
          // Remove the VoteStartMessage addition
          // conversationLog: [...nextState.conversationLog, voteStartMessage],
          votes: [], // Ensure votes are cleared
          isWaitingForVotes: true, // Set the flag
        };

        // Save the updated state with the new phase
        await gameStateManager.updateGameState(gameId, nextState);
        console.log(
          `Game ${gameId} advanced from DayDiscussion to Voting (null speaker case).`,
        );
      }
    }
  }

  // --- Logic specifically for Voting phase ---
  else if (currentState.phase === "Voting") {
    console.log(`Processing Voting phase for game ${gameId}...`);
    // Assign to block-scoped const for this phase's logic
    const gamePhaseState = currentState;

    // --- NEW: Check if waiting for human vote before collecting AI votes ---
    if (gamePhaseState.pendingHumanAction?.type === 'vote') {
        console.log(`[${gameId}] Voting phase: Still waiting for human vote. Returning.`);
        // No need to revalidate here, just wait for human action submission
        return; 
    }
    // --- END NEW CHECK ---

    // --- Check if all votes are already collected (e.g., after human voted) ---
    const livingPlayerCount = gamePhaseState.livingPlayerIds.length;
    if (gamePhaseState.votes.length >= livingPlayerCount) {
        console.log(`[${gameId}] Voting phase: All ${livingPlayerCount} votes collected. Proceeding to tally.`);
        // TODO: Implement vote tally logic here or call a function
        // For now, assume tallying happens in a subsequent runGameTurnAction call
        // after advancing the phase.
        // Move to advancing phase...
    } else {
        console.log(`[${gameId}] Voting phase: Collecting votes (${gamePhaseState.votes.length}/${livingPlayerCount} collected so far).`);
    }
    // --- END VOTE COLLECTION CHECK ---


    const livingPlayers = gamePhaseState.livingPlayerIds
      .map((id) => gamePhaseState.players[id])
      .filter((p) => p.status === "alive");
    // const collectedVotes: Vote[] = []; // Use existing votes from state

    // Collect votes from all living players *who haven\'t voted yet*
    const playersWhoHaventVoted = livingPlayers.filter(
      (p) => !gamePhaseState.votes.some(v => v.voterPlayerId === p.id)
    );

    for (const voter of playersWhoHaventVoted) { // Iterate only through those who need to vote
      console.log(`Getting vote from ${voter.name}...`);

      // --- START HUMAN PLAYER CHECK for Voting ---
      if (voter.isHuman) {
        console.log(
          `[${gameId}] Human player ${voter.name}'s turn to Vote. Setting pending action.`
        );
        const pendingAction: PendingHumanAction = { 
          type: 'vote', 
          phase: gamePhaseState.phase // Should be 'Voting'
        }; 
        const stateWaitingForHumanVote = {
          ...gamePhaseState,
          pendingHumanAction: pendingAction,
          updatedAt: Date.now(),
        };
        await gameStateManager.updateGameState(gameId, stateWaitingForHumanVote);
        revalidatePath(`/game/${gameId}`); // Notify frontend
        return; // IMPORTANT: Stop collecting AI votes and wait for human
      }
      // --- END HUMAN PLAYER CHECK ---

      // --- Existing AI Vote Logic Starts Here ---
      // Filter out the voter themselves
      const targetOptions = livingPlayers.filter((p) => p.id !== voter.id);
      if (targetOptions.length === 0) {
        console.log(
          `Skipping vote for ${voter.name} (no other living players).`,
        );
        continue;
      }

      // Create numbered list for the prompt
      const numberedTargetList = targetOptions
        .map((p, index) => `${index + 1}. ${p.name}`)
        .join("\n");

      // --- Extract relevant conversation history for the prompt ---
      const relevantHistory = gamePhaseState.conversationLog
        .filter(
          (msg) =>
            msg.phase === "DayDiscussion" && msg.round === gamePhaseState.round,
        )
        .map((msg) => `${msg.speakerName}: ${msg.content}`)
        .join("\n");
      // --- End history extraction ---

      const systemPrompt = VOTING_PROMPT(
        voter.persona,
        voter.name,
        voter.role,
        gamePhaseState.round,
        numberedTargetList,
        relevantHistory, // Pass the extracted history
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
      const aiModelVote = voter.aiModel;
      const aiSettingsVote = { model: aiModelVote, temperature: 0.6 };
      const latestPromptMessagesVote = [...promptMessages]; // Copy for logging
      let rawResponseVote = "";
      let aiErrorVote: Error | null = null;

      while (retries > 0 && targetPlayerId === null) {
        aiErrorVote = null; // Reset error
        rawResponseVote = ""; // Reset response
        try {
          rawResponseVote = await getAIResponse(
            latestPromptMessagesVote, // Use potentially updated prompts
            gameId,
            voter.id,
            aiSettingsVote,
          );
          // --- Enhanced Parsing Start ---
          const cleanedResponse = cleanAIResponse(rawResponseVote);
          // Attempt to extract the first sequence of digits
          const match = cleanedResponse.match(/\d+/);
          const extractedNumberStr = match ? match[0] : null;

          if (extractedNumberStr) {
            const choiceIndex = Number.parseInt(extractedNumberStr, 10) - 1;
            // Validate the extracted number
            if (
              !Number.isNaN(choiceIndex) &&
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
                } left)`,
              );
              targetNumberStr = cleanedResponse;
            }
          } else {
            console.warn(
              `No number found in vote response "${cleanedResponse}" from ${
                voter.name
              }. Retrying... (${retries - 1} left)`,
            );
            targetNumberStr = cleanedResponse;
          }
          // --- Enhanced Parsing End ---

          if (targetPlayerId === null && retries > 0 && !aiErrorVote) {
            latestPromptMessagesVote.push({
              role: "assistant",
              content: targetNumberStr, // The invalid response we just logged
            });
            latestPromptMessagesVote.push({
              role: "user",
              content: `Invalid input. Respond ONLY with a single number from the list (1-${targetOptions.length}).${languageInstruction}`,
            });
            retries--;
            targetNumberStr = ""; // Reset for logging/context if needed
          } else if (aiErrorVote) {
            // Loop will terminate.
          } else {
            // Successfully parsed, loop will terminate.
          }
        } catch (error) {
          console.error(`AI call failed for ${voter.name}'s vote:`, error);
          aiErrorVote =
            error instanceof Error ? error : new Error(String(error));
          retries = 0; // Stop retrying on API error
        }

        // Log the AI interaction attempt (inside the loop)
        const logEntryVote: AIMessageLogEntry = {
          timestamp: Date.now(),
          gameId,
          playerId: voter.id,
          model: aiModelVote,
          promptMessages: [...latestPromptMessagesVote], // Log the prompts *for this attempt*
          responseContent: aiErrorVote ? null : rawResponseVote,
          error: aiErrorVote ? aiErrorVote.message : undefined,
          phase: gamePhaseState.phase,
          round: gamePhaseState.round,
        };

        // Fetch latest state and update log immediately
        let stateForVoteLog = await gameStateManager.getGameState(gameId);
        if (!stateForVoteLog) {
          console.error(`Game state lost during vote AI log for ${gameId}`);
          break; // Exit loop if state is lost
        }
        stateForVoteLog = {
          ...stateForVoteLog,
          aiMessageLog: [...(stateForVoteLog.aiMessageLog || []), logEntryVote],
          updatedAt: Date.now(),
        };
        await gameStateManager.updateGameState(gameId, stateForVoteLog);

        // Add assistant/user messages for retry *after* logging the failed attempt
        if (targetPlayerId === null && retries > 0 && !aiErrorVote) {
          latestPromptMessagesVote.push({
            role: "assistant",
            content: targetNumberStr, // The invalid response we just logged
          });
          latestPromptMessagesVote.push({
            role: "user",
            content: `Invalid input. Respond ONLY with a single number from the list (1-${targetOptions.length}).${languageInstruction}`,
          });
          retries--;
          targetNumberStr = ""; // Reset for logging/context if needed
        } else if (aiErrorVote) {
          // Loop will terminate.
        } else {
          // Successfully parsed, loop will terminate.
        }
      }

      // Add the vote if a valid target was selected
      if (targetPlayerId) {
        const finalTargetName = gamePhaseState.players[targetPlayerId].name;
        console.log(
          `${voter.name} voted for ${finalTargetName} (${targetPlayerId})`,
        );
        gamePhaseState.votes.push({ voterPlayerId: voter.id, targetPlayerId });
      } else {
        console.warn(
          `${voter.name} failed to provide a valid vote target after retries.`,
        );
        // Handle failure - e.g., abstention or random vote? For now, just log.
      }
    } // End loop collecting votes

    console.log("Finished collecting votes:", gamePhaseState.votes);

    // Fetch latest state before tallying
    const stateBeforeTally = await gameStateManager.getGameState(gameId);
    if (!stateBeforeTally) {
      console.error(`State disappeared for ${gameId} before tallying`);
      return;
    }

    const stateWithVotes = {
      ...stateBeforeTally,
      votes: gamePhaseState.votes,
    };

    // --- Vote Tally and Resolution ---
    let stateAfterTally = { ...stateWithVotes };
    const voteModeratorMessages: ChatMessage[] = [];
    let dayEliminatedPlayerId: string | null = null;

    if (stateAfterTally.votes.length > 0) {
      const voteCounts: Record<string, number> = {};
      for (const vote of stateAfterTally.votes) {
        voteCounts[vote.targetPlayerId] =
          (voteCounts[vote.targetPlayerId] || 0) + 1;
      }

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
          ", ",
        )}`,
      );
      console.log(
        "[Vote Tally Debug] voteCounts used for summary:",
        voteCounts,
      );

      // Format vote results message
      let voteDetails = "";
      let voteBreakdown = ""; // Variable for voter -> target details
      // Filter out skips and use the correct property name 'voterPlayerId'
      const validVotes = stateAfterTally.votes.filter(v => v.targetPlayerId);

      if (validVotes.length > 0) {
        voteBreakdown = validVotes.map(vote => {
          const voterName = getPlayerName(stateAfterTally, vote.voterPlayerId); // Use voterPlayerId
          const targetName = getPlayerName(stateAfterTally, vote.targetPlayerId);
          return `- ${voterName} voted for ${targetName}`;
        }).join("\n");
        voteBreakdown = `\n--- Vote Details ---\n${voteBreakdown}\n--------------------`;
      } else {
        voteBreakdown = "\nNo votes were cast towards any player.";
      }

      for (const [targetId, count] of Object.entries(voteCounts)) {
        const targetName = getPlayerName(stateAfterTally, targetId);
        voteDetails += `- ${targetName}: ${count} ${count === 1 ? "vote" : "votes"}\n`;
      }
      // --- End Modification ---

      // REMOVE the separate vote counts message - we'll combine it with the elimination/tie message
      // DO NOT add the voteResultsMessage to voteModeratorMessages

      // **** DECISION LOGIC ****
      if (playersWithMaxVotes.length === 1) {
        console.log("[Vote Tally Debug] Entering ELIMINATION branch."); // Log branch
        // Clear winner
        dayEliminatedPlayerId = playersWithMaxVotes[0];
        const eliminatedPlayerName = getPlayerName(
          stateAfterTally,
          dayEliminatedPlayerId,
        );
        const eliminatedPlayerRole = getPlayerRole(
          stateAfterTally,
          dayEliminatedPlayerId,
        );
        console.log(
          `Player ${eliminatedPlayerName} (${dayEliminatedPlayerId}) received the most votes (${maxVotes}) and will be eliminated.`,
        );
        // --- Translate Elimination Message ---
        // Include vote details AND night beginning in same message
        const originalEliminationMsg = `The votes are in!\n${voteDetails}\nWith ${maxVotes} votes, ${eliminatedPlayerName} has been eliminated by the village. They were a ${eliminatedPlayerRole}.\n\nNight ${stateAfterTally.round} begins as darkness falls upon the village.`;
        // --- Replace Translation ---
        // const translatedEliminationMsg = await translateText(
        //   originalEliminationMsg,
        //   language,
        // );
        // --- End Translation ---
        const eliminationMessage: ChatMessage = {
          messageId: `msg-${crypto.randomUUID()}-elimination`,
          gameId: gameId,
          speaker: { type: "moderator" },
          speakerName: "Moderator",
          content: originalEliminationMsg, // Fallback content
          phraseKey: "VoteEliminationMessage",
          placeholders: {
            voteCount: maxVotes,
            playerName: eliminatedPlayerName,
            playerRole: eliminatedPlayerRole,
            voteBreakdown: voteBreakdown, // Add vote breakdown
          },
          timestamp: Date.now() + 1, // Ensure it appears after vote counts
          round: stateAfterTally.round,
          phase: stateAfterTally.phase,
          audience: { type: "all" },
        };
        voteModeratorMessages.push(eliminationMessage);

        const nightStartMsg: ChatMessage = {
          messageId: `msg-${crypto.randomUUID()}-nightstart`,
          gameId,
          speaker: { type: "moderator" },
          speakerName: "Moderator",
          content: `Night ${stateAfterTally.round} begins as darkness falls upon the village.`,
          phraseKey: "NightStartMessage",
          placeholders: { round: stateAfterTally.round },
          timestamp: Date.now() + 2,
          round: stateAfterTally.round,
          phase: stateAfterTally.phase,
          audience: { type: "all" },
        };
        voteModeratorMessages.push(nightStartMsg);
      } else if (playersWithMaxVotes.length > 1) {
        // Tie
        console.log("[Vote Tally Debug] Entering TIE branch."); // Log branch
        dayEliminatedPlayerId = null;
        const tiedPlayerNames = playersWithMaxVotes
          .map((id) => getPlayerName(stateAfterTally, id))
          .join(", ");
        console.log(
          `Vote tied between ${tiedPlayerNames} with ${maxVotes} votes each. No one eliminated.`,
        );
        // --- Translate Tie Message ---
        // Include vote details AND night beginning in same message
        const originalTieMsg = `The votes are in!\n${voteDetails}\nThe vote is tied between ${tiedPlayerNames}! No one is eliminated today.\n\nNight ${stateAfterTally.round} begins as darkness falls upon the village.`;
        // --- Replace Translation ---
        // const translatedTieMsg = await translateText(originalTieMsg, language);
        // --- End Translation ---
        const tieMessage: ChatMessage = {
          messageId: `msg-${crypto.randomUUID()}-tie`,
          gameId: gameId,
          speaker: { type: "moderator" },
          speakerName: "Moderator",
          content: originalTieMsg, // Fallback content
          phraseKey: "VoteTieMessage",
          placeholders: {
            tiedPlayerNames,
            voteBreakdown: voteBreakdown, // Add vote breakdown
           },
          timestamp: Date.now() + 1, // Ensure it appears after vote counts
          round: stateAfterTally.round,
          phase: stateAfterTally.phase,
          audience: { type: "all" },
        };
        voteModeratorMessages.push(tieMessage);

        const nightStartMsg: ChatMessage = {
          messageId: `msg-${crypto.randomUUID()}-nightstart`,
          gameId,
          speaker: { type: "moderator" },
          speakerName: "Moderator",
          content: `Night ${stateAfterTally.round} begins as darkness falls upon the village.`,
          phraseKey: "NightStartMessage",
          placeholders: { round: stateAfterTally.round },
          timestamp: Date.now() + 2,
          round: stateAfterTally.round,
          phase: stateAfterTally.phase,
          audience: { type: "all" },
        };
        voteModeratorMessages.push(nightStartMsg);
      } else {
        // Handle cases like zero votes or unexpected scenarios
        console.log(
          "[Vote Tally Debug] Entering NO MAJORITY / NO VOTES branch.",
        );
        // No elimination message needed here if it's covered by the 'no votes' logic below.
        dayEliminatedPlayerId = null; // Ensure no elimination
        // --- Translate No Votes Message ---
        const originalNoVotesMsg =
          "No votes were cast. The village remains undecided.";
        // --- Replace Translation ---
        // const translatedNoVotesMsg = await translateText(
        //   originalNoVotesMsg,
        //   language,
        // );
        // --- End Translation ---
        const noVotesMessage: ChatMessage = {
          messageId: `msg-${crypto.randomUUID()}-novotes`,
          gameId: gameId,
          speaker: { type: "moderator" },
          speakerName: "Moderator",
          content: originalNoVotesMsg, // Fallback content
          phraseKey: "VoteNoVotesMessage", // <-- Use phrase key
          placeholders: {}, // <-- Add placeholders
          timestamp: Date.now(),
          round: stateAfterTally.round,
          phase: stateAfterTally.phase,
          audience: { type: "all" },
        };
        voteModeratorMessages.push(noVotesMessage);

        const nightStartMsg: ChatMessage = {
          messageId: `msg-${crypto.randomUUID()}-nightstart`,
          gameId,
          speaker: { type: "moderator" },
          speakerName: "Moderator",
          content: `Night ${stateAfterTally.round} begins as darkness falls upon the village.`,
          phraseKey: "NightStartMessage",
          placeholders: { round: stateAfterTally.round },
          timestamp: Date.now() + 1,
          round: stateAfterTally.round,
          phase: stateAfterTally.phase,
          audience: { type: "all" },
        };
        voteModeratorMessages.push(nightStartMsg);
      }

      // Update player status if elimination occurred
      console.log(
        `[Vote Tally Debug] Before Status Update: dayEliminatedPlayerId = ${dayEliminatedPlayerId}`,
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
            (id) => id !== dayEliminatedPlayerId,
          ),
          deadPlayerIds: [
            ...stateAfterTally.deadPlayerIds,
            dayEliminatedPlayerId,
          ],
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
          `Game Over detected after vote resolution. Outcome: ${winResultVote.outcome}`,
        );
        // Add Game Over message using the win condition details
        // --- Translate Game Over Message ---
        const originalGameOverMsg = winResultVote.message;
        const gameOverPhraseKey =
          winResultVote.outcome === "Villager Win"
            ? "ModeratorGameOverVillagersWin"
            : winResultVote.outcome === "Werewolf Win"
            ? "ModeratorGameOverWerewolvesWin"
            : "GameOverMessage";
        // --- Replace Translation ---
        // const translatedGameOverMsg = await translateText(
        //   originalGameOverMsg,
        //   language,
        // );
        // --- End Replace Translation ---
        const gameOverMessage: ChatMessage = {
          messageId: `msg-${crypto.randomUUID()}-gameover-vote`,
          gameId: gameId,
          speaker: { type: "moderator" },
          speakerName: "Moderator",
          content: originalGameOverMsg, // Fallback content
          phraseKey: gameOverPhraseKey,
          placeholders: {},
          timestamp: Date.now(),
          round: stateAfterTally.round,
          phase: "GameOver",
          audience: { type: "all" },
        };
        stateAfterTally = {
          ...stateAfterTally,
          phase: "GameOver",
          winCondition: winResultVote,
          conversationLog: [
            ...stateAfterTally.conversationLog,
            gameOverMessage,
          ],
          updatedAt: Date.now(),
          isWaitingForVotes: false, // Ensure flag is false on game over
        };
        // Save final game over state
        await gameStateManager.updateGameState(gameId, stateAfterTally);
        console.log(`Game ${gameId} ended after voting.`);
        revalidatePath(`/game/${gameId}`);
        return; // End action
      }
      // Advance Phase (to Night)
      let nextState = advancePhase(stateAfterTally);

      nextState = {
        ...nextState,
        nightActions: [],
        votes: [],
        turnOrderIndex: 0,
        isWaitingForVotes: false, // Ensure flag is false when advancing to Night
      };

      // Log the final state before saving
      console.log(
        `[Vote Tally Debug] Final 'nextState' livingPlayerIds before save: ${nextState.livingPlayerIds.join(
          ", ",
        )}`,
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


