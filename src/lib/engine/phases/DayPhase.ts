import { AbstractGamePhase } from './AbstractGamePhase';
import type { Game } from '../core/Game';
import type { GamePhaseType } from '../interfaces/IGamePhase';
import type { PlayerAction } from '../interfaces/IAgent';
import type { PlayerId } from '../interfaces/IPlayer';
import { MessageVisibility } from '../interfaces/IMessage';
import { translate } from '../../i18n/server'; // Import server-side translation

export class DayPhase extends AbstractGamePhase {
  readonly type: GamePhaseType = 'Day';
  // Temporary storage for votes within the phase instance
  #votes: Map<PlayerId, PlayerId | null> = new Map();

  async runStep(game: Game): Promise<void> {
    const step = game.getPhaseStep();
    const index = game.getNextPlayerIndexToAction();
    const alivePlayers = game.getAlivePlayers();

    console.log(`DayPhase.runStep: Step=${step}, Index=${index}`);

    switch (step) {
      case 'Start':
        this.#votes.clear(); // Clear votes at the start of the day
        game.logMessage(
          null,
          translate('DayBegins', game.language),
          MessageVisibility.Public
        );
        if (game.round === 1) {
          game.setPhaseStep('Introduction');
        } else {
          game.setPhaseStep('Discussion');
        }
        game.setNextPlayerIndexToAction(0);
        break;

      case 'Introduction':
        if (game.round !== 1) {
          console.warn(
            'Executing Introduction step outside of round 1, switching to Discussion.'
          );
          game.setPhaseStep('Discussion');
          // Don't break, let Discussion handle this turn
        } else {
          if (index === 0) {
            // Log message only once at the start of introductions
            game.logMessage(
              null,
              translate('IntroductionPrompt', game.language),
              MessageVisibility.Public
            );
          }
          await this.handlePlayerAction(
            game,
            index,
            alivePlayers,
            ['message', 'noAction'],
            'Discussion'
          );
          break; // Exit after handling one player or deferring
        }
        break; // Added break here to prevent fallthrough

      case 'Discussion':
        // Removed redundant discussion phase announcement to reduce chattiness
        await this.handlePlayerAction(
          game,
          index,
          alivePlayers,
          ['message', 'noAction'],
          'Voting'
        );
        break; // Exit after handling one player or deferring

      case 'Voting':
        if (index === 0) {
          // Only announce voting phase, as this is when action is required
          game.logMessage(
            null,
            translate('VotingPhase', game.language),
            MessageVisibility.Public
          );
          // Restore any saved votes if phase was recreated
          this.restorePhaseState(game);
        }
        await this.handlePlayerAction(
          game,
          index,
          alivePlayers,
          ['vote', 'noAction'],
          'TallyVotes'
        );
        break; // Exit after handling one player or deferring

      case 'TallyVotes':
        console.log('DayPhase: Tallying votes...');
        this.tallyAndExecuteVotes(game);
        game.setPhaseStep('Finished');
        game.setNextPlayerIndexToAction(0);
        break;

      case 'Finished':
        // Transition handled by Game.runGameLoop
        break;

      default:
        console.error(`Unknown phase step in DayPhase: ${step}`);
        game.setPhaseStep('Finished'); // Try to recover
        game.setNextPlayerIndexToAction(0);
    }
  }

