import { IAgent, PlayerAction } from '../interfaces/IAgent';
import { VisibleGameState } from '../interfaces/GameState';
import { PlayerId } from '../interfaces/IPlayer';
import * as readline from 'readline/promises'; // Use promise-based readline

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

export class HumanAgent implements IAgent {
     public playerId!: PlayerId;

    async getAction(gameState: VisibleGameState, _allowedActions?: PlayerAction['type'][]): Promise<PlayerAction> {
        // Removed console logs for status/prompt - now handled by Phase logic
        // console.log(`\n--- ${gameState.self.name} (${this.playerId}) - Your turn! ---`);
        // ... other logs removed ...
        // console.log("--------------------------------------------------");

        const aliveOthers = Array.from(gameState.alivePlayerIds).filter(id => id !== gameState.self.id);
        const aliveOthersInfo = aliveOthers.map(id => gameState.players.find(p => p.id === id)!);

        try {
            switch (gameState.phase) {
                case 'Day':
                    // Prompt is now shown by DayPhase
                    const dayAction = await rl.question('> '); // Simple prompt indicator
                    if (dayAction.startsWith('m ')) {
                        return { type: 'message', content: dayAction.substring(2) };
                    } else if (dayAction.startsWith('v ')) {
                        const index = parseInt(dayAction.substring(2), 10) - 1;
                        // Need aliveOthersInfo from Phase? No, recalculate or get from state
                        const voteTargets = aliveOthersInfo; // Assuming this logic remains valid
                        if (index >= 0 && index < voteTargets.length) {
                            return { type: 'vote', targetPlayerId: voteTargets[index].id };
                        } else {
                            console.log("Invalid player index for vote.");
                            return { type: 'noAction' };
                        }
                    }
                    return { type: 'noAction' };

                case 'Night':
                    if (gameState.self.isMafia) {
                         if (aliveOthersInfo.length === 0) return {type: 'noAction'}; // No one else to kill
                         const potentialTargets = aliveOthersInfo.filter(p => !gameState.mafiaPlayerIds?.has(p.id));
                         if (potentialTargets.length === 0) {
                             // Prompt handled by NightPhase
                             // console.log("No non-mafia targets available.");
                             await rl.question('> '); // Wait for Enter
                             return {type: 'noAction'};
                         }
                         // Prompt handled by NightPhase
                         // console.log("Choose player to kill:");
                         // potentialTargets.forEach((p, i) => console.log(`${i + 1}: ${p.name}`));
                         const killChoice = await rl.question('> '); // Simple prompt indicator
                         const index = parseInt(killChoice, 10) - 1;
                         if (index >= 0 && index < potentialTargets.length) {
                             return { type: 'mafiaKill', targetPlayerId: potentialTargets[index].id };
                         }
                    } else {
                        // Prompt handled by NightPhase
                        // console.log("You rest during the night.");
                         await rl.question('> '); // Wait for Enter
                    }
                    return { type: 'noAction' };

                default:
                    console.log("No action required for this phase.");
                    return { type: 'noAction' };
            }
        } catch (e) {
            console.error("Error reading input:", e);
            return { type: 'noAction' }; // Safety default
        }
    }
}
