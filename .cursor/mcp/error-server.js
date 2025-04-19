#!/usr/bin/env node

// simple-error-mcp.js
// A very basic MCP server demonstrating the protocol over stdio.
// It offers one tool to "check" for a Next.js error (simulated).

const readline = require('readline');

// --- Tool Definition ---
// Define the tools this server provides.
// Cursor will ask for this list first.
const tools = [
    {
        // The name used to invoke the tool (e.g., @checkNextJsError)
        name: 'checkNextJsError',
        // Description shown in Cursor
        description: 'Checks a predefined source (simulated) for the latest Next.js browser error.',
        // Define expected parameters (none for this simple tool)
        // Uses JSON Schema format. An empty object means no parameters.
        parameters: {
            type: 'object',
            properties: {},
        },
    },
];

// --- State (Simulated Error) ---
// In a real scenario, you'd read from a file, DB, or IPC mechanism here.
// For simplicity, we'll just toggle this manually or keep it fixed.
let simulatedError = null;
// To simulate an error, you could manually change this line, e.g.:
// simulatedError = { message: "TypeError: Cannot read property 'map' of undefined", stack: "at MyComponent (app/page.js:10:15)..." };

// --- MCP Communication Logic ---

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
});

// Listen for lines (requests) from Cursor
rl.on('line', (line) => {
    try {
        const request = JSON.parse(line);

        // Handle 'listTools' request
        if (request.method === 'listTools') {
            sendResponse({
                jsonrpc: '2.0',
                id: request.id,
                result: { tools }, // Send back the list of tools defined above
            });
        }
        // Handle 'executeTool' request
        else if (request.method === 'executeTool') {
            const toolName = request.params.name;

            if (toolName === 'checkNextJsError') {
                // Execute our simple check (reading the simulated state)
                let resultPayload;
                if (simulatedError) {
                    resultPayload = {
                        found: true,
                        error: simulatedError,
                        message: `Found a simulated Next.js error: ${simulatedError.message}`,
                    };
                } else {
                    resultPayload = {
                        found: false,
                        message: 'No Next.js browser error currently reported (simulated check).',
                    };
                }
                // Send the result back to Cursor
                sendResponse({
                    jsonrpc: '2.0',
                    id: request.id,
                    result: resultPayload, // The data returned by the tool
                });
            } else {
                // Tool not found
                sendError(request.id, -32601, `Tool not found: ${toolName}`);
            }
        }
        // Handle other methods if necessary, or return error
        else {
             sendError(request.id, -32601, `Unsupported method: ${request.method}`);
        }
    } catch (error) {
        // Handle JSON parsing errors or other issues
        // Note: Sending error response might fail if request ID is unknown
        sendError(null, -32700, `Parse error or internal server error: ${error.message}`);
    }
});

// Function to send a successful JSON-RPC response
function sendResponse(response) {
    process.stdout.write(JSON.stringify(response) + '\n');
}

// Function to send a JSON-RPC error response
function sendError(id, code, message) {
    process.stdout.write(
        JSON.stringify({
            jsonrpc: '2.0',
            id: id, // Can be null if request ID couldn't be determined
            error: {
                code: code,
                message: message,
            },
        }) + '\n'
    );
}

// Optional: Log when the server starts listening
// process.stderr.write("Simple MCP server started. Listening on stdin...\n");

// Keep the process running to listen for input
process.stdin.resume();