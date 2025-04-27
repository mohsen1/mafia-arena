// tests/agents/OpenAIAgent.test.ts
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { OpenAIAgent } from '@/lib/engine/agents/OpenAIAgent';
import type { VisibleGameState } from '@/lib/engine/interfaces/GameState';
import type { PlayerAction } from '@/lib/engine/interfaces/IAgent';
import { createInitialMemory, type AgentMemory, type AIConversationLog } from '@/lib/engine/interfaces/AgentMemory';
import { RoleName } from '@/lib/engine/interfaces/IRole';
import { PlayerStatus } from '@/lib/engine/interfaces/IPlayer';
import { Persona, DEFAULT_PERSONA } from '@/lib/engine/interfaces/Persona';

// --- Mock OpenAI library ---
vi.mock('openai', async (importActual) => {
    // Get actual module if needed, but here we replace it entirely
    // const actual = await importActual('openai');
    const mockCreate = vi.fn();
    const mockCompletions = { create: mockCreate };
    const mockChat = { completions: mockCompletions };
    const MockOpenAI = vi.fn((config) => {
        // You could store or assert config.apiKey, config.baseURL here if needed
        return { chat: mockChat };
    });

    return {
        OpenAI: MockOpenAI,
        default: MockOpenAI,
        // Export the internal mock function reference
        __mockCreate: mockCreate,
        __MockOpenAIConstructor: MockOpenAI
    };
});

// --- Mock Prompts ---
// Keep this mock here as it doesn't depend on the OpenAI mock timing
vi.mock('@/lib/engine/prompts', () => ({
    getSystemPrompt: vi.fn(() => 'Mock System Prompt'),
    getUserPrompt: vi.fn(() => 'Mock User Prompt'),
    getPersonaGenerationPrompt: vi.fn(() => 'Mock Persona Gen Prompt'),
}));


