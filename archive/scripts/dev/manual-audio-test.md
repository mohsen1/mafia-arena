# Manual Audio Sequencing Test

## Summary of Changes Made

We've implemented audio-aware turn sequencing to fix the issue where auto-run was cutting off audio playback. Here's what was changed:

### 1. Fixed SpeakText Component
- Added proper integration with GameContext for audio coordination
- Now calls `registerStopAudio()` when audio starts playing
- Calls `reportAudioFinished()` when audio completes
- Calls `unregisterStopAudio()` on cleanup

### 2. Fixed GameContext Audio Tracking
- Fixed interface mismatch for `unregisterStopAudio` function
- Audio state is now properly tracked with `isAudioPlaying` 
- Auto-run waits for `isAudioPlaying: false` before advancing turns
- `reportAudioFinished()` triggers next turn only after audio completes

### 3. Audio Sequencing Logic
- When voice mode is enabled: waits for audio to finish before next turn
- When voice mode is disabled: uses simulated reading delay (1.5s)
- Proper cleanup prevents stuck audio states

## Manual Test Instructions

1. **Start the application:**
   ```bash
   pnpm dev
   ```

2. **Navigate to:** http://localhost:3099

3. **Create a new game:**
   - Click "Try AI-Powered Werewolf Now"
   - **Enable Voice Mode** (this is crucial!)
   - Set player count to 3-4 for faster testing
   - Choose any AI provider (Groq is fastest)
   - Click "Start Game"

4. **Test Audio Sequencing:**
   - Wait for character generation to complete
   - **Enable Auto-Run** button
   - Observe that:
     - Each message is fully spoken before the next turn advances
     - Audio is not cut off mid-sentence
     - Turn advancement waits for audio completion
     - No audio queue blocking issues

5. **Check Console Logs:**
   Open browser dev tools and look for:
   ```
   [SpeakText] Audio started playing
   [GameContext] Audio state changing to: true
   [SpeakText] Audio ended naturally
   [GameContext] reportAudioFinished called
   ```

6. **Test Edge Cases:**
   - Disable/enable voice mode during gameplay
   - Skip audio using the ⏭️ button (should advance immediately)
   - Refresh page during audio playback (should cleanup properly)

## Expected Behavior

✅ **BEFORE (Broken):** Audio would be cut off when auto-run advanced to next turn
✅ **AFTER (Fixed):** Audio plays completely before next turn begins

## Key Components Changed

- `src/components/SpeakText.tsx` - Added GameContext integration
- `src/context/GameContext.tsx` - Fixed audio sequencing logic
- Auto-run now respects audio playback state

The fix ensures that when voice mode is enabled, the game waits for each message to be fully spoken before automatically advancing to the next turn, creating a smooth and uninterrupted audio experience. 