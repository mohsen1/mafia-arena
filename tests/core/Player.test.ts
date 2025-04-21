import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Player } from '../../src/core/Player';
import { PlayerStatus } from '../../src/interfaces/IPlayer';
import { RoleName } from '../../src/interfaces/IRole';
import type { IAgent, PlayerAction } from '../../src/interfaces/IAgent';
import type { IRole } from '../../src/interfaces/IRole';
import type { PlayerId } from '../../src/interfaces/IPlayer';
import type { VisibleGameState } from '../../src/interfaces/GameState';

// Mock Role implementation
const mockVillagerRole: IRole = {
    name: RoleName.Villager,
    allegiance: 'Town',
    canPerformNightAction: false,
    description: 'Mock Villager',
};

const mockMafiaRole: IRole = {
    name: RoleName.Mafia,
    allegiance: 'Mafia',
    canPerformNightAction: true,
    description: 'Mock Mafia',
};

// Mock Agent implementation using Vitest functions
const createMockAgent = (playerId: PlayerId): IAgent & { getAction: ReturnType<typeof vi.fn> } => {
    // Cast vi.fn() to the expected function signature
    const mockGetAction = vi.fn() as unknown as IAgent['getAction'] & ReturnType<typeof vi.fn>;
    return {
        playerId,
        getAction: mockGetAction,
    };
};

describe('Player', () => {
    let playerId: PlayerId;
    let playerName: string;
    let mockAgent: ReturnType<typeof createMockAgent>;
    let player: Player;

    beforeEach(() => {
        playerId = 'player-123';
        playerName = 'Test Player';
        mockAgent = createMockAgent(playerId); // Agent ID matches player ID
        player = new Player(playerId, playerName, mockVillagerRole, mockAgent);
    });

    it('should initialize with correct properties and Alive status', () => {
        expect(player.id).toBe(playerId);
        expect(player.name).toBe(playerName);
        expect(player.status).toBe(PlayerStatus.Alive);
        expect(player.isAlive()).toBe(true);
        expect(player.role).toBe(mockVillagerRole); // Check internal role reference
        expect(player.agent).toBe(mockAgent); // Check internal agent reference
    });

    it('should throw error if agent playerId does not match player id', () => {
        const wrongAgent = createMockAgent('wrong-id');
        expect(() => new Player(playerId, playerName, mockVillagerRole, wrongAgent))
            .toThrow(/does not match Player id/);
    });

    it('should change status to Dead when kill() is called', () => {
        player.kill();
        expect(player.status).toBe(PlayerStatus.Dead);
        expect(player.isAlive()).toBe(false);
    });

    it('should return only public information via getPublicRepresentation', () => {
        const publicInfo = player.getPublicRepresentation();
        expect(publicInfo).toEqual({
            id: playerId,
            name: playerName,
            status: PlayerStatus.Alive,
            // IMPORTANT: Role should NOT be here
        });
        expect(publicInfo).not.toHaveProperty('role');
        expect(publicInfo).not.toHaveProperty('agent');

        player.kill();
        const deadPublicInfo = player.getPublicRepresentation();
        expect(deadPublicInfo.status).toBe(PlayerStatus.Dead);
    });

    describe('decideAction', () => {
        const mockGameState: VisibleGameState = {
            gameId: 'game-abc',
            round: 1,
            phase: 'Day',
            language: 'en',
            self: {
                id: playerId,
                name: playerName,
                status: PlayerStatus.Alive,
                role: RoleName.Villager,
                isMafia: false,
            },
            players: [{ id: playerId, name: playerName, status: PlayerStatus.Alive }],
            alivePlayerIds: new Set([playerId]),
        };

        it('should call agent.getAction with the provided game state when alive', async () => {
            const expectedAction: PlayerAction = { type: 'message', content: 'Agent action' };
            mockAgent.getAction.mockResolvedValue(expectedAction); // Setup mock return

            await player.decideAction(mockGameState);

            expect(mockAgent.getAction).toHaveBeenCalledTimes(1);
            expect(mockAgent.getAction).toHaveBeenCalledWith(mockGameState);
        });

         it('should return the action decided by the agent when alive', async () => {
            const expectedAction: PlayerAction = { type: 'vote', targetPlayerId: 'p2' };
            mockAgent.getAction.mockResolvedValue(expectedAction);

            const action = await player.decideAction(mockGameState);

            expect(action).toBe(expectedAction);
        });

        it('should return "noAction" and not call agent.getAction if the player is dead', async () => {
            player.kill();
            const expectedAction: PlayerAction = { type: 'noAction' };

            const action = await player.decideAction(mockGameState);

            expect(action).toEqual(expectedAction);
            expect(mockAgent.getAction).not.toHaveBeenCalled();
        });

        it('should return "noAction" if agent.getAction throws an error', async () => {
            const error = new Error('Agent failed!');
            mockAgent.getAction.mockRejectedValue(error); // Simulate agent error
            const expectedAction: PlayerAction = { type: 'noAction' };

            // Suppress console.error for this test
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            const action = await player.decideAction(mockGameState);

            expect(action).toEqual(expectedAction);
            expect(mockAgent.getAction).toHaveBeenCalledTimes(1); // Agent was still called
            expect(consoleErrorSpy).toHaveBeenCalledWith(`Error getting action from agent ${playerId}:`, error);

            consoleErrorSpy.mockRestore(); // Clean up spy
        });
    });
});
