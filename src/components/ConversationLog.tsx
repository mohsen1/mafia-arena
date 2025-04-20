'use client'; // Ensure this is a client component

import { useGameContext } from "@/context/GameContext";
import { MessageBubble } from "./MessageBubble";
// Import from react-i18next
import { useTranslation } from "react-i18next"; 
// Remove Loader2 and other imports not needed anymore
// import { Loader2 } from "lucide-react";
// import Image from "next/image";
// import { cn } from "@/lib/utils";

export function ConversationLog() {
  const { gameState } = useGameContext(); // Only get gameState

  // Use standard hook, assuming context/provider is set up elsewhere
  const { t } = useTranslation('translation'); // Keep namespace for now

  if (!gameState) return null; // Handle loading/null state
  const { conversationLog, players } = gameState; // Remove isWaitingForVotes


  const displayLog = conversationLog || [];

  return (
    <div className="flex-grow bg-background p-4 overflow-y-auto"> 
      <div className="space-y-4"> {/* Removed padding-top */}
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
            {t("EmptyConversationLog")}
          </p>
        )}
      </div>
    </div>
  );
}
