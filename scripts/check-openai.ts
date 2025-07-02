#!/usr/bin/env tsx

import * as dotenv from 'dotenv';
import { OpenAI } from 'openai';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

console.log('🔍 Checking OpenAI Configuration...\n');

// Check environment variable
const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.error('❌ OPENAI_API_KEY environment variable is not set');
  console.log('\nTo enable OpenAI models:');
  console.log('1. Add your API key to .env.local:');
  console.log('   OPENAI_API_KEY="sk-your-actual-api-key-here"');
  console.log('\n2. Or add it via your user profile in the app');
  process.exit(1);
}

if (apiKey === 'your-openai-api-key' || apiKey.includes('your-')) {
  console.error('❌ OPENAI_API_KEY is still set to the placeholder value');
  console.log('\nPlease replace it with your actual OpenAI API key in .env.local');
  console.log('Get your API key from: https://platform.openai.com/api-keys');
  process.exit(1);
}

console.log('✅ OPENAI_API_KEY is configured');
console.log(`   Key: ${apiKey.substring(0, 7)}...${apiKey.substring(apiKey.length - 4)}`);

// Test the connection
console.log('\n🧪 Testing OpenAI connection...');

const openai = new OpenAI({
  apiKey: apiKey,
});

async function testConnection() {
  try {
    // List available models
    console.log('\n📋 Fetching available models...');
    const models = await openai.models.list();
    
    const gptModels = models.data
      .filter(model => model.id.includes('gpt'))
      .map(model => model.id)
      .sort();
    
    console.log('\n✅ Connection successful!');
    console.log(`\n📊 Available GPT models (${gptModels.length}):`);
    gptModels.forEach(model => {
      console.log(`   - ${model}`);
    });
    
    // Test a simple completion
    console.log('\n🤖 Testing chat completion with gpt-4o-mini...');
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are testing the OpenAI connection for Werewolf AI game.',
        },
        {
          role: 'user',
          content: 'Say "OpenAI is ready for Werewolf AI!" in a dramatic way.',
        },
      ],
      max_tokens: 50,
    });
    
    console.log('\n✅ Chat completion successful!');
    console.log(`   Response: ${completion.choices[0]?.message?.content}`);
    
    console.log('\n🎉 OpenAI is properly configured and ready to use!');
    console.log('\nYou can now:');
    console.log('1. Start a new game and select "Official OpenAI API" as the provider');
    console.log('2. Choose from available models like GPT-4o Mini or GPT-4.1 Mini');
    console.log('3. Enjoy AI-powered Werewolf gameplay!\n');
    
  } catch (error: any) {
    console.error('\n❌ Failed to connect to OpenAI:', error.message);
    
    if (error.message?.includes('401')) {
      console.log('\n🔑 Invalid API key. Please check:');
      console.log('1. Your API key is correct');
      console.log('2. The key has not been revoked');
      console.log('3. Get a new key from: https://platform.openai.com/api-keys');
    } else if (error.message?.includes('429')) {
      console.log('\n💳 Rate limit or quota exceeded. Please check:');
      console.log('1. Your OpenAI account has credits');
      console.log('2. You haven\'t exceeded rate limits');
      console.log('3. Check usage at: https://platform.openai.com/usage');
    } else {
      console.log('\n🔧 Please check:');
      console.log('1. Your internet connection');
      console.log('2. OpenAI service status: https://status.openai.com');
      console.log('3. Your API key permissions');
    }
    
    process.exit(1);
  }
}

testConnection(); 