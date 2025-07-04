'use client'; // Ensure this is a client component

import { useGameContext } from '@/context/GameContext';
import { MessageBubble } from './MessageBubble';
import { useTranslation } from 'react-i18next';
import {
  useRef,
  useEffect,
  useCallback,
  useLayoutEffect,
  useMemo,
  memo,
} from 'react';
import type {
  ClientMessage,
  FilteredPlayer,
  PlayerId,
} from '@/lib/interfaces/gameState.types';
import { RoleName } from '@/lib/engine/interfaces/IRole'; // Fix RoleName import path
import { MessageVisibility } from '@/lib/engine/interfaces/IMessage';

// Memoized message component to prevent unnecessary re-renders
const MemoizedMessage = memo(function MemoizedMessage({
  message,
  index,
  isLastMessage,
  lastMessageRef,
  players,
  isWerewolfChat,
}: {
  message: ClientMessage;
  index: number;
  isLastMessage: boolean;
  lastMessageRef: React.RefObject<HTMLDivElement | null>;
  players: Record<PlayerId, FilteredPlayer>;
  isWerewolfChat: boolean;
}) {
  return (
    <div key={message.id || index} ref={isLastMessage ? lastMessageRef : undefined}>
      <MessageBubble message={message} players={players} isWerewolfChat={isWerewolfChat} />
    </div>
  );
});

export function ConversationLog() {
  const { gameState } = useGameContext();
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevPendingActionRef = useRef<unknown>(null);
  const prevLogLengthRef = useRef<number>(0);

  const { t } = useTranslation('translation'); // Keep namespace for now

  // Memoize the visibility check function
  const isMessageVisible = useCallback(
    (msg: ClientMessage, humanPlayerId: string | null | undefined, humanPlayer: FilteredPlayer | null, isObserver: boolean): boolean => {
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

    return log.filter((msg) => isMessageVisible(msg, humanPlayerId ?? null, humanPlayer, isObserver));
  }, [gameState?.log, gameState?.players, gameState?.humanPlayerId, isMessageVisible]);

  // Memoized scroll function
  const scrollToBottom = useCallback(() => {
    if (lastMessageRef.current && displayLogMemo.length > 0) {
      lastMessageRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [displayLogMemo.length]);

  // Only scroll when new messages are added
  useEffect(() => {
    if (displayLogMemo.length > prevLogLengthRef.current) {
      scrollToBottom();
      prevLogLengthRef.current = displayLogMemo.length;
    }
  }, [displayLogMemo.length, scrollToBottom]);

  // Scroll effect for pending action changes
  useEffect(() => {
    if (!gameState) return;

    const pendingActionString = JSON.stringify(gameState.pendingHumanAction);
    if (prevPendingActionRef.current !== pendingActionString) {
      setTimeout(scrollToBottom, 100);
      prevPendingActionRef.current = pendingActionString;
    }
  }, [gameState?.pendingHumanAction, scrollToBottom]);

  // Layout effect for resize observer
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const parentNode = containerRef.current.parentElement;
    if (!parentNode) return;
    
    const resizeObserver = new ResizeObserver(() => {
      setTimeout(scrollToBottom, 50);
    });
    
    resizeObserver.observe(containerRef.current);
    resizeObserver.observe(parentNode);
    
    return () => {
      resizeObserver.disconnect();
    };
  }, [scrollToBottom]);

  if (!gameState) {
    return <div>{t('LoadingLog', 'Loading conversation...')}</div>;
  }

  // Get players record after the gameState check
  const playersRecord: Record<PlayerId, FilteredPlayer> = gameState.players;

  return (
    <div
      ref={containerRef}
      className="flex-grow bg-background p-4 overflow-y-auto"
    >
      <div className="space-y-4">
        {displayLogMemo.length > 0 ? (
          displayLogMemo.map((message, index) => (
            <MemoizedMessage
              key={message.id}
              message={message}
              index={index}
              isLastMessage={index === displayLogMemo.length - 1}
              lastMessageRef={lastMessageRef}
              players={playersRecord}
              isWerewolfChat={message.visibility === MessageVisibility.Mafia}
            />
          ))
        ) : (
          <p className="text-muted-foreground italic text-center py-4">
            {t('EmptyConversationLog')}
          </p>
        )}
      </div>
    </div>
  );
}
