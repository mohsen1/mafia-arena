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
import { runGameTurnAction } from "../gameTurn";

// Define temporary marker type used during night phase processing
type WerewolfPreferenceMarker = { type: 'werewolf_preference'; actingPlayerId: string; targetPlayerId: string; round: number };

// Define combined type for processing the action list which might contain temporary markers
type NightActionOrPreference = NightAction | WerewolfPreferenceMarker;

// Add local helper function (copied from voting.ts)
const getPlayerName = (
  state: GameState,
  playerId: string | null | undefined
): string => {
  if (!playerId) return "Unknown";
  return state.players[playerId]?.name || "Unknown";
};

export async function handleNightPhase(
  initialState: GameState,
  gameId: string
) {
  console.log(`[${gameId}] Entering handleNightPhase...`);
  try {
    // Create a working copy using the initial state passed in
    let workingState = { ...initialState };

    // Get the latest game state if needed (still good practice)
    const latestState = await gameStateManager.getGameState(gameId);
    if (!latestState) {
      console.error(
        `Game state lost before night phase processing for ${gameId}`
      );
      return;
    }
    workingState = latestState;

    // Correctly access language via settings
    const language = workingState.settings.language;
    const languageInstruction = `\n\nIMPORTANT: Respond ONLY in ${language}.`;

    const livingPlayers = workingState.livingPlayerIds.map(
      (id) => workingState.players[id]
    );
    const playersWithNightActions = livingPlayers.filter(
      (p) =>
        p.status === "alive" &&
        (p.role === "Werewolf" || p.role === "Seer" || p.role === "Doctor")
    );
    const livingWerewolves = playersWithNightActions.filter(
      (p) => p.role === "Werewolf"
    );
    const livingWerewolfIds = livingWerewolves.map((p) => p.id);

    const werewolfChatTurnIndex = workingState._internalState?.werewolfChatTurnIndex ?? 0;
    const werewolfChatComplete = werewolfChatTurnIndex >= livingWerewolves.length;

    if (livingWerewolves.length > 1 && !werewolfChatComplete) {
      console.log(
        `[${gameId}] Continuing Werewolf Chat (Round ${workingState.round}): Turn ${werewolfChatTurnIndex + 1}/${livingWerewolves.length}`
      );

      // Initialize index if it doesn't exist (first entry into chat this night)
      if (workingState._internalState?.werewolfChatTurnIndex === undefined) {
        workingState = {
          ...workingState,
          _internalState: {
            ...(workingState._internalState || {}),
            werewolfChatTurnIndex: 0,
          },
        };
        // Save the state with the initialized index immediately
        await gameStateManager.updateGameState(gameId, workingState);
        console.log(`[${gameId}] Initialized werewolfChatTurnIndex to 0.`);
      }

      const currentChatSpeaker = livingWerewolves[werewolfChatTurnIndex];
      if (!currentChatSpeaker) {
        console.error(`[${gameId}] Error: Could not determine werewolf chat speaker at index ${werewolfChatTurnIndex}`);
        // Mark chat as complete to avoid infinite loop
        workingState = { ...workingState, _internalState: { ...(workingState._internalState || {}), werewolfChatTurnIndex: livingWerewolves.length } };
        await gameStateManager.updateGameState(gameId, workingState);
        // Proceed cautiously to action phase? Or throw error? For now, proceed.
      } else {
        console.log(`[${gameId}] Werewolf chat turn: ${currentChatSpeaker.name}`);

        // --- HUMAN WEREWOLF CHAT CHECK ---
        if (currentChatSpeaker.isHuman) {
          if (workingState.pendingHumanAction?.type === "werewolfChat") {
            console.log(`[${gameId}] Night phase: Still waiting for human werewolf chat from ${currentChatSpeaker.name}. Returning.`);
            return;
          }
          console.log(`[${gameId}] Human Werewolf ${currentChatSpeaker.name} (${currentChatSpeaker.id}) turn for chat. Setting pending action.`);
          const pendingAction: PendingHumanAction = { type: "werewolfChat", phase: workingState.phase };
          const stateWaitingForHuman = { ...workingState, pendingHumanAction: pendingAction, updatedAt: Date.now() };
          await gameStateManager.updateGameState(gameId, stateWaitingForHuman);
          revalidatePath(`/game/${gameId}`);
          return; // PAUSE execution
        }
        // --- END HUMAN WEREWOLF CHAT CHECK ---

        // --- AI Werewolf Chat Logic ---
        if (!currentChatSpeaker.aiModel) {
          console.error(`Werewolf ${currentChatSpeaker.name} missing AI model.`);
          // Skip this AI's turn and immediately trigger next turn
          const nextIndex = werewolfChatTurnIndex + 1;
          workingState = { ...workingState, _internalState: { ...(workingState._internalState || {}), werewolfChatTurnIndex: nextIndex } };
          await gameStateManager.updateGameState(gameId, workingState);
          console.log(`[${gameId}] Skipping AI ${currentChatSpeaker.name}'s chat turn. Scheduling next turn.`);
          setTimeout(() => { runGameTurnAction(gameId).catch(console.error); }, 0);
          return; // End this execution, next turn scheduled
        }

        console.log(`[${gameId}] Preparing AI chat prompt for ${currentChatSpeaker.name}...`);

        // Prepare prompt context
        const fellowNames = livingWerewolves.filter((w) => w.id !== currentChatSpeaker.id).map((w) => w.name);
        const werewolfChatMessages = workingState._internalState?.werewolfChatLog || [];
        const recentChatHistory = werewolfChatMessages.filter((msg) => msg.round === workingState.round).map((msg) => `${msg.speakerName}: ${msg.content}`).join("\n");
        const lastDaySummary = workingState.conversationLog.filter((msg) => msg.messageId.includes("-elimination") || msg.messageId.includes("-tie")).pop()?.content || "The previous day's events are unclear.";

        const systemPromptChat = WEREWOLF_CHAT_PROMPT(currentChatSpeaker.persona, currentChatSpeaker.name, fellowNames, workingState.round, lastDaySummary, recentChatHistory);
        const promptMessagesChat: ChatCompletionMessageParam[] = [
          { role: "system", content: systemPromptChat },
          { role: "user", content: `What do you say privately to your fellow werewolf/wolves, ${currentChatSpeaker.name}?${languageInstruction}` },
        ];

        let rawChatContent = "";
        let aiErrorChat: Error | null = null;
        const aiModelChat = currentChatSpeaker.aiModel;
        const aiSettingsChat = { model: aiModelChat, temperature: 0.9, presence_penalty: 0.8, frequency_penalty: 0.7 };

        console.log(`[${gameId}] Sending prompt to AI model ${aiModelChat} for ${currentChatSpeaker.name}...`);

        try {
          rawChatContent = await getAIResponse(promptMessagesChat, gameId, currentChatSpeaker.id, aiSettingsChat);
          console.log(`[${gameId}] Received AI chat response from ${currentChatSpeaker.name}.`);
        } catch (error) {
          console.error(`AI call failed for ${currentChatSpeaker.name} werewolf chat:`, error);
          aiErrorChat = error instanceof Error ? error : new Error(String(error));
          rawChatContent = "(Remains silent...)";
        }
        const chatContent = cleanAIResponse(rawChatContent);
        let newChatMessage: ChatMessage | null = null;

        if (chatContent.trim()) {
          newChatMessage = {
            messageId: `msg-${crypto.randomUUID()}-wwchat`,
            gameId: gameId,
            speaker: { type: "player", playerId: currentChatSpeaker.id },
            speakerName: currentChatSpeaker.name,
            content: chatContent,
            timestamp: Date.now(),
            round: workingState.round,
            phase: workingState.phase,
            audience: { type: "werewolves" },
          };
        }

        const logEntryChat: AIMessageLogEntry = {
          timestamp: Date.now(),
          gameId,
          playerId: currentChatSpeaker.id,
          model: aiModelChat,
          promptMessages: promptMessagesChat,
          responseContent: aiErrorChat ? null : rawChatContent,
          error: aiErrorChat ? aiErrorChat.message : undefined,
          phase: workingState.phase,
          round: workingState.round,
        };

        // Fetch latest state before updating logs and index
        console.log(`[${gameId}] Fetching state before saving AI (${currentChatSpeaker.name}) chat log...`);
        const stateBeforeUpdate = await gameStateManager.getGameState(gameId);
        if (!stateBeforeUpdate) {
          console.error(`State lost before saving AI wolf chat for ${gameId}`);
          return; // Stop if state is lost
        }

        const currentWwLog = stateBeforeUpdate._internalState?.werewolfChatLog || [];
        const currentAiLog = stateBeforeUpdate.aiMessageLog || [];
        const nextIndex = werewolfChatTurnIndex + 1;
        console.log(`[${gameId}] Calculated next werewolf chat index: ${nextIndex}`);

        workingState = {
          ...stateBeforeUpdate,
          _internalState: {
            ...(stateBeforeUpdate._internalState || {}),
            werewolfChatLog: newChatMessage ? [...currentWwLog, newChatMessage] : currentWwLog,
            werewolfChatTurnIndex: nextIndex, // Increment index
          },
          aiMessageLog: [...currentAiLog, logEntryChat],
          updatedAt: Date.now(),
        };

        await gameStateManager.updateGameState(gameId, workingState);
        console.log(`[${gameId}] AI Werewolf ${currentChatSpeaker.name} chat processed. Index advanced to ${nextIndex}. State saved.`);

        // Trigger next turn (either next wolf or action phase)
        revalidatePath(`/game/${gameId}`);
        console.log(`[${gameId}] Scheduling next game turn via setTimeout after AI ${currentChatSpeaker.name}'s chat.`);
        return; // End this execution
        // --- End AI Werewolf Chat Logic ---
      }
    } else {
      // Either not enough wolves or chat is complete
      if (livingWerewolves.length <= 1) {
        console.log(`[${gameId}] Skipping werewolf chat phase: ${livingWerewolves.length} wolf/wolves left.`);
      } else {
        console.log(`[${gameId}] Werewolf chat phase complete.`);
        // Ensure index is marked as complete if it wasn't already
        if (!werewolfChatComplete) {
          workingState = { ...workingState, _internalState: { ...(workingState._internalState || {}), werewolfChatTurnIndex: livingWerewolves.length } };
          await gameStateManager.updateGameState(gameId, workingState);
          console.log(`[${gameId}] Marked werewolfChatTurnIndex as complete.`);
        }
      }
    } // End if (livingWerewolves.length > 1 && !werewolfChatComplete)

    // --- Collect Actions (Seer, Doctor, Werewolf Kill Preference/Action) ---
    // This section only runs if the werewolf chat is complete OR if there's <= 1 wolf

    const collectedIndividualActions: NightAction[] = [];
    const werewolfPreferences: Record<string, string> = {}; // voterId -> targetId

    // Fetch latest state before action loop, including any potential chat updates
    const stateForNightActions = await gameStateManager.getGameState(gameId);
    if (!stateForNightActions) {
      console.error(`Game state lost before night action loop for ${gameId}`);
      return;
    }
    // Update working state for action loop
    workingState = stateForNightActions;
    // Refresh local variables based on potentially updated state
    const werewolfChatMessages = workingState._internalState?.werewolfChatLog || []; // Get latest chat
    const werewolfChatHistoryForPrompt = werewolfChatMessages
      .filter((msg) => msg.round === workingState.round) // Use current round messages
      .map((msg) => `${msg.speakerName}: ${msg.content}`)
      .join("\n");

    // Refresh living player lists based on state used for actions
    const livingPlayersForActions = workingState.livingPlayerIds.map(
      (id) => workingState.players[id]
    );
    const playersWithNightActionsForActions = livingPlayersForActions.filter(
      (p) =>
        p.status === "alive" &&
        (p.role === "Werewolf" || p.role === "Seer" || p.role === "Doctor")
    );
    const livingWerewolvesForActions = playersWithNightActionsForActions.filter(
      (p) => p.role === "Werewolf"
    );
    const livingWerewolfIdsForActions = livingWerewolvesForActions.map(
      (p) => p.id
    );

    // --- Filter out players who have already submitted an action this night ---
    const submittedActionPlayerIds = new Set(
        workingState.nightActions.map(action => action.actingPlayerId)
    );

    const playersWhoNeedToAct = playersWithNightActionsForActions.filter(
        player => !submittedActionPlayerIds.has(player.id)
    );

    console.log(`[${gameId}] Players still needing to act this night: ${playersWhoNeedToAct.map(p => p.name).join(', ') || 'None'}`);

    // Find the *next* player who needs to act based on the original action order
    const nextActor = playersWhoNeedToAct.length > 0 ? playersWhoNeedToAct[0] : null;

    if (nextActor) {
      // --- HUMAN PLAYER NIGHT ACTION CHECK ---
      if (nextActor.isHuman) {
        if (workingState.pendingHumanAction?.type === "nightAction") {
          console.log(
            `[${gameId}] Night phase: Still waiting for human night action from ${nextActor.name}. Returning.`
          );
          return; // Already waiting for this human's night action
        }
        console.log(
          `[${gameId}] Human player ${nextActor.name} (${nextActor.role}) turn for Night Action. Setting pending action.`
        );
        const pendingAction: PendingHumanAction = {
          type: "nightAction",
          phase: workingState.phase,
        };
        const stateWaitingForHumanAction = {
          ...workingState,
          pendingHumanAction: pendingAction,
          updatedAt: Date.now(),
        };
        await gameStateManager.updateGameState(
          gameId,
          stateWaitingForHumanAction
        );
        revalidatePath(`/game/${gameId}`);
        return; // PAUSE execution and wait for human input
      }
      // --- END HUMAN PLAYER NIGHT ACTION CHECK ---

      // --- AI Night Action Logic (Process ONLY for the nextActor) ---
      const activePlayer = nextActor;
      if (!activePlayer.aiModel) {
        console.error(
          `AI Player ${activePlayer.id} (${activePlayer.name}) missing AI model.`
        );
        // Mark as skipped and schedule next check
        const skippedAction: NightAction = { type: 'error_skip', actingPlayerId: activePlayer.id };
        workingState = { ...workingState, nightActions: [...workingState.nightActions, skippedAction] };
        await gameStateManager.updateGameState(gameId, workingState);
        // Correctly schedule next turn check and return
        revalidatePath(`/game/${gameId}`); 
        setTimeout(() => { runGameTurnAction(gameId).catch(console.error); }, 0);
        return;
      }

      console.log(
        `Getting night action/preference for ${activePlayer.name} (${activePlayer.role})...`
      );
      let prompt = "";
      let targetOptions: Player[] = [];

      // Build prompt and targetOptions based on role
      switch (activePlayer.role) {
         case "Werewolf": {
           targetOptions = livingPlayersForActions.filter(
             (p) => p.status === "alive" && p.role !== "Werewolf"
           );
           if (targetOptions.length > 0) {
             if (livingWerewolvesForActions.length === 1) {
               prompt = NIGHT_ACTION_WEREWOLF_PROMPT(activePlayer.persona, activePlayer.name, [], targetOptions.map((p) => p.name), "");
             } else {
               const fellowNames = livingWerewolfIdsForActions.filter((id) => id !== activePlayer.id).map((id) => workingState.players[id].name);
               prompt = NIGHT_ACTION_WEREWOLF_PROMPT(activePlayer.persona, activePlayer.name, fellowNames, targetOptions.map((p) => p.name), werewolfChatHistoryForPrompt);
             }
           } else { console.log(`Werewolf ${activePlayer.name} has no valid targets.`); }
           break;
         }
         case "Seer":
           targetOptions = livingPlayersForActions.filter((p) => p.status === "alive" && p.id !== activePlayer.id);
           prompt = NIGHT_ACTION_SEER_PROMPT(activePlayer.persona, activePlayer.name, targetOptions.map((p) => p.name));
           break;
         case "Doctor":
           targetOptions = livingPlayersForActions.filter((p) => p.status === "alive");
           prompt = NIGHT_ACTION_DOCTOR_PROMPT(activePlayer.persona, activePlayer.name, targetOptions.map((p) => p.name));
           break;
       }

      if (!prompt || targetOptions.length === 0) {
        console.log(`Skipping action/preference for ${activePlayer.name} (no valid targets or action).`);
        const noTargetAction: NightAction = { type: 'no_target', actingPlayerId: activePlayer.id };
        workingState = { ...workingState, nightActions: [...workingState.nightActions, noTargetAction] };
        await gameStateManager.updateGameState(gameId, workingState);
        // Correctly schedule next turn check and return
        revalidatePath(`/game/${gameId}`); 
        setTimeout(() => { runGameTurnAction(gameId).catch(console.error); }, 0);
        return;
      }

      // Variables scoped within this AI action block
      const promptMessages: ChatCompletionMessageParam[] = [
         { role: "system", content: prompt },
         { role: "user", content: `Choose your target.${languageInstruction}` },
      ];
      let targetPlayerId: string | null = null;
      let retries = 2;
      const aiModelNight = activePlayer.aiModel;
      const aiSettingsNight = { model: aiModelNight, temperature: 0.8 };
      let latestPromptMessages = [...promptMessages];
      let rawResponse = "";
      let aiErrorNight: Error | null = null;
      let logEntryNight: AIMessageLogEntry | null = null; // Initialize log entry

      // Retry loop
      while (retries > 0 && targetPlayerId === null) {
        aiErrorNight = null;
        rawResponse = "";
        try {
          rawResponse = await getAIResponse(latestPromptMessages, gameId, activePlayer.id, aiSettingsNight);
          const cleanedResponse = cleanAIResponse(rawResponse);
          const match = cleanedResponse.match(/\d+/);
          const extractedNumberStr = match ? match[0] : null;
          if (extractedNumberStr) {
            const choiceIndex = Number.parseInt(extractedNumberStr, 10) - 1;
            if (!Number.isNaN(choiceIndex) && choiceIndex >= 0 && choiceIndex < targetOptions.length) {
              targetPlayerId = targetOptions[choiceIndex].id;
            } else { console.warn(`Invalid night choice number ${choiceIndex + 1} from ${activePlayer.name}. Retrying... (${retries - 1} left)`); }
          } else { console.warn(`No number found in night choice response "${cleanedResponse}" from ${activePlayer.name}. Retrying... (${retries - 1} left)`); }
          if (targetPlayerId === null && retries > 0 && !aiErrorNight) {
            latestPromptMessages = [
              ...latestPromptMessages,
              { role: "assistant", content: cleanedResponse },
              { role: "user", content: `Invalid input. Respond ONLY with a single number from the list (1-${targetOptions.length}).${languageInstruction}` },
            ];
            retries--;
          }
        } catch (error) {
          console.error(`AI call failed for ${activePlayer.name}'s night action/preference:`, error);
          aiErrorNight = error instanceof Error ? error : new Error(String(error));
          retries = 0;
        } finally { // Added finally block for consistent logging
           logEntryNight = { 
               timestamp: Date.now(), gameId, playerId: activePlayer.id, model: aiModelNight, 
               promptMessages: [...latestPromptMessages], responseContent: aiErrorNight ? null : rawResponse, 
               error: aiErrorNight ? aiErrorNight.message : undefined, phase: stateForNightActions.phase, round: stateForNightActions.round 
           };
           const stateForNightLog = await gameStateManager.getGameState(gameId);
           if (!stateForNightLog) {
               console.error(`Game state lost during night AI log for ${gameId}`);
               // Logged error, proceed cautiously. Skip state update in finally.
           } else {
               // Only update state if stateForNightLog is not null
               const updatedStateForLog = {
                 ...stateForNightLog, // Now safe: stateForNightLog is GameState here
                 aiMessageLog: [...(stateForNightLog.aiMessageLog || []), logEntryNight],
                 updatedAt: Date.now(),
               };
               await gameStateManager.updateGameState(gameId, updatedStateForLog);
               // Update working state after logging if needed (though not critical if immediately scheduling next turn)
               workingState = updatedStateForLog; 
           }
        }
      } // End retry loop

      // --- Add the AI's action/preference (or mark failure) --- 
      // Define a temporary type for the preference marker
      type WerewolfPreferenceMarker = { type: 'werewolf_preference'; actingPlayerId: string; targetPlayerId: string; round: number };
      let actionToAdd: NightAction | WerewolfPreferenceMarker | null = null; // Initialize as null
      
      if (targetPlayerId) {
        const finalTargetName = workingState.players[targetPlayerId].name; // Use updated workingState
        switch (activePlayer.role) {
          case "Werewolf":
            console.log(`${activePlayer.name} (Werewolf) indicated preference for ${finalTargetName} (${targetPlayerId})`);
            werewolfPreferences[activePlayer.id] = targetPlayerId;
            actionToAdd = { type: 'werewolf_preference', actingPlayerId: activePlayer.id, targetPlayerId, round: workingState.round }; 
            break;
          case "Seer":
            console.log(`${activePlayer.name} (Seer) targeted ${finalTargetName} (${targetPlayerId}) for investigation`);
            actionToAdd = { type: "seer_investigation", actingPlayerId: activePlayer.id, targetPlayerId };
            break;
          case "Doctor":
            console.log(`${activePlayer.name} (Doctor) targeted ${finalTargetName} (${targetPlayerId}) for protection`);
            actionToAdd = { type: "doctor_save", actingPlayerId: activePlayer.id, targetPlayerId };
            break;
        }
      } else {
        console.warn(`${activePlayer.name} (${activePlayer.role}) failed to provide a valid target after retries. Marking.`);
        actionToAdd = { type: 'failed_action', actingPlayerId: activePlayer.id };
      }

      // Fetch latest state AGAIN before saving the action 
      const stateBeforeActionSave = await gameStateManager.getGameState(gameId);
      if (!stateBeforeActionSave) {
        console.error(`State lost before saving action for ${activePlayer.name}`);
        return;
      }

      // Add the determined action/failure/preference marker
      workingState = {
        ...stateBeforeActionSave,
        // Add the action, ensuring not to add null
        // Use 'as any' because actionToAdd might be a temporary marker type (like WerewolfPreferenceMarker)
        // which is filtered out later.
        nightActions: actionToAdd ? [...(stateBeforeActionSave.nightActions || []), actionToAdd as any] : [...(stateBeforeActionSave.nightActions || [])],
        updatedAt: Date.now(),
      };

      await gameStateManager.updateGameState(gameId, workingState);
      console.log(`[${gameId}] Action/Preference/Failure recorded for ${activePlayer.name}.`);

      // Schedule the next check/turn
      revalidatePath(`/game/${gameId}`);
      setTimeout(() => { runGameTurnAction(gameId).catch(console.error); }, 0);
      return; // End this AI turn execution
      // --- End AI Night Action Logic ---
    }

  } else {
    // No more players need to act this night
    console.log("Finished collecting ALL night actions/preferences for this round.");

    // --- Tally Werewolf Preferences (Only if MULTIPLE wolves voted) ---
    // Fetch the absolute latest state before tallying
    const stateBeforeTally = await gameStateManager.getGameState(gameId);
    if (!stateBeforeTally) {
      console.error(`State lost before tallying votes for ${gameId}`);
      return;
    }
    workingState = stateBeforeTally; // Use the definitive state

    // Use the combined type when processing the potentially mixed array
    const currentRoundNightActions: NightActionOrPreference[] = (workingState.nightActions || []).filter(
        (a: NightActionOrPreference): a is NightActionOrPreference & { round: number } => a.round === workingState.round // Filter actions for *this* round and ensure round property exists
    );

    const currentRoundPreferences = currentRoundNightActions
      .filter((action): action is WerewolfPreferenceMarker => action.type === 'werewolf_preference') // Type guard remains correct
      .reduce((acc, action) => { // Type action as WerewolfPreferenceMarker here (implicitly handled by filter)
        acc[action.actingPlayerId] = action.targetPlayerId;
        return acc;
      }, {} as Record<string, string>);


    // Filter out temporary/placeholder/failure actions before finalizing
    const finalNightActions: NightAction[] = currentRoundNightActions.filter(
        (action: NightActionOrPreference): action is NightAction => // Use combined type, guard to NightAction
        action.type !== 'werewolf_preference' &&
        action.type !== 'error_skip' &&
        action.type !== 'no_target' &&
        action.type !== 'failed_action'
    );

    // Tally logic remains the same, using currentRoundPreferences
    if (livingWerewolvesForActions.length > 1) {
      if (Object.keys(currentRoundPreferences).length > 0) {
        const targetVoteCounts: Record<string, number> = {};
        let maxVotes = 0;
        let targetsWithMaxVotes: string[] = [];
        for (const targetId of Object.values(currentRoundPreferences)) {
          targetVoteCounts[targetId] = (targetVoteCounts[targetId] || 0) + 1;
        }
        console.log("[Night Tally] Werewolf Target Vote Counts:", targetVoteCounts);
        for (const targetId in targetVoteCounts) {
          if (targetVoteCounts[targetId] > maxVotes) {
            maxVotes = targetVoteCounts[targetId];
            targetsWithMaxVotes = [targetId];
          } else if (targetVoteCounts[targetId] === maxVotes) {
            targetsWithMaxVotes.push(targetId);
          }
        }
        console.log(`[Night Tally Debug] Max Votes: ${maxVotes}, Targets with Max: ${targetsWithMaxVotes.map((id) => workingState.players[id]?.name || id).join(", ")}`);
        if (targetsWithMaxVotes.length === 1) {
          const packTargetId = targetsWithMaxVotes[0];
          const packTargetName = workingState.players[packTargetId]?.name;
          console.log(`Werewolf pack agreed to target ${packTargetName} (${packTargetId}) with ${maxVotes} votes.`);
          const representativeWolfId = livingWerewolvesForActions[0]; // Assign one wolf as the killer
          if (representativeWolfId) {
            finalNightActions.push({ type: "werewolf_kill", actingPlayerId: representativeWolfId, targetPlayerId: packTargetId });
          }
        } else {
          if (targetsWithMaxVotes.length > 1) { console.log(`Werewolf vote tied between ${targetsWithMaxVotes.map((id) => workingState.players[id]?.name).join(" and ")}. No kill.`); }
          else { console.log("No werewolf majority or no preferences cast."); }
        }
      } else {
        console.log("No werewolf preferences recorded (multiple wolves were alive). No kill.");
      }
    } else if (livingWerewolvesForActions.length === 1) {
       // Find the single wolf's preference action marker from this round
      const loneWolfId = livingWerewolvesForActions[0].id;
      const loneWolfAction = currentRoundNightActions.find((a): a is WerewolfPreferenceMarker => // Type guard still correct
          a.actingPlayerId === loneWolfId &&
          a.type === 'werewolf_preference'
      );
      if (loneWolfAction?.targetPlayerId) { // Use optional chaining
        const targetName = getPlayerName(workingState, loneWolfAction.targetPlayerId);
        console.log(`Lone werewolf ${livingWerewolvesForActions[0].name} chose to kill ${targetName} (${loneWolfAction.targetPlayerId}).`);
        finalNightActions.push({ type: "werewolf_kill", actingPlayerId: loneWolfId, targetPlayerId: loneWolfAction.targetPlayerId });
      } else {
        console.log(`Lone werewolf ${livingWerewolvesForActions[0].name} did not successfully choose or record a target this round.`);
      }
    } else {
      console.log("No living werewolves to perform kill action.");
    }

    console.log("Final Night Actions Collected (after tally):", finalNightActions);

    // --- Update State and Advance Phase ---
    // Use the state fetched right before tallying (workingState)
    const stateWithFinalActions = {
      ...workingState, 
      nightActions: finalNightActions, // Store the FINAL actions (filtered)
      phase: "ResolveNight" as const,
      updatedAt: Date.now(),
      // Reset other transient states
      lastWerewolfTargetId:
        finalNightActions.find((a) => a.type === "werewolf_kill")
          ?.targetPlayerId || null,
      lastDoctorSaveId: null, // ResolveNight phase should set this based on actions
      lastSeerTargetId: null, // ResolveNight phase should set this based on actions
      pendingHumanAction: null, // Clear any pending night action/chat
      _internalState: {
        // Preserve existing internal state, merge logs
        ...(stateBeforeTally._internalState || {}),
        werewolfChatLog: stateBeforeTally._internalState?.werewolfChatLog || [], // Carry over final chat log
        // Reset werewolf chat index for the next night (or keep it if needed for history?)
        // Let's reset it here for simplicity.
        werewolfChatTurnIndex: 0,
      },
    };

    console.log(`Advancing game ${gameId} to ResolveNight phase.`);
    await gameStateManager.updateGameState(gameId, stateWithFinalActions);
    revalidatePath(`/game/${gameId}`);

    // Trigger ResolveNight phase processing immediately
    // No need to call runGameTurnAction here, as the next game loop iteration will handle it
    // based on the updated phase.

  } catch (error: unknown) {
    console.error(`[${gameId}] Error during handleNightPhase:`, error);
    // Consider updating game state to reflect an error
  }
}
