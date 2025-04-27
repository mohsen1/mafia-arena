import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { Player } from '@/lib/engine/core/Player';
import { PlayerStatus, type PlayerId } from '@/lib/engine/interfaces/IPlayer';
import { RoleName } from '@/lib/engine/interfaces/IRole';
import type { IAgent, PlayerAction } from '@/lib/engine/interfaces/IAgent';
import type { IRole } from '@/lib/engine/interfaces/IRole';
import type { VisibleGameState } from '@/lib/engine/interfaces/GameState';
import { createInitialMemory } from '@/lib/engine/interfaces/AgentMemory';
import { DEFAULT_PERSONA } from '@/lib/engine/interfaces/Persona';

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

// Mock agent factory - Updated to match IAgent
const createMockAgent = (id: PlayerId = 'mock-agent-id'): IAgent & { getAction: Mock } => ({
    id,
    agentName: `MockAgent-${id}`,
    persona: undefined,
    getAction: vi.fn().mockResolvedValue({ type: 'noAction' }), // Default mock implementation
    generatePersona: vi.fn().mockResolvedValue(undefined),
});

describe('Player', () => {
    const playerId: PlayerId = 'player-123'; // Ensure type safety
    let playerName: string;
    let mockAgent: ReturnType<typeof createMockAgent>;
    let player: Player;

    beforeEach(() => {
        playerName = 'Test Player';
        mockAgent = createMockAgent(); // Agent ID matches player ID
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
        let mockGameState: VisibleGameState;

        beforeEach(() => {
            mockGameState = {
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
                    allegiance: 'Town'
                },
                players: [{ id: playerId, name: playerName, status: PlayerStatus.Alive }],
                alivePlayerIds: new Set([playerId]),
                memory: createInitialMemory(),
                themeName: 'Default'
            };
        });

        it('should call agent.getAction with the provided game state when alive', async () => {
            const expectedAction: PlayerAction = { type: 'message', content: 'Agent action' };
            mockAgent.getAction.mockResolvedValue(expectedAction); // Setup mock return

            await player.decideAction(mockGameState);

            expect(mockAgent.getAction).toHaveBeenCalledTimes(1);
            expect(mockAgent.getAction).toHaveBeenCalledWith(mockGameState, undefined);
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

            // Suppress console.warn for this specific log message
            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            const action = await player.decideAction(mockGameState);

            consoleWarnSpy.mockRestore(); // Restore console.warn

            expect(action).toEqual(expectedAction);
            expect(mockAgent.getAction).not.toHaveBeenCalled();
        });

        it('should return "noAction" if agent.getAction throws an error', async () => {
            const error = new Error('Agent failed!');
            mockAgent.getAction.mockRejectedValueOnce(error);
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); // Spy on console.error

            const expectedAction: PlayerAction = { type: 'noAction' };
            const action = await player.decideAction({} as VisibleGameState); // Empty state for this test

            expect(action).toEqual(expectedAction);
            expect(mockAgent.getAction).toHaveBeenCalledTimes(1); // Agent was still called
            // Update assertion to match the new error log format including the player name
            expect(consoleErrorSpy).toHaveBeenCalledWith(`Error getting action from agent ${playerId} (${playerName}):`, error);

            consoleErrorSpy.mockRestore(); // Clean up spy
        });
    });
});
