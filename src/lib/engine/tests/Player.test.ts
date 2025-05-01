import { Player } from '../core/Player';
import type { IRole } from '../interfaces/IRole';
import type { IAgent, PlayerAction } from '../interfaces/IAgent';
import { PlayerStatus } from '../interfaces/IPlayer';
import type { VisibleGameState } from '../interfaces/GameState';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { AgentConfig } from '../../interfaces/persistence.types';

// Mock console.error to suppress expected error logs during tests
vi.spyOn(console, 'error').mockImplementation(() => {});

describe('Player', () => {
    let player: Player;
    const mockRole = { name: 'Villager' } as IRole;
    const mockAgent = { getAction: vi.fn(), agentName: 'MockAgent' } as unknown as IAgent;
    const mockAgentConfig: AgentConfig = { agentType: 'Test' };

    beforeEach(() => {
        mockAgent.getAction = vi.fn();
        player = new Player('p1', 'Alice', mockRole, mockAgent, mockAgentConfig);
    });

    it('should initialize with Alive status', () => {
        // ... existing code ...
    });

    it('should delegate action decisions to the agent', async () => {
        const mockGameState = {} as VisibleGameState;
        const mockAllowedActions: PlayerAction['type'][] = ['message'];
        const expectedAction: PlayerAction = { type: 'message', content: 'Hello' };
        vi.mocked(mockAgent.getAction).mockResolvedValue(expectedAction);

        const action = await player.decideAction(mockGameState, mockAllowedActions);
        // ... assertions for successful action ...
        expect(action).toEqual(expectedAction);

        // Test error case
        const mockError = new Error('Agent failed');
        vi.mocked(mockAgent.getAction).mockRejectedValue(mockError); // Use defined error

        const actionOnError = await player.decideAction(mockGameState); // Renamed variable

        expect(actionOnError).toEqual({ type: 'noAction' }); // Check variable name
        expect(console.error).toHaveBeenCalled();
    });

    // ... rest of the existing code ... 
}); 