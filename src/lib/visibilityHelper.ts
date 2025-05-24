import { RoleName } from "./engine/interfaces/IRole";
import { Themes } from "./engine/interfaces/Theme";
import { MessageVisibility } from "./engine/interfaces/IMessage";
import type { SerializableGameState } from "./interfaces/persistence.types";
import type {
  FilteredGameState,
  FilteredPlayer,
  PlayerId,
  ClientMessage,
} from "./interfaces/gameState.types";

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
  const viewingPlayer = viewingPlayerId ? fullState.players[viewingPlayerId] : null;
  const isViewingPlayerMafia = viewingPlayer?.roleName === RoleName.Mafia;

  const playersRecord: Record<PlayerId, FilteredPlayer> = {};
  for (const p of Object.values(fullState.players)) {
    const filteredPlayer: FilteredPlayer = {
      id: p.id,
      name: p.name,
      status: p.status,
      role:
        isObserver || // Observers can see all roles
        viewingPlayerId === p.id ||
        fullState.phase === "GameOver" ||
        p.status === "Dead"
          ? p.roleName
          : undefined, // Role is hidden for living players unless it's self, observer mode, or game over
      imageUrl: p.imageUrl ?? null, // Pass imageUrl from SerializablePlayer
    };
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
        // Observers can see mafia chat, or if viewing player is mafia
        return isObserver || isViewingPlayerMafia;
      }
      return true;
    });

  const theme = Themes[fullState.themeKey] || Themes.UK_VILLAGE_1900S;

  const filteredState: FilteredGameState = {
    id: fullState.gameId,
    phase: fullState.phase,
    round: fullState.round,
    title: theme.name,
    description: theme.description,
    createdAt:
      typeof fullState.createdAt === "number"
        ? new Date(fullState.createdAt).toISOString()
        : fullState.createdAt,
    lastUpdatedAt:
      typeof fullState.updatedAt === "number"
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
    canSeeWerewolfChat: isObserver || isViewingPlayerMafia,
    canSeeDeadChat: true,
    availableVoices: [],
  };

  return filteredState;
}

// TODO: Implement or move generateVisibleGameState if needed elsewhere.
// It seems more related to the Game engine core for agent views.
