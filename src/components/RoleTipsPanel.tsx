'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { 
  Lightbulb, 
  Shield, 
  Eye, 
  Heart,
  Sword,
  Info,
  Target,
  Users
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';
import type { RoleName } from '@/lib/engine/interfaces/IRole';

interface RoleTipsProps {
  gameState: FilteredGameState;
  className?: string;
}

interface RoleTip {
  icon: React.ReactNode;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

const ROLE_ICONS: Record<RoleName, React.ReactNode> = {
  Villager: <Shield className="w-4 h-4" />,
  Mafia: <Sword className="w-4 h-4" />,
  Seer: <Eye className="w-4 h-4" />,
  Doctor: <Heart className="w-4 h-4" />,
};

export function RoleTipsPanel({ gameState, className }: RoleTipsProps) {
  const { t } = useTranslation();
  
  const humanPlayer = gameState.humanPlayerId 
    ? gameState.players[gameState.humanPlayerId] 
    : null;

  const tips = useMemo((): RoleTip[] => {
    if (!humanPlayer?.role) return [];

    const roleTips: RoleTip[] = [];
    const phase = gameState.phase;
    const round = gameState.round;
    const alivePlayers = gameState.livingPlayerIds?.length || 0;

    switch (humanPlayer.role) {
      case 'Villager':
        if (phase === 'Day') {
          roleTips.push({
            icon: <Target className="w-4 h-4" />,
            title: t('Tips.ObserveQuietPlayers', 'Watch for quiet players'),
            description: t('Tips.QuietMafia', 'Mafia members often stay quiet to avoid suspicion'),
            priority: 'high'
          });
          
          if (round > 1) {
            roleTips.push({
              icon: <Users className="w-4 h-4" />,
              title: t('Tips.AnalyzeVoting', 'Analyze voting patterns'),
              description: t('Tips.VotingPatterns', 'Look for players who vote together consistently'),
              priority: 'medium'
            });
          }
        }
        
        roleTips.push({
          icon: <Shield className="w-4 h-4" />,
          title: t('Tips.ShareSuspicions', 'Share your suspicions'),
          description: t('Tips.BuildConsensus', 'Help build consensus by voicing your thoughts'),
          priority: 'medium'
        });
        break;

      case 'Mafia':
        if (phase === 'Night') {
          roleTips.push({
            icon: <Sword className="w-4 h-4" />,
            title: t('Tips.ChooseTargetWisely', 'Choose elimination target wisely'),
            description: t('Tips.TargetActive', 'Target active players who might expose you'),
            priority: 'high'
          });
        } else {
          roleTips.push({
            icon: <Shield className="w-4 h-4" />,
            title: t('Tips.ActLikeVillager', 'Act like a concerned villager'),
            description: t('Tips.BlendIn', 'Participate in discussions without being too aggressive'),
            priority: 'high'
          });
          
          roleTips.push({
            icon: <Users className="w-4 h-4" />,
            title: t('Tips.ProtectTeammates', 'Subtly protect teammates'),
            description: t('Tips.AvoidDefending', 'Avoid directly defending other Mafia members'),
            priority: 'medium'
          });
        }
        break;

      case 'Seer':
        if (phase === 'Night') {
          roleTips.push({
            icon: <Eye className="w-4 h-4" />,
            title: t('Tips.InvestigateSuspicious', 'Investigate suspicious players'),
            description: t('Tips.PrioritizeQuiet', 'Prioritize quiet or defensive players'),
            priority: 'high'
          });
        } else {
          roleTips.push({
            icon: <Info className="w-4 h-4" />,
            title: t('Tips.ShareCarefully', 'Share information carefully'),
            description: t('Tips.AvoidRevealing', 'Avoid revealing your role too early'),
            priority: 'high'
          });
          
          if (round > 2) {
            roleTips.push({
              icon: <Target className="w-4 h-4" />,
              title: t('Tips.GuideVoting', 'Guide voting subtly'),
              description: t('Tips.UseKnowledge', 'Use your investigation results to influence votes'),
              priority: 'medium'
            });
          }
        }
        break;

      case 'Doctor':
        if (phase === 'Night') {
          roleTips.push({
            icon: <Heart className="w-4 h-4" />,
            title: t('Tips.ProtectKeyPlayers', 'Protect key players'),
            description: t('Tips.SaveActive', 'Save active villagers or suspected Seer'),
            priority: 'high'
          });
          
          roleTips.push({
            icon: <Shield className="w-4 h-4" />,
            title: t('Tips.VaryTargets', 'Vary your protection targets'),
            description: t('Tips.UnpredictablePattern', 'Don\'t follow a predictable pattern'),
            priority: 'medium'
          });
        } else {
          roleTips.push({
            icon: <Info className="w-4 h-4" />,
            title: t('Tips.StayHidden', 'Keep your role secret'),
            description: t('Tips.AvoidHints', 'Avoid giving hints about who you protected'),
            priority: 'high'
          });
        }
        break;
    }

    // General tips for all roles
    if (alivePlayers <= 5 && alivePlayers > 0) {
      roleTips.push({
        icon: <Lightbulb className="w-4 h-4" />,
        title: t('Tips.EndgameStrategy', 'Endgame approaching'),
        description: t('Tips.EveryVoteCounts', 'Every vote and decision is critical now'),
        priority: 'high'
      });
    }

    return roleTips.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }, [gameState, humanPlayer, t]);

  if (!humanPlayer?.role || humanPlayer.status === 'Dead') {
    return null;
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          {ROLE_ICONS[humanPlayer.role]}
          {t('RoleTips', 'Role Tips')} - {t(humanPlayer.role, humanPlayer.role)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-3">
        {tips.map((tip, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Alert className={cn(
              "border-l-4",
              tip.priority === 'high' && "border-l-orange-500",
              tip.priority === 'medium' && "border-l-blue-500",
              tip.priority === 'low' && "border-l-gray-500"
            )}>
              <div className="flex items-start gap-2">
                <div className={cn(
                  "mt-0.5",
                  tip.priority === 'high' && "text-orange-500",
                  tip.priority === 'medium' && "text-blue-500",
                  tip.priority === 'low' && "text-gray-500"
                )}>
                  {tip.icon}
                </div>
                <AlertDescription className="space-y-1">
                  <p className="font-medium">{tip.title}</p>
                  <p className="text-xs text-muted-foreground">{tip.description}</p>
                </AlertDescription>
              </div>
            </Alert>
          </motion.div>
        ))}

        {tips.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t('NoTipsAvailable', 'No specific tips for this phase')}
          </p>
        )}
      </CardContent>
    </Card>
  );
} 