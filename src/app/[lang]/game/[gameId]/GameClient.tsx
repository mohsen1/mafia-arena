'use client';

import { GameSidebar } from '@/components/GameSidebar';
import { GameTabsLayout } from '@/components/GameTabsLayout';
import CharacterGenerationUI from '@/components/CharacterGenerationUI';
import { GameErrorDisplay } from '@/components/GameErrorDisplay';
import { KeyboardShortcutsDialog } from '@/components/KeyboardShortcutsDialog';
import { GameThemeInfoDialog } from '@/components/GameThemeInfoDialog';

import { GameReplay } from '@/components/GameReplay';
import SpectatorMode from '@/components/SpectatorMode';
import { ServerHeader } from '@/components/ServerHeader';
import { GameProvider, useGameContext } from '@/context/GameContext';
import { SpokenTextProvider } from '@/context/SpokenTextContext';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';
import type { HumanActionPayload } from '@/lib/interfaces/actions.types';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import type { LanguageCode } from '@/lib/i18n/settings';
import { Menu, User, LogOut, Gamepad2, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { GameNotificationCenter } from '@/components/GameNotificationCenter';
import { AudioDebugOverlay } from '@/components/AudioDebugOverlay';
import Link from 'next/link';
import Image from 'next/image';
import { useSession, signOut } from 'next-auth/react';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

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
  const { i18n, t } = useTranslation();
  const direction = i18n.dir(lang);
  const { data: session } = useSession();

  const { gameState, error, clearError, runNextTurn } = useGameContext();
  const humanPlayerId = gameState?.humanPlayerId;
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Enable keyboard shortcuts
  useKeyboardShortcuts();

  // Show character generation UI if game is in CharacterGeneration phase
  if (gameState?.phase === 'CharacterGeneration') {
    return (
      <CharacterGenerationUI
        gameId={gameId}
        onComplete={(newGameState) => {
          // Character generation complete - the component should handle
          // updating the game state through server actions and then
          // refresh or redirect to reload the updated game state
          console.log('Character generation complete', newGameState);
          // Force a page refresh to reload the game with new state
          window.location.reload();
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
          <ServerHeader currentLang={lang} />
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
          {/* Unified Header */}
          <div className="flex-shrink-0 z-50 border-b bg-background/95 backdrop-blur">
            <div className="flex items-center h-16 px-4">
              {/* Left side: Menu button first, then Logo */}
              <div className="flex items-center gap-3">
                {/* Sidebar toggle button - moved to left of logo */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                >
                  <Menu className="h-4 w-4" />
                </Button>

                {/* Logo - Navigate to home */}
                <Link
                  href={`/${lang}`}
                  className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                >
                  <Image
                    src="/images/logo.png"
                    alt="Werewolf AI Logo"
                    width={32}
                    height={32}
                    className="w-8 h-8 object-contain"
                  />
                  <span className="text-lg font-bold">Werewolf AI</span>
                </Link>
              </div>

              {/* Center: Game info with theme */}
              {gameState && (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <h1 className="text-sm font-semibold">
                        {gameState.title || t('WerewolfAITitle')}
                      </h1>
                      {/* Theme info with clickable icon */}
                      {gameState.themeKey && (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">
                            {gameState.themeKey}
                          </span>
                          <GameThemeInfoDialog
                            themeKey={gameState.themeKey}
                            description={gameState.description}
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        {t('RoundLabel')}:{' '}
                        <span className="font-medium">{gameState.round}</span>
                      </span>
                      <span>•</span>
                      <span className="font-medium capitalize">
                        {t(gameState.phase, { defaultValue: gameState.phase })}
                      </span>
                      {gameState.winCondition && (
                        <>
                          <span>•</span>
                          <span className="text-success font-medium">
                            {t(
                              `Outcome${gameState.winCondition.replace(/\s/g, '')}`,
                              {
                                defaultValue: gameState.winCondition,
                              }
                            )}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Right side: User menu and notifications */}
              <div className="flex items-center gap-2">
                {gameState && (
                  <GameNotificationCenter
                    gameState={gameState}
                    className="h-8 w-8"
                  />
                )}
                <ThemeToggle />
                {session && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex items-center space-x-2"
                      >
                        {session.user?.image ? (
                          <Image
                            src={session.user.image}
                            alt={session.user.name || 'User'}
                            width={24}
                            height={24}
                            className="w-6 h-6 rounded-full"
                            unoptimized
                          />
                        ) : (
                          <User className="w-4 h-4" />
                        )}
                        <span className="hidden sm:inline">
                          {session.user?.name || session.user?.email || 'User'}
                        </span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem asChild>
                        <Link
                          href={`/${lang}/profile`}
                          className="flex items-center"
                        >
                          <User className="w-4 h-4 me-2" />
                          {t('common.profile')}
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link
                          href={`/${lang}/games`}
                          className="flex items-center"
                        >
                          <Gamepad2 className="w-4 h-4 me-2" />
                          {t('common.myGames')}
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link
                          href={`/${lang}/help`}
                          className="flex items-center"
                        >
                          <HelpCircle className="w-4 h-4 me-2" />
                          {t('common.help')}
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => signOut({ callbackUrl: `/${lang}` })}
                        className="flex items-center"
                      >
                        <LogOut className="w-4 h-4 me-2" />
                        {t('common.signOut')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          </div>

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
              <GameTabsLayout humanPlayerId={humanPlayerId} />
            </main>
          </div>
        </div>
      ) : (
        // AI-only spectator view
        <div className="min-h-screen bg-background" dir={direction}>
          <ServerHeader currentLang={lang} />
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
