import type {
  GameState,
  PendingHumanAction,
  ChatMessage,
  AIMessageLogEntry,
} from "@/lib/types/game";
import { gameStateManager } from "@/lib/state/gameStateManager";
import { determineNextSpeaker, advancePhase } from "@/lib/game/engine";
import { DAY_INTRODUCTION_PROMPT } from "@/lib/ai/PROMPTS";
import { getAIResponse } from "@/lib/ai/openaiService";
import { cleanAIResponse } from "@/lib/utils/stringUtils";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export async function handleDayIntroductionsPhase(
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
        `[${gameId}] Human player ${nextSpeaker.name}'s turn for Introduction. Setting pending action.`,
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
        `Player ${nextSpeakerId} or their aiModel not found in game state.`,
      );
      return;
    }

    const prevMessages = currentState.conversationLog.filter(
      (msg) =>
        (msg.phase === "Day Introductions" &&
          msg.round === currentState.round &&
          !msg.isThinking) ||
        (msg.speaker.type === "moderator" &&
          msg.timestamp > Date.now() - 1000 * 60 * 10),
    );

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
      .map((msg) => `- ${msg.content}`)
      .join("\n");

    const systemPrompt = DAY_INTRODUCTION_PROMPT(
      nextSpeaker.persona,
      nextSpeaker.name,
      nextSpeaker.role,
      previousIntroductionsText,
      recentModeratorMessagesText,
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

    let rawIntroductionContent = "";
    let aiError: Error | null = null;
    const aiModel = nextSpeaker.aiModel;
    const aiSettings = {
      model: aiModel,
      temperature: 0.9,
      presence_penalty: 0.7,
      frequency_penalty: 0.7,
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
      rawIntroductionContent = "(Seems lost in thought...)";
    }

    const logEntry: AIMessageLogEntry = {
      timestamp: Date.now(),
      gameId,
      playerId: nextSpeakerId,
      model: aiModel,
      promptMessages,
      responseContent: aiError ? null : rawIntroductionContent,
      error: aiError ? aiError.message : undefined,
      phase: currentState.phase,
      round: currentState.round,
    };

    let stateBeforeLogUpdate = await gameStateManager.getGameState(gameId);
    if (!stateBeforeLogUpdate) {
      console.error(`Game state lost before logging AI intro for ${gameId}`);
      return;
    }

    stateBeforeLogUpdate = {
      ...stateBeforeLogUpdate,
      aiMessageLog: [...(stateBeforeLogUpdate.aiMessageLog || []), logEntry],
      updatedAt: Date.now(),
    };
    await gameStateManager.updateGameState(gameId, stateBeforeLogUpdate);

    const introductionContent = cleanAIResponse(rawIntroductionContent);

    const stateBeforeChatUpdate = await gameStateManager.getGameState(gameId);
    if (!stateBeforeChatUpdate) {
      console.error(`Game state lost before adding intro chat for ${gameId}`);
      return;
    }

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
    };

    const updatedState = {
      ...stateBeforeChatUpdate,
      conversationLog: [...stateBeforeChatUpdate.conversationLog, newMessage],
      turnOrderIndex: stateBeforeChatUpdate.turnOrderIndex + 1,
      updatedAt: Date.now(),
      pendingHumanAction: null, // Clear pending action as AI has responded
    };

    await gameStateManager.updateGameState(gameId, updatedState);
    console.log(`Introduction from ${nextSpeaker.name} added.`);

  } else {
    console.log("All players introduced. Advancing phase...");

    const stateBeforePhaseAdvance =
      await gameStateManager.getGameState(gameId);
    if (!stateBeforePhaseAdvance) {
      console.error(`Game state lost before phase advance for ${gameId}`);
      return;
    }

    let nextState = advancePhase(stateBeforePhaseAdvance);

    const originalIntroCompleteMsg =
      "Introductions are complete. The floor is now open for discussion.";
    const phaseChangeMessage: ChatMessage = {
      messageId: `msg-${crypto.randomUUID()}`,
      gameId: gameId,
      speaker: { type: "moderator" },
      speakerName: "Moderator",
      content: originalIntroCompleteMsg,
      timestamp: Date.now(),
      round: nextState.round,
      phase: nextState.phase,
      audience: { type: "all" },
      phraseKey: "IntroCompleteMessage",
      placeholders: {},
    };
    nextState = {
      ...nextState,
      conversationLog: [...nextState.conversationLog, phaseChangeMessage],
      turnOrderIndex: 0,
      pendingHumanAction: null, // Clear pending action on phase advance
    };

    await gameStateManager.updateGameState(gameId, nextState);
    console.log(
      `Game ${gameId} advanced from Day Introductions to ${nextState.phase}`,
    );
  }
} 