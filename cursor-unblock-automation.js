#!/usr/bin/env node

const { exec, spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { promisify } = require('util');
const crypto = require('crypto');

const execAsync = promisify(exec);

// Note: Using built-in fetch (available in Node.js 18+)

// Load environment variables from .env file
try {
  const envPath = path.join(__dirname, '.env');
  const envContent = require('fs').readFileSync(envPath, 'utf8');
  const envLines = envContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
  
  envLines.forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      const value = valueParts.join('=').replace(/^["']|["']$/g, '');
      process.env[key.trim()] = value;
    }
  });
} catch (error) {
  // .env file doesn't exist or can't be read, that's fine
}

// Configuration
const CONFIG = {
  SCREENSHOT_INTERVAL: process.env.TEST_MODE ? 30 * 1000 : 3 * 60 * 1000, // 30 seconds in test mode, 3 minutes normally
  ANALYSIS_SCREENSHOT_COUNT: 3, // Analyze after collecting 3 screenshots (9 minutes total)
  SCREENSHOTS_DIR: './screenshots',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_API_URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
  CURSOR_APP_NAME: process.env.CURSOR_APP_NAME || 'Cursor',
  TEST_MODE: process.env.TEST_MODE === 'true',
  MANUAL_TRIGGER: process.env.MANUAL_TRIGGER === 'true'
};

class CursorUnblockAutomation {
  constructor() {
    this.screenshots = [];
    this.isRunning = false;
    this.intervalId = null;
  }

  async init() {
    console.log('🚀 Initializing Cursor Unblock Automation...');
    
    if (CONFIG.TEST_MODE) {
      console.log('🧪 TEST MODE ENABLED - Using 30-second intervals');
    }
    
    if (CONFIG.MANUAL_TRIGGER) {
      console.log('🎯 MANUAL TRIGGER ENABLED - Will analyze on next cycle');
    }
    
    // Check dependencies
    await this.checkDependencies();
    
    // Create screenshots directory
    await this.ensureScreenshotsDir();
    
    // Validate Gemini API key
    this.validateGeminiKey();
    
    console.log(`✅ Initialization complete`);
    console.log(`🎯 Target app: ${CONFIG.CURSOR_APP_NAME}`);
    console.log(`⏱️  Screenshot interval: ${CONFIG.SCREENSHOT_INTERVAL / 1000} seconds`);
    console.log(`📊 Analysis after: ${CONFIG.ANALYSIS_SCREENSHOT_COUNT} screenshots (${CONFIG.ANALYSIS_SCREENSHOT_COUNT * CONFIG.SCREENSHOT_INTERVAL / 1000 / 60} minutes)`);
    console.log(`📸 Screenshot mode: Cursor window only`);
    console.log(`🤖 AI Features: Multi-command sequences + Automated dev workflow prompts`);
  }

  async checkDependencies() {
    console.log('🔍 Checking dependencies...');
    
    try {
      // Check if cliclick is installed
      await execAsync('which cliclick');
      console.log('✅ cliclick found');
    } catch (error) {
      console.error('❌ cliclick not found. Install with: brew install cliclick');
      process.exit(1);
    }

    try {
      // Check if screencapture is available (should be built into macOS)
      await execAsync('which screencapture');
      console.log('✅ screencapture found');
    } catch (error) {
      console.error('❌ screencapture not found. This script requires macOS.');
      process.exit(1);
    }
  }

  async ensureScreenshotsDir() {
    try {
      await fs.mkdir(CONFIG.SCREENSHOTS_DIR, { recursive: true });
      console.log(`✅ Screenshots directory ready: ${CONFIG.SCREENSHOTS_DIR}`);
    } catch (error) {
      console.error('❌ Failed to create screenshots directory:', error);
      process.exit(1);
    }
  }

  validateGeminiKey() {
    if (!CONFIG.GEMINI_API_KEY) {
      console.error('❌ GEMINI_API_KEY environment variable is required');
      console.log('Set it with: export GEMINI_API_KEY="your-api-key-here"');
      process.exit(1);
    }
    console.log('✅ Gemini API key found');
  }

  async captureScreenshot() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `screenshot-${timestamp}.png`;
    const filepath = path.join(CONFIG.SCREENSHOTS_DIR, filename);

