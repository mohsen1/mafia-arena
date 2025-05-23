"use server";

// TODO: Update these paths based on actual project structure
import { Game } from '@/lib/engine/core/Game'; 
// import { assignRoles } from '@/lib/engine/core/utils'; // Not directly used, role assignment is complex
import { RoleName } from '@/lib/engine/interfaces/IRole';
import { Themes } from '@/lib/engine/interfaces/Theme';
import type { SerializableGameState, SerializablePlayer, AgentConfig } from '@/lib/interfaces/persistence.types';
import { saveGameData } from '@/lib/persistence'; // Assuming persistence functions exist
import { createInitialMemory, type AgentMemory } from '@/lib/engine/interfaces/AgentMemory'; // Import AgentMemory type
import type { PlayerId } from '@/lib/engine/interfaces/IPlayer';
import { PlayerStatus } from '@/lib/engine/interfaces/IPlayer';
// import type { LanguageName } from '@/lib/i18n/settings'; // Already in StartGameSetupData
import { filterGameStateForClient } from '@/lib/visibilityHelper'; // New helper needed
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';
import crypto from 'node:crypto';
import type { StartGameSetupData } from "@/lib/interfaces/actions.types"; // Use type from central location
import { DEFAULT_PERSONA, type Persona } from '@/lib/engine/interfaces/Persona';
import type { InitializationPhase } from '@/lib/engine/phases/InitializationPhase';
import { selectCharacterImage } from '@/lib/utils/imageUtils'; // Import for auto-image assignment
import { createAgentInstance } from '@/lib/agentFactory'; // Import for creating agent instances during setup
import { MessageVisibility } from '@/lib/engine/interfaces/IMessage'; // Import MessageVisibility

// Remove local definition, it's now imported
// export interface StartGameSetupData { ... }

/**
 * Retry wrapper for AI operations with exponential backoff
 */
async function retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    baseDelay = 1000,
    operationName = 'operation'
): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`${operationName}: Attempt ${attempt}/${maxRetries}`);
            return await operation();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            console.warn(`${operationName}: Attempt ${attempt} failed:`, lastError.message);
            
            if (attempt === maxRetries) {
                console.error(`${operationName}: All ${maxRetries} attempts failed. Final error:`, lastError);
                throw lastError;
            }
            
            // Exponential backoff: 1s, 2s, 4s, etc.
            const delay = baseDelay * (2 ** (attempt - 1));
            console.log(`${operationName}: Waiting ${delay}ms before retry ${attempt + 1}`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    throw lastError || new Error(`${operationName}: Unexpected retry loop exit`);
}

/**
 * Generate persona for a single character with retry logic
 */
async function generateCharacterPersona(
    playerName: string, 
    playerId: PlayerId, 
    agentConfig: AgentConfig, 
    themeDescription: string,
    language?: string
): Promise<Persona> {
    return retryWithBackoff(
        async () => {
            console.log(`Generating persona for ${playerName} (${playerId})...`);
            
            // Create a temporary agent instance for persona generation
            const tempAgent = createAgentInstance(agentConfig, playerId);
            
            // Check if the agent supports persona generation
            if (!tempAgent.generatePersona) {
                console.log(`Agent for ${playerName} doesn't support persona generation, using default`);
                return DEFAULT_PERSONA;
            }
            
            // Generate the persona
            await tempAgent.generatePersona(themeDescription, language);
            
            // Validate the generated persona
            if (!tempAgent.persona || 
                !tempAgent.persona.name || 
                tempAgent.persona.name.trim() === '' ||
                tempAgent.persona.name === DEFAULT_PERSONA.name) {
                throw new Error(`Invalid persona generated: ${JSON.stringify(tempAgent.persona)}`);
            }
            
            console.log(`✓ Generated persona for ${playerName}: "${tempAgent.persona.name}"`);
            return tempAgent.persona;
        },
        3, // maxRetries
        1000, // baseDelay (1 second)
        `Persona generation for ${playerName}`
    );
}

