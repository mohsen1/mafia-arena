# Audio Enhancements Summary

## Overview

This document summarizes the comprehensive audio logging enhancements made to the Werewolf AI game to ensure audio plays nicely and provide detailed debugging capabilities.

## Components Enhanced

### 1. SpeakText Component (`src/components/SpeakText.tsx`)
Enhanced with extensive logging throughout the audio lifecycle:

- **Component Lifecycle Logging**
  - Component mount/unmount tracking
  - Audio state changes monitoring
  - Auto-play effect logging

- **Audio Playback Events**
  - `COMPONENT_MOUNTED` - Initial component setup
  - `HANDLE_SPEAK_CALLED` - Audio playback initiated
  - `SPEAK_START` - Starting speech synthesis
  - `FETCH_AUDIO_REQUEST` - API call to generate audio
  - `FETCH_COMPLETE` - Audio URL received
  - `ATTEMPTING_PLAY` - Starting playback
  - `PLAY_SUCCESS/PLAY_FAILED` - Playback status
  - `PLAYING` - Audio actively playing
  - `PROGRESS` - Playback progress (every 10%)
  - `ENDED` - Audio completed

- **Performance Metrics**
  - Fetch times and response times
  - Cache hit rates
  - Playback success/failure rates
  - Audio duration tracking
  - User behavior patterns (auto vs manual play)

- **Error Handling**
  - Detailed error context with stack traces
  - Network error detection
  - Playback failure reasons
  - Browser compatibility issues

### 2. MessageBubble Component (`src/components/MessageBubble.tsx`)
Enhanced voice decision logic with detailed logging:

- **Voice Decision Process**
  - `VOICE_DECISION_START` - Initial decision factors
  - `VOICE_DECISION_RESULT` - Final decision with reasoning

- **Decision Factors Tracked**
  - Message sender and visibility
  - Human player status
  - Moderator message detection
  - Message phase and round
  - Text length

- **Decision Rules**
  - Always voice moderator/system messages
  - Skip human player's own messages
  - Voice public messages to all
  - Voice private messages only to recipients
  - Voice mafia messages only to mafia members

### 3. GameContext (`src/context/GameContext.tsx`)
Enhanced audio state management and auto-run coordination:

- **Audio State Management**
  - `AUDIO_STATE_CHANGED` - Global audio enable/disable
  - `TOGGLE_AUDIO` - User audio preference changes
  - `SET_AUDIO_ENABLED` - Programmatic audio control

- **Auto-Run Coordination**
  - `AUTO_RUN_CHECK` - Evaluate if game should progress
  - `AUTO_RUN_SKIP` - Reasons for not auto-running
  - `AUTO_RUN_SCHEDULING` - Timer setup for next turn
  - `AUTO_RUN_STOPPING_AUDIO` - Clear audio before progression
  - `AUTO_RUN_EXECUTING` - Advance game turn

- **Audio Callback Management**
  - `REGISTER_AUDIO_CALLBACK` - Track active audio
  - `UNREGISTER_AUDIO_CALLBACK` - Clean up finished audio

### 4. SpokenTextContext (`src/context/SpokenTextContext.tsx`)
Already had comprehensive logging for:

- Permission management
- Queue handling
- Multi-tab synchronization
- Browser event handling

## Logging Format

All logs use color-coded prefixes for easy identification:

- 🎵 **[SpeakText]** - Purple logs for audio playback
- 🗣️ **[MessageBubble/Voice]** - Green logs for voice decisions
- 🎮 **[GameContext/Audio]** - Red logs for game audio state
- 🔍 **[SpokenTextContext]** - Purple logs for context management

## Key Benefits

1. **Debugging Capabilities**
   - Track audio flow from decision to playback
   - Identify performance bottlenecks
   - Debug voice selection logic
   - Monitor auto-run coordination

2. **Performance Monitoring**
   - Real-time metrics collection
   - Average fetch and playback times
   - Cache effectiveness tracking
   - User behavior analysis

3. **Error Diagnosis**
   - Detailed error context
   - Network issue detection
   - Browser compatibility tracking
   - Playback failure analysis

4. **Game Flow Visibility**
   - Auto-run decision process
   - Audio/game coordination
   - Phase transition handling
   - Human action detection

## Testing

Created test utilities:
- `scripts/dev/test-audio-logging.ts` - Demonstrates all logging features
- `docs/AUDIO_LOGGING_DEMO.md` - Sample output documentation

## Usage

The enhanced logging is automatically active in development mode. Key events to monitor:

1. Check voice decisions in MessageBubble logs
2. Monitor audio fetch/playback in SpeakText logs
3. Track game progression in GameContext logs
4. Watch for errors and performance issues

This comprehensive logging ensures the audio system plays nicely with the game flow and provides detailed insights for debugging and optimization. 