'use server';

import { RoleName } from '@/lib/engine/interfaces/IRole';
import { Themes } from '@/lib/engine/interfaces/Theme';
import type {
  SerializableGameState,
  SerializablePlayer,
  AgentConfig,
} from '@/lib/interfaces/persistence.types';
import { createGameData } from '@/lib/db/persistence';
import {
  createInitialMemory,
  type AgentMemory,
} from '@/lib/engine/interfaces/AgentMemory';
import type { PlayerId } from '@/lib/engine/interfaces/IPlayer';
import { PlayerStatus } from '@/lib/engine/interfaces/IPlayer';
import { filterGameStateForClient } from '@/lib/visibilityHelper';
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';
import crypto from 'node:crypto';
import type { StartGameSetupData } from '@/lib/interfaces/actions.types';
import { DEFAULT_PERSONA, type Persona } from '@/lib/engine/interfaces/Persona';
import { createAgentInstance } from '@/lib/agentFactory';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { redirect } from 'next/navigation';
import { getEnvAvailableProviders } from '@/lib/utils/providerUtils';
import type { AvailableProvider } from '@/lib/utils/providerUtils';

/**
 * Server action to get available providers from environment variables
 * This runs on the server where environment variables are accessible
 */
export async function getAvailableProvidersFromEnv(): Promise<
  AvailableProvider[]
> {
  return getEnvAvailableProviders();
}

/**
 * Retry wrapper for AI operations with exponential backoff
 */
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000,
  operationName = 'operation'
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries) {
        throw lastError;
      }

      const delay = baseDelay * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error(`${operationName}: Unexpected retry loop exit`);
}

/**
 * Generate persona for a single character with retry logic
 */
export async function generateCharacterPersona(
  playerName: string,
  playerId: PlayerId,
  agentConfig: AgentConfig,
  themeDescription: string,
  language?: string,
  existingNames?: string[]
): Promise<Persona> {
  return retryWithBackoff(
    async () => {
      const tempAgent = await createAgentInstance(agentConfig, playerId);

      if (!tempAgent.generatePersona) {
        return DEFAULT_PERSONA;
      }

      await tempAgent.generatePersona(
        themeDescription,
        language,
        existingNames
      );

      if (
        !tempAgent.persona ||
        !tempAgent.persona.name ||
        tempAgent.persona.name.trim() === '' ||
        tempAgent.persona.name === DEFAULT_PERSONA.name
      ) {
        throw new Error(
          `Invalid persona generated: ${JSON.stringify(tempAgent.persona)}`
        );
      }

      return tempAgent.persona;
    },
    3,
    1000,
    `Persona generation for ${playerName}`
  );
}

export async function startGameAction(
  setupData: StartGameSetupData
): Promise<
  { gameId: string; initialState: FilteredGameState } | { error: string }
> {
  console.log('[startGameAction] Starting game creation with setup data:', {
    playerCount: setupData.players.length,
    themeKey: setupData.themeKey,
    language: setupData.language,
    hasHumanPlayer: setupData.players.some((p) => p.isHuman),
  });

  const gameId = crypto.randomUUID();
  const createdAt = Date.now();

  try {
    // Ensure user is authenticated
    const session = await getServerSession(authOptions);
    console.log('[startGameAction] Session check:', {
      hasSession: !!session,
      userId: session?.user?.id,
      userEmail: session?.user?.email,
    });

    let userId = session?.user?.id;

    // In development, create a dev user if needed
    if (!userId && process.env.NODE_ENV === 'development') {
      console.log('[startGameAction] Development mode: Creating dev user');
      try {
        const { db } = await import('@/lib/db/config');
        const { users } = await import('@/lib/db/schema');
        const { eq } = await import('drizzle-orm');

        // First check if dev user exists
        const [devUser] = await db
          .select()
          .from(users)
          .where(eq(users.email, 'dev@werewolf-ai.com'))
          .limit(1);

        if (devUser) {
          userId = devUser.id;
          console.log('[startGameAction] Found existing dev user:', userId);
        } else {
          // Create dev user if it doesn't exist
          const [newDevUser] = await db
            .insert(users)
            .values({
              email: 'dev@werewolf-ai.com',
              name: 'Development User',
              emailVerified: new Date(),
            })
            .returning();

          if (newDevUser) {
            userId = newDevUser.id;
            console.log('[startGameAction] Created new dev user:', userId);
          }
        }
      } catch (error) {
        console.error(
          '[startGameAction] Failed to get or create dev user:',
          error
        );
      }
    }

    if (!userId) {
      console.error(
        '[startGameAction] No user ID available, redirecting to signin'
      );
      redirect(`/${setupData.language}/auth/signin`);
    }

    // Create the game
    console.log('[startGameAction] Creating game with createGame function');
    await createGame(setupData, gameId, createdAt, userId);
    console.log(
      '[startGameAction] Game created successfully, redirecting to:',
      gameId
    );

    // Redirect to the game page
    redirect(`/${setupData.language}/game/${gameId}`);
  } catch (error: unknown) {
    // Re-throw Next.js redirect errors
    if (error instanceof Error && error.message.includes('NEXT_REDIRECT')) {
      console.log('[startGameAction] Redirect in progress');
      throw error;
    }

    console.error('[startGameAction] Error creating game:', error);
    return {
      error: error instanceof Error ? error.message : 'StartGameFailedError',
    };
  }
}

