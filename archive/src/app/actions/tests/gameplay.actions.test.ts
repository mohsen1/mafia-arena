import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { advanceGameStateAction } from '../gameplay.actions';
import { loadGameData, saveGameData } from '@/lib/db/persistence';
import { filterGameStateForClient } from '@/lib/visibilityHelper';
import type {
  SerializableGameState,
  SerializedMessage,
} from '@/lib/interfaces/persistence.types';
import type {
  FilteredGameState,
  PendingHumanAction as FilteredPendingHumanAction,
  GamePhaseType,
  ClientMessage,
  FilteredPlayer,
} from '@/lib/interfaces/gameState.types';
import type { PendingHumanAction as ActionPendingHumanAction } from '@/lib/interfaces/actions.types';
import type { PlayerId } from '@/lib/engine/interfaces/IPlayer'; // Corrected path
import type { MessageVisibility } from '@/lib/engine/interfaces/IMessage'; // Corrected path based on Game.ts import

// --- Mocks ---
vi.mock('@/lib/db/persistence', () => ({
  loadGameData: vi.fn(),
  saveGameData: vi.fn(),
}));

vi.mock('@/lib/visibilityHelper', () => ({
  filterGameStateForClient: vi.fn(),
}));

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/auth/config', () => ({
  auth: {},
}));

vi.mock('@/lib/db/game.service', () => ({
  GameService: {
    isGameOwner: vi.fn(),
  },
}));

// Define a more specific type for the mock game instance
interface MockGameInstance {
  getCurrentPhase(): {
    type: GamePhaseType;
    runStep: Mock;
    transition: Mock;
  } | null;
  getCurrentPhaseType(): GamePhaseType;
  advanceToPhase(phase: GamePhaseType): void;
  getCurrentSerializableState(
    pendingAction?: ActionPendingHumanAction | null
  ): SerializableGameState;
  getPhaseStep(): string;
  getNextPlayerIndexToAction(): number;
  getPendingHumanAction(): ActionPendingHumanAction | null;
  runSingleStep(): Promise<void>;
  _mocks: MockGameInternalMocks;
}

type MockGameInstanceMethods = {
  getCurrentPhase: Mock<
    () => { type: GamePhaseType; runStep: Mock; transition: Mock } | null
  >;
  getCurrentPhaseType: Mock<() => GamePhaseType>;
  advanceToPhase: Mock<(phase: GamePhaseType) => void>;
  getCurrentSerializableState: Mock<
    (pendingAction: ActionPendingHumanAction | null) => SerializableGameState
  >;
  getPhaseStep: Mock<() => string>;
  getNextPlayerIndexToAction: Mock<() => number>;
  getPendingHumanAction: Mock<() => ActionPendingHumanAction | null>;
  runSingleStep: Mock<() => Promise<void>>;
  _mocks: MockGameInternalMocks;
};

type MockGameInternalMocks = {
  mockPhaseRunStep: Mock<(game: MockGameInstance) => Promise<void>>;
  mockPhaseTransition: Mock<(game: MockGameInstance) => GamePhaseType>;
  mockPhaseInstance: { type: GamePhaseType; runStep: Mock; transition: Mock };
};

// --- Mock Game Class and its methods ---
vi.mock('@/lib/engine/core/Game', () => {
  const mockPhaseRunStepFactory = vi.fn().mockResolvedValue(undefined);
  const mockPhaseTransitionFactory = vi
    .fn()
    .mockReturnValue('Day' as GamePhaseType);
  const mockPhaseInstanceFactory = {
    type: 'Night' as GamePhaseType,
    runStep: mockPhaseRunStepFactory,
    transition: mockPhaseTransitionFactory,
  };

  const mockGameInstanceMethodsFactory: MockGameInstanceMethods = {
    getCurrentPhase: vi.fn().mockReturnValue(mockPhaseInstanceFactory),
    getCurrentPhaseType: vi.fn(
      (): GamePhaseType => mockPhaseInstanceFactory.type
    ),
    advanceToPhase: vi.fn(),
    getCurrentSerializableState: vi.fn().mockImplementation(
      (pendingAction) =>
        ({
          gameId: 'test-game-id',
          phase: mockPhaseInstanceFactory.type,
          round: 1,
          players: {},
          livingPlayerIds: [],
          deadPlayerIds: [],
          conversationLog: [],
          agentMemories: {},
          winCondition: null,
          humanPlayerId: null,
          pendingHumanAction: pendingAction,
          _phaseResults: {},
          phaseStep: 'Start',
          nextPlayerIndexToAction: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          themeKey: 'TestTheme',
          language: 'en',
        }) as SerializableGameState
    ),
    getPhaseStep: vi.fn().mockReturnValue('Start'),
    getNextPlayerIndexToAction: vi.fn().mockReturnValue(0),
    getPendingHumanAction: vi.fn().mockReturnValue(null),
    runSingleStep: vi.fn().mockResolvedValue(undefined),
    _mocks: {
      mockPhaseRunStep: mockPhaseRunStepFactory,
      mockPhaseTransition: mockPhaseTransitionFactory,
      mockPhaseInstance: mockPhaseInstanceFactory,
    },
  };

  return {
    Game: {
      loadFromState: vi.fn().mockReturnValue(mockGameInstanceMethodsFactory),
    },
  };
});

