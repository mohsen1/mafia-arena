import { MessageBubble } from "@/components/MessageBubble";
import { FilteredGameState, ChatMessage } from "@/lib/types/game";

interface ConversationLogProps {
    conversationLog: readonly (Omit<ChatMessage, 'audience'> & { speakerName: string })[];
    players: FilteredGameState['players'];
}

export function ConversationLog({ conversationLog, players }: ConversationLogProps) {
    // No need to determine latest message for autoplay
    // const latestMessageId = conversationLog.length > 0 ? conversationLog[0].messageId : null;

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
                                // latestMessageId={latestMessageId} // Removed prop
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