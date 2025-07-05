#!/usr/bin/env tsx

console.log('🎮 Werewolf AI Voice Test Instructions\n');
console.log('To test voice functionality:\n');

console.log('1. Open your browser to: http://localhost:3099/en/new');
console.log('2. Click on "Quick Game 5 players" to start a quick game');
console.log('3. The game will start with voice enabled by default in development mode');
console.log('\nAlternatively, for custom settings:');
console.log('1. Click "Skip to custom settings →" at the bottom');
console.log('2. Make sure "Enable voice mode" checkbox is checked');
console.log('3. Click "Start Game"\n');

console.log('🔊 Voice Features:');
console.log('- AI messages will automatically play as audio');
console.log('- Use the speaker icon to mute/unmute');
console.log('- Use the skip button (⏭️) if audio gets stuck');
console.log('- Check browser console for detailed voice logs\n');

console.log('📊 Console Logs to Watch:');
console.log('- [SpeakText] - Audio playback events');
console.log('- [SpokenTextContext] - Queue management');
console.log('- [MessageBubble] - Voice enablement status');
console.log('- [GameContext] - Audio state changes\n');

console.log('🐛 Troubleshooting:');
console.log('- If no audio plays, check that ElevenLabs API key is set in .env.local');
console.log('- If audio gets stuck, click the skip button (⏭️) in game controls');
console.log('- Check browser console for any error messages');
console.log('- Ensure browser allows audio playback (not muted)'); 