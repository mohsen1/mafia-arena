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
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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
  const { submitHumanAction } = useGameContext();
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [draftMessage, setDraftMessage] = useState<string>('');

  const humanPlayerId = gameState.humanPlayerId;
  const humanPlayer = humanPlayerId ? gameState.players[humanPlayerId] : null;
  const isAlive = humanPlayer?.status === 'Alive';
  const currentPhase = gameState.phase;

  // Quick message templates based on phase
  const messageTemplates = {
    Day: [
      t('QuickMessage.Suspicious', 'I find their behavior suspicious'),
      t('QuickMessage.Trust', 'I trust them, they seem genuine'),
      t('QuickMessage.NeedInfo', 'We need more information before voting'),
      t('QuickMessage.Agree', 'I agree with the previous statement'),
      t('QuickMessage.Disagree', 'I disagree, we should reconsider'),
    ],
    Night: [
      t('QuickMessage.Quiet', "It's awfully quiet tonight..."),
      t('QuickMessage.Worried', "I'm worried about tomorrow"),
      t('QuickMessage.Planning', 'We should discuss our strategy'),
    ],
  };

  const quickActions: QuickAction[] = [
    {
      id: 'message',
      label: t('QuickAction.Message', 'Quick Message'),
      icon: <MessageSquare className="w-4 h-4" />,
      color: 'text-blue-500',
      action: () => {
        setSelectedAction(selectedAction === 'message' ? null : 'message');
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
        setSelectedAction(selectedAction === 'vote' ? null : 'vote');
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
    <div className={cn('overflow-hidden', className)}>
      <div className="space-y-3">
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

        {/* Message Templates - Show when message action is selected */}
        {selectedAction === 'message' && (
          <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground mb-2">
              {t('QuickMessage.Templates', 'Message Templates')}
            </h4>
            {(currentPhase === 'Day' || currentPhase === 'Night'
              ? messageTemplates[currentPhase] || []
              : []
            ).map((template, index) => (
              <Button
                key={index}
                variant="ghost"
                size="sm"
                onClick={async () => {
                  if (
                    gameState.pendingHumanAction?.allowedActions?.includes(
                      'message'
                    )
                  ) {
                    try {
                      await submitHumanAction({
                        playerId: humanPlayerId!,
                        type: 'message',
                        content: template,
                      });
                      setSelectedAction(null);
                    } catch (error) {
                      console.error('Failed to send quick message:', error);
                    }
                  } else {
                    // Store as draft if not ready to send
                    setDraftMessage(template);
                    setSelectedAction(null);
                  }
                }}
                className="w-full justify-start text-left h-auto py-2 px-3"
              >
                <div className="text-xs">{template}</div>
              </Button>
            ))}
          </div>
        )}

        {/* Shortcuts hint */}
        <div className="mt-3 pt-3 border-t border-border/50">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="w-3 h-3" />
            <span>
              {t('QuickActionsHint', 'Use number keys 1-5 for quick access')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
