import { startGameAction } from "@/app/actions/setup.actions";
import type { StartGameSetupData } from "@/lib/interfaces/actions.types";
import { DEFAULT_GAME_SETTINGS, calculateNumPlayers } from "@/lib/config";
import { RoleName } from "@/lib/engine/interfaces/IRole"; // Added missing import
import type { Persona } from "@/lib/engine/interfaces/Persona";
import { Themes } from "@/lib/engine/interfaces/Theme";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { LanguageCode as Locale } from "@/lib/i18n/settings";
import { useTranslation } from "react-i18next";
import type { AgentConfig } from "@/lib/interfaces/agent.types";
import { useRouter } from 'next/navigation';
// Import model and provider definitions
import {
    openAIModels,
    claudeModels,
    geminiModels,
    groqModels,
    openAIProviders,
    fireworksModels,
} from "@/lib/models";
import type { HumanActionPayload } from "@/lib/interfaces/actions.types";

// Define types locally based on the structure in @/lib/models.ts
export interface ModelDefinition {
    title: string;
    value: string;
}

export interface ProviderDefinition {
    title: string;
    value: string;
    endpoint: string;
    apiKeyEnvVar: string;
}

// Combine all models into a lookup structure
const availableModelsByProvider: Record<string, ModelDefinition[]> = {
    openai: openAIModels,
    // ollama_local: [], // Add specific Ollama models if known, or handle dynamically
    fireworks: fireworksModels, // Add mapping for fireworks
    groq: groqModels,
    claude: claudeModels, // Need corresponding provider definition
    gemini: geminiModels, // Need corresponding provider definition
    // Add mappings for other providers if necessary
};

