import type { IPlayer, PlayerId, PlayerStatus, PublicPlayerInfo } from '../interfaces/IPlayer';
import { Player } from './Player';
import type { IGamePhase, GamePhaseType } from '../interfaces/IGamePhase';
import { InitializationPhase } from '../phases/InitializationPhase';
import { DayPhase } from '../phases/DayPhase';
import { NightPhase } from '../phases/NightPhase';
import { GameOverPhase } from '../phases/GameOverPhase';
import type { IGameRenderer } from '../interfaces/IGameRenderer';
import { ConversationLog } from './ConversationLog';
import { type IMessage, MessageVisibility } from '../interfaces/IMessage';
import { Message } from './Message';
import type { VisibleGameState } from '../interfaces/GameState';
import { RoleName, type IRole, type Allegiance } from '../interfaces/IRole';
import { v4 as uuidv4 } from 'uuid';
import type { IAgent, PlayerAction } from '../interfaces/IAgent';
import { HumanAgent } from '../agents/HumanAgent';
import { type GameTheme, Themes } from '../interfaces/Theme';
import { type AgentMemory, createInitialMemory } from '../interfaces/AgentMemory';
import { DEFAULT_PERSONA } from '../interfaces/Persona';

import type { SerializableGameState, SerializablePlayer, AgentConfig } from '../../interfaces/persistence.types';
import { createAgentInstance } from '@/lib/agentFactory';
import { MafiaRole } from '../roles/MafiaRole';
import { VillagerRole } from '../roles/VillagerRole';
import { DoctorRole } from '../roles/DoctorRole';
import { SeerRole } from '../roles/SeerRole';
import type { PendingHumanAction } from '../../interfaces/actions.types';
import type { LanguageName } from '../../i18n/settings';
import type { HumanActionPayload } from '../../interfaces/actions.types';

import { OpenAIAgent } from '../agents/OpenAIAgent';

const roleClassMap: Record<RoleName, new () => IRole> = {
    [RoleName.Mafia]: MafiaRole,
    [RoleName.Villager]: VillagerRole,
    [RoleName.Doctor]: DoctorRole,
    [RoleName.Seer]: SeerRole,
};

const phaseInstanceMap: Record<GamePhaseType, new (...args: any[]) => IGamePhase> = {
    'Init': InitializationPhase,
    'Day': DayPhase,
    'Night': NightPhase,
    'GameOver': GameOverPhase,
};

