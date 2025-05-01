import { describe, it, expect, vi, beforeEach } from 'vitest';
import { advanceGameStateAction } from '../gameplay.actions';
import { loadGameData, saveGameData } from '@/lib/persistence';
import { filterGameStateForClient } from '@/lib/visibilityHelper';
import type { SerializableGameState } from '@/lib/interfaces/persistence.types';
import type { FilteredGameState, PendingHumanAction } from '@/lib/interfaces/gameState.types';
import type { PendingHumanAction as ActionPendingAction } from '@/lib/interfaces/actions.types';
import type { IGamePhase } from '@/lib/engine/interfaces/IGamePhase';
import { DayPhase } from '@/lib/engine/phases/DayPhase'; // Import concrete phase for mocking transitions

// --- Define mock functions used by vi.mock factories FIRST ---
// REMOVED - Define inside factory
// const mockGetCurrentPhaseType = vi.fn();
// const mockRunStep = vi.fn().mockResolvedValue(undefined); // Renamed from runPhase
// const mockTransition = vi.fn();
// const mockPhaseInstance: IGamePhase = {
//     type: 'Night',
//     runStep: mockRunStep, // Changed from runPhase
//     transition: mockTransition,
// };
// const mockGetCurrentPhase = vi.fn().mockReturnValue(mockPhaseInstance);
// const mockGetPendingHumanAction = vi.fn();
// const mockCheckWinCondition = vi.fn();
// const mockAdvanceToPhase = vi.fn();
// const mockGetCurrentSerializableState = vi.fn();
// const mockLoadFromState = vi.fn().mockReturnValue({
//     getCurrentPhaseType: mockGetCurrentPhaseType,
//     getCurrentPhase: mockGetCurrentPhase, // Maybe remove this if not needed
//     getPendingHumanAction: mockGetPendingHumanAction,
//     checkWinCondition: mockCheckWinCondition,
//     advanceToPhase: mockAdvanceToPhase,
//     getCurrentSerializableState: mockGetCurrentSerializableState,
// });

// --- Mocks ---
vi.mock('@/lib/persistence', () => ({
  loadGameData: vi.fn(),
  saveGameData: vi.fn(),
}));

vi.mock('@/lib/visibilityHelper', () => ({
  filterGameStateForClient: vi.fn(),
}));

// --- Mock Game Class AFTER defining the functions it uses ---
vi.mock('@/lib/engine/core/Game', () => {
  // Define mocks INSIDE the factory
  const mockGetCurrentPhaseType_inner = vi.fn();
  // Phase instance will now be created and managed internally or passed differently
  // No need to mock runStep on Game, it's on the phase instance
  // const mockRunStep_inner = vi.fn().mockResolvedValue(undefined); 
  // const mockTransition_inner = vi.fn();
  // const mockPhaseInstance_inner: IGamePhase = { // This specific mock structure might change
  //     type: 'Night', 
  //     runStep: mockRunStep_inner,
  //     transition: mockTransition_inner,
  // };
  // const mockGetCurrentPhase_inner = vi.fn().mockReturnValue(mockPhaseInstance_inner);
  const mockGetPendingHumanAction_inner = vi.fn();
  const mockCheckWinCondition_inner = vi.fn();
  const mockAdvanceToPhase_inner = vi.fn();
  const mockGetCurrentSerializableState_inner = vi.fn();

  // Mock for the actual phase instance logic
  const mockPhaseRunStep = vi.fn().mockResolvedValue(undefined); // Mock for the phase's runStep
  const mockPhaseTransition = vi.fn(); // Mock for the phase's transition
  const mockPhaseInstance = {
      type: 'Night', // Default mock type
      runStep: mockPhaseRunStep,
      transition: mockPhaseTransition
  };
  const mockGetCurrentPhaseInstance_inner = vi.fn().mockReturnValue(mockPhaseInstance);

  const mockLoadFromState_inner = vi.fn().mockImplementation(() => ({
      getCurrentPhaseType: mockGetCurrentPhaseType_inner,
      getCurrentPhaseInstance: mockGetCurrentPhaseInstance_inner, // Use this to get the mock phase
      getPendingHumanAction: mockGetPendingHumanAction_inner,
      checkWinCondition: mockCheckWinCondition_inner,
      advanceToPhase: mockAdvanceToPhase_inner,
      getCurrentSerializableState: mockGetCurrentSerializableState_inner,
  }));

  return {
    Game: class MockGame {
      static loadFromState = mockLoadFromState_inner;
      getCurrentPhaseType = mockGetCurrentPhaseType_inner;
      getCurrentPhaseInstance = mockGetCurrentPhaseInstance_inner; // Use this
      getPendingHumanAction = mockGetPendingHumanAction_inner;
      checkWinCondition = mockCheckWinCondition_inner;
      advanceToPhase = mockAdvanceToPhase_inner;
      getCurrentSerializableState = mockGetCurrentSerializableState_inner;
    }
  };
});

