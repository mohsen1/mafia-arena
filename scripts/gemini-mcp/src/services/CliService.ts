import { execSync } from 'child_process';
import { logger } from './LoggerService.js';

export interface CommandResult {
  success: boolean;
  output: string;
  exitCode?: number;
}

/**
 * Service that wraps all child process executions.
 * Centralizes error handling and makes testing easier.
 */
export class CliService {
  /**
   * Execute a command and return structured result
   */
  private execute(command: string, options?: { maxBuffer?: number; timeout?: number }): CommandResult {
    try {
      const output = execSync(command, { 
        encoding: 'utf-8',
        maxBuffer: options?.maxBuffer ?? 10 * 1024 * 1024, // 10MB default
        timeout: options?.timeout,
      });
      return { success: true, output: output.trim(), exitCode: 0 };
    } catch (error: any) {
      const output = error.stdout?.toString() || error.message || '';
      return { 
        success: false, 
        output: output.trim(),
        exitCode: error.status ?? 1,
      };
    }
  }

  /**
   * Check if a command exists
   */
  commandExists(command: string): boolean {
    const result = this.execute(`which ${command}`);
    return result.success;
  }

  /**
   * Git operations
   */
  runGitLog(maxCommits: number = 10): CommandResult {
    logger.info(`Getting git log (last ${maxCommits} commits)...`);
    return this.execute(`git --no-pager log -n ${maxCommits} --stat --oneline`);
  }

  runGitStatus(): CommandResult {
    return this.execute('git status --porcelain');
  }

  runGitAdd(): CommandResult {
    return this.execute('git add -A');
  }

  runGitCommit(message: string): CommandResult {
    const escapedMessage = message.replace(/'/g, "'\\''");
    return this.execute(`git commit -m '${escapedMessage}'`);
  }

  runGitPush(branch: string = 'main'): CommandResult {
    return this.execute(`git push origin ${branch}`);
  }

  /**
   * TypeScript compilation check
   */
  runTsc(): CommandResult {
    logger.info('Running TypeScript check...');
    return this.execute('pnpm tsc --noEmit --pretty false');
  }

  /**
   * Vitest test runner
   */
  runVitest(): CommandResult {
    logger.info('Running Vitest...');
    const result = this.execute('pnpm vitest run --reporter=json');
    
    // Try to parse JSON output
    if (result.success && result.output) {
      try {
        const parsed = JSON.parse(result.output);
        if (parsed?.testResults) {
          const failures = parsed.testResults.filter((tr: any) => tr.status === 'failed');
          const summary = failures
            .map((f: any) => `✖ ${f.name}: ${f.failureMessage || ''}`)
            .join('\n')
            .slice(0, 2000);
          return { ...result, output: summary || 'All tests passed' };
        }
      } catch {
        // If JSON parsing fails, return raw output
      }
    }
    
    return result;
  }

  /**
   * Code snapshot using yek or git ls-files
   */
  captureCodeSnapshot(): CommandResult {
    logger.info('Capturing code snapshot...');
    
    // Try yek first
    if (this.commandExists('yek')) {
      logger.info('Using yek for code snapshot...');
      const result = this.execute('yek .', { maxBuffer: 50 * 1024 * 1024 }); // 50MB
      if (result.success) return result;
    }
    
    // Fallback to git ls-files
    logger.info('Falling back to git ls-files...');
    const filesResult = this.execute('git ls-files');
    if (!filesResult.success) return filesResult;
    
    const files = filesResult.output.split('\n').filter(Boolean).slice(0, 1000);
    let snapshot = '';
    
    for (const file of files) {
      const catResult = this.execute(`cat '${file}'`);
      if (catResult.success) {
        snapshot += `\n\n=== ${file} ===\n${catResult.output}`;
      }
    }
    
    return { success: true, output: snapshot };
  }

  /**
   * Screenshot capture (macOS specific)
   */
  takeScreenshot(outputPath: string): CommandResult {
    logger.info(`Taking screenshot to: ${outputPath}`);
    return this.execute(`screencapture -x ${outputPath}`);
  }

  /**
   * Check if dev server is running
   */
  isDevServerRunning(): boolean {
    const result = this.execute('pgrep -f "next dev"');
    return result.success;
  }

  /**
   * Kill process by name
   */
  killProcess(processName: string): CommandResult {
    return this.execute(`pkill -f "${processName}"`);
  }

  /**
   * Generic command execution
   */
  runCommand(command: string, options?: { maxBuffer?: number; timeout?: number }): CommandResult {
    logger.info(`Running command: ${command}`);
    return this.execute(command, options);
  }
} 