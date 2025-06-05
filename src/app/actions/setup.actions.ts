"use server";

import { RoleName } from '@/lib/engine/interfaces/IRole';
import { Themes } from '@/lib/engine/interfaces/Theme';
import type { SerializableGameState, SerializablePlayer, AgentConfig } from '@/lib/interfaces/persistence.types';
import { createGameData } from '@/lib/db/persistence';
import { createInitialMemory, type AgentMemory } from '@/lib/engine/interfaces/AgentMemory';
import type { PlayerId } from '@/lib/engine/interfaces/IPlayer';
import { PlayerStatus } from '@/lib/engine/interfaces/IPlayer';
import { filterGameStateForClient } from '@/lib/visibilityHelper';
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';
import crypto from 'node:crypto';
import type { StartGameSetupData } from "@/lib/interfaces/actions.types";
import { DEFAULT_PERSONA, type Persona } from '@/lib/engine/interfaces/Persona';
import { createAgentInstance } from '@/lib/agentFactory';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { redirect } from 'next/navigation';

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
            return await operation();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            
            if (attempt === maxRetries) {
                throw lastError;
            }
            
            const delay = baseDelay * (2 ** (attempt - 1));
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    throw lastError || new Error(`${operationName}: Unexpected retry loop exit`);
}

/**
 * Generate persona for a single character with retry logic
 */
export async function generateCharacterPersona(
    playerName: string, 
    playerId: PlayerId, 
    agentConfig: AgentConfig, 
    themeDescription: string,
    language?: string
): Promise<Persona> {
    return retryWithBackoff(
        async () => {
            const tempAgent = createAgentInstance(agentConfig, playerId);
            
            if (!tempAgent.generatePersona) {
                return DEFAULT_PERSONA;
            }
            
            await tempAgent.generatePersona(themeDescription, language);
            
            if (!tempAgent.persona || 
                !tempAgent.persona.name || 
                tempAgent.persona.name.trim() === '' ||
                tempAgent.persona.name === DEFAULT_PERSONA.name) {
                throw new Error(`Invalid persona generated: ${JSON.stringify(tempAgent.persona)}`);
            }
            
            return tempAgent.persona;
        },
        3,
        1000,
        `Persona generation for ${playerName}`
    );
}

export async function startGameAction(setupData: StartGameSetupData): Promise<{ gameId: string; initialState: FilteredGameState } | { error: string }> {
    const gameId = crypto.randomUUID();
    const createdAt = Date.now();

    try {
        // Check authentication
        const session = await getServerSession(authOptions);
        
        if (!session?.user?.id) {
            // Fallback: Get dev user for development environment
            if (process.env.NODE_ENV === 'development') {
                try {
                    const { db } = await import('@/lib/db/config');
                    const { users } = await import('@/lib/db/schema');
                    const { eq } = await import('drizzle-orm');
                    
                    const [devUser] = await db
                        .select()
                        .from(users)
                        .where(eq(users.email, 'dev@werewolf-ai.com'))
                        .limit(1);
                    
                    if (!devUser) {
                        return { error: "Authentication required to start a game" };
                    }
                    
                    // Use dev user for game creation
                    const userId = devUser.id;
                    await createGame(setupData, gameId, createdAt, userId);
                    
                } catch (error) {
                    // Don't log NEXT_REDIRECT as an error - it's expected
                    if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
                        // Redirect is happening successfully, let it proceed
                        redirect(`/${setupData.language}/game/${gameId}`);
                    }
                    console.error('Failed to get fallback user:', error);
                    return { error: "Authentication required to start a game" };
                }
            } else {
                return { error: "Authentication required to start a game" };
            }
        } else {
            // Use authenticated user
            const userId = session.user.id;
            await createGame(setupData, gameId, createdAt, userId);
        }
        
        // Redirect to game page after successful creation
        redirect(`/${setupData.language}/game/${gameId}`);

    } catch (error) {
        // Don't treat NEXT_REDIRECT as an error
        if (error instanceof Error && (
            error.message === 'NEXT_REDIRECT' || 
            ('digest' in error && typeof error.digest === 'string' && error.digest.includes('NEXT_REDIRECT'))
        )) {
            // Let the redirect proceed normally
            throw error;
        }
        
        console.error("Error starting game:", error);
        return { error: error instanceof Error ? error.message : "Failed to start game" };
    }
}

// Extract game creation logic into separate function - now creates minimal game without character generation
async function createGame(setupData: StartGameSetupData, gameId: string, createdAt: number, userId: string): Promise<{ gameId: string; initialState: FilteredGameState }> {
    if (!setupData.players || setupData.players.length < 3) {
       throw new Error("Minimum 3 players required.");
    }
    const theme = Themes[setupData.themeKey];
    if (!theme) throw new Error(`Invalid theme key: ${setupData.themeKey}`);
    
    // Create players with basic info - character generation will happen later
    const rolesMap: Record<PlayerId, RoleName> = {};
    const playersForPersistence: Record<PlayerId, SerializablePlayer> = {};
    const livingPlayerIds: PlayerId[] = [];
    const agentMemories: Record<PlayerId, AgentMemory> = {};
    let humanPlayerId: PlayerId | null = null;

    for (let i = 0; i < setupData.players.length; i++) {
        const playerSetup = setupData.players[i];
        const roleName = playerSetup.rolePreference;
        const roleNameStr = roleName.toString().toLowerCase();
        const sanitizedName = playerSetup.name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 16);
        
        const playerId: PlayerId = `player-${i + 1}-${roleNameStr}-${sanitizedName}`;
        
        rolesMap[playerId] = roleName;

        const agentConfig = playerSetup.agentConfig; 

        if (playerSetup.isHuman) {
            humanPlayerId = playerId;
        }

        // Use placeholder persona for now - will be generated later
        const placeholderPersona: Persona = {
            name: playerSetup.name,
            backstory: playerSetup.isHuman ? 'A human player' : `A resident of ${theme.name.toLowerCase()}`,
            personalityTraits: playerSetup.isHuman ? ['Human'] : ['Mysterious']
        };

        playersForPersistence[playerId] = {
            id: playerId,
            name: placeholderPersona.name,
            status: PlayerStatus.Alive,
            roleName: roleName,
            allegiance: [RoleName.Mafia].includes(roleName) ? 'Mafia' : 'Town',
            agentConfig: agentConfig,
            persona: placeholderPersona,
            isHuman: playerSetup.isHuman,
            imageUrl: playerSetup.imageUrl || null,
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
        phase: 'CharacterGeneration', // New phase for character generation
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

    // Save the basic game state
    await createGameData(initialSerializableState, userId);
    
    const filteredState = filterGameStateForClient(initialSerializableState, initialSerializableState.humanPlayerId);
    return { gameId, initialState: filteredState };
}
