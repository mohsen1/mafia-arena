/**
 * Token counting utilities for context window management.
 * 
 * Uses js-tiktoken for accurate token counting compatible with edge runtime.
 * Falls back to character-based estimation if tokenizer unavailable.
 */

import { getEncoding, type Tiktoken } from 'js-tiktoken';

/**
 * Cached tokenizer instance (cl100k_base - used by GPT-4, GPT-3.5-turbo, Claude, etc.)
 * Most modern LLMs use similar BPE tokenization, so this is a good default.
 */
let cachedEncoder: Tiktoken | null = null;

/**
 * Get or create the tokenizer encoder.
 * Uses cl100k_base encoding which is standard for most modern LLMs.
 */
function getEncoder(): Tiktoken {
  if (!cachedEncoder) {
    cachedEncoder = getEncoding('cl100k_base');
  }
  return cachedEncoder;
}

/**
 * Fallback estimation when tokenizer is unavailable.
 * Conservative estimate: ~4 chars per token.
 */
const FALLBACK_CHARS_PER_TOKEN = 4;

/**
 * Overhead tokens for message formatting, JSON structure, etc.
 */
const MESSAGE_OVERHEAD_TOKENS = 10;

/**
 * Count tokens in text using tiktoken.
 * 
 * @param text - The text to count tokens for
 * @returns Token count
 */
export function countTokens(text: string): number {
  if (!text) return 0;
  
  try {
    const encoder = getEncoder();
    return encoder.encode(text).length;
  } catch {
    // Fallback to estimation if tokenizer fails
    return Math.ceil(text.length / FALLBACK_CHARS_PER_TOKEN);
  }
}

/**
 * Estimate token count from text (alias for countTokens for backwards compatibility).
 * 
 * @param text - The text to estimate tokens for
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
  return countTokens(text);
}

/**
 * Count total tokens for a prompt (system + user message).
 * Includes overhead for message formatting.
 * 
 * @param systemPrompt - The system prompt text
 * @param userPrompt - The user prompt text
 * @returns Total token count
 */
export function countPromptTokens(systemPrompt: string, userPrompt: string): number {
  const systemTokens = countTokens(systemPrompt);
  const userTokens = countTokens(userPrompt);
  
  // Add overhead for message structure and potential JSON formatting
  const overhead = MESSAGE_OVERHEAD_TOKENS * 2; // system + user messages
  
  return systemTokens + userTokens + overhead;
}

/**
 * Estimate total tokens for a prompt (alias for countPromptTokens).
 * 
 * @param systemPrompt - The system prompt text
 * @param userPrompt - The user prompt text
 * @returns Estimated total token count
 */
export function estimatePromptTokens(systemPrompt: string, userPrompt: string): number {
  return countPromptTokens(systemPrompt, userPrompt);
}

/**
 * Check if a prompt would exceed a model's context limit.
 * Uses 80% threshold to leave room for response.
 * 
 * @param systemPrompt - The system prompt text
 * @param userPrompt - The user prompt text
 * @param contextLimit - The model's context window size in tokens
 * @param threshold - Percentage of context to use (default 0.8 = 80%)
 * @returns Object with exceeds flag and token details
 */
export function checkContextLimit(
  systemPrompt: string,
  userPrompt: string,
  contextLimit: number,
  threshold = 0.8
): {
  exceeds: boolean;
  tokenCount: number;
  allowedTokens: number;
  percentUsed: number;
} {
  const tokenCount = countPromptTokens(systemPrompt, userPrompt);
  const allowedTokens = Math.floor(contextLimit * threshold);
  const percentUsed = (tokenCount / contextLimit) * 100;
  
  return {
    exceeds: tokenCount > allowedTokens,
    tokenCount,
    allowedTokens,
    percentUsed: Math.round(percentUsed * 10) / 10, // Round to 1 decimal
  };
}

/**
 * Calculate how many tokens need to be saved to fit within context limit.
 * 
 * @param currentTokens - Current token count
 * @param contextLimit - The model's context window size
 * @param threshold - Target percentage of context to use (default 0.7 for summarization)
 * @returns Number of tokens to save, or 0 if within limits
 */
export function tokensToSave(
  currentTokens: number,
  contextLimit: number,
  threshold = 0.7
): number {
  const targetTokens = Math.floor(contextLimit * threshold);
  const excess = currentTokens - targetTokens;
  return Math.max(0, excess);
}

/**
 * Estimate tokens saved by summarizing text.
 * Summaries are typically 10-20% of original text.
 * 
 * @param originalText - The original text being summarized
 * @param compressionRatio - Expected compression ratio (default 0.15 = 15% of original)
 * @returns Token savings information
 */
export function estimateSummarySavings(
  originalText: string,
  compressionRatio = 0.15
): {
  originalTokens: number;
  summaryTokens: number;
  tokensSaved: number;
} {
  const originalTokens = countTokens(originalText);
  const summaryTokens = Math.ceil(originalTokens * compressionRatio);
  
  return {
    originalTokens,
    summaryTokens,
    tokensSaved: originalTokens - summaryTokens,
  };
}

/**
 * Truncate text to fit within a token limit.
 * Useful for emergency fallback when summarization fails.
 * 
 * @param text - Text to truncate
 * @param maxTokens - Maximum tokens allowed
 * @returns Truncated text
 */
export function truncateToTokenLimit(text: string, maxTokens: number): string {
  if (!text) return '';
  
  try {
    const encoder = getEncoder();
    const tokens = encoder.encode(text);
    
    if (tokens.length <= maxTokens) {
      return text;
    }
    
    // Truncate tokens and decode back to text
    const truncatedTokens = tokens.slice(0, maxTokens);
    return encoder.decode(truncatedTokens);
  } catch {
    // Fallback: estimate character position
    const estimatedChars = maxTokens * FALLBACK_CHARS_PER_TOKEN;
    return text.slice(0, estimatedChars);
  }
}
