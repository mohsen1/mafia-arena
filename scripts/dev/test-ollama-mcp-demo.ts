#!/usr/bin/env tsx

/**
 * MCP Demo: Testing Ollama integration with Werewolf AI
 */

import { OllamaAgent } from '../../src/lib/engine/agents/OllamaAgent';
import { Game } from '../../src/lib/engine/core/Game';
import { ConsoleRenderer } from '../../src/lib/engine/rendering/ConsoleRenderer';
import type { IAgent } from '../../src/lib/engine/interfaces/IAgent';
import { RoleName } from '../../src/lib/engine/interfaces/IRole';
import { Themes } from '../../src/lib/engine/interfaces/Theme';
import { MafiaRole } from '../../src/lib/engine/roles/MafiaRole';
import { VillagerRole } from '../../src/lib/engine/roles/VillagerRole';
import { DoctorRole } from '../../src/lib/engine/roles/DoctorRole';
import { SeerRole } from '../../src/lib/engine/roles/SeerRole';
import type { IRole } from '../../src/lib/engine/interfaces/IRole';
import chalk from 'chalk';

// Configuration
const PLAYER_COUNT = 6;
const THEME_KEY = 'UK_VILLAGE_1900S';
const OLLAMA_MODELS = {
  TOWN: 'llama3.2:latest',      // Fast model for town players
  MAFIA: 'mistral:latest',       // Different model for mafia
};

// Helper function to create role instance
function createRoleInstance(roleName: RoleName): IRole {
  switch (roleName) {
    case RoleName.Mafia:
      return new MafiaRole();
    case RoleName.Villager:
      return new VillagerRole();
    case RoleName.Doctor:
      return new DoctorRole();
    case RoleName.Seer:
      return new SeerRole();
    default:
      throw new Error(`Unknown role: ${roleName}`);
  }
}

// Check if Ollama is running
async function checkOllamaStatus(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:11434/api/tags');
    if (!response.ok) {
      return false;
    }
    const data = await response.json();
    console.log(chalk.green('✓ Ollama is running'));
    console.log(chalk.gray(`  Available models: ${data.models?.map((m: any) => m.name).join(', ')}`));
    
    // Check if required models are available
    const models = data.models?.map((m: any) => m.name) || [];
    const hasTownModel = models.some((m: string) => m.includes(OLLAMA_MODELS.TOWN.split(':')[0]));
    const hasMafiaModel = models.some((m: string) => m.includes(OLLAMA_MODELS.MAFIA.split(':')[0]));
    
    if (!hasTownModel) {
      console.log(chalk.yellow(`⚠️  Town model '${OLLAMA_MODELS.TOWN}' not found. Run: ollama pull ${OLLAMA_MODELS.TOWN}`));
      return false;
    }
    
    if (!hasMafiaModel) {
      console.log(chalk.yellow(`⚠️  Mafia model '${OLLAMA_MODELS.MAFIA}' not found. Run: ollama pull ${OLLAMA_MODELS.MAFIA}`));
      return false;
    }
    
    return true;
  } catch (error) {
    console.log(chalk.red('✗ Ollama is not running'));
    console.log(chalk.gray('  Start it with: ollama serve'));
    return false;
  }
}

