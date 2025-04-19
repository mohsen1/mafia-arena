import { useGameContext } from "@/context/GameContext";
import { MessageBubble } from "./MessageBubble";
// Remove Loader2 and other imports not needed anymore
// import { Loader2 } from "lucide-react";
// import Image from "next/image";
// import { cn } from "@/lib/utils";

export function ConversationLog() {
  // Get gameState and t function
  const { gameState, t } = useGameContext();

  if (!gameState) return null; // Handle loading/null state
  const { conversationLog, players } = gameState; // Remove isWaitingForVotes

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
          // No need to check isWaitingForVotes anymore
          <p className="text-muted-foreground italic text-center py-4">
            {t("EmptyConversationLog", "The conversation log is empty.")}
          </p>
        )}

        {/* Remove the entire Waiting Indicator Block */}
      </div>
    </div>
  );
}
