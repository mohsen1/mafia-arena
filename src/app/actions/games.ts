'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { GameService } from '@/lib/db/game.service';
import { revalidatePath } from 'next/cache';

export interface GameListItem {
  id: string;
  title: string;
  status: 'active' | 'completed';
  createdAt: Date;
  updatedAt: Date;
  themeKey: string;
  round: number;
  phase: string;
  language: string;
  winCondition?: object | null;
  playerCount: number;
}

/**
 * Fetches all games for the current user
 */
export async function getUserGamesAction(): Promise<GameListItem[]> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error('Authentication required');
  }

  try {
    const games = await GameService.listUserGames(session.user.id);

    return games.map((game) => {
      const gameState = game.gameState as Record<string, unknown>;
      const playerCount =
        gameState && typeof gameState === 'object' && 'players' in gameState
          ? Object.keys((gameState.players as Record<string, unknown>) || {})
              .length
          : 0;

      return {
        id: game.id,
        title: game.title || `Game ${game.id.slice(0, 8)}`,
        status: game.status as 'active' | 'completed',
        createdAt: game.createdAt,
        updatedAt: game.updatedAt,
        themeKey: game.themeKey,
        round: game.round,
        phase: game.phase,
        language: game.language,
        winCondition: game.winCondition ? JSON.parse(game.winCondition) : null,
        playerCount,
      };
    });
  } catch (error) {
    console.error('Failed to fetch user games:', error);
    throw new Error('Failed to fetch games');
  }
}

/**
 * Deletes a game (if owned by current user)
 */
export async function deleteGameAction(gameId: string): Promise<void> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error('Authentication required');
  }

  try {
    // Check if user owns the game
    const isOwner = await GameService.isGameOwner(gameId, session.user.id);
    if (!isOwner) {
      throw new Error('You can only delete your own games');
    }

    await GameService.deleteGameData(gameId);

    // Revalidate the games page
    revalidatePath('/[lang]/games');
  } catch (error) {
    console.error('Failed to delete game:', error);
    throw new Error('Failed to delete game');
  }
}

/**
 * Gets basic game info for the current user
 */
export async function getGameStatsAction(): Promise<{
  total: number;
  waiting: number;
  inProgress: number;
  completed: number;
}> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return { total: 0, waiting: 0, inProgress: 0, completed: 0 };
  }

  try {
    const games = await getUserGamesAction();

    return {
      total: games.length,
      waiting: games.filter((g) => g.status === 'active' && g.round === 0)
        .length,
      inProgress: games.filter((g) => g.status === 'active' && g.round > 0)
        .length,
      completed: games.filter((g) => g.status === 'completed').length,
    };
  } catch (error) {
    console.error('Failed to get game stats:', error);
    return { total: 0, waiting: 0, inProgress: 0, completed: 0 };
  }
}
