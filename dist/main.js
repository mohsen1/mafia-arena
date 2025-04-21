"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Game_1 = require("./core/Game");
const MafiaRole_1 = require("./roles/MafiaRole");
const VillagerRole_1 = require("./roles/VillagerRole");
const DummyAIAgent_1 = require("./agents/DummyAIAgent");
const HumanAgent_1 = require("./agents/HumanAgent");
const ConsoleRenderer_1 = require("./rendering/ConsoleRenderer");
const MarkdownRenderer_1 = require("./rendering/MarkdownRenderer");
async function main() {
    console.log('Starting Mafia Game...');
    // Basic configuration
    const playerCount = 5; // Total players
    const mafiaCount = Math.max(1, Math.floor(playerCount / 3)); // ~1/3 are Mafia
    // Create player configurations (name, role, agent)
    const playerSetups = [];
    for (let i = 0; i < playerCount; i++) {
        const isMafia = i < mafiaCount;
        const role = isMafia ? new MafiaRole_1.MafiaRole() : new VillagerRole_1.VillagerRole();
        const name = `Player ${i + 1}`;
        // First player is human, the rest are AI
        const agent = i === 0 ? new HumanAgent_1.HumanAgent() : new DummyAIAgent_1.DummyAIAgent();
        playerSetups.push({ name, role, agent });
    }
    // Set up the game with the player configurations
    const game = new Game_1.Game(playerSetups);
    // Add renderers
    game.addRenderer(new ConsoleRenderer_1.ConsoleRenderer());
    game.addRenderer(new MarkdownRenderer_1.MarkdownRenderer());
    try {
        // Run the game loop
        await game.runGameLoop();
        console.log('Game completed successfully.');
    }
    catch (error) {
        console.error('Error during game execution:', error);
    }
}
// Start the game
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
