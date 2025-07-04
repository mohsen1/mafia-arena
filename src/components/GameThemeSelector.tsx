'use client';

import * as React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getThemes } from '@/lib/utils/themeLoader'; // Import theme loader utility
import { useTranslation } from 'react-i18next';
import { BookOpen, Info } from 'lucide-react'; // Example icon

interface GameThemeSelectorProps {
  selectedThemeKey: string;
  onThemeChange: (themeKey: string) => void;
  disabled?: boolean;
}

export function GameThemeSelector({
  selectedThemeKey,
  onThemeChange,
  disabled = false,
}: GameThemeSelectorProps) {
  const { t } = useTranslation();
  const themes = getThemes();
  const themeEntries = Object.entries(themes);
  const [showDescriptionModal, setShowDescriptionModal] = React.useState(false);

  const selectedTheme = themes[selectedThemeKey];

  return (
    <div className="flex flex-col items-start justify-center gap-1 w-full">
      <Label className="text-sm font-medium text-muted-foreground whitespace-nowrap flex items-center gap-1">
        <BookOpen size={16} className="me-1" /> {/* Theme icon */}
        {t('GameThemeLabel', 'Game Theme')}:
      </Label>
      <div className="flex items-center gap-2 w-full">
        <Select
          value={selectedThemeKey}
          onValueChange={onThemeChange}
          disabled={disabled}
        >
          <SelectTrigger className="flex-1">
            <SelectValue
              placeholder={t('SelectGameThemePlaceholder', 'Select a theme')}
            />
          </SelectTrigger>
          <SelectContent>
            {themeEntries.map(([key, theme]) => (
              <SelectItem key={key} value={key}>
                {t(`${key}_name`, theme.name)}{' '}
                {/* Use translation for theme name */}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Info button */}
        {selectedTheme && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full"
            onClick={() => setShowDescriptionModal(true)}
            disabled={disabled}
          >
            <Info className="h-4 w-4" />
            <span className="sr-only">
              {t('ThemeInfoButton', 'Theme information')}
            </span>
          </Button>
        )}
      </div>

      {/* Theme description modal */}
      <Dialog
        open={showDescriptionModal}
        onOpenChange={setShowDescriptionModal}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              {selectedTheme &&
                t(`${selectedThemeKey}_name`, selectedTheme.name)}
            </DialogTitle>
            <DialogDescription className="text-left mt-4">
              {selectedTheme &&
                t(`${selectedThemeKey}_description`, selectedTheme.description)}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
