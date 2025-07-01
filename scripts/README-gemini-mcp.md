# Gemini Guidance MCP Server

This MCP server provides intelligent development guidance for the Werewolf AI game project. It replaces the old `ask-gemini.ts` script with a more integrated approach that works seamlessly with Cursor.

## How it works

1. When you call `get_next_task`, the server responds immediately (non-blocking)
2. In the background, it takes a screenshot of your screen
3. Analyzes it with Google's Gemini AI to understand the current state
4. Automatically opens a new Cursor chat (Cmd+L) and types the next development instruction
5. Tracks history to avoid loops and detect stuck commands
6. Optionally auto-schedules the next analysis every 5 minutes

## Features

- **Non-blocking**: Cursor doesn't wait for the slow Gemini analysis
- **Auto-prompting**: Uses `cliclick` to automatically prompt Cursor with the next task
- **Loop detection**: Prevents repeating the same instructions
- **Stuck command detection**: Recognizes when commands are hanging
- **Auto-scheduling**: Can automatically analyze and prompt every 5 minutes
- **Status checking**: See if analysis is in progress

## Prerequisites

1. Install cliclick for UI automation:
   ```bash
   brew install cliclick
   ```

2. Set `GEMINI_API_KEY` in your `.env` file

## Usage

The server is automatically available in Cursor after restarting. Available tools:

- `get_next_task` - Schedule the next development task analysis
- `clear_history` - Clear the prompt history to start fresh  
- `check_status` - Check if analysis is currently scheduled or in progress

### Example workflow

1. Complete a development task
2. Call the tool: "Let me get the next task"
3. The tool responds immediately
4. A few seconds later, a new prompt appears automatically with the next task
5. Complete that task and repeat

### Configuration

You can adjust these settings in the script:

- `INITIAL_DELAY`: Time before analysis starts (default: 3 seconds)
- `AUTO_SCHEDULE_INTERVAL`: Time between auto-scheduled analyses (default: 5 minutes)
- `ENABLE_AUTO_SCHEDULE`: Enable/disable automatic scheduling (default: true)

## Cursor Integration

After completing any task, simply mention that you want to get the next task:

```
I've completed the current task. Let me check what to do next.
```

The system will automatically analyze and prompt you with the next instruction. 