import { useGameContext } from "@/context/GameContext";
import { MessageBubble } from "./MessageBubble";
// Remove ScrollArea import if causing issues
// import { ScrollArea } from "@/components/ui/scroll-area";

export function ConversationLog() {
  // Get gameState and t function
  const { gameState, t } = useGameContext();

  if (!gameState) return null; // Handle loading/null state
  const { conversationLog, players } = gameState;

  // Reverse log for display (oldest first)
  const displayLog = conversationLog?.slice().reverse() || [];

  return (
    // Revert to simple div with overflow for scrolling
    <div className="flex-grow bg-background p-4 overflow-y-auto">
      <div className="space-y-4">
        {displayLog.length > 0 ? (
          displayLog.map((message) => (
            // Pass players map for name lookup if needed inside MessageBubble
            <MessageBubble
              key={message.messageId}
              message={message}
              players={players}
            />
          ))
        ) : (
          // Use t() for empty message
          <p className="text-muted-foreground italic text-center py-4">
            {t("EmptyConversationLog", "The conversation log is empty.")}
          </p>
        )}
      </div>
    </div>
  );
}
