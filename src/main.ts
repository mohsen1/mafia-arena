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
import { Player } from './core/Player';
import type { IAgent } from './interfaces/IAgent'; // Ensure IAgent is imported
import type { Allegiance } from './interfaces/IRole'; // Import Allegiance
import process from 'process'; // Import process for argv

// Load environment variables from .env file
dotenv.config();

// --- AI Configuration ---

// Example Models (User-friendly names)
const openAIModels = [
  { title: 'GPT-4.1 Mini (Default, Fast)', value: 'gpt-4.1-mini' },
  { title: 'GPT-4.1 (Advanced)', value: 'gpt-4.1' },
  { title: 'GPT-4 Turbo', value: 'gpt-4-turbo' },
  { title: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo' },
];

const claudeModels = [
  { title: 'Claude 3.7 Sonnet (Default)', value: 'claude-3-7-sonnet-20250219' },
  { title: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet-20241022' },
  { title: 'Claude 3.5 Haiku', value: 'claude-3-5-haiku-20241022' },
  { title: 'Claude 3 Opus', value: 'claude-3-opus-20240229' },
  { title: 'Claude 3 Haiku', value: 'claude-3-haiku-20240307' },
];

const geminiModels = [
  { title: 'Gemini 2.5 Flash (Default)', value: 'gemini-2.5-flash-preview-04-17' },
  { title: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro-preview-03-25' },
  { title: 'Gemini 2.0 Flash', value: 'gemini-2.0-flash' },
  { title: 'Gemini 2.0 Pro', value: 'gemini-2.0-pro' },
];

// Groq Models
const groqModels = [
  // Production Models
  { title: 'Gemma 2 9B IT (Google)', value: 'gemma2-9b-it' },
  { title: 'Llama 3.3 70B Versatile (Meta)', value: 'llama-3.3-70b-versatile' },
  { title: 'Llama 3.1 8B Instant (Meta)', value: 'llama-3.1-8b-instant' },
  { title: 'Llama3 70B (Meta, 8K Context)', value: 'llama3-70b-8192' },
  { title: 'Llama3 8B (Meta, 8K Context)', value: 'llama3-8b-8192' },
  // Preview Models (May be discontinued)
  { title: 'Llama 4 Maverick 17B (Meta, Preview)', value: 'meta-llama/llama-4-maverick-17b-128e-instruct' },
  { title: 'Llama 4 Scout 17B (Meta, Preview)', value: 'meta-llama/llama-4-scout-17b-16e-instruct' },
  { title: 'Deepseek R1 Distill Llama 70B (DeepSeek, Preview)', value: 'deepseek-r1-distill-llama-70b' },
  { title: 'Mistral Saba 24B (Mistral, Preview)', value: 'mistral-saba-24b' },
  { title: 'Qwen QWQ 32B (Alibaba, Preview)', value: 'qwen-qwq-32b' },
  { title: 'Allam 2 7B (SDAIA, Preview)', value: 'allam-2-7b' },
];

// Example OpenAI Providers/Endpoints
const openAIProviders = [
  {
    title: 'Official OpenAI API',
    value: 'openai',
    endpoint: 'https://api.openai.com/v1', // Default OpenAI endpoint
    apiKeyEnvVar: 'OPENAI_API_KEY', // Expected env var
  },
  {
    title: 'Local Ollama (http://localhost:11434)',
    value: 'ollama_local',
    endpoint: 'http://localhost:11434/v1', // Common Ollama endpoint
    apiKeyEnvVar: 'OLLAMA_API_KEY', // Ollama might need 'ollama' or can be optional
  },
  {
    title: 'Fireworks AI (Requires FIREWORKS_API_KEY)',
    value: 'fireworks',
    endpoint: 'https://api.fireworks.ai/inference/v1',
    apiKeyEnvVar: 'FIREWORKS_API_KEY',
  },
  {
    title: 'Groq API (Requires GROQ_API_KEY)',
    value: 'groq',
    endpoint: 'https://api.groq.com/openai/v1', // Groq uses OpenAI-compatible endpoint
    apiKeyEnvVar: 'GROQ_API_KEY',
  },
  // Add other providers like Groq, Together AI, custom endpoints etc.
];

// Map Agent types to their model choices (needed again)
const agentModelChoices = {
  OpenAI: openAIModels,
  Claude: claudeModels,
  Gemini: geminiModels,
  Groq: groqModels, 
  Ollama: [], // Ollama uses user input
  Dummy: [],
  Human: [],
};

// --- Define Agent Choices and Map (needed again) ---
type AgentChoice = 'Dummy' | 'OpenAI' | 'Claude' | 'Gemini' | 'Groq' | 'Ollama' | 'Human'; 

const aiAgentChoices = [
    { title: 'Groq Models (Llama, etc. via OpenAI API - FAST)', value: 'Groq' }, 
    { title: 'Ollama (Local Models via OpenAI API)', value: 'Ollama' }, 
    { title: 'OpenAI Model (GPT series)', value: 'OpenAI' },
    { title: 'Claude Model (Anthropic)', value: 'Claude' },
    { title: 'Gemini Model (Google)', value: 'Gemini' },
    { title: 'Dummy AI (Fast, No API needed)', value: 'Dummy' },
];

const agentClassMap: { [key in AgentChoice]: any } = {
    Dummy: DummyAIAgent,
    OpenAI: OpenAIAgent,
    Claude: ClaudeAgent, 
    Gemini: GeminiAgent, 
    Groq: OpenAIAgent, // Uses OpenAIAgent
    Ollama: OpenAIAgent, // Uses OpenAIAgent
    Human: HumanAgent,
};

// --- Type for Group Configuration (needed again) ---
type AgentGroupConfig = {
    agentType: AgentChoice;
    model?: string;
    provider?: typeof openAIProviders[0]; 
};

// --- Interactive Setup Function (Reverted to Group Config) ---
async function interactiveSetup(): Promise<{
    playerCount: number;
    themeKey: string;
    humanPlayerIndex: number; // -1 if no human
    mafiaConfig: AgentGroupConfig; // Separate config for Mafia
    townConfig: AgentGroupConfig;  // Separate config for Town
}> {
    const initialSetup = await prompts([
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
                 title: `${Themes[key].name}: (${Themes[key].description})`,
                 value: key
             })),
             initial: 0
         },
         {
             type: 'confirm',
             name: 'includeHuman',
             message: 'Include a Human player? (Will be Player 1)',
             initial: false
         },
    ], { onCancel: () => process.exit(0) });

    const playerCount = initialSetup.playerCount;
    const themeKey = initialSetup.themeKey;
    const humanPlayerIndex = initialSetup.includeHuman ? 0 : -1; 

    console.log("\n--- Configure AI Player Groups ---");

    // Helper function to get config for a group 
    const getGroupConfig = async (groupName: string): Promise<AgentGroupConfig> => {
        console.log(`\nConfiguring AI for ${groupName} Roles:`);
        const agentResponse = await prompts({
            type: 'select',
            name: 'agentType',
            message: `Select Agent Type for ${groupName} Roles:`, 
            choices: aiAgentChoices,
            initial: 0, // Default Groq
        }, { onCancel: () => process.exit(0) });

        const agentType = agentResponse.agentType as AgentChoice;
        let model: string | undefined = undefined;
        let provider: typeof openAIProviders[0] | undefined = undefined;

        // --- Model Selection (as before) ---
        const availableModels = agentModelChoices[agentType];
        if (agentType === 'Ollama') {
            const modelResponse = await prompts({
                type: 'text',
                name: 'modelName',
                message: `Enter the Ollama model name for ${groupName}:`, 
                initial: 'llama3:latest',
                validate: value => value.trim().length > 0 ? true : 'Model name cannot be empty'
            }, { onCancel: () => process.exit(0) });
            model = modelResponse.modelName.trim();
        } else if (availableModels && availableModels.length > 0) {
            const modelResponse = await prompts({
                 type: 'select',
                 name: 'modelValue',
                 message: `Select Model for ${groupName} (${agentType}):`, 
                 choices: availableModels,
                 initial: 0,
             }, { onCancel: () => process.exit(0) });
            model = modelResponse.modelValue;
        }

        // --- Provider Selection/Assignment ---
        // Automatically assign provider if agent type implies it
        if (agentType === 'Groq') {
            provider = openAIProviders.find(p => p.value === 'groq');
            console.log(`-> Provider automatically set to: ${provider?.title}`);
        } else if (agentType === 'Ollama') {
            provider = openAIProviders.find(p => p.value === 'ollama_local');
            console.log(`-> Provider automatically set to: ${provider?.title}`);
        } 
        // Only prompt for provider for types like OpenAI that might use different compatible endpoints
        else if (agentType === 'OpenAI') { 
            // Filter to show providers compatible with OpenAI models/API
             const relevantProviders = openAIProviders.filter(
                 p => ['openai', 'ollama_local', 'fireworks'].includes(p.value) // Exclude Groq here
             );
             const defaultProviderIndex = relevantProviders.findIndex(p => p.value === 'openai'); // Default to official OpenAI

            const providerResponse = await prompts({
                 type: 'select',
                 name: 'providerValue',
                 message: `Select API Provider/Endpoint for ${groupName} (${agentType}):`, 
                 choices: relevantProviders.map(p => ({ title: p.title, value: p.value })),
                 initial: defaultProviderIndex >= 0 ? defaultProviderIndex : 0, 
             }, { onCancel: () => process.exit(0) });
            provider = openAIProviders.find(p => p.value === providerResponse.providerValue); 
        }
        // Claude and Gemini have dedicated clients, no provider selection needed here
        // Dummy and Human don't need provider/model

        // Log the chosen config for clarity
        console.log(`   ${groupName} Config: Type=${agentType}, Model=${model || 'N/A'}, Provider=${provider?.title || 'N/A'}`);

        return { agentType, model, provider };
    };
    
    // Get separate configs
    const mafiaConfig = await getGroupConfig('Mafia');
    const townConfig = await getGroupConfig('Town (Villager, Doctor, Seer, etc.)');

    return {
        playerCount,
        themeKey,
        humanPlayerIndex,
        mafiaConfig,
        townConfig
    };
}


