import { CliService } from './CliService.js';
import { logger } from './LoggerService.js';

/**
 * Service that handles all UI automation for Cursor IDE.
 * This is the ONLY place where cliclick and osascript are used.
 */
export class CursorUiService {
  private readonly cliclickAvailable: boolean;

  constructor(private readonly cli: CliService) {
    this.cliclickAvailable = cli.commandExists('cliclick');
    
    if (!this.cliclickAvailable) {
      logger.warn('cliclick is not installed. UI automation will not work.');
      logger.warn('Install with: brew install cliclick');
    } else {
      logger.info('cliclick is available for UI automation');
    }
  }

  /**
   * Type text into Cursor's chat interface
   */
  async typeIntoChat(prompt: string): Promise<boolean> {
    if (!this.cliclickAvailable) {
      logger.error('Cannot type into chat - cliclick not available');
      return false;
    }

    logger.info('Sending prompt to Cursor...');
    
    try {
      // Wait for user to see what's happening
      await this.sleep(2000);
      
      // Focus on first editor (makes chat lose focus)
      this.focusFirstEditor();
      
      // Open/focus chat with Cmd+L
      this.openChat();
      await this.sleep(1000);
      
      // Clear any existing text
      this.clearChatInput();
      await this.sleep(500);
      
      // Type via clipboard (more reliable for long text)
      this.typeViaClipboard(prompt);
      await this.sleep(1500);
      
      // Press Enter to submit
      this.pressEnter();
      
      logger.info('Successfully sent prompt to Cursor');
      return true;
    } catch (error) {
      logger.error('Failed to type into chat:', error);
      return false;
    }
  }

  /**
   * Close any open dialogs using keyboard shortcuts
   */
  async closeDialogs(): Promise<void> {
    if (!this.cliclickAvailable) return;
    
    logger.info('Attempting to close dialogs...');
    
    const closeCommands = [
      'kp:escape',        // ESC key
      'kp:return',        // Enter to accept
      'kp:tab kp:return', // Tab to OK then Enter
    ];
    
    for (const command of closeCommands) {
      try {
        this.cli.runCommand(`cliclick ${command}`, { timeout: 2000 });
        await this.sleep(500);
      } catch (error) {
        logger.warn(`Failed to execute ${command}:`, error);
      }
    }
  }

  /**
   * Check if a dialog is open (placeholder - would need Gemini vision to implement fully)
   */
  isDialogOpen(): boolean {
    // This would require screenshot analysis with Gemini
    // For now, return false
    return false;
  }

  /**
   * Focus on the first editor tab
   */
  private focusFirstEditor(): void {
    logger.info('Focusing first editor...');
    this.cli.runCommand('cliclick kd:cmd');
    this.cli.runCommand('cliclick t:1');
    this.cli.runCommand('cliclick ku:cmd');
  }

  /**
   * Open/focus chat with Cmd+L
   */
  private openChat(): void {
    logger.info('Opening chat with Cmd+L...');
    this.cli.runCommand('cliclick kd:cmd');
    this.cli.runCommand('cliclick t:l');
    this.cli.runCommand('cliclick ku:cmd');
  }

  /**
   * Clear chat input with Cmd+A then Delete
   */
  private clearChatInput(): void {
    logger.info('Clearing chat input...');
    this.cli.runCommand('cliclick kd:cmd');
    this.cli.runCommand('cliclick t:a');
    this.cli.runCommand('cliclick ku:cmd');
    this.cli.runCommand('cliclick kp:delete');
  }

  /**
   * Type text via clipboard (Cmd+V)
   */
  private typeViaClipboard(text: string): void {
    logger.info('Typing via clipboard...');
    const escaped = text.replace(/'/g, "'\\''");
    const command = `printf '%s' '${escaped}' | pbcopy && cliclick kd:cmd && cliclick t:v && cliclick ku:cmd`;
    this.cli.runCommand(command);
  }

  /**
   * Press Enter key using AppleScript (more reliable)
   */
  private pressEnter(): void {
    logger.info('Pressing Enter...');
    this.cli.runCommand(`osascript -e 'tell application "System Events" to key code 36'`);
  }

  /**
   * Execute a cliclick command
   */
  executeClickCommand(command: string): boolean {
    if (!this.cliclickAvailable) {
      logger.warn('cliclick not available');
      return false;
    }
    
    const result = this.cli.runCommand(`cliclick ${command}`);
    return result.success;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Start a new chat with Cmd+N
   */
  startNewChat(): void {
    if (!this.cliclickAvailable) return;
    
    logger.info('Starting new chat with Cmd+N...');
    this.cli.runCommand('cliclick kd:cmd');
    this.cli.runCommand('cliclick t:n');
    this.cli.runCommand('cliclick ku:cmd');
  }

  /**
   * Check if cliclick is available
   */
  isAvailable(): boolean {
    return this.cliclickAvailable;
  }
} 