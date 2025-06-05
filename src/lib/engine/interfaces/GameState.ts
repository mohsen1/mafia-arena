// Using only type imports
import type { PublicPlayerInfo, PlayerId, PlayerStatus } from './IPlayer';
import type { GamePhaseType } from './IGamePhase';
import type { RoleName } from './IRole';
import type { Persona } from './Persona';
import type { AgentMemory } from './AgentMemory';

// Represents the game state information passed TO an agent.
// It's filtered based on what that agent SHOULD know.
export interface VisibleGameState {
  readonly gameId: string;
  readonly round: number;
  readonly phase: GamePhaseType;
  readonly self: {
    // Information about the player receiving this state
    readonly id: PlayerId;
    readonly name: string;
    readonly status: PlayerStatus;
    readonly role: RoleName; // The player knows their own role
    readonly allegiance: 'Mafia' | 'Town'; // Added allegiance
    readonly isMafia: boolean; // Convenience flag (can be derived from allegiance)
    readonly persona?: Persona;
  };
  readonly players: ReadonlyArray<PublicPlayerInfo>; // Public info of all players
  readonly alivePlayerIds: ReadonlySet<PlayerId>;
  readonly mafiaPlayerIds?: ReadonlySet<PlayerId>; // Only included if self.isMafia = true
  readonly language: string; // Added language setting
  readonly themeName?: string; // Added game theme name
  readonly memory: AgentMemory; // Comprehensive memory for the agent

  // Added for GameOver state to include full details
  readonly playerDetails?: ReadonlyArray<{
    id: PlayerId;
    name: string;
    status: PlayerStatus;
    role: RoleName;
    allegiance: 'Mafia' | 'Town';
  }>;
  readonly winningTeam?: 'Mafia' | 'Town'; // Added for GameOver state
}
