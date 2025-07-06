# Cursor AI Editor Unblock Automation

This Node.js script automatically monitors your Cursor AI editor for stuck situations and uses Gemini AI to determine appropriate actions to unblock them.

## Features

- 📸 **Automatic Screenshots**: Captures Cursor window only every 3 minutes (10 seconds in test mode)
- 🔍 **Exact Duplicate Detection**: Compares Cursor window screenshots with pixel-perfect accuracy
- 🤖 **AI Analysis**: Uses Gemini AI to analyze screenshots and suggest actions
- 🎯 **Auto-focusing**: Automatically focuses the Cursor AI editor
- ⌨️ **Keyboard-First Actions**: Prioritizes keyboard shortcuts over mouse clicks for reliability
- 🖱️ **Automated Actions**: Uses `cliclick` to perform keyboard actions and fallback mouse actions
- 🧹 **Cleanup**: Automatically manages screenshot storage
- 🧪 **Test Mode**: Fast testing with 10-second intervals and manual triggers
- 🎯 **Window-Only Capture**: Eliminates false positives from system clocks, menus, and dynamic elements

## Prerequisites

### System Requirements
- **macOS only** (uses macOS-specific utilities)
- **Node.js** 18.0.0 or higher (required for built-in fetch)
- **cliclick** (for mouse/keyboard automation)

### Installation

1. **Install cliclick**:
   ```bash
   brew install cliclick
   ```

2. **Install Node.js dependencies**:
   ```bash
   pnpm install
   ```
   
   The project includes all necessary dependencies. The script uses Node.js built-in `fetch` (requires Node.js 18+).

3. **Get a Gemini API Key**:
   - Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
   - Create a new API key
   - Copy the API key

4. **Set up environment variables**:
   
   **Option A: Using .env file (recommended)**:
   ```bash
   cp automation.env.example .env
   # Edit .env and add your API key
   ```
   
   Or manually create:
   ```bash
   echo 'GEMINI_API_KEY=your-api-key-here' >> .env
   ```
   
   **Option B: Using environment variables**:
   ```bash
   export GEMINI_API_KEY="your-api-key-here"
   ```
   
   Or add it to your shell profile:
   ```bash
   echo 'export GEMINI_API_KEY="your-api-key-here"' >> ~/.zshrc
   source ~/.zshrc
   ```

## Usage

### Basic Usage

1. **Make the script executable**:
   ```bash
   chmod +x cursor-unblock-automation.js
   ```

2. **Run the script**:
   ```bash
   node cursor-unblock-automation.js
   ```

3. **Using npm scripts** (recommended):
   ```bash
   # Normal mode (3-minute intervals)
   pnpm automation
   
   # Test mode (10-second intervals)
   pnpm automation:test
   
   # Manual trigger mode
   pnpm automation:manual
   
   # Test suite
   pnpm automation:test-suite
   ```

## Testing & Development

### Quick Testing

The script includes several test modes to make development and debugging easier:

1. **Test Mode (Recommended for testing)**:
   ```bash
   pnpm automation:test
   ```
   - Screenshots every 10 seconds instead of 3 minutes
   - Detailed logging of comparison results
   - Manual trigger support (press "t" + Enter)

2. **Manual Trigger Test**:
   ```bash
   pnpm automation:manual
   ```
   - Triggers analysis on the very next screenshot
   - Useful for immediate testing

3. **Test Runner**:
   ```bash
   pnpm automation:test-suite quick
   ```
   - Comprehensive test suite with multiple scenarios
   - Image comparison testing
   - Similarity threshold testing

### Test Commands

```bash
# Quick test mode
pnpm automation:test-suite quick

# Manual trigger test
pnpm automation:test-suite manual

# Test window capture and hash comparison
pnpm automation:test-suite compare

# Show all available test scenarios
pnpm automation:test-suite scenarios
```

### Configuration Options

Set these environment variables to customize behavior:

```bash
# Test mode (10-second intervals)
TEST_MODE=true

# Manual trigger (analyze next screenshot immediately)
MANUAL_TRIGGER=true

# Cursor app name if different from "Cursor"
CURSOR_APP_NAME=Cursor

# Your Gemini API key
GEMINI_API_KEY=your-key-here
```

### What the Script Does

1. **Initializes**: Checks dependencies and creates screenshot directory
2. **Monitors**: Takes screenshots every 3 minutes of the focused screen
3. **Compares**: Analyzes the last 3 screenshots for identical content
4. **Detects**: When 3 identical screenshots are found, it indicates a stuck state
5. **Analyzes**: Sends the screenshot to Gemini AI for analysis
6. **Acts**: Executes the AI-suggested action using cliclick
7. **Focuses**: Ensures Cursor AI editor is focused before taking actions

### Keyboard-First Approach

The script **prioritizes keyboard actions over mouse clicks** for better reliability and consistency:

**Why Keyboard Actions Are Better:**
- More reliable across different screen resolutions and layouts
- Faster execution and less prone to timing issues
- Universal shortcuts that work regardless of UI changes
- Less dependent on specific pixel coordinates

