import type { SerializableGameState, SerializablePlayer } from "./interfaces/persistence.types";
import type { FilteredGameState, FilteredPlayer, PlayerId, ClientMessage, GamePhaseType } from "./interfaces/gameState.types";
import { Themes } from "./engine/interfaces/Theme";
import { RoleName, Allegiance } from "./engine/interfaces/IRole";
import { MessageVisibility } from "./engine/interfaces/IMessage";
import type { LanguageCode, LanguageName } from "./i18n/settings";

/**
 * Filters the complete serializable game state into a view suitable for sending to a specific client.
 * Omits sensitive information like hidden roles, other players' full personas, internal agent states, etc.
 *
 * @param fullState The complete SerializableGameState.
 * @param viewingPlayerId Optional: The ID of the player for whom the state is being filtered. 
 *                          This can be used to include specific details for that player (e.g., their own role).
 * @returns FilteredGameState suitable for the client.
 */
export function filterGameStateForClient(
    fullState: SerializableGameState,
    viewingPlayerId?: PlayerId | null
): FilteredGameState {
    
    const playersRecord: Record<PlayerId, FilteredPlayer> = {};
    Object.values(fullState.players).forEach((p: SerializablePlayer) => {
        const filteredPlayer: FilteredPlayer = {
            id: p.id,
            name: p.name,
            status: p.status,
            role: (viewingPlayerId === p.id || fullState.phase === 'GameOver' || p.status === 'Dead') ? p.roleName : undefined,
            imageUrl: undefined,
        };
        playersRecord[p.id] = filteredPlayer;
    });

    const filteredLog: ClientMessage[] = fullState.conversationLog.map(msg => ({
        id: msg.id,
        round: msg.round,
        phase: msg.phase,
        senderId: msg.senderId,
        senderName: msg.senderName,
        content: msg.content,
        timestamp: msg.timestamp.toISOString(),
        visibility: msg.visibility,
        type: (msg as any).type,
        recipientId: msg.recipientId,
    })).filter(msg => {
        if (msg.visibility === MessageVisibility.Mafia) {
            const viewingPlayer = viewingPlayerId ? fullState.players[viewingPlayerId] : null;
            return viewingPlayer?.roleName === RoleName.Mafia;
        }
        return true;
    });

    const theme = Themes[fullState.themeKey] || Themes['UK_VILLAGE_1900S'];

    const filteredState: FilteredGameState = {
        id: fullState.gameId,
        phase: fullState.phase,
        round: fullState.round,
        title: theme.name,
        description: theme.description,
        createdAt: typeof fullState.createdAt === 'number' ? new Date(fullState.createdAt).toISOString() : fullState.createdAt,
        lastUpdatedAt: typeof fullState.updatedAt === 'number' ? new Date(fullState.updatedAt).toISOString() : fullState.updatedAt,
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
    };

    return filteredState;
}

// TODO: Implement or move generateVisibleGameState if needed elsewhere.
// It seems more related to the Game engine core for agent views. 