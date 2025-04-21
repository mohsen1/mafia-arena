import { IAgent, PlayerAction } from '../interfaces/IAgent';
import { VisibleGameState } from '../interfaces/GameState';
import { PlayerId } from '../interfaces/IPlayer';
import { delay } from '../core/utils';

export class DummyAIAgent implements IAgent {
    public playerId!: PlayerId; // Set by Game constructor

    async getAction(gameState: VisibleGameState, allowedActions?: PlayerAction['type'][]): Promise<PlayerAction> {
        await delay(50 + Math.random() * 100); // Simulate thinking time

        const aliveOthers = Array.from(gameState.alivePlayerIds).filter(id => id !== gameState.self.id);

        switch (gameState.phase) {
            case 'Day':
                 // If voting is allowed, prioritize voting. Otherwise, message.
                 const canVote = allowedActions?.includes('vote');
                 const canMessage = allowedActions?.includes('message');

                 if (canVote && aliveOthers.length > 0 && Math.random() < 0.8) { // Higher chance to vote when allowed
                    const targetId = aliveOthers[Math.floor(Math.random() * aliveOthers.length)];
                    console.log(`[${this.playerId}] Deciding to VOTE for ${targetId}`);
                    return { type: 'vote', targetPlayerId: targetId };
                } else if (canMessage && Math.random() < 0.7) { // Chance to message if allowed
                    const message = `[${gameState.language}] Hello from ${gameState.self.name} (${this.playerId}). It's round ${gameState.round}.`;
                    console.log(`[${this.playerId}] Deciding to SEND MESSAGE: ${message}`);
                    return { type: 'message', content: message };
                } else {
                    // If couldn't decide or only noAction is allowed
                    console.log(`[${this.playerId}] Deciding NO ACTION for day.`);
                    return { type: 'noAction' };
                }
            case 'Night':
                if (gameState.self.isMafia && aliveOthers.length > 0) {
                    // Mafia: Kill a random non-mafia player
                    const potentialTargets = aliveOthers.filter(id => !gameState.mafiaPlayerIds?.has(id));
                    if(potentialTargets.length > 0) {
                        const targetId = potentialTargets[Math.floor(Math.random() * potentialTargets.length)];
                        console.log(`[${this.playerId} - MAFIA] Deciding to KILL ${targetId}`);
                        return { type: 'mafiaKill', targetPlayerId: targetId };
                    }
                }
                 // Villagers (or Mafia with no targets) do nothing specific at night
                 console.log(`[${this.playerId}] Deciding NO ACTION for night.`);
                return { type: 'noAction' };

            default:
                console.log(`[${this.playerId}] No action defined for phase ${gameState.phase}`);
                return { type: 'noAction' };
        }
    }
}
