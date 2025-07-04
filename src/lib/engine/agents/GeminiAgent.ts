import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from '@google/generative-ai';
import type { IAgent, PlayerAction } from '../interfaces/IAgent';
import type { VisibleGameState } from '../interfaces/GameState';
import type { PlayerId } from '../interfaces/IPlayer';
import {
  getSystemPrompt,
  getUserPrompt,
  getPersonaGenerationPrompt,
} from '../prompts'; // Added getPersonaGenerationPrompt
import { DEFAULT_PERSONA } from '../interfaces/Persona'; // Import the value
import type { Persona } from '../interfaces/Persona'; // Import the type
import * as dotenv from 'dotenv'; // Import dotenv
import debug from 'debug'; // Import debug
import { RoleName, type Allegiance } from '../interfaces/IRole'; // Import RoleName and Allegiance
import type { AgentMemory, AIConversationLog } from '../interfaces/AgentMemory'; // Import AgentMemory and AIConversationLog

// Create a specific debugger instance
const log = debug('mafia:agent:gemini');

// Load environment variables from .env file
dotenv.config();

// Ensure API key is set in environment variables
if (!process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY environment variable is not set.');
}

// Access your API key as an environment variable
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Define the model to use (updated to Gemini 2.0 Flash)
// Consider making this configurable via environment variable GEMINI_MODEL
const defaultModelName = 'gemini-2.0-flash'; // Default model

// Configuration for AI conversation logging (disabled by default to keep game saves small)
const ENABLE_VERBOSE_AI_LOGGING =
  process.env.ENABLE_VERBOSE_AI_LOGGING === 'true' || false;

// Configure safety settings to be less restrictive for game context
// Adjust these as needed, but be aware of potential harmful content generation
const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
];

export class GeminiAgent implements IAgent {
  public readonly id: PlayerId; // Added readonly id
  public readonly agentName = 'GeminiAgent'; // Added agentName
  public persona: Persona = DEFAULT_PERSONA; // Initialize with default
  private modelName: string;

  constructor(id: PlayerId, model?: string) {
    // Accept id
    this.id = id;
    this.modelName = model || process.env.GEMINI_MODEL || defaultModelName; // Use env var if set
    this.persona = DEFAULT_PERSONA; // Ensure initialized
    log(`Initialized GeminiAgent ${this.id} with model: ${this.modelName}`);
  }

  async generatePersona(
    themeDescription: string,
    language?: string,
    existingNames?: string[]
  ): Promise<void> {
    const agentIdForLog = `${this.id} (Persona Gen)`;
    log(
      `[${agentIdForLog}] Generating persona with theme: ${themeDescription}, language: ${language || 'en'}, avoiding names: ${existingNames?.join(', ') || 'none'}`
    );

    const personaPrompt = getPersonaGenerationPrompt(
      themeDescription,
      language,
      existingNames
    );

    try {
      const model = genAI.getGenerativeModel({
        model: this.modelName,
        safetySettings,
        // Specify JSON output mode
        generationConfig: { responseMimeType: 'application/json' },
      });

      const result = await model.generateContent(personaPrompt);
      const response = result.response;
      const responseText = response.text();

      if (!responseText) {
        log(
          `ERROR: [${agentIdForLog}] Persona generation API response was empty.`
        );
        this.persona = DEFAULT_PERSONA;
        return;
      }

      try {
        const parsedPersona = JSON.parse(responseText) as Persona;
        // Basic validation
        if (
          typeof parsedPersona.name === 'string' &&
          typeof parsedPersona.backstory === 'string' &&
          Array.isArray(parsedPersona.personalityTraits) &&
          parsedPersona.personalityTraits.every((t) => typeof t === 'string')
        ) {
          this.persona = parsedPersona;
          log(
            `[${agentIdForLog}] Successfully generated persona: ${this.persona.name}`
          );
        } else {
          log(
            `ERROR: [${agentIdForLog}] Parsed persona JSON has invalid structure: %o`,
            parsedPersona
          );
          this.persona = DEFAULT_PERSONA;
        }
      } catch (parseError) {
        log(
          `ERROR: [${agentIdForLog}] Failed to parse persona JSON response. Error: %O\nRaw Response: ${responseText}`,
          parseError
        );
        this.persona = DEFAULT_PERSONA;
      }
    } catch (error) {
      log(
        `ERROR: [${agentIdForLog}] API call failed during persona generation: %O`,
        error
      );
      this.persona = DEFAULT_PERSONA;
    }
  }

