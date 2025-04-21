"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarkdownRenderer = void 0;
const IMessage_1 = require("../interfaces/IMessage");
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
class MarkdownRenderer {
    constructor(outputDirectory = 'game_logs') {
        this.gameId = '';
        this.outputDirectory = '';
        this.outputFile = '';
        this.markdownContent = [];
        this.messages = [];
        this.outputDirectory = outputDirectory;
        // Ensure output directory exists
        if (!fs.existsSync(outputDirectory)) {
            fs.mkdirSync(outputDirectory, { recursive: true });
        }
    }
    appendToMarkdown(content) {
        this.markdownContent.push(content);
        // Write to file if available
        if (this.outputFile) {
            try {
                fs.writeFileSync(this.outputFile, this.markdownContent.join('\n\n'));
            }
            catch (error) {
                console.error('Failed to write to markdown file:', error);
            }
        }
    }
    renderGameStart(players, gameId) {
        this.gameId = gameId;
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        this.outputFile = path.join(this.outputDirectory, `mafia-game-${gameId}-${timestamp}.md`);
        this.markdownContent = []; // Reset the content
        this.appendToMarkdown(`# Mafia Game: ${gameId}`);
        this.appendToMarkdown(`*Game started at: ${new Date().toLocaleString()}*`);
        const playerList = Array.from(players.values()).map(p => `- ${p.name} (${p.id})`).join('\n');
        this.appendToMarkdown(`## Players\n${playerList}`);
    }
    renderRoundStart(round) {
        this.appendToMarkdown(`## Round ${round}`);
    }
    renderPhaseStart(phase, round) {
        this.appendToMarkdown(`### ${phase} Phase (Round ${round})`);
    }
    renderMessage(message) {
        this.messages.push(message);
        // Skip rendering private Mafia messages in the public log
        if (message.visibility === IMessage_1.MessageVisibility.Mafia) {
            return;
        }
        const sender = message.senderId ? message.senderName : 'SYSTEM';
        const timestamp = new Date(message.timestamp).toLocaleTimeString();
        this.appendToMarkdown(`**${sender}**: ${message.content} *[${timestamp}]*`);
    }
    renderVoteResults(votes, executedPlayerId) {
        this.appendToMarkdown(`#### Vote Results`);
        // Create a vote table
        let voteTable = '| Voter | Target |\n|-------|--------|\n';
        for (const [voterId, targetId] of votes.entries()) {
            const target = targetId === null ? 'Abstain' : targetId;
            voteTable += `| ${voterId} | ${target} |\n`;
        }
        this.appendToMarkdown(voteTable);
        if (executedPlayerId) {
            this.appendToMarkdown(`**Execution Result**: ${executedPlayerId} was executed by town vote.`);
        }
        else {
            this.appendToMarkdown(`**Execution Result**: No one was executed.`);
        }
    }
    renderNightResults(killedPlayerId) {
        this.appendToMarkdown(`#### Night Results`);
        if (killedPlayerId) {
            this.appendToMarkdown(`**${killedPlayerId}** was killed during the night.`);
        }
        else {
            this.appendToMarkdown(`Everyone survived the night.`);
        }
    }
    renderPlayerStatusUpdate(player, oldStatus, newStatus) {
        this.appendToMarkdown(`**Player Update**: ${player.name} status changed from ${oldStatus} to ${newStatus}.`);
    }
    renderGameOver(winner, finalState) {
        this.appendToMarkdown(`## Game Over`);
        this.appendToMarkdown(`**Winner: ${winner}**`);
        // Create a final player table with roles (now revealed)
        this.appendToMarkdown(`### Final Player Status`);
        let playerTable = '| Player | Status | Role | Allegiance |\n|--------|--------|------|------------|\n';
        if (finalState.playerDetails) {
            for (const player of finalState.playerDetails) {
                playerTable += `| ${player.name} | ${player.status} | ${player.role} | ${player.allegiance} |\n`;
            }
        }
        else {
            // Fallback to just the public info
            for (const player of finalState.players) {
                playerTable += `| ${player.name} | ${player.status} | ? | ? |\n`;
            }
        }
        this.appendToMarkdown(playerTable);
        // Add game summary
        this.appendToMarkdown(`### Game Summary`);
        this.appendToMarkdown(`- **Game ID**: ${this.gameId}`);
        this.appendToMarkdown(`- **Rounds Played**: ${finalState.round}`);
        this.appendToMarkdown(`- **Winner**: ${winner}`);
        this.appendToMarkdown(`- **End Time**: ${new Date().toLocaleString()}`);
        console.log(`Markdown log file saved to: ${this.outputFile}`);
    }
    renderNarration(text) {
        this.appendToMarkdown(`*${text}*`);
    }
    getConversationLog() {
        return [...this.messages];
    }
}
exports.MarkdownRenderer = MarkdownRenderer;
