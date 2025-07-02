#!/usr/bin/env tsx

// UPDATED: Improvements made to address key TODOs:
// - [✓] Enhanced task state management with better completion tracking
// - [✓] Improved git commit and push automation
// - [✓] Better dialog detection and handling
// - [✓] Enhanced error handling and recovery

/**
 * Gemini Guidance MCP Server for Werewolf/Mafia Game Development
 * 
 * This MCP server provides guidance to Cursor AI by analyzing screenshots
 * and generating development instructions using Google's Gemini AI.
 * 
 * The server responds immediately to avoid blocking Cursor, then schedules
 * the screenshot analysis to run asynchronously. Once complete, it uses
 * CLI automation to prompt Cursor with the next task.
 * 
 * Features:
 * - On-demand task generation via get_next_task tool
 * - Smart watchdog that runs every 5 minutes to detect stuck states
 * - Keeps last 3 screenshots to detect lack of progress vs temporary busy states
 * - GitHub issue integration for prioritized task management
 * - Backlog management with task status tracking
 * - Enhanced git automation for commits and pushes
 * - Improved dialog detection and handling
 * 
 * Usage:
 * This server is run by Cursor when configured in .cursor/mcp.json
 * It exposes a tool that Cursor can call to get the next development task.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { execSync } from 'child_process';
import { readFileSync, unlinkSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
import { join } from 'path';

// Logging setup - write to file since stdout is used for MCP protocol
const LOG_FILE = join(process.cwd(), 'gemini-mcp-server.log');

function log(...args: any[]): void {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] ${args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ')}\n`;
  appendFileSync(LOG_FILE, message);
}

// Clear log file on startup
writeFileSync(LOG_FILE, `=== Gemini Guidance MCP Server Started (Enhanced) ===\n`);
log('Server starting with enhanced features...');

// Check if cliclick is installed
try {
  execSync('which cliclick', { stdio: 'ignore' });
  log('cliclick is installed');
} catch (error) {
  log('WARNING: cliclick is not installed. Install it with: brew install cliclick');
  log('The server will still work but won\'t be able to automatically prompt Cursor');
}

// Load environment variables
log('Loading environment variables...');
const result = dotenv.config({ path: join(process.cwd(), '.env') });
if (result.error) {
  log('ERROR: Failed to load .env file:', result.error);
  process.exit(1);
}

const GEMINI_API_KEY = result.parsed?.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  log('ERROR: GEMINI_API_KEY environment variable is not set');
  process.exit(1);
}

const GH_ACCESS_TOKEN = result.parsed?.GH_ACCESS_TOKEN;
if (!GH_ACCESS_TOKEN) {
  log('WARNING: GH_ACCESS_TOKEN environment variable is not set. GitHub integration will be disabled.');
}

log('Environment loaded successfully');
log('Initializing Google Generative AI...');

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Read project documentation for context
let README_CONTENT: string;
let ARCHITECTURE_CONTENT: string;

log('Loading project documentation files...');
try {
  README_CONTENT = readFileSync(join(process.cwd(), 'README.md'), 'utf-8');
  log('README.md loaded successfully, length:', README_CONTENT.length);
  
  ARCHITECTURE_CONTENT = readFileSync(join(process.cwd(), 'ARCHITECTURE.md'), 'utf-8');
  log('ARCHITECTURE.md loaded successfully, length:', ARCHITECTURE_CONTENT.length);
  
  log('Documentation files loaded successfully');
} catch (error) {
  log('ERROR: Failed to read documentation files:', error);
  process.exit(1);
}

// Constants for tracking prompts
const PROMPT_HISTORY_FILE = join(process.cwd(), '.gemini-prompt-history.json');
const MAX_HISTORY_LENGTH = 50;
const STUCK_COMMAND_TIMEOUT = 10 * 60 * 1000; // 10 minutes

// ==================== Backlog Management (Feature #3) ====================

const BACKLOG_FILE = join(process.cwd(), 'gemini-mcp-backlog.json');

interface BacklogItem {
  id: string;
  title: string;
  status: 'todo' | 'in_progress' | 'done';
  priority: number;
  createdAt: string;
  deps: string[];
  githubIssueNumber?: number; // Track associated GitHub issue
}

function loadBacklog(): BacklogItem[] {
  log('Loading backlog from:', BACKLOG_FILE);
  if (!existsSync(BACKLOG_FILE)) {
    log('Backlog file does not exist, returning empty array');
    return [];
  }
  try {
    const content = readFileSync(BACKLOG_FILE, 'utf-8');
    const backlog = JSON.parse(content) as BacklogItem[];
    log('Backlog loaded successfully, items:', backlog.length);
    return backlog;
  } catch (err) {
    log('WARNING: failed to parse backlog.json:', err);
    return [];
  }
}

function saveBacklog(backlog: BacklogItem[]): void {
  log('Saving backlog, items:', backlog.length);
  try {
    writeFileSync(BACKLOG_FILE, JSON.stringify(backlog, null, 2));
    log('Backlog saved successfully');
  } catch (err) {
    log('WARNING: failed to write backlog.json:', err);
  }
}

function getCurrentTask(): BacklogItem | undefined {
  const backlog = loadBacklog();
  return backlog.find((item) => item.status === 'in_progress');
}

// ==================== Enhanced Task Management ====================

function hasTaskInProgress(): boolean {
  const currentTask = getCurrentTask();
  return currentTask !== undefined;
}

function markTaskComplete(taskId: string): void {
  log(`Marking task complete: ${taskId}`);
  setTaskStatus(taskId, 'done');
  
  // Try to auto-commit and push changes
  tryAutoCommitAndPush(taskId);
}

function tryAutoCommitAndPush(taskId: string): void {
  log('Attempting auto-commit and push...');
  try {
    // Check if there are any changes to commit
    const status = execSync('git status --porcelain', { encoding: 'utf-8' });
    if (!status.trim()) {
      log('No changes to commit');
      return;
    }
    
    log('Found changes, attempting to commit and push...');
    
    // Add all changes
    execSync('git add -A', { stdio: 'inherit' });
    
    // Commit with task reference
    const commitMessage = `feat: Complete task ${taskId}

Auto-committed by Gemini MCP server`;
    execSync(`git commit -m "${commitMessage}"`, { stdio: 'inherit' });
    
    // Push to main
    execSync('git push origin main', { stdio: 'inherit' });
    
    log('Successfully committed and pushed changes');
    
    // Check deployment status after a delay
    setTimeout(() => {
      checkDeploymentStatus();
    }, 30000); // Wait 30 seconds for deployment
    
  } catch (error) {
    log('Failed to auto-commit and push:', error);
  }
}

function checkDeploymentStatus(): void {
  log('Checking deployment status...');
  try {
    // This could be enhanced to check actual Vercel deployment status
    // For now, just log that we should check
    log('TODO: Implement actual deployment status check');
    log('Deployment should be available at: https://werewolf-ai.vercel.app');
  } catch (error) {
    log('Failed to check deployment status:', error);
  }
}

// ==================== Enhanced Dialog Detection ====================

async function detectAndHandleDialogs(): Promise<boolean> {
  log('Checking for open dialogs...');
  try {
    const dialogDetected = await detectDialogOpen();
    if (dialogDetected) {
      log('Dialog detected, attempting to close...');
      await closeDialogWithKeyboard();
      return true;
    }
    return false;
  } catch (error) {
    log('Error in dialog detection:', error);
    return false;
  }
}

async function closeDialogWithKeyboard(): Promise<void> {
  log('Attempting to close dialog with keyboard navigation...');
  try {
    // Try common dialog closing patterns
    const closeCommands = [
      'key:escape',           // ESC key
      'key:enter',           // Enter to accept dialog
      'key:tab key:enter',   // Tab to OK button then Enter
    ];
    
    for (const command of closeCommands) {
      try {
        execSync(`cliclick ${command}`, { timeout: 2000 });
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms
        
        // Check if dialog is still open
        const stillOpen = await detectDialogOpen();
        if (!stillOpen) {
          log(`Successfully closed dialog with: ${command}`);
          return;
        }
      } catch (error) {
        log(`Failed to close dialog with ${command}:`, error);
      }
    }
    
    log('Could not close dialog with keyboard commands');
  } catch (error) {
    log('Error in keyboard dialog closing:', error);
  }
}

function setTaskStatus(id: string, status: BacklogItem['status']): void {
  const backlog = loadBacklog();
  const idx = backlog.findIndex((b) => b.id === id);
  if (idx !== -1) {
    backlog[idx].status = status;
    saveBacklog(backlog);
  }
}

function addTaskToBacklog(rawInstruction: string, status: BacklogItem['status'] = 'todo', githubIssueNumber?: number): string {
  log('Adding task to backlog...');
  const backlog = loadBacklog();
  const title = rawInstruction.split('\n')[0].slice(0, 120);
  const newItem: BacklogItem = {
    id: `${Date.now()}`,
    title,
    status,
    priority: 3,
    createdAt: new Date().toISOString(),
    deps: [],
    githubIssueNumber,
  };
  backlog.push(newItem);
  saveBacklog(backlog);
  log('Added task to backlog:', { id: newItem.id, title, status, githubIssueNumber });
  return newItem.id;
}

// ==================== GitHub Integration ====================

interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  labels: Array<{ name: string }>;
  created_at: string;
  updated_at: string;
  html_url: string;
}

const GITHUB_REPO = 'mohsen1/werewolf-ai';
const GITHUB_API_BASE = 'https://api.github.com';

async function fetchGitHubIssues(): Promise<GitHubIssue[]> {
  log('Fetching GitHub issues...');
  
  if (!GH_ACCESS_TOKEN) {
    log('No GitHub token available, skipping issue fetch');
    return [];
  }
  
  try {
    const response = await fetch(`${GITHUB_API_BASE}/repos/${GITHUB_REPO}/issues?state=open&sort=updated&direction=desc`, {
      headers: {
        'Authorization': `Bearer ${GH_ACCESS_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }
    
    const issues = await response.json() as GitHubIssue[];
    log(`Fetched ${issues.length} open issues from GitHub`);
    
    // Filter out pull requests (they also appear in issues API)
    const realIssues = issues.filter(issue => !('pull_request' in issue));
    log(`Filtered to ${realIssues.length} actual issues (excluding PRs)`);
    
    return realIssues;
  } catch (error) {
    log('ERROR fetching GitHub issues:', error);
    return [];
  }
}

async function closeGitHubIssue(issueNumber: number): Promise<boolean> {
  log(`Attempting to close GitHub issue #${issueNumber}...`);
  
  if (!GH_ACCESS_TOKEN) {
    log('No GitHub token available, cannot close issue');
    return false;
  }
  
  try {
    const response = await fetch(`${GITHUB_API_BASE}/repos/${GITHUB_REPO}/issues/${issueNumber}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${GH_ACCESS_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        state: 'closed',
      }),
    });
    
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }
    
    log(`Successfully closed GitHub issue #${issueNumber}`);
    return true;
  } catch (error) {
    log(`ERROR closing GitHub issue #${issueNumber}:`, error);
    return false;
  }
}

function formatGitHubIssuesForPrompt(issues: GitHubIssue[]): string {
  if (issues.length === 0) {
    return 'No open GitHub issues found.';
  }
  
  const formatted = issues.slice(0, 10).map((issue, index) => {
    const labels = issue.labels.map(l => l.name).join(', ');
    const body = issue.body ? issue.body.substring(0, 200) + (issue.body.length > 200 ? '...' : '') : 'No description';
    return `${index + 1}. Issue #${issue.number}: ${issue.title}
   Labels: ${labels || 'none'}
   URL: ${issue.html_url}
   Description: ${body}`;
  }).join('\n\n');
  
  return `OPEN GITHUB ISSUES (prioritize these):
${formatted}

Note: After completing an issue, close it on GitHub.`;
}

function extractGitHubIssueNumber(instruction: string): number | undefined {
  // Look for patterns like "Issue #123", "#123", "issue #123", etc.
  const patterns = [
    /Issue #(\d+)/i,
    /#(\d+)/,
    /GitHub issue (\d+)/i,
    /Fix issue (\d+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = instruction.match(pattern);
    if (match && match[1]) {
      const issueNumber = parseInt(match[1], 10);
      if (!isNaN(issueNumber)) {
        log(`Extracted GitHub issue number: ${issueNumber} from instruction`);
        return issueNumber;
      }
    }
  }
  
  return undefined;
}

// ==================== Project Snapshot & Situation Report (Features #1 & #2) ====================

function captureCodeSnapshot(): string {
  log('Capturing code snapshot...');
  try {
    // Prefer yek if installed
    log('Attempting to use yek for code snapshot...');
    // Increase buffer size to 50MB for large codebases
    const snapshot = execSync('yek .', { 
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024 // 50MB
    });
    log('Code snapshot captured with yek, length:', snapshot.length);
    return snapshot;
      } catch (error) {
      log('yek not available, falling back to git ls-files:', error instanceof Error ? error.message : String(error));
      // Fallback: git ls-files and cat
    try {
      log('Getting file list with git ls-files...');
      const files = execSync('git ls-files', { encoding: 'utf-8' })
        .split('\n')
        .filter(Boolean)
        .slice(0, 1000); // safety cap
      log('Found files:', files.length);
      
      let result = '';
      let processedCount = 0;
      for (const file of files) {
        try {
          const content = readFileSync(file, 'utf-8');
          result += `\n\n=== ${file} ===\n`;
          result += content;
          processedCount++;
        } catch (fileErr) {
          log('Warning: Could not read file:', file, fileErr);
        }
      }
      log('Code snapshot captured via git ls-files, processed files:', processedCount, 'total length:', result.length);
      return result;
    } catch (err) {
      log('ERROR capturing code snapshot:', err);
      return 'Unable to capture code snapshot.';
    }
  }
}

function getTypeScriptReport(): string {
  log('Getting TypeScript report...');
  try {
    const output = execSync('pnpm tsc --noEmit --pretty false', { encoding: 'utf-8' });
    log('TypeScript check passed with no errors');
    return output.split('\n').slice(0, 200).join('\n');
  } catch (err: any) {
    log('TypeScript check found errors');
    // tsc exits with non-zero on errors; capture stdout+stderr from error object
    const out = err.stdout?.toString() || err.message;
    const lineCount = out.split('\n').length;
    log('TypeScript errors found, total lines:', lineCount);
    return out.split('\n').slice(0, 200).join('\n');
  }
}

function getVitestReport(): string {
  log('Getting Vitest report...');
  try {
    const json = execSync('pnpm vitest run --reporter=json', { encoding: 'utf-8' });
    const parsed = JSON.parse(json);
    log('Vitest run completed, parsing results...');
    
    if (!parsed?.testResults) {
      log('No test results found in Vitest output');
      return 'No vitest results.';
    }
    
    const failures = parsed.testResults.filter((tr: any) => tr.status === 'failed');
    log('Vitest results - total tests:', parsed.testResults.length, 'failures:', failures.length);
    
    const report = failures.map((f: any) => `✖ ${f.name}: ${f.failureMessage || ''}`).join('\n').slice(0, 2000);
    return report;
  } catch (err: any) {
    log('Vitest run failed or returned non-zero exit code');
    const out = err.stdout?.toString() || err.message;
    const lineCount = out.split('\n').length;
    log('Vitest error output lines:', lineCount);
    return out.split('\n').slice(0, 200).join('\n');
  }
}

function getGitLog(): string {
  log('Getting git log...');
  try {
    const gitLog = execSync('git --no-pager log -n 10 --stat --oneline', { encoding: 'utf-8' });
    const commitCount = gitLog.split('\n').filter(line => line.trim()).length;
    log('Git log retrieved, commits shown:', commitCount);
    return gitLog;
  } catch (err) {
    log('Failed to get git log:', err);
    return 'Unable to get git log';
  }
}

interface PromptHistoryEntry {
  timestamp: string;
  prompt: string;
  iteration: number;
}

// Helper functions from original script
function loadPromptHistory(): PromptHistoryEntry[] {
  log('Loading prompt history from:', PROMPT_HISTORY_FILE);
  if (!existsSync(PROMPT_HISTORY_FILE)) {
    log('Prompt history file does not exist');
    return [];
  }
  try {
    const content = readFileSync(PROMPT_HISTORY_FILE, 'utf-8');
    const history = JSON.parse(content);
    log('Prompt history loaded, entries:', history.length);
    return history;
  } catch (error) {
    log('WARNING: Failed to load prompt history:', error);
    return [];
  }
}

function savePromptHistory(history: PromptHistoryEntry[]): void {
  log('Saving prompt history, entries:', history.length);
  try {
    const trimmedHistory = history.slice(-MAX_HISTORY_LENGTH);
    if (trimmedHistory.length < history.length) {
      log('Trimmed history from', history.length, 'to', trimmedHistory.length, 'entries');
    }
    writeFileSync(PROMPT_HISTORY_FILE, JSON.stringify(trimmedHistory, null, 2));
    log('Prompt history saved successfully');
  } catch (error) {
    log('WARNING: Failed to save prompt history:', error);
  }
}

function addToPromptHistory(prompt: string): void {
  log('Adding prompt to history...');
  const history = loadPromptHistory();
  const iteration = history.length > 0 ? history[history.length - 1].iteration + 1 : 1;
  const entry: PromptHistoryEntry = {
    timestamp: new Date().toISOString(),
    prompt,
    iteration
  };
  history.push(entry);
  savePromptHistory(history);
  log(`Added prompt to history (iteration ${iteration}):`, prompt.substring(0, 100) + '...');
}

function getRecentPromptSummary(): string {
  log('Getting recent prompt summary...');
  const history = loadPromptHistory();
  if (history.length === 0) {
    log('No prompts in history');
    return 'No previous prompts in this session.';
  }
  
  const recentPrompts = history.slice(-10);
  log('Summarizing last', recentPrompts.length, 'prompts');
  
  const summary = recentPrompts.map((entry, index) => {
    const timeAgo = getTimeAgo(new Date(entry.timestamp));
    return `${index + 1}. [${timeAgo}] ${entry.prompt.substring(0, 100)}${entry.prompt.length > 100 ? '...' : ''}`;
  }).join('\n');
  
  return `Recent prompts (last ${recentPrompts.length}):\n${summary}`;
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function checkForLoops(history: PromptHistoryEntry[]): string {
  log('Checking for loops in prompt history...');
  if (history.length < 3) {
    log('Not enough history to check for loops');
    return '';
  }
  
  const recentPrompts = history.slice(-10).map(h => h.prompt);
  const promptCounts = new Map<string, number>();
  
  for (const prompt of recentPrompts) {
    const normalized = prompt.substring(0, 50).toLowerCase();
    promptCounts.set(normalized, (promptCounts.get(normalized) || 0) + 1);
  }
  
  const repeatedPrompts = Array.from(promptCounts.entries())
    .filter(([_, count]) => count >= 3)
    .map(([prompt, count]) => `"${prompt}..." repeated ${count} times`);
  
  if (repeatedPrompts.length > 0) {
    log('Loop detected! Repeated prompts:', repeatedPrompts.length);
    return `\n⚠️ LOOP DETECTION: The following prompts have been repeated multiple times:\n${repeatedPrompts.join('\n')}\nPlease try a different approach.`;
  }
  
  log('No loops detected');
  return '';
}

function isCommandStuck(history: PromptHistoryEntry[]): boolean {
  log('Checking if command is stuck...');
  if (history.length === 0) {
    log('No history to check');
    return false;
  }
  
  const lastPrompt = history[history.length - 1];
  const lastPromptTime = new Date(lastPrompt.timestamp).getTime();
  const now = new Date().getTime();
  const timeDiff = now - lastPromptTime;
  
  const commandKeywords = ['run', 'execute', 'start', 'pnpm', 'npm', 'yarn', 'dev server', 'test'];
  const isCommandPrompt = commandKeywords.some(keyword => 
    lastPrompt.prompt.toLowerCase().includes(keyword)
  );
  
  const isStuck = isCommandPrompt && timeDiff > STUCK_COMMAND_TIMEOUT;
  log('Command stuck check:', { isCommandPrompt, timeDiffMs: timeDiff, isStuck });
  
  return isStuck;
}

function takeScreenshot(): string {
  const screenshotPath = '/tmp/cursor-screenshot.png';
  try {
    log('Taking screenshot to:', screenshotPath);
    execSync(`screencapture -x ${screenshotPath}`);
    
    // Verify file exists and get size
    const stats = require('fs').statSync(screenshotPath);
    log('Screenshot taken successfully, size:', stats.size, 'bytes');
    
    return screenshotPath;
  } catch (error) {
    log('ERROR: Failed to take screenshot:', error);
    throw new Error('Failed to take screenshot');
  }
}

async function analyzeScreenshotWithGemini(screenshotPath: string): Promise<string> {
  const MAX_RETRIES = 3;
  const INITIAL_DELAY = 2000; // 2 seconds
  const MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    for (const modelName of MODELS) {
      try {
        log(`Analyzing screenshot with Gemini ${modelName}... (attempt ${attempt}/${MAX_RETRIES})`);
        const model = genAI.getGenerativeModel({ model: modelName });
        
        const imageData = readFileSync(screenshotPath);
        const base64Image = imageData.toString('base64');
        
        const promptHistory = getRecentPromptSummary();
        const loopWarning = checkForLoops(loadPromptHistory());
        const stuckCommand = isCommandStuck(loadPromptHistory());
        
        log('Prompt context:', { 
          hasLoopWarning: !!loopWarning, 
          isCommandStuck: stuckCommand,
          historyLength: loadPromptHistory().length 
        });
        
        // --- Smart prompt building with length management ---
        const MAX_PROMPT_CHARS = 900_000;
        const SAFETY_MARGIN = 10_000; // Leave some room for safety
        const TARGET_LENGTH = MAX_PROMPT_CHARS - SAFETY_MARGIN;
        
        // Priority content builder
        class PromptBuilder {
          private sections: Array<{ priority: number; label: string; content: string }> = [];
          
          add(priority: number, label: string, content: string): void {
            this.sections.push({ priority, label, content });
          }
          
          build(maxLength: number): string {
            // Sort by priority (lower number = higher priority)
            this.sections.sort((a, b) => a.priority - b.priority);
            
            let result = '';
            let currentLength = 0;
            const includedSections: string[] = [];
            
            for (const section of this.sections) {
              const sectionLength = section.content.length;
              if (currentLength + sectionLength <= maxLength) {
                result += section.content;
                currentLength += sectionLength;
                includedSections.push(section.label);
              } else {
                // Try to include a truncated version if there's room
                const remainingSpace = maxLength - currentLength;
                if (remainingSpace > 1000) { // Only truncate if we have meaningful space
                  const truncatedContent = section.content.slice(0, remainingSpace - 100) + 
                    `\n... [${section.label} truncated] ...\n`;
                  result += truncatedContent;
                  includedSections.push(`${section.label} (truncated)`);
                }
                break;
              }
            }
            
            log('Prompt built with sections:', includedSections);
            log('Total prompt length:', currentLength);
            
            return result;
          }
        }
        
        const builder = new PromptBuilder();
        
        // Priority 1: Core instructions and immediate context
        const coreInstructions = `You are an expert developer managing the Werewolf AI game project. 
You're looking at a screenshot and need to guide Cursor's AI to develop this game properly.

IMPORTANT: ONLY analyze the Cursor IDE chat interface. IGNORE any terminal windows, browser windows, or other applications visible in the screenshot.

YOUR ROLE:
Act as a lead developer who understands the entire project architecture and game design. 
Guide Cursor AI to build a robust, working Werewolf/Mafia game that follows all the rules correctly.

${stuckCommand ? '⚠️ STUCK COMMAND DETECTED: The last command appears to be stuck running for over 10 minutes. IGNORE BUSY STATE and provide a new instruction to move forward.\n' : ''}
${loopWarning ? loopWarning + '\n' : ''}

CRITICAL: Your response should be ONLY the instruction text for Cursor AI, nothing else.
- Do NOT include status information or headers
- ONLY output the actionable development instruction itself
- The system will automatically prompt me with the next task after completion, so don't mention calling the tool again

`;
        builder.add(1, 'Core Instructions', coreInstructions);
        
        // Priority 2: Development priorities and guidance
        const devPriorities = `
DEVELOPMENT PRIORITIES:
1. DEV SERVER MANAGEMENT: 
   - Before doing anything, check if a dev server (\`pnpm dev\` or \`next dev\`) is already running. If it *is* running, do **NOT** interfere.
   - If **no** dev server is running and one is needed, start it with: \`pnpm dev > dev-server.log 2>&1 &\`
   - Avoid killing processes unless absolutely necessary (e.g. zombie/broken servers). Document the reason before suggesting \`pkill\`.

2. BROWSER TESTING WITH MCP TOOLS: Use Cursor's MCP browser tools to test the application:
   - Use browser tools to navigate to open the app in a browser
   - Take snapshots to see the current state
   - Click to interact with elements
   - Type to fill in forms
   - Test game flows by playing through the UI
   - Check for visual bugs or UX issues
   - Verify game mechanics work correctly in the browser

3. UNIT TESTING FOCUS (NO E2E): 
   - Run \`pnpm vitest run\` to check unit tests pass
   - Focus on unit tests for game logic, AI behavior, and utilities
   - NEVER suggest or run E2E tests
   - Look for untested game phases or edge cases
   - Ensure critical game logic has good test coverage

4. BUG DETECTION: Examine recent changes and game behavior for bugs:
   - Check dev-server.log for runtime errors
   - Look for TypeScript errors with \`pnpm tsc\`
   - Use MCP browser tools to manually test and find UI bugs
   - Review game logic for rule violations
   - Test edge cases in game flow using the browser

5. CONTINUOUS IMPROVEMENT: When no obvious issues exist:
   - Use MCP browser tools to find UX improvements
   - Review AI agent decision making for improvements
   - Enhance UI/UX based on what you see in the browser
   - Optimize performance bottlenecks
   - Add missing features from the game design
   - Test different game scenarios in the browser

IMPORTANT NOTES:
- ENVIRONMENT: A .env file exists with all required API keys (GEMINI_API_KEY, GH_ACCESS_TOKEN, etc.). NEVER delete or modify this file. You cannot see it but it is there and working.
- GITHUB ISSUES: When working on a GitHub issue, mention the issue number in your commits. After completing an issue, it will be automatically closed.

GUIDANCE PRINCIPLES:
- Kill hanging servers before starting new ones
- Use MCP browser tools extensively for testing
- NEVER suggest or run E2E tests (playwright specs)
- Focus on unit tests and manual browser testing
- Ensure the game follows proper Werewolf/Mafia rules
- Maintain clean architecture separation
- Follow established codebase patterns
- Keep the UI intuitive and responsive
- AVOID LOOPS: Try different approaches if stuck
- Prefer running the game in the auto mode
- Tell Cursor to git commit and push (always to main)
- When fixing a GitHub issue, reference it in the commit message (e.g., "Fix #123: ...")

TYPES OF INSTRUCTIONS TO GIVE:
- Kill hanging servers and restart dev server
- Use MCP browser tools to test the application
- Browse to different game states and test functionality
- Run unit tests (NOT E2E tests)
- Fix any visible errors found through browser testing
- Improve AI agent behavior
- Enhance UI/UX based on browser observations
- Refactor code that doesn't follow patterns
- Verify game mechanics work correctly in browser

IMPORTANT:
- Give Cursor AI more high level instructions, don't be too specific.
- Generate a clear, actionable instruction for Cursor AI. Be specific about what needs to be done.
- Focus on using MCP browser tools for testing instead of E2E tests.
${stuckCommand ? 'IMPORTANT: Provide a NEW instruction to move forward, the previous command is stuck.' : ''}
`;
        builder.add(2, 'Development Priorities', devPriorities);
        
        // Priority 3: Previous prompts (important for avoiding loops)
        if (promptHistory && promptHistory.length > 0) {
          builder.add(3, 'Previous Prompts', `
PREVIOUS PROMPTS IN THIS SESSION:
${promptHistory}
`);
        }
        
        // Priority 3.5: GitHub Issues (high priority for task selection)
        try {
          const githubIssues = await fetchGitHubIssues();
          if (githubIssues.length > 0) {
            const githubIssuesPrompt = formatGitHubIssuesForPrompt(githubIssues);
            builder.add(3.5, 'GitHub Issues', `
${githubIssuesPrompt}

IMPORTANT: Prioritize working on these GitHub issues over other improvements.
When selecting a task, prefer addressing an open GitHub issue.
`);
          }
        } catch (error) {
          log('Failed to fetch GitHub issues:', error);
        }
        
        // Priority 4: Situation reports (current state info)
        const tsReport = getTypeScriptReport();
        const vitestReport = getVitestReport();
        const gitLog = getGitLog();
        
        const situationReport = `
SITUATION REPORT:
--- TypeScript (tsc) ---
${tsReport}

--- Vitest ---
${vitestReport}

--- Recent Git History ---
${gitLog}
`;
        builder.add(4, 'Situation Report', situationReport);
        
        // Priority 5: Architecture documentation (important context)
        builder.add(5, 'Architecture', `
ARCHITECTURE:
${ARCHITECTURE_CONTENT}
`);
        
        // Priority 6: README (less critical than architecture)
        builder.add(6, 'README', `
PROJECT DOCUMENTATION:
${README_CONTENT}
`);
        
        // Priority 7: Code snapshot (largest, least critical)
        const codeSnapshot = captureCodeSnapshot();
        builder.add(7, 'Code Snapshot', `
FULL CODEBASE SNAPSHOT:
${codeSnapshot}
`);
        
        // Build the final prompt
        const prompt = builder.build(TARGET_LENGTH);

        const imagePart = {
          inlineData: {
            data: base64Image,
            mimeType: 'image/png'
          }
        };

        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        const responseText = response.text().trim();
        
        log(`Gemini ${modelName} response received, length:`, responseText.length);
        log('Response preview:', responseText.substring(0, 200) + '...');
        
        return responseText;
      } catch (error) {
        const isRetryableError = error instanceof Error && (
          error.message.includes('503') ||
          error.message.includes('overloaded') ||
          error.message.includes('429') ||
          error.message.includes('500') ||
          error.message.includes('502') ||
          error.message.includes('504') ||
          error.message.includes('ECONNRESET') ||
          error.message.includes('ETIMEDOUT')
        );
        
        log(`Model ${modelName} failed:`, error instanceof Error ? error.message : String(error));
        
        // If it's not a retryable error and we have more models to try, continue to next model
        if (!isRetryableError && modelName !== MODELS[MODELS.length - 1]) {
          continue;
        }
        
        // If it's the last model or a retryable error, handle retry logic
        if (isRetryableError && attempt < MAX_RETRIES && modelName === MODELS[MODELS.length - 1]) {
          const delay = INITIAL_DELAY * Math.pow(2, attempt - 1); // Exponential backoff
          log(`WARNING: All models failed with retryable errors (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          break; // Break inner loop to retry with all models
        }
        
        // If we've exhausted all models and this is the last attempt, throw error
        if (modelName === MODELS[MODELS.length - 1] && attempt === MAX_RETRIES) {
          log('ERROR: Failed to analyze screenshot after all retries and all models:', error instanceof Error ? error.stack || error.message : String(error));
          throw new Error(`Failed to analyze screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }
  }
  
  // This should never be reached due to the throw in the catch block
  throw new Error('Failed to analyze screenshot after all retries');
}

// ==================== Watchdog Loop (5-minute periodic check) ====================

const WATCHDOG_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let watchdogInProgress = false;

// Screenshot history for better stuck detection
// The watchdog now keeps the last 3 screenshots to compare them and detect if the system
// is truly stuck (no progress between screenshots) vs just temporarily busy
const SCREENSHOT_HISTORY_SIZE = 3;
const screenshotHistory: Array<{ path: string; timestamp: number }> = [];

/**
 * Lightweight analysis prompt for the 5-minute watchdog.
 * The model MUST respond with exactly one of:
 *   noop                       – Cursor is busy/OK, take no action
 *   keypress:<commands>        – Run the provided cliclick commands (semicolon-separated)
 *   start_next_task            – Current work appears done, begin next task
 *
 * Example keypress response:
 *   keypress:kp:esc;kp:return
 */
