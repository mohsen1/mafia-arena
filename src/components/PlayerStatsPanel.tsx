'use client';

import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';

interface PlayerStatsProps {
  gameState: FilteredGameState;
}

interface PlayerStats {
  votesReceived: number;
  votesCast: { targetName: string; round: number }[];
  messagesSent: number;
  lastActivity: string;
}

export function PlayerStatsPanel({ gameState }: PlayerStatsProps) {
  const { t } = useTranslation();

  // Calculate statistics for each player
  const calculateStats = (): Map<string, PlayerStats> => {
    const statsMap = new Map<string, PlayerStats>();

    // Initialize stats for all players
    Object.values(gameState.players).forEach((player) => {
      statsMap.set(player.id, {
        votesReceived: 0,
        votesCast: [],
        messagesSent: 0,
        lastActivity: 'Never',
      });
    });

    // Process conversation log to count votes and messages
    gameState.log.forEach((message) => {
      if (!message.senderId) return;

      const playerStats = statsMap.get(message.senderId);
      if (!playerStats) return;

      // Count messages (excluding system messages)
      if (
        message.content &&
        !message.content.match(
          /^(votes for|chose no action|VotesFor|ChoseNoAction)/
        )
      ) {
        playerStats.messagesSent++;
        playerStats.lastActivity = `Round ${message.round}`;
      }

      // Track votes cast
      const voteMatch = message.content.match(/votes for (.+)\./);
      if (voteMatch) {
        const targetName = voteMatch[1];
        playerStats.votesCast.push({ targetName, round: message.round });

        // Count votes received - ONLY from the most recent Day phase of current round
        // This ensures we show votes from the most recent voting session
        const isCurrentRoundDayVote = 
          message.round === gameState.round && 
          message.phase === 'Day';
          
        if (isCurrentRoundDayVote) {
          const targetPlayer = Object.values(gameState.players).find(
            (p) => p.name === targetName
          );
          if (targetPlayer) {
            const targetStats = statsMap.get(targetPlayer.id);
            if (targetStats) {
              targetStats.votesReceived++;
            }
          }
        }
      }
    });

    return statsMap;
  };

  const playerStats = calculateStats();

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          📊 {t('PlayerStatistics', 'Player Statistics')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {Object.values(gameState.players).map((player) => {
            const stats = playerStats.get(player.id);
            if (!stats) return null;

            const isAlive = player.status === 'Alive';

            return (
              <div
                key={player.id}
                className={`p-3 rounded-lg border ${isAlive ? 'bg-background' : 'bg-muted/50'}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-medium ${!isAlive && 'line-through opacity-60'}`}
                    >
                      {player.name}
                    </span>
                    {player.role && (
                      <Badge
                        variant={isAlive ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {t(player.role, player.role)}
                      </Badge>
                    )}
                  </div>
                  {!isAlive && (
                    <Badge variant="destructive" className="text-xs">
                      {t('Dead', 'Dead')}
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">
                      {t('VotesReceived', 'Votes Received')}:
                    </span>
                    <span className="ms-1 font-medium">
                      {stats.votesReceived}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      {t('MessagesSent', 'Messages')}:
                    </span>
                    <span className="ms-1 font-medium">
                      {stats.messagesSent}
                    </span>
                  </div>
                </div>

                {stats.votesCast.length > 0 && (
                  <div className="mt-2 text-sm">
                    <span className="text-muted-foreground">
                      {t('VotedFor', 'Voted for')}:
                    </span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {stats.votesCast.map((vote, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {vote.targetName} (R{vote.round})
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