// Mock Concrete Phase constructors if needed by transition logic
// Keep these mocks as transition might still return phase types
vi.mock('@/lib/engine/phases/DayPhase', () => ({ DayPhase: vi.fn(() => ({ type: 'Day' })) }));
vi.mock('@/lib/engine/phases/NightPhase', () => ({ NightPhase: vi.fn(() => ({ type: 'Night' })) }));
vi.mock('@/lib/engine/phases/GameOverPhase', () => ({ GameOverPhase: vi.fn((winner) => ({ type: 'GameOver', winner })) }));


describe('gameplay.actions', () => {
    const gameId = 'game-123e4567-e89b-12d3-a456-426614174abc';
    let mockLoadedState: SerializableGameState;
    let mockStateAfterPhase: SerializableGameState;
    let mockFilteredState: FilteredGameState;

    const mockPendingAction: ActionPendingAction = { 
        playerId: 'player-1', 
        allowedActions: ['vote'], 
        prompt: 'Vote now!'
    };
     const mockPendingActionMafia: ActionPendingAction = { 
        playerId: 'player-human', 
        allowedActions: ['mafiaKill'], 
        prompt: 'Choose target'
    };

    let mockLoadFromState: ReturnType<typeof vi.fn>;
    let mockGetCurrentPhaseType: ReturnType<typeof vi.fn>;
    let mockGetCurrentPhaseInstance: ReturnType<typeof vi.fn>; // Changed from getCurrentPhase
    let mockGetPendingHumanAction: ReturnType<typeof vi.fn>;
    let mockCheckWinCondition: ReturnType<typeof vi.fn>;
    let mockAdvanceToPhase: ReturnType<typeof vi.fn>;
    let mockGetCurrentSerializableState: ReturnType<typeof vi.fn>;
    // Access phase mocks directly from the instance
    let mockPhaseInstance: { type: string; runStep: ReturnType<typeof vi.fn>; transition: ReturnType<typeof vi.fn>; };
    let mockRunStep: ReturnType<typeof vi.fn>; // Renamed from mockRunPhase
    let mockTransition: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        const { Game: MockedGame } = await import('@/lib/engine/core/Game');
        mockLoadFromState = MockedGame.loadFromState as ReturnType<typeof vi.fn>;
        
        const mockInstance = mockLoadFromState();
        mockGetCurrentPhaseType = mockInstance.getCurrentPhaseType as ReturnType<typeof vi.fn>;
        mockGetCurrentPhaseInstance = mockInstance.getCurrentPhaseInstance as ReturnType<typeof vi.fn>; // Changed
        mockGetPendingHumanAction = mockInstance.getPendingHumanAction as ReturnType<typeof vi.fn>;
        mockCheckWinCondition = mockInstance.checkWinCondition as ReturnType<typeof vi.fn>;
        mockAdvanceToPhase = mockInstance.advanceToPhase as ReturnType<typeof vi.fn>;
        mockGetCurrentSerializableState = mockInstance.getCurrentSerializableState as ReturnType<typeof vi.fn>;
        
        // Get the mock phase instance and its method mocks
        mockPhaseInstance = mockGetCurrentPhaseInstance();
        mockRunStep = mockPhaseInstance.runStep as ReturnType<typeof vi.fn>; // Changed from runPhase
        mockTransition = mockPhaseInstance.transition as ReturnType<typeof vi.fn>;
        
        vi.clearAllMocks();

        // Reset common mocks
        mockLoadFromState.mockClear().mockImplementation(() => ({
            getCurrentPhaseType: mockGetCurrentPhaseType.mockClear(),
            getCurrentPhaseInstance: mockGetCurrentPhaseInstance.mockClear().mockReturnValue(mockPhaseInstance), // Reset phase instance mock
            getPendingHumanAction: mockGetPendingHumanAction.mockClear().mockReturnValue(null),
            checkWinCondition: mockCheckWinCondition.mockClear().mockReturnValue(null),
            advanceToPhase: mockAdvanceToPhase.mockClear(),
            getCurrentSerializableState: mockGetCurrentSerializableState.mockClear(),
        }));
        // Need to reset the actual mock phase instance's methods too
        mockRunStep.mockClear().mockResolvedValue(undefined);
        mockTransition.mockClear();
        mockGetCurrentPhaseType.mockClear();
        mockGetPendingHumanAction.mockClear().mockReturnValue(null); 
        mockCheckWinCondition.mockClear().mockReturnValue(null); 
        mockAdvanceToPhase.mockClear();
        mockGetCurrentSerializableState.mockClear();

        // Reset other mocks
        vi.mocked(loadGameData).mockClear();
        vi.mocked(saveGameData).mockClear();
        vi.mocked(filterGameStateForClient).mockClear();

        // Basic mock states (customize per test)
        mockLoadedState = {
            gameId: gameId,
            phase: 'Night',
            round: 1,
            // Add missing fields from Fix 3
            phaseStep: 'Start', 
            nextPlayerIndexToAction: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            themeKey: 'TestTheme',
            language: 'en',
            players: {},
            livingPlayerIds: [],
            deadPlayerIds: [],
            conversationLog: [],
            agentMemories: {},
            winCondition: null,
            humanPlayerId: null,
            pendingHumanAction: null as ActionPendingAction | null,
            _phaseResults: {},
        };

        mockStateAfterPhase = {
            ...mockLoadedState,
            phase: 'Day', // Example transition
            round: 2,
            phaseStep: 'Start', // Assuming transition resets step
            nextPlayerIndexToAction: 0, // Assuming transition resets index
            updatedAt: Date.now() + 1000, // Simulate time passing
        };

        mockFilteredState = { 
            id: gameId,
            phase: 'Day',
            round: 2,
            title: undefined,
            description: undefined,
            createdAt: new Date(mockLoadedState.createdAt).toISOString(),
            lastUpdatedAt: new Date(mockStateAfterPhase.updatedAt).toISOString(),
            winner: null,
            language: 'en',
            themeKey: 'TestTheme',
            players: {},
            log: [],
            pendingHumanAction: null as PendingHumanAction | null,
            humanPlayerId: null,
            livingPlayerIds: [],
            deadPlayerIds: [],
            winCondition: null,
        };

        // Default mock implementations
        vi.mocked(loadGameData).mockResolvedValue(mockLoadedState);
        vi.mocked(saveGameData).mockResolvedValue(undefined);
        vi.mocked(filterGameStateForClient).mockReturnValue(mockFilteredState);
        mockGetCurrentPhaseType.mockReturnValue(mockLoadedState.phase); 
        mockGetCurrentSerializableState.mockReturnValue(mockStateAfterPhase); 
        // Transition should return the *type* of the next phase (string literal)
        mockTransition.mockReturnValue('Day'); 

    });

    it('should advance game state normally (run step, transition, save, filter)', async () => {
        const result = await advanceGameStateAction(gameId);

        expect(loadGameData).toHaveBeenCalledWith(gameId);
        expect(mockLoadFromState).toHaveBeenCalledWith(mockLoadedState);
        expect(mockGetCurrentPhaseInstance).toHaveBeenCalledTimes(1); // Check we get the phase instance
        expect(mockRunStep).toHaveBeenCalledWith(expect.any(Object)); // Changed from mockRunPhase
        expect(mockGetPendingHumanAction).toHaveBeenCalledTimes(1);
        expect(mockCheckWinCondition).toHaveBeenCalledTimes(1);
        expect(mockTransition).toHaveBeenCalledWith(expect.any(Object)); // Game instance passed
        // Check that advanceToPhase is called with the *type* returned by transition
        expect(mockAdvanceToPhase).toHaveBeenCalledWith('Day', null); // Winner is null here
        expect(mockGetCurrentSerializableState).toHaveBeenCalledTimes(1); 
        expect(saveGameData).toHaveBeenCalledWith(gameId, mockStateAfterPhase);
        expect(filterGameStateForClient).toHaveBeenCalledWith(mockStateAfterPhase);
        expect(result).toEqual(mockFilteredState);
    });

     it('should return current state if game is already over', async () => {
        const gameOverState: SerializableGameState = { ...mockLoadedState, phase: 'GameOver', winCondition: { outcome: 'Town Wins', message: '' } };
        vi.mocked(loadGameData).mockResolvedValue(gameOverState);
        const filteredGameOverState: FilteredGameState = { ...mockFilteredState, phase: 'GameOver', winner: 'Town Wins', winCondition: 'Town Wins' };
        vi.mocked(filterGameStateForClient).mockReturnValue(filteredGameOverState);

        const result = await advanceGameStateAction(gameId);

        expect(loadGameData).toHaveBeenCalledWith(gameId);
        // No game logic should run
        expect(mockLoadFromState).not.toHaveBeenCalled();
        expect(saveGameData).not.toHaveBeenCalled();
        expect(filterGameStateForClient).toHaveBeenCalledWith(gameOverState);
        expect(result).toEqual(filteredGameOverState);
    });

    it('should return current state if waiting for human action', async () => {
        const pendingState: SerializableGameState = { ...mockLoadedState, pendingHumanAction: mockPendingAction };
        vi.mocked(loadGameData).mockResolvedValue(pendingState);
        const filteredPendingState: FilteredGameState = { ...mockFilteredState, pendingHumanAction: mockPendingAction };
        vi.mocked(filterGameStateForClient).mockReturnValue(filteredPendingState);

        const result = await advanceGameStateAction(gameId);

        expect(loadGameData).toHaveBeenCalledWith(gameId);
        // No game logic should run
        expect(mockLoadFromState).not.toHaveBeenCalled();
        expect(saveGameData).not.toHaveBeenCalled();
        expect(filterGameStateForClient).toHaveBeenCalledWith(pendingState);
        expect(result).toEqual(filteredPendingState);
    });

     it('should save state with pending action if phase run defers', async () => {
        mockGetPendingHumanAction.mockReturnValue(mockPendingActionMafia); 

         mockGetCurrentSerializableState.mockImplementation((pa: ActionPendingAction | null) => ({
             ...mockLoadedState, 
             updatedAt: Date.now() + 500, 
             pendingHumanAction: pa,
         }));

        const filteredDeferredState: FilteredGameState = { ...mockFilteredState, pendingHumanAction: mockPendingActionMafia, phase: mockLoadedState.phase };
        vi.mocked(filterGameStateForClient).mockReturnValue(filteredDeferredState);

        const result = await advanceGameStateAction(gameId);

        expect(loadGameData).toHaveBeenCalledWith(gameId);
        expect(mockLoadFromState).toHaveBeenCalledWith(mockLoadedState);
        expect(mockRunStep).toHaveBeenCalled(); // Changed from mockRunPhase
        expect(mockGetPendingHumanAction).toHaveBeenCalled();
        expect(mockCheckWinCondition).not.toHaveBeenCalled();
        expect(mockTransition).not.toHaveBeenCalled();
        expect(mockAdvanceToPhase).not.toHaveBeenCalled();
        expect(mockGetCurrentSerializableState).toHaveBeenCalledWith(mockPendingActionMafia);
        expect(saveGameData).toHaveBeenCalledWith(gameId, expect.objectContaining({ 
            pendingHumanAction: mockPendingActionMafia, 
            phase: mockLoadedState.phase,
            gameId: gameId, 
        })); 
        expect(filterGameStateForClient).toHaveBeenCalledWith(expect.objectContaining({ 
            pendingHumanAction: mockPendingActionMafia,
            phase: mockLoadedState.phase,
            gameId: gameId,
        })); 
        expect(result).toEqual(filteredDeferredState);
    });

    it('should advance to GameOver phase if win condition met', async () => {
        const winner = 'Mafia'; // Use the expected type
        mockCheckWinCondition.mockReturnValue(winner);

        const gameOverState: SerializableGameState = { ...mockStateAfterPhase, phase: 'GameOver', winCondition: { outcome: winner, message: '' } };
        mockGetCurrentSerializableState.mockReturnValue(gameOverState);

        // Map 'Mafia' to 'Mafia Wins' for filtered state if necessary based on filtering logic
        const filteredGameOverState: FilteredGameState = { ...mockFilteredState, phase: 'GameOver', winner: winner, winCondition: winner };
        vi.mocked(filterGameStateForClient).mockReturnValue(filteredGameOverState);

        const result = await advanceGameStateAction(gameId);

        expect(loadGameData).toHaveBeenCalledWith(gameId);
        expect(mockLoadFromState).toHaveBeenCalledWith(mockLoadedState);
        expect(mockRunStep).toHaveBeenCalled(); // Changed from mockRunPhase
        expect(mockGetPendingHumanAction).toHaveBeenCalled();
        expect(mockCheckWinCondition).toHaveBeenCalled();
        expect(mockTransition).not.toHaveBeenCalled(); 
        // Check advanceToPhase is called with the winner
        expect(mockAdvanceToPhase).toHaveBeenCalledWith('GameOver', winner); 
        expect(mockGetCurrentSerializableState).toHaveBeenCalledTimes(1); 
        expect(saveGameData).toHaveBeenCalledWith(gameId, gameOverState);
        expect(filterGameStateForClient).toHaveBeenCalledWith(gameOverState);
        expect(result).toEqual(filteredGameOverState);
    });

    it('should return error if loadGameData fails', async () => {
        const loadError = new Error('DB Load Failed');
        vi.mocked(loadGameData).mockRejectedValue(loadError);

        const result = await advanceGameStateAction(gameId);

        expect(loadGameData).toHaveBeenCalledWith(gameId);
        expect(mockLoadFromState).not.toHaveBeenCalled();
        expect(saveGameData).not.toHaveBeenCalled();
        expect(filterGameStateForClient).not.toHaveBeenCalled();
        expect(result).toEqual({ error: 'DB Load Failed' });
    });

     it('should return error if saveGameData fails', async () => {
        const saveError = new Error('DB Save Failed');
        vi.mocked(saveGameData).mockRejectedValue(saveError);

        mockGetCurrentSerializableState.mockReturnValue(mockStateAfterPhase);

        const result = await advanceGameStateAction(gameId);

        expect(loadGameData).toHaveBeenCalledWith(gameId);
        expect(mockLoadFromState).toHaveBeenCalledWith(mockLoadedState);
        expect(mockRunStep).toHaveBeenCalled(); // Changed from mockRunPhase
        // Transition and Advance might happen before save
        expect(mockTransition).toHaveBeenCalled();
        expect(mockAdvanceToPhase).toHaveBeenCalledWith('Day', null);
        expect(mockGetCurrentSerializableState).toHaveBeenCalled();
        expect(saveGameData).toHaveBeenCalledWith(gameId, mockStateAfterPhase); 

        expect(filterGameStateForClient).not.toHaveBeenCalled(); 
        expect(result).toEqual({ error: 'DB Save Failed' });
    });

    it('should return error if phase execution (runStep) fails', async () => {
        const phaseError = new Error('Phase Logic Error');
        mockRunStep.mockRejectedValue(phaseError); // Simulate error during phase run step

        const result = await advanceGameStateAction(gameId);

        expect(loadGameData).toHaveBeenCalledWith(gameId);
        expect(mockLoadFromState).toHaveBeenCalledWith(mockLoadedState);
        expect(mockRunStep).toHaveBeenCalled(); // Changed from mockRunPhase
        expect(mockGetPendingHumanAction).not.toHaveBeenCalled(); 
        expect(saveGameData).not.toHaveBeenCalled();
        expect(filterGameStateForClient).not.toHaveBeenCalled();
        expect(result).toEqual({ error: 'Phase Logic Error' });
    });

    it('should handle error if getCurrentPhaseInstance returns undefined', async () => {
        mockGetCurrentPhaseInstance.mockReturnValue(undefined); // Simulate failure to get phase instance

        const result = await advanceGameStateAction(gameId);

        expect(loadGameData).toHaveBeenCalledWith(gameId);
        expect(mockLoadFromState).toHaveBeenCalledWith(mockLoadedState);
        expect(mockGetCurrentPhaseInstance).toHaveBeenCalled(); // Changed
        expect(mockRunStep).not.toHaveBeenCalled(); 
        expect(saveGameData).not.toHaveBeenCalled();
        expect(filterGameStateForClient).not.toHaveBeenCalled();
        expect(result).toEqual({ error: expect.stringContaining('Could not get current phase instance') });
    });

}); 