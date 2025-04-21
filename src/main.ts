import { Game } from './core/Game';
import { MafiaRole } from './roles/MafiaRole';
import { VillagerRole } from './roles/VillagerRole';
import { DummyAIAgent } from './agents/DummyAIAgent';
import { HumanAgent } from './agents/HumanAgent';
import { ConsoleRenderer } from './rendering/ConsoleRenderer';
import { MarkdownRenderer } from './rendering/MarkdownRenderer';

async function main() {
    console.log('Starting Mafia Game...');

    // Basic configuration
    const playerCount = 5; // Total players
    const mafiaCount = Math.max(1, Math.floor(playerCount / 3)); // ~1/3 are Mafia
    
    // Create player configurations (name, role, agent)
    const playerSetups = [];
    for (let i = 0; i < playerCount; i++) {
        const isMafia = i < mafiaCount;
        const role = isMafia ? new MafiaRole() : new VillagerRole();
        const name = `Player ${i+1}`;
        
        // First player is human, the rest are AI
        const agent = i === 0 ? new HumanAgent() : new DummyAIAgent();
        
        playerSetups.push({ name, role, agent });
    }
    
    // Set up the game with the player configurations
    const game = new Game(playerSetups);
    
    // Add renderers
    game.addRenderer(new ConsoleRenderer());
    game.addRenderer(new MarkdownRenderer());
    
    try {
        // Run the game loop
        await game.runGameLoop();
        console.log('Game completed successfully.');
    } catch (error) {
        console.error('Error during game execution:', error);
    }
}

// Start the game
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
