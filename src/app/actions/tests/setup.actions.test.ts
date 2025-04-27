import { beforeEach, describe, expect, it, vi } from 'vitest';
import { startGameAction, StartGameSetupData } from '../setup.actions';
import { Themes } from '@/lib/engine/interfaces/Theme'; // Themes not directly used in test logic
import { assignRoles } from '@/lib/engine/core/utils';
import { createInitialMemory } from '@/lib/engine/interfaces/AgentMemory'; // Import memory helpers
import { PlayerStatus } from '@/lib/engine/interfaces/IPlayer';
import type { IRole } from '@/lib/engine/interfaces/IRole'; // Import IRole for mock type
import { RoleName } from '@/lib/engine/interfaces/IRole'; // Import RoleName enum/type
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';
import type { AgentConfig, SerializableGameState } from '@/lib/interfaces/persistence.types';
import { saveGameData } from '@/lib/persistence';
import { filterGameStateForClient } from '@/lib/visibilityHelper';


// Mock dependencies
vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(),
  default: {
    randomUUID: vi.fn()
  }
}));
vi.mock('@/lib/engine/core/utils', () => ({
  assignRoles: vi.fn(),
}));
vi.mock('@/lib/persistence', () => ({
  saveGameData: vi.fn(),
}));

// Mock Themes BEFORE Game mock
vi.mock('@/lib/engine/interfaces/Theme', () => ({
  Themes: {
    // Provide mocks for themes used in tests
    StandardWerewolf: { key: 'StandardWerewolf', name: 'Mock Standard Werewolf', description: 'Mock Desc' },
    // Add other themes if needed by tests
  }
}));

// --- Mock Game Class AFTER defining the functions it uses ---
// Define mocks INSIDE the factory
vi.mock('@/lib/engine/core/Game', () => {
  const mockEnsurePersonasGenerated_inner = vi.fn();
  const mockGetCurrentSerializableState_inner = vi.fn();
  const mockLoadFromState_inner = vi.fn().mockReturnValue({
    ensurePersonasGenerated: mockEnsurePersonasGenerated_inner,
    getCurrentSerializableState: mockGetCurrentSerializableState_inner,
  });

  return {
    Game: class MockGame { // Mock the class directly
      static loadFromState = mockLoadFromState_inner; // Assign the mock static method
      ensurePersonasGenerated = mockEnsurePersonasGenerated_inner;
      getCurrentSerializableState = mockGetCurrentSerializableState_inner;
    }
  };
});

vi.mock('@/lib/visibilityHelper', () => ({
  filterGameStateForClient: vi.fn(),
}));

// --- Mocks for Roles (implementing IRole) ---
// We need instances that match the IRole interface, specifically name and allegiance
const mockWerewolfRole: IRole = { name: RoleName.Mafia, allegiance: 'Mafia', canPerformNightAction: true, description: 'Mock Werewolf' };
const mockVillagerRole: IRole = { name: RoleName.Villager, allegiance: 'Town', canPerformNightAction: false, description: 'Mock Villager' };
const mockSeerRole: IRole = { name: RoleName.Seer, allegiance: 'Town', canPerformNightAction: true, description: 'Mock Seer' };


