'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MagicalAIButton } from '@/components/ui/magical-ai-button';
import { ProviderModelSelector } from './ProviderModelSelector';
import { GameThemeSelector } from './GameThemeSelector';
import LanguageSelector from './LanguageSelector';
import { useTranslation } from 'react-i18next';
import { type LanguageCode } from '@/lib/i18n/settings';
import { Bot, Languages, Loader2, Settings2, User } from 'lucide-react';
import Link from 'next/link';
import { startGameAction } from '@/app/actions';
import type { StartGameSetupData } from '@/lib/interfaces/actions.types';
import { RoleName } from '@/lib/engine/interfaces/IRole';
import type { AgentConfig } from '@/lib/interfaces/agent.types';
import { availableProviders, availableModelsByProvider } from '@/lib/models';

export interface SimpleStartGameFormProps {
  lang: LanguageCode;
  user?: {
    name?: string | null;
    email?: string | null;
  } | null;
}

function getAgentTypeFromProvider(
  provider: string
): 'OpenAI' | 'Anthropic' | 'Google' | 'Human' {
  if (provider.includes('openai') || provider.includes('groq')) return 'OpenAI';
  if (provider.includes('anthropic')) return 'Anthropic';
  if (provider.includes('google')) return 'Google';
  return 'OpenAI';
}

function getDefaultModelForProvider(providerValue: string): string {
  const models = availableModelsByProvider[providerValue];
  if (models && models.length > 0) {
    // Look for a model with "default" in the title
    const defaultModel = models.find((m) =>
      m.title.toLowerCase().includes('default')
    );
    return defaultModel?.value ?? models[0].value;
  }
  return '';
}

