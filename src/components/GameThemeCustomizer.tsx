'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Palette,
  Eye,
  EyeOff,
  Save,
  RotateCcw,
  Download,
  Upload,
  Copy,
  Check,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { toast } from 'sonner';

interface GameThemeCustomizerProps {
  className?: string;
  onThemeChange?: (theme: CustomTheme) => void;
}

interface CustomTheme {
  name: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    foreground: string;
    muted: string;
    card: string;
    popover: string;
    border: string;
    destructive: string;
    success: string;
    warning: string;
  };
  typography: {
    fontFamily: string;
    fontSize: 'small' | 'medium' | 'large';
    lineHeight: 'tight' | 'normal' | 'relaxed';
  };
  spacing: {
    compact: boolean;
    padding: 'small' | 'medium' | 'large';
    borderRadius: 'none' | 'small' | 'medium' | 'large';
  };
  effects: {
    animations: boolean;
    shadows: boolean;
    gradients: boolean;
    blur: boolean;
  };
  gameSpecific: {
    messageStyle: 'bubbles' | 'cards' | 'minimal';
    avatarShape: 'circle' | 'square' | 'hexagon';
    phaseIndicator: 'banner' | 'badge' | 'minimal';
    votingStyle: 'buttons' | 'cards' | 'list';
  };
}

const DEFAULT_THEME: CustomTheme = {
  name: 'Default',
  colors: {
    primary: '#3b82f6',
    secondary: '#8b5cf6',
    accent: '#f59e0b',
    background: '#ffffff',
    foreground: '#020817',
    muted: '#f1f5f9',
    card: '#ffffff',
    popover: '#ffffff',
    border: '#e2e8f0',
    destructive: '#ef4444',
    success: '#10b981',
    warning: '#f59e0b',
  },
  typography: {
    fontFamily: 'system-ui',
    fontSize: 'medium',
    lineHeight: 'normal',
  },
  spacing: {
    compact: false,
    padding: 'medium',
    borderRadius: 'medium',
  },
  effects: {
    animations: true,
    shadows: true,
    gradients: false,
    blur: true,
  },
  gameSpecific: {
    messageStyle: 'bubbles',
    avatarShape: 'circle',
    phaseIndicator: 'banner',
    votingStyle: 'buttons',
  },
};

const PRESET_THEMES = [
  {
    name: 'Dark Mode',
    theme: {
      ...DEFAULT_THEME,
      name: 'Dark Mode',
      colors: {
        ...DEFAULT_THEME.colors,
        background: '#020817',
        foreground: '#f8fafc',
        card: '#0f172a',
        popover: '#0f172a',
        border: '#1e293b',
        muted: '#1e293b',
      },
    },
  },
  {
    name: 'Vampire',
    theme: {
      ...DEFAULT_THEME,
      name: 'Vampire',
      colors: {
        ...DEFAULT_THEME.colors,
        primary: '#dc2626',
        secondary: '#7c2d12',
        accent: '#991b1b',
        background: '#0a0a0a',
        foreground: '#fef2f2',
      },
      effects: {
        ...DEFAULT_THEME.effects,
        gradients: true,
      },
    },
  },
  {
    name: 'Forest',
    theme: {
      ...DEFAULT_THEME,
      name: 'Forest',
      colors: {
        ...DEFAULT_THEME.colors,
        primary: '#059669',
        secondary: '#14532d',
        accent: '#84cc16',
        background: '#f0fdf4',
        foreground: '#052e16',
      },
    },
  },
];

