'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  MessageSquare,
  Vote,
  Shield,
  Eye,
  Sword,
  Zap,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';
import { useGameContext } from '@/context/GameContext';

interface QuickActionsProps {
  gameState: FilteredGameState;
  className?: string;
}

interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  action: () => void;
  available: boolean;
  description?: string;
}

export function QuickActionsPanel({ gameState, className }: QuickActionsProps) {
  const { t } = useTranslation();
  const {} = useGameContext(); // Will use submitHumanAction later when implementing actions
  const [selectedAction, setSelectedAction] = useState<string | null>(null);

  const humanPlayerId = gameState.humanPlayerId;
  const humanPlayer = humanPlayerId ? gameState.players[humanPlayerId] : null;
  const isAlive = humanPlayer?.status === 'Alive';
  const currentPhase = gameState.phase;

  // Quick message templates based on phase - will be used in future implementation
  // const messageTemplates = {
  //   Day: [
  //     t('QuickMessage.Suspicious', "I find {{player}}'s behavior suspicious"),
  //     t('QuickMessage.Trust', 'I trust {{player}}, they seem genuine'),
  //     t('QuickMessage.NeedInfo', 'We need more information before voting'),
  //     t('QuickMessage.Agree', 'I agree with the previous statement'),
  //   ],
  //   Night: [
  //     t('QuickMessage.Quiet', "It's awfully quiet tonight..."),
  //     t('QuickMessage.Worried', "I'm worried about tomorrow"),
  //   ],
  // };

  const quickActions: QuickAction[] = [
    {
      id: 'message',
      label: t('QuickAction.Message', 'Quick Message'),
      icon: <MessageSquare className="w-4 h-4" />,
      color: 'text-blue-500',
      action: () => {
        // Show message templates
        setSelectedAction('message');
      },
      available:
        isAlive && (currentPhase === 'Day' || currentPhase === 'Night'),
      description: t('QuickAction.MessageDesc', 'Send a pre-written message'),
    },
    {
      id: 'vote',
      label: t('QuickAction.Vote', 'Cast Vote'),
      icon: <Vote className="w-4 h-4" />,
      color: 'text-orange-500',
      action: () => {
        // Show voting UI
        setSelectedAction('vote');
      },
      available:
        isAlive &&
        currentPhase === 'Day' &&
        (gameState.pendingHumanAction?.allowedActions?.includes('vote') ??
          false),
      description: t('QuickAction.VoteDesc', 'Vote to eliminate a player'),
    },
    {
      id: 'protect',
      label: t('QuickAction.Protect', 'Protect Player'),
      icon: <Shield className="w-4 h-4" />,
      color: 'text-green-500',
      action: () => {
        setSelectedAction('protect');
      },
      available:
        isAlive &&
        humanPlayer?.role === 'Doctor' &&
        currentPhase === 'Night' &&
        (gameState.pendingHumanAction?.allowedActions?.includes('doctorSave') ??
          false),
      description: t(
        'QuickAction.ProtectDesc',
        'Save someone from elimination'
      ),
    },
    {
      id: 'investigate',
      label: t('QuickAction.Investigate', 'Investigate'),
      icon: <Eye className="w-4 h-4" />,
      color: 'text-purple-500',
      action: () => {
        setSelectedAction('investigate');
      },
      available:
        isAlive &&
        humanPlayer?.role === 'Seer' &&
        currentPhase === 'Night' &&
        (gameState.pendingHumanAction?.allowedActions?.includes(
          'seerInvestigate'
        ) ??
          false),
      description: t(
        'QuickAction.InvestigateDesc',
        "Learn a player's allegiance"
      ),
    },
    {
      id: 'eliminate',
      label: t('QuickAction.Eliminate', 'Eliminate Target'),
      icon: <Sword className="w-4 h-4" />,
      color: 'text-red-500',
      action: () => {
        setSelectedAction('eliminate');
      },
      available:
        isAlive &&
        humanPlayer?.isMafia === true &&
        currentPhase === 'Night' &&
        (gameState.pendingHumanAction?.allowedActions?.includes('mafiaKill') ??
          false),
      description: t('QuickAction.EliminateDesc', 'Choose elimination target'),
    },
  ];

  const availableActions = quickActions.filter((action) => action.available);

  if (availableActions.length === 0) {
    return null;
  }

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Zap className="w-4 h-4" />
          {t('QuickActions', 'Quick Actions')}
          <Badge variant="secondary" className="text-xs">
            {availableActions.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3">
        <div className="grid grid-cols-2 gap-2">
          {availableActions.map((action) => (
            <motion.div
              key={action.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Button
                variant="outline"
                size="sm"
                onClick={action.action}
                className={cn(
                  'w-full justify-start gap-2 text-left',
                  'hover:border-primary/50',
                  selectedAction === action.id && 'border-primary bg-primary/10'
                )}
              >
                <span className={action.color}>{action.icon}</span>
                <div className="flex-1">
                  <div className="text-xs font-medium">{action.label}</div>
                  {action.description && (
                    <div className="text-xs text-muted-foreground">
                      {action.description}
                    </div>
                  )}
                </div>
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
              </Button>
            </motion.div>
          ))}
        </div>

        {/* Shortcuts hint */}
        <div className="mt-3 pt-3 border-t">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="w-3 h-3" />
            <span>
              {t('QuickActionsHint', 'Use number keys 1-5 for quick access')}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
