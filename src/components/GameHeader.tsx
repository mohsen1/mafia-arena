import GameController from "@/components/GameController";
import { useGameContext } from "@/context/GameContext"; // Import context hook

export function GameHeader() { // Remove props
    // Get gameState AND t function from context
    const { gameState, t, isTranslationLoading } = useGameContext();

    if (!gameState) return null; // Or a loading state

    // Destructure winCondition instead of winner
    const { title, description, phase, round, winCondition } = gameState;

    // Display generic loading if translations are loading
    if (isTranslationLoading) {
        // Minimal loading state, adjust as needed
        return <header className="p-4 border-b h-[97px] animate-pulse" />; // Self-closing tag
    }

    return (
        <header className="p-4 flex justify-between items-center flex-shrink-0 gap-4">
            {/* Game Info Group */}
            <div className="flex-grow">
                {/* Use appropriate key for the game title if it comes from dictionary */}
                <h1 className="text-2xl font-bold mb-1 truncate">{title || t('WerewolfAITitle', "Werewolf Game")}</h1>
                {description && (
                    <p className="text-sm text-muted-foreground mb-1 italic">{description}</p>
                )}
                <p className="text-sm text-muted-foreground">
                    {/* Use t() for "Round" */}
                    {t('RoundLabel', 'Round')}: <span className="font-semibold">{round}</span> | <span className="font-semibold capitalize">{t(`GamePhase${phase}`, phase)}</span>
                </p>
                {/* Winner Status */}
                <div className="mt-1">
                    {winCondition && (
                        // Translate outcome? Maybe use keys like OutcomeVillagerWin
                        <span className="text-lg font-bold text-success">{t(`Outcome${winCondition.outcome.replace(/\s+/g, '')}`, winCondition.outcome)}</span>
                    )}
                    {phase === 'GameOver' && !winCondition && (
                        // Use t() for "Game Over"
                        <span className="text-lg font-bold text-destructive">{t('GameOverStatus', 'Game Over')}</span>
                    )}
                </div>
            </div>
            {/* Action Buttons */}
             {phase !== 'GameOver' && (
                 <GameController /> // Use the new controller
             )}
        </header>
    );
} 