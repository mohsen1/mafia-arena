import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Session } from 'next-auth';
import { getCharacterGenerationProgressAction } from '@/app/actions/character-generation.actions';
import { loadGameData } from '@/lib/db/persistence';
import { getServerSession } from 'next-auth';
import { GameService } from '@/lib/db/game.service';
import type { SerializableGameState } from '@/lib/interfaces/persistence.types';

vi.mock('@/lib/db/persistence');
vi.mock('next-auth');
vi.mock('@/lib/db/game.service');
vi.mock('@/lib/engine/interfaces/Theme', () => ({
  Themes: {
    medieval: {
      name: 'Medieval',
      description: 'A medieval themed game',
    },
  },
}));

describe('Character Generation Progress', () => {
  const mockGameId = 'test-game-id';
  const mockUserId = 'test-user-id';

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: mockUserId },
    } as unknown as Session);

    vi.mocked(GameService.isGameOwner).mockResolvedValue(true);
  });

  it('should return empty characters array when no characters are generated', async () => {
    const mockGameState = {
      phase: 'CharacterGeneration',
      themeKey: 'medieval',
      players: {
        player1: {
          id: 'player1',
          name: 'AI Player 1',
          isHuman: false,
          persona: null,
          imageUrl: null,
        },
        player2: {
          id: 'player2',
          name: 'AI Player 2',
          isHuman: false,
          persona: null,
          imageUrl: null,
        },
      },
    };

    vi.mocked(loadGameData).mockResolvedValue(
      mockGameState as unknown as SerializableGameState
    );

    const result = await getCharacterGenerationProgressAction(mockGameId);

    expect(result).not.toHaveProperty('error');
    if (!('error' in result)) {
      expect(result.characters).toEqual([]);
      expect(result.completedCharacters).toBe(0);
      expect(result.totalCharacters).toBe(2);
      expect(result.progress).toBe(0);
    }
  });

  it('should return completed characters with their data', async () => {
    const mockGameState = {
      phase: 'CharacterGeneration',
      themeKey: 'medieval',
      players: {
        player1: {
          id: 'player1',
          name: 'Sir Lancelot',
          isHuman: false,
          persona: {
            name: 'Sir Lancelot',
            backstory: 'A brave knight of the round table.',
          },
          imageUrl: 'https://example.com/lancelot.jpg',
        },
        player2: {
          id: 'player2',
          name: 'AI Player 2',
          isHuman: false,
          persona: {
            backstory: 'A resident of medieval',
          },
          imageUrl: null,
        },
        human: {
          id: 'human',
          name: 'Human Player',
          isHuman: true,
          persona: null,
          imageUrl: null,
        },
      },
    };

    vi.mocked(loadGameData).mockResolvedValue(
      mockGameState as unknown as SerializableGameState
    );

    const result = await getCharacterGenerationProgressAction(mockGameId);

    expect(result).not.toHaveProperty('error');
    if (!('error' in result)) {
      expect(result.characters).toHaveLength(1);
      expect(result.characters![0]).toEqual({
        id: 'player1',
        name: 'Sir Lancelot',
        imageUrl: 'https://example.com/lancelot.jpg',
        backstory: 'A brave knight of the round table.',
      });
      expect(result.completedCharacters).toBe(1);
      expect(result.totalCharacters).toBe(2);
      expect(result.progress).toBe(50);
      expect(result.currentCharacterName).toBe('AI Player 2');
    }
  });

  it('should return all characters when generation is complete', async () => {
    const mockGameState = {
      phase: 'CharacterGeneration',
      themeKey: 'medieval',
      players: {
        player1: {
          id: 'player1',
          name: 'Sir Lancelot',
          isHuman: false,
          persona: {
            name: 'Sir Lancelot',
            backstory: 'A brave knight of the round table.',
          },
          imageUrl: 'https://example.com/lancelot.jpg',
        },
        player2: {
          id: 'player2',
          name: 'Merlin',
          isHuman: false,
          persona: {
            name: 'Merlin',
            backstory: 'A wise wizard with mystical powers.',
          },
          imageUrl: 'https://example.com/merlin.jpg',
        },
        human: {
          id: 'human',
          name: 'Human Player',
          isHuman: true,
          persona: null,
          imageUrl: null,
        },
      },
    };

    vi.mocked(loadGameData).mockResolvedValue(
      mockGameState as unknown as SerializableGameState
    );

    const result = await getCharacterGenerationProgressAction(mockGameId);

    expect(result).not.toHaveProperty('error');
    if (!('error' in result)) {
      expect(result.characters).toHaveLength(2);
      expect(result.characters![0]).toEqual({
        id: 'player1',
        name: 'Sir Lancelot',
        imageUrl: 'https://example.com/lancelot.jpg',
        backstory: 'A brave knight of the round table.',
      });
      expect(result.characters![1]).toEqual({
        id: 'player2',
        name: 'Merlin',
        imageUrl: 'https://example.com/merlin.jpg',
        backstory: 'A wise wizard with mystical powers.',
      });
      expect(result.completedCharacters).toBe(2);
      expect(result.totalCharacters).toBe(2);
      expect(result.progress).toBe(100);
      expect(result.currentStep).toBe('Complete');
    }
  });
});
