import type { IGameRenderer } from '../interfaces/IGameRenderer';
import { type IMessage, MessageVisibility } from '../interfaces/IMessage';
import type { PlayerId, PublicPlayerInfo } from '../interfaces/IPlayer';
import type { VisibleGameState } from '../interfaces/GameState';
import type { GamePhaseType } from '../interfaces/IGamePhase';
import chalk from 'chalk';

export class ConsoleRenderer implements IGameRenderer {
    #messages: IMessage[] = []; // Store messages for debug/reference

    renderGameStart(players: ReadonlyMap<PlayerId, PublicPlayerInfo>, gameId: string): void {
        console.log(chalk.bgBlue.white.bold('\n 🎮 MAFIA GAME START 🎮 \n'));
        console.log(chalk.blue(`Game ID: ${gameId}`));
        console.log(chalk.bold('Players:'));
        for (const [id, player] of players.entries()) {
            console.log(`  ${chalk.cyan(player.name)} (${id})`);
        }
        console.log('\n');
    }

    renderRoundStart(round: number): void {
        console.log(chalk.bgGreen.black.bold(`\n 🔄 ROUND ${round} 🔄 \n`));
    }

    renderPhaseStart(phase: GamePhaseType, round: number): void {
        let emoji = '';
        let color = chalk.white;
        
        switch (phase) {
            case 'Day':
                emoji = '☀️';
                color = chalk.yellow;
                break;
            case 'Night':
                emoji = '🌙';
                color = chalk.blue;
                break;
            case 'Init':
                emoji = '🎲';
                color = chalk.green;
                break;
            case 'GameOver':
                emoji = '🏁';
                color = chalk.red;
                break;
        }
        
        console.log(color.bold(`\n ${emoji} ${phase.toUpperCase()} PHASE ${emoji} \n`));
    }

    renderMessage(message: IMessage): void {
        this.#messages.push(message);

        let prefix = '';
        let messageColor = chalk.white;
        
        switch (message.visibility) {
            case MessageVisibility.Public:
                prefix = '[PUBLIC]';
                messageColor = chalk.white;
                break;
            case MessageVisibility.Mafia:
                prefix = '[MAFIA]';
                messageColor = chalk.red;
                break;
            default:
                prefix = '[UNKNOWN]';
        }

        // Sender info formatting
        const sender = message.senderId ? 
            chalk.cyan(`${message.senderName}`) : 
            chalk.yellow('SYSTEM');
        
        const timestamp = new Date(message.timestamp).toLocaleTimeString();
        console.log(`${messageColor(prefix)} ${sender}: ${messageColor(message.content)} (${chalk.gray(timestamp)})`);
    }

    renderVoteResults(votes: Map<PlayerId, PlayerId | null>, executedPlayerId: PlayerId | null): void {
        console.log(chalk.bold('\n📊 VOTE RESULTS:'));

        // Display individual votes
        for (const [voterId, targetId] of votes.entries()) {
            const targetText = targetId === null ? 'abstains' : `votes for ${targetId}`;
            console.log(`  ${chalk.cyan(voterId)} ${targetText}`);
        }

        // Display execution result
        if (executedPlayerId) {
            console.log(chalk.red.bold(`\n⚰️  ${executedPlayerId} was EXECUTED by the town.\n`));
        } else {
            console.log(chalk.yellow('\n🤷 No one was executed.\n'));
        }
    }

    renderNightResults(killedPlayerId: PlayerId | null): void {
        console.log(chalk.bold('\n🌃 NIGHT RESULTS:'));
        
        if (killedPlayerId) {
            console.log(chalk.red.bold(`\n⚰️  ${killedPlayerId} was KILLED during the night.\n`));
        } else {
            console.log(chalk.green('\n✅ Everyone survived the night.\n'));
        }
    }

    renderPlayerStatusUpdate(player: PublicPlayerInfo, oldStatus: string, newStatus: string): void {
        console.log(chalk.magenta(`\n👤 ${player.name} status changed from ${oldStatus} to ${newStatus}\n`));
    }

    renderGameOver(winner: string, finalState: VisibleGameState): void {
        console.log(chalk.bgRed.white.bold(`\n 🏁 GAME OVER 🏁 \n`));
        console.log(chalk.bold(`The ${chalk.green(winner)} has won!`));
        
        console.log(chalk.bold('\nFinal Player Status:'));
        for (const player of finalState.players) {
            // In a real game, we'd enhance this with role information
            const roleInfo = finalState.playerDetails?.find(p => p.id === player.id);
            const roleDisplay = roleInfo ? ` - ${roleInfo.role} (${roleInfo.allegiance})` : '';
            
            const statusColor = player.status === 'Dead' ? chalk.red : chalk.green;
            console.log(`  ${chalk.cyan(player.name)}: ${statusColor(player.status)}${chalk.yellow(roleDisplay)}`);
        }
        
        console.log(chalk.bold('\nGame Summary:'));
        console.log(`  Rounds played: ${finalState.round}`);
        console.log(`  Winner: ${chalk.green(winner)}`);
        console.log('\n');
    }

    renderNarration(text: string): void {
        console.log(chalk.italic.gray(`\n${text}\n`));
    }

    getConversationLog(): ReadonlyArray<IMessage> {
        return [...this.#messages];
    }
}
