'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  X,
  Skull,
  Eye,
  Heart,
  Vote,
  AlertTriangle,
  Info,
  CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';

interface GameNotificationCenterProps {
  gameState: FilteredGameState;
  className?: string;
}

interface GameNotification {
  id: string;
  type:
    | 'death'
    | 'vote'
    | 'investigation'
    | 'protection'
    | 'phase'
    | 'warning'
    | 'info'
    | 'role_reveal';
  title: string;
  message: string;
  timestamp: Date;
  icon: React.ReactNode;
  color: string;
  read: boolean;
  priority?: 'low' | 'medium' | 'high';
  duration?: number;
}

const NOTIFICATION_ICONS = {
  death: <Skull className="w-4 h-4" />,
  vote: <Vote className="w-4 h-4" />,
  investigation: <Eye className="w-4 h-4" />,
  protection: <Heart className="w-4 h-4" />,
  phase: <Info className="w-4 h-4" />,
  warning: <AlertTriangle className="w-4 h-4" />,
  info: <CheckCircle className="w-4 h-4" />,
  role_reveal: <Skull className="w-4 h-4" />,
};

const NOTIFICATION_COLORS = {
  death: 'text-red-500',
  vote: 'text-orange-500',
  investigation: 'text-blue-500',
  protection: 'text-green-500',
  phase: 'text-purple-500',
  warning: 'text-yellow-500',
  info: 'text-gray-500',
  role_reveal: 'text-red-600',
};

