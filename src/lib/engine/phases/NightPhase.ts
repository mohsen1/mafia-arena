import { AbstractGamePhase } from './AbstractGamePhase';
import type { Game } from '../core/Game';
import type { GamePhaseType } from '../interfaces/IGamePhase';
import { DayPhase } from './DayPhase';
import type { PlayerAction } from '../interfaces/IAgent';
import type { PlayerId, Player } from '../interfaces/IPlayer';
import { MessageVisibility } from '../interfaces/IMessage';
import { RoleName, Allegiance } from '../interfaces/IRole';

export class NightPhase extends AbstractGamePhase {
    readonly type: GamePhaseType = 'Night';

    // --- Phase State ---
    #mafiaVotes: Map<PlayerId, PlayerId | null> = new Map();
    #doctorSaveTarget: PlayerId | null = null;
    #seerInvestigationTarget: PlayerId | null = null;
    #seerPlayerId: PlayerId | null = null;
    #finalMafiaKillTarget: PlayerId | null = null;
    // Store list of players who need to act in other steps
    #otherNightRoles: Player[] = []; 

    async runStep(game: Game): Promise<void> {
        const step = game.getPhaseStep();
        const index = game.getNextPlayerIndexToAction();

        console.log(`NightPhase.runStep: Step=${step}, Index=${index}`);

        // Ensure players lists are up-to-date if needed at the start of a step
        const aliveMafia = game.getAlivePlayers().filter(p => p.role.name === RoleName.Mafia);

        switch (step) {
            case 'Start':
                this.resetPhaseState();
                game.logMessage(null, "Night falls. Silence descends...", MessageVisibility.Public);
                if (aliveMafia.length > 0) {
                    game.setPhaseStep('MafiaDiscussion');
                } else {
                    game.setPhaseStep('OtherActionsStart'); // Skip Mafia steps if none exist
                }
                game.setNextPlayerIndexToAction(0);
                break;

            case 'MafiaDiscussion':
                if (index === 0) { // Log only once
                    game.logMessage(null, "The Mafia convenes...", MessageVisibility.Mafia);
                }
                await this.handlePlayerAction(
                    game, index, aliveMafia, 
                    ['message', 'noAction'], 
                    'MafiaVoting' // Next step after discussion
                );
                break;

            case 'MafiaVoting':
                if (index === 0) { // Log only once
                    game.logMessage(null, "Mafia discussion concludes. Time to choose a target.", MessageVisibility.Mafia);
                }
                await this.handlePlayerAction(
                    game, index, aliveMafia, 
                    ['mafiaKill', 'noAction'], 
                    'ConsolidateMafiaVote' // Next step after voting
                );
                break;

            case 'ConsolidateMafiaVote':
                this.consolidateMafiaVotes(game);
                game.setPhaseStep('OtherActionsStart');
                game.setNextPlayerIndexToAction(0);
                break;

            case 'OtherActionsStart':
                this.#otherNightRoles = game.getAlivePlayers().filter(p => 
                    p.role.canPerformNightAction && p.role.name !== RoleName.Mafia
                );
                console.log(`NightPhase: Found ${this.#otherNightRoles.length} other roles with night actions.`);
                game.setPhaseStep('OtherActionsLoop');
                game.setNextPlayerIndexToAction(0);
                 // If no other actions, skip straight to resolve
                if (this.#otherNightRoles.length === 0) {
                    game.setPhaseStep('ResolveNight');
                }
                break;

            case 'OtherActionsLoop':
                // Use the stored list #otherNightRoles
                await this.handlePlayerAction(
                    game, index, this.#otherNightRoles, 
                    [], // Allowed actions determined dynamically inside handlePlayerAction
                    'ResolveNight' // Next step after all other actions
                );
                break;
            
            case 'ResolveNight':
                console.log("NightPhase: Resolving night actions...");
                this.resolveNightActions(game);
                game.setPhaseStep('Finished');
                game.setNextPlayerIndexToAction(0);
                break;

            case 'Finished':
                {
                    console.log("NightPhase: Finished step reached. Transitioning...");
                    const nextPhaseType = this.transition(game);
                    // Pass winner if transitioning to GameOver
                    const winner = nextPhaseType === 'GameOver' ? game.checkWinCondition() : undefined;
                    game.advanceToPhase(nextPhaseType, winner);
                    break;
                }

            default:
                console.error(`Unknown phase step in NightPhase: ${step}`);
                game.setPhaseStep('Finished');
                game.setNextPlayerIndexToAction(0);
        }
    }

    /** Resets internal state at the beginning of the phase */
    private resetPhaseState(): void {
        this.#mafiaVotes.clear();
        this.#doctorSaveTarget = null;
        this.#seerInvestigationTarget = null;
        this.#seerPlayerId = null;
        this.#finalMafiaKillTarget = null;
        this.#otherNightRoles = [];
    }

    /** Helper to handle requesting/processing action for one player */
    private async handlePlayerAction(
        game: Game,
        index: number,
        players: Player[], // Use full Player objects now
        allowedActions: PlayerAction['type'][],
        nextStep: string
    ): Promise<void> {
        const currentStep = game.getPhaseStep();

        if (index >= players.length) {
            // Finished this step for all relevant players
            let logMsg = `${currentStep} complete.`;
             if (currentStep === 'MafiaVoting') logMsg = "Mafia voting complete.";
             else if (currentStep === 'OtherActionsLoop') logMsg = "Other night actions complete.";
            
             // Log completion differently based on step
             if (currentStep === 'MafiaDiscussion' || currentStep === 'MafiaVoting') {
                 if (players.length > 0) game.logMessage(null, logMsg, MessageVisibility.Mafia);
             } else if (currentStep !== 'OtherActionsStart') { // Don't log for the start step
                  // Public log? Or maybe no log needed here?
                  // console.log(logMsg); 
             }

            game.setPhaseStep(nextStep); 
            game.setNextPlayerIndexToAction(0);
            return;
        }

        const player = players[index];
        if (!player || !player.isAlive()) { // Extra check for safety
            console.warn(`NightPhase.handlePlayerAction: Player ${player?.id} at index ${index} invalid or dead. Skipping.`);
            game.setNextPlayerIndexToAction(index + 1); // Skip invalid/dead player
            return;
        }

        // Determine allowed actions dynamically if needed (e.g., for OtherActionsLoop)
        if (currentStep === 'OtherActionsLoop') {
            allowedActions = ['noAction']; // Start with default
            if (player.role.name === RoleName.Doctor) {
                allowedActions = ['doctorSave', 'noAction'];
            } else if (player.role.name === RoleName.Seer) {
                allowedActions = ['seerInvestigate', 'noAction'];
            }
             // Add other roles here...
        }

        if (allowedActions.length === 0) { // Should not happen if logic is correct
             console.error(`NightPhase.handlePlayerAction: No allowed actions determined for player ${player.id} in step ${currentStep}. Skipping.`);
             game.setNextPlayerIndexToAction(index + 1);
             return;
         }

        const action = await game.requestPlayerAction(player, allowedActions);
        
        if (action.type !== 'humanActionRequired') {
            this.processAction(game, player.id, action);
            game.setNextPlayerIndexToAction(index + 1); 
        } 
        // Human action deferred, index not incremented
    }

     /** Helper to process a completed action (AI or submitted Human) */
     public processAction(game: Game, playerId: PlayerId, action: PlayerAction): void {
         const player = game.getPlayer(playerId);
         if (!player) return;
 
         const currentStep = game.getPhaseStep();
         console.log(`NightPhase.processAction: Processing ${action.type} from ${player.name} during ${currentStep}`);
 
         switch (action.type) {
             case 'message': // Mafia Discussion
                 if (currentStep === 'MafiaDiscussion') {
                     game.logMessage(player.id, action.content, MessageVisibility.Mafia);
                 } else {
                     console.warn(`Unexpected message from ${playerId} during ${currentStep}`);
                 }
                 break;
             case 'mafiaKill': // Mafia Voting
                 if (currentStep === 'MafiaVoting') {
                     const targetPlayer = game.getPlayer(action.targetPlayerId);
                     if (targetPlayer?.isAlive() && targetPlayer.role.allegiance !== 'Mafia') {
                         this.#mafiaVotes.set(playerId, action.targetPlayerId);
                         game.logMessage(player.id, `votes to kill ${targetPlayer.name}.`, MessageVisibility.Mafia);
                     } else if (targetPlayer?.isAlive() && targetPlayer.role.allegiance === 'Mafia') {
                        game.logMessage(player.id, `attempted to vote for fellow Mafia member ${targetPlayer.name}. Vote ignored.`, MessageVisibility.Mafia);
                        this.#mafiaVotes.set(playerId, null); // Record as abstain/invalid
                     } else {
                         const invalidTargetName = action.targetPlayerId ?? 'unknown';
                         game.logMessage(player.id, `attempted an invalid kill vote (${invalidTargetName}). Vote ignored.`, MessageVisibility.Mafia);
                         this.#mafiaVotes.set(playerId, null); // Record as abstain/invalid
                     }
                 } else {
                     console.warn(`Unexpected mafiaKill from ${playerId} during ${currentStep}`);
                 }
                 break;
            case 'doctorSave': // Other Actions
                if (currentStep === 'OtherActionsLoop') {
                     if (action.targetPlayerId) {
                         const targetPlayer = game.getPlayer(action.targetPlayerId);
                         if (targetPlayer?.isAlive()) {
                             this.#doctorSaveTarget = action.targetPlayerId;
                             game.logMessage(player.id, `decides to protect someone.`, MessageVisibility.Private); 
                         } else {
                             game.logMessage(player.id, `attempted to save an invalid target.`, MessageVisibility.Private);
                         }
                     } else {
                         game.logMessage(player.id, `chooses not to save anyone tonight.`, MessageVisibility.Private);
                     }
                } else {
                     console.warn(`Unexpected doctorSave from ${playerId} during ${currentStep}`);
                 }
                 break;
             case 'seerInvestigate': // Other Actions
                 if (currentStep === 'OtherActionsLoop') {
                     if (action.targetPlayerId) {
                         const targetPlayer = game.getPlayer(action.targetPlayerId);
                         if (targetPlayer?.isAlive()) {
                             this.#seerInvestigationTarget = action.targetPlayerId;
                             this.#seerPlayerId = playerId;
                             game.logMessage(player.id, `decides to investigate someone.`, MessageVisibility.Private);
                         } else {
                             game.logMessage(player.id, `attempted to investigate an invalid target.`, MessageVisibility.Private);
                         }
                     } else {
                         game.logMessage(player.id, `chooses not to investigate anyone tonight.`, MessageVisibility.Private);
                     }
                 } else {
                     console.warn(`Unexpected seerInvestigate from ${playerId} during ${currentStep}`);
                 }
                 break;
             case 'noAction': // Can happen in MafiaDiscussion, MafiaVoting, OtherActionsLoop
                 if (currentStep === 'MafiaVoting') {
                      this.#mafiaVotes.set(playerId, null); // Explicitly record no vote
                      game.logMessage(player.id, 'chooses not to vote for a kill.', MessageVisibility.Mafia);
                 } else if (currentStep === 'MafiaDiscussion') {
                      game.logMessage(player.id, 'says nothing.', MessageVisibility.Mafia);
                 } else if (currentStep === 'OtherActionsLoop') {
                      // Maybe log based on role?
                      game.logMessage(player.id, 'performs no special action tonight.', MessageVisibility.Private);
                 }
                 break;
         }
     }

    /** Consolidate Mafia kill votes */
    private consolidateMafiaVotes(game: Game): void {
        this.#finalMafiaKillTarget = null;
        if (this.#mafiaVotes.size === 0) {
            if (game.getAliveMafia().length > 0) {
                game.logMessage(null, "The Mafia did not cast any votes.", MessageVisibility.Mafia);
            }
             return; // No votes to consolidate
         }

        const killVoteCounts = new Map<PlayerId, number>();
        let maxVotes = 0;
        let finalTargets: PlayerId[] = [];

        for (const targetId of this.#mafiaVotes.values()) {
            if (targetId === null) continue; // Skip abstain/invalid votes

            // Ensure target is still valid (alive, not mafia)
            const targetPlayer = game.getPlayer(targetId);
             if (!targetPlayer?.isAlive() || targetPlayer.role.allegiance === 'Mafia') {
                 console.log(`Mafia vote target ${targetId} is no longer valid.`);
                 continue; 
             }

            const count = (killVoteCounts.get(targetId) || 0) + 1;
            killVoteCounts.set(targetId, count);
            if (count > maxVotes) {
                maxVotes = count;
                finalTargets = [targetId];
            } else if (count === maxVotes) {
                if (!finalTargets.includes(targetId)) { // Avoid duplicates
                     finalTargets.push(targetId);
                }
            }
        }

        // Tie-breaking: If tied, no kill occurs. Requires strict majority.
        const mafiaCount = game.getAliveMafia().length;
        const majorityThreshold = Math.floor(mafiaCount / 2) + 1;

        if (maxVotes >= majorityThreshold && finalTargets.length === 1) {
            this.#finalMafiaKillTarget = finalTargets[0];
        } else {    
            this.#finalMafiaKillTarget = null; // Tie or no majority
        }

        // Log result to Mafia
        let voteSummary = "Mafia Kill Vote Summary:\n";
        for (const [voterId, targetId] of this.#mafiaVotes.entries()) {
            const voterName = game.getPlayer(voterId)?.name ?? voterId;
            const targetName = targetId ? (game.getPlayer(targetId)?.name ?? targetId) : "(abstain/invalid)";
            voteSummary += `- ${voterName} voted for ${targetName}\n`;
        }

        if (this.#finalMafiaKillTarget) {
            const finalTargetName = game.getPlayer(this.#finalMafiaKillTarget)?.name ?? this.#finalMafiaKillTarget;
            voteSummary += `Result: The chosen target is ${finalTargetName}.`;
            game.logMessage(null, "The Mafia has chosen their target.", MessageVisibility.Mafia);
        } else if (maxVotes > 0 && finalTargets.length > 1) {
             const tiedNames = finalTargets.map(id => game.getPlayer(id)?.name ?? id).join(', ');
             voteSummary += `Result: Vote tied between ${tiedNames}. No kill tonight.`;
              game.logMessage(null, "Mafia vote resulted in a tie. No kill tonight.", MessageVisibility.Mafia);
        } else if (maxVotes > 0 && maxVotes < majorityThreshold) {
            voteSummary += `Result: No majority reached. No kill tonight.`;
            game.logMessage(null, "Mafia vote did not reach majority. No kill tonight.", MessageVisibility.Mafia);
        } else { // maxVotes === 0
             voteSummary += `Result: No valid votes cast. No kill tonight.`;
             game.logMessage(null, "The Mafia cast no valid votes. No kill tonight.", MessageVisibility.Mafia);
        }
        game.logMessage(null, voteSummary, MessageVisibility.Mafia); // Log detailed summary
    }

    /** Resolve saves, kills, investigations */
    private resolveNightActions(game: Game): void {
        let playerKilledTonight: PlayerId | null = null;
        const savedPlayerId = this.#doctorSaveTarget;
        let actualKillTarget = this.#finalMafiaKillTarget;

        let killMessage = "";

        // Apply Doctor Save
        if (savedPlayerId && actualKillTarget === savedPlayerId) {
            const savedPlayer = game.getPlayer(savedPlayerId);
             killMessage = `${savedPlayer?.name ?? savedPlayerId} was attacked, but the Doctor saved them!`;
            actualKillTarget = null; // Kill is prevented
            console.log(`Save successful: ${savedPlayerId}`);
        }

        // Process Kill
        if (actualKillTarget) {
             const targetPlayer = game.getPlayer(actualKillTarget);
             if (targetPlayer?.isAlive()){ 
                   playerKilledTonight = actualKillTarget;
                   // Kill message is generated by game.killPlayer
                   game.killPlayer(playerKilledTonight, "was killed during the night.");
             } else {
                 console.log(`Kill target ${actualKillTarget} was already dead.`);
                 // Don't set playerKilledTonight if target was already dead
             }
        } 

       // Process Seer Investigation & record result in Seer's memory
       let investigationResult: Allegiance | null = null;
       if (this.#seerInvestigationTarget && this.#seerPlayerId) {
           const targetPlayer = game.getPlayer(this.#seerInvestigationTarget);
           const seer = game.getPlayer(this.#seerPlayerId);
           if (targetPlayer && seer?.isAlive()) { 
               investigationResult = targetPlayer.role.allegiance;
               game.recordSeerResultInMemory(this.#seerPlayerId, this.#seerInvestigationTarget, investigationResult);
               // Result revealed to seer via gameState. Provide feedback here?
                game.logMessage(
                    null, 
                    `Your investigation revealed that ${targetPlayer.name} is aligned with the ${investigationResult}.`, 
                    MessageVisibility.Private, 
                    this.#seerPlayerId // Send only to the seer
                );
               console.log(`Seer ${this.#seerPlayerId} investigated ${this.#seerInvestigationTarget}, result: ${investigationResult}`);
           } else {
                 console.log(`Seer (${this.#seerPlayerId}) or Target (${this.#seerInvestigationTarget}) is invalid/dead.`);
           }
       }

       // Announce Public Night Results
       game.logMessage(null, "Dawn breaks.", MessageVisibility.Public);
       if (killMessage) {
           game.logMessage(null, killMessage, MessageVisibility.Public);
       } else if (!playerKilledTonight) {
            // Announce if no one died (and wasn't saved)
           game.logMessage(null, "The night passed without any casualties.", MessageVisibility.Public);
       }
        // Kill announcement for non-saved players happens in game.killPlayer

       // Store results for persistence and potential AI use
       game.setPhaseResults({
           killedPlayerId: playerKilledTonight,
           savedPlayerId: savedPlayerId,
           seerInvestigation: this.#seerInvestigationTarget && investigationResult 
                ? { targetId: this.#seerInvestigationTarget, allegiance: investigationResult } 
                : null,
       });

       game.recordKillInMemory(playerKilledTonight); // Record null if no one died
        // doctor save and seer results already recorded in their respective memory methods
        // We might need dedicated methods like recordDoctorSaveInMemory if not already present

       game.notifyRenderers('renderNightResults', playerKilledTonight);
    }

    // Update transition to return GamePhaseType
    transition(game: Game): GamePhaseType {
        // Check win condition before transitioning
        const winner = game.checkWinCondition();
        if (winner) {
            return 'GameOver';
        }
        return 'Day';
    }
}
