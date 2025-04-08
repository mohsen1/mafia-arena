import { formatPersonaFromProfile, getAIGameTitleAndDescription } from '@/lib/ai/openaiService';
import {
    GamePhase,
    GameSettings,
    GameState,
    Player,
    PlayerInitializationData,
    AICharacterProfile
} from '@/lib/types/game';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DEFAULT_GAME_SETTINGS } from '@/lib/config';

// --- Constants ---
const CHARACTER_IMAGES_DIR = path.join(process.cwd(), 'public', 'images', 'characters'); // Define image directory path

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

/**
 * Lists available character image filenames.
 * @returns {string[]} An array of image filenames.
 */
function listCharacterImageFiles(): string[] {
    try {
        const files = fs.readdirSync(CHARACTER_IMAGES_DIR);
        return files.filter(file => /\.(png|jpg|jpeg|webp)$/i.test(file)); // Filter for image files
    } catch (error) {
        console.error("Failed to list character images:", error);
        return []; // Return empty array on error
    }
}

// --- Game Initialization Logic ---

/**
 * Initializes a new game state with AI-generated players and selected images.
 */
export async function initializeNewGame(
    settings: GameSettings,
    gameId: string,
    createdAt: number,
    // Expect player data including optional imageUrl and voiceId
    playerInitData: (PlayerInitializationData & { imageUrl?: string | null, voiceId?: string })[] 
): Promise<GameState> {
    console.log(`Initializing game ${gameId} with ${settings.numPlayers} players.`);
    
    const shuffledInitData = shuffleArray([...playerInitData]);

    const players: Record<string, Player> = {};
    
    // Create players directly, using the provided imageUrl and voiceId
    shuffledInitData.forEach((initData) => {
        const playerId = `player-${crypto.randomUUID()}`;
        const persona = formatPersonaFromProfile(initData.profile);

        players[playerId] = {
            id: playerId,
            name: initData.profile.characterName,
            role: initData.role,
            persona: persona,
            aiModel: initData.aiModel,
            imageUrl: initData.imageUrl ?? undefined,
            voiceId: initData.voiceId,
            status: 'alive',
        };
        console.log(`Created player: ${players[playerId].name} (${playerId}) as ${initData.role} [Model: ${initData.aiModel}, Image: ${initData.imageUrl || 'None'}, Voice: ${initData.voiceId || 'Default'}]`);
    });

    // Ensure livingPlayerIds maintains the shuffled order
    const finalLivingPlayerIds = shuffledInitData.map(initData => {
        // Find the player ID created for this initData entry
        const createdPlayer = Object.values(players).find(p => 
            p.name === initData.profile.characterName && p.role === initData.role
        );
        return createdPlayer?.id;
    }).filter((id): id is string => !!id);
    
    if (finalLivingPlayerIds.length !== shuffledInitData.length) {
        console.warn("Mismatch between initial data and created player IDs during final ordering.");
        // Potentially fallback to Object.keys(players) but that loses intended shuffle order
    }

    // Get AI Title and Description - Use the default model from config
    console.log(`Using model ${DEFAULT_GAME_SETTINGS.aiModel} for game title/description generation.`);
    const playerDetailsForTitle = Object.values(players).map(p => ({ name: p.name, persona: p.persona }));
    // Explicitly define the settings object for the API call
    const titleGenSettings: { model: string; temperature?: number } = {
         model: DEFAULT_GAME_SETTINGS.aiModel,
         // temperature: 0.8 // Optionally set temperature if needed
    };
    const { title, description } = await getAIGameTitleAndDescription(playerDetailsForTitle, titleGenSettings);

    const initialState: GameState = {
        gameId: gameId,
        createdAt: createdAt,
        title: title, 
        description: description, 
        settings: settings,
        players: players,
        livingPlayerIds: finalLivingPlayerIds, 
        phase: 'DayIntroductions',
        round: 1,
        turnOrderIndex: 0,
        conversationLog: [
            {
                messageId: `msg-${crypto.randomUUID()}-start`,
                gameId: gameId,
                speaker: { type: 'moderator' },
                speakerName: "Moderator",
                content: `Welcome to "${title || 'the village'}"! ${settings.numPlayers} players have gathered under a cloud of suspicion. Let the introductions begin...`,
                timestamp: Date.now(),
                round: 1,
                phase: 'DayIntroductions',
                audience: { type: 'all' },
            }
        ],
        nightActions: [],
        votes: [],
        lastEliminatedPlayerId: undefined,
        winner: undefined,
         _internalState: {
             initialProfiles: playerInitData.map(data => ({
                 role: data.role,
                 profile: data.profile,
                 aiModel: data.aiModel
             }))
         }
    };
    
    console.log("Game state initialized.");
    return initialState;
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
    if (currentState.phase === 'GameOver') {
        return currentState; // No changes if game is over
    }

    let nextPhase: GamePhase;
    let nextRound = currentState.round;
    let nextTurnOrderIndex = currentState.turnOrderIndex; // Usually reset at phase change
    // TODO: Add logic for adding moderator messages about phase changes?

    switch (currentState.phase) {
        case 'Night':
            // If it's the end of the very first night (Round 1), go to introductions.
            // Otherwise, go directly to discussion.
            nextPhase = currentState.round === 1 ? 'DayIntroductions' : 'DayDiscussion';
            nextTurnOrderIndex = 0; 
            console.log(`Advancing from Night to ${nextPhase}, Round ${currentState.round}`); // Use current round for logging here
            break;
        case 'DayIntroductions': // After introductions, move to discussion
            nextPhase = 'DayDiscussion'; 
            nextTurnOrderIndex = 0; // Reset for discussion start
            console.log(`Advancing from DayIntroductions to DayDiscussion, Round ${nextRound}`);
            break;
        case 'DayDiscussion': // After discussion, move to voting
            nextPhase = 'Voting';
             // Reset turn order index or handle voting state specifically
            nextTurnOrderIndex = 0; 
            console.log(`Advancing from DayDiscussion to Voting, Round ${nextRound}`);
            break;
        case 'Voting':
            nextPhase = 'Night';
            nextRound++; // Increment round when moving from Voting back to Night
            // Reset turn order index for the start of Night actions
            nextTurnOrderIndex = 0; 
            console.log(`Advancing from Voting to Night, starting Round ${nextRound}`);
            break;
        // Should not happen if called correctly, but good practice:
        default:
             console.warn(`Unexpected current phase: ${currentState.phase}. Staying in current phase.`);
             nextPhase = currentState.phase;
             break;
    }

    // Return a new state object with updated phase and round
    return {
        ...currentState,
        phase: nextPhase,
        round: nextRound,
        turnOrderIndex: nextTurnOrderIndex,
        // Do NOT clear actions/votes here. They should be processed/cleared
        // in the main action handler after the phase completes.
        // nightActions: nextPhase === 'Night' ? currentState.nightActions : [],
        // votes: nextPhase === 'Voting' ? currentState.votes : [], 
    };
}

