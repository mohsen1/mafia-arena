# Voice Integration Plan for Werewolf AI Game

## Overview

This document outlines the comprehensive plan for integrating voice functionality into the Werewolf AI game, including Text-to-Speech (TTS) using ElevenLabs and Speech-to-Text (STT) using the browser's Web Speech API.

## Features

### 1. Text-to-Speech (TTS)
- **Automatic voice playback** for all game messages
- **Word-level highlighting** as messages are spoken
- **Unique voice assignment** for each player
- **Voice customization** options
- **Queue management** for sequential playback

### 2. Speech-to-Text (STT)
- **Microphone input** for human players
- **Push-to-talk** mode
- **Real-time transcription** display
- **Error handling** for permissions and recognition failures

### 3. Voice Mode Settings
- **Optional voice mode** toggle when starting a game
- **Per-game voice settings** persistence
- **Audio controls** in the game UI

## Architecture

### Component Structure

```
src/
├── components/
│   ├── SpeakText.tsx          # Enhanced with word-level highlighting
│   ├── SpeechInput.tsx        # New: Microphone input component
│   ├── MessageBubble.tsx      # Enhanced: Integrates SpeakText
│   ├── HumanChatInput.tsx     # Enhanced: Adds microphone button
│   └── VoiceSettings.tsx      # New: Voice configuration UI
├── hooks/
│   ├── useVoiceManager.ts     # New: Voice assignment and management
│   └── useGameConfig.ts       # Enhanced: Voice mode state
├── context/
│   ├── SpokenTextContext.tsx  # Existing: Audio queue management
│   └── GameContext.tsx        # Enhanced: Voice mode state
├── lib/
│   ├── services/
│   │   ├── voiceManager.ts    # New: Voice assignment logic
│   │   └── elevenlabsService.ts # Existing: ElevenLabs integration
│   └── interfaces/
│       └── voice.types.ts     # New: Voice-related types
└── app/
    └── api/
        └── speak/
            └── route.ts       # Enhanced: Word timestamps support
```

## Implementation Details

### 1. Voice Assignment System

```typescript
interface VoiceAssignment {
  playerId: string;
  voiceId: string;
  voiceName: string;
  voiceSettings?: {
    stability: number;
    similarity: number;
    style?: number;
  };
}

class VoiceManager {
  private assignments: Map<string, VoiceAssignment>;
  private availableVoices: ElevenLabsVoice[];
  
  assignVoiceToPlayer(playerId: string): VoiceAssignment;
  getVoiceForPlayer(playerId: string): string;
  updateVoiceSettings(playerId: string, settings: VoiceSettings): void;
}
```

### 2. Enhanced Message Display

Each message in the game will automatically be spoken when voice mode is enabled:

```typescript
<MessageBubble message={message}>
  {voiceModeEnabled ? (
    <SpeakText 
      voiceId={getVoiceForPlayer(message.senderId)}
      autoQueue={true}
      wordHighlighting={true}
    >
      {message.content}
    </SpeakText>
  ) : (
    <span>{message.content}</span>
  )}
</MessageBubble>
```

### 3. Speech Input Integration

Human players can use their microphone to input messages:

```typescript
<HumanChatInput>
  <Input value={message} onChange={handleChange} />
  {voiceModeEnabled && (
    <Button onClick={toggleMicrophone}>
      <Mic />
    </Button>
  )}
  <SpeechInput 
    onTranscript={setMessage}
    mode="push-to-talk"
  />
</HumanChatInput>
```

### 4. Word-Level Highlighting

The SpeakText component now supports word-level highlighting:

```typescript
const processTimestamps = (alignment: Alignment) => {
  // Group characters into words
  const words = groupCharactersIntoWords(alignment);
  
  // Create word spans with timing data
  return words.map((word, index) => (
    <span 
      key={index}
      data-start={word.start}
      data-end={word.end}
      className={currentTime >= word.start && currentTime < word.end ? 'highlight' : ''}
    >
      {word.text}
    </span>
  ));
};
```

## API Enhancements

### ElevenLabs Integration

The `/api/speak` endpoint now supports word-level timestamps:

```typescript
POST /api/speak
{
  text: string;
  voiceId: string;
  with_timestamps: true;
  voice_settings?: {
    stability: number;
    similarity: number;
  };
}

Response:
{
  audio_base64: string;
  alignment: {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  };
}
```

## Voice Configuration

### Available Voices

The system will use a curated list of ElevenLabs voices with diverse characteristics:

1. **Narrator Voice** - Deep, authoritative voice for system messages
2. **Player Voices** - Diverse set of voices varying by:
   - Gender (male/female)
   - Age (young/old)
   - Accent (various English accents)
   - Personality (warm, cold, mysterious, friendly)

