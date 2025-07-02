import { WATCHDOG_INTERVAL_MS, SCREENSHOT_HISTORY_SIZE } from '../config/index.js';
import { CliService } from '../services/CliService.js';
import { CursorUiService } from '../services/CursorUiService.js';
import { GeminiService } from '../services/GeminiService.js';
import { BacklogManager } from '../state/BacklogManager.js';
import { FileSystemService } from '../services/FileSystemService.js';
import { TaskOrchestrator } from './TaskOrchestrator.js';
import { logger } from '../services/LoggerService.js';

interface Screenshot {
  path: string;
  timestamp: number;
}

/**
 * Watchdog that runs every 5 minutes to detect stuck states and keep development moving.
 * Maintains a history of screenshots to better detect if the system is truly stuck.
 */
export class Watchdog {
  private intervalId: NodeJS.Timeout | null = null;
  private inProgress = false;
  private screenshotHistory: Screenshot[] = [];

  constructor(
    private readonly cli: CliService,
    private readonly cursor: CursorUiService,
    private readonly gemini: GeminiService,
    private readonly backlog: BacklogManager,
    private readonly fs: FileSystemService,
    private readonly orchestrator: TaskOrchestrator,
  ) {}

  /**
   * Start the watchdog loop
   */
  start(): void {
    logger.info('Starting watchdog with interval:', WATCHDOG_INTERVAL_MS);
    
    this.intervalId = setInterval(() => {
      this.tick();
    }, WATCHDOG_INTERVAL_MS);
  }

  /**
   * Stop the watchdog
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Watchdog stopped');
    }
    this.cleanupScreenshots();
  }

  /**
   * Single watchdog tick
   */
  private async tick(): Promise<void> {
    if (this.inProgress) {
      logger.info('Watchdog tick skipped - previous tick still in progress');
      return;
    }

    this.inProgress = true;
    logger.info('Watchdog tick starting...');

    try {
      // Take new screenshot
      const screenshot = this.takeScreenshot();
      if (!screenshot) {
        logger.error('Watchdog failed to take screenshot');
        return;
      }

      // Add to history and maintain size limit
      this.addScreenshotToHistory(screenshot);

      // Analyze screenshots with Gemini
      const action = await this.analyzeScreenshots();
      
      // Process the action
      await this.processAction(action);

    } catch (error) {
      logger.error('Watchdog tick failed:', error);
    } finally {
      this.inProgress = false;
    }
  }

  /**
   * Take a screenshot for watchdog analysis
   */
  private takeScreenshot(): Screenshot | null {
    const timestamp = Date.now();
    const path = `/tmp/cursor-watchdog-${timestamp}.png`;
    
    const result = this.cli.takeScreenshot(path);
    if (!result.success) {
      logger.error('Watchdog screenshot failed:', result.output);
      return null;
    }

    return { path, timestamp };
  }

  /**
   * Add screenshot to history and clean up old ones
   */
  private addScreenshotToHistory(screenshot: Screenshot): void {
    this.screenshotHistory.push(screenshot);
    
    // Remove old screenshots if we exceed the limit
    while (this.screenshotHistory.length > SCREENSHOT_HISTORY_SIZE) {
      const old = this.screenshotHistory.shift();
      if (old) {
        this.fs.deleteFile(old.path);
        logger.info('Cleaned up old screenshot:', old.path);
      }
    }
    
    logger.info(`Screenshot history size: ${this.screenshotHistory.length}`);
  }

  /**
   * Analyze screenshots to determine action
   */
  private async analyzeScreenshots(): Promise<string> {
    const paths = this.screenshotHistory.map(s => s.path);
    logger.info(`Analyzing ${paths.length} screenshots...`);
    
    try {
      const action = await this.gemini.analyzeForWatchdog(paths);
      logger.info('Watchdog action:', action);
      return action;
    } catch (error) {
      logger.error('Watchdog analysis failed:', error);
      return 'noop';
    }
  }

  /**
   * Process the action returned by Gemini
   */
  private async processAction(action: string): Promise<void> {
    if (action === 'noop') {
      logger.info('Watchdog: No action needed');
      return;
    }

    if (action.startsWith('keypress:')) {
      await this.handleKeypress(action);
      return;
    }

    if (action === 'start_next_task') {
      await this.startNextTask();
      return;
    }

    logger.warn('Watchdog: Unrecognized action:', action);
  }

  /**
   * Handle keypress commands
   */
  private async handleKeypress(action: string): Promise<void> {
    const commands = action
      .replace(/^keypress:/, '')
      .split(';')
      .map(cmd => cmd.trim())
      .filter(Boolean);
    
    logger.info('Watchdog executing keypress commands:', commands);
    
    for (const command of commands) {
      try {
        this.cursor.executeClickCommand(command);
        await this.sleep(500);
      } catch (error) {
        logger.warn(`Watchdog keypress failed: ${command}`, error);
      }
    }
  }

  /**
   * Start the next task
   */
  private async startNextTask(): Promise<void> {
    logger.info('Watchdog initiating next task...');
    
    // The handleNewTaskRequest will automatically complete any current task
    await this.orchestrator.handleNewTaskRequest();
  }

  /**
   * Clean up all screenshot history
   */
  private cleanupScreenshots(): void {
    logger.info('Cleaning up all watchdog screenshots...');
    
    for (const screenshot of this.screenshotHistory) {
      this.fs.deleteFile(screenshot.path);
    }
    
    this.screenshotHistory = [];
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if watchdog is running
   */
  isRunning(): boolean {
    return this.intervalId !== null;
  }
} 