export function GameNotificationCenter({
  gameState,
  className,
}: GameNotificationCenterProps) {
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState<GameNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [lastProcessedMessage, setLastProcessedMessage] = useState<number>(0);
  const [floatingNotifications, setFloatingNotifications] = useState<
    GameNotification[]
  >([]);

  // Process game messages to generate notifications
  const processGameMessages = useCallback(() => {
    const newNotifications: GameNotification[] = [];
    const messages = gameState.log.slice(lastProcessedMessage);

    messages.forEach((msg, index) => {
      const msgIndex = lastProcessedMessage + index;

      // Death notification with role reveal
      if (
        msg.content.includes('was killed') ||
        msg.content.includes('was executed') ||
        msg.content.includes('was eliminated')
      ) {
        // Extract player name and role from message like "Player (Role) was killed"
        const match = msg.content.match(
          /(\w+(?:\s+\w+)*)\s*\(([^)]+)\)\s*was\s*(killed|executed|eliminated)/
        );
        const playerName =
          match?.[1] || msg.content.match(/(\w+\s*\w*) was/)?.[1];
        const role = match?.[2];
        const method = match?.[3] || 'eliminated';

        if (role) {
          // Role reveal notification
          newNotifications.push({
            id: `role-reveal-${msgIndex}`,
            type: 'role_reveal',
            title: t('RoleRevealed', 'Role Revealed'),
            message: t('PlayerWasRole', '{{player}} was {{role}}', {
              player: playerName || 'Unknown',
              role: role,
            }),
            timestamp: new Date(),
            icon: NOTIFICATION_ICONS.role_reveal,
            color: NOTIFICATION_COLORS.role_reveal,
            read: false,
            priority: 'high',
            duration: 6000,
          });
        }

        // Standard death notification
        newNotifications.push({
          id: `death-${msgIndex}`,
          type: 'death',
          title: t('PlayerEliminated', 'Player Eliminated'),
          message: playerName
            ? t('PlayerEliminatedDesc', '{{player}} has been {{method}}', {
                player: playerName,
                method: method,
              })
            : msg.content,
          timestamp: new Date(),
          icon: NOTIFICATION_ICONS.death,
          color: NOTIFICATION_COLORS.death,
          read: false,
          priority: 'high',
        });
      }

      // Vote notification
      if (
        msg.content.includes('votes for') &&
        msg.senderId === gameState.humanPlayerId
      ) {
        newNotifications.push({
          id: `vote-${msgIndex}`,
          type: 'vote',
          title: t('VoteRecorded', 'Vote Recorded'),
          message: t('YourVoteRecorded', 'Your vote has been recorded'),
          timestamp: new Date(),
          icon: NOTIFICATION_ICONS.vote,
          color: NOTIFICATION_COLORS.vote,
          read: false,
        });
      }

      // Investigation result (for Seer)
      if (
        msg.content.includes('investigation reveals') &&
        msg.recipientId === gameState.humanPlayerId
      ) {
        newNotifications.push({
          id: `investigation-${msgIndex}`,
          type: 'investigation',
          title: t('InvestigationComplete', 'Investigation Complete'),
          message: t(
            'CheckYourMessages',
            'Check your private messages for results'
          ),
          timestamp: new Date(),
          icon: NOTIFICATION_ICONS.investigation,
          color: NOTIFICATION_COLORS.investigation,
          read: false,
        });
      }

      // Protection notification (for Doctor)
      if (
        msg.content.includes('protected') &&
        msg.senderId === gameState.humanPlayerId
      ) {
        newNotifications.push({
          id: `protection-${msgIndex}`,
          type: 'protection',
          title: t('ProtectionApplied', 'Protection Applied'),
          message: t(
            'YourProtectionActive',
            'Your protection is active for tonight'
          ),
          timestamp: new Date(),
          icon: NOTIFICATION_ICONS.protection,
          color: NOTIFICATION_COLORS.protection,
          read: false,
        });
      }
    });

    if (newNotifications.length > 0) {
      setNotifications((prev) => [...newNotifications, ...prev].slice(0, 50)); // Keep last 50
      setLastProcessedMessage(gameState.log.length);

      // Add high priority notifications to floating list
      const highPriorityNotifs = newNotifications.filter(
        (n) => n.priority === 'high'
      );
      if (highPriorityNotifs.length > 0) {
        setFloatingNotifications((prev) =>
          [...highPriorityNotifs, ...prev].slice(0, 3)
        );
      }
    }
  }, [gameState, lastProcessedMessage, t]);

  // Process messages when game state updates
  useEffect(() => {
    processGameMessages();
  }, [processGameMessages]);

  // Add phase change notifications
  useEffect(() => {
    if (gameState.phase && gameState.round > 0) {
      const phaseNotification: GameNotification = {
        id: `phase-${gameState.phase}-${gameState.round}`,
        type: 'phase',
        title: t('PhaseChange', 'Phase Change'),
        message: t('NowEntering', 'Now entering {{phase}} phase', {
          phase: t(gameState.phase),
        }),
        timestamp: new Date(),
        icon: NOTIFICATION_ICONS.phase,
        color: NOTIFICATION_COLORS.phase,
        read: false,
      };

      setNotifications((prev) => {
        // Avoid duplicate phase notifications
        if (!prev.some((n) => n.id === phaseNotification.id)) {
          return [phaseNotification, ...prev].slice(0, 50);
        }
        return prev;
      });
    }
  }, [gameState.phase, gameState.round, t]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = (notificationId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
    );
  };

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const clearNotification = (notificationId: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
  };

  return (
    <>
      {/* Floating Notifications */}
      <div className="fixed top-20 right-4 z-50 space-y-2 pointer-events-none">
        <AnimatePresence>
          {floatingNotifications.map((notification) => (
            <motion.div
              key={notification.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 50, scale: 0.9 }}
              transition={{ duration: 0.3 }}
              className="pointer-events-auto"
              onAnimationComplete={() => {
                // Auto-remove after duration
                setTimeout(() => {
                  setFloatingNotifications((prev) =>
                    prev.filter((n) => n.id !== notification.id)
                  );
                }, notification.duration || 5000);
              }}
            >
              <div
                className={cn(
                  'bg-background border rounded-lg shadow-lg p-4 max-w-sm',
                  notification.type === 'role_reveal' &&
                    'border-red-500/50 bg-red-50 dark:bg-red-950/20'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn('mt-0.5', notification.color)}>
                    {notification.icon}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">
                      {notification.title}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {notification.message}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 -mt-1 -mr-2"
                    onClick={() => {
                      setFloatingNotifications((prev) =>
                        prev.filter((n) => n.id !== notification.id)
                      );
                    }}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Notification Center */}
      <Popover open={showNotifications} onOpenChange={setShowNotifications}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn('relative p-0', className)}
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]"
              >
                {unreadCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="end">
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="font-semibold">
              {t('Notifications', 'Notifications')}
            </h3>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllAsRead}
                className="text-xs"
              >
                {t('MarkAllRead', 'Mark all read')}
              </Button>
            )}
          </div>

          <ScrollArea className="h-[400px]">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">
                  {t('NoNotifications', 'No notifications yet')}
                </p>
              </div>
            ) : (
              <div className="divide-y">
                <AnimatePresence>
                  {notifications.map((notification) => (
                    <motion.div
                      key={notification.id}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className={cn(
                        'p-4 hover:bg-accent/50 transition-colors cursor-pointer',
                        !notification.read && 'bg-accent/20'
                      )}
                      onClick={() => markAsRead(notification.id)}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn('mt-0.5', notification.color)}>
                          {notification.icon}
                        </div>
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-medium">
                            {notification.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {notification.message}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(
                              notification.timestamp
                            ).toLocaleTimeString()}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 -mt-1 -mr-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            clearNotification(notification.id);
                          }}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </>
  );
}
