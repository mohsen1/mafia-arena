import { type IMessage, MessageVisibility } from "../interfaces/IMessage";
import { type PlayerId } from "../interfaces/IPlayer";
import { type GamePhaseType } from "../interfaces/IGamePhase";
import { v4 as uuidv4 } from 'uuid'; // Use uuid for unique IDs

export class Message implements IMessage {
    public readonly id: string;
    public readonly timestamp: Date;

    constructor(
        public readonly round: number,
        public readonly phase: GamePhaseType,
        public readonly senderId: PlayerId | null,
        public readonly senderName: string, // Store name directly
        public readonly content: string,
        public readonly visibility: MessageVisibility,
        public readonly recipientId?: PlayerId
    ) {
        this.id = uuidv4();
        this.timestamp = new Date();
    }
}
