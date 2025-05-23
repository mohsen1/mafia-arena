"use client";

import * as React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Themes } from "@/lib/engine/interfaces/Theme"; // Import the game themes
import { useTranslation } from "react-i18next";
import { BookOpen } from "lucide-react"; // Example icon

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
  const themeEntries = Object.entries(Themes);

  return (
    <div className="flex flex-col items-start justify-center gap-1 w-full">
      <Label className="text-sm font-medium text-muted-foreground whitespace-nowrap flex items-center gap-1">
        <BookOpen size={16} className="me-1" /> {/* Theme icon */}
        {t("GameThemeLabel", "Game Theme")}:
      </Label>
      <Select
        value={selectedThemeKey}
        onValueChange={onThemeChange}
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder={t("SelectGameThemePlaceholder", "Select a theme")} />
        </SelectTrigger>
        <SelectContent>
          {themeEntries.map(([key, theme]) => (
            <SelectItem key={key} value={key}>
              {t(`${key}_name`, theme.name)} {/* Use translation for theme name */}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {/* Display translated description */}
      {Themes[selectedThemeKey] && (
          <p className="text-xs text-muted-foreground mt-1 px-1">
              {t(`${selectedThemeKey}_description`, Themes[selectedThemeKey].description)}
          </p>
      )}
    </div>
  );
} 