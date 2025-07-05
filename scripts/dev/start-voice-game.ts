#!/usr/bin/env tsx

import { startGameAction } from '../../src/app/actions/setup.actions';

async function startVoiceGame() {
  console.log('🎮 Starting a game with voice enabled...\n');

  try {
    const gameConfig = {
      playerCount: 5,
      themeKey: 'UK_VILLAGE_1900S',
      language: 'en',
      isHumanPlayer: true,
      voiceModeEnabled: true, // Enable voice mode
      globalProvider: 'groq',
      globalModel: 'llama-3.1-8b-instant',
      useSeparateMafia: false,
      mafiaProvider: 'groq',
      mafiaModel: 'llama-3.1-8b-instant',
    };

    console.log('Game configuration:', gameConfig);
    console.log('\nStarting game...');

    const result = await startGameAction(gameConfig);

    if ('redirect' in result) {
      console.log('\n✅ Game created successfully!');
      console.log(`🔗 Open this URL in your browser: http://localhost:3099${result.redirect}`);
      console.log('\n📊 Check the browser console for voice logs:');
      console.log('- [SpeakText] logs show audio playback');
      console.log('- [SpokenTextContext] logs show queue management');
      console.log('- [MessageBubble] logs show voice enablement');
      console.log('- [GameContext] logs show audio state');
    } else if ('error' in result) {
      console.error('❌ Error creating game:', result.error);
    }
  } catch (error) {
    console.error('❌ Failed to start game:', error);
  }
}

startVoiceGame(); 