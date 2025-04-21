"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InitializationPhase = void 0;
const AbstractGamePhase_1 = require("./AbstractGamePhase");
const DayPhase_1 = require("./DayPhase"); // Import next phase
const IMessage_1 = require("../interfaces/IMessage");
class InitializationPhase extends AbstractGamePhase_1.AbstractGamePhase {
    constructor() {
        super(...arguments);
        this.type = 'Init';
    }
    async runPhase(game) {
        game.logMessage(null, "Game is starting...", IMessage_1.MessageVisibility.Public, this.type);
        for (const player of game.getPlayers().values()) {
            // Maybe send a private "welcome" message to each player with their role?
            game.logMessage(null, `Welcome ${player.name}! You are a ${player.role.name}. Allegiance: ${player.role.allegiance}.`, IMessage_1.MessageVisibility.Public, this.type); // For demo, make public
            // In real game: Send via a private channel or only show in agent's initial state
        }
        ;
        // No actions needed in init phase itself
        await Promise.resolve(); // Represents completion if setup were async
    }
    transition(game) {
        // After initialization, always go to the first Day phase
        return new DayPhase_1.DayPhase();
    }
}
exports.InitializationPhase = InitializationPhase;
