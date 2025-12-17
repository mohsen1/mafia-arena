/**
 * Vote resolution tests.
 */

import { describe, it, expect } from 'vitest';
import { resolveVotes, getVoteCounts } from '../utils/votes.js';

describe('resolveVotes', () => {
  const candidates = [
    { id: 'player_1' },
    { id: 'player_2' },
    { id: 'player_3' },
  ];

  it('should return candidate with most votes', () => {
    const votes = new Map([
      ['voter_1', 'player_1'],
      ['voter_2', 'player_1'],
      ['voter_3', 'player_2'],
    ]);

    const result = resolveVotes(votes, candidates);

    expect(result).toBeDefined();
    expect(result!.id).toBe('player_1');
  });

  it('should return null on tie', () => {
    const votes = new Map([
      ['voter_1', 'player_1'],
      ['voter_2', 'player_2'],
    ]);

    const result = resolveVotes(votes, candidates);

    expect(result).toBeNull();
  });

  it('should return null when no votes', () => {
    const votes = new Map<string, string>();

    const result = resolveVotes(votes, candidates);

    expect(result).toBeNull();
  });

  it('should ignore votes for non-candidates', () => {
    const votes = new Map([
      ['voter_1', 'player_1'],
      ['voter_2', 'player_99'], // Non-existent
    ]);

    const result = resolveVotes(votes, candidates);

    expect(result).toBeDefined();
    expect(result!.id).toBe('player_1');
  });

  it('should handle single vote correctly', () => {
    const votes = new Map([['voter_1', 'player_2']]);

    const result = resolveVotes(votes, candidates);

    expect(result).toBeDefined();
    expect(result!.id).toBe('player_2');
  });

  it('should handle three-way tie', () => {
    const votes = new Map([
      ['voter_1', 'player_1'],
      ['voter_2', 'player_2'],
      ['voter_3', 'player_3'],
    ]);

    const result = resolveVotes(votes, candidates);

    expect(result).toBeNull();
  });

  it('should return winner when majority is clear', () => {
    const votes = new Map([
      ['voter_1', 'player_1'],
      ['voter_2', 'player_1'],
      ['voter_3', 'player_1'],
      ['voter_4', 'player_2'],
      ['voter_5', 'player_3'],
    ]);

    const result = resolveVotes(votes, candidates);

    expect(result).toBeDefined();
    expect(result!.id).toBe('player_1');
  });
});

describe('getVoteCounts', () => {
  it('should count votes correctly', () => {
    const votes = new Map([
      ['voter_1', 'player_1'],
      ['voter_2', 'player_1'],
      ['voter_3', 'player_2'],
    ]);

    const counts = getVoteCounts(votes);

    expect(counts.get('player_1')).toBe(2);
    expect(counts.get('player_2')).toBe(1);
    expect(counts.get('player_3')).toBeUndefined();
  });

  it('should return empty map for no votes', () => {
    const votes = new Map<string, string>();

    const counts = getVoteCounts(votes);

    expect(counts.size).toBe(0);
  });
});

