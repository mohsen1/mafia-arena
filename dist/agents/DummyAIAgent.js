"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DummyAIAgent = void 0;
const utils_1 = require("../core/utils");
class DummyAIAgent {
    async getAction(gameState) {
        await (0, utils_1.delay)(50 + Math.random() * 100); // Simulate thinking time
        const aliveOthers = Array.from(gameState.alivePlayerIds).filter(id => id !== gameState.self.id);
        switch (gameState.phase) {
            case 'Day':
                // 50% chance to talk, 50% chance to vote
                if (Math.random() < 0.6 && aliveOthers.length > 0) {
                    // Vote for a random alive player (not self)
                    const targetId = aliveOthers[Math.floor(Math.random() * aliveOthers.length)];
                    console.log(`[${this.playerId}] Deciding to VOTE for ${targetId}`);
                    return { type: 'vote', targetPlayerId: targetId };
                }
                else {
                    // Send a generic message
                    const message = `Hello from ${gameState.self.name} (${this.playerId}). It's round ${gameState.round}.`;
                    console.log(`[${this.playerId}] Deciding to SEND MESSAGE: ${message}`);
                    return { type: 'message', content: message };
                }
            case 'Night':
                if (gameState.self.isMafia && aliveOthers.length > 0) {
                    // Mafia: Kill a random non-mafia player
                    const potentialTargets = aliveOthers.filter(id => !gameState.mafiaPlayerIds?.has(id));
                    if (potentialTargets.length > 0) {
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
exports.DummyAIAgent = DummyAIAgent;
