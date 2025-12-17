'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  Play,
  Pause,
  SkipForward,
  Volume2,
  VolumeX,
  Keyboard,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface MobileGameControllerProps {
  isAutoMode: boolean;
  isPaused: boolean;
  isLoading: boolean;
  soundEnabled: boolean;
  onToggleAutoMode: () => void;
  onAdvanceTurn: () => void;
  onToggleSound: () => void;
  onShowKeyboardShortcuts: () => void;
  className?: string;
}

export function MobileGameController({
  isAutoMode,
  isPaused,
  isLoading,
  soundEnabled,
  onToggleAutoMode,
  onAdvanceTurn,
  onToggleSound,
  onShowKeyboardShortcuts,
  className,
}: MobileGameControllerProps) {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      className={cn(
        'fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-md border-t md:hidden z-30',
        className
      )}
    >
      <div className="flex items-center justify-around p-4 gap-2">
        {/* Auto Mode Toggle */}
        <Button
          variant={isAutoMode && !isPaused ? 'default' : 'outline'}
          size="icon"
          onClick={onToggleAutoMode}
          disabled={isLoading}
          className="h-12 w-12"
          title={
            isPaused
              ? t('ResumeAutoMode')
              : isAutoMode
                ? t('PauseAutoMode')
                : t('StartAutoMode')
          }
        >
          {isPaused || !isAutoMode ? (
            <Play className="h-5 w-5" />
          ) : (
            <Pause className="h-5 w-5" />
          )}
        </Button>

        {/* Advance Turn */}
        <Button
          variant="outline"
          size="icon"
          onClick={onAdvanceTurn}
          disabled={isLoading || isAutoMode}
          className="h-12 w-12"
          title={t('NextTurn')}
        >
          <SkipForward className="h-5 w-5" />
        </Button>

        {/* Sound Toggle */}
        <Button
          variant="outline"
          size="icon"
          onClick={onToggleSound}
          className="h-12 w-12"
          title={soundEnabled ? t('MuteSound') : t('UnmuteSound')}
        >
          {soundEnabled ? (
            <Volume2 className="h-5 w-5" />
          ) : (
            <VolumeX className="h-5 w-5" />
          )}
        </Button>

        {/* Keyboard Shortcuts (Hidden on mobile but keeping for tablets) */}
        <Button
          variant="outline"
          size="icon"
          onClick={onShowKeyboardShortcuts}
          className="h-12 w-12 hidden sm:flex"
          title={t('KeyboardShortcuts')}
        >
          <Keyboard className="h-5 w-5" />
        </Button>
      </div>
    </motion.div>
  );
}
