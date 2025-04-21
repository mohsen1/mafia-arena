"use strict";
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var _Game_players, _Game_currentState, _Game_renderers, _Game_conversationLog, _Game_round;
Object.defineProperty(exports, "__esModule", { value: true });
exports.Game = void 0;
const Player_1 = require("./Player");
const InitializationPhase_1 = require("../phases/InitializationPhase");
const GameOverPhase_1 = require("../phases/GameOverPhase");
const ConversationLog_1 = require("./ConversationLog");
const IMessage_1 = require("../interfaces/IMessage");
const Message_1 = require("./Message");
const IRole_1 = require("../interfaces/IRole");
const uuid_1 = require("uuid");
class Game {
    constructor(playerSetups) {
        this.id = (0, uuid_1.v4)();
        _Game_players.set(this, new Map());
        _Game_currentState.set(this, void 0);
        _Game_renderers.set(this, []);
        _Game_conversationLog.set(this, new ConversationLog_1.ConversationLog());
        _Game_round.set(this, 0);
        if (playerSetups.length < 3) { // Example minimum player count
            throw new Error("Not enough players to start a game.");
        }
        playerSetups.forEach((setup, index) => {
            const playerId = `player-${index + 1}-${setup.name.toLowerCase().replace(/\s+/g, '-')}`;
            // Ensure agent has the correct ID *before* creating the player
            setup.agent.playerId = playerId; // TODO: This mutation isn't ideal, better to pass ID to agent constructor
            const player = new Player_1.Player(playerId, setup.name, setup.role, setup.agent);
            __classPrivateFieldGet(this, _Game_players, "f").set(playerId, player);
        });
        // Initial state
        __classPrivateFieldSet(this, _Game_currentState, new InitializationPhase_1.InitializationPhase(), "f");
    }
    addRenderer(renderer) {
        __classPrivateFieldGet(this, _Game_renderers, "f").push(renderer);
    }
    notifyRenderers(method, ...args) {
        for (const renderer of __classPrivateFieldGet(this, _Game_renderers, "f")) {
            if (typeof renderer[method] === 'function') {
                try {
                    // The any cast remains, as handling the specific union type dynamically is complex
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    renderer[method](...args);
                }
                catch (error) {
                    console.error(`Renderer error in method ${String(method)}:`, error);
                }
            }
        }
    }
    logMessage(senderId, content, visibility, phaseOverride // Sometimes needed if logged after phase change
    ) {
        const sender = senderId ? __classPrivateFieldGet(this, _Game_players, "f").get(senderId) : null;
        const message = new Message_1.Message(__classPrivateFieldGet(this, _Game_round, "f"), phaseOverride ?? this.getCurrentPhaseType(), senderId, sender ? sender.name : 'System', content, visibility);
        __classPrivateFieldGet(this, _Game_conversationLog, "f").addMessage(message);
        // Notify renderers ONLY if the message should be public or if they handle specific visibilities
        // The renderer itself should decide if it displays Mafia chat etc.
        // A more robust approach might pass the visibility hint to the renderer.
        if (visibility === IMessage_1.MessageVisibility.Public) {
            this.notifyRenderers('renderMessage', message);
        }
        else if (visibility === IMessage_1.MessageVisibility.Mafia) {
            // Special handling maybe needed in renderer, or filter based on context
            // For now, let console renderer show it with a tag
            this.notifyRenderers('renderMessage', message); // Simple approach for now
        }
        return message;
    }
    async runGameLoop() {
        var _a;
        this.notifyRenderers('renderGameStart', this.getPublicPlayerMap(), this.id);
        while (!(__classPrivateFieldGet(this, _Game_currentState, "f") instanceof GameOverPhase_1.GameOverPhase)) {
            if (__classPrivateFieldGet(this, _Game_currentState, "f").type !== 'Init' && __classPrivateFieldGet(this, _Game_currentState, "f").type !== this.getCurrentPhaseType()) {
                // Handle potential state inconsistencies if needed
                console.warn("State type mismatch detected");
            }
            if (__classPrivateFieldGet(this, _Game_currentState, "f").type === 'Day') { // Increment round at the start of Day
                __classPrivateFieldSet(this, _Game_round, // Increment round at the start of Day
                (_a = __classPrivateFieldGet(this, _Game_round, "f"), _a++, _a), "f");
                this.notifyRenderers('renderRoundStart', __classPrivateFieldGet(this, _Game_round, "f"));
            }
            this.notifyRenderers('renderPhaseStart', this.getCurrentPhaseType(), this.round);
            // Execute the current phase's logic
            await __classPrivateFieldGet(this, _Game_currentState, "f").runPhase(this);
            // Check for game over conditions *before* transitioning
            const winner = this.checkWinCondition();
            if (winner) {
                __classPrivateFieldSet(this, _Game_currentState, new GameOverPhase_1.GameOverPhase(winner), "f");
                this.notifyRenderers('renderPhaseStart', this.getCurrentPhaseType(), this.round);
                await __classPrivateFieldGet(this, _Game_currentState, "f").runPhase(this); // Run the GameOver phase logic
            }
            else {
                // Transition to the next state
                __classPrivateFieldSet(this, _Game_currentState, __classPrivateFieldGet(this, _Game_currentState, "f").transition(this), "f");
            }
        }
        this.notifyRenderers('renderNarration', "Game Loop Finished.");
    }
    // --- State Accessors and Mutators (called by Phases) ---
    getPlayer(id) {
        return __classPrivateFieldGet(this, _Game_players, "f").get(id);
    }
    getPlayers() {
        return __classPrivateFieldGet(this, _Game_players, "f");
    }
    getAlivePlayers() {
        return Array.from(__classPrivateFieldGet(this, _Game_players, "f").values()).filter(p => p.isAlive());
    }
    getAliveMafia() {
        return Array.from(__classPrivateFieldGet(this, _Game_players, "f").values()).filter(p => p.isAlive() && p.role.name === IRole_1.RoleName.Mafia);
    }
    getAliveVillagers() {
        return Array.from(__classPrivateFieldGet(this, _Game_players, "f").values()).filter(p => p.isAlive() && p.role.name === IRole_1.RoleName.Villager);
    }
    getPublicPlayerMap() {
        const map = new Map();
        __classPrivateFieldGet(this, _Game_players, "f").forEach(p => map.set(p.id, p.getPublicRepresentation()));
        return map;
    }
    getPublicPlayerArray() {
        return Array.from(__classPrivateFieldGet(this, _Game_players, "f").values()).map(p => p.getPublicRepresentation());
    }
    get round() {
        return __classPrivateFieldGet(this, _Game_round, "f");
    }
    getCurrentPhaseType() {
        return __classPrivateFieldGet(this, _Game_currentState, "f").type;
    }
    getConversationLog() {
        return __classPrivateFieldGet(this, _Game_conversationLog, "f");
    }
    // --- Game Logic Helpers ---
    killPlayer(playerId, reason) {
        const player = __classPrivateFieldGet(this, _Game_players, "f").get(playerId);
        if (player && player.isAlive()) {
            const oldStatus = player.status;
            player.kill();
            this.logMessage(null, `${player.name} (${player.role.name}) ${reason}`, IMessage_1.MessageVisibility.Public);
            this.notifyRenderers('renderPlayerStatusUpdate', player.getPublicRepresentation(), oldStatus, player.status);
        }
    }
    checkWinCondition() {
        const aliveMafia = this.getAliveMafia().length;
        const aliveTown = this.getAliveVillagers().length; // Add other town roles here
        if (aliveMafia === 0) {
            return 'Town';
        }
        if (aliveMafia >= aliveTown) {
            return 'Mafia';
        }
        return null;
    }
    // Creates the specific view of the game state for a given player
    generateVisibleGameState(playerId) {
        const player = this.getPlayer(playerId);
        if (!player)
            throw new Error(`Player ${playerId} not found for generating state.`);
        const isMafia = player.role.name === IRole_1.RoleName.Mafia;
        // Base visible state
        const state = {
            gameId: this.id,
            round: this.round,
            phase: this.getCurrentPhaseType(),
            self: {
                id: player.id,
                name: player.name,
                status: player.status,
                role: player.role.name,
                isMafia: isMafia,
            },
            players: this.getPublicPlayerArray(), // Only public info
            alivePlayerIds: new Set(this.getAlivePlayers().map(p => p.id)),
            // Conditionally add Mafia member list
            ...(isMafia && { mafiaPlayerIds: new Set(this.getAliveMafia().map(p => p.id)) }),
            // TODO: Add relevant recent messages from ConversationLog based on visibility
            // recentMessages: this.#conversationLog.getMessages({ relevantToPlayer: { id: playerId, role: player.role.name }})
        };
        return Object.freeze(state); // Make it immutable
    }
}
exports.Game = Game;
_Game_players = new WeakMap(), _Game_currentState = new WeakMap(), _Game_renderers = new WeakMap(), _Game_conversationLog = new WeakMap(), _Game_round = new WeakMap();
