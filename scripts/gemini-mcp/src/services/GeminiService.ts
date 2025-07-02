import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_API_KEY, ROOT_DIR } from '../config/index.js';
import { ActionPlan, Objective } from '../types.js';
import { logger } from './LoggerService.js';
import { FileSystemService } from './FileSystemService.js';
import { join } from 'path';
import { readFileSync } from 'fs';

interface SituationReport {
  screenshotPath: string;
  promptHistory: string;
  loopWarning: string;
  isCommandStuck: boolean;
  tsReport: string;
  vitestReport: string;
  gitLog: string;
  githubIssues: string;
  codeSnapshot: string;
}

/**
 * Service that handles all Gemini AI interactions.
 * Responsible for analyzing screenshots and generating structured ActionPlans.
 */
export class GeminiService {
  private readonly genAI: GoogleGenerativeAI;
  private readonly models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
  private readmeContent: string = '';
  private architectureContent: string = '';

  constructor(private readonly fs: FileSystemService) {
    this.genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    this.loadDocumentation();
  }

  /**
   * Load README and ARCHITECTURE documentation
   */
  private loadDocumentation(): void {
    // Load README
    const readmePath = join(ROOT_DIR, 'README.md');
    this.readmeContent = this.fs.readFile(readmePath) || '';
    if (this.readmeContent) {
      logger.info(`Loaded README.md (${this.readmeContent.length} chars)`);
    } else {
      logger.warn('Failed to load README.md');
    }

    // Load ARCHITECTURE
    const archPath = join(ROOT_DIR, 'ARCHITECTURE.md');
    this.architectureContent = this.fs.readFile(archPath) || '';
    if (this.architectureContent) {
      logger.info(`Loaded ARCHITECTURE.md (${this.architectureContent.length} chars)`);
    } else {
      logger.warn('Failed to load ARCHITECTURE.md');
    }
  }

  /**
   * Analyze screenshot and generate an ActionPlan
   */
  async analyzeScreenshot(report: SituationReport): Promise<ActionPlan> {
    const MAX_RETRIES = 3;
    const INITIAL_DELAY = 2000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      for (const modelName of this.models) {
        try {
          logger.info(`Analyzing with ${modelName} (attempt ${attempt}/${MAX_RETRIES})...`);
          
          const model = this.genAI.getGenerativeModel({ model: modelName });
          const prompt = this.buildPrompt(report);
          const imagePart = this.prepareImage(report.screenshotPath);
          
          const result = await model.generateContent([prompt, imagePart]);
          const responseText = result.response.text();
          
          logger.info(`Received response from ${modelName} (${responseText.length} chars)`);
          
          // Parse the ActionPlan from the response
          const actionPlan = this.parseActionPlan(responseText);
          return actionPlan;
          
        } catch (error) {
          logger.error(`${modelName} failed:`, error);
          
          if (this.isRetryableError(error) && attempt < MAX_RETRIES) {
            const delay = INITIAL_DELAY * Math.pow(2, attempt - 1);
            logger.info(`Retrying in ${delay}ms...`);
            await this.sleep(delay);
            break; // Try all models again
          }
        }
      }
    }
    
