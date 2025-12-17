import { OpenAIAgent } from './OpenAIAgent';
import type { PlayerId } from '../interfaces/IPlayer';
import type { VisibleGameState } from '../interfaces/GameState';
import type { PlayerAction } from '../interfaces/IAgent';
import debug from 'debug';

// Create a specific debugger instance
const log = debug('mafia:agent:ollama');

// Default Ollama configuration
const DEFAULT_OLLAMA_MODEL = 'llama3.2';
const DEFAULT_OLLAMA_ENDPOINT = 'http://localhost:11434/v1';

interface OllamaModel {
  name: string;
  model: string;
  size: number;
  digest: string;
  details: {
    format: string;
    family: string;
    parameter_size: string;
    quantization_level: string;
  };
}

export class OllamaAgent extends OpenAIAgent {
  private ollamaEndpoint: string;
  private availableModels: string[] = [];
  private lastModelCheck: number = 0;
  private readonly MODEL_CHECK_INTERVAL = 60000; // Check models every minute
  private connectionRetries = 0;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 2000; // 2 seconds
  private isConnected = false;

  constructor(
    id: PlayerId,
    model: string = DEFAULT_OLLAMA_MODEL,
    apiBase: string = DEFAULT_OLLAMA_ENDPOINT,
    apiKey?: string
  ) {
    // Ollama doesn't need an API key
    super(id, model, apiBase, apiKey || 'ollama-no-key-needed');

    // Store the base Ollama endpoint (without /v1)
    this.ollamaEndpoint = apiBase.replace('/v1', '');

    log(
      `Initialized OllamaAgent ${this.id} with model: ${model}, endpoint: ${apiBase}`
    );

    // Check available models on initialization
    this.checkAvailableModels().catch((error) => {
      log(`ERROR: Failed to check available models: ${error}`);
    });
  }

