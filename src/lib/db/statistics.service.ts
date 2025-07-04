import { db } from './config';
import {
  gameStatistics,
  userStatsSummary,
  games,
  gameParticipants,
  type GameStatistics,
  type NewGameStatistics,
  type UserStatsSummary,
} from './schema';
import { eq, desc } from 'drizzle-orm';
import type { RoleName } from '../engine/interfaces/IRole';
import { users } from './schema';

export class StatisticsService {
  /**
   * Record statistics for a completed game
   */
  static async recordGameStatistics(
    gameId: string,
    gameStartTime: Date,
    gameEndTime: Date
  ): Promise<void> {
    // Get game data
    const game = await db
      .select()
      .from(games)
      .where(eq(games.id, gameId))
      .limit(1);

    if (!game[0] || game[0].status !== 'completed') {
      throw new Error('Game not found or not completed');
    }

    const gameDuration = Math.floor(
      (gameEndTime.getTime() - gameStartTime.getTime()) / 1000
    );

    // Get all participants for this game
    const participants = await db
      .select()
      .from(gameParticipants)
      .where(eq(gameParticipants.gameId, gameId));

    // Process each participant
    for (const participant of participants) {
      if (!participant.userId) continue; // Skip AI players

      // Calculate statistics from game state
      const gameState = game[0].gameState as any;
      const playerStats = this.calculatePlayerStatistics(
        participant,
        gameState,
        game[0].winCondition || ''
      );

      // Record individual game statistics
      const gameStats: NewGameStatistics = {
        userId: participant.userId,
        gameId: gameId,
        participantId: participant.id,
        won: playerStats.won,
        survived: participant.isAlive,
        roundsPlayed: game[0].round,
        gameDuration: gameDuration,
        messagesCount: playerStats.messagesCount,
        votesCount: playerStats.votesCount,
        correctVotes: playerStats.correctVotes,
        votesReceived: playerStats.votesReceived,
        roleActions: playerStats.roleActions,
        successfulActions: playerStats.successfulActions,
        trustScore: playerStats.trustScore,
        influenceScore: playerStats.influenceScore,
      };

      await db.insert(gameStatistics).values(gameStats);

      // Update aggregated statistics
      await this.updateUserStatsSummary(
        participant.userId,
        gameStats,
        participant.roleName as RoleName
      );
    }
  }

  /**
   * Calculate player statistics from game state
   */
  private static calculatePlayerStatistics(
    participant: any,
    gameState: any,
    winCondition: string
  ): any {
    const won =
      (participant.allegiance === 'Mafia' && winCondition === 'Mafia') ||
      (participant.allegiance === 'Town' && winCondition === 'Town');

    // Extract statistics from game state memory
    const memory = gameState.memory || {};
    const messageHistory = memory.messageHistory || [];
    const voteHistory = memory.voteHistory || [];
    const investigationResults = memory.investigationResults || [];
    const saveHistory = memory.saveHistory || [];
    const killHistory = memory.killHistory || [];

    // Count messages
    const messagesCount = messageHistory.filter(
      (msg: any) => msg.playerId === participant.playerId
    ).length;

    // Count votes and analyze voting patterns
    const playerVotes = voteHistory.filter(
      (vote: any) => vote.voterId === participant.playerId
    );
    const votesCount = playerVotes.length;

    // Calculate correct votes (votes for actual mafia members)
    const mafiaPlayerIds =
      gameState.players
        ?.filter((p: any) => p.role === 'Mafia')
        .map((p: any) => p.id) || [];

    const correctVotes = playerVotes.filter((vote: any) =>
      mafiaPlayerIds.includes(vote.targetId)
    ).length;

    // Count votes received
    const votesReceived = voteHistory.filter(
      (vote: any) => vote.targetId === participant.playerId
    ).length;

    // Calculate role-specific actions
    let roleActions = 0;
    let successfulActions = 0;

    switch (participant.roleName) {
      case 'Seer':
        roleActions = investigationResults.filter(
          (inv: any) => inv.seerId === participant.playerId
        ).length;
        // Successful investigations are those that correctly identified mafia
        successfulActions = investigationResults.filter(
          (inv: any) =>
            inv.seerId === participant.playerId &&
            ((inv.isMafia && mafiaPlayerIds.includes(inv.targetId)) ||
              (!inv.isMafia && !mafiaPlayerIds.includes(inv.targetId)))
        ).length;
        break;

      case 'Doctor':
        roleActions = saveHistory.filter(
          (save: any) => save.doctorId === participant.playerId
        ).length;
        // Successful saves are when the saved player was actually targeted
        successfulActions = saveHistory.filter((save: any) => {
          if (save.doctorId !== participant.playerId) return false;
          // Check if the saved player was targeted for elimination that round
          return killHistory.some(
            (kill: any) =>
              kill.targetId === save.targetId && kill.round === save.round
          );
        }).length;
        break;

      case 'Mafia':
        roleActions = killHistory.filter(
          (kill: any) => kill.killerId === participant.playerId
        ).length;
        successfulActions = roleActions; // All mafia kills are considered successful
        break;
    }

    // Calculate social metrics
    const trustScore = this.calculateTrustScore(
      participant.playerId,
      voteHistory,
      mafiaPlayerIds
    );
    const influenceScore = this.calculateInfluenceScore(
      participant.playerId,
      voteHistory
    );

    return {
      won,
      messagesCount,
      votesCount,
      correctVotes,
      votesReceived,
      roleActions,
      successfulActions,
      trustScore,
      influenceScore,
    };
  }

