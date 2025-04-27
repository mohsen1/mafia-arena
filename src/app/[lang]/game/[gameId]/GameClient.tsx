"use client";

import { ConversationLog } from "@/components/ConversationLog";
import { GameHeader } from "@/components/GameHeader";
import { GameSidebar } from "@/components/GameSidebar";
import HumanChatInput from "@/components/HumanChatInput";
import { GameProvider, useGameContext } from "@/context/GameContext";
import { SpokenTextProvider } from "@/context/SpokenTextContext";
import type { FilteredGameState } from "@/lib/interfaces/client.types";
import { useTranslation } from 'react-i18next';

// Define the payload type based on the server action
type HumanActionPayload =
  | { type: "message"; content: string }
  | { type: "vote"; targetPlayerId: string | null }
  | { type: "mafiaKill"; targetPlayerId: string }
  | { type: "doctorSave"; targetPlayerId: string | null }
  | { type: "seerInvestigate"; targetPlayerId: string | null };

interface GameClientProps {
  initialGameState: FilteredGameState;
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
      <main className="grid grid-rows-[1fr_auto] h-screen overflow-hidden">
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
