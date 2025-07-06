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
  Volume2,
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
import type { GamePreset } from '@/components/GamePresetSelector';
import { getThemeKeys } from '@/lib/utils/themeLoader';

export interface SimpleStartGameFormProps {
  lang: LanguageCode;
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
  preset?: GamePreset | null;
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
  if (providerValue === 'groq') {
    // In development, prefer the fastest model (Llama 3.1 8B Instant)
    if (process.env.NODE_ENV === 'development') {
      return 'llama-3.1-8b-instant';
    }
    return 'gemma2-9b-it';
  }
  if (providerValue === 'gemini') {
    return 'gemini-2.0-flash-lite';
  }
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

function getRandomTheme(): string {
  const themeKeys = getThemeKeys();
  const randomIndex = Math.floor(Math.random() * themeKeys.length);
  return themeKeys[randomIndex];
}

export default function SimpleStartGameForm({
  lang,
  user,
  preset,
}: SimpleStartGameFormProps) {
  const { t } = useTranslation();

  // Get default name from user profile
  const defaultPlayerName = user?.name || '';

  // Form state - initialize with preset values if provided
  const [globalProviderSelection, setGlobalProviderSelection] =
    useState<string>('');
  const [globalModelSelection, setGlobalModelSelection] = useState<string>('');
  const [useSeparateAIModelForMafia, setUseSeparateAIModelForMafia] =
    useState(false);
  const [mafiaProviderSelection, setMafiaProviderSelection] =
    useState<string>('');
  const [mafiaModelSelection, setMafiaModelSelection] = useState<string>('');
  const [isHumanJoining, setIsHumanJoining] = useState(
    preset?.humanPlayer ?? false
  );
  const [humanPlayerName, setHumanPlayerName] = useState(defaultPlayerName);
  const [selectedGameThemeKey, setSelectedGameThemeKey] = useState(() => {
    // Use random theme if preset theme is not provided or is empty
    return preset?.theme && preset.theme !== ''
      ? preset.theme
      : getRandomTheme();
  });
  const [playerCount, setPlayerCount] = useState(preset?.playerCount || 6);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showError, setShowError] = useState(false);
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
  const [isVoiceModeEnabled, setIsVoiceModeEnabled] = useState(false);

  // Apply preset settings when preset changes
  useEffect(() => {
    if (preset && preset.id !== 'custom') {
      setPlayerCount(preset.playerCount);
      setIsHumanJoining(preset.humanPlayer);
      // Only set theme if it's not empty
      if (preset.theme && preset.theme !== '') {
        setSelectedGameThemeKey(preset.theme);
      }

      // For spectator mode, don't join as human
      if (preset.id === 'spectator') {
        setIsHumanJoining(false);
      }
    }
  }, [preset]);

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