  /**
   * Calculate trust score based on voting patterns
   */
  private static calculateTrustScore(
    playerId: string,
    voteHistory: any[],
    mafiaPlayerIds: string[]
  ): number {
    // Trust score: How often the player voted correctly for mafia vs innocents
    const playerVotes = voteHistory.filter((v) => v.voterId === playerId);
    if (playerVotes.length === 0) return 50; // Default neutral score

    const correctVotes = playerVotes.filter((v) =>
      mafiaPlayerIds.includes(v.targetId)
    ).length;

    // Score from 0-100
    return Math.round((correctVotes / playerVotes.length) * 100);
  }

  /**
   * Calculate influence score based on voting leadership
   */
  private static calculateInfluenceScore(
    playerId: string,
    voteHistory: any[]
  ): number {
    // Influence score: How often others followed this player's voting lead
    let influence = 0;
    let opportunities = 0;

    // Group votes by round
    const votesByRound = voteHistory.reduce(
      (acc, vote) => {
        const round = vote.round || 0;
        if (!acc[round]) acc[round] = [];
        acc[round].push(vote);
        return acc;
      },
      {} as Record<number, any[]>
    );

    for (const roundVotes of Object.values(votesByRound)) {
      const playerVote = (roundVotes as any[]).find((v) => v.voterId === playerId);
      if (!playerVote) continue;

      opportunities++;

      // Count how many players voted the same way after this player
      const followingVotes = (roundVotes as any[]).filter(
        (v) =>
          v.voterId !== playerId &&
          v.targetId === playerVote.targetId &&
          v.timestamp > playerVote.timestamp
      );

      if (followingVotes.length > 0) {
        influence++;
      }
    }

    if (opportunities === 0) return 50; // Default neutral score
    return Math.round((influence / opportunities) * 100);
  }

