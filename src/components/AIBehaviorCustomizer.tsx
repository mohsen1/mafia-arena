'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Brain,
  Sliders,
  Sparkles,
  User,
  MessageSquare,
  Shield,
  Zap,
  Eye,
  Shuffle,
  Save,
  Download,
  Copy,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface AIBehaviorCustomizerProps {
  playerId?: string;
  playerName?: string;
  onBehaviorChange?: (behavior: AIBehaviorProfile) => void;
  className?: string;
}

export interface AIBehaviorProfile {
  id: string;
  name: string;

  // Core Personality Traits
  personality: {
    aggression: number; // 0-100: How confrontational
    suspicion: number; // 0-100: How paranoid/trusting
    talkativeness: number; // 0-100: How much they speak
    logic: number; // 0-100: Logical vs emotional
    deception: number; // 0-100: Honesty vs lying tendency
    leadership: number; // 0-100: Follower vs leader
    empathy: number; // 0-100: Cold vs caring
    humor: number; // 0-100: Serious vs humorous
  };

  // Communication Style
  communication: {
    formality: 'casual' | 'neutral' | 'formal';
    verbosity: 'concise' | 'moderate' | 'verbose';
    emotiveness: 'stoic' | 'balanced' | 'expressive';
    argumentStyle: 'passive' | 'assertive' | 'aggressive';
    responseSpeed: 'instant' | 'thoughtful' | 'delayed';
  };

  // Strategic Behavior
  strategy: {
    riskTaking: number; // 0-100: Conservative vs risky
    alliance: number; // 0-100: Lone wolf vs team player
    adaptability: number; // 0-100: Rigid vs flexible
    information: number; // 0-100: Secretive vs open
    targeting: 'random' | 'threats' | 'weak' | 'vocal' | 'quiet';
    votingPattern: 'bandwagon' | 'contrarian' | 'analytical' | 'emotional';
  };

  // Role-Specific Behaviors
  roleSpecific: {
    mafiaAggression: number; // 0-100: How aggressive as mafia
    doctorStrategy: 'self' | 'leaders' | 'random' | 'pattern';
    seerPriority: 'suspicious' | 'quiet' | 'leaders' | 'random';
    villagerActivity: 'passive' | 'investigative' | 'leadership';
  };

  // Special Traits
  traits: {
    hasGrudges: boolean; // Remembers who voted against them
    isVengeful: boolean; // Targets those who wronged them
    usesHumor: boolean; // Makes jokes/puns
    isAnalytical: boolean; // Uses statistics and logic
    isEmotional: boolean; // Makes emotional appeals
    isManipulative: boolean; // Uses psychological tactics
    hasQuirks: boolean; // Has unique speech patterns
  };

  // Custom Behaviors
  customBehaviors: {
    catchphrases: string[]; // Signature phrases
    triggers: string[]; // Words/events that provoke response
    avoidances: string[]; // Topics/words they avoid
    preferences: string[]; // Preferred discussion topics
  };
}

const DEFAULT_BEHAVIOR: AIBehaviorProfile = {
  id: 'default',
  name: 'Balanced',
  personality: {
    aggression: 50,
    suspicion: 50,
    talkativeness: 50,
    logic: 50,
    deception: 50,
    leadership: 50,
    empathy: 50,
    humor: 50,
  },
  communication: {
    formality: 'neutral',
    verbosity: 'moderate',
    emotiveness: 'balanced',
    argumentStyle: 'assertive',
    responseSpeed: 'thoughtful',
  },
  strategy: {
    riskTaking: 50,
    alliance: 50,
    adaptability: 50,
    information: 50,
    targeting: 'threats',
    votingPattern: 'analytical',
  },
  roleSpecific: {
    mafiaAggression: 50,
    doctorStrategy: 'pattern',
    seerPriority: 'suspicious',
    villagerActivity: 'investigative',
  },
  traits: {
    hasGrudges: false,
    isVengeful: false,
    usesHumor: false,
    isAnalytical: false,
    isEmotional: false,
    isManipulative: false,
    hasQuirks: false,
  },
  customBehaviors: {
    catchphrases: [],
    triggers: [],
    avoidances: [],
    preferences: [],
  },
};

