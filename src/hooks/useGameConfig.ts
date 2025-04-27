import { generateCharacterAction, startGameAction } from "@/app/actions/index";
import type { StartGameInputData } from "@/app/actions/gameSetup";
import { DEFAULT_GAME_SETTINGS, calculateNumPlayers } from "@/lib/config";
import { RoleName } from "@/lib/engine/interfaces/IRole";
import type { Persona } from "@/lib/engine/interfaces/Persona";
import type { ValidationResult } from "@/lib/validators/gameConfigValidator";
import {
  validateGameConfiguration,
  validateGeneratedGameSetup,
} from "@/lib/validators/gameConfigValidator";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { LanguageCode as Locale } from "@/lib/i18n/settings";
import { useTranslation } from "react-i18next";

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
  const [postGenValidationMsg, setPostGenValidationMsg] = useState<
    string | null
  >(null);
  const [isPostGenValid, setIsPostGenValid] = useState<boolean | null>(null);
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

  const resetPostGenState = useCallback(() => {
    setErrorMsg(null);
    setPostGenValidationMsg(null);
    setIsPostGenValid(null);
  }, []);

  const resetSlotGeneration = useCallback(
    (slot: ConfigCharacterSlot): ConfigCharacterSlot => ({
      ...slot,
      isGenerated: false,
      assignedRole: undefined,
      profile: undefined,
      imageUrl: undefined,
      generationError: undefined,
    }),
    [],
  );

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
    if (isHumanJoining && roleDist[humanRoleSelection] > 0) {
      roleDist[humanRoleSelection]--;
    }
    const defaultNumPlayersFromConfig = calculateNumPlayers(
      DEFAULT_GAME_SETTINGS.roleDistribution as Record<RoleName, number>,
    );
    const initialPlayerCount = Math.max(5, defaultNumPlayersFromConfig);

    // Build roles array for AI slots
    const defaultRoles: RoleName[] = Object.entries(roleDist).flatMap(
      ([role, count]) => Array(count).fill(role as RoleName)
    );

    // Shuffle roles for randomness
    for (let i = defaultRoles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [defaultRoles[i], defaultRoles[j]] = [defaultRoles[j], defaultRoles[i]];
    }

    const initialSlots: ConfigCharacterSlot[] = Array.from({
      length: isHumanJoining ? defaultRoles.length + 1 : defaultRoles.length,
    }).map((_, index) => {
      // Assign human slot at index 0 if joining
      if (isHumanJoining && index === 0) {
        return { clientId: crypto.randomUUID(), aiModel: "", roleSelection: humanRoleSelection, isGenerated: false, isHuman: true, profile: { characterName: humanPlayerName } as Partial<UICharacterProfile> };
      }
      // AI slot index offset when human at front
      const aiIndex = isHumanJoining ? index - 1 : index;
      const roleSelection = defaultRoles[aiIndex] || RoleName.Villager;
      return {
        clientId: crypto.randomUUID(),
        aiModel: globalModelSelection,
        roleSelection,
        isGenerated: false,
        isHuman: false,
      };
    }) as ConfigCharacterSlot[];

    setCharacterSlots(initialSlots);
    setInitialSlotsSet(true);
  }, [availableModels, globalModelSelection, initialSlotsSet, isHumanJoining, humanRoleSelection, humanPlayerName]);

  const configValidation = useMemo(() => {
    return validateGameConfiguration(characterSlots);
  }, [characterSlots]);

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
    resetPostGenState();
  }, [globalModelSelection, resetPostGenState]);

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
      resetPostGenState();
    },
    [resetPostGenState],
  );

  const updateSlotModel = useCallback(
    (clientId: string, newModel: string) => {
      setCharacterSlots((prev) =>
        prev.map((slot) =>
          slot.clientId === clientId
            ? resetSlotGeneration({ ...slot, aiModel: newModel })
            : slot,
        ),
      );
      resetPostGenState();
    },
    [resetPostGenState, resetSlotGeneration],
  );

  const updateAllModels = useCallback(
    (newModel: string) => {
      setGlobalModelSelection(newModel);
      setCharacterSlots((prev) =>
        prev.map((slot) => resetSlotGeneration({ ...slot, aiModel: newModel })),
      );
      resetPostGenState();
    },
    [resetPostGenState, resetSlotGeneration],
  );

  const updateSlotRole = useCallback(
    (clientId: string, newRole: RoleName) => {
      setCharacterSlots((prev) =>
        prev.map((slot) =>
          slot.clientId === clientId
            ? resetSlotGeneration({ ...slot, roleSelection: newRole })
            : slot,
        ),
      );
      resetPostGenState();
    },
    [resetPostGenState, resetSlotGeneration],
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
      resetPostGenState();
      return becomingHuman;
    });
  }, [resetPostGenState]);

  const updateHumanPlayerName = useCallback((name: string) => {
    setHumanPlayerName(name);
    setCharacterSlots(slots => slots.map(slot => {
      if (slot.isHuman && slot.profile) {
        return { ...slot, profile: { ...slot.profile, characterName: name } };
      }
      return slot;
    }));
  }, []);

  const handleGenerateAndStartGame = useCallback(async () => {
    const humanSlot = characterSlots.find(slot => slot.isHuman);

    if (!configValidation.isValid || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMsg(null);
    setInfoMsg(t("GeneratingCharactersInfo"));
    setPostGenValidationMsg(null);
    setIsPostGenValid(null);

    // Separate human player slot from AI slots
    const aiSlotsToReset = characterSlots.filter(slot => !slot.isHuman).map(resetSlotGeneration);
    // Keep human slot as is, but ensure its generation state is reset if needed (though it shouldn't generate)
    const currentSlots = humanSlot ? [humanSlot, ...aiSlotsToReset] : aiSlotsToReset;

    setCharacterSlots(currentSlots);

    const generatedProfiles: UICharacterProfile[] = [];
    // We'll generate only AI slots, start with AI slots needing generation
    const aiSlotsToGenerate = currentSlots.filter(slot => !slot.isHuman);
    const generatedAiSlots: ConfigCharacterSlot[] = []; // Store successfully generated AI slots
    let finalValidation: ValidationResult | null = null;

    try {
      // Generate only AI characters
      for (let i = 0; i < aiSlotsToGenerate.length; i++) {
        const slot = aiSlotsToGenerate[i];
        const originalIndex = i;

        setInfoMsg(
          t("GeneratingCharacterInfo", {
            current: i + 1,
            total: aiSlotsToGenerate.length,
          }),
        );

        const finalRole = slot.roleSelection;
        let generatedResult: ConfigCharacterSlot;

        // Skip generation for human slot if it somehow ended up here
        if (slot.isHuman) continue;

        try {
          const result = await generateCharacterAction(
            finalRole,
            slot.aiModel,
            lang,
            [...generatedProfiles],
          );

          if ("error" in result) throw new Error(result.error);

          generatedResult = {
            ...slot,
            assignedRole: finalRole,
            profile: {
              characterName: result.characterName,
              gender: result.gender,
              ageCategory: result.ageCategory,
              shortBio: result.shortBio,
            },
            persona: result.persona,
            imageUrl: result.imageUrl,
            isGenerated: true,
            generationError: undefined,
          };

          if (generatedResult.profile) {
            generatedProfiles.push(generatedResult.profile as UICharacterProfile);
          }
        } catch (err: unknown) {
          const errorMessage =
            err instanceof Error ? err.message : "GenerationError";
          generatedResult = {
            ...slot,
            assignedRole: finalRole,
            isGenerated: false,
            generationError: errorMessage,
            profile: undefined,
            persona: undefined,
          };
          setErrorMsg((prev) =>
            prev ? `${prev}, ${errorMessage}` : errorMessage,
          );
        }

        // Update the specific AI slot in our temporary array
        generatedAiSlots[originalIndex] = generatedResult;
        // Update the main state by combining human (if exists) and the current state of generated AI slots
        setCharacterSlots(humanSlot ? [humanSlot, ...generatedAiSlots] : [...generatedAiSlots]);
      }

      // Combine human player (if exists) and generated AI players for final validation
      const finalCharacterSlots = humanSlot ? [humanSlot, ...generatedAiSlots] : generatedAiSlots;
      finalValidation = validateGeneratedGameSetup(finalCharacterSlots);
      setPostGenValidationMsg(finalValidation.message ?? null);
      setIsPostGenValid(finalValidation.isValid);

      // --- FIX: Assign role to human slot before final mapping --- 
      if (humanSlot && !humanSlot.assignedRole) {
          // Ensure the human slot object within finalCharacterSlots is updated
          const humanIndex = finalCharacterSlots.findIndex(s => s.isHuman);
          if (humanIndex !== -1) {
            finalCharacterSlots[humanIndex].assignedRole = finalCharacterSlots[humanIndex].roleSelection;
            console.log("Assigned role to human slot:", finalCharacterSlots[humanIndex].assignedRole);
          } else {
            // This case should ideally not happen if humanSlot exists
            console.error("Human slot found initially but not in finalCharacterSlots array?");
          }
      }
      // --- End Fix ---

      if (!finalValidation.isValid) {
        setErrorMsg(t("GenerationInvalidSetupError"));
        setInfoMsg(null);
        setIsSubmitting(false);
        return;
      }

      setInfoMsg(t("ValidationPassedInfo"));

      // Prepare data for startGameAction
      const charactersToSubmit: StartGameInputData[] = finalCharacterSlots
         .map((slot): StartGameInputData | null => {
           if (slot.isHuman) {
             // --- Human Player Data ---            
             if (!slot.profile || !slot.assignedRole) {
               console.error("Human slot missing profile or assigned role", slot);
               return null; // Skip this slot
             }
             return {
               role: slot.assignedRole,
               profile: {
                 characterName: slot.profile.characterName || t("DefaultHumanPlayerName"),
                 gender: slot.profile.gender || "female",
                 ageCategory: slot.profile.ageCategory || "young",
                 shortBio: slot.profile.shortBio || t("DefaultHumanBio"),
               } as UICharacterProfile,
               aiModel: "", // No AI model for human
               imageUrl: slot.imageUrl || null,
               voiceId: undefined,
               isHuman: true,
               // Provide a default/placeholder persona for human to satisfy type
               persona: slot.profile.shortBio || t("DefaultHumanPersona"),
             };
           } 

           // --- AI Player Data --- 
           if (slot.isGenerated && !slot.generationError && slot.profile && slot.assignedRole && slot.persona) {
             return {
               role: slot.assignedRole,
               profile: slot.profile as UICharacterProfile,
               aiModel: slot.aiModel,
               imageUrl: slot.imageUrl,
               persona: slot.persona, // Persona is required and present for generated AI
               voiceId: undefined,
               isHuman: false,
             };
           }

           // --- Invalid/Skipped Slot --- 
           return null;
         })
         .filter((character): character is StartGameInputData => character !== null); // Correct type predicate

      if (charactersToSubmit.length < 5) {
        throw new Error(t("InternalNotEnoughPlayersError"));
      }

      // Now charactersToSubmit should match the expected type for startGameAction
      const result = await startGameAction(
        charactersToSubmit,
        lang,
      );

      if (result && "error" in result) {
        throw new Error(result.error);
      }

      console.warn(
        "startGameAction completed without expected error or redirect. Resetting state.",
      );
      setInfoMsg("GameStartedSuccessInfo");
      setIsSubmitting(false);
    } catch (error: unknown) {
      console.error("Error during game generation or start:", error);
      const errorMessage =
        error instanceof Error ? error.message : "StartGameFailedError";

      if (errorMessage.includes("NEXT_REDIRECT")) {
        throw error;
      }

      setErrorMsg(t(errorMessage, { default: errorMessage }));
      setIsSubmitting(false);
      setInfoMsg(null);
    }
  }, [
    characterSlots,
    configValidation.isValid,
    lang,
    resetSlotGeneration,
    isSubmitting,
    t,
  ]);

  useEffect(() => {
    if (!initialSlotsSet && characterSlots.length > 0) {
      if (characterSlots[0].isHuman) {
        setIsHumanJoining(true);
        setHumanPlayerName(characterSlots[0].profile?.characterName || t("DefaultHumanPlayerName"));
      }
    }
  }, [initialSlotsSet, characterSlots, t]);

  // Expose role selection update
  const updateHumanRoleSelection = useCallback((role: RoleName) => {
    setHumanRoleSelection(role);
    setInitialSlotsSet(false);
    resetPostGenState();
  }, [resetPostGenState]);

  return {
    characterSlots,
    isSubmitting,
    errorMsg,
    infoMsg,
    initialSlotsSet,
    postGenValidationMsg,
    isPostGenValid,
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
