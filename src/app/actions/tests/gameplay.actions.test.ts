import { describe, it, expect, vi, beforeEach } from 'vitest';
import { advanceGameStateAction } from '../gameplay.actions';
import { loadGameData, saveGameData } from '@/lib/persistence';
import { Game } from '@/lib/engine/core/Game';
import { filterGameStateForClient } from '@/lib/visibilityHelper';
import type { SerializableGameState } from '@/lib/interfaces/persistence.types';
import type { FilteredGameState, PendingHumanAction } from '@/lib/interfaces/gameState.types';
import type { PendingHumanAction as ActionPendingAction } from '@/lib/interfaces/actions.types';
import type { IGamePhase, GamePhaseType } from '@/lib/engine/interfaces/IGamePhase';
import { DayPhase } from '@/lib/engine/phases/DayPhase'; // Import concrete phase for mocking transitions
import { NightPhase } from '@/lib/engine/phases/NightPhase';
import { GameOverPhase } from '@/lib/engine/phases/GameOverPhase';

// --- Define mock functions used by vi.mock factories FIRST ---
// REMOVED - Define inside factory
// const mockGetCurrentPhaseType = vi.fn();
// const mockRunPhase = vi.fn().mockResolvedValue(undefined);
// const mockTransition = vi.fn();
// const mockPhaseInstance: IGamePhase = {
//     type: 'Night',
//     runPhase: mockRunPhase,
//     transition: mockTransition,
// };
// const mockGetCurrentPhase = vi.fn().mockReturnValue(mockPhaseInstance);
// const mockGetPendingHumanAction = vi.fn();
// const mockCheckWinCondition = vi.fn();
// const mockAdvanceToPhase = vi.fn();
// const mockGetCurrentSerializableState = vi.fn();
// const mockLoadFromState = vi.fn().mockReturnValue({
//     getCurrentPhaseType: mockGetCurrentPhaseType,
//     getCurrentPhase: mockGetCurrentPhase,
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
  const mockRunPhase_inner = vi.fn().mockResolvedValue(undefined);
  const mockTransition_inner = vi.fn();
  const mockPhaseInstance_inner: IGamePhase = {
      type: 'Night',
      runPhase: mockRunPhase_inner,
      transition: mockTransition_inner,
  };
  const mockGetCurrentPhase_inner = vi.fn().mockReturnValue(mockPhaseInstance_inner);
  const mockGetPendingHumanAction_inner = vi.fn();
  const mockCheckWinCondition_inner = vi.fn();
  const mockAdvanceToPhase_inner = vi.fn();
  const mockGetCurrentSerializableState_inner = vi.fn();
  const mockLoadFromState_inner = vi.fn().mockReturnValue({
      getCurrentPhaseType: mockGetCurrentPhaseType_inner,
      getCurrentPhase: mockGetCurrentPhase_inner,
      getPendingHumanAction: mockGetPendingHumanAction_inner,
      checkWinCondition: mockCheckWinCondition_inner,
      advanceToPhase: mockAdvanceToPhase_inner,
      getCurrentSerializableState: mockGetCurrentSerializableState_inner,
  });

  return {
    Game: class MockGame {
      static loadFromState = mockLoadFromState_inner;
      getCurrentPhaseType = mockGetCurrentPhaseType_inner;
      getCurrentPhase = mockGetCurrentPhase_inner;
      getPendingHumanAction = mockGetPendingHumanAction_inner;
      checkWinCondition = mockCheckWinCondition_inner;
      advanceToPhase = mockAdvanceToPhase_inner;
      getCurrentSerializableState = mockGetCurrentSerializableState_inner;
    }
  };
});

// Mock Concrete Phase constructors if needed by transition logic
vi.mock('@/lib/engine/phases/DayPhase', () => ({ DayPhase: vi.fn(() => ({ type: 'Day' })) }));
vi.mock('@/lib/engine/phases/NightPhase', () => ({ NightPhase: vi.fn(() => ({ type: 'Night' })) }));
vi.mock('@/lib/engine/phases/GameOverPhase', () => ({ GameOverPhase: vi.fn((winner) => ({ type: 'GameOver', winner })) }));