  /** Helper to handle requesting/processing action for one player */
  private async handlePlayerAction(
    game: Game,
    index: number,
    players: Array<{ id: PlayerId }>, // Simplified player type needed
    allowedActions: PlayerAction['type'][],
    nextStep: string
  ): Promise<void> {
    if (index >= players.length) {
      // Finished this step for all players
      const currentStep = game.getPhaseStep();

      // 🎯 IMPROVED: Add brief transition messages for better flow
      if (currentStep === 'Introduction') {
        game.logMessage(
          null,
          translate('IntroductionComplete', game.language),
          MessageVisibility.Public
        );
        // Add a brief pause for readability
        await new Promise((resolve) => setTimeout(resolve, 500));
      } else if (currentStep === 'Discussion' && nextStep === 'Voting') {
        game.logMessage(
          null,
          translate('DiscussionComplete', game.language),
          MessageVisibility.Public
        );
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      game.setPhaseStep(nextStep); // Move to the next defined step
      game.setNextPlayerIndexToAction(0); // Reset index for the next step
      return;
    }

    const player = game.getPlayer(players[index].id);
    if (!player || !player.isAlive()) {
      console.error(
        `DayPhase.handlePlayerAction: Player not found or dead at index ${index}`
      );
      game.setNextPlayerIndexToAction(index + 1); // Skip invalid/dead player
      return;
    }

    const action = await game.requestPlayerAction(player, allowedActions);

    if (action.type !== 'humanActionRequired') {
      // Process AI action immediately
      this.processAction(game, player.id, action);
      game.setNextPlayerIndexToAction(index + 1); // Move to next player
    }
    // If humanActionRequired, index is NOT incremented here.
    // submitHumanAction will apply the action and increment the index later.
  }

  /** Helper to process a completed action (AI or submitted Human) */
  public processAction(
    game: Game,
    playerId: PlayerId,
    action: PlayerAction
  ): void {
    // This method might be called by runStep (for AI) or potentially by submitHumanAction
    const player = game.getPlayer(playerId);
    if (!player) return; // Should not happen

    const currentStep = game.getPhaseStep();
    console.log(
      `DayPhase.processAction: Processing ${action.type} from ${player.name} during ${currentStep}`
    );

    switch (action.type) {
      case 'message':
        if (currentStep === 'Introduction' || currentStep === 'Discussion') {
          game.logMessage(player.id, action.content, MessageVisibility.Public);
        } else {
          console.warn(
            `Received unexpected message action from ${player.id} during step ${currentStep}`
          );
        }
        break;
      case 'vote': {
        if (currentStep === 'Voting') {
          // Always restore saved votes when processing votes
          // This handles cases where phase was recreated mid-voting
          if (this.#votes.size === 0) {
            const savedState = game.getPhaseState();
            if (savedState?.dayVotes) {
              for (const [voterId, targetId] of Object.entries(
                savedState.dayVotes
              )) {
                this.#votes.set(
                  voterId as PlayerId,
                  targetId as PlayerId | null
                );
              }
            }
          }

          const targetPlayer = action.targetPlayerId
            ? game.getPlayer(action.targetPlayerId)
            : null;
          if (action.targetPlayerId === null) {
            this.#votes.set(player.id, null);
            // Save votes to game state for persistence
            this.saveVotesToGameState(game);
            // Removed abstain vote announcement to reduce chattiness
          } else if (targetPlayer?.isAlive()) {
            // Check targetPlayer is not undefined AND alive
            this.#votes.set(player.id, action.targetPlayerId);
            // Save votes to game state for persistence
            this.saveVotesToGameState(game);
            game.logMessage(
              player.id,
              translate('VotesFor', game.language, {
                playerName: targetPlayer.name,
              }),
              MessageVisibility.Public
            );
          } else {
            this.#votes.set(player.id, null); // Invalid vote counts as abstain
            // Save votes to game state for persistence
            this.saveVotesToGameState(game);
            // Only log invalid votes, as these are important feedback
            const invalidTargetName = action.targetPlayerId ?? 'unknown';
            game.logMessage(
              player.id,
              translate('VotesInvalidTarget', game.language, {
                targetName: invalidTargetName,
              }),
              MessageVisibility.Public
            );
          }
        } else {
          console.warn(
            `Received unexpected vote action from ${player.id} during step ${currentStep}`
          );
        }
        break;
      }
      case 'noAction':
        if (currentStep === 'Voting') {
          this.#votes.set(player.id, null);
          // Save votes to game state for persistence
          this.saveVotesToGameState(game);
          // Removed noAction vote announcement to reduce chattiness
        } else if (
          currentStep === 'Introduction' ||
          currentStep === 'Discussion'
        ) {
          // Removed noAction announcements to reduce chattiness
          // Players staying silent is normal and doesn't need announcement
        } // else ignore noAction if unexpected
        break;
      // humanActionRequired should not reach here
    }
  }

  /** Restore phase state from game if phase was recreated */
  private restorePhaseState(game: Game): void {
    const savedState = game.getPhaseState();
    if (savedState?.dayVotes) {
      for (const [voterId, targetId] of Object.entries(savedState.dayVotes)) {
        this.#votes.set(voterId as PlayerId, targetId as PlayerId | null);
      }
    }
  }

  /** Save votes to game state for persistence */
  private saveVotesToGameState(game: Game): void {
    const currentVotes: Record<PlayerId, PlayerId | null> = {};
    for (const [id, target] of this.#votes.entries()) {
      currentVotes[id] = target;
    }
    game.setPhaseState({ dayVotes: currentVotes });
  }

