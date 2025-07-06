'use client';

import { ConversationLog } from '@/components/ConversationLog';
import { GameSidebar } from '@/components/GameSidebar';
import HumanChatInput from '@/components/HumanChatInput';
import CharacterGenerationUI from '@/components/CharacterGenerationUI';
import { GameErrorDisplay } from '@/components/GameErrorDisplay';
import { KeyboardShortcutsDialog } from '@/components/KeyboardShortcutsDialog';

import { GameReplay } from '@/components/GameReplay';
import SpectatorMode from '@/components/SpectatorMode';
import { GameAnalyticsTabs } from '@/components/GameAnalyticsTabs';
import { Header } from '@/components/Header';
import { GameProvider, useGameContext } from '@/context/GameContext';
import { SpokenTextProvider } from '@/context/SpokenTextContext';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';
import type { HumanActionPayload } from '@/lib/interfaces/actions.types';
import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import type { LanguageCode } from '@/lib/i18n/settings';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { GameHeader } from '@/components/GameHeader';
import { GameNotificationCenter } from '@/components/GameNotificationCenter';
import { AudioDebugOverlay } from '@/components/AudioDebugOverlay';

interface GameClientProps {
  initialGameState: FilteredGameState;
  gameId: string;
  lang: string;
  boundAdvanceGameStateAction: () => Promise<
    FilteredGameState | { error: string }
  >;
  boundSubmitHumanAction: (
    payload: HumanActionPayload
  ) => Promise<FilteredGameState | { error: string }>;
}

function GameLayout({ gameId, lang }: { gameId: string; lang: LanguageCode }) {
  const { i18n } = useTranslation();
  const direction = i18n.dir(lang);

  const {
    gameState,
    setGameState,
    error,
    clearError,
    runNextTurn,
    isAudioGloballyEnabled,
  } = useGameContext();
  const humanPlayerId = gameState?.humanPlayerId;
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Track phase changes for notifications
  const [previousPhase, setPreviousPhase] = useState(gameState?.phase);
  const [showPhaseNotification, setShowPhaseNotification] = useState(false);

  // Enable keyboard shortcuts
  useKeyboardShortcuts();

  useEffect(() => {
    if (gameState?.phase && gameState.phase !== previousPhase) {
      setPreviousPhase(gameState.phase);
      setShowPhaseNotification(true);
      // Reset the notification trigger after a brief delay
      setTimeout(() => setShowPhaseNotification(false), 100);
    }
  }, [gameState?.phase, previousPhase]);

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

  // Show game replay UI if game is completed
  if (gameState?.phase === 'GameOver') {
    return (
      <>
        <div className="min-h-screen bg-background" dir={direction}>
          <Header currentLang={lang} />
          <div className="container mx-auto p-4">
            <GameReplay gameState={gameState} />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Keyboard shortcuts dialog */}
      <KeyboardShortcutsDialog />

      {humanPlayerId ? (
        // Human player view
        <div className="h-screen bg-background flex flex-col" dir={direction}>
          <div className="flex-shrink-0 z-50 border-b">
            <Header currentLang={lang} />
          </div>
          {/* Game Header - Full Width */}
          {gameState && (
            <div className="flex-shrink-0 border-b bg-background/95 backdrop-blur">
              <div className="flex items-center px-3 py-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                >
                  <Menu className="h-4 w-4" />
                </Button>
                <div className="flex-1">
                  <GameHeader />
                </div>
                <GameNotificationCenter
                  gameState={gameState}
                  className="h-8 w-8"
                />
              </div>
            </div>
          )}
          <div className="flex-1 flex min-h-0">
            <div
              className={cn(
                'transition-all duration-300 overflow-hidden',
                sidebarOpen ? 'w-[280px]' : 'w-0'
              )}
            >
              {sidebarOpen && <GameSidebar />}
            </div>
            <main className="flex-1 flex flex-col h-full min-h-0">
              {error && (
                <div className="p-4 bg-destructive/10 border-b border-destructive/20">
                  <GameErrorDisplay
                    error={error}
                    onRetry={() => {
                      clearError();
                      runNextTurn();
                    }}
                  />
                </div>
              )}
              <div className="flex-1 flex flex-col min-h-0">
                <ConversationLog />
                <div className="p-3 border-t bg-background/50 backdrop-blur flex-shrink-0">
                  {/* Game Analytics in Tabs */}
                  {gameState && (
                    <GameAnalyticsTabs
                      gameState={gameState}
                      humanPlayerId={humanPlayerId}
                    />
                  )}
                </div>
              </div>
              <div className="border-t bg-foreground/5 dark:bg-background/50 backdrop-blur">
                <HumanChatInput />
              </div>
            </main>
          </div>
        </div>
      ) : (
        // AI-only spectator view
        <div className="min-h-screen bg-background" dir={direction}>
          <Header currentLang={lang} />
          <div className="h-[calc(100vh-4rem)] overflow-hidden p-2">
            {error && (
              <div className="mb-2">
                <GameErrorDisplay
                  error={error}
                  onRetry={() => {
                    clearError();
                    runNextTurn();
                  }}
                />
              </div>
            )}
            {gameState && (
              <SpectatorMode
                gameState={gameState}
                messages={gameState.log}
                className="h-full"
              />
            )}
          </div>
        </div>
      )}

      {/* Audio Debug Overlay - visible in both human and spectator views */}
      <AudioDebugOverlay />
    </>
  );
}

export default function GameClient({
  initialGameState,
  gameId,
  lang,
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
        <GameLayout gameId={gameId} lang={lang as LanguageCode} />
      </GameProvider>
    </SpokenTextProvider>
  );
}
