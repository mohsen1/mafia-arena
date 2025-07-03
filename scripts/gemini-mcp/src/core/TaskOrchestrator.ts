import { CliService } from '../services/CliService.js';
import { CursorUiService } from '../services/CursorUiService.js';
import { GitHubService } from '../services/GitHubService.js';
import { GeminiService } from '../services/GeminiService.js';
import { BacklogManager } from '../state/BacklogManager.js';
import { HistoryManager } from '../state/HistoryManager.js';
import { logger } from '../services/LoggerService.js';
import { ActionPlan, BacklogItem, Objective } from '../types.js';

/**
 * The brain of the Gemini MCP system.
 * Coordinates all services to analyze the current state and generate next tasks.
 */
export class TaskOrchestrator {
  constructor(
    private readonly cli: CliService,
    private readonly cursor: CursorUiService,
    private readonly github: GitHubService,
    private readonly gemini: GeminiService,
    private readonly backlog: BacklogManager,
    private readonly history: HistoryManager,
  ) {}

  /**
   * The main entry point called by the MCP server.
   * It decides whether to enter Planning Mode or Execution Mode.
   */
  async handleNewTaskRequest(): Promise<void> {
    logger.banner('HANDLING NEW TASK REQUEST');

    // 1. Mark the previously 'in_progress' task as 'done'
    const completedTask = this.backlog.completeCurrentTask();
    if (completedTask) {
      logger.info(`Completed step: ${completedTask.title}`);
    }

    // 2. Check if the current plan is finished
    const issueNumberForPlan = completedTask?.githubIssueNumber;
    if (issueNumberForPlan && this.backlog.isPlanComplete(issueNumberForPlan)) {
      logger.info(`Plan for issue #${issueNumberForPlan} is complete. Validating and committing.`);
      await this.validateAndFinalizePlan(issueNumberForPlan);
      // After finalizing, the backlog for this plan is empty, so the next block will trigger planning.
    }

    // 3. Decide on the next action
    if (this.backlog.hasPendingTasks()) {
      // --- EXECUTION MODE ---
      await this.executeNextStep();
    } else {
      // --- PLANNING MODE ---
      await this.initiateNewPlan();
    }
  }

  /**
   * PLANNING MODE: Selects an objective and creates a multi-step plan.
   */
  private async initiateNewPlan(): Promise<void> {
    logger.banner('PLANNING MODE');
    try {
      const situationReport = await this.gatherSituationReport();

      // 1. Select an objective (GitHub issue or self-generated)
      const objective = await this.gemini.selectObjective(
        situationReport.githubIssues,
        situationReport.codeSnapshot
      );

      if (!objective) {
        logger.warn('Gemini could not determine a new objective. Aborting.');
        await this.cursor.typeIntoChat('I was unable to determine the next objective. Please provide a goal.');
        return;
      }
      logger.info(`Objective selected: "${objective.title}" (Issue: #${objective.githubIssueNumber || 'self-generated'})`);

      // 2. Generate the multi-step implementation plan for the objective
      logger.info('Calling Gemini to generate implementation plan...');
      const planSteps = await this.gemini.generateImplementationPlan(
        objective,
        situationReport.codeSnapshot
      );

      if (!planSteps || planSteps.length === 0) {
        logger.error('Gemini failed to generate a plan for the objective.');
        logger.error('planSteps result:', planSteps);
        logger.error('Objective was:', objective);
        logger.error('Code snapshot length:', situationReport.codeSnapshot.length);
        await this.cursor.typeIntoChat(`I selected objective "${objective.title}" but could not create a plan. Please check the logs.`);
        return;
      }
      logger.info(`Generated a plan with ${planSteps.length} steps.`);
      logger.info('Plan steps:', planSteps.map(step => ({ title: step.title, reasoning: step.reasoning })));

      // 3. Populate the backlog with the new plan
      this.backlog.addPlan(planSteps);
      logger.info('New plan has been added to the backlog.');

      // 4. Immediately start the first step of the new plan
      await this.executeNextStep();

    } catch (error) {
      logger.error('Failed during planning mode:', error);
      await this.sendFallbackInstruction();
    }
  }

  /**
   * EXECUTION MODE: Takes the next step from the backlog and executes it.
   */
  private async executeNextStep(): Promise<void> {
    logger.banner('EXECUTION MODE');
    const nextTask = this.backlog.getNextTask();

    if (!nextTask) {
      logger.warn('Execution mode called, but no pending tasks found. Switching to planning.');
      await this.initiateNewPlan();
      return;
    }

    try {
      const success = this.backlog.setTaskStatus(nextTask.id, 'in_progress');
      if (!success) {
        logger.error(`Failed to update task ${nextTask.id} status`);
        return;
      }
      
      this.history.addEntry(nextTask.instruction);

      const finalInstruction = `${nextTask.instruction}\n\nIMPORTANT: After you are done with this step, call the get_next_task tool to proceed to the next one.`;
      
      const typingSuccess = await this.cursor.typeIntoChat(finalInstruction);
      if (!typingSuccess) {
        logger.error('Failed to send instruction to Cursor. Reverting task status.');
        this.backlog.setTaskStatus(nextTask.id, 'todo');
      }
    } catch (error) {
      logger.error(`Failed to execute step ${nextTask.id}:`, error);
      this.backlog.setTaskStatus(nextTask.id, 'todo'); // Revert on failure
      await this.sendFallbackInstruction();
    }
  }

