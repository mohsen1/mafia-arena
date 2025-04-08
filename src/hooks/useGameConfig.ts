import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ConfigCharacterSlot, Role, PlayerInitializationData, AICharacterProfile } from '@/lib/types/game';
import { DEFAULT_GAME_SETTINGS, calculateNumPlayers } from '@/lib/config';
import { generateCharacterAction, startGameAction } from '@/app/actions';
import { validateGameConfiguration, validateGeneratedGameSetup } from '@/lib/validators/gameConfigValidator';
import { mapLanguageNameToCode, LanguageCode } from '@/lib/translation/languages';
import { getOrGenerateTranslationsAction } from '@/app/actions';

// Define supported languages
export const supportedLanguages = ['English', 'Persian', 'German'] as const;
export type SupportedLanguage = typeof supportedLanguages[number];

// Update hook signature - REMOVE t function parameter
export function useGameConfig(availableModels: string[]) {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Determine initial language from URL or default
    const initialLangName = useMemo(() => {
        const langCodeFromUrl = searchParams.get('lang');
        const matchingLang = supportedLanguages.find(name => mapLanguageNameToCode(name) === langCodeFromUrl);
        return matchingLang || 'English';
    }, [searchParams]);

    const defaultModel = useMemo(() => {
        const preferred = DEFAULT_GAME_SETTINGS.aiModel;
        if (availableModels && availableModels.length > 0) {
            return availableModels.includes(preferred) ? preferred : availableModels[0];
        }
        return preferred;
    }, [availableModels]);

    const [globalModelSelection, setGlobalModelSelection] = useState<string>(defaultModel);
    const [characterSlots, setCharacterSlots] = useState<ConfigCharacterSlot[]>([]);
    const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguage>(initialLangName);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [initialSlotsSet, setInitialSlotsSet] = useState(false);
    // Initialize with default English message or key
    const [infoMsg, setInfoMsg] = useState<string | null>("InitialConfigPrompt"); // Use a key
    const [postGenValidationMsg, setPostGenValidationMsg] = useState<string | null>(null);
    const [isPostGenValid, setIsPostGenValid] = useState<boolean | null>(null);
    
    // Removed translation state and effect

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

    // Revert validation message handling to return original message/key
    const configValidation = useMemo(() => {
        return validateGameConfiguration(characterSlots); // Return original result
    }, [characterSlots]);

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

    // Update language: navigate to new URL with lang param
    const updateLanguage = useCallback((newLanguage: SupportedLanguage) => {
        if (supportedLanguages.includes(newLanguage)) {
            setSelectedLanguage(newLanguage); // Update local state for immediate UI feedback
            const newLangCode = mapLanguageNameToCode(newLanguage);
            if (newLangCode) {
                // Use router to navigate, triggering server refetch
                router.push(`/?lang=${newLangCode}`, { scroll: false }); 
            }
        }
    }, [router]); // Add router dependency

    const handleGenerateAndStartGame = useCallback(async () => {
        if (!configValidation.isValid) return;

        setIsSubmitting(true);
        setErrorMsg(null);
        // Use keys or English strings for info messages
        setInfoMsg("GeneratingCharactersInfo");
        setPostGenValidationMsg(null);
        setIsPostGenValid(null);

        const slotsToGenerate = characterSlots.map(resetSlotGeneration);
        setCharacterSlots(slotsToGenerate);

        const generationPromises = slotsToGenerate.map(async (slot) => {
            const finalRole = slot.roleSelection;
            try {
                 const result = await generateCharacterAction(finalRole, slot.aiModel, selectedLanguage, []);
                 if ('error' in result) throw new Error(result.error);
                 return { ...slot, assignedRole: finalRole, profile: result.profile as AICharacterProfile, imageUrl: result.imageUrl, isGenerated: true, generationError: undefined };
            } catch (err: any) {
                // Return original error message or a specific key
                return { ...slot, assignedRole: finalRole, isGenerated: false, generationError: err.message || 'GenerationError' };
            }
        });

        const results = await Promise.allSettled(generationPromises);

        let updatedSlots = [...slotsToGenerate];
        results.forEach((settledResult, index) => {
            if (settledResult.status === 'fulfilled') {
                 updatedSlots[index] = settledResult.value;
             } else {
                 console.error("Unexpected promise rejection:", settledResult.reason);
                 // Use key or English string
                 const errorText = 'UnexpectedGenerationError';
                 setErrorMsg(prev => prev ? `${prev}, ${errorText}` : errorText);
             }
         });
        setCharacterSlots(updatedSlots);

        const finalValidation = validateGeneratedGameSetup(updatedSlots);
         // Return original validation message
        setPostGenValidationMsg(finalValidation.message ?? null);
        setIsPostGenValid(finalValidation.isValid);


        if (!finalValidation.isValid) {
             // Use key or English string
             setErrorMsg('GenerationInvalidSetupError');
            setIsSubmitting(false);
            setInfoMsg(null);
            return;
        }

         // Use key or English string
         setInfoMsg('ValidationPassedInfo');

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
                 // Use key or English string
                 throw new Error('InternalNotEnoughPlayersError');
             }

            const result = await startGameAction(charactersToSubmit, selectedLanguage);
            if (result && 'error' in result) throw new Error(result.error); // Let action handle redirect

            // Use key or English string
            setInfoMsg('GameStartedSuccessInfo');
            // Redirect is handled by action
        } catch (error: any) {
            console.error("Starting game failed:", error);
             // Use key or English string
             setErrorMsg(error.message || 'StartGameFailedError');
            setIsSubmitting(false);
            setInfoMsg(null);
        }
    // Remove t dependency
    }, [characterSlots, configValidation.isValid, selectedLanguage]);

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
        addPlayerSlot,
        removePlayerSlot,
        updateSlotModel,
        updateAllModels,
        updateSlotRole,
        updateLanguage,
        handleGenerateAndStartGame,
    };
}
