import { startGameAction } from "@/app/actions/setup.actions";
import type { StartGameSetupData } from "@/lib/interfaces/actions.types";
import { DEFAULT_GAME_SETTINGS, calculateNumPlayers } from "@/lib/config";
import { RoleName } from "@/lib/engine/interfaces/IRole";
import type { Persona } from "@/lib/engine/interfaces/Persona";
import { Themes } from "@/lib/engine/interfaces/Theme";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import type { LanguageCode as Locale } from "@/lib/i18n/settings";
import { useTranslation } from "react-i18next";
import type { AgentConfig } from "@/lib/interfaces/agent.types";
// import { useRouter } from "next/navigation";
import {
    availableModelsByProvider,
    availableProviders,
    type ModelDefinition,
    type ProviderDefinition
} from "@/lib/models";
import type { HumanActionPayload } from "@/lib/interfaces/actions.types";
import React from "react";

// Helper function to get the default model for a provider
const getDefaultModelForProvider = (providerValue: string): string => {
    if (providerValue === 'groq') {
        return 'gemma2-9b-it'; // Specific default for Groq
    }
    const models = availableModelsByProvider[providerValue];
    if (models && models.length > 0) {
        const defaultModel = models.find(m => m.title.toLowerCase().includes("default"));
        return defaultModel?.value ?? models[0].value;
    }
    
    return ""; // Fallback
};

export interface UICharacterProfile {
    characterName: string;
    gender: string;
    ageCategory: string;
    shortBio: string;
}

export interface ConfigCharacterSlot {
    clientId: string;
    provider: string; // Added provider field
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
    provider: string; // Added provider field
    aiModel: string;
    imageUrl?: string | null;
    persona?: Persona;
    voiceId?: string;
    isHuman: boolean;
}

// Helper function to map provider value to agent type string expected by factory
const getAgentTypeFromProvider = (providerValue?: string): string => {
    if (!providerValue) return 'Dummy'; // Default or handle error
    switch (providerValue) {
        case 'groq': return 'Groq';
        case 'ollama_local': return 'Ollama';
        case 'fireworks': return 'Fireworks';
        case 'openai': return 'OpenAI';
        // Add mappings for Claude/Gemini if they have providerValues
        // case 'anthropic': return 'Claude';
        // case 'google': return 'Gemini';
        default:
            console.warn(`Unknown provider value "${providerValue}" in useGameConfig. Defaulting agentType to OpenAI.`);
            return 'OpenAI'; // Or perhaps 'Dummy' or throw error
    }
};

