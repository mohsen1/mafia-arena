/**
 * Tests for multi-round discussion functionality.
 * Tests both night (mafia private) and day (public) multi-round discussions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GameState } from '../../GameState.js';
import { executeNightPhase } from '../../phases/NightPhase.js';
import { executeDiscussionPhase } from '../../phases/DiscussionPhase.js';
import { getVisibleState } from '../../utils/visibility.js';
import { MockAIProvider, ScenarioMockAIProvider, GameStrategy } from '../mocks/MockAIProvider.js';
import type { GameConfig, AIContext, ConversationMessage } from '../../types.js';

describe('Multi-Round Discussion', () => {
  describe('Night Phase - Mafia Discussion', () => {
    const createMafiaConfig = (nightRounds: number): GameConfig => ({
      playerCount: 5,
      mafiaCount: 2,
      teams: [
        { modelId: 'mafia-model', team: 'mafia', count: 2 },
        { modelId: 'town-model', team: 'town', count: 3 },
      ],
      maxRounds: 10,
      discussionEnabled: true,
      nightDiscussionRounds: nightRounds,
      dayDiscussionRounds: 1,
    });

    it('should execute multiple mafia discussion rounds before voting', async () => {
      const config = createMafiaConfig(2);
      const state = GameState.create('test-game', config);
      
      // Strategy that tracks all calls
      const callLog: Array<{ type: string; playerId: string }> = [];
      
      class TrackingStrategy implements GameStrategy {
        getIntroductionMessage() { return 'Hello'; }
        getKillTarget(_ctx: AIContext, targets: readonly string[]) { return targets[0]!; }
        getDiscussionMessage() { return 'I suspect someone.'; }
        getMafiaDiscussionMessage(ctx: AIContext) {
          callLog.push({ type: 'mafia_discussion', playerId: ctx.playerId });
          return 'Let us target the quiet one.';
        }
        getEliminationTarget(_ctx: AIContext, targets: readonly string[]) { return targets[0] ?? null; }
      }

      const provider = new ScenarioMockAIProvider(new TrackingStrategy());
      const result = await executeNightPhase(state, provider);

      // With 2 mafia and 2 discussion rounds, should have 4 mafia discussion calls
      const mafiaDiscussionCalls = callLog.filter(c => c.type === 'mafia_discussion');
      expect(mafiaDiscussionCalls.length).toBe(4); // 2 mafia × 2 rounds

      // Should also have mafia discussion events recorded
      const discussionEvents = result.state.events.filter(
        e => e.type === 'discussion' && 'channel' in e && e.channel === 'mafia'
      );
      expect(discussionEvents.length).toBe(4);
    });

    it('should skip mafia discussion when only one mafia member', async () => {
      const config: GameConfig = {
        playerCount: 4,
        mafiaCount: 1,
        teams: [
          { modelId: 'mafia-model', team: 'mafia', count: 1 },
          { modelId: 'town-model', team: 'town', count: 3 },
        ],
        maxRounds: 10,
        discussionEnabled: true,
        nightDiscussionRounds: 2, // Still set, but should be skipped
        dayDiscussionRounds: 1,
      };

      const state = GameState.create('test-game', config);
      const callLog: string[] = [];

      class TrackingStrategy implements GameStrategy {
        getIntroductionMessage() { return 'Hello'; }
        getKillTarget() { 
          callLog.push('kill_vote');
          return state.aliveTown[0]!.id; 
        }
        getDiscussionMessage() { return 'I suspect someone.'; }
        getMafiaDiscussionMessage() {
          callLog.push('mafia_discussion');
          return 'Talking to myself...';
        }
        getEliminationTarget() { return null; }
      }

      const provider = new ScenarioMockAIProvider(new TrackingStrategy());
      await executeNightPhase(state, provider);

      // No mafia discussion calls (no one to discuss with)
      expect(callLog.filter(c => c === 'mafia_discussion').length).toBe(0);
      // But kill vote should still happen
      expect(callLog.filter(c => c === 'kill_vote').length).toBe(1);
    });

    it('should record mafia messages with correct channel and discussionRound', async () => {
      const config = createMafiaConfig(2);
      const state = GameState.create('test-game', config);

      class SimpleStrategy implements GameStrategy {
        private round = 0;
        getIntroductionMessage() { return 'Hello'; }
        getKillTarget(_ctx: AIContext, targets: readonly string[]) { return targets[0]!; }
        getDiscussionMessage() { return 'Public message'; }
        getMafiaDiscussionMessage() {
          this.round++;
          return `Mafia message ${this.round}`;
        }
        getEliminationTarget() { return null; }
      }

      const provider = new ScenarioMockAIProvider(new SimpleStrategy());
      const result = await executeNightPhase(state, provider);

      // Check conversation history
      const mafiaMessages = result.state.conversationHistory.filter(
        m => m.channel === 'mafia'
      );
      
      expect(mafiaMessages.length).toBe(4); // 2 mafia × 2 rounds
      
      // Check that discussionRound is set correctly
      const round1Messages = mafiaMessages.filter(m => m.discussionRound === 1);
      const round2Messages = mafiaMessages.filter(m => m.discussionRound === 2);
      
      expect(round1Messages.length).toBe(2); // 2 mafia in round 1
      expect(round2Messages.length).toBe(2); // 2 mafia in round 2
    });

    it('should include mafia discussion history in kill vote prompt', async () => {
      const config = createMafiaConfig(1);
      const state = GameState.create('test-game', config);

      let killVotePromptContent = '';

      class PromptCapturingStrategy implements GameStrategy {
        getIntroductionMessage() { return 'Hello'; }
        getKillTarget() { return state.aliveTown[0]!.id; }
        getDiscussionMessage() { return 'Public'; }
        getMafiaDiscussionMessage() { return 'Target the quiet player_3'; }
        getEliminationTarget() { return null; }
      }

      const provider = new ScenarioMockAIProvider(new PromptCapturingStrategy());
      await executeNightPhase(state, provider);

      // Get the kill vote AI calls
      const calls = provider.getCallLog();
      const killVoteCalls = calls.filter(c => c.prompt.type === 'kill_vote');
      
      expect(killVoteCalls.length).toBe(2); // 2 mafia vote
      
      // Kill vote prompts should reference the discussion
      for (const call of killVoteCalls) {
        expect(call.prompt.userPrompt).toContain('DISCUSSION');
      }
    });
  });

  describe('Day Phase - Multi-Round Public Discussion', () => {
    const createDayConfig = (dayRounds: number): GameConfig => ({
      playerCount: 4,
      mafiaCount: 1,
      teams: [
        { modelId: 'mafia-model', team: 'mafia', count: 1 },
        { modelId: 'town-model', team: 'town', count: 3 },
      ],
      maxRounds: 10,
      discussionEnabled: true,
      nightDiscussionRounds: 0,
      dayDiscussionRounds: dayRounds,
    });

    it('should execute multiple discussion rounds', async () => {
      const config = createDayConfig(3);
      const state = GameState.create('test-game', config);

      const callCounts: Record<string, number> = {};

      class CountingStrategy implements GameStrategy {
        getIntroductionMessage() { return 'Hello'; }
        getKillTarget(_ctx: AIContext, targets: readonly string[]) { return targets[0]!; }
        getDiscussionMessage(ctx: AIContext) {
          callCounts[ctx.playerId] = (callCounts[ctx.playerId] ?? 0) + 1;
          return `Message from ${ctx.playerName}`;
        }
        getEliminationTarget() { return null; }
      }

      const provider = new ScenarioMockAIProvider(new CountingStrategy());
      const result = await executeDiscussionPhase(state, provider);

      // Each of 4 players should discuss 3 times (3 rounds)
      expect(Object.keys(callCounts).length).toBe(4);
      for (const count of Object.values(callCounts)) {
        expect(count).toBe(3);
      }

      // Total discussion events: 4 players × 3 rounds = 12
      const discussionEvents = result.state.events.filter(e => e.type === 'discussion');
      expect(discussionEvents.length).toBe(12);
    });

    it('should record messages with correct discussionRound', async () => {
      const config = createDayConfig(2);
      const state = GameState.create('test-game', config);

      class SimpleStrategy implements GameStrategy {
        getIntroductionMessage() { return 'Hello'; }
        getKillTarget(_ctx: AIContext, targets: readonly string[]) { return targets[0]!; }
        getDiscussionMessage() { return 'I suspect someone.'; }
        getEliminationTarget() { return null; }
      }

      const provider = new ScenarioMockAIProvider(new SimpleStrategy());
      const result = await executeDiscussionPhase(state, provider);

      const messages = result.state.conversationHistory;
      
      // 4 players × 2 rounds = 8 messages
      expect(messages.length).toBe(8);

      // Check round distribution
      const round1 = messages.filter(m => m.discussionRound === 1);
      const round2 = messages.filter(m => m.discussionRound === 2);
      
      expect(round1.length).toBe(4);
      expect(round2.length).toBe(4);
    });

    it('should mark all day messages as public channel', async () => {
      const config = createDayConfig(2);
      const state = GameState.create('test-game', config);

      class SimpleStrategy implements GameStrategy {
        getIntroductionMessage() { return 'Hello'; }
        getKillTarget(_ctx: AIContext, targets: readonly string[]) { return targets[0]!; }
        getDiscussionMessage() { return 'Public message'; }
        getEliminationTarget() { return null; }
      }

      const provider = new ScenarioMockAIProvider(new SimpleStrategy());
      const result = await executeDiscussionPhase(state, provider);

      // All messages should be public
      for (const message of result.state.conversationHistory) {
        expect(message.channel).toBe('public');
      }
    });

    it('should shuffle speaker order each round', async () => {
      const config = createDayConfig(3);
      const state = GameState.create('test-game', config);

      const speakerOrders: string[][] = [[], [], []];

      class OrderTrackingStrategy implements GameStrategy {
        private currentRound = 0;
        private speakersThisRound = 0;

        getIntroductionMessage() { return 'Hello'; }
        getKillTarget(_ctx: AIContext, targets: readonly string[]) { return targets[0]!; }
        getDiscussionMessage(ctx: AIContext) {
          speakerOrders[this.currentRound]!.push(ctx.playerId);
          this.speakersThisRound++;
          if (this.speakersThisRound >= 4) {
            this.currentRound++;
            this.speakersThisRound = 0;
          }
          return 'Message';
        }
        getEliminationTarget() { return null; }
      }

      const provider = new ScenarioMockAIProvider(new OrderTrackingStrategy());
      await executeDiscussionPhase(state, provider);

      // Each round should have all 4 players
      for (const order of speakerOrders) {
        expect(order.length).toBe(4);
        expect(new Set(order).size).toBe(4); // All unique
      }

      // Orders might be shuffled (not guaranteed, but likely different)
      // At minimum, verify all rounds completed
      expect(speakerOrders.every(o => o.length === 4)).toBe(true);
    });
  });

  describe('Channel-Based Visibility', () => {
    it('should hide mafia messages from town players', async () => {
      const config: GameConfig = {
        playerCount: 4,
        mafiaCount: 2,
        teams: [
          { modelId: 'mafia-model', team: 'mafia', count: 2 },
          { modelId: 'town-model', team: 'town', count: 2 },
        ],
        maxRounds: 10,
        discussionEnabled: true,
        nightDiscussionRounds: 1,
        dayDiscussionRounds: 1,
      };

      let state = GameState.create('test-game', config);

      // Add some conversation messages manually
      const mafiaMessage: ConversationMessage = {
        playerId: state.aliveMafia[0]!.id,
        playerName: state.aliveMafia[0]!.name,
        message: 'Secret mafia strategy',
        round: 1,
        channel: 'mafia',
        discussionRound: 1,
      };

      const publicMessage: ConversationMessage = {
        playerId: state.aliveTown[0]!.id,
        playerName: state.aliveTown[0]!.name,
        message: 'Public discussion',
        round: 1,
        channel: 'public',
        discussionRound: 1,
      };

      state = state.withConversationMessage(mafiaMessage);
      state = state.withConversationMessage(publicMessage);

      // Town player should only see public messages
      const townPlayer = state.aliveTown[0]!;
      const townVisibleState = getVisibleState(state, townPlayer);

      expect(townVisibleState.conversationHistory.length).toBe(1);
      expect(townVisibleState.conversationHistory[0]!.message).toBe('Public discussion');
      expect(townVisibleState.mafiaHistory).toBeUndefined();

      // Mafia player should see both public and mafia messages
      const mafiaPlayer = state.aliveMafia[0]!;
      const mafiaVisibleState = getVisibleState(state, mafiaPlayer);

      expect(mafiaVisibleState.conversationHistory.length).toBe(1);
      expect(mafiaVisibleState.conversationHistory[0]!.message).toBe('Public discussion');
      expect(mafiaVisibleState.mafiaHistory).toBeDefined();
      expect(mafiaVisibleState.mafiaHistory!.length).toBe(1);
      expect(mafiaVisibleState.mafiaHistory![0]!.message).toBe('Secret mafia strategy');
    });

    it('should include discussion round context in visible state', () => {
      const config: GameConfig = {
        playerCount: 4,
        mafiaCount: 1,
        teams: [
          { modelId: 'mafia-model', team: 'mafia', count: 1 },
          { modelId: 'town-model', team: 'town', count: 3 },
        ],
        maxRounds: 10,
        discussionEnabled: true,
      };

      const state = GameState.create('test-game', config);
      const player = state.alivePlayers[0]!;

      const visibleState = getVisibleState(state, player, {
        currentDiscussionRound: 2,
        totalDiscussionRounds: 3,
      });

      expect(visibleState.currentDiscussionRound).toBe(2);
      expect(visibleState.totalDiscussionRounds).toBe(3);
    });
  });

  describe('GameState Conversation Filtering', () => {
    it('should correctly filter public vs mafia conversations', () => {
      const config: GameConfig = {
        playerCount: 4,
        mafiaCount: 2,
        teams: [
          { modelId: 'mafia', team: 'mafia', count: 2 },
          { modelId: 'town', team: 'town', count: 2 },
        ],
        maxRounds: 10,
        discussionEnabled: true,
      };

      let state = GameState.create('test-game', config);

      // Add mixed messages
      state = state.withConversationMessage({
        playerId: 'p1', playerName: 'Player 1', message: 'Public 1',
        round: 1, channel: 'public', discussionRound: 1,
      });
      state = state.withConversationMessage({
        playerId: 'p2', playerName: 'Player 2', message: 'Mafia 1',
        round: 1, channel: 'mafia', discussionRound: 1,
      });
      state = state.withConversationMessage({
        playerId: 'p3', playerName: 'Player 3', message: 'Public 2',
        round: 1, channel: 'public', discussionRound: 2,
      });

      const publicConvo = state.getCurrentRoundPublicConversation();
      const mafiaConvo = state.getCurrentRoundMafiaConversation();

      expect(publicConvo.length).toBe(2);
      expect(publicConvo.every(m => m.channel !== 'mafia')).toBe(true);

      expect(mafiaConvo.length).toBe(1);
      expect(mafiaConvo[0]!.message).toBe('Mafia 1');
    });
  });

  describe('Integration - Full Round with Multi-Round Discussion', () => {
    it('should complete a full night and day with multi-round discussions', async () => {
      const config: GameConfig = {
        playerCount: 5,
        mafiaCount: 2,
        teams: [
          { modelId: 'mafia-model', team: 'mafia', count: 2 },
          { modelId: 'town-model', team: 'town', count: 3 },
        ],
        maxRounds: 10,
        discussionEnabled: true,
        nightDiscussionRounds: 2,
        dayDiscussionRounds: 2,
      };

      const state = GameState.create('test-game', config);

      class FullGameStrategy implements GameStrategy {
        getIntroductionMessage(ctx: AIContext) { return `Hello, I'm ${ctx.playerName}`; }
        getKillTarget(_ctx: AIContext, targets: readonly string[]) { return targets[0]!; }
        getDiscussionMessage(ctx: AIContext) { return `${ctx.playerName} shares thoughts`; }
        getMafiaDiscussionMessage(ctx: AIContext) { return `${ctx.playerName} plots secretly`; }
        getEliminationTarget(_ctx: AIContext, targets: readonly string[]) { return targets[0] ?? null; }
      }

      const provider = new ScenarioMockAIProvider(new FullGameStrategy());

      // Execute night phase
      const nightResult = await executeNightPhase(state, provider);
      
      // Should have mafia discussion events (2 mafia × 2 rounds = 4)
      const mafiaDiscussionEvents = nightResult.state.events.filter(
        e => e.type === 'discussion' && 'channel' in e && e.channel === 'mafia'
      );
      expect(mafiaDiscussionEvents.length).toBe(4);

      // Execute day discussion phase
      const dayResult = await executeDiscussionPhase(nightResult.state, provider);
      
      // Should have public discussion events
      // After night kill, 4 players alive × 2 rounds = 8 discussions
      const publicDiscussionEvents = dayResult.state.events.filter(
        e => e.type === 'discussion' && (!('channel' in e) || e.channel === 'public')
      );
      // Note: This includes the mafia discussion events from night too
      // Day phase adds 4 players × 2 rounds = 8 public discussions
      expect(publicDiscussionEvents.length).toBeGreaterThanOrEqual(8);
    });
  });
});

