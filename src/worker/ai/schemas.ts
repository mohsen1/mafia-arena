/**
 * Zod schemas for AI action response validation.
 * These schemas enforce the expected structure of AI responses.
 */

import { z } from 'zod';

/**
 * Schema for persona generation response.
 */
export const PersonaSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50, 'Name too long'),
  background: z.string().min(1, 'Background is required').max(500, 'Background too long'),
  personality: z.string().min(1, 'Personality is required').max(500, 'Personality too long'),
  occupation: z.string().max(100).optional(),
});

export type PersonaInput = z.infer<typeof PersonaSchema>;

/**
 * Schema for introduction message response.
 */
export const IntroductionSchema = z.object({
  message: z.string().min(1, 'Message is required').max(1000, 'Message too long'),
});

export type IntroductionInput = z.infer<typeof IntroductionSchema>;

/**
 * Schema for kill vote response (night phase).
 * Accepts either 'target' or 'vote' field.
 */
export const KillVoteSchema = z.object({
  target: z.string().min(1).optional(),
  vote: z.string().min(1).optional(),
}).refine(
  (data) => data.target || data.vote,
  { message: 'Either target or vote field is required' }
);

export type KillVoteInput = z.infer<typeof KillVoteSchema>;

/**
 * Schema for discussion message response.
 */
export const DiscussionSchema = z.object({
  message: z.string().min(1, 'Message is required').max(2000, 'Message too long'),
});

export type DiscussionInput = z.infer<typeof DiscussionSchema>;

/**
 * Schema for mafia discussion message response.
 */
export const MafiaDiscussionSchema = z.object({
  message: z.string().min(1, 'Message is required').max(2000, 'Message too long'),
});

export type MafiaDiscussionInput = z.infer<typeof MafiaDiscussionSchema>;

/**
 * Schema for elimination vote response.
 * Allows null/empty for abstention.
 */
export const EliminationVoteSchema = z.object({
  vote: z.union([z.string(), z.null()]).optional(),
  target: z.string().optional(),
});

export type EliminationVoteInput = z.infer<typeof EliminationVoteSchema>;

/**
 * Get the appropriate schema for an action type.
 */
export function getActionSchema(actionType: string): z.ZodSchema {
  switch (actionType) {
    case 'persona_generation':
      return PersonaSchema;
    case 'introduction':
      return IntroductionSchema;
    case 'kill_vote':
      return KillVoteSchema;
    case 'discussion':
      return DiscussionSchema;
    case 'mafia_discussion':
      return MafiaDiscussionSchema;
    case 'elimination_vote':
      return EliminationVoteSchema;
    default:
      throw new Error(`Unknown action type: ${actionType}`);
  }
}

