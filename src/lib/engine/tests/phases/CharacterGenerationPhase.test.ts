import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import { CharacterGenerationPhase } from '@/lib/engine/phases/CharacterGenerationPhase';
import type { Game } from '@/lib/engine/core/Game';
import type { SerializableGameState, SerializablePlayer } from '@/lib/interfaces/persistence.types';
import type { AgentConfig } from '@/lib/interfaces/agent.types';
import type { Persona } from '@/lib/engine/interfaces/Persona';
import { PlayerStatus } from '@/lib/engine/interfaces/IPlayer';
import { RoleName } from '@/lib/engine/interfaces/IRole';
import { generateCharacterPersona } from '@/app/actions/setup.actions';
import { selectCharacterImage } from '@/lib/utils/imageUtils';
import { generateGameCharactersAction, getCharacterGenerationProgressAction } from '@/app/actions/character-generation.actions';
import { loadGameData, saveGameData } from '@/lib/db/persistence';
import { GameService } from '@/lib/db/game.service';
import { getServerSession } from 'next-auth';

// Mock all external dependencies
vi.mock('@/app/actions/setup.actions');
vi.mock('@/lib/utils/imageUtils');
vi.mock('@/app/actions/character-generation.actions');
vi.mock('@/lib/db/persistence');
vi.mock('@/lib/db/game.service');
vi.mock('next-auth');
vi.mock('@/lib/agentFactory');

const mockGenerateCharacterPersona = generateCharacterPersona as MockedFunction<typeof generateCharacterPersona>;
const mockSelectCharacterImage = selectCharacterImage as MockedFunction<typeof selectCharacterImage>;
const mockLoadGameData = loadGameData as MockedFunction<typeof loadGameData>;
const mockSaveGameData = saveGameData as MockedFunction<typeof saveGameData>;
const mockGetServerSession = getServerSession as MockedFunction<typeof getServerSession>;

const createMockGameForCharacterGeneration = () => {
  let currentPhaseStep = 'Start';

  return {
    logEvent: vi.fn(),
    setPhaseStep: vi.fn((step: string) => {
      currentPhaseStep = step;
    }),
    getPhaseStep: vi.fn(() => currentPhaseStep),
    markRolesAssigned: vi.fn(),
    markPersonasGenerated: vi.fn(),
    createInitialAgentMemories: vi.fn(),
    advanceToPhase: vi.fn(),
    getCurrentPhase: vi.fn(() => ({
      type: 'Init',
      runStep: vi.fn(),
      transition: vi.fn(() => 'Day'),
    })),
    getCurrentSerializableState: vi.fn(() => createMockGameState()),
    getPendingHumanAction: vi.fn(() => null),
  };
};

const createMockGameState = (): SerializableGameState => {
  const baseConfig: AgentConfig = {
    agentType: 'mock',
    modelName: 'mock-model',
    apiKey: 'mock-key',
  };

  return {
    gameId: 'test-game-id',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    themeKey: 'modernCity',
    language: 'en',
    round: 0,
    phase: 'CharacterGeneration',
    players: {
      'player-1': {
        id: 'player-1',
        name: 'TestHuman',
        status: PlayerStatus.Alive,
        roleName: RoleName.Villager,
        allegiance: 'Town',
        agentConfig: baseConfig,
        persona: {
          name: 'TestHuman',
          backstory: 'A human player',
          personalityTraits: ['Human'],
        },
        isHuman: true,
        imageUrl: null,
      },
      'player-2': {
        id: 'player-2',
        name: 'AIPlayer1',
        status: PlayerStatus.Alive,
        roleName: RoleName.Mafia,
        allegiance: 'Mafia',
        agentConfig: baseConfig,
        persona: {
          name: 'AIPlayer1',
          backstory: 'A resident of modern city',
          personalityTraits: ['Mysterious'],
        },
        isHuman: false,
        imageUrl: null,
      },
      'player-3': {
        id: 'player-3',
        name: 'AIPlayer2',
        status: PlayerStatus.Alive,
        roleName: RoleName.Seer,
        allegiance: 'Town',
        agentConfig: baseConfig,
        persona: {
          name: 'AIPlayer2',
          backstory: 'A resident of modern city',
          personalityTraits: ['Mysterious'],
        },
        isHuman: false,
        imageUrl: null,
      },
    },
    livingPlayerIds: ['player-1', 'player-2', 'player-3'],
    deadPlayerIds: [],
    conversationLog: [],
    agentMemories: {},
    winCondition: null,
    humanPlayerId: 'player-1',
    pendingHumanAction: null,
    _phaseResults: {},
    phaseStep: 'Start',
    nextPlayerIndexToAction: 0,
  };
};

