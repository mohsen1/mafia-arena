// tests/phases/InitializationPhase.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InitializationPhase } from '../../src/phases/InitializationPhase';
import { Game } from '../../src/core/Game';
import { DayPhase } from '../../src/phases/DayPhase';
import { Player } from '../../src/core/Player';
import { type PlayerId } from '../../src/interfaces/IPlayer';
// import { type RoleName } from '../../src/interfaces/IRole'; // RoleName no longer needed here
import { MessageVisibility } from '../../src/interfaces/IMessage';

// Mock Game class methods used by InitializationPhase
const mockGame = {
    logMessage: vi.fn(),
    // assignRoles: vi.fn(), // Not called by this phase
    getPlayer: vi.fn(), // Still potentially useful for setting up player data
    getPlayers: vi.fn(), // Added mock for getPlayers
    getAlivePlayers: vi.fn(), // Kept for consistency in setup, though phase uses getPlayers
    notifyRenderers: vi.fn(), // Not called by this phase, but keep mock for completeness?
};

describe('InitializationPhase', () => {
    let initPhase: InitializationPhase;
    let mockPlayers: Player[];

    beforeEach(() => {
        vi.clearAllMocks();
        initPhase = new InitializationPhase();

        // Define mock players
        mockPlayers = [
            { id: 'p1', name: 'Player p1', role: { name: 'Villager' }, agent: {playerId: 'p1'}, isAlive: () => true },
            { id: 'p2', name: 'Player p2', role: { name: 'Mafia' }, agent: {playerId: 'p2'}, isAlive: () => true },
            { id: 'p3', name: 'Player p3', role: { name: 'Doctor' }, agent: {playerId: 'p3'}, isAlive: () => true },
        ] as unknown as Player[];

        // Reset specific mocks
        mockGame.logMessage.mockClear();
        mockGame.getPlayer.mockClear();
        mockGame.getAlivePlayers.mockClear().mockReturnValue(mockPlayers); // Set up alive players

        // Mock getPlayers to return an object with a values() iterator
        const playersMap = new Map(mockPlayers.map(p => [p.id, p]));
        mockGame.getPlayers.mockClear().mockReturnValue({ values: () => playersMap.values() });

        // Mock getPlayer implementation
        mockGame.getPlayer.mockImplementation((id: PlayerId) => {
            return playersMap.get(id);
        });
    });

    it('should have type "Init"', () => { // Corrected type
        expect(initPhase.type).toBe('Init');
    });

    it('should log a "Game is starting..." message', async () => {
        await initPhase.runPhase(mockGame as unknown as Game);
        expect(mockGame.logMessage).toHaveBeenCalledWith(
            null,
            "Game is starting...",
            MessageVisibility.Public,
            'Init' // Phase type should be included
        );
         // Verify it calls getPlayers to iterate (even if loop body is empty)
        expect(mockGame.getPlayers).toHaveBeenCalledTimes(1);
    });

    // Removed tests for assignRoles, private role logging, and notifyRenderers
    // as they are not performed by this specific phase's runPhase method.

    it('should transition to DayPhase', () => {
        const nextPhase = initPhase.transition(mockGame as unknown as Game);
        expect(nextPhase).toBeInstanceOf(DayPhase);
    });

}); 