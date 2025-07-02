import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { logger } from './LoggerService.js';

/**
 * Service that wraps all file system operations.
 * This makes testing easier by allowing mocks and centralizes error handling.
 */
export class FileSystemService {
  readFile(path: string): string | null {
    try {
      return readFileSync(path, 'utf-8');
    } catch (error) {
      logger.warn(`Failed to read file ${path}:`, error);
      return null;
    }
  }

  writeFile(path: string, content: string): boolean {
    try {
      writeFileSync(path, content, 'utf-8');
      return true;
    } catch (error) {
      logger.error(`Failed to write file ${path}:`, error);
      return false;
    }
  }

  exists(path: string): boolean {
    return existsSync(path);
  }

  deleteFile(path: string): boolean {
    try {
      if (existsSync(path)) {
        unlinkSync(path);
        return true;
      }
      return false;
    } catch (error) {
      logger.warn(`Failed to delete file ${path}:`, error);
      return false;
    }
  }

  readJson<T>(path: string): T | null {
    const content = this.readFile(path);
    if (!content) return null;
    
    try {
      return JSON.parse(content) as T;
    } catch (error) {
      logger.warn(`Failed to parse JSON from ${path}:`, error);
      return null;
    }
  }

  writeJson<T>(path: string, data: T): boolean {
    try {
      const content = JSON.stringify(data, null, 2);
      return this.writeFile(path, content);
    } catch (error) {
      logger.error(`Failed to write JSON to ${path}:`, error);
      return false;
    }
  }
} 