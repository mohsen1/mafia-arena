'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { 
  Network, 
  Users, 
  Heart,
  Swords,
  MessageSquare,
  AlertTriangle,
  Eye
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';

interface PlayerRelationshipMapProps {
  gameState: FilteredGameState;
  className?: string;
}

interface PlayerRelationship {
  playerId: string;
  playerName: string;
  relationships: {
    targetId: string;
    targetName: string;
    type: 'alliance' | 'suspicion' | 'neutral';
    strength: number;
    interactions: string[];
  }[];
  trustScore: number;
  influenceLevel: 'high' | 'medium' | 'low';
}

export function PlayerRelationshipMap({ gameState, className }: PlayerRelationshipMapProps) {
  const { t } = useTranslation();

  // Analyze player relationships from game log
  const relationships = useMemo((): Map<string, PlayerRelationship> => {
    const relationshipMap = new Map<string, PlayerRelationship>();
    
    // Initialize relationships for all living players
    Object.entries(gameState.players).forEach(([id, player]) => {
      if (player.status === 'Alive') {
        relationshipMap.set(id, {
          playerId: id,
          playerName: player.name,
          relationships: [],
          trustScore: 50, // Start neutral
          influenceLevel: 'medium'
        });
      }
    });
    
    // Analyze interactions from messages
    gameState.log.forEach(msg => {
      if (msg.type !== 'chat' || !msg.senderId) return;
      
      const sender = relationshipMap.get(msg.senderId);
      if (!sender) return;
      
      // Look for mentions of other players
      Object.entries(gameState.players).forEach(([targetId, targetPlayer]) => {
        if (targetId === msg.senderId || targetPlayer.status === 'Dead') return;
        
        if (msg.content.includes(targetPlayer.name)) {
          // Analyze sentiment
          const isPositive = msg.content.match(/trust|agree|support|defend/i);
          const isNegative = msg.content.match(/suspect|vote|accuse|doubt|mafia/i);
          const isVote = msg.content.includes('votes for ' + targetPlayer.name);
          
          // Find or create relationship
          let relationship = sender.relationships.find(r => r.targetId === targetId);
          if (!relationship) {
            relationship = {
              targetId,
              targetName: targetPlayer.name,
              type: 'neutral',
              strength: 0,
              interactions: []
            };
            sender.relationships.push(relationship);
          }
          
          // Update relationship
          if (isVote) {
            relationship.type = 'suspicion';
            relationship.strength = Math.min(100, relationship.strength + 30);
            relationship.interactions.push('voted against');
          } else if (isNegative) {
            relationship.type = 'suspicion';
            relationship.strength = Math.min(100, relationship.strength + 15);
            relationship.interactions.push('expressed suspicion');
          } else if (isPositive) {
            relationship.type = 'alliance';
            relationship.strength = Math.min(100, relationship.strength + 10);
            relationship.interactions.push('showed support');
          }
          
          // Update trust score
          if (isPositive) {
            sender.trustScore = Math.min(100, sender.trustScore + 5);
          } else if (isNegative || isVote) {
            sender.trustScore = Math.max(0, sender.trustScore - 5);
          }
        }
      });
    });
    
    // Calculate influence levels based on activity and relationships
    relationshipMap.forEach(player => {
      const totalInteractions = player.relationships.reduce(
        (sum, r) => sum + r.interactions.length, 0
      );
      
      if (totalInteractions > 10) {
        player.influenceLevel = 'high';
      } else if (totalInteractions > 5) {
        player.influenceLevel = 'medium';
      } else {
        player.influenceLevel = 'low';
      }
    });
    
    return relationshipMap;
  }, [gameState]);

  // Get top relationships to display
  const topRelationships = useMemo(() => {
    const allRelationships: Array<{
      source: string;
      target: string;
      type: 'alliance' | 'suspicion' | 'neutral';
      strength: number;
      description: string;
    }> = [];
    
    relationships.forEach(player => {
      player.relationships
        .filter(r => r.strength > 20)
        .forEach(rel => {
          allRelationships.push({
            source: player.playerName,
            target: rel.targetName,
            type: rel.type,
            strength: rel.strength,
            description: rel.interactions[rel.interactions.length - 1] || ''
          });
        });
    });
    
    return allRelationships
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 8);
  }, [relationships]);

  // Get influence leaders
  const influenceLeaders = useMemo(() => {
    return Array.from(relationships.values())
      .filter(p => p.influenceLevel === 'high')
      .sort((a, b) => b.relationships.length - a.relationships.length)
      .slice(0, 3);
  }, [relationships]);

  if (relationships.size === 0) {
    return null;
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Network className="w-4 h-4" />
          {t('PlayerRelationships', 'Player Relationships')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-3">
        {/* Influence Leaders */}
        {influenceLeaders.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Users className="w-3 h-3" />
              {t('InfluentialPlayers', 'Influential Players')}
            </h4>
            <div className="flex flex-wrap gap-2">
              {influenceLeaders.map(player => (
                <Badge
                  key={player.playerId}
                  variant="secondary"
                  className="text-xs"
                >
                  {player.playerName}
                  <span className="ms-1 text-muted-foreground">
                    ({player.relationships.length} connections)
                  </span>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Key Relationships */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Swords className="w-3 h-3" />
            {t('KeyRelationships', 'Key Relationships')}
          </h4>
          <TooltipProvider>
            <div className="space-y-1">
              {topRelationships.map((rel, index) => (
                <motion.div
                  key={`${rel.source}-${rel.target}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className={cn(
                        "flex items-center justify-between p-2 rounded-lg text-xs",
                        "hover:bg-accent/50 transition-colors cursor-pointer",
                        rel.type === 'alliance' && "bg-green-500/10",
                        rel.type === 'suspicion' && "bg-red-500/10"
                      )}>
                        <div className="flex items-center gap-2 flex-1">
                          <span className="font-medium truncate">
                            {rel.source}
                          </span>
                          <div className={cn(
                            "flex items-center gap-1",
                            rel.type === 'alliance' && "text-green-500",
                            rel.type === 'suspicion' && "text-red-500",
                            rel.type === 'neutral' && "text-gray-500"
                          )}>
                            {rel.type === 'alliance' && <Heart className="w-3 h-3" />}
                            {rel.type === 'suspicion' && <AlertTriangle className="w-3 h-3" />}
                            {rel.type === 'neutral' && <MessageSquare className="w-3 h-3" />}
                          </div>
                          <span className="font-medium truncate">
                            {rel.target}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className={cn(
                            "w-8 h-1 rounded-full bg-gradient-to-r",
                            rel.type === 'alliance' && "from-green-200 to-green-500",
                            rel.type === 'suspicion' && "from-red-200 to-red-500",
                            rel.type === 'neutral' && "from-gray-200 to-gray-500"
                          )} style={{
                            width: `${(rel.strength / 100) * 32}px`
                          }} />
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="space-y-1">
                        <p className="font-semibold text-xs">
                          {rel.source} → {rel.target}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t('RelationType', 'Type')}: {t(rel.type)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t('Strength', 'Strength')}: {rel.strength}%
                        </p>
                        {rel.description && (
                          <p className="text-xs">
                            {t('LastAction', 'Last action')}: {rel.description}
                          </p>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </motion.div>
              ))}
            </div>
          </TooltipProvider>
        </div>

        {/* Trust Network Summary */}
        <div className="pt-3 border-t">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Eye className="w-3 h-3" />
            <p>
              {relationships.size > 0 && (
                <>
                  {Array.from(relationships.values()).filter(
                    p => p.relationships.some(r => r.type === 'alliance')
                  ).length} {t('alliances', 'alliances')} • 
                  {' '}{Array.from(relationships.values()).filter(
                    p => p.relationships.some(r => r.type === 'suspicion')
                  ).length} {t('conflicts', 'conflicts')}
                </>
              )}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 