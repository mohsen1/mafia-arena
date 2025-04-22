import  { AbstractGamePhase } from './AbstractGamePhase';
import type { Game } from '../core/Game';
import type { GamePhaseType } from '../interfaces/IGamePhase';
import { DayPhase } from './DayPhase';
import type { PlayerAction } from '../interfaces/IAgent';
import type { PlayerId } from '../interfaces/IPlayer';
import  { MessageVisibility } from '../interfaces/IMessage';
import { HumanAgent } from '../agents/HumanAgent';
import { RoleName } from '../interfaces/IRole';

export class NightPhase extends AbstractGamePhase {
    readonly type: GamePhaseType = 'Night';

    async runPhase(game: Game): Promise<void> {
        game.logMessage(null, "Night falls. Silence descends...", MessageVisibility.Public);
        // game.clearNightResults(); // No longer needed - memory is cumulative

        const alivePlayers = game.getAlivePlayers();
        const actions = new Map<PlayerId, PlayerAction>();
        const mafiaVotes = new Map<PlayerId, PlayerId>(); // MafiaId -> TargetId
        let doctorSaveTarget: PlayerId | null = null;
        let seerInvestigationTarget: PlayerId | null = null;
        let seerPlayerId: PlayerId | null = null;

        // 1. Collect Night Actions (Mafia Kill, Doctor Save, Seer Investigate etc.)
        for (const player of alivePlayers) {
            // Only ask players whose roles CAN act at night
            if (player.role.canPerformNightAction) {
                 const gameState = game.generateVisibleGameState(player.id);

                 // Check if human agent and prompt if needed
                 if (player.agent instanceof HumanAgent) {
                     if (gameState.self.isMafia) {
                         const aliveOthersInfo = Array.from(gameState.alivePlayerIds)
                             .filter(id => id !== player.id)
                             .map(id => gameState.players.find(p => p.id === id)!);
                         const potentialTargets = aliveOthersInfo.filter(p => !gameState.mafiaPlayerIds?.has(p.id));
                         
                         let prompt = `\n--- ${player.name} (${player.id}) - Mafia Night Action ---\n`;
                         if (potentialTargets.length > 0) {
                             prompt += "Choose player to kill:\n";
                             potentialTargets.forEach((p, i) => prompt += `${i + 1}: ${p.name}\n`);
                             prompt += "Kill target index (or 0 for no kill): ";
                         } else {
                             prompt += "No non-mafia targets available. (Press Enter to continue)";
                         }
                          game.notifyRenderers('renderNarration', prompt); // Use renderNarration to display prompt
                     } else if (gameState.self.role === RoleName.Doctor) {
                          const aliveOthersInfo = Array.from(gameState.alivePlayerIds)
                             .filter(id => id !== player.id) // Doctors can potentially save themselves? Rule dependent.
                             .map(id => gameState.players.find(p => p.id === id)!);
                         let prompt = `\n--- ${player.name} (${player.id}) - Doctor Night Action ---\n`;
                         if (aliveOthersInfo.length > 0) {
                             prompt += "Choose player to save:\n";
                             aliveOthersInfo.forEach((p, i) => prompt += `${i + 1}: ${p.name}\n`);
                             prompt += "Save target index (or 0 for no save): ";
                         } else {
                             prompt += "No one else alive to save. (Press Enter to continue)";
                         }
                          game.notifyRenderers('renderNarration', prompt);
                     } else if (gameState.self.role === RoleName.Seer) {
                         const aliveOthersInfo = Array.from(gameState.alivePlayerIds)
                             .filter(id => id !== player.id) // Seers typically cannot investigate themselves
                             .map(id => gameState.players.find(p => p.id === id)!);
                         let prompt = `\n--- ${player.name} (${player.id}) - Seer Night Action ---\n`;
                         if (aliveOthersInfo.length > 0) {
                             prompt += "Choose player to investigate:\n";
                             aliveOthersInfo.forEach((p, i) => prompt += `${i + 1}: ${p.name}\n`);
                             prompt += "Investigate target index (or 0 for no investigation): ";
                         } else {
                             prompt += "No one else alive to investigate. (Press Enter to continue)";
                         }
                         game.notifyRenderers('renderNarration', prompt);
                     } else {
                         // Prompt for other night roles if human
                         game.notifyRenderers('renderNarration', `\n--- ${player.name} (${player.id}) - Night Action ---\nYou rest during the night. (Press Enter to continue)`); 
                     }
                 }

                 // Determine allowed night actions based on role
                 let nightAllowedActions: PlayerAction['type'][] = ['noAction']; // Default
                 if (player.role.name === RoleName.Mafia) {
                     nightAllowedActions = ['mafiaKill', 'message', 'noAction']; // Allow kill or chat
                 } else if (player.role.name === RoleName.Doctor) {
                     nightAllowedActions = ['doctorSave', 'noAction'];
                 } else if (player.role.name === RoleName.Seer) {
                     nightAllowedActions = ['seerInvestigate', 'noAction'];
                 }
                 // Other roles default to just ['noAction'] if canPerformNightAction was somehow true

                 const action = await player.decideAction(gameState, nightAllowedActions);
                 actions.set(player.id, action);

                 // Handle specific actions
                 if (action.type === 'mafiaKill' && player.role.name === RoleName.Mafia) {
                     const targetPlayer = game.getPlayer(action.targetPlayerId);
                     if (targetPlayer?.isAlive()) { 
                         mafiaVotes.set(player.id, action.targetPlayerId);
                         game.logMessage(player.id, `votes to kill ${targetPlayer.name}.`, MessageVisibility.Mafia);
                     } else {
                         game.logMessage(player.id, "attempted an invalid kill.", MessageVisibility.Mafia);
                     }
                 } else if (action.type === 'message' && player.role.name === RoleName.Mafia) {
                     game.logMessage(player.id, action.content, MessageVisibility.Mafia);
                 } else if (action.type === 'doctorSave' && player.role.name === RoleName.Doctor) {
                     if (action.targetPlayerId) {
                         const targetPlayer = game.getPlayer(action.targetPlayerId);
                         if (targetPlayer?.isAlive()) {
                             doctorSaveTarget = action.targetPlayerId;
                             game.logMessage(player.id, `decides to protect ${targetPlayer.name}.`, MessageVisibility.Private); // Log privately
                         } else {
                              game.logMessage(player.id, `attempted to save an invalid target.`, MessageVisibility.Private);
                         }
                     } else {
                          game.logMessage(player.id, `chooses not to save anyone tonight.`, MessageVisibility.Private);
                     }
                 } else if (action.type === 'seerInvestigate' && player.role.name === RoleName.Seer) {
                      if (action.targetPlayerId) {
                         const targetPlayer = game.getPlayer(action.targetPlayerId);
                         if (targetPlayer?.isAlive()) {
                             seerInvestigationTarget = action.targetPlayerId;
                             seerPlayerId = player.id;
                             game.logMessage(player.id, `decides to investigate ${targetPlayer.name}.`, MessageVisibility.Private); // Log privately
                         } else {
                              game.logMessage(player.id, `attempted to investigate an invalid target.`, MessageVisibility.Private);
                         }
                     } else {
                         game.logMessage(player.id, `chooses not to investigate anyone tonight.`, MessageVisibility.Private);
                     }
                 }
            }
        }

         // 2. Process Mafia Kill Vote
         let finalMafiaKillTarget: PlayerId | null = null; // Renamed to avoid conflict
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

             if (finalTargets.length > 0) {
                 finalMafiaKillTarget = finalTargets[0]; 
                  game.logMessage(null, "The Mafia has chosen their target.", MessageVisibility.Mafia);
             } else {
                 game.logMessage(null, "The Mafia could not agree on a target.", MessageVisibility.Mafia);
             }

             // Log a summary of the Mafia vote for Mafia members
             if (mafiaVotes.size > 0) {
                let voteSummary = "Mafia Kill Vote Summary:\n";
                for (const [voterId, targetId] of mafiaVotes.entries()) {
                    const voterName = game.getPlayer(voterId)?.name ?? voterId;
                    const targetName = game.getPlayer(targetId)?.name ?? targetId;
                    voteSummary += `- ${voterName} voted for ${targetName}\n`;
                }
                if (finalMafiaKillTarget) {
                    const finalTargetName = game.getPlayer(finalMafiaKillTarget)?.name ?? finalMafiaKillTarget;
                    voteSummary += `Result: The chosen target is ${finalTargetName}.`;
                } else {
                    voteSummary += "Result: No consensus reached, no kill target chosen.";
                }
                 game.logMessage(null, voteSummary, MessageVisibility.Mafia); // Log summary only to Mafia
             } else if (game.getAliveMafia().length > 0) {
                 // Log if Mafia exist but didn't vote
                 game.logMessage(null, "The Mafia did not cast any votes to kill.", MessageVisibility.Mafia);
             }
         }