  // Load user API keys on mount
  useEffect(() => {
    const loadUserKeys = async () => {
      if (!user?.email) return;

      try {
        const keys = await getUserApiKeys();
        setUserApiKeys(keys);
      } catch (error) {
        console.error('Failed to load user API keys:', error);
      }
    };

    loadUserKeys();
  }, [user?.email]);

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
    if (!globalProviderSelection && allAvailableProviders.length > 0) {
      // In development mode, prefer Groq if available (unless disabled)
      let selectedProvider = allAvailableProviders[0];

      const useGroqInDev =
        process.env.NODE_ENV === 'development' &&
        process.env.NEXT_PUBLIC_DISABLE_GROQ_DEV_MODE !== 'true';

      if (useGroqInDev) {
        const groqProvider = allAvailableProviders.find(
          (p) => p.value === 'groq'
        );
        if (groqProvider) {
          selectedProvider = groqProvider;
          console.log(
            '[SimpleStartGameForm] Development mode: Auto-selecting Groq provider'
          );
        }
      }

      const defaultModel = getDefaultModelForProvider(selectedProvider.value);

      if (selectedProvider && defaultModel) {
        setGlobalProviderSelection(selectedProvider.value);
        setGlobalModelSelection(defaultModel);

        // In development, also set Groq for Mafia if available
        if (useGroqInDev && selectedProvider.value === 'groq') {
          setMafiaProviderSelection(selectedProvider.value);
          setMafiaModelSelection(defaultModel);
        }
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
    setShowError(false);

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
          imageUrl: user?.image || null,
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
        voiceModeEnabled: isVoiceModeEnabled,
      };

      console.log('[SimpleStartGameForm] Calling startGameAction with:', {
        playerCount: setupData.players.length,
        themeKey: setupData.themeKey,
        language: setupData.language,
        voiceModeEnabled: setupData.voiceModeEnabled,
        voiceModeType: typeof setupData.voiceModeEnabled,
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
        // Add a small delay before showing error to avoid flash
        setTimeout(() => setShowError(true), 100);
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
      // Add a small delay before showing error to avoid flash
      setTimeout(() => setShowError(true), 100);
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
    user?.image,
    isVoiceModeEnabled,
  ]);

  if (errorMsg && showError) {
    return (
      <Alert variant="destructive" className="max-w-2xl mx-auto">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          {t('ErrorPrefix', 'Error')}: {errorMsg}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 relative">
      <h2 className="text-xl font-semibold text-center mb-4">
        {t('ConfigureNewGameTitle', 'Configure New Game')}
      </h2>

      {/* AI Configuration Section */}
      <div className="space-y-3">
        <h3 className="text-base font-medium flex items-center gap-2">
          <Bot className="w-4 h-4 text-primary" />
          {t('AIConfiguration', 'AI Configuration')}
        </h3>

        <div className="space-y-3 bg-secondary/10 rounded-lg p-4">
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">
                {t('PrimaryAIEngine', 'Primary AI Engine')}
              </Label>
            </div>
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
          <div className="pt-3 border-t border-border/50">
            <div className="flex items-center space-x-2 mb-3">
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
              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-medium mb-2 block">
                    {t('MafiaAIEngine', 'Mafia AI Engine')}
                  </Label>
                </div>
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
        </div>
      </div>

      {/* API Key Management */}
      {allAvailableProviders.length === 0 && (
        <Alert className="border-destructive/50 bg-destructive/10">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {t('NoProvidersConfigured')}{' '}
            <Link
              href={`/${lang}/profile`}
              className="underline underline-offset-4 hover:text-primary font-medium"
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
        <div className="bg-secondary/10 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">
              {t('OllamaConfiguration')}
            </Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowOllamaConfig(!showOllamaConfig)}
              disabled={isSubmitting}
            >
              {showOllamaConfig ? t('Hide') : t('Configure')}
            </Button>
          </div>

          {showOllamaConfig && (
            <div className="pt-4 border-t border-border/50">
              <OllamaConfig
                initialConfig={ollamaConfig}
                onConfigChange={setOllamaConfig}
              />
            </div>
          )}
        </div>
      )}

      {/* Game Settings Section */}
      <div className="space-y-3">
        <h3 className="text-base font-medium flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-primary" />
          {t('GameSettings', 'Game Settings')}
        </h3>

        <div className="space-y-4 bg-secondary/10 rounded-lg p-4">
          {/* Human Player Option */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="human-join"
                checked={isHumanJoining}
                onCheckedChange={(checked) =>
                  setIsHumanJoining(checked === true)
                }
                disabled={isSubmitting}
              />
              <Label
                htmlFor="human-join"
                className="text-sm cursor-pointer flex items-center gap-2"
              >
                <User className="w-4 h-4" />
                {t('JoinAsHumanLabel', 'Join the game yourself')}
              </Label>
            </div>

            {isHumanJoining && (
              <div className="ms-6 mt-3">
                <Label
                  htmlFor="human-name"
                  className="text-sm font-medium mb-2 block"
                >
                  {t('YourPlayerNameLabel', 'Your Character Name')}
                </Label>
                <Input
                  id="human-name"
                  type="text"
                  value={humanPlayerName}
                  onChange={(e) => setHumanPlayerName(e.target.value)}
                  placeholder={t(
                    'EnterYourNamePlaceholder',
                    'Enter your character name'
                  )}
                  disabled={isSubmitting}
                  required
                  className="max-w-sm"
                />
              </div>
            )}
          </div>

          {/* Voice Mode Option */}
          <div className="pt-3 border-t border-border/50">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="voice-mode"
                checked={isVoiceModeEnabled}
                onCheckedChange={(checked) =>
                  setIsVoiceModeEnabled(checked === true)
                }
                disabled={isSubmitting}
              />
              <Label
                htmlFor="voice-mode"
                className="text-sm cursor-pointer flex items-center gap-2"
              >
                <Volume2 className="w-4 h-4" />
                {t(
                  'EnableVoiceModeLabel',
                  'Enable voice mode (text-to-speech)'
                )}
              </Label>
            </div>
          </div>

          {/* Player Count */}
          <div className="pt-3 border-t border-border/50">
            <Label className="text-sm font-medium mb-3 block">
              {t('NumberOfPlayers', 'Number of Players')}
            </Label>
            <div className="flex items-center gap-4">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setPlayerCount(Math.max(5, playerCount - 1))}
                disabled={isSubmitting || playerCount <= 5}
                className="h-10 w-10"
              >
                -
              </Button>
              <span className="text-2xl font-semibold w-12 text-center">
                {playerCount}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setPlayerCount(Math.min(12, playerCount + 1))}
                disabled={isSubmitting || playerCount >= 12}
                className="h-10 w-10"
              >
                +
              </Button>
              <span className="text-sm text-muted-foreground ms-2">
                {t('PlayersRange', '(5-12 players)')}
              </span>
            </div>
          </div>

          {/* Language and Theme */}
          <div className="pt-3 border-t border-border/50 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium flex items-center gap-2 mb-3">
                <Languages className="w-4 h-4" />
                {t('GameLanguageLabel', 'Game Language')}
              </Label>
              <LanguageSelector currentLang={lang} />
            </div>

            <div>
              <GameThemeSelector
                selectedThemeKey={selectedGameThemeKey}
                onThemeChange={setSelectedGameThemeKey}
                disabled={isSubmitting}
              />
            </div>
          </div>
        </div>
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

        <Button
          variant="outline"
          asChild
          className="w-full"
          disabled={isSubmitting}
        >
          <Link href={`/${lang}/character-setup`}>
            <Settings2 className="mr-2 h-4 w-4" />
            {t('CustomizeCharactersButton', 'Customize Characters')}
          </Link>
        </Button>
      </div>

      {/* Loading Overlay */}
      {isSubmitting && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center rounded-lg z-10">
          <div className="text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {t('CreatingGame', 'Creating your game...')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('GeneratingCharacters', 'Generating unique AI characters')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
