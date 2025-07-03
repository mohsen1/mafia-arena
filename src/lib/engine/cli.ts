import * as dotenv from 'dotenv';
import process from 'node:process'; // Import process for argv
import prompts from 'prompts'; // Import prompts
import { ClaudeAgent } from './agents/ClaudeAgent'; // Import ClaudeAgent
import { DummyAIAgent } from './agents/DummyAIAgent'; // Import Dummy AI
import { GeminiAgent } from './agents/GeminiAgent'; // Import GeminiAgent
import { HumanAgent } from './agents/HumanAgent';
import { OpenAIAgent } from './agents/OpenAIAgent'; // Import OpenAI Agent
import { Game } from './core/Game';
import type { IAgent } from './interfaces/IAgent'; // Ensure IAgent is imported
import type { PlayerId } from './interfaces/IPlayer'; // Import PlayerId
import type { IRole } from './interfaces/IRole';
import { getThemes } from '@/lib/utils/themeLoader';
import { ConsoleRenderer } from './rendering/ConsoleRenderer';
import { MarkdownRenderer } from './rendering/MarkdownRenderer';
import { DoctorRole } from './roles/DoctorRole';
import { MafiaRole } from './roles/MafiaRole';
import { SeerRole } from './roles/SeerRole';
import { VillagerRole } from './roles/VillagerRole';
import {
  claudeModels,
  geminiModels,
  groqModels,
  openAIModels,
  openAIProviders,
} from '../models';

// Load environment variables from .env file
dotenv.config();

// --- AI Configuration ---

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
type AgentChoice =
  | 'Dummy'
  | 'OpenAI'
  | 'Claude'
  | 'Gemini'
  | 'Groq'
  | 'Ollama'
  | 'Human';

const aiAgentChoices = [
  { title: 'Groq Models (Llama, etc. via OpenAI API - FAST)', value: 'Groq' },
  { title: 'Ollama (Local Models via OpenAI API)', value: 'Ollama' },
  { title: 'OpenAI Model (GPT series)', value: 'OpenAI' },
  { title: 'Claude Model (Anthropic)', value: 'Claude' },
  { title: 'Gemini Model (Google)', value: 'Gemini' },
  { title: 'Dummy AI (Fast, No API needed)', value: 'Dummy' },
];

// --- Type for Group Configuration (needed again) ---
type AgentGroupConfig = {
  agentType: AgentChoice;
  model?: string;
  provider?: (typeof openAIProviders)[0];
};

