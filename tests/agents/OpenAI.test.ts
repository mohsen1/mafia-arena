// tests/agents/OpenAIAgent.test.ts
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { OpenAIAgent } from '../../src/agents/OpenAIAgent';
import type { VisibleGameState } from '../../src/interfaces/GameState';
import type { PlayerAction } from '../../src/interfaces/IAgent';
import { createInitialMemory } from '../../src/interfaces/AgentMemory';
import { RoleName } from '../../src/interfaces/IRole';
import { PlayerStatus } from '../../src/interfaces/IPlayer';

// --- Mock OpenAI library ---
vi.mock('openai', async (importActual) => {
    // Get actual module if needed, but here we replace it entirely
    // const actual = await importActual('openai');
    const mockCreate = vi.fn();
    const mockCompletions = { create: mockCreate };
    const mockChat = { completions: mockCompletions };
    const MockOpenAI = vi.fn(() => ({ chat: mockChat }));

    return {
        OpenAI: MockOpenAI,
        default: MockOpenAI,
        // Export the internal mock function reference
        __mockCreate: mockCreate
    };
});

// --- Mock Prompts ---
// Keep this mock here as it doesn't depend on the OpenAI mock timing
vi.mock('../../src/prompts', () => ({
    getSystemPrompt: vi.fn(() => 'Mock System Prompt'),
    getUserPrompt: vi.fn(() => 'Mock User Prompt'),
}));


describe('OpenAIAgent', () => {
    let agent: OpenAIAgent;
    let mockGameState: VisibleGameState;
    let mockCreate: Mock; // To hold the mock function
    let getSystemPrompt: Mock;
    let getUserPrompt: Mock;

    beforeEach(async () => { // Make beforeEach async to handle potential dynamic imports
        vi.clearAllMocks();

        // Dynamically import the mocked components AFTER vi.mock has run
        const mockedOpenAI = await import('openai');
        mockCreate = (mockedOpenAI as any).__mockCreate; // Get the exported mock function

        const mockedPrompts = await import('../../src/prompts');
        getSystemPrompt = mockedPrompts.getSystemPrompt as Mock;
        getUserPrompt = mockedPrompts.getUserPrompt as Mock;


        // Reset mock implementations if needed (e.g., for prompts)
        getSystemPrompt.mockReturnValue('Mock System Prompt');
        getUserPrompt.mockReturnValue('Mock User Prompt');
        mockCreate.mockClear(); // Clear any previous calls/results

        agent = new OpenAIAgent(); // Instantiates agent, which uses the mocked OpenAI
        agent.playerId = 'openai-test-player';

        mockGameState = {
             gameId: 'test-game',
             round: 2,
             phase: 'Day',
             language: 'en',
             self: { id: agent.playerId, name: 'Test Agent', role: RoleName.Villager, isMafia: false, status: PlayerStatus.Alive },
             players: [{ id: agent.playerId, name: 'Test Agent', status: PlayerStatus.Alive }],
             alivePlayerIds: new Set([agent.playerId]),
             memory: createInitialMemory(),
             themeName: 'Default'
         };
    });

    it('should call OpenAI API with correct prompts and parameters', async () => {
        const expectedAction: PlayerAction = { type: 'message', content: 'Hello from mock!' };
        // Use the mockCreate obtained in beforeEach
        mockCreate.mockResolvedValue({
            choices: [{ message: { content: JSON.stringify(expectedAction) } }],
        });
        const allowed: PlayerAction['type'][] = ['message', 'vote', 'noAction'];

        await agent.getAction(mockGameState, allowed);

        expect(getSystemPrompt).toHaveBeenCalled();
        expect(getUserPrompt).toHaveBeenCalledWith(
             expect.objectContaining({ // Check the state passed to prompt generator
                 round: mockGameState.round,
                 phase: mockGameState.phase,
                 self: mockGameState.self,
                 memory: mockGameState.memory, // Ensure memory is passed
             }),
             allowed // Check allowed actions are passed
         );

        // Verify OpenAI API call
        // Use the mockCreate obtained in beforeEach
        expect(mockCreate).toHaveBeenCalledTimes(1);
        expect(mockCreate).toHaveBeenCalledWith({
            model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo', // Check model
            messages: [
                { role: 'system', content: 'Mock System Prompt' }, // Check prompts used
                { role: 'user', content: 'Mock User Prompt' },
            ],
            temperature: expect.any(Number), // Check other params
            max_tokens: expect.any(Number),
            response_format: { type: 'json_object' }, // Check JSON format request
        });
    });

    it('should parse valid JSON response and return action', async () => {
        const expectedAction: PlayerAction = { type: 'vote', targetPlayerId: 'p2' };
        // Use the mockCreate obtained in beforeEach
        mockCreate.mockResolvedValue({
            choices: [{ message: { content: JSON.stringify(expectedAction) } }],
        });

        const action = await agent.getAction(mockGameState, ['vote']);

        expect(action).toEqual(expectedAction);
    });

     it('should return noAction if response is not valid JSON', async () => {
         // Use the mockCreate obtained in beforeEach
         mockCreate.mockResolvedValue({
             choices: [{ message: { content: 'This is not JSON' } }],
         });

         const action = await agent.getAction(mockGameState, ['message']);

         expect(action).toEqual({ type: 'noAction' });
     });

    it('should return noAction if the returned action type is not allowed', async () => {
        const disallowedAction: PlayerAction = { type: 'mafiaKill', targetPlayerId: 'p1' }; // Mafia action
         // Use the mockCreate obtained in beforeEach
         mockCreate.mockResolvedValue({
             choices: [{ message: { content: JSON.stringify(disallowedAction) } }],
         });

         // Villager during the day cannot perform mafiaKill
         const action = await agent.getAction(mockGameState, ['message', 'vote', 'noAction']);

         expect(action).toEqual({ type: 'noAction' });
     });

     it('should handle empty API response', async () => {
         // Use the mockCreate obtained in beforeEach
         mockCreate.mockResolvedValue({
             choices: [{ message: { content: null } }], // Simulate empty content
         });

         const action = await agent.getAction(mockGameState, ['message']);
         expect(action).toEqual({ type: 'noAction' });
     });

     it('should handle API call error', async () => {
          const apiError = new Error('API failed');
          // Use the mockCreate obtained in beforeEach
          mockCreate.mockRejectedValue(apiError); // Simulate API error

          const action = await agent.getAction(mockGameState, ['message']);
          expect(action).toEqual({ type: 'noAction' });
      });

    // Add more tests: different roles, different phases, specific content validation if needed.
});