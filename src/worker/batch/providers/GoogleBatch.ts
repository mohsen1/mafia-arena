/**
 * Google/Gemini Batch API provider.
 * 
 * ⚠️  WARNING: THIS IMPLEMENTATION IS NOT FUNCTIONAL ⚠️
 * 
 * Google's Gemini API does NOT have a proper batch API endpoint like 
 * Anthropic or OpenAI. The batchGenerateContent endpoint either doesn't 
 * exist or requires Vertex AI + Google Cloud Storage integration.
 * 
 * DO NOT enable batch pricing for Google models until this is properly
 * implemented using Vertex AI's Batch Prediction API.
 * 
 * The models table should have supports_batch_pricing = 0 for all 
 * Google models. See migration 0044_disable_google_batch.sql.
 * 
 * Original (non-functional) implementation notes:
 * - Attempted to use batchGenerateContent endpoint
 * - Returns error: "Unknown name 'requests': Cannot find field"
 * 
 * TODO: Implement using Vertex AI Batch Prediction API:
 * https://cloud.google.com/vertex-ai/docs/generative-ai/batch-prediction
 */

import type { Env } from '../../types.js';
import type { CompletionRequest, CompletionResponse } from '../../ai/types.js';
import type { BatchRequest, BatchRequestResult, BatchJobStatus } from '../types.js';
import { BaseBatchProvider } from './BaseBatchProvider.js';
import { ModelRegistry } from '../../services/ModelRegistry.js';

/** Google AI API base URL */
const GOOGLE_API_URL = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Google batch job response.
 */
interface GoogleBatchJob {
  name: string;
  state: 'JOB_STATE_UNSPECIFIED' | 'JOB_STATE_PENDING' | 'JOB_STATE_RUNNING' | 'JOB_STATE_SUCCEEDED' | 'JOB_STATE_FAILED' | 'JOB_STATE_CANCELLING' | 'JOB_STATE_CANCELLED';
  createTime: string;
  updateTime: string;
  completionTime?: string;
  error?: { code: number; message: string };
  inputConfig: { gcsSource?: { inputUri: string } };
  outputConfig: { gcsDestination?: { outputUriPrefix: string } };
  metadata?: {
    totalRequestCount?: number;
    completedRequestCount?: number;
    failedRequestCount?: number;
  };
}

/**
 * Google batch result item.
 */
interface GoogleBatchResultItem {
  customId: string;
  response?: {
    candidates: Array<{
      content: {
        parts: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> } }>;
      };
      finishReason: string;
    }>;
    usageMetadata: {
      promptTokenCount: number;
      candidatesTokenCount: number;
      totalTokenCount: number;
    };
    modelVersion?: string;
  };
  error?: {
    code: number;
    message: string;
  };
}

/**
 * Google/Gemini Batch API provider implementation.
 * 
 * Note: This uses the direct Gemini API batch endpoint.
 * For Vertex AI batch processing, see the Vertex AI documentation.
 */
export class GoogleBatch extends BaseBatchProvider {
  private readonly modelRegistry: ModelRegistry;

  /**
   * Create a Google batch provider.
   * @param env - Worker environment bindings
   * @param _defaultModelId - Default model ID (unused - model ID comes from each request)
   */
  constructor(env: Env, _defaultModelId: string) {
    super('google', env, 'GOOGLE_API_KEY');
    this.modelRegistry = new ModelRegistry(env.DB);
  }

  /**
   * Get the actual Google API model name from our model ID.
   * Uses ModelRegistry to look up the api_model_id from the database.
   * Falls back to stripping prefix if not found.
   * 
   * @param modelId - Our model ID like 'google/gemini-3-pro'
   * @returns Google API model name like 'gemini-3-pro-preview'
   */
  private async resolveGoogleModelName(modelId: string): Promise<string> {
    try {
      const context = await this.modelRegistry.get(modelId);
      // apiModelId is the actual name Google expects (e.g., 'gemini-3-pro-preview')
      let apiModelId = context.apiModelId;
      
      // Strip 'google/' prefix if present (some DB entries might have it)
      if (apiModelId.startsWith('google/')) {
        apiModelId = apiModelId.slice('google/'.length);
      }
      
      return apiModelId;
    } catch (error) {
      this.log.warn('Failed to resolve Google model name from DB, falling back', {
        modelId,
        error: error instanceof Error ? error.message : String(error),
      });
      
      // Fallback: just strip the prefix
      let name = modelId;
      if (name.startsWith('google/')) {
        name = name.slice('google/'.length);
      }
      return name;
    }
  }