describe('setup.actions', () => {
  // Need to access the inner mock functions for resets/assertions if Game wasn't imported directly
  // Alternatively, import the mocked Game and access methods through it.
  // Let's try importing the mocked Game.
  let mockEnsurePersonasGenerated: ReturnType<typeof vi.fn>;
  let mockGetCurrentSerializableState: ReturnType<typeof vi.fn>;
  let mockLoadFromState: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // Dynamically import the mocked Game to access its mocked static/instance methods
    const { Game: MockedGame } = await import('@/lib/engine/core/Game');
    // Assign mocks for clarity in tests - note these are the *inner* mocks defined in the factory
    mockLoadFromState = MockedGame.loadFromState as ReturnType<typeof vi.fn>; 
    // Instance methods are on the object returned by loadFromState in this case
    const mockInstance = mockLoadFromState();
    mockEnsurePersonasGenerated = mockInstance.ensurePersonasGenerated as ReturnType<typeof vi.fn>;
    mockGetCurrentSerializableState = mockInstance.getCurrentSerializableState as ReturnType<typeof vi.fn>;
    
    vi.clearAllMocks();
    // Reset mocks using the assigned variables
    mockLoadFromState.mockClear().mockReturnValue({ // Ensure return value is reset
        ensurePersonasGenerated: mockEnsurePersonasGenerated.mockClear().mockResolvedValue(undefined),
        getCurrentSerializableState: mockGetCurrentSerializableState.mockClear(),
    });
    mockEnsurePersonasGenerated.mockClear().mockResolvedValue(undefined);
    mockGetCurrentSerializableState.mockClear();

    // Reset other mocks
    vi.mocked(assignRoles).mockClear();
    vi.mocked(saveGameData).mockClear();
    vi.mocked(filterGameStateForClient).mockClear();
    // Reset both the named and default crypto mock
    vi.mocked((await import('node:crypto')).randomUUID).mockClear();
    vi.mocked((await import('node:crypto')).default.randomUUID).mockClear(); 

  });

  describe('startGameAction', () => {
    const mockGameId = '123e4567-e89b-12d3-a456-426614174000';
    const mockTimestamp = 1678886400000;
    // Correct AgentConfig structure
    const mockMafiaConfig: AgentConfig = { agentType: 'LLM', modelName: 'gpt-4', providerValue: 'openai' };
    const mockTownConfig: AgentConfig = { agentType: 'LLM', modelName: 'claude-3', providerValue: 'anthropic' };

    const baseSetupData: StartGameSetupData = {
      themeKey: 'StandardWerewolf', // Keep using themeKey as input
      language: 'en',
      playerCount: 5,
      mafiaAgentConfig: mockMafiaConfig,
      townAgentConfig: mockTownConfig,
    };

    // Mock roles returned by assignRoles
    const mockAssignedRoles = [
      mockWerewolfRole,
      mockVillagerRole,
      mockSeerRole,
      mockVillagerRole,
      mockVillagerRole,
    ];

     // Define a more complete mock state based on setup.actions logic
     // Use RoleName enum/type for roleName property
     const mockInitialSerializableState: SerializableGameState = {
        gameId: mockGameId,
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
        themeKey: baseSetupData.themeKey,
        language: baseSetupData.language,
        round: 0,
        phase: 'Init',
        players: {
            'player-1-mafia': { id: 'player-1-mafia', name: 'AI Player 1', status: PlayerStatus.Alive, roleName: RoleName.Mafia, allegiance: 'Mafia', agentConfig: mockMafiaConfig, persona: { name: 'AI Player 1', backstory: '', personalityTraits: [] } },
            'player-2-villager': { id: 'player-2-villager', name: 'AI Player 2', status: PlayerStatus.Alive, roleName: RoleName.Villager, allegiance: 'Town', agentConfig: mockTownConfig, persona: { name: 'AI Player 2', backstory: '', personalityTraits: [] } },
            'player-3-seer': { id: 'player-3-seer', name: 'AI Player 3', status: PlayerStatus.Alive, roleName: RoleName.Seer, allegiance: 'Town', agentConfig: mockTownConfig, persona: { name: 'AI Player 3', backstory: '', personalityTraits: [] } },
            'player-4-villager': { id: 'player-4-villager', name: 'AI Player 4', status: PlayerStatus.Alive, roleName: RoleName.Villager, allegiance: 'Town', agentConfig: mockTownConfig, persona: { name: 'AI Player 4', backstory: '', personalityTraits: [] } },
            'player-5-villager': { id: 'player-5-villager', name: 'AI Player 5', status: PlayerStatus.Alive, roleName: RoleName.Villager, allegiance: 'Town', agentConfig: mockTownConfig, persona: { name: 'AI Player 5', backstory: '', personalityTraits: [] } },
        },
        // Use generated player IDs based on index and role name string
        livingPlayerIds: ['player-1-mafia', 'player-2-villager', 'player-3-seer', 'player-4-villager', 'player-5-villager'],
        deadPlayerIds: [],
        conversationLog: [],
        // Use createInitialMemory structure
        agentMemories: {
            'player-1-mafia': createInitialMemory(),
            'player-2-villager': createInitialMemory(),
            'player-3-seer': createInitialMemory(),
            'player-4-villager': createInitialMemory(),
            'player-5-villager': createInitialMemory(),
        },
        winCondition: null,
        humanPlayerId: null,
        pendingHumanAction: null,
        _phaseResults: {},
    };

    // Mock state *after* persona generation (simulate name changes)
    const mockStateAfterPersonaGen: SerializableGameState = {
        ...mockInitialSerializableState,
        players: { // Assume names got updated
            'player-1-mafia': { ...mockInitialSerializableState.players['player-1-mafia'], name: 'Willy Wolf', persona: { name: 'Willy Wolf', backstory: 'Awooo', personalityTraits: ['Hairy'] } },
            'player-2-villager': { ...mockInitialSerializableState.players['player-2-villager'], name: 'Vince Villager', persona: { name: 'Vince Villager', backstory: 'Just a villager', personalityTraits: ['Simple'] } },
            'player-3-seer': { ...mockInitialSerializableState.players['player-3-seer'], name: 'Sally Seer', persona: { name: 'Sally Seer', backstory: 'Sees things', personalityTraits: ['Observant'] } },
            'player-4-villager': { ...mockInitialSerializableState.players['player-4-villager'], name: 'Vinny Villager 2', persona: { name: 'Vinny Villager 2', backstory: 'Another villager', personalityTraits: ['Plain'] } },
            'player-5-villager': { ...mockInitialSerializableState.players['player-5-villager'], name: 'Vicky Villager 3', persona: { name: 'Vicky Villager 3', backstory: 'Yet another villager', personalityTraits: ['Quiet'] } },
        },
    };

    // Mock state *after* persona gen AND phase transition
    const mockStateAfterInitPhase: SerializableGameState = {
        ...mockStateAfterPersonaGen,
        round: 1,
        phase: 'Night',
    };

    const mockFilteredState: FilteredGameState = {
        id: mockGameId,
        round: 1,
        phase: 'Night',
        players: { /* filtered player data */ }, // Filtered data is opaque here
        livingPlayerIds: mockStateAfterInitPhase.livingPlayerIds,
        humanPlayerId: null,
        log: [],
        // Removed properties not part of FilteredGameState type definition
        // myRole: null,
        // myAllegiance: null,
        // myPlayerId: null,
        pendingHumanAction: null,
        winCondition: null,
        themeKey: baseSetupData.themeKey,
        language: baseSetupData.language, // Ensure language is included
        // isPlayerAlive: true, // Not part of type
        // isPlayerTurn: false, // Not part of type
        // availableActions: [], // Not part of type
         // Include other known properties from BaseGameState based on filterGameStateForClient implementation
         title: undefined, 
         description: undefined, 
         createdAt: new Date(mockTimestamp).toISOString(), 
         lastUpdatedAt: new Date(mockTimestamp).toISOString(), 
         winner: null, 
         deadPlayerIds: [], 
    };

    it('should successfully create and initialize a game', async () => {
      // Use the default export mock for setting return value
      const cryptoMock = (await import('node:crypto')).default;
      vi.mocked(cryptoMock.randomUUID).mockReturnValue(mockGameId);
      vi.setSystemTime(mockTimestamp);
      vi.mocked(assignRoles).mockReturnValue(mockAssignedRoles); // Use the defined mock roles

      // Setup mocks for the game instance methods *before* calling the action
      mockGetCurrentSerializableState.mockReturnValue(mockStateAfterPersonaGen);
      vi.mocked(saveGameData).mockResolvedValue(undefined);
      vi.mocked(filterGameStateForClient).mockReturnValue(mockFilteredState);

      const result = await startGameAction(baseSetupData);

      expect(vi.mocked(cryptoMock.randomUUID)).toHaveBeenCalledTimes(1);
      expect(assignRoles).toHaveBeenCalledWith(baseSetupData.playerCount);

      // Check the state passed to the static loadFromState method
      expect(mockLoadFromState).toHaveBeenCalledWith(expect.objectContaining({
        gameId: mockGameId,
        createdAt: mockTimestamp,
        phase: 'Init',
        humanPlayerId: null,
        players: expect.objectContaining({
            // Check based on expected IDs from the mock roles
            'player-1-mafia': expect.objectContaining({ name: 'AI Player 1', roleName: RoleName.Mafia }),
            'player-5-villager': expect.objectContaining({ name: 'AI Player 5', roleName: RoleName.Villager })
        })
      }));

      // Check instance method calls
      expect(mockEnsurePersonasGenerated).toHaveBeenCalledTimes(1);
      expect(mockGetCurrentSerializableState).toHaveBeenCalledTimes(1);

      // Check the state passed to saveGameData
      expect(saveGameData).toHaveBeenCalledWith(mockGameId, expect.objectContaining({
          ...mockStateAfterInitPhase, // Compare against the final state structure
          agentMemories: expect.any(Object), // contains createInitialMemory results
          phase: 'Night',
          round: 1,
      }));

      // Check the state passed to filterGameStateForClient
      expect(filterGameStateForClient).toHaveBeenCalledWith(expect.objectContaining({
        ...mockStateAfterInitPhase,
        phase: 'Night',
        round: 1,
      }));
      expect(result).toEqual({ gameId: mockGameId, initialState: mockFilteredState });
    });

     it('should handle human player configuration', async () => {
        const humanSetupData: StartGameSetupData = {
            ...baseSetupData,
            playerCount: 3,
            humanPlayer: { name: 'Human Dave', roleName: RoleName.Villager }, // Use RoleName
        };
        // Ensure human is assigned the correct role instance (index 0)
        const humanMockAssignedRoles = [mockVillagerRole, mockWerewolfRole, mockVillagerRole];
        // Expected ID for human player (index 0, role Villager)
        const humanPlayerId = `player-1-villager`;

        const cryptoMock = (await import('node:crypto')).default;
        vi.mocked(cryptoMock.randomUUID).mockReturnValue(mockGameId);
        vi.setSystemTime(mockTimestamp);
        vi.mocked(assignRoles).mockReturnValue(humanMockAssignedRoles);

        // Mock initial state with human player
        const mockStateWithHumanInitial: SerializableGameState = {
            gameId: mockGameId,
            createdAt: mockTimestamp,
            updatedAt: mockTimestamp,
            themeKey: humanSetupData.themeKey,
            language: humanSetupData.language,
            round: 0,
            phase: 'Init',
            players: {
                [humanPlayerId]: { id: humanPlayerId, name: 'Human Dave', status: PlayerStatus.Alive, roleName: RoleName.Villager, allegiance: 'Town', agentConfig: { agentType: 'Human' }, persona: { name: 'Human Dave', backstory: '', personalityTraits: [] } },
                // Correct IDs based on index and role name string
                'player-2-mafia': { id: 'player-2-mafia', name: 'AI Player 2', status: PlayerStatus.Alive, roleName: RoleName.Mafia, allegiance: 'Mafia', agentConfig: mockMafiaConfig, persona: { name: 'AI Player 2', backstory: '', personalityTraits: [] } },
                'player-3-villager': { id: 'player-3-villager', name: 'AI Player 3', status: PlayerStatus.Alive, roleName: RoleName.Villager, allegiance: 'Town', agentConfig: mockTownConfig, persona: { name: 'AI Player 3', backstory: '', personalityTraits: [] } },
            },
            livingPlayerIds: [humanPlayerId, 'player-2-mafia', 'player-3-villager'],
            deadPlayerIds: [],
            conversationLog: [],
            agentMemories: {
                [humanPlayerId]: createInitialMemory(),
                'player-2-mafia': createInitialMemory(),
                'player-3-villager': createInitialMemory(),
            },
            winCondition: null,
            humanPlayerId: humanPlayerId,
            pendingHumanAction: null,
            _phaseResults: {},
        };

        const mockStateAfterPersonaWithHuman = {
             ...mockStateWithHumanInitial,
            players: {
                ...mockStateWithHumanInitial.players,
                 'player-2-mafia': { ...mockStateWithHumanInitial.players['player-2-mafia'], name: 'Willy Wolf 2', persona: { name: 'Willy Wolf 2', backstory: 'Awooo 2', personalityTraits: ['Furry'] }},
                 'player-3-villager': { ...mockStateWithHumanInitial.players['player-3-villager'], name: 'Vince Villager 2', persona: { name: 'Vince Villager 2', backstory: 'Just another villager', personalityTraits: ['Normal'] }},
            },
        };

         const mockStateAfterInitWithHuman = {
            ...mockStateAfterPersonaWithHuman,
            round: 1,
            phase: 'Night',
         };

        const mockFilteredStateWithHuman: FilteredGameState = {
             id: mockGameId,
             round: 1,
             phase: 'Night',
             players: { /* Filtered correctly */ },
             livingPlayerIds: mockStateAfterInitWithHuman.livingPlayerIds,
             humanPlayerId: humanPlayerId,
             log: [],
             // Removed properties not part of FilteredGameState type definition
             // myRole: RoleName.Villager,
             // myAllegiance: 'Town',
             // myPlayerId: humanPlayerId,
             pendingHumanAction: null,
             winCondition: null,
             themeKey: humanSetupData.themeKey,
             language: humanSetupData.language, // Ensure language is included
             // isPlayerAlive: true, // Not part of type
             // isPlayerTurn: false, // Not part of type
             // availableActions: [], // Not part of type
             // Include other known properties from BaseGameState based on filterGameStateForClient implementation
             title: undefined, 
             description: undefined, 
             createdAt: new Date(mockTimestamp).toISOString(), 
             lastUpdatedAt: new Date(mockTimestamp).toISOString(),
             winner: null,
             deadPlayerIds: [],
        };

        // Setup mocks for this specific test case
        mockGetCurrentSerializableState.mockReturnValue(mockStateAfterPersonaWithHuman);
        vi.mocked(saveGameData).mockResolvedValue(undefined);
        vi.mocked(filterGameStateForClient).mockReturnValue(mockFilteredStateWithHuman);

        const result = await startGameAction(humanSetupData);

        expect(mockLoadFromState).toHaveBeenCalledWith(expect.objectContaining({
             humanPlayerId: humanPlayerId,
             players: expect.objectContaining({
                [humanPlayerId]: expect.objectContaining({
                    name: 'Human Dave',
                    agentConfig: { agentType: 'Human' },
                    roleName: RoleName.Villager, // Check RoleName enum
                }),
                 'player-2-mafia': expect.objectContaining({ // Correct ID and RoleName
                    name: 'AI Player 2',
                    agentConfig: mockMafiaConfig,
                    roleName: RoleName.Mafia,
                 }),
             }),
        }));
        expect(saveGameData).toHaveBeenCalledWith(mockGameId, expect.objectContaining({
             humanPlayerId: humanPlayerId,
             phase: 'Night',
             round: 1,
             players: mockStateAfterInitWithHuman.players,
        }));
        expect(filterGameStateForClient).toHaveBeenCalledWith(expect.objectContaining({
            humanPlayerId: humanPlayerId,
            phase: 'Night',
            round: 1,
            players: mockStateAfterInitWithHuman.players,
        }));
        expect(result).toEqual({ gameId: mockGameId, initialState: mockFilteredStateWithHuman });
    });

    it('should return an error if playerCount is less than 3', async () => {
      const invalidSetupData = { ...baseSetupData, playerCount: 2 };
      const result = await startGameAction(invalidSetupData);
      expect(result).toEqual({ error: 'Minimum 3 players required.' });
      expect(saveGameData).not.toHaveBeenCalled();
      expect(mockLoadFromState).not.toHaveBeenCalled(); // Check static mock
    });

    it('should return an error if themeKey is invalid', async () => {
      const invalidSetupData = { ...baseSetupData, themeKey: 'InvalidTheme' };
      // No need to mock/unmock Themes as it's checked against an imported object
      const result = await startGameAction(invalidSetupData);
      expect(result).toEqual({ error: 'Invalid theme key: InvalidTheme' });
      expect(saveGameData).not.toHaveBeenCalled();
      expect(mockLoadFromState).not.toHaveBeenCalled();
    });

    it('should return an error if saveGameData fails', async () => {
        const cryptoMock = (await import('node:crypto')).default;
        vi.mocked(cryptoMock.randomUUID).mockReturnValue(mockGameId);
        vi.setSystemTime(mockTimestamp);
        vi.mocked(assignRoles).mockReturnValue(mockAssignedRoles);

        mockGetCurrentSerializableState.mockReturnValue(mockStateAfterPersonaGen);
        const saveError = new Error('Database connection failed');
        vi.mocked(saveGameData).mockRejectedValue(saveError);

        const result = await startGameAction(baseSetupData);

        expect(mockLoadFromState).toHaveBeenCalled(); // Load should still happen
        expect(mockEnsurePersonasGenerated).toHaveBeenCalled();
        expect(mockGetCurrentSerializableState).toHaveBeenCalled();
        expect(saveGameData).toHaveBeenCalled(); // Attempt to save
        expect(result).toEqual({ error: 'Database connection failed' });
        expect(filterGameStateForClient).not.toHaveBeenCalled();
    });

     it('should return an error if ensurePersonasGenerated fails', async () => {
        const cryptoMock = (await import('node:crypto')).default;
        vi.mocked(cryptoMock.randomUUID).mockReturnValue(mockGameId);
        vi.setSystemTime(mockTimestamp);
        vi.mocked(assignRoles).mockReturnValue(mockAssignedRoles);
        const personaError = new Error('Persona generation service unavailable');

        // Mock the method on the *instance* returned by loadFromState to throw
        mockEnsurePersonasGenerated.mockRejectedValue(personaError);
        // Need to ensure loadFromState returns the object containing the failing mock
        mockLoadFromState.mockReturnValue({
            ensurePersonasGenerated: mockEnsurePersonasGenerated,
            getCurrentSerializableState: mockGetCurrentSerializableState,
        });

        const result = await startGameAction(baseSetupData);

        expect(mockLoadFromState).toHaveBeenCalled();
        expect(mockEnsurePersonasGenerated).toHaveBeenCalled();
        expect(result).toEqual({ error: 'Persona generation service unavailable' });
        expect(mockGetCurrentSerializableState).not.toHaveBeenCalled(); // Should fail before this
        expect(saveGameData).not.toHaveBeenCalled();
        expect(filterGameStateForClient).not.toHaveBeenCalled();
    });
  });
}); 