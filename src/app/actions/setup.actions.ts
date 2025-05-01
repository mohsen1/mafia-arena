"use server";

// TODO: Update these paths based on actual project structure
import { Game } from '@/lib/engine/core/Game'; 
import { assignRoles } from '@/lib/engine/core/utils';
import type { RoleName } from '@/lib/engine/interfaces/IRole';
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

// Define input type more robustly
// TODO: This should likely live in actions.types.ts
export interface StartGameSetupData {
   themeKey: string;
   language: LanguageName;
   playerCount: number;
   humanPlayer?: { name: string; roleName: RoleName; }; // Optional human player config
   mafiaAgentConfig: AgentConfig;
   townAgentConfig: AgentConfig;
}

export async function startGameAction(setupData: StartGameSetupData): Promise<{ gameId: string; initialState: FilteredGameState } | { error: string }> {
    const gameId = crypto.randomUUID();
    const createdAt = Date.now();

    try {
        // Validate Setup Data (Basic)
        if (setupData.playerCount < 3) {
           throw new Error("Minimum 3 players required.");
        }
        const theme = Themes[setupData.themeKey];
        if (!theme) throw new Error(`Invalid theme key: ${setupData.themeKey}`);

        const roles = assignRoles(setupData.playerCount); // Use role assignment utility
        const players: Record<PlayerId, SerializablePlayer> = {};
        const livingPlayerIds: PlayerId[] = [];
        const agentMemories: Record<PlayerId, AgentMemory> = {}; // Use 'any' for AgentMemory temporarily
        let humanPlayerId: PlayerId | null = null;

        // Create Serializable Players based on setupData
        for (let i = 0; i < setupData.playerCount; i++) {
            const roleInstance = roles[i];
            const roleName = roleInstance.name; 
            const roleNameStr = roleName.toString().toLowerCase();
            // Simple ID generation, ensure uniqueness if needed
            const playerId: PlayerId = `player-${i + 1}-${roleNameStr}`; 

            let playerName = `Player ${i + 1}`; // Default name
            let agentConfig: AgentConfig;

            // Assign human player if configured (assuming index 0)
            if (setupData.humanPlayer && i === 0) {
                humanPlayerId = playerId;
                playerName = setupData.humanPlayer.name;
                agentConfig = { agentType: 'Human' }; // Special config for human
            } else {
                // Assign AI agent config based on role allegiance
                agentConfig = roleInstance.allegiance === 'Mafia' ? setupData.mafiaAgentConfig : setupData.townAgentConfig;
                playerName = `AI Player ${i + 1}`; // Placeholder name, Game Init phase should update this
            }

            players[playerId] = {
                id: playerId,
                name: playerName,
                status: PlayerStatus.Alive, // Use enum member
                roleName: roleName,
                allegiance: roles[i].allegiance,
                agentConfig: agentConfig,
                persona: { name: playerName, backstory: '', personalityTraits: [] }, 
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
