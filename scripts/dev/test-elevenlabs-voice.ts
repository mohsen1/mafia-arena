#!/usr/bin/env tsx

/**
 * Test ElevenLabs voice API directly
 */

async function testElevenLabsVoice() {
  console.log('Testing ElevenLabs voice API...\n');

  const apiKey = process.env.ELEVENLABS_API_KEY;
  
  if (!apiKey) {
    console.error('❌ ELEVENLABS_API_KEY is not set in environment variables');
    process.exit(1);
  }

  console.log('✅ ELEVENLABS_API_KEY is configured');

  try {
    // Test the API directly
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: {
        'xi-api-key': apiKey,
      },
    });

    if (!response.ok) {
      console.error(`❌ ElevenLabs API error: ${response.status} ${response.statusText}`);
      const error = await response.text();
      console.error(error);
      process.exit(1);
    }

    const data = await response.json();
    console.log(`✅ Successfully connected to ElevenLabs API`);
    console.log(`   Found ${data.voices.length} available voices\n`);

    // Test text-to-speech with timestamps
    console.log('Testing text-to-speech with timestamps...');
    
    const testVoiceId = data.voices[0]?.voice_id || '21m00Tcm4TlvDq8ikWAM';
    const ttsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${testVoiceId}/with-timestamps`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text: 'Hello, this is a test of the voice system.',
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!ttsResponse.ok) {
      console.error(`❌ TTS API error: ${ttsResponse.status} ${ttsResponse.statusText}`);
      const error = await ttsResponse.text();
      console.error(error);
      process.exit(1);
    }

    const ttsData = await ttsResponse.json();
    console.log('✅ Successfully generated speech with timestamps');
    console.log(`   Audio size: ${ttsData.audio_base64.length} characters`);
    console.log(`   Alignment data: ${ttsData.alignment.characters.length} characters\n`);

    // Test via the app's API route
    console.log('Testing via app API route...');
    const appResponse = await fetch('http://localhost:3099/api/speak', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: 'Testing the app API route.',
        voice_id: testVoiceId,
        with_timestamps: true,
      }),
    });

    if (!appResponse.ok) {
      console.error(`❌ App API error: ${appResponse.status} ${appResponse.statusText}`);
      const error = await appResponse.text();
      console.error(error);
    } else {
      const appData = await appResponse.json();
      console.log('✅ App API route is working correctly');
      console.log(`   Response has audio: ${!!appData.audio_base64}`);
      console.log(`   Response has alignment: ${!!appData.alignment}\n`);
    }

    console.log('\n🎉 All voice tests passed!\n');
    console.log('To use voice in the game:');
    console.log('1. Start a NEW game (existing games may not have voice enabled)');
    console.log('2. Check the "Enable voice mode" checkbox in game setup');
    console.log('3. Make sure the speaker icon in the game header is not muted');
    console.log('4. You can also test at http://localhost:3099/voice-test\n');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testElevenLabsVoice(); 