/**
 * External Worker Provider for User-Hosted API Key Isolation.
 *
 * This provider proxies AI requests to a user-deployed Cloudflare Worker
 * that holds the user's API keys, achieving cryptographic isolation.
 *
 * Security features:
 * - Bearer token authentication
 * - Challenge-response verification
 * - Timing analysis for anomaly detection
 * - Verification token embedding
 */

import type {
  AIProviderInterface,
  CompletionRequest,
  CompletionResponse,
} from '../types.js';
import { AIError, AIErrors } from '../errors.js';

/**
 * Configuration for the external worker provider.
 */
export interface ExternalWorkerConfig {
  /** URL of the user's external worker */
  workerUrl: string;
  /** Bearer token for authentication */
  authToken: string;
  /** Model ID to request from the external worker */
  modelId: string;
  /** Request timeout in milliseconds */
  timeoutMs?: number | undefined;
  /** User ID for audit logging */
  userId?: string | undefined;
  /** Game ID for verification tracking */
  gameId?: string | undefined;
}

/**
 * Request format sent to the external worker.
 */
export interface ExternalWorkerRequest {
  modelId: string;
  request: CompletionRequest;
  context?: {
    gameId?: string | undefined;
    round?: number | undefined;
    phase?: string | undefined;
    playerId?: string | undefined;
    actionType?: string | undefined;
  } | undefined;
  /** Verification challenge (optional, sent on sample requests) */
  challenge?: {
    nonce: string;
    timestamp: number;
  } | undefined;
}

/**
 * Response format from the external worker.
 */
export interface ExternalWorkerResponse {
  success: boolean;
  response?: CompletionResponse;
  error?: {
    code: string;
    message: string;
    retryable?: boolean;
    retryAfterMs?: number;
  };
  /** Template version for verification */
  templateVersion?: string;
  /** Challenge response (if challenge was sent) */
  challengeResponse?: string;
  /** Processing timestamp */
  processedAt?: number;
}

/**
 * Provider that proxies AI requests to user-hosted external workers.
 */
export class ExternalWorkerProvider implements AIProviderInterface {
  readonly name = 'external-worker';
  readonly modelId: string;

  private readonly workerUrl: string;
  private readonly authToken: string;
  private readonly timeoutMs: number;
  private readonly gameId: string | undefined;

