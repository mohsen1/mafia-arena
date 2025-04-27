import type { IPlayer, PlayerId, PlayerStatus, PublicPlayerInfo } from '../interfaces/IPlayer';
import { Player } from './Player';
import type { IGamePhase, GamePhaseType } from '../interfaces/IGamePhase';
import { InitializationPhase } from '../phases/InitializationPhase';
import { GameOverPhase } from '../phases/GameOverPhase';
import type { IGameRenderer } from '../interfaces/IGameRenderer';
import { ConversationLog } from './ConversationLog';
import { type IMessage, MessageVisibility } from '../interfaces/IMessage';
import { Message } from './Message';
import type { VisibleGameState } from '../interfaces/GameState';
import { RoleName } from '../interfaces/IRole';
import { v4 as uuidv4 } from 'uuid';
import type { IAgent, PlayerAction } from '../interfaces/IAgent';
import { HumanAgent } from '../agents/HumanAgent';
import type { IRole } from '../interfaces/IRole';
import { type GameTheme, Themes } from '../interfaces/Theme';
import { type AgentMemory, createInitialMemory } from '../interfaces/AgentMemory';

export class Game {
    public readonly id: string = uuidv4();
    #players = new Map<PlayerId, Player>();
    #currentState: IGamePhase;
    #renderers: IGameRenderer[] = [];
    #conversationLog = new ConversationLog();
    #round = 0;
    public readonly language: string;
    public readonly theme: GameTheme;
    // Store memory for each agent
    #agentMemories = new Map<PlayerId, AgentMemory>();

    constructor(
        playerSetups: { name: string; agent: IAgent; role: IRole }[],
        themeName: string = 'UK_VILLAGE_1900S',
        language: string = 'en'
    ) {
        // Add validation for minimum player count
        if (playerSetups.length < 3) {
            throw new Error('Not enough players to start a game.');
        }

        this.theme = Themes[themeName];
        if (!this.theme) {
            throw new Error(`Selected theme "${themeName}" not found.`);
        }
        this.language = language;
        playerSetups.forEach((setup, index) => {
            // Sanitize name: remove quotes and convert to lowercase, replace spaces with hyphens
            const sanitizedName = setup.name.toLowerCase().replace(/"/g, '').replace(/\s+/g, '-');
            const playerId: PlayerId = `player-${index + 1}-${sanitizedName}`;
            // PlayerId is now passed via gameState in getAction
            const player = new Player(playerId, setup.name, setup.role, setup.agent);
            this.#players.set(playerId, player);
            this.#agentMemories.set(playerId, createInitialMemory()); // Initialize memory
        });

        // Initial state
        this.#currentState = new InitializationPhase();
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
                    // The any cast remains, as handling the specific union type dynamically is complex
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        phaseOverride?: GamePhaseType // Sometimes needed if logged after phase change
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
        // Notify renderers ONLY if the message should be public or if they handle specific visibilities
        // The renderer itself should decide if it displays Mafia chat etc.
        // A more robust approach might pass the visibility hint to the renderer.
        if (visibility === MessageVisibility.Public) {
             this.notifyRenderers('renderMessage', message);
        } else if (visibility === MessageVisibility.Mafia) {
             // Special handling maybe needed in renderer, or filter based on context
             // For now, let console renderer show it with a tag
             this.notifyRenderers('renderMessage', message); // Simple approach for now
        }

        return message;
    }

    async runGameLoop(): Promise<void> {
        this.notifyRenderers('renderGameStart', this.getPublicPlayerMap(), this.id);
        while (!(this.#currentState instanceof GameOverPhase)) {
            if (this.#currentState.type !== 'Init' && this.#currentState.type !== this.getCurrentPhaseType()) {
                 // Handle potential state inconsistencies if needed
                 console.warn("State type mismatch detected");
            }

            if (this.#currentState.type === 'Day') { // Increment round at the start of Day
                this.#round++;
                this.notifyRenderers('renderRoundStart', this.#round);
            }

            this.notifyRenderers('renderPhaseStart', this.getCurrentPhaseType(), this.round);

            // Execute the current phase's logic
            await this.#currentState.runPhase(this);

            // Check for game over conditions *before* transitioning
            const winner = this.checkWinCondition();
            if (winner) {
                this.#currentState = new GameOverPhase(winner);
                 this.notifyRenderers('renderPhaseStart', this.getCurrentPhaseType(), this.round);
                await this.#currentState.runPhase(this); // Run the GameOver phase logic
            } else {
                 // Transition to the next state
                 this.#currentState = this.#currentState.transition(this);
            }
        }
         this.notifyRenderers('renderNarration', "Game Loop Finished.");
    }

    // --- State Accessors and Mutators (called by Phases) ---

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

    // Added getter for agent memories
    getAgentMemories(): ReadonlyMap<PlayerId, AgentMemory> {
        return this.#agentMemories;
    }

    /**
     * Requests an action from a player.
     * If the player has a HumanAgent, it uses the first available renderer
     * that implements `promptHumanInput`. Otherwise, it calls the player's
     * `decideAction` method.
     */
    async requestPlayerAction(player: Player, allowedActions: PlayerAction['type'][]): Promise<PlayerAction> {
        if (!player.isAlive()) {
            console.warn(`Attempted to request action from dead player ${player.id}`);
            return { type: 'noAction' };
        }

        if (player.agent instanceof HumanAgent) {
            const humanPrompter = this.#renderers.find(r => typeof r.promptHumanInput === 'function');
            if (humanPrompter?.promptHumanInput) {
                 // Generate the state needed JUST for the prompt context (less than full decideAction state?)
                 // For now, pass the public info.
                 // TODO: promptHumanInput might need more context than just publicPlayerInfo.
                 const playerInfo = player.getPublicRepresentation(); 
                try {
                     // Pass necessary context for the prompt (e.g., list of targets)
                     // This needs refinement - the renderer needs to know who to list!
                    return await humanPrompter.promptHumanInput(playerInfo, allowedActions);
                } catch (error) {
                    console.error(`Error prompting human player ${player.id}:`, error);
                    return { type: 'noAction' }; // Default safe action on error
                }
            } else {
                console.error(`Human player ${player.id} requires a renderer with promptHumanInput, but none found.`);
                return { type: 'noAction' }; // Cannot get input
            }
        } else {
            // For AI agents, generate their visible state and call decideAction
            const gameState = this.generateVisibleGameState(player.id);
            return await player.decideAction(gameState, allowedActions);
        }
    }

    // --- Game Logic Helpers ---

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
        // Count ALL alive Town members (Villagers, Doctors, Seers, etc.)
        const aliveTownCount = this.getAlivePlayers().filter(p => p.role.allegiance === 'Town').length;

        if (aliveMafiaCount === 0 && aliveTownCount > 0) { // Ensure Town still has members
            return 'Town';
        }
        // Check if Mafia count is >= total Town count OR if Town count is 0
        if (aliveMafiaCount >= aliveTownCount || aliveTownCount === 0) {
            // Make sure there are still mafia alive to win
            return aliveMafiaCount > 0 ? 'Mafia' : null; // Mafia wins if they exist, otherwise null (stalemate?)
        }
        return null; // No winner yet
    }

    // --- Memory Update Methods ---

    recordVoteResultsInMemory(votes: ReadonlyMap<PlayerId, PlayerId | null>): void {
        const voteRecord = { round: this.round, votes };
        this.#agentMemories.forEach(memory => {
            memory.voteHistory.push(voteRecord);
        });
    }

