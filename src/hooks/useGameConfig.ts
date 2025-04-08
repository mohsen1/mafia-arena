import { useState, useEffect, useMemo, useCallback } from 'react';
import { ConfigCharacterSlot, Role, PlayerInitializationData, AICharacterProfile } from '@/lib/types/game';
import { DEFAULT_GAME_SETTINGS, calculateNumPlayers } from '@/lib/config';
import { generateCharacterAction, startGameAction } from '@/app/actions';
import { validateGameConfiguration, validateGeneratedGameSetup } from '@/lib/validators/gameConfigValidator';

export function useGameConfig(availableModels: string[]) {
    const defaultModel = useMemo(() => {
        const preferred = DEFAULT_GAME_SETTINGS.aiModel;
        if (availableModels && availableModels.length > 0) {
            return availableModels.includes(preferred) ? preferred : availableModels[0];
        }
        return preferred;
    }, [availableModels]);

    const [globalModelSelection, setGlobalModelSelection] = useState<string>(defaultModel);
    const [characterSlots, setCharacterSlots] = useState<ConfigCharacterSlot[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [initialSlotsSet, setInitialSlotsSet] = useState(false);
    const [infoMsg, setInfoMsg] = useState<string | null>("Configure roles and models.");
    const [postGenValidationMsg, setPostGenValidationMsg] = useState<string | null>(null);
    const [isPostGenValid, setIsPostGenValid] = useState<boolean | null>(null);

    useEffect(() => {
        setGlobalModelSelection(defaultModel);
    }, [defaultModel]);

    useEffect(() => {
        if (initialSlotsSet || availableModels.length === 0 || !globalModelSelection) return;

        const defaultNumPlayersFromConfig = calculateNumPlayers(DEFAULT_GAME_SETTINGS.roleDistribution);
        const initialPlayerCount = Math.max(5, defaultNumPlayersFromConfig);

        const defaultRoles: Role[] = Object.entries(DEFAULT_GAME_SETTINGS.roleDistribution)
            .flatMap(([role, count]) => Array(count).fill(role as Role));

        for (let i = defaultRoles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [defaultRoles[i], defaultRoles[j]] = [defaultRoles[j], defaultRoles[i]];
        }

        const initialSlots: ConfigCharacterSlot[] = Array.from({ length: initialPlayerCount }).map((_, index) => {
            const roleSelection = index < defaultRoles.length ? defaultRoles[index] : 'Villager';
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

    const configValidation = useMemo(() => validateGameConfiguration(characterSlots), [characterSlots]);
    const canAttemptStart = configValidation.isValid && !isSubmitting;
    const totalSlots = characterSlots.length;

    const resetPostGenState = useCallback(() => {
        setErrorMsg(null);
        setPostGenValidationMsg(null);
        setIsPostGenValid(null);
    }, []);

    const resetSlotGeneration = (slot: ConfigCharacterSlot): ConfigCharacterSlot => ({
        ...slot,
        isGenerated: false,
        assignedRole: undefined,
        profile: undefined,
        imageUrl: undefined,
        generationError: undefined,
    });

    const addPlayerSlot = useCallback(() => {
        setCharacterSlots(prev => [
            ...prev,
            {
                clientId: crypto.randomUUID(),
                aiModel: globalModelSelection,
                roleSelection: 'Villager',
                isGenerated: false,
            }
        ]);
        resetPostGenState();
    }, [globalModelSelection, resetPostGenState]);

    const removePlayerSlot = useCallback((clientIdToRemove: string) => {
        setCharacterSlots(prev => prev.filter(c => c.clientId !== clientIdToRemove));
        resetPostGenState();
    }, [resetPostGenState]);

    const updateSlotModel = useCallback((clientId: string, newModel: string) => {
        setCharacterSlots(prev => prev.map(slot =>
            slot.clientId === clientId
                ? resetSlotGeneration({ ...slot, aiModel: newModel })
                : slot
        ));
        resetPostGenState();
    }, [resetPostGenState]);

    const updateAllModels = useCallback((newModel: string) => {
        setGlobalModelSelection(newModel);
        setCharacterSlots(prev => prev.map(slot =>
             resetSlotGeneration({ ...slot, aiModel: newModel })
        ));
        resetPostGenState();
    }, [resetPostGenState]);

    const updateSlotRole = useCallback((clientId: string, newRole: Role) => {
        setCharacterSlots(prev => prev.map(slot =>
            slot.clientId === clientId
                ? resetSlotGeneration({ ...slot, roleSelection: newRole })
                : slot
        ));
        resetPostGenState();
    }, [resetPostGenState]);

    const handleGenerateAndStartGame = useCallback(async () => {
        if (!configValidation.isValid) return;

        setIsSubmitting(true);
        setErrorMsg(null);
        setInfoMsg("Generating characters...");
        setPostGenValidationMsg(null);
        setIsPostGenValid(null);

        const slotsToGenerate = characterSlots.map(resetSlotGeneration);
        setCharacterSlots(slotsToGenerate);

        const generationPromises = slotsToGenerate.map(async (slot) => {
            const finalRole = slot.roleSelection;
            try {
                 const result = await generateCharacterAction(finalRole, slot.aiModel, []);
                 if ('error' in result) throw new Error(result.error);
                 return { ...slot, assignedRole: finalRole, profile: result.profile as AICharacterProfile, imageUrl: result.imageUrl, isGenerated: true, generationError: undefined };
            } catch (err: any) {
                return { ...slot, assignedRole: finalRole, isGenerated: false, generationError: err.message || 'Unknown generation error' };
            }
        });

        const results = await Promise.allSettled(generationPromises);

        let updatedSlots = [...slotsToGenerate];
        results.forEach((settledResult, index) => {
            if (settledResult.status === 'fulfilled') {
                 updatedSlots[index] = settledResult.value;
             } else {
                 console.error("Unexpected promise rejection:", settledResult.reason);
                 setErrorMsg(prev => prev ? `${prev}, Unexpected error` : 'An unexpected error occurred during generation.');
             }
         });
        setCharacterSlots(updatedSlots);

        const finalValidation = validateGeneratedGameSetup(updatedSlots);
        setPostGenValidationMsg(finalValidation.message ?? null);
        setIsPostGenValid(finalValidation.isValid);

        if (!finalValidation.isValid) {
            setErrorMsg("Generation complete, but setup is invalid. Check details below.");
            setIsSubmitting(false);
            setInfoMsg(null);
            return;
        }

        setInfoMsg("Validation passed. Starting game...");

        try {
            const charactersToSubmit: PlayerInitializationData[] = updatedSlots
                .filter(slot => slot.isGenerated && !slot.generationError && slot.profile && slot.assignedRole)
                .map(({ clientId, isGenerated, generationError, roleSelection, ...rest }) => ({
                     ...rest,
                     aiModel: rest.aiModel,
                     profile: rest.profile!,
                     role: rest.assignedRole!,
                }));

             if (charactersToSubmit.length < 5) {
                 throw new Error(`Internal Error: Not enough valid players (${charactersToSubmit.length}) after filtering.`);
             }

            const result = await startGameAction(charactersToSubmit);
            if (result && 'error' in result) throw new Error(result.error);

            setInfoMsg("Game started successfully!");
        } catch (error: any) {
            console.error("Starting game failed:", error);
            setErrorMsg(`Failed to start game: ${error.message}`);
            setIsSubmitting(false);
            setInfoMsg(null);
        }
    }, [characterSlots, configValidation.isValid]);

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
        addPlayerSlot,
        removePlayerSlot,
        updateSlotModel,
        updateAllModels,
        updateSlotRole,
        handleGenerateAndStartGame,
    };
}
