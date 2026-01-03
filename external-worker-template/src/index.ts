/**
 * Mafia Arena External Worker Template
 *
 * This worker proxies AI requests from Mafia Arena using YOUR API keys.
 * Your keys never leave your Cloudflare account.
 *
 * Endpoints:
 * - GET /health - Health check
 * - GET /v1/models - List available models based on configured API keys
 * - POST /v1/complete - Execute AI completion request
 * - POST /challenge - Respond to verification challenges
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';

// =============================================================================
// TYPES
// =============================================================================

interface Env {
  // Required
  AUTH_TOKEN: string;
  TEMPLATE_VERSION: string;

  // AI Provider API Keys (at least one required)
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  XAI_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  TOGETHER_API_KEY?: string;
  GROQ_API_KEY?: string;
  MISTRAL_API_KEY?: string;
  COHERE_API_KEY?: string;
  AI21_API_KEY?: string;
  CEREBRAS_API_KEY?: string;
  FIREWORKS_API_KEY?: string;
}

interface CompletionRequest {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  structuredOutput?: {
    name: string;
    schema: Record<string, unknown>;
    strict?: boolean;
  };
}

interface CompletionResponse {
  content: string;
  tokensUsed: {
    input: number;
    output: number;
    total: number;
  };
  latencyMs: number;
  modelId: string;
}

interface ExternalWorkerRequest {
  modelId: string;
  request: CompletionRequest;
  context?: {
    gameId?: string;
    round?: number;
    phase?: string;
  };
}

// =============================================================================
// PROVIDER IMPLEMENTATIONS
// =============================================================================

type ProviderType = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'xai' |
  'deepseek' | 'together' | 'groq' | 'mistral' | 'cohere' | 'ai21' |
  'cerebras' | 'fireworks';

const PROVIDER_CONFIG: Record<ProviderType, { envKey: keyof Env; baseUrl: string; type: 'openai' | 'anthropic' | 'google' }> = {
  openai: { envKey: 'OPENAI_API_KEY', baseUrl: 'https://api.openai.com/v1', type: 'openai' },
  anthropic: { envKey: 'ANTHROPIC_API_KEY', baseUrl: 'https://api.anthropic.com', type: 'anthropic' },
  google: { envKey: 'GOOGLE_API_KEY', baseUrl: 'https://generativelanguage.googleapis.com', type: 'google' },
  openrouter: { envKey: 'OPENROUTER_API_KEY', baseUrl: 'https://openrouter.ai/api/v1', type: 'openai' },
  xai: { envKey: 'XAI_API_KEY', baseUrl: 'https://api.x.ai/v1', type: 'openai' },
  deepseek: { envKey: 'DEEPSEEK_API_KEY', baseUrl: 'https://api.deepseek.com/v1', type: 'openai' },
  together: { envKey: 'TOGETHER_API_KEY', baseUrl: 'https://api.together.xyz/v1', type: 'openai' },
  groq: { envKey: 'GROQ_API_KEY', baseUrl: 'https://api.groq.com/openai/v1', type: 'openai' },
  mistral: { envKey: 'MISTRAL_API_KEY', baseUrl: 'https://api.mistral.ai/v1', type: 'openai' },
  cohere: { envKey: 'COHERE_API_KEY', baseUrl: 'https://api.cohere.ai/v2', type: 'openai' },
  ai21: { envKey: 'AI21_API_KEY', baseUrl: 'https://api.ai21.com/studio/v1', type: 'openai' },
  cerebras: { envKey: 'CEREBRAS_API_KEY', baseUrl: 'https://api.cerebras.ai/v1', type: 'openai' },
  fireworks: { envKey: 'FIREWORKS_API_KEY', baseUrl: 'https://api.fireworks.ai/inference/v1', type: 'openai' },
};

function parseModelId(modelId: string): { provider: ProviderType; apiModelId: string } {
  const parts = modelId.split('/');
  const firstPart = parts[0] as ProviderType;

  if (firstPart in PROVIDER_CONFIG) {
    if (firstPart === 'openrouter') {
      return { provider: 'openrouter', apiModelId: parts.slice(1).join('/') };
    }
    return { provider: firstPart, apiModelId: parts.slice(1).join('/') };
  }

  // Default to OpenRouter for unknown providers
  return { provider: 'openrouter', apiModelId: modelId };
}

async function callOpenAICompatible(
  baseUrl: string,
  apiKey: string,
  modelId: string,
  request: CompletionRequest,
  timeoutMs: number = 120000
): Promise<CompletionResponse> {
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const messages = [
      { role: 'system', content: request.systemPrompt },
      { role: 'user', content: request.userPrompt },
    ];

    const body: Record<string, unknown> = {
      model: modelId,
      messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 4000,
    };

    // Add structured output via tools if requested
    if (request.structuredOutput) {
      body.tools = [{
        type: 'function',
        function: {
          name: request.structuredOutput.name,
          description: 'Provide your response using this structure.',
          parameters: request.structuredOutput.schema,
        },
      }];
      body.tool_choice = {
        type: 'function',
        function: { name: request.structuredOutput.name },
      };
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Provider error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      choices: Array<{
        message: {
          content?: string;
          tool_calls?: Array<{
            function: { arguments: string };
          }>;
        };
      }>;
      usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    };

    // Extract content from either regular response or tool call
    let content: string;
    const choice = data.choices[0];
    if (choice.message.tool_calls?.[0]) {
      content = choice.message.tool_calls[0].function.arguments;
    } else {
      content = choice.message.content ?? '';
    }

    return {
      content,
      tokensUsed: {
        input: data.usage.prompt_tokens,
        output: data.usage.completion_tokens,
        total: data.usage.total_tokens,
      },
      latencyMs: Date.now() - startTime,
      modelId,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callAnthropic(
  apiKey: string,
  modelId: string,
  request: CompletionRequest,
  timeoutMs: number = 120000
): Promise<CompletionResponse> {
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body: Record<string, unknown> = {
      model: modelId,
      max_tokens: request.maxTokens ?? 4000,
      messages: [{ role: 'user', content: request.userPrompt }],
      system: request.systemPrompt,
      temperature: request.temperature ?? 0.7,
    };

    // Add tool use for structured output
    if (request.structuredOutput) {
      body.tools = [{
        name: request.structuredOutput.name,
        description: 'Provide your response using this structure.',
        input_schema: request.structuredOutput.schema,
      }];
      body.tool_choice = { type: 'tool', name: request.structuredOutput.name };
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      content: Array<{
        type: string;
        text?: string;
        input?: Record<string, unknown>;
      }>;
      usage: {
        input_tokens: number;
        output_tokens: number;
      };
    };

    // Extract content from either text or tool use
    let content: string;
    const contentBlock = data.content[0];
    if (contentBlock.type === 'tool_use' && contentBlock.input) {
      content = JSON.stringify(contentBlock.input);
    } else {
      content = contentBlock.text ?? '';
    }

    return {
      content,
      tokensUsed: {
        input: data.usage.input_tokens,
        output: data.usage.output_tokens,
        total: data.usage.input_tokens + data.usage.output_tokens,
      },
      latencyMs: Date.now() - startTime,
      modelId,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callGoogle(
  apiKey: string,
  modelId: string,
  request: CompletionRequest,
  timeoutMs: number = 120000
): Promise<CompletionResponse> {
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body = {
      contents: [
        { role: 'user', parts: [{ text: request.userPrompt }] },
      ],
      systemInstruction: { parts: [{ text: request.systemPrompt }] },
      generationConfig: {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens ?? 4000,
        responseMimeType: request.structuredOutput ? 'application/json' : 'text/plain',
        responseSchema: request.structuredOutput?.schema,
      },
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      candidates: Array<{
        content: {
          parts: Array<{ text: string }>;
        };
      }>;
      usageMetadata: {
        promptTokenCount: number;
        candidatesTokenCount: number;
        totalTokenCount: number;
      };
    };

    const content = data.candidates[0]?.content?.parts?.[0]?.text ?? '';

    return {
      content,
      tokensUsed: {
        input: data.usageMetadata.promptTokenCount,
        output: data.usageMetadata.candidatesTokenCount,
        total: data.usageMetadata.totalTokenCount,
      },
      latencyMs: Date.now() - startTime,
      modelId,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

// =============================================================================
// HONO APP
// =============================================================================

const app = new Hono<{ Bindings: Env }>();

// CORS for debugging
app.use('/*', cors({
  origin: ['https://mafia-arena.com', 'https://api.mafia-arena.com', 'http://localhost:5173'],
  allowMethods: ['POST', 'GET', 'OPTIONS'],
}));

// Authentication middleware
app.use('/v1/*', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({
      success: false,
      error: { code: 'AUTH_MISSING_TOKEN', message: 'Authorization header required', retryable: false },
    }, 401);
  }

  const token = authHeader.slice(7);
  if (token !== c.env.AUTH_TOKEN) {
    return c.json({
      success: false,
      error: { code: 'AUTH_INVALID_TOKEN', message: 'Invalid authentication token', retryable: false },
    }, 401);
  }

  return next();
});

// Health check
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    version: c.env.TEMPLATE_VERSION,
    timestamp: new Date().toISOString(),
  });
});

// List available models/providers
app.get('/v1/models', (c) => {
  const providers: string[] = [];

  for (const [provider, config] of Object.entries(PROVIDER_CONFIG)) {
    if (c.env[config.envKey]) {
      providers.push(provider);
    }
  }

  return c.json({
    providers,
    version: c.env.TEMPLATE_VERSION,
  });
});

// AI completion endpoint
app.post('/v1/complete', async (c) => {
  try {
    const body = await c.req.json<ExternalWorkerRequest>();
    const { modelId, request } = body;

    if (!modelId || !request) {
      return c.json({
        success: false,
        error: { code: 'REQUEST_INVALID', message: 'Missing modelId or request', retryable: false },
      }, 400);
    }

    const { provider, apiModelId } = parseModelId(modelId);
    const config = PROVIDER_CONFIG[provider];

    if (!config) {
      return c.json({
        success: false,
        error: { code: 'PROVIDER_NOT_SUPPORTED', message: `Provider ${provider} not supported`, retryable: false },
      }, 400);
    }

    const apiKey = c.env[config.envKey];
    if (!apiKey) {
      return c.json({
        success: false,
        error: {
          code: 'PROVIDER_KEY_MISSING',
          message: `API key not configured for ${provider}. Add ${config.envKey} via wrangler secret put.`,
          retryable: false,
        },
      }, 400);
    }

    let response: CompletionResponse;

    switch (config.type) {
      case 'anthropic':
        response = await callAnthropic(apiKey, apiModelId, request);
        break;
      case 'google':
        response = await callGoogle(apiKey, apiModelId, request);
        break;
      case 'openai':
      default:
        response = await callOpenAICompatible(config.baseUrl, apiKey, apiModelId, request);
        break;
    }

    return c.json({
      success: true,
      response,
      templateVersion: c.env.TEMPLATE_VERSION,
    });
  } catch (error) {
    console.error('Completion error:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';

    // Check for rate limiting
    if (message.includes('429') || message.includes('rate limit')) {
      return c.json({
        success: false,
        error: { code: 'PROVIDER_RATE_LIMITED', message: 'Rate limited', retryable: true, retryAfterMs: 5000 },
      }, 429);
    }

    // Check for auth errors
    if (message.includes('401') || message.includes('403') || message.includes('authentication')) {
      return c.json({
        success: false,
        error: { code: 'PROVIDER_AUTH_FAILED', message, retryable: false },
      }, 401);
    }

    return c.json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message, retryable: true },
    }, 500);
  }
});

// Challenge endpoint for verification
app.post('/challenge', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ') || authHeader.slice(7) !== c.env.AUTH_TOKEN) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const body = await c.req.json<{ nonce: string; timestamp: number }>();

    // Simple challenge-response: return hash of nonce + version
    const encoder = new TextEncoder();
    const data = encoder.encode(`${body.nonce}:${c.env.TEMPLATE_VERSION}`);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const response = btoa(String.fromCharCode(...new Uint8Array(hash)));

    return c.json({
      response,
      templateVersion: c.env.TEMPLATE_VERSION,
      timestamp: Date.now(),
    });
  } catch {
    return c.json({ error: 'Invalid request' }, 400);
  }
});

export default app;