export async function startGameAction(setupData: StartGameSetupData): Promise<{ gameId: string; initialState: FilteredGameState } | { error: string }> {
    const gameId = crypto.randomUUID();
    const createdAt = Date.now();

    try {
        // Validate Setup Data (Basic)
        if (!setupData.players || setupData.players.length < 3) {
           throw new Error("Minimum 3 players required.");
        }
        const theme = Themes[setupData.themeKey];
        if (!theme) throw new Error(`Invalid theme key: ${setupData.themeKey}`);

        console.log("🎭 Starting character persona generation...");
        
        // Step 1: Generate personas for all AI characters BEFORE game creation
        const characterPersonas = new Map<string, Persona>();
        const personaPromises: Promise<void>[] = [];
        
        for (let i = 0; i < setupData.players.length; i++) {
            const playerSetup = setupData.players[i];
            
            if (!playerSetup.isHuman) {
                const tempPlayerId = `temp-${i}`;
                const promise = generateCharacterPersona(
                    playerSetup.name,
                    tempPlayerId,
                    playerSetup.agentConfig,
                    theme.description,
                    setupData.language
                ).then(persona => {
                    characterPersonas.set(`player-${i}`, persona);
                }).catch(error => {
                    console.warn(`Failed to generate persona for ${playerSetup.name}, using fallback:`, error.message);
                    characterPersonas.set(`player-${i}`, {
                        name: playerSetup.name,
                        backstory: `A mysterious resident of the ${theme.name.toLowerCase()}.`,
                        personalityTraits: ['Enigmatic', 'Quiet', 'Observant']
                    });
                });
                
                personaPromises.push(promise);
            }
        }
        
        // Wait for all persona generation to complete
        console.log(`🎭 Generating personas for ${personaPromises.length} AI characters...`);
        await Promise.all(personaPromises);
        console.log("✅ Character persona generation complete!");

        const rolesMap: Record<PlayerId, RoleName> = {}; // Will map playerId to RoleName
        const assignedRolesList = setupData.players.map(p => p.rolePreference); // Get roles from setup
        // TODO: Add validation/balancing logic for assignedRolesList here
        
        const playersForPersistence: Record<PlayerId, SerializablePlayer> = {};
        const livingPlayerIds: PlayerId[] = [];
        const agentMemories: Record<PlayerId, AgentMemory> = {};
        let humanPlayerId: PlayerId | null = null;

        // Step 2: Create Serializable Players with generated personas
        for (let i = 0; i < setupData.players.length; i++) {
            const playerSetup = setupData.players[i];
            const roleName = playerSetup.rolePreference; // Use the role from setup
            const roleNameStr = roleName.toString().toLowerCase();
            const sanitizedName = playerSetup.name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 16);
            
            // Generate player ID - ensure uniqueness potentially combining index and name
            const playerId: PlayerId = `player-${i + 1}-${roleNameStr}-${sanitizedName}`;
            
            rolesMap[playerId] = roleName; // Store role mapping for later if needed

            // Use the agentConfig directly from the player setup
            const agentConfig = playerSetup.agentConfig; 

            if (playerSetup.isHuman) {
                humanPlayerId = playerId;
            }

            // Auto-assign character image if not provided
            let characterImageUrl = playerSetup.imageUrl;
            if (!characterImageUrl && !playerSetup.isHuman) {
                try {
                    // Randomly select gender and age for AI characters
                    const gender = Math.random() > 0.5 ? 'male' : 'female';
                    const ageCategory = Math.random() > 0.5 ? 'young' : 'old';
                    characterImageUrl = await selectCharacterImage(gender, ageCategory);
                    console.log(`🖼️ Auto-assigned image for ${playerSetup.name}: ${characterImageUrl}`);
                } catch (error) {
                    console.warn(`Failed to auto-assign image for ${playerSetup.name}:`, error);
                    characterImageUrl = null;
                }
            }

            // Get the generated persona or use default for human players
            const generatedPersona = characterPersonas.get(`player-${i}`) || {
                name: playerSetup.name,
                backstory: playerSetup.isHuman ? 'A human player' : `A resident of ${theme.name.toLowerCase()}`,
                personalityTraits: playerSetup.isHuman ? ['Human'] : ['Mysterious']
            };

            playersForPersistence[playerId] = {
                id: playerId,
                name: generatedPersona.name, // Use the generated character name
                status: PlayerStatus.Alive,
                roleName: roleName,
                allegiance: [RoleName.Mafia].includes(roleName) ? 'Mafia' : 'Town',
                agentConfig: agentConfig,
                persona: generatedPersona, // Use the fully generated persona
                isHuman: playerSetup.isHuman,
                imageUrl: characterImageUrl, // Use auto-assigned or user-selected image
            };
            livingPlayerIds.push(playerId);
            agentMemories[playerId] = createInitialMemory();
        }

        const initialSerializableState: SerializableGameState = {
            gameId,
            createdAt,
            updatedAt: createdAt,
            themeKey: setupData.themeKey,
            language: setupData.language,
            round: 0,
            phase: 'Init', // Start with Init phase to ensure proper initialization
            players: playersForPersistence,
            livingPlayerIds,
            deadPlayerIds: [],
            conversationLog: [],
            agentMemories,
            winCondition: null,
            humanPlayerId,
            pendingHumanAction: null,
            _phaseResults: {},
            phaseStep: 'Start',
            nextPlayerIndexToAction: 0,
        };

        // Rehydrate a Game instance and run proper initialization
        const game = Game.loadFromState(initialSerializableState);
        
        // Since we pre-generated personas, mark them as complete BEFORE running initialization
        game.markRolesAssigned();
        game.markPersonasGenerated();
        game.createInitialAgentMemories();
        
        // Get the initialization phase and run it (will skip persona generation since flag is set)
        const initPhase = game.getCurrentPhase();
        if (initPhase.type !== 'Init') {
            throw new Error("Game did not initialize into Init phase correctly.");
        }

        // Log the game setup with our pre-generated characters
        console.log("🎮 Setting up game with pre-generated characters...");
        
        // Remove all initialization messages - keep chat log clean for gameplay
        // No welcome messages, no character introductions, no setup chatter
        
        // Run the initialization step which will now skip persona generation and just handle transition
        await initPhase.runStep(game);
        
        // Now transition to Day phase
        const nextPhaseType = initPhase.transition(game);
        if (nextPhaseType !== 'Day') {
            console.warn(`Expected transition to Day phase but got: ${nextPhaseType}`);
        }
        game.advanceToPhase(nextPhaseType);

        // Log the final player list with generated names
        console.log("🎮 Final character roster:");
        for (const player of Object.values(playersForPersistence)) {
            console.log(`  • ${player.name} (${player.roleName}) - ${player.isHuman ? 'Human' : 'AI'}`);
        }

        const finalStateToSave = game.getCurrentSerializableState();

        await saveGameData(gameId, finalStateToSave);

        console.log(`🎮 Game ${gameId} created successfully. Starting phase: ${finalStateToSave.phase}, Round: ${finalStateToSave.round}`);
        
        const filteredState = filterGameStateForClient(finalStateToSave, finalStateToSave.humanPlayerId);
        return { gameId, initialState: filteredState };

    } catch (error) {
        console.error("Error starting game:", error);
        return { error: error instanceof Error ? error.message : "Failed to start game" };
    }
}
