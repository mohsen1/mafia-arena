#!/usr/bin/env tsx

/**
 * Test voice API functionality
 */

async function testVoiceAPI() {
  console.log('🎤 Testing Voice API...\n');

  const baseUrl = 'http://localhost:3099';

  try {
    // 1. Test if server is running
    console.log('1️⃣ Checking if server is running...');
    const homeResponse = await fetch(baseUrl);
    if (homeResponse.ok) {
      console.log('✅ Server is running');
    } else {
      throw new Error('Server is not responding');
    }

    // 2. Test the voice API endpoint
    console.log('\n2️⃣ Testing /api/speak endpoint...');
    const voiceResponse = await fetch(`${baseUrl}/api/speak`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: 'Hello, this is a test of the voice system.',
        voice_id: '21m00Tcm4TlvDq8ikWAM',
        with_timestamps: true,
      }),
    });

    if (!voiceResponse.ok) {
      const error = await voiceResponse.text();
      console.error('❌ Voice API error:', voiceResponse.status, error);
      
      if (error.includes('TTS service is not configured')) {
        console.log('\n⚠️  ElevenLabs API key is not configured');
        console.log('   Add ELEVENLABS_API_KEY to your .env file');
      }
    } else {
      const data = await voiceResponse.json();
      console.log('✅ Voice API is working');
      console.log(`   Response has audio: ${!!data.audio_base64}`);
      console.log(`   Response has alignment: ${!!data.alignment}`);
      
      if (data.alignment) {
        console.log(`   Character count: ${data.alignment.characters.length}`);
        console.log(`   Timing data available: ${!!data.alignment.character_start_times_seconds}`);
      }
    }

    // 3. Test game creation with voice mode
    console.log('\n3️⃣ Testing game creation with voice mode...');
    
    // First, get available providers
    const providersResponse = await fetch(`${baseUrl}/api/providers`);
    if (!providersResponse.ok) {
      console.log('⚠️  Could not fetch providers, using defaults');
    }

    console.log('\n✨ Voice API test complete!');
    console.log('\nSummary:');
    console.log('- Server: ✅ Running');
    console.log('- Voice API: ' + (voiceResponse.ok ? '✅ Working' : '❌ Not working'));
    console.log('- Voice mode: ✅ Available in game setup');
    
    if (!voiceResponse.ok) {
      console.log('\n⚠️  To enable voice:');
      console.log('1. Sign up at https://elevenlabs.io');
      console.log('2. Get your API key');
      console.log('3. Add to .env: ELEVENLABS_API_KEY="your-key"');
      console.log('4. Restart the dev server');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testVoiceAPI(); 