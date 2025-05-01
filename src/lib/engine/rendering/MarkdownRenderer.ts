import type { IGameRenderer } from '../interfaces/IGameRenderer';
import { IMessage, MessageVisibility } from '../interfaces/IMessage';
import type { PlayerId, PublicPlayerInfo } from '../interfaces/IPlayer';
import type { VisibleGameState } from '../interfaces/GameState';
import type { GamePhaseType } from '../interfaces/IGamePhase';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { format } from 'date-fns';
import { type AgentMemory, type AIConversationLog } from '../interfaces/AgentMemory';
import type { SerializableGameState } from '../interfaces/GameState';

export class MarkdownRenderer implements IGameRenderer {
    private gameId = '';
    private outputDirectory = '';
    private outputFile = '';
    private markdownContent: string[] = [];
    private messages: IMessage[] = [];

    constructor(outputDirectory = 'game_logs') {
        this.outputDirectory = outputDirectory;
        
        // Ensure output directory exists
        if (!fs.existsSync(outputDirectory)) {
            fs.mkdirSync(outputDirectory, { recursive: true });
        }
    }

    private appendToMarkdown(content: string): void {
        this.markdownContent.push(content);
        
        // Write to file if available
        if (this.outputFile) {
            try {
                fs.writeFileSync(this.outputFile, this.markdownContent.join('\n\n'));
            } catch (error) {
                console.error('Failed to write to markdown file:', error);
            }
        }
    }

    renderGameStart(players: ReadonlyMap<PlayerId, PublicPlayerInfo>, gameId: string): void {
        this.gameId = gameId;
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        this.outputFile = path.join(this.outputDirectory, `mafia-game-${gameId}-${timestamp}.md`);

        this.markdownContent = []; // Reset the content
        
        this.appendToMarkdown(`# Mafia Game: ${gameId}`);
        this.appendToMarkdown(`*Game started at: ${new Date().toLocaleString()}*`);
        
        const playerList = Array.from(players.values()).map(p => `- ${p.name} (${p.id})`).join('\n');
        this.appendToMarkdown(`## Players\n${playerList}`);
    }

    renderRoundStart(round: number): void {
        this.appendToMarkdown(`## Round ${round}`);
    }

    renderPhaseStart(phase: GamePhaseType, round: number): void {
        this.appendToMarkdown(`### ${phase} Phase (Round ${round})`);
    }

    renderMessage(message: IMessage): void {
        this.messages.push(message);
        
        // Skip rendering private Mafia messages in the public log
        if (message.visibility === MessageVisibility.Mafia) {
            return;
        }
        
        const sender = message.senderId ? message.senderName : 'SYSTEM';
        const timestamp = new Date(message.timestamp).toLocaleTimeString();
        
        this.appendToMarkdown(`**${sender}**: ${message.content} *[${timestamp}]*`);
    }

    renderVoteResults(votes: Map<PlayerId, PlayerId | null>, executedPlayerId: PlayerId | null): void {
        this.appendToMarkdown('#### Vote Results');
        
        // Create a vote table
        let voteTable = '| Voter | Target |\n|-------|--------|\n';
        
        for (const [voterId, targetId] of votes.entries()) {
            const target = targetId === null ? 'Abstain' : targetId;
            voteTable += `| ${voterId} | ${target} |\n`;
        }
        
        this.appendToMarkdown(voteTable);
        
        if (executedPlayerId) {
            this.appendToMarkdown(`**Execution Result**: ${executedPlayerId} was executed by town vote.`);
        } else {
            this.appendToMarkdown('**Execution Result**: No one was executed.');
        }
    }

    renderNightResults(killedPlayerId: PlayerId | null): void {
        this.appendToMarkdown('#### Night Results');
        
        if (killedPlayerId) {
            this.appendToMarkdown(`**${killedPlayerId}** was killed during the night.`);
        } else {
            this.appendToMarkdown('Everyone survived the night.');
        }
    }