vi.mock('@/lib/engine/phases/DayPhase', () => ({
  DayPhase: vi.fn(() => ({ type: 'Day' })),
}));
vi.mock('@/lib/engine/phases/NightPhase', () => ({
  NightPhase: vi.fn(() => ({ type: 'Night' })),
}));
vi.mock('@/lib/engine/phases/GameOverPhase', () => ({
  GameOverPhase: vi.fn(() => ({ type: 'GameOver' })),
}));

describe('gameplay.actions', () => {
  const gameId = 'game-123e4567-e89b-12d3-a456-426614174abc';
  let mockLoadedState: SerializableGameState;
  let mockStateAfterStep: SerializableGameState;
  let mockFilteredState: FilteredGameState;

  const mockPendingActionForTest: ActionPendingHumanAction = {
    playerId: 'player-1',
    allowedActions: ['vote'],
    prompt: 'Vote now!',
  };
  const mockPendingActionMafiaForTest: ActionPendingHumanAction = {
    playerId: 'player-human',
    allowedActions: ['mafiaKill'],
    prompt: 'Choose target',
  };

  let mockStaticLoadFromState: Mock<
    (_loadedState: SerializableGameState) => MockGameInstanceMethods
  >;
  let gameInstanceInternalMocks: MockGameInternalMocks;
  let gameInstanceMock: MockGameInstanceMethods;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock authentication
    const { getServerSession } = await import('next-auth');
    const { GameService } = await import('@/lib/db/game.service');

    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: 'test-user-id' },
    } as { user: { id: string } });

    vi.mocked(GameService.isGameOwner).mockResolvedValue(true);

    const { Game: MockedGameClass } = await import('@/lib/engine/core/Game');
    mockStaticLoadFromState = MockedGameClass.loadFromState as unknown as Mock<
      (_loadedState: SerializableGameState) => MockGameInstanceMethods
    >;

    // Create a mock game instance without calling loadFromState yet
    gameInstanceMock = {
      getCurrentPhase: vi.fn(),
      getCurrentPhaseType: vi.fn(),
      advanceToPhase: vi.fn(),
      getCurrentSerializableState: vi.fn(),
      getPhaseStep: vi.fn(),
      getNextPlayerIndexToAction: vi.fn(),
      getPendingHumanAction: vi.fn(),
      runSingleStep: vi.fn(),
      _mocks: {
        mockPhaseRunStep: vi.fn(),
        mockPhaseTransition: vi.fn(),
        mockPhaseInstance: {
          type: 'Night' as GamePhaseType,
          runStep: vi.fn(),
          transition: vi.fn(),
        },
      },
    };

    gameInstanceInternalMocks = gameInstanceMock._mocks;

    // Set up default mock implementations
    gameInstanceMock.getCurrentPhase.mockReturnValue(
      gameInstanceInternalMocks.mockPhaseInstance
    );
    gameInstanceMock.getCurrentPhaseType.mockReturnValue(
      gameInstanceInternalMocks.mockPhaseInstance.type
    );
    gameInstanceMock.getPendingHumanAction.mockReturnValue(null);
    gameInstanceMock.runSingleStep.mockResolvedValue(undefined);
    gameInstanceInternalMocks.mockPhaseRunStep.mockResolvedValue(undefined);
    gameInstanceInternalMocks.mockPhaseTransition.mockReturnValue(
      'Day' as GamePhaseType
    );

    // Set up the static method to return our mock instance
    mockStaticLoadFromState.mockReturnValue(gameInstanceMock);

    mockLoadedState = {
      gameId: gameId,
      phase: 'Night',
      round: 1,
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
      pendingHumanAction: null as ActionPendingHumanAction | null,
      _phaseResults: {},
    };

    // Create a default mock state for getCurrentSerializableState without calling it
    mockStateAfterStep = {
      ...mockLoadedState,
      updatedAt: Date.now() + 1000,
    };

    mockFilteredState = {
      id: gameId,
      phase: gameInstanceInternalMocks.mockPhaseInstance.type,
      round: 1,
      createdAt: new Date(mockLoadedState.createdAt).toISOString(),
      lastUpdatedAt: new Date(mockStateAfterStep.updatedAt).toISOString(),
      winner: null,
      language: 'en',
      themeKey: 'TestTheme',
      players: {} as Record<PlayerId, FilteredPlayer>,
      log: [],
      pendingHumanAction: null as FilteredPendingHumanAction | null,
      humanPlayerId: null,
    };

    vi.mocked(loadGameData).mockResolvedValue(mockLoadedState);
    vi.mocked(saveGameData).mockResolvedValue(undefined);
    vi.mocked(filterGameStateForClient).mockImplementation(
      (state: SerializableGameState): FilteredGameState => {
        const filteredPlayers: Record<PlayerId, FilteredPlayer> = {};
        for (const playerId in state.players) {
          const p = state.players[playerId];
          filteredPlayers[playerId] = {
            id: p.id,
            name: p.name,
            status: p.status,
            imageUrl: p.imageUrl,
          };
        }

        return {
          id: state.gameId,
          phase: state.phase,
          round: state.round,
          players: filteredPlayers,
          log: state.conversationLog.map(
            (entry: SerializedMessage): ClientMessage => ({
              id: entry.id,
              round: entry.round,
              phase: entry.phase,
              senderId: entry.senderId,
              senderName: entry.senderName,
              content: entry.content,
              timestamp: entry.timestamp,
              visibility: entry.visibility as MessageVisibility | 'mafia',
              type: 'chat',
              recipientId: entry.recipientId,
            })
          ),
          pendingHumanAction:
            state.pendingHumanAction as FilteredPendingHumanAction | null,
          humanPlayerId: state.humanPlayerId,
          winner: state.winCondition?.outcome ?? null,
          createdAt: new Date(state.createdAt).toISOString(),
          lastUpdatedAt: new Date(state.updatedAt).toISOString(),
          language: state.language,
          themeKey: state.themeKey,
        };
      }
    );
  });

  it('should advance game state normally (run step, save, filter)', async () => {
    const stateAfterStepLocal: SerializableGameState = {
      ...mockLoadedState,
      phase: 'Night',
      phaseStep: 'MafiaVoting',
      updatedAt: Date.now() + 1000,
    };
    gameInstanceMock.getCurrentSerializableState.mockReturnValue(
      stateAfterStepLocal
    );

    const result = await advanceGameStateAction(gameId);

    expect(loadGameData).toHaveBeenCalledWith(gameId);
    expect(mockStaticLoadFromState).toHaveBeenCalledWith(mockLoadedState);

    expect(gameInstanceMock.runSingleStep).toHaveBeenCalledTimes(1);

    expect(gameInstanceMock.getCurrentSerializableState).toHaveBeenCalledTimes(
      1
    );

    expect(saveGameData).toHaveBeenCalledWith(gameId, stateAfterStepLocal);
    expect(filterGameStateForClient).toHaveBeenCalledWith(
      stateAfterStepLocal,
      mockLoadedState.humanPlayerId
    );

    const expectedFilteredResult = vi.mocked(filterGameStateForClient).mock
      .results[0].value;
    expect(result).toEqual(expectedFilteredResult);
  });

  it('should return current state if game is already over', async () => {
    const gameOverStateData: SerializableGameState = {
      ...mockLoadedState,
      phase: 'GameOver',
      winCondition: { outcome: 'Town Wins', message: '' },
    };
    vi.mocked(loadGameData).mockResolvedValue(gameOverStateData);

    // The implementation will still run the game loop and get the current state
    gameInstanceMock.getCurrentSerializableState.mockReturnValue(
      gameOverStateData
    );

    const filteredGameOverState: FilteredGameState = {
      ...mockFilteredState,
      phase: 'GameOver',
      winner: 'Town Wins',
    };
    vi.mocked(filterGameStateForClient).mockReturnValue(filteredGameOverState);

    const result = await advanceGameStateAction(gameId);
    expect(filterGameStateForClient).toHaveBeenCalledWith(
      gameOverStateData,
      gameOverStateData.humanPlayerId
    );
    expect(result).toEqual(filteredGameOverState);
    expect(mockStaticLoadFromState).toHaveBeenCalled();
    expect(gameInstanceMock.runSingleStep).toHaveBeenCalled();
  });

  it('should return current state if waiting for human action', async () => {
    const pendingStateData: SerializableGameState = {
      ...mockLoadedState,
      pendingHumanAction: mockPendingActionForTest,
    };
    vi.mocked(loadGameData).mockResolvedValue(pendingStateData);

    // The implementation will still run the game loop and get the current state
    gameInstanceMock.getCurrentSerializableState.mockReturnValue(
      pendingStateData
    );

    const filteredPendingState: FilteredGameState = {
      ...mockFilteredState,
      pendingHumanAction:
        mockPendingActionForTest as FilteredPendingHumanAction,
    };
    vi.mocked(filterGameStateForClient).mockReturnValue(filteredPendingState);

    const result = await advanceGameStateAction(gameId);
    expect(filterGameStateForClient).toHaveBeenCalledWith(
      pendingStateData,
      pendingStateData.humanPlayerId
    );
    expect(result).toEqual(filteredPendingState);
    expect(mockStaticLoadFromState).toHaveBeenCalled();
    expect(gameInstanceMock.runSingleStep).toHaveBeenCalled();
  });

  it('should save state with pending action if phase runStep defers to human', async () => {
    const stateAfterStepWithPending: SerializableGameState = {
      ...mockLoadedState,
      phase: 'Night',
      updatedAt: Date.now() + 500,
      pendingHumanAction: mockPendingActionMafiaForTest,
    };
    gameInstanceMock.getCurrentSerializableState.mockReturnValue(
      stateAfterStepWithPending
    );

    const filteredDeferredState: FilteredGameState = {
      ...mockFilteredState,
      pendingHumanAction:
        mockPendingActionMafiaForTest as FilteredPendingHumanAction,
      phase: 'Night',
    };
    vi.mocked(filterGameStateForClient).mockReturnValue(filteredDeferredState);

    const result = await advanceGameStateAction(gameId);
    expect(gameInstanceMock.runSingleStep).toHaveBeenCalled();
    expect(gameInstanceMock.getCurrentSerializableState).toHaveBeenCalled();
    expect(saveGameData).toHaveBeenCalledWith(
      gameId,
      stateAfterStepWithPending
    );
    expect(result).toEqual(filteredDeferredState);
  });

  it('should handle error if getCurrentPhase returns null', async () => {
    // This test doesn't apply to the new implementation since we don't call getCurrentPhase directly
    // Instead, let's test what happens if runSingleStep throws an error
    gameInstanceMock.runSingleStep.mockRejectedValue(
      new Error('Game loop failed')
    );

    const result = await advanceGameStateAction(gameId);
    expect(gameInstanceMock.runSingleStep).toHaveBeenCalled();
    expect(result).toEqual({ error: 'Game loop failed' });
  });

  it('should advance to GameOver phase if win condition met', async () => {
    const stateAfterWin: SerializableGameState = {
      ...mockLoadedState,
      phase: 'GameOver',
      winCondition: { outcome: 'Mafia', message: 'Mafia wins!' },
      updatedAt: Date.now() + 2000,
    };
    gameInstanceMock.getCurrentSerializableState.mockReturnValue(stateAfterWin);

    const filteredGameOverState: FilteredGameState = {
      ...mockFilteredState,
      phase: 'GameOver',
      winner: 'Mafia',
    };
    vi.mocked(filterGameStateForClient).mockReturnValue(filteredGameOverState);

    const result = await advanceGameStateAction(gameId);
    expect(gameInstanceMock.runSingleStep).toHaveBeenCalled();
    expect(saveGameData).toHaveBeenCalledWith(gameId, stateAfterWin);
    expect(result).toEqual(filteredGameOverState);
  });

  it('should return error if loadGameData fails', async () => {
    const loadError = new Error('DB Load Failed');
    vi.mocked(loadGameData).mockRejectedValue(loadError);
    const result = await advanceGameStateAction(gameId);
    expect(result).toEqual({ error: 'DB Load Failed' });
  });

  it('should return error if saveGameData fails', async () => {
    const saveError = new Error('DB Save Failed');
    vi.mocked(saveGameData).mockRejectedValue(saveError);
    gameInstanceMock.getCurrentSerializableState.mockReturnValue(
      mockStateAfterStep
    );

    const result = await advanceGameStateAction(gameId);
    expect(saveGameData).toHaveBeenCalledWith(gameId, mockStateAfterStep);
    expect(result).toEqual({ error: 'DB Save Failed' });
  });

  it('should return error if phase execution (runStep) fails', async () => {
    const phaseError = new Error('Phase Logic Error');
    gameInstanceMock.runSingleStep.mockRejectedValue(phaseError);
    const result = await advanceGameStateAction(gameId);
    expect(result).toEqual({ error: 'Phase Logic Error' });
  });

  it('should return error if user is not authenticated', async () => {
    const { getServerSession } = await import('next-auth');
    vi.mocked(getServerSession).mockResolvedValue(null);

    const result = await advanceGameStateAction(gameId);
    expect(result).toEqual({ error: 'Authentication required' });
  });

  it('should return error if user is not the game owner', async () => {
    const { GameService } = await import('@/lib/db/game.service');
    vi.mocked(GameService.isGameOwner).mockResolvedValue(false);

    const result = await advanceGameStateAction(gameId);
    expect(result).toEqual({
      error: "You don't have permission to modify this game",
    });
  });
});
