import { AbstractGamePhase } from './AbstractGamePhase';
import type { Game } from '../core/Game';
import type { GamePhaseType } from '../interfaces/IGamePhase';
import { NightPhase } from './NightPhase';
import type { PlayerAction } from '../interfaces/IAgent';
import type { PlayerId } from '../interfaces/IPlayer';
import { MessageVisibility } from '../interfaces/IMessage';

export class DayPhase extends AbstractGamePhase {
    readonly type: GamePhaseType = 'Day';

    async runPhase(game: Game): Promise<void> {
        game.logMessage(null, "Day begins. Discuss and decide who to execute.", MessageVisibility.Public);

        const alivePlayers = game.getAlivePlayers();
        const actions = new Map<PlayerId, PlayerAction>();
        const votes = new Map<PlayerId, PlayerId | null>(); // PlayerId -> VotedForPlayerId | null

        // 1. Discussion / Message Sending (Optional - could be multiple rounds)
        // For simplicity, one round of messages first
        game.logMessage(null, "Discussion phase:", MessageVisibility.Public);
        for (const player of alivePlayers) {
            const gameState = game.generateVisibleGameState(player.id);
            const action = await player.decideAction(gameState);
            actions.set(player.id, action);
            if (action.type === 'message') {
                game.logMessage(player.id, action.content, MessageVisibility.Public);
            }
        }

        // 2. Voting Phase
        game.logMessage(null, "Voting phase: Choose who to execute.", MessageVisibility.Public);
         // Re-ask players for action, specifically looking for votes now
         // (A real game might have distinct Discussion/Voting sub-phases)
        for (const player of alivePlayers) {
            const gameState = game.generateVisibleGameState(player.id); // Update state if needed
             // Ask again, expecting a vote this time from cooperative agents
            const action = await player.decideAction(gameState);
            actions.set(player.id, action); // Update action map

             if (action.type === 'vote') {
                 // Ensure target is valid and alive
                 const targetPlayer = action.targetPlayerId ? game.getPlayer(action.targetPlayerId) : null;
                 if (action.targetPlayerId === null) {
                    votes.set(player.id, null); // Abstain/No vote
                     game.logMessage(player.id, "votes to abstain.", MessageVisibility.Public);
                 } else if (targetPlayer && targetPlayer.isAlive()) {
                     votes.set(player.id, action.targetPlayerId);
                      game.logMessage(player.id, `votes for ${targetPlayer.name}.`, MessageVisibility.Public);
                 } else {
                     votes.set(player.id, null); // Invalid vote counts as abstain
                     game.logMessage(player.id, "cast an invalid vote (counts as abstain).", MessageVisibility.Public);
                 }
             } else {
                  votes.set(player.id, null); // No vote action = abstain
             }
        }


        // 3. Tally Votes
        const voteCounts = new Map<PlayerId, number>();
        let maxVotes = 0;
        let playersToExecute: PlayerId[] = [];

        for (const [voterId, targetId] of votes.entries()) {
            if (targetId !== null) {
                const currentVotes = (voteCounts.get(targetId) || 0) + 1;
                voteCounts.set(targetId, currentVotes);

                if (currentVotes > maxVotes) {
                    maxVotes = currentVotes;
                    playersToExecute = [targetId];
                } else if (currentVotes === maxVotes) {
                    playersToExecute.push(targetId);
                }
            }
        }

        // 4. Determine Execution
        let executedPlayerId: PlayerId | null = null;
        if (maxVotes > 0 && playersToExecute.length === 1) {
            // Clear winner
            executedPlayerId = playersToExecute[0];
             game.logMessage(null, `The town has decided to execute ${game.getPlayer(executedPlayerId)?.name ?? executedPlayerId}.`, MessageVisibility.Public);
             game.killPlayer(executedPlayerId, "was executed by popular vote.");
        } else if (maxVotes > 0 && playersToExecute.length > 1) {
            // Tie vote
             game.logMessage(null, `Vote resulted in a tie between ${playersToExecute.map(id=>game.getPlayer(id)?.name ?? id).join(', ')}. No one is executed.`, MessageVisibility.Public);
        } else {
            // No votes cast or only abstains
             game.logMessage(null, "The town could not reach a decision. No one is executed.", MessageVisibility.Public);
        }

        // Notify renderers about vote outcome
        game.notifyRenderers('renderVoteResults', votes, executedPlayerId);
    }

    transition(game: Game): AbstractGamePhase {
        // After Day, always go to Night
        return new NightPhase();
    }
}
