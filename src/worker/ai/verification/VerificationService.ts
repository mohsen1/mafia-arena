/**
 * Verification Service for External Worker Integrity
 *
 * Implements a defense-in-depth approach to detect if external workers
 * are running modified code that could cheat in the benchmark.
 *
 * Verification layers:
 * 1. Token Embedding: Random tokens in system prompts that must appear in responses
 * 2. Challenge-Response: Cryptographic challenges requiring known template code
 * 3. Timing Analysis: Detect statistical anomalies in response times
 * 4. Behavioral Analysis: Flag unusual win rates, vote patterns, etc.
 *
 * Perfect verification is cryptographically impossible (no script hash API),
 * but this multi-layer approach makes cheating detectable and risky.
 */

import type { Env } from '../../types.js';
import { ExternalWorkerProvider } from '../providers/ExternalWorkerProvider.js';

// =============================================================================
// TYPES
// =============================================================================

export interface VerificationContext {
  gameId: string;
  userId: string;
  workerId: string;
  workerUrl: string;
  authToken: string;
}

export interface TokenVerificationResult {
  passed: boolean;
  token: string;
  foundInResponse: boolean;
  details?: string | undefined;
}

export interface ChallengeVerificationResult {
  passed: boolean;
  expectedResponse: string;
  actualResponse?: string | undefined;
  templateVersion?: string | undefined;
  error?: string | undefined;
}

export interface TimingVerificationResult {
  passed: boolean;
  latencyMs: number;
  expectedRangeMs: [number, number];
  anomalyScore: number; // 0-1, higher = more suspicious
  details?: string | undefined;
}

