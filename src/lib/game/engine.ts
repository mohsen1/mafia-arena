import {
    GameState, 
    GameSettings, 
    Player, 
    Role, 
    PlayerStatus, 
    GamePhase, 
    CharacterPreset,
    ChatMessage,
    PlayerInitializationData
} from '@/lib/types/game';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getAIGameTitleAndDescription, formatPersonaFromProfile } from '@/lib/ai/openaiService';

// --- Load Character Presets from JSON ---

const CHARACTER_DATA_PATH = path.join(process.cwd(), 'data.json');
const CHARACTER_IMAGES_DIR = path.join(process.cwd(), 'public/images/characters');

/**
 * Loads character presets from the JSON data file.
 * @returns {ReadonlyArray<CharacterPreset>} An array of character presets.
 * @throws If the data file cannot be read or parsed.
 */
function loadCharacterPresets(): ReadonlyArray<CharacterPreset> {
    try {
        const jsonData = fs.readFileSync(CHARACTER_DATA_PATH, 'utf-8');
        const charactersData: any[] = JSON.parse(jsonData);

        const presets = charactersData.map(char => {
            // Validate essential fields exist
            if (!char.characterName || 
                !char.appearanceFlavorText || 
                !char.corePersonalityArchetype || 
                !char.keyPersonalityTraits ||
                !char.motivationsGoals ||
                !char.backgroundBackstory?.professionRoleInCommunity
            ) {
                console.warn('Character data missing required fields for persona construction:', char.characterName || '(Unknown Name)');
                return null; // Skip invalid entries
            }

            // Construct a richer persona string
            const personaParts = [
                `Name: ${char.characterName}`,
                `Role in Community: ${char.backgroundBackstory.professionRoleInCommunity}`,
                `Appearance: ${char.appearanceFlavorText}`,
                `Personality Archetype: ${char.corePersonalityArchetype}`,
                `Key Traits: ${char.keyPersonalityTraits.communicationStyle}, Confidence ${char.keyPersonalityTraits.confidence}/10, Suspicion ${char.keyPersonalityTraits.suspicion}/10, Honesty ${char.keyPersonalityTraits.honestyDeceptiveness}/10.`,
                `Motivations: ${char.motivationsGoals.slice(0, 2).join(', ')}.` // Take first two motivations
            ];
            const persona = personaParts.join(' \n'); // Join parts into a single string with newlines

            return {
                name: char.characterName as string,
                persona: persona, 
            };
        }).filter((preset): preset is CharacterPreset => preset !== null);
        
        if (presets.length !== charactersData.length) {
            console.warn(`Loaded ${presets.length} presets, but found ${charactersData.length} entries in data.json. Some entries might be invalid.`);
        }
        console.log(`Loaded ${presets.length} character presets.`);
        return presets;
    } catch (error) {
        console.error("Failed to load character presets from data.json:", error);
        // Fallback to an empty array or throw an error, depending on desired behavior
        // Throwing error to make the issue explicit during startup
        throw new Error("Could not load character presets.");
    }
}

export const characterPresets: ReadonlyArray<CharacterPreset> = loadCharacterPresets();

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
 * Initializes a new game state with AI-generated players.
 */
export async function initializeNewGame(
    settings: GameSettings,
    gameId: string,
    createdAt: number,
    playerInitData: PlayerInitializationData[] // Accept generated data
): Promise<GameState> {
    console.log(`Initializing game ${gameId} with ${settings.numPlayers} AI-generated players.`);
    
    // Shuffle the init data to randomize turn order
    const shuffledInitData = shuffleArray([...playerInitData]);

    const players: Record<string, Player> = {};
    const livingPlayerIds: string[] = [];

    shuffledInitData.forEach((initData, index) => {
        const playerId = `player-${crypto.randomUUID()}`;
        livingPlayerIds.push(playerId);
        
        // Format persona string from the profile
        const persona = formatPersonaFromProfile(initData.profile);

        players[playerId] = {
            id: playerId,
            name: initData.profile.characterName, // Access name from profile
            role: initData.role,
            persona: persona, // Use formatted persona
            imageUrl: undefined, // Access imageUrl from profile if it exists: initData.profile.imageUrl
            status: 'alive',
        };
        console.log(`Created player: ${players[playerId].name} (${playerId}) as ${initData.role}`);
    });

    // Check if players object is empty (shouldn't happen with validation upstream)

    const initialState: GameState = {
        gameId: gameId,
        createdAt: createdAt,
        settings: settings,
        players: players,
        livingPlayerIds: livingPlayerIds,
        phase: 'DayIntroductions' as GamePhase, // Start with introductions
        round: 1,
        turnOrderIndex: 0,
        conversationLog: [
             {
                messageId: `msg-${crypto.randomUUID()}-start`,
                gameId: gameId,
                speaker: { type: 'moderator' },
                speakerName: "Moderator",
                 // TODO: Add game title/description from settings if available later
                content: `Welcome! ${settings.numPlayers} players have gathered under a cloud of suspicion. Let the introductions begin...`,
                timestamp: Date.now(),
                round: 1,
                phase: 'DayIntroductions' as GamePhase,
                audience: { type: 'all' },
            }
        ],
        nightActions: [],
        votes: [],
        lastEliminatedPlayerId: undefined,
        winner: undefined,
         _internalState: {
             initialProfiles: playerInitData // Ensure this matches the type definition
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