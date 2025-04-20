import type {
  GameState,
  ChatMessage,
  NightAction,
  PendingHumanAction,
} from "@/lib/types/game";
import { gameStateManager } from "@/lib/state/gameStateManager";
import { advancePhase, checkWinCondition } from "@/lib/game/engine";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";

export async function handleResolveNightPhase(
  currentState: GameState,
  gameId: string,
) {
  console.log(`Processing ResolveNight phase for game ${gameId}...`);

  let stateAfterResolution = { ...currentState };
  const moderatorMessages: ChatMessage[] = [];
  let eliminatedPlayerId: string | null = null;
  let actualKillTargetId: string | null = null;
  let actualSaveTargetId: string | null = null;
  let actualSeerTargetId: string | null = null;

  const killAction = stateAfterResolution.nightActions.find(
    (a) => a.type === "werewolf_kill",
  );
  const saveAction = stateAfterResolution.nightActions.find(
    (a) => a.type === "doctor_save",
  );
  const investigationAction = stateAfterResolution.nightActions.find(
    (a) => a.type === "seer_investigation",
  );

  actualKillTargetId = killAction?.targetPlayerId ?? null;
  actualSaveTargetId = saveAction?.targetPlayerId ?? null;
  actualSeerTargetId = investigationAction?.targetPlayerId ?? null;

  if (killAction) {
    const targetId = killAction.targetPlayerId;
    const targetPlayer = stateAfterResolution.players[targetId];

    if (targetPlayer?.status !== "alive") {
      console.log(
        `Werewolf target ${targetPlayer?.name || targetId} was already dead. Attack ineffective.`,
      );
    } else if (saveAction && saveAction.targetPlayerId === targetId) {
      console.log(
        `Player ${targetPlayer.name} (${targetId}) was targeted for elimination but saved by the Doctor.`,
      );
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
      lastEliminatedPlayerId: eliminatedPlayerId,
    };
  }

  if (investigationAction) {
    const targetId = investigationAction.targetPlayerId;
    const targetPlayer = currentState.players[targetId]; // Check status BEFORE elimination
    const seerId = investigationAction.actingPlayerId;

    if (!targetPlayer || targetPlayer.status !== "alive") {
      console.log(
        `Seer (${seerId}) investigated ${targetPlayer?.name || targetId}, but they were dead or invalid. No result.`,
      );
    } else {
      const result: "Werewolf" | "Villager" =
        targetPlayer.role === "Werewolf" ? "Werewolf" : "Villager";
      console.log(
        `Seer (${seerId}) investigated ${targetPlayer.name} (${targetId}) - Result: ${result}`,
      );
      const internalState = stateAfterResolution._internalState || {};
      const seerResults = internalState.seerResults || {};
      seerResults[`${seerId}-${targetId}-${stateAfterResolution.round}`] = result;
      stateAfterResolution = {
        ...stateAfterResolution,
        _internalState: {
          ...internalState,
          seerResults,
        },
      };
    }
  }

  stateAfterResolution = {
    ...stateAfterResolution,
    lastWerewolfTargetId: actualKillTargetId,
    lastDoctorSaveId: actualSaveTargetId,
    lastSeerTargetId: actualSeerTargetId,
    updatedAt: Date.now(),
  };

  let originalSummaryContent = "";
  let summaryPhraseKey: string | undefined = undefined;
  let summaryPlaceholders: Record<string, string | number> = {};
  const nextDayRound = stateAfterResolution.round; 

  if (eliminatedPlayerId) {
    const eliminatedPlayerName =
      stateAfterResolution.players[eliminatedPlayerId].name;
    const eliminatedPlayerRole =
      stateAfterResolution.players[eliminatedPlayerId].role;
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
    currentState.players[killAction.targetPlayerId]?.status === "alive" // Check original status
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
    content: originalSummaryContent,
    phraseKey: summaryPhraseKey,
    placeholders: summaryPlaceholders,
    timestamp: Date.now(),
    round: stateAfterResolution.round,
    phase: stateAfterResolution.phase,
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
    const gameOverMessage: ChatMessage = {
      messageId: `msg-${crypto.randomUUID()}-gameover-night`,
      gameId: gameId,
      speaker: { type: "moderator" },
      speakerName: "Moderator",
      content: originalGameOverMsg,
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
      isWaitingForVotes: false,
      pendingHumanAction: null, // Clear pending action on game over
    };
    await gameStateManager.updateGameState(gameId, stateAfterResolution);
    console.log(`Game ${gameId} ended after night resolution.`);
    revalidatePath(`/game/${gameId}`);
    return;
  }

  let nextState = advancePhase(stateAfterResolution);

  if (nextState.phase === "Day Introductions") {
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
      content: originalPhaseStartMsg,
      phraseKey: phaseStartPhraseKey,
      placeholders: phaseStartPlaceholders,
      timestamp: Date.now(),
      round: nextState.round,
      phase: nextState.phase,
      audience: { type: "all" },
    };
    nextState = {
      ...nextState,
      conversationLog: [...nextState.conversationLog, phaseStartMessage],
    };
  }
  
  nextState = {
      ...nextState,
      pendingHumanAction: null, // Clear pending action when advancing from ResolveNight
  };

  await gameStateManager.updateGameState(gameId, nextState);
  console.log(
    `Game ${gameId} advanced from ResolveNight to ${nextState.phase}`,
  );
} 