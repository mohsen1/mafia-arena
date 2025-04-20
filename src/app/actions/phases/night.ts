"use server";

import { getAIResponse } from "@/lib/ai/openaiService";
import {
  NIGHT_ACTION_DOCTOR_PROMPT,
  NIGHT_ACTION_SEER_PROMPT,
  NIGHT_ACTION_WEREWOLF_PROMPT,
  WEREWOLF_CHAT_PROMPT,
} from "@/lib/ai/PROMPTS";
import { gameStateManager } from "@/lib/state/gameStateManager";
import type {
  AIMessageLogEntry,
  ChatMessage,
  GameState,
  NightAction,
  PendingHumanAction,
  Player,
} from "@/lib/types/game";
import { cleanAIResponse } from "@/lib/utils/stringUtils";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export async function handleNightPhase(initialState: GameState, gameId: string) {
  console.log(`Processing Night phase for game ${gameId}...`);

  // Create a working copy to avoid reassigning the parameter
  let workingState = { ...initialState };
  
  // Get the latest game state if needed
  const latestState = await gameStateManager.getGameState(gameId);
  if (!latestState) {
    console.error(`Game state lost before night phase processing for ${gameId}`);
    return;
  }
  
  // Use the latest state to ensure we have the most up-to-date information
  workingState = latestState;
  
  // Correctly access language via settings
  const language = workingState.settings.language;
  const languageInstruction = `\n\nIMPORTANT: Respond ONLY in ${language}.`;

  const livingPlayers = workingState.livingPlayerIds.map(
    (id) => workingState.players[id],
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

  const collectedIndividualActions: NightAction[] = [];
  const werewolfPreferences: Record<string, string> = {}; // voterId -> targetId
  const werewolfChatMessages: ChatMessage[] = []; // Messages generated *this* night

  // --- Werewolf Chat Logic ---
  console.log(
    `Werewolves [${livingWerewolves.map((w) => w.name).join(", ")}] are preparing their night actions...`,
  );

  // Get summary of last *day's* events (vote result)
  const lastDaySummary =
    workingState.conversationLog
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
      workingState.round,
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

    // Only add non-empty chat messages
    if (chatContent.trim()) {
      const chatMessage: ChatMessage = {
        messageId: `msg-${crypto.randomUUID()}-wwchat`,
        gameId: gameId,
        speaker: { type: "player", playerId: wolf.id },
        speakerName: wolf.name,
        content: chatContent,
        timestamp: Date.now(),
        round: workingState.round,
        phase: workingState.phase,
        audience: { type: "werewolves" },
      };
      werewolfChatMessages.push(chatMessage);
    }

    // Log AI interaction for chat
    const logEntryChat: AIMessageLogEntry = {
      timestamp: Date.now(),
      gameId,
      playerId: wolf.id,
      model: aiModelChat,
      promptMessages: promptMessagesChat,
      responseContent: aiErrorChat ? null : rawChatContent,
      error: aiErrorChat ? aiErrorChat.message : undefined,
      phase: workingState.phase,
      round: workingState.round,
    };
    
    // Update log (fetch latest state first)
    const stateForChatLog = await gameStateManager.getGameState(gameId);
    if (stateForChatLog) {
      const updatedState = {
        ...stateForChatLog,
        aiMessageLog: [...(stateForChatLog.aiMessageLog || []), logEntryChat],
        updatedAt: Date.now(),
      };
      await gameStateManager.updateGameState(gameId, updatedState);
      workingState = updatedState; // Keep workingState current with logs
    } else {
      console.error(
        `Game state lost during werewolf chat AI log for ${gameId}`,
      );
    }
  } // End werewolf chat loop

  // Update the internal state with the collected chat messages *before* action prompts
  const stateWithWerewolfChat = {
    ...workingState,
    _internalState: {
      ...(workingState._internalState || {}),
      werewolfChatLog: [
        ...(workingState._internalState?.werewolfChatLog || []),
        ...werewolfChatMessages,
      ],
    },
    updatedAt: Date.now(), // Refresh timestamp
  };
  
  // Save state with chat log potentially updated
  await gameStateManager.updateGameState(gameId, stateWithWerewolfChat);
  
  // Fetch latest state for the action loop
  const stateForNightActions = await gameStateManager.getGameState(gameId);
  if (!stateForNightActions) {
    console.error(`Game state lost before night action loop for ${gameId}`);
    return;
  }
  
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

    let targetPlayerId: string | null = null;
    let retries = 2;
    const aiModelNight = activePlayer.aiModel;
    const aiSettingsNight = { model: aiModelNight, temperature: 0.8 };
    let latestPromptMessages = [...promptMessages]; // Copy for logging
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
          }
        } else {
          console.warn(
            `No number found in night choice response "${cleanedResponse}" from ${
              activePlayer.name
            }. Retrying... (${retries - 1} left)`,
          );
        }
        // --- Enhanced Parsing End ---

        if (targetPlayerId === null && retries > 0 && !aiErrorNight) {
          latestPromptMessages = [
            ...latestPromptMessages,
            {
              role: "assistant",
              content: cleanedResponse, // The invalid response
            },
            {
              role: "user",
              content: `Invalid input. Respond ONLY with a single number from the list (1-${targetOptions.length}).${languageInstruction}`,
            }
          ];
          retries--;
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
      const stateForNightLog = await gameStateManager.getGameState(gameId);
      if (!stateForNightLog) {
        console.error(`Game state lost during night AI log for ${gameId}`);
        break; // Exit loop if state is lost
      }
      
      const updatedState = {
        ...stateForNightLog,
        aiMessageLog: [
          ...(stateForNightLog.aiMessageLog || []),
          logEntryNight,
        ],
        updatedAt: Date.now(),
      };
      await gameStateManager.updateGameState(gameId, updatedState);
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
      const packTargetId = targetsWithMaxVotes[0];
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

  // 2. Update state with collected actions and advance to the next phase
  const stateWithCollectedActions = {
    ...stateBeforeAdvance,
    nightActions: finalNightActions, // Store the collected actions
    phase: "ResolveNight" as const, // Explicitly type as GamePhase
    updatedAt: Date.now(),
    // Reset other transient states that *might* have been set previously
    lastWerewolfTargetId: null,
    lastDoctorSaveId: null,
    lastSeerTargetId: null,
    lastEliminatedPlayerId: null, // Clear any previous day elim
  };

  // 3. Save the final state with collected actions and the new phase
  await gameStateManager.updateGameState(gameId, stateWithCollectedActions);
  console.log(
    `Game ${gameId} finished Night phase. Actions collected. Advanced to ResolveNight.`,
  );
  
  // Revalidate the path to ensure the UI updates
  revalidatePath(`/game/${gameId}`);
} 