describe('gameplay.actions', () => {
    const gameId = 'game-123e4567-e89b-12d3-a456-426614174abc';
    let mockLoadedState: SerializableGameState;
    let mockStateAfterPhase: SerializableGameState;
    let mockFilteredState: FilteredGameState;

    // Define mocks using the stricter ActionPendingAction type
    const mockPendingAction: ActionPendingAction = { 
        playerId: 'player-1', 
        allowedActions: ['vote'], 
        prompt: 'Vote now!' // prompt is required and string
    };
     const mockPendingActionMafia: ActionPendingAction = { 
        playerId: 'player-human', 
        allowedActions: ['mafiaKill'], 
        prompt: 'Choose target' // prompt is required and string
    };

    // Variables to hold the inner mock functions for resetting/assertion
    let mockLoadFromState: ReturnType<typeof vi.fn>;
    let mockGetCurrentPhaseType: ReturnType<typeof vi.fn>;
    let mockGetCurrentPhase: ReturnType<typeof vi.fn>;
    let mockGetPendingHumanAction: ReturnType<typeof vi.fn>;
    let mockCheckWinCondition: ReturnType<typeof vi.fn>;
    let mockAdvanceToPhase: ReturnType<typeof vi.fn>;
    let mockGetCurrentSerializableState: ReturnType<typeof vi.fn>;
    // Need to access mockPhaseInstance.runPhase and .transition mocks too
    let mockPhaseInstance: IGamePhase;
    let mockRunPhase: ReturnType<typeof vi.fn>;
    let mockTransition: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        // Dynamically import the mocked Game to access its mocked methods
        const { Game: MockedGame } = await import('@/lib/engine/core/Game');
        mockLoadFromState = MockedGame.loadFromState as ReturnType<typeof vi.fn>;
        
        // Get the mock instance returned by loadFromState to access instance methods
        const mockInstance = mockLoadFromState(); // Get the object with mocked instance methods
        mockGetCurrentPhaseType = mockInstance.getCurrentPhaseType as ReturnType<typeof vi.fn>;
        mockGetCurrentPhase = mockInstance.getCurrentPhase as ReturnType<typeof vi.fn>;
        mockGetPendingHumanAction = mockInstance.getPendingHumanAction as ReturnType<typeof vi.fn>;
        mockCheckWinCondition = mockInstance.checkWinCondition as ReturnType<typeof vi.fn>;
        mockAdvanceToPhase = mockInstance.advanceToPhase as ReturnType<typeof vi.fn>;
        mockGetCurrentSerializableState = mockInstance.getCurrentSerializableState as ReturnType<typeof vi.fn>;
        
        // Get the mock phase instance and its method mocks
        mockPhaseInstance = mockGetCurrentPhase();
        mockRunPhase = mockPhaseInstance.runPhase as ReturnType<typeof vi.fn>;
        mockTransition = mockPhaseInstance.transition as ReturnType<typeof vi.fn>;
        
        vi.clearAllMocks();

        // Reset common mocks
        mockLoadFromState.mockClear().mockReturnValue({
            getCurrentPhaseType: mockGetCurrentPhaseType.mockClear(),
            getCurrentPhase: mockGetCurrentPhase.mockClear().mockReturnValue(mockPhaseInstance), // Reset phase instance mock
            getPendingHumanAction: mockGetPendingHumanAction.mockClear().mockReturnValue(null),
            checkWinCondition: mockCheckWinCondition.mockClear().mockReturnValue(null),
            advanceToPhase: mockAdvanceToPhase.mockClear(),
            getCurrentSerializableState: mockGetCurrentSerializableState.mockClear(),
        });
        mockGetCurrentPhase.mockClear().mockReturnValue(mockPhaseInstance); // Also reset the phase instance mock itself
        mockRunPhase.mockClear().mockResolvedValue(undefined);
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
            updatedAt: Date.now() + 1000, // Simulate time passing
        };

        mockFilteredState = { // Structure based on previous fixes
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
        mockTransition.mockReturnValue(new DayPhase()); 

    });

    it('should advance game state normally (run phase, transition, save, filter)', async () => {
        const result = await advanceGameStateAction(gameId);

        expect(loadGameData).toHaveBeenCalledWith(gameId);
        expect(mockLoadFromState).toHaveBeenCalledWith(mockLoadedState);
        expect(mockGetCurrentPhase).toHaveBeenCalledTimes(1);
        expect(mockRunPhase).toHaveBeenCalledWith(expect.any(Object)); // Game instance passed
        expect(mockGetPendingHumanAction).toHaveBeenCalledTimes(1);
        expect(mockCheckWinCondition).toHaveBeenCalledTimes(1);
        expect(mockTransition).toHaveBeenCalledWith(expect.any(Object)); // Game instance passed
        expect(mockAdvanceToPhase).toHaveBeenCalledWith(expect.objectContaining({ type: 'Day' }));
        expect(mockGetCurrentSerializableState).toHaveBeenCalledTimes(1); // Called once after transition
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
        expect(mockLoadFromState).not.toHaveBeenCalled();
        expect(saveGameData).not.toHaveBeenCalled();
        expect(filterGameStateForClient).toHaveBeenCalledWith(pendingState);
        expect(result).toEqual(filteredPendingState);
    });

     it('should save state with pending action if phase run defers', async () => {
        mockGetPendingHumanAction.mockReturnValue(mockPendingActionMafia); // Simulate deferral

        // State *with* the pending action included
         mockGetCurrentSerializableState.mockImplementation((pa: ActionPendingAction | null) => ({
             ...mockLoadedState, 
             updatedAt: Date.now() + 500, 
             pendingHumanAction: pa, // Type should now match
         }));
         const stateWithPendingAction = mockGetCurrentSerializableState(mockPendingActionMafia);

        // Ensure the filtered state mock uses the correct type
        const filteredDeferredState: FilteredGameState = { ...mockFilteredState, pendingHumanAction: mockPendingActionMafia, phase: mockLoadedState.phase };
        vi.mocked(filterGameStateForClient).mockReturnValue(filteredDeferredState);


        const result = await advanceGameStateAction(gameId);

        expect(loadGameData).toHaveBeenCalledWith(gameId);
        expect(mockLoadFromState).toHaveBeenCalledWith(mockLoadedState);
        expect(mockRunPhase).toHaveBeenCalled();
        expect(mockGetPendingHumanAction).toHaveBeenCalled();
        expect(mockCheckWinCondition).not.toHaveBeenCalled();
        expect(mockTransition).not.toHaveBeenCalled();
        expect(mockAdvanceToPhase).not.toHaveBeenCalled();
        expect(mockGetCurrentSerializableState).toHaveBeenCalledWith(mockPendingActionMafia);
        expect(saveGameData).toHaveBeenCalledWith(gameId, expect.objectContaining({ 
            pendingHumanAction: mockPendingActionMafia, 
            phase: mockLoadedState.phase, // Check phase is correct
            gameId: gameId, // Check gameId is correct
        })); 
        expect(filterGameStateForClient).toHaveBeenCalledWith(expect.objectContaining({ 
            pendingHumanAction: mockPendingActionMafia,
            phase: mockLoadedState.phase,
            gameId: gameId,
        })); 
        expect(result).toEqual(filteredDeferredState);
    });

    it('should advance to GameOver phase if win condition met', async () => {
        const winner = 'Mafia Wins';
        mockCheckWinCondition.mockReturnValue(winner); // Simulate win condition met

        const gameOverState: SerializableGameState = { ...mockStateAfterPhase, phase: 'GameOver', winCondition: { outcome: winner, message: '' } };
        // Mock that getCurrentSerializableState returns the GameOver state *after* advanceToPhase is called
        mockGetCurrentSerializableState.mockReturnValue(gameOverState);

        const filteredGameOverState: FilteredGameState = { ...mockFilteredState, phase: 'GameOver', winner: winner, winCondition: winner };
        vi.mocked(filterGameStateForClient).mockReturnValue(filteredGameOverState);


        const result = await advanceGameStateAction(gameId);

        expect(loadGameData).toHaveBeenCalledWith(gameId);
        expect(mockLoadFromState).toHaveBeenCalledWith(mockLoadedState);
        expect(mockRunPhase).toHaveBeenCalled();
        expect(mockGetPendingHumanAction).toHaveBeenCalled();
        expect(mockCheckWinCondition).toHaveBeenCalled();
        expect(mockTransition).not.toHaveBeenCalled(); // Skips normal transition
        expect(mockAdvanceToPhase).toHaveBeenCalledWith(expect.objectContaining({ type: 'GameOver', winner: winner }));
        expect(mockGetCurrentSerializableState).toHaveBeenCalledTimes(1); // Called once after win condition check
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

        // Ensure mocks are set for the successful path until save
        mockGetCurrentSerializableState.mockReturnValue(mockStateAfterPhase);

        const result = await advanceGameStateAction(gameId);

        // Verify sequence up to save
        expect(loadGameData).toHaveBeenCalledWith(gameId);
        expect(mockLoadFromState).toHaveBeenCalledWith(mockLoadedState);
        expect(mockRunPhase).toHaveBeenCalled();
        expect(mockAdvanceToPhase).toHaveBeenCalled();
        expect(mockGetCurrentSerializableState).toHaveBeenCalled();
        expect(saveGameData).toHaveBeenCalledWith(gameId, mockStateAfterPhase); // Save attempted

        // Verify error handling
        expect(filterGameStateForClient).not.toHaveBeenCalled(); // Filter shouldn't happen on save error
        expect(result).toEqual({ error: 'DB Save Failed' });
    });

    it('should return error if phase execution (runPhase) fails', async () => {
        const phaseError = new Error('Phase Logic Error');
        mockRunPhase.mockRejectedValue(phaseError); // Simulate error during phase run

        const result = await advanceGameStateAction(gameId);

        expect(loadGameData).toHaveBeenCalledWith(gameId);
        expect(mockLoadFromState).toHaveBeenCalledWith(mockLoadedState);
        expect(mockRunPhase).toHaveBeenCalled(); // Phase run attempted
        expect(mockGetPendingHumanAction).not.toHaveBeenCalled(); // Should fail before this
        expect(saveGameData).not.toHaveBeenCalled();
        expect(filterGameStateForClient).not.toHaveBeenCalled();
        expect(result).toEqual({ error: 'Phase Logic Error' });
    });

    it('should handle error if getCurrentPhase returns undefined', async () => {
        mockGetCurrentPhase.mockReturnValue(undefined); // Simulate failure to get phase instance

        const result = await advanceGameStateAction(gameId);

        expect(loadGameData).toHaveBeenCalledWith(gameId);
        expect(mockLoadFromState).toHaveBeenCalledWith(mockLoadedState);
        expect(mockGetCurrentPhase).toHaveBeenCalled();
        expect(mockRunPhase).not.toHaveBeenCalled(); // Should fail before running phase
        expect(saveGameData).not.toHaveBeenCalled();
        expect(filterGameStateForClient).not.toHaveBeenCalled();
        // The error message comes from the action itself
        expect(result).toEqual({ error: expect.stringContaining('Could not get current phase instance') });
    });

}); 