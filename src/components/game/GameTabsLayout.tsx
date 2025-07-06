'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConversationLog } from '@/components/game/ConversationLog';
import HumanChatInput from '@/components/game/HumanChatInput';
import { GameAnalyticsTabs } from '@/components/game/analytics/GameAnalyticsTabs';
import { VotingPanel } from '@/components/game/VotingPanel';

import { GameStatsTracker } from '@/components/game/analytics/GameStatsTracker';
import { useGameContext } from '@/context/GameContext';
import { MessageSquare, BarChart3, Vote, History } from 'lucide-react';

interface GameTabsLayoutProps {
  humanPlayerId?: string | null;
}

export function GameTabsLayout({ humanPlayerId }: GameTabsLayoutProps) {
  const { t } = useTranslation();
  const { gameState, submitHumanAction } = useGameContext();
  const [activeTab, setActiveTab] = useState('conversation');

  if (!gameState) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">
          {t('LoadingGame', 'Loading game...')}
        </p>
      </div>
    );
  }

  const isGameActive = gameState.phase !== 'GameOver';
  const isHumanPlayer = Boolean(humanPlayerId);

  // Tab visibility logic
  const showVotingTab = gameState.phase === 'Day' && humanPlayerId;
  const showAnalyticsTab =
    !isHumanPlayer || gameState.phase === 'GameOver' || gameState.round > 1; // Hide for human players in early game
  const showHistoryTab =
    !isHumanPlayer ||
    gameState.phase === 'GameOver' ||
    (gameState.log && gameState.log.length > 5); // Hide if minimal content

  // Calculate visible tabs for grid layout
  const visibleTabs = [
    'conversation', // Always visible
    showAnalyticsTab ? 'analytics' : null,
    showVotingTab ? 'voting' : null,
    showHistoryTab ? 'history' : null,
  ].filter(Boolean);

  const gridCols =
    visibleTabs.length === 2
      ? 'grid-cols-2'
      : visibleTabs.length === 3
        ? 'grid-cols-3'
        : 'grid-cols-4';

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col min-h-0"
      >
        <TabsList className={`grid w-full ${gridCols} shrink-0`}>
          <TabsTrigger value="conversation" className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            <span className="hidden sm:inline">
              {t('Conversation', 'Chat')}
            </span>
          </TabsTrigger>

          {showAnalyticsTab && (
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              <span className="hidden sm:inline">
                {t('Analytics', 'Stats')}
              </span>
            </TabsTrigger>
          )}

          {showVotingTab && (
            <TabsTrigger value="voting" className="flex items-center gap-2">
              <Vote className="w-4 h-4" />
              <span className="hidden sm:inline">{t('Voting', 'Vote')}</span>
            </TabsTrigger>
          )}

          {showHistoryTab && (
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">
                {t('History', 'History')}
              </span>
            </TabsTrigger>
          )}
        </TabsList>

        {/* Conversation Tab - Main game chat */}
        <TabsContent
          value="conversation"
          className="flex-1 flex flex-col min-h-0 mt-0"
        >
          <div className="flex-1 flex flex-col min-h-0">
            <ConversationLog />
            <div className="border-t bg-foreground/5 dark:bg-background/50 backdrop-blur">
              <HumanChatInput />
            </div>
          </div>
        </TabsContent>

        {/* Analytics Tab */}
        {showAnalyticsTab && (
          <TabsContent
            value="analytics"
            className="flex-1 flex flex-col min-h-0 mt-0"
          >
            <div className="flex-1 overflow-hidden p-4">
              {isGameActive ? (
                <GameStatsTracker gameState={gameState} />
              ) : (
                <GameAnalyticsTabs
                  gameState={gameState}
                  humanPlayerId={humanPlayerId || undefined}
                />
              )}
            </div>
          </TabsContent>
        )}

        {/* Voting Tab - Only show during Day phase for human players */}
        {showVotingTab && (
          <TabsContent
            value="voting"
            className="flex-1 flex flex-col min-h-0 mt-0"
          >
            <div className="flex-1 overflow-hidden p-4">
              <VotingPanel
                gameState={gameState}
                onVote={async (targetId) => {
                  if (humanPlayerId) {
                    await submitHumanAction({
                      playerId: humanPlayerId,
                      type: 'vote',
                      targetPlayerId: targetId,
                    });
                  }
                }}
              />
            </div>
          </TabsContent>
        )}

        {/* History Tab */}
        {showHistoryTab && (
          <TabsContent
            value="history"
            className="flex-1 flex flex-col min-h-0 mt-0"
          >
            <div className="flex-1 overflow-hidden p-4">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">
                  {t('GameHistory', 'Game History')}
                </h3>
                <p className="text-muted-foreground">
                  {t(
                    'HistoryPlaceholder',
                    'Game history and previous actions will appear here.'
                  )}
                </p>
              </div>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
