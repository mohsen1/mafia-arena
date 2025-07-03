#!/usr/bin/env tsx
/**
 * Test script for Ollama integration with Werewolf AI
 * This script creates and runs a simple game using Ollama models
 */

import { Game } from '../src/lib/engine/core/Game';
import { createAgentInstance } from '../src/lib/agentFactory';
import { ConsoleRenderer } from '../src/lib/engine/rendering/ConsoleRenderer';
import type { AgentConfig } from '../src/lib/interfaces/persistence.types';
import type { CustomProviderConfig } from '../src/lib/utils/providerUtils';
import chalk from 'chalk';
import ora from 'ora';

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

async function runOllamaGame() {
  console.log(chalk.bold.blue('\n🐺 Werewolf AI - Ollama Test Game\n'));

  // Check Ollama status
  const isRunning = await checkOllamaStatus();
  if (!isRunning) {
    process.exit(1);
  }

  // Game configuration
  const playerCount = 5;
  const theme = 'Classic Village';
  const language = 'en';
  const modelName = process.env.OLLAMA_MODEL || 'llama3.2';
  
  console.log(chalk.cyan('\nGame Configuration:'));
  console.log(`  Players: ${playerCount}`);
  console.log(`  Theme: ${theme}`);
  console.log(`  Model: ${modelName}`);
  console.log(`  Language: ${language}\n`);

  // Create agents
  const spinner = ora('Creating AI agents...').start();
  const agents = [];
  
  const customConfig: CustomProviderConfig = {
    ollamaEndpoint: 'http://localhost:11434/v1',
  };

  try {
    for (let i = 0; i < playerCount; i++) {
      const agentConfig: AgentConfig = {
        agentType: 'Ollama',
        modelName: modelName,
        providerValue: 'ollama_local',
      };
      
      const agent = await createAgentInstance(
        agentConfig,
        `player-${i}`,
        undefined,
        customConfig
      );
      
      agents.push(agent);
    }
    
    spinner.succeed('AI agents created');
  } catch (error) {
    spinner.fail('Failed to create agents');
    console.error(chalk.red(error));
    process.exit(1);
  }

  // Create game
  const game = new Game(
    agents.map((agent, index) => ({
      id: `player-${index}`,
      name: `Player ${index + 1}`,
      agent,
    })),
    new ConsoleRenderer(),
    {
      enableSpeech: false,
      language,
      theme,
    }
  );

  console.log(chalk.green('\n🎮 Starting game...\n'));

  // Run the game
  try {
    await game.start();
    
    // Run a few rounds
    let round = 0;
    const maxRounds = 10;
    
    while (!game.isGameOver() && round < maxRounds) {
      console.log(chalk.bold.yellow(`\n📍 Round ${round + 1}\n`));
      
      // Process the current phase
      await game.processPhase();
      
      // Check if we should advance to next phase
      if (game.shouldAdvancePhase()) {
        await game.advancePhase();
      }
      
      round++;
      
      // Add a small delay between rounds for readability
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    if (game.isGameOver()) {
      console.log(chalk.bold.green('\n🏁 Game Over!\n'));
      const winner = game.getWinner();
      console.log(chalk.cyan(`Winner: ${winner === 'Town' ? '👥 Town' : '🐺 Mafia'}`));
    } else {
      console.log(chalk.yellow('\n⏱️ Maximum rounds reached\n'));
    }
    
    // Display final statistics
    console.log(chalk.bold('\n📊 Game Statistics:\n'));
    const players = game.getPlayers();
    players.forEach(player => {
      const status = player.status === 'alive' ? '✅' : '💀';
      const role = player.role || 'Unknown';
      console.log(`${status} ${player.name} - ${role}`);
    });
    
  } catch (error) {
    console.error(chalk.red('\n❌ Game error:'), error);
    process.exit(1);
  }
}

// Run the test
runOllamaGame().catch(console.error); 