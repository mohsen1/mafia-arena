'use client'; // Ensure this is a client component

import { useGameContext } from "@/context/GameContext";
import { MessageBubble } from "./MessageBubble";
import { useTranslation } from "react-i18next"; 
import { useRef, useEffect, useCallback, useLayoutEffect, useMemo } from "react"; // Add useLayoutEffect and useMemo
import type { ClientMessage, FilteredGameState, FilteredPlayer, PlayerId } from "@/lib/interfaces/gameState.types"; // NEW IMPORT
import type { IMessage } from "@/lib/engine/interfaces/IMessage"; // Import IMessage for type checking
import { RoleName } from "@/lib/engine/interfaces/IRole"; // Fix RoleName import path
import { MessageVisibility } from "@/lib/engine/interfaces/IMessage";

export function ConversationLog() {
  const { gameState } = useGameContext();
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevPendingActionRef = useRef<unknown>(null);

  const { t } = useTranslation('translation'); // Keep namespace for now

  if (!gameState) {
    return <div>{t('LoadingLog', 'Loading conversation...')}</div>; 
  }

  const { log, players, pendingHumanAction, humanPlayerId, phase } = gameState;

  const playersRecord: Record<PlayerId, FilteredPlayer> = players;
  const humanPlayer = humanPlayerId ? playersRecord[humanPlayerId] : null;

  const filteredLog = useMemo(() => {
    const isVisible = (msg: ClientMessage): boolean => {
      // Show messages with public visibility
      if (msg.visibility === MessageVisibility.Public) return true;
      // Show messages without explicit visibility (assume public)
      if (msg.visibility === undefined) return true; 

      // During Night, apply role-based visibility
      if (phase === 'Night') {
          // Show messages visible to mafia if player is mafia
          if (humanPlayer?.role === RoleName.Mafia && msg.visibility === MessageVisibility.Mafia) return true;
          // Show messages sent by the human player (e.g., private confirmations)
          if (msg.senderId === humanPlayerId) return true;
      } else {
          // During Day/Other phases, potentially show Mafia messages if player is Mafia?
          // Adjust this rule as needed. For now, assume Mafia chat is only visible at night.
          // if (humanPlayer?.role === RoleName.Mafia && msg.visibility === MessageVisibility.Mafia) return true;
      }

      // Hide other messages (private, or mafia messages for non-mafia)
      return false;
    };

    // Filter the log based on visibility rules
    return log.filter(isVisible);

  }, [log, phase, humanPlayerId, humanPlayer?.role]);

  const isHumanWerewolf = humanPlayer?.role === RoleName.Mafia; // Use RoleName enum
  const canSeeWerewolfChat = !humanPlayerId || isHumanWerewolf; // Observer or Werewolf

  // Simplify displayLog logic - use filteredLog directly
  // The isVisible function should already handle mafia/public visibility
  // We might need to add back werewolf chat specific logic if it's stored separately
  let displayLog = filteredLog; 

  // Memoize the final display log (reversed for display)
  const displayLogMemo = useMemo(() => {
      return displayLog.slice().reverse(); // Reverse for display order (latest at bottom)
  }, [displayLog]);

  // Function to scroll last message into view, memoized with useCallback
  const scrollToBottom = useCallback(() => {
    if (lastMessageRef.current && displayLogMemo.length > 0) {
      lastMessageRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [displayLogMemo.length]);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);
  
  // Use a separate effect to detect changes in pendingHumanAction
  useEffect(() => {
    // If pendingHumanAction has changed
    if (JSON.stringify(prevPendingActionRef.current) !== JSON.stringify(pendingHumanAction)) {
      setTimeout(scrollToBottom, 100); // Add small delay to ensure DOM is updated
      prevPendingActionRef.current = pendingHumanAction;
    }
  }, [scrollToBottom, pendingHumanAction]);
  
  // Use MutationObserver to detect DOM changes in parent container
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    
    // Create a MutationObserver to watch for changes to the parent container's layout
    const parentNode = containerRef.current.parentElement;
    if (!parentNode) return;
    
    const resizeObserver = new ResizeObserver(() => {
      setTimeout(scrollToBottom, 50); // Small delay to ensure layout is complete
    });
    
    // Observe both our container and its parent
    resizeObserver.observe(containerRef.current);
    resizeObserver.observe(parentNode);
    
    return () => {
      resizeObserver.disconnect();
    };
  }, [scrollToBottom]);

  return (
    <div ref={containerRef} className="flex-grow bg-background p-4 overflow-y-auto"> 
      <div className="space-y-4"> {/* Removed padding-top */}
        {displayLogMemo.length > 0 ? (
          displayLogMemo.map((message, index) => (
            // Apply ref to the last message
            <div 
              key={message.timestamp}
              ref={index === displayLogMemo.length - 1 ? lastMessageRef : undefined}
            >
              <MessageBubble
                message={message}
                players={playersRecord}
                isWerewolfChat={message.visibility === MessageVisibility.Mafia} 
              />
            </div>
          ))
        ) : (
          // No need to check isWaitingForVotes anymore
          <p className="text-muted-foreground italic text-center py-4">
            {t("EmptyConversationLog")}
          </p>
        )}
      </div>
    </div>
  );
}
