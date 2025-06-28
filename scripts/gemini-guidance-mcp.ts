#!/usr/bin/env tsx

/**
 * Gemini Guidance MCP Server for Werewolf/Mafia Game Development
 * 
 * This MCP server provides guidance to Cursor AI by analyzing screenshots
 * and generating development instructions using Google's Gemini AI.
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

// Load environment variables
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

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Read project documentation for context
let README_CONTENT: string;
let ARCHITECTURE_CONTENT: string;

try {
  README_CONTENT = readFileSync(join(process.cwd(), 'README.md'), 'utf-8');
  ARCHITECTURE_CONTENT = readFileSync(join(process.cwd(), 'ARCHITECTURE.md'), 'utf-8');
  log('Documentation files loaded successfully');
} catch (error) {
  log('ERROR: Failed to read documentation files:', error);
  process.exit(1);
}

// Constants for tracking prompts
const PROMPT_HISTORY_FILE = join(process.cwd(), '.gemini-prompt-history.json');
const MAX_HISTORY_LENGTH = 50;
const STUCK_COMMAND_TIMEOUT = 10 * 60 * 1000; // 10 minutes

interface PromptHistoryEntry {
  timestamp: string;
  prompt: string;
  iteration: number;
}

// Helper functions from original script
function loadPromptHistory(): PromptHistoryEntry[] {
  if (!existsSync(PROMPT_HISTORY_FILE)) {
    return [];
  }
  try {
    const content = readFileSync(PROMPT_HISTORY_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    log('WARNING: Failed to load prompt history:', error);
    return [];
  }
}

function savePromptHistory(history: PromptHistoryEntry[]): void {
  try {
    const trimmedHistory = history.slice(-MAX_HISTORY_LENGTH);
    writeFileSync(PROMPT_HISTORY_FILE, JSON.stringify(trimmedHistory, null, 2));
  } catch (error) {
    log('WARNING: Failed to save prompt history:', error);
  }
}

function addToPromptHistory(prompt: string): void {
  const history = loadPromptHistory();
  const iteration = history.length > 0 ? history[history.length - 1].iteration + 1 : 1;
  history.push({
    timestamp: new Date().toISOString(),
    prompt,
    iteration
  });
  savePromptHistory(history);
  log(`Added prompt to history (iteration ${iteration}):`, prompt.substring(0, 100) + '...');
}

function getRecentPromptSummary(): string {
  const history = loadPromptHistory();
  if (history.length === 0) {
    return 'No previous prompts in this session.';
  }
  
  const recentPrompts = history.slice(-10);
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
  if (history.length < 3) return '';
  
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
    return `\n⚠️ LOOP DETECTION: The following prompts have been repeated multiple times:\n${repeatedPrompts.join('\n')}\nPlease try a different approach.`;
  }
  
  return '';
}

function isCommandStuck(history: PromptHistoryEntry[]): boolean {
  if (history.length === 0) return false;
  
  const lastPrompt = history[history.length - 1];
  const lastPromptTime = new Date(lastPrompt.timestamp).getTime();
  const now = new Date().getTime();
  
  const commandKeywords = ['run', 'execute', 'start', 'pnpm', 'npm', 'yarn', 'dev server', 'test'];
  const isCommandPrompt = commandKeywords.some(keyword => 
    lastPrompt.prompt.toLowerCase().includes(keyword)
  );
  
  return isCommandPrompt && (now - lastPromptTime) > STUCK_COMMAND_TIMEOUT;
}

function takeScreenshot(): string {
  const screenshotPath = '/tmp/cursor-screenshot.png';
  try {
    log('Taking screenshot...');
    execSync(`screencapture -x ${screenshotPath}`);
    log('Screenshot taken successfully:', screenshotPath);
    return screenshotPath;
  } catch (error) {
    log('ERROR: Failed to take screenshot:', error);
    throw new Error('Failed to take screenshot');
  }
}

async function analyzeScreenshotWithGemini(screenshotPath: string): Promise<string> {
  try {
    log('Analyzing screenshot with Gemini...');
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
    
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
    
    const prompt = `You are an expert developer managing the Werewolf AI game project. 
You're looking at a screenshot and need to guide Cursor's AI to develop this game properly.

IMPORTANT: ONLY analyze the Cursor IDE chat interface. IGNORE any terminal windows, browser windows, or other applications visible in the screenshot.

PROJECT DOCUMENTATION:
${README_CONTENT}

ARCHITECTURE:
${ARCHITECTURE_CONTENT}

PREVIOUS PROMPTS IN THIS SESSION:
${promptHistory}
${loopWarning}

STUCK COMMAND DETECTION:
${stuckCommand ? '⚠️ WARNING: The last command appears to be stuck running for over 10 minutes. IGNORE BUSY STATE and provide a new instruction to move forward.' : 'No stuck commands detected.'}

YOUR ROLE:
Act as a lead developer who understands the entire project architecture and game design. 
Guide Cursor AI to build a robust, working Werewolf/Mafia game that follows all the rules correctly.

ANALYSIS STEPS:
1. Analyze the current state of the project based on what you see in Cursor IDE.

2. Generate the next development instruction.

DEVELOPMENT PRIORITIES:
1. DEV SERVER MANAGEMENT: 
   - First, kill any hanging servers: \`pkill -f "pnpm dev" || true\` and \`pkill -f "next dev" || true\`
   - Then check if dev server is running by looking for a running process
   - If not running, instruct to run: \`pnpm dev > dev-server.log 2>&1 &\`
   - Check the log file for any errors

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
- After completing the current task, remind Cursor to call the gemini-guidance tool again for the next task.
${stuckCommand ? 'IMPORTANT: Provide a NEW instruction to move forward, the previous command is stuck.' : ''}

CRITICAL: Your response should be ONLY the instruction text for Cursor AI, nothing else.
- Do NOT include status information or headers
- ONLY output the actionable development instruction itself
- End your instruction with: "When done, call the gemini-guidance tool again for the next task."`;

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
    log('ERROR: Failed to analyze screenshot:', error);
    throw new Error(`Failed to analyze screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Create the MCP server
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
    description: 'Get the next development task by analyzing the current state of Cursor IDE with Gemini AI',
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
];

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  log('Received tools/list request');
  return {
    tools: AVAILABLE_TOOLS,
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;
  log('Received tool call:', name);

  switch (name) {
    case 'get_next_task': {
      try {
        const screenshotPath = takeScreenshot();
        const instruction = await analyzeScreenshotWithGemini(screenshotPath);
        
        // Clean up screenshot
        unlinkSync(screenshotPath);
        log('Screenshot cleaned up');
        
        // Add to history
        addToPromptHistory(instruction);
        
        return {
          content: [
            {
              type: 'text',
              text: instruction,
            },
          ],
        };
      } catch (error) {
        log('ERROR in get_next_task:', error);
        return {
          content: [
            {
              type: 'text',
              text: `Error getting next task: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    }

    case 'clear_history': {
      try {
        if (existsSync(PROMPT_HISTORY_FILE)) {
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
          log('No prompt history to clear');
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

    default:
      log('ERROR: Unknown tool:', name);
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('MCP server connected and running');
}

main().catch((error) => {
  log('FATAL ERROR:', error);
  process.exit(1);
}); 