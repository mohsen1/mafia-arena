import { generateCharacterAction, startGameAction } from "@/app/actions/index";
import { DEFAULT_GAME_SETTINGS, calculateNumPlayers } from "@/lib/config";
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
import { useCallback, useEffect, useMemo, useState } from "react";
// Remove useTranslation
import type { Locale } from "@/app/[lang]/dictionaries"; // Import Locale type

// Update hook signature - accept lang prop
export function useGameConfig(availableModels: string[], lang: Locale) {


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
  // Remove selectedLanguage state
  // const [selectedLanguage, setSelectedLanguage] =
  //   useState<LanguageCode>(initialLangCode);
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

  // Remove effect for initialLangCode
  // useEffect(() => {
  //   setSelectedLanguage(initialLangCode);
  // }, [initialLangCode]);

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

  const handleGenerateAndStartGame = useCallback(async () => {
    if (!configValidation.isValid || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMsg(null);
    setInfoMsg("GeneratingCharactersInfo"); // Use keys for messages
    setPostGenValidationMsg(null);
    setIsPostGenValid(null);

    const slotsToGenerate = characterSlots.map(resetSlotGeneration);
    setCharacterSlots([...slotsToGenerate]);

    const generatedProfiles: AICharacterProfile[] = [];
    const updatedSlots = [...slotsToGenerate];
    let finalValidation: ValidationResult | null = null;

    try {
      for (let i = 0; i < slotsToGenerate.length; i++) {
        const slot = slotsToGenerate[i];
        const originalIndex = i;

        setInfoMsg(`Generating character info ${i + 1} of ${slotsToGenerate.length}...`); // Simple message for now

        const finalRole = slot.roleSelection;
        let generatedResult: ConfigCharacterSlot;

        try {
          const result = await generateCharacterAction(
            finalRole,
            slot.aiModel,
            lang, // Pass lang prop directly
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
          persona: persona,
        }));

      if (charactersToSubmit.length < 5) {
        throw new Error("InternalNotEnoughPlayersError");
      }

      const result = await startGameAction(
        charactersToSubmit,
        lang, // Pass lang prop directly
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
    lang, // Depend on lang prop
    resetSlotGeneration,
    isSubmitting,
    // Remove t dependency
  ]);

  // Return state and functions, remove selectedLanguage and updateLanguage
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
    // selectedLanguage, // Removed
    isAudioEnabled,
    isLoadingNextTurn,
    addPlayerSlot,
    removePlayerSlot,
    updateSlotModel,
    updateAllModels,
    updateSlotRole,
    // updateLanguage, // Removed
    toggleAudioEnabled,
    handleGenerateAndStartGame,
  };
}
