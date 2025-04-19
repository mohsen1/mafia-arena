"use client";

import { ConversationLog } from "@/components/ConversationLog";
import { GameHeader } from "@/components/GameHeader";
import { GameSidebar } from "@/components/GameSidebar";
import { GameProvider, useGameContext } from "@/context/GameContext";
import { SpokenTextProvider } from "@/context/SpokenTextContext";
import type { FilteredGameState } from "@/lib/types/game";
import { useTranslation } from 'react-i18next';

interface GameClientProps {
  initialGameState: FilteredGameState;
  gameId: string;
  boundRunGameTurnAction: () => Promise<void>;
}

function GameLayout() {
  const { gameState } = useGameContext();
  const { t, i18n } = useTranslation();

  if (!gameState) {
    return <div>{t("LoadingGameState", "Loading game state...")}</div>;
  }

  const lang = i18n.language;
  const direction = i18n.dir(lang);

  return (
    <div
      className="grid grid-cols-[280px_1fr] h-screen"
      dir={direction}
    >
      <GameSidebar />
      <main className="flex flex-col h-screen overflow-hidden">
        <GameHeader />
        <ConversationLog />
      </main>
    </div>
  );
}

export default function GameClient({
  initialGameState,
  boundRunGameTurnAction,
}: GameClientProps) {
  return (
    <SpokenTextProvider>
      <GameProvider
        initialGameState={initialGameState}
        boundRunGameTurnAction={boundRunGameTurnAction}
      >
        <GameLayout />
      </GameProvider>
    </SpokenTextProvider>
  );
}
