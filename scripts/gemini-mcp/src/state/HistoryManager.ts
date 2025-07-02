import { PROMPT_HISTORY_FILE, MAX_HISTORY_LENGTH, STUCK_COMMAND_TIMEOUT } from '../config/index.js';
import { PromptHistoryEntry } from '../types.js';
import { FileSystemService } from '../services/FileSystemService.js';
import { logger } from '../services/LoggerService.js';

/**
 * Manages the prompt history state.
 * Tracks previous prompts and detects loops or stuck commands.
 */
export class HistoryManager {
  constructor(private readonly fs: FileSystemService) {}

  /**
   * Load prompt history from disk
   */
  load(): PromptHistoryEntry[] {
    const entries = this.fs.readJson<PromptHistoryEntry[]>(PROMPT_HISTORY_FILE);
    return entries || [];
  }

  /**
   * Save prompt history to disk
   */
  save(history: PromptHistoryEntry[]): boolean {
    // Trim to max length
    const trimmed = history.slice(-MAX_HISTORY_LENGTH);
    return this.fs.writeJson(PROMPT_HISTORY_FILE, trimmed);
  }

  /**
   * Add a new prompt to history
   */
  addEntry(prompt: string): void {
    const history = this.load();
    const iteration = history.length > 0 ? history[history.length - 1].iteration + 1 : 1;
    
    const entry: PromptHistoryEntry = {
      timestamp: new Date().toISOString(),
      prompt,
      iteration,
    };
    
    history.push(entry);
    this.save(history);
    
    logger.info(`Added prompt to history (iteration ${iteration}): ${prompt.substring(0, 100)}...`);
  }

  /**
   * Get a summary of recent prompts
   */
  getRecentSummary(count: number = 10): string {
    const history = this.load();
    if (history.length === 0) {
      return 'No previous prompts in this session.';
    }
    
    const recentPrompts = history.slice(-count);
    const summary = recentPrompts.map((entry, index) => {
      const timeAgo = this.getTimeAgo(new Date(entry.timestamp));
      const preview = entry.prompt.substring(0, 100) + (entry.prompt.length > 100 ? '...' : '');
      return `${index + 1}. [${timeAgo}] ${preview}`;
    }).join('\n');
    
    return `Recent prompts (last ${recentPrompts.length}):\n${summary}`;
  }

  /**
   * Check for loops in recent prompts
   */
  checkForLoops(): string {
    const history = this.load();
    if (history.length < 3) {
      return '';
    }
    
    const recentPrompts = history.slice(-10).map(h => h.prompt);
    const promptCounts = new Map<string, number>();
    
    // Count occurrences of prompt prefixes
    for (const prompt of recentPrompts) {
      const normalized = prompt.substring(0, 50).toLowerCase();
      promptCounts.set(normalized, (promptCounts.get(normalized) || 0) + 1);
    }
    
    // Find repeated prompts
    const repeatedPrompts = Array.from(promptCounts.entries())
      .filter(([_, count]) => count >= 3)
      .map(([prompt, count]) => `"${prompt}..." repeated ${count} times`);
    
    if (repeatedPrompts.length > 0) {
      logger.warn('Loop detected in prompt history');
      return `\n⚠️ LOOP DETECTION: The following prompts have been repeated multiple times:\n${repeatedPrompts.join('\n')}\nPlease try a different approach.`;
    }
    
    return '';
  }

  /**
   * Check if the last command appears to be stuck
   */
  isCommandStuck(): boolean {
    const history = this.load();
    if (history.length === 0) {
      return false;
    }
    
    const lastPrompt = history[history.length - 1];
    const lastPromptTime = new Date(lastPrompt.timestamp).getTime();
    const now = new Date().getTime();
    const timeDiff = now - lastPromptTime;
    
    // Keywords that indicate a command was run
    const commandKeywords = ['run', 'execute', 'start', 'pnpm', 'npm', 'yarn', 'dev server', 'test'];
    const isCommandPrompt = commandKeywords.some(keyword => 
      lastPrompt.prompt.toLowerCase().includes(keyword)
    );
    
    const isStuck = isCommandPrompt && timeDiff > STUCK_COMMAND_TIMEOUT;
    
    if (isStuck) {
      logger.warn(`Command appears to be stuck (${Math.floor(timeDiff / 1000)}s elapsed)`);
    }
    
    return isStuck;
  }

  /**
   * Get the last prompt entry
   */
  getLastEntry(): PromptHistoryEntry | undefined {
    const history = this.load();
    return history[history.length - 1];
  }

  /**
   * Clear history
   */
  clear(): void {
    this.save([]);
    logger.info('Prompt history cleared');
  }

  /**
   * Format time ago string
   */
  private getTimeAgo(date: Date): string {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }
} 