'use client'; // Ensure this is a client component

import { useGameContext } from '@/context/GameContext';
import { MessageBubble } from './MessageBubble';
import { useTranslation } from 'react-i18next';
import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import type {
  ClientMessage,
  FilteredPlayer,
  PlayerId, // Already typed in gameState.types
} from '@/lib/interfaces/gameState.types';
import { RoleName } from '@/lib/engine/interfaces/IRole'; // Fix RoleName import path
import { MessageVisibility } from '@/lib/engine/interfaces/IMessage';

// Enhanced logging helper
const LOG_PREFIX = '[ConversationLog]';
const timestamp = () => new Date().toLocaleTimeString();

const log = (emoji: string, action: string, details: any) => {
  console.log(
    `%c${LOG_PREFIX} ${timestamp()} ${emoji} ${action}:`,
    'color: #2ecc71; font-weight: bold',
    details
  );
};

export function ConversationLog() {
  const { gameState } = useGameContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef<boolean>(true);
  const { t } = useTranslation(); // Use the hook

  // Create a storage key based on gameId to isolate counts per game
  const storageKey = useMemo(
    () => `werewolf-initial-message-count-${gameState?.id || 'unknown'}`,
    [gameState?.id]
  );

  // Track the initial message count to determine which messages are "new"
  // Use sessionStorage to persist across hot reloads but reset on page refresh
  const [initialMessageCount, setInitialMessageCount] = useState<number | null>(
    () => {
      if (typeof window === 'undefined') return null;
      const stored = sessionStorage.getItem(storageKey);
      return stored ? parseInt(stored, 10) : null;
    }
  );

  // Memoize the visibility check function
  const isMessageVisible = useCallback(
    (
      msg: ClientMessage,
      humanPlayerId: string | null | undefined,
      humanPlayer: FilteredPlayer | null,
      isObserver: boolean
    ): boolean => {
      if (msg.visibility === MessageVisibility.Public) return true;
      if (msg.visibility === undefined) return true;
      if (msg.visibility === MessageVisibility.Mafia) {
        // Observers can see mafia chat, or if human player is mafia
        return isObserver || humanPlayer?.role === RoleName.Mafia;
      }
      if (msg.senderId === humanPlayerId) return true;
      return false;
    },
    []
  );

  // Filter log based on visibility with better memoization
  const displayLogMemo = useMemo(() => {
    if (!gameState) return [];

    const { log = [], players, humanPlayerId } = gameState;
    const playersRecord: Record<PlayerId, FilteredPlayer> = players;
    const humanPlayer = humanPlayerId ? playersRecord[humanPlayerId] : null;
    const isObserver = !humanPlayerId;

    return log.filter((msg: ClientMessage) =>
      isMessageVisible(msg, humanPlayerId ?? null, humanPlayer, isObserver)
    );
  }, [gameState, isMessageVisible]);

  // Set initial message count on first render with messages
  useEffect(() => {
    if (initialMessageCount === null && displayLogMemo.length > 0) {
      const count = displayLogMemo.length;
      console.log('[ConversationLog] Setting initial message count:', count);
      setInitialMessageCount(count);
      // Store in sessionStorage to persist across hot reloads
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(storageKey, count.toString());
      }
    }
  }, [initialMessageCount, displayLogMemo.length, storageKey]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (containerRef.current && autoScrollRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [displayLogMemo]);

  // Handle scroll to detect if user is at bottom
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    autoScrollRef.current = isAtBottom;
  }, []);

  // Clear stored count when game ID changes (switching games)
  useEffect(() => {
    // When game ID changes, clear any previous stored count
    const currentGameId = gameState?.id;
    if (currentGameId && typeof window !== 'undefined') {
      // Clear any other game's stored counts
      const keys = Object.keys(sessionStorage);
      keys.forEach((key) => {
        if (
          key.startsWith('werewolf-initial-message-count-') &&
          !key.endsWith(currentGameId)
        ) {
          sessionStorage.removeItem(key);
        }
      });
    }
  }, [gameState?.id]);

  if (!gameState) {
    return <div>{t('LoadingLog', 'Loading conversation...')}</div>;
  }

  // Get players record after the gameState check
  const playersRecord: Record<PlayerId, FilteredPlayer> = gameState.players;

  // Log render details
  log('🔄', 'RENDER', {
    totalMessages: gameState.log?.length || 0,
    initialMessageCount,
    groupedMessagesCount: displayLogMemo?.length || 0,
    voiceModeEnabled: gameState.voiceModeEnabled,
  });

  return (
    <div
      ref={containerRef}
      className="flex-1 bg-muted/5 px-4 py-4 overflow-y-auto scroll-smooth"
      onScroll={handleScroll}
    >
      {displayLogMemo.length > 0 ? (
        <div className="space-y-3">
          {displayLogMemo.map((message: ClientMessage, index: number) => {
            // Only autoPlay messages that were added after the initial load
            const shouldAutoPlay =
              initialMessageCount !== null && index >= initialMessageCount;

            // Log each message's auto-play decision
            log('🎤', 'MESSAGE RENDER', {
              messageId: message.id,
              sender: message.senderId,
              position: index,
              initialCount: initialMessageCount,
              isNewMessage: shouldAutoPlay,
              shouldAutoPlay,
              contentPreview: message.content.substring(0, 30) + '...',
            });

            return (
              <MessageBubble
                key={message.id}
                message={message}
                players={playersRecord}
                isWerewolfChat={message.visibility === MessageVisibility.Mafia}
                shouldAutoPlay={shouldAutoPlay}
              />
            );
          })}
        </div>
      ) : (
        <p className="text-muted-foreground italic text-center py-8">
          {t('EmptyConversationLog', 'The conversation will appear here...')}
        </p>
      )}
    </div>
  );
}