    // If all attempts fail, return a fallback plan
    return this.createFallbackPlan();
  }

  /**
   * Analyze screenshot for watchdog (simple response)
   */
  async analyzeForWatchdog(screenshotPaths: string[]): Promise<string> {
    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      
      // Prepare image parts
      const imageParts = screenshotPaths.map(path => this.prepareImage(path));
      
      const prompt = this.buildWatchdogPrompt(screenshotPaths.length);
      const result = await model.generateContent([prompt, ...imageParts]);
      
      const response = result.response.text().trim().toLowerCase();
      logger.info('Watchdog response:', response);
      
      return response;
    } catch (error) {
      logger.error('Watchdog analysis failed:', error);
      return 'noop';
    }
  }

  /**
   * Build the main analysis prompt
   */
  private buildPrompt(report: SituationReport): string {
    const builder = new PromptBuilder();
    
    // Core instructions with JSON schema
    builder.add(1, 'Core Instructions', `You are an expert developer managing the Werewolf AI game project.
You're analyzing a screenshot of the Cursor IDE to determine the next development task.

IMPORTANT: ONLY analyze the Cursor IDE chat interface. IGNORE any terminal windows, browser windows, or other applications.

${report.isCommandStuck ? '⚠️ STUCK COMMAND DETECTED: The last command appears stuck. Provide a new task.\n' : ''}
${report.loopWarning}

You must respond with a JSON object matching this exact schema:

{
  "title": "Brief one-sentence summary of the task",
  "reasoning": "Why this task was chosen and how it helps the project",
  "instruction_for_cursor": "The exact instruction text for Cursor AI",
  "github_issue_number": 123,  // optional, if addressing a GitHub issue
  "perform_commit": true,      // whether to commit after this task
  "commit_message": "feat: Add new feature"  // required if perform_commit is true
}

RESPOND ONLY WITH THE JSON OBJECT. No other text.`);

    // Development priorities
    builder.add(2, 'Development Priorities', `
TASK SELECTION PRIORITIES:
1. Fix any TypeScript errors or test failures
2. Address open GitHub issues (see below)
3. Test the application using MCP browser tools
4. Improve AI agent behavior or game mechanics
5. Enhance UI/UX based on observations
6. Add missing features from the game design

IMPORTANT GUIDELINES:
- NEVER suggest running E2E tests (playwright)
- Use MCP browser tools for testing instead
- Check if dev server is already running before starting one
- When fixing a GitHub issue, reference it in commits (e.g., "Fix #123: ...")
- Give high-level instructions, let Cursor figure out the details`);

    // GitHub issues if available
    if (report.githubIssues && report.githubIssues !== 'No open GitHub issues found.') {
      builder.add(3, 'GitHub Issues', report.githubIssues);
    }

    // Situation reports
    builder.add(4, 'TypeScript Report', `TypeScript Check:\n${report.tsReport}`);
    builder.add(5, 'Test Report', `Test Results:\n${report.vitestReport}`);
    builder.add(6, 'Git History', `Recent Commits:\n${report.gitLog}`);
    builder.add(7, 'Prompt History', report.promptHistory);

    // Documentation
    builder.add(8, 'Architecture', `ARCHITECTURE:\n${this.architectureContent}`);
    builder.add(9, 'README', `README:\n${this.readmeContent}`);

    // Code snapshot (lowest priority, largest)
    builder.add(10, 'Code Snapshot', `CODEBASE:\n${report.codeSnapshot}`);

    // Build with 900KB limit
    return builder.build(900_000);
  }

  /**
   * Build watchdog prompt
   */
  private buildWatchdogPrompt(screenshotCount: number): string {
    return `You are monitoring the Cursor IDE. I'm showing you ${screenshotCount} screenshot(s) taken over time.

${screenshotCount > 1 ? 'Compare the screenshots to detect if the system is stuck or making progress.' : 'Analyze the current state.'}

Respond with EXACTLY one of these options (no extra text):

noop - if Cursor is actively working or waiting
keypress:<commands> - if keyboard input will help (e.g., kp:escape to close dialog)
start_next_task - if work is complete or system is stuck

Look for:
- "Generating..." or thinking indicators (noop)
- Modal dialogs needing dismissal (keypress)
- Identical screenshots indicating stuck state (start_next_task)
- Idle chat interface (start_next_task)`;
  }

  /**
   * Parse ActionPlan from Gemini's response
   */
  private parseActionPlan(responseText: string): ActionPlan {
    try {
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate required fields
      if (!parsed.title || !parsed.instruction_for_cursor) {
        throw new Error('Missing required fields in JSON');
      }

      // Construct ActionPlan with defaults
      const plan: ActionPlan = {
        title: parsed.title,
        reasoning: parsed.reasoning || 'No reasoning provided',
        instruction_for_cursor: parsed.instruction_for_cursor,
        github_issue_number: parsed.github_issue_number,
        perform_commit: parsed.perform_commit || false,
        commit_message: parsed.commit_message,
      };

      // Validate commit message if needed
      if (plan.perform_commit && !plan.commit_message) {
        plan.commit_message = `feat: ${plan.title}`;
      }

      logger.info('Successfully parsed ActionPlan:', plan.title);
      return plan;
      
    } catch (error) {
      logger.error('Failed to parse ActionPlan:', error);
      logger.error('Raw response:', responseText.substring(0, 500));
      
      // Try to extract something useful from the response
      return this.extractFallbackPlan(responseText);
    }
  }

  /**
   * Extract a basic plan from unstructured text
   */
  private extractFallbackPlan(text: string): ActionPlan {
    // Try to extract the first instruction-like sentence
    const lines = text.split('\n').filter(line => line.trim());
    const instruction = lines.find(line => 
      line.length > 20 && 
      !line.startsWith('{') && 
      !line.includes('JSON')
    ) || 'Check the application status and run tests';

    return {
      title: 'Extracted task from response',
      reasoning: 'Failed to parse structured response, extracted from text',
      instruction_for_cursor: instruction,
      perform_commit: false,
    };
  }

  /**
   * Create a fallback plan when all else fails
   */
  private createFallbackPlan(): ActionPlan {
    return {
      title: 'Check system status and run tests',
      reasoning: 'Analysis failed, falling back to safe default task',
      instruction_for_cursor: 'Run `pnpm vitest run` to check tests, then use MCP browser tools to test the application manually. Check for any errors or issues.',
      perform_commit: false,
    };
  }

  /**
   * Prepare image data for Gemini
   */
  private prepareImage(imagePath: string): any {
    // Read as binary data
    const imageData = readFileSync(imagePath);
    
    return {
      inlineData: {
        data: imageData.toString('base64'),
        mimeType: 'image/png',
      },
    };
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    if (!(error instanceof Error)) return false;
    
    const retryableMessages = [
      '503', '429', '500', '502', '504',
      'overloaded', 'ECONNRESET', 'ETIMEDOUT',
    ];
    
    return retryableMessages.some(msg => 
      error.message.includes(msg)
    );
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * METHOD 1: Acts as a triage architect.
   * Analyzes open issues and the codebase to decide what to work on next.
   */
  async selectObjective(
    githubIssues: string, // Formatted list of issues
    codeSnapshot: string
  ): Promise<Objective | null> {
    logger.info('Gemini selecting next objective...');
    const prompt = `
You are a Software Architect reviewing the project state.
Your task is to decide on the single most important objective to work on next.

First, analyze the open GitHub Issues. For each issue, determine if it is:
- VALID: A real, current bug or a valuable feature.
- INVALID: Already fixed, irrelevant, or unclear.
- DUPLICATE: A repeat of another issue.

Then, consider the codebase. Are there any critical refactorings, tech debt, or missing features that are more important than the open issues?

Based on your full analysis, decide on the next objective.

If you choose a GitHub issue, respond with its number.
If you choose to generate your own task (e.g., refactoring), describe it.

You MUST respond with a JSON object matching this schema:
{
  "reasoning": "Your detailed analysis of why you chose this objective over others.",
  "objective": {
    "title": "A clear, concise title for the objective.",
    "githubIssueNumber": 123, // or null if self-generated
    "description": "A detailed description of the goal."
  }
}

---
CONTEXT:
---
OPEN GITHUB ISSUES:
${githubIssues}

---
CODE SNAPSHOT:
${codeSnapshot}
---
`;
    
    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      logger.info('Gemini objective selection response:', responseText.substring(0, 200));
      
      // Extract JSON from response
      const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) || 
                       responseText.match(/({[\s\S]*})/);
      
      if (!jsonMatch) {
        logger.error('Could not parse JSON from Gemini response');
        return null;
      }
      
      const parsed = JSON.parse(jsonMatch[1]);
      logger.info('Objective selected:', parsed.reasoning);
      
      return parsed.objective;
    } catch (error) {
      logger.error('Failed to select objective:', error);
      return null;
    }
  }

  /**
   * METHOD 2: Acts as a planning architect.
   * Takes a single objective and creates a detailed, step-by-step plan.
   */
  async generateImplementationPlan(
    objective: Objective,
    codeSnapshot: string
  ): Promise<ActionPlan[] | null> {
    logger.info(`Gemini generating implementation plan for: "${objective.title}"`);
    const prompt = `
You are a Staff Software Engineer creating an implementation plan.
Your objective is: "${objective.title}"
Description: ${objective.description}

You must break this objective down into a series of small, concrete, executable steps. Each step should be a clear instruction for a junior developer using an AI-assisted IDE (Cursor).

- Steps should be logical and sequential.
- Focus on one file or one specific change per step.
- Include steps for creating new files, writing business logic, adding unit tests, and updating documentation if necessary.

You MUST respond with a JSON object containing a "steps" array, where each element matches this schema:
{
  "title": "A very brief summary of this step (e.g., 'Create service file').",
  "reasoning": "Why this step is necessary for the plan.",
  "instruction_for_cursor": "The exact, detailed instruction for the junior dev to execute for THIS STEP ONLY.",
  "github_issue_number": ${objective.githubIssueNumber || 'null'}
}

The response should be ONLY the JSON object.

---
CONTEXT:
---
CODE SNAPSHOT:
${codeSnapshot}
---
`;
    
    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      logger.info('Gemini implementation plan response length:', responseText.length);
      
      // Extract JSON from response
      const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) || 
                       responseText.match(/({[\s\S]*})/);
      
      if (!jsonMatch) {
        logger.error('Could not parse JSON from Gemini response');
        return null;
      }
      
      const parsed = JSON.parse(jsonMatch[1]);
      const steps = parsed.steps || [];
      logger.info(`Generated ${steps.length} implementation steps`);
      
      return steps;
    } catch (error) {
      logger.error('Failed to generate implementation plan:', error);
      return null;
    }
  }

  /**
   * METHOD 3: Acts as a QA architect.
   * Reviews the code after a plan is complete to validate the solution.
   */
  async validatePlanCompletion(
    issueNumber: number | undefined,
    codeSnapshot: string
  ): Promise<boolean> {
    logger.info(`Gemini validating completion of plan for issue #${issueNumber}...`);
    const prompt = `
You are a QA Architect. A series of changes have been made to address Issue #${issueNumber}.
Your task is to analyze the final code and determine if the issue is TRULY and FULLY resolved.

Consider edge cases, documentation, and whether the solution introduces any new problems.

You MUST respond with a single word: YES or NO.

YES - The issue is fully resolved and the code is ready to be committed.
NO - The solution is incomplete or has issues.

---
CONTEXT:
---
CODE SNAPSHOT (after changes):
${codeSnapshot}
---
`;
    
    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      logger.info('Gemini validation response:', responseText);
      
      return responseText.trim().toUpperCase() === 'YES';
    } catch (error) {
      logger.error('Failed to validate plan completion:', error);
      return false;
    }
  }
}

/**
 * Helper class for building prompts with priority and length management
 */
class PromptBuilder {
  private sections: Array<{ priority: number; label: string; content: string }> = [];

  add(priority: number, label: string, content: string): void {
    this.sections.push({ priority, label, content });
  }

  build(maxLength: number): string {
    // Sort by priority (lower = higher priority)
    this.sections.sort((a, b) => a.priority - b.priority);

    let result = '';
    let currentLength = 0;
    const included: string[] = [];

    for (const section of this.sections) {
      const sectionLength = section.content.length;
      
      if (currentLength + sectionLength <= maxLength) {
        result += section.content + '\n\n';
        currentLength += sectionLength;
        included.push(section.label);
      } else {
        // Try to include truncated version
        const remaining = maxLength - currentLength;
        if (remaining > 1000) {
          const truncated = section.content.slice(0, remaining - 100) + 
            `\n... [${section.label} truncated] ...\n`;
          result += truncated;
          included.push(`${section.label} (truncated)`);
          break;
        }
      }
    }

    logger.info(`Prompt built with sections: ${included.join(', ')}`);
    logger.info(`Total prompt length: ${currentLength}`);

    return result;
  }
} 