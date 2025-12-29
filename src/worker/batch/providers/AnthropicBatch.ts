/**
 * Anthropic Message Batches API provider.
 * 
 * 50% discount on all models (Claude Opus 4.5, Sonnet 4, Haiku 3.5)
 * 
 * API Documentation:
 * - Create batch: POST /v1/messages/batches
 * - Get status: GET /v1/messages/batches/{batch_id}
 * - Get results: GET /v1/messages/batches/{batch_id}/results
 * - Cancel: POST /v1/messages/batches/{batch_id}/cancel
 * 
 * Key details:
 * - Batches take up to 24 hours to complete
 * - Results are returned as JSONL stream
 * - Each request needs a custom_id for correlation
 */

import type { Env } from '../../types.js';
import type { CompletionRequest, CompletionResponse } from '../../ai/types.js';
import type { BatchRequest, BatchRequestResult, BatchJobStatus } from '../types.js';
import { BaseBatchProvider } from './BaseBatchProvider.js';

/** Anthropic API base URL */
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1';

/** Anthropic API version header */
const ANTHROPIC_VERSION = '2023-06-01';

/** Beta header for batches feature */
const ANTHROPIC_BETA = 'message-batches-2024-09-24';

/**
 * Anthropic batch request format.
 */
interface AnthropicBatchRequest {
  custom_id: string;
  params: {
    model: string;
    max_tokens: number;
    messages: Array<{
      role: 'user' | 'assistant';
      content: string;
    }>;
    system?: string;
    temperature?: number;
  };
}

/**
 * Anthropic batch response format.
 */
interface AnthropicMessageBatch {
  id: string;
  type: 'message_batch';
  processing_status: 'in_progress' | 'canceling' | 'ended';
  request_counts: {
    processing: number;
    succeeded: number;
    errored: number;
    canceled: number;
    expired: number;
  };
  ended_at: string | null;
  created_at: string;
  expires_at: string;
  cancel_initiated_at: string | null;
  results_url: string | null;
}

/**
 * Anthropic batch result item format.
 */
interface AnthropicBatchResultItem {
  custom_id: string;
  result: {
    type: 'succeeded' | 'errored' | 'expired' | 'canceled';
    message?: {
      id: string;
      type: 'message';
      role: 'assistant';
      content: Array<
        | { type: 'text'; text: string }
        | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
      >;
      model: string;
      stop_reason: string;
      usage: {
        input_tokens: number;
        output_tokens: number;
      };
    };
    error?: {
      type: string;
      message: string;
    };
  };
}

/**
 * Anthropic Message Batches API provider implementation.
 */
export class AnthropicBatch extends BaseBatchProvider {
  /**
   * Create an Anthropic batch provider.
   * @param env - Worker environment bindings
   * @param _defaultModelId - Default model ID (unused - model ID comes from each request)
   */
  constructor(env: Env, _defaultModelId: string) {
    super('anthropic', env, 'ANTHROPIC_API_KEY');
  }

