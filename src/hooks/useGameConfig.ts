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
// Import model and provider definitions
import {
    openAIModels,
    claudeModels,
    geminiModels,
    groqModels,
    openAIProviders,
    fireworksModels,
} from "@/lib/models";

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
const availableProviders: ProviderDefinition[] = openAIProviders; // Assuming openAIProviders covers all needed for now

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

// Remove availableModels from arguments, we import them now
export function useGameConfig(lang: Locale) {
    const { t } = useTranslation('translation');
    const router = useRouter();

    // State for global provider and model
    const [globalProviderSelection, setGlobalProviderSelection] =
        // Explicitly default provider to 'groq'
        useState<string>('groq');
    const [globalModelSelection, setGlobalModelSelection] = useState<string>(""); // Will be set based on provider

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

    // Determine default model based on the selected global provider
    const defaultModelForProvider = useMemo(() => {
        const models = availableModelsByProvider[globalProviderSelection];
        if (models && models.length > 0) {
            // Try to find a 'default' model or just take the first one
            const defaultModel = models.find(m => m.title.toLowerCase().includes("default"));
            return defaultModel?.value ?? models[0].value;
        }
        return ""; // Fallback if no models for provider
    }, [globalProviderSelection]);

    // Set the global model selection when the provider or default model changes
    useEffect(() => {
        // Explicitly default to gemma2-9b-it if the provider is groq
        if (globalProviderSelection === 'groq') {
            setGlobalModelSelection('gemma2-9b-it');
        } else {
            // Otherwise, use the calculated default model for the selected provider
            setGlobalModelSelection(defaultModelForProvider);
        }
    }, [globalProviderSelection, defaultModelForProvider]);


    // Effect to initialize character slots
    useEffect(() => {
        // Wait until provider and model are selected
        if (initialSlotsSet || !globalProviderSelection || !globalModelSelection) return;

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
        const initialSlots: ConfigCharacterSlot[] = [];
        if (isHumanJoining) {
            initialSlots.push({
                clientId: crypto.randomUUID(),
                provider: "", // No provider/model for human
                aiModel: "",
                roleSelection: humanRoleSelection,
                isGenerated: false,
                isHuman: true,
                profile: { characterName: humanPlayerName || t('DefaultHumanPlayerName', {}) } as Partial<UICharacterProfile>
            });
        }
        for (let i = 0; i < numAiPlayers; i++) {
            initialSlots.push({
                clientId: crypto.randomUUID(),
                provider: globalProviderSelection, // Use global provider
                aiModel: globalModelSelection, // Use global model
                roleSelection: aiRoles[i] || RoleName.Villager, // Assign shuffled role
                isGenerated: false,
                isHuman: false,
            });
        }

        setCharacterSlots(initialSlots);
        setInitialSlotsSet(true);
    // Removed availableModels from dependencies, added globalProviderSelection
    }, [globalProviderSelection, globalModelSelection, initialSlotsSet, isHumanJoining, humanRoleSelection, humanPlayerName, t]);

    const configValidation = useMemo(() => {
        const isValid = characterSlots.length >= 5; // Ensure minimum 5 players
        const message = isValid ? null : t("MinPlayerValidationError", { min: 5 });
        // Add more validation: check if provider/model is set for all AI slots
        const aiSlotsValid = characterSlots.every(slot => slot.isHuman || (slot.provider && slot.aiModel));
        if (isValid && !aiSlotsValid) {
             return { isValid: false, message: t("ProviderModelMissingValidationError", "Provider/Model must be set for all AI players.") };
        }
        return { isValid: isValid && aiSlotsValid, message };
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
                    setHumanPlayerName("");
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

    // Update all AI slots to the new global provider and model
    const updateAllProvidersAndModels = useCallback(
        (provider: string, newModel: string) => {
            setGlobalProviderSelection(provider);
            setGlobalModelSelection(newModel);
            setCharacterSlots((prev) =>
                prev.map((slot) => slot.isHuman ? slot : { ...slot, provider: provider, aiModel: newModel, isGenerated: false }),
            );
        },
        [setGlobalProviderSelection, setGlobalModelSelection]
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

    // When toggling human joining, reset the initial slots
    const toggleHumanJoining = useCallback(() => {
        setIsHumanJoining((prev) => {
            const becomingHuman = !prev;
            if (!becomingHuman) {
                setHumanPlayerName("");
            }
            setInitialSlotsSet(false); // Force re-initialization
            setCharacterSlots([]); // Clear existing slots
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

        // Find configs for town and mafia agents - might need more sophisticated logic
        // For now, just use the global settings
        const firstAiSlot = characterSlots.find(slot => !slot.isHuman);
        const agentProvider = firstAiSlot?.provider ?? globalProviderSelection;
        const agentModel = firstAiSlot?.aiModel ?? globalModelSelection;

        // TODO: Allow different configs for Town/Mafia later
        const agentConfig: AgentConfig = {
            // agentType needs mapping from providerValue if possible
            agentType: agentProvider === 'groq' ? 'Groq' : 'OpenAI', // Simple mapping, needs improvement
            modelName: agentModel,
            providerValue: agentProvider,
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
            townAgentConfig: agentConfig,
            mafiaAgentConfig: agentConfig, // Use the same config for Mafia
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
                router.push(`/game/${result.gameId}`);
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
        humanPlayerName,
        humanRoleSelection,
        t,
        router,
    ]);

    useEffect(() => {
        // Sync human player name if slots re-initialize with human present
        if (!initialSlotsSet && characterSlots.length > 0) {
            const humanSlot = characterSlots.find(slot => slot.isHuman);
            if (humanSlot) {
                setIsHumanJoining(true);
                setHumanPlayerName(humanSlot.profile?.characterName || t("DefaultHumanPlayerName", {}));
            } else {
                setIsHumanJoining(false); // Ensure consistency
            }
        }
    // Added globalProviderSelection dependency
    }, [initialSlotsSet, characterSlots, t, globalProviderSelection]);

    // Expose role selection update
    const updateHumanRoleSelection = useCallback((role: RoleName) => {
        setHumanRoleSelection(role);
        setInitialSlotsSet(false); // Force re-initialization
        setCharacterSlots([]); // Clear existing slots
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
        toggleAudioEnabled,
        handleGenerateAndStartGame,
        isHumanJoining,
        humanPlayerName,
        humanRoleSelection,
        updateHumanRoleSelection,
        toggleHumanJoining,
        updateHumanPlayerName,
        // Removed updateSlotModel, updateAllModels
    };
}