describe('OpenAIAgent', () => {
    let agent: OpenAIAgent;
    let mockGameState: VisibleGameState;
    let mockCreate: Mock; // To hold the mock function
    let MockOpenAIConstructor: Mock;
    let getSystemPrompt: Mock;
    let getUserPrompt: Mock;
    let getPersonaGenerationPrompt: Mock;

    // Define test configurations
    const testPlayerId = 'openai-test-player'; // Define player ID for tests
    const testModel = 'test-model-123';
    const testApiBase = 'http://localhost:1234/v1';
    const testApiKey = 'test-key-xyz';

    beforeEach(async () => {
        vi.clearAllMocks();

        // Dynamically import the mocked components AFTER vi.mock has run
        const mockedOpenAI = await import('openai');
        mockCreate = (mockedOpenAI as any).__mockCreate; // Get the exported mock function
        MockOpenAIConstructor = (mockedOpenAI as any).__MockOpenAIConstructor; // Get constructor mock

        const mockedPrompts = await import('@/lib/engine/prompts');
        getSystemPrompt = mockedPrompts.getSystemPrompt as Mock;
        getUserPrompt = mockedPrompts.getUserPrompt as Mock;
        getPersonaGenerationPrompt = mockedPrompts.getPersonaGenerationPrompt as Mock; // Get the mock

        // Reset mock implementations if needed (e.g., for prompts)
        getSystemPrompt.mockReturnValue('Mock System Prompt');
        getUserPrompt.mockReturnValue('Mock User Prompt');
        getPersonaGenerationPrompt.mockReturnValue('Mock Persona Gen Prompt'); // Reset mock return value
        mockCreate.mockClear(); // Clear any previous calls/results
        MockOpenAIConstructor.mockClear(); // Clear constructor mock calls too

        // Instantiate agent with the CORRECT constructor signature (id first)
        agent = new OpenAIAgent(testPlayerId, testModel, testApiBase, testApiKey);

        // Define a consistent test player ID (already defined above)

        mockGameState = {
            gameId: 'test-game',
            round: 2,
            phase: 'Day',
            language: 'en',
            self: { id: testPlayerId, name: 'Test Agent', role: RoleName.Villager, isMafia: false, status: PlayerStatus.Alive },
            players: [{ id: testPlayerId, name: 'Test Agent', status: PlayerStatus.Alive }],
            alivePlayerIds: new Set([testPlayerId]),
            memory: createInitialMemory(),
            themeName: 'Default'
        };
    });

    it('should initialize OpenAI client with correct parameters', () => {
        // Agent is created in beforeEach
        expect(MockOpenAIConstructor).toHaveBeenCalledTimes(1);
        expect(MockOpenAIConstructor).toHaveBeenCalledWith({
            apiKey: testApiKey,
            baseURL: testApiBase,
        });
    });

    it('should call OpenAI API with configured model and prompts', async () => {
        const expectedAction: PlayerAction = { type: 'message', content: 'Hello from mock!' };
        // Use the mockCreate obtained in beforeEach
        mockCreate.mockResolvedValue({
            choices: [{ message: { content: JSON.stringify(expectedAction) } }],
        });
        const allowed: PlayerAction['type'][] = ['message', 'vote', 'noAction'];

        await agent.getAction(mockGameState, allowed);

        expect(getSystemPrompt).toHaveBeenCalled();
        expect(getUserPrompt).toHaveBeenCalledWith(
             expect.objectContaining({ // Check the promptInputState structure
                 round: mockGameState.round,
                 phase: mockGameState.phase,
                 language: mockGameState.language,
                 themeName: mockGameState.themeName,
                 self: expect.objectContaining({ // Check self properties
                     id: mockGameState.self.id,
                     name: mockGameState.self.name,
                     role: mockGameState.self.role,
                     isMafia: mockGameState.self.isMafia,
                     status: mockGameState.self.status,
                     allegiance: 'Town' // Deduced allegiance for Villager
                 }),
                 players: expect.arrayContaining([ // Check mapped player structure
                    expect.objectContaining({ 
                        id: mockGameState.self.id, 
                        name: mockGameState.self.name, 
                        status: mockGameState.self.status 
                    })
                 ]),
                 alivePlayerIds: expect.arrayContaining([mockGameState.self.id]), // Now an array
                 mafiaPlayerIds: undefined, // Villager view
                 // Expect the memory *without* AI logs to be passed to the prompt generator
                 memory: expect.objectContaining({
                    ...mockGameState.memory, // Copy other memory fields
                    aiConversationLogs: [] // Expect empty array here
                 }), 
             }),
             allowed // Check allowed actions are passed
         );

        // Verify OpenAI API call
        // Use the mockCreate obtained in beforeEach
        expect(mockCreate).toHaveBeenCalledTimes(1);
        expect(mockCreate).toHaveBeenCalledWith({
            model: testModel, // Check configured model is used
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
         mockCreate.mockResolvedValue({
             choices: [{ message: { content: 'This is not JSON' } }],
         });

         // Suppress console error for this test
         const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
         const action = await agent.getAction(mockGameState, ['message']);
         consoleSpy.mockRestore();

         expect(action).toEqual({ type: 'noAction' });
     });

    it('should return noAction if the returned action type is not allowed', async () => {
        const disallowedAction: PlayerAction = { type: 'mafiaKill', targetPlayerId: 'p1' };
         mockCreate.mockResolvedValue({
             choices: [{ message: { content: JSON.stringify(disallowedAction) } }],
         });

         // Suppress console error for this test
         const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
         const action = await agent.getAction(mockGameState, ['message', 'vote', 'noAction']);
         consoleSpy.mockRestore();

         expect(action).toEqual({ type: 'noAction' });
     });

     it('should return noAction and log error on empty API response', async () => {
         mockCreate.mockResolvedValue({
             choices: [{ message: { content: null } }],
         });

         // Suppress console error for this test
         const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
         const action = await agent.getAction(mockGameState, ['message']);
         consoleSpy.mockRestore();

         expect(action).toEqual({ type: 'noAction' });

         // Check if the error was logged
         expect(mockGameState.memory.aiConversationLogs).toHaveLength(1);
         const log = mockGameState.memory.aiConversationLogs[0];
         expect(log.response.raw).toBeNull();
         expect(log.response.error).toContain('Empty API response');
         expect(log.response.parsedAction).toBeNull(); // No action parsed
     });

     it('should return noAction and log error on API call failure', async () => {
          const apiError = new Error('API failed miserably');
          mockCreate.mockRejectedValue(apiError);

          // Suppress console error for this test
          const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
          const action = await agent.getAction(mockGameState, ['message']);
          consoleSpy.mockRestore();

          expect(action).toEqual({ type: 'noAction' });

          // Check if the error was logged
          expect(mockGameState.memory.aiConversationLogs).toHaveLength(1);
          const log = mockGameState.memory.aiConversationLogs[0];
          expect(log.response.raw).toBeNull(); // No raw response
          expect(log.response.error).toContain('API call failed: API failed miserably');
          expect(log.response.parsedAction).toBeNull(); // No action parsed
      });

    it('should return noAction and log error on JSON parsing failure', async () => {
        const invalidJsonResponse = '{"type": "message", "content": "unterminated string';
         mockCreate.mockResolvedValue({
             choices: [{ message: { content: invalidJsonResponse } }],
         });

         // Suppress console error for this test
         const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
         const action = await agent.getAction(mockGameState, ['message']);
         consoleSpy.mockRestore();

         expect(action).toEqual({ type: 'noAction' });

         // Check if the error was logged
         expect(mockGameState.memory.aiConversationLogs).toHaveLength(1);
         const log = mockGameState.memory.aiConversationLogs[0];
         expect(log.response.raw).toEqual(invalidJsonResponse);
         expect(log.response.error).toContain('JSON parse error');
         expect(log.response.parsedAction).toBeNull(); // No action parsed
    });

    it('should handle a Mafia player during the Night phase', async () => {
        // Create a specific game state for this test
        const mafiaPlayerId = 'mafia-player';
        const villagerPlayerId = 'villager1';
        // agent.setPlayerId(mafiaPlayerId); // Removed: Agent ID is handled by gameState

        const mafiaGameState: VisibleGameState = {
            gameId: 'mafia-test-game',
            round: 3,
            phase: 'Night',
            language: 'en',
            self: { id: mafiaPlayerId, name: 'Test Mafia Agent', role: RoleName.Mafia, isMafia: true, status: PlayerStatus.Alive },
            players: [
                { id: mafiaPlayerId, name: 'Test Mafia Agent', status: PlayerStatus.Alive },
                { id: villagerPlayerId, name: 'Villager One', status: PlayerStatus.Alive }
            ],
            alivePlayerIds: new Set([mafiaPlayerId, villagerPlayerId]),
            memory: createInitialMemory(), // Start with initial memory, prompts should adapt
            themeName: 'Spooky'
        };

        const expectedAction: PlayerAction = { type: 'mafiaKill', targetPlayerId: villagerPlayerId };
        mockCreate.mockResolvedValue({
            choices: [{ message: { content: JSON.stringify(expectedAction) } }],
        });
        const allowed: PlayerAction['type'][] = ['mafiaKill', 'noAction']; // Mafia can kill at night

        const action = await agent.getAction(mafiaGameState, allowed);

        expect(getSystemPrompt).toHaveBeenCalled(); // System prompt should still be called
        expect(getUserPrompt).toHaveBeenCalledWith(
            expect.objectContaining({
                phase: 'Night',
                self: expect.objectContaining({ role: RoleName.Mafia, isMafia: true }),
                // Only check that memory is an object, as its internal structure might vary
                memory: expect.any(Object),
                // Check other important parts of the state passed to the prompt
                players: expect.arrayContaining([
                    expect.objectContaining({ id: mafiaPlayerId }),
                    expect.objectContaining({ id: villagerPlayerId })
                ]),
                alivePlayerIds: expect.anything(), // Accept Set or Array after potential serialization
            }),
            allowed
        );
        expect(mockCreate).toHaveBeenCalledTimes(1);
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
            messages: expect.arrayContaining([
                { role: 'system', content: 'Mock System Prompt' },
                { role: 'user', content: 'Mock User Prompt' },
            ]),
        }));
        expect(action).toEqual(expectedAction);
    });

    it('should use existing memory when generating prompts', async () => {
        // Create a specific game state with pre-populated memory for this test
        const player1Id = 'player1';
        const player2Id = 'player2';
        // agent.setPlayerId(player1Id); // Removed: Agent ID is handled by gameState

        const memoryWithHistory: AgentMemory = {
            investigationResults: [],
            killHistory: [],
            saveHistory: [],
            voteHistory: [
                { round: 1, votes: new Map([[player1Id, player2Id]]) }
            ],
            messageHistory: [
                { 
                    id: 'msg1', round: 1, phase: 'Day', senderId: player2Id, 
                    senderName: 'Player 2', content: 'Test message', 
                    timestamp: new Date(), visibility: 'Public' as any // Cast for simplicity
                }
            ],
            aiConversationLogs: [] // Initialize the logs array
        };

        const gameStateWithMemory: VisibleGameState = {
            gameId: 'memory-test-game',
            round: 2,
            phase: 'Day',
            language: 'en',
            self: { id: player1Id, name: 'Test Agent', role: RoleName.Villager, isMafia: false, status: PlayerStatus.Alive },
            players: [
                { id: player1Id, name: 'Test Agent', status: PlayerStatus.Alive },
                { id: player2Id, name: 'Player 2', status: PlayerStatus.Alive }
            ],
            alivePlayerIds: new Set([player1Id, player2Id]),
            memory: memoryWithHistory, // Use the pre-populated memory
            themeName: 'Memory Test'
        };

        const expectedAction: PlayerAction = { type: 'vote', targetPlayerId: player2Id };
        mockCreate.mockResolvedValue({
            choices: [{ message: { content: JSON.stringify(expectedAction) } }],
        });
        const allowed: PlayerAction['type'][] = ['message', 'vote', 'noAction'];

        await agent.getAction(gameStateWithMemory, allowed);

        // Verify getUserPrompt was called with the specific memory content
        expect(getUserPrompt).toHaveBeenCalledWith(
            expect.objectContaining({
                memory: expect.objectContaining({
                    voteHistory: expect.arrayContaining([ // Check vote history structure
                        expect.objectContaining({ 
                            round: 1, 
                            votes: expect.any(Map) // Check it has a Map
                        })
                    ]),
                    messageHistory: expect.arrayContaining([ // Check message history structure
                        expect.objectContaining({ 
                            id: 'msg1', 
                            senderId: player2Id, 
                            content: 'Test message' 
                        })
                    ])
                })
            }),
            allowed
        );

        // Also verify the API call was made
        expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    // --- Tests for generatePersona ---
    describe('generatePersona', () => {
        const themeDesc = 'A spooky haunted house';

        beforeEach(() => {
            // Reset persona to default before each persona generation test
            agent.persona = { ...DEFAULT_PERSONA }; 
        });

        it('should call API with persona prompt and update persona on success', async () => {
            const mockGeneratedPersona: Persona = {
                name: 'Ghostly Gustav',
                backstory: 'A resident phantom.',
                personalityTraits: ['Ethereal', 'Mischievous'],
            };
            mockCreate.mockResolvedValueOnce({
                choices: [{ message: { content: JSON.stringify(mockGeneratedPersona) } }],
            });

            await agent.generatePersona(themeDesc);

            expect(getPersonaGenerationPrompt).toHaveBeenCalledWith(themeDesc);
            expect(mockCreate).toHaveBeenCalledTimes(1);
            expect(mockCreate).toHaveBeenCalledWith({
                model: testModel,
                messages: [
                    { role: 'user', content: 'Mock Persona Gen Prompt' },
                ],
                temperature: expect.any(Number),
                max_tokens: expect.any(Number),
                response_format: { type: 'json_object' },
            });
            expect(agent.persona).toEqual(mockGeneratedPersona);
        });

        it('should assign DEFAULT_PERSONA if API call fails', async () => {
            const apiError = new Error('Persona API failed');
            mockCreate.mockRejectedValueOnce(apiError);
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); // Suppress error

            // agent.persona is already reset in beforeEach
            await agent.generatePersona(themeDesc);
            consoleSpy.mockRestore();

            expect(mockCreate).toHaveBeenCalledTimes(1);
            expect(agent.persona).toEqual(DEFAULT_PERSONA);
        });

        it('should assign DEFAULT_PERSONA if API response is empty', async () => {
            mockCreate.mockResolvedValueOnce({
                choices: [{ message: { content: null } }],
            });
            // agent.persona is already reset in beforeEach
            await agent.generatePersona(themeDesc);

            expect(mockCreate).toHaveBeenCalledTimes(1);
            expect(agent.persona).toEqual(DEFAULT_PERSONA);
        });

        it('should assign DEFAULT_PERSONA if response is not valid JSON', async () => {
             mockCreate.mockResolvedValueOnce({
                 choices: [{ message: { content: 'invalid json' } }],
             });
            // agent.persona is already reset in beforeEach
             await agent.generatePersona(themeDesc);
 
             expect(mockCreate).toHaveBeenCalledTimes(1);
             expect(agent.persona).toEqual(DEFAULT_PERSONA);
         });

        it('should assign DEFAULT_PERSONA if parsed JSON lacks required fields', async () => {
            const incompletePersona = { name: 'Incomplete Guy', backstory: 'Missing traits.' }; // Missing personalityTraits
             mockCreate.mockResolvedValueOnce({
                 choices: [{ message: { content: JSON.stringify(incompletePersona) } }],
             });
            // agent.persona is already reset in beforeEach
             await agent.generatePersona(themeDesc);
 
             expect(mockCreate).toHaveBeenCalledTimes(1);
             expect(agent.persona).toEqual(DEFAULT_PERSONA);
        });
    });

    // Add more tests: different roles, different phases, specific content validation if needed.
});