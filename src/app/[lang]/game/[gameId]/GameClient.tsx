"use client";

import { ConversationLog } from "@/components/ConversationLog";
import { GameHeader } from "@/components/GameHeader";
import { GameSidebar } from "@/components/GameSidebar";
import HumanChatInput from "@/components/HumanChatInput";
import { GameProvider, useGameContext } from "@/context/GameContext";
import { SpokenTextProvider } from "@/context/SpokenTextContext";
import type { GameState } from "@/lib/types/game";
import { useTranslation } from 'react-i18next';

// Define the payload type based on the server action
type HumanActionPayload =
  | { type: "chat"; content: string }
  | { type: "vote"; targetPlayerId: string }
  | { type: "nightAction"; targetPlayerId: string };

interface GameClientProps {
  initialGameState: GameState;
  gameId: string;
  boundRunGameTurnAction: () => Promise<void>;
  boundSubmitHumanAction: (payload: HumanActionPayload) => Promise<void>;
}

function GameLayout() {
  const { 
    gameState, 
    submitHumanAction // Get the action from context
  } = useGameContext();
  const { t, i18n } = useTranslation();

  if (!gameState) {
    return <div>{t("LoadingGameState", "Loading game state...")}</div>;
  }

  const lang = i18n.language;
  const direction = i18n.dir(lang);
  const humanPlayerId = gameState.humanPlayerId;
  const isPlayerTurn = !!gameState.pendingHumanAction;

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
        {humanPlayerId && gameState && (
          <HumanChatInput 
            gameState={gameState}
            humanPlayerId={humanPlayerId} 
            isPlayerTurn={isPlayerTurn}
            onSubmitAction={submitHumanAction}
          />
        )}
        {!humanPlayerId && !gameState?.pendingHumanAction && (
          <div className="p-4 border-t text-center text-muted-foreground italic">
            {t("ObservingOnlyLabel", "You are observing the game.")}
          </div>
        )}
      </main>
    </div>
  );
}

export default function GameClient({
  initialGameState,
  boundRunGameTurnAction,
  boundSubmitHumanAction,
}: GameClientProps) {
  return (
    <SpokenTextProvider>
      <GameProvider
        initialGameState={initialGameState}
        boundRunGameTurnAction={boundRunGameTurnAction}
        boundSubmitHumanAction={boundSubmitHumanAction}
      >
        <GameLayout />
      </GameProvider>
    </SpokenTextProvider>
  );
}
