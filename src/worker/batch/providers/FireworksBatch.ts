/**
 * Fireworks AI Batch API provider.
 * 
 * 40% discount on Fireworks models (less than other providers)
 * 
 * Note: Implementation based on expected Fireworks batch API patterns.
 * May need updates when actual API documentation is available.
 */

import type { Env } from '../../types.js';
import type { CompletionRequest, CompletionResponse } from '../../ai/types.js';
import type { BatchRequest, BatchRequestResult, BatchJobStatus } from '../types.js';
import { BaseBatchProvider } from './BaseBatchProvider.js';

/** Fireworks API base URL */
const FIREWORKS_API_URL = 'https://api.fireworks.ai/inference/v1';

/** 
 * Mapping from internal model IDs to Fireworks API model IDs.
 * Fireworks requires the full account path format: accounts/fireworks/models/<model>
 * 
 * IMPORTANT: Only models with SERVERLESS support work via API!
 * Check https://fireworks.ai/models?modelTypes=Serverless for supported models.
 * 
 * Model names verified 2025-01-01:
 * - GLM-4.5/4.6/4.7 have serverless
 * - DeepSeek R1 05/28, V3 03-24, V3.1, V3.2 have serverless (not the original deepseek-r1/deepseek-v3!)
 * - Llama 3.3 70B has serverless
 * - Qwen3 8B, 235B, Coder 480B have serverless
 */
const FIREWORKS_MODEL_MAP: Record<string, string> = {
  // GLM models (serverless)
  'fireworks/glm-4p7': 'accounts/fireworks/models/glm-4p7',
  'fireworks/glm-4p6': 'accounts/fireworks/models/glm-4p6',
  'fireworks/glm-4p5': 'accounts/fireworks/models/glm-4p5',
  
  // DeepSeek SERVERLESS models (note: original deepseek-r1/v3 do NOT have serverless!)
  'fireworks/deepseek-r1': 'accounts/fireworks/models/deepseek-r1-0528',      // Redirect to serverless version
  'fireworks/deepseek-r1-0528': 'accounts/fireworks/models/deepseek-r1-0528',
  'fireworks/deepseek-v3': 'accounts/fireworks/models/deepseek-v3p1',         // Redirect to serverless V3.1
  'fireworks/deepseek-v3-0324': 'accounts/fireworks/models/deepseek-v3-0324',
  'fireworks/deepseek-v3p1': 'accounts/fireworks/models/deepseek-v3p1',
  'fireworks/deepseek-v3p2': 'accounts/fireworks/models/deepseek-v3p2',
  
  // Qwen models (serverless)
  'fireworks/qwen3-coder-480b': 'accounts/fireworks/models/qwen3-coder-480b-a35b-instruct',
  'fireworks/qwen3-235b': 'accounts/fireworks/models/qwen3-235b-a22b',
  'fireworks/qwen3-8b': 'accounts/fireworks/models/qwen3-8b',
  
  // Llama models (serverless)
  'fireworks/llama-3.3-70b': 'accounts/fireworks/models/llama-v3p3-70b-instruct',
  'fireworks/llama-v3p3-70b-instruct': 'accounts/fireworks/models/llama-v3p3-70b-instruct',
  
  // MiniMax models (serverless)
  'fireworks/minimax-m2': 'accounts/fireworks/models/minimax-m2',
  'fireworks/minimax-m2p1': 'accounts/fireworks/models/minimax-m2p1',
  
  // Kimi K2 models (serverless)
  'fireworks/kimi-k2-instruct': 'accounts/fireworks/models/kimi-k2-instruct-0905',
  'fireworks/kimi-k2-thinking': 'accounts/fireworks/models/kimi-k2-thinking',
};

/**
 * Fireworks Batch API provider implementation.
 * 
 * Note: This is a stub implementation based on OpenAI-compatible patterns.
 * The actual Fireworks batch API may have different endpoints.
 */
export class FireworksBatch extends BaseBatchProvider {
  /**
   * Create a Fireworks batch provider.
   * @param env - Worker environment bindings
   * @param _defaultModelId - Default model ID (unused - model ID comes from each request)
   */
  constructor(env: Env, _defaultModelId: string) {
    super('fireworks', env, 'FIREWORKS_API_KEY');
  }

  async createBatch(requests: BatchRequest[], options?: {
    internalJobId?: string;
  }): Promise<{
    providerJobId: string;
    inputResourceId?: string;
    metadata?: Record<string, unknown>;
  }> {
    this.log.info('Creating Fireworks batch', { 
      requestCount: requests.length,
      internalJobId: options?.internalJobId,
    });
    
    // Fireworks uses OpenAI-compatible API format
    const jsonlContent = requests
      .map(req => JSON.stringify(this.formatRequest(req.request, req.customId, req.modelId)))
      .join('\n');

    // Upload file
    const formData = new FormData();
    formData.append('purpose', 'batch');
    formData.append('file', new Blob([jsonlContent], { type: 'application/jsonl' }), 'batch_input.jsonl');

    const fileResponse = await fetch(`${FIREWORKS_API_URL}/files`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
      body: formData,
    });

    if (!fileResponse.ok) {
      const error = await fileResponse.text();
      throw new Error(`Failed to upload file: ${error}`);
    }

    const fileData = await fileResponse.json() as { id: string };
    const inputFileId = fileData.id;

    // Create batch
    const batchResponse = await this.httpRequest<{ id: string; status: string }>(
      `${FIREWORKS_API_URL}/batches`,
      {
        method: 'POST',
        body: JSON.stringify({
          input_file_id: inputFileId,
          endpoint: '/v1/chat/completions',
          completion_window: '24h',
        }),
      }
    );

