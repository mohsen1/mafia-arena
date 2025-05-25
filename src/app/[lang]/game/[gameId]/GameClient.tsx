"use client";

import { ConversationLog } from "@/components/ConversationLog";
import { GameSidebar } from "@/components/GameSidebar";
import HumanChatInput from "@/components/HumanChatInput";
import CharacterGenerationUI from "@/components/CharacterGenerationUI";
import { GameProvider, useGameContext } from "@/context/GameContext";
import { SpokenTextProvider } from "@/context/SpokenTextContext";
import type { FilteredGameState } from "@/lib/interfaces/gameState.types";
import type { HumanActionPayload } from "@/lib/interfaces/actions.types";
import { useTranslation } from 'react-i18next';

interface GameClientProps {
  initialGameState: FilteredGameState;
  gameId: string;
  lang: string;
  boundAdvanceGameStateAction: () => Promise<FilteredGameState | { error: string }>;
  boundSubmitHumanAction: (payload: HumanActionPayload) => Promise<FilteredGameState | { error: string }>;
}

function GameLayout({ gameId }: { gameId: string }) {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  const direction = i18n.dir(lang);
  
  const { gameState, setGameState } = useGameContext();
  const humanPlayerId = gameState?.humanPlayerId;

  // Show character generation UI if game is in CharacterGeneration phase
  if (gameState?.phase === 'CharacterGeneration') {
    return (
      <CharacterGenerationUI
        gameId={gameId}
        onComplete={(newGameState) => {
          setGameState(newGameState);
        }}
        onError={(error) => {
          console.error('Character generation error:', error);
          // Could show an error message or handle appropriately
        }}
      />
    );
  }

  return (
    <div
      className="grid grid-cols-[280px_1fr] h-screen"
      dir={direction}
    >
      <GameSidebar />
      <main className="grid grid-rows-[1fr_auto] h-screen overflow-hidden">
        <div className="overflow-y-auto">
          <ConversationLog />
        </div>
        {humanPlayerId && <HumanChatInput />}
        {!humanPlayerId && (
           <div className="p-4 border-t text-center text-muted-foreground italic">
             Observing the game...
           </div>
        )}
      </main>
    </div>
  );
}

export default function GameClient({
  initialGameState,
  gameId,
  boundAdvanceGameStateAction,
  boundSubmitHumanAction,
}: GameClientProps) {
  return (
    <SpokenTextProvider>
      <GameProvider
        initialGameState={initialGameState}
        boundRunGameTurnAction={boundAdvanceGameStateAction}
        boundSubmitHumanAction={boundSubmitHumanAction}
      >
        <GameLayout gameId={gameId} />
      </GameProvider>
    </SpokenTextProvider>
  );
}
