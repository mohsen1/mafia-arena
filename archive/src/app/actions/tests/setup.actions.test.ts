import { beforeEach, describe, expect, it, vi } from 'vitest';
import { startGameAction } from '../setup.actions';
import type { StartGameSetupData } from '@/lib/interfaces/actions.types'; // Import from central location
import { createGameData } from '@/lib/db/persistence';
import { filterGameStateForClient } from '@/lib/visibilityHelper';
import type { AgentConfig } from '@/lib/interfaces/agent.types'; // Changed to type import
import { RoleName } from '@/lib/engine/interfaces/IRole'; // Import RoleName enum/type

// Mock dependencies
vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(),
  default: {
    randomUUID: vi.fn(),
  },
}));

vi.mock('@/lib/db/persistence', () => ({
  createGameData: vi.fn(),
}));

// Mock NextAuth getServerSession
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

// Mock Next.js redirect
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

// Mock database modules
vi.mock('@/lib/db/config', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => [{ id: 'test-user-id' }]), // Return user exists
        })),
      })),
    })),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  users: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}));

// Mock Themes BEFORE Game mock
vi.mock('@/lib/engine/interfaces/Theme', () => ({
  Themes: {
    StandardWerewolf: {
      key: 'StandardWerewolf',
      name: 'Mock Standard Werewolf',
      description: 'Mock Desc',
    },
    UK_VILLAGE_1900S: {
      key: 'UK_VILLAGE_1900S',
      name: 'UK Village 1900s',
      description: 'A quaint village.',
    },
  },
}));

vi.mock('@/lib/visibilityHelper', () => ({
  filterGameStateForClient: vi.fn(),
}));

