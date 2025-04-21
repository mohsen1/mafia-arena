"use strict";
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _Player_agent, _Player_status, _Player_role;
Object.defineProperty(exports, "__esModule", { value: true });
exports.Player = void 0;
const IPlayer_1 = require("../interfaces/IPlayer");
class Player {
    constructor(id, name, role, // Inject role
    agent // Inject agent
    ) {
        this.id = id;
        this.name = name;
        _Player_agent.set(this, void 0);
        _Player_status.set(this, IPlayer_1.PlayerStatus.Alive);
        _Player_role.set(this, void 0); // Role is private!
        if (agent.playerId !== id) {
            throw new Error(`Agent playerId ${agent.playerId} does not match Player id ${id}`);
        }
        __classPrivateFieldSet(this, _Player_role, role, "f");
        __classPrivateFieldSet(this, _Player_agent, agent, "f");
    }
    get status() {
        return __classPrivateFieldGet(this, _Player_status, "f");
    }
    get role() {
        // Be careful exposing the full role object if it contains sensitive info
        // Return a copy or specific properties if needed elsewhere
        return __classPrivateFieldGet(this, _Player_role, "f");
    }
    get agent() {
        return __classPrivateFieldGet(this, _Player_agent, "f");
    }
    isAlive() {
        return __classPrivateFieldGet(this, _Player_status, "f") === IPlayer_1.PlayerStatus.Alive;
    }
    kill() {
        __classPrivateFieldSet(this, _Player_status, IPlayer_1.PlayerStatus.Dead, "f");
    }
    getPublicRepresentation() {
        return {
            id: this.id,
            name: this.name,
            status: this.status,
            // Note: Role is NOT included here
        };
    }
    // Delegate action request to the agent, passing filtered state
    async decideAction(gameState) {
        if (!this.isAlive()) {
            console.warn(`Attempted to get action from dead player ${this.id}`);
            return { type: 'noAction' };
        }
        try {
            // The Game class is responsible for constructing the *correct*
            // VisibleGameState for this specific player before calling this.
            return await __classPrivateFieldGet(this, _Player_agent, "f").getAction(gameState);
        }
        catch (error) {
            console.error(`Error getting action from agent ${this.id}:`, error);
            return { type: 'noAction' }; // Default safe action on error
        }
    }
}
exports.Player = Player;
_Player_agent = new WeakMap(), _Player_status = new WeakMap(), _Player_role = new WeakMap();
