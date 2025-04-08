import Image from 'next/image';
import { FilteredGameState, ChatMessage } from "@/lib/types/game";

// Message Component with Dark Mode
export function MessageBubble({ message, players }: { message: Omit<ChatMessage, 'audience'> & { speakerName: string }, players: FilteredGameState['players'] }) {
    const speakerPlayer = message.speaker.type === 'player'
        ? players[message.speaker.playerId]
        : null;
    const isModerator = message.speaker.type === 'moderator';
    // Determine image URL: specific for moderator, player image, or null
    const imageUrl = isModerator 
        ? '/images/characters/mod.png' 
        : speakerPlayer?.imageUrl;

    return (
        <div className={`flex items-start gap-3 p-2 rounded-lg transition-colors duration-200 ${isModerator ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-300 text-sm italic' : 'bg-white dark:bg-gray-700'}`}>
            {/* Speaker Image */}
            <div className="flex-shrink-0 mt-1">
                {imageUrl ? (
                    <Image
                        src={imageUrl} // Use the determined imageUrl
                        alt={`Image of ${message.speakerName}`}
                        width={32}
                        height={32}
                        className="rounded-full object-cover border border-gray-300 dark:border-gray-600"
                    />
                ) : (
                    // Fallback Icon (Initials or Generic)
                    <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-gray-500 dark:text-gray-400 text-[10px] font-bold">
                        {message.speakerName?.substring(0, 1) || 'P'} 
                    </div>
                )}
            </div>
            {/* Message Content */}
            <div className="flex-grow">
                <span className={`font-semibold text-gray-900 dark:text-gray-50 ${isModerator ? 'text-blue-800 dark:text-blue-200' : ''}`}>{message.speakerName}: </span>
                <span className={`text-gray-800 dark:text-gray-200 ${isModerator ? 'text-blue-800 dark:text-blue-200' : ''}`}>{message.content}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 block text-right opacity-75">R{message.round} {message.phase}</span>
            </div>
        </div>
    );
} 