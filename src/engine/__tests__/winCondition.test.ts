/**
 * Win condition tests.
 */

import { describe, it, expect } from 'vitest';
import { GameState } from '../GameState.js';
import { checkWinCondition, explainWinCondition } from '../utils/winCondition.js';
import type { GameConfig } from '../types.js';

describe('checkWinCondition', () => {
  const createConfig = (mafiaCount: number, townCount: number): GameConfig => ({
    playerCount: mafiaCount + townCount,
    mafiaCount,
    teams: [
      { modelId: 'mafia-model', team: 'mafia', count: mafiaCount },
      { modelId: 'town-model', team: 'town', count: townCount },
    ],
    maxRounds: 10,
    discussionEnabled: true,
  });

  it('should return town when all mafia eliminated', () => {
    const config = createConfig(1, 4);
    let state = GameState.create('test', config);

    // Eliminate the mafia
    const mafiaPlayer = state.aliveMafia[0]!;
    state = state.withPlayerEliminated(mafiaPlayer.id);

    const winner = checkWinCondition(state);
    expect(winner).toBe('town');
  });

  it('should return mafia when mafia equals town', () => {
    const config = createConfig(2, 3);
    let state = GameState.create('test', config);

    // Eliminate one town member so it's 2 mafia vs 2 town
    const townPlayer = state.aliveTown[0]!;
    state = state.withPlayerEliminated(townPlayer.id);

    const winner = checkWinCondition(state);
    expect(winner).toBe('mafia');
  });

  it('should return mafia when mafia outnumbers town', () => {
    const config = createConfig(2, 2);
    let state = GameState.create('test', config);

    // Eliminate one town member so it's 2 mafia vs 1 town
    const townPlayer = state.aliveTown[0]!;
    state = state.withPlayerEliminated(townPlayer.id);

    const winner = checkWinCondition(state);
    expect(winner).toBe('mafia');
  });

  it('should return null when game should continue', () => {
    const config = createConfig(2, 5);
    const state = GameState.create('test', config);

    // Initial state: 2 mafia, 5 town - game should continue
    const winner = checkWinCondition(state);
    expect(winner).toBeNull();
  });

  it('should return null with 1 mafia vs 2 town', () => {
    const config = createConfig(1, 3);
    let state = GameState.create('test', config);

    // Eliminate one town member so it's 1 mafia vs 2 town
    const townPlayer = state.aliveTown[0]!;
    state = state.withPlayerEliminated(townPlayer.id);

    const winner = checkWinCondition(state);
    expect(winner).toBeNull();
  });

  describe('edge cases', () => {
    it('should handle 1v1 as mafia win', () => {
      const config = createConfig(1, 2);
      let state = GameState.create('test', config);

      // Eliminate one town member so it's 1v1
      const townPlayer = state.aliveTown[0]!;
      state = state.withPlayerEliminated(townPlayer.id);

      const winner = checkWinCondition(state);
      expect(winner).toBe('mafia');
    });

    it('should handle 0 mafia as town win', () => {
      const config = createConfig(1, 3);
      let state = GameState.create('test', config);

      // Eliminate the only mafia
      const mafiaPlayer = state.aliveMafia[0]!;
      state = state.withPlayerEliminated(mafiaPlayer.id);

      const winner = checkWinCondition(state);
      expect(winner).toBe('town');
    });
  });
});

describe('explainWinCondition', () => {
  it('should explain town win correctly', () => {
    const config: GameConfig = {
      playerCount: 5,
      mafiaCount: 1,
      teams: [
        { modelId: 'mafia', team: 'mafia', count: 1 },
        { modelId: 'town', team: 'town', count: 4 },
      ],
      maxRounds: 10,
      discussionEnabled: true,
    };

    let state = GameState.create('test', config);
    const mafiaPlayer = state.aliveMafia[0]!;
    state = state.withPlayerEliminated(mafiaPlayer.id);

    const explanation = explainWinCondition(state, 'town');
    expect(explanation).toContain('Town wins');
  });

  it('should explain mafia win by equality', () => {
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

    const state = GameState.create('test', config);
    const explanation = explainWinCondition(state, 'mafia');
    expect(explanation).toContain('equals');
    expect(explanation).toContain('Mafia wins');
  });
});