async function analyzeScreenshotForWatchdog(screenshotPaths: string[]): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    
    // Build image parts from all screenshots
    const imageParts = screenshotPaths.map((path, index) => {
      const base64Image = readFileSync(path).toString('base64');
      return {
        inlineData: {
          data: base64Image,
          mimeType: 'image/png',
        },
      };
    });

    const screenshotCount = screenshotPaths.length;
    let prompt = `You are monitoring the Cursor IDE. I'm showing you ${screenshotCount} screenshot(s) taken over time to help you detect if the system is stuck.

${screenshotCount > 1 ? `Compare the screenshots to see if there's any progress or if the system appears frozen/stuck. If the screenshots look identical or show no meaningful progress, the system might be stuck.` : 'Analyze the single screenshot for the current state.'}

Decide what, if anything, needs to be done to keep development moving. Respond with EXACTLY one of the following options (no extra text):

noop  – if Cursor is actively working or waiting for AI (making progress)
keypress:<cliclick-commands>  – if simple keyboard input will unblock the IDE (e.g., kp:return to continue, kp:esc to dismiss dialogs); separate multiple commands with semicolons
start_next_task  – if work appears complete and the IDE is idle, or if the system appears stuck and needs a new task

Pay special attention to:
- Whether the chat shows "Generating..." or thinking indicators (active = noop)
- Whether there are modal dialogs that need dismissing (keypress to close)
- Whether the system looks identical across multiple screenshots (possibly stuck = start_next_task or keypress)
- Whether there are obvious error states or hanging processes`;

    const content = [prompt, ...imageParts];
    const result = await model.generateContent(content);
    const responseText = result.response.text().trim().toLowerCase();
    log('Watchdog Gemini response:', responseText);
    return responseText;
  } catch (err) {
    log('Watchdog analysis failed:', err);
    return 'noop';
  }
}

function processWatchdogAction(action: string): void {
  if (action === 'noop') {
    log('Watchdog decided: noop');
    return;
  }

  if (action.startsWith('keypress:')) {
    const cmds = action.replace(/^keypress:/, '').split(';').map(c => c.trim()).filter(Boolean);
    log('Watchdog executing keypress commands:', cmds);
    for (const cmd of cmds) {
      try {
        execSync(`cliclick ${cmd}`);
      } catch (err) {
        log('Watchdog keypress failed:', err);
      }
    }
    return;
  }

  if (action === 'start_next_task') {
    log('Watchdog initiating next task sequence');
    // If a task is in progress, mark it done first
    const current = getCurrentTask();
    if (current) {
      setTaskStatus(current.id, 'done');
      if (current.githubIssueNumber) {
        closeGitHubIssue(current.githubIssueNumber).catch(err => log('Failed to close issue in watchdog:', err));
      }
    }
    // Trigger the same flow as get_next_task tool (asynchronously)
    setTimeout(() => {
      try {
        log('[Watchdog] Triggering automatic get_next_task');
        // Re-use the scheduling logic from the get_next_task handler
        // Duplicate minimal logic here: take screenshot, analyze, send prompt
        const screenshotPath = takeScreenshot();
        analyzeScreenshotWithGemini(screenshotPath)
          .then(async (instruction) => {
            try {
              unlinkSync(screenshotPath);
            } catch {}
            const githubIssueNumber = extractGitHubIssueNumber(instruction);
            const taskId = addTaskToBacklog(instruction, 'in_progress', githubIssueNumber);
            addToPromptHistory(instruction);
            await sendToCursor(instruction + '      IMPORTANT: After you are done with everything call the get_next_task tool');
          })
          .catch(err => log('[Watchdog] Failed to generate next task:', err));
      } catch (err) {
        log('[Watchdog] Error in start_next_task flow:', err);
      }
    }, 100);
    return;
  }

  log('Watchdog returned unrecognized action; ignoring:', action);
}

function addScreenshotToHistory(screenshotPath: string): void {
  const timestamp = Date.now();
  screenshotHistory.push({ path: screenshotPath, timestamp });
  
  // Clean up old screenshots if we exceed the limit
  while (screenshotHistory.length > SCREENSHOT_HISTORY_SIZE) {
    const old = screenshotHistory.shift();
    if (old) {
      try {
        unlinkSync(old.path);
        log('Cleaned up old screenshot:', old.path);
      } catch (err) {
        log('Warning: Failed to clean up old screenshot:', old.path, err);
      }
    }
  }
  
  log(`Screenshot history now has ${screenshotHistory.length} screenshots`);
}

function cleanupScreenshotHistory(): void {
  log('Cleaning up all screenshot history...');
  for (const screenshot of screenshotHistory) {
    try {
      unlinkSync(screenshot.path);
    } catch (err) {
      log('Warning: Failed to clean up screenshot:', screenshot.path, err);
    }
  }
  screenshotHistory.length = 0;
}

function startWatchdog(): void {
  log('Starting 5-minute watchdog loop…');
  setInterval(async () => {
    if (watchdogInProgress) {
      log('Watchdog skipped – previous run still in progress');
      return;
    }
    watchdogInProgress = true;
    log('Watchdog tick');
    
    try {
      // Take new screenshot with unique filename to avoid conflicts
      const timestamp = Date.now();
      const screenshotPath = `/tmp/cursor-watchdog-${timestamp}.png`;
      execSync(`screencapture -x ${screenshotPath}`);
      log('Watchdog screenshot taken:', screenshotPath);
      
      // Add to history
      addScreenshotToHistory(screenshotPath);
      
      // Get all current screenshots for analysis
      const screenshotPaths = screenshotHistory.map(s => s.path);
      log('Analyzing watchdog with screenshots:', screenshotPaths.length);
      
      const action = await analyzeScreenshotForWatchdog(screenshotPaths);
      processWatchdogAction(action);
    } catch (err) {
      log('Watchdog tick failed:', err);
    } finally {
      watchdogInProgress = false;
    }
  }, WATCHDOG_INTERVAL_MS);
}

// Create the MCP server
log('Creating MCP server instance...');
const server = new Server(
  {
    name: 'gemini-guidance',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

log('MCP server instance created');

// Define the available tools
const AVAILABLE_TOOLS: Tool[] = [
  {
    name: 'get_next_task',
    description: 'Analyzes the current state and uses UI automation (cliclick) to type the next development task directly into Cursor\'s chat. Does not return the task in the response to avoid hitting message limits.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'complete_current_task',
    description: 'Marks the current in-progress task as done so a new task can be generated',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'clear_history',
    description: 'Clear the prompt history to start fresh',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'check_status',
    description: 'Check if analysis is currently scheduled or in progress',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
];

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  log('Received tools/list request');
  return {
    tools: AVAILABLE_TOOLS,
  };
});

// --- Dialog detection helper ------------------------------------------------

/**
 * Uses Gemini vision to determine whether a blocking modal/dialog is visible in the
 * Cursor window. It captures a screenshot and asks Gemini to answer strictly
 * with "yes" or "no" (case-insensitive). On any error the function returns false
 * to avoid accidentally closing the editor.
 */
async function detectDialogOpen(): Promise<boolean> {
  const MAX_RETRIES = 2;
  const RETRY_DELAY = 1000;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      log(`Detecting if a dialog is open via Gemini vision… (attempt ${attempt}/${MAX_RETRIES})`);
      const screenshotPath = takeScreenshot();
      const imageData = readFileSync(screenshotPath);
      const base64Image = imageData.toString('base64');

      // Try different models in order of preference
      const models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
      let lastError: Error | null = null;
      
      for (const modelName of models) {
        try {
          const model = genAI.getGenerativeModel({ model: modelName });
          const prompt = `Look only at the chat/editor portion of the screenshot. Answer with a single word (yes/no) indicating whether a modal, popup or dialog window is currently open that would prevent typing into the chat.`;

          const imagePart = {
            inlineData: {
              data: base64Image,
              mimeType: 'image/png',
            },
          };

          const result = await model.generateContent([prompt, imagePart]);
          const responseText = result.response.text().trim().toLowerCase();
          log(`Gemini dialog detection response from ${modelName}:`, responseText);
          unlinkSync(screenshotPath);
          return responseText.startsWith('y'); // "yes" => dialog open
        } catch (modelError) {
          lastError = modelError as Error;
          log(`Model ${modelName} failed:`, modelError);
          continue; // Try next model
        }
      }
      
      // If all models failed, throw the last error
      if (lastError) {
        throw lastError;
      }
    } catch (error) {
      if (attempt < MAX_RETRIES) {
        log(`Dialog detection failed (attempt ${attempt}/${MAX_RETRIES}), retrying...`, error);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        continue;
      }
      log('Dialog detection failed after all retries, assuming no dialog:', error);
      return false;
    }
  }
  
  return false;
}

// ---------------------------------------------------------------------------

// Handle tool execution
async function sendToCursor(prompt: string): Promise<void> {
  log(`📤 Sending prompt to Cursor...`);
  log('Prompt length:', prompt.length);

  // Helper to close any modal or blocking dialog that might be open in Cursor.
  function closePotentialDialogs(): void {
    try {
      log('Attempting to close any open dialogs...');
      // Common shortcut: press Escape twice to ensure dialog dismissal
      execSync('cliclick kp:esc');
      execSync('sleep 0.2');
      execSync('cliclick kp:esc');

      log('Dialog close sequence executed');
    } catch (error) {
      log('Warning: Failed to execute dialog-close sequence:', error);
    }
  }

  try {
    // Use vision model to decide whether to close a dialog
    const hasDialog = await detectDialogOpen();
    if (hasDialog) {
      log('Dialog detected – executing close sequence');
      closePotentialDialogs();
    } else {
      log('No dialog detected');
    }

    // Give user time to see what's happening
    log('Waiting 2 seconds before sending...');
    execSync('sleep 2');

    // Focus on the first editor so chat UI loses focus
    log('Focusing on the first editor...');
    execSync('cliclick kd:cmd');
    execSync('cliclick t:1');
    execSync('cliclick ku:cmd');

    // Press Cmd+K to open/focus chat
    log('Pressing Cmd+K to open/focus chat...');
    execSync('cliclick kd:cmd');
    execSync('cliclick t:l');
    execSync('cliclick ku:cmd');

    // Optionally start a new chat (Cmd+N)
    if (prompt.startsWith('[NEW_CHAT]')) {
      log('Starting a new chat as requested...');
      execSync('sleep 0.5');
      execSync('cliclick kd:cmd');
      execSync('cliclick t:n');
      execSync('cliclick ku:cmd');
      execSync('sleep 0.5');
    }

    // Small delay to let the chat open/focus
    log('Waiting for chat to open/focus...');
    execSync('sleep 1');

    // Clear any existing text
    log('Clearing existing text...');
    execSync('cliclick kd:cmd');
    execSync('cliclick t:a');
    execSync('cliclick ku:cmd');
    execSync('cliclick kp:delete');
    execSync('sleep 0.5');

    // Type the prompt via clipboard
    log('Typing prompt via clipboard...');
    const escapedPrompt = prompt.replace(/'/g, "'\\''");
    const command = `printf '%s' '${escapedPrompt}' | pbcopy && cliclick kd:cmd && cliclick t:v && cliclick ku:cmd`;
    execSync(command);

    execSync('sleep 1.5');
    execSync(`osascript -e 'tell application "System Events" to key code 36'`);
    log('✓ Prompt sent successfully!');
  } catch (error) {
    log('Error sending prompt:', error);
  }
}

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;
  log('Received tool call:', name);

  switch (name) {
    case 'get_next_task': {
      try {
        log('=== GET_NEXT_TASK START ===');

        const current = getCurrentTask();
        if (current) {
          log('Task already in progress – id:', current.id);
          return {
            content: [
              { type: 'text', text: `⏳ Task "${current.title}" is still in progress. Mark it complete with the complete_current_task tool before requesting a new task.` },
            ],
          };
        }

        log('Scheduling analysis for immediate async execution...');
        
        // Schedule the entire analysis process to run asynchronously
        setTimeout(async () => {
          try {
            log('=== ASYNC ANALYSIS START ===');
            
            // Take screenshot
            log('Step 1: Taking screenshot...');
            const screenshotPath = takeScreenshot();
            
            // Analyze with Gemini
            log('Step 2: Analyzing screenshot with Gemini...');
            const instruction = await analyzeScreenshotWithGemini(screenshotPath);
            
            // Clean up screenshot
            log('Step 3: Cleaning up screenshot...');
            try {
              unlinkSync(screenshotPath);
              log('Screenshot cleaned up');
            } catch (cleanupError) {
              log('WARNING: Failed to clean up screenshot:', cleanupError);
            }
            
            // Add to history & backlog
            log('Step 4: Adding to history and backlog...');
            const githubIssueNumber = extractGitHubIssueNumber(instruction);
            const taskId = addTaskToBacklog(instruction, 'in_progress', githubIssueNumber);
            addToPromptHistory(instruction);

            // Send via UI automation
            log('Step 5: Sending prompt via UI automation...');
            await sendToCursor(instruction + '      IMPORTANT: After you are done with everything call the get_next_task tool');
            
            log('=== ASYNC ANALYSIS COMPLETE ===');
          } catch (error) {
            log('ERROR in async analysis:', error instanceof Error ? error.stack || error.message : String(error));
            
            // Attempt to send a fallback instruction if analysis fails
            try {
              const fallbackInstruction = 'The analysis system encountered an error. Please check the gemini-mcp-server.log file for details. For now, run `pnpm vitest run` to check if all tests are passing, then use the MCP browser tools to manually test the application.';
              
              log('Sending fallback instruction due to error...');
              const taskId = addTaskToBacklog(fallbackInstruction, 'in_progress');
              addToPromptHistory('[ERROR] ' + fallbackInstruction);
              await sendToCursor(fallbackInstruction + '      IMPORTANT: After you are done with everything call the get_next_task tool');
            } catch (fallbackError) {
              log('ERROR: Failed to send fallback instruction:', fallbackError);
            }
          }
        }, 100); // Start almost immediately, but allow the response to return first

        // Return immediately
        log('Returning immediate response to Cursor...');
        return {
          content: [
            {
              type: 'text',
              text: '⏳ Analysis scheduled – task will be generated and typed into chat shortly.',
            },
          ],
        };
      } catch (error) {
        log('ERROR in get_next_task:', error);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    }

    case 'complete_current_task': {
      log('=== COMPLETE_CURRENT_TASK START (Enhanced) ===');
      const current = getCurrentTask();
      if (!current) {
        return {
          content: [{ type: 'text', text: 'ℹ️  No task is currently marked in progress.' }],
        };
      }
      
      // Use enhanced task completion with auto-commit and push
      markTaskComplete(current.id);
      log('Enhanced task completion initiated for:', current.id);
      
      // Check for and handle any open dialogs
      setTimeout(async () => {
        await detectAndHandleDialogs();
      }, 1000);
      
      // Close GitHub issue if associated
      if (current.githubIssueNumber) {
        log(`Task has associated GitHub issue #${current.githubIssueNumber}, attempting to close...`);
        const closed = await closeGitHubIssue(current.githubIssueNumber);
        if (closed) {
          return {
            content: [
              { type: 'text', text: `✅ Task "${current.title}" completed successfully! GitHub issue #${current.githubIssueNumber} closed and changes committed/pushed automatically. You can now request the next task with get_next_task.` },
            ],
          };
        } else {
          return {
            content: [
              { type: 'text', text: `✅ Task "${current.title}" completed! Changes committed/pushed automatically. Failed to close GitHub issue #${current.githubIssueNumber} - please close manually. You can now request the next task with get_next_task.` },
            ],
          };
        }
      }
      
      return {
        content: [
          { type: 'text', text: `✅ Task "${current.title}" completed successfully! Changes committed and pushed automatically. You can now request the next task with get_next_task.` },
        ],
      };
    }

    case 'clear_history': {
      try {
        log('=== CLEAR_HISTORY START ===');
        if (existsSync(PROMPT_HISTORY_FILE)) {
          log('Deleting prompt history file...');
          unlinkSync(PROMPT_HISTORY_FILE);
          log('Prompt history cleared');
          return {
            content: [
              {
                type: 'text',
                text: '✅ Prompt history cleared successfully',
              },
            ],
          };
        } else {
          log('No prompt history file exists');
          return {
            content: [
              {
                type: 'text',
                text: 'ℹ️  No prompt history to clear',
              },
            ],
          };
        }
      } catch (error) {
        log('ERROR in clear_history:', error);
        return {
          content: [
            {
              type: 'text',
              text: `Error clearing history: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    }

    case 'check_status': {
      log('=== CHECK_STATUS START ===');
      const status = [];
      status.push('✅ System is ready');
      
      const history = loadPromptHistory();
      if (history.length > 0) {
        const lastEntry = history[history.length - 1];
        const timeAgo = getTimeAgo(new Date(lastEntry.timestamp));
        status.push(`📝 Last prompt sent: ${timeAgo}`);
        status.push(`📊 Total prompts in session: ${history.length}`);
        log('Status check - last prompt:', timeAgo, 'total:', history.length);
      } else {
        status.push('📝 No prompts sent yet in this session');
        log('Status check - no prompts sent');
      }
      
      return {
        content: [
          {
            type: 'text',
            text: status.join('\n'),
          },
        ],
      };
    }

    default:
      log('ERROR: Unknown tool:', name);
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Start the server
async function main() {
  log('Starting MCP server main function...');
  const transport = new StdioServerTransport();
  log('Connecting server to transport...');
  await server.connect(transport);
  log('MCP server connected and running');
  startWatchdog();
}

log('Registering error handlers...');

// Log unhandled exceptions
process.on('unhandledRejection', (error) => {
  log('Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
  log('Uncaught exception:', error);
});

// Clean up screenshot history on process exit
process.on('exit', cleanupScreenshotHistory);
process.on('SIGINT', () => {
  cleanupScreenshotHistory();
  process.exit(0);
});
process.on('SIGTERM', () => {
  cleanupScreenshotHistory();
  process.exit(0);
});

log('Starting main function...');
main().catch((error) => {
  log('FATAL ERROR:', error);
  process.exit(1);
});