### Voice Assignment Algorithm

```typescript
function assignVoices(players: Player[]): Map<string, VoiceAssignment> {
  const assignments = new Map();
  const availableVoices = [...VOICE_POOL];
  
  // Prioritize role-appropriate voices
  players.forEach(player => {
    const voice = selectVoiceForRole(player.role, availableVoices);
    assignments.set(player.id, voice);
    removeFromAvailable(voice, availableVoices);
  });
  
  return assignments;
}
```

## User Experience

### Game Setup

1. **Voice Mode Toggle** - Optional checkbox in game setup
2. **Voice Preview** - Test voices before starting
3. **Microphone Permission** - Request on first use

### During Gameplay

1. **Auto-play Messages** - Messages spoken automatically in order
2. **Playback Controls** - Pause/resume/skip buttons
3. **Volume Control** - Global and per-voice volume
4. **Speech Input** - Microphone button with visual feedback

### Accessibility

1. **Visual Indicators** - Show who's speaking
2. **Subtitles** - Always show text alongside speech
3. **Keyboard Shortcuts** - Control playback without mouse

## Performance Considerations

### Audio Caching

```typescript
class AudioCache {
  private cache: Map<string, ArrayBuffer>;
  
  async getAudio(text: string, voiceId: string): Promise<ArrayBuffer> {
    const key = `${voiceId}:${hashText(text)}`;
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }
    
    const audio = await fetchFromElevenLabs(text, voiceId);
    this.cache.set(key, audio);
    return audio;
  }
}
```

### Queue Management

- Prioritize current speaker's messages
- Cancel outdated messages
- Batch similar messages

## Security & Privacy

### API Key Management

- Server-side API calls only
- Rate limiting per user
- Usage tracking

### Microphone Access

- Explicit permission request
- Clear privacy policy
- No audio recording/storage

## Testing Strategy

### Unit Tests

1. Voice assignment logic
2. Timestamp processing
3. Queue management
4. Speech recognition handling

### Integration Tests

1. End-to-end voice playback
2. Microphone input flow
3. Multi-player voice coordination

### E2E Tests

1. Full game with voice enabled
2. Voice mode toggle behavior
3. Error scenarios

## Rollout Plan

### Phase 1: Core Implementation (Week 1-2)
- [x] Voice mode toggle in game setup
- [x] Basic TTS integration
- [x] Word-level highlighting
- [x] Speech input component

### Phase 2: Enhancement (Week 3)
- [ ] Voice assignment algorithm
- [ ] Voice customization UI
- [ ] Audio caching system
- [ ] Advanced queue management

### Phase 3: Polish (Week 4)
- [ ] Performance optimization
- [ ] Accessibility features
- [ ] Voice catalog expansion
- [ ] User preferences persistence

### Phase 4: Testing & Launch
- [ ] Comprehensive testing
- [ ] Bug fixes
- [ ] Documentation
- [ ] Feature flag rollout

## Future Enhancements

1. **Custom Voice Training** - Let users create their own voice
2. **Multi-language Support** - Voices in different languages
3. **Emotion Detection** - Adjust voice based on message sentiment
4. **Voice Effects** - Special effects for dramatic moments
5. **3D Audio** - Spatial audio for player positions
6. **Voice Commands** - Control game with voice
7. **Real-time Voice Chat** - Live voice during discussions

## Setup Instructions

### 1. Configure ElevenLabs API Key

To enable voice functionality, you need to set up your ElevenLabs API key:

1. Sign up for an ElevenLabs account at [elevenlabs.io](https://elevenlabs.io)
2. Get your API key from the ElevenLabs dashboard
3. Add it to your environment variables:
   ```bash
   ELEVENLABS_API_KEY="your-elevenlabs-api-key"
   ```

### 2. Enable Voice Mode

When starting a new game, check the "Enable voice mode" checkbox in the game setup form.

### 3. Voice Controls

- **Audio Toggle**: Use the speaker icon in the game header to mute/unmute voice
- **Microphone Input**: Click the microphone icon in the chat input to use speech-to-text
- **Word Highlighting**: Words are highlighted as they are spoken

## Testing Voice Functionality

1. Navigate to `/voice-test` to test the voice system
2. Click "Test Voice Messages" to hear sample messages
3. Check browser console for any errors

## Troubleshooting

- **No sound**: Ensure ElevenLabs API key is configured
- **Microphone not working**: Check browser permissions
- **Voice not enabled**: Make sure "Enable voice mode" was checked when starting the game

## Conclusion

This voice integration will significantly enhance the immersion and accessibility of the Werewolf AI game. By combining high-quality TTS with intuitive STT, players can enjoy a more natural and engaging gameplay experience. 