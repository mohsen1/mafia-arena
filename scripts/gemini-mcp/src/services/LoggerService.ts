import { appendFileSync, writeFileSync, existsSync } from 'fs';
import { LOG_FILE } from '../config/index.js';

/**
 * Simple file-based logger used across the Gemini MCP modules.
 *
 * Usage:
 *   import { logger } from './LoggerService';
 *   logger.info('something');
 */

class LoggerService {
  constructor(private readonly logFile: string = LOG_FILE) {
    // On first import, ensure the log file exists and write a banner
    if (!existsSync(this.logFile)) {
      writeFileSync(this.logFile, '');
    }
    this.banner('Gemini MCP Logger started');
  }

  private format(level: string, messages: unknown[]): string {
    const timestamp = new Date().toISOString();
    const serialized = messages
      .map((m) => (typeof m === 'object' ? JSON.stringify(m, null, 2) : String(m)))
      .join(' ');
    return `[${timestamp}] [${level.toUpperCase()}] ${serialized}\n`;
  }

  private write(line: string): void {
    appendFileSync(this.logFile, line);
  }

  info(...messages: unknown[]): void {
    this.write(this.format('info', messages));
  }

  warn(...messages: unknown[]): void {
    this.write(this.format('warn', messages));
  }

  error(...messages: unknown[]): void {
    this.write(this.format('error', messages));
  }

  banner(message: string): void {
    const line = `=== ${message} ===`;
    this.write(`\n${line}\n`);
  }
}

export const logger = new LoggerService(); 