export interface VerificationResult {
  passed: boolean;
  token?: TokenVerificationResult | undefined;
  challenge?: ChallengeVerificationResult | undefined;
  timing?: TimingVerificationResult | undefined;
  overallConfidence: number; // 0-1, higher = more confident in validity
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Sample rate for challenge verification (expensive, so sampled) */
const CHALLENGE_SAMPLE_RATE = 0.1; // 10% of requests

/** Expected latency range for external workers (ms) */
const EXPECTED_LATENCY_RANGE: [number, number] = [200, 30000];

/** Suspicious latency threshold - too fast indicates local caching/manipulation */
const SUSPICIOUSLY_FAST_MS = 50;

/** Token prefix for easy identification */
const VERIFICATION_TOKEN_PREFIX = 'VTKN_';

/**
 * Default expected template version.
 * The actual version is returned by the worker itself in the challenge response,
 * so this is only used as a fallback when the worker doesn't return a version.
 */
const DEFAULT_TEMPLATE_VERSION = '1.0.0';

// =============================================================================
// TOKEN GENERATION
// =============================================================================

/**
 * Generate a random verification token.
 * This token is embedded in system prompts and should pass through unmodified.
 */
export function generateVerificationToken(): string {
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  const hex = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${VERIFICATION_TOKEN_PREFIX}${hex}`;
}

/**
 * Generate a cryptographic nonce for challenge-response.
 */
export function generateChallengeNonce(): string {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  return Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compute expected challenge response.
 * This must match what the template worker computes.
 */
async function computeExpectedChallengeResponse(
  nonce: string,
  templateVersion: string
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${nonce}:${templateVersion}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

// =============================================================================
// VERIFICATION FUNCTIONS
// =============================================================================

/**
 * Check if verification token appears in response.
 * The token should pass through the AI response unmodified.
 */
export function verifyTokenInResponse(
  token: string,
  response: string
): TokenVerificationResult {
  // The token doesn't need to appear literally - modified workers might strip it.
  // Instead, we look for the pattern being preserved in some form.
  const foundInResponse = response.includes(token);

  // A legitimate worker passes prompts through unchanged.
  // Modified workers might filter or modify verification tokens.
  // Note: AI models might naturally exclude tokens from responses,
  // so this is a weak signal used in combination with other checks.

  return {
    passed: true, // Token verification is informational, not blocking
    token,
    foundInResponse,
    details: foundInResponse
      ? 'Token preserved in response (expected behavior)'
      : 'Token not in response (normal for AI outputs)',
  };
}

/**
 * Send a challenge to the external worker and verify the response.
 */
export async function verifyChallengeResponse(
  ctx: VerificationContext
): Promise<ChallengeVerificationResult> {
  const provider = new ExternalWorkerProvider({
    workerUrl: ctx.workerUrl,
    authToken: ctx.authToken,
    modelId: 'challenge-verification',
  });

  const nonce = generateChallengeNonce();
  const result = await provider.sendChallenge(nonce);

  if (!result.success) {
    return {
      passed: false,
      expectedResponse: '',
      error: result.error ?? 'Challenge request failed',
    };
  }

  // Verify the response matches expected computation
  const templateVersion = result.templateVersion ?? DEFAULT_TEMPLATE_VERSION;
  const expectedResponse = await computeExpectedChallengeResponse(
    nonce,
    templateVersion
  );

  const passed = result.response === expectedResponse;

  return {
    passed,
    expectedResponse,
    actualResponse: result.response,
    templateVersion,
    error: passed ? undefined : 'Challenge response mismatch - possible code modification',
  };
}

/**
 * Analyze response timing for anomalies.
 */
export function verifyTiming(latencyMs: number): TimingVerificationResult {
  const [minExpected, maxExpected] = EXPECTED_LATENCY_RANGE;

  // Calculate anomaly score
  let anomalyScore = 0;

  if (latencyMs < SUSPICIOUSLY_FAST_MS) {
    // Suspiciously fast - possible cached/pre-computed response
    anomalyScore = 1.0;
  } else if (latencyMs < minExpected) {
    // Faster than expected but not impossibly so
    anomalyScore = 0.5 * (1 - latencyMs / minExpected);
  } else if (latencyMs > maxExpected) {
    // Slower than expected - might be legitimate network issues
    anomalyScore = Math.min(0.3, (latencyMs - maxExpected) / maxExpected);
  }

  const passed = anomalyScore < 0.5;

  let details: string | undefined;
  if (latencyMs < SUSPICIOUSLY_FAST_MS) {
    details = `Suspiciously fast response (${latencyMs}ms) - possible caching`;
  } else if (latencyMs < minExpected) {
    details = `Faster than expected (${latencyMs}ms)`;
  } else if (latencyMs > maxExpected) {
    details = `Slower than expected (${latencyMs}ms)`;
  }

  return {
    passed,
    latencyMs,
    expectedRangeMs: EXPECTED_LATENCY_RANGE,
    anomalyScore,
    details,
  };
}

// =============================================================================
// MAIN VERIFICATION SERVICE
// =============================================================================

/**
 * VerificationService handles all verification logic for external workers.
 */
export class VerificationService {
  private readonly env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * Run verification checks for an external worker request.
   *
   * @param ctx Verification context
   * @param responseContent The AI response content
   * @param latencyMs Response latency in milliseconds
   * @param verificationToken Token that was embedded in the prompt
   * @returns Verification result with pass/fail and confidence score
   */
  async verify(
    ctx: VerificationContext,
    responseContent: string,
    latencyMs: number,
    verificationToken?: string | undefined
  ): Promise<VerificationResult> {
    const results: VerificationResult = {
      passed: true,
      overallConfidence: 1.0,
    };

    // 1. Token verification (if token was embedded)
    if (verificationToken) {
      results.token = verifyTokenInResponse(verificationToken, responseContent);
    }

    // 2. Timing verification (always)
    results.timing = verifyTiming(latencyMs);
    if (!results.timing.passed) {
      results.passed = false;
      results.overallConfidence *= 0.5;
    }

    // 3. Challenge verification (sampled)
    const shouldChallenge = Math.random() < CHALLENGE_SAMPLE_RATE;
    if (shouldChallenge) {
      results.challenge = await verifyChallengeResponse(ctx);
      if (!results.challenge.passed) {
        results.passed = false;
        results.overallConfidence *= 0.1; // Major red flag
      }
    }

    // Log verification result
    await this.logVerification(ctx, results, latencyMs);

    return results;
  }

  /**
   * Log verification result to the database.
   */
  private async logVerification(
    ctx: VerificationContext,
    result: VerificationResult,
    latencyMs: number
  ): Promise<void> {
    // Log timing verification
    if (result.timing) {
      await this.logVerificationEntry(ctx, 'timing', result.timing.passed, {
        latencyMs: result.timing.latencyMs,
        expectedRange: result.timing.expectedRangeMs,
        anomalyScore: result.timing.anomalyScore,
        details: result.timing.details,
      }, latencyMs);
    }

    // Log challenge verification
    if (result.challenge) {
      await this.logVerificationEntry(ctx, 'challenge', result.challenge.passed, {
        templateVersion: result.challenge.templateVersion,
        error: result.challenge.error,
      }, latencyMs);
    }

    // Log token verification
    if (result.token) {
      await this.logVerificationEntry(ctx, 'token', result.token.passed, {
        foundInResponse: result.token.foundInResponse,
        details: result.token.details,
      }, latencyMs);
    }

    // Update user reputation based on result
    await this.updateReputation(ctx.userId, result.passed);
  }

  /**
   * Insert a verification log entry.
   */
  private async logVerificationEntry(
    ctx: VerificationContext,
    verificationType: 'token' | 'challenge' | 'timing' | 'behavioral',
    passed: boolean,
    details: Record<string, unknown>,
    latencyMs: number
  ): Promise<void> {
    try {
      await this.env.DB.prepare(
        `INSERT INTO verification_log (game_id, user_id, verification_type, passed, details, latency_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          ctx.gameId,
          ctx.userId,
          verificationType,
          passed ? 1 : 0,
          JSON.stringify(details),
          latencyMs,
          Date.now()
        )
        .run();
    } catch (error) {
      console.error('Failed to log verification:', error);
    }
  }

  /**
   * Update user reputation based on verification result.
   */
  private async updateReputation(
    userId: string,
    passed: boolean
  ): Promise<void> {
    const now = Date.now();

    try {
      // Upsert user reputation
      if (passed) {
        await this.env.DB.prepare(
          `INSERT INTO user_reputation (user_id, verification_passes, last_verification_at, created_at, updated_at)
           VALUES (?, 1, ?, ?, ?)
           ON CONFLICT (user_id) DO UPDATE SET
             verification_passes = verification_passes + 1,
             last_verification_at = excluded.last_verification_at,
             updated_at = excluded.updated_at`
        )
          .bind(userId, now, now, now)
          .run();
      } else {
        await this.env.DB.prepare(
          `INSERT INTO user_reputation (user_id, verification_failures, trust_score, last_verification_at, created_at, updated_at)
           VALUES (?, 1, 0.3, ?, ?, ?)
           ON CONFLICT (user_id) DO UPDATE SET
             verification_failures = verification_failures + 1,
             trust_score = MAX(0.1, trust_score - 0.1),
             last_verification_at = excluded.last_verification_at,
             updated_at = excluded.updated_at`
        )
          .bind(userId, now, now, now)
          .run();
      }
    } catch (error) {
      console.error('Failed to update reputation:', error);
    }
  }

  /**
   * Get user's current trust score.
   */
  async getTrustScore(userId: string): Promise<number> {
    try {
      const result = await this.env.DB.prepare(
        `SELECT trust_score FROM user_reputation WHERE user_id = ?`
      )
        .bind(userId)
        .first<{ trust_score: number }>();

      return result?.trust_score ?? 0.5; // Default trust score
    } catch {
      return 0.5;
    }
  }

  /**
   * Check if a user has sufficient trust to participate.
   */
  async hasMinimumTrust(userId: string, minimumScore: number = 0.2): Promise<boolean> {
    const score = await this.getTrustScore(userId);
    return score >= minimumScore;
  }

  /**
   * Get verification statistics for a user.
   */
  async getVerificationStats(userId: string): Promise<{
    trustScore: number;
    totalGames: number;
    verificationPasses: number;
    verificationFailures: number;
    lastVerification: number | null;
  }> {
    try {
      const result = await this.env.DB.prepare(
        `SELECT trust_score, total_games_played, verification_passes,
                verification_failures, last_verification_at
         FROM user_reputation WHERE user_id = ?`
      )
        .bind(userId)
        .first<{
          trust_score: number;
          total_games_played: number;
          verification_passes: number;
          verification_failures: number;
          last_verification_at: number | null;
        }>();

      if (!result) {
        return {
          trustScore: 0.5,
          totalGames: 0,
          verificationPasses: 0,
          verificationFailures: 0,
          lastVerification: null,
        };
      }

      return {
        trustScore: result.trust_score,
        totalGames: result.total_games_played,
        verificationPasses: result.verification_passes,
        verificationFailures: result.verification_failures,
        lastVerification: result.last_verification_at,
      };
    } catch {
      return {
        trustScore: 0.5,
        totalGames: 0,
        verificationPasses: 0,
        verificationFailures: 0,
        lastVerification: null,
      };
    }
  }
}

/**
 * Create a verification service instance.
 */
export function createVerificationService(env: Env): VerificationService {
  return new VerificationService(env);
}
