import  { AbstractGamePhase } from './AbstractGamePhase';
import type { Game } from '../core/Game';
import type { GamePhaseType } from '../interfaces/IGamePhase';
import { DayPhase } from './DayPhase';
import type { PlayerAction } from '../interfaces/IAgent';
import type { PlayerId } from '../interfaces/IPlayer';
import  { MessageVisibility } from '../interfaces/IMessage';

export class NightPhase extends AbstractGamePhase {
    readonly type: GamePhaseType = 'Night';

    async runPhase(game: Game): Promise<void> {
        game.logMessage(null, "Night falls. Silence descends...", MessageVisibility.Public);

        const alivePlayers = game.getAlivePlayers();
        const actions = new Map<PlayerId, PlayerAction>();
        let mafiaKillTarget: PlayerId | null = null;
        const mafiaVotes = new Map<PlayerId, PlayerId>(); // MafiaId -> TargetId

        // 1. Collect Night Actions (Mafia Kill, Doctor Save, Detective Investigate etc.)
        for (const player of alivePlayers) {
            // Only ask players whose roles CAN act at night
            if (player.role.canPerformNightAction) {
                 const gameState = game.generateVisibleGameState(player.id);
                 const action = await player.decideAction(gameState);
                 actions.set(player.id, action);

                 // Handle specific actions
                 if (action.type === 'mafiaKill' && player.role.name === 'Mafia') {
                      // Ensure target is valid and alive (and ideally not mafia)
                     const targetPlayer = game.getPlayer(action.targetPlayerId);
                     if (targetPlayer?.isAlive()) { // Basic validation
                         mafiaVotes.set(player.id, action.targetPlayerId);
                         // Log Mafia communication (only visible to Mafia)
                         game.logMessage(player.id, `votes to kill ${targetPlayer.name}.`, MessageVisibility.Mafia);
                     } else {
                         // Log invalid action attempt? Maybe only internally.
                         game.logMessage(player.id, "attempted an invalid kill.", MessageVisibility.Mafia);
                     }
                 } else if (action.type === 'message' && player.role.name === 'Mafia') {
                     // Allow Mafia night chat
                     game.logMessage(player.id, action.content, MessageVisibility.Mafia);
                 }
                 // TODO: Handle other roles (Doctor save, Detective check) here
            }
        }

         // 2. Process Mafia Kill Vote
         if (mafiaVotes.size > 0) {
             const killVoteCounts = new Map<PlayerId, number>();
             let maxVotes = 0;
             let finalTargets: PlayerId[] = [];

             for (const targetId of mafiaVotes.values()) {
                 const count = (killVoteCounts.get(targetId) || 0) + 1;
                 killVoteCounts.set(targetId, count);
                 if (count > maxVotes) {
                     maxVotes = count;
                     finalTargets = [targetId];
                 } else if (count === maxVotes) {
                     finalTargets.push(targetId);
                 }
             }

             // Simple majority wins. Handle ties? (e.g., random choice, or no kill on tie)
             // For now, pick the first one in case of a tie.
             if (finalTargets.length > 0) {
                 mafiaKillTarget = finalTargets[0]; // Could be random: finalTargets[Math.floor(Math.random()*finalTargets.length)];
                  game.logMessage(null, "The Mafia has chosen their target.", MessageVisibility.Mafia); // Mafia internal log
             } else {
                 game.logMessage(null, "The Mafia could not agree on a target.", MessageVisibility.Mafia);
             }
         }


         // 3. Resolve Night Actions
         // Order matters! (e.g., Doctor save before kill is processed)
         let playerKilledTonight: PlayerId | null = null;

         // TODO: Apply Doctor save here, potentially nullifying mafiaKillTarget

         if (mafiaKillTarget) {
              const targetPlayer = game.getPlayer(mafiaKillTarget);
              if(targetPlayer && targetPlayer.isAlive()){ // Check if still alive (maybe saved?)
                    playerKilledTonight = mafiaKillTarget;
                    // Don't reveal killer, just the result
                    // The actual kill message and role reveal happens in killPlayer()
                    game.killPlayer(playerKilledTonight, "was killed during the night.");
              }
         }

        // TODO: Process Detective investigation results (send privately to detective)


        // 4. Announce Public Night Results
        game.logMessage(null, "Dawn breaks.", MessageVisibility.Public);
        if (!playerKilledTonight) {
             game.logMessage(null, "Everyone survived the night.", MessageVisibility.Public);
        }
        // Kill message is handled by killPlayer, which logs publicly

        game.notifyRenderers('renderNightResults', playerKilledTonight);
    }

    transition(game: Game): AbstractGamePhase {
        // After Night, always go back to Day
        return new DayPhase();
    }
}
