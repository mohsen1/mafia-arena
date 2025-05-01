import  { AbstractGamePhase } from './AbstractGamePhase';
import type { Game } from '../core/Game';
import type { GamePhaseType } from '../interfaces/IGamePhase';
import { DayPhase } from './DayPhase';
import type { PlayerAction } from '../interfaces/IAgent';
import type { PlayerId } from '../interfaces/IPlayer';
import  { MessageVisibility } from '../interfaces/IMessage';
import { RoleName } from '../interfaces/IRole';

export class NightPhase extends AbstractGamePhase {
    readonly type: GamePhaseType = 'Night';

    async runPhase(game: Game): Promise<void> {
        game.logMessage(null, "Night falls. Silence descends...", MessageVisibility.Public);

        const alivePlayers = game.getAlivePlayers();
        const aliveMafia = alivePlayers.filter(p => p.role.name === RoleName.Mafia);
        const otherNightRoles = alivePlayers.filter(p => p.role.canPerformNightAction && p.role.name !== RoleName.Mafia);

        const actions = new Map<PlayerId, PlayerAction>(); // Stores final actions (kill, save, investigate)
        const mafiaVotes = new Map<PlayerId, PlayerId>(); // MafiaId -> TargetId
        let doctorSaveTarget: PlayerId | null = null;
        let seerInvestigationTarget: PlayerId | null = null;
        let seerPlayerId: PlayerId | null = null;

        // ---------------------------------------
        // 1. Mafia Discussion Phase (Optional - can be handled by agents)
        // ---------------------------------------
        if (aliveMafia.length > 0) {
             game.logMessage(null, "The Mafia convenes...", MessageVisibility.Mafia);
             const discussionAllowedActions: PlayerAction['type'][] = ['message', 'noAction'];
             for (const mafiaPlayer of aliveMafia) {
                 // Human prompt handled by game.requestPlayerAction
                 // const gameState = game.generateVisibleGameState(mafiaPlayer.id);
                 // game.logMessage(null, `(${mafiaPlayer.name}) Discuss now...`, MessageVisibility.Private); // Maybe confusing?
                 const action = await game.requestPlayerAction(mafiaPlayer, discussionAllowedActions); // Use new method
                 if (action.type === 'message') {
                     game.logMessage(mafiaPlayer.id, action.content, MessageVisibility.Mafia);
                 }
             }
             game.logMessage(null, "Mafia discussion concludes. Time to choose a target.", MessageVisibility.Mafia);
        }

        // ---------------------------------------
        // 2. Collect Night Actions (Mafia Vote + Other Roles)
        // ---------------------------------------
        const actionPromises: Promise<void>[] = [];

        // --- Mafia Voting ---
        const mafiaVotePromises = aliveMafia.map(async (mafiaPlayer) => {
             // Human prompt handled by game.requestPlayerAction
             // const gameState = game.generateVisibleGameState(mafiaPlayer.id);
             const votingAllowedActions: PlayerAction['type'][] = ['mafiaKill', 'noAction'];
             const action = await game.requestPlayerAction(mafiaPlayer, votingAllowedActions); // Use new method
             actions.set(mafiaPlayer.id, action); // Store the action

             if (action.type === 'mafiaKill') {
                 const targetPlayer = game.getPlayer(action.targetPlayerId);
                 if (targetPlayer?.isAlive() && targetPlayer.role.allegiance !== 'Mafia') {
                     mafiaVotes.set(mafiaPlayer.id, action.targetPlayerId);
                     game.logMessage(mafiaPlayer.id, `votes to kill ${targetPlayer.name}.`, MessageVisibility.Mafia);
                 } else if (targetPlayer?.isAlive() && targetPlayer.role.allegiance === 'Mafia') {
                    game.logMessage(mafiaPlayer.id, `attempted to vote for fellow Mafia member ${targetPlayer.name}. Vote ignored.`, MessageVisibility.Mafia);
                 } else {
                     const invalidTargetName = action.targetPlayerId ?? 'unknown';
                     game.logMessage(mafiaPlayer.id, `attempted an invalid kill vote (${invalidTargetName}).`, MessageVisibility.Mafia);
                 }
             } else {
                 game.logMessage(mafiaPlayer.id, 'chooses not to vote for a kill.', MessageVisibility.Mafia);
             }
        });
        actionPromises.push(...mafiaVotePromises);

         // --- Other Night Roles ---
         const otherRolePromises = otherNightRoles.map(async (player) => {
             // Human prompt handled by game.requestPlayerAction
             // const gameState = game.generateVisibleGameState(player.id);

             let nightAllowedActions: PlayerAction['type'][] = ['noAction']; // Default
             if (player.role.name === RoleName.Doctor) {
                 nightAllowedActions = ['doctorSave', 'noAction'];
             } else if (player.role.name === RoleName.Seer) {
                 nightAllowedActions = ['seerInvestigate', 'noAction'];
             }

             const action = await game.requestPlayerAction(player, nightAllowedActions); // Use new method
             actions.set(player.id, action); // Store the action

             // Handle specific actions
             if (action.type === 'doctorSave') {
                 if (action.targetPlayerId) {
                     const targetPlayer = game.getPlayer(action.targetPlayerId);
                      if (targetPlayer?.isAlive()) {
                         doctorSaveTarget = action.targetPlayerId;
                         game.logMessage(player.id, `decides to protect someone.`, MessageVisibility.Private); // Log privately
                     } else {
                          game.logMessage(player.id, `attempted to save an invalid target.`, MessageVisibility.Private);
                     }
                 } else {
                      game.logMessage(player.id, `chooses not to save anyone tonight.`, MessageVisibility.Private);
                 }
             } else if (action.type === 'seerInvestigate') {
                 if (action.targetPlayerId) {
                     const targetPlayer = game.getPlayer(action.targetPlayerId);
                     if (targetPlayer?.isAlive()) {
                         seerInvestigationTarget = action.targetPlayerId;
                         seerPlayerId = player.id;
                          game.logMessage(player.id, `decides to investigate someone.`, MessageVisibility.Private); // Log privately
                     } else {
                          game.logMessage(player.id, `attempted to investigate an invalid target.`, MessageVisibility.Private);
                     }
                 } else {
                     game.logMessage(player.id, `chooses not to investigate anyone tonight.`, MessageVisibility.Private);
                 }
             }
             // No explicit handling needed for noAction here
         });
         actionPromises.push(...otherRolePromises);

        // Wait for all actions/votes to be decided
        await Promise.all(actionPromises);

        // ---------------------------------------
        // 3. Process Mafia Kill Vote (Consolidate Votes)
        // ---------------------------------------
        let finalMafiaKillTarget: PlayerId | null = null;
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
                    // Simplest tie-break: first to reach max wins. Could be randomized.
                    finalTargets.push(targetId); // Keep track if randomization needed
                }
            }
            // If tied, just pick the first one. Could add random tie-breaking here.
            finalMafiaKillTarget = finalTargets[0] ?? null;

            if (finalMafiaKillTarget) {
                 game.logMessage(null, "The Mafia has chosen their target.", MessageVisibility.Mafia);
                 // Log summary for Mafia (optional)
                 let voteSummary = "Mafia Kill Vote Summary:\n";
                 for (const [voterId, targetId] of mafiaVotes.entries()) {
                     const voterName = game.getPlayer(voterId)?.name ?? voterId;
                     const targetName = game.getPlayer(targetId)?.name ?? targetId;
                     voteSummary += `- ${voterName} voted for ${targetName}\n`;
                 }
                  const finalTargetName = game.getPlayer(finalMafiaKillTarget)?.name ?? finalMafiaKillTarget;
                 voteSummary += `Result: The chosen target is ${finalTargetName}.`;
                 game.logMessage(null, voteSummary, MessageVisibility.Mafia);
            } else {
                 game.logMessage(null, "The Mafia votes resulted in no kill target (tie or no votes).", MessageVisibility.Mafia);
            }

        } else if (aliveMafia.length > 0) {
             game.logMessage(null, "The Mafia exists but did not successfully vote to kill anyone.", MessageVisibility.Mafia);
        }

         // ---------------------------------------
        // 4. Resolve Night Actions (Save -> Kill -> Investigate)
        // ---------------------------------------
        let playerKilledTonight: PlayerId | null = null;
        const savedPlayerId: PlayerId | null = doctorSaveTarget;
        let actualKillTarget: PlayerId | null = finalMafiaKillTarget;

        // Apply Doctor Save
        if (savedPlayerId && actualKillTarget === savedPlayerId) {
            game.logMessage(null, "Someone was attacked, but the Doctor saved them!", MessageVisibility.Public);
            actualKillTarget = null; // Kill is prevented
        }

        // Process Kill
        if (actualKillTarget !== null) {
             const targetPlayer = game.getPlayer(actualKillTarget);
             if (targetPlayer && targetPlayer.isAlive()){ // Check again if target still alive (edge case)
                   playerKilledTonight = actualKillTarget;
                   game.killPlayer(playerKilledTonight, "was killed during the night.");
             }
        } 

       // Process Seer Investigation & record result in Seer's memory
       if (seerInvestigationTarget && seerPlayerId) {
           const targetPlayer = game.getPlayer(seerInvestigationTarget);
           const seer = game.getPlayer(seerPlayerId);
           if (targetPlayer && seer?.isAlive()) { // Ensure seer is still alive
               const allegiance = targetPlayer.role.allegiance;
               game.recordSeerResultInMemory(seerPlayerId, seerInvestigationTarget, allegiance);
               // Result revealed to seer via gameState in next phase's decideAction call
               game.logMessage(null, `The Seer investigates...`, MessageVisibility.Private); // Generic private log
           }
       }

       game.recordKillInMemory(playerKilledTonight); // Record null if no one died

       // ---------------------------------------
       // 5. Announce Public Night Results
       // ---------------------------------------
       game.logMessage(null, "Dawn breaks.", MessageVisibility.Public);
       // Kill message is handled by killPlayer, no need to repeat unless saved
       if (!playerKilledTonight && finalMafiaKillTarget && savedPlayerId === finalMafiaKillTarget) {
            // Already announced save
       } else if (!playerKilledTonight) {
           // Announce if no one died (either no kill attempt, or Mafia is gone)
           game.logMessage(null, "The night passed without any casualties.", MessageVisibility.Public);
       }

       game.notifyRenderers('renderNightResults', playerKilledTonight);
    }

    transition(_game: Game): AbstractGamePhase {
        return new DayPhase();
    }
}
