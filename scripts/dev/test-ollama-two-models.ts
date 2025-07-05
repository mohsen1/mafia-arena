#!/usr/bin/env tsx

/**
 * Test script to run a game with two different Ollama models
 * This demonstrates using different AI models for different teams
 */

import { OllamaAgent } from '../src/lib/engine/agents/OllamaAgent';
import { Game } from '../src/lib/engine/core/Game';
import { ConsoleRenderer } from '../src/lib/engine/rendering/ConsoleRenderer';
import type { IAgent } from '../src/lib/engine/interfaces/IAgent';
import { RoleName } from '../src/lib/engine/interfaces/IRole';
import { Themes } from '../src/lib/engine/interfaces/Theme';
import { MafiaRole } from '../src/lib/engine/roles/MafiaRole';
import { DoctorRole } from '../src/lib/engine/roles/DoctorRole';
import { SeerRole } from '../src/lib/engine/roles/SeerRole';
import { VillagerRole } from '../src/lib/engine/roles/VillagerRole';
import type { IRole } from '../src/lib/engine/interfaces/IRole';
import * as dotenv from 'dotenv';
import chalk from 'chalk';
import ora from 'ora';

// Load environment variables
dotenv.config();

// Configuration
const PLAYER_COUNT = 6;
const THEME_KEY = 'PROHIBITION_CHICAGO';
const TOWN_MODEL = 'llama3.2'; // Model for Town players
const MAFIA_MODEL = 'mistral'; // Model for Mafia players

// Helper function to create role instance
function createRoleInstance(roleName: RoleName): IRole {
  switch (roleName) {
    case RoleName.Mafia:
      return new MafiaRole();
    case RoleName.Doctor:
      return new DoctorRole();
    case RoleName.Seer:
      return new SeerRole();
    case RoleName.Villager:
      return new VillagerRole();
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
    const hasTownModel = models.some((m: string) => m.includes(TOWN_MODEL));
    const hasMafiaModel = models.some((m: string) => m.includes(MAFIA_MODEL));
    
    if (!hasTownModel) {
      console.log(chalk.yellow(`⚠️  Town model '${TOWN_MODEL}' not found. Run: ollama pull ${TOWN_MODEL}`));
      return false;
    }
    if (!hasMafiaModel) {
      console.log(chalk.yellow(`⚠️  Mafia model '${MAFIA_MODEL}' not found. Run: ollama pull ${MAFIA_MODEL}`));
      return false;
    }
    
    return true;
  } catch (error) {
    console.log(chalk.red('✗ Ollama is not running'));
    console.log(chalk.gray('  Start it with: ollama serve'));
    return false;
  }
}

