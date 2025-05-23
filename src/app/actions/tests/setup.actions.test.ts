import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { startGameAction } from '../setup.actions';
import type { StartGameSetupData } from '@/lib/interfaces/actions.types'; // Import from central location
import { assignRoles } from '@/lib/engine/core/utils';
import { createInitialMemory } from '@/lib/engine/interfaces/AgentMemory'; // Import memory helpers
import { PlayerStatus } from '@/lib/engine/interfaces/IPlayer';
import type { IRole } from '@/lib/engine/interfaces/IRole'; // Import IRole for mock type
import { RoleName } from '@/lib/engine/interfaces/IRole'; // Import RoleName enum/type
import type { FilteredGameState, FilteredPlayer, PlayerId, GamePhaseType } from '@/lib/interfaces/gameState.types';
import type { SerializableGameState, SerializablePlayer } from '@/lib/interfaces/persistence.types';
import { saveGameData } from '@/lib/persistence';
import { filterGameStateForClient } from '@/lib/visibilityHelper';
import type { AgentConfig } from '@/lib/interfaces/agent.types'; // Changed to type import
import { Game } from '@/lib/engine/core/Game'; // Import Game
import type { StartGameSetupData as CentralStartGameSetupData } from '@/lib/interfaces/actions.types'; // Import type from central location

// --- Types for Mocks (moved to very top level) ---
type MockGameInstanceMethodsSetup = {
  ensurePersonasGenerated: Mock<() => Promise<void>>;
  createInitialAgentMemories: Mock<() => void>;
  getCurrentPhase: Mock<() => { type: GamePhaseType; runStep: Mock; transition: Mock }>;
  getCurrentSerializableState: Mock<() => SerializableGameState>;
  advanceToPhase: Mock<(phase: GamePhaseType) => void>;
  logEvent: Mock<(message: string) => void>;
  markRolesAssigned: Mock<() => void>;
  markPersonasGenerated: Mock<() => void>;
  isRolesAssigned: Mock<() => boolean>;
  isPersonasGenerated: Mock<() => boolean>;
  isInitialMemoriesCreated: Mock<() => boolean>;
  _initPhaseRunStep: Mock<() => Promise<void>>; 
  _initPhaseTransition: Mock<() => GamePhaseType>; 
};

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
    StandardWerewolf: { key: 'StandardWerewolf', name: 'Mock Standard Werewolf', description: 'Mock Desc' },
    UK_VILLAGE_1900S: { key: 'UK_VILLAGE_1900S', name: 'UK Village 1900s', description: 'A quaint village.' },
  }
}));

