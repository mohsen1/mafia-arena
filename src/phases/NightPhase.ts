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

        const alivePlayers = game.getAlivePlayers();
        const aliveMafia = alivePlayers.filter(p => p.role.name === RoleName.Mafia);
        const otherNightRoles = alivePlayers.filter(p => p.role.canPerformNightAction && p.role.name !== RoleName.Mafia);

        const actions = new Map<PlayerId, PlayerAction>(); // Stores final actions (kill, save, investigate)
        const mafiaVotes = new Map<PlayerId, PlayerId>(); // MafiaId -> TargetId
        let doctorSaveTarget: PlayerId | null = null;
        let seerInvestigationTarget: PlayerId | null = null;
        let seerPlayerId: PlayerId | null = null;

        // ---------------------------------------
        // 1. Mafia Discussion Phase
        // ---------------------------------------
        if (aliveMafia.length > 0) {
             game.logMessage(null, "The Mafia convenes to discuss...", MessageVisibility.Mafia);
             const discussionAllowedActions: PlayerAction['type'][] = ['message', 'noAction'];
             for (const mafiaPlayer of aliveMafia) {
                 // Humans don't need specific prompts here unless we want dedicated discussion UI
                 const gameState = game.generateVisibleGameState(mafiaPlayer.id);
                 // Add emphasis here - corrected logMessage call
                 game.logMessage(null, `(${mafiaPlayer.name}) Discuss now. Only 'message' or 'noAction' allowed. Voting is next.`, MessageVisibility.Private);
                 const action = await mafiaPlayer.decideAction(gameState, discussionAllowedActions);
                 if (action.type === 'message') {
                     game.logMessage(mafiaPlayer.id, action.content, MessageVisibility.Mafia);
                 }
                 // 'noAction' is implicitly handled
             }
             game.logMessage(null, "Mafia discussion concludes. Time to vote.", MessageVisibility.Mafia);
        }


        // ---------------------------------------
        // 2. Collect Night Actions (Mafia Vote + Other Roles)
        // ---------------------------------------
        const actionPromises: Promise<void>[] = [];

        // --- Mafia Voting ---
        const mafiaVotePromises = aliveMafia.map(async (mafiaPlayer) => {
             const gameState = game.generateVisibleGameState(mafiaPlayer.id);
             // Handle Human Mafia voting prompt if needed (similar logic as before)
              if (mafiaPlayer.agent instanceof HumanAgent) {
                 const aliveOthersInfo = Array.from(gameState.alivePlayerIds)
                    .filter(id => id !== mafiaPlayer.id)
                    .map(id => gameState.players.find(p => p.id === id)!);
                const potentialTargets = aliveOthersInfo.filter(p => !gameState.mafiaPlayerIds?.has(p.id));
                let prompt = `\n--- ${mafiaPlayer.name} (${mafiaPlayer.id}) - Mafia Kill Vote ---\n`;
                if (potentialTargets.length > 0) {
                    prompt += "Choose player to kill:\n";
                    potentialTargets.forEach((p, i) => prompt += `${i + 1}: ${p.name}\n`);
                    prompt += "Kill target index (or 0 for no kill): ";
                } else {
                    prompt += "No non-mafia targets available. (Press Enter for no kill)";
                }
                 game.notifyRenderers('renderNarration', prompt);
              }

             const votingAllowedActions: PlayerAction['type'][] = ['mafiaKill', 'noAction'];
             const action = await mafiaPlayer.decideAction(gameState, votingAllowedActions);
             actions.set(mafiaPlayer.id, action); // Store the action

             if (action.type === 'mafiaKill') {
                 const targetPlayer = game.getPlayer(action.targetPlayerId);
                 // Check if target is alive and not Mafia
                 if (targetPlayer?.isAlive() && targetPlayer.role.allegiance !== 'Mafia') {
                     mafiaVotes.set(mafiaPlayer.id, action.targetPlayerId);
                     game.logMessage(mafiaPlayer.id, `votes to kill ${targetPlayer.name}.`, MessageVisibility.Mafia);
                 } else if (targetPlayer?.isAlive() && targetPlayer.role.allegiance === 'Mafia') {
                    game.logMessage(mafiaPlayer.id, `attempted to vote for fellow Mafia member ${targetPlayer.name}. Vote ignored.`, MessageVisibility.Mafia);
                 } else {
                     game.logMessage(mafiaPlayer.id, "attempted an invalid kill vote.", MessageVisibility.Mafia);
                 }
             }
        });
        actionPromises.push(...mafiaVotePromises);


         // --- Other Night Roles ---
         const otherRolePromises = otherNightRoles.map(async (player) => {
             const gameState = game.generateVisibleGameState(player.id);
              // Handle Human prompts for Doctor/Seer (similar logic as before)
             if (player.agent instanceof HumanAgent) {
                 if (gameState.self.role === RoleName.Doctor) {
                    const aliveOthersInfo = Array.from(gameState.alivePlayerIds).map(id => gameState.players.find(p => p.id === id)!); // Allow self-save?
                    let prompt = `\n--- ${player.name} (${player.id}) - Doctor Night Action ---\n`;
                    if (aliveOthersInfo.length > 0) {
                        prompt += "Choose player to save:\n";
                        aliveOthersInfo.forEach((p, i) => prompt += `${i + 1}: ${p.name}\n`);
                        prompt += "Save target index (or 0 for no save): ";
                    } else { prompt += "No one to save. (Press Enter)"; }
                    game.notifyRenderers('renderNarration', prompt);
                 } else if (gameState.self.role === RoleName.Seer) {
                     const aliveOthersInfo = Array.from(gameState.alivePlayerIds).filter(id => id !== player.id).map(id => gameState.players.find(p => p.id === id)!);
                     let prompt = `\n--- ${player.name} (${player.id}) - Seer Night Action ---\n`;
                     if (aliveOthersInfo.length > 0) {
                         prompt += "Choose player to investigate:\n";
                         aliveOthersInfo.forEach((p, i) => prompt += `${i + 1}: ${p.name}\n`);
                         prompt += "Investigate target index (or 0 for no investigation): ";
                     } else { prompt += "No one to investigate. (Press Enter)"; }
                     game.notifyRenderers('renderNarration', prompt);
                 } else {
                     game.notifyRenderers('renderNarration', `\n--- ${player.name} (${player.id}) - Night Action ---\nYou rest. (Press Enter)`);
                 }
             }

             let nightAllowedActions: PlayerAction['type'][] = ['noAction']; // Default
             if (player.role.name === RoleName.Doctor) {
                 nightAllowedActions = ['doctorSave', 'noAction'];
             } else if (player.role.name === RoleName.Seer) {
                 nightAllowedActions = ['seerInvestigate', 'noAction'];
             }

             const action = await player.decideAction(gameState, nightAllowedActions);
             actions.set(player.id, action); // Store the action

             // Handle specific actions (only store results, logging happens later or is private)
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
         });
         actionPromises.push(...otherRolePromises);


        // Wait for all actions/votes to be decided
        await Promise.all(actionPromises);


        // ---------------------------------------
        // 3. Process Mafia Kill Vote (Consolidate Votes)
        // ---------------------------------------
        let finalMafiaKillTarget: PlayerId | null = null;
        if (mafiaVotes.size > 0) {
             // (Keep the existing logic for tallying votes)
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
                    // Handle ties consistently (e.g., first to reach max, random, or no kill on tie)
                    // Current: picks the first one added at max votes. Let's keep it simple.
                    // If you want random tie breaking:
                    // if (count === maxVotes) { finalTargets.push(targetId); }
                    // After loop: if (finalTargets.length > 1) { finalMafiaKillTarget = finalTargets[Math.floor(Math.random() * finalTargets.length)]; }
                }
            }

            if (finalTargets.length > 0) {
                // If tied, pick the first target who reached max votes (or implement tie-breaking)
                finalMafiaKillTarget = finalTargets[0];
                game.logMessage(null, "The Mafia has chosen their target.", MessageVisibility.Mafia);
            } else {
                game.logMessage(null, "The Mafia votes resulted in no kill.", MessageVisibility.Mafia); // Should not happen if mafiaVotes.size > 0 unless logic error
            }

            // Log a summary of the Mafia vote for Mafia members (existing logic is good)
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
                voteSummary += "Result: No kill target chosen (tie or no votes).";
            }
            game.logMessage(null, voteSummary, MessageVisibility.Mafia);

        } else if (aliveMafia.length > 0) {
             // Log if Mafia exist but didn't vote successfully
             game.logMessage(null, "The Mafia did not successfully vote to kill anyone.", MessageVisibility.Mafia);
        }


         // ---------------------------------------
        // 4. Resolve Night Actions (Save -> Kill -> Investigate)
        // ---------------------------------------
        // (Keep existing logic for Save, Kill, Investigate resolution)
        let playerKilledTonight: PlayerId | null = null;
        let savedPlayerId: PlayerId | null = doctorSaveTarget;
        let actualKillTarget: PlayerId | null = finalMafiaKillTarget;

        // Apply Doctor Save
        if (savedPlayerId && actualKillTarget === savedPlayerId) {
            game.logMessage(null, "The Doctor successfully saved someone!", MessageVisibility.Public); // Public knowledge of save, not target
            actualKillTarget = null; // Kill is prevented
        }

        // Process Kill
        if (actualKillTarget !== null) {
             const targetPlayer = game.getPlayer(actualKillTarget);
             if (targetPlayer && targetPlayer.isAlive()){
                   playerKilledTonight = actualKillTarget;
                   game.killPlayer(playerKilledTonight, "was killed during the night.");
             }
        } else {
            playerKilledTonight = null;
        }

       // Process Seer Investigation & record result in Seer's memory
       if (seerInvestigationTarget && seerPlayerId) {
           const targetPlayer = game.getPlayer(seerInvestigationTarget);
           const seer = game.getPlayer(seerPlayerId);
           if (targetPlayer && seer) {
               const allegiance = targetPlayer.role.allegiance;
               game.recordSeerResultInMemory(seerPlayerId, seerInvestigationTarget, allegiance);
               // Seer result is private, logged during action decision now
               // game.logMessage(null, `Seer ${seer.name} performed their investigation.`, MessageVisibility.Private); // Can remove if logged earlier
           }
       }

       // Record kill result (or lack thereof) in memory for all agents
       game.recordKillInMemory(playerKilledTonight);

       // ---------------------------------------
       // 5. Announce Public Night Results
       // ---------------------------------------
       game.logMessage(null, "Dawn breaks.", MessageVisibility.Public);
       // Kill message is handled by killPlayer
       if (!playerKilledTonight && finalMafiaKillTarget) {
            // Announce if a kill was attempted but prevented (by save)
             game.logMessage(null, "Someone was attacked, but they survived!", MessageVisibility.Public);
       } else if (!playerKilledTonight && !finalMafiaKillTarget && aliveMafia.length > 0) {
           // Announce if Mafia didn't kill anyone
            game.logMessage(null, "The night passed peacefully...", MessageVisibility.Public);
       } else if (!playerKilledTonight && aliveMafia.length === 0) {
           // Announce if no Mafia left
            game.logMessage(null, "The night passed peacefully...", MessageVisibility.Public);
       }
       // No explicit message needed if someone *was* killed, killPlayer handles it.

       game.notifyRenderers('renderNightResults', playerKilledTonight);
    }

    transition(game: Game): AbstractGamePhase {
        // After Night, always go back to Day
        return new DayPhase();
    }
}
