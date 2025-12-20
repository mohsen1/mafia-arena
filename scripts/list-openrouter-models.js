#!/usr/bin/env node
/**
 * list-openrouter-models.js
 *
 * Fetches and displays available models from OpenRouter API.
 * Useful for seeing what models you have access to.
 *
 * Usage:
 *   ./scripts/list-openrouter-models.js                    # List all models
 *   ./scripts/list-openrouter-models.js --provider=openai  # Filter by provider
 *   ./scripts/list-openrouter-models.js --search=claude    # Search models
 *   ./scripts/list-openrouter-models.js --json             # Output as JSON
 *   ./scripts/list-openrouter-models.js --top=20           # Show top 20 by popularity
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1";

// Colors for terminal output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
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
  if (process.env.OPENROUTER_API_KEY) {
    return process.env.OPENROUTER_API_KEY;
  }

  const devVars = loadEnvFile(path.join(REPO_ROOT, ".dev.vars"));
  if (devVars.OPENROUTER_API_KEY) {
    return devVars.OPENROUTER_API_KEY;
  }

  const envLocal = loadEnvFile(path.join(REPO_ROOT, ".env.local"));
  if (envLocal.OPENROUTER_API_KEY) {
    return envLocal.OPENROUTER_API_KEY;
  }

  const envFile = loadEnvFile(path.join(REPO_ROOT, ".env"));
  if (envFile.OPENROUTER_API_KEY) {
    return envFile.OPENROUTER_API_KEY;
  }

  return null;
}

function parseArgs(args) {
  const config = {
    provider: null,
    search: null,
    json: false,
    top: null,
    free: false,
    help: false,
  };

  for (const arg of args) {
    if (arg.startsWith("--provider=")) {
      config.provider = arg.slice("--provider=".length).toLowerCase();
    } else if (arg.startsWith("--search=")) {
      config.search = arg.slice("--search=".length).toLowerCase();
    } else if (arg === "--json") {
      config.json = true;
    } else if (arg.startsWith("--top=")) {
      config.top = parseInt(arg.slice("--top=".length), 10);
    } else if (arg === "--free") {
      config.free = true;
    } else if (arg === "--help" || arg === "-h") {
      config.help = true;
    }
  }

  return config;
}

function printUsage() {
  console.log(`
${colors.bright}list-openrouter-models.js${colors.reset} - List available OpenRouter models

${colors.cyan}USAGE:${colors.reset}
  ./scripts/list-openrouter-models.js [options]

${colors.cyan}OPTIONS:${colors.reset}
  --provider=<name>   Filter by provider (openai, anthropic, google, meta, etc.)
  --search=<term>     Search models by name/id
  --top=<n>           Show top N models (sorted by context size)
  --free              Show only free models
  --json              Output as JSON
  -h, --help          Show this help message

${colors.cyan}EXAMPLES:${colors.reset}
  ./scripts/list-openrouter-models.js                    # List all models
  ./scripts/list-openrouter-models.js --provider=openai  # OpenAI models only
  ./scripts/list-openrouter-models.js --search=claude    # Search for Claude models
  ./scripts/list-openrouter-models.js --search=gpt       # Search for GPT models  
  ./scripts/list-openrouter-models.js --free             # Free models only
  ./scripts/list-openrouter-models.js --top=20           # Top 20 by context
  ./scripts/list-openrouter-models.js --json             # JSON output

${colors.cyan}ENVIRONMENT:${colors.reset}
  OPENROUTER_API_KEY  API key (loaded from .dev.vars or environment)
`);
}

function formatPrice(price) {
  if (!price || price === 0) return "free";
  if (price < 0.001) return `$${(price * 1000000).toFixed(2)}/M`;
  return `$${price.toFixed(4)}/1k`;
}

function formatContextLength(length) {
  if (!length) return "?";
  if (length >= 1000000) return `${(length / 1000000).toFixed(1)}M`;
  if (length >= 1000) return `${(length / 1000).toFixed(0)}k`;
  return length.toString();
}

function getProviderColor(id) {
  if (id.startsWith("openai/")) return colors.green;
  if (id.startsWith("anthropic/")) return colors.magenta;
  if (id.startsWith("google/")) return colors.blue;
  if (id.startsWith("meta-llama/")) return colors.cyan;
  if (id.startsWith("mistralai/")) return colors.yellow;
  return colors.reset;
}

async function fetchModels(apiKey) {
  const response = await fetch(`${OPENROUTER_API_URL}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${error}`);
  }

  const data = await response.json();
  return data.data || [];
}

function filterModels(models, config) {
  let filtered = models;

  if (config.provider) {
    filtered = filtered.filter((m) =>
      m.id.toLowerCase().startsWith(`${config.provider}/`)
    );
  }

  if (config.search) {
    filtered = filtered.filter(
      (m) =>
        m.id.toLowerCase().includes(config.search) ||
        (m.name && m.name.toLowerCase().includes(config.search))
    );
  }

  if (config.free) {
    filtered = filtered.filter((m) => {
      const pricing = m.pricing || {};
      return (!pricing.prompt || pricing.prompt === "0") && 
             (!pricing.completion || pricing.completion === "0");
    });
  }

  // Sort by context length (descending)
  filtered.sort((a, b) => (b.context_length || 0) - (a.context_length || 0));

  if (config.top) {
    filtered = filtered.slice(0, config.top);
  }

  return filtered;
}

function displayModels(models, config) {
  if (config.json) {
    console.log(JSON.stringify(models, null, 2));
    return;
  }

  if (models.length === 0) {
    log("\nNo models found matching your criteria.", colors.yellow);
    return;
  }

  log(`\n${colors.bright}Found ${models.length} models:${colors.reset}\n`);

  // Table header
  const header = `${"ID".padEnd(50)} ${"CONTEXT".padStart(10)} ${"INPUT".padStart(12)} ${"OUTPUT".padStart(12)}`;
  console.log(`${colors.dim}${header}${colors.reset}`);
  console.log(`${colors.dim}${"─".repeat(90)}${colors.reset}`);

  for (const model of models) {
    const pricing = model.pricing || {};
    const inputPrice = formatPrice(parseFloat(pricing.prompt || 0));
    const outputPrice = formatPrice(parseFloat(pricing.completion || 0));
    const context = formatContextLength(model.context_length);
    const providerColor = getProviderColor(model.id);

    const line = `${providerColor}${model.id.padEnd(50)}${colors.reset} ${context.padStart(10)} ${inputPrice.padStart(12)} ${outputPrice.padStart(12)}`;
    console.log(line);
  }

  console.log();
}

async function main() {
  const args = process.argv.slice(2);
  const config = parseArgs(args);

  if (config.help) {
    printUsage();
    process.exit(0);
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    log("\nError: OPENROUTER_API_KEY not found.", colors.red);
    log("Set OPENROUTER_API_KEY in .dev.vars or environment", colors.yellow);
    process.exit(1);
  }

  log(`${colors.cyan}Fetching models from OpenRouter...${colors.reset}`, colors.cyan);

  try {
    const allModels = await fetchModels(apiKey);
    const filteredModels = filterModels(allModels, config);
    displayModels(filteredModels, config);

    if (!config.json) {
      log(`${colors.dim}Total available: ${allModels.length} models${colors.reset}`, colors.dim);
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

