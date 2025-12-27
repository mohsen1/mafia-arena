/**
 * OpenAI Batch API provider.
 * 
 * 50% discount on all models (GPT-4, GPT-4o, etc.)
 * 
 * API Documentation: https://platform.openai.com/docs/guides/batch
 * 
 * Key details:
 * - Requires uploading JSONL file first via Files API
 * - Batch endpoint: POST /v1/batches
 * - Uses input_file_id and retrieves output_file_id
 * - Results up to 24 hours
 */

import type { Env } from '../../types.js';
import type { CompletionRequest, CompletionResponse } from '../../ai/types.js';
import type { BatchRequest, BatchRequestResult, BatchJobStatus } from '../types.js';
import { BaseBatchProvider } from './BaseBatchProvider.js';

/** OpenAI API base URL */
const OPENAI_API_URL = 'https://api.openai.com/v1';

/**
 * OpenAI batch response format.
 */
interface OpenAIBatchResponse {
  id: string;
  object: 'batch';
  endpoint: string;
  input_file_id: string;
  completion_window: string;
  status: 'validating' | 'failed' | 'in_progress' | 'finalizing' | 'completed' | 'expired' | 'cancelling' | 'cancelled';
  output_file_id?: string;
  error_file_id?: string;
  created_at: number;
  in_progress_at?: number;
  expires_at?: number;
  finalizing_at?: number;
  completed_at?: number;
  failed_at?: number;
  expired_at?: number;
  cancelling_at?: number;
  cancelled_at?: number;
  request_counts?: {
    total: number;
    completed: number;
    failed: number;
  };
  errors?: {
    object: string;
    data: Array<{ code: string; message: string; line: number }>;
  };
}

/**
 * OpenAI batch result item format (from output file).
 */
