'use client'; // Ensure this is a client component

import { useGameContext } from '@/context/GameContext';
import { MessageBubble } from './MessageBubble';
import { useTranslation } from 'react-i18next';
import { useRef, useEffect, useCallback, useMemo, memo } from 'react';
import type {
  ClientMessage,
  FilteredPlayer,
  PlayerId,
} from '@/lib/interfaces/gameState.types';
import { RoleName } from '@/lib/engine/interfaces/IRole'; // Fix RoleName import path
import { MessageVisibility } from '@/lib/engine/interfaces/IMessage';
import { useVirtualizer } from '@tanstack/react-virtual';

// Memoized message component to prevent unnecessary re-renders
const MemoizedMessage = memo(function MemoizedMessage({
  message,
  players,
  isWerewolfChat,
}: {
  message: ClientMessage;
  players: Record<PlayerId, FilteredPlayer>;
  isWerewolfChat: boolean;
}) {
  return (
    <MessageBubble
      message={message}
      players={players}
      isWerewolfChat={isWerewolfChat}
    />
  );
});

export function ConversationLog() {
  const { gameState } = useGameContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const prevLogLengthRef = useRef<number>(0);
  const autoScrollRef = useRef<boolean>(true);

  const { t } = useTranslation('translation'); // Keep namespace for now

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

    return log.filter((msg) =>
      isMessageVisible(msg, humanPlayerId ?? null, humanPlayer, isObserver)
    );
  }, [gameState, isMessageVisible]);

  // Initialize virtualizer
  const virtualizer = useVirtualizer({
    count: displayLogMemo.length,
    getScrollElement: () => containerRef.current,
    estimateSize: useCallback(() => 120, []), // Estimated height of each message
    overscan: 5, // Number of items to render outside of the visible area
    scrollPaddingEnd: 20,
  });

  const items = virtualizer.getVirtualItems();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (
      displayLogMemo.length > prevLogLengthRef.current &&
      autoScrollRef.current
    ) {
      virtualizer.scrollToIndex(displayLogMemo.length - 1, {
        align: 'end',
        behavior: 'smooth',
      });
      prevLogLengthRef.current = displayLogMemo.length;
    }
  }, [displayLogMemo.length, virtualizer]);

  // Handle scroll to detect if user is at bottom
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    autoScrollRef.current = isAtBottom;
  }, []);

  // Scroll to bottom when pending action changes
  useEffect(() => {
    if (!gameState) return;

    const pendingActionString = JSON.stringify(gameState.pendingHumanAction);
    if (autoScrollRef.current && pendingActionString) {
      setTimeout(() => {
        virtualizer.scrollToIndex(displayLogMemo.length - 1, {
          align: 'end',
          behavior: 'smooth',
        });
      }, 100);
    }
  }, [gameState, virtualizer, displayLogMemo.length]);

  if (!gameState) {
    return <div>{t('LoadingLog', 'Loading conversation...')}</div>;
  }

  // Get players record after the gameState check
  const playersRecord: Record<PlayerId, FilteredPlayer> = gameState.players;

  return (
    <div
      ref={containerRef}
      className="flex-grow bg-background px-4 py-2 overflow-y-auto"
      onScroll={handleScroll}
    >
      {displayLogMemo.length > 0 ? (
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: '100%',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${items[0]?.start ?? 0}px)`,
            }}
          >
            {items.map((virtualRow) => {
              const message = displayLogMemo[virtualRow.index];
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className="pb-2"
                >
                  <MemoizedMessage
                    message={message}
                    players={playersRecord}
                    isWerewolfChat={
                      message.visibility === MessageVisibility.Mafia
                    }
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground italic text-center py-4">
          {t('EmptyConversationLog')}
        </p>
      )}
    </div>
  );
}
