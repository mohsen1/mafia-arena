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

    async getAction(gameState: VisibleGameState): Promise<PlayerAction> {
        console.log(`\n--- ${gameState.self.name} (${this.playerId}) - Your turn! ---`);
        console.log(`Phase: ${gameState.phase}, Round: ${gameState.round}`);
        console.log(`Your Role: ${gameState.self.role}`);
        if (gameState.self.isMafia) {
            console.log(`Your fellow Mafia (alive): ${Array.from(gameState.mafiaPlayerIds ?? []).join(', ')}`);
        }
        console.log(`Alive Players: ${Array.from(gameState.alivePlayerIds).map(id => gameState.players.find(p=>p.id===id)?.name ?? id).join(', ')}`);
        console.log("--------------------------------------------------");

        const aliveOthers = Array.from(gameState.alivePlayerIds).filter(id => id !== gameState.self.id);
        const aliveOthersInfo = aliveOthers.map(id => gameState.players.find(p => p.id === id)!);

        try {
            switch (gameState.phase) {
                case 'Day':
                    const dayAction = await rl.question('Action? (m [message] / v [player index to vote] / n [no action]): ');
                    if (dayAction.startsWith('m ')) {
                        return { type: 'message', content: dayAction.substring(2) };
                    } else if (dayAction.startsWith('v ')) {
                        const index = parseInt(dayAction.substring(2), 10) - 1;
                        if (index >= 0 && index < aliveOthersInfo.length) {
                            return { type: 'vote', targetPlayerId: aliveOthersInfo[index].id };
                        } else {
                            console.log("Invalid player index for vote.");
                            return { type: 'noAction' }; // Or re-prompt
                        }
                    }
                    return { type: 'noAction' };

                case 'Night':
                    if (gameState.self.isMafia) {
                         if (aliveOthersInfo.length === 0) return {type: 'noAction'}; // No one else to kill
                         const potentialTargets = aliveOthersInfo.filter(p => !gameState.mafiaPlayerIds?.has(p.id));
                         if (potentialTargets.length === 0) {
                             console.log("No non-mafia targets available.");
                             return {type: 'noAction'};
                         }
                         console.log("Choose player to kill:");
                         potentialTargets.forEach((p, i) => console.log(`${i + 1}: ${p.name}`));
                         const killChoice = await rl.question('Kill target index (or 0 for no kill): ');
                         const index = parseInt(killChoice, 10) - 1;
                         if (index >= 0 && index < potentialTargets.length) {
                             return { type: 'mafiaKill', targetPlayerId: potentialTargets[index].id };
                         }
                    } else {
                        console.log("You rest during the night.");
                         // Add prompts for other night roles (Doctor, Detective) here
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
         // Cannot prompt here because rl might be closed in main.ts
         // Need a better way to handle input lifecycle if game runs multiple times
    }
}
