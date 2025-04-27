"use client";

import { ConversationLog } from "@/components/ConversationLog";
import { GameHeader } from "@/components/GameHeader";
import { GameSidebar } from "@/components/GameSidebar";
import HumanChatInput from "@/components/HumanChatInput";
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

function GameLayout() {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  const direction = i18n.dir(lang);
  
  const { gameState } = useGameContext();
  const humanPlayerId = gameState?.humanPlayerId;

  return (
    <div
      className="grid grid-cols-[280px_1fr] h-screen"
      dir={direction}
    >
      <GameSidebar />
      <main className="grid grid-rows-[auto_1fr_auto] h-screen overflow-hidden">
        <GameHeader />
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
        <GameLayout />
      </GameProvider>
    </SpokenTextProvider>
  );
}
