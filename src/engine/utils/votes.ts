/**
 * Vote resolution utilities.
 * Handles majority voting with tie-breaking.
 */

import type { Player } from '../types.js';

/**
 * Resolve votes and determine the eliminated player.
 * Returns null if there's a tie or no valid votes.
 *
 * @param votes - Map of voter ID -> target ID
 * @param candidates - List of valid candidates
 * @returns The eliminated player or null
 */
export function resolveVotes<T extends Pick<Player, 'id'>>(
  votes: Map<string, string>,
  candidates: readonly T[]
): T | null {
  // Count votes for each candidate
  const voteCounts = new Map<string, number>();

  for (const targetId of votes.values()) {
    // Skip null/abstain votes
    if (!targetId) continue;

    // Only count votes for valid candidates
    if (!candidates.some((c) => c.id === targetId)) continue;

    voteCounts.set(targetId, (voteCounts.get(targetId) ?? 0) + 1);
  }

  // No valid votes
  if (voteCounts.size === 0) {
    return null;
  }

  // Sort by vote count descending
  const sortedVotes = Array.from(voteCounts.entries()).sort(
    (a, b) => b[1] - a[1]
  );

  const [topId, topCount] = sortedVotes[0]!;

  // Check for tie with second place
  if (sortedVotes.length > 1) {
    const [, secondCount] = sortedVotes[1]!;
    if (topCount === secondCount) {
      return null; // Tie - no elimination
    }
  }

  // Return the candidate with most votes
  return candidates.find((c) => c.id === topId) ?? null;
}

/**
 * Get vote counts for display/logging.
 */
export function getVoteCounts(votes: Map<string, string>): Map<string, number> {
  const counts = new Map<string, number>();

  for (const targetId of votes.values()) {
    if (targetId) {
      counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
    }
  }

  return counts;
}

