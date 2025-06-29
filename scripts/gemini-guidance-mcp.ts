#!/usr/bin/env tsx

// TODO:
// - [ ] Ask Gemini if we should start a new chat, if ye, we press cmd+n after focusing the chat to do so
// - [ ] Tell Cursor to git commit and push (always to main) after push, check out the production deployment to see if things are working

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
writeFileSync(LOG_FILE, `=== Gemini Guidance MCP Server Started ===\n`);
log('Server starting...');

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

function addTaskToBacklog(rawInstruction: string): void {
  log('Adding task to backlog...');
  const backlog = loadBacklog();
  const title = rawInstruction.split('\n')[0].slice(0, 120);
  const newItem: BacklogItem = {
    id: `${Date.now()}`,
    title,
    status: 'todo',
    priority: 3, // default medium priority, could be refined later
    createdAt: new Date().toISOString(),
    deps: [],
  };
  backlog.push(newItem);
  saveBacklog(backlog);
  log('Added task to backlog:', { id: newItem.id, title });
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
  try {
    log('Analyzing screenshot with Gemini...');
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
    
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
    
    log('Gemini response received, length:', responseText.length);
    log('Response preview:', responseText.substring(0, 200) + '...');
    
    return responseText;
  } catch (error) {
    log('ERROR: Failed to analyze screenshot:', error instanceof Error ? error.stack || error.message : String(error));
    throw new Error(`Failed to analyze screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
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
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'clear_history',
    description: 'Clear the prompt history to start fresh',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'check_status',
    description: 'Check if analysis is currently scheduled or in progress',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  log('Received tools/list request');
  return {
    tools: AVAILABLE_TOOLS,
  };
});

function sendToCursor(prompt: string): void {
  log(`📤 Sending prompt to Cursor...`);
  log('Prompt length:', prompt.length);
  
  try {
    // Give user time to see what's happening
    log('Waiting 2 seconds before sending...');
    execSync('sleep 2');

    // Focus on the first editor so chat UI loses focus
    log('Focusing on the first editor...');
    execSync('cliclick kd:cmd');
    execSync('cliclick t:1');
    execSync('cliclick ku:cmd');
    
    // Try Cmd+K to open/focus the chat (Cursor's standard shortcut)
    log('Pressing Cmd+K to open/focus chat...');
    execSync('cliclick kd:cmd');
    execSync('cliclick t:l');
    execSync('cliclick ku:cmd');
    
    // Small delay to let the chat open/focus
    log('Waiting for chat to open/focus...');
    execSync('sleep 1');
    
    // Clear any existing text with Cmd+A and Delete
    log('Clearing existing text...');
    execSync('cliclick kd:cmd');
    execSync('cliclick t:a');
    execSync('cliclick ku:cmd');
    execSync('cliclick kp:delete');
    
    // Small delay
    execSync('sleep 0.5');
    
    // Type the prompt
    log('Typing prompt via clipboard...');
    // Properly escape the prompt for shell
    const escapedPrompt = prompt.replace(/'/g, "'\\''");
    
    // Use printf to handle the text more safely
    const command = `printf '%s' '${escapedPrompt}' | pbcopy && cliclick kd:cmd && cliclick t:v && cliclick ku:cmd`;
    log('Executing clipboard paste command...');
    execSync(command);
    
    // Small delay before sending
    log('Waiting before pressing Enter...');
    execSync('sleep 1.5');
    
    // Press Enter using AppleScript
    log('Pressing Enter to send prompt...');
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
            unlinkSync(screenshotPath);
            log('Screenshot cleaned up');
            
            // Add to history & backlog
            log('Step 4: Adding to history and backlog...');
            addToPromptHistory(instruction);
            addTaskToBacklog(instruction);

            // Send via UI automation
            log('Step 5: Sending prompt via UI automation...');
            sendToCursor(instruction + '      IMPORTANT: After you are done with everything call the get_next_task tool');
            
            log('=== ASYNC ANALYSIS COMPLETE ===');
          } catch (error) {
            log('ERROR in async analysis:', error instanceof Error ? error.stack || error.message : String(error));
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
}

log('Registering error handlers...');

// Log unhandled exceptions
process.on('unhandledRejection', (error) => {
  log('Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
  log('Uncaught exception:', error);
});

log('Starting main function...');
main().catch((error) => {
  log('FATAL ERROR:', error);
  process.exit(1);
});