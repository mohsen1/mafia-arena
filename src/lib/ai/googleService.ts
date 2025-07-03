import dotenv from 'dotenv';
import {
  GoogleGenerativeAI,
  SchemaType,
  FunctionCallingMode,
  type FunctionDeclarationsTool,
  type FunctionDeclaration,
} from '@google/generative-ai';

import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

// Load environment variables
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn(
    'Missing GEMINI_API_KEY environment variable. Google AI features will be disabled.'
  );
}

function getGoogleAIInstance() {
  if (!apiKey) {
    throw new Error(
      'Google AI API key not configured. Please set GEMINI_API_KEY in your environment variables.'
    );
  }
  return new GoogleGenerativeAI(apiKey);
}

function convertOpenAIMessagesToGoogle(
  messages: ChatCompletionMessageParam[]
): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> {
  const googleMessages: Array<{
    role: 'user' | 'model';
    parts: Array<{ text: string }>;
  }> = [];
  let systemMessage = '';

  for (const message of messages) {
    if (message.role === 'system') {
      systemMessage = message.content as string;
    } else if (message.role === 'user') {
      const content =
        systemMessage && googleMessages.length === 0
          ? `${systemMessage}\n\n${message.content as string}`
          : (message.content as string);
      googleMessages.push({
        role: 'user',
        parts: [{ text: content }],
      });
      systemMessage = ''; // Clear system message after first use
    } else if (message.role === 'assistant') {
      googleMessages.push({
        role: 'model',
        parts: [{ text: message.content as string }],
      });
    }
  }

  // If we only have a system message and no user messages, create a user message
  if (systemMessage && googleMessages.length === 0) {
    googleMessages.push({
      role: 'user',
      parts: [{ text: systemMessage }],
    });
  }

  return googleMessages;
}

export type GetAIResponseFunction = (
  messages: ChatCompletionMessageParam[],
  gameId: string,
  playerId: string,
  settings: {
    model: string;
    temperature?: number;
    max_tokens?: number;
    presence_penalty?: number;
    response_format?: { type: 'text' | 'json_object' };
  }
) => Promise<string>;

export type GetStructuredAIResponseFunction = (
  messages: ChatCompletionMessageParam[],
  gameId: string,
  playerId: string,
  functionName: string,
  functionDescription: string,
  responseSchema: Record<string, { type: string; description?: string }>,
  settings: {
    model: string;
    temperature?: number;
    max_tokens?: number;
  }
) => Promise<Record<string, unknown>>;