  /**
   * Validates a completed plan and commits the work.
   */
  private async validateAndFinalizePlan(issueNumber: number): Promise<void> {
    const situationReport = await this.gatherSituationReport();
    const isResolved = await this.gemini.validatePlanCompletion(issueNumber, situationReport.codeSnapshot);

    if (isResolved) {
      logger.info(`Validation successful for issue #${issueNumber}. Committing changes.`);
      const commitMessage = `fix: Resolve issue #${issueNumber}\n\nCompleted and validated by Gemini Architect.`;
      await this.performAutoCommit(commitMessage);
      
      // Close the issue on GitHub if we have permissions
      try {
        // await this.github.closeIssue(issueNumber);
        logger.info(`Note: Issue #${issueNumber} should be closed by the commit message.`);
      } catch (error) {
        logger.warn(`Could not close issue #${issueNumber}:`, error);
      }
    } else {
      logger.warn(`Validation failed for issue #${issueNumber}. Gemini will generate follow-up tasks.`);
      // This will lead back to planning mode where Gemini can add more steps.
      await this.cursor.typeIntoChat(`I've reviewed the work for issue #${issueNumber}, but it seems incomplete. I will generate follow-up tasks.`);
    }
  }

  /**
   * Gather comprehensive situation report (simplified version without screenshot)
   */
  private async gatherSituationReport(): Promise<{
    githubIssues: string;
    codeSnapshot: string;
    promptHistory: string;
    tsReport: string;
    vitestReport: string;
    gitLog: string;
  }> {
    logger.info('Gathering situation report...');
    
    // Parallel data gathering
    const [
      githubIssues,
      codeSnapshot,
      promptHistory,
      tsReport,
      vitestReport,
      gitLog,
    ] = await Promise.all([
      this.github.fetchOpenIssues(),
      this.cli.captureCodeSnapshot(),
      this.history.getRecentSummary(10),
      this.cli.runTsc(),
      this.cli.runVitest(),
      this.cli.runGitLog(10),
    ]);

    return {
      githubIssues: this.github.formatIssuesForPrompt(githubIssues),
      codeSnapshot: codeSnapshot.output || 'Unable to capture code snapshot',
      promptHistory,
      tsReport: tsReport.output || 'No TypeScript errors',
      vitestReport: vitestReport.output || 'No test results', 
      gitLog: gitLog.output || 'No git history',
    };
  }



  /**
   * Send a fallback instruction when analysis fails
   */
  private async sendFallbackInstruction(): Promise<void> {
    const fallback = 'The analysis system encountered an error. Please check the gemini-mcp-server.log file for details. ' +
      'For now, run `pnpm vitest run` to check if all tests are passing, then use the MCP browser tools to manually test the application.' +
      '\n\nIMPORTANT: After you are done with everything call the get_next_task tool';
    
    const task = this.backlog.addTask({
      title: 'Fallback: Check system status',
      reasoning: 'Analysis failed, using fallback',
      instruction_for_cursor: fallback,
      perform_commit: false,
    }, 'in_progress');
    
    this.history.addEntry('[ERROR] ' + fallback);
    await this.cursor.typeIntoChat(fallback);
  }



  /**
   * Perform auto-commit and push
   */
  private async performAutoCommit(commitMessage: string): Promise<void> {
    logger.info('Performing auto-commit...');
    
    try {
      // Check for changes
      const statusResult = this.cli.runGitStatus();
      if (!statusResult.output || statusResult.output.trim() === '') {
        logger.info('No changes to commit');
        return;
      }
      
      // Stage all changes
      const addResult = this.cli.runGitAdd();
      if (!addResult.success) {
        logger.error('Failed to stage changes:', addResult.output);
        return;
      }
      
      // Commit with the provided message
      const commitResult = this.cli.runGitCommit(commitMessage);
      if (!commitResult.success) {
        logger.error('Failed to commit:', commitResult.output);
        return;
      }
      
      logger.info('Commit successful:', commitResult.output);
      
      // Push to remote
      const pushResult = this.cli.runGitPush();
      if (!pushResult.success) {
        logger.error('Failed to push:', pushResult.output);
        // Don't fail the whole operation if push fails
      } else {
        logger.info('Push successful');
      }
      
    } catch (error) {
      logger.error('Auto-commit failed:', error);
    }
  }
} 