// --- Main Game Function (Reverted to use Group Config) ---
async function main() {
    let game: Game | null = null;

    try {
        // Check for -y flag
        const skipInteractive = process.argv.includes('-y');

        let playerCount: number;
        let themeKey: string;
        let humanPlayerIndex: number;
        let mafiaConfig: AgentGroupConfig;
        let townConfig: AgentGroupConfig;

        if (skipInteractive) {
            console.log('Skipping interactive setup (-y flag detected). Using defaults.');
            // Define default settings
            playerCount = 5;
            const themeKeys = Object.keys(Themes);
            themeKey = themeKeys.length > 0 ? themeKeys[0] : 'western'; // Default theme or fallback
            humanPlayerIndex = -1; // No human player
            const defaultProvider = openAIProviders.find(p => p.value === 'groq'); // Default to Groq
            const defaultModel = groqModels.length > 0 ? groqModels[0].value : undefined; // Default Groq model

            if (!defaultProvider) {
                 console.warn("Warning: Default provider 'groq' not found. AI might not function correctly.");
            }
             if (!defaultModel && defaultProvider) {
                 console.warn(`Warning: Default model for provider '${defaultProvider.title}' not found. AI might not function correctly.`);
             }

            mafiaConfig = {
                agentType: 'Groq',
                model: defaultModel,
                provider: defaultProvider,
            };
            townConfig = {
                agentType: 'Groq',
                model: defaultModel,
                provider: defaultProvider,
            };

        } else {
            // Initial API Key check can be generic or removed, checked later

            const setupResult = await interactiveSetup();
            playerCount = setupResult.playerCount;
            themeKey = setupResult.themeKey;
            humanPlayerIndex = setupResult.humanPlayerIndex;
            mafiaConfig = setupResult.mafiaConfig;
            townConfig = setupResult.townConfig;
        }


        // Check necessary API keys AFTER setup based on choices
        if (mafiaConfig.agentType !== 'Dummy' && mafiaConfig.agentType !== 'Human') {
            if (!process.env[mafiaConfig.provider?.apiKeyEnvVar || ''] && mafiaConfig.provider?.apiKeyEnvVar) {
                 console.warn(`\n!!! WARNING: API Key (${mafiaConfig.provider.apiKeyEnvVar}) for MAFIA provider (${mafiaConfig.provider.title}) not found. Mafia AI might fail. !!!\n`);
            }
        }
         if (townConfig.agentType !== 'Dummy' && townConfig.agentType !== 'Human') {
            if (!process.env[townConfig.provider?.apiKeyEnvVar || ''] && townConfig.provider?.apiKeyEnvVar) {
                 console.warn(`\n!!! WARNING: API Key (${townConfig.provider.apiKeyEnvVar}) for TOWN provider (${townConfig.provider.title}) not found. Town AI might fail. !!!\n`);
            }
        }
        
        const selectedTheme = Themes[themeKey];
        if (!selectedTheme) {
             throw new Error(`Selected theme key "${themeKey}" is invalid or theme definition is missing.`);
        }

        console.log(`\nSetting up game with ${playerCount} players...`);
        console.log(`Theme: ${selectedTheme.name}`);
        console.log(`Mafia AI Config: Type=${mafiaConfig.agentType}, Model=${mafiaConfig.model || 'N/A'}, Provider=${mafiaConfig.provider?.title || 'N/A'}`);
        console.log(`Town AI Config:  Type=${townConfig.agentType}, Model=${townConfig.model || 'N/A'}, Provider=${townConfig.provider?.title || 'N/A'}`);

        // --- Role Assignment --- (Dynamic based on player count)
        let rolesToAssign: IRole[];
        const mafiaCount = Math.max(1, Math.floor(playerCount / 3.5)); // Example ratio
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
        rolesToAssign.sort(() => Math.random() - 0.5); // Shuffle roles

        // --- Persona Assignment ---
        const personas = selectedTheme.generatePersonaPool(playerCount);
        if (personas.length < playerCount) {
            console.warn(`Warning: Theme '${selectedTheme.name}' only provided ${personas.length} personas for ${playerCount} players. Some players may have fallback names.`);
        }

        // --- Create Player Setups --- (Using group config)
        const playerSetups = [];
        let currentPersonaIndex = 0;

        for (let i = 0; i < playerCount; i++) {
            const role = rolesToAssign[i];
            let assignedPersona: Persona | undefined = undefined;
            let playerName: string;
            let agent: IAgent; 
            let config: AgentGroupConfig;

             if (currentPersonaIndex < personas.length) {
                 assignedPersona = personas[currentPersonaIndex++];
                 playerName = assignedPersona.name;
            } else {
                 playerName = `Player ${i + 1}`; 
            }

            // Determine Agent Configuration based on role allegiance
            if (i === humanPlayerIndex) {
                 config = { agentType: 'Human' }; 
                 console.log(`   Player ${i+1} (${playerName}): Human Player`);
            } else if (role.allegiance === 'Mafia') {
                 config = mafiaConfig;
                 console.log(`   Player ${i+1} (${playerName}): ${role.name} (Mafia Group AI)`);
            } else { // Town allegiance
                 config = townConfig;
                 console.log(`   Player ${i+1} (${playerName}): ${role.name} (Town Group AI)`);
            }

            // Instantiate Agent based on determined config
            const AgentClass = agentClassMap[config.agentType];
            if (!AgentClass) {
                 console.warn(`Warning: Could not find agent class for type ${config.agentType}. Defaulting to Dummy.`);
                 agent = new DummyAIAgent();
            } else if (config.agentType === 'Human') {
                 agent = new HumanAgent();
            } else if (['OpenAI', 'Groq', 'Ollama'].includes(config.agentType)) { 
                 const providerApiKey = config.provider?.apiKeyEnvVar ? process.env[config.provider.apiKeyEnvVar] : undefined;
                 // Handle Ollama key potentially being undefined/empty or the literal 'OLLAMA_API_KEY'
                 const apiKeyToSend = (config.provider?.value === 'ollama_local' && (!providerApiKey || providerApiKey === 'OLLAMA_API_KEY')) ? undefined : providerApiKey;
                 // AgentClass is OpenAIAgent for these types
                 agent = new AgentClass(config.model, config.provider?.endpoint, apiKeyToSend); 
            } else if (config.agentType === 'Claude') {
                 agent = new ClaudeAgent(config.model);
            } else if (config.agentType === 'Gemini') {
                 agent = new GeminiAgent(config.model);
            }
            else { // Dummy
                 agent = new DummyAIAgent();
            }

            // Assign persona (as before)
            if (assignedPersona && 'persona' in agent) {
                  (agent as any).persona = assignedPersona; 
            }
            playerSetups.push({ name: playerName, role, agent });
        }

        // --- Game Initialization ---
        console.log("\nInitializing game...");
        game = new Game(playerSetups, themeKey, 'en');

        // Add renderers
        game.addRenderer(new ConsoleRenderer());
        game.addRenderer(new MarkdownRenderer()); // Automatically gets gameId

        // Log game start (Renderer handles Game ID)
        console.log("\nStarting game...\n");

        // Run the game loop
        await game.runGameLoop();

        console.log('\nGame simulation completed.');

    } catch (error) {
        if (error instanceof Error && (error.message.includes('cancelled') || error.message === 'User force closed the prompt')) {
             console.log('\nGame setup cancelled by user.');
        } else {
             console.error('\n--- An unexpected error occurred during game execution ---');
             console.error(error);
             // Optionally save game state or logs even on error if `game` is initialized
             if (game) {
                 console.error("Game execution failed."); // Simplified error message
                 // Could try to force render partial state if needed, but risky
             }
        }
        process.exit(1); // Exit with error code
    } finally {
        // Any cleanup logic can go here
        console.log('Exiting.');
        // Ensure node process exits cleanly if background tasks linger
        process.exit(0);
    }
}

// Start the game
main();