// --- Interactive Setup Function (Reverted to Group Config) ---
async function interactiveSetup(): Promise<{
  playerCount: number;
  themeKey: string;
  humanPlayerIndex: number; // -1 if no human
  humanPlayerName?: string;
  mafiaConfig: AgentGroupConfig; // Separate config for Mafia
  townConfig: AgentGroupConfig; // Separate config for Town
}> {
  const initialSetup = await prompts(
    [
      {
        type: 'number',
        name: 'playerCount',
        message: 'Number of AI players (Min 3):',
        initial: 5,
        validate: (value: number) =>
          value >= 3 ? true : 'Minimum 3 players required',
      }, // Keep any type for prompt callback
      {
        type: 'text',
        name: 'theme',
        message: 'Enter game theme (e.g., Classic, Fantasy, Sci-Fi):',
        initial: 'Classic Werewolf',
      },
      {
        type: 'confirm',
        name: 'humanJoin',
        message: 'Do you want to join as a human player?',
        initial: false,
      },
      {
        type: (prev: boolean) => (prev ? 'text' : null),
        name: 'humanName',
        message: 'Enter your player name:',
        validate: (value: string) =>
          value.trim().length > 0 ? true : 'Name cannot be empty',
      },
      {
        type: 'text',
        name: 'townModel',
        message: 'Enter AI Model for Town members (e.g., gpt-4o):',
        initial: 'gpt-4o',
        validate: (value: string) =>
          value.trim().length > 0 ? true : 'Model name cannot be empty',
      },
      {
        type: 'text',
        name: 'mafiaModel',
        message: 'Enter AI Model for Mafia members (e.g., gpt-4o):',
        initial: 'gpt-4o',
        validate: (value: string) =>
          value.trim().length > 0 ? true : 'Model name cannot be empty',
      },
    ],
    { onCancel: () => process.exit(0) }
  );

  const playerCount = initialSetup.playerCount;
  const themeKey = initialSetup.theme;
  const humanPlayerIndex = initialSetup.humanJoin ? 0 : -1;
  const humanPlayerName: string | undefined = initialSetup.humanName;

  console.log('\n--- Configure AI Player Groups ---');

  // Helper function to get config for a group
  const getGroupConfig = async (
    groupName: string
  ): Promise<AgentGroupConfig> => {
    console.log(`\nConfiguring AI for ${groupName} Roles:`);
    const agentResponse = await prompts(
      {
        type: 'select',
        name: 'agentType',
        message: `Select Agent Type for ${groupName} Roles:`,
        choices: aiAgentChoices,
        initial: 0, // Default Groq
      },
      { onCancel: () => process.exit(0) }
    );

    const agentType = agentResponse.agentType as AgentChoice;
    let model: string | undefined = undefined;
    let provider: (typeof openAIProviders)[0] | undefined = undefined;

    // --- Model Selection (as before) ---
    const availableModels = agentModelChoices[agentType];
    if (agentType === 'Ollama') {
      const modelResponse = await prompts(
        {
          type: 'text',
          name: 'modelName',
          message: `Enter the Ollama model name for ${groupName}:`,
          initial: 'llama3:latest',
          validate: (value) =>
            value.trim().length > 0 ? true : 'Model name cannot be empty',
        },
        { onCancel: () => process.exit(0) }
      );
      model = modelResponse.modelName.trim();
    } else if (availableModels && availableModels.length > 0) {
      const modelResponse = await prompts(
        {
          type: 'select',
          name: 'modelValue',
          message: `Select Model for ${groupName} (${agentType}):`,
          choices: availableModels,
          initial: 0,
        },
        { onCancel: () => process.exit(0) }
      );
      model = modelResponse.modelValue;
    }

    // --- Provider Selection/Assignment ---
    // Automatically assign provider if agent type implies it
    if (agentType === 'Groq') {
      provider = openAIProviders.find((p) => p.value === 'groq');
      console.log(`-> Provider automatically set to: ${provider?.title}`);
    } else if (agentType === 'Ollama') {
      provider = openAIProviders.find((p) => p.value === 'ollama_local');
      console.log(`-> Provider automatically set to: ${provider?.title}`);
    }
    // Only prompt for provider for types like OpenAI that might use different compatible endpoints
    else if (agentType === 'OpenAI') {
      // Filter to show providers compatible with OpenAI models/API
      const relevantProviders = openAIProviders.filter(
        (p) => ['openai', 'ollama_local', 'fireworks'].includes(p.value) // Exclude Groq here
      );
      const defaultProviderIndex = relevantProviders.findIndex(
        (p) => p.value === 'openai'
      ); // Default to official OpenAI

      const providerResponse = await prompts(
        {
          type: 'select',
          name: 'providerValue',
          message: `Select API Provider/Endpoint for ${groupName} (${agentType}):`,
          choices: relevantProviders.map((p) => ({
            title: p.title,
            value: p.value,
          })),
          initial: defaultProviderIndex >= 0 ? defaultProviderIndex : 0,
        },
        { onCancel: () => process.exit(0) }
      );
      provider = openAIProviders.find(
        (p) => p.value === providerResponse.providerValue
      );
    }
    // Claude and Gemini have dedicated clients, no provider selection needed here
    // Dummy and Human don't need provider/model

    // Log the chosen config for clarity
    console.log(
      `   ${groupName} Config: Type=${agentType}, Model=${model || 'N/A'}, Provider=${provider?.title || 'N/A'}`
    );

    return { agentType, model, provider };
  };

  // Get separate configs
  const mafiaConfig = await getGroupConfig('Mafia');
  const townConfig = await getGroupConfig(
    'Town (Villager, Doctor, Seer, etc.)'
  );

  return {
    playerCount,
    themeKey,
    humanPlayerIndex,
    humanPlayerName,
    mafiaConfig,
    townConfig,
  };
}

