# Audio Logging Demo

This document demonstrates the comprehensive audio logging system added to Werewolf AI for debugging and monitoring voice playback.

## Overview

The audio system now includes extensive logging with:
- 🎵 **SpeakText** - Audio playback events (purple logs)
- 🗣️ **MessageBubble/Voice** - Voice decision logic (green logs) 
- 🎮 **GameContext/Audio** - Game audio state management (red logs)

## Sample Output

### 1. Game Initialization
```
🎮 [GameContext/Audio] 9:06:05 AM AUDIO_STATE_CHANGED {
  "isAudioGloballyEnabled": true,
  "currentGameState": "CharacterGeneration",
  "humanPlayerId": "human-player-123"
}
```

### 2. Voice Decision Making
```
🗣️ [MessageBubble/Voice] 9:06:05 AM VOICE_DECISION_START {
  "messageId": "msg-1",
  "senderId": null,
  "senderName": "System",
  "visibility": "Public",
  "isModeratorMessage": true,
  "textLength": 66
}

🗣️ [MessageBubble/Voice] 9:06:05 AM VOICE_DECISION_RESULT {
  "result": true,
  "reason": "Moderator/System message",
  "visibility": "Public"
}
```

### 3. Audio Playback Lifecycle
```
🎵 [SpeakText] 9:06:05 AM COMPONENT_MOUNTED {
  "text": "Welcome to Werewolf AI! Players are generating the...",
  "voiceId": "DtQqHh17jNwDFfxCdvGD",
  "autoPlay": true,
  "isAudioGloballyEnabled": true
}

🎵 [SpeakText] 9:06:05 AM HANDLE_SPEAK_CALLED {
  "audioId": "audio-1751785565738-avc1o9hdk",
  "isPlaying": false,
  "isLoading": false,
  "hasError": false,
  "isAudioGloballyEnabled": true
}

🎵 [SpeakText] 9:06:05 AM FETCH_AUDIO_REQUEST {
  "audioId": "audio-1751785565738-avc1o9hdk",
  "textLength": 66,
  "voiceId": "DtQqHh17jNwDFfxCdvGD"
}

🎵 [SpeakText] 9:06:06 AM FETCH_COMPLETE {
  "audioId": "audio-1751785565738-avc1o9hdk",
  "responseTime": 234
}

🎵 [SpeakText] 9:06:06 AM PLAY_SUCCESS {
  "audioId": "audio-1751785565738-avc1o9hdk"
}
```

### 4. Playback Progress Tracking
```
🎵 [SpeakText] 9:06:06 AM PROGRESS {
  "audioId": "audio-1751785565738-avc1o9hdk",
  "progress": "10%",
  "currentTime": 0.5,
  "duration": 5
}

🎵 [SpeakText] 9:06:06 AM PROGRESS {
  "audioId": "audio-1751785565738-avc1o9hdk",
  "progress": "50%",
  "currentTime": 2.5,
  "duration": 5
}

🎵 [SpeakText] 9:06:06 AM ENDED {
  "audioId": "audio-1751785565738-avc1o9hdk",
  "totalDuration": 5000,
  "audioDuration": 5
}
```

### 5. Auto-Run Coordination
```
🎮 [GameContext/Audio] 9:06:10 AM AUTO_RUN_CHECK {
  "autoRun": true,
  "autoRunSpeed": 5000,
  "currentPhase": "Day",
  "hasHumanPlayer": true,
  "pendingHumanAction": false,
  "isGameOver": false
}

🎮 [GameContext/Audio] 9:06:10 AM AUTO_RUN_SCHEDULING {
  "delayMs": 5000,
  "phase": "Day",
  "round": 1,
  "alivePlayers": 5,
  "activeAudioCount": 0
}
```

### 6. Performance Metrics
```
🎵 [SpeakText] 9:06:12 AM AUDIO_METRICS_SUMMARY {
  "fetchCount": 4,
  "avgFetchTime": "245.50ms",
  "duplicateFetchRate": "0.0%",
  "playSuccessRate": "100.0%",
  "totalPlays": 4,
  "manualPlayRate": "0.0%",
  "autoPlayRate": "100.0%",
  "completionRate": "100.0%",
  "skipRate": "0.0%",
  "avgListenTime": "4.8s"
}
```

## Key Features

### Voice Decision Logic
- Tracks why each message is voiced or skipped
- Considers message visibility, sender, and recipient
- Prioritizes moderator/system messages
- Skips human player's own messages

### Audio State Management  
- Monitors global audio enable/disable state
- Tracks currently speaking audio ID
- Manages audio queue and permissions
- Coordinates with game auto-run feature

### Performance Monitoring
- Fetch times and cache hit rates
- Playback success/failure rates  
- User behavior (manual vs auto play)
- Completion rates and skip patterns

### Error Handling
- Detailed error logging with context
- Retry logic for network failures
- Graceful degradation on audio failures
- Browser compatibility checks

## Usage

The logging is automatically enabled when running the game in development mode. Key events to watch for:

1. **VOICE_DECISION_RESULT** - Shows which messages will be voiced
2. **FETCH_AUDIO_REQUEST** - Audio generation started
3. **PLAY_SUCCESS/PLAY_FAILED** - Audio playback status
4. **AUTO_RUN_SCHEDULING** - Game progression timing
5. **AUDIO_METRICS_SUMMARY** - Performance overview

This comprehensive logging helps debug audio issues, optimize performance, and ensure smooth voice integration in the game. 