export function GameThemeCustomizer({
  className,
  onThemeChange,
}: GameThemeCustomizerProps) {
  const { t } = useTranslation();
  const [theme, setTheme] = useState<CustomTheme>(DEFAULT_THEME);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const updateTheme = <K extends keyof CustomTheme>(
    section: K,
    updates: Partial<CustomTheme[K]>
  ) => {
    setTheme((prev) => ({
      ...prev,
      [section]: {
        ...(prev[section] as any),
        ...updates,
      },
    }));
    setHasChanges(true);
  };

  const updateColor = (
    colorKey: keyof CustomTheme['colors'],
    value: string
  ) => {
    updateTheme('colors', { [colorKey]: value });
  };

  const applyPreset = (preset: (typeof PRESET_THEMES)[0]) => {
    setTheme(preset.theme);
    setHasChanges(true);
    toast.success(`Applied ${preset.name} theme`);
  };

  const saveTheme = () => {
    onThemeChange?.(theme);
    setHasChanges(false);
    toast.success('Theme saved successfully');
  };

  const resetTheme = () => {
    setTheme(DEFAULT_THEME);
    setHasChanges(false);
    toast.info('Theme reset to defaults');
  };

  const exportTheme = () => {
    const themeData = JSON.stringify(theme, null, 2);
    const blob = new Blob([themeData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${theme.name.toLowerCase().replace(/\s+/g, '-')}-theme.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Theme exported');
  };

  const importTheme = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedTheme = JSON.parse(e.target?.result as string);
        setTheme(importedTheme);
        setHasChanges(true);
        toast.success('Theme imported successfully');
      } catch (error) {
        toast.error('Invalid theme file');
      }
    };
    reader.readAsText(file);
  };

  const copyThemeCSS = () => {
    const css = `
/* ${theme.name} Theme */
:root {
  --primary: ${theme.colors.primary};
  --secondary: ${theme.colors.secondary};
  --accent: ${theme.colors.accent};
  --background: ${theme.colors.background};
  --foreground: ${theme.colors.foreground};
  --muted: ${theme.colors.muted};
  --card: ${theme.colors.card};
  --popover: ${theme.colors.popover};
  --border: ${theme.colors.border};
  --destructive: ${theme.colors.destructive};
  --success: ${theme.colors.success};
  --warning: ${theme.colors.warning};
  
  --font-family: ${theme.typography.fontFamily};
  --font-size: ${theme.typography.fontSize};
  --line-height: ${theme.typography.lineHeight};
  
  --border-radius: ${theme.spacing.borderRadius};
}`;

    navigator.clipboard.writeText(css);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('CSS copied to clipboard');
  };

  // Apply theme preview
  useEffect(() => {
    if (!isPreviewMode) return;

    const root = document.documentElement;
    const originalStyles: Record<string, string> = {};

    // Store original values
    Object.entries(theme.colors).forEach(([key, value]) => {
      const cssVar = `--${key}`;
      originalStyles[cssVar] = getComputedStyle(root).getPropertyValue(cssVar);
      root.style.setProperty(cssVar, value);
    });

    // Cleanup
    return () => {
      Object.entries(originalStyles).forEach(([key, value]) => {
        root.style.setProperty(key, value);
      });
    };
  }, [theme, isPreviewMode]);

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader>
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Palette className="w-4 h-4" />
            {t('ThemeCustomizer', 'Theme Customizer')}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsPreviewMode(!isPreviewMode)}
              className="text-xs"
            >
              {isPreviewMode ? (
                <EyeOff className="w-3 h-3 me-1" />
              ) : (
                <Eye className="w-3 h-3 me-1" />
              )}
              {isPreviewMode
                ? t('HidePreview', 'Hide Preview')
                : t('Preview', 'Preview')}
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        {/* Theme Name */}
        <div className="space-y-2">
          <Label className="text-xs">{t('ThemeName', 'Theme Name')}</Label>
          <Input
            value={theme.name}
            onChange={(e) =>
              setTheme((prev) => ({ ...prev, name: e.target.value }))
            }
            className="h-8 text-xs"
          />
        </div>

        {/* Preset Themes */}
        <div className="space-y-2">
          <Label className="text-xs">
            {t('PresetThemes', 'Preset Themes')}
          </Label>
          <div className="grid grid-cols-3 gap-2">
            {PRESET_THEMES.map((preset) => (
              <Button
                key={preset.name}
                variant="outline"
                size="sm"
                onClick={() => applyPreset(preset)}
                className="text-xs"
              >
                <Sparkles className="w-3 h-3 me-1" />
                {preset.name}
              </Button>
            ))}
          </div>
        </div>

        {/* Customization Tabs */}
        <Tabs defaultValue="colors" className="w-full">
          <TabsList className="grid grid-cols-4 w-full h-auto">
            <TabsTrigger value="colors" className="text-xs">
              {t('Colors', 'Colors')}
            </TabsTrigger>
            <TabsTrigger value="typography" className="text-xs">
              {t('Typography', 'Typography')}
            </TabsTrigger>
            <TabsTrigger value="spacing" className="text-xs">
              {t('Spacing', 'Spacing')}
            </TabsTrigger>
            <TabsTrigger value="game" className="text-xs">
              {t('Game', 'Game')}
            </TabsTrigger>
          </TabsList>

          {/* Colors Tab */}
          <TabsContent value="colors" className="space-y-3 mt-4">
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(theme.colors).map(([key, value]) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs capitalize">{key}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      value={value}
                      onChange={(e) =>
                        updateColor(
                          key as keyof CustomTheme['colors'],
                          e.target.value
                        )
                      }
                      className="h-8 w-12 p-1 cursor-pointer"
                    />
                    <Input
                      value={value}
                      onChange={(e) =>
                        updateColor(
                          key as keyof CustomTheme['colors'],
                          e.target.value
                        )
                      }
                      className="h-8 text-xs flex-1"
                    />
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Typography Tab */}
          <TabsContent value="typography" className="space-y-3 mt-4">
            <div className="space-y-2">
              <Label className="text-xs">
                {t('FontFamily', 'Font Family')}
              </Label>
              <Select
                value={theme.typography.fontFamily}
                onValueChange={(value) =>
                  updateTheme('typography', { fontFamily: value })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system-ui" className="text-xs">
                    System UI
                  </SelectItem>
                  <SelectItem value="sans-serif" className="text-xs">
                    Sans Serif
                  </SelectItem>
                  <SelectItem value="serif" className="text-xs">
                    Serif
                  </SelectItem>
                  <SelectItem value="monospace" className="text-xs">
                    Monospace
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">{t('FontSize', 'Font Size')}</Label>
              <Select
                value={theme.typography.fontSize}
                onValueChange={(value) =>
                  updateTheme('typography', {
                    fontSize: value as CustomTheme['typography']['fontSize'],
                  })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small" className="text-xs">
                    Small
                  </SelectItem>
                  <SelectItem value="medium" className="text-xs">
                    Medium
                  </SelectItem>
                  <SelectItem value="large" className="text-xs">
                    Large
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          {/* Spacing Tab */}
          <TabsContent value="spacing" className="space-y-3 mt-4">
            <div className="flex items-center justify-between">
              <Label className="text-xs">
                {t('CompactMode', 'Compact Mode')}
              </Label>
              <Switch
                checked={theme.spacing.compact}
                onCheckedChange={(checked) =>
                  updateTheme('spacing', { compact: checked })
                }
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">
                {t('BorderRadius', 'Border Radius')}
              </Label>
              <Select
                value={theme.spacing.borderRadius}
                onValueChange={(value) =>
                  updateTheme('spacing', {
                    borderRadius:
                      value as CustomTheme['spacing']['borderRadius'],
                  })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs">
                    None
                  </SelectItem>
                  <SelectItem value="small" className="text-xs">
                    Small
                  </SelectItem>
                  <SelectItem value="medium" className="text-xs">
                    Medium
                  </SelectItem>
                  <SelectItem value="large" className="text-xs">
                    Large
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">{t('Effects', 'Effects')}</Label>
              <div className="space-y-2">
                {Object.entries(theme.effects).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between">
                    <Label className="text-xs capitalize">{key}</Label>
                    <Switch
                      checked={value}
                      onCheckedChange={(checked) =>
                        updateTheme('effects', { [key]: checked })
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Game Specific Tab */}
          <TabsContent value="game" className="space-y-3 mt-4">
            <div className="space-y-2">
              <Label className="text-xs">
                {t('MessageStyle', 'Message Style')}
              </Label>
              <Select
                value={theme.gameSpecific.messageStyle}
                onValueChange={(value) =>
                  updateTheme('gameSpecific', {
                    messageStyle:
                      value as CustomTheme['gameSpecific']['messageStyle'],
                  })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bubbles" className="text-xs">
                    Chat Bubbles
                  </SelectItem>
                  <SelectItem value="cards" className="text-xs">
                    Cards
                  </SelectItem>
                  <SelectItem value="minimal" className="text-xs">
                    Minimal
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">
                {t('AvatarShape', 'Avatar Shape')}
              </Label>
              <Select
                value={theme.gameSpecific.avatarShape}
                onValueChange={(value) =>
                  updateTheme('gameSpecific', {
                    avatarShape:
                      value as CustomTheme['gameSpecific']['avatarShape'],
                  })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="circle" className="text-xs">
                    Circle
                  </SelectItem>
                  <SelectItem value="square" className="text-xs">
                    Square
                  </SelectItem>
                  <SelectItem value="hexagon" className="text-xs">
                    Hexagon
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </TabsContent>
        </Tabs>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 pt-4 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={resetTheme}
            className="text-xs"
          >
            <RotateCcw className="w-3 h-3 me-1" />
            {t('Reset', 'Reset')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportTheme}
            className="text-xs"
          >
            <Download className="w-3 h-3 me-1" />
            {t('Export', 'Export')}
          </Button>
          <label>
            <Button
              variant="outline"
              size="sm"
              asChild
              className="text-xs cursor-pointer"
            >
              <span>
                <Upload className="w-3 h-3 me-1" />
                {t('Import', 'Import')}
              </span>
            </Button>
            <input
              type="file"
              accept=".json"
              onChange={importTheme}
              className="hidden"
            />
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={copyThemeCSS}
            className="text-xs"
          >
            {copied ? (
              <Check className="w-3 h-3 me-1" />
            ) : (
              <Copy className="w-3 h-3 me-1" />
            )}
            {t('CopyCSS', 'Copy CSS')}
          </Button>
          <div className="flex-1" />
          <Button
            size="sm"
            onClick={saveTheme}
            disabled={!hasChanges}
            className="text-xs"
          >
            <Save className="w-3 h-3 me-1" />
            {t('SaveTheme', 'Save Theme')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
