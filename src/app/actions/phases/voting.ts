import type {
  GameState,
  PendingHumanAction,
  ChatMessage,
  Vote,
  AIMessageLogEntry,
  Role,
} from "@/lib/types/game";
import { gameStateManager } from "@/lib/state/gameStateManager";
import {
  advancePhase,
  checkWinCondition,
} from "@/lib/game/engine";
import { VOTING_PROMPT } from "@/lib/ai/PROMPTS";
import { getAIResponse } from "@/lib/ai/openaiService";
import { cleanAIResponse } from "@/lib/utils/stringUtils";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

// Local helper functions for this module
const getPlayerName = (
  state: GameState,
  playerId: string | null | undefined,
): string => {
  if (!playerId) return "Unknown";
  return state.players[playerId]?.name || "Unknown";
};

const getPlayerRole = (
  state: GameState,
  playerId: string | null | undefined,
): Role | "Unknown Role" => {
  if (!playerId) return "Unknown Role";
  return state.players[playerId]?.role || "Unknown Role";
};

export async function handleVotingPhase(initialState: GameState, gameId: string) {
  const language = initialState.settings.language;
  const languageInstruction = `\n\nIMPORTANT: Respond ONLY in ${language}.`;

  console.log(`Processing Voting phase for game ${gameId}...`);

  // Use a mutable variable for state within the handler
  let currentState = { ...initialState };

  // --- NEW: Check if waiting for human vote before collecting AI votes ---
  if (currentState.pendingHumanAction?.type === "vote") {
    console.log(`[${gameId}] Voting phase: Still waiting for human vote. Returning.`);
    return;
  }
  // --- END NEW CHECK ---

  const livingPlayers = currentState.livingPlayerIds
    .map((id) => currentState.players[id])
    .filter((p) => p.status === "alive");
  const livingPlayerCount = livingPlayers.length;
  const currentVotes = currentState.votes || [];

  // --- Check if all votes are already collected ---
  if (currentVotes.length >= livingPlayerCount) {
    console.log(
      `[${gameId}] Voting phase: All ${livingPlayerCount} votes collected. Proceeding to tally.`,
    );
  } else {
    console.log(
      `[${gameId}] Voting phase: Collecting votes (${currentVotes.length}/${livingPlayerCount} collected so far).`,
    );

    const playersWhoHaventVoted = livingPlayers.filter(
      (p) => !currentVotes.some((v) => v.voterPlayerId === p.id),
    );

    for (const voter of playersWhoHaventVoted) {
      console.log(`Getting vote from ${voter.name}...`);

      if (voter.isHuman) {
        console.log(
          `[${gameId}] Human player ${voter.name}'s turn to Vote. Setting pending action.`,
        );
        const pendingAction: PendingHumanAction = {
          type: "vote",
          phase: currentState.phase,
        };
        const stateWaitingForHumanVote = {
          ...currentState, 
          votes: currentVotes, 
          pendingHumanAction: pendingAction,
          updatedAt: Date.now(),
        };
        await gameStateManager.updateGameState(gameId, stateWaitingForHumanVote);
        revalidatePath(`/game/${gameId}`);
        return;
      }

      const targetOptions = livingPlayers.filter((p) => p.id !== voter.id);
      if (targetOptions.length === 0) {
        console.log(`Skipping vote for ${voter.name} (no other living players).`);
        continue;
      }

      const numberedTargetList = targetOptions
        .map((p, index) => `${index + 1}. ${p.name}`)
        .join("\n");

      const relevantHistory = currentState.conversationLog
        .filter(
          (msg) =>
            msg.phase === "DayDiscussion" && msg.round === currentState.round,
        )
        .map((msg) => `${msg.speakerName}: ${msg.content}`)
        .join("\n");

      const systemPrompt = VOTING_PROMPT(
        voter.persona,
        voter.name,
        voter.role,
        currentState.round,
        numberedTargetList,
        relevantHistory,
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
      const latestPromptMessagesVote = [...promptMessages];
      let rawResponseVote = "";
      let aiErrorVote: Error | null = null;

      while (retries > 0 && targetPlayerId === null) {
        aiErrorVote = null;
        rawResponseVote = "";
        try {
          rawResponseVote = await getAIResponse(
            latestPromptMessagesVote,
            gameId,
            voter.id,
            aiSettingsVote,
          );
          const cleanedResponse = cleanAIResponse(rawResponseVote);
          const match = cleanedResponse.match(/\d+/);
          const extractedNumberStr = match ? match[0] : null;

          if (extractedNumberStr) {
            const choiceIndex = Number.parseInt(extractedNumberStr, 10) - 1;
            if (
              !Number.isNaN(choiceIndex) &&
              choiceIndex >= 0 &&
              choiceIndex < targetOptions.length
            ) {
              targetPlayerId = targetOptions[choiceIndex].id;
            } else {
              console.warn(
                `Invalid vote choice number ${choiceIndex + 1} (extracted from "${cleanedResponse}") by ${voter.name}. Expected 1-${targetOptions.length}. Retrying... (${retries - 1} left)`,
              );
              targetNumberStr = cleanedResponse;
            }
          } else {
            console.warn(
              `No number found in vote response "${cleanedResponse}" from ${voter.name}. Retrying... (${retries - 1} left)`,
            );
            targetNumberStr = cleanedResponse;
          }

          if (targetPlayerId === null && retries > 0 && !aiErrorVote) {
            latestPromptMessagesVote.push({
              role: "assistant",
              content: targetNumberStr,
            });
            latestPromptMessagesVote.push({
              role: "user",
              content: `Invalid input. Respond ONLY with a single number from the list (1-${targetOptions.length}).${languageInstruction}`,
            });
            retries--;
            targetNumberStr = "";
          } 
        } catch (error) {
          console.error(`AI call failed for ${voter.name}'s vote:`, error);
          aiErrorVote = error instanceof Error ? error : new Error(String(error));
          retries = 0;
        }

        const logEntryVote: AIMessageLogEntry = {
          timestamp: Date.now(),
          gameId,
          playerId: voter.id,
          model: aiModelVote,
          promptMessages: [...latestPromptMessagesVote],
          responseContent: aiErrorVote ? null : rawResponseVote,
          error: aiErrorVote ? aiErrorVote.message : undefined,
          phase: currentState.phase,
          round: currentState.round,
        };

        let stateForVoteLog = await gameStateManager.getGameState(gameId);
        if (!stateForVoteLog) {
          console.error(`Game state lost during vote AI log for ${gameId}`);
          break;
        }
        stateForVoteLog = {
          ...stateForVoteLog,
          aiMessageLog: [...(stateForVoteLog.aiMessageLog || []), logEntryVote],
          updatedAt: Date.now(),
        };
        await gameStateManager.updateGameState(gameId, stateForVoteLog);

        if (targetPlayerId === null && retries > 0 && !aiErrorVote) {
          // Messages already pushed above before re-entering loop
          retries--; // Decrement retry here if invalid input caused retry
          targetNumberStr = "";
        }
      }

      if (targetPlayerId) {
        const finalTargetName = currentState.players[targetPlayerId].name;
        console.log(
          `${voter.name} voted for ${finalTargetName} (${targetPlayerId})`,
        );
        currentVotes.push({ voterPlayerId: voter.id, targetPlayerId });
      } else {
        console.warn(
          `${voter.name} failed to provide a valid vote target after retries.`,
        );
        currentVotes.push({ voterPlayerId: voter.id, targetPlayerId: "ABSTAIN" });
      }
      
      // Fetch latest before immediate update
      const fetchedStateBeforeUpdate = await gameStateManager.getGameState(gameId); 
      if (!fetchedStateBeforeUpdate) {
          console.error(`State lost after AI vote from ${voter.name}. Aborting vote collection.`);
          return; // Stop processing votes if state is lost
      }
      const immediateVoteUpdateState = {
        ...fetchedStateBeforeUpdate, 
        votes: currentVotes, 
        updatedAt: Date.now(),
      };
      await gameStateManager.updateGameState(gameId, immediateVoteUpdateState);
      // Update the loop's working state
      currentState = immediateVoteUpdateState;
    }

    if (currentVotes.length < livingPlayerCount) {
      console.log(
        `[${gameId}] Voting phase: Still collecting votes (${currentVotes.length}/${livingPlayerCount}). Returning.`,
      );
      return;
    }
  }

  // --- Vote Tally and Resolution --- 
  console.log("Proceeding to tally votes.");
  let stateAfterTally = { ...currentState, votes: currentVotes }; 
  const voteModeratorMessages: ChatMessage[] = [];
  let dayEliminatedPlayerId: string | null = null;

  const validVotes = stateAfterTally.votes.filter(
    (v) => v.targetPlayerId && v.targetPlayerId !== "ABSTAIN",
  );

  if (validVotes.length > 0) {
    const voteCounts: Record<string, number> = {};
    for (const vote of validVotes) {
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
      `[Vote Tally Debug] Max Votes: ${maxVotes}, Players with Max: ${playersWithMaxVotes.join(", ")}`,
    );
    console.log(
      "[Vote Tally Debug] voteCounts used for summary:",
      voteCounts,
    );

    // TODO: translate this
    let voteDetails = "";
    let voteBreakdown = "";
    if (validVotes.length > 0) {
      voteBreakdown = validVotes
        .map((vote) => {
          const voterName = getPlayerName(stateAfterTally, vote.voterPlayerId);
          const targetName = getPlayerName(stateAfterTally, vote.targetPlayerId);
          return `- ${voterName} voted for ${targetName}`;
        })
        .join("\n");
      voteBreakdown =
        `\nVote Details:\n${voteBreakdown}`;
    } else {
      voteBreakdown = "\nNo valid votes were cast towards any player.";
    }

    for (const [targetId, count] of Object.entries(voteCounts)) {
      const targetName = getPlayerName(stateAfterTally, targetId);
      voteDetails += `- ${targetName}: ${count} ${count === 1 ? "vote" : "votes"}\n`;
    }

    if (playersWithMaxVotes.length === 1) {
      console.log("[Vote Tally Debug] Entering ELIMINATION branch.");
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
      const originalEliminationMsg = `The votes are in!\n${voteDetails}\nWith ${maxVotes} votes, ${eliminatedPlayerName} has been eliminated by the village. They were a ${eliminatedPlayerRole}.`;
      const eliminationMessage: ChatMessage = {
        messageId: `msg-${crypto.randomUUID()}-elimination`,
        gameId: gameId,
        speaker: { type: "moderator" },
        speakerName: "Moderator",
        content: originalEliminationMsg,
        phraseKey: "VoteEliminationMessage",
        placeholders: {
          voteCount: maxVotes,
          playerName: eliminatedPlayerName,
          playerRole: eliminatedPlayerRole,
          voteBreakdown: voteBreakdown,
        },
        timestamp: Date.now() + 1,
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
        content: `Night ${stateAfterTally.round + 1} begins as darkness falls upon the village.`,
        phraseKey: "NightStartMessage",
        placeholders: { round: stateAfterTally.round + 1 },
        timestamp: Date.now() + 2,
        round: stateAfterTally.round,
        phase: stateAfterTally.phase,
        audience: { type: "all" },
      };
      voteModeratorMessages.push(nightStartMsg);

    } else if (playersWithMaxVotes.length > 1) {
      console.log("[Vote Tally Debug] Entering TIE branch.");
      dayEliminatedPlayerId = null;
      const tiedPlayerNames = playersWithMaxVotes
        .map((id) => getPlayerName(stateAfterTally, id))
        .join(", ");
      console.log(
        `Vote tied between ${tiedPlayerNames} with ${maxVotes} votes each. No one eliminated.`,
      );
      const originalTieMsg = `The votes are in!\n${voteDetails}\nThe vote is tied between ${tiedPlayerNames}! No one is eliminated today.`;
      const tieMessage: ChatMessage = {
        messageId: `msg-${crypto.randomUUID()}-tie`,
        gameId: gameId,
        speaker: { type: "moderator" },
        speakerName: "Moderator",
        content: originalTieMsg,
        phraseKey: "VoteTieMessage",
        placeholders: {
          tiedPlayerNames,
          voteBreakdown: voteBreakdown,
        },
        timestamp: Date.now() + 1,
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
        content: `Night ${stateAfterTally.round + 1} begins as darkness falls upon the village.`,
        phraseKey: "NightStartMessage",
        placeholders: { round: stateAfterTally.round + 1 },
        timestamp: Date.now() + 2,
        round: stateAfterTally.round,
        phase: stateAfterTally.phase,
        audience: { type: "all" },
      };
      voteModeratorMessages.push(nightStartMsg);
    } else {
      // Handles cases like 0 max votes (only abstentions) or other unexpected vote counts
      console.log(
        "[Vote Tally Debug] Entering NO MAJORITY / UNEXPECTED branch.",
      );
      dayEliminatedPlayerId = null; // Ensure no elimination
      const originalNoMajorityMsg =
        "The votes are scattered, and no consensus is reached. No one is eliminated today.";
      const noMajorityMessage: ChatMessage = {
        messageId: `msg-${crypto.randomUUID()}-nomajority`,
        gameId: gameId,
        speaker: { type: "moderator" },
        speakerName: "Moderator",
        content: originalNoMajorityMsg,
        phraseKey: "VoteNoMajorityMessage",
        placeholders: { voteBreakdown: voteBreakdown },
        timestamp: Date.now(),
        round: stateAfterTally.round,
        phase: stateAfterTally.phase,
        audience: { type: "all" },
      };
      voteModeratorMessages.push(noMajorityMessage);

      const nightStartMsg: ChatMessage = {
        messageId: `msg-${crypto.randomUUID()}-nightstart`,
        gameId,
        speaker: { type: "moderator" },
        speakerName: "Moderator",
        content: `Night ${stateAfterTally.round + 1} begins as darkness falls upon the village.`,
        phraseKey: "NightStartMessage",
        placeholders: { round: stateAfterTally.round + 1 },
        timestamp: Date.now() + 1,
        round: stateAfterTally.round,
        phase: stateAfterTally.phase,
        audience: { type: "all" },
      };
      voteModeratorMessages.push(nightStartMsg);
    }
  } else {
    // Handle case where no valid votes were cast at all
    console.log("[Vote Tally Debug] Entering NO VOTES CAST branch.");
    dayEliminatedPlayerId = null;
    const originalNoVotesMsg = "No votes were cast. The village remains undecided.";
    const noVotesMessage: ChatMessage = {
      messageId: `msg-${crypto.randomUUID()}-novotes`,
      gameId: gameId,
      speaker: { type: "moderator" },
      speakerName: "Moderator",
      content: originalNoVotesMsg,
      phraseKey: "VoteNoVotesMessage",
      placeholders: {},
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
      content: `Night ${stateAfterTally.round + 1} begins as darkness falls upon the village.`,
      phraseKey: "NightStartMessage",
      placeholders: { round: stateAfterTally.round + 1 },
      timestamp: Date.now() + 1,
      round: stateAfterTally.round,
      phase: stateAfterTally.phase,
      audience: { type: "all" },
    };
    voteModeratorMessages.push(nightStartMsg);
  }

  console.log(
    `[Vote Tally Debug] Before Status Update: dayEliminatedPlayerId = ${dayEliminatedPlayerId}`,
  );
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
    isWaitingForVotes: false,
    pendingHumanAction: null, // Clear pending action after tally
  };

  const winResultVote = checkWinCondition(stateAfterTally);
  if (winResultVote) {
    console.log(
      `Game Over detected after vote resolution. Outcome: ${winResultVote.outcome}`,
    );
    const originalGameOverMsg = winResultVote.message;
    const gameOverPhraseKey =
      winResultVote.outcome === "Villager Win"
        ? "ModeratorGameOverVillagersWin"
        : winResultVote.outcome === "Werewolf Win"
        ? "ModeratorGameOverWerewolvesWin"
        : "GameOverMessage";
    const gameOverMessage: ChatMessage = {
      messageId: `msg-${crypto.randomUUID()}-gameover-vote`,
      gameId: gameId,
      speaker: { type: "moderator" },
      speakerName: "Moderator",
      content: originalGameOverMsg,
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
      isWaitingForVotes: false,
      pendingHumanAction: null,
    };
    await gameStateManager.updateGameState(gameId, stateAfterTally);
    console.log(`Game ${gameId} ended after voting.`);
    revalidatePath(`/game/${gameId}`);
    return;
  }

  let nextState = advancePhase(stateAfterTally);
  nextState = {
    ...nextState,
    nightActions: [],
    votes: [],
    turnOrderIndex: 0,
    isWaitingForVotes: false,
    pendingHumanAction: null,
  };

  console.log(
    `[Vote Tally Debug] Final 'nextState' livingPlayerIds before save: ${nextState.livingPlayerIds.join(", ")}`,
  );
  await gameStateManager.updateGameState(gameId, nextState);
  console.log(`Game ${gameId} advanced from Voting to ${nextState.phase}`);
} 