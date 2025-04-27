import { startGameAction } from "@/app/actions/setup.actions";
import type { StartGameSetupData } from "@/lib/interfaces/actions.types";
import { DEFAULT_GAME_SETTINGS, calculateNumPlayers } from "@/lib/config";
import { RoleName } from "@/lib/engine/interfaces/IRole";
import type { Persona } from "@/lib/engine/interfaces/Persona";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { LanguageCode as Locale } from "@/lib/i18n/settings";
import { useTranslation } from "react-i18next";
import { AgentConfig } from "@/lib/interfaces/agent.types";
import { useRouter } from 'next/navigation';

export interface UICharacterProfile {
  characterName: string;
  gender: string;
  ageCategory: string;
  shortBio: string;
}

export interface ConfigCharacterSlot {
  clientId: string;
  aiModel: string;
  roleSelection: RoleName;
  assignedRole?: RoleName;
  isGenerated: boolean;
  isHuman?: boolean;
  profile?: Partial<UICharacterProfile>;
  imageUrl?: string | null;
  generationError?: string;
  persona?: Persona;
}

export interface PlayerInitializationData {
    role: RoleName;
    profile: UICharacterProfile;
    aiModel: string;
    imageUrl?: string | null;
    persona?: Persona;
    voiceId?: string;
    isHuman: boolean;
}