// Extract game creation logic into separate function - now creates minimal game without character generation
async function createGame(
  setupData: StartGameSetupData,
  gameId: string,
  createdAt: number,
  userId: string
): Promise<{ gameId: string; initialState: FilteredGameState }> {
  console.log('[createGame] Starting game creation:', {
    gameId,
    userId,
    playerCount: setupData.players?.length,
    themeKey: setupData.themeKey,
  });

  if (!setupData.players || setupData.players.length < 3) {
    console.error(
      '[createGame] Not enough players:',
      setupData.players?.length
    );
    throw new Error('Minimum 3 players required.');
  }
  const theme = Themes[setupData.themeKey];
  if (!theme) {
    console.error('[createGame] Invalid theme:', setupData.themeKey);
    throw new Error(`Invalid theme key: ${setupData.themeKey}`);
  }

  console.log('[createGame] Theme selected:', theme.name);

  // Create players with basic info - character generation will happen later
  const rolesMap: Record<PlayerId, RoleName> = {};
  const playersForPersistence: Record<PlayerId, SerializablePlayer> = {};
  const livingPlayerIds: PlayerId[] = [];
  const agentMemories: Record<PlayerId, AgentMemory> = {};
  let humanPlayerId: PlayerId | null = null;

  for (let i = 0; i < setupData.players.length; i++) {
    const playerSetup = setupData.players[i];
    const roleName = playerSetup.rolePreference;
    const roleNameStr = roleName.toString().toLowerCase();
    const sanitizedName = playerSetup.name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .slice(0, 16);

    const playerId: PlayerId = `player-${i + 1}-${roleNameStr}-${sanitizedName}`;

    console.log('[createGame] Creating player:', {
      index: i,
      playerId,
      name: playerSetup.name,
      role: roleName,
      isHuman: playerSetup.isHuman,
    });

    rolesMap[playerId] = roleName;

    const agentConfig = playerSetup.agentConfig;

    if (playerSetup.isHuman) {
      humanPlayerId = playerId;
    }

    // Use placeholder persona for now - will be generated later
    const placeholderPersona: Persona = {
      name: playerSetup.name,
      backstory: playerSetup.isHuman
        ? 'A human player'
        : `A resident of ${theme.name.toLowerCase()}`,
      personalityTraits: playerSetup.isHuman ? ['Human'] : ['Mysterious'],
    };

    playersForPersistence[playerId] = {
      id: playerId,
      name: placeholderPersona.name,
      status: PlayerStatus.Alive,
      roleName: roleName,
      allegiance: [RoleName.Mafia].includes(roleName) ? 'Mafia' : 'Town',
      agentConfig: agentConfig,
      persona: placeholderPersona,
      isHuman: playerSetup.isHuman,
      imageUrl: playerSetup.imageUrl || null,
    };
    livingPlayerIds.push(playerId);
    agentMemories[playerId] = createInitialMemory();
  }

  console.log('[createGame] Players created:', {
    totalPlayers: Object.keys(playersForPersistence).length,
    humanPlayerId,
    livingPlayerIds,
  });

  const initialSerializableState: SerializableGameState = {
    gameId,
    createdAt,
    updatedAt: createdAt,
    themeKey: setupData.themeKey,
    language: setupData.language,
    round: 0,
    phase: 'CharacterGeneration', // New phase for character generation
    players: playersForPersistence,
    livingPlayerIds,
    deadPlayerIds: [],
    conversationLog: [],
    agentMemories,
    winCondition: null,
    humanPlayerId,
    pendingHumanAction: null,
    _phaseResults: {},
    phaseStep: 'Start',
    nextPlayerIndexToAction: 0,
  };

  console.log('[createGame] Saving game state to database');

  // Save the basic game state
  await createGameData(initialSerializableState, userId);

  console.log('[createGame] Game saved successfully');

  const filteredState = filterGameStateForClient(
    initialSerializableState,
    initialSerializableState.humanPlayerId
  );

  console.log('[createGame] Game creation complete');

  return { gameId, initialState: filteredState };
}
