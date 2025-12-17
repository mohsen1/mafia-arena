'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings,
  Clock,
  Brain,
  Volume2,
  Eye,
  Zap,
  Shield,
  ChevronDown,
  ChevronUp,
  Info,
  Save,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

interface AdvancedGameSettingsProps {
  onSettingsChange?: (settings: GameSettings) => void;
  className?: string;
}

export interface GameSettings {
  // Timing Settings
  dayPhaseDuration: number; // in minutes
  nightPhaseDuration: number; // in minutes
  votingTimeout: number; // in seconds
  discussionMinTime: number; // in seconds
  autoAdvancePhases: boolean;

  // AI Behavior Settings
  aiPersonalityStrength: number; // 0-100
  aiResponseDelay: number; // in seconds
  aiMemoryDepth: number; // number of rounds to remember
  aiSuspicionSensitivity: number; // 0-100
  aiCooperationLevel: number; // 0-100

  // Game Rules
  revealRolesOnDeath: boolean;
  allowAbstention: boolean;
  majorityVoteRequired: boolean;
  tieBreakerMode: 'random' | 'no-elimination' | 'revote';
  doctorSelfHeal: boolean;
  seerSelfInvestigate: boolean;

  // Visual & Audio
  enableSoundEffects: boolean;
  enableAnimations: boolean;
  enableNotifications: boolean;
  showPlayerStats: boolean;
  showVotingVisualization: boolean;

  // Difficulty
  difficultyLevel: 'easy' | 'normal' | 'hard' | 'expert';
  hintsEnabled: boolean;
  aiAssistance: boolean;
}

const DEFAULT_SETTINGS: GameSettings = {
  // Timing
  dayPhaseDuration: 5,
  nightPhaseDuration: 3,
  votingTimeout: 60,
  discussionMinTime: 30,
  autoAdvancePhases: true,

  // AI Behavior
  aiPersonalityStrength: 70,
  aiResponseDelay: 3,
  aiMemoryDepth: 5,
  aiSuspicionSensitivity: 50,
  aiCooperationLevel: 60,

  // Game Rules
  revealRolesOnDeath: true,
  allowAbstention: true,
  majorityVoteRequired: true,
  tieBreakerMode: 'random',
  doctorSelfHeal: false,
  seerSelfInvestigate: false,

  // Visual & Audio
  enableSoundEffects: true,
  enableAnimations: true,
  enableNotifications: true,
  showPlayerStats: true,
  showVotingVisualization: true,

  // Difficulty
  difficultyLevel: 'normal',
  hintsEnabled: true,
  aiAssistance: true,
};

