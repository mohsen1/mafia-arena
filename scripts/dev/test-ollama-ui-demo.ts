#!/usr/bin/env tsx

/**
 * Simple Ollama UI Demo - Shows how Ollama works in the Werewolf AI UI
 */

import chalk from 'chalk';
import { OllamaAgent } from '../../src/lib/engine/agents/OllamaAgent';

// Configuration
const OLLAMA_MODELS = [
  'llama3.2:latest',
  'mistral:latest',
  'llama3.3:latest',
  'phi4:latest'
];

// Check Ollama status
async function checkOllamaModels() {
  console.log(chalk.bold.blue('\n🎮 Werewolf AI - Ollama UI Configuration Demo\n'));
  
  try {
    const response = await fetch('http://localhost:11434/api/tags');
    if (!response.ok) {
      console.log(chalk.red('❌ Ollama is not running!'));
      console.log(chalk.gray('   Start it with: ollama serve'));
      return false;
    }
    
    const data = await response.json();
    const availableModels = data.models?.map((m: any) => m.name) || [];
    
    console.log(chalk.green('✅ Ollama is running at http://localhost:11434'));
    console.log(chalk.cyan('\n📋 Available Ollama Models:'));
    
    availableModels.forEach((model: string) => {
      console.log(chalk.gray(`   • ${model}`));
    });
    
    console.log(chalk.yellow('\n🎯 Recommended Models for Werewolf AI:'));
    OLLAMA_MODELS.forEach(model => {
      const isAvailable = availableModels.some((m: string) => m.includes(model));
      if (isAvailable) {
        console.log(chalk.green(`   ✓ ${model} - Available`));
      } else {
        console.log(chalk.red(`   ✗ ${model} - Not installed (run: ollama pull ${model})`));
      }
    });
    
    return true;
  } catch (error) {
    console.log(chalk.red('❌ Failed to connect to Ollama'));
    console.log(chalk.gray('   Make sure Ollama is running: ollama serve'));
    return false;
  }
}

// Test basic Ollama functionality
async function testOllamaAgent() {
  console.log(chalk.cyan('\n🧪 Testing Ollama Agent Creation...'));
  
  try {
    // Try to create an agent with the first available model
    const testModel = 'llama3.2:latest';
    console.log(chalk.gray(`   Creating agent with ${testModel}...`));
    
    const agent = new OllamaAgent('test-player', testModel);
    const info = await agent.getOllamaInfo();
    
    console.log(chalk.green('   ✓ Agent created successfully'));
    console.log(chalk.gray(`   Endpoint: ${info.endpoint}`));
    console.log(chalk.gray(`   Available models: ${info.models.join(', ')}`));
    
    // Test persona generation
    console.log(chalk.cyan('\n🎭 Testing Persona Generation...'));
    console.log(chalk.gray('   Generating a character persona...'));
    
    await agent.generatePersona(
      'A mysterious Victorian-era village where secrets lurk in every shadow',
      'en',
      []
    );
    
    if (agent.persona) {
      console.log(chalk.green('   ✓ Persona generated successfully'));
      console.log(chalk.gray(`   Name: ${agent.persona.name}`));
      console.log(chalk.gray(`   Backstory: ${agent.persona.backstory?.substring(0, 100)}...`));
      console.log(chalk.gray(`   Traits: ${agent.persona.personalityTraits.join(', ')}`));
    }
    
    return true;
  } catch (error) {
    console.log(chalk.red('   ✗ Failed to test Ollama agent:'), error);
    return false;
  }
}

// Show UI configuration instructions
function showUIInstructions() {
  console.log(chalk.bold.cyan('\n📱 How to Use Ollama in Werewolf AI UI:\n'));
  
  console.log(chalk.white('1. Start the dev server:'));
  console.log(chalk.gray('   pnpm dev'));
  
  console.log(chalk.white('\n2. Navigate to http://localhost:3099'));
  
  console.log(chalk.white('\n3. Sign in and go to "New Game"'));
  
  console.log(chalk.white('\n4. In the AI Configuration section:'));
  console.log(chalk.gray('   • Select "Local Ollama" from the provider dropdown'));
  console.log(chalk.gray('   • Choose your preferred Ollama model'));
  console.log(chalk.gray('   • You can use different models for Town and Mafia players'));
  
  console.log(chalk.white('\n5. Configure Ollama settings (optional):'));
  console.log(chalk.gray('   • Click "Configure" to adjust host/port if needed'));
  console.log(chalk.gray('   • Default is http://localhost:11434'));
  
  console.log(chalk.yellow('\n💡 Tips:'));
  console.log(chalk.gray('   • Smaller models (3B-7B) are faster but less creative'));
  console.log(chalk.gray('   • Larger models (13B+) provide better roleplay but are slower'));
  console.log(chalk.gray('   • Try different models for Mafia vs Town for variety'));
  console.log(chalk.gray('   • Mistral and Llama models work particularly well'));
}

// Main demo
async function runDemo() {
  // Check Ollama status
  const ollamaReady = await checkOllamaModels();
  
  if (!ollamaReady) {
    console.log(chalk.red('\n⚠️  Please start Ollama before using it in the UI'));
    return;
  }
  
  // Test basic functionality
  await testOllamaAgent();
  
  // Show UI instructions
  showUIInstructions();
  
  console.log(chalk.bold.green('\n✅ Ollama is ready to use in Werewolf AI!\n'));
  
  // Show browser navigation hint
  console.log(chalk.cyan('🌐 To see Ollama in action:'));
  console.log(chalk.gray('   1. The dev server is running at http://localhost:3099'));
  console.log(chalk.gray('   2. Sign in and create a new game'));
  console.log(chalk.gray('   3. Select "Local Ollama" as your AI provider'));
  console.log(chalk.gray('   4. Start playing with local AI models!\n'));
}

// Run the demo
runDemo().catch(error => {
  console.error(chalk.red('❌ Fatal error:'), error);
  process.exit(1);
}); 