  /**
   * Get Google API auth headers.
   */
  protected override getAuthHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
    };
  }

  /**
   * Build URL with API key for Google AI.
   */
  private buildUrl(path: string): string {
    return `${GOOGLE_API_URL}${path}?key=${this.apiKey}`;
  }

  /**
   * Create and submit a batch to Google.
   */
  async createBatch(requests: BatchRequest[], options?: {
    internalJobId?: string;
  }): Promise<{
    providerJobId: string;
    inputResourceId?: string;
    metadata?: Record<string, unknown>;
  }> {
    this.log.info('Creating Google batch', { 
      requestCount: requests.length,
      internalJobId: options?.internalJobId,
    });

    // Use batchGenerateContent endpoint
    // All requests in a batch have the same model, so use the first one
    const firstRequest = requests[0];
    if (!firstRequest) {
      throw new Error('Cannot create batch with empty requests');
    }
    
    // Resolve the actual Google API model name from our internal ID
    const googleModelName = await this.resolveGoogleModelName(firstRequest.modelId);
    
    this.log.info('Resolved Google model name', {
      internalModelId: firstRequest.modelId,
      googleModelName,
    });

    // Build inline batch requests (for smaller batches)
    // For larger batches, would need to use File API
    const batchRequests = requests.map(req => ({
      customId: req.customId,
      request: this.formatRequest(req.request, req.customId, req.modelId),
    }));

    const response = await fetch(
      this.buildUrl(`/models/${googleModelName}:batchGenerateContent`),
      {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          requests: batchRequests.map(r => r.request),
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google batch creation failed: ${error}`);
    }

    const data = await response.json() as { name?: string; responses?: unknown[] };
    
    // For synchronous batch (small batches), results come back immediately
    // For async jobs, we get an operation name to poll
    if (data.name) {
      return {
        providerJobId: data.name,
        metadata: { async: true },
      };
    }

    // Synchronous result - create a pseudo job ID
    const jobId = `sync_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    
    return {
      providerJobId: jobId,
      metadata: { 
        async: false,
        // Store responses for immediate retrieval
        responses: data.responses,
        customIds: batchRequests.map(r => r.customId),
      },
    };
  }

  /**
   * Check the status of a Google batch job.
   */
  async checkStatus(providerJobId: string): Promise<{
    status: BatchJobStatus;
    completedCount?: number;
    failedCount?: number;
    outputResourceId?: string;
    error?: string;
  }> {
    // Handle synchronous batches (small batches that completed immediately)
    if (providerJobId.startsWith('sync_')) {
      return {
        status: 'completed',
        completedCount: 0,
        failedCount: 0,
      };
    }

    // Poll async job
    const response = await fetch(
      this.buildUrl(`/${providerJobId}`),
      {
        method: 'GET',
        headers: this.getAuthHeaders(),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to check job status: ${error}`);
    }

    const job = await response.json() as GoogleBatchJob;

    let status: BatchJobStatus;
    switch (job.state) {
      case 'JOB_STATE_SUCCEEDED':
        status = 'completed';
        break;
      case 'JOB_STATE_FAILED':
        status = 'failed';
        break;
      case 'JOB_STATE_CANCELLED':
      case 'JOB_STATE_CANCELLING':
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

    if (job.metadata?.completedRequestCount !== undefined) {
      result.completedCount = job.metadata.completedRequestCount;
    }
    if (job.metadata?.failedRequestCount !== undefined) {
      result.failedCount = job.metadata.failedRequestCount;
    }
    if (job.error) {
      result.error = job.error.message;
    }

    return result;
  }

  /**
   * Retrieve results for a completed Google batch.
   */
  async getResults(_providerJobId: string, _outputResourceId?: string): Promise<BatchRequestResult[]> {
    // For the synchronous case, results were stored in metadata during createBatch
    // For async jobs, would need to download from GCS output location
    
    this.log.warn('Google batch result retrieval not fully implemented');
    return [];
  }

  /**
   * Cancel a Google batch job.
   */
  async cancelBatch(providerJobId: string): Promise<void> {
    if (providerJobId.startsWith('sync_')) {
      return; // Synchronous batches can't be cancelled
    }

    await fetch(
      this.buildUrl(`/${providerJobId}:cancel`),
      {
        method: 'POST',
        headers: this.getAuthHeaders(),
      }
    );
    this.log.info('Google batch cancelled', { jobId: providerJobId });
  }

  /**
   * Format a completion request for Google batch API.
   * @param request - The completion request
   * @param _customId - Unique identifier for correlation (not used by Google inline API)
   * @param _modelId - The model ID from the original request (model is set via endpoint URL)
   */
  formatRequest(request: CompletionRequest, _customId: string, _modelId: string): unknown {
    const parts: Array<{ text: string }> = [];
    
    // Combine system prompt and user prompt
    if (request.systemPrompt) {
      parts.push({ text: request.systemPrompt });
    }
    parts.push({ text: request.userPrompt });

    const requestBody: Record<string, unknown> = {
      contents: [{ parts }],
      generationConfig: {
        maxOutputTokens: request.maxTokens ?? 4096,
        temperature: request.temperature ?? 0.7,
      },
    };

    // Add response schema for structured output
    if (request.structuredOutput) {
      requestBody.generationConfig = {
        ...requestBody.generationConfig as Record<string, unknown>,
        responseMimeType: 'application/json',
        responseSchema: request.structuredOutput.schema,
      };
    }

    return requestBody;
  }

  /**
   * Parse Google response into CompletionResponse format.
   * @param providerResponse - Raw response from Google
   * @param modelId - Model ID for the response (Google responses include modelVersion)
   */
  parseResponse(providerResponse: unknown, modelId?: string): CompletionResponse {
    const response = providerResponse as GoogleBatchResultItem['response'];
    
    if (!response) {
      return {
        content: '',
        tokensUsed: { input: 0, output: 0, total: 0 },
        latencyMs: 0,
        modelId: modelId ?? 'google/unknown',
      };
    }

    const candidate = response.candidates[0];
    let content = '';

    if (candidate?.content.parts) {
      for (const part of candidate.content.parts) {
        if (part.text) {
          content += part.text;
        } else if (part.functionCall) {
          content = JSON.stringify(part.functionCall.args);
        }
      }
    }

    // Use modelVersion from response if available, otherwise fall back to provided modelId
    const responseModelId = response.modelVersion 
      ? `google/${response.modelVersion}`
      : (modelId ?? 'google/unknown');

    return {
      content,
      tokensUsed: {
        input: response.usageMetadata.promptTokenCount,
        output: response.usageMetadata.candidatesTokenCount,
        total: response.usageMetadata.totalTokenCount,
      },
      latencyMs: 0,
      modelId: responseModelId,
    };
  }
}

