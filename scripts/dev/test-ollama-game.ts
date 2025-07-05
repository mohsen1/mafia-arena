#!/usr/bin/env tsx
/**
 * Test script for Ollama integration with Werewolf AI
 * This script creates and runs a simple game using Ollama models
 */

import { OllamaAgent } from '../../src/lib/engine/agents/OllamaAgent';
import { Game } from '../../src/lib/engine/core/Game';
import { ConsoleRenderer } from '../../src/lib/engine/rendering/ConsoleRenderer';
import type { IAgent } from '../../src/lib/engine/interfaces/IAgent';
import { RoleName } from '../../src/lib/engine/interfaces/IRole';
import { Themes } from '../../src/lib/engine/interfaces/Theme';
import { MafiaRole } from '../../src/lib/engine/roles/MafiaRole';
import { DoctorRole } from '../../src/lib/engine/roles/DoctorRole';
import { SeerRole } from '../../src/lib/engine/roles/SeerRole';
import { VillagerRole } from '../../src/lib/engine/roles/VillagerRole';
import type { IRole } from '../../src/lib/engine/interfaces/IRole';
import * as dotenv from 'dotenv';
import chalk from 'chalk';
import ora from 'ora';

// Load environment variables
dotenv.config();

// Configuration
const PLAYER_COUNT = 6;
const THEME_KEY = 'WILD_WEST_FRONTIER';
const MODEL = 'llama3.2'; // or any other Ollama model

// Check if Ollama is running
async function checkOllamaStatus(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:11434/api/tags');
    if (!response.ok) {
      return false;
    }
    const data = await response.json();
    console.log(chalk.green('✅ Ollama is running'));
    console.log(chalk.cyan(`Available models: ${data.models?.map((m: any) => m.name).join(', ') || 'none'}`));
    return true;
  } catch (error) {
    console.error(chalk.red('❌ Ollama is not running'));
    console.log(chalk.yellow('Please start Ollama with: ollama serve'));
    return false;
  }
}

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

async function runGame() {
  console.log('🎮 Starting Werewolf AI Game with Ollama Agents');
  console.log(`📍 Theme: ${Themes[THEME_KEY].name}`);
  console.log(`🤖 Model: ${MODEL}`);
  console.log(`👥 Players: ${PLAYER_COUNT}`);
  console.log('');

  // Check Ollama status
  const isRunning = await checkOllamaStatus();
  if (!isRunning) {
    process.exit(1);
  }

  // Create agents
  const agents: IAgent[] = [];
  for (let i = 0; i < PLAYER_COUNT; i++) {
    const agent = new OllamaAgent(`player${i + 1}`, MODEL);
    agents.push(agent);
  }

  // Generate personas for all agents
  console.log('🎭 Generating personas...');
  const existingNames: string[] = [];
  for (const agent of agents) {
    try {
      if (agent.generatePersona) {
        await agent.generatePersona(Themes[THEME_KEY].description, 'en', existingNames);
        if (agent.persona?.name) {
          existingNames.push(agent.persona.name);
          console.log(`  ✓ ${agent.persona.name}`);
        }
      } else {
        console.log(`  ⚠️  Agent ${agent.id} does not support persona generation`);
      }
    } catch (error) {
      console.log(`  ⚠️  Failed to generate persona for ${agent.id}:`, error);
    }
  }
  console.log('');

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

  console.log('🎲 Roles assigned:');
  agents.forEach((agent, index) => {
    console.log(`  ${agent.persona?.name || agent.id}: ${roles[index].name}`);
  });
  console.log('');

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

  console.log('🚀 Starting game...\n');
  console.log('='.repeat(80));
  console.log('');

  // Run game loop
  let maxRounds = 20; // Safety limit
  while (game.getCurrentPhaseType() !== 'GameOver' && maxRounds > 0) {
    try {
      await game.runGameLoop();
      maxRounds--;
    } catch (error) {
      console.error('❌ Error during game loop:', error);
      break;
    }
  }

  if (maxRounds === 0) {
    console.log('\n⚠️  Game reached maximum rounds limit');
  }

  // Game over - show results
  console.log('\n' + '='.repeat(80));
  console.log('🏁 GAME OVER!\n');
  
  const gameState = game.getCurrentSerializableState();
  const winCondition = gameState.winCondition?.outcome;
  console.log(`🏆 Winners: ${winCondition === 'Mafia' ? '🔪 Mafia' : '👥 Town'}\n`);

  console.log('Final Status:');
  const players = game.getPublicPlayerArray();
  players.forEach(player => {
    const playerData = gameState.players[player.id];
    const statusEmoji = player.status === 'Alive' ? '✅' : '💀';
    const roleEmoji = playerData.roleName === RoleName.Mafia ? '🔪' : 
                      playerData.roleName === RoleName.Doctor ? '🏥' :
                      playerData.roleName === RoleName.Seer ? '🔮' : '👤';
    console.log(`  ${statusEmoji} ${player.name} (${roleEmoji} ${playerData.roleName})`);
  });
}

// Run the game
runGame().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
}); 