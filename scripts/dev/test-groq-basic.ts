#!/usr/bin/env tsx

/**
 * Basic Groq Integration Test
 * Tests a simple game with all Groq AI players
 */

import * as dotenv from 'dotenv';
import chalk from 'chalk';
import { Game } from '@/lib/engine/core/Game';
import { OpenAIAgent } from '@/lib/engine/agents/OpenAIAgent';
import { DummyAIAgent } from '@/lib/engine/agents/DummyAIAgent';
import { MafiaRole } from '@/lib/engine/roles/MafiaRole';
import { VillagerRole } from '@/lib/engine/roles/VillagerRole';
import { DoctorRole } from '@/lib/engine/roles/DoctorRole';
import { SeerRole } from '@/lib/engine/roles/SeerRole';
import type { IRole } from '@/lib/engine/interfaces/IRole';
import { RoleName } from '@/lib/engine/interfaces/IRole';
import { getThemes } from '@/lib/utils/themeLoader';
import { ConsoleRenderer } from '@/lib/engine/rendering/ConsoleRenderer';
import type { IAgent } from '@/lib/engine/interfaces/IAgent';

// Load environment variables
dotenv.config();

// Configuration
const PLAYER_COUNT = 5;
const THEME_KEY = 'UK_VILLAGE_1900S';
const MODEL = 'llama-3.1-8b-instant'; // Fast Groq model
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1';

console.log(chalk.bold('\n🎮 Groq Basic Game Test\n'));

// Check for API key
const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) {
  console.log(chalk.red('❌ GROQ_API_KEY environment variable not found!'));
  console.log(chalk.yellow('Please set GROQ_API_KEY before running this test.'));
  process.exit(1);
}

console.log(chalk.green('✓ GROQ_API_KEY found'));
console.log(chalk.cyan(`  Model: ${MODEL}`));
console.log(chalk.cyan(`  Players: ${PLAYER_COUNT}`));
console.log(chalk.cyan(`  Theme: ${THEME_KEY}\n`));

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

async function runGroqGame() {
  try {
    // Create roles for the game
    const roles: IRole[] = [];
    
    // 1 Mafia, 1 Doctor, 1 Seer, 2 Villagers for a 5-player game
    roles.push(createRoleInstance(RoleName.Mafia));
    roles.push(createRoleInstance(RoleName.Doctor));
    roles.push(createRoleInstance(RoleName.Seer));
    roles.push(createRoleInstance(RoleName.Villager));
    roles.push(createRoleInstance(RoleName.Villager));
    
    // Create Groq agents
    console.log(chalk.bold('Creating Groq AI agents...'));
    const agents: IAgent[] = [];
    
    for (let i = 0; i < PLAYER_COUNT; i++) {
      const agentId = `groq_player_${i + 1}`;
      
      // Create Groq agent using OpenAIAgent with Groq endpoint
      const agent = new OpenAIAgent(
        agentId,
        MODEL,
        GROQ_ENDPOINT,
        apiKey
      );
      
      agents.push(agent);
      console.log(chalk.gray(`  Created agent: ${agentId}`));
    }
    
    // Generate personas
    console.log(chalk.bold('\nGenerating character personas...'));
    const theme = getThemes()[THEME_KEY];
    const existingNames: string[] = [];
    
    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i];
      try {
        console.log(chalk.gray(`  Generating persona for player ${i + 1}...`));
        if (agent.generatePersona) {
          await agent.generatePersona(theme.description, 'en', existingNames);
        }
        if (agent.persona?.name) {
          existingNames.push(agent.persona.name);
          console.log(chalk.green(`    ✓ ${agent.persona.name} - ${roles[i].name}`));
        }
      } catch (error) {
        console.warn(chalk.yellow(`    ⚠ Failed to generate persona: ${error}`));
        // Use dummy agent as fallback
        agents[i] = new DummyAIAgent(`dummy_player_${i + 1}`);
      }
    }
    
    // Create game
    console.log(chalk.bold('\n🎯 Starting Groq-powered Werewolf game...\n'));
    
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
    
    // Run game with performance tracking
    console.log(chalk.bold('Game Progress:\n'));
    
    let rounds = 0;
    const maxRounds = 20; // Safety limit
    const startTime = Date.now();
    let phaseTimings: { phase: string; duration: number }[] = [];
    let lastPhaseStart = Date.now();
    
    while (game.getCurrentPhaseType() !== 'GameOver' && rounds < maxRounds) {
      const currentPhase = game.getCurrentPhaseType();
      
      try {
        await game.runGameLoop();
        
        // Track phase timing
        const phaseDuration = Date.now() - lastPhaseStart;
        phaseTimings.push({ phase: currentPhase, duration: phaseDuration });
        lastPhaseStart = Date.now();
        
        rounds++;
      } catch (error) {
        console.error(chalk.red(`\n❌ Error during ${currentPhase} phase:`), error);
        break;
      }
    }
    
    const totalDuration = Date.now() - startTime;
    
    // Game summary
    console.log(chalk.bold('\n📊 Game Summary:'));
    console.log(`  Total rounds: ${rounds}`);
    console.log(`  Total duration: ${(totalDuration / 1000).toFixed(1)}s`);
    console.log(`  Average round time: ${(totalDuration / rounds / 1000).toFixed(1)}s`);
    
    // Phase timing analysis
    console.log(chalk.bold('\n⏱️  Phase Timings:'));
    const phaseStats = phaseTimings.reduce((acc, { phase, duration }) => {
      if (!acc[phase]) {
        acc[phase] = { count: 0, totalTime: 0 };
      }
      acc[phase].count++;
      acc[phase].totalTime += duration;
      return acc;
    }, {} as Record<string, { count: number; totalTime: number }>);
    
    Object.entries(phaseStats).forEach(([phase, stats]) => {
      const avgTime = stats.totalTime / stats.count / 1000;
      console.log(`  ${phase}: ${avgTime.toFixed(1)}s avg (${stats.count} times)`);
    });
    
    // Final game state
    const finalState = game.getCurrentSerializableState();
    const winner = finalState.winCondition?.outcome;
    
    console.log(chalk.bold('\n🏆 Game Result:'));
    if (winner) {
      console.log(chalk.green(`  Winner: ${winner} team!`));
    } else {
      console.log(chalk.yellow('  Game ended without a clear winner'));
    }
    
    // Player outcomes
    console.log(chalk.bold('\n👥 Final Player States:'));
    Object.values(finalState.players).forEach(player => {
      const status = player.status === 'Alive' ? chalk.green('Alive') : chalk.red('Dead');
      const role = player.roleName || 'Unknown';
      console.log(`  ${player.name} (${role}): ${status}`);
    });
    
    console.log(chalk.green('\n✅ Groq game test completed successfully!'));
    
  } catch (error) {
    console.error(chalk.red('\n❌ Fatal error:'), error);
    process.exit(1);
  }
}

// Run the test
console.log(chalk.yellow('Starting Groq game test...\n'));

runGroqGame().catch(error => {
  console.error(chalk.red('Unexpected error:'), error);
  process.exit(1);
}); 