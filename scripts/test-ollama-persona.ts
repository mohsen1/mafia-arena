#!/usr/bin/env tsx

/**
 * Test script to debug Ollama persona generation
 */

import { OllamaAgent } from '../src/lib/engine/agents/OllamaAgent';
import { getPersonaGenerationPrompt } from '../src/lib/engine/prompts';
import chalk from 'chalk';

const MODEL = 'llama3.2:latest';
const THEME = 'UK Village 1900s';

async function testPersonaGeneration() {
  console.log(chalk.bold.blue('\n🎮 Testing Ollama Persona Generation\n'));

  // Create agent
  const agent = new OllamaAgent('test-player', MODEL);
  
  // Get the prompt that will be sent
  const prompt = getPersonaGenerationPrompt(THEME, 'en', []);
  
  console.log(chalk.cyan('Prompt being sent to Ollama:'));
  console.log(chalk.gray('---'));
  console.log(prompt);
  console.log(chalk.gray('---\n'));

  try {
    console.log(chalk.yellow('Generating persona...'));
    const startTime = Date.now();
    
    await agent.generatePersona(THEME, 'en', []);
    
    const duration = Date.now() - startTime;
    console.log(chalk.green(`✓ Persona generated in ${duration}ms`));
    
    console.log('\n' + chalk.cyan('Generated Persona:'));
    console.log(JSON.stringify(agent.persona, null, 2));
    
  } catch (error) {
    console.log(chalk.red('✗ Error generating persona:'), error);
  }

  // Test direct API call to see raw response
  console.log('\n' + chalk.cyan('Testing direct API call...'));
  
  try {
    const response = await fetch('http://localhost:11434/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        max_tokens: 400,
        response_format: { type: 'json_object' },
      }),
    });

    const data = await response.json();
    console.log(chalk.cyan('Raw API Response:'));
    console.log(JSON.stringify(data, null, 2));
    
    if (data.choices?.[0]?.message?.content) {
      console.log('\n' + chalk.cyan('Response content:'));
      console.log(data.choices[0].message.content);
    }
  } catch (error) {
    console.log(chalk.red('✗ Direct API call failed:'), error);
  }
}

// Run the test
testPersonaGeneration().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
}); 