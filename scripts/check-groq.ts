#!/usr/bin/env tsx

import Groq from 'groq-sdk';
import chalk from 'chalk';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

console.log(chalk.bold('\n🔍 Groq API Connection Check\n'));

// Check for API key
const apiKey = process.env.GROQ_API_KEY;

if (!apiKey) {
  console.log(chalk.red('❌ GROQ_API_KEY environment variable not found!'));
  console.log(chalk.yellow('\nTo use Groq, you need to:'));
  console.log('1. Get an API key from https://console.groq.com/keys');
  console.log('2. Set it as an environment variable:');
  console.log(chalk.cyan('   export GROQ_API_KEY="your-api-key-here"'));
  console.log('\nOr add it through the user profile in the web interface.');
  process.exit(1);
}

console.log(chalk.green('✓ GROQ_API_KEY found'));
console.log(chalk.gray(`  Key: ${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`));

const groq = new Groq({
  apiKey: apiKey,
});

// Available Groq models as of the codebase
const groqModels = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'llama-3.1-70b-versatile',
  'llama3-8b-8192',
  'llama3-70b-8192',
  'mixtral-8x7b-32768',
  'gemma-7b-it',
  'gemma2-9b-it',
];

async function testConnection() {
  try {
    // Test with a simple completion
    console.log('\n🤖 Testing Groq API connection...');
    
    const testModel = 'llama-3.1-8b-instant'; // Fast model for testing
    console.log(`  Using model: ${chalk.cyan(testModel)}`);
    
    const completion = await groq.chat.completions.create({
      model: testModel,
      messages: [
        {
          role: 'system',
          content: 'You are testing the Groq connection for Werewolf AI game.',
        },
        {
          role: 'user',
          content: 'Say "Groq is ready for Werewolf AI!" in an enthusiastic way.',
        },
      ],
      max_tokens: 50,
      temperature: 0.7,
    });
    
    console.log(chalk.green('\n✅ Connection successful!'));
    console.log(`  Response: ${completion.choices[0]?.message?.content}`);
    
    // Test each model availability
    console.log('\n📊 Testing available models...\n');
    
    const modelResults: { model: string; status: string; responseTime?: number }[] = [];
    
    for (const model of groqModels) {
      process.stdout.write(`  Testing ${chalk.cyan(model)}...`);
      const startTime = Date.now();
      
      try {
        const response = await groq.chat.completions.create({
          model: model,
          messages: [
            {
              role: 'user',
              content: 'Reply with just "OK"',
            },
          ],
          max_tokens: 10,
          temperature: 0,
        });
        
        const responseTime = Date.now() - startTime;
        modelResults.push({ 
          model, 
          status: 'available', 
          responseTime 
        });
        console.log(chalk.green(` ✓ (${responseTime}ms)`));
      } catch (error: any) {
        modelResults.push({ model, status: 'unavailable' });
        console.log(chalk.red(` ✗ ${error.message || 'Not available'}`));
      }
    }
    
    // Summary
    console.log(chalk.bold('\n📈 Summary:'));
    const availableModels = modelResults.filter(r => r.status === 'available');
    console.log(`  Available models: ${chalk.green(availableModels.length)}/${groqModels.length}`);
    
    if (availableModels.length > 0) {
      console.log('\n  Recommended models for Werewolf AI:');
      console.log(`  ${chalk.cyan('llama-3.1-8b-instant')} - Fastest responses, good for quick games`);
      console.log(`  ${chalk.cyan('gemma2-9b-it')} - Balanced performance and quality`);
      console.log(`  ${chalk.cyan('llama-3.3-70b-versatile')} - Best quality, slower responses`);
    }
    
    console.log(chalk.green('\n🎉 Groq is properly configured and ready to use!'));
    console.log('\nYou can now:');
    console.log('1. Start a new game and select "Groq" as the provider');
    console.log('2. Choose from available models based on your needs');
    console.log('3. Use different models for Town vs Mafia for variety');
    console.log('4. Enjoy fast AI-powered Werewolf gameplay!\n');
    
  } catch (error: any) {
    console.log(chalk.red('\n❌ Connection failed!'));
    console.log(chalk.red(`  Error: ${error.message}`));
    
    if (error.message?.includes('401')) {
      console.log(chalk.yellow('\n⚠️  Invalid API key. Please check your GROQ_API_KEY.'));
    } else if (error.message?.includes('network')) {
      console.log(chalk.yellow('\n⚠️  Network error. Please check your internet connection.'));
    }
    
    process.exit(1);
  }
}

// Run the test
testConnection().catch(error => {
  console.error(chalk.red('Unexpected error:'), error);
  process.exit(1);
}); 