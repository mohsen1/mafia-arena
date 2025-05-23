'use client'; // Ensure this is a client component

import { useGameContext } from "@/context/GameContext";
import { MessageBubble } from "./MessageBubble";
import { useTranslation } from "react-i18next"; 
import { useRef, useEffect, useCallback, useLayoutEffect, useMemo } from "react";
import type { ClientMessage, FilteredPlayer, PlayerId } from "@/lib/interfaces/gameState.types";
import { RoleName } from "@/lib/engine/interfaces/IRole"; // Fix RoleName import path
import { MessageVisibility } from "@/lib/engine/interfaces/IMessage";

export function ConversationLog() {
  const { gameState } = useGameContext();
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevPendingActionRef = useRef<unknown>(null);

  const { t } = useTranslation('translation'); // Keep namespace for now

  // Filter log based on visibility
  const filteredLog = useMemo(() => {
    if (!gameState) return []; // Return empty if gameState is null
    
    const { log = [], players, phase, humanPlayerId } = gameState;
    const playersRecord: Record<PlayerId, FilteredPlayer> = players;
    const humanPlayer = humanPlayerId ? playersRecord[humanPlayerId] : null;
    const isObserver = !humanPlayerId;

    const isVisible = (msg: ClientMessage): boolean => {
      if (msg.visibility === MessageVisibility.Public) return true;
      if (msg.visibility === undefined) return true;
      if (msg.visibility === MessageVisibility.Mafia) {
        // Observers can see mafia chat, or if human player is mafia
        return isObserver || humanPlayer?.role === RoleName.Mafia;
      }
      if (msg.senderId === humanPlayerId) return true;
      return false;
    };
    
    return log.filter(isVisible);
  }, [gameState]); // Keep dependency on full gameState to avoid linter issues

  // Memoize the reversed display log
  const displayLogMemo = useMemo(() => {
      return filteredLog.slice().reverse();
  }, [filteredLog]);

  // Memoized scroll function
  const scrollToBottom = useCallback(() => {
    if (lastMessageRef.current && displayLogMemo.length > 0) {
      lastMessageRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [displayLogMemo.length]);

  // Scroll effect based on scroll function
  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  // Scroll effect for pending action changes
  useEffect(() => {
    if (!gameState) return; // Need gameState here too
    
    if (JSON.stringify(prevPendingActionRef.current) !== JSON.stringify(gameState.pendingHumanAction)) {
      setTimeout(scrollToBottom, 100);
      prevPendingActionRef.current = gameState.pendingHumanAction;
    }
  }, [scrollToBottom, gameState]); // Keep dependency on full gameState

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
    <div ref={containerRef} className="flex-grow bg-background p-4 overflow-y-auto"> 
      <div className="space-y-4">
        {displayLogMemo.length > 0 ? (
          displayLogMemo.map((message, index) => (
            // Apply ref to the first item in displayLogMemo (latest chronological message)
            <div 
              key={message.id}
              ref={index === 0 ? lastMessageRef : undefined}
            >
              <MessageBubble
                message={message}
                players={playersRecord}
                isWerewolfChat={message.visibility === MessageVisibility.Mafia} 
              />
            </div>
          ))
        ) : (
          <p className="text-muted-foreground italic text-center py-4">
            {t("EmptyConversationLog")}
          </p>
        )}
      </div>
    </div>
  );
}