export default function SimpleStartGameForm({
  lang,
  user,
}: SimpleStartGameFormProps) {
  const { t } = useTranslation();

  // Get default name from user profile
  const defaultPlayerName = user?.name || '';

  // Form state
  const [globalProviderSelection, setGlobalProviderSelection] =
    useState<string>('');
  const [globalModelSelection, setGlobalModelSelection] = useState<string>('');
  const [useSeparateAIModelForMafia, setUseSeparateAIModelForMafia] =
    useState(false);
  const [mafiaProviderSelection, setMafiaProviderSelection] =
    useState<string>('');
  const [mafiaModelSelection, setMafiaModelSelection] = useState<string>('');
  const [isHumanJoining, setIsHumanJoining] = useState(false);
  const [humanPlayerName, setHumanPlayerName] = useState(defaultPlayerName);
  const [selectedGameThemeKey, setSelectedGameThemeKey] =
    useState('classic-village');
  const [playerCount, setPlayerCount] = useState(6);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync mafia settings when not using separate config
  useEffect(() => {
    if (
      !useSeparateAIModelForMafia &&
      globalProviderSelection &&
      globalModelSelection
    ) {
      setMafiaProviderSelection(globalProviderSelection);
      setMafiaModelSelection(globalModelSelection);
    }
  }, [
    globalProviderSelection,
    globalModelSelection,
    useSeparateAIModelForMafia,
  ]);

  // Auto-populate player name when joining game and field is empty
  useEffect(() => {
    if (isHumanJoining && !humanPlayerName && defaultPlayerName) {
      setHumanPlayerName(defaultPlayerName);
    }
  }, [isHumanJoining, humanPlayerName, defaultPlayerName]);

  // Auto-select first available provider and model as default
  useEffect(() => {
    if (!globalProviderSelection && availableProviders.length > 0) {
      const firstProvider = availableProviders[0];
      const defaultModel = getDefaultModelForProvider(firstProvider.value);

      if (firstProvider && defaultModel) {
        setGlobalProviderSelection(firstProvider.value);
        setGlobalModelSelection(defaultModel);
      }
    }
  }, [globalProviderSelection]);

  const handleGlobalProviderModelChange = useCallback(
    (provider: string, model: string) => {
      setGlobalProviderSelection(provider);
      setGlobalModelSelection(model);
    },
    []
  );

  const handleMafiaProviderModelChange = useCallback(
    (provider: string, model: string) => {
      setMafiaProviderSelection(provider);
      setMafiaModelSelection(model);
    },
    []
  );

  const canStartGame = useMemo(() => {
    const hasGlobalModel = globalProviderSelection && globalModelSelection;
    const hasMafiaModel =
      !useSeparateAIModelForMafia ||
      (mafiaProviderSelection && mafiaModelSelection);
    const hasHumanName = !isHumanJoining || humanPlayerName.trim().length > 0;

    return hasGlobalModel && hasMafiaModel && hasHumanName && !isSubmitting;
  }, [
    globalProviderSelection,
    globalModelSelection,
    useSeparateAIModelForMafia,
    mafiaProviderSelection,
    mafiaModelSelection,
    isHumanJoining,
    humanPlayerName,
    isSubmitting,
  ]);

  const handleStartGame = useCallback(async () => {
    if (!canStartGame) return;

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const globalAgentConfig: AgentConfig = {
        agentType: getAgentTypeFromProvider(globalProviderSelection),
        modelName: globalModelSelection,
        providerValue: globalProviderSelection,
      };

      const mafiaAgentConfig = useSeparateAIModelForMafia
        ? {
            agentType: getAgentTypeFromProvider(mafiaProviderSelection),
            modelName: mafiaModelSelection,
            providerValue: mafiaProviderSelection,
          }
        : globalAgentConfig;

      // Create simple player setup based on count
      const players = [];
      const mafiaCount = Math.floor(playerCount / 3);
      const doctorCount = 1;
      const seerCount = 1;
      const villagerCount =
        playerCount -
        mafiaCount -
        doctorCount -
        seerCount -
        (isHumanJoining ? 1 : 0);

      // Add human player if joining
      if (isHumanJoining) {
        players.push({
          name: humanPlayerName.trim(),
          rolePreference: RoleName.Villager,
          isHuman: true,
          imageUrl: null,
          agentConfig: { agentType: 'Human' as const },
        });
      }

      // Add mafia players
      for (let i = 0; i < mafiaCount; i++) {
        players.push({
          name: `Mafia ${i + 1}`,
          rolePreference: RoleName.Mafia,
          isHuman: false,
          imageUrl: null,
          agentConfig: mafiaAgentConfig,
        });
      }

      // Add special roles
      players.push({
        name: 'Doctor',
        rolePreference: RoleName.Doctor,
        isHuman: false,
        imageUrl: null,
        agentConfig: globalAgentConfig,
      });

      players.push({
        name: 'Seer',
        rolePreference: RoleName.Seer,
        isHuman: false,
        imageUrl: null,
        agentConfig: globalAgentConfig,
      });

      // Add villagers
      for (let i = 0; i < villagerCount; i++) {
        players.push({
          name: `Villager ${i + 1}`,
          rolePreference: RoleName.Villager,
          isHuman: false,
          imageUrl: null,
          agentConfig: globalAgentConfig,
        });
      }

      const setupData: StartGameSetupData = {
        players,
        themeKey: selectedGameThemeKey,
        language: lang,
      };

      await startGameAction(setupData);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'StartGameFailedError';

      if (errorMessage.includes('NEXT_REDIRECT')) {
        return;
      }

      setErrorMsg(t(errorMessage, { defaultValue: errorMessage }));
      setIsSubmitting(false);
    }
  }, [
    canStartGame,
    globalProviderSelection,
    globalModelSelection,
    useSeparateAIModelForMafia,
    mafiaProviderSelection,
    mafiaModelSelection,
    isHumanJoining,
    humanPlayerName,
    playerCount,
    selectedGameThemeKey,
    lang,
    t,
  ]);

  if (errorMsg) {
    return (
      <div className="text-red-500 p-4">
        {t('ErrorPrefix', 'Error')}: {t(errorMsg, errorMsg)}
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold mb-6 text-foreground text-center">
        {t('StartNewGameTitle', 'Start New Game')}
      </h2>

      {/* AI Engine Selection */}
      <div className="space-y-4">
        <div>
          <Label className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-2">
            <Bot size={16} />
            {t('AI Engine', 'AI Engine')}
          </Label>
          <ProviderModelSelector
            idPrefix="global-provider"
            selectedProviderValue={globalProviderSelection}
            selectedModel={globalModelSelection}
            onProviderModelChange={handleGlobalProviderModelChange}
            disabled={isSubmitting}
          />
        </div>

        {/* Separate Mafia AI Option */}
        <div className="flex items-center space-x-2">
          <Checkbox
            id="mafia-engine-checkbox"
            checked={useSeparateAIModelForMafia}
            onCheckedChange={(checked) =>
              setUseSeparateAIModelForMafia(checked === true)
            }
            disabled={isSubmitting}
          />
          <Label
            htmlFor="mafia-engine-checkbox"
            className="text-sm cursor-pointer"
          >
            {t(
              'UseDifferentEngineForMafiaLabel',
              'Use a separate AI engine for Mafia players'
            )}
          </Label>
        </div>

        {useSeparateAIModelForMafia && (
          <div>
            <Label className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-2">
              {t('MafiaEngineLabel', 'Mafia AI Engine')}
            </Label>
            <ProviderModelSelector
              idPrefix="mafia-provider"
              selectedProviderValue={mafiaProviderSelection}
              selectedModel={mafiaModelSelection}
              onProviderModelChange={handleMafiaProviderModelChange}
              disabled={isSubmitting}
            />
          </div>
        )}
      </div>

      {/* Human Player Option */}
      <div className="space-y-3">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="human-join"
            checked={isHumanJoining}
            onCheckedChange={(checked) => setIsHumanJoining(checked === true)}
            disabled={isSubmitting}
          />
          <Label
            htmlFor="human-join"
            className="text-sm cursor-pointer flex items-center gap-2"
          >
            <User size={16} />
            {t('JoinAsHumanLabel', 'Join the game yourself?')}
          </Label>
        </div>

        {isHumanJoining && (
          <div>
            <Label
              htmlFor="human-name"
              className="text-sm font-medium text-muted-foreground mb-2 block"
            >
              {t('YourPlayerNameLabel', 'Your Player Name')}
            </Label>
            <Input
              id="human-name"
              type="text"
              value={humanPlayerName}
              onChange={(e) => setHumanPlayerName(e.target.value)}
              placeholder={t('EnterYourNamePlaceholder', 'Enter your name')}
              disabled={isSubmitting}
              required
            />
          </div>
        )}
      </div>

      {/* Player Count */}
      <div>
        <Label className="text-sm font-medium text-muted-foreground mb-2 block">
          {t('PlayersLabel', 'Players')}: {playerCount}
        </Label>
        <div className="flex items-center space-x-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPlayerCount(Math.max(5, playerCount - 1))}
            disabled={isSubmitting || playerCount <= 5}
          >
            -
          </Button>
          <span className="w-12 text-center font-medium">{playerCount}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPlayerCount(Math.min(12, playerCount + 1))}
            disabled={isSubmitting || playerCount >= 12}
          >
            +
          </Button>
        </div>
      </div>

      {/* Language Selector */}
      <div>
        <Label className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-2">
          <Languages size={16} />
          {t('GameLanguageLabel', 'Game Language')}
        </Label>
        <LanguageSelector currentLang={lang} />
      </div>

      {/* Game Theme Selector */}
      <div>
        <GameThemeSelector
          selectedThemeKey={selectedGameThemeKey}
          onThemeChange={setSelectedGameThemeKey}
          disabled={isSubmitting}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-3 pt-4">
        <MagicalAIButton
          onClick={handleStartGame}
          disabled={!canStartGame}
          className="w-full"
          size="lg"
          variant="magical"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              {t('StartingButtonLabel', 'Starting...')}
            </>
          ) : (
            t('StartGameButton', 'Start Game')
          )}
        </MagicalAIButton>

        <Button variant="outline" asChild className="w-full">
          <Link href={`/${lang}/character-setup`}>
            <Settings2 className="mr-2 h-4 w-4" />
            {t('CustomizeCharactersButton', 'Customize Characters')}
          </Link>
        </Button>
      </div>
    </div>
  );
}