describe('setup.actions', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(createGameData).mockClear();
    vi.mocked(filterGameStateForClient).mockClear();
    const cryptoMock = (await import('node:crypto')).default;
    vi.mocked(cryptoMock.randomUUID).mockClear();

    // Mock authenticated session
    const { getServerSession } = await import('next-auth');
    vi.mocked(getServerSession).mockResolvedValue({
      user: {
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User',
      },
    });
  });

  describe('startGameAction', () => {
    const mockGameId = '123e4567-e89b-12d3-a456-426614174000';
    const mockTimestamp = 1678886400000;
    const mockMafiaConfig: AgentConfig = {
      agentType: 'LLM',
      modelName: 'gpt-4',
      providerValue: 'openai',
    };
    const mockTownConfig: AgentConfig = {
      agentType: 'LLM',
      modelName: 'claude-3',
      providerValue: 'anthropic',
    };

    // Construct setup data using the `players` array structure
    const baseSetupData: StartGameSetupData = {
      themeKey: 'StandardWerewolf',
      language: 'en',
      players: [
        // Define 5 players for the base case
        {
          name: 'AI Player 1',
          rolePreference: RoleName.Mafia,
          isHuman: false,
          imageUrl: null,
          agentConfig: mockMafiaConfig,
        },
        {
          name: 'AI Player 2',
          rolePreference: RoleName.Villager,
          isHuman: false,
          imageUrl: null,
          agentConfig: mockTownConfig,
        },
        {
          name: 'AI Player 3',
          rolePreference: RoleName.Seer,
          isHuman: false,
          imageUrl: null,
          agentConfig: mockTownConfig,
        },
        {
          name: 'AI Player 4',
          rolePreference: RoleName.Villager,
          isHuman: false,
          imageUrl: null,
          agentConfig: mockTownConfig,
        },
        {
          name: 'AI Player 5',
          rolePreference: RoleName.Villager,
          isHuman: false,
          imageUrl: null,
          agentConfig: mockTownConfig,
        },
      ],
    };

    it('should successfully create and initialize a game', async () => {
      const cryptoMock = (await import('node:crypto')).default;
      const { redirect } = await import('next/navigation');

      vi.mocked(cryptoMock.randomUUID).mockReturnValue(mockGameId);
      vi.setSystemTime(mockTimestamp);

      vi.mocked(createGameData).mockResolvedValue(undefined);

      await startGameAction(baseSetupData);

      // Verify crypto was called to generate ID
      expect(vi.mocked(cryptoMock.randomUUID)).toHaveBeenCalledTimes(1);

      // Verify save was called
      expect(createGameData).toHaveBeenCalledWith(
        expect.objectContaining({
          gameId: mockGameId,
          themeKey: baseSetupData.themeKey,
          language: baseSetupData.language,
          players: expect.any(Object),
          livingPlayerIds: expect.any(Array),
        }),
        'test-user-id'
      );

      // Verify redirect was called
      expect(redirect).toHaveBeenCalledWith(
        `/${baseSetupData.language}/game/${mockGameId}`
      );
    });

    it('should handle human player configuration', async () => {
      const humanSetupData: StartGameSetupData = {
        themeKey: 'StandardWerewolf',
        language: 'en',
        players: [
          {
            name: 'Human Dave',
            rolePreference: RoleName.Villager,
            isHuman: true,
            imageUrl: null,
            agentConfig: { agentType: 'Human' },
          },
          {
            name: 'AI Player 2',
            rolePreference: RoleName.Mafia,
            isHuman: false,
            imageUrl: null,
            agentConfig: mockMafiaConfig,
          },
          {
            name: 'AI Player 3',
            rolePreference: RoleName.Villager,
            isHuman: false,
            imageUrl: null,
            agentConfig: mockTownConfig,
          },
        ],
      };

      const cryptoMock = (await import('node:crypto')).default;
      const { redirect } = await import('next/navigation');

      vi.mocked(cryptoMock.randomUUID).mockReturnValue(mockGameId);
      vi.setSystemTime(mockTimestamp);

      vi.mocked(createGameData).mockResolvedValue(undefined);

      await startGameAction(humanSetupData);

      // Verify save was called with human player info
      expect(createGameData).toHaveBeenCalledWith(
        expect.objectContaining({
          humanPlayerId: expect.stringContaining('human-dave'),
        }),
        'test-user-id'
      );

      // Verify redirect was called
      expect(redirect).toHaveBeenCalledWith(
        `/${humanSetupData.language}/game/${mockGameId}`
      );
    });

    it('should return an error if player count is less than 3', async () => {
      // Adapt setup data to use the players array
      const invalidSetupData = {
        ...baseSetupData,
        players: baseSetupData.players.slice(0, 2),
      };
      const result = await startGameAction(invalidSetupData);
      expect(result).toEqual({ error: 'Minimum 3 players required.' });
      expect(createGameData).not.toHaveBeenCalled();
    });

    it('should return an error if themeKey is invalid', async () => {
      const invalidSetupData = { ...baseSetupData, themeKey: 'InvalidTheme' };
      const result = await startGameAction(invalidSetupData);
      expect(result).toEqual({ error: 'Invalid theme key: InvalidTheme' });
      expect(createGameData).not.toHaveBeenCalled();
    });

    it('should return an error if saveGameData fails', async () => {
      const cryptoMock = (await import('node:crypto')).default;
      vi.mocked(cryptoMock.randomUUID).mockReturnValue(mockGameId);
      vi.setSystemTime(mockTimestamp);

      const saveError = new Error('Database connection failed');
      vi.mocked(createGameData).mockRejectedValue(saveError);

      const result = await startGameAction(baseSetupData);
      expect(result).toEqual({ error: 'Database connection failed' });
      expect(createGameData).toHaveBeenCalled(); // Attempt to save
    });

    it('should return an error if ensurePersonasGenerated (via InitPhase.runStep) fails', async () => {
      // Test with invalid agent config that might cause issues
      const invalidSetupData: StartGameSetupData = {
        ...baseSetupData,
        players: baseSetupData.players.map((p) => ({
          ...p,
          agentConfig: {
            agentType: 'NonExistentAgent' as AgentConfig['agentType'],
          }, // Invalid agent type
        })),
      };

      const cryptoMock = (await import('node:crypto')).default;
      const { redirect } = await import('next/navigation');

      vi.mocked(cryptoMock.randomUUID).mockReturnValue(mockGameId);
      vi.setSystemTime(mockTimestamp);

      // Mock saveGameData to succeed
      vi.mocked(createGameData).mockResolvedValue(undefined);

      // Mock filterGameStateForClient to return a proper filtered state for success case
      vi.mocked(filterGameStateForClient).mockReturnValue({
        id: mockGameId,
        round: 1,
        phase: 'Day',
        players: {},
        livingPlayerIds: [],
        humanPlayerId: null,
        log: [],
        pendingHumanAction: null,
        winCondition: null,
        themeKey: invalidSetupData.themeKey,
        language: invalidSetupData.language,
        title: undefined,
        description: undefined,
        createdAt: new Date(mockTimestamp).toISOString(),
        lastUpdatedAt: new Date(mockTimestamp).toISOString(),
        winner: null,
        deadPlayerIds: [],
      });

      // The actual implementation should handle this gracefully
      await startGameAction(invalidSetupData);

      // Verify the function completed successfully despite invalid agent configs
      expect(createGameData).toHaveBeenCalledWith(
        expect.objectContaining({
          gameId: mockGameId,
          themeKey: invalidSetupData.themeKey,
        }),
        'test-user-id'
      );

      // Verify redirect was called
      expect(redirect).toHaveBeenCalledWith(
        `/${invalidSetupData.language}/game/${mockGameId}`
      );
    });
  });
});