// Remove availableModels from arguments, we import them now
export function useGameConfig(
    lang: Locale,
    useSeparateMafiaConfig: boolean, // Flag to indicate separate config
    mafiaProviderSelection?: string, // Optional Mafia provider
    mafiaModelSelection?: string     // Optional Mafia model
) {
    const { t } = useTranslation('translation');
    // const router = useRouter();

    // State for selected game theme
    const firstThemeKey = Object.keys(Themes)[0] || 'UK_VILLAGE_1900S'; // Fallback
    const [selectedGameThemeKey, setSelectedGameThemeKey] = useState<string>(firstThemeKey);

    // Define the initial provider
    const initialProvider = 'groq';
    
    // State for global provider and model, initialized together
    const [globalProviderSelection, setGlobalProviderSelection] =
        useState<string>(initialProvider);
    const [globalModelSelection, setGlobalModelSelection] = useState<string>(() => getDefaultModelForProvider(initialProvider)); // Initialize with default model

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

    // Effect to initialize or update character slots based on structural changes only
    /* eslint-disable react-hooks/exhaustive-deps */
    useEffect(() => {
        // Wait until provider and model have values (can happen after initial mount)
        // globalProviderSelection and globalModelSelection are intentionally not dependencies
        if (!globalProviderSelection || !globalModelSelection) {
            return;
        }

        // Skip if slots are already initialized and we're just changing provider/model
        // (that's handled by updateAllProvidersAndModels)
        if (initialSlotsSet) {
            // This effect should only re-run for structural changes (human joining status)
            // Check if human status has actually changed
            // characterSlots is intentionally not a dependency here
            const currentSlotsArePopulated = characterSlots.length > 0;
            if (currentSlotsArePopulated) {
                // characterSlots.some is intentionally not a dependency here
                const hasHumanSlot = characterSlots.some(slot => slot.isHuman);
                if (hasHumanSlot === isHumanJoining) {
                    return;
                }
            }
        }

        // Calculate initial player count and roles
        const initialPlayerCount = 9; // Default player count
        
        // Role distribution for 9 players (optimize by using a constant)
        const DEFAULT_ROLE_DISTRIBUTION = {
            [RoleName.Mafia]: 2,
            [RoleName.Seer]: 1,
            [RoleName.Doctor]: 1,
            [RoleName.Villager]: 5,
        };
        
        const tempRoleDist = { ...DEFAULT_ROLE_DISTRIBUTION };

        // Adjust for human player
        if (isHumanJoining) {
            if (tempRoleDist[humanRoleSelection] > 0) {
                tempRoleDist[humanRoleSelection]--;
            } else {
                // If no slots available for the selected role, reduce Villagers
                if (tempRoleDist[RoleName.Villager] > 0) {
                    tempRoleDist[RoleName.Villager]--;
                }
            }
        }

        // Build roles array for AI slots using the adjusted distribution (optimize with flatMap)
        const aiRoles: RoleName[] = Object.entries(tempRoleDist).flatMap(
            ([role, count]) => Array(count).fill(role as RoleName)
        );

        // Determine number of AI players needed
        const numAiPlayers = initialPlayerCount - (isHumanJoining ? 1 : 0);

        // Adjust aiRoles array length efficiently
        if (aiRoles.length < numAiPlayers) {
            // Fill remaining AI slots with Villagers
            aiRoles.push(...Array(numAiPlayers - aiRoles.length).fill(RoleName.Villager));
        } else if (aiRoles.length > numAiPlayers) {
            // Remove excess roles, preferring to remove Villagers first
            while (aiRoles.length > numAiPlayers) {
                const villagerIndex = aiRoles.lastIndexOf(RoleName.Villager);
                if (villagerIndex !== -1) {
                    aiRoles.splice(villagerIndex, 1);
                } else {
                    aiRoles.pop(); // Remove last role if no more villagers
                }
            }
        }

        // Shuffle AI roles for randomness (optimize with Fisher-Yates)
        for (let i = aiRoles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [aiRoles[i], aiRoles[j]] = [aiRoles[j], aiRoles[i]];
        }

        // Create initial slots based on final structure (optimize by pre-allocating array)
        const initialSlots: ConfigCharacterSlot[] = [];
        let playerIndex = 1; // Start numbering players from 1
        
        if (isHumanJoining) {
            initialSlots.push({
                clientId: crypto.randomUUID(),
                provider: "", // No provider/model for human
                aiModel: "",
                roleSelection: humanRoleSelection,
                isGenerated: false,
                isHuman: true,
                // Assign default human name initially
                profile: { characterName: t('DefaultHumanPlayerName', `Player ${playerIndex}`) }
            });
            playerIndex++;
        }
        
        // Pre-allocate and fill AI slots more efficiently
        for (let i = 0; i < numAiPlayers; i++) {
            initialSlots.push({
                clientId: crypto.randomUUID(),
                // globalProviderSelection and globalModelSelection are intentionally not dependencies
                provider: globalProviderSelection, // Use current global provider
                aiModel: globalModelSelection,    // Use current global model
                roleSelection: aiRoles[i] || RoleName.Villager,
                isGenerated: false,
                isHuman: false,
                profile: { characterName: t('DefaultAIPlayerName', `Player ${playerIndex}`) }
            });
            playerIndex++;
        }

        // Batch state updates
        setCharacterSlots(initialSlots);
        setInitialSlotsSet(true); // Set this only after full successful initialization
    }, [
        // Key dependencies that SHOULD trigger re-creation of slots:
        isHumanJoining, 
        humanRoleSelection, 
        initialSlotsSet, // Runs when false, then becomes true
        t, // If translations affect slot defaults
        // NOTE: The following dependencies are intentionally EXCLUDED for performance:
        // - globalProviderSelection and globalModelSelection: Changes to these should not
        //   cause this entire effect to re-run and regenerate clientIds. They are handled
        //   separately by updateAllProvidersAndModels.
        // - characterSlots.length and characterSlots.some: These are read inside the effect
        //   for conditional logic but should not trigger re-runs.
    ]);
    /* eslint-enable react-hooks/exhaustive-deps */

    const configValidation = useMemo(() => {
        // Cache the length to avoid repeated access
        const slotsCount = characterSlots.length;
        
        // Early return for minimum player check
        if (slotsCount < 5) {
            return { isValid: false, message: t("MinPlayerValidationError", { min: 5 }) };
        }

        // Pre-filter AI slots for efficiency
        const aiSlots = characterSlots.filter(slot => !slot.isHuman);
        
        // Check if provider/model is set for all AI slots
        const aiSlotsValid = aiSlots.every(slot => slot.provider && slot.aiModel);
        if (!aiSlotsValid) {
            return { isValid: false, message: t("ProviderModelMissingValidationError", "Provider/Model must be set for all AI players.") };
        }

        // Check for duplicate names (case-insensitive) - optimize by using a single pass
        const nameSet = new Set<string>();
        let hasEmptyName = false;
        
        for (const slot of characterSlots) {
            const name = slot.profile?.characterName?.trim();
            if (!name) {
                hasEmptyName = true;
                break; // Early exit if empty name found
            }
            
            const lowerName = name.toLowerCase();
            if (nameSet.has(lowerName)) {
                return { isValid: false, message: t("DuplicatePlayerNameValidationError", "Player names must be unique.") };
            }
            nameSet.add(lowerName);
        }
        
        // Check for empty names
        if (hasEmptyName) {
            return { isValid: false, message: t("EmptyPlayerNameValidationError", "Player names cannot be empty.") };
        }

        return { isValid: true, message: null };
    }, [characterSlots, t]);

    // Memoize expensive derived values with more granular dependencies
    const memoizedValues = useMemo(() => {
        const canAttemptStart = configValidation.isValid && !isSubmitting;
        const totalSlots = characterSlots.length;
        
        return { canAttemptStart, totalSlots };
    }, [configValidation.isValid, isSubmitting, characterSlots.length]);

    const { canAttemptStart, totalSlots } = memoizedValues;

    // Add player slot using global selections
    const addPlayerSlot = useCallback(() => {
        setCharacterSlots((prev) => [
            ...prev,
            {
                clientId: crypto.randomUUID(),
                provider: globalProviderSelection, // Use global provider
                aiModel: globalModelSelection, // Use global model
                roleSelection: RoleName.Villager,
                isGenerated: false,
                isHuman: false,
            },
        ]);
    }, [globalProviderSelection, globalModelSelection]);

    const removePlayerSlot = useCallback(
        (clientIdToRemove: string) => {
            setCharacterSlots((prev) => {
                const slotToRemove = prev.find((c) => c.clientId === clientIdToRemove);
                const updatedSlots = prev.filter((c) => c.clientId !== clientIdToRemove);
                if (slotToRemove?.isHuman) {
                    setIsHumanJoining(false);
                    // Maybe re-trigger initial slot setup if human removed?
                    // setInitialSlotsSet(false);
                }
                return updatedSlots;
            });
        },
        []
    );

    // Update a single slot's provider and model
    const updateSlotProviderAndModel = useCallback(
        (clientId: string, provider: string, newModel: string) => {
            setCharacterSlots((prev) =>
                prev.map((slot) =>
                    slot.clientId === clientId
                        ? { ...slot, provider: provider, aiModel: newModel, isGenerated: false }
                        : slot,
                ),
            );
        },
        []
    );

    // NEW: Update a single slot's name
    const updateSlotName = useCallback(
        (clientId: string, newName: string) => {
            setCharacterSlots((prev) =>
                prev.map((slot) =>
                    slot.clientId === clientId
                        ? { ...slot, profile: { ...slot.profile, characterName: newName } }
                        : slot
                )
            );
        },
        []
    );

    // Debounced version for performance
    const debounceTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
    
    const updateSlotNameDebounced = useCallback(
        (clientId: string, newName: string) => {
            // Clear existing timer for this slot
            const existingTimer = debounceTimersRef.current.get(clientId);
            if (existingTimer) {
                clearTimeout(existingTimer);
            }
            
            // Set new timer
            const timer = setTimeout(() => {
                updateSlotName(clientId, newName);
                debounceTimersRef.current.delete(clientId);
            }, 150); // 150ms debounce
            
            debounceTimersRef.current.set(clientId, timer);
        },
        [updateSlotName]
    );

     // NEW: Update a single slot's image URL
     const updateSlotImageUrl = useCallback(
        (clientId: string, newImageUrl: string | null) => {
            setCharacterSlots((prev) =>
                prev.map((slot) =>
                    slot.clientId === clientId
                        ? { ...slot, imageUrl: newImageUrl }
                        : slot
                )
            );
        },
        []
    );

    // Update global state AND directly update the provider/model in existing slots
    const updateAllProvidersAndModels = useCallback(
        (newProvider: string, newModel: string) => {
            // Early return if no actual changes
            if (globalProviderSelection === newProvider && globalModelSelection === newModel) {
                return;
            }
            
            // Use React 18's automatic batching by wrapping in startTransition
            React.startTransition(() => {
                // Update global state first
                setGlobalProviderSelection(newProvider);
                setGlobalModelSelection(newModel);
                
                // Update all character slots in a single batch operation
                setCharacterSlots(prevSlots => {
                    // Check if any slots actually need updating
                    const needsUpdate = prevSlots.some(slot => 
                        !slot.isHuman && (slot.provider !== newProvider || slot.aiModel !== newModel)
                    );
                    
                    if (!needsUpdate) {
                        return prevSlots;
                    }
                    
                    const updatedSlots = prevSlots.map(slot => 
                        slot.isHuman ? slot : {
                            ...slot,
                            provider: newProvider,
                            aiModel: newModel,
                            isGenerated: false // Reset generation status when provider/model changes
                        }
                    );
                    
                    return updatedSlots;
                });
            });
        },
        [globalProviderSelection, globalModelSelection]
    );

    const updateSlotRole = useCallback(
        (clientId: string, roleName: RoleName) => {
            setCharacterSlots((prev) =>
                prev.map((slot) =>
                    slot.clientId === clientId
                        ? { ...slot, roleSelection: roleName, isGenerated: false }
                        : slot,
                ),
            );
        },
        []
    );

    const toggleAudioEnabled = useCallback(() => {
        setIsAudioEnabled((prev) => !prev);
    }, []);

    // When toggling human joining, reset the initial slots
    const toggleHumanJoining = useCallback(() => {
        setIsHumanJoining((prev) => {
            const becomingHuman = !prev;
            if (!becomingHuman) {
                // REMOVED: setHumanPlayerName("");
            }
            setInitialSlotsSet(false); // Force re-initialization
            setCharacterSlots([]); // Clear existing slots
            return becomingHuman;
        });
    }, []);


    // Expose role selection update
    const updateHumanRoleSelection = useCallback((role: RoleName) => {
        setHumanRoleSelection(role);
        setInitialSlotsSet(false); // Force re-initialization
        setCharacterSlots([]); // Clear existing slots
    }, []);

    const handleGenerateAndStartGame = useCallback(async () => {
        const humanSlot = characterSlots.find(slot => slot.isHuman);
        const humanPlayerIndex = humanSlot ? characterSlots.indexOf(humanSlot) : -1;

        if (!configValidation.isValid || isSubmitting) return;

        setIsSubmitting(true);
        setErrorMsg(null);
        setInfoMsg(t("StartingGameInfo", {}));

        // Find configs for town and mafia agents - might need more sophisticated logic
        // For now, just use the global settings
        const firstAiSlot = characterSlots.find(slot => !slot.isHuman);
        const agentProvider = firstAiSlot?.provider ?? globalProviderSelection;
        const agentModel = firstAiSlot?.aiModel ?? globalModelSelection;

        // TODO: Allow different configs for Town/Mafia later
        const agentConfig: AgentConfig = {
            // Use mapping function
            agentType: getAgentTypeFromProvider(agentProvider),
            modelName: agentModel,
            providerValue: agentProvider,
        };

        // Create specific Mafia config if the flag is set and values are provided
        const mafiaAgentConfig = useSeparateMafiaConfig && mafiaProviderSelection && mafiaModelSelection
            ? {
                // Use mapping function
                agentType: getAgentTypeFromProvider(mafiaProviderSelection),
                modelName: mafiaModelSelection,
                providerValue: mafiaProviderSelection,
            }
            : agentConfig; // Otherwise, use the same config as town

        // --- Prepare the setup data for the server action ---
        const setupData: StartGameSetupData = {
             // Map character slots to the structure expected by startGameAction
            players: characterSlots.map((slot, index) => ({
                name: slot.profile?.characterName || `Player ${index + 1}`, // Use slot name or fallback
                rolePreference: slot.roleSelection,
                isHuman: slot.isHuman ?? false,
                imageUrl: slot.imageUrl ?? null, // Pass image URL
                agentConfig: slot.isHuman
                    ? { agentType: 'Human' } // Human config
                    : slot.roleSelection === RoleName.Mafia // Determine AI config based on role
                        ? mafiaAgentConfig
                        : agentConfig, // Use town/general config
            })),
            themeKey: selectedGameThemeKey,
            language: lang,
            // Deprecated fields below - players array above replaces them
            // playerCount: characterSlots.length,
            // humanPlayerName: humanPlayerName || undefined, // REMOVED
            // humanPlayerIndex: humanPlayerIndex, // REMOVED
            // humanRolePreference: humanRoleSelection, // Moved into players array
            // townAgentConfig: agentConfig, // Moved into players array
            // mafiaAgentConfig: mafiaAgentConfig, // Moved into players array
        };

        try {
            const result = await startGameAction(setupData);

            if (result && "error" in result) {
                throw new Error(result.error);
            }

            if (result?.gameId && result?.initialState) {
                setInfoMsg(t("GameStartedSuccessInfo", {}));
                // router.push(`/${lang}/game/${result.gameId}`);
            } else {
                throw new Error(t("StartGameActionUnexpectedResultError", {}));
            }

        } catch (error: unknown) {
            const errorMessage =
                error instanceof Error ? error.message : "StartGameFailedError";
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
        globalProviderSelection, // Added provider
        globalModelSelection,
        lang,
        useSeparateMafiaConfig, // Include flag in dependencies
        mafiaProviderSelection, // Include Mafia provider
        mafiaModelSelection,    // Include Mafia model
        t,
        // router,
        selectedGameThemeKey,
    ]);

    useEffect(() => {
        // Sync human player name if slots re-initialize with human present
        if (!initialSlotsSet && characterSlots.length > 0) {
            const humanSlot = characterSlots.find(slot => slot.isHuman);
            if (humanSlot) {
                setIsHumanJoining(true);
                // REMOVED: setHumanPlayerName(...)
            } else {
                setIsHumanJoining(false); // Ensure consistency
            }
        }
    }, [initialSlotsSet, characterSlots]);

    // Cleanup debounce timers on unmount
    useEffect(() => {
        return () => {
            for (const timer of debounceTimersRef.current.values()) {
                clearTimeout(timer);
            }
            debounceTimersRef.current.clear();
        };
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
        globalProviderSelection, // Added
        globalModelSelection,
        availableProviders, // Added
        availableModelsByProvider, // Added
        isAudioEnabled,
        isLoadingNextTurn,
        addPlayerSlot,
        removePlayerSlot,
        updateSlotProviderAndModel, // Renamed/Added
        updateAllProvidersAndModels, // Renamed/Added
        updateSlotRole,
        // NEW Functions
        updateSlotName: updateSlotNameDebounced, // Use debounced version
        updateSlotImageUrl,
        toggleAudioEnabled,
        handleGenerateAndStartGame,
        isHumanJoining,
        humanRoleSelection,
        updateHumanRoleSelection,
        toggleHumanJoining,
        selectedGameThemeKey,
        setSelectedGameThemeKey,
        setCharacterSlots, // Expose the setter
    };
}
