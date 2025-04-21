"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.HumanAgent = void 0;
const readline = __importStar(require("readline/promises")); // Use promise-based readline
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
class HumanAgent {
    async getAction(gameState) {
        console.log(`\n--- ${gameState.self.name} (${this.playerId}) - Your turn! ---`);
        console.log(`Phase: ${gameState.phase}, Round: ${gameState.round}`);
        console.log(`Your Role: ${gameState.self.role}`);
        if (gameState.self.isMafia) {
            console.log(`Your fellow Mafia (alive): ${Array.from(gameState.mafiaPlayerIds ?? []).join(', ')}`);
        }
        console.log(`Alive Players: ${Array.from(gameState.alivePlayerIds).map(id => gameState.players.find(p => p.id === id)?.name ?? id).join(', ')}`);
        console.log("--------------------------------------------------");
        const aliveOthers = Array.from(gameState.alivePlayerIds).filter(id => id !== gameState.self.id);
        const aliveOthersInfo = aliveOthers.map(id => gameState.players.find(p => p.id === id));
        try {
            switch (gameState.phase) {
                case 'Day':
                    const dayAction = await rl.question('Action? (m [message] / v [player index to vote] / n [no action]): ');
                    if (dayAction.startsWith('m ')) {
                        return { type: 'message', content: dayAction.substring(2) };
                    }
                    else if (dayAction.startsWith('v ')) {
                        const index = parseInt(dayAction.substring(2), 10) - 1;
                        if (index >= 0 && index < aliveOthersInfo.length) {
                            return { type: 'vote', targetPlayerId: aliveOthersInfo[index].id };
                        }
                        else {
                            console.log("Invalid player index for vote.");
                            return { type: 'noAction' }; // Or re-prompt
                        }
                    }
                    return { type: 'noAction' };
                case 'Night':
                    if (gameState.self.isMafia) {
                        if (aliveOthersInfo.length === 0)
                            return { type: 'noAction' }; // No one else to kill
                        const potentialTargets = aliveOthersInfo.filter(p => !gameState.mafiaPlayerIds?.has(p.id));
                        if (potentialTargets.length === 0) {
                            console.log("No non-mafia targets available.");
                            return { type: 'noAction' };
                        }
                        console.log("Choose player to kill:");
                        potentialTargets.forEach((p, i) => console.log(`${i + 1}: ${p.name}`));
                        const killChoice = await rl.question('Kill target index (or 0 for no kill): ');
                        const index = parseInt(killChoice, 10) - 1;
                        if (index >= 0 && index < potentialTargets.length) {
                            return { type: 'mafiaKill', targetPlayerId: potentialTargets[index].id };
                        }
                    }
                    else {
                        console.log("You rest during the night.");
                        // Add prompts for other night roles (Doctor, Detective) here
                    }
                    return { type: 'noAction' };
                default:
                    console.log("No action required for this phase.");
                    return { type: 'noAction' };
            }
        }
        catch (e) {
            console.error("Error reading input:", e);
            return { type: 'noAction' }; // Safety default
        }
        // Cannot prompt here because rl might be closed in main.ts
        // Need a better way to handle input lifecycle if game runs multiple times
    }
}
exports.HumanAgent = HumanAgent;
