// src/lib/tests/persistence.test.ts
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { loadGameData, saveGameData, deleteGameData, listSavedGames } from '@/lib/persistence';
import type { SerializableGameState } from '@/lib/interfaces/persistence.types';
import fs from 'node:fs/promises';
import path from 'node:path';

// Mock the fs/promises module correctly
vi.mock('node:fs/promises', async (importOriginal) => {
    const actual = await importOriginal() as typeof fs; // Get actual module
    return {
        ...actual, // Spread actual exports
        default: { // Ensure default export is preserved/mocked
             ...actual, // Spread actual exports onto default as well
             mkdir: vi.fn().mockResolvedValue(undefined),
             readFile: vi.fn(),
             writeFile: vi.fn().mockResolvedValue(undefined),
             unlink: vi.fn().mockResolvedValue(undefined),
             readdir: vi.fn(),
             access: vi.fn().mockResolvedValue(undefined), // Mock access if needed
        },
        // Also mock named exports if they are used directly
        mkdir: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn(),
        writeFile: vi.fn().mockResolvedValue(undefined),
        unlink: vi.fn().mockResolvedValue(undefined),
        readdir: vi.fn(),
        access: vi.fn().mockResolvedValue(undefined), // Mock access if needed
    };
});

// Helper to get typed mock functions (now referencing the default export)
const mockedMkdir = fs.mkdir as Mock;
const mockedReadFile = fs.readFile as Mock;
const mockedWriteFile = fs.writeFile as Mock;
const mockedUnlink = fs.unlink as Mock;
const mockedReaddir = fs.readdir as Mock;

const SAVE_DIR = path.join(process.cwd(), 'game_saves');

describe('Persistence Functions', () => {
    const gameId = 'test-game-persist';
    const filePath = path.join(SAVE_DIR, `${gameId}.json`);
    const mockGameState: Partial<SerializableGameState> = { gameId: gameId, round: 1, phase: 'Day' };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('loadGameData', () => {
        it('should load and parse game data successfully', async () => {
            const fileContent = JSON.stringify(mockGameState);
            mockedReadFile.mockResolvedValue(fileContent);

            const result = await loadGameData(gameId);

            expect(mockedMkdir).toHaveBeenCalledWith(SAVE_DIR, { recursive: true });
            expect(mockedReadFile).toHaveBeenCalledWith(filePath, 'utf-8');
            expect(result).toEqual(mockGameState);
        });

        it('should return null if the file does not exist (ENOENT)', async () => {
            const error = new Error('File not found');
            (error as NodeJS.ErrnoException).code = 'ENOENT';
            mockedReadFile.mockRejectedValue(error);

            const result = await loadGameData(gameId);

            expect(mockedMkdir).toHaveBeenCalled();
            expect(mockedReadFile).toHaveBeenCalledWith(filePath, 'utf-8');
            expect(result).toBeNull();
        });

        it('should throw an error if reading file fails for other reasons', async () => {
            const error = new Error('Read permission denied');
            mockedReadFile.mockRejectedValue(error);

            await expect(loadGameData(gameId)).rejects.toThrow('Failed to load game data: Read permission denied');
            expect(mockedMkdir).toHaveBeenCalled();
            expect(mockedReadFile).toHaveBeenCalledWith(filePath, 'utf-8');
        });

        it('should throw an error for invalid gameId', async () => {
             await expect(loadGameData('../invalid-id')).rejects.toThrow('Invalid gameId');
         });
    });

    describe('saveGameData', () => {
        it('should stringify and save game data successfully', async () => {
            const stateToSave = { ...mockGameState, phase: 'Night' } as SerializableGameState;
            const expectedJson = JSON.stringify(stateToSave, null, 2);

            await saveGameData(gameId, stateToSave);

            expect(mockedMkdir).toHaveBeenCalledWith(SAVE_DIR, { recursive: true });
            expect(mockedWriteFile).toHaveBeenCalledWith(filePath, expectedJson, 'utf-8');
        });

        it('should throw an error if writing file fails', async () => {
            const error = new Error('Disk full');
            mockedWriteFile.mockRejectedValue(error);
            const stateToSave = mockGameState as SerializableGameState;

            await expect(saveGameData(gameId, stateToSave)).rejects.toThrow('Failed to save game data: Disk full');
            expect(mockedMkdir).toHaveBeenCalled();
            expect(mockedWriteFile).toHaveBeenCalled(); // Ensure it was attempted
        });

         it('should throw an error for invalid gameId', async () => {
             const stateToSave = mockGameState as SerializableGameState;
             await expect(saveGameData('/invalid-id', stateToSave)).rejects.toThrow('Invalid gameId');
         });
    });

    describe('deleteGameData', () => {
        it('should delete the game file successfully', async () => {
            await deleteGameData(gameId);

            expect(mockedMkdir).toHaveBeenCalledWith(SAVE_DIR, { recursive: true });
            expect(mockedUnlink).toHaveBeenCalledWith(filePath);
        });

        it('should not throw an error if the file does not exist (ENOENT)', async () => {
            const error = new Error('File not found');
            (error as NodeJS.ErrnoException).code = 'ENOENT';
            mockedUnlink.mockRejectedValue(error);

            await expect(deleteGameData(gameId)).resolves.toBeUndefined();
            expect(mockedMkdir).toHaveBeenCalled();
            expect(mockedUnlink).toHaveBeenCalledWith(filePath);
        });

        it('should throw an error if deleting file fails for other reasons', async () => {
            const error = new Error('Permission denied');
            mockedUnlink.mockRejectedValue(error);

            await expect(deleteGameData(gameId)).rejects.toThrow('Failed to delete game data: Permission denied');
            expect(mockedMkdir).toHaveBeenCalled();
            expect(mockedUnlink).toHaveBeenCalledWith(filePath);
        });

         it('should throw an error for invalid gameId', async () => {
             await expect(deleteGameData('invalid/../../id')).rejects.toThrow('Invalid gameId');
         });
    });

    describe('listSavedGames', () => {
        it('should list valid game IDs from the directory', async () => {
            const files = ['game1.json', 'game2.json', 'config.txt', 'game3.json.bak', 'game-4_valid.json'];
            mockedReaddir.mockResolvedValue(files);

            const result = await listSavedGames();

            expect(mockedMkdir).toHaveBeenCalledWith(SAVE_DIR, { recursive: true });
            expect(mockedReaddir).toHaveBeenCalledWith(SAVE_DIR);
            expect(result).toEqual(['game1', 'game2', 'game-4_valid']); // Only .json files, names extracted
        });

        it('should return an empty array if the directory is empty', async () => {
            mockedReaddir.mockResolvedValue([]);
            const result = await listSavedGames();
            expect(result).toEqual([]);
        });

        it('should return an empty array if no JSON files are found', async () => {
            mockedReaddir.mockResolvedValue(['readme.txt', 'backup.zip']);
            const result = await listSavedGames();
            expect(result).toEqual([]);
        });

        it('should throw an error if reading directory fails', async () => {
            const error = new Error('Directory access denied');
            mockedReaddir.mockRejectedValue(error);

            await expect(listSavedGames()).rejects.toThrow('Failed to list saved games: Directory access denied');
            expect(mockedMkdir).toHaveBeenCalled();
            expect(mockedReaddir).toHaveBeenCalledWith(SAVE_DIR);
        });
    });
});