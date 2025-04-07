import { GameState, FilteredGameState, Player, ChatMessage, Role } from '@/lib/types/game';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { initializeNewGame } from '@/lib/game/engine'; // Import engine function

const GAMES_DIR = path.join(process.cwd(), 'data', 'games');

/**
 * Manages the state of multiple Werewolf games, handling both in-memory caching
 * and persistence to the filesystem as JSON files.
 */
export class GameStateManager {
    /** In-memory cache for active game states. */
    #gameStates: Map<string, GameState> = new Map();
    /** Tracks ongoing file write operations to prevent race conditions. */
    #writeLocks: Map<string, Promise<void>> = new Map();

    /**
     * Ensures the directory for storing game files exists.
     * @private
     */
    async #ensureGamesDirExists(): Promise<void> {
        try {
            await fs.mkdir(GAMES_DIR, { recursive: true });
        } catch (error) {
            console.error('Failed to create games directory:', GAMES_DIR, error);
            throw new Error('Could not ensure games directory exists.');
        }
    }

    /**
     * Loads a game state from its JSON file.
     * @param gameId The ID of the game to load.
     * @returns The loaded game state, or null if the file doesn't exist.
     * @private
     */
    async #loadGameStateFromFile(gameId: string): Promise<GameState | null> {
        await this.#ensureGamesDirExists();
        const filePath = path.join(GAMES_DIR, `${gameId}.json`);
        try {
            // Wait for any ongoing write to this file to complete before reading
            const writeLock = this.#writeLocks.get(gameId);
            if (writeLock) {
                await writeLock;
            }
            const data = await fs.readFile(filePath, 'utf-8');
            // TODO: Add validation here (e.g., using Zod) to ensure data matches GameState
            return JSON.parse(data) as GameState;
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                return null; // File not found
            }
            console.error(`Failed to load game state ${gameId} from file:`, error);
            throw new Error(`Failed to load game state ${gameId}.`);
        }
    }

    /**
     * Saves a game state to its JSON file.
     * Handles locking to prevent concurrent writes to the same file.
     * @param gameState The game state to save.
     * @private
     */
    async #saveGameStateToFile(gameState: GameState): Promise<void> {
        await this.#ensureGamesDirExists();
        const gameId = gameState.gameId;
        const filePath = path.join(GAMES_DIR, `${gameId}.json`);

        const saveOperation = async () => {
            try {
                const data = JSON.stringify(gameState, null, 2); // Pretty print JSON
                await fs.writeFile(filePath, data, 'utf-8');
                // console.log(`Game state ${gameId} saved successfully.`);
            } catch (error) {
                console.error(`Failed to save game state ${gameId} to file:`, error);
                // Decide how to handle failed saves - retry? Log? Throw?
                // For now, just log the error.
            } finally {
                // Release the lock once the write attempt (success or fail) is done
                this.#writeLocks.delete(gameId);
            }
        };

        // Create a promise representing the save operation
        const currentWriteLock = saveOperation();
        // Store the lock promise
        this.#writeLocks.set(gameId, currentWriteLock);

        // Wait for the save operation to complete before returning
        // This ensures the function doesn't resolve until the file is written (or fails)
        await currentWriteLock;
    }

    /**
     * Creates a new game, initializes its state using the engine (which now includes AI title generation),
     * caches it, and persists it to a file.
     *
     * @param partialState Requires at least `settings` to initialize the game.
     * @returns The fully initialized game state, including AI-generated title/desc.
     * @throws If initialization or saving fails.
     */
    async createGame(partialState: Pick<GameState, 'settings'>): Promise<GameState> { // Now expects only settings
        const gameId = `game-${crypto.randomUUID()}`;
        const createdAt = Date.now();

        // Call the async engine function to initialize the game state, including AI generation
        const newGameState = await initializeNewGame(
            partialState.settings,
            gameId,
            createdAt
        );

        // Add to cache
        this.#gameStates.set(gameId, newGameState);

        // Save to file asynchronously 
        await this.#saveGameStateToFile(newGameState); 

        console.log(`Game created with ID: ${gameId} and Title: "${newGameState.title}"`);
        return newGameState;
    }

    /**
     * Retrieves the state of a specific game.
     * Loads from file if not found in the in-memory cache.
     *
     * @param gameId The ID of the game to retrieve.
     * @returns The game state, or null if the game doesn't exist.
     */
    async getGameState(gameId: string): Promise<GameState | null> {
        // Check cache first
        if (this.#gameStates.has(gameId)) {
            return this.#gameStates.get(gameId)!;
        }

        // If not in cache, try loading from file
        const gameStateFromFile = await this.#loadGameStateFromFile(gameId);

        if (gameStateFromFile) {
            // Add to cache if loaded successfully
            this.#gameStates.set(gameId, gameStateFromFile);
            return gameStateFromFile;
        }

        // Game not found in cache or file
        return null;
    }

    /**
     * Updates the state of an existing game in the cache and persists the changes.
     *
     * @param gameId The ID of the game to update.
     * @param newState The new state to set for the game.
     * @returns The updated game state.
     * @throws If the game doesn't exist or saving fails.
     */
    async updateGameState(gameId: string, newState: GameState): Promise<GameState> {
        if (!this.#gameStates.has(gameId) && !(await this.#loadGameStateFromFile(gameId))) {
            throw new Error(`Game with ID ${gameId} not found and cannot be updated.`);
        }

        // Ensure the input state has the correct gameId
        if (newState.gameId !== gameId) {
            console.warn(`Updating game ${gameId} with state object that has mismatched gameId ${newState.gameId}. Overwriting.`);
            newState = { ...newState, gameId: gameId };
        }

        // Update cache
        this.#gameStates.set(gameId, newState);

        // Save changes to file asynchronously
        await this.#saveGameStateToFile(newState);

        return newState;
    }

    /**
     * Retrieves a list of available game IDs by scanning the games directory.
     *
     * @returns An array of game IDs.
     */
    async listGameIds(): Promise<string[]> {
        await this.#ensureGamesDirExists();
        try {
            const files = await fs.readdir(GAMES_DIR);
            // Filter for .json files and remove the extension
            const gameIds = files
                .filter(file => file.endsWith('.json'))
                .map(file => file.replace('.json', ''));
            return gameIds;
        } catch (error) {
            console.error('Failed to list game IDs:', error);
            return []; // Return empty list on error
        }
    }

    /**
     * Retrieves the filtered game state safe for client-side display.
     *
     * @param gameId The ID of the game.
     * @returns Filtered game state or null if game not found.
     */
    async getFilteredGameState(gameId: string): Promise<FilteredGameState | null> {
        const gameState = await this.getGameState(gameId);
        if (!gameState) {
            return null;
        }

        // Destructure to separate fields easily
        const { _internalState, players, conversationLog, ...restOfState } = gameState;

        // Filter players: Omit persona. Conditionally include role if game is over.
        const filteredPlayers: FilteredGameState['players'] = 
            Object.fromEntries(
                Object.entries(players).map(([id, player]) => {
                    // Destructure persona and role to exclude them initially
                    const { persona, role, ...restPlayer } = player; 
                    
                    // Start with the base player object without persona or the original required role
                    const playerForClient: FilteredGameState['players'][string] = { ...restPlayer };

                    // If game is over, add the optional role property back
                    if (gameState.phase === 'GameOver') {
                        playerForClient.role = role;
                    }
                    // If game is not over, playerForClient remains without the role property, satisfying the optional type

                    return [id, playerForClient];
                })
            );

        // Filter conversation log: Omit audience and ensure speakerName
        const filteredLog: ReadonlyArray<Omit<ChatMessage, 'audience'> & { speakerName: string }> = 
            conversationLog.map(msg => {
                const { audience, ...restMsg } = msg;
                const speakerName = msg.speakerName || (msg.speaker.type === 'moderator' ? 'Moderator' : 'Unknown');
                // Explicitly return the object matching the mapped type structure
                return { ...restMsg, speakerName };
            }) as ReadonlyArray<Omit<ChatMessage, 'audience'> & { speakerName: string }>; // Explicit cast here

        // Construct the final filtered state
        const result: FilteredGameState = {
            ...restOfState,
            players: filteredPlayers,
            conversationLog: filteredLog,
        };

        return result;
    }

    // Optional: Method to clear cache for a specific game or all games
    clearCache(gameId?: string): void {
        if (gameId) {
            this.#gameStates.delete(gameId);
            console.log(`Cache cleared for game ${gameId}`);
        } else {
            this.#gameStates.clear();
            console.log('Entire game state cache cleared.');
        }
    }

    /**
     * Deletes a game's state file and removes it from the cache.
     * 
     * @param gameId The ID of the game to delete.
     * @returns Promise<boolean> - True if deletion was successful or file didn't exist, false on error.
     */
    async deleteGame(gameId: string): Promise<boolean> {
        const filePath = path.join(GAMES_DIR, `${gameId}.json`);
        console.log(`Attempting to delete game: ${gameId} at ${filePath}`);

        // Clear from cache regardless of file deletion result
        this.clearCache(gameId);

        try {
             // Check if file exists before attempting delete to avoid unnecessary errors
             await fs.access(filePath); // Throws if file doesn't exist
             await fs.unlink(filePath); // Delete the file
             console.log(`Game file deleted successfully: ${gameId}`);
             return true;
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                console.log(`Game file not found, considered deleted: ${gameId}`);
                return true; // If file doesn't exist, it's effectively deleted
            }
            console.error(`Failed to delete game file ${gameId}:`, error);
            return false; // Deletion failed
        }
    }
}

// Export a singleton instance
export const gameStateManager = new GameStateManager(); 