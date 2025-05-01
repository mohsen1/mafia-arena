"use server";

// TODO: Update these paths based on actual project structure
import { Game } from '@/lib/engine/core/Game'; 
import { assignRoles } from '@/lib/engine/core/utils';
import { RoleName } from '@/lib/engine/interfaces/IRole';
import { Themes } from '@/lib/engine/interfaces/Theme';
import type { SerializableGameState, SerializablePlayer, AgentConfig } from '@/lib/interfaces/persistence.types';
import { saveGameData } from '@/lib/persistence'; // Assuming persistence functions exist
import { createInitialMemory, type AgentMemory } from '@/lib/engine/interfaces/AgentMemory'; // Import AgentMemory type
import type { PlayerId } from '@/lib/engine/interfaces/IPlayer';
import { PlayerStatus } from '@/lib/engine/interfaces/IPlayer';
import type { LanguageName } from '@/lib/i18n/settings';
// import { createPhaseExecutionContext } from '@/lib/gameContextHelper'; // Context helper likely not needed directly here
import { filterGameStateForClient } from '@/lib/visibilityHelper'; // New helper needed
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';
import crypto from 'node:crypto';
import type { StartGameSetupData } from "@/lib/interfaces/actions.types"; // Use type from central location

// Remove local definition, it's now imported
// export interface StartGameSetupData { ... }

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

        // Assign roles based on preferences in setupData.players, ensuring distribution constraints
        // This requires a more complex role assignment logic than just playerCount
        // Placeholder: For now, we'll assume setupData.players already has valid assigned roles
        // In a real scenario, you might need to:
        // 1. Count preferred roles.
        // 2. Check against game rules/balance.
        // 3. Assign remaining roles randomly or based on defaults.
        const rolesMap: Record<PlayerId, RoleName> = {}; // Will map playerId to RoleName
        const assignedRolesList = setupData.players.map(p => p.rolePreference); // Get roles from setup
        // TODO: Add validation/balancing logic for assignedRolesList here
        
        const players: Record<PlayerId, SerializablePlayer> = {};
        const livingPlayerIds: PlayerId[] = [];
        const agentMemories: Record<PlayerId, AgentMemory> = {};
        let humanPlayerId: PlayerId | null = null;

        // Create Serializable Players based on the setupData.players array
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

            players[playerId] = {
                id: playerId,
                name: playerSetup.name,
                status: PlayerStatus.Alive,
                roleName: roleName,
                // Determine allegiance based on roleName - requires role definitions accessible here
                // Placeholder: Infer allegiance (requires Role definitions or mapping)
                allegiance: [RoleName.Mafia].includes(roleName) ? 'Mafia' : 'Town', 
                agentConfig: agentConfig,
                // Use provided name, add imageURL if available
                persona: { 
                    name: playerSetup.name, 
                    backstory: '', 
                    personalityTraits: [],
                    // imageUrl: playerSetup.imageUrl ?? undefined // Add image if field exists
                }, 
                // Add imageUrl directly if SerializablePlayer supports it
                // imageUrl: playerSetup.imageUrl ?? undefined,
            };
            livingPlayerIds.push(playerId);
            agentMemories[playerId] = createInitialMemory();
        }

        // Construct initial state for saving and loading into Game
        let initialState: SerializableGameState = {
            gameId,
            createdAt,
            updatedAt: createdAt,
            themeKey: setupData.themeKey,
            language: setupData.language,
            round: 0,
            phase: 'Init', // Start with Init phase
            players,
            livingPlayerIds,
            deadPlayerIds: [],
            conversationLog: [],
            agentMemories,
            winCondition: null,
            humanPlayerId,
            pendingHumanAction: null,
            // Add _phaseResults if needed by persistence type
             _phaseResults: {}, 
            // Add missing required fields with defaults
            phaseStep: 'Start', // Default step for Init or first phase
            nextPlayerIndexToAction: 0, // Start with the first player
        };

        // --- Run Initialization Phase via Game instance ---
        // Rehydrate a temporary Game instance to run the Init phase
        const tempGame = Game.loadFromState(initialState); 
        await tempGame.ensurePersonasGenerated(); // Handles persona generation & name updates

        // Get the state *after* persona generation and name updates
        initialState = tempGame.getCurrentSerializableState(); 
        // --- End Init Phase ---


        // Set the next phase after Init (e.g., Day or Night)
        // Transition logic might be complex, for now assume Night starts first
        initialState.phase = 'Night'; // Start the first night
        initialState.round = 1; // First round starts now

        // Save the fully initialized state
        await saveGameData(gameId, initialState);

        console.log(`Game ${gameId} created and initialized.`);
        
        // Filter state for client before returning
        const filteredState = filterGameStateForClient(initialState); 
        return { gameId, initialState: filteredState };

    } catch (error) {
        console.error("Error starting game:", error);
        return { error: error instanceof Error ? error.message : "Failed to start game" };
    }
}
