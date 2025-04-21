import { Game } from './core/Game';
import { MafiaRole } from './roles/MafiaRole';
import { VillagerRole } from './roles/VillagerRole';
import { DummyAIAgent } from './agents/DummyAIAgent';
import { HumanAgent } from './agents/HumanAgent';
import { ConsoleRenderer } from './rendering/ConsoleRenderer';
import { MarkdownRenderer } from './rendering/MarkdownRenderer';
import { SeerRole } from './roles/SeerRole';
import { DoctorRole } from './roles/DoctorRole';
import type { IRole } from './interfaces/IRole';

async function main() {
    console.log('Starting Mafia Game...');

    // Basic configuration
    const playerCount = 5; // Total players

    // Define roles based on player count (example for 5 players)
    let rolesToAssign: IRole[];
    if (playerCount === 5) {
        rolesToAssign = [
            new MafiaRole(),
            new SeerRole(),
            new DoctorRole(),
            new VillagerRole(),
            new VillagerRole(),
        ];
    } else {
        // Fallback for other counts (adjust as needed)
        const mafiaCount = Math.max(1, Math.floor(playerCount / 3));
        rolesToAssign = [];
        for (let i = 0; i < mafiaCount; i++) rolesToAssign.push(new MafiaRole());
        while (rolesToAssign.length < playerCount) rolesToAssign.push(new VillagerRole());
    }

    // Shuffle roles for random assignment
    rolesToAssign.sort(() => Math.random() - 0.5);
    
    // Create player configurations (name, role, agent)
    const playerSetups = [];
    for (let i = 0; i < playerCount; i++) {
        const role = rolesToAssign[i];
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
