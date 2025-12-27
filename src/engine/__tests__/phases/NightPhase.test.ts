/**
 * Night Phase tests.
 */

import { describe, it, expect } from 'vitest';
import { GameState } from '../../GameState.js';
import { executeNightPhase } from '../../phases/NightPhase.js';
import { MockAIProvider } from '../mocks/MockAIProvider.js';
import type { GameConfig } from '../../types.js';

describe('executeNightPhase', () => {
  const createTestConfig = (): GameConfig => ({
    playerCount: 5,
    mafiaCount: 2,
    teams: [
      { modelId: 'mafia-model', team: 'mafia', count: 2 },
      { modelId: 'town-model', team: 'town', count: 3 },
    ],
    maxRounds: 10,
    discussionEnabled: true,
    personaConstraints: 'moderate',
    nightDiscussionRounds: 0, // Disable mafia discussion for these unit tests
  });

  it('should collect kill votes from all mafia members', async () => {
    const config = createTestConfig();
    const state = GameState.create('test-game', config);
    const mockProvider = new MockAIProvider();

    // Queue responses for both mafia members
    const townPlayer = state.aliveTown[0]!;
    mockProvider.queueResponse({
      action: { type: 'kill_vote', target: townPlayer.id },
    });
    mockProvider.queueResponse({
      action: { type: 'kill_vote', target: townPlayer.id },
    });

    const result = await executeNightPhase(state, mockProvider);

    expect(mockProvider.getConsumedCount()).toBe(2); // Both mafia voted
    expect(result.killed).toBeDefined();
    expect(result.killed!.id).toBe(townPlayer.id);
  });

  it('should kill the player with most votes', async () => {
    const config = createTestConfig();
    const state = GameState.create('test-game', config);
    const mockProvider = new MockAIProvider();

    const townPlayers = state.aliveTown;
    const target1 = townPlayers[0]!;

    // Both mafia vote for the same player
    mockProvider.queueResponse({
      action: { type: 'kill_vote', target: target1.id },
    });
    mockProvider.queueResponse({
      action: { type: 'kill_vote', target: target1.id },
    });

    const result = await executeNightPhase(state, mockProvider);

    expect(result.killed).toBeDefined();
    expect(result.killed!.id).toBe(target1.id);
  });

  it('should randomly select a target on tie (tie-breaking)', async () => {
    const config = createTestConfig();
    const state = GameState.create('test-game', config);
    const mockProvider = new MockAIProvider();

    const townPlayers = state.aliveTown;
    const target1 = townPlayers[0]!;
    const target2 = townPlayers[1]!;

    // Mafia split their votes
    mockProvider.queueResponse({
      action: { type: 'kill_vote', target: target1.id },
    });
    mockProvider.queueResponse({
      action: { type: 'kill_vote', target: target2.id },
    });

    const result = await executeNightPhase(state, mockProvider);

    // With tie-breaking, one of the tied targets should be killed
    expect(result.killed).toBeDefined();
    expect([target1.id, target2.id]).toContain(result.killed!.id);
  });

  it('should record AI call events', async () => {
    const config = createTestConfig();
    const state = GameState.create('test-game', config);
    const mockProvider = new MockAIProvider();

    const townPlayer = state.aliveTown[0]!;
    mockProvider.queueResponse({
      action: { type: 'kill_vote', target: townPlayer.id },
    });
    mockProvider.queueResponse({
      action: { type: 'kill_vote', target: townPlayer.id },
    });

    const result = await executeNightPhase(state, mockProvider);

    const aiCallEvents = result.state.events.filter((e) => e.type === 'ai_call');
    expect(aiCallEvents.length).toBe(2);
  });

  it('should record vote events', async () => {
    const config = createTestConfig();
    const state = GameState.create('test-game', config);
    const mockProvider = new MockAIProvider();

    const townPlayer = state.aliveTown[0]!;
    mockProvider.queueResponse({
      action: { type: 'kill_vote', target: townPlayer.id },
    });
    mockProvider.queueResponse({
      action: { type: 'kill_vote', target: townPlayer.id },
    });

    const result = await executeNightPhase(state, mockProvider);

    const voteEvents = result.state.events.filter((e) => e.type === 'vote');
    expect(voteEvents.length).toBe(2);
  });

  it('should record elimination event when kill succeeds', async () => {
    const config = createTestConfig();
    const state = GameState.create('test-game', config);
    const mockProvider = new MockAIProvider();

    const townPlayer = state.aliveTown[0]!;
    mockProvider.queueResponse({
      action: { type: 'kill_vote', target: townPlayer.id },
    });
    mockProvider.queueResponse({
      action: { type: 'kill_vote', target: townPlayer.id },
    });

    const result = await executeNightPhase(state, mockProvider);

    const eliminationEvents = result.state.events.filter(
      (e) => e.type === 'elimination'
    );
    expect(eliminationEvents.length).toBe(1);
    
    const elimination = eliminationEvents[0]!;
    if (elimination.type === 'elimination') {
      expect(elimination.playerId).toBe(townPlayer.id);
      expect(elimination.team).toBe('town');
      expect(elimination.phase).toBe('night');
    }
  });

  it('should update state to mark player as dead', async () => {
    const config = createTestConfig();
    const state = GameState.create('test-game', config);
    const mockProvider = new MockAIProvider();

    const townPlayer = state.aliveTown[0]!;
    mockProvider.queueResponse({
      action: { type: 'kill_vote', target: townPlayer.id },
    });
    mockProvider.queueResponse({
      action: { type: 'kill_vote', target: townPlayer.id },
    });

    const result = await executeNightPhase(state, mockProvider);

    expect(result.state.aliveTown.length).toBe(2); // Was 3, now 2
    expect(result.state.deadPlayers.length).toBe(1);
    expect(result.state.deadPlayers[0]!.id).toBe(townPlayer.id);
  });

  it('should ignore invalid vote targets', async () => {
    const config = createTestConfig();
    const state = GameState.create('test-game', config);
    const mockProvider = new MockAIProvider();

    const townPlayer = state.aliveTown[0]!;
    
    // One valid vote, one invalid
    mockProvider.queueResponse({
      action: { type: 'kill_vote', target: townPlayer.id },
    });
    mockProvider.queueResponse({
      action: { type: 'kill_vote', target: 'invalid_player' },
    });

    const result = await executeNightPhase(state, mockProvider);

    // Only the valid vote should count
    expect(result.killed).toBeDefined();
    expect(result.killed!.id).toBe(townPlayer.id);
  });

  it('should include phase start and end events', async () => {
    const config = createTestConfig();
    const state = GameState.create('test-game', config);
    const mockProvider = new MockAIProvider();

    const townPlayer = state.aliveTown[0]!;
    mockProvider.queueResponse({
      action: { type: 'kill_vote', target: townPlayer.id },
    });
    mockProvider.queueResponse({
      action: { type: 'kill_vote', target: townPlayer.id },
    });

    const result = await executeNightPhase(state, mockProvider);

    const phaseStartEvents = result.state.events.filter(
      (e) => e.type === 'phase_start'
    );
    const phaseEndEvents = result.state.events.filter(
      (e) => e.type === 'phase_end'
    );

    expect(phaseStartEvents.length).toBe(1);
    expect(phaseEndEvents.length).toBe(1);
  });
});

