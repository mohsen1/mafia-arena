# Manual Voice Game Testing Guide

This guide will help you manually test the voice functionality in Werewolf AI.

## Prerequisites

1. Ensure the development server is running:
   ```bash
   pnpm dev
   ```

2. Ensure you have set up your ElevenLabs API key in `.env.local`:
   ```
   NEXT_PUBLIC_ELEVENLABS_API_KEY=your_api_key_here
   ```

## Testing Steps

### 1. Start a New Game with Voice

1. Open your browser to http://localhost:3099
2. Click "Play Now" or navigate to http://localhost:3099/en/new
3. Click "Skip to custom settings →" at the bottom of the page

### 2. Configure Voice Settings

1. In the custom game settings:
   - Set player count to 5 (for a quick game)
   - Make sure "Join as Human Player" is checked
   - **Important**: Check the "Enable Voice Mode" checkbox
   - Select "groq" as the AI Provider (it's fast and reliable)
   - Click "Start Game"

### 3. Monitor Voice Functionality

1. Open the browser's Developer Console (F12 or Cmd+Option+I)
2. Look for logs with these prefixes:
   - `[MessageBubble]` - Shows when messages are being rendered
   - `[SpeakText]` - Shows when voice synthesis is attempted
   - `[SpokenTextContext]` - Shows audio queue management
   - `[GameContext]` - Shows game state and audio settings

### 4. Expected Voice Behavior

When the game starts:
- AI characters should speak their messages automatically
- You should hear voices for:
  - Character introductions
  - Day/night phase announcements
  - Voting discussions
  - Game events

### 5. Voice Controls

- **Mute/Unmute Button**: Toggle global audio on/off (speaker icon in game controls)
- **Skip Audio Button**: Skip currently playing audio (appears when audio is playing)
- **Microphone Button**: Click to speak your messages (if enabled)

### 6. Troubleshooting

If voices aren't working:

1. **Check Console Logs**:
   - Look for `[MessageBubble] Rendering with voice` - indicates voice is enabled
   - Look for `[SpeakText] Fetching audio` - indicates API call is being made
   - Look for any error messages in red

2. **Common Issues**:
   - **No API Key**: Check if `NEXT_PUBLIC_ELEVENLABS_API_KEY` is set
   - **API Limit**: ElevenLabs free tier has limits, check your usage
   - **Browser Permissions**: Allow audio playback if prompted
   - **Stuck Audio**: Click the skip button to clear stuck audio

3. **Debug Information**:
   - Voice should show `isAudioGloballyEnabled: true` in logs
   - Each message should have a unique audio ID
   - Audio queue should clear after playback

### 7. Testing Voice Input (Optional)

If you want to test speech-to-text:
1. Click the microphone button in the chat input
2. Speak your message
3. The text should appear in the input field
4. Click send or press Enter

## What We've Fixed

Recent improvements to voice functionality:
1. ✅ Fixed audio queue blocking issues
2. ✅ Added skip button for stuck audio
3. ✅ Improved error handling and recovery
4. ✅ Added extensive logging for debugging
5. ✅ Fixed component re-rendering issues
6. ✅ Added automatic audio cleanup on errors

## Logs to Look For

Success logs:
```
[GameContext] Provider render: {isAudioGloballyEnabled: true}
[MessageBubble] Rendering with voice
[SpeakText] Component mounted with ID: audio-xxx
[SpeakText] Fetching audio from API...
[SpeakText] Audio loaded successfully
[SpokenTextContext] Audio started: audio-xxx
[SpeakText] Audio ended successfully
[SpokenTextContext] Clearing speaking ID: audio-xxx
```

Error logs to watch for:
```
[SpeakText] Audio error event
[SpeakText] Error fetching audio
[SpokenTextContext] Clearing stuck audio ID after timeout
``` 