async function runGame() {
  console.log(chalk.bold.blue('\n🎮 Werewolf AI - Two Ollama Models Test\n'));
  console.log(chalk.cyan('Configuration:'));
  console.log(`  📍 Theme: ${Themes[THEME_KEY].name}`);
  console.log(`  👥 Players: ${PLAYER_COUNT}`);
  console.log(`  🤖 Town Model: ${chalk.green(TOWN_MODEL)}`);
  console.log(`  🔪 Mafia Model: ${chalk.red(MAFIA_MODEL)}`);
  console.log('');

  // Check Ollama status
  const spinner = ora('Checking Ollama status...').start();
  const ollamaReady = await checkOllamaStatus();
  if (!ollamaReady) {
    spinner.fail('Ollama is not ready');
    process.exit(1);
  }
  spinner.succeed('Ollama is ready');

  // Assign roles
  const roleNames: RoleName[] = [];
  
  // For 6 players: 2 Mafia, 1 Doctor, 1 Seer, 2 Villagers
  if (PLAYER_COUNT === 6) {
    roleNames.push(RoleName.Mafia, RoleName.Mafia);
    roleNames.push(RoleName.Doctor);
    roleNames.push(RoleName.Seer);
    roleNames.push(RoleName.Villager, RoleName.Villager);
  } else {
    // Default distribution
    const mafiaCount = Math.floor(PLAYER_COUNT / 3);
    const hasDoctor = PLAYER_COUNT >= 5;
    const hasSeer = PLAYER_COUNT >= 4;
    
    // Add Mafia
    for (let i = 0; i < mafiaCount; i++) {
      roleNames.push(RoleName.Mafia);
    }
    
    // Add special roles
    if (hasDoctor) roleNames.push(RoleName.Doctor);
    if (hasSeer) roleNames.push(RoleName.Seer);
    
    // Fill rest with Villagers
    while (roleNames.length < PLAYER_COUNT) {
      roleNames.push(RoleName.Villager);
    }
  }

  // Shuffle roles
  for (let i = roleNames.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roleNames[i], roleNames[j]] = [roleNames[j], roleNames[i]];
  }

  // Create role instances
  const roles = roleNames.map(createRoleInstance);

  // Create agents with appropriate models
  console.log('\n🎭 Creating AI agents...');
  const agents: IAgent[] = [];
  for (let i = 0; i < PLAYER_COUNT; i++) {
    const isMafia = roles[i].name === RoleName.Mafia;
    const model = isMafia ? MAFIA_MODEL : TOWN_MODEL;
    const agent = new OllamaAgent(`player${i + 1}`, model);
    agents.push(agent);
    
    const roleColor = isMafia ? chalk.red : chalk.green;
    console.log(`  Player ${i + 1}: ${roleColor(roles[i].name)} using ${chalk.cyan(model)}`);
  }

  // Generate personas for all agents
  console.log('\n🎭 Generating personas...');
  const existingNames: string[] = [];
  const personaSpinner = ora('Generating character personas...').start();
  
  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const role = roles[i];
    try {
      personaSpinner.text = `Generating persona ${i + 1}/${agents.length}...`;
      
      if (agent.generatePersona) {
        await agent.generatePersona(Themes[THEME_KEY].description, 'en', existingNames);
        if (agent.persona?.name) {
          existingNames.push(agent.persona.name);
        }
      }
    } catch (error) {
      personaSpinner.warn(`Failed to generate persona for ${agent.id}: ${error}`);
    }
  }
  
  personaSpinner.succeed('Personas generated');

  // Display character assignments
  console.log('\n📋 Character Assignments:');
  agents.forEach((agent, index) => {
    const role = roles[index];
    const isMafia = role.name === RoleName.Mafia;
    const roleColor = isMafia ? chalk.red : chalk.green;
    const modelColor = chalk.cyan;
    
    console.log(
      `  ${chalk.bold(agent.persona?.name || agent.id)}: ${roleColor(role.name)} ` +
      `[${modelColor(isMafia ? MAFIA_MODEL : TOWN_MODEL)}]`
    );
    
    if (agent.persona?.backstory) {
      console.log(chalk.gray(`    ${agent.persona.backstory.split('.')[0]}.`));
    }
  });

  // Create game using the static factory method
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

  console.log('\n🚀 Starting game...\n');
  console.log(chalk.gray('='.repeat(80)));
  console.log('');

  // Run game loop
  const gameSpinner = ora('Running game...').start();
  gameSpinner.stop(); // Stop spinner to allow console output
  
  let maxRounds = 20; // Safety limit
  while (game.getCurrentPhaseType() !== 'GameOver' && maxRounds > 0) {
    try {
      await game.runGameLoop();
      maxRounds--;
    } catch (error) {
      console.error(chalk.red('❌ Error during game loop:'), error);
      break;
    }
  }

  if (maxRounds === 0) {
    console.log(chalk.yellow('\n⚠️  Game reached maximum rounds limit'));
  }

  // Game over - show results
  console.log('\n' + chalk.gray('='.repeat(80)));
  console.log(chalk.bold.green('🏁 GAME OVER!\n'));
  
  const gameState = game.getCurrentSerializableState();
  const winCondition = gameState.winCondition?.outcome;
  
  if (winCondition === 'Mafia') {
    console.log(chalk.bold.red('🔪 The Mafia wins!'));
  } else {
    console.log(chalk.bold.green('👥 The Town wins!'));
  }

  console.log('\n📊 Final Status:');
  const players = game.getPublicPlayerArray();
  players.forEach(player => {
    const playerData = gameState.players[player.id];
    const statusEmoji = player.status === 'Alive' ? '✅' : '💀';
    const roleEmoji = playerData.roleName === RoleName.Mafia ? '🔪' : 
                      playerData.roleName === RoleName.Doctor ? '🏥' :
                      playerData.roleName === RoleName.Seer ? '🔮' : '👤';
    
    // Find which model was used
    const agent = agents.find(a => a.id === player.id);
    const modelUsed = playerData.roleName === RoleName.Mafia ? MAFIA_MODEL : TOWN_MODEL;
    
    console.log(
      `  ${statusEmoji} ${player.name} (${roleEmoji} ${playerData.roleName}) ` +
      `[${chalk.cyan(modelUsed)}]`
    );
  });

  // Show model performance
  console.log('\n📈 Model Performance:');
  const mafiaPlayers = Object.values(gameState.players).filter(p => p.roleName === RoleName.Mafia);
  const townPlayers = Object.values(gameState.players).filter(p => p.roleName !== RoleName.Mafia);
  
  const aliveMafia = mafiaPlayers.filter(p => gameState.livingPlayerIds.includes(p.id)).length;
  const aliveTown = townPlayers.filter(p => gameState.livingPlayerIds.includes(p.id)).length;
  
  console.log(`  ${chalk.red(MAFIA_MODEL)} (Mafia): ${aliveMafia}/${mafiaPlayers.length} survived`);
  console.log(`  ${chalk.green(TOWN_MODEL)} (Town): ${aliveTown}/${townPlayers.length} survived`);
}

// Run the game
runGame().catch(error => {
  console.error(chalk.red('❌ Fatal error:'), error);
  process.exit(1);
}); 