interface OpenAIBatchResultItem {
  id: string;
  custom_id: string;
  response?: {
    status_code: number;
    body: {
      id: string;
      model?: string;
      choices: Array<{
        index: number;
        message: {
          role: 'assistant';
          content: string | null;
          tool_calls?: Array<{
            id: string;
            type: 'function';
            function: { name: string; arguments: string };
          }>;
        };
        finish_reason: string;
      }>;
      usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    };
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * OpenAI Batch API provider implementation.
 */
export class OpenAIBatch extends BaseBatchProvider {
  /**
   * Create an OpenAI batch provider.
   * @param env - Worker environment bindings
   * @param _defaultModelId - Default model ID (unused - model ID comes from each request)
   */
  constructor(env: Env, _defaultModelId: string) {
    super('openai', env, 'OPENAI_API_KEY');
  }

  /**
   * Create and submit a batch to OpenAI.
   * 
   * Steps:
   * 1. Format requests as JSONL
   * 2. Upload JSONL file via Files API
   * 3. Create batch with input_file_id
   */
  async createBatch(requests: BatchRequest[]): Promise<{
    providerJobId: string;
    inputResourceId?: string;
    metadata?: Record<string, unknown>;
  }> {
    this.log.info('Creating OpenAI batch', { requestCount: requests.length });

    // 1. Build JSONL content
    const jsonlContent = requests
      .map(req => JSON.stringify(this.formatRequest(req.request, req.customId, req.modelId)))
      .join('\n');

    // 2. Upload file
    const formData = new FormData();
    formData.append('purpose', 'batch');
    formData.append('file', new Blob([jsonlContent], { type: 'application/jsonl' }), 'batch_input.jsonl');

    const fileResponse = await fetch(`${OPENAI_API_URL}/files`, {
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

    // 3. Create batch
    const batchResponse = await this.httpRequest<OpenAIBatchResponse>(
      `${OPENAI_API_URL}/batches`,
      {
        method: 'POST',
        body: JSON.stringify({
          input_file_id: inputFileId,
          endpoint: '/v1/chat/completions',
          completion_window: '24h',
        }),
      }
    );

    this.log.info('OpenAI batch created', {
      batchId: batchResponse.id,
      inputFileId,
      status: batchResponse.status,
    });

    return {
      providerJobId: batchResponse.id,
      inputResourceId: inputFileId,
      metadata: {
        completion_window: batchResponse.completion_window,
        created_at: batchResponse.created_at,
      },
    };
  }

  /**
   * Check the status of an OpenAI batch.
   */
  async checkStatus(providerJobId: string): Promise<{
    status: BatchJobStatus;
    completedCount?: number;
    failedCount?: number;
    outputResourceId?: string;
    error?: string;
  }> {
    const response = await this.httpRequest<OpenAIBatchResponse>(
      `${OPENAI_API_URL}/batches/${providerJobId}`,
      { method: 'GET' }
    );

    // Map OpenAI status to our status
    let status: BatchJobStatus;
    switch (response.status) {
      case 'completed':
        status = 'completed';
        break;
      case 'failed':
      case 'expired':
        status = 'failed';
        break;
      case 'cancelled':
        status = 'cancelled';
        break;
      case 'cancelling':
        status = 'cancelled';
        break;
      default:
        status = 'processing';
    }

    const result: {
      status: BatchJobStatus;
      completedCount?: number;
      failedCount?: number;
      outputResourceId?: string;
      error?: string;
    } = { status };

    if (response.request_counts?.completed !== undefined) {
      result.completedCount = response.request_counts.completed;
    }
    if (response.request_counts?.failed !== undefined) {
      result.failedCount = response.request_counts.failed;
    }
    if (response.output_file_id) {
      result.outputResourceId = response.output_file_id;
    }
    if (response.errors?.data?.length) {
      result.error = response.errors.data.map(e => e.message).join('; ');
    }

    return result;
  }

  /**
   * Retrieve results for a completed OpenAI batch.
   */
  async getResults(providerJobId: string, outputResourceId?: string): Promise<BatchRequestResult[]> {
    if (!outputResourceId) {
      // Fetch batch to get output_file_id
      const batch = await this.httpRequest<OpenAIBatchResponse>(
        `${OPENAI_API_URL}/batches/${providerJobId}`,
        { method: 'GET' }
      );
      outputResourceId = batch.output_file_id;
    }

    if (!outputResourceId) {
      throw new Error('No output file available');
    }

    // Download output file
    const fileResponse = await fetch(`${OPENAI_API_URL}/files/${outputResourceId}/content`, {
      headers: this.getAuthHeaders(),
    });

    if (!fileResponse.ok) {
      throw new Error(`Failed to download results: ${fileResponse.status}`);
    }

    const jsonl = await fileResponse.text();
    const items = this.parseJsonl<OpenAIBatchResultItem>(jsonl);

    return items.map(item => {
      if (item.response?.body) {
        const choice = item.response.body.choices[0];
        const usage = item.response.body.usage;

        // Handle tool calls (structured output)
        let content: string;
        if (choice?.message.tool_calls?.length) {
          const toolCall = choice.message.tool_calls[0];
          content = toolCall?.function.arguments ?? '';
        } else {
          content = choice?.message.content ?? '';
        }

        return {
          customId: item.custom_id,
          success: true,
          response: this.parseResponse({
            content,
            usage,
            model: item.response.body.model ?? 'openai/unknown',
          }),
          inputTokens: usage.prompt_tokens,
          outputTokens: usage.completion_tokens,
        };
      } else {
        return {
          customId: item.custom_id,
          success: false,
          error: {
            code: item.error?.code ?? 'unknown',
            message: item.error?.message ?? 'Request failed',
          },
        };
      }
    });
  }

  /**
   * Cancel an OpenAI batch.
   */
  async cancelBatch(providerJobId: string): Promise<void> {
    await this.httpRequest<OpenAIBatchResponse>(
      `${OPENAI_API_URL}/batches/${providerJobId}/cancel`,
      { method: 'POST' }
    );
    this.log.info('OpenAI batch cancelled', { batchId: providerJobId });
  }

  /**
   * Format a completion request for OpenAI batch API.
   * @param request - The completion request
   * @param customId - Unique identifier for correlation
   * @param modelId - The model ID from the original request
   */
  formatRequest(request: CompletionRequest, customId: string, modelId: string): unknown {
    let model = modelId;
    if (model.startsWith('openai/')) {
      model = model.slice('openai/'.length);
    }

    const body: Record<string, unknown> = {
      model,
      max_tokens: request.maxTokens ?? 4096,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
      temperature: request.temperature ?? 0.7,
    };

    // Add response_format for structured output
    if (request.structuredOutput) {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: request.structuredOutput.name,
          schema: request.structuredOutput.schema,
          strict: request.structuredOutput.strict ?? true,
        },
      };
    }

    return {
      custom_id: customId,
      method: 'POST',
      url: '/v1/chat/completions',
      body,
    };
  }

  /**
   * Parse OpenAI response into CompletionResponse format.
   * @param providerResponse - Raw response from OpenAI
   * @param _modelId - Model ID (unused - OpenAI includes model in response)
   */
  parseResponse(providerResponse: unknown, _modelId?: string): CompletionResponse {
    const response = providerResponse as {
      content: string;
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      model: string;
    };

    return {
      content: response.content,
      tokensUsed: {
        input: response.usage.prompt_tokens,
        output: response.usage.completion_tokens,
        total: response.usage.total_tokens,
      },
      latencyMs: 0,
      modelId: response.model,
    };
  }
}

