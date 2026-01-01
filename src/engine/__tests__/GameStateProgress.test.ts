/**
 * Tests for GameState progress tracking methods.
 * Verifies getPendingActions() and getProgress() work correctly for all phases.
 */

import { describe, it, expect } from 'vitest';
import { GameState } from '../GameState.js';
import type { GameConfig, IntroductionEvent, DiscussionEvent, VoteEvent } from '../types.js';

describe('GameState Progress Tracking', () => {
  const createConfig = (playerCount = 4, mafiaCount = 1): GameConfig => ({
    playerCount,
    mafiaCount,
    teams: [
      { modelId: 'mafia-model', team: 'mafia', count: mafiaCount },
      { modelId: 'town-model', team: 'town', count: playerCount - mafiaCount },
    ],
    maxRounds: 10,
    discussionEnabled: true,
    nightDiscussionRounds: 1,
    dayDiscussionRounds: 1,
  });

  describe('getPendingActions', () => {
    it('should return all players pending for vote in day_vote phase', () => {
      const state = GameState.create('test', createConfig()).withPhase('day_vote');
      
      // Before any actions, all players should be pending for vote
      const pending = state.getPendingActions();
      expect(pending.length).toBe(4);
      expect(pending.every(p => p.actionType === 'vote')).toBe(true);
    });

    it('should track pending introductions in round 1 night', () => {
      const config = createConfig(4);
      let state = GameState.create('test', config);
      // Round 1 night is introduction phase
      expect(state.round).toBe(1);
      expect(state.phase).toBe('night');

      // Initially all players pending for introduction
      let pending = state.getPendingActions();
      expect(pending.length).toBe(4);
      expect(pending.every(p => p.actionType === 'introduction')).toBe(true);

      // Add introduction event for player 1
      const player1 = state.players[0]!;
      const introEvent: IntroductionEvent = {
        type: 'introduction',
        round: 1,
        playerId: player1.id,
        playerName: player1.name,
        message: 'Hello everyone, I am player 1',
        timestamp: Date.now(),
      };
      state = state.withEvent(introEvent);

      // Now only 3 should be pending
      pending = state.getPendingActions();
      expect(pending.length).toBe(3);
      expect(pending.find(p => p.playerId === player1.id)).toBeUndefined();
    });

    it('should track pending discussions in day_discussion phase', () => {
      const config = createConfig(3);
      let state = GameState.create('test', config).withPhase('day_discussion');

      // All alive players should be pending
      let pending = state.getPendingActions();
      expect(pending.length).toBe(3);
      expect(pending.every(p => p.actionType === 'discussion')).toBe(true);

      // Player 1 speaks
      const player1 = state.players[0]!;
      const discussEvent: DiscussionEvent = {
        type: 'discussion',
        round: 1,
        playerId: player1.id,
        playerName: player1.name,
        message: 'I think we should be careful',
        timestamp: Date.now(),
      };
      state = state.withEvent(discussEvent);

      pending = state.getPendingActions();
      expect(pending.length).toBe(2);
      expect(pending.find(p => p.playerId === player1.id)).toBeUndefined();
    });

    it('should track pending votes in day_vote phase', () => {
      const config = createConfig(4);
      let state = GameState.create('test', config).withPhase('day_vote');

      // All alive players must vote
      let pending = state.getPendingActions();
      expect(pending.length).toBe(4);
      expect(pending.every(p => p.actionType === 'vote')).toBe(true);

      // Player 1 votes for player 2
      const player1 = state.players[0]!;
      const player2 = state.players[1]!;
      const voteEvent: VoteEvent = {
        type: 'vote',
        phase: 'day_vote',
        round: 1,
        voterId: player1.id,
        voterName: player1.name,
        targetId: player2.id,
        timestamp: Date.now(),
      };
      state = state.withEvent(voteEvent);

      pending = state.getPendingActions();
      expect(pending.length).toBe(3);
      expect(pending.find(p => p.playerId === player1.id)).toBeUndefined();
    });

    it('should only track mafia for night actions in round > 1', () => {
      const config = createConfig(5, 2); // 2 mafia, 3 town
      let state = GameState.create('test', config);
      
      // Advance to round 2 night
      state = state.withNextRound(); // Now round 2, phase 'night'
      expect(state.round).toBe(2);
      expect(state.phase).toBe('night');

      const pending = state.getPendingActions();
      
      // Only mafia should be pending for night_action
      expect(pending.length).toBe(2); // 2 mafia
      expect(pending.every(p => p.team === 'mafia')).toBe(true);
      expect(pending.every(p => p.actionType === 'night_action')).toBe(true);
    });

    it('should not include eliminated players', () => {
      const config = createConfig(4);
      let state = GameState.create('test', config).withPhase('day_discussion');

      // Eliminate player 1
      const player1 = state.players[0]!;
      state = state.withPlayerEliminated(player1.id);

      const pending = state.getPendingActions();
      expect(pending.length).toBe(3);
      expect(pending.find(p => p.playerId === player1.id)).toBeUndefined();
    });

    it('should track mafia votes in night phase', () => {
      const config = createConfig(5, 2);
      let state = GameState.create('test', config).withNextRound(); // Round 2 night

      const mafia = state.aliveMafia;
      expect(mafia.length).toBe(2);

      // Mafia 1 votes
      const mafiaPlayer = mafia[0]!;
      const townPlayer = state.aliveTown[0]!;
      const voteEvent: VoteEvent = {
        type: 'vote',
        phase: 'night',
        round: 2,
        voterId: mafiaPlayer.id,
        voterName: mafiaPlayer.name,
        targetId: townPlayer.id,
        timestamp: Date.now(),
      };
      state = state.withEvent(voteEvent);

      const pending = state.getPendingActions();
      expect(pending.length).toBe(1); // Only 1 mafia left
      expect(pending[0]!.playerId).toBe(mafia[1]!.id);
    });
  });

  describe('getProgress', () => {
    it('should return correct progress for all pending players', () => {
      const config = createConfig(4);
      const state = GameState.create('test', config).withPhase('day_discussion');

      const progress = state.getProgress();
      
      expect(progress.current).toBe(0);
      expect(progress.total).toBe(4);
      expect(progress.label).toBe('Waiting for 4 players');
      expect(progress.pendingPlayers.length).toBe(4);
    });

    it('should calculate correct progress after some actions', () => {
      const config = createConfig(4);
      let state = GameState.create('test', config).withPhase('day_discussion');

      // Add discussion events for 2 players
      const p1 = state.players[0]!;
      const p2 = state.players[1]!;

      const event1: DiscussionEvent = {
        type: 'discussion',
        round: 1,
        playerId: p1.id,
        playerName: p1.name,
        message: 'Discussion 1',
        timestamp: Date.now(),
      };
      state = state.withEvent(event1);

      const event2: DiscussionEvent = {
        type: 'discussion',
        round: 1,
        playerId: p2.id,
        playerName: p2.name,
        message: 'Discussion 2',
        timestamp: Date.now(),
      };
      state = state.withEvent(event2);

      const progress = state.getProgress();
      
      expect(progress.current).toBe(2);
      expect(progress.total).toBe(4);
      expect(progress.label).toBe('Waiting for 2 players');
      expect(progress.pendingPlayers.length).toBe(2);
      expect(progress.pendingPlayers).not.toContain(p1.name);
      expect(progress.pendingPlayers).not.toContain(p2.name);
    });

    it('should show "All actions complete" when done', () => {
      const config = createConfig(2);
      let state = GameState.create('test', config).withPhase('day_discussion');

      // Add discussion events for all players
      for (const player of state.players) {
        const event: DiscussionEvent = {
          type: 'discussion',
          round: 1,
          playerId: player.id,
          playerName: player.name,
          message: 'Done',
          timestamp: Date.now(),
        };
        state = state.withEvent(event);
      }

      const progress = state.getProgress();
      
      expect(progress.current).toBe(2);
      expect(progress.total).toBe(2);
      expect(progress.label).toBe('All actions complete');
      expect(progress.pendingPlayers.length).toBe(0);
    });

    it('should use singular form for 1 pending player', () => {
      const config = createConfig(2);
      let state = GameState.create('test', config).withPhase('day_discussion');

      // Add discussion for 1 player
      const p1 = state.players[0]!;
      const event: DiscussionEvent = {
        type: 'discussion',
        round: 1,
        playerId: p1.id,
        playerName: p1.name,
        message: 'Done',
        timestamp: Date.now(),
      };
      state = state.withEvent(event);

      const progress = state.getProgress();
      
      expect(progress.current).toBe(1);
      expect(progress.total).toBe(2);
      expect(progress.label).toBe('Waiting for 1 player');
    });

    it('should calculate progress for night phase with only mafia', () => {
      const config = createConfig(5, 2); // 2 mafia, 3 town
      const state = GameState.create('test', config).withNextRound(); // Round 2 night

      const progress = state.getProgress();
      
      // Night phase only has mafia acting
      expect(progress.total).toBe(2); // Only mafia count
      expect(progress.current).toBe(0);
      expect(progress.label).toBe('Waiting for 2 players');
    });
  });
});