  /**
   * Update user's aggregated statistics
   */
  private static async updateUserStatsSummary(
    userId: string,
    gameStats: NewGameStatistics,
    roleName: RoleName
  ): Promise<void> {
    // Get existing summary or create new one
    const summaryResult = await db
      .select()
      .from(userStatsSummary)
      .where(eq(userStatsSummary.userId, userId))
      .limit(1);
    const summary = summaryResult[0];

    if (!summary) {
      // Create new summary
      await db.insert(userStatsSummary).values({
        userId,
        totalGames: 1,
        totalWins: gameStats.won ? 1 : 0,
        winRate: gameStats.won ? 100 : 0,
        [`gamesAs${roleName}`]: 1,
        [`winsAs${roleName}`]: gameStats.won ? 1 : 0,
        currentWinStreak: gameStats.won ? 1 : 0,
        longestWinStreak: gameStats.won ? 1 : 0,
        totalPlayTime: gameStats.gameDuration,
        averageGameDuration: gameStats.gameDuration,
        lastPlayedAt: new Date(),
        averageTrustScore: gameStats.trustScore || 50,
        averageInfluenceScore: gameStats.influenceScore || 50,
        favoriteRole: roleName,
      });
    } else {
      // Update existing summary
      const totalGames = summary.totalGames + 1;
      const totalWins = summary.totalWins + (gameStats.won ? 1 : 0);
      const winRate = Math.round((totalWins / totalGames) * 100);
      const currentWinStreak = gameStats.won ? summary.currentWinStreak + 1 : 0;
      const longestWinStreak = Math.max(
        currentWinStreak,
        summary.longestWinStreak
      );
      const totalPlayTime = summary.totalPlayTime + gameStats.gameDuration;
      const averageGameDuration = Math.round(totalPlayTime / totalGames);

      // Update role-specific stats
      const roleGamesKey = `gamesAs${roleName}` as keyof UserStatsSummary;
      const roleWinsKey = `winsAs${roleName}` as keyof UserStatsSummary;
      const roleGames = ((summary[roleGamesKey] as number) || 0) + 1;
      const roleWins =
        ((summary[roleWinsKey] as number) || 0) + (gameStats.won ? 1 : 0);

      // Calculate new average scores
      const averageTrustScore = Math.round(
        (summary.averageTrustScore * (totalGames - 1) +
          (gameStats.trustScore || 50)) /
          totalGames
      );
      const averageInfluenceScore = Math.round(
        (summary.averageInfluenceScore * (totalGames - 1) +
          (gameStats.influenceScore || 50)) /
          totalGames
      );

      // Determine favorite role (most played)
      const roleCounts = {
        Villager: summary.gamesAsVillager + (roleName === 'Villager' ? 1 : 0),
        Mafia: summary.gamesAsMafia + (roleName === 'Mafia' ? 1 : 0),
        Seer: summary.gamesAsSeer + (roleName === 'Seer' ? 1 : 0),
        Doctor: summary.gamesAsDoctor + (roleName === 'Doctor' ? 1 : 0),
      };
      const favoriteRole = Object.entries(roleCounts).reduce((a, b) =>
        a[1] > b[1] ? a : b
      )[0];

      await db
        .update(userStatsSummary)
        .set({
          totalGames,
          totalWins,
          winRate,
          [roleGamesKey]: roleGames,
          [roleWinsKey]: roleWins,
          currentWinStreak,
          longestWinStreak,
          totalPlayTime,
          averageGameDuration,
          lastPlayedAt: new Date(),
          averageTrustScore,
          averageInfluenceScore,
          favoriteRole,
          updatedAt: new Date(),
        })
        .where(eq(userStatsSummary.userId, userId));
    }
  }

  /**
   * Get user statistics summary
   */
  static async getUserStats(userId: string): Promise<UserStatsSummary | null> {
    const stats = await db
      .select()
      .from(userStatsSummary)
      .where(eq(userStatsSummary.userId, userId))
      .limit(1);
    return stats[0] || null;
  }

  /**
   * Get recent game statistics for a user
   */
  static async getRecentGameStats(
    userId: string,
    limit: number = 10
  ): Promise<GameStatistics[]> {
    const stats = await db
      .select()
      .from(gameStatistics)
      .where(eq(gameStatistics.userId, userId))
      .orderBy(desc(gameStatistics.createdAt))
      .limit(limit);
    return stats;
  }

  /**
   * Get global leaderboard
   */
  static async getLeaderboard(
    metric: 'winRate' | 'totalGames' | 'totalWins' = 'winRate',
    limit: number = 10
  ): Promise<(UserStatsSummary & { userName?: string })[]> {
    const results = await db
      .select()
      .from(userStatsSummary)
      .leftJoin(users, eq(userStatsSummary.userId, users.id))
      .orderBy(desc(userStatsSummary[metric]))
      .limit(limit);

    return results.map((r) => ({
      ...r.user_stats_summary,
      userName: r.user?.name || 'Anonymous',
    }));
  }
}
