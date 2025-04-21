import { PlayerStatus, type IPlayer, type PlayerId, type PublicPlayerInfo } from "../interfaces/IPlayer";
import type { IRole } from "../interfaces/IRole";
import type { IAgent } from "../interfaces/IAgent";
import type { VisibleGameState } from "../interfaces/GameState";
import type { PlayerAction } from "../interfaces/IAgent";

export class Player implements IPlayer {
    readonly #agent: IAgent;
    #status: PlayerStatus = PlayerStatus.Alive;
    readonly #role: IRole; // Role is private!

    constructor(
        public readonly id: PlayerId,
        public readonly name: string,
        role: IRole, // Inject role
        agent: IAgent // Inject agent
    ) {
        if (agent.playerId !== id) {
            throw new Error(`Agent playerId ${agent.playerId} does not match Player id ${id}`);
        }
        this.#role = role;
        this.#agent = agent;
    }

    get status(): PlayerStatus {
        return this.#status;
    }

    get role(): IRole {
        // Be careful exposing the full role object if it contains sensitive info
        // Return a copy or specific properties if needed elsewhere
        return this.#role;
    }

    get agent(): IAgent {
        return this.#agent;
    }

    isAlive(): boolean {
        return this.#status === PlayerStatus.Alive;
    }

    kill(): void {
        this.#status = PlayerStatus.Dead;
    }

    getPublicRepresentation(): PublicPlayerInfo {
        return {
            id: this.id,
            name: this.name,
            status: this.status,
            // Note: Role is NOT included here
        };
    }

    // Delegate action request to the agent, passing filtered state
    async decideAction(gameState: VisibleGameState, allowedActions?: PlayerAction['type'][]): Promise<PlayerAction> {
        if (!this.isAlive()) {
            console.warn(`Attempted to get action from dead player ${this.id}`);
            return { type: 'noAction' };
        }
        try {
            // The Game class is responsible for constructing the *correct*
            // VisibleGameState for this specific player before calling this.
            return await this.#agent.getAction(gameState, allowedActions);
        } catch (error) {
            console.error(`Error getting action from agent ${this.id}:`, error);
            return { type: 'noAction' }; // Default safe action on error
        }
    }
}
