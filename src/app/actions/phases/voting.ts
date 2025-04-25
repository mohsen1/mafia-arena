import type {
  GameState,
  PendingHumanAction,
  ChatMessage,
  Vote,
  AIMessageLogEntry,
  Role,
  Player,
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

  let currentState = await gameStateManager.getGameState(gameId);
  if (!currentState) {
      console.error(`[${gameId}] Voting phase: Failed to fetch initial state.`);
      return;
  }
  
  // If state was somehow advanced by another process, exit
  if (currentState.phase !== 'Voting') {
      console.warn(`[${gameId}] Voting phase: State phase is already ${currentState.phase}. Aborting.`);
      return;
  }

  const livingPlayers = currentState.livingPlayerIds
    .map((id) => currentState?.players[id])
    // Explicitly filter out undefined players first
    .filter((p): p is Player => p !== undefined && p.status === "alive");
  const livingPlayerCount = livingPlayers.length;
  let currentVotes = currentState.votes || [];

  // --- Collect Votes ---
  const playersWhoHaventVotedIds = livingPlayers
      // Now safe to access p.id as undefined players are filtered
      .map(p => p.id) 
      .filter(id => !currentVotes.some(v => v.voterPlayerId === id));

  console.log(`[${gameId}] Voting phase: ${currentVotes.length}/${livingPlayerCount} votes collected. Players yet to vote: ${playersWhoHaventVotedIds.join(', ')}`);
  
  // If still waiting for human, exit
  if (playersWhoHaventVotedIds.includes(currentState.humanPlayerId || '') && currentState.pendingHumanAction?.type === 'vote') {
      console.log(`[${gameId}] Voting phase: Still waiting for human vote.`);
      return;
  }

  // Loop through players who still need to vote
  for (const voterId of playersWhoHaventVotedIds) {
    const voter = currentState.players[voterId];
    if (!voter || voter.status !== 'alive') continue; // Skip if player data missing or dead

    console.log(`Getting vote from ${voter.name} (${voter.id})...`);

    if (voter.isHuman) {
      console.log(
        `[${gameId}] Human player ${voter.name}'s turn to Vote. Setting pending action.`
      );
      const pendingAction: PendingHumanAction = {
        type: "vote",
        phase: currentState.phase,
      };
      const stateWaitingForHumanVote = {
        ...currentState, 
        votes: currentVotes, // Pass current collected votes
        pendingHumanAction: pendingAction,
        updatedAt: Date.now(),
      };
      await gameStateManager.updateGameState(gameId, stateWaitingForHumanVote);
      revalidatePath(`/game/${gameId}`);
      // IMPORTANT: Return immediately after setting pending action for human
      return; 
    }

    // --- AI Vote Logic ---
    // livingPlayers is already filtered, safe to use p.id
    const targetOptions = livingPlayers.filter((p) => p.id !== voter.id); 
    if (targetOptions.length === 0) {
      console.log(`Skipping vote for ${voter.name} (no other living players).`);
      currentVotes.push({ voterPlayerId: voter.id, targetPlayerId: "ABSTAIN" }); // Record abstention
      continue; // Move to next player
    }

    // targetOptions contains only valid Player objects, safe to use p.name
    const numberedTargetList = targetOptions
      .map((p, index) => `${index + 1}. ${p.name}`) 
      .join("\n");

    // Use stateToResolve (guaranteed non-null here) instead of potentially null currentState
    const relevantHistory = currentState.conversationLog 
      .filter(
        (msg) =>
          msg.phase === "DayDiscussion" && msg.round === currentState?.round 
      )
      .map((msg) => `${msg.speakerName}: ${msg.content}`)
      .join("\n");

    const systemPrompt = VOTING_PROMPT(
      voter.persona,
      voter.name,
      voter.role,
      currentState.round,
      numberedTargetList,
      relevantHistory
    );

    const promptMessages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Who do you vote to eliminate, ${voter.name}? (Respond with the number)${languageInstruction}`,
      },
    ];

    let targetPlayerId: string | null = null;
    let retries = 2;
    const aiModelVote = voter.aiModel;
    const aiSettingsVote = { model: aiModelVote, temperature: 0.6 };
    let latestPromptMessagesVote = [...promptMessages]; // Use mutable copy for retries
    let rawResponseVote = "";
    let aiErrorVote: Error | null = null;

    // Retry loop for getting valid AI vote
    while (retries > 0 && targetPlayerId === null) {
      aiErrorVote = null;
      rawResponseVote = "";
      try {
        rawResponseVote = await getAIResponse(
          latestPromptMessagesVote,
          gameId,
          voter.id,
          aiSettingsVote
        );
        const cleanedResponse = cleanAIResponse(rawResponseVote);
        const match = cleanedResponse.match(/\d+/);
        const extractedNumberStr = match ? match[0] : null;

        if (extractedNumberStr) {
          const choiceIndex = Number.parseInt(extractedNumberStr, 10) - 1;
          if (
            !Number.isNaN(choiceIndex) &&
            choiceIndex >= 0 &&
            choiceIndex < targetOptions.length &&
            targetOptions[choiceIndex] // Add explicit check here
          ) {
            targetPlayerId = targetOptions[choiceIndex].id;
          } else {
             console.warn(
                `Invalid vote choice number ${choiceIndex + 1} (extracted from "${cleanedResponse}") by ${voter.name}. Expected 1-${targetOptions.length}. Retrying... (${retries - 1} left)`
              );
              // Prepare for retry
              if(retries > 1) { // Only add retry prompts if retries remain
                latestPromptMessagesVote = [
                  ...latestPromptMessagesVote,
                  { role: "assistant", content: cleanedResponse },
                  { role: "user", content: `Invalid input. Respond ONLY with a single number from the list (1-${targetOptions.length}).${languageInstruction}` }
                ];
              }
          }
        } else {
          console.warn(
             `No number found in vote response "${cleanedResponse}" from ${voter.name}. Retrying... (${retries - 1} left)`
           );
           // Prepare for retry
            if(retries > 1) { // Only add retry prompts if retries remain
              latestPromptMessagesVote = [
                 ...latestPromptMessagesVote,
                 { role: "assistant", content: cleanedResponse },
                 { role: "user", content: `Invalid input. Respond ONLY with a single number from the list (1-${targetOptions.length}).${languageInstruction}` }
               ];
            }
        }
      } catch (error) {
        console.error(`AI call failed for ${voter.name}'s vote:`, error);
        aiErrorVote = error instanceof Error ? error : new Error(String(error));
        retries = 0; // Stop retrying on API error
      }

       // --- Log AI interaction ---
        const logEntryVote: AIMessageLogEntry = {
            timestamp: Date.now(),
            gameId,
            playerId: voter.id,
            model: aiModelVote,
            promptMessages: [...latestPromptMessagesVote], // Log the prompts *for this attempt*
            responseContent: aiErrorVote ? null : rawResponseVote,
            error: aiErrorVote ? aiErrorVote.message : undefined,
            phase: currentState.phase,
            round: currentState.round,
        };
        // Fetch latest state JUST before logging
        const stateForLog = await gameStateManager.getGameState(gameId);
        if (stateForLog) {
            const logUpdateState = {
                ...stateForLog,
                aiMessageLog: [...(stateForLog.aiMessageLog || []), logEntryVote],
                updatedAt: Date.now(),
            };
            await gameStateManager.updateGameState(gameId, logUpdateState);
             // Update loop state ONLY after successful log save
            currentState = logUpdateState;
        } else {
            console.error(`Game state lost during vote AI log for ${voter.id}. Aborting vote.`);
            // Decide how to handle this - potentially mark as abstain and continue? For now, return.
             return;
        }
        // --- End Log AI interaction ---

        // If vote still invalid after API call and logging, decrement retries
        if (targetPlayerId === null && retries > 0 && !aiErrorVote) {
            retries--;
        }
         // If API error occurred, retries already set to 0
         
      } // End retry loop

      // Add the vote (or abstention) to the list
      if (targetPlayerId) {
        const finalTargetName = currentState.players[targetPlayerId]?.name || 'Unknown Target';
        console.log(
          `${voter.name} voted for ${finalTargetName} (${targetPlayerId})`
        );
        currentVotes.push({ voterPlayerId: voter.id, targetPlayerId });
      } else {
        console.warn(
          `${voter.name} failed to provide a valid vote target after retries. Abstaining.`
        );
        currentVotes.push({ voterPlayerId: voter.id, targetPlayerId: "ABSTAIN" });
      }

       // --- Save intermediate vote state ---
        // Fetch latest state before saving this AI's vote
        const stateBeforeVoteSave = await gameStateManager.getGameState(gameId);
        if (!stateBeforeVoteSave) {
            console.error(`State lost before saving AI vote from ${voter.name}. Aborting vote collection.`);
            return; // Stop processing votes if state is lost
        }
        const intermediateVoteState = {
            ...stateBeforeVoteSave, 
            votes: currentVotes, // Update with the latest vote
            updatedAt: Date.now(),
        };
        await gameStateManager.updateGameState(gameId, intermediateVoteState);
        // Update the loop's working state to reflect the saved vote
        currentState = intermediateVoteState;
      // --- End intermediate save ---

  } // End loop through players who haven't voted

  // Re-fetch state AFTER the loop to ensure we have all votes saved by AI/human actions
  currentState = await gameStateManager.getGameState(gameId);
   if (!currentState) {
      console.error(`[${gameId}] Voting phase: Failed to fetch state after vote collection loop.`);
      return;
  }
  // Re-check vote count against potentially updated livingPlayerCount
  const finalLivingPlayerCount = currentState.livingPlayerIds.length; 
  currentVotes = currentState.votes || []; // Use the most recently fetched votes

  // --- All votes should now be collected, proceed to Tally ---
  if (currentVotes.length < finalLivingPlayerCount) {
      console.warn(
        `[${gameId}] Voting phase: Exited loop but vote count (${currentVotes.length}) is less than living players (${finalLivingPlayerCount}). Returning to wait.`
      );
      return; // Should not happen if logic is correct, but safety check
  }
  
  console.log(`[${gameId}] All ${finalLivingPlayerCount} votes collected. Proceeding to TALLY and RESOLVE.`);

  // --- Vote Tally and Resolution --- 
  // Use the definitive currentState fetched after the loop
  const stateToResolve = { ...currentState }; 
  const voteModeratorMessages: ChatMessage[] = [];
  let dayEliminatedPlayerId: string | null = null;
  let eliminatedPlayerName: string | null = null;
  let eliminatedPlayerRole: Role | "Unknown Role" | null = null;

  const validVotes = currentVotes.filter(
    (v) => v.targetPlayerId && v.targetPlayerId !== "ABSTAIN",
  );

  if (validVotes.length > 0) {
    const voteCounts: Record<string, number> = {};
    for (const vote of validVotes) {
      if(stateToResolve.players[vote.targetPlayerId]) {
          voteCounts[vote.targetPlayerId] =
            (voteCounts[vote.targetPlayerId] || 0) + 1;
      } else {
          console.warn(`[${gameId}] Invalid targetPlayerId found in vote: ${vote.targetPlayerId} by ${vote.voterPlayerId}`);
      }
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
      `[Vote Tally Debug] Max Votes: ${maxVotes}, Players with Max: ${playersWithMaxVotes.join(", ")}`
    );
    
    // Create vote breakdown string ONCE (use const)
    const voteBreakdown = validVotes.length > 0 
      ? `\nVote Details:\n${validVotes
          .map((vote) => {
            const voterName = getPlayerName(stateToResolve, vote.voterPlayerId);
            const targetName = (vote.targetPlayerId === "ABSTAIN") 
                ? "Abstain" 
                : getPlayerName(stateToResolve, vote.targetPlayerId);
            return `- ${voterName} voted for ${targetName}`;
          })
          .join("\n")}`
      : "\nNo valid votes were cast towards any player.";

    // Create vote summary string ONCE (use const)
    const voteSummary = Object.entries(voteCounts).map(([targetId, count]) => {
       const targetName = getPlayerName(stateToResolve, targetId);
       return `- ${targetName}: ${count} ${count === 1 ? "vote" : "votes"}`;
     }).join("\n");

    // --- Determine Outcome (Elimination or Tie/No Majority) ---
    if (playersWithMaxVotes.length === 1 && maxVotes > 0) {
      // ELIMINATION
      dayEliminatedPlayerId = playersWithMaxVotes[0];
      eliminatedPlayerName = getPlayerName(stateToResolve, dayEliminatedPlayerId);
      eliminatedPlayerRole = getPlayerRole(stateToResolve, dayEliminatedPlayerId);
      console.log(
        `Player ${eliminatedPlayerName} (${dayEliminatedPlayerId}) eliminated with ${maxVotes} votes. Role: ${eliminatedPlayerRole}`
      );
      
      const originalEliminationMsg = `The votes are in!\n${voteSummary}\nWith ${maxVotes} votes, ${eliminatedPlayerName} has been eliminated by the village. They were a ${eliminatedPlayerRole}.`;
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
        timestamp: Date.now(), // Timestamp for when result is decided
        round: stateToResolve.round,
        phase: stateToResolve.phase, // Still Voting phase technically when message generated
        audience: { type: "all" },
      };
      voteModeratorMessages.push(eliminationMessage);
      
    } else if (playersWithMaxVotes.length > 1) {
       // TIE
      dayEliminatedPlayerId = null;
      const tiedPlayerNames = playersWithMaxVotes
        .map((id) => getPlayerName(stateToResolve, id))
        .join(" and ");
      console.log(
        `Vote tied between ${tiedPlayerNames} with ${maxVotes} votes each. No one eliminated.`
      );
      
      const originalTieMsg = `The votes are in!\n${voteSummary}\nThe vote is tied between ${tiedPlayerNames}! No one is eliminated today.`;
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
        timestamp: Date.now(),
        round: stateToResolve.round,
        phase: stateToResolve.phase, 
        audience: { type: "all" },
      };
      voteModeratorMessages.push(tieMessage);

    } else {
       // NO MAJORITY / ONLY ABSTAIN
       dayEliminatedPlayerId = null;
       console.log(
         "No majority vote or only abstentions. No one eliminated."
       );
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
         round: stateToResolve.round,
         phase: stateToResolve.phase, 
         audience: { type: "all" },
       };
       voteModeratorMessages.push(noMajorityMessage);
    }
  } else {
    // NO VALID VOTES CAST
    dayEliminatedPlayerId = null;
    console.log("No valid votes were cast. No one eliminated.");
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
      round: stateToResolve.round,
      phase: stateToResolve.phase, 
      audience: { type: "all" },
    };
    voteModeratorMessages.push(noVotesMessage);
  }

  // --- Update Player Status and Final State Prep ---
  let finalResolvedState = { ...stateToResolve };

  // Add the outcome message(s) generated above
  finalResolvedState = {
     ...finalResolvedState,
     conversationLog: [
       ...finalResolvedState.conversationLog,
       ...voteModeratorMessages,
     ],
     isWaitingForVotes: false, // Voting is done
     pendingHumanAction: null, // Clear pending action
     updatedAt: Date.now(), 
   };

  // Apply elimination status if someone was eliminated
  if (dayEliminatedPlayerId) {
    const playersCopy = { ...finalResolvedState.players };
    // Check if player exists before updating
    if (playersCopy[dayEliminatedPlayerId]) { 
        playersCopy[dayEliminatedPlayerId] = {
          ...playersCopy[dayEliminatedPlayerId],
          status: "dead",
        };
        finalResolvedState = {
          ...finalResolvedState,
          players: playersCopy,
          livingPlayerIds: finalResolvedState.livingPlayerIds.filter(
            (id) => id !== dayEliminatedPlayerId,
          ),
          deadPlayerIds: [
            ...finalResolvedState.deadPlayerIds,
            dayEliminatedPlayerId,
          ],
          lastEliminatedPlayerId: dayEliminatedPlayerId,
        };
    } else {
         console.error(`[${gameId}] Attempted to eliminate non-existent player ID: ${dayEliminatedPlayerId}`);
         // Reset elimination info if player ID was invalid
         dayEliminatedPlayerId = null;
         eliminatedPlayerName = null;
         eliminatedPlayerRole = null;
    }
  }

  // --- Check Win Condition and Advance Phase ---
  const winResultVote = checkWinCondition(finalResolvedState);
  if (winResultVote) {
    // --- Handle Game Over ---
    console.log(
      `Game Over detected after vote resolution. Outcome: ${winResultVote.outcome}`
    );
    const originalGameOverMsg = winResultVote.message;
    const gameOverPhraseKey =
        winResultVote.outcome === "Villager Win" ? "ModeratorGameOverVillagersWin"
      : winResultVote.outcome === "Werewolf Win" ? "ModeratorGameOverWerewolvesWin"
      : "GameOverMessage"; 

    const gameOverMessage: ChatMessage = {
      messageId: `msg-${crypto.randomUUID()}-gameover-vote`,
      gameId: gameId,
      speaker: { type: "moderator" },
      speakerName: "Moderator",
      content: originalGameOverMsg,
      phraseKey: gameOverPhraseKey,
      placeholders: {}, 
      timestamp: Date.now() + 1, 
      round: finalResolvedState.round, // Round doesn't advance on game over
      phase: "GameOver" as const, 
      audience: { type: "all" },
    };

    const finalGameOverState: GameState = {
      ...finalResolvedState,
      phase: "GameOver" as const, 
      winCondition: winResultVote,
      conversationLog: [...finalResolvedState.conversationLog, gameOverMessage],
      updatedAt: Date.now(),
      votes: [], // Clear votes
      nightActions: [], // Clear actions
      isWaitingForVotes: false, 
      pendingHumanAction: null,
    };
    await gameStateManager.updateGameState(gameId, finalGameOverState);
    console.log(`Game ${gameId} ended after voting.`);
    revalidatePath(`/game/${gameId}`);
    return; 
  }

  // --- Advance to Night Phase ---
  console.log(`Advancing game ${gameId} from Voting to Night.`);
  // Combine advancePhase and state reset into one const declaration
  const nextState: GameState = {
    ...advancePhase(finalResolvedState), // Apply phase advancement first
    // Reset states for the start of Night
    nightActions: [], 
    votes: [], 
    turnOrderIndex: 0, 
    isWaitingForVotes: false, 
    pendingHumanAction: null, 
    updatedAt: Date.now(),
  }; 
  
  console.log(
    `Saving final state for game ${gameId} after advancing to ${nextState.phase}.`
  );
  await gameStateManager.updateGameState(gameId, nextState);
  revalidatePath(`/game/${gameId}`);
} 