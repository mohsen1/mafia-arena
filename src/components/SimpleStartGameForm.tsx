'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MagicalAIButton } from '@/components/ui/magical-ai-button';
import { EnhancedProviderModelSelector } from '@/components/EnhancedProviderModelSelector';
import { GameThemeSelector } from '@/components/GameThemeSelector';
import LanguageSelector from '@/components/LanguageSelector';
import { useTranslation } from 'react-i18next';
import { type LanguageCode } from '@/lib/i18n/settings';
import {
  Bot,
  Languages,
  Loader2,
  Settings2,
  User,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { startGameAction } from '@/app/actions/setup.actions';
import type { StartGameSetupData } from '@/lib/interfaces/actions.types';
import { RoleName } from '@/lib/engine/interfaces/IRole';
import type { AgentConfig } from '@/lib/interfaces/agent.types';
import { availableModelsByProvider } from '@/lib/models';
import {
  getUserApiKeys,
  type UserApiKeyInfo,
} from '@/app/actions/api-keys.actions';
import {
  getUserAvailableProviders,
  type AvailableProvider,
} from '@/lib/utils/providerUtils';
import {
  OllamaConfig,
  type OllamaConfiguration,
} from '@/components/OllamaConfig';
import { getAvailableProvidersFromEnv } from '@/app/actions/setup.actions';

export interface SimpleStartGameFormProps {
  lang: LanguageCode;
  user?: {
    name?: string | null;
    email?: string | null;
  } | null;
}

function getAgentTypeFromProvider(
  provider: string
): 'OpenAI' | 'Claude' | 'Gemini' | 'Human' | 'Groq' | 'Ollama' | 'Fireworks' {
  if (provider === 'openai') return 'OpenAI';
  if (provider === 'groq') return 'Groq';
  if (provider === 'fireworks') return 'Fireworks';
  if (provider === 'ollama_local') return 'Ollama';
  if (provider === 'anthropic' || provider === 'claude') return 'Claude';
  if (provider === 'gemini') return 'Gemini';
  if (provider === 'human') return 'Human';
  // Default fallback
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
    useState('UK_VILLAGE_1900S');
  const [playerCount, setPlayerCount] = useState(6);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [userApiKeys, setUserApiKeys] = useState<UserApiKeyInfo[]>([]);
  const [envProviders, setEnvProviders] = useState<AvailableProvider[]>([]);
  const [showOllamaConfig, setShowOllamaConfig] = useState(false);
  const [ollamaConfig, setOllamaConfig] = useState<OllamaConfiguration>({
    host: 'localhost',
    port: 11434,
    protocol: 'http',
    apiPath: '/v1',
    enabled: true,
  });

  // Compute all available providers combining env and user providers
  const allAvailableProviders = useMemo(() => {
    // Merge providers, handling cases where both env and user keys exist
    const providerMap = new Map<string, AvailableProvider>();

    // Add environment providers first
    for (const provider of envProviders) {
      providerMap.set(provider.value, provider);
    }

    // Get user providers
    const userProviders = getUserAvailableProviders(userApiKeys);

    // Add or update with user providers
    for (const provider of userProviders) {
      const existing = providerMap.get(provider.value);
      if (existing) {
        // Provider has both env and user keys
        providerMap.set(provider.value, {
          ...existing,
          source: 'both',
          userKeyName: provider.userKeyName,
        });
      } else {
        // Provider only has user keys
        providerMap.set(provider.value, provider);
      }
    }

    // Sort providers with Groq first if available, then alphabetically
    return Array.from(providerMap.values()).sort((a, b) => {
      // Prioritize Groq as the default provider
      if (a.value === 'groq') return -1;
      if (b.value === 'groq') return 1;
      // Then prioritize OpenAI
      if (a.value === 'openai') return -1;
      if (b.value === 'openai') return 1;
      // Then sort alphabetically
      return a.title.localeCompare(b.title);
    });
  }, [envProviders, userApiKeys]);

  // Load environment providers on mount
  useEffect(() => {
    const loadEnvProviders = async () => {
      try {
        const providers = await getAvailableProvidersFromEnv();
        setEnvProviders(providers);
      } catch (error) {
        console.error('Failed to load environment providers:', error);
        // Continue without env providers - user can still use user-provided keys
      }
    };

    loadEnvProviders();
  }, []);

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

  // Load user API keys
  useEffect(() => {
    const loadUserApiKeys = async () => {
      try {
        const keys = await getUserApiKeys();
        setUserApiKeys(keys);
      } catch (error) {
        console.error('Failed to load user API keys:', error);
        // Silently fail - user can still use environment keys
      }
    };

    if (user?.email) {
      loadUserApiKeys();
    }
  }, [user?.email]);

  // Auto-select first available provider and model as default
  useEffect(() => {
    if (!globalProviderSelection && allAvailableProviders.length > 0) {
      const firstProvider = allAvailableProviders[0];
      const defaultModel = getDefaultModelForProvider(firstProvider.value);

      if (firstProvider && defaultModel) {
        setGlobalProviderSelection(firstProvider.value);
        setGlobalModelSelection(defaultModel);
      }
    }
  }, [globalProviderSelection, allAvailableProviders]);

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

    console.log('[SimpleStartGameForm] Starting game with configuration:', {
      globalProvider: globalProviderSelection,
      globalModel: globalModelSelection,
      useSeparateMafia: useSeparateAIModelForMafia,
      mafiaProvider: mafiaProviderSelection,
      mafiaModel: mafiaModelSelection,
      isHumanJoining,
      humanPlayerName,
      playerCount,
      theme: selectedGameThemeKey,
    });

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

      console.log('[SimpleStartGameForm] Player distribution:', {
        mafiaCount,
        doctorCount,
        seerCount,
        villagerCount,
        humanPlayer: isHumanJoining,
      });

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
          name: t('MafiaPlayer', { number: i + 1 }),
          rolePreference: RoleName.Mafia,
          isHuman: false,
          imageUrl: null,
          agentConfig: mafiaAgentConfig,
        });
      }

      // Add special roles
      players.push({
        name: t('Doctor'),
        rolePreference: RoleName.Doctor,
        isHuman: false,
        imageUrl: null,
        agentConfig: globalAgentConfig,
      });

      players.push({
        name: t('Seer'),
        rolePreference: RoleName.Seer,
        isHuman: false,
        imageUrl: null,
        agentConfig: globalAgentConfig,
      });

      // Add villagers
      for (let i = 0; i < villagerCount; i++) {
        players.push({
          name: t('VillagerPlayer', { number: i + 1 }),
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

      console.log('[SimpleStartGameForm] Calling startGameAction with:', {
        playerCount: setupData.players.length,
        themeKey: setupData.themeKey,
        language: setupData.language,
      });

      const result = await startGameAction(setupData);

      console.log('[SimpleStartGameForm] startGameAction returned:', result);

      // Check if we got an error response
      if (result && 'error' in result) {
        console.error(
          '[SimpleStartGameForm] Game creation error:',
          result.error
        );
        setErrorMsg(t(result.error, { defaultValue: result.error }));
        setIsSubmitting(false);
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'StartGameFailedError';

      console.error('[SimpleStartGameForm] Caught error:', error);

      if (errorMessage.includes('NEXT_REDIRECT')) {
        console.log(
          '[SimpleStartGameForm] Redirect detected, game creation successful'
        );
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
          <EnhancedProviderModelSelector
            idPrefix="global-provider"
            selectedProviderValue={globalProviderSelection}
            selectedModel={globalModelSelection}
            onProviderModelChange={handleGlobalProviderModelChange}
            availableProviders={allAvailableProviders}
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
            <EnhancedProviderModelSelector
              idPrefix="mafia-provider"
              selectedProviderValue={mafiaProviderSelection}
              selectedModel={mafiaModelSelection}
              onProviderModelChange={handleMafiaProviderModelChange}
              availableProviders={allAvailableProviders}
              disabled={isSubmitting}
            />
          </div>
        )}
      </div>

      {/* API Key Management */}
      {allAvailableProviders.length === 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {t('NoProvidersConfigured')}{' '}
            <Link
              href={`/${lang}/profile`}
              className="underline underline-offset-4 hover:text-primary"
            >
              {t('AddApiKeysInProfile')}
            </Link>{' '}
            {t('ToStartGame')}
          </AlertDescription>
        </Alert>
      )}

      {/* Ollama Configuration */}
      {(globalProviderSelection === 'ollama_local' ||
        mafiaProviderSelection === 'ollama_local') && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium text-muted-foreground">
              {t('OllamaConfiguration')}
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowOllamaConfig(!showOllamaConfig)}
              disabled={isSubmitting}
            >
              {showOllamaConfig ? t('HideOllama') : t('ConfigureOllama')}{' '}
              {t('OllamaConfiguration').split(' ')[0]}
            </Button>
          </div>

          {showOllamaConfig && (
            <div className="rounded-lg p-4 bg-secondary/20">
              <OllamaConfig
                initialConfig={ollamaConfig}
                onConfigChange={setOllamaConfig}
              />
            </div>
          )}
        </div>
      )}

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