async function runOllamaDemo() {
  console.log(chalk.bold.blue('\n🎮 Werewolf AI - Ollama MCP Demo\n'));
  console.log(chalk.cyan('Configuration:'));
  console.log(`  📍 Theme: ${Themes[THEME_KEY].name}`);
  console.log(`  👥 Players: ${PLAYER_COUNT}`);
  console.log(`  🤖 Town Model: ${chalk.green(OLLAMA_MODELS.TOWN)}`);
  console.log(`  🤖 Mafia Model: ${chalk.red(OLLAMA_MODELS.MAFIA)}`);
  console.log('');

  // Check Ollama status
  const ollamaReady = await checkOllamaStatus();
  if (!ollamaReady) {
    console.log(chalk.red('❌ Ollama is not ready. Please ensure Ollama is running and required models are installed.'));
    process.exit(1);
  }

  console.log('\n' + chalk.bold('Setting up game with different Ollama models...'));
  
  // Create roles
  const roles = [
    createRoleInstance(RoleName.Mafia),
    createRoleInstance(RoleName.Mafia),
    createRoleInstance(RoleName.Doctor),
    createRoleInstance(RoleName.Seer),
    createRoleInstance(RoleName.Villager),
    createRoleInstance(RoleName.Villager),
  ];

  // Create agents with different models
  const agents: IAgent[] = [];
  
  // Mafia agents use one model
  console.log(chalk.red('\n🔴 Creating Mafia agents with ' + OLLAMA_MODELS.MAFIA + '...'));
  for (let i = 0; i < 2; i++) {
    const agent = new OllamaAgent(`mafia${i + 1}`, OLLAMA_MODELS.MAFIA);
    agents.push(agent);
    console.log(chalk.gray(`  ✓ Created Mafia agent ${i + 1}`));
  }
  
  // Town agents use another model
  console.log(chalk.green('\n🟢 Creating Town agents with ' + OLLAMA_MODELS.TOWN + '...'));
  for (let i = 0; i < 4; i++) {
    const agent = new OllamaAgent(`town${i + 1}`, OLLAMA_MODELS.TOWN);
    agents.push(agent);
    console.log(chalk.gray(`  ✓ Created Town agent ${i + 1}`));
  }

  // Generate personas
  console.log('\n' + chalk.bold('Generating unique personas for each player...'));
  const existingNames: string[] = [];
  
  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const role = roles[i];
    
    try {
      console.log(chalk.gray(`  Generating persona for ${role.name} player...`));
      if (agent.generatePersona) {
        await agent.generatePersona(Themes[THEME_KEY].description, 'en', existingNames);
      }
      
      if (agent.persona?.name) {
        existingNames.push(agent.persona.name);
        console.log(chalk.green(`  ✓ ${agent.persona.name} (${role.name})`));
        console.log(chalk.gray(`    ${agent.persona.backstory?.split('.')[0]}.`));
      }
    } catch (error) {
      console.warn(chalk.yellow(`  ⚠️  Failed to generate persona: ${error}`));
    }
  }

  // Create game
  console.log('\n' + chalk.bold('Starting Werewolf game...'));
  const game = Game.createNewGame(
    agents.map((agent, index) => ({
      name: agent.persona?.name || `Player ${index + 1}`,
      agent: agent,
      role: roles[index],
      imageUrl: null,
    })),
    THEME_KEY,
    'en'
  );

  // Add console renderer
  const renderer = new ConsoleRenderer();
  game.addRenderer(renderer);

  console.log(chalk.green('\n✅ Game created successfully!'));
  console.log(chalk.cyan('\nRunning game simulation...'));
  console.log(chalk.gray('This demonstrates how different Ollama models can be used for different roles.\n'));

  // Run a few rounds
  let rounds = 0;
  const maxRounds = 5;
  
  while (game.getCurrentPhaseType() !== 'GameOver' && rounds < maxRounds) {
    try {
      await game.runGameLoop();
      rounds++;
      
      // Add a small delay between rounds for readability
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(chalk.red('Error during game loop:'), error);
      break;
    }
  }

  if (game.getCurrentPhaseType() === 'GameOver') {
    console.log(chalk.bold.green('\n🎉 Game Over!'));
    const winner = game.checkWinCondition();
    if (winner) {
      console.log(chalk.yellow(`Winner: ${winner === 'Town' ? '🏘️ Town' : '🔫 Mafia'}`));
    }
  } else {
    console.log(chalk.blue(`\n📊 Demo completed after ${rounds} rounds.`));
  }

  console.log(chalk.cyan('\n💡 Key Takeaways:'));
  console.log(chalk.gray('  • Different Ollama models can be used for different roles'));
  console.log(chalk.gray('  • Mafia players used: ' + OLLAMA_MODELS.MAFIA));
  console.log(chalk.gray('  • Town players used: ' + OLLAMA_MODELS.TOWN));
  console.log(chalk.gray('  • Each model can have different personalities and play styles'));
  console.log(chalk.gray('  • This allows for more diverse and interesting gameplay\n'));
}

// Run the demo
runOllamaDemo().catch(error => {
  console.error(chalk.red('❌ Fatal error:'), error);
  process.exit(1);
}); 