### Default Actions

If Gemini AI doesn't provide a specific action, the script will try these keyboard-based unblock actions:
- Press `Escape` to close dialogs
- Press `Enter` to confirm actions
- Press `Tab` to navigate between fields
- Press `Space` to activate buttons/checkboxes
- Open command palette (`Cmd+Shift+P`)
- Close current tab (`Cmd+W`)
- Undo last action (`Cmd+Z`)
- Quick file open (`Cmd+P`)

## Configuration

You can modify the `CONFIG` object at the top of the script to customize:

```javascript
const CONFIG = {
  SCREENSHOT_INTERVAL: 3 * 60 * 1000, // 3 minutes in milliseconds
  SCREENSHOTS_DIR: './screenshots',    // Directory for screenshots
  MAX_SCREENSHOTS: 10,                 // Number of screenshots to keep
  CURSOR_APP_NAME: 'Cursor'           // Name of the Cursor app
};
```

## How It Works

### Window-Only Screenshot Comparison

The script captures only the Cursor AI editor window, eliminating all external dynamic content:

**Window Capture Benefits:**
1. **Eliminates System Noise**: No clocks, system menus, or background apps
2. **Exact Pixel Comparison**: Simple MD5 hash matching for identical detection
3. **Zero False Positives**: Dynamic content from other apps won't interfere
4. **Faster Processing**: No complex similarity calculations needed

**How It Works:**
- **Window Detection**: Uses AppleScript to get Cursor window ID
- **Targeted Capture**: `screencapture -l <window_id>` captures only Cursor
- **Exact Matching**: MD5 hash comparison for pixel-perfect detection
- **Fallback Safety**: Falls back to full screen if window ID unavailable

**Benefits:**
- Eliminates false positives from system clocks and dynamic elements
- Much faster and more reliable than similarity detection
- Simple and robust - no configuration needed
- Only captures what matters: the Cursor editor content

### AI Analysis
Gemini AI analyzes screenshots and provides:
- **Analysis**: Description of what's happening in the screenshot
- **Action**: Type of action needed (click, key press, etc.)
- **Target**: Specific element or coordinates to interact with
- **Command**: Exact cliclick command to execute

### Safety Features
- **Graceful shutdown**: Handles Ctrl+C properly
- **Error handling**: Continues running even if individual operations fail
- **Cleanup**: Automatically removes old screenshots
- **Focused actions**: Only acts on the Cursor AI editor

## Example Output

```
🚀 Initializing Cursor Unblock Automation...
🔍 Checking dependencies...
✅ cliclick found
✅ screencapture found
✅ Screenshots directory ready: ./screenshots
✅ Gemini API key found
✅ Initialization complete
🚀 Starting Cursor Unblock Automation (3 minute intervals)
🔄 Processing screenshots...
🎯 Focused Cursor app
📸 Screenshot captured: screenshot-2024-01-15T10-30-00-000Z.png
✅ Automation started. Press Ctrl+C to stop.
```

When a stuck state is detected:
```
🔍 Last 3 screenshots are identical - potential stuck state detected
🚨 Stuck state detected! Analyzing with Gemini...
🤖 Analyzing screenshot with Gemini...
🤖 Gemini analysis: {
  "analysis": "I can see a modal dialog asking for confirmation...",
  "action": "click",
  "target": "OK button",
  "command": "cliclick c:150,200"
}
🎯 Executing action: cliclick c:150,200
✅ Action executed successfully
🧹 Cleared screenshot history to avoid repeated actions
```

## Troubleshooting

### Common Issues

1. **"cliclick not found"**
   - Install with: `brew install cliclick`

2. **"GEMINI_API_KEY environment variable is required"**
   - Set your API key: `export GEMINI_API_KEY="your-key"`

3. **"Failed to focus Cursor app"**
   - Make sure Cursor is running and named "Cursor"
   - Check if the app name is different in your system

4. **Permission issues with screenshots**
   - Grant Terminal/iTerm screen recording permissions in System Preferences

5. **"Not detecting stuck states" (missing real stuck situations)**
   - Ensure Cursor window is visible and not minimized
   - Check that the correct app name is being used (`CURSOR_APP_NAME`)
   - Use test mode to see if window ID detection is working

### Debugging

- **Use test mode**: `pnpm automation:test`
- **Check the `screenshots` directory** to see what's being captured
- **Look at detailed logs** in test mode for window detection and hash comparison
- **Test window capture**: `pnpm automation:test-suite compare`
- **Test manual trigger**: `pnpm automation:test-suite manual`
- **Verify Gemini API key** is working with a simple test

## Security Considerations

- The script only captures screenshots and performs basic UI actions
- Screenshots are stored locally and automatically cleaned up
- API key should be kept secure and not committed to version control
- The script only focuses and acts on the Cursor AI editor

## License

MIT License - feel free to modify and use as needed.

## Contributing

Feel free to submit issues or pull requests to improve the automation logic or add new features. 