"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameOverPhase = void 0;
const AbstractGamePhase_1 = require("./AbstractGamePhase");
const IMessage_1 = require("../interfaces/IMessage");
class GameOverPhase extends AbstractGamePhase_1.AbstractGamePhase {
    constructor(winner) {
        super();
        this.winner = winner;
        this.type = 'GameOver';
    }
    async runPhase(game) {
        game.logMessage(null, `Game Over! The ${this.winner} has won.`, IMessage_1.MessageVisibility.Public);
        // Get the final state visible to all (reveal roles etc)
        const finalState = this.createPublicFinalState(game);
        // Render the final game state
        game.notifyRenderers('renderGameOver', this.winner, finalState);
    }
    transition(game) {
        // No transition from GameOver, but we need to implement the abstract method
        return this; // Remain in GameOver phase
    }
    createPublicFinalState(game) {
        // For the final state, we can show more information
        // such as all roles even for dead players
        // Get all players with roles
        const players = Array.from(game.getPlayers().values()).map(player => {
            return {
                id: player.id,
                name: player.name,
                status: player.status,
                role: player.role.name,
                allegiance: player.role.allegiance
            };
        });
        return {
            gameId: game.id,
            round: game.round,
            phase: this.type,
            self: {
                id: "system",
                name: "System",
                status: "Alive",
                role: "System",
                isMafia: false,
            },
            players: game.getPublicPlayerArray(),
            alivePlayerIds: new Set(), // Empty since game is over
            winningTeam: this.winner,
            playerDetails: players
        }; // Type assertion since we're extending the interface
    }
}
exports.GameOverPhase = GameOverPhase;
