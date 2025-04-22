import type { IGameRenderer } from '../interfaces/IGameRenderer';
import { IMessage, MessageVisibility } from '../interfaces/IMessage';
import type { PlayerId, PublicPlayerInfo } from '../interfaces/IPlayer';
import type { VisibleGameState } from '../interfaces/GameState';
import type { GamePhaseType } from '../interfaces/IGamePhase';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { format } from 'date-fns';
import { type AgentMemory, type AIConversationLog } from '../interfaces/AgentMemory';

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
        } else {
            this.appendToMarkdown(`**Execution Result**: No one was executed.`);
        }
    }

    renderNightResults(killedPlayerId: PlayerId | null): void {
        this.appendToMarkdown(`#### Night Results`);
        
        if (killedPlayerId) {
            this.appendToMarkdown(`**${killedPlayerId}** was killed during the night.`);
        } else {
            this.appendToMarkdown(`Everyone survived the night.`);
        }
    }

    renderPlayerStatusUpdate(player: PublicPlayerInfo, oldStatus: string, newStatus: string): void {
        this.appendToMarkdown(`**Player Update**: ${player.name} status changed from ${oldStatus} to ${newStatus}.`);
    }

    renderGameOver(winner: string, finalState: VisibleGameState): void {
        this.appendToMarkdown(`## Game Over`);
        this.appendToMarkdown(`**Winner: ${winner}**`);
        
        // Create a final player table with roles (now revealed)
        this.appendToMarkdown(`### Final Player Status`);
        
        let playerTable = '| Player | Status | Role | Allegiance |\n|--------|--------|------|------------|\n';
        
        if (finalState.playerDetails) {
            for (const player of finalState.playerDetails) {
                playerTable += `| ${player.name} | ${player.status} | ${player.role} | ${player.allegiance} |\n`;
            }
        } else {
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
        
        // --- NEW: AI Conversation Logs --- 
        this.appendToMarkdown(`## AI Agent Conversation Logs`);

        // Check if detailed player info is available
        if (finalState.playerDetails && finalState.playerDetails.length > 0) {
            let foundLogs = false;
            for (const playerInfo of finalState.playerDetails) {
                // Access memory via the assumed structure in finalState.
                // IMPORTANT: This requires `createPublicFinalState` in GameOverPhase to add this data.
                const memory = (finalState as any).memories?.[playerInfo.id] as AgentMemory | undefined;

                if (memory && memory.aiConversationLogs && memory.aiConversationLogs.length > 0) {
                    foundLogs = true;
                    this.appendToMarkdown(`### Logs for ${playerInfo.name} (${playerInfo.id} - Role: ${playerInfo.role || 'Unknown'})`);
                    memory.aiConversationLogs.forEach((log: AIConversationLog, index: number) => {
                        this.appendToMarkdown(`#### Log Entry ${index + 1} (Round ${log.round}, ${log.phase})`);
                        this.appendToMarkdown(`- **Timestamp:** ${log.timestamp ? format(log.timestamp, 'yyyy-MM-dd HH:mm:ss.SSS') : 'N/A'}`);
                        this.appendToMarkdown(`- **Model:** ${log.model || 'N/A'}`);
                        this.appendToMarkdown(`- **System Prompt:**`);
                        this.appendToMarkdown('```txt\n' + (log.prompt.system || '(None)') + '\n```'); // Use txt for generic prompts
                        this.appendToMarkdown(`- **User Prompt:**`);
                        this.appendToMarkdown('```json\n' + (log.prompt.user || '(None)') + '\n```'); // Assume user prompt is structured JSON
                        this.appendToMarkdown(`- **Raw Response:**`);
                        this.appendToMarkdown('```json\n' + (log.response.raw || '(None)') + '\n```'); // Assume raw response is JSON
                        if (log.response.parsedAction) {
                            this.appendToMarkdown(`- **Parsed Action:** \`\`\`json\n${JSON.stringify(log.response.parsedAction, null, 2)}\n\`\`\``);
                        }
                        if (log.response.error) {
                            this.appendToMarkdown(`- **Error:**`);
                            this.appendToMarkdown('```\n' + log.response.error + '\n```');
                        }
                        this.appendToMarkdown(`---`); // Separator between log entries
                    });
                } else if (memory && (!memory.aiConversationLogs || memory.aiConversationLogs.length === 0)) {
                    // Optionally log if an AI agent had no recorded conversations
                    // Check if player was supposed to be AI (e.g., not Human type if available)
                    // We don't have agent type here, so maybe just skip or add a generic note.
                }
            }
            if (!foundLogs) {
                this.appendToMarkdown(`*No AI conversation logs were recorded or made available in the final game state.*`);
            }
        } else {
            this.appendToMarkdown(`*Could not retrieve detailed player information to display AI logs.*`);
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
