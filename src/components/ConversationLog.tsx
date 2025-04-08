import { MessageBubble } from "@/components/MessageBubble";
import { useGameContext } from "@/context/GameContext"; 

export function ConversationLog() { 
    const { gameState } = useGameContext(); 

    if (!gameState) return null;
    const { conversationLog, players } = gameState;

    return (
        <section className="flex-grow overflow-hidden flex flex-col">
            {/* Outer container enables scrolling */}
            <div className="flex-grow overflow-y-auto p-3">
                {/* Inner container reverses flex order */}
                <div className="flex flex-col-reverse gap-3">
                    {conversationLog.length > 0 ? (
                        conversationLog.map((message) => (
                            <MessageBubble
                                key={message.messageId}
                                message={message}
                                players={players}
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