  async getAction(
    gameState: VisibleGameState,
    allowedActions?: PlayerAction['type'][]
  ): Promise<PlayerAction> {
    const agentIdForLog = `${this.id} - ${this.persona?.name || 'Unknown Persona'} (${gameState.self.role})`;
    log(`[${agentIdForLog} (Gemini)] Thinking with model ${this.modelName}...`);

    // 🎯 ENHANCED LOGGING: Log allowed actions
    log(
      `[${agentIdForLog} (Gemini)] Allowed actions: ${allowedActions ? allowedActions.join(', ') : 'none'}`
    );
    log(
      `[${agentIdForLog} (Gemini)] Current phase: ${gameState.phase}, Round: ${gameState.round}`
    );

    // Determine allegiance
    const allegiance: Allegiance =
      gameState.self.role === RoleName.Mafia ? 'Mafia' : 'Town';

    // Prepare memory for prompt: Create a copy and replace AI logs with empty array
    const memoryForPrompt: AgentMemory = {
      ...gameState.memory,
      aiConversationLogs: [], // Replace with empty array for the prompt
    };

    // Prepare state for the prompt, converting Set to Array and adding allegiance
    const promptInputState = {
      round: gameState.round,
      phase: gameState.phase,
      self: {
        ...gameState.self,
        allegiance: allegiance,
        persona: this.persona, // Pass generated persona to prompt
      },
      alivePlayerIds: Array.from(gameState.alivePlayerIds),
      players: gameState.players.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
      })),
      language: gameState.language,
      mafiaPlayerIds: gameState.self.isMafia
        ? Array.from(gameState.mafiaPlayerIds ?? [])
        : undefined,
      themeName: gameState.themeName,
      // Pass the filtered memory to the prompt generation
      memory: memoryForPrompt,
    };

    const systemPrompt = getSystemPrompt(
      gameState.self.role,
      gameState.themeName || 'Unknown Theme',
      '', // Theme description not available in gameState
      this.persona,
      gameState.language || 'en'
    );
    // Pass the modified state with the array to getUserPrompt
    const userPrompt = getUserPrompt(promptInputState, allowedActions);
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

    // Use original memory for logging the current AI conversation
    const memoryForLogging = gameState.memory;

    // Create log entry for AI conversation history
    const logEntry: Partial<AIConversationLog> = ENABLE_VERBOSE_AI_LOGGING
      ? {
          round: gameState.round,
          phase: gameState.phase,
          timestamp: new Date(),
          model: this.modelName,
          prompt: { system: systemPrompt, user: userPrompt },
          response: { raw: null, parsedAction: null },
        }
      : {
          round: gameState.round,
          phase: gameState.phase,
          timestamp: new Date(),
          model: this.modelName,
          prompt: {
            user: '[Game state omitted - enable ENABLE_VERBOSE_AI_LOGGING=true for full prompts]',
          },
          response: { raw: null, parsedAction: null },
        };

    try {
      const model = genAI.getGenerativeModel({
        model: this.modelName,
        safetySettings,
        // Specify JSON output mode if supported and desired
        // generationConfig: { responseMimeType: "application/json" }
      });

      const result = await model.generateContent(fullPrompt);
      const response = result.response;
      const responseText = response.text();

      // Store minimal response info unless verbose logging is enabled
      if (ENABLE_VERBOSE_AI_LOGGING) {
        if (logEntry.response) {
          logEntry.response.raw = responseText;
        }
      } else {
        if (logEntry.response) {
          logEntry.response.raw = responseText
            ? `[Response omitted - ${responseText.length} chars]`
            : null;
        }
      }

      // 🎯 ENHANCED LOGGING: Log raw API response
      log(
        `[${agentIdForLog} (Gemini)] Raw API response (${responseText ? responseText.length : 0} chars): ${responseText || '(empty)'}`
      );

      if (!responseText) {
        log(`ERROR: [${agentIdForLog} (Gemini)] API response was empty.`);
        if (logEntry.response) {
          logEntry.response.error = 'Empty API response';
        }
        memoryForLogging.aiConversationLogs.push(logEntry as AIConversationLog);
        return { type: 'noAction' };
      }

      // Attempt to extract JSON from the response (Gemini might add markdown backticks)
      let potentialJson = responseText.trim();
      if (potentialJson.startsWith('```json')) {
        potentialJson = potentialJson.substring(7);
      }
      if (potentialJson.endsWith('```')) {
        potentialJson = potentialJson.substring(0, potentialJson.length - 3);
      }
      potentialJson = potentialJson.trim(); // Trim again after removing backticks

      // 🎯 ENHANCED LOGGING: Log cleaned JSON before parsing
      log(
        `[${agentIdForLog} (Gemini)] Cleaned JSON for parsing: ${potentialJson}`
      );

      // Parse and validate the action
      let action: PlayerAction;
      try {
        action = JSON.parse(potentialJson) as PlayerAction;
        // 🎯 ENHANCED LOGGING: Log successfully parsed action
        log(
          `[${agentIdForLog} (Gemini)] Successfully parsed action: ${JSON.stringify(action)}`
        );
      } catch (parseError) {
        log(
          `ERROR: [${agentIdForLog} (Gemini)] Failed to parse JSON response: ${potentialJson} %O`,
          parseError
        );
        if (logEntry.response) {
          logEntry.response.error = `JSON parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`;
        }
        memoryForLogging.aiConversationLogs.push(logEntry as AIConversationLog);
        return { type: 'noAction' };
      }

      // Validate action type
      if (!allowedActions || allowedActions.length === 0) {
        if (action.type !== 'noAction') {
          log(
            `WARN: [${agentIdForLog} (Gemini)] Action type '${action.type}' is not allowed (no actions specified). Defaulting to noAction.`
          );
          if (logEntry.response) {
            logEntry.response.parsedAction = action;
            logEntry.response.error = 'No actions allowed but action requested';
          }
          memoryForLogging.aiConversationLogs.push(
            logEntry as AIConversationLog
          );
          return { type: 'noAction' };
        }
      } else {
        // 🎯 FIX: Validate that the action type is in the allowed actions list
        if (!allowedActions.includes(action.type)) {
          log(
            `WARN: [${agentIdForLog} (Gemini)] Action type '${action.type}' is not in allowed actions: ${allowedActions.join(', ')}. Defaulting to noAction.`
          );
          if (logEntry.response) {
            logEntry.response.parsedAction = action;
            logEntry.response.error = 'Disallowed action type received';
          }
          memoryForLogging.aiConversationLogs.push(
            logEntry as AIConversationLog
          );
          return { type: 'noAction' };
        }
      }

      // Success - log the action and store in memory
      if (logEntry.response) {
        logEntry.response.parsedAction = action;
      }
      memoryForLogging.aiConversationLogs.push(logEntry as AIConversationLog);

      log(
        `[${agentIdForLog} (Gemini)] Successfully chose action: ${action.type}${action.type === 'message' ? ` with content: "${action.content}"` : ''}`
      );
      return action;
    } catch (error) {
      log(
        `ERROR: [${agentIdForLog} (Gemini)] API call failed during action generation: %O`,
        error
      );
      if (logEntry.response) {
        logEntry.response.raw = null;
        logEntry.response.error = `API call failed: ${error instanceof Error ? error.message : String(error)}`;
      }
      memoryForLogging.aiConversationLogs.push(logEntry as AIConversationLog);
      return { type: 'noAction' };
    }
  }
}
