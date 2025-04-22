import { AbstractGamePhase } from './AbstractGamePhase';
import type { Game } from '../core/Game';
import type { GamePhaseType } from '../interfaces/IGamePhase';
import { NightPhase } from './NightPhase';
import type { PlayerAction } from '../interfaces/IAgent';
import type { PlayerId } from '../interfaces/IPlayer';
import { MessageVisibility } from '../interfaces/IMessage';
import { HumanAgent } from '../agents/HumanAgent';

export class DayPhase extends AbstractGamePhase {
    readonly type: GamePhaseType = 'Day';

    async runPhase(game: Game): Promise<void> {
        game.logMessage(null, "Day begins. Discuss and decide who to execute.", MessageVisibility.Public);
        game.clearDayVoteResults(); // Clear results from previous day

        const alivePlayers = game.getAlivePlayers();
        const actions = new Map<PlayerId, PlayerAction>();
        const votes = new Map<PlayerId, PlayerId | null>(); // PlayerId -> VotedForPlayerId | null

        // 1. Discussion / Message Sending (Optional - could be multiple rounds)
        // For simplicity, one round of messages first
        game.logMessage(null, "Discussion phase:", MessageVisibility.Public);
        for (const player of alivePlayers) {
            const gameState = game.generateVisibleGameState(player.id);
            
            // Check if human agent and prompt if needed
            if (player.agent instanceof HumanAgent) {
                const aliveOthersInfo = Array.from(gameState.alivePlayerIds)
                    .filter(id => id !== player.id)
                    .map(id => gameState.players.find(p => p.id === id)!);
                
                let prompt = `\n--- ${player.name} (${player.id}) - Your turn! ---\n`;
                prompt += `Phase: ${gameState.phase}, Round: ${gameState.round}\n`;
                prompt += `Your Role: ${gameState.self.role}\n`;
                if (gameState.self.isMafia) {
                    prompt += `Your fellow Mafia (alive): ${Array.from(gameState.mafiaPlayerIds ?? []).join(', ')}\n`;
                }
                prompt += `Alive Players: ${Array.from(gameState.alivePlayerIds).map(id => gameState.players.find(p=>p.id===id)?.name ?? id).join(', ')}\n`;
                prompt += "--------------------------------------------------\n";
                prompt += "What do you want to say?";
                game.notifyRenderers('renderNarration', prompt); // Use renderNarration to display prompt
            }

            // Pass allowed actions for discussion
            const action = await player.decideAction(gameState, ['message', 'noAction']);
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
            
            // Check if human agent and prompt if needed
            if (player.agent instanceof HumanAgent) {
                const aliveOthersInfo = Array.from(gameState.alivePlayerIds)
                    .filter(id => id !== player.id)
                    .map(id => gameState.players.find(p => p.id === id)!);
                
                let prompt = "\nVote Action:\n";
                if (aliveOthersInfo.length > 0) {
                    prompt += "Choose player to vote for:\n";
                    aliveOthersInfo.forEach((p, i) => prompt += `${i + 1}: ${p.name}\n`);
                    prompt += "Action? (v [player index] / n [no action])";
                } else {
                     prompt += "No one else to vote for. (n [no action])";
                }
                game.notifyRenderers('renderNarration', prompt); // Use renderNarration to display prompt
            }

             // Ask again, expecting a vote this time
            const action = await player.decideAction(gameState, ['vote', 'noAction']);
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
        const alivePlayerCount = game.getAlivePlayers().length;
        const majorityThreshold = Math.floor(alivePlayerCount / 2) + 1; // Need > 50%

        let executedPlayerId: PlayerId | null = null;
        if (maxVotes >= majorityThreshold && playersToExecute.length === 1) { // Check for majority
            executedPlayerId = playersToExecute[0];
            const executedPlayerName = game.getPlayer(executedPlayerId)?.name ?? executedPlayerId;
            game.logMessage(null, `With ${maxVotes} votes, the town has decided to execute ${executedPlayerName}.`, MessageVisibility.Public);
            game.killPlayer(executedPlayerId, "was executed by popular vote.");
        } else if (maxVotes > 0 && (playersToExecute.length > 1 || maxVotes < majorityThreshold)) { // Handle tie or no majority
             const tiedNames = playersToExecute.map(id => game.getPlayer(id)?.name ?? id).join(', ');
             const reason = maxVotes < majorityThreshold ? "did not reach a majority" : `resulted in a tie between ${tiedNames}`;
             game.logMessage(null, `The vote ${reason}. No one is executed.`, MessageVisibility.Public);
        } else { // No votes cast or only abstains
            game.logMessage(null, "The town cast no deciding votes. No one is executed.", MessageVisibility.Public);
        }

        // Notify renderers about vote outcome
        game.notifyRenderers('renderVoteResults', votes, executedPlayerId);

        // Store vote results for next phase's state generation
        game.setDayVoteResults(votes);
    }

    transition(game: Game): AbstractGamePhase {
        // After Day, always go to Night
        return new NightPhase();
    }
}
