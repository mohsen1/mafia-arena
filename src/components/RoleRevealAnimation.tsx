'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Skull,
  Shield,
  Sword,
  Eye,
  Heart,
  Users,
  Sparkles,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { addAudioBreadcrumb } from '@/components/AudioDebugOverlay';

interface RoleRevealAnimationProps {
  playerName: string;
  role: string;
  isEvil: boolean;
  reason: 'voted' | 'killed';
  onComplete?: () => void;
  className?: string;
}

export function RoleRevealAnimation({
  playerName,
  role,
  isEvil,
  reason,
  onComplete,
  className,
}: RoleRevealAnimationProps) {
  const { t } = useTranslation();
  const [showReveal, setShowReveal] = useState(true);

  useEffect(() => {
    // Log role reveal start
    console.log('[RoleRevealAnimation] 🎭 ROLE REVEAL STARTED', {
      playerName,
      role,
      isEvil,
      reason,
      timestamp: new Date().toISOString(),
    });

    addAudioBreadcrumb('Role reveal animation started', {
      playerName,
      role,
      reason,
    });

    const timer = setTimeout(() => {
      setShowReveal(false);

      console.log('[RoleRevealAnimation] 🎭 ROLE REVEAL COMPLETED', {
        playerName,
        role,
        timestamp: new Date().toISOString(),
      });

      addAudioBreadcrumb('Role reveal animation completed', {
        playerName,
        role,
      });

      onComplete?.();
    }, 5000); // Show for 5 seconds

    return () => clearTimeout(timer);
  }, [onComplete, playerName, role, isEvil, reason]);

  const getRoleIcon = (roleName: string) => {
    switch (roleName.toLowerCase()) {
      case 'mafia':
        return Sword;
      case 'villager':
        return Users;
      case 'seer':
        return Eye;
      case 'doctor':
        return Heart;
      default:
        return Shield;
    }
  };

  const RoleIcon = getRoleIcon(role);

  const handleClose = () => {
    setShowReveal(false);
    onComplete?.();
  };

  return (
    <AnimatePresence>
      {showReveal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={cn(
            'fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm',
            className
          )}
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.5, opacity: 0, rotateY: 180 }}
            animate={{ scale: 1, opacity: 1, rotateY: 0 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{
              type: 'spring',
              stiffness: 200,
              damping: 20,
            }}
            className="relative max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Background glow effect */}
            <div
              className={cn(
                'absolute inset-0 rounded-2xl blur-3xl opacity-30',
                isEvil ? 'bg-red-500' : 'bg-blue-500'
              )}
            />

            {/* Main card */}
            <div
              className={cn(
                'relative bg-background border-2 rounded-2xl p-8 shadow-2xl',
                isEvil ? 'border-red-500/50' : 'border-blue-500/50'
              )}
            >
              {/* Close button */}
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-secondary/50 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Skull animation for elimination */}
              <motion.div
                initial={{ y: -50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="flex justify-center mb-6"
              >
                <div className="relative">
                  <Skull className="h-16 w-16 text-muted-foreground" />
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.5, type: 'spring' }}
                    className="absolute -bottom-2 -right-2"
                  >
                    <div
                      className={cn(
                        'h-8 w-8 rounded-full flex items-center justify-center',
                        isEvil ? 'bg-red-500' : 'bg-blue-500'
                      )}
                    >
                      <RoleIcon className="h-4 w-4 text-white" />
                    </div>
                  </motion.div>
                </div>
              </motion.div>

              {/* Player name */}
              <motion.h2
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-2xl font-bold text-center mb-2"
              >
                {playerName}
              </motion.h2>

              {/* Elimination reason */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-center text-muted-foreground mb-6"
              >
                {reason === 'voted'
                  ? t('WasVotedOut', 'was voted out by the village')
                  : t('WasKilledAtNight', 'was killed during the night')}
              </motion.p>

              {/* Role reveal */}
              <motion.div
                initial={{ scale: 0, rotateY: 180 }}
                animate={{ scale: 1, rotateY: 0 }}
                transition={{
                  delay: 0.8,
                  type: 'spring',
                  stiffness: 200,
                  damping: 15,
                }}
                className="text-center"
              >
                <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-secondary/50">
                  <RoleIcon
                    className={cn(
                      'h-6 w-6',
                      isEvil ? 'text-red-500' : 'text-blue-500'
                    )}
                  />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {t('TheyWere', 'They were')}
                    </p>
                    <p
                      className={cn(
                        'text-xl font-bold',
                        isEvil ? 'text-red-500' : 'text-blue-500'
                      )}
                    >
                      {t(role, role)}
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* Sparkle effects */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.2 }}
                className="absolute inset-0 pointer-events-none"
              >
                {[...Array(6)].map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{
                      opacity: [0, 1, 0],
                      scale: [0, 1, 0],
                      x: Math.random() * 200 - 100,
                      y: Math.random() * 200 - 100,
                    }}
                    transition={{
                      delay: 1.5 + i * 0.1,
                      duration: 1.5,
                      ease: 'easeOut',
                    }}
                    className="absolute top-1/2 left-1/2"
                  >
                    <Sparkles
                      className={cn(
                        'h-4 w-4',
                        isEvil ? 'text-red-400' : 'text-blue-400'
                      )}
                    />
                  </motion.div>
                ))}
              </motion.div>

              {/* Bottom message */}
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.5 }}
                className="text-center text-sm text-muted-foreground mt-6"
              >
                {isEvil
                  ? t('OneFewerThreat', 'One fewer threat to the village')
                  : t('InnocentLost', 'An innocent soul has been lost')}
              </motion.p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
