/**
 * Summarization Service for context window management.
 * 
 * Generates, stores, and retrieves summaries of game history
 * when conversation exceeds model context limits.
 */

import type { Env } from '../types.js';
import type { AIProviderInterface, CompletionResponse } from './types.js';
import type { ConversationMessage, VoteRecord, GameLogEntry } from '../../engine/types.js';
import { countTokens } from '../../engine/utils/tokens.js';
import { getModelContextLimit, getSummarizationThreshold, getSafePromptLimit } from './contextLimits.js';

/**
 * Summary record from the database.
 */
export interface GameSummary {
  id: string;
  gameId: string;
  modelId: string;
  roundStart: number;
  roundEnd: number;
  summaryType: 'conversation' | 'votes' | 'full';
  summaryText: string;
  tokenCount: number;
  createdAt: number;
}

/**
 * Result of checking if summarization is needed.
 */
export interface SummarizationCheck {
  needed: boolean;
  currentTokens: number;
  contextLimit: number;
  threshold: number;
  safeLimit: number;
}

/**
 * Result of building context with potential summarization.
 */
export interface ContextBuildResult {
  context: string;
  summarized: boolean;
  summaryRounds?: [number, number];
  tokenCount: number;
  tokensSaved?: number;
}

/**
 * System prompt for generating summaries.
 */
const SUMMARY_SYSTEM_PROMPT = `You are a concise summarizer for a Mafia game. 
Your task is to compress game history while preserving strategically important information.

Rules:
- Be extremely concise (target 15-20% of original length)
- Preserve: accusations, defenses, voting patterns, alliances, suspicious behavior
- Include: who eliminated whom, what their teams were
- Skip: casual chat, greetings, filler content
- Use bullet points for clarity
- Do NOT add analysis or speculation - just summarize what happened`;

/**
 * User prompt template for generating summaries.
 */
function buildSummaryPrompt(
  messages: readonly ConversationMessage[],
  votes: readonly VoteRecord[],
  logs: readonly GameLogEntry[],
  roundStart: number,
  roundEnd: number
): string {
  const parts: string[] = [];
  
  parts.push(`Summarize the Mafia game history from Round ${roundStart} to Round ${roundEnd}.`);
  parts.push('');
  parts.push('=== CONVERSATION HISTORY ===');
  
  // Group messages by round
  for (let round = roundStart; round <= roundEnd; round++) {
    const roundMessages = messages.filter(m => m.round === round);
    if (roundMessages.length > 0) {
      parts.push(`\n--- Round ${round} ---`);
      for (const msg of roundMessages) {
        parts.push(`${msg.playerName}: "${msg.message}"`);
      }
    }
  }
  
  // Add vote history
  const roundVotes = votes.filter(v => v.round >= roundStart && v.round <= roundEnd);
  if (roundVotes.length > 0) {
    parts.push('');
    parts.push('=== VOTES ===');
    for (const vote of roundVotes) {
      const target = vote.targetName ?? 'ABSTAIN';
      const team = vote.voterTeam ? ` [${vote.voterTeam}]` : '';
      parts.push(`${vote.voterName}${team} → ${target} (Round ${vote.round}, ${vote.phase})`);
    }
  }
  
  // Add elimination events
  const roundLogs = logs.filter(l => l.round >= roundStart && l.round <= roundEnd);
  if (roundLogs.length > 0) {
    parts.push('');
    parts.push('=== KEY EVENTS ===');
    for (const log of roundLogs) {
      const team = log.playerTeam ? ` [${log.playerTeam.toUpperCase()}]` : '';
      parts.push(`Round ${log.round}: ${log.event}${team}`);
    }
  }
  
  parts.push('');
  parts.push('Provide a concise summary preserving strategic information:');
  
  return parts.join('\n');
}

/**
 * Generate a unique summary ID.
 */
function generateSummaryId(
  gameId: string,
  modelId: string,
  roundStart: number,
  roundEnd: number,
  summaryType: string
): string {
  // Create a deterministic ID so we can check for existing summaries
  const sanitizedModel = modelId.replace(/[^a-zA-Z0-9]/g, '_');
  return `${gameId}_${sanitizedModel}_r${roundStart}-${roundEnd}_${summaryType}`;
}

/**
 * Summarization Service class.
 */
