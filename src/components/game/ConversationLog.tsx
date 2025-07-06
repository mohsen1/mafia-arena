'use client'; // Ensure this is a client component

import { useGameContext } from '@/context/GameContext';
import { MessageBubble } from '@/components/game/MessageBubble';
import { useTranslation } from 'react-i18next';
import { useRef, useEffect, useCallback, useMemo } from 'react';
import type {
  ClientMessage,
  FilteredPlayer,
  PlayerId,
} from '@/lib/interfaces/gameState.types';
import { RoleName } from '@/lib/engine/interfaces/IRole'; // Fix RoleName import path
import { MessageVisibility } from '@/lib/engine/interfaces/IMessage';

export function ConversationLog() {
  const { gameState } = useGameContext();
  const containerRef = useRef<HTMLDivElement>(null);
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

  if (!gameState) {
    return <div>{t('LoadingLog', 'Loading conversation...')}</div>;
  }

  // Get players record after the gameState check
  const playersRecord: Record<PlayerId, FilteredPlayer> = gameState.players;

  return (
    <div
      ref={containerRef}
      className="flex-1 bg-muted/5 px-4 py-4 overflow-y-auto scroll-smooth"
      onScroll={handleScroll}
    >
      {displayLogMemo.length > 0 ? (
        <div className="space-y-3">
          {displayLogMemo.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              players={playersRecord}
              isWerewolfChat={message.visibility === MessageVisibility.Mafia}
            />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground italic text-center py-8">
          {t('EmptyConversationLog', 'The conversation will appear here...')}
        </p>
      )}
    </div>
  );
}
