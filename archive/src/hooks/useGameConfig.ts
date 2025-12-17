import { startGameAction } from '@/app/actions/setup.actions';
import type { StartGameSetupData } from '@/lib/interfaces/actions.types';
import { DEFAULT_GAME_SETTINGS } from '@/lib/config';
import { RoleName } from '@/lib/engine/interfaces/IRole';
import type { Persona } from '@/lib/engine/interfaces/Persona';
import { getThemes } from '@/lib/utils/themeLoader';
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import type { LanguageCode as Locale } from '@/lib/i18n/settings';
import { useTranslation } from 'react-i18next';
import type { AgentConfig } from '@/lib/interfaces/agent.types';
import { availableModelsByProvider, availableProviders } from '@/lib/models';
import React from 'react';
import type { CharacterPreferences } from '@/components/ui/character-preview';

const getDefaultModelForProvider = (providerValue: string): string => {
  if (providerValue === 'groq') {
    return 'gemma2-9b-it';
  }
  if (providerValue === 'gemini') {
    return 'gemini-2.0-flash-lite';
  }
  const models = availableModelsByProvider[providerValue];
  if (models && models.length > 0) {
    const defaultModel = models.find((m) =>
      m.title.toLowerCase().includes('default')
    );
    return defaultModel?.value ?? models[0].value;
  }

  return '';
};

export interface UICharacterProfile {
  characterName: string;
  gender: string;
  ageCategory: string;
  shortBio: string;
}

export interface ConfigCharacterSlot {
  clientId: string;
  provider: string;
  aiModel: string;
  roleSelection: RoleName;
  assignedRole?: RoleName;
  isGenerated: boolean;
  isHuman?: boolean;
  profile?: Partial<UICharacterProfile>;
  imageUrl?: string | null;
  generationError?: string;
  persona?: Persona;
  preferences?: CharacterPreferences;
}

export interface PlayerInitializationData {
  role: RoleName;
  profile: UICharacterProfile;
  provider: string;
  aiModel: string;
  imageUrl?: string | null;
  persona?: Persona;
  voiceId?: string;
  isHuman: boolean;
}

const getAgentTypeFromProvider = (providerValue?: string): string => {
  if (!providerValue) return 'Dummy';
  switch (providerValue) {
    case 'groq':
      return 'Groq';
    case 'ollama_local':
      return 'Ollama';
    case 'fireworks':
      return 'Fireworks';
    case 'openai':
      return 'OpenAI';
    case 'gemini':
      return 'Gemini';
    case 'anthropic':
    case 'claude':
      return 'Claude';
    default:
      console.warn(
        `Unknown provider value "${providerValue}" in useGameConfig. Defaulting agentType to OpenAI.`
      );
      return 'OpenAI';
  }
};