  /** Tally votes and execute player */
  private tallyAndExecuteVotes(game: Game): void {
    // Restore votes from game state if phase was recreated
    if (this.#votes.size === 0) {
      const savedState = game.getPhaseState();
      if (savedState?.dayVotes) {
        for (const [voterId, targetId] of Object.entries(savedState.dayVotes)) {
          this.#votes.set(voterId as PlayerId, targetId as PlayerId | null);
        }
      }
    }

    const voteCounts = new Map<PlayerId, number>();
    let maxVotes = 0;
    let playersToExecute: PlayerId[] = [];

    // Use the votes stored in this.#votes
    for (const [, targetId] of this.#votes.entries()) {
      if (targetId !== null) {
        // Ensure the target still exists and is alive before counting vote
        const targetPlayer = game.getPlayer(targetId);
        if (targetPlayer?.isAlive()) {
          // Apply optional chaining here
          const currentVotes = (voteCounts.get(targetId) || 0) + 1;
          voteCounts.set(targetId, currentVotes);

          if (currentVotes > maxVotes) {
            maxVotes = currentVotes;
            playersToExecute = [targetId];
          } else if (currentVotes === maxVotes) {
            // Avoid duplicates if someone votes multiple times (shouldn't happen with current logic)
            if (!playersToExecute.includes(targetId)) {
              playersToExecute.push(targetId);
            }
          }
        } else {
          // Log if a vote target became invalid (e.g., killed at night)
          console.log(`Vote target ${targetId} is no longer valid.`);
        }
      }
    }

    // **ENHANCED DECISIVE VOTING LOGIC**
    // Modified to favor execution over no action for better game progression
    let executedPlayerId: PlayerId | null = null;

    if (maxVotes > 0) {
      if (playersToExecute.length === 1) {
        // Clear winner: one player has the most votes
        executedPlayerId = playersToExecute[0];
        const executedPlayer = game.getPlayer(executedPlayerId);
        const executedPlayerName = executedPlayer?.name ?? executedPlayerId;
        game.logMessage(
          null,
          translate('ExecutionDecision', game.language, {
            voteCount: maxVotes,
            playerName: executedPlayerName,
          }),
          MessageVisibility.Public
        );
      } else if (playersToExecute.length > 1) {
        // **TIE-BREAKING LOGIC: Execute random player from tied top vote getters**
        // This prevents infinite games by ensuring decisions are made
        const randomIndex = Math.floor(Math.random() * playersToExecute.length);
        executedPlayerId = playersToExecute[randomIndex];
        const executedPlayer = game.getPlayer(executedPlayerId);
        const executedPlayerName = executedPlayer?.name ?? executedPlayerId;
        const tiedNames = playersToExecute
          .map((id) => game.getPlayer(id)?.name ?? id)
          .join(', ');

        game.logMessage(
          null,
          translate('VoteTieRandomExecution', game.language, {
            playerNames: tiedNames,
            executedPlayerName: executedPlayerName,
            voteCount: maxVotes,
          }),
          MessageVisibility.Public
        );
      }

      // Execute the chosen player
      if (executedPlayerId) {
        game.killPlayer(
          executedPlayerId,
          translate('ExecutionReason', game.language)
        );
      }
    } else {
      // maxVotes === 0 - no votes cast, use random execution as last resort
      const alivePlayers = game.getAlivePlayers();
      if (alivePlayers.length > 2) {
        // Only use random execution if more than 2 players
        const randomIndex = Math.floor(Math.random() * alivePlayers.length);
        executedPlayerId = alivePlayers[randomIndex].id;
        const executedPlayer = game.getPlayer(executedPlayerId);
        const executedPlayerName = executedPlayer?.name ?? executedPlayerId;

        game.logMessage(
          null,
          translate('NoVotesRandomExecution', game.language, {
            playerName: executedPlayerName,
          }),
          MessageVisibility.Public
        );

        game.killPlayer(
          executedPlayerId,
          translate('ExecutionReason', game.language)
        );
      } else {
        // Standard no votes message for endgame scenarios
        game.logMessage(
          null,
          translate('NoVotesCast', game.language),
          MessageVisibility.Public
        );
      }
    }

    // Notify renderers and record results AFTER determining the outcome
    // Pass the locally stored #votes map
    game.notifyRenderers('renderVoteResults', this.#votes, executedPlayerId);
    game.recordVoteResultsInMemory(this.#votes);

    // Store results for potential later use (e.g., AI memory)
    game.setPhaseResults({ lastDayElimination: executedPlayerId });

    // Clear votes map after processing
    this.#votes.clear();
  }

  transition(game: Game): GamePhaseType {
    // Day always transitions to Night unless the game is over
    if (game.checkWinCondition()) {
      return 'GameOver';
    }
    return 'Night';
  }
}
