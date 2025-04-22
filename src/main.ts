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
import { ClaudeAgent } from './agents/ClaudeAgent'; // Import ClaudeAgent
import { GeminiAgent } from './agents/GeminiAgent'; // Import GeminiAgent
import * as dotenv from 'dotenv';
import * as readline from 'readline/promises'; // Import readline/promises
import { Themes, type Persona } from './interfaces/Theme'; // Import Themes and Persona

// Load environment variables from .env file
dotenv.config();

// --- Argument Parsing ---
const args = process.argv.slice(2); // Skip node executable and script path
const useDummyAI = args.includes('--dummy-ai');
const useClaudeAI = args.includes('--claude-ai'); // Add flag for Claude
const useGeminiAI = args.includes('--gemini-ai'); // Add flag for Gemini

// Determine AI Agent Class (Default to OpenAI if multiple flags or none specified)
let SelectedAIAgentClass: typeof OpenAIAgent | typeof ClaudeAgent | typeof GeminiAgent | typeof DummyAIAgent;
let aiTypeString: string;

if (useDummyAI) {
    SelectedAIAgentClass = DummyAIAgent;
    aiTypeString = "Dummy AI";
} else if (useClaudeAI && !useGeminiAI) { // Prioritize Claude if only Claude flag
    SelectedAIAgentClass = ClaudeAgent;
    aiTypeString = "Claude AI";
} else if (useGeminiAI && !useClaudeAI) { // Prioritize Gemini if only Gemini flag
    SelectedAIAgentClass = GeminiAgent;
    aiTypeString = "Gemini AI";
} else { // Default to OpenAI if no specific flag or multiple flags
    SelectedAIAgentClass = OpenAIAgent;
    aiTypeString = "OpenAI AI";
    if (useClaudeAI || useGeminiAI) {
         console.warn("Multiple AI flags specified (--claude-ai, --gemini-ai). Defaulting to OpenAI AI.");
    }
}

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

// --- Theme Selection Function ---
async function selectTheme(rl: readline.Interface): Promise<string> {
    const themeKeys = Object.keys(Themes);
    console.log("\nAvailable Themes:");
    themeKeys.forEach((key, index) => {
        console.log(`${index + 1}: ${Themes[key].name} (${Themes[key].description})`);
    });

    let selectedThemeKey = "";
    while (!selectedThemeKey) {
        const choiceStr = await rl.question(`Choose a theme number (1-${themeKeys.length}): `);
        const choiceIndex = parseInt(choiceStr, 10) - 1;
        if (choiceIndex >= 0 && choiceIndex < themeKeys.length) {
            selectedThemeKey = themeKeys[choiceIndex];
        } else {
            console.log("Invalid choice. Please enter a valid number.");
        }
    }
    return selectedThemeKey;
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
        const themeKey = await selectTheme(rl);
        const selectedTheme = Themes[themeKey];

        console.log(`\nSetting up game with ${playerCount} players (${includeHuman ? 'including Human' : 'AI only'})...`);
        console.log(`Theme: ${selectedTheme.name}`);
        console.log(`(Using ${aiTypeString} for AI players)`); // Use dynamic AI type string

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

        // --- Persona Assignment ---
        const personas = selectedTheme.generatePersonaPool(playerCount);

        // --- Create Player Setups ---
        const playerSetups = [];
        let humanPlayerIndex = includeHuman ? 0 : -1; // Human is Player 1 if included
        let currentPersonaIndex = 0; // Keep track of assigned personas

        for (let i = 0; i < playerCount; i++) {
            const role = rolesToAssign[i];
            let assignedPersona: Persona | undefined = undefined;
            let playerName: string;
            let agent;

            if (i === humanPlayerIndex) {
                agent = new HumanAgent();
                playerName = `Player ${i + 1}`; // Human keeps simple name
            } else {
                agent = new SelectedAIAgentClass();
                if (currentPersonaIndex < personas.length) {
                    assignedPersona = personas[currentPersonaIndex];
                    agent.persona = assignedPersona; // Assign persona to AI agent
                    playerName = assignedPersona.name; // Use persona name for AI player
                    currentPersonaIndex++;
                } else {
                     // Fallback if not enough personas generated (shouldn't happen with current logic)
                     playerName = `Player ${i + 1}`;
                     console.warn(`Warning: Not enough personas generated for player ${i+1}`);
                }
            }

            playerSetups.push({ name: playerName, role, agent });
        }

        // Set up the game with the player configurations
        game = new Game(playerSetups, themeKey, 'en'); // Pass themeKey to Game constructor

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
