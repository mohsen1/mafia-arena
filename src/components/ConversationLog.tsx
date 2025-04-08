import { MessageBubble } from "@/components/MessageBubble";
import { useGameContext } from "@/context/GameContext"; // Import context hook

export function ConversationLog() { // Remove props
    const { gameState } = useGameContext(); // Use context

    if (!gameState) return null;
    const { conversationLog, players } = gameState;

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