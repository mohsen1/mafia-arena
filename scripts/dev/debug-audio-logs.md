# Audio Coordination Debug Guide

## Enhanced Logging Added

I've added extensive timestamped logging with emojis to all audio-related components:

### SpokenTextContext Logs
- `🔓 REQUESTING permission to speak...`
- `✅ GRANTED - Setting speaking ID` 
- `❌ DENIED - Another audio playing`
- `✅ CLEARING current speaking ID`
- `🎯 Processing next in queue`
- `🔄 RESETTING AUDIO`

### GameContext Logs  
- `🎵 REGISTER audio`
- `🎵 UNREGISTER audio`
- `🎵 AUDIO FINISHED`
- `⏰ SCHEDULING next turn in 500ms...`
- `▶️ TRIGGERING next turn after audio`
- `❌ SKIPPED next turn - conditions changed`

### SpeakText Logs
- `🗣️ handleSpeak CALLED`
- `🔓 REQUESTING permission to speak...`  
- `✅ PERMISSION GRANTED, proceeding with speak`
- `🚫 DENIED - Cannot speak, another audio is playing`
- `▶️ Audio STARTED playing`
- `🏁 Audio ENDED naturally`
- `🧹 Component UNMOUNTING`

### MessageBubble Logs
- `🔊 Voice check`
- `🎤 RENDERING with SpeakText`
- `📝 RENDERING without voice`

## How to Debug the "Another Audio Playing" Issue

1. **Start the application with voice mode:**
   ```bash
   pnpm dev
   ```

2. **Open browser dev tools and filter console logs:**
   - Filter for: `[SpokenTextContext]` OR `[GameContext]` OR `[SpeakText]` OR `[MessageBubble]`

3. **Create a game with voice enabled:**
   - Go to http://localhost:3099
   - Click "Try AI-Powered Werewolf Now"
   - **Enable Voice Mode** ✅
   - Set 3-4 players
   - Start game

4. **Watch the logs during character generation:**
   Look for this sequence:
   ```
   [MessageBubble] 10:30:45 🔊 Voice check: { messageId: "msg1", willUseSpeakText: true }
   [MessageBubble] 10:30:45 🎤 RENDERING with SpeakText: { messageId: "msg1" }
   [SpeakText] 10:30:45 🗣️ handleSpeak CALLED: { audioId: "audio-123" }
   [SpeakText] 10:30:45 🔓 REQUESTING permission to speak...
   [SpokenTextContext] 10:30:45 requestToSpeak: { requestingId: "audio-123", currentlySpeakingId: null }
   [SpokenTextContext] 10:30:45 ✅ GRANTED - Setting speaking ID: { newSpeakingId: "audio-123" }
   [SpeakText] 10:30:45 ✅ PERMISSION GRANTED, proceeding with speak
   [SpeakText] 10:30:46 ▶️ Audio STARTED playing: { audioId: "audio-123" }
   [GameContext] 10:30:46 🎵 REGISTER audio: { messageId: "audio-123" }
   ```

5. **When the "Another audio playing" error occurs, look for:**
   ```
   [SpeakText] 10:30:47 🗣️ handleSpeak CALLED: { audioId: "audio-456" }
   [SpeakText] 10:30:47 🔓 REQUESTING permission to speak...
   [SpokenTextContext] 10:30:47 requestToSpeak: { requestingId: "audio-456", currentlySpeakingId: "audio-123" }
   [SpokenTextContext] 10:30:47 ❌ DENIED - Another audio playing: { requestingId: "audio-456", blockingId: "audio-123" }
   [SpeakText] 10:30:47 🚫 DENIED - Cannot speak, another audio is playing
   ```

## Key Things to Check

### 1. Stuck Audio IDs
If you see this pattern, an audio ID got stuck:
```
[SpokenTextContext] 10:30:50 ❌ DENIED - Another audio playing: { blockingId: "audio-123" }
[SpokenTextContext] 10:30:55 ❌ DENIED - Another audio playing: { blockingId: "audio-123" }
[SpokenTextContext] 10:30:60 ❌ DENIED - Another audio playing: { blockingId: "audio-123" }
```

Look for missing `doneSpeaking` calls or component unmounting issues.

### 2. Auto-Run Timing Issues
```
[GameContext] 10:30:46 🎵 AUDIO FINISHED: { messageId: "audio-123", isLatestMessage: true }
[GameContext] 10:30:46 ⏰ SCHEDULING next turn in 500ms...
[GameContext] 10:30:47 ▶️ TRIGGERING next turn after audio
```

This should only happen AFTER audio finishes.

### 3. Component Mount/Unmount Issues
```
[SpeakText] 10:30:46 🏗️ Component MOUNTED: { audioId: "audio-123" }
[SpeakText] 10:30:47 🧹 Component UNMOUNTING: { audioId: "audio-123", isPlaying: true }
[SpeakText] 10:30:47 🗑️ CLEARING speaking ID on unmount: audio-123
```

If components unmount while audio is playing, this can cause coordination issues.

### 4. Multiple Components Rendering
```
[MessageBubble] 10:30:45 🎤 RENDERING with SpeakText: { messageId: "msg1" }
[MessageBubble] 10:30:45 🎤 RENDERING with SpeakText: { messageId: "msg1" }  // ⚠️ DUPLICATE
```

Duplicate renders can cause multiple SpeakText components for the same message.

## Expected Flow (Working Correctly)

```
1. MessageBubble renders → SpeakText created
2. SpeakText requests permission → SpokenTextContext grants
3. Audio starts → GameContext registers stop callback
4. Audio ends → Both contexts notified
5. Next turn triggered only after audio completion
```

## Common Issues to Look For

1. **Stuck currentlySpeakingId** - Audio ID never cleared
2. **Race conditions** - Multiple components trying to speak simultaneously  
3. **Component lifecycle** - Unmounting during audio playback
4. **State synchronization** - SpokenTextContext vs GameContext mismatch

Run the test and share the console output showing the exact sequence where "Another audio playing" occurs! 