export function useGameConfig(
  lang: Locale,
  useSeparateMafiaConfig: boolean,
  mafiaProviderSelection?: string,
  mafiaModelSelection?: string,
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null
) {
  const { t } = useTranslation('translation');

  const firstThemeKey = Object.keys(getThemes())[0] || 'UK_VILLAGE_1900S';
  const [selectedGameThemeKey, setSelectedGameThemeKey] =
    useState<string>(firstThemeKey);

  // Use first available provider as initial default
  const initialProvider =
    availableProviders.length > 0 ? availableProviders[0].value : 'groq';

  const [globalProviderSelection, setGlobalProviderSelection] =
    useState<string>(initialProvider);
  const [globalModelSelection, setGlobalModelSelection] = useState<string>(() =>
    getDefaultModelForProvider(initialProvider)
  );

  const [characterSlots, setCharacterSlots] = useState<ConfigCharacterSlot[]>(
    []
  );

  const [isAudioEnabled, setIsAudioEnabled] = useState<boolean>(false);
  const [isVoiceModeEnabled, setIsVoiceModeEnabled] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [initialSlotsSet, setInitialSlotsSet] = useState(false);
  const [infoMsg, setInfoMsg] = useState<string | null>('InitialConfigPrompt');
  const [isLoadingNextTurn] = useState(false);
  const [isHumanJoining, setIsHumanJoining] = useState<boolean>(false);
  const [humanRoleSelection, setHumanRoleSelection] = useState<RoleName>(
    (DEFAULT_GAME_SETTINGS.roleDistribution &&
      (Object.keys(DEFAULT_GAME_SETTINGS.roleDistribution)[0] as RoleName)) ||
      RoleName.Villager
  );

  useEffect(() => {
    if (!globalProviderSelection || !globalModelSelection) {
      return;
    }

    if (initialSlotsSet) {
      const currentSlotsArePopulated = characterSlots.length > 0;
      if (currentSlotsArePopulated) {
        const hasHumanSlot = characterSlots.some((slot) => slot.isHuman);
        if (hasHumanSlot === isHumanJoining) {
          return;
        }
      }
    }

    const initialPlayerCount = 9;

    const DEFAULT_ROLE_DISTRIBUTION = {
      [RoleName.Mafia]: 2,
      [RoleName.Seer]: 1,
      [RoleName.Doctor]: 1,
      [RoleName.Villager]: 5,
    };

    const tempRoleDist = { ...DEFAULT_ROLE_DISTRIBUTION };

    if (isHumanJoining) {
      if (tempRoleDist[humanRoleSelection] > 0) {
        tempRoleDist[humanRoleSelection]--;
      } else {
        if (tempRoleDist[RoleName.Villager] > 0) {
          tempRoleDist[RoleName.Villager]--;
        }
      }
    }

    const aiRoles: RoleName[] = Object.entries(tempRoleDist).flatMap(
      ([role, count]) => Array(count).fill(role as RoleName)
    );

    const numAiPlayers = initialPlayerCount - (isHumanJoining ? 1 : 0);

    if (aiRoles.length < numAiPlayers) {
      aiRoles.push(
        ...Array(numAiPlayers - aiRoles.length).fill(RoleName.Villager)
      );
    } else if (aiRoles.length > numAiPlayers) {
      while (aiRoles.length > numAiPlayers) {
        const villagerIndex = aiRoles.lastIndexOf(RoleName.Villager);
        if (villagerIndex !== -1) {
          aiRoles.splice(villagerIndex, 1);
        } else {
          aiRoles.pop();
        }
      }
    }

    for (let i = aiRoles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [aiRoles[i], aiRoles[j]] = [aiRoles[j], aiRoles[i]];
    }

    const initialSlots: ConfigCharacterSlot[] = [];
    let playerIndex = 1;

    if (isHumanJoining) {
      const defaultHumanName =
        user?.name || t('DefaultHumanPlayerName', `Player ${playerIndex}`);
      initialSlots.push({
        clientId: crypto.randomUUID(),
        provider: '',
        aiModel: '',
        roleSelection: humanRoleSelection,
        isGenerated: false,
        isHuman: true,
        profile: {
          characterName: defaultHumanName,
        },
        imageUrl: user?.image || null,
      });
      playerIndex++;
    }

    for (let i = 0; i < numAiPlayers; i++) {
      initialSlots.push({
        clientId: crypto.randomUUID(),
        provider: globalProviderSelection,
        aiModel: globalModelSelection,
        roleSelection: aiRoles[i] || RoleName.Villager,
        isGenerated: false,
        isHuman: false,
        profile: {
          characterName: t('DefaultAIPlayerName', `Player ${playerIndex}`),
        },
      });
      playerIndex++;
    }

    setCharacterSlots(initialSlots);
    setInitialSlotsSet(true);
  }, [
    isHumanJoining,
    humanRoleSelection,
    initialSlotsSet,
    characterSlots,
    globalModelSelection,
    globalProviderSelection,
    user?.name,
    user?.image,
    t,
  ]);

  const configValidation = useMemo(() => {
    const slotsCount = characterSlots.length;

    if (slotsCount < 5) {
      return {
        isValid: false,
        message: t('MinPlayerValidationError', { min: 5 }),
      };
    }

    const aiSlots = characterSlots.filter((slot) => !slot.isHuman);

    const aiSlotsValid = aiSlots.every((slot) => slot.provider && slot.aiModel);
    if (!aiSlotsValid) {
      return {
        isValid: false,
        message: t(
          'ProviderModelMissingValidationError',
          'Provider/Model must be set for all AI players.'
        ),
      };
    }

    const nameSet = new Set<string>();
    let hasEmptyName = false;

    for (const slot of characterSlots) {
      const name = slot.profile?.characterName?.trim();
      if (!name) {
        hasEmptyName = true;
        break;
      }

      const lowerName = name.toLowerCase();
      if (nameSet.has(lowerName)) {
        return {
          isValid: false,
          message: t(
            'DuplicatePlayerNameValidationError',
            'Player names must be unique.'
          ),
        };
      }
      nameSet.add(lowerName);
    }

    if (hasEmptyName) {
      return {
        isValid: false,
        message: t(
          'EmptyPlayerNameValidationError',
          'Player names cannot be empty.'
        ),
      };
    }

    return { isValid: true, message: null };
  }, [characterSlots, t]);

  const memoizedValues = useMemo(() => {
    const canAttemptStart = configValidation.isValid && !isSubmitting;
    const totalSlots = characterSlots.length;

    return { canAttemptStart, totalSlots };
  }, [configValidation.isValid, isSubmitting, characterSlots.length]);

  const { canAttemptStart, totalSlots } = memoizedValues;

  const addPlayerSlot = useCallback(() => {
    setCharacterSlots((prev) => [
      ...prev,
      {
        clientId: crypto.randomUUID(),
        provider: globalProviderSelection,
        aiModel: globalModelSelection,
        roleSelection: RoleName.Villager,
        isGenerated: false,
        isHuman: false,
      },
    ]);
  }, [globalProviderSelection, globalModelSelection]);

  const removePlayerSlot = useCallback((clientIdToRemove: string) => {
    setCharacterSlots((prev) => {
      const slotToRemove = prev.find((c) => c.clientId === clientIdToRemove);
      const updatedSlots = prev.filter((c) => c.clientId !== clientIdToRemove);
      if (slotToRemove?.isHuman) {
        setIsHumanJoining(false);
      }
      return updatedSlots;
    });
  }, []);

  const updateSlotProviderAndModel = useCallback(
    (clientId: string, provider: string, newModel: string) => {
      setCharacterSlots((prev) =>
        prev.map((slot) =>
          slot.clientId === clientId
            ? {
                ...slot,
                provider: provider,
                aiModel: newModel,
                isGenerated: false,
              }
            : slot
        )
      );
    },
    []
  );

  const updateSlotName = useCallback((clientId: string, newName: string) => {
    setCharacterSlots((prev) =>
      prev.map((slot) =>
        slot.clientId === clientId
          ? { ...slot, profile: { ...slot.profile, characterName: newName } }
          : slot
      )
    );
  }, []);

  const debounceTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const updateSlotNameDebounced = useCallback(
    (clientId: string, newName: string) => {
      const existingTimer = debounceTimersRef.current.get(clientId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const timer = setTimeout(() => {
        updateSlotName(clientId, newName);
        debounceTimersRef.current.delete(clientId);
      }, 300);

      debounceTimersRef.current.set(clientId, timer);
    },
    [updateSlotName]
  );

  // Clean up any pending debounce timers on unmount
  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      // Refs are stable and don't need to be in dependencies for cleanup
      debounceTimersRef.current.forEach((timer) => {
        clearTimeout(timer);
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
      debounceTimersRef.current.clear();
    };
  }, []);

  const updateSlotImageUrl = useCallback(
    (clientId: string, newImageUrl: string | null) => {
      setCharacterSlots((prev) =>
        prev.map((slot) =>
          slot.clientId === clientId ? { ...slot, imageUrl: newImageUrl } : slot
        )
      );
    },
    []
  );

  const updateAllProvidersAndModels = useCallback(
    (newProvider: string, newModel: string) => {
      if (
        globalProviderSelection === newProvider &&
        globalModelSelection === newModel
      ) {
        return;
      }

      // Batch state updates
      React.startTransition(() => {
        setGlobalProviderSelection(newProvider);
        setGlobalModelSelection(newModel);

        setCharacterSlots((prevSlots) => {
          const needsUpdate = prevSlots.some(
            (slot) =>
              !slot.isHuman &&
              (slot.provider !== newProvider || slot.aiModel !== newModel)
          );

          if (!needsUpdate) {
            return prevSlots;
          }

          const updatedSlots = prevSlots.map((slot) =>
            slot.isHuman
              ? slot
              : {
                  ...slot,
                  provider: newProvider,
                  aiModel: newModel,
                  isGenerated: false,
                }
          );

          return updatedSlots;
        });
      });
    },
    [globalProviderSelection, globalModelSelection]
  );

  const updateSlotRole = useCallback((clientId: string, roleName: RoleName) => {
    setCharacterSlots((prev) =>
      prev.map((slot) =>
        slot.clientId === clientId
          ? { ...slot, roleSelection: roleName, isGenerated: false }
          : slot
      )
    );
  }, []);

  const toggleAudioEnabled = useCallback(() => {
    setIsAudioEnabled((prev) => !prev);
  }, []);

  const toggleVoiceModeEnabled = useCallback(() => {
    setIsVoiceModeEnabled((prev) => !prev);
  }, []);

  const toggleHumanJoining = useCallback(() => {
    setIsHumanJoining((prev) => {
      const becomingHuman = !prev;
      setInitialSlotsSet(false);
      setCharacterSlots([]);
      return becomingHuman;
    });
  }, []);

  const updateHumanRoleSelection = useCallback((role: RoleName) => {
    setHumanRoleSelection(role);
    setInitialSlotsSet(false);
    setCharacterSlots([]);
  }, []);

  const handleGenerateAndStartGame = useCallback(async () => {
    if (!configValidation.isValid || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMsg(null);
    setInfoMsg(t('StartingGameInfo', {}));

    const firstAiSlot = characterSlots.find((slot) => !slot.isHuman);
    const agentProvider = firstAiSlot?.provider ?? globalProviderSelection;
    const agentModel = firstAiSlot?.aiModel ?? globalModelSelection;

    const agentConfig: AgentConfig = {
      agentType: getAgentTypeFromProvider(agentProvider),
      modelName: agentModel,
      providerValue: agentProvider,
    };

    const mafiaAgentConfig =
      useSeparateMafiaConfig && mafiaProviderSelection && mafiaModelSelection
        ? {
            agentType: getAgentTypeFromProvider(mafiaProviderSelection),
            modelName: mafiaModelSelection,
            providerValue: mafiaProviderSelection,
          }
        : agentConfig;

    const setupData: StartGameSetupData = {
      players: characterSlots.map((slot, index) => ({
        name: slot.profile?.characterName || `Player ${index + 1}`,
        rolePreference: slot.roleSelection,
        isHuman: slot.isHuman ?? false,
        imageUrl: slot.imageUrl ?? null,
        agentConfig: slot.isHuman
          ? { agentType: 'Human' }
          : slot.roleSelection === RoleName.Mafia
            ? mafiaAgentConfig
            : agentConfig,
      })),
      themeKey: selectedGameThemeKey,
      language: lang,
      voiceModeEnabled: isVoiceModeEnabled,
    };

    try {
      await startGameAction(setupData);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'StartGameFailedError';

      if (errorMessage.includes('NEXT_REDIRECT')) {
        return;
      }

      setErrorMsg(t(errorMessage, { defaultValue: errorMessage }));
      setIsSubmitting(false);
      setInfoMsg(null);
    }
  }, [
    characterSlots,
    configValidation.isValid,
    isSubmitting,
    globalProviderSelection,
    globalModelSelection,
    lang,
    useSeparateMafiaConfig,
    mafiaProviderSelection,
    mafiaModelSelection,
    t,
    selectedGameThemeKey,
    isVoiceModeEnabled,
  ]);

  useEffect(() => {
    if (!initialSlotsSet && characterSlots.length > 0) {
      const humanSlot = characterSlots.find((slot) => slot.isHuman);
      if (humanSlot) {
        setIsHumanJoining(true);
      } else {
        setIsHumanJoining(false);
      }
    }
  }, [initialSlotsSet, characterSlots]);

  const updateSlotPreferences = useCallback(
    (clientId: string, preferences: CharacterPreferences) => {
      setCharacterSlots((prev) =>
        prev.map((slot) =>
          slot.clientId === clientId ? { ...slot, preferences } : slot
        )
      );
    },
    []
  );

  return {
    characterSlots,
    isSubmitting,
    errorMsg,
    infoMsg,
    initialSlotsSet,
    configValidation,
    canAttemptStart,
    totalSlots,
    globalProviderSelection,
    globalModelSelection,
    availableProviders,
    availableModelsByProvider,
    isAudioEnabled,
    isVoiceModeEnabled,
    isLoadingNextTurn,
    addPlayerSlot,
    removePlayerSlot,
    updateSlotProviderAndModel,
    updateAllProvidersAndModels,
    updateSlotRole,
    updateSlotName: updateSlotNameDebounced,
    updateSlotImageUrl,
    toggleAudioEnabled,
    toggleVoiceModeEnabled,
    handleGenerateAndStartGame,
    isHumanJoining,
    humanRoleSelection,
    updateHumanRoleSelection,
    toggleHumanJoining,
    selectedGameThemeKey,
    setSelectedGameThemeKey,
    setCharacterSlots,
    updateSlotPreferences,
  };
}
