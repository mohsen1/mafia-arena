// src/lib/tests/visibilityHelper.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { filterGameStateForClient } from '@/lib/visibilityHelper';
import type { SerializableGameState, SerializablePlayer } from '@/lib/interfaces/persistence.types';
import type { FilteredGameState, PlayerId } from '@/lib/interfaces/gameState.types';
import { RoleName, Allegiance } from '@/lib/engine/interfaces/IRole';
import { PlayerStatus } from '@/lib/engine/interfaces/IPlayer';
import { MessageVisibility } from '@/lib/engine/interfaces/IMessage';
import type { IMessage } from '@/lib/engine/interfaces/IMessage';
import { createInitialMemory } from '@/lib/engine/interfaces/AgentMemory';
import { DEFAULT_PERSONA } from '@/lib/engine/interfaces/Persona';

describe('filterGameStateForClient', () => {
    let fullState: SerializableGameState;
    const player1Id: PlayerId = 'p1'; // Villager
    const player2Id: PlayerId = 'p2'; // Mafia
    const player3Id: PlayerId = 'p3'; // Doctor (Dead)

    beforeEach(() => {
        const now = Date.now();
        const player1: SerializablePlayer = {
            id: player1Id, name: 'Alice', status: PlayerStatus.Alive, roleName: RoleName.Villager, allegiance: 'Town', agentConfig: { agentType: 'Test' }, isHuman: false, persona: DEFAULT_PERSONA
        };
        const player2: SerializablePlayer = {
            id: player2Id, name: 'Bob', status: PlayerStatus.Alive, roleName: RoleName.Mafia, allegiance: 'Mafia', agentConfig: { agentType: 'Test' }, isHuman: false, persona: DEFAULT_PERSONA
        };
        const player3: SerializablePlayer = {
            id: player3Id, name: 'Charlie', status: PlayerStatus.Dead, roleName: RoleName.Doctor, allegiance: 'Town', agentConfig: { agentType: 'Test' }, isHuman: false, persona: DEFAULT_PERSONA
        };

        const msg1: IMessage = { id: 'm1', round: 1, phase: 'Day', senderId: player1Id, senderName: 'Alice', content: 'Public msg 1', timestamp: new Date(now - 10000), visibility: MessageVisibility.Public };
        const msg2: IMessage = { id: 'm2', round: 1, phase: 'Night', senderId: player2Id, senderName: 'Bob', content: 'Mafia msg 1', timestamp: new Date(now - 5000), visibility: MessageVisibility.Mafia };
        const msg3: IMessage = { id: 'm3', round: 2, phase: 'Day', senderId: null, senderName: 'System', content: 'Public msg 2', timestamp: new Date(now), visibility: MessageVisibility.Public };

        fullState = {
            gameId: 'test-filter-game',
            createdAt: now - 20000,
            updatedAt: now,
            themeKey: 'UK_VILLAGE_1900S',
            language: 'en',
            round: 2,
            phase: 'Day',
            players: { [player1Id]: player1, [player2Id]: player2, [player3Id]: player3 },
            livingPlayerIds: [player1Id, player2Id],
            deadPlayerIds: [player3Id],
            conversationLog: [msg1, msg2, msg3],
            agentMemories: {
                [player1Id]: createInitialMemory(),
                [player2Id]: createInitialMemory(),
                [player3Id]: createInitialMemory(),
            },
            winCondition: null,
            humanPlayerId: null,
            pendingHumanAction: null,
            _phaseResults: { killedPlayerId: null },
            phaseStep: 'Start',
            nextPlayerIndexToAction: 0
        };
    });

    it('should filter out sensitive root-level fields (agentMemories)', () => {
        const filtered = filterGameStateForClient(fullState);
        expect(filtered).not.toHaveProperty('agentMemories');
        // Check a few expected fields exist
        expect(filtered.id).toBe(fullState.gameId);
        expect(filtered.phase).toBe(fullState.phase);
        expect(filtered.players).toBeDefined();
        expect(filtered.log).toBeDefined();
    });

    it('should filter sensitive fields within players (agentConfig, allegiance except game over/dead/self)', () => {
        const filtered = filterGameStateForClient(fullState, player1Id); // Filter for player 1 (Villager)

        // Player 1 (Self) - Should see own role
        expect(filtered.players[player1Id].role).toBe(RoleName.Villager);
        expect(filtered.players[player1Id]).not.toHaveProperty('agentConfig');
        expect(filtered.players[player1Id]).not.toHaveProperty('allegiance'); // Allegiance might be added later based on role

        // Player 2 (Other Alive) - Role should be hidden
        expect(filtered.players[player2Id].role).toBeUndefined();
        expect(filtered.players[player2Id]).not.toHaveProperty('agentConfig');
        expect(filtered.players[player2Id]).not.toHaveProperty('allegiance');

        // Player 3 (Dead) - Role should be revealed
        expect(filtered.players[player3Id].role).toBe(RoleName.Doctor);
        expect(filtered.players[player3Id]).not.toHaveProperty('agentConfig');
        expect(filtered.players[player3Id]).not.toHaveProperty('allegiance');
    });

    it('should reveal all roles if game phase is GameOver', () => {
        fullState.phase = 'GameOver';
        fullState.winCondition = { outcome: 'Town', message: '' };
        const filtered = filterGameStateForClient(fullState); // No specific viewer needed

        expect(filtered.players[player1Id].role).toBe(RoleName.Villager);
        expect(filtered.players[player2Id].role).toBe(RoleName.Mafia);
        expect(filtered.players[player3Id].role).toBe(RoleName.Doctor);
    });

    it('should filter conversation log based on visibility for non-Mafia', () => {
        const filtered = filterGameStateForClient(fullState, player1Id); // Filter for player 1 (Villager)
        expect(filtered.log.length).toBe(2); // Only public messages
        expect(filtered.log.map(m => m.content)).toEqual(['Public msg 1', 'Public msg 2']);
        expect(filtered.log[0].timestamp).toBe(fullState.conversationLog[0].timestamp.toISOString()); // Check date conversion
    });

    it('should filter conversation log based on visibility for Mafia', () => {
        const filtered = filterGameStateForClient(fullState, player2Id); // Filter for player 2 (Mafia)
        expect(filtered.log.length).toBe(3); // Public + Mafia messages
        expect(filtered.log.map(m => m.content)).toEqual(['Public msg 1', 'Mafia msg 1', 'Public msg 2']);
    });

    it('should convert timestamp numbers to ISO strings', () => {
        const filtered = filterGameStateForClient(fullState);
        expect(typeof filtered.createdAt).toBe('string');
        expect(typeof filtered.lastUpdatedAt).toBe('string');
        expect(filtered.createdAt).toEqual(new Date(fullState.createdAt).toISOString());
        expect(filtered.lastUpdatedAt).toEqual(new Date(fullState.updatedAt).toISOString());
    });

     it('should include theme details if theme exists', () => {
         fullState.themeKey = 'UK_VILLAGE_1900S'; // Ensure a known theme key
         const filtered = filterGameStateForClient(fullState);
         expect(filtered.themeKey).toBe('UK_VILLAGE_1900S');
         expect(filtered.title).toBe('UK Village 1900s'); // From Themes definition
         expect(filtered.description).toBeDefined();
     });

     it('should handle unknown theme key gracefully', () => {
         fullState.themeKey = 'UNKNOWN_THEME';
         const filtered = filterGameStateForClient(fullState);
         expect(filtered.themeKey).toBe('UNKNOWN_THEME');
         // It should fall back to a default theme's details
         expect(filtered.title).toBe('UK Village 1900s'); // Default fallback
         expect(filtered.description).toBeDefined();
     });
});