// --- Role Assignment Function ---
function assignRoles(playerCount: number): IRole[] {
  const mafiaCount = Math.max(1, Math.floor(playerCount / 3.5)); // Example ratio
  const doctorCount = playerCount >= 5 ? 1 : 0;
  const seerCount = playerCount >= 5 ? 1 : 0;
  const villagerCount = playerCount - mafiaCount - doctorCount - seerCount;

  const rolesToAssign: IRole[] = [];

  // Add roles based on counts
  for (let i = 0; i < mafiaCount; i++) {
    rolesToAssign.push(new MafiaRole());
  }
  for (let i = 0; i < doctorCount; i++) {
    rolesToAssign.push(new DoctorRole());
  }
  for (let i = 0; i < seerCount; i++) {
    rolesToAssign.push(new SeerRole());
  }
  for (let i = 0; i < villagerCount; i++) {
    rolesToAssign.push(new VillagerRole());
  }

  return rolesToAssign;
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
    let humanPlayerName: string | undefined;
    let mafiaConfig: AgentGroupConfig;
    let townConfig: AgentGroupConfig;

    if (skipInteractive) {
      console.log(
        'Skipping interactive setup (-y flag detected). Using defaults.'
      );
      // Define default settings
      playerCount = 5;
      const themeKeys = Object.keys(getThemes());
      themeKey = themeKeys.length > 0 ? themeKeys[0] : 'western'; // Default theme or fallback
      humanPlayerIndex = -1; // No human player
      humanPlayerName = undefined;
      const defaultProvider = openAIProviders.find((p) => p.value === 'groq'); // Default to Groq
      const defaultModel =
        groqModels.length > 0 ? groqModels[0].value : undefined; // Default Groq model

      if (!defaultProvider) {
        console.warn(
          "Warning: Default provider 'groq' not found. AI might not function correctly."
        );
      }
      if (!defaultModel && defaultProvider) {
        console.warn(
          `Warning: Default model for provider '${defaultProvider.title}' not found. AI might not function correctly.`
        );
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
      humanPlayerName = setupResult.humanPlayerName;
      mafiaConfig = setupResult.mafiaConfig;
      townConfig = setupResult.townConfig;
    }

    // Check necessary API keys AFTER setup based on choices
    if (
      mafiaConfig.agentType !== 'Dummy' &&
      mafiaConfig.agentType !== 'Human'
    ) {
      if (
        !process.env[mafiaConfig.provider?.apiKeyEnvVar || ''] &&
        mafiaConfig.provider?.apiKeyEnvVar
      ) {
        console.warn(
          `\n!!! WARNING: API Key (${mafiaConfig.provider.apiKeyEnvVar}) for MAFIA provider (${mafiaConfig.provider.title}) not found. Mafia AI might fail. !!!\n`
        );
      }
    }
    if (townConfig.agentType !== 'Dummy' && townConfig.agentType !== 'Human') {
      if (
        !process.env[townConfig.provider?.apiKeyEnvVar || ''] &&
        townConfig.provider?.apiKeyEnvVar
      ) {
        console.warn(
          `\n!!! WARNING: API Key (${townConfig.provider.apiKeyEnvVar}) for TOWN provider (${townConfig.provider.title}) not found. Town AI might fail. !!!\n`
        );
      }
    }

    const selectedTheme = getThemes()[themeKey];
    if (!selectedTheme) {
      throw new Error(
        `Selected theme key "${themeKey}" is invalid or theme definition is missing.`
      );
    }

    const roles = assignRoles(playerCount);

    console.log(`\nSetting up game with ${playerCount} players...`);
    console.log(`Theme: ${selectedTheme.name} (${selectedTheme.description})`); // Log description too
    console.log(
      `Mafia AI Config: Type=${mafiaConfig.agentType}, Model=${mafiaConfig.model || 'N/A'}, Provider=${mafiaConfig.provider?.title || 'N/A'}`
    );
    console.log(
      `Town AI Config:  Type=${townConfig.agentType}, Model=${townConfig.model || 'N/A'}, Provider=${townConfig.provider?.title || 'N/A'}`
    );

    // --- Create Player Setups --- (No persona pool)
    const playerSetups = [];
    for (let i = 0; i < playerCount; i++) {
      const role = roles[i];
      // Use prompted human name or generate placeholder
      const initialPlayerName =
        i === humanPlayerIndex && humanPlayerName
          ? humanPlayerName
          : `Player ${i + 1}`;
      let agent: IAgent;
      let config: AgentGroupConfig;

      // Determine Agent Configuration based on role allegiance or human player
      if (i === humanPlayerIndex) {
        config = { agentType: 'Human' };
      } else if (role.allegiance === 'Mafia') {
        config = mafiaConfig;
      } else {
        // Town allegiance
        config = townConfig;
      }

      // Instantiate Agent based on determined config
      const agentId: PlayerId = `player-${i + 1}-${role.name.toLowerCase()}`; // Generate ID based on index/role

      if (config.agentType === 'Human') {
        agent = new HumanAgent(agentId);
      } else if (config.agentType === 'Claude') {
        agent = new ClaudeAgent(
          agentId,
          config.model || 'claude-3-haiku-20240307'
        );
      } else if (config.agentType === 'Gemini') {
        agent = new GeminiAgent(agentId, config.model || 'gemini-1.5-flash');
      } else if (['OpenAI', 'Groq', 'Ollama'].includes(config.agentType)) {
        const providerApiKey = config.provider?.apiKeyEnvVar
          ? process.env[config.provider.apiKeyEnvVar]
          : undefined;
        const apiKeyToSend =
          config.provider?.value === 'ollama_local' &&
          (!providerApiKey || providerApiKey === 'OLLAMA_API_KEY')
            ? undefined
            : providerApiKey;
        agent = new OpenAIAgent(
          agentId,
          config.model || 'gpt-4o-mini',
          config.provider?.endpoint,
          apiKeyToSend
        );
      } else {
        // Dummy or fallback
        agent = new DummyAIAgent(agentId);
      }

      // Log the created player configuration
      const agentTypeDisplay =
        config.agentType === 'Human'
          ? 'Human Player'
          : config.agentType === 'Dummy'
            ? 'Dummy AI'
            : `${config.agentType} AI (${config.model || 'default'})`;
      console.log(
        `   Player ${i + 1} (${initialPlayerName}): ${role.name} - ${agentTypeDisplay}`
      );

      // Persona generation happens during InitializationPhase
      playerSetups.push({ name: initialPlayerName, role, agent });
    }

    // --- Game Initialization ---
    console.log('\nInitializing game framework...'); // Changed log message slightly
    game = Game.createNewGame(playerSetups, themeKey, 'en');

    // Check if console rendering should be enabled (e.g., via --render flag)
    const enableConsoleRender = process.argv.includes('--render');

    // Add renderers
    if (enableConsoleRender) {
      // Cast to proper type: ConsoleRenderer's renderGameOver signature differs slightly
      // from IGameRenderer (uses string winner, VisibleGameState).
      // Acceptable for CLI-only usage.
      game.addRenderer(
        new ConsoleRenderer() as unknown as import('./interfaces/IGameRenderer').IGameRenderer
      );
    }
    // Always add MarkdownRenderer for saving results
    const markdownRenderer = new MarkdownRenderer();
    game.addRenderer(markdownRenderer);

    // Log game start (Renderer handles Game ID)
    console.log('\nStarting game...\n');

    // Run the game loop
    await game.runGameLoop();

    console.log('\nGame simulation completed.');
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('cancelled') ||
        error.message === 'User force closed the prompt')
    ) {
      console.log('\nGame setup cancelled by user.');
    } else {
      console.error(
        '\n--- An unexpected error occurred during game execution ---'
      );
      console.error(error);
      // Optionally save game state or logs even on error if `game` is initialized
      if (game) {
        console.error('Game execution failed.'); // Simplified error message
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
