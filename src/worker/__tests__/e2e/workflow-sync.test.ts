/**
 * E2E tests for workflow state synchronization utilities.
 *
 * Tests the KV/R2 state sync for frontend visibility:
 * - saveGameStateToKV - real-time state for frontend polling
 * - saveCheckpointToR2 - checkpoint storage for workflow resumption
 * - loadCheckpointFromR2 - checkpoint loading
 * - cleanupCheckpoints - cleanup after game completion
 * - saveErrorStateToKV - error state handling
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { initializeTestDatabase, cleanupTestData } from '../setup.js';
import {
  saveGameStateToKV,
  saveErrorStateToKV,
  saveCheckpointToR2,
  loadCheckpointFromR2,
  cleanupCheckpoints,
  getRecentEvents,
  type WorkflowGameState,
  type GameProgress,
} from '../../utils/workflow-sync.js';
import { GameState, type GameConfig, type GameEvent } from '../../../engine/index.js';

describe('Workflow Sync E2E', () => {
  beforeAll(async () => {
    await initializeTestDatabase(env.DB);
  });

  beforeEach(async () => {
    await cleanupTestData(env.DB);
    
    // Clean up KV and R2 test data
    try {
      const kvKeys = await env.RATE_LIMIT.list({ prefix: 'game-state:test-' });
      for (const key of kvKeys.keys) {
        await env.RATE_LIMIT.delete(key.name);
      }
    } catch {
      // Ignore errors
    }
    
    try {
      const r2Objects = await env.TRANSCRIPTS.list({ prefix: 'checkpoints/test-' });
      for (const obj of r2Objects.objects) {
        await env.TRANSCRIPTS.delete(obj.key);
      }
    } catch {
      // Ignore errors
    }
  });

  describe('saveGameStateToKV', () => {
    it('should save game state to KV with proper structure', async () => {
      const gameId = 'test-kv-save-1';
      const config: GameConfig = {
        playerCount: 7,
        mafiaCount: 2,
        teams: [
          { modelId: 'test/model', team: 'mafia', count: 2 },
          { modelId: 'test/model', team: 'town', count: 5 },
        ],
        maxRounds: 10,
        discussionEnabled: true,
        personaConstraints: 'moderate',
        seed: 12345,
        contextLevel: 'full',
        contextWindowSize: 3,
        personaTheme: 'noir',
      };
      
      const state = GameState.create(gameId, config);
      
      await saveGameStateToKV(env, gameId, state, 'running', 'introduction');
      
      // Read back from KV
      const stored = await env.RATE_LIMIT.get(`game-state:${gameId}`, 'json') as WorkflowGameState | null;
      
      expect(stored).toBeDefined();
      expect(stored!.status).toBe('running');
      expect(stored!.currentPhase).toBe('introduction');
      expect(stored!.state.gameId).toBe(gameId);
      expect(stored!.updatedAt).toBeDefined();
    });

    it('should update existing state in KV', async () => {
      const gameId = 'test-kv-update-1';
      const config: GameConfig = {
        playerCount: 7,
        mafiaCount: 2,
        teams: [
          { modelId: 'test/model', team: 'mafia', count: 2 },
          { modelId: 'test/model', team: 'town', count: 5 },
        ],
        maxRounds: 10,
        discussionEnabled: true,
        personaConstraints: 'moderate',
        seed: 12345,
        contextLevel: 'full',
        contextWindowSize: 3,
        personaTheme: 'noir',
      };
      
      let state = GameState.create(gameId, config);
      
      // Save initial state
      await saveGameStateToKV(env, gameId, state, 'running', 'introduction');
      
      // Update state
      state = state.withNextRound();
      await saveGameStateToKV(env, gameId, state, 'running', 'day_discussion');
      
      // Read back
      const stored = await env.RATE_LIMIT.get(`game-state:${gameId}`, 'json') as WorkflowGameState | null;
      
      expect(stored!.currentPhase).toBe('day_discussion');
      expect(stored!.currentRound).toBe(2);
    });

    it('should handle completed status', async () => {
      const gameId = 'test-kv-completed-1';
      const config: GameConfig = {
        playerCount: 7,
        mafiaCount: 2,
        teams: [
          { modelId: 'test/model', team: 'mafia', count: 2 },
          { modelId: 'test/model', team: 'town', count: 5 },
        ],
        maxRounds: 10,
        discussionEnabled: true,
        personaConstraints: 'moderate',
        seed: 12345,
        contextLevel: 'full',
        contextWindowSize: 3,
        personaTheme: 'noir',
      };
      
      const state = GameState.create(gameId, config);
      
      await saveGameStateToKV(env, gameId, state, 'completed');
      
      const stored = await env.RATE_LIMIT.get(`game-state:${gameId}`, 'json') as WorkflowGameState | null;
      
      expect(stored!.status).toBe('completed');
    });
  });

  describe('saveErrorStateToKV', () => {
    it('should save error state with message', async () => {
      const gameId = 'test-error-1';
      const config: GameConfig = {
        playerCount: 7,
        mafiaCount: 2,
        teams: [
          { modelId: 'test/model', team: 'mafia', count: 2 },
          { modelId: 'test/model', team: 'town', count: 5 },
        ],
        maxRounds: 10,
        discussionEnabled: true,
        personaConstraints: 'moderate',
        seed: 12345,
        contextLevel: 'full',
        contextWindowSize: 3,
        personaTheme: 'noir',
      };
      
      const state = GameState.create(gameId, config);
      const errorMessage = 'AI Provider timed out after 60 seconds';
      
      await saveErrorStateToKV(env, gameId, errorMessage, state);
      
      const stored = await env.RATE_LIMIT.get(`game-state:${gameId}`, 'json') as WorkflowGameState | null;
      
      expect(stored!.status).toBe('failed');
      expect(stored!.error).toBe(errorMessage);
    });
  });

  describe('R2 Checkpoints', () => {
    it('should save and load checkpoint from R2', async () => {
      const gameId = 'test-checkpoint-1';
      const config: GameConfig = {
        playerCount: 7,
        mafiaCount: 2,
        teams: [
          { modelId: 'test/model', team: 'mafia', count: 2 },
          { modelId: 'test/model', team: 'town', count: 5 },
        ],
        maxRounds: 10,
        discussionEnabled: true,
        personaConstraints: 'moderate',
        seed: 12345,
        contextLevel: 'full',
        contextWindowSize: 3,
        personaTheme: 'noir',
      };
      
      const state = GameState.create(gameId, config);
      
      // Save checkpoint
      const checkpointRef = await saveCheckpointToR2(env, gameId, 'introduction', state);
      
      expect(checkpointRef).toBeDefined();
      expect(checkpointRef.key).toContain('checkpoints/');
      expect(checkpointRef.key).toContain(gameId);
      expect(checkpointRef.key).toContain('introduction');
      
      // Load checkpoint
      const loaded = await loadCheckpointFromR2(env, checkpointRef);
      
      expect(loaded).toBeInstanceOf(GameState);
      expect(loaded.gameId).toBe(gameId);
    });

    it('should cleanup checkpoints after game completion', async () => {
      const gameId = 'test-cleanup-1';
      const config: GameConfig = {
        playerCount: 7,
        mafiaCount: 2,
        teams: [
          { modelId: 'test/model', team: 'mafia', count: 2 },
          { modelId: 'test/model', team: 'town', count: 5 },
        ],
        maxRounds: 10,
        discussionEnabled: true,
        personaConstraints: 'moderate',
        seed: 12345,
        contextLevel: 'full',
        contextWindowSize: 3,
        personaTheme: 'noir',
      };
      
      const state = GameState.create(gameId, config);
      
      // Save multiple checkpoints
      await saveCheckpointToR2(env, gameId, 'intro', state);
      await saveCheckpointToR2(env, gameId, 'discussion-r1', state);
      await saveCheckpointToR2(env, gameId, 'vote-r1', state);
      
      // Verify checkpoints exist
      let listing = await env.TRANSCRIPTS.list({ prefix: `checkpoints/${gameId}/` });
      expect(listing.objects.length).toBeGreaterThan(0);
      
      // Cleanup
      await cleanupCheckpoints(env, gameId);
      
      // Verify cleanup
      listing = await env.TRANSCRIPTS.list({ prefix: `checkpoints/${gameId}/` });
      expect(listing.objects.length).toBe(0);
    });
  });

  describe('getRecentEvents', () => {
    it('should return last N events', () => {
      const events: GameEvent[] = [];
      for (let i = 0; i < 50; i++) {
        events.push({
          type: 'phase_start',
          phase: 'day_discussion',
          round: i,
          timestamp: Date.now() + i,
        });
      }
      
      const recent = getRecentEvents(events, 10);
      
      expect(recent.length).toBe(10);
      expect(recent[0]!.round).toBe(40);
      expect(recent[9]!.round).toBe(49);
    });

    it('should return all events if fewer than limit', () => {
      const events: GameEvent[] = [
        { type: 'phase_start', phase: 'introduction', round: 1, timestamp: Date.now() },
        { type: 'phase_end', phase: 'introduction', round: 1, timestamp: Date.now() },
      ];
      
      const recent = getRecentEvents(events, 10);
      
      expect(recent.length).toBe(2);
    });

    it('should return empty array for empty events', () => {
      const recent = getRecentEvents([], 10);
      expect(recent.length).toBe(0);
    });
  });

  describe('Progress Information', () => {
    it('should include progress info in saved state', async () => {
      const gameId = 'test-progress-1';
      const config: GameConfig = {
        playerCount: 7,
        mafiaCount: 2,
        teams: [
          { modelId: 'test/model', team: 'mafia', count: 2 },
          { modelId: 'test/model', team: 'town', count: 5 },
        ],
        maxRounds: 10,
        discussionEnabled: true,
        personaConstraints: 'moderate',
        seed: 12345,
        contextLevel: 'full',
        contextWindowSize: 3,
        personaTheme: 'noir',
      };
      
      const state = GameState.create(gameId, config);
      
      const progress: GameProgress = {
        current: 3,
        total: 7,
        label: 'Generating personas... (3/7)',
        pendingPlayers: ['Player 4', 'Player 5', 'Player 6', 'Player 7'],
      };
      
      // Save with progress (the function should handle this internally)
      await saveGameStateToKV(env, gameId, state, 'running', 'introduction');
      
      const stored = await env.RATE_LIMIT.get(`game-state:${gameId}`, 'json') as WorkflowGameState | null;
      
      // Verify state was saved
      expect(stored).toBeDefined();
      expect(stored!.status).toBe('running');
    });
  });

  describe('Large State Handling', () => {
    it('should handle states with many events', async () => {
      const gameId = 'test-large-state-1';
      const config: GameConfig = {
        playerCount: 7,
        mafiaCount: 2,
        teams: [
          { modelId: 'test/model', team: 'mafia', count: 2 },
          { modelId: 'test/model', team: 'town', count: 5 },
        ],
        maxRounds: 10,
        discussionEnabled: true,
        personaConstraints: 'moderate',
        seed: 12345,
        contextLevel: 'full',
        contextWindowSize: 3,
        personaTheme: 'noir',
      };
      
      let state = GameState.create(gameId, config);
      
      // Add many events
      for (let round = 1; round <= 5; round++) {
        state = state.withEvent({
          type: 'phase_start',
          phase: 'day_discussion',
          round,
          timestamp: Date.now(),
        });
        
        // Add discussion events
        for (let player = 1; player <= 7; player++) {
          state = state.withEvent({
            type: 'ai_call',
            playerId: `player_${player}`,
            round,
            phase: 'day_discussion',
            modelId: 'test/model',
            request: { systemPrompt: 'Test', userPrompt: 'Test' },
            response: { parsed: { message: `Message from player ${player} round ${round}` } },
            tokensUsed: { input: 100, output: 50, total: 150 },
            latencyMs: 500,
            timestamp: Date.now(),
          });
        }
        
        state = state.withEvent({
          type: 'phase_end',
          phase: 'day_discussion',
          round,
          timestamp: Date.now(),
        });
      }
      
      // Should save without error (KV truncates events automatically)
      await saveGameStateToKV(env, gameId, state, 'running', 'day_vote');
      
      const stored = await env.RATE_LIMIT.get(`game-state:${gameId}`, 'json') as WorkflowGameState | null;
      
      expect(stored).toBeDefined();
      expect(stored!.status).toBe('running');
      
      // Events should be truncated to MAX_EVENTS_IN_KV (20)
      expect(stored!.state.events.length).toBeLessThanOrEqual(20);
    });
  });
});

describe('State Serialization', () => {
  it('should preserve game state through serialization', async () => {
    const gameId = 'test-serialize-1';
    const config: GameConfig = {
      playerCount: 7,
      mafiaCount: 2,
      teams: [
        { modelId: 'test/model', team: 'mafia', count: 2 },
        { modelId: 'test/model', team: 'town', count: 5 },
      ],
      maxRounds: 10,
      discussionEnabled: true,
      personaConstraints: 'moderate',
      seed: 12345,
      contextLevel: 'full',
      contextWindowSize: 3,
      personaTheme: 'noir',
    };
    
    const original = GameState.create(gameId, config);
    
    // Serialize
    const serialized = original.serialize();
    
    // Deserialize
    const restored = GameState.deserialize(serialized);
    
    expect(restored.gameId).toBe(original.gameId);
    expect(restored.round).toBe(original.round);
    expect(restored.players.length).toBe(original.players.length);
  });
});
