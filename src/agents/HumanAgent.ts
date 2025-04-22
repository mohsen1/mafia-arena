import { IAgent, PlayerAction } from '../interfaces/IAgent';
import { VisibleGameState } from '../interfaces/GameState';
import { PlayerId } from '../interfaces/IPlayer';
import * as readline from 'readline/promises'; // Use promise-based readline
import { RoleName } from '../interfaces/IRole'; // Import RoleName

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
                    const dayActionStr = await rl.question('> '); // Simple prompt indicator
                    if (dayActionStr.startsWith('m ')) {
                        return { type: 'message', content: dayActionStr.substring(2) };
                    } else if (dayActionStr.startsWith('v ')) {
                        const index = parseInt(dayActionStr.substring(2), 10) - 1;
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
                         // Prompt handled by NightPhase
                         const nightActionStr = await rl.question('> '); // Simple prompt indicator

                         if (nightActionStr.startsWith('m ')) { // Check for message first
                             return { type: 'message', content: nightActionStr.substring(2) };
                         } else { 
                              // If not a message, try parsing as a kill index
                              const aliveOthers = Array.from(gameState.alivePlayerIds).filter(id => id !== gameState.self.id);
                              const aliveOthersInfo = aliveOthers.map(id => gameState.players.find(p => p.id === id)!);
                              const potentialTargets = aliveOthersInfo.filter(p => !gameState.mafiaPlayerIds?.has(p.id));

                              if (potentialTargets.length === 0) {
                                   console.warn('WARN: Human Mafia tried to act but no valid targets.'); 
                                   return { type: 'noAction' };
                              }

                              if (nightActionStr.trim() === '0') {
                                   return { type: 'noAction' }; // Explicit no kill
                              }

                              const index = parseInt(nightActionStr, 10);
                              if (!isNaN(index) && index > 0 && index <= potentialTargets.length) {
                                   // Valid index entered (adjusting for 1-based index from prompt)
                                  return { type: 'mafiaKill', targetPlayerId: potentialTargets[index - 1].id };
                              } else {
                                   // Invalid input for kill index
                                   console.log("Invalid night action. Expected 'm [message]' or kill target index (e.g., 1, 2) or 0.");
                                   return { type: 'noAction' }; 
                              }
                         }
                    } else if (gameState.self.role === RoleName.Doctor) {
                         // --- Doctor Logic --- (Keep existing correct logic)
                         const aliveOthers = Array.from(gameState.alivePlayerIds).filter(id => id !== gameState.self.id);
                         const aliveOthersInfo = aliveOthers.map(id => gameState.players.find(p => p.id === id)!);
                         const potentialTargets = aliveOthersInfo; 
                         if (potentialTargets.length === 0) {
                             await rl.question('> '); return { type: 'noAction' };
                         }
                         const saveChoice = await rl.question('> ');
                         const index = parseInt(saveChoice, 10) - 1;
                         if (index >= 0 && index < potentialTargets.length) {
                             return { type: 'doctorSave', targetPlayerId: potentialTargets[index].id };
                         } else {
                             return { type: 'doctorSave', targetPlayerId: null }; // Explicit no save
                         }
                    } else if (gameState.self.role === RoleName.Seer) {
                         // --- Seer Logic --- (Keep existing correct logic)
                         const aliveOthers = Array.from(gameState.alivePlayerIds).filter(id => id !== gameState.self.id);
                         const aliveOthersInfo = aliveOthers.map(id => gameState.players.find(p => p.id === id)!);
                         const potentialTargets = aliveOthersInfo.filter(p => p.id !== gameState.self.id); 
                         if (potentialTargets.length === 0) {
                             await rl.question('> '); return { type: 'noAction' };
                         }
                         const investigateChoice = await rl.question('> ');
                         const index = parseInt(investigateChoice, 10) - 1;
                         if (index >= 0 && index < potentialTargets.length) {
                             return { type: 'seerInvestigate', targetPlayerId: potentialTargets[index].id };
                         } else {
                             return { type: 'seerInvestigate', targetPlayerId: null }; // Explicit no investigation
                         }
                    } else { 
                         // --- Other Roles --- (Keep existing correct logic)
                         await rl.question('> '); 
                         return { type: 'noAction' };
                    }

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
