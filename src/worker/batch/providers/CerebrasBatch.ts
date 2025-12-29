/**
 * Cerebras Batch API provider.
 * 
 * 50% discount on Cerebras models
 * 
 * Note: Implementation based on expected Cerebras batch API patterns.
 * May need updates when actual API documentation is available.
 */

import type { Env } from '../../types.js';
import type { CompletionRequest, CompletionResponse } from '../../ai/types.js';
import type { BatchRequest, BatchRequestResult, BatchJobStatus } from '../types.js';
import { BaseBatchProvider } from './BaseBatchProvider.js';

/** Cerebras API base URL */
const CEREBRAS_API_URL = 'https://api.cerebras.ai/v1';

/**
 * Cerebras Batch API provider implementation.
 * 
 * Note: This is a stub implementation. The actual Cerebras batch API
 * may have different endpoints and formats.
 */
export class CerebrasBatch extends BaseBatchProvider {
  /**
   * Create a Cerebras batch provider.
   * @param env - Worker environment bindings
   * @param _defaultModelId - Default model ID (unused - model ID comes from each request)
   */
  constructor(env: Env, _defaultModelId: string) {
    super('cerebras', env, 'CEREBRAS_API_KEY');
  }

  async createBatch(requests: BatchRequest[], options?: {
    internalJobId?: string;
  }): Promise<{
    providerJobId: string;
    inputResourceId?: string;
    metadata?: Record<string, unknown>;
  }> {
    this.log.info('Creating Cerebras batch', { 
      requestCount: requests.length,
      internalJobId: options?.internalJobId,
    });
    
    // Cerebras uses OpenAI-compatible API format
    const jsonlContent = requests
      .map(req => JSON.stringify(this.formatRequest(req.request, req.customId, req.modelId)))
      .join('\n');

    // Upload file
    const formData = new FormData();
    formData.append('purpose', 'batch');
    formData.append('file', new Blob([jsonlContent], { type: 'application/jsonl' }), 'batch_input.jsonl');

    const fileResponse = await fetch(`${CEREBRAS_API_URL}/files`, {
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
      `${CEREBRAS_API_URL}/batches`,
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
    }>(`${CEREBRAS_API_URL}/batches/${providerJobId}`, { method: 'GET' });

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
        `${CEREBRAS_API_URL}/batches/${providerJobId}`,
        { method: 'GET' }
      );
      outputResourceId = batch.output_file_id;
    }

    if (!outputResourceId) throw new Error('No output file available');

    const fileResponse = await fetch(`${CEREBRAS_API_URL}/files/${outputResourceId}/content`, {
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
   * Format a completion request for Cerebras batch API.
   * @param request - The completion request
   * @param customId - Unique identifier for correlation
   * @param modelId - The model ID from the original request
   */
  formatRequest(request: CompletionRequest, customId: string, modelId: string): unknown {
    let model = modelId;
    if (model.startsWith('cerebras/')) model = model.slice('cerebras/'.length);

    return {
      custom_id: customId,
      method: 'POST',
      url: '/v1/chat/completions',
      body: {
        model,
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
   * Parse Cerebras response into CompletionResponse format.
   * @param providerResponse - Raw response from Cerebras
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
      modelId: modelId ?? 'cerebras/unknown',
    };
  }
}

