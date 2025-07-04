import { RoleName } from './engine/interfaces/IRole';
import { getThemes } from '@/lib/utils/themeLoader';
import { MessageVisibility } from './engine/interfaces/IMessage';
import type { SerializableGameState } from './interfaces/persistence.types';
import type {
  FilteredGameState,
  FilteredPlayer,
  PlayerId,
  ClientMessage,
} from './interfaces/gameState.types';

/**
 * Filters the complete serializable game state into a view suitable for sending to a specific client.
 * Omits sensitive information like hidden roles, other players' full personas, internal agent states, etc.
 *
 * @param fullState The complete SerializableGameState.
 * @param viewingPlayerId Optional: The ID of the player for whom the state is being filtered.
 *                          If null/undefined, the user is considered an observer and can see all information.
 * @returns FilteredGameState suitable for the client.
 */
export function filterGameStateForClient(
  fullState: SerializableGameState,
  viewingPlayerId?: PlayerId | null
): FilteredGameState {
  const isObserver = !viewingPlayerId;
  const viewingPlayer = viewingPlayerId
    ? fullState.players[viewingPlayerId]
    : null;
  const isViewingPlayerMafia = viewingPlayer?.roleName === RoleName.Mafia;

  // 🎯 FIX: Only show all roles if game is over OR truly spectating a finished game
  // During active gameplay, even observers should not see roles (maintains werewolf mystery)
  const shouldRevealAllRoles = fullState.phase === 'GameOver';

  const playersRecord: Record<PlayerId, FilteredPlayer> = {};
  for (const p of Object.values(fullState.players)) {
    const filteredPlayer: FilteredPlayer = {
      id: p.id,
      name: p.name,
      status: p.status,
      role:
        shouldRevealAllRoles || viewingPlayerId === p.id || p.status === 'Dead'
          ? p.roleName
          : undefined,
      imageUrl: p.imageUrl ?? null,
    };

    // Add isMafia flag for fellow Mafia members when viewing as Mafia
    // 🎯 FIX: Also include for observers during GameOver to show final reveals
    if (
      (isViewingPlayerMafia || (shouldRevealAllRoles && isObserver)) &&
      p.roleName === RoleName.Mafia &&
      p.status === 'Alive'
    ) {
      filteredPlayer.isMafia = true;
    }

    playersRecord[p.id] = filteredPlayer;
  }

  const filteredLog: ClientMessage[] = fullState.conversationLog
    .map((msg) => ({
      id: msg.id,
      round: msg.round,
      phase: msg.phase,
      senderId: msg.senderId,
      senderName: msg.senderName,
      content: msg.content,
      timestamp: msg.timestamp,
      visibility: msg.visibility,
      recipientId: msg.recipientId,
    }))
    .filter((msg) => {
      if (msg.visibility === MessageVisibility.Mafia) {
        // 🎯 FIX: Observers can see Mafia chat only during GameOver
        return (shouldRevealAllRoles && isObserver) || isViewingPlayerMafia;
      }
      return true;
    });

  const theme =
    getThemes()[fullState.themeKey] || getThemes()['UK_VILLAGE_1900S'];

  const filteredState: FilteredGameState = {
    id: fullState.gameId,
    phase: fullState.phase,
    round: fullState.round,
    title: theme.name,
    description: theme.description,
    createdAt:
      typeof fullState.createdAt === 'number'
        ? new Date(fullState.createdAt).toISOString()
        : fullState.createdAt,
    lastUpdatedAt:
      typeof fullState.updatedAt === 'number'
        ? new Date(fullState.updatedAt).toISOString()
        : fullState.updatedAt,
    winner: fullState.winCondition?.outcome ?? null,
    language: fullState.language,
    themeKey: fullState.themeKey,
    players: playersRecord,
    log: filteredLog,
    pendingHumanAction: fullState.pendingHumanAction,
    humanPlayerId: fullState.humanPlayerId,
    livingPlayerIds: fullState.livingPlayerIds,
    deadPlayerIds: fullState.deadPlayerIds,
    winCondition: fullState.winCondition?.outcome ?? null,
    canSeeWerewolfChat:
      (shouldRevealAllRoles && isObserver) || isViewingPlayerMafia,
    canSeeDeadChat: true,
    availableVoices: [],
    // Include agent memories (with AI conversation logs) when game is over
    ...(fullState.phase === 'GameOver' && {
      agentMemories: fullState.agentMemories,
    }),
  };

  return filteredState;
}

// TODO: Implement or move generateVisibleGameState if needed elsewhere.
// It seems more related to the Game engine core for agent views.
