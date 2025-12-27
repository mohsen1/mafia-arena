/**
 * ELO Rating System for Mafia Arena
 * 
 * Standard ELO with K-factor adjustment based on games played.
 * Initial rating: 1500
 * K-factor: 32 for new models (<30 games), 24 for established, 16 for veterans (>100)
 */

export const INITIAL_RATING = 1500;
const K_FACTOR_NEW = 32;      // Models with <30 games
const K_FACTOR_ESTABLISHED = 24;  // Models with 30-100 games  
const K_FACTOR_VETERAN = 16;  // Models with >100 games

/**
 * Get K-factor based on number of games played.
 * Higher K = more volatile ratings (good for new models)
 * Lower K = more stable ratings (good for established models)
 */
export function getKFactor(gamesPlayed: number): number {
  if (gamesPlayed < 30) return K_FACTOR_NEW;
  if (gamesPlayed < 100) return K_FACTOR_ESTABLISHED;
  return K_FACTOR_VETERAN;
}

/**
 * Calculate expected score (probability of winning).
 * E = 1 / (1 + 10^((Rb - Ra) / 400))
 */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Calculate new rating after a game.
 * Ra' = Ra + K * (S - E)
 * 
 * @param rating Current rating
 * @param opponentRating Opponent's rating
 * @param won Whether this model won (1) or lost (0)
 * @param kFactor K-factor for rating volatility
 * @returns New rating (rounded to integer)
 */
export function calculateNewRating(
  rating: number,
  opponentRating: number,
  won: boolean,
  kFactor: number
): number {
  const expected = expectedScore(rating, opponentRating);
  const actual = won ? 1 : 0;
  const newRating = rating + kFactor * (actual - expected);
  return Math.round(newRating);
}

/**
 * Calculate rating change (delta).
 */
export function ratingChange(
  rating: number,
  opponentRating: number,
  won: boolean,
  kFactor: number
): number {
  return calculateNewRating(rating, opponentRating, won, kFactor) - rating;
}

/**
 * Process a game result and return new ratings for both models.
 */
export interface EloUpdate {
  modelId: string;
  ratingBefore: number;
  ratingAfter: number;
  change: number;
  opponentRating: number;
  won: boolean;
}

export function processGameResult(
  winnerModelId: string,
  winnerRating: number,
  winnerGames: number,
  loserModelId: string,
  loserRating: number,
  loserGames: number
): { winner: EloUpdate; loser: EloUpdate } {
  const winnerK = getKFactor(winnerGames);
  const loserK = getKFactor(loserGames);
  
  const winnerNewRating = calculateNewRating(winnerRating, loserRating, true, winnerK);
  const loserNewRating = calculateNewRating(loserRating, winnerRating, false, loserK);
  
  return {
    winner: {
      modelId: winnerModelId,
      ratingBefore: winnerRating,
      ratingAfter: winnerNewRating,
      change: winnerNewRating - winnerRating,
      opponentRating: loserRating,
      won: true,
    },
    loser: {
      modelId: loserModelId,
      ratingBefore: loserRating,
      ratingAfter: loserNewRating,
      change: loserNewRating - loserRating,
      opponentRating: winnerRating,
      won: false,
    },
  };
}

/**
 * Get rating tier/rank name based on ELO.
 */
export function getRatingTier(rating: number): string {
  if (rating >= 2000) return 'Grandmaster';
  if (rating >= 1800) return 'Master';
  if (rating >= 1600) return 'Expert';
  if (rating >= 1400) return 'Intermediate';
  if (rating >= 1200) return 'Beginner';
  return 'Novice';
}



