'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HelpCircle, Palette, MapPin, Clock, Users } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface GameThemeInfoDialogProps {
  themeKey: string;
  description?: string;
  className?: string;
}

export function GameThemeInfoDialog({
  themeKey,
  description,
}: Omit<GameThemeInfoDialogProps, 'className'>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  // Format theme key for display (convert underscores to spaces, capitalize)
  const formatThemeName = (key: string) => {
    return key
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  const themeName = formatThemeName(themeKey);

  // Get theme-specific details based on theme key
  const getThemeDetails = (key: string) => {
    const details: Record<
      string,
      { setting: string; era: string; atmosphere: string; features: string[] }
    > = {
      UK_VILLAGE_1900S: {
        setting: 'Rural English Village',
        era: '1900s',
        atmosphere: 'Gothic Victorian',
        features: [
          'Gas-lit streets',
          'Village square',
          'Traditional inn',
          'Church bells',
        ],
      },
      MODERN_CITY: {
        setting: 'Metropolitan City',
        era: 'Present Day',
        atmosphere: 'Urban Contemporary',
        features: [
          'Skyscrapers',
          'Digital communication',
          'Coffee shops',
          'Public transport',
        ],
      },
      MEDIEVAL_FANTASY: {
        setting: 'Fantasy Realm',
        era: 'Medieval',
        atmosphere: 'Mystical Adventure',
        features: [
          'Castle grounds',
          'Magical elements',
          'Taverns',
          'Ancient mysteries',
        ],
      },
      SCI_FI_SPACE: {
        setting: 'Space Station',
        era: 'Future',
        atmosphere: 'High-tech Thriller',
        features: [
          'Zero gravity',
          'Advanced AI',
          'Holographic displays',
          'Space views',
        ],
      },
    };

    return (
      details[key] || {
        setting: 'Unknown Setting',
        era: 'Unspecified',
        atmosphere: 'Mysterious',
        features: ['Unique environment', 'Special atmosphere'],
      }
    );
  };

  const themeDetails = getThemeDetails(themeKey);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-4 w-4 p-0 text-muted-foreground hover:text-foreground"
        >
          <HelpCircle className="h-3 w-3" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5" />
            {t('Game Theme', 'Game Theme')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'Learn about the setting and atmosphere of this game',
              'Learn about the setting and atmosphere of this game'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-center">{themeName}</h3>
            {description && (
              <p className="text-sm text-muted-foreground mt-2 text-center">
                {description}
              </p>
            )}
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                {t('Setting', 'Setting')}:
              </span>
              <Badge variant="secondary">{themeDetails.setting}</Badge>
            </div>

            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t('Era', 'Era')}:</span>
              <Badge variant="secondary">{themeDetails.era}</Badge>
            </div>

            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                {t('Atmosphere', 'Atmosphere')}:
              </span>
              <Badge variant="secondary">{themeDetails.atmosphere}</Badge>
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="text-sm font-medium mb-2">
              {t('Theme Features', 'Theme Features')}:
            </h4>
            <div className="flex flex-wrap gap-1">
              {themeDetails.features.map((feature, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {feature}
                </Badge>
              ))}
            </div>
          </div>

          <div className="text-xs text-muted-foreground text-center mt-4">
            {t(
              "This theme influences the game's narrative style and character descriptions.",
              "This theme influences the game's narrative style and character descriptions."
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