  /**
   * Check which models are available in the local Ollama instance
   */
  private async checkAvailableModels(): Promise<void> {
    try {
      const response = await fetch(`${this.ollamaEndpoint}/api/tags`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      this.availableModels = data.models?.map((m: OllamaModel) => m.name) || [];
      this.lastModelCheck = Date.now();

      log(`Available Ollama models: ${this.availableModels.join(', ')}`);

      // Check if the requested model is available
      if (!this.isModelAvailable(this.model)) {
        log(
          `WARNING: Requested model '${this.model}' is not available. Available models: ${this.availableModels.join(', ')}`
        );
      }
    } catch (error) {
      log(`ERROR: Failed to fetch available models: ${error}`);
      // Don't throw, just log the error
    }
  }

  /**
   * Check if a model is available
   */
  private isModelAvailable(modelName: string): boolean {
    // Refresh model list if it's been a while
    if (Date.now() - this.lastModelCheck > this.MODEL_CHECK_INTERVAL) {
      this.checkAvailableModels().catch((error) => {
        log(`ERROR: Failed to refresh model list: ${error}`);
      });
    }

    return this.availableModels.some(
      (m) =>
        m === modelName ||
        m.startsWith(modelName + ':') ||
        modelName.startsWith(m + ':')
    );
  }

  /**
   * Pull a model if it's not available
   */
  public async ensureModelAvailable(modelName: string): Promise<boolean> {
    await this.checkAvailableModels();

    if (this.isModelAvailable(modelName)) {
      log(`Model '${modelName}' is already available`);
      return true;
    }

    log(`Model '${modelName}' not found. Attempting to pull...`);

    try {
      const response = await fetch(`${this.ollamaEndpoint}/api/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: modelName,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      log(`Successfully pulled model '${modelName}'`);

      // Refresh the model list
      await this.checkAvailableModels();

      return true;
    } catch (error) {
      log(`ERROR: Failed to pull model '${modelName}': ${error}`);
      return false;
    }
  }

  /**
   * Get Ollama-specific information
   */
  public async getOllamaInfo(): Promise<{
    version?: string;
    models: string[];
    endpoint: string;
  }> {
    await this.checkAvailableModels();

    return {
      models: this.availableModels,
      endpoint: this.ollamaEndpoint,
    };
  }

  /**
   * Check if Ollama service is running with retry logic
   */
  private async checkConnection(): Promise<boolean> {
    for (let i = 0; i < this.MAX_RETRIES; i++) {
      try {
        const response = await fetch(`${this.ollamaEndpoint}/api/tags`, {
          signal: AbortSignal.timeout(5000), // 5 second timeout
        });

        if (response.ok) {
          this.isConnected = true;
          this.connectionRetries = 0;
          return true;
        }
      } catch (error) {
        log(`Connection attempt ${i + 1} failed: ${error}`);
        if (i < this.MAX_RETRIES - 1) {
          await new Promise((resolve) => setTimeout(resolve, this.RETRY_DELAY));
        }
      }
    }

    this.isConnected = false;
    return false;
  }

  /**
   * Override to add Ollama-specific error handling
   */
  async generatePersona(
    themeDescription: string,
    language?: string,
    existingNames?: string[]
  ): Promise<void> {
    try {
      // Check if Ollama is running with retries
      const isRunning = await this.checkConnection();

      if (!isRunning) {
        throw new Error('Ollama service is not responding after retries');
      }

      // For Ollama, use a simpler prompt that's more likely to work with local models
      const simplePrompt = `Generate a character for a Mafia game set in: ${themeDescription}

Create a JSON object with these fields:
- name: A unique character name
- backstory: One sentence about the character
- personalityTraits: Array of 3-4 personality traits

Example:
{"name": "Thomas Baker", "backstory": "A gruff but honest blacksmith who has lived in the village for decades.", "personalityTraits": ["Honest", "Gruff", "Hardworking", "Suspicious"]}

Respond with ONLY the JSON object, no other text.`;

      try {
        const response = await fetch(`${this.apiBase}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ollama-no-key-needed`,
          },
          body: JSON.stringify({
            model: this.model,
            messages: [{ role: 'user', content: simplePrompt }],
            temperature: 0.7,
            max_tokens: 200,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (content) {
          // Try to extract JSON from the response
          let jsonStr = content.trim();

          // Remove markdown code blocks if present
          jsonStr = jsonStr.replace(/```json\s*/g, '').replace(/```\s*/g, '');

          // Try to find JSON object in the response
          const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            jsonStr = jsonMatch[0];
          }

          try {
            const persona = JSON.parse(jsonStr);

            // Validate the persona
            if (
              persona.name &&
              persona.backstory &&
              Array.isArray(persona.personalityTraits)
            ) {
              // Check for duplicate names
              if (existingNames?.includes(persona.name)) {
                // Generate a unique variant
                persona.name = `${persona.name} ${this.id.slice(-4)}`;
              }

              this.persona = persona;
              log(
                `Successfully generated Ollama persona: ${this.persona.name}`
              );
              return;
            }
          } catch (parseError) {
            log(`Failed to parse Ollama response as JSON: ${parseError}`);
          }
        }
      } catch (apiError) {
        log(`Ollama API error: ${apiError}`);
      }

      // If we get here, use fallback persona generation
      const fallbackNames = [
        'Thomas',
        'Mary',
        'John',
        'Elizabeth',
        'William',
        'Margaret',
        'James',
        'Sarah',
        'George',
        'Alice',
        'Charles',
        'Emma',
      ];

      let name =
        fallbackNames[Math.floor(Math.random() * fallbackNames.length)];
      const suffix = this.id.slice(-4);

      // Ensure uniqueness
      if (existingNames?.some((n) => n.startsWith(name))) {
        name = `${name} ${suffix}`;
      }

      this.persona = {
        name,
        backstory: `A long-time resident of ${themeDescription}.`,
        personalityTraits: ['Cautious', 'Observant', 'Thoughtful'],
      };

      log(`Using fallback persona for Ollama: ${this.persona.name}`);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('fetch') || error.message.includes('Ollama'))
      ) {
        log(
          `ERROR: Cannot connect to Ollama. Make sure Ollama is running (ollama serve)`
        );
        // Use default persona
        this.persona = {
          name: `Player ${this.id.slice(-4)}`,
          backstory: `A mysterious resident of ${themeDescription}.`,
          personalityTraits: ['Cautious', 'Observant', 'Thoughtful'],
        };
      } else {
        throw error;
      }
    }
  }

  /**
   * Override getAction to add connection recovery
   */
  async getAction(
    gameState: VisibleGameState,
    allowedActions: PlayerAction['type'][]
  ): Promise<PlayerAction> {
    try {
      // Check connection before making request
      if (!this.isConnected) {
        const isRunning = await this.checkConnection();
        if (!isRunning) {
          log('ERROR: Ollama is not available. Returning noAction.');
          return { type: 'noAction' };
        }
      }

      return await super.getAction(gameState, allowedActions);
    } catch (error) {
      // If it's a connection error, try to reconnect
      if (
        error instanceof Error &&
        (error.message.includes('fetch') ||
          error.message.includes('ECONNREFUSED'))
      ) {
        log('Connection lost to Ollama. Attempting to reconnect...');
        this.isConnected = false;

        const isRunning = await this.checkConnection();
        if (isRunning) {
          // Retry the action
          return await super.getAction(gameState, allowedActions);
        }
      }

      log(`ERROR: Failed to get action: ${error}`);
      return { type: 'noAction' };
    }
  }
}
