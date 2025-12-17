import { eq, and, desc } from 'drizzle-orm';
import { db } from './config';
import { games, gameParticipants, users } from './schema';
import type { SerializableGameState } from '@/lib/interfaces/persistence.types';
import type {
  Game,
  NewGame,
  GameParticipant,
  NewGameParticipant,
} from './schema';

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace GameService {
  /**
   * Creates a new game in the database
   */
  export async function createGame(
    gameState: SerializableGameState,
    ownerId: string,
    title?: string
  ): Promise<Game> {
    console.log('[GameService.createGame] Input gameState voiceModeEnabled:', {
      voiceModeEnabled: gameState.voiceModeEnabled,
      hasVoiceMode: 'voiceModeEnabled' in gameState,
      gameStateKeys: Object.keys(gameState).filter((key) =>
        key.toLowerCase().includes('voice')
      ),
    });

    const newGame: NewGame = {
      id: gameState.gameId,
      ownerId,
      title: title || `Game ${gameState.gameId.slice(0, 8)}`,
      themeKey: gameState.themeKey,
      language: gameState.language,
      round: gameState.round,
      phase: gameState.phase,
      status: 'active',
      winCondition: gameState.winCondition
        ? JSON.stringify(gameState.winCondition)
        : null,
      isPublic: false,
      gameState: gameState as unknown as Record<string, unknown>,
      version: 1, // Initial version for optimistic locking
    };

    // Set version in gameState for consistency
    gameState.version = 1;

    console.log(
      '[GameService.createGame] About to save newGame with gameState:',
      {
        voiceModeEnabled: (newGame.gameState as any).voiceModeEnabled,
        gameStateType: typeof newGame.gameState,
      }
    );

    // Use transaction to ensure atomicity
    const result = await db.transaction(async (tx) => {
      // Insert the game
      const [game] = await tx.insert(games).values(newGame).returning();

      // Create game participants
      const participantInserts: NewGameParticipant[] = Object.entries(
        gameState.players
      ).map(([playerId, player]) => ({
        gameId: gameState.gameId,
        userId: player.isHuman ? ownerId : null,
        playerId,
        playerName: player.name,
        roleName: player.roleName,
        allegiance: player.allegiance,
        isHuman: player.isHuman,
        isAlive: gameState.livingPlayerIds.includes(playerId),
        imageUrl: player.imageUrl,
      }));

      // Insert all participants in a single batch operation
      await tx.insert(gameParticipants).values(participantInserts);

      return game;
    });

    return result;
  }

  /**
   * Loads a game state from the database
   */
  export async function loadGameData(
    gameId: string
  ): Promise<SerializableGameState | null> {
    const [game] = await db
      .select()
      .from(games)
      .where(eq(games.id, gameId))
      .limit(1);

    if (!game) {
      return null;
    }

    const gameState = game.gameState as SerializableGameState;
    // Include version in the game state for optimistic locking
    gameState.version = game.version;

    console.log('[loadGameData] Loaded game state voiceModeEnabled:', {
      gameId,
      voiceModeEnabled: gameState.voiceModeEnabled,
      hasVoiceMode: 'voiceModeEnabled' in gameState,
      gameStateKeys: Object.keys(gameState).filter((key) =>
        key.includes('voice')
      ),
    });

    return gameState;
  }

  /**
   * Saves/updates a game state in the database
   */
  export async function saveGameData(
    gameId: string,
    gameState: SerializableGameState
  ): Promise<void> {
    const currentVersion = gameState.version || 1;

    const updateData = {
      round: gameState.round,
      phase: gameState.phase,
      winCondition: gameState.winCondition
        ? JSON.stringify(gameState.winCondition)
        : null,
      gameState: gameState as unknown as Record<string, unknown>,
      updatedAt: new Date(),
      status: gameState.winCondition
        ? ('completed' as const)
        : ('active' as const),
      version: currentVersion + 1, // Increment version for optimistic locking
    };

    // Use optimistic locking: only update if version matches
    const result = await db
      .update(games)
      .set(updateData)
      .where(and(eq(games.id, gameId), eq(games.version, currentVersion)))
      .returning({ updatedVersion: games.version });

    if (result.length === 0) {
      throw new Error(
        `Concurrent modification detected for game ${gameId}. Please refresh and try again.`
      );
    }

    // Update the version in the gameState for consistency
    gameState.version = currentVersion + 1;

    // Update participant statuses in a transaction to ensure consistency
    await db.transaction(async (tx) => {
      // Prepare participant updates
      const participantUpdates = Object.entries(gameState.players).map(([playerId]) => ({
        gameId,
        playerId,
        isAlive: gameState.livingPlayerIds.includes(playerId),
      }));

      // Update all participants in batch operations
      for (const update of participantUpdates) {
        await tx
          .update(gameParticipants)
          .set({ isAlive: update.isAlive })
          .where(
            and(
              eq(gameParticipants.gameId, update.gameId),
              eq(gameParticipants.playerId, update.playerId)
            )
          );
      }
    });
  }

  /**
   * Deletes a game from the database
   */
  export async function deleteGameData(gameId: string): Promise<void> {
    await db.delete(games).where(eq(games.id, gameId));
    // Participants are automatically deleted due to cascade
  }

  /**
   * Lists games for a specific user
   */
  export async function listUserGames(userId: string): Promise<Game[]> {
    return await db
      .select()
      .from(games)
      .where(eq(games.ownerId, userId))
      .orderBy(desc(games.updatedAt));
  }

  /**
   * Lists all saved games (for backward compatibility)
   */
  export async function listSavedGames(): Promise<string[]> {
    const allGames = await db.select({ id: games.id }).from(games);
    return allGames.map((game) => game.id);
  }

  /**
   * Gets game participants
   */
  export async function getGameParticipants(
    gameId: string
  ): Promise<GameParticipant[]> {
    return await db
      .select()
      .from(gameParticipants)
      .where(eq(gameParticipants.gameId, gameId));
  }

  /**
   * Checks if a user owns a game
   */
  export async function isGameOwner(
    gameId: string,
    userId: string
  ): Promise<boolean> {
    const [game] = await db
      .select({ ownerId: games.ownerId })
      .from(games)
      .where(eq(games.id, gameId))
      .limit(1);

    return game?.ownerId === userId;
  }

  /**
   * Gets a game with owner information
   */
  export async function getGameWithOwner(gameId: string) {
    const result = await db
      .select({
        game: games,
        owner: {
          id: users.id,
          name: users.name,
          email: users.email,
          image: users.image,
        },
      })
      .from(games)
      .leftJoin(users, eq(games.ownerId, users.id))
      .where(eq(games.id, gameId))
      .limit(1);

    return result[0] || null;
  }
}
