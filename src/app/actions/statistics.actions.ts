'use server';

import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/config';
import { StatisticsService } from '@/lib/db/statistics.service';
import type { UserStatsSummary, GameStatistics } from '@/lib/db/schema';

export async function getUserStatistics(): Promise<{
  success: boolean;
  data?: UserStatsSummary | null;
  error?: string;
}> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { success: false, error: 'Not authenticated' };
    }

    const stats = await StatisticsService.getUserStats(session.user.id);
    return { success: true, data: stats };
  } catch (error) {
    console.error('Error fetching user statistics:', error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to fetch statistics',
    };
  }
}

export async function getRecentGameStatistics(limit: number = 10): Promise<{
  success: boolean;
  data?: GameStatistics[];
  error?: string;
}> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { success: false, error: 'Not authenticated' };
    }

    const stats = await StatisticsService.getRecentGameStats(
      session.user.id,
      limit
    );
    return { success: true, data: stats };
  } catch (error) {
    console.error('Error fetching recent game statistics:', error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to fetch statistics',
    };
  }
}

export async function getGlobalLeaderboard(
  metric: 'winRate' | 'totalGames' | 'totalWins' = 'winRate',
  limit: number = 10
): Promise<{
  success: boolean;
  data?: (UserStatsSummary & { userName?: string })[];
  error?: string;
}> {
  try {
    const leaderboard = await StatisticsService.getLeaderboard(metric, limit);
    return { success: true, data: leaderboard };
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to fetch leaderboard',
    };
  }
}

export async function recordGameCompletion(
  gameId: string,
  gameStartTime: Date,
  gameEndTime: Date
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { success: false, error: 'Not authenticated' };
    }

    await StatisticsService.recordGameStatistics(
      gameId,
      gameStartTime,
      gameEndTime
    );
    return { success: true };
  } catch (error) {
    console.error('Error recording game completion:', error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to record game completion',
    };
  }
}
