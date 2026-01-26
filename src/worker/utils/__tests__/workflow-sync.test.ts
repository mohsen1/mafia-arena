/**
 * Unit tests for workflow synchronization utilities.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveGameStateToKV,
  saveErrorStateToKV,
  getGameStateFromKV,
  deleteGameStateFromKV,
  appendEventsToR2,
  readEventsFromR2,
  saveCheckpointToR2,
  loadCheckpointFromR2,
  cleanupCheckpoints,
  cleanupEventStream,
  getRecentEvents,
  type CheckpointRef,
  type AppendEventsResult,
} from '../workflow-sync.js';
import type { GameEvent } from '../../../engine/types.js';
import type { Env } from '../../types.js';

// Mock GameState
const mockGameState = {
  serialize: vi.fn(() => ({
    events: [
      { type: 'introduction', timestamp: 1 },
      { type: 'discussion', timestamp: 2 },
    ],
    players: [],
    round: 1,
    phase: 'day',
    conversationHistory: [],
    gameId: 'test-game',
    config: {
      playerCount: 7,
      mafiaCount: 2,
      teams: [],
      maxRounds: 10,
      discussionEnabled: true,
    },
    seed: 12345,
  })),
  events: [
    { type: 'introduction', timestamp: 1 },
    { type: 'discussion', timestamp: 2 },
  ],
  round: 1,
  getProgress: vi.fn(() => ({
    current: 1,
    total: 5,
    label: 'Waiting for players',
    pendingPlayers: ['Player1', 'Player2'],
  })),
};

describe('Workflow Sync Utilities', () => {
  let mockEnv: Env;

  beforeEach(() => {
    mockEnv = {
      RATE_LIMIT: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
      },
      TRANSCRIPTS: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
      },
    } as any;

    vi.clearAllMocks();
  });

  describe('saveGameStateToKV', () => {
    it('should save game state to KV', async () => {
      await saveGameStateToKV(mockEnv, 'game-123', mockGameState as any, 'running');

      expect(mockEnv.RATE_LIMIT.put).toHaveBeenCalledWith(
        'game-state:game-123',
        expect.stringContaining('"status":"running"'),
        { expirationTtl: 86400 }
      );
    });

    it('should truncate events if too many', async () => {
      // Create state with 30 events
      const manyEvents = Array.from({ length: 30 }, (_, i) => ({
        type: 'test',
        timestamp: i,
      }));
      mockGameState.serialize.mockReturnValue({
        events: manyEvents,
        players: [],
        round: 5,
        phase: 'day',
        conversationHistory: [],
        gameId: 'test-game',
        config: {
          playerCount: 7,
          mafiaCount: 2,
          teams: [],
          maxRounds: 10,
          discussionEnabled: true,
        },
        seed: 12345,
      });

      await saveGameStateToKV(mockEnv, 'game-123', mockGameState as any, 'running');

      const putCall = vi.mocked(mockEnv.RATE_LIMIT.put).mock.calls[0];
      const savedState = JSON.parse(putCall[1]);

      // Should have only last 20 events
      expect(savedState.state.events.length).toBeLessThanOrEqual(20);
    });

    it('should include progress information', async () => {
      await saveGameStateToKV(mockEnv, 'game-123', mockGameState as any, 'running', {
        progress: {
          current: 3,
          total: 10,
          label: 'Processing votes',
          pendingPlayers: ['Player1'],
        },
      });

      expect(mockEnv.RATE_LIMIT.put).toHaveBeenCalled();
      const putCall = vi.mocked(mockEnv.RATE_LIMIT.put).mock.calls[0];
      const savedState = JSON.parse(putCall[1]);
      expect(savedState.progress).toBeDefined();
      expect(savedState.progress.current).toBe(3);
      expect(savedState.progress.total).toBe(10);
    });

    it('should support legacy signature with string currentPhase', async () => {
      await saveGameStateToKV(
        mockEnv,
        'game-123',
        mockGameState as any,
        'running',
        'discussion-phase'
      );

      expect(mockEnv.RATE_LIMIT.put).toHaveBeenCalled();
      const putCall = vi.mocked(mockEnv.RATE_LIMIT.put).mock.calls[0];
      const savedState = JSON.parse(putCall[1]);
      expect(savedState.currentPhase).toBe('discussion-phase');
    });

    it('should include batch status when provided', async () => {
      await saveGameStateToKV(mockEnv, 'game-123', mockGameState as any, 'running', {
        batchStatus: {
          isWaitingForBatch: true,
          provider: 'anthropic',
          submittedAt: Date.now(),
          pollCount: 3,
          estimatedWaitHours: 2.5,
        },
      });

      const putCall = vi.mocked(mockEnv.RATE_LIMIT.put).mock.calls[0];
      const savedState = JSON.parse(putCall[1]);
      expect(savedState.batchStatus).toBeDefined();
      expect(savedState.batchStatus.isWaitingForBatch).toBe(true);
      expect(savedState.batchStatus.provider).toBe('anthropic');
    });

    it('should handle aggressive truncation for very large state', async () => {
      // Simulate a state that's still too large after initial truncation
      const largeEvents = Array.from({ length: 25 }, (_, i) => ({
        type: 'test',
        timestamp: i,
        data: 'x'.repeat(10000), // Large event data
      }));

      mockGameState.serialize.mockReturnValue({
        events: largeEvents,
        players: [],
        round: 5,
        phase: 'day',
        conversationHistory: [],
        gameId: 'test-game',
        config: {
          playerCount: 7,
          mafiaCount: 2,
          teams: [],
          maxRounds: 10,
          discussionEnabled: true,
        },
        seed: 12345,
      });

      await saveGameStateToKV(mockEnv, 'game-123', mockGameState as any, 'running');

      expect(mockEnv.RATE_LIMIT.put).toHaveBeenCalled();
    });
  });

  describe('saveErrorStateToKV', () => {
    it('should save error state to KV', async () => {
      await saveErrorStateToKV(mockEnv, 'game-123', 'Test error');

      expect(mockEnv.RATE_LIMIT.put).toHaveBeenCalledWith(
        'game-state:game-123',
        expect.stringContaining('"status":"failed"'),
        { expirationTtl: 86400 }
      );
    });

    it('should include provided state in error', async () => {
      await saveErrorStateToKV(
        mockEnv,
        'game-123',
        'Test error',
        mockGameState as any
      );

      const putCall = vi.mocked(mockEnv.RATE_LIMIT.put).mock.calls[0];
      const savedState = JSON.parse(putCall[1]);
      expect(savedState.error).toBe('Test error');
      expect(savedState.status).toBe('failed');
    });

    it('should create minimal state if not provided', async () => {
      await saveErrorStateToKV(mockEnv, 'game-123', 'Test error');

      const putCall = vi.mocked(mockEnv.RATE_LIMIT.put).mock.calls[0];
      const savedState = JSON.parse(putCall[1]);
      expect(savedState.state).toBeDefined();
      expect(savedState.state.events).toEqual([]);
    });

    it('should handle already serialized state', async () => {
      const serializedState = {
        events: [{ type: 'test', timestamp: 1 }],
        players: [],
        round: 1,
        phase: 'day' as const,
        conversationHistory: [],
        gameId: 'test-game',
        config: {
          playerCount: 7,
          mafiaCount: 2,
          teams: [],
          maxRounds: 10,
          discussionEnabled: true,
        },
        seed: 12345,
      };

      await saveErrorStateToKV(mockEnv, 'game-123', 'Test error', serializedState);

      const putCall = vi.mocked(mockEnv.RATE_LIMIT.put).mock.calls[0];
      const savedState = JSON.parse(putCall[1]);
      expect(savedState.state.events).toHaveLength(1);
    });
  });

  describe('getGameStateFromKV', () => {
    it('should retrieve game state from KV', async () => {
      const testState = {
        state: { events: [], players: [] },
        status: 'running',
        updatedAt: Date.now(),
      };

      vi.mocked(mockEnv.RATE_LIMIT.get).mockResolvedValueOnce(JSON.stringify(testState));

      const result = await getGameStateFromKV(mockEnv, 'game-123');

      expect(result).toEqual(testState);
      expect(mockEnv.RATE_LIMIT.get).toHaveBeenCalledWith('game-state:game-123');
    });

    it('should return null if state not found', async () => {
      vi.mocked(mockEnv.RATE_LIMIT.get).mockResolvedValueOnce(null);

      const result = await getGameStateFromKV(mockEnv, 'game-123');

      expect(result).toBeNull();
    });

    it('should parse JSON correctly', async () => {
      const testState = {
        state: { events: [{ type: 'test' }], players: [] },
        status: 'completed' as const,
        updatedAt: 1234567890,
      };

      vi.mocked(mockEnv.RATE_LIMIT.get).mockResolvedValueOnce(JSON.stringify(testState));

      const result = await getGameStateFromKV(mockEnv, 'game-123');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('completed');
      expect(result!.state.events).toHaveLength(1);
    });
  });

  describe('deleteGameStateFromKV', () => {
    it('should delete game state from KV', async () => {
      await deleteGameStateFromKV(mockEnv, 'game-123');

      expect(mockEnv.RATE_LIMIT.delete).toHaveBeenCalledWith('game-state:game-123');
    });
  });

  describe('truncateStateForKV behavior (via saveGameStateToKV)', () => {
    it('should truncate events when over limit via saveGameStateToKV', async () => {
      // Create state with 30 events
      const manyEvents = Array.from({ length: 30 }, (_, i) => ({
        type: 'test',
        timestamp: i,
      }));
      mockGameState.serialize.mockReturnValue({
        events: manyEvents,
        players: [],
        round: 5,
        phase: 'day',
        conversationHistory: [],
        gameId: 'test-game',
        config: {
          playerCount: 7,
          mafiaCount: 2,
          teams: [],
          maxRounds: 10,
          discussionEnabled: true,
        },
        seed: 12345,
      });

      await saveGameStateToKV(mockEnv, 'game-123', mockGameState as any, 'running');

      const putCall = vi.mocked(mockEnv.RATE_LIMIT.put).mock.calls[0];
      const savedState = JSON.parse(putCall[1]);

      // Should have only last 20 events
      expect(savedState.state.events.length).toBeLessThanOrEqual(20);
    });
  });

  describe('appendEventsToR2', () => {
    it('should append events to R2 stream', async () => {
      const events: GameEvent[] = [
        { type: 'introduction', timestamp: 1 },
        { type: 'discussion', timestamp: 2 },
      ];

      vi.mocked(mockEnv.TRANSCRIPTS.get).mockResolvedValueOnce(null);

      const result = await appendEventsToR2(mockEnv, 'game-123', events);

      expect(result.success).toBe(true);
      expect(result.eventsWritten).toBe(2);
      expect(result.truncated).toBe(false);
      expect(mockEnv.TRANSCRIPTS.put).toHaveBeenCalledWith(
        'event-streams/game-123.jsonl',
        expect.stringContaining('introduction'),
        expect.objectContaining({
          customMetadata: expect.objectContaining({
            gameId: 'game-123',
            eventCount: '2',
          }),
        })
      );
    });

    it('should append to existing stream', async () => {
      const existingContent = '{"type":"old","timestamp":0}\n';
      const mockObj = {
        text: async () => existingContent,
      };

      vi.mocked(mockEnv.TRANSCRIPTS.get).mockResolvedValueOnce(mockObj as any);

      const events: GameEvent[] = [{ type: 'new', timestamp: 1 }];

      const result = await appendEventsToR2(mockEnv, 'game-123', events);

      expect(result.success).toBe(true);
      expect(result.eventsWritten).toBe(1);
      expect(result.truncated).toBe(false);
      expect(mockEnv.TRANSCRIPTS.put).toHaveBeenCalled();
    });

    it('should return success with 0 events for empty event array', async () => {
      const result = await appendEventsToR2(mockEnv, 'game-123', []);

      expect(result.success).toBe(true);
      expect(result.eventsWritten).toBe(0);
      expect(mockEnv.TRANSCRIPTS.put).not.toHaveBeenCalled();
    });

    it('should retry on concurrent write conflicts', async () => {
      const events: GameEvent[] = [{ type: 'test', timestamp: 1 }];

      // Fail first two times, succeed on third
      vi.mocked(mockEnv.TRANSCRIPTS.put)
        .mockRejectedValueOnce(new Error('Conflict'))
        .mockRejectedValueOnce(new Error('Conflict'))
        .mockResolvedValueOnce(undefined);

      vi.mocked(mockEnv.TRANSCRIPTS.get).mockResolvedValueOnce(null);

      const result = await appendEventsToR2(mockEnv, 'game-123', events);

      expect(result.success).toBe(true);
      expect(result.eventsWritten).toBe(1);
      expect(mockEnv.TRANSCRIPTS.put).toHaveBeenCalledTimes(3);
    });

    it('should return failure result after max retries exhausted', async () => {
      const events: GameEvent[] = [{ type: 'test', timestamp: 1 }];

      vi.mocked(mockEnv.TRANSCRIPTS.put).mockRejectedValue(new Error('Persistent error'));
      vi.mocked(mockEnv.TRANSCRIPTS.get).mockResolvedValueOnce(null);

      const result = await appendEventsToR2(mockEnv, 'game-123', events);

      expect(result.success).toBe(false);
      expect(result.eventsWritten).toBe(0);
      expect(result.error).toContain('Failed to append events after 3 attempts');
      expect(mockEnv.TRANSCRIPTS.put).toHaveBeenCalledTimes(3);
    });

    it('should truncate when exceeding size limit', async () => {
      // Create existing stream that exceeds 50MB
      // Each event is ~500KB, need 105+ events to exceed 50MB
      const largeEvent = JSON.stringify({
        type: 'test',
        id: 1,
        data: 'y'.repeat(490 * 1024) // ~490KB per event
      });

      const existingEvents: string[] = [];
      // 106 events * ~500KB = ~53MB (exceeds 50MB limit)
      for (let i = 0; i < 106; i++) {
        // Vary the data slightly to avoid compression
        existingEvents.push(largeEvent.replace('"id":1', `"id":${i}`));
      }
      const existingContent = existingEvents.join('\n') + '\n';

      // Verify the size actually exceeds the limit
      const encoder = new TextEncoder();
      const size = encoder.encode(existingContent).length;
      expect(size).toBeGreaterThan(50 * 1024 * 1024);

      const mockObj = {
        text: async () => existingContent,
      };

      vi.mocked(mockEnv.TRANSCRIPTS.get).mockResolvedValueOnce(mockObj as any);

      const events: GameEvent[] = [{ type: 'new', timestamp: 1 }];

      const result = await appendEventsToR2(mockEnv, 'game-123', events);

      expect(result.success).toBe(true);
      expect(result.truncated).toBe(true);
      expect(mockEnv.TRANSCRIPTS.put).toHaveBeenCalled();
    });

    it('should truncate when exceeding event count limit', async () => {
      // Create existing stream with 9999 events
      const existingEvents = Array.from({ length: 9999 }, (_, i) =>
        JSON.stringify({ type: 'test', id: i })
      ).join('\n') + '\n';
      const mockObj = {
        text: async () => existingEvents,
      };

      vi.mocked(mockEnv.TRANSCRIPTS.get).mockResolvedValueOnce(mockObj as any);

      // Add 2 more events (would exceed 10000 limit)
      const events: GameEvent[] = [
        { type: 'new1', timestamp: 1 },
        { type: 'new2', timestamp: 2 },
      ];

      const result = await appendEventsToR2(mockEnv, 'game-123', events);

      expect(result.success).toBe(true);
      expect(result.truncated).toBe(true);
      expect(mockEnv.TRANSCRIPTS.put).toHaveBeenCalled();
    });
  });

  describe('readEventsFromR2', () => {
    it('should read events from R2 stream', async () => {
      const jsonlContent =
        '{"type":"test1","timestamp":1}\n{"type":"test2","timestamp":2}\n';

      const mockObj = {
        text: async () => jsonlContent,
      };

      vi.mocked(mockEnv.TRANSCRIPTS.get).mockResolvedValueOnce(mockObj as any);

      const result = await readEventsFromR2(mockEnv, 'game-123');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ type: 'test1', timestamp: 1 });
      expect(result[1]).toEqual({ type: 'test2', timestamp: 2 });
    });

    it('should return empty array if stream does not exist', async () => {
      vi.mocked(mockEnv.TRANSCRIPTS.get).mockResolvedValueOnce(null);

      const result = await readEventsFromR2(mockEnv, 'game-123');

      expect(result).toEqual([]);
    });

    it('should handle empty lines in JSONL', async () => {
      const jsonlContent =
        '{"type":"test1","timestamp":1}\n\n{"type":"test2","timestamp":2}\n';

      const mockObj = {
        text: async () => jsonlContent,
      };

      vi.mocked(mockEnv.TRANSCRIPTS.get).mockResolvedValueOnce(mockObj as any);

      const result = await readEventsFromR2(mockEnv, 'game-123');

      expect(result).toHaveLength(2);
    });

    it('should throw error when stream exceeds size limit', async () => {
      // Create content larger than 50MB
      const largeEvent = JSON.stringify({ type: 'test', data: 'x'.repeat(51 * 1024 * 1024) });
      const mockObj = {
        text: async () => largeEvent,
      };

      vi.mocked(mockEnv.TRANSCRIPTS.get).mockResolvedValueOnce(mockObj as any);

      await expect(readEventsFromR2(mockEnv, 'game-123')).rejects.toThrow(
        /exceeds maximum size/
      );
    });

    it('should throw error when stream exceeds event count limit', async () => {
      // Create 10001 events (exceeds MAX_EVENT_STREAM_EVENTS of 10000)
      const manyEvents = Array.from({ length: 10001 }, (_, i) =>
        JSON.stringify({ type: 'test', id: i })
      ).join('\n');

      const mockObj = {
        text: async () => manyEvents,
      };

      vi.mocked(mockEnv.TRANSCRIPTS.get).mockResolvedValueOnce(mockObj as any);

      await expect(readEventsFromR2(mockEnv, 'game-123')).rejects.toThrow(
        /exceeds maximum event count/
      );
    });
  });

  describe('saveCheckpointToR2', () => {
    it('should save checkpoint and return reference', async () => {
      const ref = await saveCheckpointToR2(mockEnv, 'game-123', 'discussion', mockGameState as any);

      expect(ref).toBeDefined();
      expect(ref.key).toContain('checkpoints/game-123/');
      expect(ref.round).toBeDefined();
      expect(ref.phase).toBe('discussion');
      expect(ref.eventCount).toBeDefined();
      expect(ref.timestamp).toBeDefined();

      expect(mockEnv.TRANSCRIPTS.put).toHaveBeenCalledWith(
        ref.key,
        expect.any(String),
        expect.objectContaining({
          customMetadata: expect.objectContaining({
            gameId: 'game-123',
          }),
        })
      );
    });

    it('should include round number in key', async () => {
      // Create a mock with round 5
      const mockStateRound5 = {
        ...mockGameState,
        round: 5,
        serialize: vi.fn(() => ({
          events: [],
          players: [],
          round: 5,
          phase: 'day',
          conversationHistory: [],
          gameId: 'test-game',
          config: {
            playerCount: 7,
            mafiaCount: 2,
            teams: [],
            maxRounds: 10,
            discussionEnabled: true,
          },
          seed: 12345,
        })),
      };

      const ref = await saveCheckpointToR2(mockEnv, 'game-123', 'discussion', mockStateRound5 as any);

      expect(ref.key).toContain('/5-discussion-');
      expect(ref.round).toBe(5);
    });
  });

  describe('loadCheckpointFromR2', () => {
    it('should load checkpoint from R2', async () => {
      const serializedState = {
        events: [{ type: 'test', timestamp: 1 }],
        players: [],
        round: 1,
        phase: 'day',
        conversationHistory: [],
        gameId: 'test-game',
        config: {
          playerCount: 7,
          mafiaCount: 2,
          teams: [],
          maxRounds: 10,
          discussionEnabled: true,
        },
        seed: 12345,
      };

      const mockObj = {
        json: async () => serializedState,
      };

      vi.mocked(mockEnv.TRANSCRIPTS.get).mockResolvedValueOnce(mockObj as any);

      const ref: CheckpointRef = {
        key: 'checkpoints/game-123/1-discussion-123456.json',
        round: 1,
        phase: 'discussion',
        eventCount: 1,
        timestamp: 123456,
      };

      // The function should successfully deserialize the checkpoint
      const result = await loadCheckpointFromR2(mockEnv, ref);

      expect(result).toBeDefined();
      expect(mockEnv.TRANSCRIPTS.get).toHaveBeenCalledWith(ref.key);
    });

    it('should throw error if checkpoint not found', async () => {
      vi.mocked(mockEnv.TRANSCRIPTS.get).mockResolvedValueOnce(null);

      const ref: CheckpointRef = {
        key: 'checkpoints/game-123/1-discussion-123456.json',
        round: 1,
        phase: 'discussion',
        eventCount: 1,
        timestamp: 123456,
      };

      await expect(loadCheckpointFromR2(mockEnv, ref)).rejects.toThrow('Checkpoint not found');
    });
  });

  describe('cleanupCheckpoints', () => {
    it('should delete all checkpoints for a game', async () => {
      vi.mocked(mockEnv.TRANSCRIPTS.list).mockResolvedValueOnce({
        objects: [
          { key: 'checkpoints/game-123/1-discussion-123.json' },
          { key: 'checkpoints/game-123/2-vote-456.json' },
          { key: 'checkpoints/game-123/3-night-789.json' },
        ],
      } as any);

      await cleanupCheckpoints(mockEnv, 'game-123');

      expect(mockEnv.TRANSCRIPTS.list).toHaveBeenCalledWith({
        prefix: 'checkpoints/game-123/',
      });
      expect(mockEnv.TRANSCRIPTS.delete).toHaveBeenCalledTimes(3);
    });

    it('should handle empty checkpoint list', async () => {
      vi.mocked(mockEnv.TRANSCRIPTS.list).mockResolvedValueOnce({
        objects: [],
      } as any);

      await cleanupCheckpoints(mockEnv, 'game-123');

      expect(mockEnv.TRANSCRIPTS.delete).not.toHaveBeenCalled();
    });
  });

  describe('cleanupEventStream', () => {
    it('should do nothing if stream does not exist', async () => {
      vi.mocked(mockEnv.TRANSCRIPTS.get).mockResolvedValueOnce(null);

      await cleanupEventStream(mockEnv, 'game-123');

      expect(mockEnv.TRANSCRIPTS.put).not.toHaveBeenCalled();
    });

    it('should keep all events if keepRecentEvents is not specified', async () => {
      const existingContent = '{"type":"test1","timestamp":1}\n{"type":"test2","timestamp":2}\n';
      const mockObj = {
        text: async () => existingContent,
      };

      vi.mocked(mockEnv.TRANSCRIPTS.get).mockResolvedValueOnce(mockObj as any);

      await cleanupEventStream(mockEnv, 'game-123');

      // Should not call put if not truncating
      expect(mockEnv.TRANSCRIPTS.put).not.toHaveBeenCalled();
    });

    it('should truncate to specified number of events', async () => {
      // Create 5000 events
      const manyEvents = Array.from({ length: 5000 }, (_, i) =>
        JSON.stringify({ type: 'test', id: i })
      ).join('\n') + '\n';

      const mockObj = {
        text: async () => manyEvents,
      };

      vi.mocked(mockEnv.TRANSCRIPTS.get).mockResolvedValueOnce(mockObj as any);

      await cleanupEventStream(mockEnv, 'game-123', 1000);

      expect(mockEnv.TRANSCRIPTS.put).toHaveBeenCalledWith(
        'event-streams/game-123.jsonl',
        expect.stringContaining('test'),
        expect.objectContaining({
          customMetadata: expect.objectContaining({
            gameId: 'game-123',
            eventCount: '1000',
            cleaned: 'true',
          }),
        })
      );
    });

    it('should not truncate if under limit', async () => {
      const existingContent = '{"type":"test1","timestamp":1}\n';
      const mockObj = {
        text: async () => existingContent,
      };

      vi.mocked(mockEnv.TRANSCRIPTS.get).mockResolvedValueOnce(mockObj as any);

      await cleanupEventStream(mockEnv, 'game-123', 1000);

      // Should not call put if already under limit
      expect(mockEnv.TRANSCRIPTS.put).not.toHaveBeenCalled();
    });
  });

  describe('getRecentEvents', () => {
    it('should return all events if under limit', () => {
      const events = Array.from({ length: 10 }, (_, i) => ({
        type: 'test',
        timestamp: i,
      }));

      const result = getRecentEvents(events, 50);

      expect(result).toHaveLength(10);
    });

    it('should return last N events if over limit', () => {
      const events = Array.from({ length: 100 }, (_, i) => ({
        type: 'test',
        timestamp: i,
      }));

      const result = getRecentEvents(events, 50);

      expect(result).toHaveLength(50);
      expect(result[0].timestamp).toBe(50);
      expect(result[49].timestamp).toBe(99);
    });

    it('should use default limit of 50', () => {
      const events = Array.from({ length: 100 }, (_, i) => ({
        type: 'test',
        timestamp: i,
      }));

      const result = getRecentEvents(events);

      expect(result).toHaveLength(50);
    });

    it('should return empty array for empty events', () => {
      const result = getRecentEvents([], 10);

      expect(result).toEqual([]);
    });
  });
});
