# Gemini Guidance MCP Server

This MCP server replaces the old `ask-gemini.ts` script that ran in a loop. Now Cursor can call this server whenever it needs guidance on the next development task.

## How it works

1. The server takes a screenshot of your screen
2. Analyzes it with Google's Gemini AI
3. Returns development instructions based on the current state
4. Tracks history to avoid loops and detect stuck commands

## Usage

The server is automatically available in Cursor after restarting. You can use it by calling:

- `get_next_task` - Get the next development task based on current state
- `clear_history` - Clear the prompt history to start fresh

## Configuration

Make sure you have `GEMINI_API_KEY` set in your `.env` file.

## Cursor Integration

After completing any task, call the `get_next_task` tool to get guidance on what to do next. For example:

```
I've completed the current task. Let me get the next task using the gemini-guidance tool.
```

The server will analyze the current state and provide specific instructions on what to work on next. 