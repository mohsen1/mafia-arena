import type { PlayerId, PublicPlayerInfo } from '../interfaces/IPlayer';
import { Player } from './Player';
import type { IGamePhase, GamePhaseType } from '../interfaces/IGamePhase';
import { InitializationPhase } from '../phases/InitializationPhase';
import { DayPhase } from '../phases/DayPhase';
import { NightPhase } from '../phases/NightPhase';
import { GameOverPhase } from '../phases/GameOverPhase';
import { CharacterGenerationPhase } from '../phases/CharacterGenerationPhase';
import type { IGameRenderer } from '../interfaces/IGameRenderer';
import { ConversationLog } from './ConversationLog';
import { type IMessage, MessageVisibility } from '../interfaces/IMessage';
import { Message } from './Message';
import type { VisibleGameState } from '../interfaces/GameState';
import { RoleName, type IRole, type Allegiance } from '../interfaces/IRole';
import { v4 as uuidv4 } from 'uuid';
import type { IAgent, PlayerAction } from '../interfaces/IAgent';
import { HumanAgent } from '../agents/HumanAgent';
import { type GameTheme } from '../interfaces/Theme';
import {
  getThemeWithFallback,
  getThemes,
  hasTheme,
} from '@/lib/utils/themeLoader';
import {
  type AgentMemory,
  createInitialMemory,
} from '../interfaces/AgentMemory';
import { DEFAULT_PERSONA } from '../interfaces/Persona';

import type {
  SerializableGameState,
  SerializablePlayer,
  AgentConfig,
} from '../../interfaces/persistence.types';
import { createAgentInstance } from '@/lib/agentFactory';
import { MafiaRole } from '../roles/MafiaRole';
import { VillagerRole } from '../roles/VillagerRole';
import { DoctorRole } from '../roles/DoctorRole';
import { SeerRole } from '../roles/SeerRole';
import type { PendingHumanAction } from '../../interfaces/actions.types';
import type { LanguageName } from '../../i18n/settings';
import type { HumanActionPayload } from '../../interfaces/actions.types';

import { OpenAIAgent } from '../agents/OpenAIAgent';
import { GeminiAgent } from '../agents/GeminiAgent';
import { ClaudeAgent } from '../agents/ClaudeAgent';

const roleClassMap: Record<RoleName, new () => IRole> = {
  [RoleName.Mafia]: MafiaRole,
  [RoleName.Villager]: VillagerRole,
  [RoleName.Doctor]: DoctorRole,
  [RoleName.Seer]: SeerRole,
};

// Allow null for unimplemented phases
// For GameOverPhase, it takes an optional winner. Other phases might take other specific args or none.
// Using a more general type that can encompass these variations.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PhaseConstructor = (new (...args: any[]) => IGamePhase) | null;

const phaseInstanceMap: Record<GamePhaseType, PhaseConstructor> = {
  CharacterGeneration: CharacterGenerationPhase,
  Init: InitializationPhase,
  Briefing: null,
  FirstNight: null,
  Day: DayPhase,
  Night: NightPhase,
  GameOver: GameOverPhase,
};

function getAgentConfigFromInstance(agent: IAgent): AgentConfig {
  if (agent instanceof OpenAIAgent) {
    let providerValue = 'openai';
    let agentTypeValue = 'OpenAI';
    const agentAny = agent as unknown as { apiBase?: string; model?: string };
    const endpoint = agentAny.apiBase;
    const modelName = agentAny.model;

    if (endpoint?.includes('groq.com')) {
      providerValue = 'groq';
      agentTypeValue = 'Groq';
    }
    if (endpoint?.includes('localhost:11434')) {
      providerValue = 'ollama_local';
      agentTypeValue = 'Ollama';
    }
    if (endpoint?.includes('fireworks.ai')) {
      providerValue = 'fireworks';
      agentTypeValue = 'Fireworks';
    }

    return { agentType: agentTypeValue, modelName, providerValue };
  }
  if (agent instanceof GeminiAgent) {
    const agentAny = agent as unknown as { modelName?: string };
    const modelName = agentAny.modelName;
    return { agentType: 'Gemini', modelName, providerValue: 'gemini' };
  }
  if (agent instanceof ClaudeAgent) {
    const agentAny = agent as unknown as { model?: string };
    const modelName = agentAny.model;
    return { agentType: 'Claude', modelName, providerValue: 'claude' };
  }
  if (agent instanceof HumanAgent) {
    return { agentType: 'Human' };
  }
  return { agentType: 'Dummy' };
}

export class Game {
  public id: string;
  #players = new Map<PlayerId, Player>();
  #currentState: IGamePhase;
  #renderers: IGameRenderer[] = [];
  #conversationLog = new ConversationLog();
  #round = 0;
  #humanPlayerId: PlayerId | null = null;
  #lastPhaseResults: SerializableGameState['_phaseResults'] = {};
  public language: LanguageName;
  public theme: GameTheme;
  #agentMemories = new Map<PlayerId, AgentMemory>();
  #createdAt: number;
  #pendingHumanAction: PendingHumanAction | null = null;
  #humanVotes: Map<PlayerId, PlayerId | null> = new Map();
  #humanNightActions: Map<PlayerId, HumanActionPayload> = new Map();
  #phaseStep = 'Start';
  #nextPlayerIndexToAction = 0;
  #winningTeam: 'Mafia' | 'Town' | null = null;
  #rolesAssigned = false;
  #personasGenerated = false;
  #initialMemoriesCreated = false;
  #phaseState: SerializableGameState['_phaseState'] = {};