function getAgentConfigFromInstance(agent: IAgent): AgentConfig {
    if (agent instanceof OpenAIAgent) {
        let providerValue = 'openai';
        let agentTypeValue = 'OpenAI';
        const endpoint = (agent as any).apiBase;
        const modelName = (agent as any).model;

        if (endpoint?.includes('groq.com')) {
            providerValue = 'groq';
            agentTypeValue = 'Groq';
        } else if (endpoint?.includes('localhost:11434')) {
            providerValue = 'ollama_local';
            agentTypeValue = 'Ollama';
        } else if (endpoint?.includes('fireworks.ai')) {
            providerValue = 'fireworks';
            agentTypeValue = 'Fireworks';
        }

        return { agentType: agentTypeValue, modelName, providerValue };
    }
    else if (agent instanceof HumanAgent) {
         return { agentType: 'Human' };
     }
     else {
         return { agentType: 'Dummy' };
     }
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
    #phaseStep: string = 'Start';
    #nextPlayerIndexToAction: number = 0;

    constructor(
        playerSetups: { name: string; agent: IAgent; role: IRole }[],
        themeKey: string = 'UK_VILLAGE_1900S',
        language: LanguageName = 'en'
    ) {
        if (playerSetups.length < 1) {
            this.id = uuidv4();
            this.theme = Themes[themeKey] || Themes['UK_VILLAGE_1900S'];
            this.language = language;
            this.#currentState = new InitializationPhase();
            this.#createdAt = Date.now();
            return;
        }

        if (playerSetups.length < 3) {
            throw new Error('Not enough players to start a new game (minimum 3).');
        }

        this.id = uuidv4();
        this.#createdAt = Date.now();
        this.language = language;
        this.theme = Themes[themeKey];
        if (!this.theme) throw new Error(`Invalid theme key: ${themeKey}`);

        this.#players = new Map();
        this.#agentMemories = new Map();
        this.#humanPlayerId = null;

        playerSetups.forEach((setup, index) => {
            const sanitizedName = setup.name.toLowerCase().replace(/"/g, '').replace(/\s+/g, '-');
            const roleNameStr = setup.role.name.toString().toLowerCase();
            const playerId: PlayerId = `player-${index + 1}-${roleNameStr}-${sanitizedName}`;
            
            const agentConfig = getAgentConfigFromInstance(setup.agent);
            
            const player = new Player(playerId, setup.name, setup.role, setup.agent, agentConfig);
            this.#players.set(playerId, player);
            this.#agentMemories.set(playerId, createInitialMemory());
            if (setup.agent instanceof HumanAgent) {
                if (this.#humanPlayerId) console.warn("Multiple HumanAgents detected.");
                this.#humanPlayerId = playerId;
            }
        });

        this.#currentState = new InitializationPhase();
        this.#round = 0;
        this.#conversationLog = new ConversationLog();
        console.log(`New game ${this.id} created.`);
    }

    public static loadFromState(state: SerializableGameState): Game {
        const game = new Game([], state.themeKey, state.language);

        game.id = state.gameId;
        game.#createdAt = state.createdAt;
        game.#round = state.round;
        game.#humanPlayerId = state.humanPlayerId;
        game.#lastPhaseResults = state._phaseResults || {};
        game.#phaseStep = state.phaseStep || 'Start';
        game.#nextPlayerIndexToAction = state.nextPlayerIndexToAction ?? 0;

        game.#players.clear();
        game.#agentMemories.clear();
        Object.values(state.players).forEach(pState => {
            const agentConfig = pState.agentConfig;
            const agent = createAgentInstance(agentConfig, pState.id);
            const RoleClass = roleClassMap[pState.roleName];
            if (!RoleClass) throw new Error(`LoadError: Cannot deserialize role: ${pState.roleName}`);
            const roleInstance = new RoleClass();

            const player = new Player(pState.id, pState.name, roleInstance, agent, agentConfig);
            if (pState.status === 'Dead') player.kill();
            player.agent.persona = pState.persona || DEFAULT_PERSONA;

            game.#players.set(pState.id, player);

            const loadedMemory = state.agentMemories[pState.id] || createInitialMemory();
            game.#agentMemories.set(pState.id, loadedMemory);
        });

        game.#conversationLog = new ConversationLog();
        state.conversationLog.forEach(msgData => {
            const timestamp = typeof msgData.timestamp === 'string'
                ? new Date(msgData.timestamp)
                : new Date(msgData.timestamp);

            const message = new Message(
                msgData.round, msgData.phase, msgData.senderId, msgData.senderName,
                msgData.content, msgData.visibility, msgData.recipientId
            );
            game.#conversationLog.addMessage(message);
        });

        const PhaseClass = phaseInstanceMap[state.phase];
        if (!PhaseClass) throw new Error(`LoadError: Cannot deserialize phase: ${state.phase}`);
        
        const phaseInstance = game.createPhaseInstance(state.phase, state.winCondition?.outcome as ('Mafia' | 'Town' | undefined));
        if (!phaseInstance) throw new Error(`LoadError: Failed to create instance for phase ${state.phase}`);
        game.#currentState = phaseInstance;

        console.log(`Game ${game.id} loaded from state (Round: ${game.#round}, Phase: ${game.#currentState.type})`);
        return game;
    }

    public getCurrentSerializableState(pendingAction: PendingHumanAction | null = null): SerializableGameState {
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
            };
        });

        const agentMemoriesRecord: Record<PlayerId, AgentMemory> = {};
        this.#agentMemories.forEach((memory, id) => {
            agentMemoriesRecord[id] = memory;
        });

        const winCondition = this.#currentState instanceof GameOverPhase
            ? { outcome: (this.#currentState as any).winner, message: "Game Over!" }
            : null;

        const themeKey = Object.keys(Themes).find(key => Themes[key] === this.theme) || 'UK_VILLAGE_1900S';

        const serializableLog = this.#conversationLog.getAllMessages().map(msg => {
            return {
                id: msg.id,
                round: msg.round,
                phase: msg.phase,
                senderId: msg.senderId,
                senderName: msg.senderName,
                content: msg.content,
                visibility: msg.visibility,
                recipientId: msg.recipientId,
                timestamp: msg.timestamp instanceof Date 
                            ? msg.timestamp.toISOString() 
                            : String(msg.timestamp)
            };
        });

        const state: SerializableGameState = {
            gameId: this.id,
            createdAt: this.#createdAt,
            updatedAt: Date.now(),
            themeKey: themeKey,
            language: this.language,
            round: this.#round,
            phase: this.getCurrentPhaseType(),
            players: playersState,
            livingPlayerIds: this.getAlivePlayers().map(p => p.id),
            deadPlayerIds: Array.from(this.#players.values()).filter(p => !p.isAlive()).map(p => p.id),
            conversationLog: serializableLog as IMessage[],
            agentMemories: agentMemoriesRecord,
            winCondition: winCondition,
            humanPlayerId: this.#humanPlayerId,
            pendingHumanAction: pendingAction,
            _phaseResults: this.#lastPhaseResults,
            phaseStep: this.#phaseStep,
            nextPlayerIndexToAction: this.#nextPlayerIndexToAction,
        };

        return state;
    }

    public getLastPhaseResults(): SerializableGameState['_phaseResults'] {
        return this.#lastPhaseResults;
    }

    public setPhaseResults(results: Partial<SerializableGameState['_phaseResults']>): void {
        this.#lastPhaseResults = { ...this.#lastPhaseResults, ...results };
    }

    addRenderer(renderer: IGameRenderer): void {
        this.#renderers.push(renderer);
    }

    notifyRenderers<T extends keyof IGameRenderer>(
        method: T,
        ...args: Parameters<Extract<IGameRenderer[T], (...args: any[]) => any>>
    ): void {
        for (const renderer of this.#renderers) {
            if (typeof renderer[method] === 'function') {
                try {
                    (renderer[method] as any)(...args);
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
        this.notifyRenderers('renderGameStart', this.getPublicPlayerMap(), this.id);

        await this.ensurePersonasGenerated();

        while (!(this.#currentState instanceof GameOverPhase)) {
            if (this.#currentState.type !== 'Init' && this.#currentState.type !== this.getCurrentPhaseType()) {
                 console.warn("State type mismatch detected");
            }

            if (this.#currentState.type === 'Day') {
                this.#round++;
                this.notifyRenderers('renderRoundStart', this.#round);
            }

            this.notifyRenderers('renderPhaseStart', this.getCurrentPhaseType(), this.round);

            await this.#currentState.runPhase(this);

            const winner = this.checkWinCondition();
            if (winner) {
                this.#currentState = new GameOverPhase(winner);
                 this.notifyRenderers('renderPhaseStart', this.getCurrentPhaseType(), this.round);
                await this.#currentState.runPhase(this);
            } else {
                 this.#currentState = this.#currentState.transition(this);
            }
        }
         this.notifyRenderers('renderNarration', "Game Loop Finished.");
    }

    async ensurePersonasGenerated(): Promise<void> {
        const personaGenerationPromises: Promise<void>[] = [];
        const themeDescription = this.theme.description;

        this.#players.forEach(player => {
            if (player.agent.persona?.name === DEFAULT_PERSONA.name &&
                typeof player.agent.generatePersona === 'function') {
                console.log(`Generating persona for ${player.name} (${player.id})...`);
                personaGenerationPromises.push(player.agent.generatePersona(themeDescription));
            }
        });

        if (personaGenerationPromises.length > 0) {
            console.log(`Waiting for ${personaGenerationPromises.length} personas to be generated...`);
            await Promise.all(personaGenerationPromises);
            console.log("Persona generation complete.");
        }
    }

    getPlayer(id: PlayerId): Player | undefined {
        return this.#players.get(id);
    }

    getPlayers(): ReadonlyMap<PlayerId, Player> {
        return this.#players;
    }

    getAlivePlayers(): Player[] {
        return Array.from(this.#players.values()).filter(p => p.isAlive());
    }

     getAliveMafia(): Player[] {
        return Array.from(this.#players.values()).filter(p => p.isAlive() && p.role.name === RoleName.Mafia);
    }

     getAliveVillagers(): Player[] {
        return Array.from(this.#players.values()).filter(p => p.isAlive() && p.role.name === RoleName.Villager);
    }

    getTownRoles(): Player[] {
        return Array.from(this.#players.values()).filter(p => p.isAlive() && p.role.allegiance === 'Town');
    }

    getPublicPlayerMap(): ReadonlyMap<PlayerId, PublicPlayerInfo> {
         const map = new Map<PlayerId, PublicPlayerInfo>();
         this.#players.forEach(p => map.set(p.id, p.getPublicRepresentation()));
         return map;
    }

     getPublicPlayerArray(): PublicPlayerInfo[] {
        return Array.from(this.#players.values()).map(p => p.getPublicRepresentation());
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

    async requestPlayerAction(player: Player, allowedActions: PlayerAction['type'][]): Promise<PlayerAction> {
        if (!player.isAlive()) {
            console.warn(`Attempted to request action from dead player ${player.id}`);
            return { type: 'noAction' };
        }

        if (player.agent instanceof HumanAgent) {
            console.log(`Requesting action from Human player ${player.id}. Allowed: ${allowedActions.join(', ')}`);
            const pendingAction: PendingHumanAction = {
                playerId: player.id,
                allowedActions: allowedActions,
                prompt: `Your action is required (${allowedActions.join('/')}).`
            };
            this.setPendingHumanAction(pendingAction);
            return { type: 'humanActionRequired', pendingAction: pendingAction };
        } else {
            console.log(`Requesting action from AI player ${player.name} (${player.id}). Allowed: ${allowedActions.join(', ')}`);
            const gameState = this.generateVisibleGameState(player.id);
            try {
                const action = await player.decideAction(gameState, allowedActions);
                console.log(`AI ${player.name} (${player.id}) decided action: ${JSON.stringify(action)}`);
                return action;
            } catch(error) {
                 console.error(`Error getting action from AI ${player.name} (${player.id}):`, error);
                 return { type: 'noAction' };
            }
        }
    }

    killPlayer(playerId: PlayerId, reason: string): void {
        const player = this.#players.get(playerId);
        if (player && player.isAlive()) {
            const oldStatus = player.status;
            player.kill();
            this.logMessage(null, `${player.name} (${player.role.name}) ${reason}`, MessageVisibility.Public);
            this.notifyRenderers('renderPlayerStatusUpdate', player.getPublicRepresentation(), oldStatus, player.status);
        }
    }

    checkWinCondition(): 'Mafia' | 'Town' | null {
        const aliveMafiaCount = this.getAliveMafia().length;
        const aliveTownCount = this.getTownRoles().length;

        if (aliveMafiaCount === 0 && aliveTownCount > 0) {
            return 'Town';
        }
        if (aliveMafiaCount >= aliveTownCount || aliveTownCount === 0) {
            return aliveMafiaCount > 0 ? 'Mafia' : null;
        }
        return null;
    }

    recordVoteResultsInMemory(votes: ReadonlyMap<PlayerId, PlayerId | null>): void {
        const voteRecord = { round: this.round, votes };
        this.#agentMemories.forEach(memory => {
            memory.voteHistory.push(voteRecord);
        });
    }

    recordKillInMemory(killedPlayerId: PlayerId | null): void {
        const killRecord = { round: this.round, phase: this.getCurrentPhaseType(), killedPlayerId };
        this.#agentMemories.forEach(memory => {
            if (!memory.killHistory.some(k => k.round === this.round && k.phase === killRecord.phase)) {
                 memory.killHistory.push(killRecord);
            }
        });
    }

    recordSeerResultInMemory(seerId: PlayerId, targetId: PlayerId, allegiance: Allegiance): void {
        const memory = this.#agentMemories.get(seerId);
        if (memory) {
             const resultRecord = { round: this.round, targetId, allegiance };
             if (!memory.investigationResults.some(r => r.round === this.round && r.targetId === targetId)) {
                 memory.investigationResults.push(resultRecord);
             }
        }
    }

    recordDoctorSaveInMemory(doctorId: PlayerId, savedPlayerId: PlayerId | null): void {
        const memory = this.#agentMemories.get(doctorId);
        if (memory) {
             const saveRecord = { round: this.round, savedPlayerId };
             if (!memory.saveHistory.some(s => s.round === this.round)) {
                 memory.saveHistory.push(saveRecord);
             }
        }
    }

    generateVisibleGameState(playerId: PlayerId): VisibleGameState {
        const player = this.getPlayer(playerId);
        if (!player) throw new Error(`Player ${playerId} not found for generating state.`);

        const isMafia = player.role.name === RoleName.Mafia;

        const agentMemory = this.#agentMemories.get(playerId);
        if (!agentMemory) {
             console.error(`Memory not found for player ${playerId}!`);
             throw new Error(`Memory not found for player ${playerId}`);
        }

        agentMemory.messageHistory = this.#conversationLog.getMessages({
             relevantToPlayer: { id: playerId, role: player.role.name, allegiance: player.role.allegiance }
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
                persona: player.agent.persona || DEFAULT_PERSONA
            },
            players: this.getPublicPlayerArray(),
            alivePlayerIds: new Set(this.getAlivePlayers().map(p => p.id)),
            language: this.language,
            ...(isMafia && { mafiaPlayerIds: new Set(this.getAliveMafia().map(p => p.id)) }),
             themeName: this.theme.name,
            memory: agentMemory
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

    public advanceToPhase(nextPhaseType: GamePhaseType, winner?: 'Mafia' | 'Town'): void {
        if (nextPhaseType === 'GameOver' && !winner) {
            console.error("Winner must be provided when advancing to GameOver phase.");
            const currentWinner = this.checkWinCondition();
            if (!currentWinner) {
                 console.error("Cannot advance to GameOver: No winner determined.");
                 return;
            }
            winner = currentWinner;
            console.warn(`Winner determined as ${winner} before advancing to GameOver.`);
        }

        const nextPhaseInstance = this.createPhaseInstance(nextPhaseType, winner);
        if (!nextPhaseInstance) {
            console.error(`Cannot advance to invalid phase type: ${nextPhaseType}`);
            return;
        }

        if (this.#currentState.type === 'Night' && nextPhaseInstance.type === 'Day') {
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

        console.log(`Advanced to phase: ${this.#currentState.type}, Round: ${this.#round}`);
        this.notifyRenderers('renderPhaseStart', this.#currentState.type, this.#round);
    }

    private createPhaseInstance(phaseType: GamePhaseType, winner?: 'Mafia' | 'Town'): IGamePhase | null {
        const PhaseClass = phaseInstanceMap[phaseType];
        if (!PhaseClass) return null;
        
        if (phaseType === 'GameOver') {
            if (!winner) {
                console.error("Winner argument is required to create GameOverPhase instance.");
                return null;
            }
            try {
                 return new PhaseClass(winner); 
            } catch (e) {
                 console.error("Error creating GameOverPhase:", e);
                 return null;
            }
        }
        
        return new PhaseClass();
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
        console.log(`Next player index changing from ${this.#nextPlayerIndexToAction} to ${index}`);
        this.#nextPlayerIndexToAction = index;
    }
    
    public getVotes(): ReadonlyMap<PlayerId, PlayerId | null> {
        console.warn("Game.getVotes() currently only returns recorded human votes.");
        return this.#humanVotes; 
    }

    public recordHumanVote(voterId: PlayerId, targetId: PlayerId | null): void {
        console.log(`Recording human vote: ${voterId} votes for ${targetId}`);
        this.#humanVotes.set(voterId, targetId);
    }
    
    public recordHumanNightAction(playerId: PlayerId, payload: HumanActionPayload): void {
        console.log(`Recording human night action: ${playerId} performs ${payload.type}`);
        this.#humanNightActions.set(playerId, payload);
    }
}