         // 3. Resolve Night Actions (Order: Save -> Kill -> Investigate)
         let playerKilledTonight: PlayerId | null = null;
         let savedPlayerId: PlayerId | null = doctorSaveTarget;
         let actualKillTarget: PlayerId | null = finalMafiaKillTarget;

         // Apply Doctor Save
         if (savedPlayerId && actualKillTarget === savedPlayerId) {
             game.logMessage(null, "The Doctor successfully saved someone!", MessageVisibility.Public); // Public knowledge of save, not target
             actualKillTarget = null; // Kill is prevented
         }

         // Process Kill
         if (actualKillTarget !== null) { // Check explicit null
              const targetPlayer = game.getPlayer(actualKillTarget);
              if (targetPlayer && targetPlayer.isAlive()){ 
                    playerKilledTonight = actualKillTarget;
                    game.killPlayer(playerKilledTonight, "was killed during the night.");
              }
         } else {
             // Ensure playerKilledTonight is null if kill was prevented or didn't happen
             playerKilledTonight = null;
         }

        // Process Seer Investigation & record result in Seer's memory
        if (seerInvestigationTarget && seerPlayerId) {
            const targetPlayer = game.getPlayer(seerInvestigationTarget);
            const seer = game.getPlayer(seerPlayerId);
            if (targetPlayer && seer) {
                const allegiance = targetPlayer.role.allegiance;
                // Record result specifically in the Seer's memory
                game.recordSeerResultInMemory(seerPlayerId, seerInvestigationTarget, allegiance);
                game.logMessage(null, `Seer ${seer.name} performed their investigation.`, MessageVisibility.Private);
            }
        }

        // Record kill result (or lack thereof) in memory for all agents
        game.recordKillInMemory(playerKilledTonight);

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