  private constructor(
    playerSetups:
      | { name: string; agent: IAgent; role: IRole; imageUrl?: string | null }[]
      | null, // null for loading
    themeKey: string,
    language: LanguageName,
    gameId?: string,
    createdAt?: number
  ) {
    this.id = gameId || uuidv4();
    this.theme = getThemeWithFallback(themeKey);
    if (!hasTheme(themeKey)) {
      console.warn(`Theme key ${themeKey} not found, using default theme`);
    }
    this.language = language;
    this.#createdAt = createdAt || Date.now();

    // Default initializations for all instances
    this.#players = new Map<PlayerId, Player>();
    this.#agentMemories = new Map<PlayerId, AgentMemory>();
    this.#renderers = [];
    this.#conversationLog = new ConversationLog();
    this.#round = 0;
    this.#humanPlayerId = null;
    this.#lastPhaseResults = {};
    this.#pendingHumanAction = null;
    this.#humanVotes = new Map();
    this.#humanNightActions = new Map();
    this.#phaseStep = 'Start';
    this.#nextPlayerIndexToAction = 0;
    this.#winningTeam = null;
    this.#rolesAssigned = false;
    this.#personasGenerated = false;
    this.#initialMemoriesCreated = false;
    this.#phaseState = {};
    this.#currentState = new InitializationPhase(); // Default, will be overridden by loadFromState if applicable

    if (playerSetups) {
      // This is a new game creation
      if (playerSetups.length < 3) {
        throw new Error('Not enough players to start a new game (minimum 3).');
      }

      playerSetups.forEach((setup, index) => {
        const sanitizedName = setup.name
          .toLowerCase()
          .replace(/"/g, '')
          .replace(/\s+/g, '-');
        const roleNameStr = setup.role.name.toString().toLowerCase();
        const playerId: PlayerId = `player-${index + 1}-${roleNameStr}-${sanitizedName}`;

        const agentConfig = getAgentConfigFromInstance(setup.agent);

        const player = new Player(
          playerId,
          setup.name,
          setup.role,
          setup.agent,
          agentConfig,
          setup.imageUrl /* Using the imageUrl from setup */
        );
        this.#players.set(playerId, player);
        this.#agentMemories.set(playerId, createInitialMemory());
        if (setup.agent instanceof HumanAgent) {
          if (this.#humanPlayerId)
            console.warn('Multiple HumanAgents detected.');
          this.#humanPlayerId = playerId;
        }
      });

      this.#rolesAssigned = true;
      this.#personasGenerated = false;
      this.#initialMemoriesCreated = false;

      console.log(`New game ${this.id} created.`);
    } else {
      // This is for loading, most fields will be set by loadFromState after this constructor
      console.log(`Game shell ${this.id} created for loading.`);
    }
  }

  public static createNewGame(
    playerSetups: {
      name: string;
      agent: IAgent;
      role: IRole;
      imageUrl?: string | null;
    }[],
    themeKey = 'UK_VILLAGE_1900S',
    language: LanguageName = 'en'
  ): Game {
    return new Game(playerSetups, themeKey, language);
  }

  public static async loadFromState(
    state: SerializableGameState
  ): Promise<Game> {
    const game = new Game(
      null,
      state.themeKey,
      state.language,
      state.gameId,
      state.createdAt
    );

    game.#round = state.round;
    game.#humanPlayerId = state.humanPlayerId;
    game.#lastPhaseResults = state._phaseResults || {};
    game.#phaseStep = state.phaseStep || 'Start';
    game.#nextPlayerIndexToAction = state.nextPlayerIndexToAction ?? 0;
    game.#phaseState = state._phaseState || {};
    const outcome = state.winCondition?.outcome;
    game.#winningTeam =
      outcome === 'Mafia' || outcome === 'Town' ? outcome : null;

    game.#rolesAssigned = state.phase !== 'Init';
    game.#personasGenerated = state.phase !== 'Init';
    game.#initialMemoriesCreated = state.phase !== 'Init';

    for (const pState of Object.values(state.players)) {
      const agentConfig = pState.agentConfig;
      const agent = await createAgentInstance(agentConfig, pState.id);
      const RoleClass = roleClassMap[pState.roleName];
      if (!RoleClass)
        throw new Error(
          `LoadError: Cannot deserialize role: ${pState.roleName}`
        );
      const roleInstance = new RoleClass();

      const player = new Player(
        pState.id,
        pState.name,
        roleInstance,
        agent,
        agentConfig,
        pState.imageUrl
      );
      if (pState.status === 'Dead') player.kill();
      player.agent.persona = pState.persona || DEFAULT_PERSONA;

      game.#players.set(pState.id, player);
      const loadedMemory =
        state.agentMemories[pState.id] || createInitialMemory();
      game.#agentMemories.set(pState.id, loadedMemory);
    }

    for (const msgData of state.conversationLog) {
      const timestampInput = msgData.timestamp as string | number | Date;
      const timestamp =
        timestampInput instanceof Date
          ? timestampInput
          : new Date(timestampInput);

      const message = new Message(
        msgData.round,
        msgData.phase,
        msgData.senderId,
        msgData.senderName,
        msgData.content,
        msgData.visibility,
        msgData.recipientId,
        timestamp
      );
      game.#conversationLog.addMessage(message);
    }

    const PhaseClass = phaseInstanceMap[state.phase];
    if (!PhaseClass)
      throw new Error(`LoadError: Cannot deserialize phase: ${state.phase}`);

    const winnerArg =
      game.#winningTeam === null ? undefined : game.#winningTeam;
    const phaseInstance = game.createPhaseInstance(state.phase, winnerArg);
    if (!phaseInstance)
      throw new Error(
        `LoadError: Failed to create instance for phase ${state.phase}`
      );
    game.#currentState = phaseInstance;
    game.#pendingHumanAction = state.pendingHumanAction || null;

    console.log(
      `Game ${game.id} loaded from state (Round: ${game.#round}, Phase: ${game.#currentState.type})`
    );
    return game;
  }

  public getCurrentSerializableState(
    pendingAction: PendingHumanAction | null = null
  ): SerializableGameState {
    const playersState: Record<PlayerId, SerializablePlayer> = {};
    this.#players.forEach((player, id) => {
      const agentConfig = player.initialAgentConfig;
      playersState[id] = {
        id: player.id,
        name: player.name,
        status: player.status,
        roleName: player.role.name,
        allegiance: player.role.allegiance,
        agentConfig: agentConfig,
        persona: player.agent.persona || DEFAULT_PERSONA,
        isHuman: player.agent instanceof HumanAgent,
        imageUrl: player.imageUrl, // Include imageUrl here
      };
    });

    const agentMemoriesRecord: Record<PlayerId, AgentMemory> = {};
    this.#agentMemories.forEach((memory, id) => {
      agentMemoriesRecord[id] = memory;
    });

    const winCondition = this.#winningTeam
      ? { outcome: this.#winningTeam, message: 'Game Over!' }
      : null;

    const themes = getThemes();
    const themeKey =
      Object.keys(themes).find((key) => themes[key] === this.theme) ||
      'UK_VILLAGE_1900S';

    const serializableLog = this.#conversationLog
      .getAllMessages()
      .map((msg) => ({
        ...msg,
        timestamp: msg.timestamp.toISOString(),
      }));

    const state: SerializableGameState = {
      gameId: this.id,
      createdAt: this.#createdAt,
      updatedAt: Date.now(),
      themeKey: themeKey,
      language: this.language,
      round: this.#round,
      phase: this.getCurrentPhaseType(),
      players: playersState,
      livingPlayerIds: this.getAlivePlayers().map((p) => p.id),
      deadPlayerIds: Array.from(this.#players.values())
        .filter((p) => !p.isAlive())
        .map((p) => p.id),
      conversationLog: serializableLog,
      agentMemories: agentMemoriesRecord,
      winCondition: winCondition,
      humanPlayerId: this.#humanPlayerId,
      pendingHumanAction: pendingAction,
      _phaseResults: this.#lastPhaseResults,
      phaseStep: this.#phaseStep,
      nextPlayerIndexToAction: this.#nextPlayerIndexToAction,
      _phaseState: this.#phaseState,
    };

    return state;
  }

  public getLastPhaseResults(): SerializableGameState['_phaseResults'] {
    return this.#lastPhaseResults;
  }

  public setPhaseResults(
    results: Partial<SerializableGameState['_phaseResults']>
  ): void {
    this.#lastPhaseResults = { ...this.#lastPhaseResults, ...results };
  }

  public getPhaseState(): SerializableGameState['_phaseState'] {
    return this.#phaseState;
  }

  public setPhaseState(
    state: Partial<NonNullable<SerializableGameState['_phaseState']>>
  ): void {
    this.#phaseState = { ...this.#phaseState, ...state };
  }

  addRenderer(renderer: IGameRenderer): void {
    this.#renderers.push(renderer);
  }

  notifyRenderers<T extends keyof IGameRenderer>(
    method: T,
    ...args: unknown[]
  ): void {
    for (const renderer of this.#renderers) {
      if (typeof renderer[method] === 'function') {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (renderer[method] as (...a: any[]) => any)(...args);
        } catch (error) {
          console.error(`Renderer error in method ${String(method)}:`, error);
        }
      }
    }
  }

  logMessage(
    senderId: PlayerId | null,
    content: string,
    visibility: MessageVisibility,
    phaseOverride?: GamePhaseType
  ): IMessage {
    const sender = senderId ? this.#players.get(senderId) : null;
    const message = new Message(
      this.#round,
      phaseOverride ?? this.getCurrentPhaseType(),
      senderId,
      sender ? sender.name : 'System',
      content,
      visibility
    );
    this.#conversationLog.addMessage(message);
    if (visibility === MessageVisibility.Public) {
      this.notifyRenderers('renderMessage', message);
    } else if (visibility === MessageVisibility.Mafia) {
      this.notifyRenderers('renderMessage', message);
    }

    return message;
  }

  async runGameLoop(): Promise<void> {
    console.log('Starting game loop...');
    this.notifyRenderers('renderGameStart', this.getPublicPlayerMap(), this.id);

    let loopIterations = 0;
    const maxLoopIterations = 1000; // Safety limit
    let lastPhaseType = this.getCurrentPhaseType();
    let lastPhaseStep = this.getPhaseStep();
    let lastPlayerIndex = this.getNextPlayerIndexToAction();
    let stuckCounter = 0;
    let lastActionTime = Date.now();

    while (
      this.getCurrentPhaseType() !== 'GameOver' &&
      loopIterations < maxLoopIterations
    ) {
      const currentPhase = this.#currentState;
      const currentPhaseType = currentPhase.type;
      console.log(
        `\n--- Starting Game Loop Iteration: Round ${this.#round}, Phase ${currentPhaseType}, Step ${this.#phaseStep} ---`
      );

      // Special handling for CharacterGeneration phase - pause the loop
      if (currentPhaseType === 'CharacterGeneration') {
        console.log(
          'Game loop paused, waiting for character generation to complete.'
        );
        await currentPhase.runStep(this);
        break; // Exit the loop, character generation will manually advance the phase
      }

      if (currentPhaseType === 'Day' && this.#phaseStep === 'Start') {
        if (this.#round === 0 || this.#currentState.type !== 'Day') {
          this.#round++;
          console.log(`Starting Round ${this.#round}`);
          this.notifyRenderers('renderRoundStart', this.#round);
        }
      }

      this.notifyRenderers('renderPhaseStart', currentPhaseType, this.#round);

      try {
        console.log(`Executing runStep for phase: ${currentPhaseType}`);
        await currentPhase.runStep(this);
        console.log(`Finished runStep for phase: ${currentPhaseType}`);
      } catch (error) {
        console.error(
          `Error during phase step execution (${currentPhaseType}):`,
          error
        );
        this.logEvent(
          `Critical error during ${currentPhaseType} phase step. Game cannot safely continue.`
        );
        this.#winningTeam = null;
        this.advanceToPhase('GameOver', undefined);
        break;
      }

      if (this.getPendingHumanAction()) {
        console.log('Game loop paused, waiting for human action.');
        break;
      }

      const winner = this.checkWinCondition();
      if (winner) {
        console.log(`Win condition met: ${winner} wins.`);
        if (currentPhaseType !== 'GameOver') {
          this.setWinCondition(winner);
          this.advanceToPhase('GameOver', winner);
        } else {
          console.log('Already in GameOver phase. Loop will terminate.');
        }
      } else if (this.#phaseStep === 'Finished') {
        // Only transition when the phase is actually finished
        const nextPhaseType = this.#currentState.transition(this);
        console.log(
          `Transitioning from ${this.#currentState.type} to ${nextPhaseType}`
        );
        this.advanceToPhase(nextPhaseType, undefined);
      }

      // Enhanced safety check for infinite loops
      const currentPhaseTypeAfter = this.getCurrentPhaseType();
      const currentPhaseStepAfter = this.getPhaseStep();
      const currentPlayerIndexAfter = this.getNextPlayerIndexToAction();
      const currentTime = Date.now();

      if (
        lastPhaseType === currentPhaseTypeAfter &&
        lastPhaseStep === currentPhaseStepAfter &&
        lastPlayerIndex === currentPlayerIndexAfter
      ) {
        stuckCounter++;
        const timeSinceLastAction = currentTime - lastActionTime;

        console.warn(
          `Game loop appears stuck: Phase ${currentPhaseTypeAfter}, Step ${currentPhaseStepAfter}, Index ${currentPlayerIndexAfter} (stuck count: ${stuckCounter}, time since last action: ${timeSinceLastAction}ms)`
        );

        // If we're stuck for too long or too many iterations, check if we need to force progress
        if (stuckCounter >= 3 || timeSinceLastAction > 30000) {
          console.warn('Attempting to force progress in stuck game loop...');

          // Try to advance the phase step if possible
          if (this.#phaseStep !== 'Finished' && this.#players.size > 0) {
            const alivePlayers = this.getAlivePlayers();
            if (this.#nextPlayerIndexToAction >= alivePlayers.length) {
              // We've processed all players, move to next step
              console.log('Forcing phase step advancement...');
              this.#phaseStep = 'Finished';
            } else {
              // Skip the current player and move to next
              console.log('Skipping stuck player and moving to next...');
              this.#nextPlayerIndexToAction++;
            }
          } else {
            // Force transition to next phase
            console.error('Game loop is severely stuck. Forcing game over.');
            this.logEvent('Game ended due to infinite loop detection.');
            this.#winningTeam = null;
            this.advanceToPhase('GameOver', undefined);
            break;
          }
        }
      } else {
        stuckCounter = 0; // Reset counter if progress was made
        lastActionTime = currentTime;
      }

      lastPhaseType = currentPhaseTypeAfter;
      lastPhaseStep = currentPhaseStepAfter;
      lastPlayerIndex = currentPlayerIndexAfter;
      loopIterations++;

      // Add a small delay to prevent CPU spinning
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    if (loopIterations >= maxLoopIterations) {
      console.error(
        `Game loop exceeded maximum iterations (${maxLoopIterations}). Forcing game over.`
      );
      this.logEvent('Game ended due to maximum iteration limit.');
      this.#winningTeam = null;
      this.advanceToPhase('GameOver', undefined);
    }

    console.log(
      `--- Game Loop Finished: Phase ${this.getCurrentPhaseType()} ---`
    );
    this.notifyRenderers(
      'renderGameOver',
      this.#winningTeam,
      this.getCurrentSerializableState()
    );
  }

  async runSingleStep(): Promise<void> {
    // Run a single iteration of the game loop
    // This is used when resuming after human actions

    if (this.getCurrentPhaseType() === 'GameOver') {
      console.log('Game is already over, cannot run step.');
      return;
    }

    const currentPhase = this.#currentState;
    const currentPhaseType = currentPhase.type;
    console.log(
      `Running single step: Round ${this.#round}, Phase ${currentPhaseType}, Step ${this.#phaseStep}`
    );

    // Special handling for CharacterGeneration phase
    if (currentPhaseType === 'CharacterGeneration') {
      await currentPhase.runStep(this);
      return;
    }

    // Run the current phase step
    try {
      await currentPhase.runStep(this);
    } catch (error) {
      console.error(
        `Error during single step execution (${currentPhaseType}):`,
        error
      );
      this.logEvent(
        `Critical error during ${currentPhaseType} phase step. Game cannot safely continue.`
      );
      this.#winningTeam = null;
      this.advanceToPhase('GameOver', undefined);
      return;
    }

    // If there's a pending human action, stop here
    if (this.getPendingHumanAction()) {
      console.log('Single step complete, waiting for human action.');
      return;
    }

    // Check win condition
    const winner = this.checkWinCondition();
    if (winner) {
      console.log(`Win condition met: ${winner} wins.`);
      if (currentPhaseType !== 'GameOver') {
        this.setWinCondition(winner);
        this.advanceToPhase('GameOver', winner);
      }
      return;
    }

    // Check if current phase is finished and transition if needed
    if (this.#phaseStep === 'Finished') {
      const nextPhaseType = this.#currentState.transition(this);
      console.log(
        `Phase finished, transitioning from ${this.#currentState.type} to ${nextPhaseType}`
      );
      this.advanceToPhase(nextPhaseType, undefined);
    }
  }

  async ensurePersonasGenerated(): Promise<void> {
    if (this.#personasGenerated) return;

    console.log('Generating personas for all players...');
    const generatedNames: string[] = [];
    const maxRetries = 3;

    // Collect all players that need persona generation
    const playersNeedingPersona: Player[] = [];
    for (const player of this.#players.values()) {
      // Skip human players - they don't need AI-generated personas
      if (player.agent instanceof HumanAgent) {
        generatedNames.push(player.name);
        continue;
      }
      playersNeedingPersona.push(player);
    }

    // Generate personas in parallel
    const personaPromises = playersNeedingPersona.map(async (player) => {
      let attempts = 0;
      let success = false;
      let lastError: string | undefined;

      while (attempts < maxRetries && !success) {
        attempts++;
        try {
          console.log(
            `Generating persona for ${player.name} (attempt ${attempts}/${maxRetries})...`
          );

          // Check if agent has generatePersona method
          if (typeof player.agent.generatePersona !== 'function') {
            console.warn(
              `Agent for ${player.name} does not support persona generation`
            );
            const fallbackName = `${player.name}-${player.id.slice(-4)}`;
            player.agent.persona = {
              ...DEFAULT_PERSONA,
              name: fallbackName,
            };
            return {
              player,
              name: fallbackName,
              success: false,
              error: 'No persona generation support',
            };
          }

          // Generate persona with existing names to avoid duplicates
          // Note: This may still generate duplicates in parallel, but we'll handle that after
          await player.agent.generatePersona(
            this.theme.description,
            this.language,
            [...generatedNames] // Pass a copy of current names
          );

          // Validate persona generation
          if (
            player.agent.persona &&
            player.agent.persona.name &&
            player.agent.persona.name.trim() !== '' &&
            player.agent.persona.name !== DEFAULT_PERSONA.name &&
            player.agent.persona.name !== player.name // Also check it's not the original name
          ) {
            console.log(
              `Successfully generated persona for ${player.name}: ${player.agent.persona.name}`
            );
            success = true;
            return { player, name: player.agent.persona.name, success: true };
          } else {
            console.warn(
              `Player ${player.id} failed to generate valid persona name (attempt ${attempts}/${maxRetries})`
            );
            lastError = 'Failed to generate valid persona';
            if (attempts >= maxRetries) {
              // Failed all attempts
              return {
                player,
                name: player.name,
                success: false,
                error: lastError,
              };
            }
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error(
            `Error generating persona for ${player.name} (attempt ${attempts}/${maxRetries}): ${errorMessage}`
          );

          // Determine error type and provide helpful message
          let userMessage = 'Failed to generate character';
          let errorCode = 'UNKNOWN';

          if (
            errorMessage.includes('401') ||
            errorMessage.includes('authentication') ||
            errorMessage.includes('Unauthorized')
          ) {
            userMessage =
              'Invalid API key. Please check your AI provider settings.';
            errorCode = 'AUTH_ERROR';
          } else if (
            errorMessage.includes('429') ||
            errorMessage.includes('rate') ||
            errorMessage.includes('Too Many Requests')
          ) {
            userMessage =
              'Rate limit exceeded. Please wait a moment and try again.';
            errorCode = 'RATE_LIMIT';
          } else if (
            errorMessage.includes('timeout') ||
            errorMessage.includes('ETIMEDOUT') ||
            errorMessage.includes('ECONNABORTED')
          ) {
            userMessage = 'Request timed out. The AI service may be busy.';
            errorCode = 'TIMEOUT';
          } else if (
            errorMessage.includes('Ollama service is not responding') ||
            errorMessage.includes('ECONNREFUSED') ||
            errorMessage.includes('fetch failed')
          ) {
            userMessage =
              'Ollama service is not responding. Please ensure Ollama is running.';
            errorCode = 'OLLAMA_NOT_RUNNING';
          } else if (
            errorMessage.includes('model') &&
            (errorMessage.includes('not found') ||
              errorMessage.includes('not available'))
          ) {
            userMessage =
              'AI model not found. Please check your model selection.';
            errorCode = 'MODEL_NOT_FOUND';
          } else if (
            errorMessage.includes('quota') ||
            errorMessage.includes('limit exceeded')
          ) {
            userMessage =
              'API quota exceeded. Please check your account limits.';
            errorCode = 'QUOTA_EXCEEDED';
          }

          lastError = `${userMessage} (${errorCode})`;

          if (attempts >= maxRetries) {
            return {
              player,
              name: player.name,
              success: false,
              error: lastError,
            };
          }
        }

        // Add a small delay between retries to avoid rate limits
        if (!success && attempts < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempts)); // Exponential backoff
        }
      }

      // Should not reach here, but handle it just in case
      return {
        player,
        name: player.name,
        success: false,
        error: lastError || 'Unknown error',
      };
    });

    // Wait for all personas to be generated
    const results = await Promise.all(personaPromises);

    // Check for failures
    const failures = results.filter((r) => !r.success);
    if (failures.length > 0) {
      // Group errors by type for better reporting
      const errorGroups = new Map<string, string[]>();

      failures.forEach((f) => {
        const errorKey = f.error || 'Unknown error';
        const players = errorGroups.get(errorKey) || [];
        players.push(f.player.name);
        errorGroups.set(errorKey, players);
      });

      // Build detailed error message
      let detailedError = `Character generation failed for ${failures.length} player(s):\n`;
      errorGroups.forEach((players, error) => {
        detailedError += `\n• ${error}: ${players.join(', ')}`;
      });

      // Get the most common error for the main message
      const mainError = Array.from(errorGroups.entries()).sort(
        (a, b) => b[1].length - a[1].length
      )[0][0];

      console.error(detailedError);

      // Throw error to prevent game from starting
      throw new Error(mainError);
    }

    // Handle duplicate names for successful generations
    const nameCount = new Map<string, number>();
    for (const result of results.filter((r) => r.success)) {
      const count = nameCount.get(result.name) || 0;
      nameCount.set(result.name, count + 1);

      if (count > 0) {
        // Duplicate found, append number
        const newName = `${result.name} ${count + 1}`;
        console.warn(
          `Duplicate name detected: ${result.name}, renaming to ${newName}`
        );
        if (result.player.agent.persona) {
          result.player.agent.persona.name = newName;
        }
        result.player.setName(newName);
        generatedNames.push(newName);
      } else {
        result.player.setName(result.name);
        generatedNames.push(result.name);
      }
    }

    console.log(
      `Persona generation complete. Final names: ${generatedNames.join(', ')}`
    );
    this.#personasGenerated = true;
  }

  getPlayer(id: PlayerId): Player | undefined {
    return this.#players.get(id);
  }

  getPlayers(): ReadonlyMap<PlayerId, Player> {
    return this.#players;
  }

  getAlivePlayers(): Player[] {
    return Array.from(this.#players.values()).filter((p) => p.isAlive());
  }

  getAliveMafia(): Player[] {
    return Array.from(this.#players.values()).filter(
      (p) => p.isAlive() && p.role.name === RoleName.Mafia
    );
  }

  getAliveVillagers(): Player[] {
    return Array.from(this.#players.values()).filter(
      (p) => p.isAlive() && p.role.name === RoleName.Villager
    );
  }

  getTownRoles(): Player[] {
    return Array.from(this.#players.values()).filter(
      (p) => p.isAlive() && p.role.allegiance === 'Town'
    );
  }

  getPublicPlayerMap(): ReadonlyMap<PlayerId, PublicPlayerInfo> {
    const map = new Map<PlayerId, PublicPlayerInfo>();
    for (const p of this.#players.values()) {
      map.set(p.id, p.getPublicRepresentation());
    }
    return map;
  }

  getPublicPlayerArray(): PublicPlayerInfo[] {
    return Array.from(this.#players.values()).map((p) =>
      p.getPublicRepresentation()
    );
  }

  get round(): number {
    return this.#round;
  }

  getCurrentPhaseType(): GamePhaseType {
    return this.#currentState.type;
  }

  getConversationLog(): ConversationLog {
    return this.#conversationLog;
  }

  getAgentMemories(): ReadonlyMap<PlayerId, AgentMemory> {
    return this.#agentMemories;
  }

  async requestPlayerAction(
    player: Player,
    allowedActions: PlayerAction['type'][]
  ): Promise<PlayerAction> {
    if (!player.isAlive()) {
      console.warn(`Attempted to request action from dead player ${player.id}`);
      return { type: 'noAction' };
    }

    if (player.agent instanceof HumanAgent) {
      console.log(
        `Requesting action from Human player ${player.id}. Allowed: ${allowedActions.join(', ')}`
      );
      const pendingAction: PendingHumanAction = {
        playerId: player.id,
        allowedActions: allowedActions,
        prompt: `Your action is required (${allowedActions.join('/')}).`,
      };
      this.setPendingHumanAction(pendingAction);
      return { type: 'humanActionRequired', pendingAction: pendingAction };
    }
    console.log(
      `Requesting action from AI player ${player.name} (${player.id}). Allowed: ${allowedActions.join(', ')}`
    );
    const gameState = this.generateVisibleGameState(player.id);
    try {
      const action = await player.decideAction(gameState, allowedActions);
      console.log(
        `AI ${player.name} (${player.id}) decided action: ${JSON.stringify(action)}`
      );
      return action;
    } catch (error) {
      console.error(
        `Error getting action from AI ${player.name} (${player.id}):`,
        error
      );
      return { type: 'noAction' };
    }
  }

  killPlayer(playerId: PlayerId, reason: string): void {
    const player = this.#players.get(playerId);
    if (player?.isAlive()) {
      const oldStatus = player.status;
      player.kill();
      this.logMessage(
        null,
        `${player.name} (${player.role.name}) ${reason}`,
        MessageVisibility.Public
      );
      this.notifyRenderers(
        'renderPlayerStatusUpdate',
        player.getPublicRepresentation(),
        oldStatus,
        player.status
      );
    }
  }

  checkWinCondition(): 'Mafia' | 'Town' | null {
    const aliveMafiaCount = this.getAliveMafia().length;
    const aliveTownCount = this.getTownRoles().length;
    const totalAliveCount = this.getAlivePlayers().length;

    console.log(
      `Win condition check: ${aliveMafiaCount} Mafia, ${aliveTownCount} Town, ${totalAliveCount} total alive`
    );

    // Handle edge case: no players at all (shouldn't happen in normal gameplay)
    if (totalAliveCount === 0) {
      console.warn('No players alive - this indicates a game state error');
      return null; // Let the game continue to avoid infinite loops
    }

    // Handle edge case: CharacterGeneration phase - no win conditions apply yet
    if (this.getCurrentPhaseType() === 'CharacterGeneration') {
      return null;
    }

    if (aliveMafiaCount === 0 && aliveTownCount > 0) {
      return 'Town';
    }
    if (aliveMafiaCount >= aliveTownCount || aliveTownCount === 0) {
      return aliveMafiaCount > 0 ? 'Mafia' : null;
    }
    return null;
  }

  recordVoteResultsInMemory(
    votes: ReadonlyMap<PlayerId, PlayerId | null>
  ): void {
    const voteRecord = { round: this.round, votes };
    for (const memory of this.#agentMemories.values()) {
      memory.voteHistory.push(voteRecord);
    }
  }

  recordKillInMemory(killedPlayerId: PlayerId | null): void {
    const killRecord = {
      round: this.round,
      phase: this.getCurrentPhaseType(),
      killedPlayerId,
    };
    for (const memory of this.#agentMemories.values()) {
      if (
        !memory.killHistory.some(
          (k) => k.round === this.round && k.phase === killRecord.phase
        )
      ) {
        memory.killHistory.push(killRecord);
      }
    }
  }

  recordSeerResultInMemory(
    seerId: PlayerId,
    targetId: PlayerId,
    allegiance: Allegiance
  ): void {
    const memory = this.#agentMemories.get(seerId);
    if (memory) {
      const resultRecord = { round: this.round, targetId, allegiance };
      if (
        !memory.investigationResults.some(
          (r) => r.round === this.round && r.targetId === targetId
        )
      ) {
        memory.investigationResults.push(resultRecord);
      }
    }
  }

  recordDoctorSaveInMemory(
    doctorId: PlayerId,
    savedPlayerId: PlayerId | null
  ): void {
    const memory = this.#agentMemories.get(doctorId);
    if (memory) {
      const saveRecord = { round: this.round, savedPlayerId };
      if (!memory.saveHistory.some((s) => s.round === this.round)) {
        memory.saveHistory.push(saveRecord);
      }
    }
  }

  generateVisibleGameState(playerId: PlayerId): VisibleGameState {
    const player = this.getPlayer(playerId);
    if (!player)
      throw new Error(`Player ${playerId} not found for generating state.`);

    const isMafia = player.role.name === RoleName.Mafia;

    const agentMemory = this.#agentMemories.get(playerId);
    if (!agentMemory) {
      console.error(`Memory not found for player ${playerId}!`);
      throw new Error(`Memory not found for player ${playerId}`);
    }

    agentMemory.messageHistory = this.#conversationLog.getMessages({
      relevantToPlayer: {
        id: playerId,
        role: player.role.name,
        allegiance: player.role.allegiance,
      },
    });

    const state: VisibleGameState = {
      gameId: this.id,
      round: this.round,
      phase: this.getCurrentPhaseType(),
      self: {
        id: player.id,
        name: player.name,
        status: player.status,
        role: player.role.name,
        allegiance: player.role.allegiance,
        isMafia: player.role.allegiance === 'Mafia',
        persona: player.agent.persona || DEFAULT_PERSONA,
      },
      players: this.getPublicPlayerArray(),
      alivePlayerIds: new Set(this.getAlivePlayers().map((p) => p.id)),
      language: this.language,
      ...(isMafia && {
        mafiaPlayerIds: new Set(this.getAliveMafia().map((p) => p.id)),
      }),
      themeName: this.theme.name,
      memory: agentMemory,
    };

    return state;
  }

  public getCurrentPhase(): IGamePhase {
    return this.#currentState;
  }

  public getPendingHumanAction(): PendingHumanAction | null {
    return this.#pendingHumanAction;
  }

  public setPendingHumanAction(action: PendingHumanAction | null): void {
    this.#pendingHumanAction = action;
  }

  public clearPendingHumanAction(): void {
    this.setPendingHumanAction(null);
  }

  public advanceToPhase(
    nextPhaseType: GamePhaseType,
    winnerInput?: 'Mafia' | 'Town'
  ): void {
    let determinedWinner = winnerInput;

    // For GameOver phase, try to determine winner if not provided, but allow creation without winner
    if (nextPhaseType === 'GameOver' && !determinedWinner) {
      const checkedWinner = this.checkWinCondition();
      if (checkedWinner) {
        determinedWinner = checkedWinner;
        console.log(
          `Winner determined as ${determinedWinner} when advancing to GameOver.`
        );
      } else {
        console.warn(
          'Advancing to GameOver without a determined winner (likely due to infinite loop protection).'
        );
        // Allow GameOver creation without winner - GameOverPhase constructor accepts optional winner
      }
    }

    const nextPhaseInstance = this.createPhaseInstance(
      nextPhaseType,
      determinedWinner
    );
    if (!nextPhaseInstance) {
      console.error(`Cannot advance to invalid phase type: ${nextPhaseType}`);
      return;
    }

    if (
      (this.#currentState.type === 'Night' ||
        this.#currentState.type === 'Init') &&
      nextPhaseInstance.type === 'Day'
    ) {
      this.#round++;
      console.log(`Starting Round ${this.#round}`);
      this.notifyRenderers('renderRoundStart', this.#round);
    }
    this.#currentState = nextPhaseInstance;
    this.#pendingHumanAction = null;
    this.#humanVotes.clear();
    this.#humanNightActions.clear();
    this.#phaseStep = 'Start';
    this.#nextPlayerIndexToAction = 0;
    this.#lastPhaseResults = {};
    this.#phaseState = {};

    console.log(
      `Advanced to phase: ${this.#currentState.type}, Round: ${this.#round}`
    );
    this.notifyRenderers(
      'renderPhaseStart',
      this.#currentState.type,
      this.#round
    );
  }

  private createPhaseInstance(
    phaseType: GamePhaseType,
    winnerInput?: 'Mafia' | 'Town'
  ): IGamePhase | null {
    const PhaseClass = phaseInstanceMap[phaseType];
    if (!PhaseClass) return null;

    if (phaseType === 'GameOver') {
      // GameOverPhase constructor accepts optional winner, so we can create it even without a winner
      try {
        return new PhaseClass(winnerInput); // winnerInput can be undefined
      } catch (e) {
        console.error('Error creating GameOverPhase:', e);
        return null;
      }
    }

    try {
      return new PhaseClass();
    } catch (e) {
      console.error(`Error creating phase instance for ${phaseType}:`, e);
      return null;
    }
  }

  public getPhaseStep(): string {
    return this.#phaseStep;
  }

  public setPhaseStep(step: string): void {
    console.log(`Game Step changing from ${this.#phaseStep} to ${step}`);
    this.#phaseStep = step;
  }

  public getNextPlayerIndexToAction(): number {
    return this.#nextPlayerIndexToAction;
  }

  public setNextPlayerIndexToAction(index: number): void {
    console.log(
      `Next player index changing from ${this.#nextPlayerIndexToAction} to ${index}`
    );
    this.#nextPlayerIndexToAction = index;
  }

  public getVotes(): ReadonlyMap<PlayerId, PlayerId | null> {
    // Return all votes from the current phase if it's a voting phase
    if (this.#currentState.type === 'Day' && this.#phaseState?.dayVotes) {
      // Convert the dayVotes object to a Map
      const votesMap = new Map<PlayerId, PlayerId | null>();
      for (const [voterId, targetId] of Object.entries(
        this.#phaseState.dayVotes
      )) {
        votesMap.set(voterId as PlayerId, targetId as PlayerId | null);
      }
      return votesMap;
    }

    // Otherwise return human votes as a fallback
    return this.#humanVotes;
  }

  public recordHumanVote(voterId: PlayerId, targetId: PlayerId | null): void {
    console.log(`Recording human vote: ${voterId} votes for ${targetId}`);
    this.#humanVotes.set(voterId, targetId);
  }

  public recordHumanNightAction(
    playerId: PlayerId,
    payload: HumanActionPayload
  ): void {
    console.log(
      `Recording human night action: ${playerId} performs ${payload.type}`
    );
    this.#humanNightActions.set(playerId, payload);
  }

  public logEvent(content: string): IMessage {
    return this.logMessage(null, content, MessageVisibility.Public);
  }

  public setWinCondition(winner: 'Mafia' | 'Town'): void {
    if (!this.#winningTeam) {
      console.log(`Setting win condition: ${winner} wins.`);
      this.#winningTeam = winner;
    }
  }

  public isRolesAssigned(): boolean {
    return this.#rolesAssigned;
  }

  public markRolesAssigned(): void {
    if (!this.#rolesAssigned) {
      console.log('Marking roles as assigned.');
      this.#rolesAssigned = true;
    }
  }

  public isPersonasGenerated(): boolean {
    return this.#personasGenerated;
  }

  public markPersonasGenerated(): void {
    if (!this.#personasGenerated) {
      console.log('Marking personas as generated.');
      this.#personasGenerated = true;
    }
  }

  public isInitialMemoriesCreated(): boolean {
    return this.#initialMemoriesCreated;
  }

  public createInitialAgentMemories(): void {
    if (this.#initialMemoriesCreated) return;
    console.log('Creating initial memories for all agents...');
    this.#players.forEach((player, id) => {
      if (!this.#agentMemories.has(id)) {
        this.#agentMemories.set(id, createInitialMemory());
      }
    });
    this.#initialMemoriesCreated = true;
    console.log('Initial memories created.');
  }
}
