import type { IGameRenderer } from '../interfaces/IGameRenderer';
import { type IMessage, MessageVisibility } from '../interfaces/IMessage';
import type { PlayerId, PublicPlayerInfo } from '../interfaces/IPlayer';
import type { GamePhaseType } from '../interfaces/IGamePhase';
import chalk from 'chalk';
import type { PlayerAction } from '../interfaces/IAgent';
import * as readline from 'node:readline/promises';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

export class ConsoleRenderer implements IGameRenderer {
  #messages: IMessage[] = []; // Store messages for debug/reference

  renderGameStart(
    players: ReadonlyMap<PlayerId, PublicPlayerInfo>,
    gameId: string
  ): void {
    console.log(chalk.bgBlue.white.bold('\n MAFIA GAME START \n'));
    console.log(chalk.blue(`Game ID: ${gameId}`));
    console.log(chalk.bold('Players:'));
    for (const [id, player] of players.entries()) {
      console.log(`  ${chalk.cyan(player.name)} (${id})`);
    }
    console.log('\n');
  }

  renderRoundStart(round: number): void {
    console.log(chalk.bgGreen.black.bold(`\n ROUND ${round} \n`));
  }

  renderPhaseStart(phase: GamePhaseType): void {
    let phaseLabel = '';
    let color = chalk.white;

    switch (phase) {
      case 'Day':
        phaseLabel = 'DAY';
        color = chalk.yellow;
        break;
      case 'Night':
        phaseLabel = 'NIGHT';
        color = chalk.blue;
        break;
      case 'Init':
        phaseLabel = 'INIT';
        color = chalk.green;
        break;
      case 'GameOver':
        phaseLabel = 'GAME OVER';
        color = chalk.red;
        break;
    }

    console.log(color.bold(`\n ${phaseLabel} PHASE \n`));
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
    const sender = message.senderId
      ? chalk.cyan(`${message.senderName}`)
      : chalk.yellow('SYSTEM');

    const timestamp = new Date(message.timestamp).toLocaleTimeString();
    console.log(
      `${messageColor(prefix)} ${sender}: ${messageColor(message.content)} (${chalk.gray(timestamp)})`
    );
  }

  renderVoteResults(
    votes: Map<PlayerId, PlayerId | null>,
    executedPlayerId: PlayerId | null
  ): void {
    console.log(chalk.bold('\nVOTE RESULTS:'));

    // Display individual votes
    for (const [voterId, targetId] of votes.entries()) {
      const targetText =
        targetId === null ? 'abstains' : `votes for ${targetId}`;
      console.log(`  ${chalk.cyan(voterId)} ${targetText}`);
    }

    // Display execution result
    if (executedPlayerId) {
      console.log(
        chalk.red.bold(`\n${executedPlayerId} was EXECUTED by the town.\n`)
      );
    } else {
      console.log(chalk.yellow('\nNo one was executed.\n'));
    }
  }

  renderNightResults(killedPlayerId: PlayerId | null): void {
    console.log(chalk.bold('\nNIGHT RESULTS:'));

    if (killedPlayerId) {
      console.log(
        chalk.red.bold(`\n${killedPlayerId} was KILLED during the night.\n`)
      );
    } else {
      console.log(chalk.green('\nEveryone survived the night.\n'));
    }
  }

  renderPlayerStatusUpdate(
    player: PublicPlayerInfo,
    oldStatus: string,
    newStatus: string
  ): void {
    console.log(
      chalk.magenta(
        `\n${player.name} status changed from ${oldStatus} to ${newStatus}\n`
      )
    );
  }

  // Restore function signature to satisfy IGameRenderer interface.
  // Implementation remains minimal due to signature mismatch (string vs specific union type for winner)
  // and CLI-only usage. Type mismatch is handled via `as any` cast in cli.ts.
  renderGameOver(winner: 'Town' | 'Mafia' | null): void {
    console.log('[ConsoleRenderer] renderGameOver called. Winner:', winner);
    // Original implementation commented below:
    /*
        console.log(chalk.bgRed.white.bold(`\n GAME OVER \n`));
        console.log(chalk.bold(`The ${chalk.green(winner || 'Unknown')} has won!`));
        
        console.log(chalk.bold('\nFinal Player Status:'));
        // Need SerializablePlayer type from finalState.players
        const players = Object.values(finalState.players || {}); 
        for (const player of players) { 
            const statusColor = player.status === 'Dead' ? chalk.red : chalk.green;
            console.log(`  ${chalk.cyan(player.persona.name)}: ${statusColor(player.status)} - ${player.roleName} (${player.allegiance})`);
        }
        
        console.log(chalk.bold('\nGame Summary:'));
        console.log(`  Rounds played: ${finalState.round}`);
        console.log(`  Winner: ${chalk.green(winner || 'Unknown')}`);
        console.log('\n');
        */
  }

