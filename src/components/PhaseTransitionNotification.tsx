'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sun,
  Moon,
  Users,
  Trophy,
  Sparkles,
  Shield,
  Skull,
  Search,
  MessageSquare,
  Vote,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GamePhaseType } from '@/lib/engine/interfaces/IGamePhase';

interface PhaseTransitionNotificationProps {
  phase: GamePhaseType;
  round: number;
  show: boolean;
  duration?: number;
}

const phaseConfig: Record<
  GamePhaseType,
  {
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    subtitle?: string;
    bgClass: string;
    iconClass: string;
  }
> = {
  CharacterGeneration: {
    icon: Sparkles,
    title: 'Creating Characters',
    subtitle: 'Bringing your game to life...',
    bgClass: 'bg-gradient-to-br from-purple-600/20 to-pink-600/20',
    iconClass: 'text-purple-500',
  },
  Init: {
    icon: Users,
    title: 'Game Initialization',
    subtitle: 'Preparing the village...',
    bgClass: 'bg-gradient-to-br from-blue-600/20 to-cyan-600/20',
    iconClass: 'text-blue-500',
  },
  Briefing: {
    icon: Shield,
    title: 'Role Assignment',
    subtitle: 'Distributing secret identities...',
    bgClass: 'bg-gradient-to-br from-indigo-600/20 to-purple-600/20',
    iconClass: 'text-indigo-500',
  },
  FirstNight: {
    icon: Moon,
    title: 'First Night',
    subtitle: 'The Mafia meets in secret...',
    bgClass: 'bg-gradient-to-br from-slate-800/20 to-slate-900/20',
    iconClass: 'text-slate-400',
  },
  Day: {
    icon: Sun,
    title: 'Day Phase',
    subtitle: 'Time for discussion and voting',
    bgClass: 'bg-gradient-to-br from-yellow-500/20 to-orange-500/20',
    iconClass: 'text-yellow-500',
  },
  Night: {
    icon: Moon,
    title: 'Night Phase',
    subtitle: 'Special roles take action...',
    bgClass: 'bg-gradient-to-br from-indigo-800/20 to-purple-800/20',
    iconClass: 'text-indigo-400',
  },
  GameOver: {
    icon: Trophy,
    title: 'Game Over',
    subtitle: 'The battle has ended',
    bgClass: 'bg-gradient-to-br from-green-600/20 to-emerald-600/20',
    iconClass: 'text-green-500',
  },
};

const subPhaseIcons: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  Discussion: MessageSquare,
  Voting: Vote,
  MafiaKill: Skull,
  DoctorSave: Shield,
  SeerInvestigate: Search,
};

export function PhaseTransitionNotification({
  phase,
  round,
  show,
  duration = 3000,
}: PhaseTransitionNotificationProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setIsVisible(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [show, duration]);

  const config = phaseConfig[phase];
  if (!config) return null;

  const Icon = config.icon;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: -20 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="fixed top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
        >
          <div
            className={cn(
              'rounded-xl p-6 backdrop-blur-md shadow-2xl border border-border/50',
              config.bgClass
            )}
          >
            <div className="flex items-center gap-4">
              <motion.div
                initial={{ rotate: -180, scale: 0 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ duration: 0.5, ease: 'easeOut', delay: 0.1 }}
              >
                <Icon className={cn('w-12 h-12', config.iconClass)} />
              </motion.div>
              <div>
                <motion.h2
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.2 }}
                  className="text-2xl font-bold text-foreground"
                >
                  {config.title}
                </motion.h2>
                {config.subtitle && (
                  <motion.p
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.3 }}
                    className="text-sm text-muted-foreground"
                  >
                    {config.subtitle}
                  </motion.p>
                )}
                {phase === 'Day' && round > 0 && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, delay: 0.4 }}
                    className="text-xs text-muted-foreground mt-1"
                  >
                    Round {round}
                  </motion.p>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface SubPhaseNotificationProps {
  subPhase: string;
  show: boolean;
  duration?: number;
}

export function SubPhaseNotification({
  subPhase,
  show,
  duration = 2000,
}: SubPhaseNotificationProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setIsVisible(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [show, duration]);

  const Icon = subPhaseIcons[subPhase];
  if (!Icon) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 50 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="fixed top-32 right-4 z-40 pointer-events-none"
        >
          <div className="bg-secondary/80 backdrop-blur-sm rounded-lg px-4 py-2 flex items-center gap-2 shadow-lg border border-border/50">
            <Icon className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">{subPhase}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
