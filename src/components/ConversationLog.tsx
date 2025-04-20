'use client'; // Ensure this is a client component

import { useGameContext } from "@/context/GameContext";
import { MessageBubble } from "./MessageBubble";
import { useTranslation } from "react-i18next"; 
import { useRef, useEffect, useCallback, useLayoutEffect } from "react"; // Add useLayoutEffect

export function ConversationLog() {
  const { gameState } = useGameContext(); // Only get gameState
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevPendingActionRef = useRef<unknown>(null);

  // Use standard hook, assuming context/provider is set up elsewhere
  const { t } = useTranslation('translation'); // Keep namespace for now

  if (!gameState) return null; // Handle loading/null state
  const { conversationLog, players, pendingHumanAction } = gameState; // Add pendingHumanAction to track voting changes

  const displayLog = conversationLog || [];
  
  // Function to scroll last message into view, memoized with useCallback
  const scrollToBottom = useCallback(() => {
    if (lastMessageRef.current && displayLog.length > 0) {
      lastMessageRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [displayLog.length]);
  
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
        {displayLog.length > 0 ? (
          displayLog.map((message, index) => (
            // Apply ref to the last message
            <div 
              key={message.messageId}
              ref={index === displayLog.length - 1 ? lastMessageRef : undefined}
            >
              <MessageBubble
                message={message}
                players={players}
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
