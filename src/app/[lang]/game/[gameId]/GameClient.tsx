'use client';

import { ConversationLog } from '@/components/ConversationLog';
import { GameSidebar } from '@/components/GameSidebar';
import HumanChatInput from '@/components/HumanChatInput';
import CharacterGenerationUI from '@/components/CharacterGenerationUI';
import { AutoSaveIndicator } from '@/components/AutoSaveIndicator';
import { GameErrorDisplay } from '@/components/GameErrorDisplay';
import { PhaseTransitionNotification } from '@/components/PhaseTransitionNotification';
import { KeyboardShortcutsDialog } from '@/components/KeyboardShortcutsDialog';
import { GameHistory } from '@/components/GameHistory';
import { VotingPanel } from '@/components/VotingPanel';
import { RoleRevealAnimation } from '@/components/RoleRevealAnimation';
import { GameReplay } from '@/components/GameReplay';
import { GameProvider, useGameContext } from '@/context/GameContext';
import { SpokenTextProvider } from '@/context/SpokenTextContext';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';
import type { HumanActionPayload } from '@/lib/interfaces/actions.types';
import type { AgentMemory } from '@/lib/engine/interfaces/AgentMemory';
import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';

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

function GameLayout({ gameId }: { gameId: string }) {
  const { i18n, t } = useTranslation();
  const lang = i18n.language;
  const direction = i18n.dir(lang);

  const {
    gameState,
    setGameState,
    isSaving,
    lastSaved,
    error,
    clearError,
    runNextTurn,
  } = useGameContext();
  const humanPlayerId = gameState?.humanPlayerId;

  // Track phase changes for notifications
  const [previousPhase, setPreviousPhase] = useState(gameState?.phase);
  const [showPhaseNotification, setShowPhaseNotification] = useState(false);
  const [roleReveal, setRoleReveal] = useState<{
    playerName: string;
    role: string;
    isEvil: boolean;
    reason: 'voted' | 'killed';
  } | null>(null);

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

  // Track eliminated players to show role reveals
  const [revealedPlayers, setRevealedPlayers] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    if (!gameState) return;

    // Check for newly eliminated players
    Object.values(gameState.players).forEach((player) => {
      if (player.status === 'Dead' && !revealedPlayers.has(player.id)) {
        // Find elimination reason from recent messages
        const recentMessages = gameState.log.slice(-10);
        const isVoted = recentMessages.some((msg) =>
          msg.content.includes(`${player.name} was executed`)
        );

        if (player.role) {
          setRoleReveal({
            playerName: player.name,
            role: player.role,
            isEvil: player.role === 'Mafia',
            reason: isVoted ? 'voted' : 'killed',
          });
          setRevealedPlayers((prev) => new Set([...prev, player.id]));
        }
      }
    });
  }, [gameState, revealedPlayers]);

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
        {/* Phase transition notification */}
        {gameState && (
          <PhaseTransitionNotification
            phase={gameState.phase}
            round={gameState.round}
            show={showPhaseNotification}
          />
        )}

        {/* Role reveal animation */}
        {roleReveal && (
          <RoleRevealAnimation
            playerName={roleReveal.playerName}
            role={roleReveal.role}
            isEvil={roleReveal.isEvil}
            reason={roleReveal.reason}
            onComplete={() => setRoleReveal(null)}
          />
        )}

        <div className="min-h-screen bg-background" dir={direction}>
          <div className="container mx-auto p-4">
            <GameReplay gameState={gameState} />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Phase transition notification */}
      {gameState && (
        <PhaseTransitionNotification
          phase={gameState.phase}
          round={gameState.round}
          show={showPhaseNotification}
        />
      )}

      {/* Role reveal animation */}
      {roleReveal && (
        <RoleRevealAnimation
          playerName={roleReveal.playerName}
          role={roleReveal.role}
          isEvil={roleReveal.isEvil}
          reason={roleReveal.reason}
          onComplete={() => setRoleReveal(null)}
        />
      )}

      {/* Keyboard shortcuts dialog */}
      <KeyboardShortcutsDialog />

      <div className="grid grid-cols-[280px_1fr] h-screen" dir={direction}>
        <GameSidebar />
        <main className="grid grid-rows-[1fr_auto] h-screen overflow-hidden">
          <div className="overflow-y-auto">
            {error && (
              <div className="p-4">
                <GameErrorDisplay
                  error={error}
                  onRetry={() => {
                    clearError();
                    runNextTurn();
                  }}
                />
              </div>
            )}
            <ConversationLog />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
              {/* Voting Panel */}
              {gameState && gameState.phase === 'Day' && (
                <VotingPanel gameState={gameState} />
              )}
              {/* Game History */}
              {gameState && 'memory' in gameState && (
                <GameHistory
                  gameState={
                    gameState as FilteredGameState & { memory: AgentMemory }
                  }
                  className={gameState.phase !== 'Day' ? 'lg:col-span-2' : ''}
                />
              )}
            </div>
          </div>
          {humanPlayerId && <HumanChatInput />}
          {!humanPlayerId && (
            <div className="p-4 border-t bg-secondary/20">
              <div className="flex items-center justify-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 bg-primary rounded-full animate-pulse" />
                  <span className="text-sm font-medium text-foreground">
                    {t('ObservingGame', 'Observing the game...')}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {gameState?.phase && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-secondary rounded-md">
                      AI Auto Mode • {gameState.phase}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-center text-xs text-muted-foreground mt-2">
                {gameState?.phase === 'Day' ? (
                  <div className="space-y-1">
                    <div>
                      {t(
                        'AutoModeDescriptionDay',
                        'AI agents are discussing and voting strategically'
                      )}
                    </div>
                    <div className="text-xs opacity-75">
                      💭 Analyzing suspicions • 🗳️ Making elimination decisions
                    </div>
                  </div>
                ) : gameState?.phase === 'Night' ? (
                  <div className="space-y-1">
                    <div>
                      {t(
                        'AutoModeDescriptionNight',
                        'AI agents are using their special abilities'
                      )}
                    </div>
                    <div className="text-xs opacity-75">
                      🎯 Mafia targeting • 🛡️ Doctor protecting • 🔍 Seer
                      investigating
                    </div>
                  </div>
                ) : (
                  <div>
                    {t(
                      'AutoModeDescription',
                      'AI agents are making decisions automatically'
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
        <AutoSaveIndicator isSaving={isSaving} lastSaved={lastSaved} />
      </div>
    </>
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