export function AdvancedGameSettings({
  onSettingsChange,
  className,
}: AdvancedGameSettingsProps) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const updateSetting = <K extends keyof GameSettings>(
    key: K,
    value: GameSettings[K]
  ) => {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
    setHasChanges(true);
  };

  const saveSettings = () => {
    onSettingsChange?.(settings);
    setHasChanges(false);
    toast.success(t('SettingsSaved', 'Settings saved successfully'));
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    setHasChanges(false);
    toast.info(t('SettingsReset', 'Settings reset to defaults'));
  };

  const getDifficultyDescription = (level: GameSettings['difficultyLevel']) => {
    switch (level) {
      case 'easy':
        return t(
          'DifficultyEasyDesc',
          'More hints, forgiving AI, longer timers'
        );
      case 'normal':
        return t('DifficultyNormalDesc', 'Balanced gameplay for most players');
      case 'hard':
        return t(
          'DifficultyHardDesc',
          'Challenging AI, shorter timers, fewer hints'
        );
      case 'expert':
        return t(
          'DifficultyExpertDesc',
          'No hints, aggressive AI, minimal time'
        );
    }
  };

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            {t('AdvancedSettings', 'Advanced Settings')}
          </span>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <Badge variant="secondary" className="text-xs">
                {t('Unsaved', 'Unsaved')}
              </Badge>
            )}
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </div>
        </CardTitle>
      </CardHeader>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <CardContent className="space-y-4 p-4">
              <Tabs defaultValue="timing" className="w-full">
                <TabsList className="grid grid-cols-5 w-full h-auto">
                  <TabsTrigger value="timing" className="text-xs">
                    <Clock className="w-3 h-3 me-1" />
                    {t('Timing', 'Timing')}
                  </TabsTrigger>
                  <TabsTrigger value="ai" className="text-xs">
                    <Brain className="w-3 h-3 me-1" />
                    {t('AI', 'AI')}
                  </TabsTrigger>
                  <TabsTrigger value="rules" className="text-xs">
                    <Shield className="w-3 h-3 me-1" />
                    {t('Rules', 'Rules')}
                  </TabsTrigger>
                  <TabsTrigger value="display" className="text-xs">
                    <Eye className="w-3 h-3 me-1" />
                    {t('Display', 'Display')}
                  </TabsTrigger>
                  <TabsTrigger value="difficulty" className="text-xs">
                    <Zap className="w-3 h-3 me-1" />
                    {t('Difficulty', 'Difficulty')}
                  </TabsTrigger>
                </TabsList>

                <TooltipProvider>
                  {/* Timing Settings */}
                  <TabsContent value="timing" className="space-y-4 mt-4">
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs flex items-center gap-1">
                            {t('DayPhaseDuration', 'Day Phase Duration')}
                            <Tooltip>
                              <TooltipTrigger>
                                <Info className="w-3 h-3 text-muted-foreground" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">
                                  {t(
                                    'DayPhaseDesc',
                                    'Time for discussion and voting'
                                  )}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </Label>
                          <span className="text-xs font-medium">
                            {settings.dayPhaseDuration} {t('minutes', 'min')}
                          </span>
                        </div>
                        <Slider
                          value={[settings.dayPhaseDuration]}
                          onValueChange={([value]) =>
                            updateSetting('dayPhaseDuration', value)
                          }
                          min={1}
                          max={10}
                          step={1}
                          className="w-full"
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">
                            {t('NightPhaseDuration', 'Night Phase Duration')}
                          </Label>
                          <span className="text-xs font-medium">
                            {settings.nightPhaseDuration} {t('minutes', 'min')}
                          </span>
                        </div>
                        <Slider
                          value={[settings.nightPhaseDuration]}
                          onValueChange={([value]) =>
                            updateSetting('nightPhaseDuration', value)
                          }
                          min={1}
                          max={5}
                          step={1}
                          className="w-full"
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <Label className="text-xs">
                          {t('AutoAdvancePhases', 'Auto-advance phases')}
                        </Label>
                        <Switch
                          checked={settings.autoAdvancePhases}
                          onCheckedChange={(checked) =>
                            updateSetting('autoAdvancePhases', checked)
                          }
                        />
                      </div>
                    </div>
                  </TabsContent>

                  {/* AI Settings */}
                  <TabsContent value="ai" className="space-y-4 mt-4">
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs flex items-center gap-1">
                            {t('AIPersonality', 'AI Personality Strength')}
                            <Tooltip>
                              <TooltipTrigger>
                                <Info className="w-3 h-3 text-muted-foreground" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">
                                  {t(
                                    'PersonalityDesc',
                                    'How strongly AI sticks to personality'
                                  )}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </Label>
                          <span className="text-xs font-medium">
                            {settings.aiPersonalityStrength}%
                          </span>
                        </div>
                        <Slider
                          value={[settings.aiPersonalityStrength]}
                          onValueChange={([value]) =>
                            updateSetting('aiPersonalityStrength', value)
                          }
                          min={0}
                          max={100}
                          step={10}
                          className="w-full"
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">
                            {t('AISuspicion', 'AI Suspicion Sensitivity')}
                          </Label>
                          <span className="text-xs font-medium">
                            {settings.aiSuspicionSensitivity}%
                          </span>
                        </div>
                        <Slider
                          value={[settings.aiSuspicionSensitivity]}
                          onValueChange={([value]) =>
                            updateSetting('aiSuspicionSensitivity', value)
                          }
                          min={0}
                          max={100}
                          step={10}
                          className="w-full"
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">
                            {t('AIMemoryDepth', 'AI Memory (rounds)')}
                          </Label>
                          <span className="text-xs font-medium">
                            {settings.aiMemoryDepth}
                          </span>
                        </div>
                        <Slider
                          value={[settings.aiMemoryDepth]}
                          onValueChange={([value]) =>
                            updateSetting('aiMemoryDepth', value)
                          }
                          min={1}
                          max={10}
                          step={1}
                          className="w-full"
                        />
                      </div>
                    </div>
                  </TabsContent>

                  {/* Game Rules */}
                  <TabsContent value="rules" className="space-y-4 mt-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">
                          {t('RevealRolesOnDeath', 'Reveal roles on death')}
                        </Label>
                        <Switch
                          checked={settings.revealRolesOnDeath}
                          onCheckedChange={(checked) =>
                            updateSetting('revealRolesOnDeath', checked)
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <Label className="text-xs">
                          {t('AllowAbstention', 'Allow vote abstention')}
                        </Label>
                        <Switch
                          checked={settings.allowAbstention}
                          onCheckedChange={(checked) =>
                            updateSetting('allowAbstention', checked)
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <Label className="text-xs">
                          {t('DoctorSelfHeal', 'Doctor can self-heal')}
                        </Label>
                        <Switch
                          checked={settings.doctorSelfHeal}
                          onCheckedChange={(checked) =>
                            updateSetting('doctorSelfHeal', checked)
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs">
                          {t('TieBreakerMode', 'Tie breaker mode')}
                        </Label>
                        <Select
                          value={settings.tieBreakerMode}
                          onValueChange={(value) =>
                            updateSetting(
                              'tieBreakerMode',
                              value as GameSettings['tieBreakerMode']
                            )
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="random" className="text-xs">
                              {t('RandomElimination', 'Random elimination')}
                            </SelectItem>
                            <SelectItem
                              value="no-elimination"
                              className="text-xs"
                            >
                              {t('NoElimination', 'No elimination')}
                            </SelectItem>
                            <SelectItem value="revote" className="text-xs">
                              {t('Revote', 'Force revote')}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </TabsContent>

                  {/* Display Settings */}
                  <TabsContent value="display" className="space-y-4 mt-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs flex items-center gap-1">
                          <Volume2 className="w-3 h-3" />
                          {t('EnableSoundEffects', 'Sound effects')}
                        </Label>
                        <Switch
                          checked={settings.enableSoundEffects}
                          onCheckedChange={(checked) =>
                            updateSetting('enableSoundEffects', checked)
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <Label className="text-xs">
                          {t('EnableAnimations', 'Animations')}
                        </Label>
                        <Switch
                          checked={settings.enableAnimations}
                          onCheckedChange={(checked) =>
                            updateSetting('enableAnimations', checked)
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <Label className="text-xs">
                          {t('ShowPlayerStats', 'Show player statistics')}
                        </Label>
                        <Switch
                          checked={settings.showPlayerStats}
                          onCheckedChange={(checked) =>
                            updateSetting('showPlayerStats', checked)
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <Label className="text-xs">
                          {t('ShowVotingViz', 'Voting visualization')}
                        </Label>
                        <Switch
                          checked={settings.showVotingVisualization}
                          onCheckedChange={(checked) =>
                            updateSetting('showVotingVisualization', checked)
                          }
                        />
                      </div>
                    </div>
                  </TabsContent>

                  {/* Difficulty Settings */}
                  <TabsContent value="difficulty" className="space-y-4 mt-4">
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label className="text-xs">
                          {t('DifficultyLevel', 'Difficulty Level')}
                        </Label>
                        <Select
                          value={settings.difficultyLevel}
                          onValueChange={(value) =>
                            updateSetting(
                              'difficultyLevel',
                              value as GameSettings['difficultyLevel']
                            )
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="easy" className="text-xs">
                              {t('Easy', 'Easy')}
                            </SelectItem>
                            <SelectItem value="normal" className="text-xs">
                              {t('Normal', 'Normal')}
                            </SelectItem>
                            <SelectItem value="hard" className="text-xs">
                              {t('Hard', 'Hard')}
                            </SelectItem>
                            <SelectItem value="expert" className="text-xs">
                              {t('Expert', 'Expert')}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          {getDifficultyDescription(settings.difficultyLevel)}
                        </p>
                      </div>

                      <div className="flex items-center justify-between">
                        <Label className="text-xs">
                          {t('EnableHints', 'Enable hints')}
                        </Label>
                        <Switch
                          checked={settings.hintsEnabled}
                          onCheckedChange={(checked) =>
                            updateSetting('hintsEnabled', checked)
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <Label className="text-xs">
                          {t('AIAssistance', 'AI assistance')}
                        </Label>
                        <Switch
                          checked={settings.aiAssistance}
                          onCheckedChange={(checked) =>
                            updateSetting('aiAssistance', checked)
                          }
                        />
                      </div>
                    </div>
                  </TabsContent>
                </TooltipProvider>
              </Tabs>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetSettings}
                  className="text-xs"
                >
                  <RotateCcw className="w-3 h-3 me-1" />
                  {t('ResetDefaults', 'Reset Defaults')}
                </Button>
                <Button
                  size="sm"
                  onClick={saveSettings}
                  disabled={!hasChanges}
                  className="text-xs"
                >
                  <Save className="w-3 h-3 me-1" />
                  {t('SaveSettings', 'Save Settings')}
                </Button>
              </div>
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