    return {
      providerJobId: batchResponse.id,
      inputResourceId: inputFileId,
    };
  }

  async checkStatus(providerJobId: string): Promise<{
    status: BatchJobStatus;
    completedCount?: number;
    failedCount?: number;
    outputResourceId?: string;
    error?: string;
  }> {
    const response = await this.httpRequest<{
      id: string;
      status: string;
      output_file_id?: string;
      request_counts?: { completed: number; failed: number };
      errors?: Array<{ message: string }>;
    }>(`${FIREWORKS_API_URL}/batches/${providerJobId}`, { method: 'GET' });

    let status: BatchJobStatus;
    switch (response.status) {
      case 'completed': status = 'completed'; break;
      case 'failed': case 'expired': status = 'failed'; break;
      case 'cancelled': status = 'cancelled'; break;
      default: status = 'processing';
    }

    const result: {
      status: BatchJobStatus;
      completedCount?: number;
      failedCount?: number;
      outputResourceId?: string;
      error?: string;
    } = { status };

    if (response.request_counts?.completed !== undefined) result.completedCount = response.request_counts.completed;
    if (response.request_counts?.failed !== undefined) result.failedCount = response.request_counts.failed;
    if (response.output_file_id) result.outputResourceId = response.output_file_id;
    if (response.errors?.length) result.error = response.errors.map(e => e.message).join('; ');

    return result;
  }

  async getResults(providerJobId: string, outputResourceId?: string): Promise<BatchRequestResult[]> {
    if (!outputResourceId) {
      const batch = await this.httpRequest<{ output_file_id?: string }>(
        `${FIREWORKS_API_URL}/batches/${providerJobId}`,
        { method: 'GET' }
      );
      outputResourceId = batch.output_file_id;
    }

    if (!outputResourceId) throw new Error('No output file available');

    const fileResponse = await fetch(`${FIREWORKS_API_URL}/files/${outputResourceId}/content`, {
      headers: this.getAuthHeaders(),
    });

    if (!fileResponse.ok) throw new Error(`Failed to download results: ${fileResponse.status}`);

    const jsonl = await fileResponse.text();
    return this.parseJsonl<{ custom_id: string; response?: { body: { choices: Array<{ message: { content: string } }>; usage: { prompt_tokens: number; completion_tokens: number } } }; error?: { code: string; message: string } }>(jsonl)
      .map(item => {
        if (item.response) {
          return {
            customId: item.custom_id,
            success: true,
            response: this.parseResponse({
              content: item.response.body.choices[0]?.message.content ?? '',
              usage: item.response.body.usage,
            }),
            inputTokens: item.response.body.usage.prompt_tokens,
            outputTokens: item.response.body.usage.completion_tokens,
          };
        }
        return {
          customId: item.custom_id,
          success: false,
          error: { code: item.error?.code ?? 'unknown', message: item.error?.message ?? 'Failed' },
        };
      });
  }

  /**
   * Format a completion request for Fireworks batch API.
   * @param request - The completion request
   * @param customId - Unique identifier for correlation
   * @param modelId - The model ID from the original request
   */
  formatRequest(request: CompletionRequest, customId: string, modelId: string): unknown {
    // Convert internal model ID to Fireworks API model ID
    // Fireworks requires full account path: accounts/fireworks/models/...
    let apiModelId = FIREWORKS_MODEL_MAP[modelId];
    
    // If not found in map, try stripping prefix and looking up
    if (!apiModelId && modelId.startsWith('fireworks/')) {
      const shortId = modelId.slice('fireworks/'.length);
      apiModelId = FIREWORKS_MODEL_MAP[shortId];
    }
    
    // Final fallback: assume it's already a valid API model ID or use as-is
    if (!apiModelId) {
      this.log.warn('Unknown Fireworks model ID, using as-is', { modelId });
      apiModelId = modelId.startsWith('accounts/') ? modelId : `accounts/fireworks/models/${modelId.replace('fireworks/', '')}`;
    }

    return {
      custom_id: customId,
      method: 'POST',
      url: '/v1/chat/completions',
      body: {
        model: apiModelId,
        max_tokens: request.maxTokens ?? 4096,
        messages: [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: request.userPrompt },
        ],
        temperature: request.temperature ?? 0.7,
        ...(request.structuredOutput && {
          response_format: { type: 'json_object' },
        }),
      },
    };
  }

  /**
   * Parse Fireworks response into CompletionResponse format.
   * @param providerResponse - Raw response from Fireworks
   * @param modelId - Model ID for the response
   */
  parseResponse(providerResponse: unknown, modelId?: string): CompletionResponse {
    const response = providerResponse as { content: string; usage: { prompt_tokens: number; completion_tokens: number } };
    return {
      content: response.content,
      tokensUsed: {
        input: response.usage.prompt_tokens,
        output: response.usage.completion_tokens,
        total: response.usage.prompt_tokens + response.usage.completion_tokens,
      },
      latencyMs: 0,
      modelId: modelId ?? 'fireworks/unknown',
    };
  }

  /**
   * Override cost calculation for Fireworks (40% discount, less than others).
   */
  protected override calculateCost(inputTokens: number, outputTokens: number): number {
    // Fireworks batch pricing is 40% off (not 50% like others)
    const inputPricePerMillion = 0.9;  // $1.50 * 0.6 = $0.90
    const outputPricePerMillion = 4.5; // $7.50 * 0.6 = $4.50
    
    return (
      (inputTokens / 1_000_000) * inputPricePerMillion +
      (outputTokens / 1_000_000) * outputPricePerMillion
    );
  }
}

