import type {
  GameState,
  PendingHumanAction,
  ChatMessage,
  AIMessageLogEntry,
} from "@/lib/types/game";
import { gameStateManager } from "@/lib/state/gameStateManager";
import {
  determineNextSpeaker,
  advancePhase,
  calculateTotalDiscussionTurns,
} from "@/lib/game/engine";
import { DAY_DISCUSSION_PROMPT } from "@/lib/ai/PROMPTS";
import { getAIResponse } from "@/lib/ai/openaiService";
import { cleanAIResponse } from "@/lib/utils/stringUtils";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export async function handleDayDiscussionPhase(
  currentState: GameState,
  gameId: string,
) {
  const language = currentState.settings.language;
  const languageInstruction = `\n\nIMPORTANT: Respond ONLY in ${language}.`;

  const nextSpeakerId = determineNextSpeaker(currentState);

  if (nextSpeakerId) {
    const nextSpeaker = currentState.players[nextSpeakerId];

    // --- START HUMAN PLAYER CHECK ---
    if (nextSpeaker.isHuman) {
      console.log(
        `[${gameId}] Human player ${nextSpeaker.name}'s turn for Discussion. Setting pending action.`,
      );
      const pendingAction: PendingHumanAction = {
        type: "chat",
        phase: currentState.phase,
      };
      const updatedState = {
        ...currentState,
        pendingHumanAction: pendingAction,
        updatedAt: Date.now(),
      };
      await gameStateManager.updateGameState(gameId, updatedState);
      revalidatePath(`/game/${gameId}`); // Notify frontend
      return; // Wait for human input
    }
    // --- END HUMAN PLAYER CHECK ---

    if (!nextSpeaker || !nextSpeaker.aiModel) {
      console.error(
        `Next speaker ${nextSpeakerId} or their aiModel not found in game state.`,
      );
      return;
    }

    const thinkingMessageId = `msg-${crypto.randomUUID()}-thinking`;
    console.log(`Getting discussion contribution from ${nextSpeaker.name}...`);

    const thinkingMessage: ChatMessage = {
      messageId: thinkingMessageId,
      gameId: gameId,
      speaker: { type: "player", playerId: nextSpeakerId },
      speakerName: nextSpeaker.name,
      content: "", // Content is empty for thinking message
      timestamp: Date.now(),
      round: currentState.round,
      phase: currentState.phase,
      audience: { type: "all" },
      isThinking: true,
    };

    const stateWithThinking = {
      ...currentState,
      conversationLog: [...currentState.conversationLog, thinkingMessage],
      updatedAt: Date.now(),
      pendingHumanAction: null, // Clear pending action as AI starts thinking
    };
    await gameStateManager.updateGameState(gameId, stateWithThinking);
    revalidatePath(`/game/${gameId}`);
    console.log(`Added thinking message for ${nextSpeaker.name} discussion.`);

    const relevantLog = currentState.conversationLog
      .filter((msg) => !msg.isThinking)
      .slice(-40);

    const conversationHistory = relevantLog
      .map((msg) => {
        if (msg.speaker.type === "moderator") {
          return `**Moderator:** ${msg.content}`;
        }
        return `${msg.speakerName}: ${msg.content}`;
      })
      .join("\n");

    const livingPlayerNames = currentState.livingPlayerIds.map(
      (id) => currentState.players[id].name,
    );

    const systemPrompt = DAY_DISCUSSION_PROMPT(
      nextSpeaker.persona,
      nextSpeaker.name,
      nextSpeaker.role,
      currentState.round,
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
      rawDiscussionContent = errorMessage;
    }

    const logEntryDiscussion: AIMessageLogEntry = {
      timestamp: Date.now(),
      gameId,
      playerId: nextSpeakerId,
      model: aiModelDiscussion,
      promptMessages,
      responseContent: aiErrorDiscussion ? null : rawDiscussionContent,
      error: aiErrorDiscussion ? aiErrorDiscussion.message : undefined,
      phase: currentState.phase,
      round: currentState.round,
    };

    let stateBeforeDiscLog = await gameStateManager.getGameState(gameId);
    if (!stateBeforeDiscLog) {
      console.error(
        `Game state lost before logging AI discussion for ${gameId}`,
      );
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
    // FIX: Ensure content is not empty after cleaning. Assign default if it is.
    let discussionContent =
      errorMessage || cleanAIResponse(rawDiscussionContent);
    if (!discussionContent?.trim()) {
      console.warn(`AI ${nextSpeaker.name} provided empty discussion content. Using default.`);
      discussionContent = "(Stays silent...)"; // Default content for empty response
    }

    const stateAfterThinking = await gameStateManager.getGameState(gameId);
    if (!stateAfterThinking) {
      console.error(
        `Game state lost after thinking (discussion) for ${gameId}`,
      );
      return;
    }

    console.log(
      `[${gameId}|${nextSpeakerId}] Final discussion content before state update:`,
      discussionContent,
    );

    const finalMessage: ChatMessage = {
      messageId: `msg-${crypto.randomUUID()}`,
      gameId: gameId,
      speaker: { type: "player", playerId: nextSpeakerId },
      speakerName: nextSpeaker.name,
      content: discussionContent, // Use potentially defaulted content
      timestamp: Date.now(),
      round: stateAfterThinking.round,
      phase: stateAfterThinking.phase,
      audience: { type: "all" },
      isThinking: false,
    };

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
      pendingHumanAction: null, // Clear pending action as AI has responded
    };

    const totalTurnsTaken = finalState.turnOrderIndex;
    const totalExpectedTurns = calculateTotalDiscussionTurns(finalState);

    if (totalTurnsTaken >= totalExpectedTurns) {
      console.log(
        `All ${totalExpectedTurns} discussion turns completed. Transitioning to Voting...`,
      );
      const stateBeforeVote = advancePhase(finalState);
      finalState = {
        ...stateBeforeVote,
        votes: [],
        isWaitingForVotes: true,
        pendingHumanAction: null, // Ensure pending action is clear when advancing
      };
      console.log(`Game ${gameId} advanced to ${finalState.phase} phase.`);
    } else {
      const nextEffectiveIndex =
        totalTurnsTaken % finalState.livingPlayerIds.length;
      const nextActualSpeakerId = finalState.livingPlayerIds[nextEffectiveIndex];
      const nextSpeakerName =
        finalState.players[nextActualSpeakerId]?.name || "Next Player";
      const remainingTurns = totalExpectedTurns - totalTurnsTaken;
      console.log(
        `Player ${nextSpeaker.name} finished speaking. Turn ${totalTurnsTaken}/${totalExpectedTurns}. Next up: ${nextSpeakerName}. (${remainingTurns} turns remaining)`,
      );
    }

    await gameStateManager.updateGameState(gameId, finalState);
    console.log(
      `DayDiscussion turn processed for ${nextSpeaker.name}. Total turns taken: ${finalState.turnOrderIndex}`,
    );

    // Revalidate path AFTER state update, BEFORE potentially triggering next turn
    revalidatePath(`/game/${gameId}`);

    // Trigger next turn if applicable
    // Check if it's still DayDiscussion and not waiting for a human
    const stateAfterAI = await gameStateManager.getGameState(gameId);
    if (
      stateAfterAI && // Check if state exists
      stateAfterAI.phase === "DayDiscussion" && // Check if phase is still correct
      !stateAfterAI.pendingHumanAction // Check if not waiting for human
    ) {
      console.log(
        `[${gameId}] Scheduling next discussion turn via setTimeout after AI ${nextSpeaker.name}'s turn.`
      );
    } else {
      console.log(
        "All expected discussion turns completed (determineNextSpeaker returned null). Advancing phase to Voting...",
      );

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

      let nextState = advancePhase(stateBeforeVote);
      nextState = {
        ...nextState,
        votes: [],
        isWaitingForVotes: true,
        pendingHumanAction: null, // Ensure pending action is clear when advancing
      };

      await gameStateManager.updateGameState(gameId, nextState);
      console.log(
        `Game ${gameId} advanced from DayDiscussion to Voting (null speaker case).`,
      );
    }
  } else {
    // All discussion turns complete or nextSpeaker determined as null
    console.log(
      "All expected discussion turns completed (determineNextSpeaker returned null). Advancing phase to Voting...",
    );

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

    let nextState = advancePhase(stateBeforeVote);
    nextState = {
      ...nextState,
      votes: [],
      isWaitingForVotes: true,
      pendingHumanAction: null, // Ensure pending action is clear when advancing
    };

    await gameStateManager.updateGameState(gameId, nextState);
    console.log(
      `Game ${gameId} advanced from DayDiscussion to Voting (null speaker case).`,
    );
  }
} 