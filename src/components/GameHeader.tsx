import NextButton from "@/components/NextButton";
import { FilteredGameState } from "@/lib/types/game";

interface GameHeaderProps {
    title: string;
    description?: string;
    phase: FilteredGameState['phase'];
    round: number;
    winner?: string;
    onRunTurn: () => void;
}

export function GameHeader({ title, description, phase, round, winner, onRunTurn }: GameHeaderProps) {
    return (
        <header className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow flex justify-between items-center flex-shrink-0 gap-4">
            {/* Game Info Group */}    
            <div className="flex-grow">
                <h1 className="text-2xl font-bold mb-1 truncate">{title || "Werewolf Game"}</h1>
                {description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1 italic">{description}</p>
                )}
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    Round: <span className="font-semibold">{round}</span> | <span className="font-semibold capitalize">{phase}</span>
                </p>
                {/* Winner Status */}
                <div className="mt-1">
                    {winner && (
                        <span className="text-lg font-bold text-green-600 dark:text-green-400">{winner} won!</span>
                    )}
                    {phase === 'GameOver' && !winner && (
                        <span className="text-lg font-bold text-red-600 dark:text-red-400">Game Over</span>
                    )}
                </div>
            </div>
            {/* Action Button Form */}
            {phase !== 'GameOver' && (
                <form action={onRunTurn} className="flex-shrink-0">
                    <NextButton />
                </form>
            )}
        </header>
    );
} 