export function useGameConfig(
  availableModels: string[],
  lang: Locale,
) {
  const { t } = useTranslation('translation');
  const router = useRouter();

  const [globalModelSelection, setGlobalModelSelection] =
    useState<string>(DEFAULT_GAME_SETTINGS.aiModel);
  const [characterSlots, setCharacterSlots] = useState<ConfigCharacterSlot[]>(
    [],
  );
  const [isAudioEnabled, setIsAudioEnabled] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [initialSlotsSet, setInitialSlotsSet] = useState(false);
  const [infoMsg, setInfoMsg] = useState<string | null>("InitialConfigPrompt");
  const [isLoadingNextTurn /*, setIsLoadingNextTurn */] = useState(false);
  const [isHumanJoining, setIsHumanJoining] = useState<boolean>(false);
  const [humanRoleSelection, setHumanRoleSelection] = useState<RoleName>(
    (DEFAULT_GAME_SETTINGS.roleDistribution && Object.keys(DEFAULT_GAME_SETTINGS.roleDistribution)[0] as RoleName) || RoleName.Villager
  );
  const [humanPlayerName, setHumanPlayerName] = useState<string>("");

  const defaultModel = useMemo(() => {
    if (availableModels && availableModels.length > 0) {
      return availableModels.includes(DEFAULT_GAME_SETTINGS.aiModel)
        ? DEFAULT_GAME_SETTINGS.aiModel
        : availableModels[0];
    }
    return DEFAULT_GAME_SETTINGS.aiModel;
  }, [availableModels]);

  useEffect(() => {
    setGlobalModelSelection(defaultModel);
  }, [defaultModel]);

  useEffect(() => {
    if (
      initialSlotsSet ||
      availableModels.length === 0 ||
      !globalModelSelection
    )
      return;

    // Determine total players and roles list from config
    const roleDist = { ...DEFAULT_GAME_SETTINGS.roleDistribution } as Record<RoleName, number>;
    const defaultNumPlayersFromConfig = calculateNumPlayers(roleDist);
    let initialPlayerCount = Math.max(5, defaultNumPlayersFromConfig); // Default count before human adjustment

    // Adjust role distribution *if* human is joining AND their selected role is in the default config
    const tempRoleDist = { ...roleDist };
    let humanIndex = -1;
    if (isHumanJoining) {
      humanIndex = 0; // Assume human is always player 0 for simplicity in setup
      if (tempRoleDist[humanRoleSelection] > 0) {
        tempRoleDist[humanRoleSelection]--; // Decrement count for human's role
      } else {
        // If human role wasn't in default dist, add it conceptually (player count increases implicitly)
        // initialPlayerCount++; // Or handle by ensuring config always allows flexibility
        console.warn(`Human selected role ${humanRoleSelection} which was not in the default distribution. Ensure total player count is sufficient.`);
      }
    } else {
      // If no human, use the original config count
      initialPlayerCount = defaultNumPlayersFromConfig;
    }
     // Ensure minimum players
    initialPlayerCount = Math.max(5, initialPlayerCount);

    // Build roles array for AI slots using the adjusted distribution
    const aiRoles: RoleName[] = Object.entries(tempRoleDist).flatMap(
      ([role, count]) => Array(count).fill(role as RoleName)
    );

    // Determine number of AI players needed
    const numAiPlayers = initialPlayerCount - (isHumanJoining ? 1 : 0);

     // Fill remaining AI slots with Villagers if needed, up to numAiPlayers
     while (aiRoles.length < numAiPlayers) {
       aiRoles.push(RoleName.Villager);
     }
     // If we have too many roles due to initial config vs final count, trim excess (prefer villagers first)
     while (aiRoles.length > numAiPlayers) {
        const villagerIndex = aiRoles.lastIndexOf(RoleName.Villager);
        if (villagerIndex !== -1) {
          aiRoles.splice(villagerIndex, 1);
        } else {
          aiRoles.pop(); // Remove last role if no more villagers
        }
     }


    // Shuffle AI roles for randomness
    for (let i = aiRoles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [aiRoles[i], aiRoles[j]] = [aiRoles[j], aiRoles[i]];
    }

    // Create initial slots based on final structure
    const initialSlots: ConfigCharacterSlot[] = [];
    if (isHumanJoining) {
       initialSlots.push({
         clientId: crypto.randomUUID(),
         aiModel: "", // No model for human
         roleSelection: humanRoleSelection,
         isGenerated: false, // Not generated client-side
         isHuman: true,
         profile: { characterName: humanPlayerName || t('DefaultHumanPlayerName', {}) } as Partial<UICharacterProfile>
       });
    }
    for (let i = 0; i < numAiPlayers; i++) {
        initialSlots.push({
            clientId: crypto.randomUUID(),
            aiModel: globalModelSelection, // Use global model for AI
            roleSelection: aiRoles[i] || RoleName.Villager, // Assign shuffled role
            isGenerated: false,
            isHuman: false,
        });
    }


    setCharacterSlots(initialSlots);
    setInitialSlotsSet(true);
  }, [availableModels, globalModelSelection, initialSlotsSet, isHumanJoining, humanRoleSelection, humanPlayerName, t]);

  const configValidation = useMemo(() => {
    const isValid = characterSlots.length >= 3; // Basic check
    const message = isValid ? null : t("MinPlayerValidationError", { min: 3 });
    return { isValid, message };
  }, [characterSlots, t]);

  const canAttemptStart = configValidation.isValid && !isSubmitting;
  const totalSlots = characterSlots.length;

  const addPlayerSlot = useCallback(() => {
    setCharacterSlots((prev) => [
      ...prev,
      {
        clientId: crypto.randomUUID(),
        aiModel: globalModelSelection,
        roleSelection: RoleName.Villager,
        isGenerated: false,
        isHuman: false,
      },
    ]);
  }, [globalModelSelection]);

  const removePlayerSlot = useCallback(
    (clientIdToRemove: string) => {
      setCharacterSlots((prev) => {
        const slotToRemove = prev.find((c) => c.clientId === clientIdToRemove);
        const updatedSlots = prev.filter((c) => c.clientId !== clientIdToRemove);
        if (slotToRemove?.isHuman) {
          setIsHumanJoining(false);
          setHumanPlayerName("");
        }
        return updatedSlots;
      });
    },
    []
  );

  const updateSlotModel = useCallback(
    (clientId: string, newModel: string) => {
      setCharacterSlots((prev) =>
        prev.map((slot) =>
          slot.clientId === clientId
            ? { ...slot, aiModel: newModel, isGenerated: false }
            : slot,
        ),
      );
    },
    []
  );

  const updateAllModels = useCallback(
    (newModel: string) => {
      setGlobalModelSelection(newModel);
      setCharacterSlots((prev) =>
        prev.map((slot) => slot.isHuman ? slot : { ...slot, aiModel: newModel, isGenerated: false }),
      );
    },
    [setGlobalModelSelection]
  );

  const updateSlotRole = useCallback(
    (clientId: string, newRole: RoleName) => {
      setCharacterSlots((prev) =>
        prev.map((slot) =>
          slot.clientId === clientId
            ? { ...slot, roleSelection: newRole, isGenerated: false }
            : slot,
        ),
      );
    },
    []
  );

  const toggleAudioEnabled = useCallback(() => {
    setIsAudioEnabled((prev) => !prev);
  }, []);

  const toggleHumanJoining = useCallback(() => {
    setIsHumanJoining((prev) => {
      const becomingHuman = !prev;
      if (!becomingHuman) {
        setHumanPlayerName("");
      }
      setInitialSlotsSet(false);
      return becomingHuman;
    });
  }, []);

  const updateHumanPlayerName = useCallback((name: string) => {
    setHumanPlayerName(name);
    setCharacterSlots(slots => slots.map(slot => {
      if (slot.isHuman && slot.profile) {
        return { ...slot, profile: { ...slot.profile, characterName: name || t('DefaultHumanPlayerName', {}) } };
      }
      return slot;
    }));
  }, [t]);

  const handleGenerateAndStartGame = useCallback(async () => {
    const humanSlot = characterSlots.find(slot => slot.isHuman);
    const humanPlayerIndex = humanSlot ? characterSlots.indexOf(humanSlot) : -1;

    if (!configValidation.isValid || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMsg(null);
    setInfoMsg(t("StartingGameInfo", {}));

    // TODO: Define actual AgentConfig based on UI selections or defaults
    // These should ideally come from some advanced settings UI later
    const defaultAgentConfig: AgentConfig = {
      model: globalModelSelection,
      provider: 'openai', // Or determine dynamically based on model selection
      // personalityPrompt: "...", // Optional: Add default prompts if needed
      // jsonMode: true, // If required by the agent implementation
    };

    // Prepare the setup data for the server action
    const setupData: StartGameSetupData = {
      playerCount: characterSlots.length,
      themeKey: "classic", // TODO: Make theme selectable in UI
      language: lang,
      humanPlayerName: humanPlayerName || undefined,
      humanPlayerIndex: humanPlayerIndex,
      humanRolePreference: humanRoleSelection, // Pass the preferred role
      // Use the same config for both for now, differentiate later if needed
      townAgentConfig: defaultAgentConfig,
      mafiaAgentConfig: defaultAgentConfig,
    };

    try {
      console.log("Calling startGameAction with:", setupData);
      const result = await startGameAction(setupData);
      console.log("startGameAction result:", result);

      if (result && "error" in result) {
        throw new Error(result.error);
      }

      if (result && result.gameId && result.initialState) {
        setInfoMsg(t("GameStartedSuccessInfo", {}));
        // Redirect to the game page using the returned gameId
        // Assumes a route like /game/[gameId]
        router.push(`/game/${result.gameId}`);
        // No need to set state here, the game page will load the state
      } else {
        // This case should ideally not happen if the action respects its return type
        throw new Error(t("StartGameActionUnexpectedResultError", {}));
      }

      // No need to setIsSubmitting(false) on success because we are navigating away

    } catch (error: unknown) {
      console.error("Error starting game:", error);
      const errorMessage =
        error instanceof Error ? error.message : "StartGameFailedError";
      // Check if it's a NEXT_REDIRECT error and re-throw if so (though unlikely here)
      if (errorMessage.includes("NEXT_REDIRECT")) {
          throw error;
      }
      setErrorMsg(t(errorMessage, { defaultValue: errorMessage }));
      setIsSubmitting(false);
      setInfoMsg(null);
    }
  }, [
    characterSlots,
    configValidation.isValid,
    isSubmitting,
    globalModelSelection,
    lang,
    humanPlayerName,
    humanRoleSelection,
    t,
    router,
  ]);

  useEffect(() => {
    if (!initialSlotsSet && characterSlots.length > 0) {
      if (characterSlots[0].isHuman) {
        setIsHumanJoining(true);
        setHumanPlayerName(characterSlots[0].profile?.characterName || t("DefaultHumanPlayerName", {}));
      }
    }
  }, [initialSlotsSet, characterSlots, t]);

  // Expose role selection update
  const updateHumanRoleSelection = useCallback((role: RoleName) => {
    setHumanRoleSelection(role);
    setInitialSlotsSet(false);
  }, []);

  return {
    characterSlots,
    isSubmitting,
    errorMsg,
    infoMsg,
    initialSlotsSet,
    configValidation,
    canAttemptStart,
    totalSlots,
    globalModelSelection,
    isAudioEnabled,
    isLoadingNextTurn,
    addPlayerSlot,
    removePlayerSlot,
    updateSlotModel,
    updateAllModels,
    updateSlotRole,
    toggleAudioEnabled,
    handleGenerateAndStartGame,
    isHumanJoining,
    humanPlayerName,
    humanRoleSelection,
    updateHumanRoleSelection,
    toggleHumanJoining,
    updateHumanPlayerName,
  };
}
