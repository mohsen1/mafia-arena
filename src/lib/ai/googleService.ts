import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

// Load environment variables
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn(
    "Missing GEMINI_API_KEY environment variable. Google AI features will be disabled."
  );
}

function getGoogleAIInstance() {
  if (!apiKey) {
    throw new Error("Google AI client not initialized. Missing GEMINI_API_KEY.");
  }
  return new GoogleGenerativeAI(apiKey);
}

function convertOpenAIMessagesToGoogle(messages: ChatCompletionMessageParam[]): Array<{role: 'user' | 'model', parts: Array<{text: string}>}> {
  const googleMessages: Array<{role: 'user' | 'model', parts: Array<{text: string}>}> = [];
  let systemMessage = '';

  for (const message of messages) {
    if (message.role === 'system') {
      systemMessage = message.content as string;
    } else if (message.role === 'user') {
      const content = systemMessage && googleMessages.length === 0 
        ? `${systemMessage}\n\n${message.content as string}`
        : message.content as string;
      googleMessages.push({
        role: 'user',
        parts: [{ text: content }]
      });
      systemMessage = ''; // Clear system message after first use
    } else if (message.role === 'assistant') {
      googleMessages.push({
        role: 'model',
        parts: [{ text: message.content as string }]
      });
    }
  }

  // If we only have a system message and no user messages, create a user message
  if (systemMessage && googleMessages.length === 0) {
    googleMessages.push({
      role: 'user',
      parts: [{ text: systemMessage }]
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
    response_format?: { type: "text" | "json_object" };
  }
) => Promise<string>;

export const getAIResponse: GetAIResponseFunction = async (
  messages,
  gameId,
  playerId,
  settings
) => {
  const genAI = getGoogleAIInstance();
  
  console.log(
    `[Gemini Request - ${gameId}|${playerId}] Calling model ${
      settings.model
    } (Temp: ${settings.temperature ?? "default"})...`
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
    if (settings.response_format?.type === "json_object") {
      generationConfig.responseMimeType = "application/json";
    }

    const model = genAI.getGenerativeModel({ 
      model: settings.model,
      generationConfig
    });

    // If we have multiple messages, use chat
    if (googleMessages.length > 1) {
      const chat = model.startChat({
        history: googleMessages.slice(0, -1)
      });
      
      const lastMessage = googleMessages[googleMessages.length - 1];
      const result = await chat.sendMessage(lastMessage.parts[0].text);
      const responseContent = result.response.text();
      
      if (!responseContent) {
        throw new Error("Received empty response content from Gemini.");
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
      throw new Error("Received empty response content from Gemini.");
    }

    console.log(
      `[Gemini Response - ${gameId}|${playerId}] Received content (length: ${responseContent.length}).`
    );
    return responseContent;
  } catch (error: unknown) {
    const modelName = settings.model;
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `[Gemini Error - ${gameId}|${playerId}] Failed AI call for model ${modelName}:`,
      errorMessage
    );
    throw error;
  }
}; 