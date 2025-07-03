import OpenAI from 'openai';
import type { VisibleGameState } from '../interfaces/GameState';
import type { IAgent, PlayerAction } from '../interfaces/IAgent';
import {
  getSystemPrompt,
  getUserPrompt,
  getPersonaGenerationPrompt,
} from '../prompts';
import type { AgentMemory, AIConversationLog } from '../interfaces/AgentMemory';
import { RoleName } from '../interfaces/IRole';
import type { Allegiance } from '../interfaces/IRole';
import * as dotenv from 'dotenv';
import debug from 'debug';
import type { PlayerId } from '../interfaces/IPlayer';
import { Persona, DEFAULT_PERSONA } from '../interfaces/Persona';

// Create a specific debugger instance
const log = debug('mafia:agent:openai');

// Load environment variables
dotenv.config();

// Define default configuration (can be overridden)
const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'; // Use a default model
const DEFAULT_API_BASE =
  process.env.OPENAI_API_BASE || 'https://api.openai.com/v1';
const DEFAULT_API_KEY = process.env.OPENAI_API_KEY; // API key is now explicitly handled

// Configuration for AI conversation logging (disabled by default to keep game saves small)
const ENABLE_VERBOSE_AI_LOGGING =
  process.env.ENABLE_VERBOSE_AI_LOGGING === 'true' || false;

export class OpenAIAgent implements IAgent {
  public readonly id: PlayerId;
  public readonly agentName = 'OpenAIAgent';
  public persona: Persona = DEFAULT_PERSONA;
  private openai: OpenAI;
  protected model: string;
  protected apiBase: string;

  constructor(
    id: PlayerId,
    model: string = DEFAULT_MODEL,
    apiBase: string = DEFAULT_API_BASE,
    apiKey: string | undefined = DEFAULT_API_KEY
  ) {
    this.id = id;
    this.model = model;
    this.apiBase = apiBase;
    this.persona = DEFAULT_PERSONA;

    if (!apiKey) {
      log(
        `WARN: OpenAI Agent ${this.id}: API key for model ${this.model} at ${this.apiBase} is not set. Requests might fail.`
      );
    }

    this.openai = new OpenAI({
      apiKey: apiKey,
      baseURL: this.apiBase,
    });
    log(
      `Initialized OpenAIAgent ${this.id} with model: ${this.model}, endpoint: ${this.apiBase}`
    );
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
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: personaPrompt }],
        temperature: 0.8,
        max_tokens: 400,
        response_format: { type: 'json_object' },
      });

      const responseContent = completion.choices[0]?.message?.content;

      if (!responseContent) {
        log(
          `ERROR: [${agentIdForLog}] Persona generation API response was empty.`
        );
        this.persona = DEFAULT_PERSONA;
        return;
      }

      try {
        const parsedPersona = JSON.parse(responseContent) as Persona;
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
          `ERROR: [${agentIdForLog}] Failed to parse persona JSON response. Error: %O\nRaw Response: ${responseContent}`,
          parseError
        );
        this.persona = DEFAULT_PERSONA;
      }
    } catch (error) {
      log(
        `ERROR: [${agentIdForLog}] API call failed during persona generation: %O`,
        error
      );
      this.persona = DEFAULT_PERSONA; // Fallback on API error
    }
  }

  async getAction(
    gameState: VisibleGameState,
    allowedActions: PlayerAction['type'][]
  ): Promise<PlayerAction> {
    const agentIdForLog = `${this.id} - ${this.persona?.name || 'Unknown Persona'} (${gameState.self.role})`;
    log(`[${agentIdForLog} (OpenAI)] Thinking with model ${this.model}...`);

    const allegiance: Allegiance =
      gameState.self.role === RoleName.Mafia ? 'Mafia' : 'Town';

    const memoryForPrompt: AgentMemory = {
      ...gameState.memory,
      aiConversationLogs: [],
    };

    const promptInputState = {
      round: gameState.round,
      phase: gameState.phase,
      self: {
        ...gameState.self,
        allegiance: allegiance,
        persona: this.persona,
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
      memory: memoryForPrompt,
    };

    const systemPrompt = getSystemPrompt(
      gameState.self.role,
      gameState.themeName || 'Unknown Theme',
      '', // theme description not available in game state
      this.persona,
      gameState.language || 'en'
    );
    const userPrompt = getUserPrompt(promptInputState, allowedActions);

    const memoryForLogging = gameState.memory;

    // Only create detailed log entry if verbose logging is enabled
    const logEntry: Partial<AIConversationLog> = ENABLE_VERBOSE_AI_LOGGING
      ? {
          round: gameState.round,
          phase: gameState.phase,
          timestamp: new Date(),
          model: this.model,
          prompt: { system: systemPrompt, user: userPrompt },
          response: { raw: null, parsedAction: null },
        }
      : {
          round: gameState.round,
          phase: gameState.phase,
          timestamp: new Date(),
          model: this.model,
          prompt: {
            user: '[Game state omitted - enable ENABLE_VERBOSE_AI_LOGGING=true for full prompts]',
          },
          response: { raw: null, parsedAction: null },
        };

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      });

      const responseContent = completion.choices[0]?.message?.content;

      // Store minimal response info unless verbose logging is enabled
      if (ENABLE_VERBOSE_AI_LOGGING) {
        if (logEntry.response) {
          logEntry.response.raw = responseContent;
        }
      } else {
        if (logEntry.response) {
          logEntry.response.raw = responseContent
            ? `[Response omitted - ${responseContent.length} chars]`
            : null;
        }
      }

      if (!responseContent) {
        console.warn(
          `[Agent ${agentIdForLog}] Received empty response from API.`
        );
        if (logEntry.response) {
          logEntry.response.error = 'Empty API response';
        }
        memoryForLogging.aiConversationLogs.push(logEntry as AIConversationLog);
        return { type: 'noAction' };
      }

      try {
        const parsedAction = JSON.parse(responseContent) as PlayerAction;

        if (!allowedActions.includes(parsedAction.type)) {
          console.warn(
            `[Agent ${agentIdForLog}] Received disallowed action type '${parsedAction.type}'. Allowed: ${allowedActions.join(', ')}`
          );
          if (logEntry.response) {
            logEntry.response.parsedAction = parsedAction;
            logEntry.response.error = 'Disallowed action type received';
          }
          memoryForLogging.aiConversationLogs.push(
            logEntry as AIConversationLog
          );
          return { type: 'noAction' };
        }

        if (logEntry.response) {
          logEntry.response.parsedAction = parsedAction;
        }
        memoryForLogging.aiConversationLogs.push(logEntry as AIConversationLog);
        return parsedAction;
      } catch (parseError) {
        console.error(
          `[Agent ${agentIdForLog}] Failed to parse JSON response: ${responseContent}`,
          parseError
        );
        if (logEntry.response) {
          logEntry.response.error = `JSON parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`;
        }
        memoryForLogging.aiConversationLogs.push(logEntry as AIConversationLog);
        return { type: 'noAction' };
      }
    } catch (error) {
      console.error(
        `[Agent ${agentIdForLog}] Error calling OpenAI API (model: ${this.model}, endpoint: ${this.apiBase}):`,
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