// --- Mock Game Class and its methods ---
vi.mock('@/lib/engine/core/Game', async (importOriginal) => {
  const originalModule = await importOriginal<typeof Game>();
  const mockInitPhaseRunStepFactory = vi.fn().mockResolvedValue(undefined);
  const mockInitPhaseTransitionFactory = vi.fn().mockReturnValue('Day' as GamePhaseType);

  const gameInstanceMockObject: MockGameInstanceMethodsSetup = {
    ensurePersonasGenerated: vi.fn().mockResolvedValue(undefined),
    createInitialAgentMemories: vi.fn(),
    getCurrentPhase: vi.fn().mockReturnValue({
      type: 'Init' as GamePhaseType,
      runStep: mockInitPhaseRunStepFactory,
      transition: mockInitPhaseTransitionFactory,
    }),
    getCurrentSerializableState: vi.fn().mockImplementation(() => ({
      gameId: 'mock-id', phase: 'Day', round: 1, players: {}, livingPlayerIds: [], deadPlayerIds: [],
      conversationLog: [], agentMemories: {}, winCondition: null, humanPlayerId: null,
      pendingHumanAction: null, _phaseResults: {}, phaseStep: 'Start', nextPlayerIndexToAction: 0,
      createdAt: Date.now(), updatedAt: Date.now(), themeKey: 'default', language: 'en',
    }as SerializableGameState)),
    advanceToPhase: vi.fn(),
    logEvent: vi.fn(),
    markRolesAssigned: vi.fn(),
    markPersonasGenerated: vi.fn(),
    isRolesAssigned: vi.fn().mockReturnValue(false),
    isPersonasGenerated: vi.fn().mockReturnValue(false),
    isInitialMemoriesCreated: vi.fn().mockReturnValue(false),
    _initPhaseRunStep: mockInitPhaseRunStepFactory,
    _initPhaseTransition: mockInitPhaseTransitionFactory,
  };

  return {
    ...originalModule, // Spread original module to keep other exports if any
    Game: {
      // Mock static createNewGame to return an object with our mocked instance methods
      createNewGame: vi.fn().mockReturnValue(gameInstanceMockObject),
      // Mock static loadFromState (though not used by startGameAction, good for consistency)
      loadFromState: vi.fn().mockReturnValue(gameInstanceMockObject),
    },
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
  let mockStaticLoadFromStateSetup: Mock;
  let gameInstanceInternalMocks: any; // To access nested mocks
  let gameInstance: ReturnType<typeof mockStaticLoadFromStateSetup>; // Declare gameInstance here

  beforeEach(async () => {
    vi.clearAllMocks();

    const GameMockModule = await import('@/lib/engine/core/Game');
    mockStaticLoadFromStateSetup = GameMockModule.Game.loadFromState as Mock;
    
    // Reset the methods on the *instance* that loadFromState returns
    gameInstance = mockStaticLoadFromStateSetup(); // Assign gameInstance here
    gameInstanceInternalMocks = gameInstance._mocks; // Access nested mocks

    // Clear all method mocks on the instance
    for (const mockFn of Object.values(gameInstance)) {
        if (typeof mockFn === 'function' && vi.isMockFunction(mockFn)) {
            mockFn.mockClear();
        }
    }
    // Reset nested mocks
    if (gameInstanceInternalMocks) {
        gameInstanceInternalMocks.mockInitPhaseRunStep.mockClear().mockResolvedValue(undefined);
        gameInstanceInternalMocks.mockInitPhaseTransition.mockClear().mockReturnValue('Day' as GamePhaseType);
    }
    // Re-apply default implementations for getCurrentPhase etc. on the main instance
    let currentPhaseForTest: GamePhaseType = 'Init';
    const initPhaseInstance = { type: 'Init', runStep: gameInstanceInternalMocks?.mockInitPhaseRunStep || vi.fn(), transition: gameInstanceInternalMocks?.mockInitPhaseTransition || vi.fn() };
    const dayPhaseInstance = { type: 'Day', runStep: vi.fn(), transition: vi.fn() };
    
    gameInstance.getCurrentPhase.mockImplementation(() => {
        if (currentPhaseForTest === 'Init') return initPhaseInstance;
        return dayPhaseInstance;
    });
    gameInstance.advanceToPhase.mockImplementation((nextPhase: GamePhaseType) => {
        currentPhaseForTest = nextPhase;
    });
    gameInstance.getCurrentSerializableState.mockImplementation(() => ({
        gameId: 'mock-game-id',
        phase: currentPhaseForTest,
        round: currentPhaseForTest === 'Day' ? 1 : 0,
        players: {}, livingPlayerIds: [], deadPlayerIds: [], conversationLog: [],
        agentMemories: {}, winCondition: null, humanPlayerId: null, pendingHumanAction: null,
        _phaseResults: {}, phaseStep: 'Start', nextPlayerIndexToAction: 0,
        createdAt: Date.now(), updatedAt: Date.now(), themeKey: 'StandardWerewolf', language: 'en',
    }));
    gameInstance.isRolesAssigned.mockReturnValue(false);
    gameInstance.isPersonasGenerated.mockReturnValue(false);
    gameInstance.isInitialMemoriesCreated.mockReturnValue(false);


    vi.mocked(saveGameData).mockClear();
    vi.mocked(filterGameStateForClient).mockClear();
    const cryptoMock = (await import('node:crypto')).default; 
    vi.mocked(cryptoMock.randomUUID).mockClear();
  });

  describe('startGameAction', () => {
    const mockGameId = '123e4567-e89b-12d3-a456-426614174000';
    const mockTimestamp = 1678886400000;
    const mockMafiaConfig: AgentConfig = { agentType: 'LLM', modelName: 'gpt-4', providerValue: 'openai' };
    const mockTownConfig: AgentConfig = { agentType: 'LLM', modelName: 'claude-3', providerValue: 'anthropic' };

    // Construct setup data using the `players` array structure
    const baseSetupData: StartGameSetupData = {
      themeKey: 'StandardWerewolf',
      language: 'en',
      players: [
        // Define 5 players for the base case
        { name: 'AI Player 1', rolePreference: RoleName.Mafia, isHuman: false, imageUrl: null, agentConfig: mockMafiaConfig },
        { name: 'AI Player 2', rolePreference: RoleName.Villager, isHuman: false, imageUrl: null, agentConfig: mockTownConfig },
        { name: 'AI Player 3', rolePreference: RoleName.Seer, isHuman: false, imageUrl: null, agentConfig: mockTownConfig },
        { name: 'AI Player 4', rolePreference: RoleName.Villager, isHuman: false, imageUrl: null, agentConfig: mockTownConfig },
        { name: 'AI Player 5', rolePreference: RoleName.Villager, isHuman: false, imageUrl: null, agentConfig: mockTownConfig },
      ],
    };

    // Mock roles returned by assignRoles (assuming it now takes the setup data)
    // Keep the mock roles as before for now
    const mockAssignedRoles = [
      mockWerewolfRole,
      mockVillagerRole,
      mockSeerRole,
      mockVillagerRole,
      mockVillagerRole,
    ];

     // Define a more complete mock state based on setup.actions logic
     // ... mockInitialSerializableState (ensure isHuman is present)
     const mockInitialSerializableState: SerializableGameState = {
        gameId: mockGameId,
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
        themeKey: baseSetupData.themeKey,
        language: baseSetupData.language,
        round: 0,
        phase: 'Init',
        players: {
            'player-1-mafia': { id: 'player-1-mafia', name: 'AI Player 1', status: PlayerStatus.Alive, roleName: RoleName.Mafia, allegiance: 'Mafia', agentConfig: mockMafiaConfig, persona: { name: 'AI Player 1', backstory: '', personalityTraits: [] }, isHuman: false },
            'player-2-villager': { id: 'player-2-villager', name: 'AI Player 2', status: PlayerStatus.Alive, roleName: RoleName.Villager, allegiance: 'Town', agentConfig: mockTownConfig, persona: { name: 'AI Player 2', backstory: '', personalityTraits: [] }, isHuman: false },
            'player-3-seer': { id: 'player-3-seer', name: 'AI Player 3', status: PlayerStatus.Alive, roleName: RoleName.Seer, allegiance: 'Town', agentConfig: mockTownConfig, persona: { name: 'AI Player 3', backstory: '', personalityTraits: [] }, isHuman: false },
            'player-4-villager': { id: 'player-4-villager', name: 'AI Player 4', status: PlayerStatus.Alive, roleName: RoleName.Villager, allegiance: 'Town', agentConfig: mockTownConfig, persona: { name: 'AI Player 4', backstory: '', personalityTraits: [] }, isHuman: false },
            'player-5-villager': { id: 'player-5-villager', name: 'AI Player 5', status: PlayerStatus.Alive, roleName: RoleName.Villager, allegiance: 'Town', agentConfig: mockTownConfig, persona: { name: 'AI Player 5', backstory: '', personalityTraits: [] }, isHuman: false },
        },
        livingPlayerIds: ['player-1-mafia', 'player-2-villager', 'player-3-seer', 'player-4-villager', 'player-5-villager'],
        deadPlayerIds: [],
        conversationLog: [],
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
        phaseStep: 'Start',
        nextPlayerIndexToAction: 0,
    };
    
    // ... mockStateAfterPersonaGen (ensure isHuman is present)
    const mockStateAfterPersonaGen: SerializableGameState = {
        // ... (copy structure, ensure isHuman is present in players)
        gameId: mockGameId,
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp + 1000,
        themeKey: baseSetupData.themeKey,
        language: baseSetupData.language,
        round: 0,
        phase: 'Init', // Still Init after persona gen
        players: {
             'player-1-mafia': { id: 'player-1-mafia', name: 'Willy Wolf', status: PlayerStatus.Alive, roleName: RoleName.Mafia, allegiance: 'Mafia', agentConfig: mockMafiaConfig, persona: { name: 'Willy Wolf', backstory: 'Awooo', personalityTraits: ['Hairy'] }, isHuman: false },
            'player-2-villager': { id: 'player-2-villager', name: 'Vince Villager', status: PlayerStatus.Alive, roleName: RoleName.Villager, allegiance: 'Town', agentConfig: mockTownConfig, persona: { name: 'Vince Villager', backstory: 'Just a villager', personalityTraits: ['Simple'] }, isHuman: false },
            'player-3-seer': { id: 'player-3-seer', name: 'Sally Seer', status: PlayerStatus.Alive, roleName: RoleName.Seer, allegiance: 'Town', agentConfig: mockTownConfig, persona: { name: 'Sally Seer', backstory: 'Sees things', personalityTraits: ['Observant'] }, isHuman: false },
            'player-4-villager': { id: 'player-4-villager', name: 'Vinny Villager 2', status: PlayerStatus.Alive, roleName: RoleName.Villager, allegiance: 'Town', agentConfig: mockTownConfig, persona: { name: 'Vinny Villager 2', backstory: 'Another villager', personalityTraits: ['Plain'] }, isHuman: false },
            'player-5-villager': { id: 'player-5-villager', name: 'Vicky Villager 3', status: PlayerStatus.Alive, roleName: RoleName.Villager, allegiance: 'Town', agentConfig: mockTownConfig, persona: { name: 'Vicky Villager 3', backstory: 'Yet another villager', personalityTraits: ['Quiet'] }, isHuman: false },
        },
        livingPlayerIds: mockInitialSerializableState.livingPlayerIds,
        deadPlayerIds: [],
        conversationLog: [],
        agentMemories: mockInitialSerializableState.agentMemories,
        winCondition: null,
        humanPlayerId: null,
        pendingHumanAction: null,
        _phaseResults: {},
        phaseStep: 'Start',
        nextPlayerIndexToAction: 0,
    };
    
    // ... mockStateAfterInitPhase
    const mockStateAfterInitPhase: SerializableGameState = {
        // ... (copy structure)
         ...mockStateAfterPersonaGen,
        round: 1,
        phase: 'Night',
        phaseStep: 'Start',
        nextPlayerIndexToAction: 0,
    };

    const mockFilteredState: FilteredGameState = {
        id: mockGameId,
        round: 1,
        phase: 'Night',
        players: { /* filtered player data */ }, // Filtered data is opaque here
        livingPlayerIds: mockStateAfterInitPhase.livingPlayerIds,
        humanPlayerId: null,
        log: [],
        pendingHumanAction: null,
        winCondition: null,
        themeKey: baseSetupData.themeKey,
        language: baseSetupData.language,
         title: undefined, 
         description: undefined, 
         createdAt: new Date(mockTimestamp).toISOString(), 
         lastUpdatedAt: new Date(mockTimestamp).toISOString(), 
         winner: null, 
         deadPlayerIds: [], 
    };

    it('should successfully create and initialize a game', async () => {
      // ... (mocks: crypto, time, assignRoles)
      const cryptoMock = (await import('node:crypto')).default;
      vi.mocked(cryptoMock.randomUUID).mockReturnValue(mockGameId);
      vi.setSystemTime(mockTimestamp);
      // Mock assignRoles to return roles based on the *number* of players
      vi.mocked(assignRoles).mockReturnValue(mockAssignedRoles.slice(0, baseSetupData.players.length));

      // Setup mocks for the game instance methods
      mockStaticLoadFromStateSetup.mockReturnValue(mockStateAfterPersonaGen);
      vi.mocked(saveGameData).mockResolvedValue(undefined);
      vi.mocked(filterGameStateForClient).mockReturnValue(mockFilteredState);

      const result = await startGameAction(baseSetupData);

      expect(vi.mocked(cryptoMock.randomUUID)).toHaveBeenCalledTimes(1);
      // Check assignRoles is called with the correct player count
      expect(assignRoles).toHaveBeenCalledWith(baseSetupData.players.length);

      // Check the state passed to the static loadFromState method
      expect(mockStaticLoadFromStateSetup).toHaveBeenCalledWith(expect.objectContaining({
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
      expect(gameInstance.isRolesAssigned).toHaveBeenCalled();
      expect(gameInstance.markRolesAssigned).toHaveBeenCalled();
      expect(gameInstance.isPersonasGenerated).toHaveBeenCalled();
      expect(gameInstance.ensurePersonasGenerated).toHaveBeenCalled();
      expect(gameInstance.markPersonasGenerated).toHaveBeenCalled();
      expect(gameInstance.isInitialMemoriesCreated).toHaveBeenCalled();
      expect(gameInstance.createInitialAgentMemories).toHaveBeenCalled();
      expect(gameInstance.getCurrentPhase).toHaveBeenCalled(); // Called by the action to run initPhase.runStep
      expect(gameInstanceInternalMocks.mockInitPhaseRunStep).toHaveBeenCalledTimes(1);
      expect(gameInstanceInternalMocks.mockInitPhaseTransition).toHaveBeenCalledTimes(1);
      expect(gameInstance.advanceToPhase).toHaveBeenCalledWith('Day');

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
            themeKey: 'StandardWerewolf',
            language: 'en',
            players: [
                 { name: 'Human Dave', rolePreference: RoleName.Villager, isHuman: true, imageUrl: null, agentConfig: { agentType: 'Human' } },
                 { name: 'AI Player 2', rolePreference: RoleName.Mafia, isHuman: false, imageUrl: null, agentConfig: mockMafiaConfig },
                 { name: 'AI Player 3', rolePreference: RoleName.Villager, isHuman: false, imageUrl: null, agentConfig: mockTownConfig },
            ],
        };
        // Ensure human is assigned the correct role instance (index 0)
        const humanMockAssignedRoles = [mockVillagerRole, mockWerewolfRole, mockVillagerRole];
        // Expected ID for human player (constructed based on index 0, role Villager)
        const humanPlayerId = 'player-1-villager-human-dave'; // Example ID construction

        const cryptoMock = (await import('node:crypto')).default;
        vi.mocked(cryptoMock.randomUUID).mockReturnValue(mockGameId);
        vi.setSystemTime(mockTimestamp);
        // Mock assignRoles based on the number of players in humanSetupData
        vi.mocked(assignRoles).mockReturnValue(humanMockAssignedRoles.slice(0, humanSetupData.players.length));

        // Mock initial state with human player (ensure isHuman is present)
        const mockStateWithHumanInitial: SerializableGameState = {
            gameId: mockGameId,
            createdAt: mockTimestamp,
            updatedAt: mockTimestamp,
            themeKey: humanSetupData.themeKey,
            language: humanSetupData.language,
            round: 0,
            phase: 'Init',
            players: {
                [humanPlayerId]: { id: humanPlayerId, name: 'Human Dave', status: PlayerStatus.Alive, roleName: RoleName.Villager, allegiance: 'Town', agentConfig: { agentType: 'Human' }, persona: { name: 'Human Dave', backstory: '', personalityTraits: [] }, isHuman: true },
                'player-2-mafia': { id: 'player-2-mafia', name: 'AI Player 2', status: PlayerStatus.Alive, roleName: RoleName.Mafia, allegiance: 'Mafia', agentConfig: mockMafiaConfig, persona: { name: 'AI Player 2', backstory: '', personalityTraits: [] }, isHuman: false },
                'player-3-villager': { id: 'player-3-villager', name: 'AI Player 3', status: PlayerStatus.Alive, roleName: RoleName.Villager, allegiance: 'Town', agentConfig: mockTownConfig, persona: { name: 'AI Player 3', backstory: '', personalityTraits: [] }, isHuman: false },
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
            phaseStep: 'Start',
            nextPlayerIndexToAction: 0,
        };

        const mockStateAfterPersonaWithHuman: SerializableGameState = {
             // ... (copy structure, ensure isHuman is present)
            ...mockStateWithHumanInitial,
             updatedAt: mockTimestamp + 1000,
            players: {
                ...mockStateWithHumanInitial.players,
                 'player-2-mafia': { ...mockStateWithHumanInitial.players['player-2-mafia'], name: 'Willy Wolf 2', persona: { name: 'Willy Wolf 2', backstory: 'Awooo 2', personalityTraits: ['Furry'] }, isHuman: false },
                 'player-3-villager': { ...mockStateWithHumanInitial.players['player-3-villager'], name: 'Vince Villager 2', persona: { name: 'Vince Villager 2', backstory: 'Just another villager', personalityTraits: ['Normal'] }, isHuman: false },
            },
            phaseStep: 'Start',
            nextPlayerIndexToAction: 0,
        };

         const mockStateAfterInitWithHuman: SerializableGameState = {
            // ... (copy structure)
            ...mockStateAfterPersonaWithHuman,
            round: 1,
            phase: 'Night',
            phaseStep: 'Start',
            nextPlayerIndexToAction: 0,
         };

        const mockFilteredStateWithHuman: FilteredGameState = {
             // ... (copy structure, remove phaseStep/nextPlayerIndexToAction)
             id: mockGameId,
             round: 1,
             phase: 'Night',
             players: { /* Filtered correctly */ },
             livingPlayerIds: mockStateAfterInitWithHuman.livingPlayerIds,
             humanPlayerId: humanPlayerId,
             log: [],
             pendingHumanAction: null,
             winCondition: null,
             themeKey: humanSetupData.themeKey,
             language: humanSetupData.language,
             title: undefined, 
             description: undefined, 
             createdAt: new Date(mockTimestamp).toISOString(), 
             lastUpdatedAt: new Date(mockTimestamp).toISOString(),
             winner: null,
             deadPlayerIds: [],
        };

        // Setup mocks for this specific test case
        mockStaticLoadFromStateSetup.mockReturnValue(mockStateAfterPersonaWithHuman);
        vi.mocked(saveGameData).mockResolvedValue(undefined);
        vi.mocked(filterGameStateForClient).mockReturnValue(mockFilteredStateWithHuman);

        const result = await startGameAction(humanSetupData);

        // Check loadFromState
        expect(mockStaticLoadFromStateSetup).toHaveBeenCalledWith(expect.objectContaining({
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
        // Check saveGameData
        expect(saveGameData).toHaveBeenCalledWith(mockGameId, expect.objectContaining({
             humanPlayerId: humanPlayerId,
             phase: 'Night',
             round: 1,
             players: mockStateAfterInitWithHuman.players,
        }));
        // Check filterGameStateForClient
        expect(filterGameStateForClient).toHaveBeenCalledWith(expect.objectContaining({
            humanPlayerId: humanPlayerId,
            phase: 'Night',
            round: 1,
            players: mockStateAfterInitWithHuman.players,
        }));
        expect(result).toEqual({ gameId: mockGameId, initialState: mockFilteredStateWithHuman });
    });

    it('should return an error if player count is less than 3', async () => {
      // Adapt setup data to use the players array
      const invalidSetupData = { ...baseSetupData, players: baseSetupData.players.slice(0, 2) }; 
      const result = await startGameAction(invalidSetupData);
      expect(result).toEqual({ error: 'Minimum 3 players required.' });
      expect(saveGameData).not.toHaveBeenCalled();
      expect(mockStaticLoadFromStateSetup).not.toHaveBeenCalled(); 
    });

    it('should return an error if themeKey is invalid', async () => {
      const invalidSetupData = { ...baseSetupData, themeKey: 'InvalidTheme' };
      // No need to mock/unmock Themes as it's checked against an imported object
      const result = await startGameAction(invalidSetupData);
      expect(result).toEqual({ error: 'Invalid theme key: InvalidTheme' });
      expect(saveGameData).not.toHaveBeenCalled();
      expect(mockStaticLoadFromStateSetup).not.toHaveBeenCalled();
    });

    it('should return an error if saveGameData fails', async () => {
        const cryptoMock = (await import('node:crypto')).default;
        vi.mocked(cryptoMock.randomUUID).mockReturnValue(mockGameId);
        vi.setSystemTime(mockTimestamp);
        vi.mocked(assignRoles).mockReturnValue(mockAssignedRoles);

        mockStaticLoadFromStateSetup.mockReturnValue(mockStateAfterPersonaGen);
        const saveError = new Error('Database connection failed');
        vi.mocked(saveGameData).mockRejectedValue(saveError);

        const result = await startGameAction(baseSetupData);

        expect(mockStaticLoadFromStateSetup).toHaveBeenCalled(); // Load should still happen
        expect(gameInstanceInternalMocks.mockInitPhaseRunStep).toHaveBeenCalled();
        expect(gameInstanceInternalMocks.mockInitPhaseTransition).toHaveBeenCalled();
        expect(saveGameData).toHaveBeenCalled(); // Attempt to save
        expect(result).toEqual({ error: 'Database connection failed' });
        expect(filterGameStateForClient).not.toHaveBeenCalled();
    });

     it('should return an error if ensurePersonasGenerated (via InitPhase.runStep) fails', async () => {
        const cryptoMock = (await import('node:crypto')).default;
        vi.mocked(cryptoMock.randomUUID).mockReturnValue(mockGameId);
        vi.setSystemTime(mockTimestamp);
        // vi.mocked(assignRoles).mockReturnValue(mockAssignedRoles); // No longer called
        const personaError = new Error('Persona generation service unavailable');

        const gameInstance = mockStaticLoadFromStateSetup();
        // Mock the method on the *instance* returned by loadFromState to throw
        gameInstanceInternalMocks.mockInitPhaseRunStep.mockRejectedValue(personaError);

        const result = await startGameAction(baseSetupData);

        expect(mockStaticLoadFromStateSetup).toHaveBeenCalled();
        expect(gameInstanceInternalMocks.mockInitPhaseRunStep).toHaveBeenCalled();
        expect(result).toEqual({ error: 'Persona generation service unavailable' });
        expect(gameInstanceInternalMocks.mockInitPhaseTransition).not.toHaveBeenCalled();
        expect(saveGameData).not.toHaveBeenCalled();
        expect(filterGameStateForClient).not.toHaveBeenCalled();
    });
  });
}); 