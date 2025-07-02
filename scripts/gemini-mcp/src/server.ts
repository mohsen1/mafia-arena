#!/usr/bin/env tsx

/**
 * Gemini Guidance MCP Server v2.0 - Refactored Architecture
 * 
 * This is the thin entry point that wires together all the modular components.
 * The actual logic is distributed across services, state managers, and orchestrators.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

// Services
import { FileSystemService } from './services/FileSystemService.js';
import { CliService } from './services/CliService.js';
import { CursorUiService } from './services/CursorUiService.js';
import { GitHubService } from './services/GitHubService.js';
import { GeminiService } from './services/GeminiService.js';
import { logger } from './services/LoggerService.js';

// State Managers
import { BacklogManager } from './state/BacklogManager.js';
import { HistoryManager } from './state/HistoryManager.js';

// Core Logic
import { TaskOrchestrator } from './core/TaskOrchestrator.js';
import { Watchdog } from './core/Watchdog.js';

// ==================== Wire Dependencies ====================

logger.banner('Gemini MCP Server v2.0 Starting');

// Create service instances
const fileSystem = new FileSystemService();
const cli = new CliService();
const cursor = new CursorUiService(cli);
const github = new GitHubService();
const gemini = new GeminiService(fileSystem);

// Create state managers
const backlog = new BacklogManager(fileSystem);
const history = new HistoryManager(fileSystem);

// Create orchestrator with all dependencies
const orchestrator = new TaskOrchestrator(
  cli,
  cursor,
  github,
  gemini,
  backlog,
  history,
);

// Create watchdog
const watchdog = new Watchdog(
  cli,
  cursor,
  gemini,
  backlog,
  fileSystem,
  orchestrator,
);

// ==================== MCP Server Setup ====================

const server = new Server(
  {
    name: 'gemini-guidance',
    version: '2.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
const AVAILABLE_TOOLS: Tool[] = [
  {
    name: 'get_next_task',
    description: 'Analyzes the current state and uses UI automation (cliclick) to type the next development task directly into Cursor\'s chat. Does not return the task in the response to avoid hitting message limits.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  logger.info('Received tools/list request');
  return {
    tools: AVAILABLE_TOOLS,
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;
  logger.info('Received tool call:', name);

  switch (name) {
    case 'get_next_task': {
      // Check if task already in progress
      if (backlog.hasTaskInProgress()) {
        const current = backlog.getCurrentTask();
        return {
          content: [
            {
              type: 'text',
              text: `⏳ Task "${current?.title}" is still in progress. Complete it before requesting a new task.`,
            },
          ],
        };
      }

      // Schedule the analysis asynchronously
      logger.info('Scheduling task analysis...');
      
      setTimeout(async () => {
        try {
          await orchestrator.handleNewTaskRequest();
        } catch (error) {
          logger.error('Failed to handle new task request:', error);
        }
      }, 100);

      // Return immediately
      return {
        content: [
          {
            type: 'text',
            text: '✅ Request received. Proceeding to the next step or planning a new task.',
          },
        ],
      };
    }

    default:
      logger.error('Unknown tool requested:', name);
      return {
        content: [
          {
            type: 'text',
            text: `Error: Unknown tool "${name}". Only get_next_task is supported.`,
          },
        ],
      };
  }
});

// ==================== Process Management ====================

// Handle graceful shutdown
const cleanup = () => {
  logger.info('Shutting down...');
  watchdog.stop();
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', () => {
  logger.info('Process exiting');
});

// Log unhandled errors
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
});

// ==================== Start Server ====================

async function main() {
  logger.info('Initializing MCP server...');
  
  // Verify cliclick is available
  if (!cursor.isAvailable()) {
    logger.warn('⚠️  cliclick is not installed!');
    logger.warn('⚠️  UI automation will not work without it.');
    logger.warn('⚠️  Install with: brew install cliclick');
  }
  
  // Connect to transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  logger.info('MCP server connected and ready');
  
  // Start watchdog
  watchdog.start();
  logger.info('Watchdog started');
}

// Start the server
main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
}); 