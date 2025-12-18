# Ask Gemini

Ask Gemini 2.5 Pro (1M context) a question about the codebase with full context.

**Argument:** `$input` - Your question about the codebase

---

## How It Works

This command uses `yek` to serialize up to 800k tokens of the codebase and sends it to Gemini 2.5 Pro for analysis. The model has the full context of relevant directories and can answer complex architectural questions.

## Instructions

### Run the ask-gemini script

Gather context from the current conversation and the input to craft a very detailed question. Then run:

```bash
./scripts/ask-gemini.js "YOUR_QUESTION"
```

### For more targeted queries

Try to pack as much as you can in the query. Up to 800k tokens so Gemini gets a better picture of the source code. If tokens exceeds the amount Gemini can handle, retry with a smaller amount.

If the question is specifically about the game engine:

```bash
./scripts/ask-gemini.js --dirs="src/engine/" "$input"
```

If the question is specifically about the worker/API:

```bash
./scripts/ask-gemini.js --dirs="src/worker/" "$input"
```

If the question is specifically about the frontend:

```bash
./scripts/ask-gemini.js --dirs="frontend/" "$input"
```

For questions needing more context (up to 1M tokens):

```bash
./scripts/ask-gemini.js --tokens=1000k "$input"
```

### Interactive mode

For follow-up questions without reloading context:

```bash
./scripts/ask-gemini.js -i
```

## Prerequisites

- **yek** must be installed: `cargo install yek`
- **GOOGLE_API_KEY** must be set in `.dev.vars` (same key used by Wrangler)

## Example Questions

- "How does the game engine handle win condition checks?"
- "Explain the AI provider abstraction and retry logic"
- "What are all the database tables and their relationships?"
- "How does the Durable Object orchestrate a full game?"
- "Find potential issues in the vote resolution algorithm"
- "How does the leaderboard filtering work?"

## Troubleshooting

If you get an API key error, add `GOOGLE_API_KEY=your-key` to `.dev.vars`.

If yek is not found:

```bash
cargo install yek
```

