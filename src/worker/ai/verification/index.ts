/**
 * Verification module for external worker integrity.
 */

export {
  VerificationService,
  createVerificationService,
  generateVerificationToken,
  generateChallengeNonce,
  verifyTokenInResponse,
  verifyChallengeResponse,
  verifyTiming,
} from './VerificationService.js';

export type {
  VerificationContext,
  TokenVerificationResult,
  ChallengeVerificationResult,
  TimingVerificationResult,
  VerificationResult,
} from './VerificationService.js';
