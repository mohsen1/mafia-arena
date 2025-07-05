'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GameStatsTracker } from '@/components/GameStatsTracker';
import { VotingVisualization } from '@/components/VotingVisualization';
import { GameInsights } from '@/components/GameInsights';
import { GameHistory } from '@/components/GameHistory';
import { VotingPanel } from '@/components/VotingPanel';
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';
import type { AgentMemory } from '@/lib/engine/interfaces/AgentMemory';
import { BarChart3, Users, Brain, History, Vote } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GameAnalyticsTabsProps {
  gameState: FilteredGameState;
  humanPlayerId?: string;
}

export function GameAnalyticsTabs({
  gameState,
  humanPlayerId,
}: GameAnalyticsTabsProps) {
  // VotingPanel internally checks if voting is active by examining game messages
  const showVotingPanel = humanPlayerId && gameState.phase === 'Day';
  const [activeTab, setActiveTab] = useState<string>('none');

  return (
    <div className="w-full">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5 h-9">
          {showVotingPanel && (
            <TabsTrigger value="voting" className="flex items-center gap-2">
              <Vote className="h-4 w-4" />
              <span className="hidden sm:inline">Vote</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="stats" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Stats</span>
          </TabsTrigger>
          <TabsTrigger
            value="voting-analysis"
            className="flex items-center gap-2"
          >
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Voting</span>
          </TabsTrigger>
          <TabsTrigger value="insights" className="flex items-center gap-2">
            <Brain className="h-4 w-4" />
            <span className="hidden sm:inline">Insights</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">History</span>
          </TabsTrigger>
        </TabsList>

        <div
          className={cn(
            'overflow-y-auto mt-1 transition-all duration-300',
            activeTab === 'none' && 'h-0'
          )}
          style={{ maxHeight: activeTab === 'none' ? '0' : '200px' }}
        >
          {activeTab === 'none' && (
            <div className="text-center text-muted-foreground text-sm py-2">
              Select a tab to view analytics
            </div>
          )}

          {showVotingPanel && (
            <TabsContent value="voting" className="mt-0">
              <VotingPanel gameState={gameState} />
            </TabsContent>
          )}

          <TabsContent value="stats" className="mt-0">
            <GameStatsTracker gameState={gameState} />
          </TabsContent>

          <TabsContent value="voting-analysis" className="mt-0">
            <VotingVisualization gameState={gameState} />
          </TabsContent>

          <TabsContent value="insights" className="mt-0">
            <GameInsights gameState={gameState} />
          </TabsContent>

          <TabsContent value="history" className="mt-0">
            {gameState && 'memory' in gameState && (
              <GameHistory
                gameState={
                  gameState as FilteredGameState & { memory: AgentMemory }
                }
              />
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
