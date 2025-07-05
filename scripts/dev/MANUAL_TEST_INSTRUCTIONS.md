# 🎮 MANUAL AUDIO TESTING INSTRUCTIONS

## Status: Enhanced Logging Added ✅

I've added extensive timestamped logging with emojis to all audio components. Now you can manually test the audio coordination to see exactly what's happening.

## 🚀 Quick Test Steps

### 1. Open the App
- **URL:** http://localhost:3099
- **Dev Server:** Already running on port 3099

### 2. Open Browser Dev Tools
- Press `F12` or `Cmd+Option+I`
- Go to **Console** tab
- **Filter logs:** Type `[SpokenTextContext]` OR `[SpeakText]` OR `[GameContext]` OR `[MessageBubble]`
- Or just watch for emoji logs: 🔊 🎤 🗣️ ✅ ❌ 🎵 etc.

### 3. Start a Voice Game
- Click **"Try AI-Powered Werewolf Now"** button
- On the game setup page:
  - **Enable Voice Mode** ✅ (crucial!)
  - Set player count to **3-4** for faster testing
  - Choose any AI provider (Groq is fastest)
- Click **"Start Game"**

### 4. Watch the Logs During Character Generation
Look for this sequence in console:
```
[MessageBubble] 13:05:45 🔊 Voice check: { willUseSpeakText: true }
[MessageBubble] 13:05:45 🎤 RENDERING with SpeakText
[SpeakText] 13:05:45 🗣️ handleSpeak CALLED
[SpeakText] 13:05:45 🔓 REQUESTING permission to speak...
[SpokenTextContext] 13:05:45 ✅ GRANTED - Setting speaking ID
[SpeakText] 13:05:46 ▶️ Audio STARTED playing
[GameContext] 13:05:46 🎵 REGISTER audio
[SpeakText] 13:05:50 🏁 Audio ENDED naturally
[GameContext] 13:05:50 🎵 AUDIO FINISHED
```

### 5. Enable Auto-Run and Monitor
- Once character generation is complete
- Click **"Auto Run"** button to enable automatic turn advancement
- **Watch carefully:** Audio should play completely before next turn starts

## 🔍 What to Look For

### ✅ **SUCCESS PATTERN** (Fixed)
```
[SpeakText] 13:05:45 🗣️ handleSpeak CALLED: { audioId: "audio-123" }
[SpokenTextContext] 13:05:45 ✅ GRANTED - Setting speaking ID: { newSpeakingId: "audio-123" }
[SpeakText] 13:05:46 ▶️ Audio STARTED playing: { audioId: "audio-123" }
[SpeakText] 13:05:50 🏁 Audio ENDED naturally: { audioId: "audio-123" }
[GameContext] 13:05:50 🎵 AUDIO FINISHED: { messageId: "audio-123" }
[GameContext] 13:05:50 ▶️ TRIGGERING next turn after audio
```

### ❌ **PROBLEM PATTERN** (Should be fixed now)
```
[SpeakText] 13:05:47 🗣️ handleSpeak CALLED: { audioId: "audio-456" }
[SpokenTextContext] 13:05:47 ❌ DENIED - Another audio playing: { blockingId: "audio-123" }
[SpeakText] 13:05:47 🚫 DENIED - Cannot speak, another audio is playing
```

### 🚨 **CRITICAL ISSUES TO CHECK**

1. **Stuck Audio IDs**
   ```
   [SpokenTextContext] 13:05:50 ❌ DENIED - Another audio playing: { blockingId: "audio-123" }
   [SpokenTextContext] 13:05:55 ❌ DENIED - Another audio playing: { blockingId: "audio-123" }
   [SpokenTextContext] 13:06:00 ❌ DENIED - Another audio playing: { blockingId: "audio-123" }
   ```

2. **Turn Advancement Timing**
   - Turns should only advance **AFTER** `🏁 Audio ENDED naturally`
   - Should **NOT** see `▶️ TRIGGERING next turn` while audio is still playing

3. **Component Lifecycle Issues**
   ```
   [SpeakText] 13:05:46 🏗️ Component MOUNTED: { audioId: "audio-123" }
   [SpeakText] 13:05:47 🧹 Component UNMOUNTING: { isPlaying: true }  // ⚠️ BAD
   ```

## 🎯 Expected Behavior

**BEFORE (Broken):**
- Audio gets cut off mid-sentence
- "Another audio playing" errors constantly
- Auto-run advances too quickly

**AFTER (Fixed):**
- Each message plays completely
- No audio queue blocking
- Auto-run waits for audio completion
- Smooth turn transitions

## 📊 Test Results

**Test 1: Character Generation**
- [ ] All character messages play completely
- [ ] No "another audio playing" errors
- [ ] Smooth sequence of character introductions

**Test 2: Auto-Run with Voice**
- [ ] Enable auto-run after character generation
- [ ] Each turn waits for audio to finish
- [ ] No audio cutoff during turn transitions

**Test 3: Edge Cases**
- [ ] Disable/enable voice mode during game
- [ ] Skip audio using ⏭️ button (should advance immediately)
- [ ] Page refresh during audio (should cleanup properly)

## 🐛 If Issues Persist

Share the console logs showing:
1. The exact sequence where "Another audio playing" occurs
2. Timestamps showing turn advancement vs audio timing
3. Any stuck audio IDs that never get cleared

The enhanced logging will reveal whether it's:
- Stuck audio ID in SpokenTextContext
- Component lifecycle issues (unmounting during playback)
- Race conditions between multiple SpeakText components
- Timing issues between GameContext and SpokenTextContext

## 🎉 Success Indicators

- ✅ Smooth character generation with complete audio
- ✅ Auto-run respects audio playback timing
- ✅ No blocked audio queue messages
- ✅ Clean console logs with proper emoji sequence
- ✅ Turn advancement only after `🏁 Audio ENDED naturally`

**The fix ensures audio sequencing works correctly - test it and let me know what you see in the logs!** 🎵 