export class SummarizationService {
  constructor(
    private readonly env: Env,
    private readonly providers: Map<string, AIProviderInterface>
  ) {}

  /**
   * Check if summarization is needed for a model given current context.
   */
  async checkSummarizationNeeded(
    modelId: string,
    currentContext: string
  ): Promise<SummarizationCheck> {
    const contextLimit = await getModelContextLimit(modelId, this.env);
    const threshold = getSummarizationThreshold(contextLimit);
    const safeLimit = getSafePromptLimit(contextLimit);
    const currentTokens = countTokens(currentContext);
    
    return {
      needed: currentTokens > (contextLimit * threshold),
      currentTokens,
      contextLimit,
      threshold,
      safeLimit,
    };
  }

  /**
   * Get an existing summary from the database.
   */
  async getExistingSummary(
    gameId: string,
    modelId: string,
    roundEnd: number
  ): Promise<GameSummary | null> {
    try {
      const result = await this.env.DB.prepare(`
        SELECT id, game_id, model_id, round_start, round_end, summary_type, summary_text, token_count, created_at
        FROM game_summaries
        WHERE game_id = ? AND model_id = ? AND round_end <= ?
        ORDER BY round_end DESC
        LIMIT 1
      `).bind(gameId, modelId, roundEnd).first<{
        id: string;
        game_id: string;
        model_id: string;
        round_start: number;
        round_end: number;
        summary_type: string;
        summary_text: string;
        token_count: number;
        created_at: number;
      }>();

      if (!result) return null;

      return {
        id: result.id,
        gameId: result.game_id,
        modelId: result.model_id,
        roundStart: result.round_start,
        roundEnd: result.round_end,
        summaryType: result.summary_type as 'conversation' | 'votes' | 'full',
        summaryText: result.summary_text,
        tokenCount: result.token_count,
        createdAt: result.created_at,
      };
    } catch (error) {
      console.error('Failed to get existing summary:', error);
      return null;
    }
  }

  /**
   * Generate a new summary using the model.
   */
  async generateSummary(
    gameId: string,
    modelId: string,
    messages: readonly ConversationMessage[],
    votes: readonly VoteRecord[],
    logs: readonly GameLogEntry[],
    roundStart: number,
    roundEnd: number
  ): Promise<GameSummary | null> {
    const provider = this.providers.get(modelId);
    if (!provider) {
      console.error(`No provider found for model ${modelId}`);
      return null;
    }

    try {
      const userPrompt = buildSummaryPrompt(messages, votes, logs, roundStart, roundEnd);
      
      const response: CompletionResponse = await provider.complete({
        systemPrompt: SUMMARY_SYSTEM_PROMPT,
        userPrompt,
        temperature: 0.3, // Lower temperature for more consistent summaries
        maxTokens: 2000, // Summaries should be concise
      });

      const summaryText = response.content.trim();
      const tokenCount = countTokens(summaryText);
      const summaryId = generateSummaryId(gameId, modelId, roundStart, roundEnd, 'full');

      const summary: GameSummary = {
        id: summaryId,
        gameId,
        modelId,
        roundStart,
        roundEnd,
        summaryType: 'full',
        summaryText,
        tokenCount,
        createdAt: Date.now(),
      };

      // Store in database
      await this.storeSummary(summary);

      return summary;
    } catch (error) {
      console.error(`Failed to generate summary for ${modelId}:`, error);
      return null;
    }
  }

  /**
   * Store a summary in the database.
   */
  private async storeSummary(summary: GameSummary): Promise<void> {
    try {
      await this.env.DB.prepare(`
        INSERT INTO game_summaries (id, game_id, model_id, round_start, round_end, summary_type, summary_text, token_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET
          summary_text = excluded.summary_text,
          token_count = excluded.token_count,
          created_at = excluded.created_at
      `).bind(
        summary.id,
        summary.gameId,
        summary.modelId,
        summary.roundStart,
        summary.roundEnd,
        summary.summaryType,
        summary.summaryText,
        summary.tokenCount,
        summary.createdAt
      ).run();
    } catch (error) {
      console.error('Failed to store summary:', error);
      throw error;
    }
  }

