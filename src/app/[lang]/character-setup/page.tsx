'use client';

import { useState, use } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ServerHeader } from '@/components/ServerHeader';
import { Footer } from '@/components/Footer';
import { useTranslation } from 'react-i18next';
import type { LanguageCode } from '@/lib/i18n/settings';
import {
  Loader2,
  Settings2,
  UserPlus,
  Trash2,
  ArrowLeft,
  Sparkles,
  Users,
  Dice1,
  Download,
  Upload,
  Keyboard,
  Copy,
  Check,
} from 'lucide-react';
import Link from 'next/link';
import { Label } from '@/components/ui/label';
import {
  CharacterSlotItem,
  CharacterSlotMobile,
} from '@/components/character-slot/CharacterSlotItem';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useGameConfig, type ConfigCharacterSlot } from '@/hooks/useGameConfig';
import { RoleName } from '@/lib/engine/interfaces/IRole';
import { mapLanguageCodeToLongCode } from '@/lib/i18n/settings';
import React, { useMemo, useCallback, useRef, useEffect } from 'react';
import { Themes } from '@/lib/engine/interfaces/Theme';
import type { CharacterPreferences } from '@/components/ui/character-preview';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProviderModelSelector } from '@/components/ProviderModelSelector';
import { Wand2 } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  restrictToVerticalAxis,
  restrictToWindowEdges,
} from '@dnd-kit/modifiers';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface PageProps {
  params: Promise<{ lang: LanguageCode }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

const availableRolesForSelection: RoleName[] = [
  RoleName.Villager,
  RoleName.Mafia,
  RoleName.Seer,
  RoleName.Doctor,
];

// Role descriptions
const ROLE_DESCRIPTIONS: Record<string, string> = {
  Villager:
    'A regular townsperson trying to identify and eliminate the Mafia members during day discussions.',
  Mafia:
    'A secret villain who eliminates players at night and tries to blend in during the day.',
  Seer: 'A mystical villager who can investigate one player each night to learn their true role.',
  Doctor:
    'A protective villager who can save one player from elimination each night.',
};

// Character templates for quick setup
const CHARACTER_TEMPLATES = [
  {
    id: 'balanced',
    name: 'Balanced',
    description: '1 Seer, 1 Doctor, 2 Mafia, rest Villagers',
    icon: '⚖️',
    roles: (total: number) => {
      const mafiaCount = Math.floor(total / 3);
      const specialCount = 2; // Seer + Doctor
      const villagerCount = total - mafiaCount - specialCount;
      return {
        Seer: 1,
        Doctor: 1,
        Mafia: mafiaCount,
        Villager: villagerCount,
      };
    },
  },
  {
    id: 'classic',
    name: 'Classic',
    description: '1 Seer, 2 Mafia, rest Villagers',
    icon: '🎭',
    roles: (total: number) => {
      const mafiaCount = Math.floor(total / 3);
      return {
        Seer: 1,
        Mafia: mafiaCount,
        Villager: total - mafiaCount - 1,
      };
    },
  },
  {
    id: 'chaos',
    name: 'Chaos',
    description: 'More Mafia, more special roles',
    icon: '🔥',
    roles: (total: number) => {
      const mafiaCount = Math.ceil(total * 0.4);
      const specialCount = Math.floor(total * 0.3);
      const villagerCount = total - mafiaCount - specialCount;
      return {
        Seer: Math.ceil(specialCount / 2),
        Doctor: Math.floor(specialCount / 2),
        Mafia: mafiaCount,
        Villager: Math.max(1, villagerCount),
      };
    },
  },
];

// Random name generator
const FIRST_NAMES = {
  male: [
    'James',
    'William',
    'Thomas',
    'Henry',
    'Charles',
    'George',
    'Edward',
    'Arthur',
    'Frederick',
    'Albert',
    'Samuel',
    'Joseph',
  ],
  female: [
    'Mary',
    'Elizabeth',
    'Margaret',
    'Alice',
    'Florence',
    'Emma',
    'Clara',
    'Edith',
    'Martha',
    'Dorothy',
    'Helen',
    'Ruth',
  ],
};

const LAST_NAMES = [
  'Smith',
  'Johnson',
  'Williams',
  'Brown',
  'Jones',
  'Miller',
  'Davis',
  'Wilson',
  'Moore',
  'Taylor',
  'Anderson',
  'Thomas',
];

const generateRandomName = (
  gender: 'male' | 'female' = Math.random() > 0.5 ? 'male' : 'female'
) => {
  const firstName =
    FIRST_NAMES[gender][Math.floor(Math.random() * FIRST_NAMES[gender].length)];
  const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  return `${firstName} ${lastName}`;
};

const CharacterSlotList = React.memo(function CharacterSlotList({
  characterSlots,
  availableRoles,
  isSubmitting,
  onUpdateRole,
  onUpdateProviderAndModel,
  onRemove,
  onUpdateName,
  onUpdateImageUrl,
  onUpdatePreferences,
  onReorder,
  gameTheme,
}: {
  characterSlots: ConfigCharacterSlot[];
  availableRoles: RoleName[];
  isSubmitting: boolean;
  onUpdateRole: (clientId: string, newRole: RoleName) => void;
  onUpdateProviderAndModel: (
    clientId: string,
    provider: string,
    model: string
  ) => void;
  onRemove: (clientId: string) => void;
  onUpdateName: (clientId: string, newName: string) => void;
  onUpdateImageUrl: (clientId: string, newImageUrl: string | null) => void;
  onUpdatePreferences?: (
    clientId: string,
    preferences: CharacterPreferences
  ) => void;
  onReorder: (activeId: string, overId: string) => void;
  gameTheme?: string;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorder(active.id as string, over.id as string);
    }
  };

  const canRemove = useMemo(
    () => characterSlots.length > 5,
    [characterSlots.length]
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
    >
      <SortableContext
        items={characterSlots.map((slot) => slot.clientId)}
        strategy={verticalListSortingStrategy}
      >
        {/* Desktop Layout */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Character</TableHead>
                <TableHead className="w-[20%]">Role</TableHead>
                <TableHead className="w-[30%]">AI Configuration</TableHead>
                <TableHead className="w-[10%]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {characterSlots.map((slot, index) => (
                <CharacterSlotItem
                  key={slot.clientId}
                  slot={slot}
                  isHuman={index === 0}
                  index={index}
                  availableRoles={availableRoles}
                  isSubmitting={isSubmitting}
                  canRemove={canRemove}
                  onUpdateRole={onUpdateRole}
                  onUpdateProviderAndModel={onUpdateProviderAndModel}
                  onRemove={onRemove}
                  onUpdateName={onUpdateName}
                  onUpdateImageUrl={onUpdateImageUrl}
                  onUpdatePreferences={onUpdatePreferences}
                  gameTheme={gameTheme}
                />
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Mobile Layout */}
        <div className="md:hidden space-y-3">
          {characterSlots.map((slot, index) => (
            <CharacterSlotMobile
              key={slot.clientId}
              slot={slot}
              isHuman={index === 0}
              index={index}
              availableRoles={availableRoles}
              isSubmitting={isSubmitting}
              canRemove={canRemove}
              onUpdateRole={onUpdateRole}
              onUpdateProviderAndModel={onUpdateProviderAndModel}
              onRemove={onRemove}
              onUpdateName={onUpdateName}
              onUpdateImageUrl={onUpdateImageUrl}
              onUpdatePreferences={onUpdatePreferences}
              gameTheme={gameTheme}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
});

function CharacterSetupContent({ lang }: { lang: LanguageCode }) {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  // Get config from URL params or localStorage for persistence
  const [useSeparateAIModelForMafia] = useState(false);
  const [mafiaProviderSelection] = useState<string>('');
  const [mafiaModelSelection] = useState<string>('');

  // Get saved game theme from localStorage
  const [gameTheme, setGameTheme] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const savedConfig = localStorage.getItem('characterSetupConfig');
      if (savedConfig) {
        try {
          const config = JSON.parse(savedConfig);
          return config.gameTheme || Object.keys(Themes)[0];
        } catch {
          // Ignore parse errors
        }
      }
    }
    return Object.keys(Themes)[0];
  });

  const {
    characterSlots,
    isSubmitting,
    errorMsg,
    initialSlotsSet,
    configValidation,
    totalSlots,
    availableProviders,
    addPlayerSlot,
    removePlayerSlot,
    updateSlotProviderAndModel,
    updateSlotRole,
    updateSlotName,
    updateSlotImageUrl,
    updateSlotPreferences,
    globalProviderSelection,
    globalModelSelection,
    updateAllProvidersAndModels,
  } = useGameConfig(
    lang,
    useSeparateAIModelForMafia,
    mafiaProviderSelection,
    mafiaModelSelection,
    session?.user
  );

  const numberFormatter = useMemo(() => {
    const longCode = mapLanguageCodeToLongCode(lang);
    try {
      return new Intl.NumberFormat(longCode);
    } catch (e) {
      console.error('Failed to create NumberFormat for locale:', longCode, e);
      return new Intl.NumberFormat('en-US');
    }
  }, [lang]);

  const handleSaveAndContinue = useCallback(() => {
    // Save character configuration to localStorage or URL params
    const configData = {
      characterSlots,
      useSeparateAIModelForMafia,
      mafiaProviderSelection,
      mafiaModelSelection,
      gameTheme,
    };
    localStorage.setItem('characterSetupConfig', JSON.stringify(configData));

    // Navigate back to new game page
    router.push(`/${lang}/new`);
  }, [
    characterSlots,
    useSeparateAIModelForMafia,
    mafiaProviderSelection,
    mafiaModelSelection,
    gameTheme,
    lang,
    router,
  ]);

  const handleUpdatePreferences = useCallback(
    (clientId: string, preferences: CharacterPreferences) => {
      updateSlotPreferences(clientId, preferences);
    },
    [updateSlotPreferences]
  );

  const handleReorderSlots = useCallback((activeId: string, overId: string) => {
    // This would need to be implemented in useGameConfig hook
    console.log('Reordering slots:', activeId, 'to', overId);
  }, []);

  const handleExportConfig = useCallback(() => {
    const config = {
      version: '1.0',
      characterSlots: characterSlots.map((slot) => ({
        roleSelection: slot.roleSelection,
        name: slot.profile?.characterName || '',
        imageUrl: slot.imageUrl,
        preferences: slot.preferences,
        isHuman: slot.isHuman,
        provider: slot.provider,
        aiModel: slot.aiModel,
      })),
      gameTheme,
      exportDate: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(config, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `werewolf-config-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [characterSlots, gameTheme]);

  const handleImportConfig = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const config = JSON.parse(e.target?.result as string);

          // Validate config version
          if (config.version !== '1.0') {
            alert(t('InvalidConfigVersion', 'Invalid configuration version'));
            return;
          }

          // Apply imported configuration
          config.characterSlots.forEach(
            (
              importedSlot: {
                roleSelection?: RoleName;
                name?: string;
                imageUrl?: string | null;
                preferences?: CharacterPreferences;
                isHuman?: boolean;
              },
              index: number
            ) => {
              if (index < characterSlots.length) {
                const slot = characterSlots[index];
                if (importedSlot.roleSelection) {
                  updateSlotRole(slot.clientId, importedSlot.roleSelection);
                }
                if (importedSlot.name && !slot.isHuman) {
                  updateSlotName(slot.clientId, importedSlot.name);
                }
                if (importedSlot.imageUrl) {
                  updateSlotImageUrl(slot.clientId, importedSlot.imageUrl);
                }
                if (importedSlot.preferences) {
                  updateSlotPreferences(
                    slot.clientId,
                    importedSlot.preferences
                  );
                }
              }
            }
          );

          // Show success message
          alert(t('ConfigImported', 'Configuration imported successfully!'));
        } catch (error) {
          console.error('Failed to import config:', error);
          alert(t('ConfigImportError', 'Failed to import configuration'));
        }
      };
      reader.readAsText(file);

      // Reset file input
      if (event.target) {
        event.target.value = '';
      }
    },
    [
      characterSlots,
      updateSlotRole,
      updateSlotName,
      updateSlotImageUrl,
      updateSlotPreferences,
      t,
    ]
  );

  const handleCopyConfig = useCallback(() => {
    const config = {
      version: '1.0',
      characterSlots: characterSlots.map((slot) => ({
        roleSelection: slot.roleSelection,
        name: slot.profile?.characterName || '',
        imageUrl: slot.imageUrl,
        preferences: slot.preferences,
        isHuman: slot.isHuman,
        provider: slot.provider,
        aiModel: slot.aiModel,
      })),
      gameTheme,
      exportDate: new Date().toISOString(),
    };

    navigator.clipboard.writeText(JSON.stringify(config, null, 2)).then(() => {
      setCopiedToClipboard(true);
      setTimeout(() => setCopiedToClipboard(false), 2000);
    });
  }, [characterSlots, gameTheme]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Only handle shortcuts when not typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Ctrl/Cmd + S to save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (configValidation.isValid) {
          handleSaveAndContinue();
        }
      }

      // Ctrl/Cmd + R to randomize names
      if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault();
        characterSlots.forEach((slot, index) => {
          if (index > 0) {
            const randomName = generateRandomName();
            updateSlotName(slot.clientId, randomName);
          }
        });
      }

      // Ctrl/Cmd + E to export
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        handleExportConfig();
      }

      // Ctrl/Cmd + I to import
      if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault();
        fileInputRef.current?.click();
      }

      // Ctrl/Cmd + C to copy
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
        handleCopyConfig();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [
    characterSlots,
    configValidation.isValid,
    handleSaveAndContinue,
    handleExportConfig,
    updateSlotName,
    handleCopyConfig,
  ]);

  // Check for duplicate names
  const duplicateNames = useMemo(() => {
    const nameCount = new Map<string, number>();
    characterSlots.forEach((slot) => {
      const name = slot.profile?.characterName || '';
      if (name) {
        nameCount.set(name, (nameCount.get(name) || 0) + 1);
      }
    });
    return Array.from(nameCount.entries())
      .filter(([, count]) => count > 1)
      .map(([name]) => name);
  }, [characterSlots]);

  if (errorMsg) {
    return (
      <div className="text-red-500 p-4">
        {t('ErrorPrefix', 'Error')}: {t(errorMsg, errorMsg)}
      </div>
    );
  }

  return (
    <main className="mx-auto p-4 max-w-6xl space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" asChild>
            <Link href={`/${lang}/new`}>
              <ArrowLeft className="w-4 h-4 me-2" />
              {t('common.back', 'Back')}
            </Link>
          </Button>
          <h1 className="text-3xl font-bold">
            {t('CharacterSetupTitle', 'Character Setup')}
          </h1>
        </div>

        <div className="flex gap-2 items-center">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportConfig}
            disabled={isSubmitting}
            className="hidden"
          />

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Keyboard className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <div className="space-y-2 text-xs">
                  <p className="font-semibold">
                    {t('KeyboardShortcuts', 'Keyboard Shortcuts')}:
                  </p>
                  <div className="space-y-1">
                    <div>
                      <kbd className="px-1 py-0.5 bg-muted rounded text-xs">
                        Ctrl/⌘ + S
                      </kbd>{' '}
                      - {t('SaveAndContinue', 'Save & Continue')}
                    </div>
                    <div>
                      <kbd className="px-1 py-0.5 bg-muted rounded text-xs">
                        Ctrl/⌘ + R
                      </kbd>{' '}
                      - {t('RandomizeNames', 'Randomize Names')}
                    </div>
                    <div>
                      <kbd className="px-1 py-0.5 bg-muted rounded text-xs">
                        Ctrl/⌘ + E
                      </kbd>{' '}
                      - {t('Export', 'Export')}
                    </div>
                    <div>
                      <kbd className="px-1 py-0.5 bg-muted rounded text-xs">
                        Ctrl/⌘ + I
                      </kbd>{' '}
                      - {t('Import', 'Import')}
                    </div>
                    <div>
                      <kbd className="px-1 py-0.5 bg-muted rounded text-xs">
                        Ctrl/⌘ + C
                      </kbd>{' '}
                      - {t('Copy', 'Copy')}
                    </div>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isSubmitting}
            variant="outline"
            size="sm"
          >
            <Upload className="w-4 h-4 me-2" />
            {t('Import', 'Import')}
          </Button>

          <Button
            onClick={handleExportConfig}
            disabled={isSubmitting || characterSlots.length === 0}
            variant="outline"
            size="sm"
          >
            <Download className="w-4 h-4 me-2" />
            {t('Export', 'Export')}
          </Button>

          <Button
            onClick={handleCopyConfig}
            disabled={isSubmitting || characterSlots.length === 0}
            variant="outline"
            size="sm"
          >
            {copiedToClipboard ? (
              <>
                <Check className="w-4 h-4 me-2" />
                {t('Copied', 'Copied!')}
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 me-2" />
                {t('Copy', 'Copy')}
              </>
            )}
          </Button>

          <Button
            onClick={handleSaveAndContinue}
            disabled={!configValidation.isValid}
            size="lg"
          >
            {t('SaveAndContinue', 'Save & Continue')}
          </Button>
        </div>
      </div>

      {/* Progress Indicator */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              {t('CharacterProgress', 'Character Setup Progress')}
            </span>
            <span className="text-sm text-muted-foreground">
              {characterSlots.length} / {t('MinimumPlayers', '5+ players')}
            </span>
          </div>
          <Progress value={(characterSlots.length / 5) * 100} className="h-2" />
          {characterSlots.length < 5 && (
            <p className="text-xs text-muted-foreground mt-2">
              {t(
                'NeedMorePlayers',
                `Add ${5 - characterSlots.length} more players to start the game`
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Role Distribution Statistics */}
      {initialSlotsSet && characterSlots.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5" />
              {t('RoleDistribution', 'Role Distribution')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {(() => {
                const roleCount = characterSlots.reduce(
                  (acc, slot) => {
                    acc[slot.roleSelection] =
                      (acc[slot.roleSelection] || 0) + 1;
                    return acc;
                  },
                  {} as Record<string, number>
                );

                const mafiaCount = roleCount['Mafia'] || 0;
                const townCount = characterSlots.length - mafiaCount;
                const mafiaPercentage = Math.round(
                  (mafiaCount / characterSlots.length) * 100
                );

                return (
                  <>
                    {Object.entries(roleCount).map(([role, count]) => {
                      const isBalanced =
                        role === 'Mafia'
                          ? mafiaPercentage >= 25 && mafiaPercentage <= 40
                          : true;

                      return (
                        <div key={role} className="text-center">
                          <div
                            className={cn(
                              'text-2xl font-bold',
                              isBalanced
                                ? 'text-foreground'
                                : 'text-muted-foreground'
                            )}
                          >
                            {count}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {role}
                          </div>
                          {role === 'Mafia' && (
                            <div
                              className={cn(
                                'text-xs mt-1',
                                isBalanced
                                  ? 'text-green-600 dark:text-green-400'
                                  : 'text-yellow-600 dark:text-yellow-400'
                              )}
                            >
                              {mafiaPercentage}%
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <div className="text-center col-span-2 sm:col-span-1">
                      <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                        {townCount}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {t('TownTotal', 'Town')}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {100 - mafiaPercentage}%
                      </div>
                    </div>
                    <div className="text-center col-span-2 sm:col-span-1">
                      <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                        {mafiaCount}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {t('MafiaTotal', 'Mafia')}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {mafiaPercentage}%
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
            {(() => {
              const mafiaCount = characterSlots.filter(
                (s) => s.roleSelection === 'Mafia'
              ).length;
              const mafiaPercentage = Math.round(
                (mafiaCount / characterSlots.length) * 100
              );
              const isBalanced = mafiaPercentage >= 25 && mafiaPercentage <= 40;

              return (
                !isBalanced && (
                  <Alert className="mt-4">
                    <AlertDescription className="text-xs">
                      {mafiaPercentage < 25
                        ? t(
                            'TooFewMafia',
                            'Consider adding more Mafia members for a balanced game (25-40% recommended)'
                          )
                        : t(
                            'TooManyMafia',
                            'Consider reducing Mafia members for a balanced game (25-40% recommended)'
                          )}
                    </AlertDescription>
                  </Alert>
                )
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Provider Statistics */}
      {initialSlotsSet && characterSlots.length > 1 && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              {t('AIProviderDistribution', 'AI Provider Distribution')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(() => {
                const providerStats = characterSlots.slice(1).reduce(
                  (acc, slot) => {
                    const key = `${slot.provider || 'Unknown'} - ${slot.aiModel || 'Unknown'}`;
                    acc[key] = (acc[key] || 0) + 1;
                    return acc;
                  },
                  {} as Record<string, number>
                );

                return Object.entries(providerStats).map(
                  ([providerModel, count]) => {
                    const percentage = Math.round(
                      (count / (characterSlots.length - 1)) * 100
                    );
                    return (
                      <div key={providerModel} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            {providerModel}
                          </span>
                          <span className="font-medium">
                            {count} ({percentage}%)
                          </span>
                        </div>
                        <Progress value={percentage} className="h-2" />
                      </div>
                    );
                  }
                );
              })()}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Character Templates */}
      {initialSlotsSet && characterSlots.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              {t('QuickTemplates', 'Quick Templates')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {CHARACTER_TEMPLATES.map((template) => {
                const roleDistribution = template.roles(characterSlots.length);
                return (
                  <Button
                    key={template.id}
                    variant="outline"
                    className="h-auto p-4 flex flex-col items-start gap-2 hover:bg-accent"
                    onClick={() => {
                      // Apply template roles to slots
                      let roleIndex = 0;
                      const roleQueue: RoleName[] = [];

                      // Build queue of roles based on template
                      Object.entries(roleDistribution).forEach(
                        ([role, count]) => {
                          for (let i = 0; i < count; i++) {
                            roleQueue.push(role as RoleName);
                          }
                        }
                      );

                      // Apply roles to slots (skip first slot as it's human)
                      characterSlots.forEach((slot, index) => {
                        if (index > 0 && roleIndex < roleQueue.length) {
                          updateSlotRole(slot.clientId, roleQueue[roleIndex]);
                          roleIndex++;
                        }
                      });
                    }}
                  >
                    <div className="flex items-center gap-2 font-medium">
                      <span className="text-2xl">{template.icon}</span>
                      <span>{template.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground text-left">
                      {template.description}
                    </p>
                    <div className="flex gap-1 flex-wrap mt-1">
                      {Object.entries(roleDistribution).map(([role, count]) => (
                        <TooltipProvider key={role}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="secondary"
                                className="text-xs cursor-help"
                              >
                                {count}x {role}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="text-sm">
                                {ROLE_DESCRIPTIONS[role] || ''}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ))}
                    </div>
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Batch Operations Card */}
      {initialSlotsSet && characterSlots.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Wand2 className="h-5 w-5" />
              {t('BatchOperations', 'Batch Operations')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-1">
                <Label className="text-sm font-medium mb-2 block">
                  {t('SetAllAIPlayersTo', 'Set all AI players to')}:
                </Label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <ProviderModelSelector
                    selectedModel={globalModelSelection}
                    selectedProviderValue={globalProviderSelection}
                    onProviderModelChange={updateAllProvidersAndModels}
                    disabled={isSubmitting}
                    mode="provider"
                    className="flex-1"
                    idPrefix="batch-provider"
                  />
                  <ProviderModelSelector
                    selectedModel={globalModelSelection}
                    selectedProviderValue={globalProviderSelection}
                    onProviderModelChange={updateAllProvidersAndModels}
                    disabled={isSubmitting}
                    mode="model"
                    className="flex-1"
                    idPrefix="batch-model"
                  />
                </div>
              </div>
              <Button
                onClick={() =>
                  updateAllProvidersAndModels(
                    globalProviderSelection,
                    globalModelSelection
                  )
                }
                disabled={isSubmitting}
                variant="secondary"
                className="whitespace-nowrap"
              >
                <Wand2 className="h-4 w-4 me-2" />
                {t('ApplyToAll', 'Apply to All')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {t(
                'BatchOperationHint',
                'This will update all AI players to use the selected provider and model'
              )}
            </p>

            <div className="border-t pt-4">
              <Label className="text-sm font-medium mb-2 block">
                {t('QuickActions', 'Quick Actions')}:
              </Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    characterSlots.forEach((slot, index) => {
                      // Skip the first player (human)
                      if (index > 0) {
                        const randomName = generateRandomName();
                        updateSlotName(slot.clientId, randomName);
                      }
                    });
                  }}
                  disabled={isSubmitting}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <Dice1 className="h-4 w-4" />
                  {t('RandomizeNames', 'Randomize All Names')}
                </Button>

                <Button
                  onClick={() => {
                    // Apply the balanced template
                    const template = CHARACTER_TEMPLATES[0];
                    const roleDistribution = template.roles(
                      characterSlots.length
                    );
                    let roleIndex = 0;
                    const roleQueue: RoleName[] = [];

                    Object.entries(roleDistribution).forEach(
                      ([role, count]) => {
                        for (let i = 0; i < count; i++) {
                          roleQueue.push(role as RoleName);
                        }
                      }
                    );

                    characterSlots.forEach((slot, index) => {
                      if (index > 0 && roleIndex < roleQueue.length) {
                        updateSlotRole(slot.clientId, roleQueue[roleIndex]);
                        roleIndex++;
                      }
                    });
                  }}
                  disabled={isSubmitting}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <Settings2 className="h-4 w-4" />
                  {t('AutoBalance', 'Auto-Balance Roles')}
                </Button>

                <Button
                  onClick={() => {
                    if (
                      confirm(
                        t(
                          'ResetConfirm',
                          'Are you sure you want to reset all character customizations?'
                        )
                      )
                    ) {
                      characterSlots.forEach((slot, index) => {
                        if (index > 0) {
                          updateSlotName(slot.clientId, `Player ${index + 1}`);
                          updateSlotImageUrl(slot.clientId, null);
                          updateSlotRole(slot.clientId, RoleName.Villager);
                        }
                      });
                    }
                  }}
                  disabled={isSubmitting}
                  variant="outline"
                  size="sm"
                  className="gap-2 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  {t('ResetAll', 'Reset All')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Advanced Settings */}
      <Collapsible className="mb-6">
        <Card>
          <CollapsibleTrigger className="w-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Settings2 className="h-5 w-5" />
                  {t('AdvancedSettings', 'Advanced Settings')}
                </span>
                <ChevronDown className="h-4 w-4 transition-transform data-[state=open]:rotate-180" />
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t('GameTheme', 'Game Theme')}</Label>
                <p className="text-sm text-muted-foreground">
                  {t(
                    'GameThemeDescription',
                    'The theme affects character generation and dialogue style'
                  )}
                </p>
                <Select
                  value={gameTheme}
                  onValueChange={(value) => {
                    setGameTheme(value);
                    // Save to localStorage
                    const currentConfig = localStorage.getItem(
                      'characterSetupConfig'
                    );
                    if (currentConfig) {
                      try {
                        const config = JSON.parse(currentConfig);
                        config.gameTheme = value;
                        localStorage.setItem(
                          'characterSetupConfig',
                          JSON.stringify(config)
                        );
                      } catch {
                        // Ignore errors
                      }
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(Themes).map(([themeId, themeOption]) => (
                      <SelectItem key={themeId} value={themeId}>
                        {themeOption.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {gameTheme && Themes[gameTheme] && (
                  <div className="mt-2 p-3 bg-muted rounded-md">
                    <p className="text-xs text-muted-foreground">
                      {Themes[gameTheme].description}
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>{t('MinimumPlayers', 'Minimum Players')}</Label>
                <p className="text-sm text-muted-foreground">
                  {t(
                    'MinimumPlayersDescription',
                    'The minimum number of players required to start the game'
                  )}
                </p>
                <div className="text-sm font-medium">5 players (fixed)</div>
              </div>

              <div className="space-y-2">
                <Label>{t('VotingSystem', 'Voting System')}</Label>
                <p className="text-sm text-muted-foreground">
                  {t(
                    'VotingSystemDescription',
                    'How votes are counted during the day phase'
                  )}
                </p>
                <div className="text-sm font-medium">
                  Majority vote required
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t('GameSpeed', 'Game Speed')}</Label>
                <p className="text-sm text-muted-foreground">
                  {t(
                    'GameSpeedDescription',
                    'How quickly the game progresses between phases'
                  )}
                </p>
                <div className="text-sm font-medium">
                  Standard (automatic progression)
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t('EstimatedDuration', 'Estimated Duration')}</Label>
                <p className="text-sm text-muted-foreground">
                  {t(
                    'EstimatedDurationDescription',
                    'Approximate game length based on player count'
                  )}
                </p>
                <div className="text-sm font-medium">
                  {(() => {
                    const playerCount = characterSlots.length;
                    const baseMinutes = 15;
                    const minutesPerPlayer = 3;
                    const estimatedMinutes =
                      baseMinutes + playerCount * minutesPerPlayer;
                    return `${estimatedMinutes}-${estimatedMinutes + 10} minutes`;
                  })()}
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Duplicate Names Warning */}
      {duplicateNames.length > 0 && (
        <Alert className="mb-6" variant="default">
          <AlertDescription>
            <strong>{t('DuplicateNamesWarning', 'Warning')}:</strong>{' '}
            {t(
              'DuplicateNamesFound',
              'The following names are used multiple times'
            )}
            : {duplicateNames.join(', ')}
          </AlertDescription>
        </Alert>
      )}

      {/* Character slots */}
      <div className="md:my-4 md:p-4 rounded-md min-h-[200px]">
        <h3 className="text-lg font-medium text-foreground mb-3 text-center flex items-center justify-center gap-2">
          <Settings2 className="h-5 w-5" />
          {t(
            'DetailedCharacterConfiguration',
            'Detailed Character Configuration'
          )}
        </h3>

        {!initialSlotsSet && availableProviders.length > 0 && (
          <div className="flex justify-center items-center h-20 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            {t('LoadingSetupLabel', 'Loading setup...')}
          </div>
        )}

        {!initialSlotsSet && availableProviders.length === 0 && (
          <p className="text-center text-sm text-warning">
            {t(
              'WaitingForProvidersLabel',
              'Waiting for available AI providers...'
            )}
          </p>
        )}

        {initialSlotsSet && characterSlots.length > 0 && (
          <CharacterSlotList
            characterSlots={characterSlots}
            availableRoles={availableRolesForSelection}
            isSubmitting={isSubmitting}
            onUpdateRole={updateSlotRole}
            onUpdateProviderAndModel={updateSlotProviderAndModel}
            onRemove={removePlayerSlot}
            onUpdateName={updateSlotName}
            onUpdateImageUrl={updateSlotImageUrl}
            onUpdatePreferences={handleUpdatePreferences}
            onReorder={handleReorderSlots}
            gameTheme={gameTheme}
          />
        )}

        {/* Player Count Adjustment */}
        <div className="mb-4 flex items-center justify-center gap-4">
          <Label className="text-sm font-medium text-muted-foreground">
            {t('PlayersLabel', 'Players')}:
          </Label>
          <span className="text-lg font-semibold text-foreground w-10 text-center">
            {numberFormatter.format(totalSlots)}
          </span>
          <Button
            type="button"
            variant="ghost"
            onClick={addPlayerSlot}
            disabled={isSubmitting}
            aria-label={t('AddPlayerSlotLabel', 'Add player slot')}
          >
            <UserPlus className="h-4 w-4 mr-1" />
            <span>{t('AddPlayerButtonLabel', 'Add')}</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              totalSlots > 0 &&
              removePlayerSlot(
                characterSlots[characterSlots.length - 1].clientId
              )
            }
            disabled={isSubmitting || totalSlots <= 5}
            aria-label={t('RemovePlayerSlotLabel', 'Remove last player slot')}
          >
            <Trash2 className="h-4 w-4 mr-1 text-red-500" />
            <span className="text-red-500">
              {t('RemovePlayerButtonLabel', 'Remove')}
            </span>
          </Button>
        </div>

        {initialSlotsSet && characterSlots.length === 0 && (
          <p className="text-center text-sm text-muted-foreground italic py-4">
            {t(
              'AddPlayerSlotsPrompt',
              "Use the '+' button to add player slots (minimum 5)."
            )}
          </p>
        )}
      </div>
    </main>
  );
}

function UnauthenticatedView({ lang }: { lang: LanguageCode }) {
  const { t } = useTranslation();

  return (
    <main className="mx-auto p-4 flex flex-col items-center justify-center min-h-[80vh] space-y-8">
      <div className="text-center max-w-2xl">
        <h1 className="text-4xl font-bold mb-4 text-foreground">
          {t('auth.authenticationRequired')}
        </h1>
        <p className="text-lg text-muted-foreground mb-8">
          {t('auth.authRequiredDescription')}
        </p>
        <Button asChild size="lg">
          <Link href={`/${lang}/auth/signin`}>
            {t('auth.signInToContinue')}
          </Link>
        </Button>
      </div>
    </main>
  );
}

function LoadingView() {
  return (
    <main className="mx-auto p-4 flex flex-col items-center justify-center min-h-[80vh]">
      <div className="text-center">
        <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
        <p className="text-lg text-muted-foreground">Loading...</p>
      </div>
    </main>
  );
}

export default function CharacterSetupPage({
  params: paramsPromise,
}: PageProps) {
  const params = use(paramsPromise) as { lang: LanguageCode };
  const { lang } = params;
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-background">
        <ServerHeader currentLang={lang} />
        <LoadingView />
        <Footer currentLang={lang} />
      </div>
    );
  }

  if (status === 'unauthenticated' || !session) {
    return (
      <div className="min-h-screen bg-background">
        <ServerHeader currentLang={lang} />
        <UnauthenticatedView lang={lang} />
        <Footer currentLang={lang} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <ServerHeader currentLang={lang} />
      <CharacterSetupContent lang={lang} />
      <Footer currentLang={lang} />
    </div>
  );
}