    recordKillInMemory(killedPlayerId: PlayerId | null): void {
        const killRecord = { round: this.round, killedPlayerId };
        this.#agentMemories.forEach(memory => {
            memory.killHistory.push(killRecord);
        });
    }

    recordSeerResultInMemory(seerId: PlayerId, targetId: PlayerId, allegiance: 'Mafia' | 'Town'): void {
        const memory = this.#agentMemories.get(seerId);
        if (memory) {
            memory.investigationResults.push({ round: this.round, targetId, allegiance });
        }
    }

    recordDoctorSaveInMemory(doctorId: PlayerId, savedPlayerId: PlayerId | null): void {
        const memory = this.#agentMemories.get(doctorId);
        if (memory) {
            memory.saveHistory.push({ round: this.round, savedPlayerId });
        }
    }

    // Creates the specific view of the game state for a given player
    generateVisibleGameState(playerId: PlayerId): VisibleGameState {
        const player = this.getPlayer(playerId);
        if (!player) throw new Error(`Player ${playerId} not found for generating state.`);

        const isMafia = player.role.name === RoleName.Mafia;

        // Get agent-specific memory
        const agentMemory = this.#agentMemories.get(playerId);
        if (!agentMemory) {
             // Should not happen if initialized correctly
             console.error(`Memory not found for player ${playerId}!`);
             throw new Error(`Memory not found for player ${playerId}`);
        }

        // Update message history within the memory object before generating state
        // Get ALL relevant messages, no arbitrary limit
        agentMemory.messageHistory = this.#conversationLog.getMessages({
             relevantToPlayer: { id: playerId, role: player.role.name }
        });

        // Base visible state
        const state: VisibleGameState = {
             gameId: this.id,
            round: this.round,
            phase: this.getCurrentPhaseType(),
            self: {
                id: player.id,
                name: player.name,
                status: player.status,
                role: player.role.name,
                isMafia: isMafia,
                persona: player.agent.persona
            },
            players: this.getPublicPlayerArray(), // Only public info
            alivePlayerIds: new Set(this.getAlivePlayers().map(p => p.id)),
            language: this.language,
            // Conditionally add Mafia member list
             ...(isMafia && { mafiaPlayerIds: new Set(this.getAliveMafia().map(p => p.id)) }),
             themeName: this.theme.name,
            memory: agentMemory // Pass the agent's specific memory
        };

        return Object.freeze(state); // Make it immutable
    }
}
