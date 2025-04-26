import { AbstractGamePhase } from './AbstractGamePhase';
import type { Game } from '../core/Game';
import type { GamePhaseType } from '../interfaces/IGamePhase';
import { NightPhase } from './NightPhase';
import type { PlayerAction } from '../interfaces/IAgent';
import type { PlayerId } from '../interfaces/IPlayer';
import { MessageVisibility } from '../interfaces/IMessage';
// import { HumanAgent } from '../agents/HumanAgent'; // No longer needed here

export class DayPhase extends AbstractGamePhase {
    readonly type: GamePhaseType = 'Day';

    async runPhase(game: Game): Promise<void> {
        game.logMessage(null, "Day begins. Discuss and decide who to execute.", MessageVisibility.Public);

        const alivePlayers = game.getAlivePlayers();
        const actions = new Map<PlayerId, PlayerAction>();
        const votes = new Map<PlayerId, PlayerId | null>(); // PlayerId -> VotedForPlayerId | null

        // --- Round 1: Introductions --- 
        if (game.round === 1) {
            game.logMessage(null, "Let's begin with introductions. Please introduce yourself based on your persona.", MessageVisibility.Public);
            for (const player of alivePlayers) {
                // Human prompt handled by game.requestPlayerAction now
                // const gameState = game.generateVisibleGameState(player.id); // Still needed for AI
                const action = await game.requestPlayerAction(player, ['message', 'noAction']); // Use new method
                actions.set(player.id, action);
                if (action.type === 'message') {
                    game.logMessage(player.id, action.content, MessageVisibility.Public);
                }
            }
            game.logMessage(null, "Introductions complete. The discussion phase now begins.", MessageVisibility.Public);
        }

        // --- General Discussion Phase (Round 2+) ---
        if (game.round > 1) {
            game.logMessage(null, "Discussion phase:", MessageVisibility.Public);
            for (const player of alivePlayers) {
                // Human prompt handled by game.requestPlayerAction now
                // const gameState = game.generateVisibleGameState(player.id); // Still needed for AI
                const action = await game.requestPlayerAction(player, ['message', 'noAction']); // Use new method
                actions.set(player.id, action);
                if (action.type === 'message') {
                    game.logMessage(player.id, action.content, MessageVisibility.Public);
                }
            }
             game.logMessage(null, "Discussion complete. Proceeding to vote.", MessageVisibility.Public); // Log end of discussion
        }

        // --- Voting Phase ---
        game.logMessage(null, "Voting phase: Choose who to execute.", MessageVisibility.Public);
        for (const player of alivePlayers) {
            // Human prompt handled by game.requestPlayerAction now
            // const gameState = game.generateVisibleGameState(player.id); // Still needed for AI
            const action = await game.requestPlayerAction(player, ['vote', 'noAction']); // Use new method
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
                    const invalidTargetName = action.targetPlayerId ?? 'unknown';
                    game.logMessage(player.id, `tried to vote for invalid target (${invalidTargetName}), vote counts as abstain.`, MessageVisibility.Public);
                }
            } else { // Handle noAction during voting
                 votes.set(player.id, null); // No vote action = abstain
                 game.logMessage(player.id, "abstains from voting.", MessageVisibility.Public);
            }
        }

        // --- Tally Votes & Determine Execution --- (Keep existing logic)
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

        const alivePlayerCount = game.getAlivePlayers().length;
        const majorityThreshold = Math.floor(alivePlayerCount / 2) + 1;

        let executedPlayerId: PlayerId | null = null;
        if (maxVotes >= majorityThreshold && playersToExecute.length === 1) { 
            executedPlayerId = playersToExecute[0];
            const executedPlayerName = game.getPlayer(executedPlayerId)?.name ?? executedPlayerId;
            game.logMessage(null, `With ${maxVotes} votes, the town has decided to execute ${executedPlayerName}.`, MessageVisibility.Public);
            game.killPlayer(executedPlayerId, "was executed by popular vote.");
        } else if (maxVotes > 0 && (playersToExecute.length > 1 || maxVotes < majorityThreshold)) { 
             const tiedNames = playersToExecute.map(id => game.getPlayer(id)?.name ?? id).join(', ');
             const reason = maxVotes < majorityThreshold ? "did not reach a majority" : `resulted in a tie between ${tiedNames}`;
             game.logMessage(null, `The vote ${reason}. No one is executed.`, MessageVisibility.Public);
        } else { 
            game.logMessage(null, "The town cast no deciding votes. No one is executed.", MessageVisibility.Public);
        }

        game.notifyRenderers('renderVoteResults', votes, executedPlayerId);
        game.recordVoteResultsInMemory(votes);
    }

    transition(game: Game): AbstractGamePhase {
        return new NightPhase();
    }
}
