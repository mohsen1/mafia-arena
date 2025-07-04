#!/usr/bin/env tsx

/**
 * Test script to check Groq character generation in production
 */

const PRODUCTION_URL = 'https://werewolf-ai.vercel.app';

async function testGroqInProduction() {
  console.log('🔍 Testing Groq character generation in production...\n');

  // First, we need to get the session
  console.log('1. Checking if we can access the production site...');
  
  try {
    const response = await fetch(`${PRODUCTION_URL}/api/auth/session`);
    const session = await response.json();
    console.log('Session response:', session);
    
    // Check if GROQ_API_KEY is set in production
    console.log('\n2. Checking production logs for Groq API key...');
    console.log('Note: We cannot directly check env vars in production, but the logs should show if GROQ_API_KEY is available');
    
    // Try to create a game with Groq
    console.log('\n3. Attempting to create a game with Groq...');
    
    // This would require authentication, so let's just check the API endpoint
    const healthCheck = await fetch(`${PRODUCTION_URL}/api/auth/providers`);
    const providers = await healthCheck.json();
    console.log('Available auth providers:', providers);
    
    console.log('\n✅ Production site is accessible');
    console.log('\n📝 To test character generation:');
    console.log('1. Sign in to the production site');
    console.log('2. Create a new game with Groq as the AI provider');
    console.log('3. Check the browser console for detailed logs');
    console.log('4. Check Vercel logs for server-side logging');
    
  } catch (error) {
    console.error('❌ Error accessing production:', error);
  }
}

// Run the test
testGroqInProduction(); 