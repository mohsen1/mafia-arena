import { AbstractGamePhase } from './AbstractGamePhase';
import type { Game } from '../core/Game';
import type { GamePhaseType } from '../interfaces/IGamePhase';
import type { PlayerAction } from '../interfaces/IAgent';
import type { PlayerId } from '../interfaces/IPlayer';
import type { Player } from '../core/Player';
import { MessageVisibility } from '../interfaces/IMessage';
import { RoleName, type Allegiance } from '../interfaces/IRole';

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

    switch (step) {
      case 'Start':
        this.resetPhaseState();
        if (
          game.getAlivePlayers().filter((p) => p.role.name === RoleName.Mafia)
            .length > 0
        ) {
          game.setPhaseStep('MafiaDiscussion');
        } else {
          game.setPhaseStep('OtherActionsStart'); // Skip Mafia steps if none exist
        }
        game.setNextPlayerIndexToAction(0);
        break;

      case 'MafiaDiscussion':
        if (index === 0) {
          // List all Mafia members
          // const mafiaNames = game
          //   .getAlivePlayers()
          //   .filter((p) => p.role.name === RoleName.Mafia)
          //   .map((p) => p.name)
          //   .join(', ');
        }
        await this.handlePlayerAction(
          game,
          index,
          game.getAlivePlayers().filter((p) => p.role.name === RoleName.Mafia),
          ['message', 'noAction'],
          'MafiaVoting' // Next step after discussion
        );
        break;

      case 'MafiaVoting':
        if (index === 0) {
          // Restore any saved votes if phase was recreated
          this.restorePhaseState(game);
        }
        await this.handlePlayerAction(
          game,
          index,
          game.getAlivePlayers().filter((p) => p.role.name === RoleName.Mafia),
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
        this.#otherNightRoles = game
          .getAlivePlayers()
          .filter(
            (p) =>
              p.role.canPerformNightAction && p.role.name !== RoleName.Mafia
          );
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
          game,
          index,
          this.#otherNightRoles,
          [], // Allowed actions determined dynamically inside handlePlayerAction
          'ResolveNight' // Next step after all other actions
        );
        break;

      case 'ResolveNight':
        this.resolveNightActions(game);
        game.setPhaseStep('Finished');
        game.setNextPlayerIndexToAction(0);
        break;

      case 'Finished':
        // Transition handled by Game.runGameLoop
        break;

      default:
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

  /** Restore phase state from game if phase was recreated */
  private restorePhaseState(game: Game): void {
    const savedState = game.getPhaseState();
    if (savedState?.mafiaVotes) {
      for (const [voterId, targetId] of Object.entries(savedState.mafiaVotes)) {
        this.#mafiaVotes.set(voterId, targetId as PlayerId | null);
      }
    }
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
    // Declare actions for this specific player
    let playerAllowedActions = allowedActions;

    if (index >= players.length) {
      // Finished this step for all relevant players
      // Removed redundant completion messages to reduce nighttime chattiness

      game.setPhaseStep(nextStep);
      game.setNextPlayerIndexToAction(0);
      return;
    }

    const player = players[index];
    if (!player || !player.isAlive()) {
      // Extra check for safety
      game.setNextPlayerIndexToAction(index + 1); // Skip invalid/dead player
      return;
    }

    // Determine allowed actions dynamically if needed (e.g., for OtherActionsLoop)
    if (currentStep === 'OtherActionsLoop') {
      playerAllowedActions = ['noAction']; // Assign to the new variable
      if (player.role.name === RoleName.Doctor) {
        playerAllowedActions = ['doctorSave', 'noAction']; // Assign to new variable
      } else if (player.role.name === RoleName.Seer) {
        playerAllowedActions = ['seerInvestigate', 'noAction']; // Assign to new variable
      }
      // Add other roles here...
    }

    if (playerAllowedActions.length === 0) {
      // Check the new variable
      game.setNextPlayerIndexToAction(index + 1);
      return;
    }

    const action = await game.requestPlayerAction(player, playerAllowedActions); // Use new variable

    if (action.type !== 'humanActionRequired') {
      this.processAction(game, player.id, action);
      game.setNextPlayerIndexToAction(index + 1);
    }
    // Human action deferred, index not incremented
  }

  /** Helper to process a completed action (AI or submitted Human) */
  public processAction(
    game: Game,
    playerId: PlayerId,
    action: PlayerAction
  ): void {
    const player = game.getPlayer(playerId);
    if (!player) return;

    const currentStep = game.getPhaseStep();

    switch (action.type) {
      case 'message': // Mafia Discussion
        if (currentStep === 'MafiaDiscussion') {
          game.logMessage(player.id, action.content, MessageVisibility.Mafia);
        }
        break;
      case 'mafiaKill': // Mafia Voting
        if (currentStep === 'MafiaVoting') {
          // Always restore saved votes when processing votes
          // This handles cases where phase was recreated mid-voting
          if (this.#mafiaVotes.size === 0) {
            const savedState = game.getPhaseState();
            if (savedState?.mafiaVotes) {
              for (const [voterId, targetId] of Object.entries(
                savedState.mafiaVotes
              )) {
                this.#mafiaVotes.set(voterId, targetId as PlayerId | null);
              }
            }
          }

          const targetPlayer = game.getPlayer(action.targetPlayerId);
          if (
            targetPlayer?.isAlive() &&
            targetPlayer.role.allegiance !== 'Mafia'
          ) {
            this.#mafiaVotes.set(playerId, action.targetPlayerId);

            // Save votes to game state for persistence
            const existingSavedVotes = game.getPhaseState()?.mafiaVotes || {};
            const currentVotes: Record<PlayerId, PlayerId | null> = {
              ...existingSavedVotes,
            };
            for (const [id, target] of this.#mafiaVotes.entries()) {
              currentVotes[id] = target;
            }
            game.setPhaseState({ mafiaVotes: currentVotes });

            game.logMessage(
              player.id,
              `votes to kill ${targetPlayer.name}.`,
              MessageVisibility.Mafia
            );
          } else if (
            targetPlayer?.isAlive() &&
            targetPlayer.role.allegiance === 'Mafia'
          ) {
            game.logMessage(
              player.id,
              `attempted to vote for fellow Mafia member ${targetPlayer.name}. Vote ignored.`,
              MessageVisibility.Mafia
            );
            this.#mafiaVotes.set(playerId, null); // Record as abstain/invalid

            // Save votes to game state for persistence
            const existingSavedVotes = game.getPhaseState()?.mafiaVotes || {};
            const currentVotes: Record<PlayerId, PlayerId | null> = {
              ...existingSavedVotes,
            };
            for (const [id, target] of this.#mafiaVotes.entries()) {
              currentVotes[id] = target;
            }
            game.setPhaseState({ mafiaVotes: currentVotes });
          } else {
            const invalidTargetName = action.targetPlayerId ?? 'unknown';
            game.logMessage(
              player.id,
              `attempted an invalid kill vote (${invalidTargetName}). Vote ignored.`,
              MessageVisibility.Mafia
            );
            this.#mafiaVotes.set(playerId, null); // Record as abstain/invalid

            // Save votes to game state for persistence
            const existingSavedVotes = game.getPhaseState()?.mafiaVotes || {};
            const currentVotes: Record<PlayerId, PlayerId | null> = {
              ...existingSavedVotes,
            };
            for (const [id, target] of this.#mafiaVotes.entries()) {
              currentVotes[id] = target;
            }
            game.setPhaseState({ mafiaVotes: currentVotes });
          }
        }
        break;
      case 'doctorSave': // Other Actions
        if (currentStep === 'OtherActionsLoop') {
          if (action.targetPlayerId) {
            const targetPlayer = game.getPlayer(action.targetPlayerId);
            if (targetPlayer?.isAlive()) {
              this.#doctorSaveTarget = action.targetPlayerId;
            }
          }
        }
        break;
      case 'seerInvestigate': // Other Actions
        if (currentStep === 'OtherActionsLoop') {
          if (action.targetPlayerId) {
            const targetPlayer = game.getPlayer(action.targetPlayerId);
            if (targetPlayer?.isAlive()) {
              this.#seerInvestigationTarget = action.targetPlayerId;
              this.#seerPlayerId = playerId;
            }
          }
        }
        break;
      case 'noAction': // Can happen in MafiaDiscussion, MafiaVoting, OtherActionsLoop
        if (currentStep === 'MafiaVoting') {
          this.#mafiaVotes.set(playerId, null); // Explicitly record no vote

          // Save votes to game state for persistence
          const existingSavedVotes = game.getPhaseState()?.mafiaVotes || {};
          const currentVotes: Record<PlayerId, PlayerId | null> = {
            ...existingSavedVotes,
          };
          for (const [id, target] of this.#mafiaVotes.entries()) {
            currentVotes[id] = target;
          }
          game.setPhaseState({ mafiaVotes: currentVotes });

          // Removed "chooses not to vote" message to reduce chattiness
        } else if (currentStep === 'MafiaDiscussion') {
          // Removed "says nothing" message to reduce chattiness
        } else if (currentStep === 'OtherActionsLoop') {
          // Removed "performs no special action" message to reduce chattiness
        }
        break;
    }
  }

  /** Consolidate Mafia kill votes */
  private consolidateMafiaVotes(game: Game): void {
    // Restore votes from game state if phase was recreated
    if (this.#mafiaVotes.size === 0) {
      const savedState = game.getPhaseState();
      if (savedState?.mafiaVotes) {
        for (const [voterId, targetId] of Object.entries(
          savedState.mafiaVotes
        )) {
          this.#mafiaVotes.set(voterId, targetId as PlayerId | null);
        }
      }
    }

    this.#finalMafiaKillTarget = null;

    // Early return only if no mafia members attempted to vote at all
    if (this.#mafiaVotes.size === 0) {
      if (game.getAliveMafia().length > 0) {
        game.logMessage(
          null,
          'The Mafia did not cast any votes.',
          MessageVisibility.Mafia
        );
      }
      return; // No votes to consolidate
    }

    const killVoteCounts = new Map<PlayerId, number>();
    let maxVotes = 0;
    let finalTargets: PlayerId[] = [];
    let validVoteCount = 0;

    for (const targetId of this.#mafiaVotes.values()) {
      if (targetId === null) continue; // Skip abstain/invalid votes

      // Ensure target is still valid (alive, not mafia)
      const targetPlayer = game.getPlayer(targetId);
      if (
        !targetPlayer?.isAlive() ||
        targetPlayer.role.allegiance === 'Mafia'
      ) {
        continue;
      }

      validVoteCount++;
      const count = (killVoteCounts.get(targetId) || 0) + 1;
      killVoteCounts.set(targetId, count);
      if (count > maxVotes) {
        maxVotes = count;
        finalTargets = [targetId];
      } else if (count === maxVotes) {
        if (!finalTargets.includes(targetId)) {
          // Avoid duplicates
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

    // Log simplified result to Mafia (removed verbose vote-by-vote breakdown)
    if (this.#finalMafiaKillTarget) {
      const finalTargetName =
        game.getPlayer(this.#finalMafiaKillTarget)?.name ??
        this.#finalMafiaKillTarget;
      game.logMessage(
        null,
        `The Mafia has chosen to target ${finalTargetName}.`,
        MessageVisibility.Mafia
      );
    } else if (validVoteCount > 0 && finalTargets.length > 1) {
      game.logMessage(
        null,
        'Mafia vote resulted in a tie. No kill tonight.',
        MessageVisibility.Mafia
      );
    } else if (validVoteCount > 0 && maxVotes < majorityThreshold) {
      game.logMessage(
        null,
        'Mafia vote did not reach majority. No kill tonight.',
        MessageVisibility.Mafia
      );
    } else {
      // validVoteCount === 0
      game.logMessage(
        null,
        'The Mafia cast no valid votes. No kill tonight.',
        MessageVisibility.Mafia
      );
    }
  }

  /** Resolve saves, kills, investigations */
  private resolveNightActions(game: Game): void {
    let playerKilledTonight: PlayerId | null = null;
    const savedPlayerId = this.#doctorSaveTarget;
    let actualKillTarget = this.#finalMafiaKillTarget;

    let killMessage = '';

    // Apply Doctor Save
    if (savedPlayerId && actualKillTarget === savedPlayerId) {
      const savedPlayer = game.getPlayer(savedPlayerId);
      killMessage = `${savedPlayer?.name ?? savedPlayerId} was attacked, but the Doctor saved them!`;
      actualKillTarget = null; // Kill is prevented
      console.log(`Save successful: ${savedPlayerId}`);
      // Record the successful save in memory
      if (this.#doctorSaveTarget) {
        const doctorPlayer = game
          .getAlivePlayers()
          .find((p) => p.role.name === RoleName.Doctor);
        if (doctorPlayer) {
          game.recordDoctorSaveInMemory(
            doctorPlayer.id,
            this.#doctorSaveTarget
          );
        }
      }
    }

    // Process Kill
    if (actualKillTarget) {
      const targetPlayer = game.getPlayer(actualKillTarget);
      if (targetPlayer?.isAlive()) {
        playerKilledTonight = actualKillTarget;
        // Kill message is generated by game.killPlayer
        game.killPlayer(playerKilledTonight, 'was killed during the night.');
      }
    }

    // Process Seer Investigation & record result in Seer's memory
    let investigationResult: Allegiance | null = null;
    if (this.#seerInvestigationTarget && this.#seerPlayerId) {
      const targetPlayer = game.getPlayer(this.#seerInvestigationTarget);
      const seer = game.getPlayer(this.#seerPlayerId);
      if (targetPlayer && seer?.isAlive()) {
        investigationResult = targetPlayer.role.allegiance;
        game.recordSeerResultInMemory(
          this.#seerPlayerId,
          this.#seerInvestigationTarget,
          investigationResult
        );
        // Result revealed to seer via gameState. Provide feedback here?
        game.logMessage(
          this.#seerPlayerId, // Send message TO the seer
          `Your investigation revealed that ${targetPlayer.name} is aligned with the ${investigationResult}.`,
          MessageVisibility.Private // Keep private
        );
        console.log(
          `Seer ${this.#seerPlayerId} investigated ${this.#seerInvestigationTarget}, result: ${investigationResult}`
        );
      }
    }

    // Announce Public Night Results
    game.logMessage(null, 'Dawn breaks.', MessageVisibility.Public);
    if (killMessage) {
      game.logMessage(null, killMessage, MessageVisibility.Public);
    } else if (!playerKilledTonight) {
      // Announce if no one died (and wasn't saved)
      game.logMessage(
        null,
        'The night passed without any casualties.',
        MessageVisibility.Public
      );
    }
    // Kill announcement for non-saved players happens in game.killPlayer

    // Store results for persistence and potential AI use
    game.setPhaseResults({
      killedPlayerId: playerKilledTonight,
      savedPlayerId: savedPlayerId,
      seerInvestigation:
        this.#seerInvestigationTarget && investigationResult
          ? {
              targetId: this.#seerInvestigationTarget,
              allegiance: investigationResult,
            }
          : null,
    });

    game.recordKillInMemory(playerKilledTonight); // Record null if no one died
    // doctor save and seer results already recorded in their respective memory methods
    // We might need dedicated methods like recordDoctorSaveInMemory if not already present

    game.notifyRenderers('renderNightResults', playerKilledTonight);
  }

  // Update transition to return GamePhaseType
  transition(game: Game): GamePhaseType {
    // Night transitions to Day unless the game is over
    if (game.checkWinCondition()) {
      return 'GameOver';
    }
    return 'Day';
  }
}
