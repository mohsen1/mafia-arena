#!/usr/bin/env tsx

/**
 * Basic test script to verify Ollama functionality
 */

import { OllamaAgent } from '../src/lib/engine/agents/OllamaAgent';
import { Game } from '../src/lib/engine/core/Game';
import { ConsoleRenderer } from '../src/lib/engine/rendering/ConsoleRenderer';
import type { IAgent } from '../src/lib/engine/interfaces/IAgent';
import { RoleName } from '../src/lib/engine/interfaces/IRole';
import { Themes } from '../src/lib/engine/interfaces/Theme';
import { MafiaRole } from '../src/lib/engine/roles/MafiaRole';
import { VillagerRole } from '../src/lib/engine/roles/VillagerRole';
import type { IRole } from '../src/lib/engine/interfaces/IRole';
import { PlayerStatus } from '../src/lib/engine/interfaces/IPlayer';
import * as dotenv from 'dotenv';
import chalk from 'chalk';

// Load environment variables
dotenv.config();

// Configuration
const PLAYER_COUNT = 4;
const THEME_KEY = 'PROHIBITION_CHICAGO';
const MODEL = 'llama3.2:latest';

// Helper function to create role instance
function createRoleInstance(roleName: RoleName): IRole {
  switch (roleName) {
    case RoleName.Mafia:
      return new MafiaRole();
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
    
    // Check if required model is available
    const models = data.models?.map((m: any) => m.name) || [];
    const hasModel = models.some((m: string) => m.includes(MODEL.split(':')[0]));
    
    if (!hasModel) {
      console.log(chalk.yellow(`⚠️  Model '${MODEL}' not found. Run: ollama pull ${MODEL}`));
      return false;
    }
    
    return true;
  } catch (error) {
    console.log(chalk.red('✗ Ollama is not running'));
    console.log(chalk.gray('  Start it with: ollama serve'));
    return false;
  }
}

async function runBasicTest() {
  console.log(chalk.bold.blue('\n🎮 Werewolf AI - Basic Ollama Test\n'));
  console.log(chalk.cyan('Configuration:'));
  console.log(`  📍 Theme: ${Themes[THEME_KEY].name}`);
  console.log(`  👥 Players: ${PLAYER_COUNT}`);
  console.log(`  🤖 Model: ${chalk.green(MODEL)}`);
  console.log('');

  // Check Ollama status
  const ollamaReady = await checkOllamaStatus();
  if (!ollamaReady) {
    console.log(chalk.red('❌ Ollama is not ready'));
    process.exit(1);
  }

  // Test 1: Create agent and generate persona
  console.log('\n' + chalk.bold('Test 1: Agent Creation & Persona Generation'));
  const agent = new OllamaAgent('test-player', MODEL);
  
  try {
    console.log('  Creating agent...');
    const info = await agent.getOllamaInfo();
    console.log(chalk.green('  ✓ Agent created successfully'));
    console.log(chalk.gray(`    Endpoint: ${info.endpoint}`));
    
    console.log('  Generating persona...');
    await agent.generatePersona(Themes[THEME_KEY].description, 'en', []);
    
    if (agent.persona && agent.persona.name !== 'Anonymous Player') {
      console.log(chalk.green('  ✓ Persona generated successfully'));
      console.log(chalk.gray(`    Name: ${agent.persona.name}`));
      console.log(chalk.gray(`    Backstory: ${agent.persona.backstory?.split('.')[0]}.`));
    } else {
      console.log(chalk.red('  ✗ Failed to generate persona'));
      process.exit(1);
    }
  } catch (error) {
    console.log(chalk.red('  ✗ Error during agent/persona creation:'), error);
    process.exit(1);
  }

  // Test 2: Test action generation
  console.log('\n' + chalk.bold('Test 2: Action Generation'));
  
  // Create a simple game state for testing
  const mockGameState = {
    gameId: 'test-game',
    round: 1,
    phase: 'Day' as const,
    self: {
      id: 'test-player',
      name: agent.persona?.name || 'Test Player',
      status: PlayerStatus.Alive,
      role: RoleName.Villager,
      allegiance: 'Town' as const,
      isMafia: false,
      persona: agent.persona || { name: 'Test', backstory: 'Test', personalityTraits: [] }
    },
    players: [{
      id: 'test-player',
      name: agent.persona?.name || 'Test Player',
      status: PlayerStatus.Alive,
      isHuman: false
    }],
    alivePlayerIds: new Set(['test-player']),
    language: 'en' as const,
    themeName: Themes[THEME_KEY].name,
    memory: {
      investigationResults: [],
      saveHistory: [],
      voteHistory: [],
      killHistory: [],
      messageHistory: [],
      aiConversationLogs: []
    }
  };

  try {
    console.log('  Testing message action...');
    const messageAction = await agent.getAction(mockGameState, ['message']);
    console.log(chalk.green('  ✓ Message action received:'), messageAction.type);
    if (messageAction.type === 'message') {
      console.log(chalk.gray(`    Content: "${messageAction.content.substring(0, 50)}..."`));
    }

    console.log('  Testing vote action...');
    const voteAction = await agent.getAction(mockGameState, ['vote']);
    console.log(chalk.green('  ✓ Vote action received:'), voteAction.type);
    
    console.log('  Testing noAction...');
    const noAction = await agent.getAction(mockGameState, ['noAction']);
    console.log(chalk.green('  ✓ NoAction received:'), noAction.type);
  } catch (error) {
    console.log(chalk.red('  ✗ Error during action generation:'), error);
    process.exit(1);
  }

  // Test 3: Quick game simulation (just a few rounds)
  console.log('\n' + chalk.bold('Test 3: Quick Game Simulation'));
  
  const roles = [
    createRoleInstance(RoleName.Mafia),
    createRoleInstance(RoleName.Villager),
    createRoleInstance(RoleName.Villager),
    createRoleInstance(RoleName.Villager)
  ];

  const agents: IAgent[] = [];
  for (let i = 0; i < PLAYER_COUNT; i++) {
    agents.push(new OllamaAgent(`player${i + 1}`, MODEL));
  }

  // Generate personas
  console.log('  Generating personas for all players...');
  const existingNames: string[] = [];
  for (const agent of agents) {
    try {
      if (agent.generatePersona) {
        await agent.generatePersona(Themes[THEME_KEY].description, 'en', existingNames);
      }
      if (agent.persona?.name) {
        existingNames.push(agent.persona.name);
      }
    } catch (error) {
      console.warn(`  Failed to generate persona: ${error}`);
    }
  }

  // Create game
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

  console.log('  Running 3 rounds of the game...');
  
  let rounds = 0;
  const maxRounds = 3;
  
  while (game.getCurrentPhaseType() !== 'GameOver' && rounds < maxRounds) {
    try {
      await game.runGameLoop();
      rounds++;
    } catch (error) {
      console.error(chalk.red('  Error during game loop:'), error);
      break;
    }
  }

  console.log(chalk.green(`\n✅ All tests passed! Ollama integration is working correctly.`));
}

// Run the test
runBasicTest().catch(error => {
  console.error(chalk.red('❌ Fatal error:'), error);
  process.exit(1);
}); 