const PRESET_BEHAVIORS: Array<{ name: string; profile: AIBehaviorProfile }> = [
  {
    name: 'The Detective',
    profile: {
      ...DEFAULT_BEHAVIOR,
      id: 'detective',
      name: 'The Detective',
      personality: {
        ...DEFAULT_BEHAVIOR.personality,
        suspicion: 80,
        logic: 90,
        talkativeness: 70,
        leadership: 75,
      },
      communication: {
        ...DEFAULT_BEHAVIOR.communication,
        argumentStyle: 'assertive',
        formality: 'formal',
      },
      traits: {
        ...DEFAULT_BEHAVIOR.traits,
        isAnalytical: true,
      },
    },
  },
  {
    name: 'The Manipulator',
    profile: {
      ...DEFAULT_BEHAVIOR,
      id: 'manipulator',
      name: 'The Manipulator',
      personality: {
        ...DEFAULT_BEHAVIOR.personality,
        deception: 85,
        empathy: 70,
        aggression: 30,
        leadership: 60,
      },
      traits: {
        ...DEFAULT_BEHAVIOR.traits,
        isManipulative: true,
        isEmotional: true,
      },
    },
  },
  {
    name: 'The Jester',
    profile: {
      ...DEFAULT_BEHAVIOR,
      id: 'jester',
      name: 'The Jester',
      personality: {
        ...DEFAULT_BEHAVIOR.personality,
        humor: 90,
        talkativeness: 80,
        logic: 30,
        aggression: 20,
      },
      traits: {
        ...DEFAULT_BEHAVIOR.traits,
        usesHumor: true,
        hasQuirks: true,
      },
    },
  },
  {
    name: 'The Silent Observer',
    profile: {
      ...DEFAULT_BEHAVIOR,
      id: 'observer',
      name: 'The Silent Observer',
      personality: {
        ...DEFAULT_BEHAVIOR.personality,
        talkativeness: 20,
        suspicion: 70,
        logic: 80,
      },
      communication: {
        ...DEFAULT_BEHAVIOR.communication,
        verbosity: 'concise',
        responseSpeed: 'delayed',
      },
    },
  },
];