    renderPlayerStatusUpdate(player: PublicPlayerInfo, oldStatus: string, newStatus: string): void {
        this.appendToMarkdown(`**Player Update**: ${player.name} status changed from ${oldStatus} to ${newStatus}.`);
    }

    renderGameOver(winner: 'Mafia' | 'Town' | null, finalState: SerializableGameState): void {
        this.appendToMarkdown('## Game Over');
        this.appendToMarkdown(`**Winner: ${winner ?? 'Undetermined'}**`);
        
        this.appendToMarkdown('### Final Player Status');
        
        let playerTable = '| Player | Status | Role | Allegiance |\n|--------|--------|------|------------|\n';
        
        const players = Object.values(finalState.players || {}) as SerializablePlayer[];
        if (players.length > 0) {
            for (const player of players) {
                playerTable += `| ${player.name} | ${player.status} | ${player.roleName} | ${player.allegiance} |\n`;
            }
        } else {
            playerTable += '| (No Player Data) | - | - | - |\n';
        }
        
        this.appendToMarkdown(playerTable);
        
        this.appendToMarkdown('### Game Summary');
        this.appendToMarkdown(`- **Game ID**: ${this.gameId}`);
        this.appendToMarkdown(`- **Rounds Played**: ${finalState.round}`);
        this.appendToMarkdown(`- **Winner**: ${winner ?? 'Undetermined'}`);
        this.appendToMarkdown(`- **End Time**: ${new Date().toLocaleString()}`);
        
        this.appendToMarkdown('## AI Agent Conversation Logs');

        const agentMemories = finalState.agentMemories || {};
        let foundLogs = false;

        if (players.length > 0) {
            for (const playerInfo of players) { 
                const memory = agentMemories[playerInfo.id]; 

                if (memory?.aiConversationLogs && memory.aiConversationLogs.length > 0) {
                    foundLogs = true;
                    this.appendToMarkdown(`### Logs for ${playerInfo.name} (${playerInfo.id} - Role: ${playerInfo.roleName || 'Unknown'})`);
                    memory.aiConversationLogs.forEach((log: AIConversationLog, index: number) => {
                        this.appendToMarkdown(`#### Log Entry ${index + 1} (Round ${log.round}, ${log.phase})`);
                        this.appendToMarkdown(`- **Timestamp:** ${log.timestamp ? format(log.timestamp, 'yyyy-MM-dd HH:mm:ss.SSS') : 'N/A'}`);
                        this.appendToMarkdown(`- **Model:** ${log.model || 'N/A'}`);
                        this.appendToMarkdown('- **System Prompt:**');
                        this.appendToMarkdown(`\`\`\`txt\n${log.prompt.system || '(None)'}\n\`\`\``);
                        this.appendToMarkdown('- **User Prompt:**');
                        this.appendToMarkdown(`\`\`\`txt\n${log.prompt.user || '(None)'}\n\`\`\``);
                        this.appendToMarkdown('- **Raw Response:**');
                        this.appendToMarkdown(`\`\`\`json\n${log.response.raw || '(None)'}\n\`\`\``);
                        if (log.response.parsedAction) {
                            this.appendToMarkdown(`- **Parsed Action:** \`\`\`json\n${JSON.stringify(log.response.parsedAction, null, 2)}\n\`\`\``);
                        }
                        if (log.response.error) {
                            this.appendToMarkdown('- **Error:**');
                            this.appendToMarkdown(`\`\`\`\n${log.response.error}\n\`\`\``);
                        }
                        this.appendToMarkdown('---');
                    });
                }
            }
        }

        if (!foundLogs) {
            this.appendToMarkdown('*No AI conversation logs were recorded or available in the final game state.*');
        }

        console.log(`Markdown log file saved to: ${this.outputFile}`);
    }

    renderNarration(text: string): void {
        this.appendToMarkdown(`*${text}*`);
    }

    getConversationLog(): ReadonlyArray<IMessage> {
        return [...this.messages];
    }
}
