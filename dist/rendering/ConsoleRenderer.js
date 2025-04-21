"use strict";
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _ConsoleRenderer_messages;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConsoleRenderer = void 0;
const IMessage_1 = require("../interfaces/IMessage");
const chalk_1 = __importDefault(require("chalk"));
class ConsoleRenderer {
    constructor() {
        _ConsoleRenderer_messages.set(this, []); // Store messages for debug/reference
    }
    renderGameStart(players, gameId) {
        console.log(chalk_1.default.bgBlue.white.bold('\n 🎮 MAFIA GAME START 🎮 \n'));
        console.log(chalk_1.default.blue(`Game ID: ${gameId}`));
        console.log(chalk_1.default.bold('Players:'));
        for (const [id, player] of players.entries()) {
            console.log(`  ${chalk_1.default.cyan(player.name)} (${id})`);
        }
        console.log('\n');
    }
    renderRoundStart(round) {
        console.log(chalk_1.default.bgGreen.black.bold(`\n 🔄 ROUND ${round} 🔄 \n`));
    }
    renderPhaseStart(phase, round) {
        let emoji = '';
        let color = chalk_1.default.white;
        switch (phase) {
            case 'Day':
                emoji = '☀️';
                color = chalk_1.default.yellow;
                break;
            case 'Night':
                emoji = '🌙';
                color = chalk_1.default.blue;
                break;
            case 'Init':
                emoji = '🎲';
                color = chalk_1.default.green;
                break;
            case 'GameOver':
                emoji = '🏁';
                color = chalk_1.default.red;
                break;
        }
        console.log(color.bold(`\n ${emoji} ${phase.toUpperCase()} PHASE ${emoji} \n`));
    }
    renderMessage(message) {
        __classPrivateFieldGet(this, _ConsoleRenderer_messages, "f").push(message);
        let prefix = '';
        let messageColor = chalk_1.default.white;
        switch (message.visibility) {
            case IMessage_1.MessageVisibility.Public:
                prefix = '[PUBLIC]';
                messageColor = chalk_1.default.white;
                break;
            case IMessage_1.MessageVisibility.Mafia:
                prefix = '[MAFIA]';
                messageColor = chalk_1.default.red;
                break;
            default:
                prefix = '[UNKNOWN]';
        }
        // Sender info formatting
        const sender = message.senderId ?
            chalk_1.default.cyan(`${message.senderName}`) :
            chalk_1.default.yellow('SYSTEM');
        const timestamp = new Date(message.timestamp).toLocaleTimeString();
        console.log(`${messageColor(prefix)} ${sender}: ${messageColor(message.content)} (${chalk_1.default.gray(timestamp)})`);
    }
    renderVoteResults(votes, executedPlayerId) {
        console.log(chalk_1.default.bold('\n📊 VOTE RESULTS:'));
        // Display individual votes
        for (const [voterId, targetId] of votes.entries()) {
            const targetText = targetId === null ? 'abstains' : `votes for ${targetId}`;
            console.log(`  ${chalk_1.default.cyan(voterId)} ${targetText}`);
        }
        // Display execution result
        if (executedPlayerId) {
            console.log(chalk_1.default.red.bold(`\n⚰️  ${executedPlayerId} was EXECUTED by the town.\n`));
        }
        else {
            console.log(chalk_1.default.yellow('\n🤷 No one was executed.\n'));
        }
    }
    renderNightResults(killedPlayerId) {
        console.log(chalk_1.default.bold('\n🌃 NIGHT RESULTS:'));
        if (killedPlayerId) {
            console.log(chalk_1.default.red.bold(`\n⚰️  ${killedPlayerId} was KILLED during the night.\n`));
        }
        else {
            console.log(chalk_1.default.green('\n✅ Everyone survived the night.\n'));
        }
    }
    renderPlayerStatusUpdate(player, oldStatus, newStatus) {
        console.log(chalk_1.default.magenta(`\n👤 ${player.name} status changed from ${oldStatus} to ${newStatus}\n`));
    }
    renderGameOver(winner, finalState) {
        console.log(chalk_1.default.bgRed.white.bold(`\n 🏁 GAME OVER 🏁 \n`));
        console.log(chalk_1.default.bold(`The ${chalk_1.default.green(winner)} has won!`));
        console.log(chalk_1.default.bold('\nFinal Player Status:'));
        for (const player of finalState.players) {
            // In a real game, we'd enhance this with role information
            const roleInfo = finalState.playerDetails?.find(p => p.id === player.id);
            const roleDisplay = roleInfo ? ` - ${roleInfo.role} (${roleInfo.allegiance})` : '';
            const statusColor = player.status === 'Dead' ? chalk_1.default.red : chalk_1.default.green;
            console.log(`  ${chalk_1.default.cyan(player.name)}: ${statusColor(player.status)}${chalk_1.default.yellow(roleDisplay)}`);
        }
        console.log(chalk_1.default.bold('\nGame Summary:'));
        console.log(`  Rounds played: ${finalState.round}`);
        console.log(`  Winner: ${chalk_1.default.green(winner)}`);
        console.log('\n');
    }
    renderNarration(text) {
        console.log(chalk_1.default.italic.gray(`\n${text}\n`));
    }
    getConversationLog() {
        return [...__classPrivateFieldGet(this, _ConsoleRenderer_messages, "f")];
    }
}
exports.ConsoleRenderer = ConsoleRenderer;
_ConsoleRenderer_messages = new WeakMap();