  constructor(config: ExternalWorkerConfig) {
    // Normalize URL - remove trailing slash
    this.workerUrl = config.workerUrl.replace(/\/$/, '');
    this.authToken = config.authToken;
    this.modelId = config.modelId;
    this.timeoutMs = config.timeoutMs ?? 120000; // 2 minute default (external adds latency)
    this.gameId = config.gameId;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      // Build the request payload, only including defined optional fields
      const requestPayload: ExternalWorkerRequest['request'] = {
        systemPrompt: request.systemPrompt,
        userPrompt: request.userPrompt,
      };
      if (request.maxTokens !== undefined) {
        requestPayload.maxTokens = request.maxTokens;
      }
      if (request.temperature !== undefined) {
        requestPayload.temperature = request.temperature;
      }
      if (request.structuredOutput !== undefined) {
        requestPayload.structuredOutput = request.structuredOutput;
      }

      const externalRequest: ExternalWorkerRequest = {
        modelId: this.modelId,
        request: requestPayload,
        context: this.gameId ? { gameId: this.gameId } : undefined,
      };

      const response = await fetch(`${this.workerUrl}/v1/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.authToken}`,
          'X-Model-Id': this.modelId,
          ...(this.gameId && { 'X-Game-Id': this.gameId }),
        },
        body: JSON.stringify(externalRequest),
        signal: controller.signal,
      });

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        return this.handleHttpError(response.status, errorText);
      }

      const data = (await response.json()) as ExternalWorkerResponse;

      if (!data.success || !data.response) {
        return this.handleExternalError(data.error);
      }

      // Return the response with our measured latency
      return {
        ...data.response,
        latencyMs,
        modelId: this.modelId,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw AIErrors.timeout(this.modelId, this.timeoutMs);
      }
      if (error instanceof AIError) {
        throw error;
      }
      throw AIErrors.providerError(
        'external-worker',
        `Failed to reach worker: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Handle HTTP-level errors from the external worker.
   */
  private handleHttpError(status: number, errorText: string): never {
    switch (status) {
      case 401:
        throw AIErrors.authError('external-worker: Invalid auth token');
      case 403:
        throw AIErrors.authError('external-worker: Access denied');
      case 429:
        throw AIErrors.rateLimited(this.modelId);
      case 502:
      case 503:
      case 504:
        throw AIErrors.providerError(
          'external-worker',
          `Worker unavailable (${status}): ${errorText}`
        );
      default:
        throw AIErrors.providerError(
          'external-worker',
          `HTTP ${status}: ${errorText}`
        );
    }
  }

  /**
   * Handle application-level errors from the external worker.
   */
  private handleExternalError(
    error?: ExternalWorkerResponse['error']
  ): never {
    if (!error) {
      throw AIErrors.invalidResponse(
        this.modelId,
        'External worker returned unsuccessful response without error details'
      );
    }

    // Map external worker error codes to AIError types
    switch (error.code) {
      case 'AUTH_INVALID_TOKEN':
      case 'AUTH_MISSING_TOKEN':
        throw AIErrors.authError('external-worker');

      case 'PROVIDER_AUTH_FAILED':
        throw AIErrors.authError(`external-worker: ${error.message}`);

      case 'PROVIDER_RATE_LIMITED':
        throw AIErrors.rateLimited(
          this.modelId,
          error.retryAfterMs ? Math.ceil(error.retryAfterMs / 1000) : undefined
        );

      case 'PROVIDER_QUOTA_EXCEEDED':
        throw AIErrors.providerError('external-worker', error.message);

      case 'MODEL_NOT_SUPPORTED':
      case 'PROVIDER_KEY_MISSING':
        throw AIErrors.unsupportedModel(`${this.modelId}: ${error.message}`);

      case 'REQUEST_TIMEOUT':
        throw AIErrors.timeout(this.modelId, this.timeoutMs);

      case 'REQUEST_INVALID_JSON':
        throw AIErrors.providerError('external-worker', 'Invalid request format');

      default:
        throw AIErrors.providerError('external-worker', error.message);
    }
  }

  /**
   * Send a challenge request to verify the external worker is running
   * unmodified template code.
   *
   * @param nonce Random nonce for the challenge
   * @returns Challenge response from the worker
   */
  async sendChallenge(nonce: string): Promise<{
    success: boolean;
    response?: string;
    templateVersion?: string;
    error?: string;
  }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout for challenges

    try {
      const response = await fetch(`${this.workerUrl}/challenge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.authToken}`,
        },
        body: JSON.stringify({
          nonce,
          timestamp: Date.now(),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}`,
        };
      }

      const data = (await response.json()) as {
        response: string;
        templateVersion: string;
      };

      return {
        success: true,
        response: data.response,
        templateVersion: data.templateVersion,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Check the health of the external worker.
   *
   * @returns Health status and supported providers
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    version?: string | undefined;
    providers?: string[] | undefined;
    error?: string | undefined;
  }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      // Check health endpoint
      const healthResponse = await fetch(`${this.workerUrl}/health`, {
        headers: {
          Authorization: `Bearer ${this.authToken}`,
        },
        signal: controller.signal,
      });

      if (!healthResponse.ok) {
        return {
          healthy: false,
          error: `Health check failed: HTTP ${healthResponse.status}`,
        };
      }

      const healthData = (await healthResponse.json()) as {
        status: string;
        version?: string;
      };

      // Get supported models/providers
      const modelsResponse = await fetch(`${this.workerUrl}/v1/models`, {
        headers: {
          Authorization: `Bearer ${this.authToken}`,
        },
        signal: controller.signal,
      });

      let providers: string[] | undefined;
      if (modelsResponse.ok) {
        const modelsData = (await modelsResponse.json()) as {
          providers?: string[];
        };
        providers = modelsData.providers ?? [];
      }

      return {
        healthy: healthData.status === 'ok',
        version: healthData.version,
        providers,
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
