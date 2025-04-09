import { getAIGameTitleAndDescription } from "@/lib/ai/openaiService";
import type {
  ChatMessage,
  GamePhase,
  GameSettings,
  GameState,
  NightAction,
  Player,
  PlayerInitializationData,
  Role,
  SpeakerType,
  Vote,
  WinCondition,
} from "@/lib/types/game";
import crypto from "node:crypto";
import { DEFAULT_GAME_SETTINGS } from "@/lib/config";
import { selectCharacterImage } from "@/lib/utils/imageUtils";
import { mapLanguageNameToCode } from "@/lib/translation/languages";
import type { LanguageName } from "@/lib/translation/languages";

// --- Constants ---

// --- Utility Functions ---

/**
 * Shuffles an array in place using the Fisher-Yates algorithm.
 * @template T The type of elements in the array.
 * @param {T[]} array The array to shuffle.
 * @returns {T[]} The shuffled array.
 */
function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]]; // Swap elements
  }
  return array;
}

// --- Game Initialization Logic ---

/**
 * Initializes a new game state with AI-generated players and selected images.
 */
export async function initializeNewGame(
  settings: GameSettings,
  gameId: string,
  createdAt: number,
  playerInitDataList: (PlayerInitializationData & { persona: string })[],
  language: LanguageName,
): Promise<GameState> {
  console.log(
    `Initializing game ${gameId} with ${playerInitDataList.length} players. Settings:`,
    settings,
    `Language: ${language}`,
  );

  const players: Record<string, Player> = {};
  const livingPlayerIds: string[] = [];

  for (const initData of playerInitDataList) {
    const playerId = `player-${crypto.randomUUID().substring(0, 8)}`;
    // Prioritize pre-generated image, await fallback selection
    const imageUrlFromSelection =
      initData.imageUrl ??
      (await selectCharacterImage(
        initData.profile?.gender,
        initData.profile?.ageCategory,
      ));
    // Assign final URL (null becomes undefined)
    const finalImageUrl = imageUrlFromSelection ?? undefined;

    // Basic validation: Check if profile exists
    if (!initData.profile) {
      console.error(
        "Initialization failed: Missing profile data for a player.",
      );
      throw new Error("Missing player profile data during initialization.");
    }
    if (!initData.aiModel) {
      console.error("Initialization failed: Missing aiModel for a player.");
      throw new Error("Missing player AI model during initialization.");
    }

    const newPlayer: Player = {
      id: playerId,
      name: initData.profile.characterName,
      role: initData.role,
      persona: initData.persona,
      status: "alive",
      aiModel: initData.aiModel,
      imageUrl: finalImageUrl,
      voiceId: initData.voiceId,
    };
    players[playerId] = newPlayer;
    livingPlayerIds.push(playerId);
  }

  // --- Shuffle Player Order for Initial Turn ---
  const shuffledPlayerIds = shuffleArray([...livingPlayerIds]);

  // --- Initial Game State ---
  const initialGameState: GameState = {
    gameId,
    createdAt,
    updatedAt: createdAt,
    phase: "DayIntroductions",
    round: 1,
    players,
    livingPlayerIds: shuffledPlayerIds,
    deadPlayerIds: [],
    turnOrder: [...shuffledPlayerIds],
    turnOrderIndex: 0,
    settings,
    conversationLog: [],
    votes: [],
    nightActions: [],
    lastEliminatedPlayerId: null,
    lastWerewolfTargetId: null,
    lastDoctorSaveId: null,
    lastSeerTargetId: null,
    winCondition: null,
    language: language,
    _internalState: {
      initialProfiles: playerInitDataList.map(
        ({ profile, role, aiModel, imageUrl, voiceId }) => ({
          profile,
          role,
          aiModel,
          imageUrl,
          voiceId,
        }),
      ),
    },
    aiMessageLog: [],
  };

  // Get AI Title and Description - Use the default model from config
  console.log(
    `Using model ${DEFAULT_GAME_SETTINGS.aiModel} for game title/description generation.`,
  );
  const playerDetailsForTitle = Object.values(players).map((p) => ({
    name: p.name,
    persona: p.persona,
  }));
  // Explicitly define the settings object for the API call
  const titleGenSettings: { model: string; temperature?: number } = {
    model: DEFAULT_GAME_SETTINGS.aiModel,
    // temperature: 0.8 // Optionally set temperature if needed
  };
  const { title, description } = await getAIGameTitleAndDescription(
    playerDetailsForTitle,
    titleGenSettings,
    language,
  );

  initialGameState.title = title;
  initialGameState.description = description;

  console.log(`Game ${gameId} initialized successfully.`);
  return initialGameState;
}

