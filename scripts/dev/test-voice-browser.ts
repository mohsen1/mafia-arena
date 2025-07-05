#!/usr/bin/env tsx

console.log('🎮 Testing Werewolf AI Voice Integration...\n');
console.log('To test voice functionality:');
console.log('1. Open http://localhost:3099/en/new in your browser');
console.log('2. Click "Skip to custom settings →"');
console.log('3. Make sure "Enable voice mode" is checked');
console.log('4. Start the game');
console.log('5. Watch the console logs for voice activity');
console.log('\nThe voice should automatically play for AI messages.');
console.log('If audio gets stuck, use the skip button in the game controls.');
console.log('\nCheck browser console for detailed logs:');
console.log('- [SpeakText] logs show audio playback status');
console.log('- [SpokenTextContext] logs show queue management');
console.log('- [MessageBubble] logs show when voice is enabled/disabled');
console.log('- [GameContext] logs show audio state changes'); 