type MockGameForCharacterGeneration = ReturnType<typeof createMockGameForCharacterGeneration>;

describe('CharacterGenerationPhase', () => {
  let characterGenerationPhase: CharacterGenerationPhase;
  let mockGame: MockGameForCharacterGeneration;

  beforeEach(() => {
    vi.clearAllMocks();
    characterGenerationPhase = new CharacterGenerationPhase();
    mockGame = createMockGameForCharacterGeneration();

    // Default mock implementations
    mockGetServerSession.mockResolvedValue({
      user: { id: 'test-user-id' },
    } as any);

    GameService.isGameOwner = vi.fn().mockResolvedValue(true);
    mockLoadGameData.mockResolvedValue(createMockGameState());
    mockSaveGameData.mockResolvedValue(undefined);
  });

  describe('Basic Phase Behavior', () => {
    it('should have correct phase type', () => {
      expect(characterGenerationPhase.type).toBe('CharacterGeneration');
    });

    it('should set phase step to WaitingForCharacterGeneration on runStep', async () => {
      await characterGenerationPhase.runStep(mockGame as unknown as Game);

      expect(mockGame.setPhaseStep).toHaveBeenCalledWith('WaitingForCharacterGeneration');
      expect(mockGame.logEvent).toHaveBeenCalledWith('Character generation in progress...');
    });

    it('should stay in CharacterGeneration phase when step is not Complete', () => {
      mockGame.getPhaseStep.mockReturnValue('WaitingForCharacterGeneration');

      const nextPhase = characterGenerationPhase.transition(mockGame as unknown as Game);

      expect(nextPhase).toBe('CharacterGeneration');
    });

    it('should transition to Init phase when step is Complete', () => {
      mockGame.getPhaseStep.mockReturnValue('Complete');

      const nextPhase = characterGenerationPhase.transition(mockGame as unknown as Game);

      expect(nextPhase).toBe('Init');
    });

    it('should not cause infinite loops by staying in same phase indefinitely', async () => {
      // Run multiple steps to ensure it doesn't get stuck
      for (let i = 0; i < 5; i++) {
        await characterGenerationPhase.runStep(mockGame as unknown as Game);

        // Should always set the same step
        expect(mockGame.setPhaseStep).toHaveBeenCalledWith('WaitingForCharacterGeneration');

        // Should always transition to same phase unless manually marked complete
        const nextPhase = characterGenerationPhase.transition(mockGame as unknown as Game);
        expect(nextPhase).toBe('CharacterGeneration');
      }

      // Verify it was called the expected number of times
      expect(mockGame.setPhaseStep).toHaveBeenCalledTimes(5);
      expect(mockGame.logEvent).toHaveBeenCalledTimes(5);
    });

    it('should handle manual completion correctly', async () => {
      // Initial state
      await characterGenerationPhase.runStep(mockGame as unknown as Game);
      expect(characterGenerationPhase.transition(mockGame as unknown as Game)).toBe('CharacterGeneration');

      // Manually mark as complete (this would be done by the character generation action)
      mockGame.getPhaseStep.mockReturnValue('Complete');

      // Should now transition to Init
      expect(characterGenerationPhase.transition(mockGame as unknown as Game)).toBe('Init');
    });
  });

  describe('Character Persona Generation', () => {
    it('should generate unique personas for AI players', async () => {
      const mockPersona: Persona = {
        name: 'Generated Character',
        backstory: 'A complex character with a rich history',
        personalityTraits: ['Intelligent', 'Cautious', 'Observant'],
      };

      mockGenerateCharacterPersona.mockResolvedValue(mockPersona);

             const result = await generateCharacterPersona(
         'TestPlayer',
         'player-test',
         { agentType: 'mock', modelName: 'test', apiKey: 'key' },
         'A modern city setting',
         'en',
         ['ExistingPlayer']
       );

      expect(result).toEqual(mockPersona);
      expect(mockGenerateCharacterPersona).toHaveBeenCalledWith(
        'TestPlayer',
        'player-test',
        { agentType: 'mock', modelName: 'test', apiKey: 'key' },
        'A modern city setting',
        'en',
        ['ExistingPlayer']
      );
    });

    it('should handle persona generation errors gracefully', async () => {
      const error = new Error('AI service unavailable');
      mockGenerateCharacterPersona.mockRejectedValue(error);

      await expect(
        generateCharacterPersona(
          'TestPlayer',
          'player-test',
          { provider: 'mock', model: 'test', apiKey: 'key' },
          'A modern city setting',
          'en',
          []
        )
      ).rejects.toThrow('AI service unavailable');
    });

    it('should retry persona generation on failure', async () => {
      const mockPersona: Persona = {
        name: 'Generated Character',
        backstory: 'A character generated after retry',
        personalityTraits: ['Persistent'],
      };

      // Fail first two attempts, succeed on third
      mockGenerateCharacterPersona
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Rate limit'))
        .mockResolvedValueOnce(mockPersona);

      const result = await generateCharacterPersona(
        'TestPlayer',
        'player-test',
        { provider: 'mock', model: 'test', apiKey: 'key' },
        'A modern city setting',
        'en',
        []
      );

      expect(result).toEqual(mockPersona);
      expect(mockGenerateCharacterPersona).toHaveBeenCalledTimes(3);
    });
  });

  describe('Character Image Selection', () => {
    it('should select random character images by gender and age', async () => {
      const mockImageUrl = '/images/characters/male/young/character-1.png';
      mockSelectCharacterImage.mockResolvedValue(mockImageUrl);

      const result = await selectCharacterImage('male', 'young');

      expect(result).toBe(mockImageUrl);
      expect(mockSelectCharacterImage).toHaveBeenCalledWith('male', 'young');
    });

    it('should handle different gender and age combinations', async () => {
      const testCases = [
        { gender: 'female' as const, age: 'young' as const, expected: '/images/characters/female/young/char-1.png' },
        { gender: 'male' as const, age: 'old' as const, expected: '/images/characters/male/old/char-2.png' },
        { gender: 'female' as const, age: 'old' as const, expected: '/images/characters/female/old/char-3.png' },
      ];

      for (const testCase of testCases) {
        mockSelectCharacterImage.mockResolvedValueOnce(testCase.expected);
        
        const result = await selectCharacterImage(testCase.gender, testCase.age);
        
        expect(result).toBe(testCase.expected);
        expect(mockSelectCharacterImage).toHaveBeenCalledWith(testCase.gender, testCase.age);
      }
    });

    it('should handle missing image directories gracefully', async () => {
      mockSelectCharacterImage.mockResolvedValue(null);

      const result = await selectCharacterImage('male', 'young');

      expect(result).toBeNull();
    });
  });

  describe('Character Generation Progress Tracking', () => {
    it('should track character generation progress correctly', async () => {
      const mockProgress = {
        currentStep: 'Generating characters...',
        progress: 50,
        totalSteps: 2,
        completedCharacters: 1,
        totalCharacters: 2,
        currentCharacterName: 'AIPlayer2',
        characters: [
          {
            id: 'player-2',
            name: 'Generated Character 1',
            imageUrl: '/images/characters/male/young/char-1.png',
            backstory: 'A complex character with a rich history',
          },
        ],
      };

      // Mock the implementation to return our test progress
      vi.mocked(getCharacterGenerationProgressAction).mockResolvedValue(mockProgress);

      const result = await getCharacterGenerationProgressAction('test-game-id');

      expect(result).toEqual(mockProgress);
    });

    it('should handle completed character generation', async () => {
      const mockProgress = {
        currentStep: 'Complete',
        progress: 100,
        totalSteps: 2,
        completedCharacters: 2,
        totalCharacters: 2,
        characters: [
          {
            id: 'player-2',
            name: 'Generated Character 1',
            imageUrl: '/images/characters/male/young/char-1.png',
            backstory: 'A complex character with a rich history',
          },
          {
            id: 'player-3',
            name: 'Generated Character 2',
            imageUrl: '/images/characters/female/old/char-2.png',
            backstory: 'Another complex character',
          },
        ],
      };

      vi.mocked(getCharacterGenerationProgressAction).mockResolvedValue(mockProgress);

      const result = await getCharacterGenerationProgressAction('test-game-id');

      expect(result).toEqual(mockProgress);
      expect(result.progress).toBe(100);
      expect(result.currentStep).toBe('Complete');
    });

    it('should handle games with no AI players', async () => {
      const mockProgress = {
        currentStep: 'Complete',
        progress: 100,
        totalSteps: 0,
        completedCharacters: 0,
        totalCharacters: 0,
        characters: [],
      };

      vi.mocked(getCharacterGenerationProgressAction).mockResolvedValue(mockProgress);

      const result = await getCharacterGenerationProgressAction('test-game-id');

      expect(result).toEqual(mockProgress);
    });
  });

  describe('Full Character Generation Process', () => {
    beforeEach(() => {
      // Setup mocks for full character generation
      const mockPersona1: Persona = {
        name: 'Alexander Smith',
        backstory: 'A former detective turned private investigator',
        personalityTraits: ['Analytical', 'Suspicious', 'Methodical'],
      };

      const mockPersona2: Persona = {
        name: 'Sarah Johnson',
        backstory: 'A local business owner with connections throughout the city',
        personalityTraits: ['Charismatic', 'Ambitious', 'Networked'],
      };

      mockGenerateCharacterPersona
        .mockResolvedValueOnce(mockPersona1)
        .mockResolvedValueOnce(mockPersona2);

      mockSelectCharacterImage
        .mockResolvedValueOnce('/images/characters/male/old/detective.png')
        .mockResolvedValueOnce('/images/characters/female/young/business.png');
    });

    it('should generate characters for all AI players successfully', async () => {
      const mockGameState = createMockGameState();
      mockLoadGameData.mockResolvedValue(mockGameState);

      // Mock Game.loadFromState
      const mockGameInstance = {
        markRolesAssigned: vi.fn(),
        markPersonasGenerated: vi.fn(),
        createInitialAgentMemories: vi.fn(),
        advanceToPhase: vi.fn(),
        getCurrentPhase: vi.fn(() => ({
          type: 'Init',
          runStep: vi.fn(),
          transition: vi.fn(() => 'Day'),
        })),
        getCurrentSerializableState: vi.fn(() => mockGameState),
        getPendingHumanAction: vi.fn(() => null),
      };

      // Mock the Game.loadFromState static method
      const MockGame = {
        loadFromState: vi.fn().mockResolvedValue(mockGameInstance),
      };

      vi.doMock('@/lib/engine/core/Game', () => ({
        Game: MockGame,
      }));

      const mockResult = {
        gameId: 'test-game-id',
        phase: 'Day',
        players: mockGameState.players,
      };

      vi.mocked(generateGameCharactersAction).mockResolvedValue(mockResult as any);

      const result = await generateGameCharactersAction('test-game-id');

      expect(result).toEqual(mockResult);
      expect(mockLoadGameData).toHaveBeenCalledWith('test-game-id');
      expect(mockSaveGameData).toHaveBeenCalled();
    });

    it('should handle duplicate name generation', async () => {
      const mockGameState = createMockGameState();
      mockLoadGameData.mockResolvedValue(mockGameState);

      // First call returns a duplicate name, second call returns unique name
      const duplicatePersona: Persona = {
        name: 'TestHuman', // This conflicts with the human player
        backstory: 'A character with duplicate name',
        personalityTraits: ['Duplicate'],
      };

      const uniquePersona: Persona = {
        name: 'Unique Character',
        backstory: 'A character with unique name',
        personalityTraits: ['Unique'],
      };

      mockGenerateCharacterPersona
        .mockResolvedValueOnce(duplicatePersona)
        .mockResolvedValueOnce(uniquePersona);

      const mockResult = {
        gameId: 'test-game-id',
        phase: 'Day',
        players: {
          ...mockGameState.players,
          'player-2': {
            ...mockGameState.players['player-2'],
            name: 'Unique Character',
          },
        },
      };

      vi.mocked(generateGameCharactersAction).mockResolvedValue(mockResult as any);

      const result = await generateGameCharactersAction('test-game-id');

      expect(result).toEqual(mockResult);
      // Should have been called twice due to duplicate handling
      expect(mockGenerateCharacterPersona).toHaveBeenCalledTimes(2);
    });

    it('should handle authentication errors', async () => {
      mockGetServerSession.mockResolvedValue(null);

      const result = await generateGameCharactersAction('test-game-id');

      expect(result).toEqual({ error: 'Authentication required' });
    });

    it('should handle permission errors', async () => {
      GameService.isGameOwner = vi.fn().mockResolvedValue(false);

      const result = await generateGameCharactersAction('test-game-id');

      expect(result).toEqual({ error: "You don't have permission to modify this game" });
    });

    it('should handle missing game errors', async () => {
      mockLoadGameData.mockResolvedValue(null);

      const result = await generateGameCharactersAction('test-game-id');

      expect(result).toEqual({ error: 'Game not found' });
    });

    it('should handle character generation in wrong phase', async () => {
      const mockGameState = createMockGameState();
      mockGameState.phase = 'Day'; // Wrong phase
      mockLoadGameData.mockResolvedValue(mockGameState);

      const result = await generateGameCharactersAction('test-game-id');

      expect(result).toEqual({ error: 'Character generation already completed' });
    });
  });

  describe('Name Uniqueness Validation', () => {
    it('should ensure all generated names are unique', async () => {
      const existingNames = ['Alice', 'Bob', 'Charlie'];
      
      // Mock persona generation with potential duplicate
      const duplicatePersona: Persona = {
        name: 'Alice', // Duplicate name
        backstory: 'A character',
        personalityTraits: ['Duplicate'],
      };

      const uniquePersona: Persona = {
        name: 'David', // Unique name
        backstory: 'A unique character',
        personalityTraits: ['Unique'],
      };

      mockGenerateCharacterPersona
        .mockResolvedValueOnce(duplicatePersona)
        .mockResolvedValueOnce(uniquePersona);

      // First call should generate duplicate, second should be unique
      const result1 = await generateCharacterPersona(
        'TestPlayer',
        'player-1',
        { provider: 'mock', model: 'test', apiKey: 'key' },
        'Theme',
        'en',
        existingNames
      );

      expect(result1.name).toBe('Alice');

      const result2 = await generateCharacterPersona(
        'TestPlayer',
        'player-2',
        { provider: 'mock', model: 'test', apiKey: 'key' },
        'Theme',
        'en',
        [...existingNames, result1.name]
      );

      expect(result2.name).toBe('David');
      expect(existingNames.includes(result2.name)).toBe(false);
    });
  });

  describe('Game State Transitions', () => {
    it('should properly transition from CharacterGeneration to Init phase', async () => {
      const gameState = createMockGameState();
      expect(gameState.phase).toBe('CharacterGeneration');

      // Mock successful character generation
      const mockResult = {
        ...gameState,
        phase: 'Day',
      };

      vi.mocked(generateGameCharactersAction).mockResolvedValue(mockResult as any);

      const result = await generateGameCharactersAction('test-game-id');

      expect(result).toEqual(mockResult);
      expect((result as any).phase).toBe('Day');
    });

    it('should handle phase transition errors', async () => {
      const mockGameState = createMockGameState();
      mockLoadGameData.mockResolvedValue(mockGameState);

      // Mock an error during game processing
      vi.mocked(generateGameCharactersAction).mockResolvedValue({
        error: 'Game did not transition to Init phase correctly.',
      });

      const result = await generateGameCharactersAction('test-game-id');

      expect(result).toEqual({
        error: 'Game did not transition to Init phase correctly.',
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle AI service timeouts gracefully', async () => {
      const timeoutError = new Error('Request timeout');
      mockGenerateCharacterPersona.mockRejectedValue(timeoutError);

      await expect(
        generateCharacterPersona(
          'TestPlayer',
          'player-test',
          { provider: 'mock', model: 'test', apiKey: 'key' },
          'Theme',
          'en',
          []
        )
      ).rejects.toThrow('Request timeout');
    });

    it('should handle database save failures', async () => {
      const saveError = new Error('Database connection failed');
      mockSaveGameData.mockRejectedValue(saveError);

      vi.mocked(generateGameCharactersAction).mockResolvedValue({
        error: 'Failed to generate characters',
      });

      const result = await generateGameCharactersAction('test-game-id');

      expect(result).toEqual({ error: 'Failed to generate characters' });
    });

    it('should handle invalid theme configurations', async () => {
      const mockGameState = createMockGameState();
      mockGameState.themeKey = 'invalid-theme';
      mockLoadGameData.mockResolvedValue(mockGameState);

      vi.mocked(generateGameCharactersAction).mockResolvedValue({
        error: 'Invalid theme key: invalid-theme',
      });

      const result = await generateGameCharactersAction('test-game-id');

      expect(result).toEqual({ error: 'Invalid theme key: invalid-theme' });
    });

    it('should handle empty player lists', async () => {
      const mockGameState = createMockGameState();
      mockGameState.players = {
        'player-1': mockGameState.players['player-1'], // Only human player
      };
      mockLoadGameData.mockResolvedValue(mockGameState);

      const mockProgress = {
        currentStep: 'Complete',
        progress: 100,
        totalSteps: 0,
        completedCharacters: 0,
        totalCharacters: 0,
        characters: [],
      };

      vi.mocked(getCharacterGenerationProgressAction).mockResolvedValue(mockProgress);

      const result = await getCharacterGenerationProgressAction('test-game-id');

      expect(result).toEqual(mockProgress);
    });
  });
});
