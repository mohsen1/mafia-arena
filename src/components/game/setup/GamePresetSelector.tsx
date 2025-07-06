'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  Zap,
  Clock,
  Settings,
  Users,
  Trophy,
  Sparkles,
  CheckCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { getThemeKeys } from '@/lib/utils/themeLoader';

export interface GamePreset {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  playerCount: number;
  humanPlayer: boolean;
  theme: string;
  difficulty: 'easy' | 'normal' | 'hard';
  estimatedTime: string;
  features: string[];
  color: string;
}

interface GamePresetSelectorProps {
  onSelect: (preset: GamePreset) => void;
  className?: string;
}

// Helper function to get a random theme
function getRandomTheme(): string {
  const themeKeys = getThemeKeys();
  const randomIndex = Math.floor(Math.random() * themeKeys.length);
  return themeKeys[randomIndex];
}

export function GamePresetSelector({
  onSelect,
  className,
}: GamePresetSelectorProps) {
  const { t } = useTranslation();
  const [selectedPreset, setSelectedPreset] = React.useState<string | null>(
    null
  );

  const presets: GamePreset[] = [
    {
      id: 'quick',
      name: t('gamePresets.quick.name'),
      description: t('gamePresets.quick.description'),
      icon: <Zap className="w-5 h-5" />,
      playerCount: 5,
      humanPlayer: true,
      theme: getRandomTheme(),
      difficulty: 'easy',
      estimatedTime: '10-15 min',
      features: [
        t('gamePresets.quick.feature1'),
        t('gamePresets.quick.feature2'),
        t('gamePresets.quick.feature3'),
      ],
      color: 'from-yellow-500/20 to-orange-500/20',
    },
    {
      id: 'classic',
      name: t('gamePresets.classic.name'),
      description: t('gamePresets.classic.description'),
      icon: <Trophy className="w-5 h-5" />,
      playerCount: 7,
      humanPlayer: true,
      theme: getRandomTheme(),
      difficulty: 'normal',
      estimatedTime: '20-30 min',
      features: [
        t('gamePresets.classic.feature1'),
        t('gamePresets.classic.feature2'),
        t('gamePresets.classic.feature3'),
      ],
      color: 'from-blue-500/20 to-purple-500/20',
    },
    {
      id: 'spectator',
      name: t('gamePresets.spectator.name'),
      description: t('gamePresets.spectator.description'),
      icon: <Users className="w-5 h-5" />,
      playerCount: 8,
      humanPlayer: false,
      theme: getRandomTheme(),
      difficulty: 'normal',
      estimatedTime: '25-35 min',
      features: [
        t('gamePresets.spectator.feature1'),
        t('gamePresets.spectator.feature2'),
        t('gamePresets.spectator.feature3'),
      ],
      color: 'from-green-500/20 to-teal-500/20',
    },
    {
      id: 'custom',
      name: t('gamePresets.custom.name'),
      description: t('gamePresets.custom.description'),
      icon: <Settings className="w-5 h-5" />,
      playerCount: 0,
      humanPlayer: true,
      theme: '',
      difficulty: 'normal',
      estimatedTime: t('gamePresets.custom.time'),
      features: [
        t('gamePresets.custom.feature1'),
        t('gamePresets.custom.feature2'),
        t('gamePresets.custom.feature3'),
      ],
      color: 'from-gray-500/20 to-gray-600/20',
    },
  ];

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
        return 'bg-green-500/20 text-green-700 dark:text-green-400';
      case 'normal':
        return 'bg-blue-500/20 text-blue-700 dark:text-blue-400';
      case 'hard':
        return 'bg-red-500/20 text-red-700 dark:text-red-400';
      default:
        return 'bg-gray-500/20 text-gray-700 dark:text-gray-400';
    }
  };

  const handleSelect = (preset: GamePreset) => {
    setSelectedPreset(preset.id);
    setTimeout(() => {
      onSelect(preset);
    }, 300);
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold mb-2">{t('gamePresets.title')}</h2>
        <p className="text-muted-foreground">{t('gamePresets.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {presets.map((preset, index) => (
          <motion.div
            key={preset.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card
              className={cn(
                'relative overflow-hidden cursor-pointer transition-all duration-300',
                'hover:shadow-lg hover:scale-[1.02]',
                selectedPreset === preset.id && 'ring-2 ring-primary'
              )}
              onClick={() => handleSelect(preset)}
            >
              <div
                className={cn(
                  'absolute inset-0 bg-gradient-to-br opacity-10',
                  preset.color
                )}
              />

              <CardHeader className="relative">
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {preset.icon}
                    <span>{preset.name}</span>
                  </div>
                  {preset.id !== 'custom' && (
                    <Badge variant="outline" className="text-xs">
                      {preset.playerCount} {t('common.players')}
                    </Badge>
                  )}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {preset.description}
                </p>
              </CardHeader>

              <CardContent className="relative space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span>{preset.estimatedTime}</span>
                  </div>
                  {preset.id !== 'custom' && (
                    <Badge className={getDifficultyColor(preset.difficulty)}>
                      {t(`gamePresets.difficulty.${preset.difficulty}`)}
                    </Badge>
                  )}
                </div>

                <div className="space-y-2">
                  {preset.features.map((feature, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <Sparkles className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>

                {selectedPreset === preset.id && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -bottom-1 -right-1 w-8 h-8 bg-primary rounded-tl-full flex items-center justify-center"
                  >
                    <CheckCircle className="w-4 h-4 text-primary-foreground" />
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="text-center mt-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSelect(presets[3])} // Custom preset
          className="text-muted-foreground"
        >
          {t('gamePresets.skipToCustom')}
        </Button>
      </div>
    </div>
  );
}
