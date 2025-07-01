#!/bin/bash
cd "$(dirname "$0")/.." || exit 1
exec pnpm tsx scripts/gemini-guidance-mcp.ts 2>/dev/null 