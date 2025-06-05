import type { IMessage } from './IMessage';
import type { PublicPlayerInfo, PlayerId } from './IPlayer';
import type { GamePhaseType } from './IGamePhase';
import type { PlayerAction } from './IAgent';
import type { SerializableGameState } from '../../interfaces/persistence.types';

export interface IGameRenderer {
  /** Renders the start of the game */
  renderGameStart(
    players: ReadonlyMap<PlayerId, PublicPlayerInfo>,
    gameId: string
  ): void;
  /** Renders the start of a new round */
  renderRoundStart(round: number): void;
  /** Renders the start of a specific phase */
  renderPhaseStart(phase: GamePhaseType, round: number): void;
  /** Renders a message */
  renderMessage(message: IMessage): void;
  /** Renders the results of a day's vote */
  renderVoteResults(
    votes: Map<PlayerId, PlayerId | null>,
    executedPlayerId: PlayerId | null
  ): void;
  /** Renders the results of night actions */
  renderNightResults(
    killedPlayerId: PlayerId | null /*, other results */
  ): void;
  /** Renders a player's status change */
  renderPlayerStatusUpdate(
    player: PublicPlayerInfo,
    oldStatus: string,
    newStatus: string
  ): void;
  /** Renders the end of the game */
  renderGameOver(
    winner: 'Mafia' | 'Town' | null,
    finalState: SerializableGameState
  ): void;
  /** Renders generic game information or narration */
  renderNarration(text: string): void;
  /** Provides the full conversation log for export */
  getConversationLog?(): ReadonlyArray<IMessage>; // Optional for markdown export

  /** Optional: Prompts a human player for their action */
  promptHumanInput?(
    playerInfo: PublicPlayerInfo,
    allowedActions: PlayerAction['type'][]
  ): Promise<PlayerAction>;
}
