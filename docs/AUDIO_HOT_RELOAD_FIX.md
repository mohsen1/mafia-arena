# Audio Hot Reload Fix

## Problem
After hot reload (React Fast Refresh) during development, all messages in the conversation log would replay their audio, creating a "wall of sound" effect. This happened because the `initialMessageCount` state was reset to `null` on hot reload.

## Root Cause
- The `ConversationLog` component tracks `initialMessageCount` to determine which messages are "new" (added after initial load)
- Only new messages should autoplay their audio
- React's state gets reset during hot reload, causing all messages to be treated as "new"

## Solution
Used `sessionStorage` to persist the initial message count across hot reloads:

1. **Storage Key**: Created a unique key per game: `werewolf-initial-message-count-${gameId}`
2. **Initialize from Storage**: Check sessionStorage when initializing state
3. **Store on Set**: Save to sessionStorage when setting initial count
4. **Cleanup**: Remove old game counts when switching games

### Key Changes in `ConversationLog.tsx`:

```typescript
// Create storage key based on gameId
const storageKey = useMemo(
  () => `werewolf-initial-message-count-${gameState?.id || 'unknown'}`,
  [gameState?.id]
);

// Initialize from sessionStorage
const [initialMessageCount, setInitialMessageCount] = useState<number | null>(
  () => {
    if (typeof window === 'undefined') return null;
    const stored = sessionStorage.getItem(storageKey);
    return stored ? parseInt(stored, 10) : null;
  }
);

// Store when setting count
sessionStorage.setItem(storageKey, count.toString());

// Cleanup old counts when switching games
useEffect(() => {
  const currentGameId = gameState?.id;
  if (currentGameId && typeof window !== 'undefined') {
    const keys = Object.keys(sessionStorage);
    keys.forEach(key => {
      if (key.startsWith('werewolf-initial-message-count-') && !key.endsWith(currentGameId)) {
        sessionStorage.removeItem(key);
      }
    });
  }
}, [gameState?.id]);
```

## Benefits
- Audio no longer replays after hot reload
- Count persists during development but resets on page refresh
- Each game maintains its own count independently
- No interference between different games

## Testing
1. Load a game with existing messages
2. Make a code change that triggers hot reload
3. Verify that existing messages don't replay audio
4. New messages should still autoplay normally 