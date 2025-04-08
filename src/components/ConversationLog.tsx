import { MessageBubble } from "@/components/MessageBubble";
import { FilteredGameState, ChatMessage } from "@/lib/types/game";

interface ConversationLogProps {
    conversationLog: readonly (Omit<ChatMessage, 'audience'> & { speakerName: string })[];
    players: FilteredGameState['players'];
}

export function ConversationLog({ conversationLog, players }: ConversationLogProps) {
    // Get the ID of the most recent message
    const latestMessageId = conversationLog.length > 0 ? conversationLog[0].messageId : null;
    // Note: Since the log is reversed in the flex container, the first item is the newest

    return (
        <section className="flex-grow p-4 overflow-hidden flex flex-col">
            {/* Outer container enables scrolling */}
            <div className="flex-grow overflow-y-auto bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg shadow-inner">
                {/* Inner container reverses flex order */} 
                <div className="flex flex-col-reverse gap-3">
                    {conversationLog.length > 0 ? (
                        conversationLog.map((message) => (
                            <MessageBubble 
                                key={message.messageId} 
                                message={message} 
                                players={players} 
                                latestMessageId={latestMessageId} // Pass latest message ID
                            />
                        ))
                    ) : (
                        <p className="text-gray-500 dark:text-gray-400 italic text-center py-4">The conversation log is empty.</p>
                    )}
                </div>
            </div>
        </section>
    );
} 