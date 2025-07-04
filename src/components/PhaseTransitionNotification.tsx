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
    title: 'Day',
    subtitle: undefined,
    bgClass: 'bg-gradient-to-br from-yellow-500/10 to-orange-500/10',
    iconClass: 'text-yellow-500',
  },
  Night: {
    icon: Moon,
    title: 'Night',
    subtitle: undefined,
    bgClass: 'bg-gradient-to-br from-indigo-800/10 to-purple-800/10',
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
  duration = 1000,
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
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="fixed top-4 right-4 z-30 pointer-events-none"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <div
            className={cn(
              'rounded-lg px-4 py-2 backdrop-blur-sm shadow-lg border border-border/30',
              config.bgClass
            )}
          >
            <div className="flex items-center gap-3">
              <motion.div
                initial={{ rotate: -90, scale: 0.8 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                aria-hidden="true"
              >
                <Icon className={cn('w-6 h-6', config.iconClass)} />
              </motion.div>
              <div>
                <motion.h2
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: 0.1 }}
                  className="text-lg font-semibold text-foreground"
                >
                  {config.title}
                  {phase === 'Day' && round > 0 && (
                    <span className="text-sm font-normal text-muted-foreground ms-2">
                      Round {round}
                    </span>
                  )}
                </motion.h2>
                {config.subtitle && (
                  <motion.p
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: 0.2 }}
                    className="text-xs text-muted-foreground"
                  >
                    {config.subtitle}
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
  duration = 1500,
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
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 30 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="fixed top-16 right-4 z-40 pointer-events-none"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="bg-secondary/60 backdrop-blur-sm rounded-md px-3 py-1.5 flex items-center gap-2 shadow-md border border-border/30">
            <Icon className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
            <span className="text-xs font-medium">{subPhase}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
