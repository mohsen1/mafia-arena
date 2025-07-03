'use client';

import React from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';

interface SoundSettingsProps {
  enabled: boolean;
  volume: number;
  onEnabledChange: (enabled: boolean) => void;
  onVolumeChange: (volume: number) => void;
  className?: string;
}

export function SoundSettings({
  enabled,
  volume,
  onEnabledChange,
  onVolumeChange,
  className,
}: SoundSettingsProps) {
  const { t } = useTranslation();

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          {enabled ? (
            <Volume2 className="w-4 h-4" />
          ) : (
            <VolumeX className="w-4 h-4 text-muted-foreground" />
          )}
          {t('soundSettings.title', 'Sound Settings')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="sound-enabled" className="text-sm">
            {t('soundSettings.enableSounds', 'Enable sound effects')}
          </Label>
          <Switch
            id="sound-enabled"
            checked={enabled}
            onCheckedChange={onEnabledChange}
          />
        </div>

        {enabled && (
          <div className="space-y-2">
            <Label htmlFor="sound-volume" className="text-sm">
              {t('soundSettings.volume', 'Volume')}: {Math.round(volume * 100)}%
            </Label>
            <Slider
              id="sound-volume"
              min={0}
              max={100}
              step={5}
              value={[volume * 100]}
              onValueChange={([value]: number[]) => onVolumeChange(value / 100)}
              className="w-full"
            />
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {t(
            'soundSettings.description',
            'Sound effects play during key game events like voting, eliminations, and phase changes.'
          )}
        </p>
      </CardContent>
    </Card>
  );
} 