  /**
   * Build context with automatic summarization if needed.
   * 
   * This is the main entry point for getting game history context.
   * It checks token limits and automatically summarizes older rounds if needed.
   */
  async buildContextWithSummarization(
    gameId: string,
    modelId: string,
    currentRound: number,
    messages: readonly ConversationMessage[],
    votes: readonly VoteRecord[],
    logs: readonly GameLogEntry[],
    formatFullHistory: (
      messages: readonly ConversationMessage[],
      votes: readonly VoteRecord[],
      logs: readonly GameLogEntry[],
      currentRound: number
    ) => string
  ): Promise<ContextBuildResult> {
    // First, try building full context
    const fullContext = formatFullHistory(messages, votes, logs, currentRound);
    const check = await this.checkSummarizationNeeded(modelId, fullContext);

    if (!check.needed) {
      // Full context fits, no summarization needed
      return {
        context: fullContext,
        summarized: false,
        tokenCount: check.currentTokens,
      };
    }

    // Need to summarize - determine what rounds to summarize
    const summarizeUpToRound = Math.max(1, currentRound - 2); // Keep last 2 rounds verbatim
    
    // Check for existing summary
    let summary = await this.getExistingSummary(gameId, modelId, summarizeUpToRound);
    
    // Generate new summary if needed (if no summary exists or it's outdated)
    if (!summary || summary.roundEnd < summarizeUpToRound) {
      const roundStart = summary ? summary.roundEnd + 1 : 1;
      const messagesForSummary = messages.filter(m => m.round >= roundStart && m.round <= summarizeUpToRound);
      const votesForSummary = votes.filter(v => v.round >= roundStart && v.round <= summarizeUpToRound);
      const logsForSummary = logs.filter(l => l.round >= roundStart && l.round <= summarizeUpToRound);
      
      if (messagesForSummary.length > 0 || votesForSummary.length > 0) {
        const newSummary = await this.generateSummary(
          gameId,
          modelId,
          messagesForSummary,
          votesForSummary,
          logsForSummary,
          roundStart,
          summarizeUpToRound
        );
        
        if (newSummary) {
          // If we had an old summary, combine them
          if (summary) {
            summary = {
              ...newSummary,
              roundStart: summary.roundStart,
              summaryText: `${summary.summaryText}\n\n${newSummary.summaryText}`,
              tokenCount: countTokens(`${summary.summaryText}\n\n${newSummary.summaryText}`),
            };
          } else {
            summary = newSummary;
          }
        }
      }
    }

    // Build context with summary + recent rounds
    if (summary) {
      const recentMessages = messages.filter(m => m.round > summarizeUpToRound);
      const recentVotes = votes.filter(v => v.round > summarizeUpToRound);
      const recentLogs = logs.filter(l => l.round > summarizeUpToRound);
      
      const recentContext = formatFullHistory(recentMessages, recentVotes, recentLogs, currentRound);
      
      const combinedContext = `═══════════════════════════════════════════════════════════════
                  SUMMARY OF ROUNDS ${summary.roundStart}-${summary.roundEnd}
═══════════════════════════════════════════════════════════════

${summary.summaryText}

═══════════════════════════════════════════════════════════════
                  RECENT ROUNDS (VERBATIM)
═══════════════════════════════════════════════════════════════

${recentContext}`;

      const combinedTokens = countTokens(combinedContext);
      const originalTokens = check.currentTokens;

      return {
        context: combinedContext,
        summarized: true,
        summaryRounds: [summary.roundStart, summary.roundEnd],
        tokenCount: combinedTokens,
        tokensSaved: originalTokens - combinedTokens,
      };
    }

    // Fallback: if summarization failed, use windowed context (last 3 rounds)
    const windowedMessages = messages.filter(m => m.round > currentRound - 3);
    const windowedVotes = votes.filter(v => v.round > currentRound - 3);
    const windowedLogs = logs.filter(l => l.round > currentRound - 3);
    
    const windowedContext = formatFullHistory(windowedMessages, windowedVotes, windowedLogs, currentRound);
    const windowedTokens = countTokens(windowedContext);

    return {
      context: windowedContext,
      summarized: false, // Windowed, not summarized
      tokenCount: windowedTokens,
    };
  }
}

/**
 * Create a summarization service instance.
 */
export function createSummarizationService(
  env: Env,
  providers: Map<string, AIProviderInterface>
): SummarizationService {
  return new SummarizationService(env, providers);
}

