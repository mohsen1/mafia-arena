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
import type { Locale } from "@/app/[lang]/dictionaries";
import { useTranslation } from "react-i18next";

// Type Guard for checking if an object is an error
const isError = (e: unknown): e is { error: string } => {
  return typeof e === "object" && e !== null && "error" in e;
};

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

  const toggleAudioEnabled = useCallback(() => {
    setIsAudioEnabled((prev) => !prev);
  }, []);

  const handleGenerateAndStartGame = useCallback(async () => {
    if (!configValidation.isValid || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMsg(null);
    setInfoMsg(t("GeneratingCharactersInfo"));
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

        setInfoMsg(
          t("GeneratingCharacterInfo", {
            current: i + 1,
            total: slotsToGenerate.length,
          }),
        );

        const finalRole = slot.roleSelection;
        let generatedResult: ConfigCharacterSlot;

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

      finalValidation = validateGeneratedGameSetup(updatedSlots);
      setPostGenValidationMsg(finalValidation.message ?? null);
      setIsPostGenValid(finalValidation.isValid);

      if (!finalValidation.isValid) {
        setErrorMsg(t("GenerationInvalidSetupError"));
        setInfoMsg(null);
        setIsSubmitting(false);
        return;
      }

      setInfoMsg(t("ValidationPassedInfo"));

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
            slot.persona !== undefined,
        )
        .map(({ profile, assignedRole, aiModel, imageUrl, persona }) => ({
          role: assignedRole,
          profile: profile,
          aiModel: aiModel,
          imageUrl: imageUrl,
          persona: persona,
        }));

      if (charactersToSubmit.length < 5) {
        throw new Error(t("InternalNotEnoughPlayersError"));
      }

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
  };
}