  renderNarration(text: string): void {
    console.log(chalk.italic.gray(`\n${text}\n`));
  }

  getConversationLog(): ReadonlyArray<IMessage> {
    return [...this.#messages];
  }

  async promptHumanInput(
    playerInfo: PublicPlayerInfo,
    allowedActions: PlayerAction['type'][],
    players?: ReadonlyMap<PlayerId, PublicPlayerInfo>
  ): Promise<PlayerAction> {
    console.log('\n' + '='.repeat(60));
    console.log(
      chalk.bold.inverse(
        ` ${playerInfo.name.toUpperCase()} (${playerInfo.id}) - YOUR ACTION REQUIRED `
      )
    );
    console.log('='.repeat(60) + '\n');

    const options: string[] = [];
    const actionMap = new Map<
      string,
      () => Promise<PlayerAction> | PlayerAction
    >();

    if (allowedActions.includes('message')) {
      options.push(`${chalk.green('m')}essage [your message]`);
      actionMap.set('m', async () => {
        const content = await rl.question(chalk.green('Enter message: '));
        return { type: 'message', content: content.trim() };
      });
    }

    if (allowedActions.includes('vote')) {
      options.push(`${chalk.yellow('v')}ote [player number]`);
      actionMap.set('v', async () => {
        // Get alive players excluding self
        const alivePlayers = players
          ? Array.from(players.values()).filter(
              (p) => p.status === 'Alive' && p.id !== playerInfo.id
            )
          : [];

        console.log('\n' + chalk.yellow.bold('VOTE ACTION:'));
        console.log(
          chalk.yellow('Who do you vote for? (Enter number, or 0 to abstain)')
        );
        console.log('');

        // List available players
        alivePlayers.forEach((player, index) => {
          console.log(
            chalk.white(
              `  ${index + 1}. ${chalk.cyan(player.name)} ${chalk.gray(`(${player.id})`)}`
            )
          );
        });

        console.log('');
        const targetIndexStr = await rl.question(
          chalk.yellow('Player number: ')
        );
        const targetIndex = parseInt(targetIndexStr.trim(), 10);

        if (!isNaN(targetIndex) && targetIndex === 0) {
          return { type: 'vote', targetPlayerId: null };
        } else if (
          !isNaN(targetIndex) &&
          targetIndex > 0 &&
          targetIndex <= alivePlayers.length
        ) {
          const targetPlayer = alivePlayers[targetIndex - 1];
          return { type: 'vote', targetPlayerId: targetPlayer.id };
        } else {
          console.log(chalk.red('Invalid player number. Abstaining.'));
          return { type: 'vote', targetPlayerId: null };
        }
      });
    }

    if (allowedActions.includes('mafiaKill')) {
      options.push(`${chalk.red('k')}ill [player number]`);
      actionMap.set('k', async () => {
        // Get alive players excluding the current player
        // In a real game, mafia members would be excluded, but we don't have that info here
        const targetablePlayers = players
          ? Array.from(players.values()).filter(
              (p) => p.status === 'Alive' && p.id !== playerInfo.id
            )
          : [];

        console.log('\n' + chalk.red.bold('MAFIA KILL ACTION:'));
        console.log(
          chalk.red('Who does the Mafia kill? (Enter number, or 0 for no kill)')
        );
        console.log('');

        // List targetable players
        targetablePlayers.forEach((player, index) => {
          console.log(
            chalk.white(
              `  ${index + 1}. ${chalk.cyan(player.name)} ${chalk.gray(`(${player.id})`)}`
            )
          );
        });

        console.log('');
        const targetIndexStr = await rl.question(chalk.red('Player number: '));
        const targetIndex = parseInt(targetIndexStr.trim(), 10);

        if (!isNaN(targetIndex) && targetIndex === 0) {
          return { type: 'noAction' }; // Treat 0 as no action for kill intent
        } else if (
          !isNaN(targetIndex) &&
          targetIndex > 0 &&
          targetIndex <= targetablePlayers.length
        ) {
          const targetPlayer = targetablePlayers[targetIndex - 1];
          return { type: 'mafiaKill', targetPlayerId: targetPlayer.id };
        } else {
          console.log(chalk.red('Invalid player number. No action taken.'));
          return { type: 'noAction' };
        }
      });
    }

    if (allowedActions.includes('doctorSave')) {
      options.push(`${chalk.blue('s')}ave [player number]`);
      actionMap.set('s', async () => {
        // Get all alive players (doctor can save anyone including themselves)
        const alivePlayers = players
          ? Array.from(players.values()).filter((p) => p.status === 'Alive')
          : [];

        console.log('\n' + chalk.blue.bold('DOCTOR SAVE ACTION:'));
        console.log(
          chalk.blue('Who do you save? (Enter number, or 0 for no save)')
        );
        console.log('');

        // List all alive players
        alivePlayers.forEach((player, index) => {
          const selfIndicator =
            player.id === playerInfo.id ? chalk.yellow(' (yourself)') : '';
          console.log(
            chalk.white(
              `  ${index + 1}. ${chalk.cyan(player.name)} ${chalk.gray(`(${player.id})`)}${selfIndicator}`
            )
          );
        });

        console.log('');
        const targetIndexStr = await rl.question(chalk.blue('Player number: '));
        const targetIndex = parseInt(targetIndexStr.trim(), 10);

        if (!isNaN(targetIndex) && targetIndex === 0) {
          return { type: 'doctorSave', targetPlayerId: null };
        } else if (
          !isNaN(targetIndex) &&
          targetIndex > 0 &&
          targetIndex <= alivePlayers.length
        ) {
          const targetPlayer = alivePlayers[targetIndex - 1];
          return { type: 'doctorSave', targetPlayerId: targetPlayer.id };
        } else {
          console.log(
            chalk.red('Invalid player number. No save action taken.')
          );
          return { type: 'doctorSave', targetPlayerId: null };
        }
      });
    }

    if (allowedActions.includes('seerInvestigate')) {
      options.push(`${chalk.magenta('i')}nvestigate [player number]`);
      actionMap.set('i', async () => {
        // Get alive players excluding self (seer can't investigate themselves)
        const investigatablePlayers = players
          ? Array.from(players.values()).filter(
              (p) => p.status === 'Alive' && p.id !== playerInfo.id
            )
          : [];

        console.log('\n' + chalk.magenta.bold('SEER INVESTIGATE ACTION:'));
        console.log(
          chalk.magenta(
            'Who do you investigate? (Enter number, or 0 for no investigation)'
          )
        );
        console.log('');

        // List other alive players
        investigatablePlayers.forEach((player, index) => {
          console.log(
            chalk.white(
              `  ${index + 1}. ${chalk.cyan(player.name)} ${chalk.gray(`(${player.id})`)}`
            )
          );
        });

        console.log('');
        const targetIndexStr = await rl.question(
          chalk.magenta('Player number: ')
        );
        const targetIndex = parseInt(targetIndexStr.trim(), 10);

        if (!isNaN(targetIndex) && targetIndex === 0) {
          return { type: 'seerInvestigate', targetPlayerId: null };
        } else if (
          !isNaN(targetIndex) &&
          targetIndex > 0 &&
          targetIndex <= investigatablePlayers.length
        ) {
          const targetPlayer = investigatablePlayers[targetIndex - 1];
          return { type: 'seerInvestigate', targetPlayerId: targetPlayer.id };
        } else {
          console.log(
            chalk.red('Invalid player number. No investigation performed.')
          );
          return { type: 'seerInvestigate', targetPlayerId: null };
        }
      });
    }

    if (allowedActions.includes('noAction')) {
      options.push(`${chalk.gray('n')}o action / abstain`);
      actionMap.set('n', () => ({ type: 'noAction' }));
    }

    console.log(chalk.bold.underline('Available Actions:'));
    console.log(options.map((opt) => `  • ${opt}`).join('\n'));
    console.log('');

    while (true) {
      const input = await rl.question(chalk.bold('Your choice: '));
      const command = input.trim().toLowerCase().split(' ')[0];
      const handler = actionMap.get(command);

      if (handler) {
        try {
          const action = await Promise.resolve(handler()); // Handles both sync and async handlers
          // Basic validation (can be improved)
          if (allowedActions.includes(action.type)) {
            return action;
          } else {
            console.log(
              chalk.red(
                `Error: Action type '${action.type}' is not allowed in this context.`
              )
            );
          }
        } catch (e) {
          console.log(
            chalk.red(
              `Error processing action: ${e instanceof Error ? e.message : e}`
            )
          );
        }
      } else {
        console.log(
          chalk.red(
            'Invalid command. Please choose from the available actions.'
          )
        );
      }
    }
  }
}
