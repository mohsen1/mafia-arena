#!/usr/bin/env tsx

/**
 * Test script to demonstrate audio logging functionality
 * This simulates the audio system with comprehensive logging
 */

console.log('🎵 Audio Logging Test Script');
console.log('============================\n');

// Simulate audio context logging
const logAudio = (action: string, details: any) => {
  const timestamp = new Date().toLocaleTimeString();
  console.log(
    `%c🎵 [SpeakText] ${timestamp} ${action}`,
    'color: #9b59b6; font-weight: bold',
    JSON.stringify(details, null, 2)
  );
};

const logVoice = (action: string, details: any) => {
  const timestamp = new Date().toLocaleTimeString();
  console.log(
    `%c🗣️ [MessageBubble/Voice] ${timestamp} ${action}`,
    'color: #2ecc71; font-weight: bold',
    JSON.stringify(details, null, 2)
  );
};

const logGameAudio = (action: string, details: any) => {
  const timestamp = new Date().toLocaleTimeString();
  console.log(
    `%c🎮 [GameContext/Audio] ${timestamp} ${action}`,
    'color: #e74c3c; font-weight: bold',
    JSON.stringify(details, null, 2)
  );
};

// Simulate game start
console.log('\n1. GAME INITIALIZATION');
console.log('----------------------');

logGameAudio('AUDIO_STATE_CHANGED', {
  isAudioGloballyEnabled: true,
  currentGameState: 'CharacterGeneration',
  humanPlayerId: 'human-player-123'
});

// Simulate character generation messages
console.log('\n2. CHARACTER GENERATION PHASE');
console.log('-----------------------------');

const messages = [
  {
    id: 'msg-1',
    senderId: null,
    senderName: 'System',
    content: 'Welcome to Werewolf AI! Players are generating their characters...',
    visibility: 'Public',
    phase: 'CharacterGeneration'
  },
  {
    id: 'msg-2',
    senderId: 'ai-player-1',
    senderName: 'Sarah',
    content: "Hello everyone! I'm Sarah, a baker from the village. I wake up early every morning to prepare fresh bread.",
    visibility: 'Public',
    phase: 'CharacterGeneration'
  },
  {
    id: 'msg-3',
    senderId: 'ai-player-2',
    senderName: 'John',
    content: "Greetings! I'm John, the local blacksmith. Been working these forges for twenty years now.",
    visibility: 'Public',
    phase: 'CharacterGeneration'
  }
];

messages.forEach((message, index) => {
  console.log(`\nMessage ${index + 1}:`);
  
  // MessageBubble voice decision
  logVoice('VOICE_DECISION_START', {
    messageId: message.id,
    senderId: message.senderId,
    senderName: message.senderName,
    visibility: message.visibility,
    isModeratorMessage: message.senderId === null,
    textLength: message.content.length
  });

  const shouldSpeak = message.senderId !== 'human-player-123';
  logVoice('VOICE_DECISION_RESULT', {
    result: shouldSpeak,
    reason: message.senderId === null ? 'Moderator/System message' : 'AI player message',
    visibility: message.visibility
  });

  if (shouldSpeak) {
    // SpeakText component logs
    const audioId = `audio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    logAudio('COMPONENT_MOUNTED', {
      text: message.content.substring(0, 50) + '...',
      voiceId: 'DtQqHh17jNwDFfxCdvGD',
      autoPlay: true,
      isAudioGloballyEnabled: true
    });

    logAudio('AUTOPLAY_EFFECT', {
      autoPlay: true,
      isAudioGloballyEnabled: true,
      audioId: audioId,
      hasStarted: false
    });

    logAudio('HANDLE_SPEAK_CALLED', {
      audioId: audioId,
      isPlaying: false,
      isLoading: false,
      hasError: false,
      isAudioGloballyEnabled: true
    });

    logAudio('SPEAK_START', {
      text: message.content.substring(0, 50) + '...',
      voiceId: 'DtQqHh17jNwDFfxCdvGD'
    });

    // Simulate fetch
    logAudio('FETCH_AUDIO_REQUEST', {
      audioId: audioId,
      textLength: message.content.length,
      voiceId: 'DtQqHh17jNwDFfxCdvGD'
    });

    // Simulate audio events
    setTimeout(() => {
      logAudio('FETCH_COMPLETE', {
        audioId: audioId,
        responseTime: 234
      });

      logAudio('ATTEMPTING_PLAY', { audioId: audioId });
      logAudio('PLAY_SUCCESS', { audioId: audioId });
      
      logAudio('PLAYING', {
        audioId: audioId,
        currentTime: 0
      });

      // Progress updates
      [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].forEach((progress, i) => {
        setTimeout(() => {
          if (progress < 100) {
            logAudio('PROGRESS', {
              audioId: audioId,
              progress: `${progress}%`,
              currentTime: (i + 1) * 0.5,
              duration: 5.0
            });
          } else {
            logAudio('ENDED', {
              audioId: audioId,
              totalDuration: 5000,
              audioDuration: 5.0
            });
          }
        }, i * 100);
      });
    }, 300);
  }

  // Add delay between messages
  setTimeout(() => {}, index * 1500);
});

// Simulate day phase
setTimeout(() => {
  console.log('\n3. DAY PHASE');
  console.log('------------');

  logGameAudio('AUTO_RUN_CHECK', {
    autoRun: true,
    autoRunSpeed: 5000,
    currentPhase: 'Day',
    hasHumanPlayer: true,
    pendingHumanAction: false,
    isGameOver: false
  });

  const dayMessage = {
    id: 'msg-4',
    senderId: null,
    senderName: 'System',
    content: 'The sun rises on the village. Time to discuss who might be a werewolf!',
    visibility: 'Public',
    phase: 'Day'
  };

  logVoice('VOICE_DECISION_START', {
    messageId: dayMessage.id,
    isModeratorMessage: true,
    phase: 'Day'
  });

  logVoice('VOICE_DECISION_RESULT', {
    result: true,
    reason: 'Moderator/System message',
    priority: 'HIGH'
  });
}, 5000);

// Show audio metrics
setTimeout(() => {
  console.log('\n4. AUDIO METRICS SUMMARY');
  console.log('------------------------');

  logAudio('AUDIO_METRICS_SUMMARY', {
    fetchCount: 4,
    avgFetchTime: '245.50ms',
    duplicateFetchRate: '0.0%',
    playSuccessRate: '100.0%',
    totalPlays: 4,
    manualPlayRate: '0.0%',
    autoPlayRate: '100.0%',
    completionRate: '100.0%',
    skipRate: '0.0%',
    avgListenTime: '4.8s'
  });
}, 7000);

console.log('\n✅ Audio logging test completed!');
console.log('Check the console output above for detailed audio logging examples.\n'); 