import { AbstractGamePhase } from './AbstractGamePhase';
import type { Game } from '../core/Game';
import type { GamePhaseType } from '../interfaces/IGamePhase';
import { NightPhase } from './NightPhase';
import type { PlayerAction } from '../interfaces/IAgent';
import type { PlayerId } from '../interfaces/IPlayer';
import { MessageVisibility } from '../interfaces/IMessage';
import { RoleName } from '../interfaces/IRole'; // Import RoleName if needed for checks
// import { HumanAgent } from '../agents/HumanAgent'; // No longer needed here

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
                game.logMessage(null, "Day begins...", MessageVisibility.Public);
                if (game.round === 1) {
                    game.setPhaseStep('Introduction');
                } else {
                    game.setPhaseStep('Discussion');
                }
                game.setNextPlayerIndexToAction(0);
                break;

            case 'Introduction':
                if (game.round !== 1) {
                     console.warn("Executing Introduction step outside of round 1, switching to Discussion.");
                     game.setPhaseStep('Discussion');
                     // Don't break, let Discussion handle this turn
                 } else {
                    if (index === 0) { // Log message only once at the start of introductions
                        game.logMessage(null, "Let's begin with introductions. Please introduce yourself.", MessageVisibility.Public);
                    }
                     await this.handlePlayerAction(game, index, alivePlayers, ['message', 'noAction'], 'Voting');
                     break; // Exit after handling one player or deferring
                 }
                // Fallthrough to Discussion if round > 1
                 
            case 'Discussion':
                if (index === 0 && game.round > 1) { // Log message only once at the start of discussion
                    game.logMessage(null, "Discussion phase:", MessageVisibility.Public);
                }
                await this.handlePlayerAction(game, index, alivePlayers, ['message', 'noAction'], 'Voting');
                break; // Exit after handling one player or deferring

            case 'Voting':
                if (index === 0) { // Log message only once at the start of voting
                     game.logMessage(null, "Voting phase: Choose who to execute.", MessageVisibility.Public);
                 }
                await this.handlePlayerAction(game, index, alivePlayers, ['vote', 'noAction'], 'TallyVotes');
                break; // Exit after handling one player or deferring
            
            case 'TallyVotes':
                console.log("DayPhase: Tallying votes...");
                this.tallyAndExecuteVotes(game); 
                game.setPhaseStep('Finished'); 
                game.setNextPlayerIndexToAction(0);
                break;

            case 'Finished':
                 console.log("DayPhase: Finished step reached. Transitioning...");
                 // Transition logic is now handled within this step
                 const nextPhaseType = this.transition(game);
                 game.advanceToPhase(nextPhaseType); // Pass the type
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
            game.logMessage(null, `${currentStep} complete.`, MessageVisibility.Public);
            game.setPhaseStep(nextStep); // Move to the next defined step
            game.setNextPlayerIndexToAction(0); // Reset index for the next step
            return;
        }

        const player = game.getPlayer(players[index].id);
        if (!player) {
            console.error(`DayPhase.handlePlayerAction: Player not found at index ${index}`);
            game.setNextPlayerIndexToAction(index + 1); // Skip invalid player
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
    public processAction(game: Game, playerId: PlayerId, action: PlayerAction): void {
        // This method might be called by runStep (for AI) or potentially by submitHumanAction
        const player = game.getPlayer(playerId);
        if (!player) return; // Should not happen

        const currentStep = game.getPhaseStep();
        console.log(`DayPhase.processAction: Processing ${action.type} from ${player.name} during ${currentStep}`);

        switch (action.type) {
            case 'message':
                if (currentStep === 'Introduction' || currentStep === 'Discussion') {
                    game.logMessage(player.id, action.content, MessageVisibility.Public);
                } else {
                     console.warn(`Received unexpected message action from ${player.id} during step ${currentStep}`);
                 }
                break;
            case 'vote': {
                if (currentStep === 'Voting') {
                    const targetPlayer = action.targetPlayerId ? game.getPlayer(action.targetPlayerId) : null;
                    if (action.targetPlayerId === null) {
                        this.#votes.set(player.id, null); 
                        game.logMessage(player.id, "votes to abstain.", MessageVisibility.Public);
                    } else if (targetPlayer?.isAlive()) { // Check targetPlayer is not undefined AND alive
                        this.#votes.set(player.id, action.targetPlayerId);
                        game.logMessage(player.id, `votes for ${targetPlayer.name}.`, MessageVisibility.Public);
                    } else {
                        this.#votes.set(player.id, null); // Invalid vote counts as abstain
                        const invalidTargetName = action.targetPlayerId ?? 'unknown';
                        game.logMessage(player.id, `tried to vote for invalid target (${invalidTargetName}), vote counts as abstain.`, MessageVisibility.Public);
                    }
                 } else {
                     console.warn(`Received unexpected vote action from ${player.id} during step ${currentStep}`);
                 }
                 break;
             }
            case 'noAction':
                 if (currentStep === 'Voting') {
                     this.#votes.set(player.id, null);
                     game.logMessage(player.id, "chose no action (abstains from voting).", MessageVisibility.Public);
                 } else if (currentStep === 'Introduction' || currentStep === 'Discussion') {
                     game.logMessage(player.id, "chose no action.", MessageVisibility.Public);
                 } // else ignore noAction if unexpected
                break;
            // humanActionRequired should not reach here
        }
    }

    /** Tally votes and execute player */
    private tallyAndExecuteVotes(game: Game): void {
        const voteCounts = new Map<PlayerId, number>();
        let maxVotes = 0;
        let playersToExecute: PlayerId[] = [];
        const alivePlayerCount = game.getAlivePlayers().length;

        // Use the votes stored in this.#votes
        for (const [_voterId, targetId] of this.#votes.entries()) {
            if (targetId !== null) {
                // Ensure the target still exists and is alive before counting vote
                const targetPlayer = game.getPlayer(targetId);
                 if (targetPlayer && targetPlayer.isAlive()) {
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

        // Determine execution based on majority
        // Using > alivePlayerCount / 2 ensures strict majority
        const majorityThresholdStrict = Math.floor(alivePlayerCount / 2) + 1;

        let executedPlayerId: PlayerId | null = null;
        if (maxVotes >= majorityThresholdStrict && playersToExecute.length === 1) { 
            executedPlayerId = playersToExecute[0];
            const executedPlayer = game.getPlayer(executedPlayerId);
            const executedPlayerName = executedPlayer?.name ?? executedPlayerId;
            const executedPlayerRole = executedPlayer?.role.name ?? 'Unknown Role';
            game.logMessage(null, `With ${maxVotes} votes, the town has decided to execute ${executedPlayerName}.`, MessageVisibility.Public);
             // Kill the player and reveal role AFTER logging the decision
             // The killPlayer method itself logs the role based on game settings/rules
            game.killPlayer(executedPlayerId, "was executed by popular vote.");
        } else if (maxVotes > 0 && (playersToExecute.length > 1 || maxVotes < majorityThresholdStrict)) { 
             const tiedNames = playersToExecute.map(id => game.getPlayer(id)?.name ?? id).join(', ');
             const reason = maxVotes < majorityThresholdStrict 
                 ? "did not reach a majority" 
                 : (playersToExecute.length > 1 ? `resulted in a tie between ${tiedNames}` : "insufficient votes");
             game.logMessage(null, `The vote ${reason}. No one is executed.`, MessageVisibility.Public);
        } else { // maxVotes === 0
            game.logMessage(null, "No deciding votes were cast. No one is executed.", MessageVisibility.Public);
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

    transition(_game: Game): GamePhaseType {
        return 'Night';
    }
}
