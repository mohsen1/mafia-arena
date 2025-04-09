import { generateCharacterAction, startGameAction } from "@/app/actions/index";
import { DEFAULT_GAME_SETTINGS, calculateNumPlayers } from "@/lib/config";
import {
  supportedLanguagesInfo,
  type LanguageCode,
} from "@/lib/translation/languages";
import type {
  AICharacterProfile,
  ConfigCharacterSlot,
  PlayerInitializationData,
  Role,
  ValidationResult,
} from "@/lib/types/game";
import {
  validateGameConfiguration,
  validateGeneratedGameSetup,
} from "@/lib/validators/gameConfigValidator";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

// Update hook signature - REMOVE t function parameter
export function useGameConfig(availableModels: string[]) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation('translation');

  // Determine initial language CODE from URL or default
  const initialLangCode = useMemo(() => {
    const langCodeFromUrl = searchParams.get("lang");
    if (langCodeFromUrl && langCodeFromUrl in supportedLanguagesInfo) {
      console.log(
        `[useGameConfig] Initial language code from URL: ${langCodeFromUrl}`,
      );
      return langCodeFromUrl as LanguageCode;
    }
    console.log(
      `[useGameConfig] No valid language code in URL, defaulting to 'en'.`,
    );
    return "en" as LanguageCode;
  }, [searchParams]);

  const defaultModel = useMemo(() => {
    const preferred = DEFAULT_GAME_SETTINGS.aiModel;
    if (availableModels && availableModels.length > 0) {
      return availableModels.includes(preferred)
        ? preferred
        : availableModels[0];
    }
    return preferred;
  }, [availableModels]);

  const [globalModelSelection, setGlobalModelSelection] =
    useState<string>(defaultModel);
  const [characterSlots, setCharacterSlots] = useState<ConfigCharacterSlot[]>(
    [],
  );
  // Initialize state with the code derived from the URL
  const [selectedLanguage, setSelectedLanguage] =
    useState<LanguageCode>(initialLangCode);
  const [isAudioEnabled, setIsAudioEnabled] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [initialSlotsSet, setInitialSlotsSet] = useState(false);
  // Initialize with default English message or key
  const [infoMsg, setInfoMsg] = useState<string | null>("InitialConfigPrompt"); // Use a key
  const [postGenValidationMsg, setPostGenValidationMsg] = useState<
    string | null
  >(null);
  const [isPostGenValid, setIsPostGenValid] = useState<boolean | null>(null);
  const [isLoadingNextTurn /*, setIsLoadingNextTurn */] = useState(false);

  const resetPostGenState = useCallback(() => {
    setErrorMsg(null);
    setPostGenValidationMsg(null);
    setIsPostGenValid(null);
  }, []);

  // Wrap resetSlotGeneration in useCallback
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
  ); // No dependencies needed

  useEffect(() => {
    setGlobalModelSelection(defaultModel);
  }, [defaultModel]);

  // Effect to sync state if the derived initial code changes after mount
  // This ensures the state updates if the URL param changes causing a re-render
  // without a full remount of this specific component instance.
  useEffect(() => {
    setSelectedLanguage(initialLangCode);
  }, [initialLangCode]);

  useEffect(() => {
    if (
      initialSlotsSet ||
      availableModels.length === 0 ||
      !globalModelSelection
    )
      return;

    const defaultNumPlayersFromConfig = calculateNumPlayers(
      DEFAULT_GAME_SETTINGS.roleDistribution,
    );
    const initialPlayerCount = Math.max(5, defaultNumPlayersFromConfig);

    const defaultRoles: Role[] = Object.entries(
      DEFAULT_GAME_SETTINGS.roleDistribution,
    ).flatMap(([role, count]) => Array(count).fill(role as Role));

    for (let i = defaultRoles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [defaultRoles[i], defaultRoles[j]] = [defaultRoles[j], defaultRoles[i]];
    }

    const initialSlots: ConfigCharacterSlot[] = Array.from({
      length: initialPlayerCount,
    }).map((_, index) => {
      const roleSelection =
        index < defaultRoles.length ? defaultRoles[index] : "Villager";
      return {
        clientId: crypto.randomUUID(),
        aiModel: globalModelSelection,
        roleSelection: roleSelection,
        isGenerated: false,
      };
    });

    setCharacterSlots(initialSlots);
    setInitialSlotsSet(true);
  }, [availableModels, globalModelSelection, initialSlotsSet]);

  // Revert validation message handling to return original message/key
  const configValidation = useMemo(() => {
    return validateGameConfiguration(characterSlots); // Return original result
  }, [characterSlots]);

  const canAttemptStart = configValidation.isValid && !isSubmitting;
  const totalSlots = characterSlots.length;

  const addPlayerSlot = useCallback(() => {
    setCharacterSlots((prev) => [
      ...prev,
      {
        clientId: crypto.randomUUID(),
        aiModel: globalModelSelection,
        roleSelection: "Villager",
        isGenerated: false,
      },
    ]);
    resetPostGenState();
  }, [globalModelSelection, resetPostGenState]);

  const removePlayerSlot = useCallback(
    (clientIdToRemove: string) => {
      setCharacterSlots((prev) =>
        prev.filter((c) => c.clientId !== clientIdToRemove),
      );
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
    (clientId: string, newRole: Role) => {
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

  // Toggle audio state
  const toggleAudioEnabled = useCallback(() => {
    setIsAudioEnabled((prev) => !prev);
  }, []);

  // Update language: navigate to new URL with lang param
  const updateLanguage = useCallback(
    async (newLangCode: string) => {
      if (newLangCode in supportedLanguagesInfo) {
        router.push(`/?lang=${newLangCode}`, { scroll: false });
      } else {
        console.warn(
          `[useGameConfig] Attempted to set invalid language code: ${newLangCode}`,
        );
      }
    },
    [router],
  );

  const handleGenerateAndStartGame = useCallback(async () => {
    // Guard against double submission
    if (!configValidation.isValid || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMsg(null);
    setInfoMsg("GeneratingCharactersInfo");
    setPostGenValidationMsg(null);
    setIsPostGenValid(null);

    const slotsToGenerate = characterSlots.map(resetSlotGeneration);
    setCharacterSlots([...slotsToGenerate]); // Update state immediately to show reset

    const generatedProfiles: AICharacterProfile[] = [];
    const updatedSlots = [...slotsToGenerate];
    let finalValidation: ValidationResult | null = null;

    try {
      // Generate sequentially instead of in parallel batches
      for (let i = 0; i < slotsToGenerate.length; i++) {
        const slot = slotsToGenerate[i];
        const originalIndex = i;

        setInfoMsg(
          t("GeneratingCharacterInfo", {
            defaultValue: `Generating character info ${i + 1} of ${slotsToGenerate.length}...`,
            count: i + 1,
            total: slotsToGenerate.length,
          }),
        ); // Update info message per character

        const finalRole = slot.roleSelection;
        let generatedResult: ConfigCharacterSlot;

        try {
          // Pass the *current* state of generatedProfiles
          const result = await generateCharacterAction(
            finalRole,
            slot.aiModel,
            selectedLanguage,
            [...generatedProfiles], // Pass a copy of the current list
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

          // Add the newly generated profile to the list for the *next* iteration
          if (generatedResult.profile) {
            generatedProfiles.push(generatedResult.profile);
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

        updatedSlots[originalIndex] = generatedResult;
        // Update UI after each character generation
        setCharacterSlots([...updatedSlots]);
      }

      // Final validation after all characters are processed
      finalValidation = validateGeneratedGameSetup(updatedSlots); // Assign to outer scope variable
      setPostGenValidationMsg(finalValidation.message ?? null);
      setIsPostGenValid(finalValidation.isValid);

      if (!finalValidation.isValid) {
        setErrorMsg("GenerationInvalidSetupError");
        setInfoMsg(null);
        // Need to set isSubmitting false here because we are returning early
        setIsSubmitting(false);
        return; // Exit if validation fails
      }

      setInfoMsg("ValidationPassedInfo");

      // Use the final 'updatedSlots' which contains all results
      // Map ConfigCharacterSlot[] to (PlayerInitializationData & { persona: string })[] for startGameAction
      const charactersToSubmit: (PlayerInitializationData & {
        persona: string;
      })[] = updatedSlots
        .filter(
          (
            slot,
          ): slot is Required<ConfigCharacterSlot> & {
            profile: AICharacterProfile;
            assignedRole: Role;
            persona: string;
          } =>
            slot.isGenerated &&
            !slot.generationError &&
            slot.profile !== undefined &&
            slot.assignedRole !== undefined &&
            slot.persona !== undefined, // Ensure persona exists
        )
        // Destructure only fields available on ConfigCharacterSlot here
        .map(({ profile, assignedRole, aiModel, imageUrl, persona }) => ({
          // Construct the object expected by startGameAction
          role: assignedRole,
          profile: profile,
          aiModel: aiModel,
          imageUrl: imageUrl,
          // voiceId is added within startGameAction
          persona: persona, // Include persona
        }));

      if (charactersToSubmit.length < 5) {
        throw new Error("InternalNotEnoughPlayersError");
      }

      const result = await startGameAction(
        charactersToSubmit,
        selectedLanguage,
      );

      // If startGameAction returned an error object instead of redirecting/throwing
      if (result && "error" in result) {
        throw new Error(result.error);
      }

      // If we somehow reach here without an error or redirect exception:
      console.warn(
        "startGameAction completed without expected error or redirect. Resetting state.",
      );
      setInfoMsg("GameStartedSuccessInfo"); // Indicate success
      setIsSubmitting(false); // Explicitly reset state as a safeguard
    } catch (error: unknown) {
      console.error("Error during game generation or start:", error);
      const errorMessage =
        error instanceof Error ? error.message : "StartGameFailedError";

      // IMPORTANT: Re-throw redirect errors so Next.js handles them
      if (errorMessage.includes("NEXT_REDIRECT")) {
        throw error;
      }

      // Handle other errors
      setErrorMsg(errorMessage);
      setIsSubmitting(false); // Reset state on error
      setInfoMsg(null);
    }
    // Removed finally block - state reset is handled within try/catch now
  }, [
    characterSlots,
    configValidation.isValid,
    selectedLanguage,
    resetSlotGeneration,
    isSubmitting,
    t,
  ]);

  // Return original state values/keys
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
    selectedLanguage,
    isAudioEnabled,
    isLoadingNextTurn,
    addPlayerSlot,
    removePlayerSlot,
    updateSlotModel,
    updateAllModels,
    updateSlotRole,
    updateLanguage,
    toggleAudioEnabled,
    handleGenerateAndStartGame,
  };
}
