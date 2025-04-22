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
import prompts from 'prompts'; // Import prompts
import { Themes, type Persona } from './interfaces/Theme'; // Import Themes and Persona
import { RoleName } from './interfaces/IRole';

// Load environment variables from .env file
dotenv.config();

// --- Define Agent Choices ---
type AgentChoice = 'Human' | 'Dummy' | 'OpenAI' | 'Claude' | 'Gemini';
const aiAgentChoices = [
    { title: 'Dummy AI (Fast, Simple)', value: 'Dummy' },
    { title: 'OpenAI (GPT - Requires OPENAI_API_KEY)', value: 'OpenAI' },
    { title: 'Claude (Anthropic - Requires ANTHROPIC_API_KEY)', value: 'Claude' },
    { title: 'Gemini (Google - Requires GEMINI_API_KEY)', value: 'Gemini' },
];

const agentClassMap = {
    'Dummy': DummyAIAgent,
    'OpenAI': OpenAIAgent,
    'Claude': ClaudeAgent,
    'Gemini': GeminiAgent,
    'Human': HumanAgent // Include Human for mapping if needed
};

async function interactiveSetup(): Promise<{
    playerCount: number;
    themeKey: string;
    mafiaAgentType: AgentChoice;
    townAgentType: AgentChoice;
}> {
    const questions: prompts.PromptObject[] = [
        {
            type: 'number',
            name: 'playerCount',
            message: 'How many players in total?',
            initial: 5,
            min: 3,
            validate: value => value >= 3 ? true : 'Minimum 3 players required'
        },
        {
            type: 'select',
            name: 'themeKey',
            message: 'Choose a game theme:',
            choices: Object.keys(Themes).map(key => ({
                title: `${Themes[key].name} (${Themes[key].description})`,
                value: key
            })),
            initial: 0
        },
        {
            type: 'select',
            name: 'mafiaAgentType',
            message: 'Choose AI agent type for MAFIA roles:',
            choices: aiAgentChoices,
            initial: 1 // Default to OpenAI for Mafia
        },
        {
            type: 'select',
            name: 'townAgentType',
            message: 'Choose AI agent type for TOWN roles (Villager, Doctor, Seer):',
            choices: aiAgentChoices,
            initial: 1 // Default to OpenAI for Town
        }
    ];

    const response = await prompts(questions, {
         onCancel: () => { 
             console.log("Game setup cancelled.");
             process.exit(0);
         } 
    });

    // prompts returns an object with the names as keys
    return response as { 
        playerCount: number; 
        themeKey: string; 
        mafiaAgentType: AgentChoice; 
        townAgentType: AgentChoice; 
    };
}

async function main() {
    let game: Game | null = null;

    try {
        // --- Get Setup Config Interactively ---
        const { 
            playerCount, 
            themeKey, 
            mafiaAgentType, 
            townAgentType 
        } = await interactiveSetup();
        
        const selectedTheme = Themes[themeKey];

        // Determine if a human player is involved based on selections
        // For simplicity, we'll assume no human for now if both AI types are chosen.
        // Could add a separate question or allow choosing 'Human' as an agent type.
        const includeHuman = false; 
        // TODO: Re-add human player option if needed, possibly by adding 'Human' to agent choices.

        console.log(`\nSetting up game with ${playerCount} players (${includeHuman ? 'including Human' : 'AI only'})...`);
        console.log(`Theme: ${selectedTheme.name}`);
        console.log(`Mafia AI: ${mafiaAgentType}, Town AI: ${townAgentType}`);

        // --- Role Assignment --- (Same as before)
        let rolesToAssign: IRole[];
        const mafiaCount = Math.max(1, Math.floor(playerCount / 3.5));
        const doctorCount = playerCount >= 5 ? 1 : 0;
        const seerCount = playerCount >= 4 ? 1 : 0;
        const villagerCount = playerCount - mafiaCount - doctorCount - seerCount;

        if (villagerCount < 0) {
             throw new Error(`Role assignment error for ${playerCount} players. Check logic.`);
        }
        rolesToAssign = [];
        for (let i = 0; i < mafiaCount; i++) rolesToAssign.push(new MafiaRole());
        if (doctorCount > 0) rolesToAssign.push(new DoctorRole());
        if (seerCount > 0) rolesToAssign.push(new SeerRole());
        for (let i = 0; i < villagerCount; i++) rolesToAssign.push(new VillagerRole());
        rolesToAssign.sort(() => Math.random() - 0.5);

        // --- Persona Assignment --- (Same as before)
        const personas = selectedTheme.generatePersonaPool(playerCount);

        // --- Create Player Setups --- (Modified for role-based AI)
        const playerSetups = [];
        let humanPlayerIndex = -1; // Assume no human for now
        let currentPersonaIndex = 0; 

        for (let i = 0; i < playerCount; i++) {
            const role = rolesToAssign[i];
            let assignedPersona: Persona | undefined = undefined;
            let playerName: string;
            let agent;
            let AgentClass;

            if (i === humanPlayerIndex) { // Placeholder if human logic is re-added
                agent = new HumanAgent();
                playerName = `Player ${i + 1}`;
            } else {
                // Select AI Class based on Role Allegiance
                if (role.allegiance === 'Mafia') {
                    AgentClass = agentClassMap[mafiaAgentType];
                } else { // Town roles
                    AgentClass = agentClassMap[townAgentType];
                }

                if (!AgentClass) {
                    console.warn(`Warning: Could not find agent class for type. Defaulting to Dummy.`);
                    AgentClass = DummyAIAgent;
                }
                agent = new AgentClass();

                // Assign persona
                if (currentPersonaIndex < personas.length) {
                    assignedPersona = personas[currentPersonaIndex];
                    // Only assign persona to AI agents - The persona is passed via GameState, no need to assign here.
                    // if (!(agent instanceof HumanAgent)) {
                    //    // Assert type to satisfy linter
                    //    (agent as OpenAIAgent | ClaudeAgent | GeminiAgent | DummyAIAgent).persona = assignedPersona;
                    //}
                    playerName = assignedPersona.name; 
                    currentPersonaIndex++;
                } else {
                     playerName = `Player ${i + 1}`;
                     console.warn(`Warning: Not enough personas generated for player ${i+1}`);
                }
            }

            playerSetups.push({ name: playerName, role, agent });
        }

        // Set up the game 
        game = new Game(playerSetups, themeKey, 'en'); 

        // Add renderers
        game.addRenderer(new ConsoleRenderer());
        game.addRenderer(new MarkdownRenderer());

        // Run the game loop
        await game.runGameLoop();
        console.log('Game completed successfully.');

    } catch (error) {
        console.error('Error during game execution:', error);
    } 
    // No finally block needed, prompts handles ctrl+c gracefully
}

// Start the game
main().catch(error => {
    console.error('Fatal error:', error);
    // Check if it's a prompts cancellation error before logging full stack
    if (error && typeof error === 'object' && 'exitCode' in error && error.exitCode === 130) {
        // User likely pressed Ctrl+C
    } else {
        console.error(error);
    }
    process.exit(1);
});
