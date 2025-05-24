"use server";

import { Game } from '@/lib/engine/core/Game'; 
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
import { selectCharacterImage } from '@/lib/utils/imageUtils';
import { createAgentInstance } from '@/lib/agentFactory';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';

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
async function generateCharacterPersona(
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
            return { error: "Authentication required to start a game" };
        }

        if (!setupData.players || setupData.players.length < 3) {
           throw new Error("Minimum 3 players required.");
        }
        const theme = Themes[setupData.themeKey];
        if (!theme) throw new Error(`Invalid theme key: ${setupData.themeKey}`);
        
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
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                }).catch(error => {
                    characterPersonas.set(`player-${i}`, {
                        name: playerSetup.name,
                        backstory: `A mysterious resident of the ${theme.name.toLowerCase()}.`,
                        personalityTraits: ['Enigmatic', 'Quiet', 'Observant']
                    });
                });
                
                personaPromises.push(promise);
            }
        }
        
        await Promise.all(personaPromises);

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

            let characterImageUrl = playerSetup.imageUrl;
            if (!characterImageUrl && !playerSetup.isHuman) {
                try {
                    const gender = Math.random() > 0.5 ? 'male' : 'female';
                    const ageCategory = Math.random() > 0.5 ? 'young' : 'old';
                    characterImageUrl = await selectCharacterImage(gender, ageCategory);
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                } catch (error) {
                    characterImageUrl = null;
                }
            }

            const generatedPersona = characterPersonas.get(`player-${i}`) || {
                name: playerSetup.name,
                backstory: playerSetup.isHuman ? 'A human player' : `A resident of ${theme.name.toLowerCase()}`,
                personalityTraits: playerSetup.isHuman ? ['Human'] : ['Mysterious']
            };

            playersForPersistence[playerId] = {
                id: playerId,
                name: generatedPersona.name,
                status: PlayerStatus.Alive,
                roleName: roleName,
                allegiance: [RoleName.Mafia].includes(roleName) ? 'Mafia' : 'Town',
                agentConfig: agentConfig,
                persona: generatedPersona,
                isHuman: playerSetup.isHuman,
                imageUrl: characterImageUrl,
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
            phase: 'Init',
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

        const game = Game.loadFromState(initialSerializableState);
        
        game.markRolesAssigned();
        game.markPersonasGenerated();
        game.createInitialAgentMemories();
        
        const initPhase = game.getCurrentPhase();
        if (initPhase.type !== 'Init') {
            throw new Error("Game did not initialize into Init phase correctly.");
        }
        
        await initPhase.runStep(game);
        
        const nextPhaseType = initPhase.transition(game);
        game.advanceToPhase(nextPhaseType);

        const finalStateToSave = game.getCurrentSerializableState();

        await createGameData(finalStateToSave, session.user.id);
        
        const filteredState = filterGameStateForClient(finalStateToSave, finalStateToSave.humanPlayerId);
        return { gameId, initialState: filteredState };

    } catch (error) {
        console.error("Error starting game:", error);
        return { error: error instanceof Error ? error.message : "Failed to start game" };
    }
}