// --- Phase Transition Logic ---

/**
 * Advances the game to the next phase based on the current phase.
 * Handles the cyclical nature: Night -> Day -> Voting -> Night (new round).
 * Does nothing if the game is already over.
 *
 * @param currentState The current state of the game.
 * @returns A new GameState object with the updated phase and potentially round number.
 */
export function advancePhase(currentState: GameState): GameState {
  if (currentState.phase === "GameOver") {
    return currentState; // No changes if game is over
  }

  let nextPhase: GamePhase;
  let nextRound = currentState.round;
  let nextTurnOrderIndex = 0; // Reset index for the start of the new phase
  let nextTurnOrder = [...currentState.turnOrder]; // Default to current order
  // const livingWerewolvesExist = currentState.livingPlayerIds.some(id => currentState.players[id].role === 'Werewolf'); // No longer needed here

  switch (currentState.phase) {
    case "Night":
      nextPhase = "ResolveNight";
      console.log(`Advancing from Night to ResolveNight, Round ${nextRound}`);
      break;
    case "ResolveNight":
      // After resolving night actions, proceed directly to the day phase
      nextPhase =
        currentState.round === 1 && currentState.conversationLog.length === 0
          ? "DayIntroductions" // Special case for very first day after first night
          : "DayDiscussion";
      if (nextPhase === "DayDiscussion") {
        // Shuffle living players for the new day's discussion order
        nextTurnOrder = shuffleArray([...currentState.livingPlayerIds]);
        console.log(
          `Shuffled turn order for Day ${nextRound} Discussion (post-resolve):`,
          nextTurnOrder,
        );
      }
      console.log(
        `Advancing from ResolveNight to ${nextPhase}, Round ${nextRound}`,
      );
      break;
    // REMOVED WerewolfChat case
    case "DayIntroductions": // After introductions, move to discussion
      nextPhase = "DayDiscussion";
      // Shuffle living players for the first discussion round
      nextTurnOrder = shuffleArray([...currentState.livingPlayerIds]);
      console.log(
        `Shuffled turn order for Day ${nextRound} Discussion (post-intro):`,
        nextTurnOrder,
      );
      console.log(
        `Advancing from DayIntroductions to DayDiscussion, Round ${nextRound}`,
      );
      break;
    case "DayDiscussion": // After discussion, move to voting
      nextPhase = "Voting";
      console.log(`Advancing from DayDiscussion to Voting, Round ${nextRound}`);
      break;
    case "Voting": // After voting, move to night, start next round
      nextPhase = "Night";
      nextRound++;
      console.log(
        `Advancing from Voting to Night, starting Round ${nextRound}`,
      );
      break;
    default:
      console.warn(
        `Unexpected current phase: ${currentState.phase}. Staying in current phase.`,
      );
      nextPhase = currentState.phase;
      nextTurnOrderIndex = currentState.turnOrderIndex;
      nextTurnOrder = currentState.turnOrder;
      break;
  }

  // Return a new state object with updated phase and round
  return {
    ...currentState,
    phase: nextPhase,
    round: nextRound,
    turnOrder: nextTurnOrder,
    turnOrderIndex: nextTurnOrderIndex,
    // Clear transient state based on the *previous* phase end
    votes: currentState.phase === "Voting" ? [] : currentState.votes,
    // nightActions are now cleared *after* ResolveNight
    nightActions:
      currentState.phase === "ResolveNight" ? [] : currentState.nightActions,
    // Reset relevant 'last' states *after* ResolveNight completes and we move to Day
    ...(nextPhase === "DayIntroductions" || nextPhase === "DayDiscussion"
      ? {
          lastEliminatedPlayerId:
            currentState.phase === "ResolveNight"
              ? currentState.lastEliminatedPlayerId
              : null, // Preserve elimination from night
          lastWerewolfTargetId: null,
          lastDoctorSaveId: null,
          lastSeerTargetId: null,
        }
      : {
          // Preserve these if we are still in Night/ResolveNight cycle
          lastEliminatedPlayerId: currentState.lastEliminatedPlayerId,
          lastWerewolfTargetId: currentState.lastWerewolfTargetId,
          lastDoctorSaveId: currentState.lastDoctorSaveId,
          lastSeerTargetId: currentState.lastSeerTargetId,
        }),
  };
}