export function AIBehaviorCustomizer({
  playerId,
  playerName,
  onBehaviorChange,
  className,
}: AIBehaviorCustomizerProps) {
  const { t } = useTranslation();
  const [behavior, setBehavior] = useState<AIBehaviorProfile>(DEFAULT_BEHAVIOR);
  const [hasChanges, setHasChanges] = useState(false);
  const [copied, setCopied] = useState(false);
  const [customInput, setCustomInput] = useState({
    catchphrase: '',
    trigger: '',
    avoidance: '',
    preference: '',
  });

  const updatePersonality = (
    trait: keyof AIBehaviorProfile['personality'],
    value: number
  ) => {
    setBehavior((prev) => ({
      ...prev,
      personality: { ...prev.personality, [trait]: value },
    }));
    setHasChanges(true);
  };

  const updateStrategy = (
    trait: keyof AIBehaviorProfile['strategy'],
    value: any
  ) => {
    setBehavior((prev) => ({
      ...prev,
      strategy: { ...prev.strategy, [trait]: value },
    }));
    setHasChanges(true);
  };

  const updateCommunication = (
    trait: keyof AIBehaviorProfile['communication'],
    value: any
  ) => {
    setBehavior((prev) => ({
      ...prev,
      communication: { ...prev.communication, [trait]: value },
    }));
    setHasChanges(true);
  };

  const updateTrait = (
    trait: keyof AIBehaviorProfile['traits'],
    value: boolean
  ) => {
    setBehavior((prev) => ({
      ...prev,
      traits: { ...prev.traits, [trait]: value },
    }));
    setHasChanges(true);
  };

  const addCustomBehavior = (
    type: keyof AIBehaviorProfile['customBehaviors'],
    value: string
  ) => {
    if (!value.trim()) return;

    setBehavior((prev) => ({
      ...prev,
      customBehaviors: {
        ...prev.customBehaviors,
        [type]: [...prev.customBehaviors[type], value.trim()],
      },
    }));
    setCustomInput((prev) => ({ ...prev, [type.slice(0, -1)]: '' }));
    setHasChanges(true);
  };

  const removeCustomBehavior = (
    type: keyof AIBehaviorProfile['customBehaviors'],
    index: number
  ) => {
    setBehavior((prev) => ({
      ...prev,
      customBehaviors: {
        ...prev.customBehaviors,
        [type]: prev.customBehaviors[type].filter((_, i) => i !== index),
      },
    }));
    setHasChanges(true);
  };

  const applyPreset = (preset: (typeof PRESET_BEHAVIORS)[0]) => {
    setBehavior({
      ...preset.profile,
      id: `${preset.profile.id}-${Date.now()}`,
    });
    setHasChanges(true);
    toast(`Applied ${preset.name} behavior profile`);
  };

  const randomizeBehavior = () => {
    const randomBehavior: AIBehaviorProfile = {
      ...behavior,
      personality: {
        aggression: Math.floor(Math.random() * 101),
        suspicion: Math.floor(Math.random() * 101),
        talkativeness: Math.floor(Math.random() * 101),
        logic: Math.floor(Math.random() * 101),
        deception: Math.floor(Math.random() * 101),
        leadership: Math.floor(Math.random() * 101),
        empathy: Math.floor(Math.random() * 101),
        humor: Math.floor(Math.random() * 101),
      },
      strategy: {
        ...behavior.strategy,
        riskTaking: Math.floor(Math.random() * 101),
        alliance: Math.floor(Math.random() * 101),
        adaptability: Math.floor(Math.random() * 101),
        information: Math.floor(Math.random() * 101),
      },
      traits: {
        hasGrudges: Math.random() > 0.5,
        isVengeful: Math.random() > 0.7,
        usesHumor: Math.random() > 0.5,
        isAnalytical: Math.random() > 0.5,
        isEmotional: Math.random() > 0.5,
        isManipulative: Math.random() > 0.7,
        hasQuirks: Math.random() > 0.6,
      },
    };
    setBehavior(randomBehavior);
    setHasChanges(true);
    toast('Generated random behavior profile');
  };

  const saveBehavior = () => {
    onBehaviorChange?.(behavior);
    setHasChanges(false);
    toast('Behavior profile saved');
  };

  const exportBehavior = () => {
    const data = JSON.stringify(behavior, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-behavior-${behavior.name.toLowerCase().replace(/\s+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Behavior profile exported');
  };

  const copyBehaviorCode = () => {
    const code = JSON.stringify(behavior, null, 2);
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Behavior code copied to clipboard');
  };

  const getPersonalityDescription = () => {
    const p = behavior.personality;
    const traits = [];

    if (p.aggression > 70) traits.push('Aggressive');
    else if (p.aggression < 30) traits.push('Peaceful');

    if (p.suspicion > 70) traits.push('Paranoid');
    else if (p.suspicion < 30) traits.push('Trusting');

    if (p.talkativeness > 70) traits.push('Talkative');
    else if (p.talkativeness < 30) traits.push('Quiet');

    if (p.logic > 70) traits.push('Logical');
    else if (p.logic < 30) traits.push('Emotional');

    if (p.deception > 70) traits.push('Deceptive');
    else if (p.deception < 30) traits.push('Honest');

    return traits.join(', ') || 'Balanced';
  };

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader>
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Brain className="w-4 h-4" />
            {t('AIBehaviorCustomizer', 'AI Behavior Customizer')}
            {playerName && (
              <Badge variant="secondary" className="text-xs">
                {playerName}
              </Badge>
            )}
          </span>
          <Badge variant="outline" className="text-xs">
            {getPersonalityDescription()}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        {/* Preset Behaviors */}
        <div className="space-y-2">
          <Label className="text-xs">
            {t('PresetBehaviors', 'Preset Behaviors')}
          </Label>
          <div className="grid grid-cols-2 gap-2">
            {PRESET_BEHAVIORS.map((preset) => (
              <Button
                key={preset.profile.id}
                variant="outline"
                size="sm"
                onClick={() => applyPreset(preset)}
                className="text-xs justify-start"
              >
                <Sparkles className="w-3 h-3 me-1" />
                {preset.name}
              </Button>
            ))}
          </div>
        </div>

        {/* Behavior Tabs */}
        <Tabs defaultValue="personality" className="w-full">
          <TabsList className="grid grid-cols-5 w-full h-auto">
            <TabsTrigger value="personality" className="text-xs">
              <User className="w-3 h-3 me-1" />
              {t('Personality', 'Personality')}
            </TabsTrigger>
            <TabsTrigger value="communication" className="text-xs">
              <MessageSquare className="w-3 h-3 me-1" />
              {t('Communication', 'Communication')}
            </TabsTrigger>
            <TabsTrigger value="strategy" className="text-xs">
              <Shield className="w-3 h-3 me-1" />
              {t('Strategy', 'Strategy')}
            </TabsTrigger>
            <TabsTrigger value="traits" className="text-xs">
              <Zap className="w-3 h-3 me-1" />
              {t('Traits', 'Traits')}
            </TabsTrigger>
            <TabsTrigger value="custom" className="text-xs">
              <Sliders className="w-3 h-3 me-1" />
              {t('Custom', 'Custom')}
            </TabsTrigger>
          </TabsList>

          <TooltipProvider>
            {/* Personality Tab */}
            <TabsContent value="personality" className="space-y-3 mt-4">
              {Object.entries(behavior.personality).map(([trait, value]) => (
                <div key={trait} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs capitalize flex items-center gap-1">
                      {trait}
                      <Tooltip>
                        <TooltipTrigger>
                          <Eye className="w-3 h-3 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">
                            {t(`${trait}Desc`, `How ${trait} the AI behaves`)}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </Label>
                    <span className="text-xs font-medium">{value}%</span>
                  </div>
                  <Slider
                    value={[value]}
                    onValueChange={([v]) =>
                      updatePersonality(
                        trait as keyof AIBehaviorProfile['personality'],
                        v
                      )
                    }
                    min={0}
                    max={100}
                    step={5}
                    className="w-full"
                  />
                </div>
              ))}
            </TabsContent>

            {/* Communication Tab */}
            <TabsContent value="communication" className="space-y-3 mt-4">
              <div className="space-y-2">
                <Label className="text-xs">{t('Formality', 'Formality')}</Label>
                <Select
                  value={behavior.communication.formality}
                  onValueChange={(v) => updateCommunication('formality', v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="casual" className="text-xs">
                      Casual
                    </SelectItem>
                    <SelectItem value="neutral" className="text-xs">
                      Neutral
                    </SelectItem>
                    <SelectItem value="formal" className="text-xs">
                      Formal
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">{t('Verbosity', 'Verbosity')}</Label>
                <Select
                  value={behavior.communication.verbosity}
                  onValueChange={(v) => updateCommunication('verbosity', v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="concise" className="text-xs">
                      Concise
                    </SelectItem>
                    <SelectItem value="moderate" className="text-xs">
                      Moderate
                    </SelectItem>
                    <SelectItem value="verbose" className="text-xs">
                      Verbose
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">
                  {t('ArgumentStyle', 'Argument Style')}
                </Label>
                <Select
                  value={behavior.communication.argumentStyle}
                  onValueChange={(v) => updateCommunication('argumentStyle', v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="passive" className="text-xs">
                      Passive
                    </SelectItem>
                    <SelectItem value="assertive" className="text-xs">
                      Assertive
                    </SelectItem>
                    <SelectItem value="aggressive" className="text-xs">
                      Aggressive
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            {/* Strategy Tab */}
            <TabsContent value="strategy" className="space-y-3 mt-4">
              <div className="space-y-2">
                <Label className="text-xs">
                  {t('VotingPattern', 'Voting Pattern')}
                </Label>
                <Select
                  value={behavior.strategy.votingPattern}
                  onValueChange={(v) => updateStrategy('votingPattern', v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bandwagon" className="text-xs">
                      Bandwagon
                    </SelectItem>
                    <SelectItem value="contrarian" className="text-xs">
                      Contrarian
                    </SelectItem>
                    <SelectItem value="analytical" className="text-xs">
                      Analytical
                    </SelectItem>
                    <SelectItem value="emotional" className="text-xs">
                      Emotional
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">
                  {t('TargetingStrategy', 'Targeting Strategy')}
                </Label>
                <Select
                  value={behavior.strategy.targeting}
                  onValueChange={(v) => updateStrategy('targeting', v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="random" className="text-xs">
                      Random
                    </SelectItem>
                    <SelectItem value="threats" className="text-xs">
                      Threats
                    </SelectItem>
                    <SelectItem value="weak" className="text-xs">
                      Weak Players
                    </SelectItem>
                    <SelectItem value="vocal" className="text-xs">
                      Vocal Players
                    </SelectItem>
                    <SelectItem value="quiet" className="text-xs">
                      Quiet Players
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {['riskTaking', 'alliance', 'adaptability', 'information'].map(
                (trait) => (
                  <div key={trait} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs capitalize">
                        {trait.replace(/([A-Z])/g, ' $1')}
                      </Label>
                      <span className="text-xs font-medium">
                        {
                          behavior.strategy[
                            trait as keyof typeof behavior.strategy
                          ]
                        }
                        %
                      </span>
                    </div>
                    <Slider
                      value={[
                        behavior.strategy[
                          trait as keyof typeof behavior.strategy
                        ] as number,
                      ]}
                      onValueChange={([v]) => updateStrategy(trait as any, v)}
                      min={0}
                      max={100}
                      step={5}
                      className="w-full"
                    />
                  </div>
                )
              )}
            </TabsContent>

            {/* Traits Tab */}
            <TabsContent value="traits" className="space-y-3 mt-4">
              {Object.entries(behavior.traits).map(([trait, enabled]) => (
                <div key={trait} className="flex items-center justify-between">
                  <Label className="text-xs">
                    {t(
                      trait,
                      trait
                        .replace(/([A-Z])/g, ' $1')
                        .replace(/^./, (s) => s.toUpperCase())
                    )}
                  </Label>
                  <Switch
                    checked={enabled}
                    onCheckedChange={(v) =>
                      updateTrait(trait as keyof AIBehaviorProfile['traits'], v)
                    }
                  />
                </div>
              ))}
            </TabsContent>

            {/* Custom Tab */}
            <TabsContent value="custom" className="space-y-3 mt-4">
              {/* Catchphrases */}
              <div className="space-y-2">
                <Label className="text-xs">
                  {t('Catchphrases', 'Catchphrases')}
                </Label>
                <div className="flex gap-2">
                  <Textarea
                    value={customInput.catchphrase}
                    onChange={(e) =>
                      setCustomInput((prev) => ({
                        ...prev,
                        catchphrase: e.target.value,
                      }))
                    }
                    placeholder="Enter a catchphrase..."
                    className="h-8 text-xs resize-none"
                  />
                  <Button
                    size="sm"
                    onClick={() =>
                      addCustomBehavior('catchphrases', customInput.catchphrase)
                    }
                    className="text-xs"
                  >
                    Add
                  </Button>
                </div>
                <div className="space-y-1">
                  {behavior.customBehaviors.catchphrases.map((phrase, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between bg-muted p-1 rounded text-xs"
                    >
                      <span>{phrase}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeCustomBehavior('catchphrases', i)}
                        className="h-6 w-6 p-0"
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Triggers */}
              <div className="space-y-2">
                <Label className="text-xs">
                  {t('Triggers', 'Response Triggers')}
                </Label>
                <div className="flex gap-2">
                  <Textarea
                    value={customInput.trigger}
                    onChange={(e) =>
                      setCustomInput((prev) => ({
                        ...prev,
                        trigger: e.target.value,
                      }))
                    }
                    placeholder="Words that trigger response..."
                    className="h-8 text-xs resize-none"
                  />
                  <Button
                    size="sm"
                    onClick={() =>
                      addCustomBehavior('triggers', customInput.trigger)
                    }
                    className="text-xs"
                  >
                    Add
                  </Button>
                </div>
                <div className="space-y-1">
                  {behavior.customBehaviors.triggers.map((trigger, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between bg-muted p-1 rounded text-xs"
                    >
                      <span>{trigger}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeCustomBehavior('triggers', i)}
                        className="h-6 w-6 p-0"
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          </TooltipProvider>
        </Tabs>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 pt-4 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={randomizeBehavior}
            className="text-xs"
          >
            <Shuffle className="w-3 h-3 me-1" />
            {t('Randomize', 'Randomize')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportBehavior}
            className="text-xs"
          >
            <Download className="w-3 h-3 me-1" />
            {t('Export', 'Export')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={copyBehaviorCode}
            className="text-xs"
          >
            {copied ? (
              <Check className="w-3 h-3 me-1" />
            ) : (
              <Copy className="w-3 h-3 me-1" />
            )}
            {t('CopyCode', 'Copy Code')}
          </Button>
          <div className="flex-1" />
          <Button
            size="sm"
            onClick={saveBehavior}
            disabled={!hasChanges}
            className="text-xs"
          >
            <Save className="w-3 h-3 me-1" />
            {t('SaveBehavior', 'Save Behavior')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
