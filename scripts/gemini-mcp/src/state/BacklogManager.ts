import { BACKLOG_FILE } from '../config/index.js';
import { BacklogItem, ActionPlan } from '../types.js';
import { FileSystemService } from '../services/FileSystemService.js';
import { logger } from '../services/LoggerService.js';
import { randomUUID } from 'crypto';

/**
 * Manages the task backlog state.
 * Handles loading, saving, and manipulating backlog items.
 */
export class BacklogManager {
  constructor(private readonly fs: FileSystemService) {}

  /**
   * Load the backlog from disk
   */
  load(): BacklogItem[] {
    logger.info('Loading backlog...');
    const items = this.fs.readJson<BacklogItem[]>(BACKLOG_FILE);
    if (!items) {
      logger.info('No backlog file found, starting with empty backlog');
      return [];
    }
    logger.info(`Loaded ${items.length} backlog items`);
    return items;
  }

  /**
   * Save the backlog to disk
   */
  save(backlog: BacklogItem[]): boolean {
    logger.info(`Saving ${backlog.length} backlog items...`);
    return this.fs.writeJson(BACKLOG_FILE, backlog);
  }

  /**
   * Get the currently active task (in_progress status)
   */
  getCurrentTask(): BacklogItem | undefined {
    const backlog = this.load();
    return backlog.find(item => item.status === 'in_progress');
  }

  /**
   * Add a new task to the backlog from an ActionPlan
   */
  addTask(plan: ActionPlan, status: BacklogItem['status'] = 'todo'): BacklogItem {
    const backlog = this.load();
    
    const newItem: BacklogItem = {
      id: Date.now().toString(),
      title: plan.title.slice(0, 120), // Limit title length
      status,
      priority: 3, // Default priority
      createdAt: new Date().toISOString(),
      deps: [],
      githubIssueNumber: plan.github_issue_number,
      instruction: plan.instruction_for_cursor,
    };
    
    backlog.push(newItem);
    this.save(backlog);
    
    logger.info(`Added task ${newItem.id}: ${newItem.title}`);
    return newItem;
  }

  /**
   * Update task status
   */
  setTaskStatus(id: string, status: BacklogItem['status']): boolean {
    const backlog = this.load();
    const index = backlog.findIndex(item => item.id === id);
    
    if (index === -1) {
      logger.warn(`Task ${id} not found in backlog`);
      return false;
    }
    
    backlog[index].status = status;
    this.save(backlog);
    
    logger.info(`Updated task ${id} status to ${status}`);
    return true;
  }

  /**
   * Mark current task as complete
   */
  completeCurrentTask(): BacklogItem | undefined {
    const current = this.getCurrentTask();
    if (!current) {
      logger.warn('No current task to complete');
      return undefined;
    }
    
    this.setTaskStatus(current.id, 'done');
    return current;
  }

  /**
   * Get all tasks with a specific status
   */
  getTasksByStatus(status: BacklogItem['status']): BacklogItem[] {
    const backlog = this.load();
    return backlog.filter(item => item.status === status);
  }

  /**
   * Get task by ID
   */
  getTaskById(id: string): BacklogItem | undefined {
    const backlog = this.load();
    return backlog.find(item => item.id === id);
  }

  /**
   * Check if there's a task in progress
   */
  hasTaskInProgress(): boolean {
    return this.getCurrentTask() !== undefined;
  }

  /**
   * Adds a full plan (multiple steps) to the backlog.
   */
  addPlan(steps: ActionPlan[]): void {
    const backlog = this.load();
    const newItems: BacklogItem[] = steps.map(plan => ({
      id: randomUUID(),
      title: plan.title,
      status: 'todo',
      priority: 3,
      createdAt: new Date().toISOString(),
      deps: [],
      githubIssueNumber: plan.github_issue_number,
      instruction: plan.instruction_for_cursor,
    }));
    this.save([...backlog, ...newItems]);
  }

  /**
   * Checks if there are any tasks with 'todo' or 'in_progress' status.
   */
  hasPendingTasks(): boolean {
    const backlog = this.load();
    return backlog.some(item => item.status === 'todo' || item.status === 'in_progress');
  }

  /**
   * Gets the next task with 'todo' status.
   */
  getNextTask(): BacklogItem | undefined {
    const backlog = this.load();
    // A more sophisticated version could use priority.
    return backlog.find(item => item.status === 'todo');
  }
  
  /**
   * Checks if all tasks for a given plan (issue number) are 'done'.
   */
  isPlanComplete(issueNumber?: number): boolean {
    if (issueNumber === undefined) return false; // Not a plan we can check
    
    const backlog = this.load();
    const tasksForPlan = backlog.filter(t => t.githubIssueNumber === issueNumber);

    if (tasksForPlan.length === 0) return false; // No tasks for this plan, can't be complete

    return tasksForPlan.every(t => t.status === 'done');
  }
} 