export const getAIResponse: GetAIResponseFunction = async (
  messages,
  gameId,
  playerId,
  settings
) => {
  if (!apiKey) {
    throw new Error(
      'Gemini API key not configured. Please set GEMINI_API_KEY in your environment variables.'
    );
  }

  const genAI = getGoogleAIInstance();

  console.log(
    `[Gemini Request - ${gameId}|${playerId}] Calling model ${
      settings.model
    } (Temp: ${settings.temperature ?? 'default'})...`
  );

  try {
    const googleMessages = convertOpenAIMessagesToGoogle(messages);

    // Create generation config
    const generationConfig: {
      temperature?: number;
      maxOutputTokens?: number;
      responseMimeType?: string;
    } = {
      temperature: settings.temperature ?? 0.7,
      maxOutputTokens: settings.max_tokens ?? 8192,
    };

    // Add JSON response format if requested
    if (settings.response_format?.type === 'json_object') {
      generationConfig.responseMimeType = 'application/json';
    }

    const model = genAI.getGenerativeModel({
      model: settings.model,
      generationConfig,
    });

    // If we have multiple messages, use chat
    if (googleMessages.length > 1) {
      const chat = model.startChat({
        history: googleMessages.slice(0, -1),
      });

      const lastMessage = googleMessages[googleMessages.length - 1];
      const result = await chat.sendMessage(lastMessage.parts[0].text);
      const responseContent = result.response.text();

      if (!responseContent) {
        throw new Error(
          `Empty response from Gemini API. Model: ${settings.model}, Game: ${gameId}, Player: ${playerId}`
        );
      }

      console.log(
        `[Gemini Response - ${gameId}|${playerId}] Received content (length: ${responseContent.length}).`
      );
      return responseContent;
    }

    // Single message
    const result = await model.generateContent(googleMessages[0].parts[0].text);
    const responseContent = result.response.text();

    if (!responseContent) {
      throw new Error(
        `Empty response from Gemini API. Model: ${settings.model}, Game: ${gameId}, Player: ${playerId}`
      );
    }

    console.log(
      `[Gemini Response - ${gameId}|${playerId}] Received content (length: ${responseContent.length}).`
    );
    return responseContent;
  } catch (error: unknown) {
    const modelName = settings.model;
    let errorMessage = 'Unknown error';
    let errorType = 'UNKNOWN_ERROR';

    if (error instanceof Error) {
      errorMessage = error.message;

      // Categorize error types for better handling
      if (
        error.message.includes('API key not valid') ||
        error.message.includes('401')
      ) {
        errorType = 'AUTHENTICATION_ERROR';
        errorMessage =
          'Invalid API key. Please check your GEMINI_API_KEY configuration.';
      } else if (
        error.message.includes('429') ||
        error.message.includes('quota')
      ) {
        errorType = 'RATE_LIMIT_ERROR';
        errorMessage =
          'Rate limit or quota exceeded. Please try again later or check your Google AI quota.';
      } else if (error.message.includes('timeout')) {
        errorType = 'TIMEOUT_ERROR';
        errorMessage = `Request timed out. The Gemini API may be experiencing high load.`;
      } else if (
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('network')
      ) {
        errorType = 'CONNECTION_ERROR';
        errorMessage =
          'Cannot connect to Gemini API. Please check your internet connection.';
      } else if (error.message.includes('model')) {
        errorType = 'MODEL_ERROR';
        errorMessage = `Invalid model "${modelName}". Please check if this model is available in your region.`;
      } else if (
        error.message.includes('safety') ||
        error.message.includes('blocked')
      ) {
        errorType = 'SAFETY_ERROR';
        errorMessage =
          'Response blocked by safety filters. The content may violate usage policies.';
      } else if (
        error.message.includes('context') ||
        error.message.includes('token')
      ) {
        errorType = 'CONTEXT_LENGTH_ERROR';
        errorMessage =
          "Message too long. The conversation exceeds Gemini's context window.";
      }
    }

    console.error(
      `[Gemini Error - ${gameId}|${playerId}] ${errorType} for model ${modelName}: ${errorMessage}`
    );

    // Create a more informative error
    const detailedError = new Error(errorMessage);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (detailedError as any).type = errorType;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (detailedError as any).model = modelName;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (detailedError as any).originalError = error;

    throw detailedError;
  }
};

export const getStructuredAIResponse: GetStructuredAIResponseFunction = async (
  messages,
  gameId,
  playerId,
  functionName,
  functionDescription,
  responseSchema,
  settings
) => {
  const genAI = getGoogleAIInstance();

  console.log(
    `[Gemini Function Call - ${gameId}|${playerId}] Calling model ${
      settings.model
    } with function ${functionName} (Temp: ${settings.temperature ?? 'default'})...`
  );

  try {
    const googleMessages = convertOpenAIMessagesToGoogle(messages);

    // Define the function declaration for structured response
    const functionDeclaration: FunctionDeclaration = {
      name: functionName,
      description: functionDescription,
      parameters: {
        type: SchemaType.OBJECT,
        properties: Object.fromEntries(
          Object.entries(responseSchema).map(([key, value]) => [
            key,
            {
              type: SchemaType.STRING,
              description: value.description,
            },
          ])
        ),
        required: Object.keys(responseSchema),
      },
    };

    const model = genAI.getGenerativeModel({
      model: settings.model,
      generationConfig: {
        temperature: settings.temperature ?? 0.1,
        maxOutputTokens: settings.max_tokens ?? 8192,
      },
      tools: [
        {
          functionDeclarations: [functionDeclaration],
        } as FunctionDeclarationsTool,
      ],
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingMode.ANY,
          allowedFunctionNames: [functionName],
        },
      },
    });

    // Use single message approach for function calling
    const prompt = googleMessages.map((msg) => msg.parts[0].text).join('\n\n');
    const result = await model.generateContent(prompt);

    const response = result.response;
    const functionCalls = response.functionCalls();

    if (!functionCalls || functionCalls.length === 0) {
      throw new Error('No function calls returned from Gemini.');
    }

    const functionCall = functionCalls[0];
    if (functionCall.name !== functionName) {
      throw new Error(
        `Expected function ${functionName}, got ${functionCall.name}`
      );
    }

    console.log(
      `[Gemini Function Response - ${gameId}|${playerId}] Received structured response for ${functionName}.`
    );

    return functionCall.args as Record<string, unknown>;
  } catch (error: unknown) {
    const modelName = settings.model;
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `[Gemini Function Error - ${gameId}|${playerId}] Failed function call for model ${modelName}:`,
      errorMessage
    );
    throw error;
  }
};
