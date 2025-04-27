'use client'; // Ensure this is a client component

import { useGameContext } from "@/context/GameContext";
import { MessageBubble } from "./MessageBubble";
import { useTranslation } from "react-i18next"; 
import { useRef, useEffect, useCallback, useLayoutEffect } from "react"; // Add useLayoutEffect
import type { ClientMessage, FilteredPlayer } from "@/lib/interfaces/client.types"; // NEW IMPORT
import type { PlayerId } from "@/lib/engine/interfaces/IPlayer"; // Import PlayerId
import type { IMessage } from "@/lib/engine/interfaces/IMessage"; // Import IMessage for type checking

export function ConversationLog() {
  const { gameState } = useGameContext(); // Only get gameState
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevPendingActionRef = useRef<unknown>(null);

  // Use standard hook, assuming context/provider is set up elsewhere
  const { t } = useTranslation('translation'); // Keep namespace for now

  if (!gameState) return null; // Handle loading/null state
  // Destructure necessary parts including _internalState and humanPlayerId
  const { conversationLog, players, pendingHumanAction, humanPlayerId, phase } = gameState; 

  const regularLog = conversationLog || [];
  // Assuming werewolf chat is not part of FilteredGameState for now
  // const werewolfLog = _internalState?.werewolfChatLog || []; 
  const werewolfLog: ClientMessage[] = []; // Placeholder

  const humanPlayer = humanPlayerId ? players[humanPlayerId] : null;
  const isHumanWerewolf = humanPlayer?.role === "Mafia"; // Check against RoleName.Mafia might be safer
  const canSeeWerewolfChat = !humanPlayerId || isHumanWerewolf; // Observer or Werewolf

  let displayLog: ClientMessage[] = []; // Start empty

  if (canSeeWerewolfChat && phase === "Night") {
    // Werewolf/Observer during Night: Show WW chat + Night-specific moderator messages
    const markedWerewolfLog = werewolfLog.map(msg => ({ ...msg, isWerewolfChat: true }));
    // Filter regular log for moderator messages specifically marked for the Night phase
    const nightModeratorMessages = regularLog.filter(
      (msg): msg is ClientMessage => msg.phase === 'Night' && msg.senderId === null // Assuming moderator is null senderId
    );
    displayLog = [...nightModeratorMessages, ...markedWerewolfLog];

  } else if (canSeeWerewolfChat) {
    // Werewolf/Observer during Day/Voting/etc.: Show combined public + WW chat
    const markedWerewolfLog = werewolfLog.map(msg => ({ ...msg, isWerewolfChat: true }));
    displayLog = [...regularLog, ...markedWerewolfLog]; // Combine all

  } else {
    // Non-Werewolf: Show only public messages
    displayLog = [...regularLog];
  }

  // Always sort the final display log by timestamp
  displayLog.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

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
              key={message.id}
              ref={index === displayLog.length - 1 ? lastMessageRef : undefined}
            >
              <MessageBubble
                message={message}
                players={players as Record<PlayerId, FilteredPlayer>}
                // Pass the marker prop to MessageBubble
                isWerewolfChat={(message as ClientMessage & { isWerewolfChat?: boolean }).isWerewolfChat ?? false} 
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