// Use imported providers directly
// const availableProviders: ProviderDefinition[] = openAIProviders; // Assuming openAIProviders covers all needed for now
// Fetch all available providers (adjust logic if needed)
const availableProviders: ProviderDefinition[] = [
    ...openAIProviders,
    // Add Claude, Gemini etc. if they are represented in ProviderDefinition format
    // Example:
    // { title: "Claude API", value: "claude", endpoint: "...", apiKeyEnvVar: "ANTHROPIC_API_KEY" },
    // { title: "Gemini API", value: "gemini", endpoint: "...", apiKeyEnvVar: "GEMINI_API_KEY" },
].filter(p => availableModelsByProvider[p.value]?.length > 0 || p.value === 'ollama_local'); // Filter providers with models or ollama

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
    const router = useRouter();

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

    // Effect to initialize or update character slots based on global selections or human joining
    useEffect(() => {
        // Wait until provider and model have values (can happen after initial mount)
        if (!globalProviderSelection || !globalModelSelection) {
            console.log("[useGameConfig Init Effect] Waiting for global provider/model selection.");
            return;
        }

        console.log(`[useGameConfig Init Effect] Running with globalProvider=${globalProviderSelection}, globalModel=${globalModelSelection}, isHumanJoining=${isHumanJoining}`);

        // Determine total players and roles list from config
        const roleDist = { ...DEFAULT_GAME_SETTINGS.roleDistribution } as Record<RoleName, number>;
        const defaultNumPlayersFromConfig = calculateNumPlayers(roleDist);
        let initialPlayerCount = Math.max(5, defaultNumPlayersFromConfig); // Default count before human adjustment

        // Adjust role distribution *if* human is joining
        const tempRoleDist = { ...roleDist };
        if (isHumanJoining) {
            if (tempRoleDist[humanRoleSelection] > 0) {
                tempRoleDist[humanRoleSelection]--; // Decrement count for human's role
            } else {
                console.warn(`Human selected role ${humanRoleSelection} which was not in the default distribution.`);
            }
        } else {
            initialPlayerCount = defaultNumPlayersFromConfig; // Use original config count if no human
        }
        initialPlayerCount = Math.max(5, initialPlayerCount); // Ensure minimum players

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
        // Trim excess roles if needed
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
        let playerIndex = 1; // Start numbering players from 1
        const initialSlots: ConfigCharacterSlot[] = [];
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
        for (let i = 0; i < numAiPlayers; i++) {
            initialSlots.push({
                clientId: crypto.randomUUID(),
                provider: globalProviderSelection, // Use global provider
                aiModel: globalModelSelection, // Use global model
                roleSelection: aiRoles[i] || RoleName.Villager, // Assign shuffled role
                isGenerated: false,
                isHuman: false,
                // Assign default AI name initially
                profile: { characterName: t('DefaultAIPlayerName', `Player ${playerIndex}`) }
            });
            playerIndex++;
        }

        setCharacterSlots(initialSlots);
        setInitialSlotsSet(true);
    }, [globalProviderSelection, globalModelSelection, isHumanJoining, humanRoleSelection, t]);

    const configValidation = useMemo(() => {
        let isValid = characterSlots.length >= 5; // Ensure minimum 5 players
        let message = isValid ? null : t("MinPlayerValidationError", { min: 5 });

        if (isValid) {
            // Add more validation: check if provider/model is set for all AI slots
            const aiSlotsValid = characterSlots.every(slot => slot.isHuman || (slot.provider && slot.aiModel));
            if (!aiSlotsValid) {
                isValid = false;
                message = t("ProviderModelMissingValidationError", "Provider/Model must be set for all AI players.");
            }
        }

        if (isValid) {
            // NEW: Check for duplicate names (case-insensitive)
            const names = characterSlots.map(slot => slot.profile?.characterName?.trim().toLowerCase() || '');
            const uniqueNames = new Set(names.filter(name => name !== '')); // Filter out empty names before checking uniqueness
            if (uniqueNames.size !== names.filter(name => name !== '').length) {
                isValid = false;
                message = t("DuplicatePlayerNameValidationError", "Player names must be unique.");
            }
        }
        
        if (isValid) {
            // NEW: Check for empty names
            const hasEmptyName = characterSlots.some(slot => !slot.profile?.characterName?.trim());
            if (hasEmptyName) {
                isValid = false;
                message = t("EmptyPlayerNameValidationError", "Player names cannot be empty.");
            }
        }

        return { isValid, message };
    }, [characterSlots, t]);

    const canAttemptStart = configValidation.isValid && !isSubmitting;
    const totalSlots = characterSlots.length;

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
    // Also update the model selection based on the new provider
    const updateAllProvidersAndModels = useCallback(
        (newProvider: string) => {
            const newModel = getDefaultModelForProvider(newProvider);
            console.log(`[useGameConfig] updateAllProvidersAndModels: Setting global provider to ${newProvider}, calculated default model to ${newModel}`);
            setGlobalProviderSelection(newProvider);
            setGlobalModelSelection(newModel);

            // Directly update the character slots array with the new values
            setCharacterSlots((prevSlots) => {
                console.log("[useGameConfig] updateAllProvidersAndModels: Updating characterSlots state.");
                const updatedSlots = prevSlots.map((slot) =>
                    slot.isHuman
                        ? slot
                        : { ...slot, provider: newProvider, aiModel: newModel, isGenerated: false }
                );
                console.log("[useGameConfig] updateAllProvidersAndModels: Updated slots:", updatedSlots);
                return updatedSlots;
            });
        },
        [] // No dependencies needed as getDefaultModelForProvider is stable
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
            console.log("Calling startGameAction with:", setupData);
            const result = await startGameAction(setupData);
            console.log("startGameAction result:", result);

            if (result && "error" in result) {
                throw new Error(result.error);
            }

            if (result?.gameId && result?.initialState) {
                setInfoMsg(t("GameStartedSuccessInfo", {}));
                router.push(`/${lang}/game/${result.gameId}`);
            } else {
                throw new Error(t("StartGameActionUnexpectedResultError", {}));
            }

        } catch (error: unknown) {
            console.error("Error starting game:", error);
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
        router,
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
        updateSlotName,
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
