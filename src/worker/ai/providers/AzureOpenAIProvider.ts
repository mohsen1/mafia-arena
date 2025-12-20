/**
 * Azure OpenAI API provider implementation.
 * 
 * Uses Azure's OpenAI Service endpoints instead of OpenAI's direct API.
 * Supports GPT-4o and other models deployed to your Azure resource.
 */

import { BaseProvider } from '../BaseProvider.js';
import type { AIProviderConfig, CompletionRequest, CompletionResponse } from '../types.js';

interface AzureOpenAIResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface AzureOpenAIConfig extends AIProviderConfig {
  endpoint: string;      // e.g., "https://thirdface-sweden.openai.azure.com"
  apiVersion: string;    // e.g., "2024-12-01-preview"
  deploymentName: string; // Your Azure deployment name
}

/**
 * Map model IDs to Azure deployment names.
 * Update this based on your Azure OpenAI deployments.
 */
const DEPLOYMENT_MAPPING: Record<string, string> = {
  // GPT-5.x models -> map to your Azure GPT-4o deployment
  'gpt-5.2': 'gpt-4o',
  'gpt-5.2-pro': 'gpt-4o',
  'gpt-5-mini': 'gpt-4o-mini',
  'gpt-5-nano': 'gpt-4o-mini',
  // Direct mappings
  'gpt-4o': 'gpt-4o',
  'gpt-4o-mini': 'gpt-4o-mini',
};

export class AzureOpenAIProvider extends BaseProvider {
  readonly name = 'azure-openai';
  readonly modelId: string;
  private readonly endpoint: string;
  private readonly apiVersion: string;
  private readonly deploymentName: string;

  constructor(config: AzureOpenAIConfig) {
    super(config);
    this.modelId = config.modelId;
    this.endpoint = config.endpoint.replace(/\/$/, ''); // Remove trailing slash
    this.apiVersion = config.apiVersion;
    this.deploymentName = config.deploymentName || DEPLOYMENT_MAPPING[config.modelId] || config.modelId;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const startTime = Date.now();

    const url = `${this.endpoint}/openai/deployments/${this.deploymentName}/chat/completions?api-version=${this.apiVersion}`;

    const body: Record<string, unknown> = {
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
      max_tokens: request.maxTokens ?? 1000,
      temperature: request.temperature ?? 0.7,
    };

    // Add structured output if requested (Azure supports response_format)
    if (request.structuredOutput) {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: request.structuredOutput.name,
          strict: true,
          schema: request.structuredOutput.schema,
        },
      };
    }

    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.apiKey,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      this.handleHttpError(response, data);
    }

    const typedData = data as AzureOpenAIResponse;
    const latencyMs = Date.now() - startTime;

    return {
      content: typedData.choices[0]?.message.content ?? '',
      tokensUsed: {
        input: typedData.usage?.prompt_tokens ?? 0,
        output: typedData.usage?.completion_tokens ?? 0,
        total: typedData.usage?.total_tokens ?? 0,
      },
      latencyMs,
      modelId: this.modelId,
    };
  }
}

