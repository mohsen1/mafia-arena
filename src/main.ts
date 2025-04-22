import { Game } from './core/Game';
import { MafiaRole } from './roles/MafiaRole';
import { VillagerRole } from './roles/VillagerRole';
import { DummyAIAgent } from './agents/DummyAIAgent'; // Import Dummy AI
import { HumanAgent } from './agents/HumanAgent';
import { ConsoleRenderer } from './rendering/ConsoleRenderer';
import { MarkdownRenderer } from './rendering/MarkdownRenderer';
import { SeerRole } from './roles/SeerRole';
import { DoctorRole } from './roles/DoctorRole';
import type { IRole } from './interfaces/IRole';
import { OpenAIAgent } from './agents/OpenAIAgent'; // Import OpenAI Agent
import * as dotenv from 'dotenv';
import * as readline from 'readline/promises'; // Import readline/promises

// Load environment variables from .env file
dotenv.config();

// --- Argument Parsing ---
const args = process.argv.slice(2); // Skip node executable and script path
const useDummyAI = args.includes('--dummy-ai');

// --- Interactive Setup Function ---
async function interactiveSetup(rl: readline.Interface): Promise<{ playerCount: number, includeHuman: boolean }> {
    let playerCount = 0;
    while (playerCount < 3) { // Ensure minimum player count (e.g., 3)
        const countStr = await rl.question('How many players in total? (minimum 3): ');
        playerCount = parseInt(countStr, 10);
        if (isNaN(playerCount) || playerCount < 3) {
            console.log("Invalid input. Please enter a number >= 3.");
            playerCount = 0; // Reset to loop again
        }
    }

    let includeHuman = false;
    while (true) {
        const humanStr = await rl.question('Should a human player join? (yes/no): ');
        if (humanStr.toLowerCase() === 'yes' || humanStr.toLowerCase() === 'y') {
            includeHuman = true;
            break;
        } else if (humanStr.toLowerCase() === 'no' || humanStr.toLowerCase() === 'n') {
            includeHuman = false;
            break;
        } else {
            console.log("Invalid input. Please enter 'yes' or 'no'.");
        }
    }

    return { playerCount, includeHuman };
}

async function main() {
    // Create readline interface
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    let game: Game | null = null; // Keep track of game instance

    try {
        // --- Get Setup Config Interactively ---
        const { playerCount, includeHuman } = await interactiveSetup(rl);

        console.log(`\nSetting up game with ${playerCount} players (${includeHuman ? 'including Human' : 'AI only'})...`);
        console.log(`(${useDummyAI ? 'Using Dummy AI' : 'Using OpenAI AI'} for AI players)`);

        // Define roles based on player count 
        let rolesToAssign: IRole[];
        // Example dynamic role assignment (customize as needed)
        const mafiaCount = Math.max(1, Math.floor(playerCount / 3.5)); // ~1 Mafia per 3.5 players
        const doctorCount = playerCount >= 5 ? 1 : 0; // Add Doctor for 5+ players
        const seerCount = playerCount >= 4 ? 1 : 0;   // Add Seer for 4+ players
        const villagerCount = playerCount - mafiaCount - doctorCount - seerCount;

        if (villagerCount < 0) {
             throw new Error(`Role assignment error for ${playerCount} players. Check logic.`);
        }

        rolesToAssign = [];
        for (let i = 0; i < mafiaCount; i++) rolesToAssign.push(new MafiaRole());
        if (doctorCount > 0) rolesToAssign.push(new DoctorRole());
        if (seerCount > 0) rolesToAssign.push(new SeerRole());
        for (let i = 0; i < villagerCount; i++) rolesToAssign.push(new VillagerRole());

        // Shuffle roles for random assignment
        rolesToAssign.sort(() => Math.random() - 0.5);

        // Create player configurations (name, role, agent)
        const playerSetups = [];
        const AIAgentClass = useDummyAI ? DummyAIAgent : OpenAIAgent;
        let humanPlayerIndex = includeHuman ? 0 : -1; // Human is Player 1 if included

        for (let i = 0; i < playerCount; i++) {
            const role = rolesToAssign[i];
            const name = `Player ${i + 1}`;

            let agent;
            if (i === humanPlayerIndex) {
                agent = new HumanAgent();
            } else {
                agent = new AIAgentClass();
            }

            playerSetups.push({ name, role, agent });
        }

        // Set up the game with the player configurations
        game = new Game(playerSetups);

        // Add renderers
        game.addRenderer(new ConsoleRenderer());
        game.addRenderer(new MarkdownRenderer());

        // Run the game loop
        await game.runGameLoop();
        console.log('Game completed successfully.');

    } catch (error) {
        console.error('Error during game execution:', error);
    } finally {
        rl.close(); // Ensure readline interface is closed
         // Optional: Explicitly exit if needed, though node should exit naturally
         // process.exit(0); 
    }
}

// Start the game
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