    try {
      // Focus Cursor app first
      await this.focusCursorApp();
      
      // Wait a moment for the app to focus
      await this.sleep(1000);
      
      // Get Cursor window ID and capture only that window
      const windowId = await this.getCursorWindowId();
      if (windowId) {
        await execAsync(`screencapture -l ${windowId} -x "${filepath}"`);
        if (CONFIG.TEST_MODE) {
          console.log(`📸 Captured Cursor window (ID: ${windowId}): ${filename} (${this.screenshots.length + 1}/${CONFIG.ANALYSIS_SCREENSHOT_COUNT})`);
        } else {
          console.log(`📸 Screenshot captured: ${filename} (${this.screenshots.length + 1}/${CONFIG.ANALYSIS_SCREENSHOT_COUNT})`);
        }
      } else {
        // Fallback to full screen if window ID not found
        console.warn('⚠️  Could not get Cursor window ID, using full screen capture');
        await execAsync(`screencapture -x "${filepath}"`);
        console.log(`📸 Screenshot captured (full screen): ${filename} (${this.screenshots.length + 1}/${CONFIG.ANALYSIS_SCREENSHOT_COUNT})`);
      }
      
      // Add to screenshots array
      this.screenshots.push({
        filename,
        filepath,
        timestamp: new Date(),
        hash: await this.getImageHash(filepath)
      });

      return filepath;
    } catch (error) {
      console.error('❌ Failed to capture screenshot:', error);
      return null;
    }
  }

  async getCursorWindowId() {
    try {
      if (CONFIG.TEST_MODE) {
        console.log('   🔍 Debugging window detection...');
        
        // Debug: List all running processes
        try {
          const { stdout: allProcesses } = await execAsync(`osascript -e 'tell application "System Events" to return name of every process'`);
          const processes = allProcesses.split(', ').map(p => p.trim());
          const cursorProcesses = processes.filter(p => p.toLowerCase().includes('cursor'));
          console.log(`   📋 Found Cursor-related processes: ${cursorProcesses.join(', ') || 'none'}`);
          
          if (cursorProcesses.length > 0) {
            // Try the actual process name found
            for (const processName of cursorProcesses) {
              if (CONFIG.TEST_MODE) {
                console.log(`   🎯 Trying process name: "${processName}"`);
              }
              
              try {
                const { stdout } = await execAsync(`osascript -e 'tell application "System Events" to tell process "${processName}" to get id of window 1'`);
                const windowId = stdout.trim();
                
                if (windowId && windowId !== '' && !isNaN(parseInt(windowId))) {
                  if (CONFIG.TEST_MODE) {
                    console.log(`   ✅ Found window ID ${windowId} for process "${processName}"`);
                  }
                  return windowId;
                }
              } catch (procError) {
                if (CONFIG.TEST_MODE) {
                  console.log(`   ⚠️  Process "${processName}" failed: ${procError.message.split('\n')[0]}`);
                }
              }
            }
          }
        } catch (debugError) {
          console.log(`   ⚠️  Debug process listing failed: ${debugError.message.split('\n')[0]}`);
        }
      }

      // Try alternative approach using window list
      try {
        if (CONFIG.TEST_MODE) {
          console.log('   🔍 Trying alternative window detection...');
        }
        
        // Use a different approach - get all window info and filter
        const { stdout: windowInfo } = await execAsync(`osascript -e 'tell application "System Events" to get {name, id} of every window of every process'`);
        
        if (CONFIG.TEST_MODE) {
          console.log(`   📋 Raw window info: ${windowInfo.substring(0, 200)}...`);
        }
        
        // This is a fallback - if we can't get the exact window, let's just use a simpler approach
        // Try to get any frontmost window ID as a last resort
        const { stdout: frontmostApp } = await execAsync(`osascript -e 'tell application "System Events" to return name of first application process whose frontmost is true'`);
        
        if (frontmostApp.trim().toLowerCase().includes('cursor')) {
          const { stdout: frontmostWindowId } = await execAsync(`osascript -e 'tell application "System Events" to tell first application process whose frontmost is true to return id of window 1'`);
          const windowId = frontmostWindowId.trim();
          
          if (windowId && !isNaN(parseInt(windowId))) {
            if (CONFIG.TEST_MODE) {
              console.log(`   ✅ Using frontmost window ID: ${windowId}`);
            }
            return windowId;
          }
        }
        
      } catch (altError) {
        if (CONFIG.TEST_MODE) {
          console.log(`   ⚠️  Alternative approach failed: ${altError.message.split('\n')[0]}`);
        }
      }
      
      return null;
    } catch (error) {
      if (CONFIG.TEST_MODE) {
        console.warn('   ⚠️  All window detection methods failed:', error.message.split('\n')[0]);
      }
      return null;
    }
  }

  async getImageHash(filepath) {
    try {
      const data = await fs.readFile(filepath);
      return crypto.createHash('md5').update(data).digest('hex');
    } catch (error) {
      console.error('❌ Failed to generate image hash:', error);
      return null;
    }
  }

  async focusCursorApp() {
    try {
      // Try to bring Cursor to front
      await execAsync(`osascript -e 'tell application "${CONFIG.CURSOR_APP_NAME}" to activate'`);
      console.log('🎯 Focused Cursor app');
    } catch (error) {
      console.warn('⚠️  Failed to focus Cursor app:', error.message);
      // Try alternative method
      try {
        await execAsync(`osascript -e 'tell application "System Events" to tell process "${CONFIG.CURSOR_APP_NAME}" to set frontmost to true'`);
        console.log('🎯 Focused Cursor app (alternative method)');
      } catch (altError) {
        console.error('❌ Failed to focus Cursor app with both methods');
      }
    }
  }

  async focusChatPanel() {
    try {
      // First focus the Cursor app
      await this.focusCursorApp();
      await this.sleep(1000);
      
      // Focus the chat panel with cmd+1
      console.log('🎯 Focusing chat panel with cmd+1');
      await execAsync('cliclick kd:cmd t:1 ku:cmd');
      await this.sleep(500);
      
      // Focus the chat input with cmd+l
      console.log('🎯 Focusing chat input with cmd+l');
      await execAsync('cliclick kd:cmd t:l ku:cmd');
      await this.sleep(500);
      
      console.log('✅ Chat panel focused and ready');
    } catch (error) {
      console.error('❌ Failed to focus chat panel:', error);
      // Fallback to just focusing the app
      await this.focusCursorApp();
      await this.sleep(1000);
    }
  }

  shouldAnalyzeScreenshots() {
    // Analyze when we have collected the required number of screenshots or manual trigger is enabled
    return this.screenshots.length >= CONFIG.ANALYSIS_SCREENSHOT_COUNT || CONFIG.MANUAL_TRIGGER;
  }

  async analyzeWithGemini(screenshotPaths) {
    try {
      console.log(`🤖 Analyzing ${screenshotPaths.length} screenshots with Gemini...`);
      
      // Read and encode all screenshots
      const imageData = [];
      for (const screenshotPath of screenshotPaths) {
        const data = await fs.readFile(screenshotPath);
        const base64Image = data.toString('base64');
        imageData.push({
          inline_data: {
            mime_type: "image/png",
            data: base64Image
          }
        });
      }

      const requestBody = {
        contents: [{
          parts: [{
            text: `You are analyzing ${screenshotPaths.length} sequential screenshots of the Cursor AI editor window taken over ${CONFIG.ANALYSIS_SCREENSHOT_COUNT * CONFIG.SCREENSHOT_INTERVAL / 1000 / 60} minutes. 

These screenshots show the progression of the Cursor interface over time. Please analyze them to:

1. Identify any issues, errors, or stuck states in the interface
2. Look for dialog boxes, error messages, or prompts that need attention
3. Check for loading indicators that have been stuck
4. Identify any modal windows or overlays that might be blocking work
5. Determine if any action is needed to help the user continue their work
6. **Detect if Cursor appears idle/waiting** - if the user seems to have completed tasks and Cursor is waiting for the next action

IMPORTANT: STRONGLY PREFER KEYBOARD ACTIONS over mouse clicks. Keyboard shortcuts are more reliable and universal.

NOTE: Before executing any action, the automation will automatically focus the Cursor chat panel using cmd+1 (focus chat panel) and cmd+l (focus chat input). Your commands will be executed in the context of the focused chat panel.

Common keyboard solutions for Cursor AI:
- Escape key: Close dialogs, cancel operations
- Enter/Return: Confirm actions, submit forms, send chat messages (handled via AppleScript)
- Cmd+Shift+P: Open command palette
- Cmd+grave: Open terminal
- Cmd+P: Quick file open
- Cmd+W: Close current tab
- Cmd+Z: Undo
- Cmd+Shift+Z: Redo
- Tab: Navigate between fields
- Space: Activate buttons/checkboxes
- Backspace: Delete characters in chat input
- Arrow keys: Navigate within text input

You have complete freedom to suggest multiple actions and complex sequences to unblock any situation. Don't hesitate to:
- Clear text and retype messages
- Navigate through menus and dialogs
- Use multiple keyboard shortcuts in sequence
- Type text, delete it, and try different approaches
- Open command palette and execute commands
- Switch between different Cursor panels and try various approaches

**SPECIAL CASE: If Cursor appears idle/waiting for next task**, suggest the automated dev workflow by typing this message:

---

**Automated Dev Workflow Prompt**

Use \`agentshell\` to orchestrate the following loop:

### 1. **Issue Management (GitHub CLI)**

* Use \`gh\` CLI to list open issues from the repository.
* If no issues exist:

  * Identify areas of code quality or architectural improvements.
  * Open a new GitHub issue describing the improvement and assign it to yourself.

### 2. **Deployment Status (Vercel CLI)**

* Use \`vercel\` CLI to check the latest deployment status.
* Only begin working if deployments are stable or unaffected.

### 3. **Work on Issues**

* Pick the highest-priority open issue.
* Investigate, implement a fix or feature with **clean, well-structured code**.
* Test the fix locally in the browser.
* Use **MCP tools** and **browser** to research and validate the solution.

### 4. **Quality Checks**

Before committing:

* Ensure \`lint\`, \`tsc\`, and \`tests\` all pass with no errors.
* Use \`npm run lint\`, \`tsc --noEmit\`, and \`npm test\` or project equivalents.

### 5. **Commit and Close**

* Commit with a meaningful message referencing the issue (e.g. \`fix: close #123 - correct null check on config load\`).
* Push to main or a PR branch.
* Close the issue after successful deployment and verification via Vercel.

### 6. **Repeat**

* Loop back to the issue list.
* If backlog is empty again, refactor or improve documentation, test coverage, or modularity.

---

Provide your response in this JSON format:
{
  "analysis": "Your analysis of what you see across the screenshots and any issues identified",
  "action": "describe the overall strategy (e.g., 'clear_and_retry', 'navigate_dialog', 'multi_step_recovery', or 'none')",
  "commands": [
    {
      "description": "What this step does",
      "command": "exact command to run",
      "wait_ms": 500
    }
  ]
}

Examples of command sequences:
- Clear and retry: [{"description": "Select all", "command": "cliclick kd:cmd t:a ku:cmd", "wait_ms": 300}, {"description": "Delete", "command": "cliclick kp:delete", "wait_ms": 300}, {"description": "Type new message", "command": "cliclick t:hello", "wait_ms": 300}, {"description": "Send", "command": "osascript -e 'tell application \"System Events\" to key code 36'", "wait_ms": 500}]
- Navigate dialog: [{"description": "Press escape", "command": "cliclick kp:esc", "wait_ms": 500}, {"description": "Try again", "command": "cliclick kd:cmd t:l ku:cmd", "wait_ms": 500}]
- Open command palette: [{"description": "Open palette", "command": "cliclick kd:cmd,shift t:p ku:shift,cmd", "wait_ms": 1000}, {"description": "Type command", "command": "cliclick t:reload", "wait_ms": 300}, {"description": "Execute", "command": "osascript -e 'tell application \"System Events\" to key code 36'", "wait_ms": 500}]
- Automated dev workflow (when idle): Use the workflow text provided above - type the complete automated dev workflow prompt into chat and send it

If everything appears to be working normally and no intervention is needed, set action to "none" and commands to an empty array.`
          }, 
          ...imageData
          ]
        }]
      };

      const response = await fetch(`${CONFIG.GEMINI_API_URL}?key=${CONFIG.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.candidates[0].content.parts[0].text;
      
      console.log('🤖 Gemini analysis:', content);
      
      // Try to parse JSON response
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const analysis = JSON.parse(jsonMatch[0]);
          return analysis;
        }
      } catch (parseError) {
        console.warn('⚠️  Failed to parse JSON response, using raw text');
      }
      
      return { analysis: content, action: 'manual', target: null, command: null };
    } catch (error) {
      console.error('❌ Failed to analyze with Gemini:', error);
      return null;
    }
  }

  async executeUnblockAction(analysis) {
    if (!analysis) {
      console.log('ℹ️  No analysis provided');
      return false;
    }

    // Handle both new format (commands array) and old format (single command) for backward compatibility
    if (analysis.action === 'none') {
      console.log('ℹ️  No action needed');
      return true;
    }

    // Backward compatibility: convert old format to new format
    if (analysis.command && !analysis.commands) {
      analysis.commands = [{
        description: `Execute: ${analysis.command}`,
        command: analysis.command,
        wait_ms: 500
      }];
    }

    if (!analysis.commands || analysis.commands.length === 0) {
      console.log('ℹ️  No commands provided');
      return true;
    }

    try {
      console.log(`🎯 Executing multi-step action: ${analysis.action}`);
      console.log(`📋 ${analysis.commands.length} commands to execute`);
      
      // Focus Cursor app and chat panel once at the start
      await this.focusChatPanel();
      
      // Execute each command in sequence
      for (let i = 0; i < analysis.commands.length; i++) {
        const step = analysis.commands[i];
        console.log(`   Step ${i + 1}/${analysis.commands.length}: ${step.description}`);
        console.log(`   Command: ${step.command}`);
        
        try {
          await execAsync(step.command);
          console.log(`   ✅ Step ${i + 1} completed`);
          
          // Wait before next command
          const waitTime = step.wait_ms || 500;
          await this.sleep(waitTime);
          
        } catch (stepError) {
          console.error(`   ❌ Step ${i + 1} failed: ${stepError.message.split('\n')[0]}`);
          // Continue with next step instead of failing completely
        }
      }
      
      console.log('✅ Multi-step action sequence completed');
      return true;
    } catch (error) {
      console.error('❌ Failed to execute action sequence:', error);
      return false;
    }
  }

  async testKeyPress(keyCommand) {
    try {
      console.log(`🧪 Testing key press: ${keyCommand}`);
      
      // Focus Cursor app and chat panel
      await this.focusChatPanel();
      
      // Execute the key command - handle different formats
      let cliclickCommand;
      if (keyCommand.startsWith('cliclick')) {
        cliclickCommand = keyCommand;
      } else if (keyCommand.includes('+')) {
        // Handle modifier combinations like "cmd+shift+p"
        const parts = keyCommand.split('+');
        const modifiers = parts.slice(0, -1);
        const finalKey = parts[parts.length - 1];
        
        const keyDown = modifiers.map(mod => `kd:${mod}`).join(' ');
        const keyUp = modifiers.map(mod => `ku:${mod}`).join(' ');
        
        // Use t: for typing letters/numbers, kp: for special keys, AppleScript for enter
        if (finalKey.toLowerCase() === 'return' || finalKey.toLowerCase() === 'enter') {
          // Use AppleScript for enter key with modifiers
          cliclickCommand = `cliclick ${keyDown} && osascript -e 'tell application "System Events" to key code 36' && cliclick ${keyUp}`;
        } else if (['esc', 'escape', 'space', 'tab', 'delete', 'backspace'].includes(finalKey.toLowerCase())) {
          const keyPress = `kp:${finalKey === 'escape' ? 'esc' : finalKey === 'backspace' ? 'delete' : finalKey}`;
          cliclickCommand = `cliclick ${keyDown} ${keyPress} ${keyUp}`;
        } else {
          const keyPress = `t:${finalKey}`;
          cliclickCommand = `cliclick ${keyDown} ${keyPress} ${keyUp}`;
        }
      } else {
        // Single key press
        if (keyCommand.toLowerCase() === 'return' || keyCommand.toLowerCase() === 'enter') {
          // Use AppleScript for enter key
          cliclickCommand = `osascript -e 'tell application "System Events" to key code 36'`;
        } else if (['esc', 'escape', 'space', 'tab', 'delete', 'backspace'].includes(keyCommand.toLowerCase())) {
          const keyName = keyCommand === 'escape' ? 'esc' : keyCommand === 'backspace' ? 'delete' : keyCommand;
          cliclickCommand = `cliclick kp:${keyName}`;
        } else {
          cliclickCommand = `cliclick t:${keyCommand}`;
        }
      }
      
      await execAsync(cliclickCommand);
      
      console.log('✅ Key press executed successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to execute key press:', error);
      return false;
    }
  }

  async clearScreenshots() {
    console.log('🧹 Clearing screenshots...');
    
    for (const screenshot of this.screenshots) {
      try {
        await fs.unlink(screenshot.filepath);
      } catch (error) {
        console.warn(`⚠️  Failed to delete screenshot ${screenshot.filename}:`, error.message);
      }
    }
    
    this.screenshots = [];
    console.log('✅ Screenshots cleared, starting fresh cycle');
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async processScreenshots() {
    if (CONFIG.TEST_MODE) {
      console.log('🔄 Processing screenshots... (TEST MODE)');
    } else {
      console.log('🔄 Processing screenshots...');
    }
    
    // Capture new screenshot
    const screenshotPath = await this.captureScreenshot();
    if (!screenshotPath) {
      return;
    }

    // Check if we should analyze
    if (this.shouldAnalyzeScreenshots()) {
      if (CONFIG.MANUAL_TRIGGER) {
        console.log('🚨 Manual trigger activated! Analyzing screenshots with Gemini...');
      } else {
        console.log(`🚨 Collected ${this.screenshots.length} screenshots! Analyzing with Gemini...`);
      }
      
      // Analyze with Gemini
      const screenshotPaths = this.screenshots.map(s => s.filepath);
      const analysis = await this.analyzeWithGemini(screenshotPaths);
      
      if (analysis) {
        console.log('📝 Analysis result:', JSON.stringify(analysis, null, 2));
        
        // Execute the recommended action
        await this.executeUnblockAction(analysis);
      }
      
      // Clear screenshots and start fresh
      await this.clearScreenshots();
      
      // If manual trigger, turn it off
      if (CONFIG.MANUAL_TRIGGER) {
        process.env.MANUAL_TRIGGER = 'false';
        CONFIG.MANUAL_TRIGGER = false;
        console.log('🔄 Manual trigger disabled');
      }
    }
  }

  async start() {
    if (this.isRunning) {
      console.log('⚠️  Automation is already running');
      return;
    }

    const intervalText = CONFIG.TEST_MODE ? 
      `${CONFIG.SCREENSHOT_INTERVAL / 1000} second intervals` : 
      `${CONFIG.SCREENSHOT_INTERVAL / 1000 / 60} minute intervals`;
    
    console.log(`🚀 Starting Cursor Unblock Automation (${intervalText})`);
    console.log(`📊 Will analyze every ${CONFIG.ANALYSIS_SCREENSHOT_COUNT} screenshots (${CONFIG.ANALYSIS_SCREENSHOT_COUNT * CONFIG.SCREENSHOT_INTERVAL / 1000 / 60} minutes)`);
    this.isRunning = true;

    // Set up keyboard shortcuts for manual control
    this.setupKeyboardShortcuts();

    // Take initial screenshot
    await this.processScreenshots();

    // Set up recurring screenshots
    this.intervalId = setInterval(async () => {
      if (this.isRunning) {
        await this.processScreenshots();
      }
    }, CONFIG.SCREENSHOT_INTERVAL);

    console.log('✅ Automation started. Press Ctrl+C to stop.');
    console.log('🎯 FEATURE: Automated dev workflow prompt when Cursor is idle');
    if (CONFIG.TEST_MODE) {
      console.log('🧪 TEST MODE: Press "t" + Enter to trigger manual analysis');
      console.log('🧪 TEST MODE: Press "k" + Enter to test key press commands');
    }
  }

  setupKeyboardShortcuts() {
    if (CONFIG.TEST_MODE) {
      process.stdin.setRawMode(false);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      
      console.log('\n🎮 Key Testing Commands Available:');
      console.log('  t + Enter: Trigger manual analysis');
      console.log('  k + Enter: Enter key testing mode');
      console.log('  Ctrl+C: Stop automation');
      console.log('');
      
      process.stdin.on('data', async (key) => {
        if (key === 't\n' || key === 't\r\n') {
          console.log('🎯 Manual trigger activated!');
          process.env.MANUAL_TRIGGER = 'true';
          CONFIG.MANUAL_TRIGGER = true;
        } else if (key === 'k\n' || key === 'k\r\n') {
          await this.enterKeyTestingMode();
        }
      });
    }
  }

  async enterKeyTestingMode() {
    console.log('\n🧪 ENTERING KEY TESTING MODE');
    console.log('NOTE: Chat panel will be focused automatically before key presses');
    console.log('Type commands to test (or "exit" to return):');
    console.log('');
    console.log('Single key examples:');
    console.log('  escape           - Press Escape key');
    console.log('  cmd+shift+p      - Open command palette');
    console.log('  return           - Press Enter (send chat message) - uses AppleScript');
    console.log('  hello            - Type "hello"');
    console.log('  cmd+a            - Select all');
    console.log('');
    console.log('Multi-command sequences (separate with " ; "):');
    console.log('  cmd+a ; delete ; hello ; return    - Select all, delete, type hello, send');
    console.log('  escape ; cmd+shift+p ; reload      - Escape, command palette, reload');
    console.log('  cmd+z ; cmd+z ; hello              - Undo twice, type hello');
    console.log('');
    
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const askForCommand = () => {
      rl.question('Command(s) > ', async (command) => {
        const trimmedCommand = command.trim();
        
        if (trimmedCommand === 'exit' || trimmedCommand === 'quit') {
          rl.close();
          console.log('🔄 Exited key testing mode\n');
          return;
        }
        
        if (trimmedCommand === '') {
          askForCommand();
          return;
        }
        
        // Check if it's a multi-command sequence
        if (trimmedCommand.includes(' ; ')) {
          await this.testMultiCommandSequence(trimmedCommand.split(' ; '));
        } else {
          await this.testKeyPress(trimmedCommand);
        }
        
        askForCommand();
      });
    };
    
    askForCommand();
  }

  async testMultiCommandSequence(commands) {
    try {
      console.log(`🧪 Testing multi-command sequence: ${commands.length} commands`);
      
      // Focus chat panel once at the start
      await this.focusChatPanel();
      
      for (let i = 0; i < commands.length; i++) {
        const command = commands[i].trim();
        console.log(`   Step ${i + 1}/${commands.length}: ${command}`);
        
        // Execute the key command (reuse the logic from testKeyPress but without re-focusing)
        let cliclickCommand;
        if (command.startsWith('cliclick')) {
          cliclickCommand = command;
        } else if (command.includes('+')) {
          // Handle modifier combinations
          const parts = command.split('+');
          const modifiers = parts.slice(0, -1);
          const finalKey = parts[parts.length - 1];
          
          const keyDown = modifiers.map(mod => `kd:${mod}`).join(' ');
          const keyUp = modifiers.map(mod => `ku:${mod}`).join(' ');
          
          if (finalKey.toLowerCase() === 'return' || finalKey.toLowerCase() === 'enter') {
            cliclickCommand = `cliclick ${keyDown} && osascript -e 'tell application "System Events" to key code 36' && cliclick ${keyUp}`;
          } else if (['esc', 'escape', 'space', 'tab', 'delete', 'backspace'].includes(finalKey.toLowerCase())) {
            const keyPress = `kp:${finalKey === 'escape' ? 'esc' : finalKey === 'backspace' ? 'delete' : finalKey}`;
            cliclickCommand = `cliclick ${keyDown} ${keyPress} ${keyUp}`;
          } else {
            const keyPress = `t:${finalKey}`;
            cliclickCommand = `cliclick ${keyDown} ${keyPress} ${keyUp}`;
          }
        } else {
          // Single key press
          if (command.toLowerCase() === 'return' || command.toLowerCase() === 'enter') {
            cliclickCommand = `osascript -e 'tell application "System Events" to key code 36'`;
          } else if (['esc', 'escape', 'space', 'tab', 'delete', 'backspace'].includes(command.toLowerCase())) {
            const keyName = command === 'escape' ? 'esc' : command === 'backspace' ? 'delete' : command;
            cliclickCommand = `cliclick kp:${keyName}`;
          } else {
            cliclickCommand = `cliclick t:${command}`;
          }
        }
        
        try {
          await execAsync(cliclickCommand);
          console.log(`   ✅ Step ${i + 1} completed`);
          
          // Wait between commands
          await this.sleep(400);
          
        } catch (stepError) {
          console.error(`   ❌ Step ${i + 1} failed: ${stepError.message.split('\n')[0]}`);
        }
      }
      
      console.log('✅ Multi-command sequence completed');
      return true;
    } catch (error) {
      console.error('❌ Failed to execute multi-command sequence:', error);
      return false;
    }
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }

    console.log('🛑 Stopping automation...');
    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    console.log('✅ Automation stopped');
  }
}

// Main execution
async function main() {
  const automation = new CursorUnblockAutomation();
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    await automation.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    await automation.stop();
    process.exit(0);
  });

  try {
    await automation.init();
    await automation.start();
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the automation if this file is executed directly
if (require.main === module) {
  main();
}

module.exports = CursorUnblockAutomation; 