// --- Win Condition Logic ---

/**
 * Checks if the game has reached a win condition for either faction.
 * - Werewolves win if their numbers are >= non-werewolves.
 * - Villagers win if all werewolves are eliminated.
 * If a win condition is met, returns the win condition details.
 *
 * @param state The current state of the game.
 * @returns A WinCondition object if a win condition is met, otherwise null.
 */
export function checkWinCondition(state: GameState): WinCondition | null {
  const livingPlayers = state.livingPlayerIds.map((id) => state.players[id]);
  const livingWerewolves = livingPlayers.filter((p) => p.role === "Werewolf");
  const livingVillagers = livingPlayers.filter((p) => p.role !== "Werewolf"); // Villagers, Seer, Doctor

  if (livingWerewolves.length === 0) {
    // Villagers win
    return {
      outcome: "Villager Win",
      message:
        "All Werewolves have been eliminated! The Villagers are victorious!",
    };
  }
  // Werewolves win (everyone else is a werewolf)
  if (livingVillagers.length === 0) {
    return {
      outcome: "Werewolf Win",
      message:
        "Only Werewolves remain! The Werewolves have taken over the village!",
    };
  }
  // Werewolves win (cannot be outvoted)
  if (livingWerewolves.length >= livingVillagers.length) {
    return {
      outcome: "Werewolf Win",
      message:
        "The Werewolves now equal or outnumber the Villagers! The Werewolves win!",
    };
  }

  // Game continues
  return null;
}

// --- Turn Order Logic ---

/**
 * Calculates the total number of turns expected in the current discussion round.
 *
 * @param currentState The current state of the game.
 * @returns The total number of expected discussion turns for the round.
 */
export function calculateTotalDiscussionTurns(currentState: GameState): number {
  const discussionRoundsPerPlayer =
    currentState.settings.discussionRoundsPerPlayer || 1;
  return currentState.livingPlayerIds.length * discussionRoundsPerPlayer;
}

/**
 * Determines the ID of the next player scheduled to speak based on the current phase and turn index,
 * considering the number of discussion rounds per player.
 *
 * @param currentState The current state of the game.
 * @returns The ID of the next player to speak, or null if the phase doesn't involve speaking turns or if all discussion turns are complete.
 */
export function determineNextSpeaker(currentState: GameState): string | null {
  // Speaking happens during Introduction and Discussion phases using the turnOrder array
  // No single speaker during Night, ResolveNight, WerewolfChat, Voting, or GameOver
  if (!["DayIntroductions", "DayDiscussion"].includes(currentState.phase)) {
    return null;
  }

  const { turnOrder, turnOrderIndex } = currentState;

  // Check if the index is valid within the turn order array
  if (turnOrderIndex >= 0 && turnOrderIndex < turnOrder.length) {
    const nextSpeakerId = turnOrder[turnOrderIndex];
    // Ensure the speaker is actually still alive
    if (currentState.livingPlayerIds.includes(nextSpeakerId)) {
      return nextSpeakerId;
    }
    console.warn(
      `Next speaker in turnOrder (${nextSpeakerId}) is not in livingPlayerIds. Skipping.`,
    );
    // TODO: Ideally, advance index until a living player is found, or handle phase end.
    // For now, returning null indicates an issue or end of available speakers.
    return null;
  }

  // Index is out of bounds (e.g., all players have spoken this round/phase)
  return null;
}
