#!/usr/bin/env node
/**
 * ask-gemini.js
 *
 * Uses yek to serialize codebase content and sends it to Gemini 3 Pro
 * with 1 million token context for answering complex codebase questions.
 *
 * Usage:
 *   ./scripts/ask-gemini.js "How does the game engine handle win conditions?"
 *   ./scripts/ask-gemini.js --tokens=500k "Explain the AI provider retry logic"
 *   ./scripts/ask-gemini.js --dirs="src/engine/" "What is the vote resolution algorithm?"
 *
 * Environment:
 *   GEMINI_API_KEY - Required. Fetched from .env.local or environment.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

// Gemini 3 Pro Preview configuration
const GEMINI_MODEL = "gemini-3-pro-preview";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// Default configuration for Mafia Arena
const DEFAULT_TOKENS = "800k";
const DEFAULT_DIRS = ["src/", "frontend/app/"];

// Colors for terminal output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message, color = colors.reset) {
  console.error(`${color}${message}${colors.reset}`);
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  const content = fs.readFileSync(filePath, "utf8");
  const env = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex);
    let value = trimmed.slice(eqIndex + 1);

    // Remove surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function getApiKey() {
  // Check environment first (both GEMINI_API_KEY and GOOGLE_API_KEY)
  if (process.env.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }
  if (process.env.GOOGLE_API_KEY) {
    return process.env.GOOGLE_API_KEY;
  }

  // Load from .dev.vars (Wrangler local secrets)
  const devVars = loadEnvFile(path.join(REPO_ROOT, ".dev.vars"));
  if (devVars.GOOGLE_API_KEY) {
    return devVars.GOOGLE_API_KEY;
  }

  // Load from .env.local
  const envLocal = loadEnvFile(path.join(REPO_ROOT, ".env.local"));
  if (envLocal.GEMINI_API_KEY) {
    return envLocal.GEMINI_API_KEY;
  }
  if (envLocal.GOOGLE_API_KEY) {
    return envLocal.GOOGLE_API_KEY;
  }

  // Try .env as fallback
  const envFile = loadEnvFile(path.join(REPO_ROOT, ".env"));
  if (envFile.GEMINI_API_KEY) {
    return envFile.GEMINI_API_KEY;
  }
  if (envFile.GOOGLE_API_KEY) {
    return envFile.GOOGLE_API_KEY;
  }

  return null;
}

function parseArgs(args) {
  const config = {
    tokens: DEFAULT_TOKENS,
    dirs: DEFAULT_DIRS,
    question: null,
    interactive: false,
    stream: true,
  };

  for (const arg of args) {
    if (arg.startsWith("--tokens=")) {
      config.tokens = arg.slice("--tokens=".length);
    } else if (arg.startsWith("--dirs=")) {
      config.dirs = arg
        .slice("--dirs=".length)
        .split(",")
        .map((d) => d.trim());
    } else if (arg === "--no-stream") {
      config.stream = false;
    } else if (arg === "-i" || arg === "--interactive") {
      config.interactive = true;
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else if (!arg.startsWith("-")) {
      config.question = arg;
    }
  }

  return config;
}

function printUsage() {
  console.log(`
${colors.bright}ask-gemini.js${colors.reset} - Ask Gemini 3 Pro Preview questions about Mafia Arena codebase

${colors.cyan}USAGE:${colors.reset}
  ./scripts/ask-gemini.js [options] "Your question here"
  ./scripts/ask-gemini.js -i                    # Interactive mode

${colors.cyan}OPTIONS:${colors.reset}
  --tokens=<size>     Token limit for yek (default: 800k)
  --dirs=<dirs>       Comma-separated directories to include (default: src/,frontend/src/)
  --no-stream         Disable streaming output
  -i, --interactive   Interactive mode - ask multiple questions
  -h, --help          Show this help message

${colors.cyan}EXAMPLES:${colors.reset}
  ./scripts/ask-gemini.js "How does the game engine work?"
  ./scripts/ask-gemini.js --tokens=500k "Explain the AI retry logic"
  ./scripts/ask-gemini.js --dirs="src/engine/" "What is the win condition algorithm?"
  ./scripts/ask-gemini.js --dirs="frontend/src/" "How does the leaderboard work?"
  ./scripts/ask-gemini.js -i

${colors.cyan}ENVIRONMENT:${colors.reset}
  GOOGLE_API_KEY      API key (loaded from .dev.vars, same as Wrangler secrets)
`);
}

function runYek(tokens, dirs) {
  const yekArgs = [`--tokens=${tokens}`, ...dirs];
  const cmd = `yek ${yekArgs.join(" ")}`;

  log(`\n${colors.dim}Running: ${cmd}${colors.reset}`, colors.dim);

  try {
    const output = execFileSync("yek", yekArgs, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      maxBuffer: 100 * 1024 * 1024, // 100MB buffer
    });
    return output;
  } catch (error) {
    if (error.status === 127) {
      log("\nError: yek is not installed. Install it with: cargo install yek", colors.red);
      process.exit(1);
    }
    log(`\n${colors.red}Error: yek command failed with exit code ${error.status ?? "unknown"}${colors.reset}`, colors.red);
    if (error.stderr) {
      log(`${colors.yellow}stderr:${colors.reset}\n${error.stderr}`, colors.yellow);
    }
    if (error.stdout) {
      log(`${colors.yellow}stdout:${colors.reset}\n${error.stdout}`, colors.yellow);
    }
    process.exit(1);
  }
}

async function askGeminiStream(apiKey, codebaseContext, question) {
  const url = `${GEMINI_API_URL}/${GEMINI_MODEL}:streamGenerateContent?alt=sse`;

  const systemPrompt = `You are an expert software engineer analyzing the Mafia Arena codebase - an AI benchmark platform that has Large Language Models play Mafia against each other.

The codebase uses:
- Cloudflare Workers, D1, R2, Queues, Durable Objects
- Astro frontend
- TypeScript with strict mode
- A pure game engine in src/engine/ (no Cloudflare dependencies)

When referencing code:
- Use specific file paths
- Quote relevant code snippets
- Explain the relationships between components

Be concise but comprehensive. If you're unsure about something, say so.`;

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `<codebase_context>
${codebaseContext}
</codebase_context>

<question>
${question}
</question>`,
          },
        ],
      },
    ],
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    await response.text();
    throw new Error(`Gemini API error (${response.status}): An error occurred while processing the request.`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullResponse = "";

  process.stdout.write(`\n${colors.green}${colors.bright}Answer:${colors.reset}\n\n`);

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n");

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const jsonStr = line.slice(6);
        if (jsonStr.trim() === "[DONE]") continue;

        try {
          const data = JSON.parse(jsonStr);
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            process.stdout.write(text);
            fullResponse += text;
          }
        } catch {
          // Skip malformed JSON chunks
        }
      }
    }
  }

  console.log("\n");
  return fullResponse;
}

async function askGemini(apiKey, codebaseContext, question) {
  const url = `${GEMINI_API_URL}/${GEMINI_MODEL}:generateContent`;

  const systemPrompt = `You are an expert software engineer analyzing the Mafia Arena codebase - an AI benchmark platform that has Large Language Models play Mafia against each other.

The codebase uses:
- Cloudflare Workers, D1, R2, Queues, Durable Objects
- Astro frontend
- TypeScript with strict mode
- A pure game engine in src/engine/ (no Cloudflare dependencies)

When referencing code:
- Use specific file paths
- Quote relevant code snippets
- Explain the relationships between components

Be concise but comprehensive. If you're unsure about something, say so.`;

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `<codebase_context>
${codebaseContext}
</codebase_context>

<question>
${question}
</question>`,
          },
        ],
      },
    ],
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    await response.text();
    throw new Error(`Gemini API error (${response.status}): An error occurred while processing the request.`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("No response text from Gemini");
  }

  console.log(`\n${colors.green}${colors.bright}Answer:${colors.reset}\n`);
  console.log(text);
  console.log();

  return text;
}

async function interactiveMode(apiKey, config) {
  log(`\n${colors.cyan}${colors.bright}Interactive Mode${colors.reset}`, colors.cyan);
  log(`${colors.dim}Loading codebase context...${colors.reset}`, colors.dim);

  const codebaseContext = runYek(config.tokens, config.dirs);
  const contextSize = codebaseContext.length;
  const estimatedTokens = Math.round(contextSize / 4);

  log(
    `${colors.green}✓ Loaded ~${estimatedTokens.toLocaleString()} tokens of context${colors.reset}`,
    colors.green
  );
  log(`${colors.dim}Type your questions (Ctrl+C to exit)${colors.reset}\n`, colors.dim);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = () => {
    rl.question(`${colors.blue}❯ ${colors.reset}`, async (question) => {
      if (!question.trim()) {
        askQuestion();
        return;
      }

      try {
        if (config.stream) {
          await askGeminiStream(apiKey, codebaseContext, question);
        } else {
          await askGemini(apiKey, codebaseContext, question);
        }
      } catch (error) {
        log(`Error: ${error.message}`, colors.red);
      }

      askQuestion();
    });
  };

  rl.on("close", () => {
    console.log("\nGoodbye!");
    process.exit(0);
  });

  askQuestion();
}

async function main() {
  const args = process.argv.slice(2);
  const config = parseArgs(args);

  // Check for API key
  const apiKey = getApiKey();
  if (!apiKey) {
    log("\nError: GOOGLE_API_KEY not found.", colors.red);
    log("Set GOOGLE_API_KEY in .dev.vars (same as Wrangler secrets)", colors.yellow);
    process.exit(1);
  }

  // Interactive mode
  if (config.interactive) {
    await interactiveMode(apiKey, config);
    return;
  }

  // Single question mode
  if (!config.question) {
    log("\nError: No question provided.", colors.red);
    printUsage();
    process.exit(1);
  }

  log(`${colors.cyan}${colors.bright}Asking Gemini 3 Pro...${colors.reset}`, colors.cyan);
  log(`${colors.dim}Loading codebase context...${colors.reset}`, colors.dim);

  const codebaseContext = runYek(config.tokens, config.dirs);
  const contextSize = codebaseContext.length;
  const estimatedTokens = Math.round(contextSize / 4);

  log(
    `${colors.green}✓ Loaded ~${estimatedTokens.toLocaleString()} tokens of context${colors.reset}`,
    colors.green
  );
  log(`${colors.dim}Question: ${config.question}${colors.reset}`, colors.dim);

  try {
    if (config.stream) {
      await askGeminiStream(apiKey, codebaseContext, config.question);
    } else {
      await askGemini(apiKey, codebaseContext, config.question);
    }
  } catch (error) {
    log(`\nError: ${error.message}`, colors.red);
    process.exit(1);
  }
}

main().catch((error) => {
  log(`\nUnexpected error: ${error.message}`, colors.red);
  process.exit(1);
});