// --- Win Condition Logic ---

/**
 * Checks if the game has reached a win condition for either faction.
 * - Werewolves win if their numbers are >= non-werewolves.
 * - Villagers win if all werewolves are eliminated.
 * If a win condition is met, updates the game state phase to GameOver and sets the winner.
 *
 * @param currentState The current state of the game.
 * @returns A new GameState object, potentially updated with GameOver status and winner, or the original state if no win condition is met.
 */
export function checkWinCondition(currentState: GameState): GameState {
    // Don't check if already over
    if (currentState.phase === 'GameOver') {
        return currentState;
    }

    const livingPlayers = currentState.livingPlayerIds.map(id => currentState.players[id]);
    const livingWerewolves = livingPlayers.filter(p => p.role === 'Werewolf' && p.status === 'alive').length;
    const livingNonWerewolves = livingPlayers.filter(p => p.role !== 'Werewolf' && p.status === 'alive').length;

    let winner: 'Werewolf' | 'Villager' | undefined = undefined;

    if (livingWerewolves === 0) {
        winner = 'Villager';
        console.log("Win Condition Met: All Werewolves eliminated. Villagers win!");
    } else if (livingWerewolves >= livingNonWerewolves) {
        winner = 'Werewolf';
        console.log("Win Condition Met: Werewolves equal or outnumber Villagers. Werewolves win!");
    }

    // If a winner is determined, update the state
    if (winner) {
        return {
            ...currentState,
            phase: 'GameOver',
            winner: winner,
        };
    }

    // No win condition met, return the state unchanged
    return currentState;
}

// --- Turn Order Logic ---

/**
 * Determines the ID of the next player scheduled to speak during the Day phase.
 * Uses the livingPlayerIds array and the turnOrderIndex from the game state.
 *
 * @param currentState The current state of the game.
 * @returns The ID of the next player to speak, or null if it's not the Day phase or if the index is out of bounds.
 */
export function determineNextSpeaker(currentState: GameState): string | null {
    // Speaking happens during Introduction and Discussion phases
    if (currentState.phase !== 'DayIntroductions' && currentState.phase !== 'DayDiscussion') {
        return null;
    }

    const { livingPlayerIds, turnOrderIndex } = currentState;

    // Check if the index is valid for the living players array
    if (turnOrderIndex >= 0 && turnOrderIndex < livingPlayerIds.length) {
        return livingPlayerIds[turnOrderIndex];
    }

    // Index is out of bounds (e.g., all players have spoken this round/phase)
    return null;
}