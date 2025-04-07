import {
    GameState, 
    GameSettings, 
    Player, 
    Role, 
    PlayerStatus, 
    GamePhase, 
    CharacterPreset,
    ChatMessage
} from '@/lib/types/game';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

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
 * Initializes a new game state based on the provided settings.
 *
 * @param settings The game settings defining player count, roles, etc.
 * @param gameId The unique ID for this game.
 * @param createdAt The timestamp when the game was created.
 * @returns The initial GameState object.
 * @throws If the number of presets is less than the number of players.
 * @throws If the role distribution doesn't match the number of players.
 */
export function initializeNewGame(
    settings: GameSettings,
    gameId: string,
    createdAt: number
): GameState {
    const { numPlayers, roleDistribution, aiModel } = settings;

    // Validate character presets
    if (characterPresets.length < numPlayers) {
        throw new Error(`Not enough character presets (${characterPresets.length}) for the number of players (${numPlayers}).`);
    }

    // Get and validate character images
    const imageFiles = listCharacterImageFiles();
    if (imageFiles.length < numPlayers) {
        console.warn(`Warning: Not enough unique character images (${imageFiles.length}) for the number of players (${numPlayers}). Images may be reused or missing.`);
        // Pad with empty strings if not enough images
        while (imageFiles.length < numPlayers) {
            imageFiles.push(''); // Or handle differently, e.g., assign a default image URL
        }
    }
    const shuffledImageFiles = shuffleArray(imageFiles);

    // Validate role distribution
    const totalRoles = Object.values(roleDistribution).reduce((sum, count) => sum + count, 0);
    if (totalRoles !== numPlayers) {
        throw new Error(`Role distribution count (${totalRoles}) does not match the number of players (${numPlayers}).`);
    }

    // Prepare roles based on distribution
    const rolesToAssign: Role[] = [];
    for (const [role, count] of Object.entries(roleDistribution)) {
        for (let i = 0; i < count; i++) {
            rolesToAssign.push(role as Role);
        }
    }
    shuffleArray(rolesToAssign);

    // Shuffle presets and take the required number
    const shuffledPresets = shuffleArray([...characterPresets]);
    const selectedPresets = shuffledPresets.slice(0, numPlayers);

    // Create players
    const players: Record<string, Player> = {};
    const livingPlayerIds: string[] = [];

    for (let i = 0; i < numPlayers; i++) {
        const playerId = `player-${crypto.randomUUID()}`;
        const preset = selectedPresets[i];
        const role = rolesToAssign[i];
        const imageUrl = shuffledImageFiles[i] ? `/images/characters/${shuffledImageFiles[i]}` : undefined; // Construct URL
        
        const player: Player = {
            id: playerId,
            name: preset.name,
            persona: preset.persona,
            role: role,
            imageUrl: imageUrl, // Assign the image URL
            status: 'alive' as PlayerStatus,
        };
        players[playerId] = player;
        livingPlayerIds.push(playerId);
    }

    // Initial moderator message (optional)
    const initialMessage: ChatMessage = {
        messageId: `msg-${crypto.randomUUID()}`,
        gameId: gameId,
        speaker: { type: 'moderator' },
        speakerName: "Moderator",
        content: `Welcome to Werewolf! ${numPlayers} players have gathered. The roles have been assigned. Night falls...`,
        timestamp: Date.now(),
        round: 1,
        phase: 'Night',
        audience: { type: 'all' },
    };

    // Create initial game state
    const initialState: GameState = {
        gameId: gameId,
        createdAt: createdAt,
        settings: settings,
        players: players, // Player map
        livingPlayerIds: livingPlayerIds, // Initial turn order
        phase: 'Night',
        round: 1,
        turnOrderIndex: 0, // Start with the first player in the shuffled list for day phase
        conversationLog: [initialMessage],
        nightActions: [],
        votes: [],
        // lastEliminatedPlayerId: undefined,
        // winner: undefined,
        _internalState: { // Initialize internal state
            werewolfChatLog: [],
            seerResults: {}
        }
    };

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
            nextPhase = 'DayIntroductions'; // Start with introductions
            // Reset turn order index for the start of Day discussion
            nextTurnOrderIndex = 0; 
            console.log(`Advancing from Night to DayIntroductions, Round ${nextRound}`);
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
        // Clear actions/votes from the previous phase?
        nightActions: nextPhase === 'Night' ? currentState.nightActions : [], // Keep night actions if moving TO night? Or clear here? TBD - Let's clear for now
        votes: nextPhase === 'Voting' ? currentState.votes : [], // Keep votes if moving TO voting? Clear here.
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