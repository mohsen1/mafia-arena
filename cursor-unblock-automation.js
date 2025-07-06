#!/usr/bin/env node

const { exec, spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { promisify } = require('util');
const crypto = require('crypto');
const fetch = require('node-fetch');

const execAsync = promisify(exec);

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
  SCREENSHOT_INTERVAL: process.env.TEST_MODE ? 10 * 1000 : 3 * 60 * 1000, // 10 seconds in test mode, 3 minutes normally
  SCREENSHOTS_DIR: './screenshots',
  MAX_SCREENSHOTS: 10, // Keep only last 10 screenshots
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
      console.log('🧪 TEST MODE ENABLED - Using 10-second intervals');
    }
    
    if (CONFIG.MANUAL_TRIGGER) {
      console.log('🎯 MANUAL TRIGGER ENABLED - Will analyze on next screenshot');
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
    console.log(`📸 Screenshot mode: Cursor window only (exact pixel comparison)`);
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
          console.log(`📸 Captured Cursor window (ID: ${windowId}): ${filename}`);
        } else {
          console.log(`📸 Screenshot captured: ${filename}`);
        }
      } else {
        // Fallback to full screen if window ID not found
        console.warn('⚠️  Could not get Cursor window ID, using full screen capture');
        await execAsync(`screencapture -x "${filepath}"`);
        console.log(`📸 Screenshot captured (full screen): ${filename}`);
      }
      
      // Add to screenshots array
      this.screenshots.push({
        filename,
        filepath,
        timestamp: new Date(),
        hash: await this.getImageHash(filepath)
      });

      // Keep only the last few screenshots
      if (this.screenshots.length > CONFIG.MAX_SCREENSHOTS) {
        const oldScreenshot = this.screenshots.shift();
        try {
          await fs.unlink(oldScreenshot.filepath);
        } catch (error) {
          console.warn('⚠️  Failed to delete old screenshot:', error.message);
        }
      }

      return filepath;
    } catch (error) {
      console.error('❌ Failed to capture screenshot:', error);
      return null;
    }
  }

  async getCursorWindowId() {
    try {
      // Get window ID for Cursor app
      const { stdout } = await execAsync(`osascript -e 'tell application "System Events" to get id of first window of process "${CONFIG.CURSOR_APP_NAME}" whose visible is true'`);
      const windowId = stdout.trim();
      
      if (windowId && windowId !== '') {
        if (CONFIG.TEST_MODE) {
          console.log(`   🎯 Found Cursor window ID: ${windowId}`);
        }
        return windowId;
      }
      
      return null;
    } catch (error) {
      if (CONFIG.TEST_MODE) {
        console.warn('   ⚠️  Failed to get Cursor window ID:', error.message);
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

  areScreenshotsSame() {
    if (this.screenshots.length < 3) {
      if (CONFIG.TEST_MODE) {
        console.log(`   📸 Only ${this.screenshots.length} screenshots, need 3 for comparison`);
      }
      return false;
    }

    // Get the last 3 screenshots
    const lastThree = this.screenshots.slice(-3);
    
    if (CONFIG.TEST_MODE) {
      console.log('   🔍 Comparing last 3 Cursor window screenshots...');
      lastThree.forEach((screenshot, index) => {
        console.log(`   📸 Screenshot ${index + 1}: ${screenshot.hash?.substring(0, 8)}...`);
      });
    }
    
    // Check if all hashes are exactly the same (since we're only capturing Cursor window)
    const firstHash = lastThree[0].hash;
    const allSame = lastThree.every(screenshot => screenshot.hash === firstHash);
    
    if (allSame) {
      console.log('🔍 Last 3 Cursor window screenshots are identical - stuck state detected');
      return true;
    }
    
    if (CONFIG.TEST_MODE) {
      console.log('   ✅ Cursor window screenshots are different - no stuck state detected');
    }
    
    return false;
  }

  async analyzeWithGemini(screenshotPath) {
    try {
      console.log('🤖 Analyzing screenshot with Gemini...');
      
      // Read and encode the screenshot
      const imageData = await fs.readFile(screenshotPath);
      const base64Image = imageData.toString('base64');

      const requestBody = {
        contents: [{
          parts: [{
            text: `You are analyzing a screenshot of the Cursor AI editor window to help unblock a stuck situation. 

The user's automation detected that the last 3 screenshots of the Cursor window are exactly identical (pixel-perfect match), indicating the application is definitely stuck or waiting for user input.

Please analyze this screenshot and provide specific instructions on what to do to unblock the situation. Consider:
1. Look for any dialog boxes, error messages, or prompts that need attention
2. Check if there are any buttons that need to be clicked
3. Look for loading indicators or progress bars
4. Identify any modal windows or overlays
5. Check if the application is waiting for user input

IMPORTANT: STRONGLY PREFER KEYBOARD ACTIONS over mouse clicks. Keyboard shortcuts are more reliable and universal.

Common keyboard solutions for Cursor AI:
- Escape key: Close dialogs, cancel operations
- Enter/Return: Confirm actions, submit forms
- Cmd+Shift+P: Open command palette
- Cmd+grave: Open terminal
- Cmd+P: Quick file open
- Cmd+W: Close current tab
- Cmd+Z: Undo
- Cmd+Shift+Z: Redo
- Tab: Navigate between fields
- Space: Activate buttons/checkboxes

Provide your response in this JSON format:
{
  "analysis": "Your analysis of what you see in the screenshot",
  "action": "specific action to take (prefer 'key' over 'click')",
  "target": "specific element or key combination",
  "command": "exact cliclick command to run (e.g., 'cliclick kp:escape' or 'cliclick kp:cmd+shift+p')"
}

Focus on keyboard-based solutions first, only use mouse clicks if absolutely necessary.`
          }, {
            inline_data: {
              mime_type: "image/png",
              data: base64Image
            }
          }]
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
    if (!analysis || !analysis.command) {
      console.log('ℹ️  No specific action provided, trying default unblock actions');
      return await this.executeDefaultUnblockActions();
    }

    try {
      console.log(`🎯 Executing action: ${analysis.command}`);
      
      // Focus Cursor app first
      await this.focusCursorApp();
      await this.sleep(1000);
      
      // Execute the command
      await execAsync(analysis.command);
      
      console.log('✅ Action executed successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to execute action:', error);
      return false;
    }
  }

  async executeDefaultUnblockActions() {
    console.log('🔧 Executing default keyboard-based unblock actions...');
    
    try {
      // Focus Cursor app
      await this.focusCursorApp();
      await this.sleep(1000);
      
      // Try common keyboard-based unblock actions (prioritize keyboard over mouse)
      const actions = [
        'cliclick kp:escape',           // Press Escape to close dialogs
        'cliclick kp:return',           // Press Enter to confirm
        'cliclick kp:tab',              // Navigate to next field
        'cliclick kp:space',            // Activate buttons/checkboxes
        'cliclick kp:cmd+shift+p',      // Open command palette
        'cliclick kp:escape',           // Close command palette
        'cliclick kp:cmd+w',            // Close current tab
        'cliclick kp:cmd+z',            // Undo last action
        'cliclick kp:cmd+p',            // Quick file open
        'cliclick kp:escape',           // Close any open dialogs
      ];
      
      for (const action of actions) {
        console.log(`🎯 Trying: ${action}`);
        await execAsync(action);
        await this.sleep(1000);
      }
      
      console.log('✅ Default unblock actions completed');
      return true;
    } catch (error) {
      console.error('❌ Failed to execute default actions:', error);
      return false;
    }
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

    // Check if we have enough screenshots and if they're the same
    const areSame = this.areScreenshotsSame();
    
    if (areSame || CONFIG.MANUAL_TRIGGER) {
      if (CONFIG.MANUAL_TRIGGER) {
        console.log('🚨 Manual trigger activated! Analyzing with Gemini...');
      } else {
        console.log('🚨 Stuck state detected! Analyzing with Gemini...');
      }
      
      // Analyze with Gemini
      const analysis = await this.analyzeWithGemini(screenshotPath);
      
      if (analysis) {
        console.log('📝 Analysis result:', JSON.stringify(analysis, null, 2));
        
        // Execute the recommended action
        await this.executeUnblockAction(analysis);
        
        // Clear screenshots to avoid repeated actions
        this.screenshots = [];
        console.log('🧹 Cleared screenshot history to avoid repeated actions');
        
        // If manual trigger, turn it off
        if (CONFIG.MANUAL_TRIGGER) {
          process.env.MANUAL_TRIGGER = 'false';
          CONFIG.MANUAL_TRIGGER = false;
          console.log('🔄 Manual trigger disabled');
        }
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
    if (CONFIG.TEST_MODE) {
      console.log('🧪 TEST MODE: Press "t" + Enter to trigger manual analysis');
    }
  }

  setupKeyboardShortcuts() {
    if (CONFIG.TEST_MODE) {
      process.stdin.setRawMode(false);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      
      process.stdin.on('data', (key) => {
        if (key === 't\n' || key === 't\r\n') {
          console.log('🎯 Manual trigger activated!');
          process.env.MANUAL_TRIGGER = 'true';
          CONFIG.MANUAL_TRIGGER = true;
        }
      });
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