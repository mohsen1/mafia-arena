'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ThumbsUp,
  ThumbsDown,
  Heart,
  Lightbulb,
  AlertTriangle,
  HelpCircle,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { ClientMessage } from '@/lib/interfaces/gameState.types';

interface MessageReactionsProps {
  message: ClientMessage;
  humanPlayerId?: string | null;
  className?: string;
}

interface Reaction {
  id: string;
  icon: React.ReactNode;
  label: string;
  color: string;
  count: number;
  users: string[];
}

const AVAILABLE_REACTIONS = [
  {
    id: 'agree',
    icon: <ThumbsUp className="w-4 h-4" />,
    label: 'Agree',
    color: 'text-green-500',
  },
  {
    id: 'disagree',
    icon: <ThumbsDown className="w-4 h-4" />,
    label: 'Disagree',
    color: 'text-red-500',
  },
  {
    id: 'love',
    icon: <Heart className="w-4 h-4" />,
    label: 'Love',
    color: 'text-pink-500',
  },
  {
    id: 'insightful',
    icon: <Lightbulb className="w-4 h-4" />,
    label: 'Insightful',
    color: 'text-yellow-500',
  },
  {
    id: 'suspicious',
    icon: <AlertTriangle className="w-4 h-4" />,
    label: 'Suspicious',
    color: 'text-orange-500',
  },
  {
    id: 'confused',
    icon: <HelpCircle className="w-4 h-4" />,
    label: 'Confused',
    color: 'text-purple-500',
  },
];

export function MessageReactions({
  message,
  humanPlayerId,
  className,
}: MessageReactionsProps) {
  const { t } = useTranslation();
  const [reactions, setReactions] = useState<Record<string, string[]>>({});
  const [showReactionPicker, setShowReactionPicker] = useState(false);

  const handleReaction = (reactionId: string) => {
    if (!humanPlayerId) return;

    setReactions((prev) => {
      const newReactions = { ...prev };
      if (!newReactions[reactionId]) {
        newReactions[reactionId] = [];
      }

      const userIndex = newReactions[reactionId].indexOf(humanPlayerId);
      if (userIndex > -1) {
        // Remove reaction
        newReactions[reactionId].splice(userIndex, 1);
        if (newReactions[reactionId].length === 0) {
          delete newReactions[reactionId];
        }
      } else {
        // Add reaction
        newReactions[reactionId].push(humanPlayerId);
      }

      return newReactions;
    });

    setShowReactionPicker(false);
  };

  const getReactionData = (): Reaction[] => {
    return Object.entries(reactions)
      .map(([reactionId, users]) => {
        const reactionDef = AVAILABLE_REACTIONS.find(
          (r) => r.id === reactionId
        );
        if (!reactionDef) return null;

        return {
          id: reactionId,
          icon: reactionDef.icon,
          label: reactionDef.label,
          color: reactionDef.color,
          count: users.length,
          users,
        };
      })
      .filter(Boolean) as Reaction[];
  };

  const reactionData = getReactionData();
  const hasReacted =
    humanPlayerId && reactionData.some((r) => r.users.includes(humanPlayerId));

  // Don't show reactions for system messages
  if (message.type === 'system' || !message.senderId) {
    return null;
  }

  return (
    <div className={cn('flex items-center gap-1 mt-1', className)}>
      <AnimatePresence>
        {reactionData.map((reaction) => (
          <motion.button
            key={reaction.id}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => handleReaction(reaction.id)}
            className={cn(
              'flex items-center gap-1 px-2 py-0.5 rounded-full',
              'bg-background border transition-all',
              'hover:bg-accent',
              reaction.users.includes(humanPlayerId || '') &&
                'border-primary bg-primary/10'
            )}
          >
            <span className={reaction.color}>{reaction.icon}</span>
            <span className="text-xs font-medium">{reaction.count}</span>
          </motion.button>
        ))}
      </AnimatePresence>

      {humanPlayerId && (
        <Popover open={showReactionPicker} onOpenChange={setShowReactionPicker}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-6 w-6 p-0 rounded-full',
                'hover:bg-accent',
                hasReacted && 'opacity-50'
              )}
            >
              <Plus className="w-3 h-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <div className="flex gap-1">
              {AVAILABLE_REACTIONS.map((reaction) => (
                <motion.button
                  key={reaction.id}
                  whileHover={{ scale: 1.2 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => handleReaction(reaction.id)}
                  className={cn(
                    'p-2 rounded-lg transition-colors',
                    'hover:bg-accent',
                    reactions[reaction.id]?.includes(humanPlayerId) &&
                      'bg-primary/10'
                  )}
                  title={t(`Reaction.${reaction.label}`, reaction.label)}
                >
                  <span className={reaction.color}>{reaction.icon}</span>
                </motion.button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
