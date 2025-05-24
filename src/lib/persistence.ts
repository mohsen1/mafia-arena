import fs from 'node:fs/promises';
import path from 'node:path';
import type { SerializableGameState } from './interfaces/persistence.types';

const SAVE_DIR = path.join(process.cwd(), 'game_saves');

const ensureSaveDir = async () => {
    try {
        await fs.mkdir(SAVE_DIR, { recursive: true });
    } catch (error) {
        console.error('Failed to create save directory:', error);
        throw new Error('Failed to initialize persistence layer.');
    }
};

const getFilePath = (gameId: string): string => {
    if (gameId.includes('..') || gameId.includes('/') || gameId.includes('\\')) {
        throw new Error(`Invalid gameId for file path: ${gameId}`);
    }
    return path.join(SAVE_DIR, `${gameId}.json`);
};

/**
 * Loads game state from a JSON file.
 * @param gameId The ID of the game to load.
 * @returns The loaded SerializableGameState or null if not found.
 */
export async function loadGameData(gameId: string): Promise<SerializableGameState | null> {
    await ensureSaveDir();
    const filePath = getFilePath(gameId);
    try {
        const data = await fs.readFile(filePath, 'utf-8');
        const gameState: SerializableGameState = JSON.parse(data);
        return gameState;
    } catch (error: unknown) {
        if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'ENOENT') {
            return null;
        }
        console.error(`Failed to load game data for ${gameId}:`, error);
        throw new Error(`Failed to load game data: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Saves game state to a JSON file.
 * @param gameId The ID of the game to save.
 * @param gameState The game state object to save.
 */
export async function saveGameData(gameId: string, gameState: SerializableGameState): Promise<void> {
    await ensureSaveDir();
    const filePath = getFilePath(gameId);
    try {
        const data = JSON.stringify(gameState, null, 2);
        await fs.writeFile(filePath, data, 'utf-8');
    } catch (error: unknown) {
        console.error(`Failed to save game data for ${gameId}:`, error);
        throw new Error(`Failed to save game data: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Deletes a game save file.
 * @param gameId The ID of the game to delete.
 */
export async function deleteGameData(gameId: string): Promise<void> {
    await ensureSaveDir();
    const filePath = getFilePath(gameId);
    try {
        await fs.unlink(filePath);
    } catch (error: unknown) {
        if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'ENOENT') {
            return;
        }
        console.error(`Failed to delete game data for ${gameId}:`, error);
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to delete game data: ${message}`);
    }
}

/**
 * Lists available game save IDs.
 * @returns An array of game IDs.
 */
export async function listSavedGames(): Promise<string[]> {
    await ensureSaveDir();
    try {
        const files = await fs.readdir(SAVE_DIR);
        return files
            .filter(file => file.endsWith('.json'))
            .map(file => file.replace('.json', ''));
    } catch (error: unknown) {
        console.error('Failed to list saved games:', error);
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to list saved games: ${message}`);
    }
} 