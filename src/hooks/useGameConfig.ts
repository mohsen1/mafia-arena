import { generateCharacterAction, startGameAction } from '@/app/actions/index';
import { DEFAULT_GAME_SETTINGS, calculateNumPlayers } from '@/lib/config';
import { mapLanguageNameToCode } from '@/lib/translation/languages';
import type {
    AICharacterProfile,
    ConfigCharacterSlot,
    PlayerInitializationData,
    Role
} from '@/lib/types/game';
import { validateGameConfiguration, validateGeneratedGameSetup } from '@/lib/validators/gameConfigValidator';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

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
        const langToUse = matchingLang || 'English';
        console.log(`[useGameConfig] Initial language name determined: ${langToUse} (from URL code: ${langCodeFromUrl})`);
        return langToUse;
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
    const [isAudioEnabled, setIsAudioEnabled] = useState<boolean>(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [initialSlotsSet, setInitialSlotsSet] = useState(false);
    // Initialize with default English message or key
    const [infoMsg, setInfoMsg] = useState<string | null>("InitialConfigPrompt"); // Use a key
    const [postGenValidationMsg, setPostGenValidationMsg] = useState<string | null>(null);
    const [isPostGenValid, setIsPostGenValid] = useState<boolean | null>(null);
    
    // Removed translation state and effect

    const resetPostGenState = useCallback(() => {
        setErrorMsg(null);
        setPostGenValidationMsg(null);
        setIsPostGenValid(null);
    }, []);

    // Wrap resetSlotGeneration in useCallback
    const resetSlotGeneration = useCallback((slot: ConfigCharacterSlot): ConfigCharacterSlot => ({
        ...slot,
        isGenerated: false,
        assignedRole: undefined,
        profile: undefined,
        imageUrl: undefined,
        generationError: undefined,
    }), []); // No dependencies needed

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
    }, [resetPostGenState, resetSlotGeneration]);

    const updateAllModels = useCallback((newModel: string) => {
        setGlobalModelSelection(newModel);
        setCharacterSlots(prev => prev.map(slot =>
             resetSlotGeneration({ ...slot, aiModel: newModel })
        ));
        resetPostGenState();
    }, [resetPostGenState, resetSlotGeneration]);

    const updateSlotRole = useCallback((clientId: string, newRole: Role) => {
        setCharacterSlots(prev => prev.map(slot =>
            slot.clientId === clientId
                ? resetSlotGeneration({ ...slot, roleSelection: newRole })
                : slot
        ));
        resetPostGenState();
    }, [resetPostGenState, resetSlotGeneration]);

    // Toggle audio state
    const toggleAudioEnabled = useCallback(() => {
        setIsAudioEnabled(prev => !prev);
    }, []);

    // Update language: navigate to new URL with lang param
    const updateLanguage = useCallback((newLanguage: SupportedLanguage) => {
        if (supportedLanguages.includes(newLanguage)) {
            setSelectedLanguage(newLanguage); // Update local state for immediate UI feedback
            const newLangCode = mapLanguageNameToCode(newLanguage);
            if (newLangCode) {
                console.log(`[useGameConfig] updateLanguage called with ${newLanguage}. Pushing lang code: ${newLangCode}`);
                // Use router to navigate, triggering server refetch
                router.push(`/?lang=${newLangCode}`, { scroll: false }); 
            }
        }
    }, [router]); // Add router dependency

    const handleGenerateAndStartGame = useCallback(async () => {
        if (!configValidation.isValid) return;

        setIsSubmitting(true);
        setErrorMsg(null);
        setInfoMsg("GeneratingCharactersInfo");
        setPostGenValidationMsg(null);
        setIsPostGenValid(null);

        const slotsToGenerate = characterSlots.map(resetSlotGeneration);
        setCharacterSlots([...slotsToGenerate]); // Update state immediately to show reset

        const generatedProfiles: AICharacterProfile[] = [];
        const updatedSlots = [...slotsToGenerate];
        const batchSize = 10;

        for (let i = 0; i < slotsToGenerate.length; i += batchSize) {
            const batch = slotsToGenerate.slice(i, i + batchSize);
            const batchIndices = Array.from({ length: batch.length }, (_, k) => i + k);

            // Use key or English string for batch info
            setInfoMsg(`GeneratingBatchInfo_${i / batchSize + 1}`); // e.g., GeneratingBatchInfo_1

            const generationPromises = batch.map(async (slot) => {
                const finalRole = slot.roleSelection;
                try {
                    // Pass current generatedProfiles to the action
                    // generateCharacterAction returns GenerateCharacterResult (flat structure + persona)
                    const result = await generateCharacterAction(finalRole, slot.aiModel, selectedLanguage, generatedProfiles);
                    if ('error' in result) throw new Error(result.error);
                    // result now contains profile fields directly + persona
                    // Store the structured profile and the persona in the slot
                    return { 
                        ...slot, // Keep clientId, aiModel, roleSelection
                        assignedRole: finalRole, 
                        profile: { // Reconstruct profile object from flat result fields
                            characterName: result.characterName,
                            gender: result.gender,
                            ageCategory: result.ageCategory,
                            shortBio: result.shortBio
                        },
                        persona: result.persona, // Store the generated persona
                        imageUrl: result.imageUrl, 
                        isGenerated: true, 
                        generationError: undefined 
                    };
                } catch (err: unknown) { // Type err as unknown
                    const errorMessage = (err instanceof Error) ? err.message : 'GenerationError';
                    // Store error, keep assignedRole attempt
                    return { ...slot, assignedRole: finalRole, isGenerated: false, generationError: errorMessage, profile: undefined, persona: undefined };
                }
            });

            const results = await Promise.allSettled(generationPromises);

            results.forEach((settledResult, batchIndex) => {
                const originalIndex = batchIndices[batchIndex];
                if (settledResult.status === 'fulfilled') {
                    const fulfilledValue = settledResult.value;
                    updatedSlots[originalIndex] = fulfilledValue;
                    // Add successfully generated profile to the list for subsequent calls
                    // We need the full profile structure here (AICharacterProfile)
                    if (fulfilledValue.isGenerated && fulfilledValue.profile) {
                        // Pass the structured profile, not the whole slot
                        generatedProfiles.push(fulfilledValue.profile); 
                    }
                } else {
                    console.error("Unexpected promise rejection:", settledResult.reason);
                    const errorText = 'UnexpectedGenerationError';
                     // Type reason as unknown and extract message safely
                    const reasonMessage = (settledResult.reason instanceof Error) ? settledResult.reason.message : errorText;
                    setErrorMsg(prev => prev ? `${prev}, ${errorText}` : errorText);
                    // Ensure the slot reflects the failure state even on rejection
                    updatedSlots[originalIndex] = {
                        ...slotsToGenerate[originalIndex], // Start from the reset state
                        assignedRole: slotsToGenerate[originalIndex].roleSelection, // Keep assigned role attempt
                        isGenerated: false,
                        generationError: reasonMessage, // Use extracted message
                    };
                }
            });

            // Update the main characterSlots state after each batch for UI feedback
            setCharacterSlots([...updatedSlots]);
        }

        // Final validation after all batches
        const finalValidation = validateGeneratedGameSetup(updatedSlots);
        setPostGenValidationMsg(finalValidation.message ?? null);
        setIsPostGenValid(finalValidation.isValid);

        if (!finalValidation.isValid) {
            setErrorMsg('GenerationInvalidSetupError');
            setIsSubmitting(false);
            setInfoMsg(null); // Clear processing message
            return;
        }

        setInfoMsg('ValidationPassedInfo');

        try {
            // Use the final 'updatedSlots' which contains all results
            // Map ConfigCharacterSlot[] to (PlayerInitializationData & { persona: string })[] for startGameAction
            const charactersToSubmit: (PlayerInitializationData & { persona: string })[] = updatedSlots
                 .filter((slot): slot is Required<ConfigCharacterSlot> & { profile: AICharacterProfile; assignedRole: Role; persona: string } => 
                    slot.isGenerated && 
                    !slot.generationError && 
                    slot.profile !== undefined && 
                    slot.assignedRole !== undefined &&
                    slot.persona !== undefined // Ensure persona exists
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
                 throw new Error('InternalNotEnoughPlayersError');
             }

            const result = await startGameAction(charactersToSubmit, selectedLanguage);
            if (result && 'error' in result) throw new Error(result.error);

            setInfoMsg('GameStartedSuccessInfo');
            // Redirect is handled by action
        } catch (error: unknown) { // Type error as unknown
            console.error("Starting game failed:", error);
             // Extract message safely
             const errorMessage = (error instanceof Error) ? error.message : 'StartGameFailedError';
             setErrorMsg(errorMessage);
            setIsSubmitting(false);
            setInfoMsg(null);
        } finally {
             // Ensure submitting state is turned off if generation failed early
             if (!finalValidation.isValid) {
                 setIsSubmitting(false);
             }
             // No need to set isSubmitting to false here if successful, as redirection occurs
        }
    }, [characterSlots, configValidation.isValid, selectedLanguage, resetSlotGeneration]); 

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
