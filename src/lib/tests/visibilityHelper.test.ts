// src/lib/tests/visibilityHelper.test.ts
import { describe, it, expect } from 'vitest';
import { filterGameStateForClient } from '@/lib/visibilityHelper';
import type {
  SerializableGameState,
  SerializedMessage,
} from '@/lib/interfaces/persistence.types';
import { RoleName } from '@/lib/engine/interfaces/IRole';
import { PlayerStatus } from '@/lib/engine/interfaces/IPlayer';
import { MessageVisibility } from '@/lib/engine/interfaces/IMessage';
import { DEFAULT_PERSONA } from '@/lib/engine/interfaces/Persona';

describe('filterGameStateForClient', () => {
  const player1Id = 'p1'; // Villager (Viewing Player)
  const player2Id = 'p2'; // Villager
  const player3Id = 'p3'; // Mafia
  const player4Id = 'p4'; // Doctor (Dead)

  const now = new Date();
  const nowTimestamp = now.getTime(); // Use number timestamp
  const nowISO = now.toISOString();

  // Create mock SerializedMessages with string timestamps
  const msg1: SerializedMessage = {
    id: 'm1',
    round: 1,
    phase: 'Day',
    senderId: player1Id,
    senderName: 'P1',
    content: 'Hello villagers!',
    timestamp: nowISO,
    visibility: MessageVisibility.Public,
  };
  const msg2: SerializedMessage = {
    id: 'm2',
    round: 1,
    phase: 'Night',
    senderId: player3Id,
    senderName: 'P3',
    content: 'Target p2',
    timestamp: nowISO,
    visibility: MessageVisibility.Mafia,
  };
  const msg3: SerializedMessage = {
    id: 'm3',
    round: 2,
    phase: 'Day',
    senderId: 'system',
    senderName: 'Moderator',
    content: 'P4 was killed.',
    timestamp: nowISO,
    visibility: MessageVisibility.Public,
  };

  const fullState: SerializableGameState = {
    gameId: 'g1',
    phase: 'Day',
    round: 2,
    themeKey: 'test-theme',
    language: 'en',
    createdAt: nowTimestamp,
    updatedAt: nowTimestamp,
    livingPlayerIds: [player1Id, player2Id, player3Id],
    deadPlayerIds: [player4Id],
    pendingHumanAction: null,
    humanPlayerId: player1Id,
    winCondition: null, // Game is ongoing
    players: {
      [player1Id]: {
        id: player1Id,
        name: 'P1',
        status: PlayerStatus.Alive,
        roleName: RoleName.Villager,
        allegiance: 'Town',
        agentConfig: { agentType: 'Human' },
        persona: { ...DEFAULT_PERSONA, name: 'P1' },
        isHuman: true,
      },
      [player2Id]: {
        id: player2Id,
        name: 'P2',
        status: PlayerStatus.Alive,
        roleName: RoleName.Villager,
        allegiance: 'Town',
        agentConfig: { agentType: 'Dummy' },
        persona: { ...DEFAULT_PERSONA, name: 'P2' },
        isHuman: false,
      },
      [player3Id]: {
        id: player3Id,
        name: 'P3',
        status: PlayerStatus.Alive,
        roleName: RoleName.Mafia,
        allegiance: 'Mafia',
        agentConfig: { agentType: 'Dummy' },
        persona: { ...DEFAULT_PERSONA, name: 'P3' },
        isHuman: false,
      },
      [player4Id]: {
        id: player4Id,
        name: 'P4',
        status: PlayerStatus.Dead,
        roleName: RoleName.Doctor,
        allegiance: 'Town',
        agentConfig: { agentType: 'Dummy' },
        persona: { ...DEFAULT_PERSONA, name: 'P4' },
        isHuman: false,
      },
    },
    conversationLog: [msg1, msg2, msg3],
    agentMemories: {},
    phaseStep: 'Start',
    nextPlayerIndexToAction: 0,
  };

  it('should filter general game state properties correctly', () => {
    const filtered = filterGameStateForClient(fullState, player1Id);
    expect(filtered.id).toBe(fullState.gameId);
    expect(filtered.phase).toBe(fullState.phase);
    expect(filtered.round).toBe(fullState.round);
    expect(filtered.themeKey).toBe(fullState.themeKey);
    expect(filtered.language).toBe(fullState.language);
    // Check timestamp conversion to ISO string
    expect(filtered.createdAt).toBe(
      new Date(fullState.createdAt).toISOString()
    );
    expect(filtered.lastUpdatedAt).toBe(
      new Date(fullState.updatedAt).toISOString()
    );
    expect(filtered.livingPlayerIds).toEqual(fullState.livingPlayerIds);
    expect(filtered.deadPlayerIds).toEqual(fullState.deadPlayerIds);
    expect(filtered.humanPlayerId).toBe(fullState.humanPlayerId);
    expect(filtered.pendingHumanAction).toBe(fullState.pendingHumanAction);
    // Check winCondition outcome is null when ongoing
    expect(filtered.winCondition).toBeNull();
  });

  it('should filter player list, hiding roles of living players except self', () => {
    const filtered = filterGameStateForClient(fullState, player1Id);

    expect(Object.keys(filtered.players).length).toBe(4);

    // Viewing player (P1) - should see own role
    expect(filtered.players[player1Id].id).toBe(player1Id);
    expect(filtered.players[player1Id].name).toBe('P1');
    expect(filtered.players[player1Id].status).toBe(PlayerStatus.Alive);
    expect(filtered.players[player1Id].role).toBe(RoleName.Villager);

    // Other living player (P2) - should not see role
    expect(filtered.players[player2Id].id).toBe(player2Id);
    expect(filtered.players[player2Id].name).toBe('P2');
    expect(filtered.players[player2Id].status).toBe(PlayerStatus.Alive);
    expect(filtered.players[player2Id].role).toBeUndefined();

    // Other living player (P3 - Mafia) - should not see role
    expect(filtered.players[player3Id].id).toBe(player3Id);
    expect(filtered.players[player3Id].name).toBe('P3');
    expect(filtered.players[player3Id].status).toBe(PlayerStatus.Alive);
    expect(filtered.players[player3Id].role).toBeUndefined();

    // Dead player (P4) - should see role
    expect(filtered.players[player4Id].id).toBe(player4Id);
    expect(filtered.players[player4Id].name).toBe('P4');
    expect(filtered.players[player4Id].status).toBe(PlayerStatus.Dead);
    expect(filtered.players[player4Id].role).toBe(RoleName.Doctor);
  });

  it('should show all roles and correct winCondition during GameOver phase', () => {
    const gameOverState: SerializableGameState = {
      ...fullState,
      phase: 'GameOver',
      winCondition: { outcome: 'Town', message: 'Town wins!' }, // Example finished state
    };
    const filtered = filterGameStateForClient(gameOverState, player1Id);

    expect(filtered.players[player1Id].role).toBe(RoleName.Villager);
    expect(filtered.players[player2Id].role).toBe(RoleName.Villager);
    expect(filtered.players[player3Id].role).toBe(RoleName.Mafia);
    expect(filtered.players[player4Id].role).toBe(RoleName.Doctor);
    // Check winCondition reflects the outcome
    expect(filtered.winCondition).toBe('Town');
  });

  it('should filter conversation log based on visibility (non-Mafia viewer)', () => {
    const filtered = filterGameStateForClient(fullState, player1Id); // Player 1 is Villager

    expect(filtered.log.length).toBe(2); // Should not see Mafia message (msg2)
    expect(filtered.log[0].id).toBe(msg1.id);
    expect(filtered.log[0].visibility).toBe(MessageVisibility.Public);
    expect(filtered.log[1].id).toBe(msg3.id);
    expect(filtered.log[1].visibility).toBe(MessageVisibility.Public);
  });

  it('should filter conversation log based on visibility (Mafia viewer)', () => {
    const filtered = filterGameStateForClient(fullState, player3Id); // Player 3 is Mafia

    expect(filtered.log.length).toBe(3); // Should see all messages
    expect(filtered.log[0].id).toBe(msg1.id);
    expect(filtered.log[0].visibility).toBe(MessageVisibility.Public);
    expect(filtered.log[1].id).toBe(msg2.id);
    expect(filtered.log[1].visibility).toBe(MessageVisibility.Mafia);
    expect(filtered.log[2].id).toBe(msg3.id);
    expect(filtered.log[2].visibility).toBe(MessageVisibility.Public);
  });

  it('should convert date timestamps to ISO strings in the log', () => {
    const filtered = filterGameStateForClient(fullState, player1Id);
    // Assert directly against the string timestamp in the mock fullState
    expect(filtered.log[0].timestamp).toBe(
      fullState.conversationLog[0].timestamp
    ); // msg1 timestamp
    // The second message for P1 is msg3
    expect(filtered.log[1].timestamp).toBe(
      fullState.conversationLog[2].timestamp
    ); // msg3 timestamp
  });

  it('should handle null or undefined viewingPlayerId (observer mode)', () => {
    const filtered = filterGameStateForClient(fullState, null);

    // 🎯 UPDATED: Observers should NOT see all roles during active gameplay
    // (preserves werewolf game mystery) - only see roles of dead players and during GameOver
    expect(filtered.players[player1Id].role).toBeUndefined(); // Living player - hidden
    expect(filtered.players[player2Id].role).toBeUndefined(); // Living player - hidden
    expect(filtered.players[player3Id].role).toBeUndefined(); // Living Mafia - hidden
    expect(filtered.players[player4Id].role).toBe(RoleName.Doctor); // Dead player - revealed

    // 🎯 UPDATED: Observers should NOT see Mafia chat during active gameplay
    // (only during GameOver phase)
    expect(filtered.log.length).toBe(2); // Should not see Mafia message (msg2)
    expect(filtered.log[0].id).toBe(msg1.id); // Public message
    expect(filtered.log[1].id).toBe(msg3.id); // Public message
    // Mafia message should be filtered out during active gameplay
    expect(
      filtered.log.find((m) => m.visibility === MessageVisibility.Mafia)
    ).toBeUndefined();

    // 🎯 UPDATED: canSeeWerewolfChat should be false during active gameplay
    expect(filtered.canSeeWerewolfChat).toBe(false);
  });

  // 🎯 NEW TEST: Observer mode during GameOver should see everything
  it('should show all roles and Mafia chat for observers during GameOver phase', () => {
    const gameOverState: SerializableGameState = {
      ...fullState,
      phase: 'GameOver',
      winCondition: { outcome: 'Town', message: 'Town wins!' },
    };
    const filtered = filterGameStateForClient(gameOverState, null); // null = observer

    // During GameOver, observers should see all roles
    expect(filtered.players[player1Id].role).toBe(RoleName.Villager);
    expect(filtered.players[player2Id].role).toBe(RoleName.Villager);
    expect(filtered.players[player3Id].role).toBe(RoleName.Mafia);
    expect(filtered.players[player4Id].role).toBe(RoleName.Doctor);

    // During GameOver, observers should see all messages including Mafia chat
    expect(filtered.log.length).toBe(3);
    expect(
      filtered.log.find((m) => m.visibility === MessageVisibility.Mafia)
    ).toBeDefined();
    expect(filtered.log[0].id).toBe(msg1.id);
    expect(filtered.log[1].id).toBe(msg2.id);
    expect(filtered.log[2].id).toBe(msg3.id);

    // canSeeWerewolfChat should be true during GameOver
    expect(filtered.canSeeWerewolfChat).toBe(true);
  });

  it('should set canSeeWerewolfChat correctly for mafia players', () => {
    const filtered = filterGameStateForClient(fullState, player3Id); // Player 3 is Mafia
    expect(filtered.canSeeWerewolfChat).toBe(true);
  });

  it('should set canSeeWerewolfChat correctly for non-mafia players', () => {
    const filtered = filterGameStateForClient(fullState, player1Id); // Player 1 is Villager
    expect(filtered.canSeeWerewolfChat).toBe(false);
  });
});