  /**
   * Get Anthropic-specific headers.
   */
  protected override getAuthHeaders(): Record<string, string> {
    return {
      'x-api-key': this.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-beta': ANTHROPIC_BETA,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Create and submit a batch to Anthropic.
   * 
   * Note: Anthropic's batch API doesn't support custom metadata, so the
   * internalJobId is stored in our returned metadata but not sent to Anthropic.
   * 
   * @param requests - Array of requests to batch together
   * @param options - Optional configuration (internalJobId tracked locally, not sent to Anthropic)
   */
  async createBatch(requests: BatchRequest[], options?: {
    internalJobId?: string;
  }): Promise<{
    providerJobId: string;
    inputResourceId?: string;
    metadata?: Record<string, unknown>;
  }> {
    this.log.info('Creating Anthropic batch', { 
      requestCount: requests.length,
      internalJobId: options?.internalJobId,
    });

    // Format requests for Anthropic API
    const anthropicRequests = requests.map(req => 
      this.formatRequest(req.request, req.customId, req.modelId) as AnthropicBatchRequest
    );

    const response = await this.httpRequest<AnthropicMessageBatch>(
      `${ANTHROPIC_API_URL}/messages/batches`,
      {
        method: 'POST',
        body: JSON.stringify({ requests: anthropicRequests }),
      }
    );

    this.log.info('Anthropic batch created', {
      batchId: response.id,
      status: response.processing_status,
      expiresAt: response.expires_at,
      internalJobId: options?.internalJobId,
    });

    return {
      providerJobId: response.id,
      metadata: {
        created_at: response.created_at,
        expires_at: response.expires_at,
        // Track internally even though Anthropic doesn't support metadata
        mafia_arena_job_id: options?.internalJobId,
      },
    };
  }

  /**
   * Check the status of an Anthropic batch.
   */
  async checkStatus(providerJobId: string): Promise<{
    status: BatchJobStatus;
    completedCount?: number;
    failedCount?: number;
    outputResourceId?: string;
    error?: string;
  }> {
    const response = await this.httpRequest<AnthropicMessageBatch>(
      `${ANTHROPIC_API_URL}/messages/batches/${providerJobId}`,
      { method: 'GET' }
    );

    const counts = response.request_counts;
    const completedCount = counts.succeeded;
    const failedCount = counts.errored + counts.canceled + counts.expired;

    // Map Anthropic status to our status
    let status: BatchJobStatus;
    if (response.processing_status === 'ended') {
      if (failedCount > 0 && completedCount === 0) {
        status = 'failed';
      } else {
        status = 'completed';
      }
    } else if (response.processing_status === 'canceling') {
      status = 'cancelled';
    } else {
      status = 'processing';
    }

    const result: {
      status: BatchJobStatus;
      completedCount?: number;
      failedCount?: number;
      outputResourceId?: string;
      error?: string;
    } = {
      status,
      completedCount,
      failedCount,
    };
    
    if (response.results_url) {
      result.outputResourceId = response.results_url;
    }
    
    return result;
  }

  /**
   * Retrieve results for a completed Anthropic batch.
   */
  async getResults(providerJobId: string, _outputResourceId?: string): Promise<BatchRequestResult[]> {
    // Anthropic returns results as JSONL stream
    const url = `${ANTHROPIC_API_URL}/messages/batches/${providerJobId}/results`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get batch results: ${response.status} ${errorText}`);
    }

    // Parse JSONL response
    const text = await response.text();
    const resultItems = this.parseJsonl<AnthropicBatchResultItem>(text);

    return resultItems.map(item => {
      if (item.result.type === 'succeeded' && item.result.message) {
        const message = item.result.message;

        return {
          customId: item.custom_id,
          success: true,
          // Pass full message content to parseResponse (handles tool_use)
          response: this.parseResponse({
            content: message.content,
            usage: message.usage,
            model: message.model,
          }),
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
        };
      } else {
        return {
          customId: item.custom_id,
          success: false,
          error: {
            code: item.result.type,
            message: item.result.error?.message ?? `Request ${item.result.type}`,
          },
        };
      }
    });
  }

  /**
   * Cancel an Anthropic batch.
   */
  async cancelBatch(providerJobId: string): Promise<void> {
    await this.httpRequest<AnthropicMessageBatch>(
      `${ANTHROPIC_API_URL}/messages/batches/${providerJobId}/cancel`,
      { method: 'POST' }
    );
    this.log.info('Anthropic batch cancelled', { batchId: providerJobId });
  }

  /**
   * Format a completion request for Anthropic batch API.
   * 
   * CRITICAL: Must include tools/tool_choice when structuredOutput is specified,
   * otherwise the batch will not produce JSON responses needed for game actions.
   * 
   * @param request - The completion request
   * @param customId - Unique identifier for correlation
   * @param modelId - The model ID from the original request (e.g., 'anthropic/claude-3-5-sonnet')
   */
  formatRequest(request: CompletionRequest, customId: string, modelId: string): unknown {
    // Extract model name (remove provider prefix if present)
    let model = modelId;
    if (model.startsWith('anthropic/')) {
      model = model.slice('anthropic/'.length);
    }

    const params: Record<string, unknown> = {
      model,
      max_tokens: request.maxTokens ?? 4096,
      messages: [
        {
          role: 'user',
          content: request.userPrompt,
        },
      ],
      system: request.systemPrompt,
      temperature: request.temperature ?? 0.7,
    };

    // Add tools for structured output (critical for game actions)
    if (request.structuredOutput) {
      params.tools = [{
        name: request.structuredOutput.name,
        description: 'Provide your response using this structure.',
        input_schema: {
          type: 'object',
          properties: request.structuredOutput.schema.properties,
          required: request.structuredOutput.schema.required,
        },
      }];
      params.tool_choice = { type: 'tool', name: request.structuredOutput.name };
    }

    return {
      custom_id: customId,
      params,
    };
  }

  /**
   * Parse Anthropic response into CompletionResponse format.
   * 
   * Handles both text responses and tool_use responses (for structured output).
   * @param providerResponse - Raw response from Anthropic
   * @param _modelId - Model ID (unused - Anthropic includes model in response)
   */
  parseResponse(providerResponse: unknown, _modelId?: string): CompletionResponse {
    const response = providerResponse as {
      content: string | Array<{ type: string; text?: string; input?: Record<string, unknown> }>;
      usage: { input_tokens: number; output_tokens: number };
      model: string;
    };

    let content: string;
    
    // Handle content array format (tool_use or text blocks)
    if (Array.isArray(response.content)) {
      // Check for tool use content first (structured output)
      const toolUse = response.content.find(c => c.type === 'tool_use');
      if (toolUse && toolUse.input) {
        content = JSON.stringify(toolUse.input);
      } else {
        // Fallback to text content
        content = response.content
          .filter(c => c.type === 'text')
          .map(c => c.text ?? '')
          .join('');
      }
    } else {
      // Simple string content
      content = response.content;
    }

    return {
      content,
      tokensUsed: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        total: response.usage.input_tokens + response.usage.output_tokens,
      },
      latencyMs: 0, // Not available for batch responses
      modelId: response.model,
    };
  }

  /**
   * Calculate cost for Anthropic batch pricing.
   * 50% discount from standard pricing.
   */
  protected override calculateCost(inputTokens: number, outputTokens: number): number {
    // Anthropic batch pricing (50% off standard)
    // These are approximate - actual pricing depends on the specific model
    // Claude 3.5 Sonnet batch pricing: $1.50/MTok input, $7.50/MTok output
    // Claude 3.5 Haiku batch pricing: $0.40/MTok input, $2.00/MTok output
    const inputPricePerMillion = 1.5;  // Default to Sonnet batch pricing
    const outputPricePerMillion = 7.5;
    
    return (
      (inputTokens / 1_000_000) * inputPricePerMillion +
      (outputTokens / 1_000_000) * outputPricePerMillion
    );
  }
}

