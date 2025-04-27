import type { GamePhaseType } from "../interfaces/IGamePhase";
import  { type IMessage, MessageVisibility } from "../interfaces/IMessage";
import type { PlayerId } from "../interfaces/IPlayer";
import { RoleName } from "../interfaces/IRole";

export class ConversationLog {
    #messages: IMessage[] = [];

    addMessage(message: IMessage): void {
        this.#messages.push(message);
        // Maybe add validation here
    }

    getMessages(filter?: {
        round?: number;
        phase?: GamePhaseType;
        visibility?: MessageVisibility | MessageVisibility[];
        relevantToPlayer?: { id: PlayerId, role: RoleName }; // Filter based on what a player should see
    }): ReadonlyArray<IMessage> {
        let filtered = [...this.#messages]; // Copy

        if (filter?.round !== undefined) {
            filtered = filtered.filter(m => m.round === filter.round);
        }
        if (filter?.phase) {
            filtered = filtered.filter(m => m.phase === filter.phase);
        }
        if (filter?.visibility) {
            const visibilities = Array.isArray(filter.visibility) ? filter.visibility : [filter.visibility];
            filtered = filtered.filter(m => visibilities.includes(m.visibility));
        }
        if (filter?.relevantToPlayer) {
             const { id, role } = filter.relevantToPlayer;
             const isMafia = role === RoleName.Mafia;
             filtered = filtered.filter(m =>
                m.visibility === MessageVisibility.Public ||
                (m.visibility === MessageVisibility.Mafia && isMafia)
                // || m.recipientId === id // For future private messages
             );
        }

        return Object.freeze(filtered); // Return immutable view
    }

    getAllMessages(): ReadonlyArray<IMessage> {
        return Object.freeze([...this.#messages]);
    }
}
