import type { PublicPlayerInfo, PlayerId, PlayerStatus } from "./IPlayer";
import type { GamePhaseType } from "./IGamePhase";
import type { RoleName } from "./IRole";

// Represents the game state information passed TO an agent.
// It's filtered based on what that agent SHOULD know.
export interface VisibleGameState {
    readonly gameId: string;
    readonly round: number;
    readonly phase: GamePhaseType;
    readonly self: { // Information about the player receiving this state
        readonly id: PlayerId;
        readonly name: string;
        readonly status: PlayerStatus;
        readonly role: RoleName; // The player knows their own role
        readonly isMafia: boolean; // Convenience flag
    };
    readonly players: ReadonlyArray<PublicPlayerInfo>; // Public info of all players
    readonly alivePlayerIds: ReadonlySet<PlayerId>;
    readonly mafiaPlayerIds?: ReadonlySet<PlayerId>; // Only included if self.isMafia = true
    // Potentially add recent messages visible to this player
    // readonly recentMessages: ReadonlyArray<IMessage>;
    readonly language: string; // Added language setting
    readonly lastNightInvestigationResult?: { targetId: PlayerId, allegiance: 'Mafia' | 'Town' }; // Added for Seer feedback
    
    // Added for GameOver state to include full details
    readonly playerDetails?: ReadonlyArray<{ 
        id: PlayerId, 
        name: string, 
        status: PlayerStatus, 
        role: RoleName, 
        allegiance: 'Mafia' | 'Town' 
    }>;
    readonly winningTeam?: 'Mafia' | 'Town'; // Added for GameOver state
}
