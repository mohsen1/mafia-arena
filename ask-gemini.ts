#!/usr/bin/env tsx

/**
 * Cursor Chat AI Assistant for Werewolf/Mafia Game Development
 * 
 * This script automates interaction with Cursor's chat interface to help improve
 * the Mafia/Werewolf AI game. It uses Gemini AI to analyze screenshots and
 * automatically types prompts, clicks buttons, and accepts code suggestions.
 * 
 * Prerequisites:
 * 1. Install cliclick: brew install cliclick
 * 2. Set GEMINI_API_KEY in your .env file
 * 3. Ensure you have macOS (uses screencapture command)
 * 4. Have Cursor IDE open with the werewolf-ai project
 * 
 * Usage:
 * ./ask-gemini.ts
 * 
 * The script will:
 * - Take screenshots of Cursor IDE
 * - Identify the chat interface
 * - Type helpful prompts to improve the game
 * - Click accept/send buttons automatically
 * 
 * Press Ctrl+C to stop.
 */

import { execSync } from 'child_process';
import { readFileSync, unlinkSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
import { join } from 'path';

const result = dotenv.config({ path: '.env' });
if (result.error) {
  console.error('Error loading .env file:', result.error);
  process.exit(1);
}

const GEMINI_API_KEY = result.parsed?.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('Error: GEMINI_API_KEY environment variable is not set');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Read project documentation for context
let README_CONTENT: string;
let ARCHITECTURE_CONTENT: string;

try {
  README_CONTENT = readFileSync('README.md', 'utf-8');
  ARCHITECTURE_CONTENT = readFileSync('ARCHITECTURE.md', 'utf-8');
} catch (error) {
  console.error('Error reading documentation files:', error);
  process.exit(1);
}

// Constants for tracking prompts
const PROMPT_HISTORY_FILE = join(process.cwd(), '.gemini-prompt-history.json');
const MAX_HISTORY_LENGTH = 50; // Keep last 50 prompts
const DEV_SERVER_LOG = join(process.cwd(), 'dev-server.log');
const STUCK_COMMAND_TIMEOUT = 10 * 60 * 1000; // 10 minutes in milliseconds

interface PromptHistoryEntry {
  timestamp: string;
  prompt: string;
  iteration: number;
}

function loadPromptHistory(): PromptHistoryEntry[] {
  if (!existsSync(PROMPT_HISTORY_FILE)) {
    return [];
  }
  try {
    const content = readFileSync(PROMPT_HISTORY_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Error loading prompt history:', error);
    return [];
  }
}

function savePromptHistory(history: PromptHistoryEntry[]): void {
  try {
    // Keep only the last MAX_HISTORY_LENGTH entries
    const trimmedHistory = history.slice(-MAX_HISTORY_LENGTH);
    writeFileSync(PROMPT_HISTORY_FILE, JSON.stringify(trimmedHistory, null, 2));
  } catch (error) {
    console.error('Error saving prompt history:', error);
  }
}

function addToPromptHistory(prompt: string, iteration: number): void {
  const history = loadPromptHistory();
  history.push({
    timestamp: new Date().toISOString(),
    prompt,
    iteration
  });
  savePromptHistory(history);
}

function getRecentPromptSummary(): string {
  const history = loadPromptHistory();
  if (history.length === 0) {
    return 'No previous prompts in this session.';
  }
  
  // Get last 10 prompts for context
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
  
  // Check for repeated patterns in last 10 prompts
  const recentPrompts = history.slice(-10).map(h => h.prompt);
  const promptCounts = new Map<string, number>();
  
  for (const prompt of recentPrompts) {
    // Normalize prompts for comparison (first 50 chars)
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
  
  // Check if the last prompt was about running a command and it's been more than 10 minutes
  const commandKeywords = ['run', 'execute', 'start', 'pnpm', 'npm', 'yarn', 'dev server', 'test'];
  const isCommandPrompt = commandKeywords.some(keyword => 
    lastPrompt.prompt.toLowerCase().includes(keyword)
  );
  
  return isCommandPrompt && (now - lastPromptTime) > STUCK_COMMAND_TIMEOUT;
}

function takeScreenshot(): string {
  const screenshotPath = '/tmp/cursor-screenshot.png';
  try {
    execSync(`screencapture -x ${screenshotPath}`);
    return screenshotPath;
  } catch (error) {
    console.error('Error taking screenshot:', error);
    throw error;
  }
}

async function analyzeScreenshotWithGemini(screenshotPath: string): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
    
    // Read the screenshot file
    const imageData = readFileSync(screenshotPath);
    const base64Image = imageData.toString('base64');
    
    // Get prompt history and loop detection
    const promptHistory = getRecentPromptSummary();
    const loopWarning = checkForLoops(loadPromptHistory());
    const stuckCommand = isCommandStuck(loadPromptHistory());
    
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
1. First, locate the Cursor IDE chat interface in the screenshot and ONLY look at that area.
   
   ${stuckCommand ? 'SKIP BUSY CHECK - Command is stuck, provide new instruction regardless of busy state.' : `Check if Cursor's chat is currently busy. Look SPECIFICALLY for these indicators WITHIN THE CURSOR CHAT UI:
   - A spinning loading indicator/spinner in the Cursor chat
   - The exact text "Working..." or "Thinking..." or "Applying..." in the Cursor chat response area
   - Code actively being typed/streamed character by character in Cursor's response
   - A progress bar showing active processing in Cursor
   
   IMPORTANT: Do NOT consider Cursor busy if:
   - The arrow up button (↑) is visible in the bottom right of the Cursor chat
   - The chat is simply open with no active animations
   - There's code visible in the editor (not being actively typed)
   - The last response has finished rendering
   - You see terminal output or other windows (these are NOT Cursor's status)
   
   KEY INDICATOR: If you can see the arrow up button (↑) in the bottom right of Cursor's chat, Cursor is NOT busy and ready for input.
   
   Only if you see CLEAR ACTIVE PROCESSING in the CURSOR CHAT UI and the arrow up button is NOT visible, include in your response: DEAR_CURSOR_AI_KEEP_WORKING`}

2. If Cursor is NOT busy (or command is stuck), analyze what you see in Cursor IDE and provide the next development instruction.

DEVELOPMENT PRIORITIES:
1. DEV SERVER MANAGEMENT: 
   - First, kill any hanging servers: \`pkill -f "pnpm dev" || true\` and \`pkill -f "next dev" || true\`
   - Then check if dev server is running by looking for a running process
   - If not running, instruct to run: \`pnpm dev > dev-server.log 2>&1 &\`
   - Check the log file for any errors

2. BROWSER TESTING WITH MCP TOOLS: Use Cursor's MCP browser tools to test the application:
   - Use \`mcp_playwright_browser_navigate\` to open the app in a browser
   - Use \`mcp_playwright_browser_snapshot\` to see the current state
   - Use \`mcp_playwright_browser_click\` to interact with elements
   - Use \`mcp_playwright_browser_type\` to fill in forms
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
Generate a clear, actionable instruction for Cursor AI. Be specific about what needs to be done.
Focus on using MCP browser tools for testing instead of E2E tests.
${stuckCommand ? 'IMPORTANT: Provide a NEW instruction to move forward, the previous command is stuck.' : ''}

CRITICAL: Your response should be ONLY the instruction text for Cursor AI, nothing else.
- Do NOT include status information or headers
- ONLY output the actionable development instruction itself
If Cursor is busy and no command is stuck, respond with ONLY: DEAR_CURSOR_AI_KEEP_WORKING`;

    const imagePart = {
      inlineData: {
        data: base64Image,
        mimeType: 'image/png'
      }
    };

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const responseText = response.text().trim();
    
    // Log the response for debugging
    console.log(`📝 Gemini response: "${responseText.substring(0, 200)}${responseText.length > 200 ? '...' : ''}"`);
    
    return responseText;
  } catch (error) {
    console.error('Error analyzing screenshot with Gemini:', error);
    throw error;
  }
}

function sendToCursor(prompt: string): void {
  console.log(`\n📤 Sending prompt to Cursor...`);
  
  // Give user time to switch to Cursor if needed
  console.log('Switching to Cursor in 2 seconds...');
  execSync('sleep 2');
  
  try {
    // Press Cmd+L to focus chat input
    console.log('Pressing Cmd+L to focus chat...');
    // For regular letters with modifiers, we need to:
    // 1. Press cmd down
    // 2. Type the letter
    // 3. Release cmd
    execSync('cliclick kd:cmd');
    execSync('cliclick t:l');
    execSync('cliclick ku:cmd');
    
    // Small delay to let the input focus
    execSync('sleep 0.5');
    
    // Type the prompt
    console.log('Typing prompt...');
    // Properly escape the prompt for shell
    // Replace single quotes with '\'' (end quote, escaped quote, start quote)
    // This handles all special characters including backticks, parentheses, etc.
    const escapedPrompt = prompt.replace(/'/g, "'\\''");
    
    // Use printf to handle the text more safely
    const command = `printf '%s' '${escapedPrompt}' | pbcopy && cliclick kd:cmd && cliclick t:v && cliclick ku:cmd`;
    execSync(command);
    
    // Small delay before sending
    execSync('sleep 1.5');
    
    // Press Enter using AppleScript
    console.log('Pressing Enter...');
    execSync(`osascript -e 'tell application "System Events" to key code 36'`);
    
    console.log('✓ Prompt sent successfully!');
  } catch (error) {
    console.error('Error sending prompt:', error);
    process.exit(1);
  }
}

async function runDevelopmentLoop(): Promise<void> {
  
  let iteration = 1;
  
  while (true) {
    try {
      console.log(`\n--- Iteration ${iteration} ---`);
      
      // Take screenshot
      console.log('📸 Taking screenshot...');
      const screenshotPath = takeScreenshot();
      
      // Analyze with Gemini
      console.log('🤖 Analyzing with Gemini...');
      const prompt = await analyzeScreenshotWithGemini(screenshotPath);
      
      // Clean up screenshot
      unlinkSync(screenshotPath);
      
      // Check if Cursor is busy
      if (prompt.includes('DEAR_CURSOR_AI_KEEP_WORKING')) {
        console.log('⏸️  Cursor is busy. Skipping this iteration.');
        // Wait 1 minute when Cursor is busy before checking again
        console.log('\n⏱️  Waiting 1 minute before checking again...');
        console.log('Press Ctrl+C to stop\n');
        execSync('sleep 60');
      } else {
        // Show truncated version for logging
        const truncatedPrompt = prompt.length > 100 ? prompt.substring(0, 100) + '...' : prompt;
        console.log(`📋 Prompt preview: "${truncatedPrompt}"`);
        
        // Send prompt to Cursor with timeout
        try {
          // Create a promise that rejects after 30 seconds
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Timeout: sendToCursor took longer than 30 seconds')), 30000);
          });
          
          // Create a promise that wraps the synchronous sendToCursor
          const sendPromise = new Promise<void>((resolve, reject) => {
            try {
              sendToCursor(prompt);
              resolve();
            } catch (error) {
              reject(error);
            }
          });
          
          // Race between the send operation and timeout
          await Promise.race([sendPromise, timeoutPromise]);
          
          // Add to prompt history only after successfully sending
          addToPromptHistory(prompt, iteration);
        } catch (error) {
          if (error instanceof Error && error.message.includes('Timeout')) {
            console.error('⏱️ Timeout: Failed to send prompt to Cursor within 30 seconds');
          } else {
            console.error('❌ Error sending prompt to Cursor:', error);
          }
          // Continue with the loop even if sending fails
        }
        
        // Wait 5 minutes before next iteration
        console.log('\n⏱️  Waiting 30 seconds before next iteration...');
        console.log('Press Ctrl+C to stop\n');
        execSync('sleep 30');
      }
      
      iteration++;
    } catch (error) {
      console.error('Error in development loop:', error);
      console.log('Retrying in 30 seconds...');
      execSync('sleep 30');
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Stopping development assistant...');
  process.exit(0);
});

// Handle command line arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Werewolf AI Development Assistant

Usage: ./ask-gemini.ts [options]

Options:
  --clear-history    Clear the prompt history and start fresh
  --help, -h         Show this help message

The assistant will:
- Monitor Cursor IDE and suggest development tasks
- Iterate every 5 minutes
- Guide Cursor to use MCP browser tools for testing
- Kill hanging servers before starting dev server
- Skip E2E testing completely
- Track past prompts to avoid loops
- Handle stuck commands by ignoring busy state
- Focus on unit testing and browser-based testing
- Continuously improve the game
`);
  process.exit(0);
}

if (args.includes('--clear-history')) {
  try {
    if (existsSync(PROMPT_HISTORY_FILE)) {
      unlinkSync(PROMPT_HISTORY_FILE);
      console.log('✅ Prompt history cleared successfully');
    } else {
      console.log('ℹ️  No prompt history to clear');
    }
  } catch (error) {
    console.error('Error clearing prompt history:', error);
  }
  process.exit(0);
}

// Start the assistant
runDevelopmentLoop().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});