# Groq Character Generation Debugging Guide

## Issue
Character generation is failing in production for all AI players when using Groq, with the error:
"Character generation failed for: Seer, Mafia 1, Mafia 2, Doctor, Villager 1, Villager 2, Villager 3, Villager 4"

## Debugging Enhancements Added

### 1. Character Generation Action Logging (`src/app/actions/character-generation.actions.ts`)
- Added `[CharacterGen]` prefix to all log messages for easy filtering
- Log game ID, user ID, and phase information
- Log all AI players' configurations (agent type, provider, model)
- Check and log available API keys (without exposing values)
- Detailed error logging with stack traces
- Log each successful persona and image generation

### 2. Game Engine Logging (`src/lib/engine/core/Game.ts`)
- Added `[Game.ensurePersonasGenerated]` prefix to all logs
- Log theme and language being used
- Log each player's agent type and configuration
- Detailed retry logging with attempt numbers
- Better error categorization (AUTH_ERROR, RATE_LIMIT, TIMEOUT, etc.)
- Log wait times between retries

### 3. OpenAI Agent Logging (`src/lib/engine/agents/OpenAIAgent.ts`)
- Added `[OpenAIAgent.generatePersona]` prefix
- Log model, endpoint, and whether it's Groq
- Log API call duration
- Log raw response and parsed persona
- Detailed error logging with specific error types

### 4. Agent Factory Logging (`src/lib/agentFactory.ts`)
- Added `[agentFactory]` prefix
- Log agent creation details (type, provider, model)
- Log API key availability (environment vs user-provided)
- Log final configuration before agent creation

## How to Test in Production

### 1. Via Web UI
1. Go to https://werewolf-ai.vercel.app
2. Sign in with your account
3. Click "Play Now" or go to /en/new
4. Select "Custom Game" 
5. Configure all players to use Groq with model "gemma2-9b-it" or "llama-3.1-8b-instant"
6. Click "Generate & Start Game"
7. Open browser console (F12) to see client-side logs
8. Watch for character generation progress

### 2. Check Vercel Logs
```bash
# View recent logs
vercel logs

# Follow logs in real-time
vercel logs --follow

# Filter for character generation logs
vercel logs --follow | grep -E "\[CharacterGen\]|\[Game\.ensurePersonasGenerated\]|\[OpenAIAgent\.generatePersona\]|\[agentFactory\]"
```

### 3. What to Look For

#### Success Case
```
[CharacterGen] Starting character generation for game abc-123
[CharacterGen] Found 5 AI players to generate personas for
[CharacterGen] Available API keys: GROQ_API_KEY
[agentFactory] Creating agent for player-1, type: Groq, provider: groq, model: gemma2-9b-it
[agentFactory] Using environment API key for groq from GROQ_API_KEY
[OpenAIAgent.generatePersona] Using Groq API with model: gemma2-9b-it
[OpenAIAgent.generatePersona] API call completed in 523ms
[OpenAIAgent.generatePersona] Success! Generated persona: Thomas Baker
```

#### Common Failure Cases

1. **Missing API Key**
```
[agentFactory] No API key found for groq - expected in GROQ_API_KEY
[OpenAIAgent.generatePersona] Authentication error - check API key
```

2. **Invalid Model**
```
[OpenAIAgent.generatePersona] Error message: model 'invalid-model' not found
[OpenAIAgent.generatePersona] Model error - model may not be available
```

3. **Rate Limiting**
```
[OpenAIAgent.generatePersona] Error message: 429 Too Many Requests
[OpenAIAgent.generatePersona] Rate limit error
```

## Environment Variables Required

Make sure these are set in Vercel:
- `GROQ_API_KEY` - Your Groq API key from https://console.groq.com/keys
- `NEXTAUTH_URL` - Should be https://werewolf-ai.vercel.app
- `NEXTAUTH_SECRET` - Your NextAuth secret

## Testing Locally

```bash
# Set environment variable
export GROQ_API_KEY="your-groq-api-key"

# Run the basic Groq test
pnpm tsx scripts/test-groq-basic.ts

# Check Groq connection
pnpm tsx scripts/check-groq.ts
```

## Next Steps

1. Deploy these changes to production
2. Monitor Vercel logs during character generation
3. Check for specific error messages
4. Verify GROQ_API_KEY is properly set in Vercel environment variables
5. Test with different Groq models if one fails 